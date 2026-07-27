// =====================================================================
// Apex Leads Extractor — background.js
// Fila: cidade -> ponto de cobertura -> termo. Cada cidade é varrida em
// NO MÍNIMO 3 pontos (Centro, Norte, Sul; principais ganham Leste/Oeste)
// e só avança para a próxima cidade quando todos os pontos terminam.
// =====================================================================

const PONTOS_PADRAO = ["Centro", "Norte", "Sul"];
const PONTOS_PRINCIPAIS = ["Centro", "Norte", "Sul", "Leste", "Oeste"];
// Até 9 pontos (5 cardeais + 4 diagonais). As diagonais só existem com centro
// calibrado (não há fallback textual — "termo Nordeste cidade" geocodifica para
// uma região, não um quadrante). Tier de pontos: 3 / 5 / 9 por população.
const PONTOS_TODOS = ["Centro", "Norte", "Sul", "Leste", "Oeste", "Nordeste", "Noroeste", "Sudeste", "Sudoeste"];
const DESLOCAMENTOS = {
  Norte: [1, 0], Sul: [-1, 0], Leste: [0, 1], Oeste: [0, -1],
  Nordeste: [1, 1], Noroeste: [1, -1], Sudeste: [-1, 1], Sudoeste: [-1, -1]
};
function pontosDaCidade(n) {
  return PONTOS_TODOS.slice(0, [3, 5, 9].includes(n) ? n : 3);
}

// Sufixo do nome de arquivo: estado único (ex.: "sp"), senão país único
// (ex.: "us"), senão "multi".
function sufixoRegiao(filaMeta) {
  const estados = new Set(filaMeta.map(m => m.estado));
  if (estados.size === 1) return slug([...estados][0]);
  const paises = new Set(filaMeta.map(m => m.pais));
  if (paises.size === 1) return [...paises][0].toLowerCase();
  return "multi";
}

const ALARME_WATCHDOG = "watchdog";
const ALARME_TAB_TIMEOUT = "tabLoadTimeout";
const ALARME_EXTRACAO_TIMEOUT = "extractionTimeout";
const ALARME_PROXIMA_ETAPA = "nextStepDelay";

const TAB_LOAD_TIMEOUT_MIN = 0.5;   // 30s (mínimo permitido pela API de alarms)
const INJECAO_TIMEOUT_MS = 30000;
const FASE_TRAVADA_MS = 3 * 60 * 1000;
const MAX_LOG_ENTRADAS = 50;
const MAX_FALHAS = 200;

// ---------------------------------------------------------------------
// Serialização de handlers: eventos MV3 são assíncronos e compartilham
// estado no storage; a fila garante que cada handler leia/grave estado
// consistente, sem intercalação.
// ---------------------------------------------------------------------

let filaExecucao = Promise.resolve();

function serializado(fn) {
  return function (...args) {
    filaExecucao = filaExecucao
      .then(() => fn(...args))
      .catch(erro => console.error("Apex:", erro));
    return filaExecucao;
  };
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function normalizarTexto(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function somenteDigitos(texto) {
  if (!texto) return "";
  return String(texto).replace(/\D/g, "");
}

function slug(texto) {
  return normalizarTexto(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "busca";
}

function timestampArquivo() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function horaAgora() {
  return new Date().toLocaleTimeString("pt-BR");
}

function randomEntre(min, max) {
  return Math.random() * (max - min) + min;
}

function escaparCampoCSV(valor) {
  const str = valor === undefined || valor === null ? "" : String(valor);
  if (/[;"\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Meta padrão = Brasil (retrocompatível com leads/execuções sem país).
const FONE_META_BR = { ddi: "55", tamanhos: [10, 11], tronco: "0" };

// Remove o prefixo de tronco nacional ("0" na maioria da Europa/AmSul; "" nos
// EUA) do número já sem DDI, quando presente.
function removerTronco(digitos, tronco) {
  if (tronco && digitos.startsWith(tronco) && digitos.length > tronco.length) {
    return digitos.slice(tronco.length);
  }
  return digitos;
}

// Número nacional -> E.164 (só dígitos, com DDI). Valida contra os tamanhos do
// país: fora deles, retorna "" (evita que CEP/ZIP+4 vire telefone).
function telefoneNormalizadoPais(telefone, meta) {
  meta = meta || FONE_META_BR;
  let d = somenteDigitos(telefone);
  if (!d) return "";
  // já veio com DDI?
  if (d.startsWith(meta.ddi)) {
    const nac = removerTronco(d.slice(meta.ddi.length), meta.tronco);
    return meta.tamanhos.includes(nac.length) ? meta.ddi + nac : "";
  }
  const nac = removerTronco(d, meta.tronco);
  return meta.tamanhos.includes(nac.length) ? meta.ddi + nac : "";
}

// WhatsApp: só para números válidos. No BR exige celular (11 dígitos, 9º dígito).
function linkWhatsappPais(telefone, meta) {
  meta = meta || FONE_META_BR;
  const e164 = telefoneNormalizadoPais(telefone, meta);
  if (!e164) return "";
  if (meta.ddi === "55") {
    const nac = e164.slice(2);
    return (nac.length === 11 && nac[2] === "9") ? "https://wa.me/" + e164 : "";
  }
  return "https://wa.me/" + e164;
}

// Compatibilidade: helpers antigos (BR) ainda usados por testes legados.
function telefoneNormalizado(telefone) { return telefoneNormalizadoPais(telefone, FONE_META_BR); }
function linkWhatsapp(telefone) { return linkWhatsappPais(telefone, FONE_META_BR); }

function gerarCSV(leads) {
  // Estado e Pais entram no FIM para preservar a compatibilidade do cabeçalho
  // v2 (colunas novas anexadas, não intercaladas).
  const cabecalho = [
    "Nome", "Categoria", "Telefone", "Endereco", "Nota", "Avaliacoes", "Cidade", "Quadrante",
    "Termo", "TelefoneNormalizado", "WhatsApp", "Site", "Lat", "Lng", "LinkMaps", "DataColeta",
    "Estado", "Pais", "Relevancia", "NomeLimpo", "Segmento", "TipoNegocio", "Prioridade", "Abordagem"
  ];
  const linhas = [cabecalho.join(";")];
  leads.forEach(l => {
    // leads antigos (pré-FASE 4) não têm os derivados salvos: cai no cálculo BR.
    const foneNorm = l.telefoneNormalizado !== undefined ? l.telefoneNormalizado : telefoneNormalizado(l.telefone);
    const zap = l.whatsapp !== undefined ? l.whatsapp : linkWhatsapp(l.telefone);
    linhas.push([
      l.nome, l.categoria, l.telefone, l.endereco, l.nota, l.avaliacoes, l.cidade, l.quadrante,
      l.termo, foneNorm, zap, l.site, l.lat, l.lng,
      l.linkMaps, l.dataColeta, l.estado || "", l.pais || "", l.relevancia || "",
      l.nomeLimpo || "", l.segmento || "", l.tipoNegocio || "", l.prioridade || "", l.abordagem || ""
    ].map(escaparCampoCSV).join(";"));
  });
  // \uFEFF = BOM, para o Excel abrir os acentos corretamente
  return "\uFEFF" + linhas.join("\r\n");
}

async function baixarCSV(leads, nomeArquivo) {
  try {
    const csvString = gerarCSV(leads);
    const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent(csvString);
    await chrome.downloads.download({ url: dataUrl, filename: nomeArquivo, saveAs: false });
  } catch (erro) {
    console.error("Apex: falha ao baixar CSV:", erro);
  }
}

// ---------------------------------------------------------------------
// Validação de relevância por IA (Groq — opcional)
// O Google Maps expande a busca sozinho ("scooter elétrica" traz oficina de
// carro, auto elétrica etc.). Com uma chave da Groq configurada, cada lead é
// classificado contra o TERMO que o usuário buscou — sem whitelist por nicho:
// o próprio termo é o critério. Sem chave, nada muda (passa tudo).
// ---------------------------------------------------------------------

const IA_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const IA_MODELO = "llama-3.3-70b-versatile";
const IA_LOTE = 25;             // leads por requisição
const IA_MAX_REQUISICOES = 60;  // teto de segurança por exportação

// Analisa um lote de leads contra o termo. Além da relevância, enriquece cada
// lead com 5 campos de qualidade (nome limpo, segmento, tipo, prioridade e
// mensagem de abordagem). Retorna um array de objetos na mesma ordem, ou null
// se a chamada falhar (rede, chave inválida, resposta inesperada) — o chamador
// então mantém os leads sem análise, sem quebrar a exportação.
async function analisarLoteGroq(chave, termo, lote) {
  const itens = lote.map((l, i) => {
    const partes = [`${i + 1}. ${l.nome}`];
    if (l.categoria) partes.push(`categoria: ${l.categoria}`);
    if (l.nota) partes.push(`nota ${l.nota}`);
    if (l.avaliacoes) partes.push(`${l.avaliacoes} avaliações`);
    partes.push(l.site ? "tem site" : "sem site");
    return partes.join(" | ");
  }).join("\n");

  const prompt =
    `O usuário monta uma lista de prospecção B2B do nicho: "${termo}".\n` +
    `Para cada item abaixo, retorne um objeto com estes campos:\n` +
    `- "rel": "sim" (claramente do nicho), "talvez" (plausível, mas nome/categoria não confirmam) ` +
    `ou "nao" (claramente de outro ramo — ex.: para "scooter elétrica", oficina de carros ou ` +
    `concessionária é "nao"). Seja rigoroso: itens "nao" serão DELETADOS da lista.\n` +
    `- "nome": nome comercial limpo e formatado (sem CAPS LOCK, emojis, slogans ou "!!!").\n` +
    `- "seg": subnicho curto dentro de "${termo}" (ex.: loja, assistência técnica, aluguel, importadora).\n` +
    `- "tipo": um de "loja física", "e-commerce", "serviço" ou "distribuidor".\n` +
    `- "prio": prioridade de contato "A" (forte: boa reputação/muitas avaliações/tem site), ` +
    `"B" (média) ou "C" (fraca/poucos sinais).\n` +
    `- "abordagem": primeira mensagem curta e cordial de WhatsApp (máx. 20 palavras, sem emojis), ` +
    `citando o nome do negócio.\n\n` +
    `Lista:\n${itens}\n\n` +
    `Responda SOMENTE com JSON {"r":[{...}, ...]} com exatamente ${lote.length} objetos, ` +
    `na mesma ordem da lista.`;

  try {
    const resp = await fetch(IA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + chave
      },
      body: JSON.stringify({
        model: IA_MODELO,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você é um analista de prospecção B2B. Classifica e enriquece estabelecimentos comerciais. Responde apenas JSON válido." },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!resp.ok) {
      console.error("Apex: Groq respondeu", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const dados = await resp.json();
    const conteudo = dados && dados.choices && dados.choices[0] &&
      dados.choices[0].message && dados.choices[0].message.content;
    if (!conteudo) return null;
    const parsed = JSON.parse(conteudo);
    const arr = Array.isArray(parsed) ? parsed : (parsed.r || parsed.resultados || parsed.itens);
    if (!Array.isArray(arr)) return null;
    return arr;
  } catch (e) {
    console.error("Apex: falha na chamada à Groq:", e);
    return null;
  }
}

// Classifica os leads ainda sem `relevancia`. Idempotente: leads já julgados
// não são reenviados (reexportar não gasta requisições). Agrupa por termo para
// que cada nicho seja avaliado contra o texto que o usuário buscou. Retorna
// true se algum lead mudou (para persistir).
async function validarRelevanciaIA(leads, config) {
  const chave = (config.groqApiKey || "").trim();
  if (!chave) return false;

  const pendentes = leads.filter(l => l && l.nome && !l.relevancia);
  if (!pendentes.length) return false;

  const porTermo = new Map();
  pendentes.forEach(l => {
    const t = (l.termo || "").trim() || "estabelecimento comercial";
    if (!porTermo.has(t)) porTermo.set(t, []);
    porTermo.get(t).push(l);
  });

  let requisicoes = 0;
  let alterou = false;

  const limpar = (v, max) => String(v == null ? "" : v).replace(/[\r\n;]+/g, " ").trim().slice(0, max);

  for (const [termo, grupo] of porTermo) {
    for (let i = 0; i < grupo.length; i += IA_LOTE) {
      if (requisicoes >= IA_MAX_REQUISICOES) return alterou;
      requisicoes++;
      const lote = grupo.slice(i, i + IA_LOTE);
      const analises = await analisarLoteGroq(chave, termo, lote);
      if (!analises) continue;
      lote.forEach((l, idx) => {
        const a = analises[idx];
        if (!a || typeof a !== "object") return;
        const rel = String(a.rel || "").toLowerCase().trim();
        if (rel !== "sim" && rel !== "talvez" && rel !== "nao") return;
        l.relevancia = rel;
        // Enriquecimentos de qualidade (só quando vierem preenchidos).
        if (a.nome) l.nomeLimpo = limpar(a.nome, 120);
        if (a.seg) l.segmento = limpar(a.seg, 60);
        if (a.tipo) l.tipoNegocio = limpar(a.tipo, 40);
        const prio = String(a.prio || "").toUpperCase().trim().charAt(0);
        if (prio === "A" || prio === "B" || prio === "C") l.prioridade = prio;
        if (a.abordagem) l.abordagem = limpar(a.abordagem, 220);
        alterou = true;
      });
    }
  }
  return alterou;
}

// Ponto único de exportação: valida a relevância (se houver chave), REMOVE os
// leads claramente fora do nicho, persiste o conjunto já limpo e baixa o CSV.
// Centraliza os 4 pontos de download para que a validação rode uma vez por lead.
// Falha graciosamente — se a IA falhar, o CSV sai completo, sem remover nada.
async function baixarCSVComIA(leads, nomeArquivo, estado) {
  let finais = leads;
  try {
    const config = await obterConfig();
    if ((config.groqApiKey || "").trim()) {
      const pendentes = leads.filter(l => l && l.nome && !l.relevancia).length;
      if (pendentes && estado) adicionarLog(estado, `Validando relevância de ${pendentes} lead(s) com IA (Groq)...`);
      const alterou = await validarRelevanciaIA(leads, config);
      if (alterou) {
        // "nao" = claramente de outro ramo → delete instantâneo. Sobram os
        // relevantes ("sim") e os ambíguos ("talvez"), para você revisar.
        const removidos = leads.filter(l => l.relevancia === "nao").length;
        finais = leads.filter(l => l.relevancia !== "nao");
        // Resultado formatado: ordena por prioridade (A > B > C > sem nota) e,
        // dentro dela, por nº de avaliações. A ordenação precede reconstruirDedup
        // porque o dedup indexa POSIÇÕES do array.
        const rankPrio = { A: 0, B: 1, C: 2 };
        finais.sort((x, y) => {
          const px = rankPrio[x.prioridade] ?? 3;
          const py = rankPrio[y.prioridade] ?? 3;
          if (px !== py) return px - py;
          return (parseInt(y.avaliacoes, 10) || 0) - (parseInt(x.avaliacoes, 10) || 0);
        });
        const dedup = reconstruirDedup(finais);
        await salvarDados(finais, dedup);
        if (estado) {
          estado.contadores.leadsUnicos = finais.length;
          adicionarLog(estado, `IA removeu ${removidos} lead(s) fora do nicho. Resultado final: ${finais.length} lead(s).`);
          await salvarEstado(estado);
        }
      }
    }
  } catch (erro) {
    console.error("Apex: validação de relevância falhou:", erro);
  }
  await baixarCSV(finais, nomeArquivo);
}

// ---------------------------------------------------------------------
// Configuração (página de opções) e estado
// Estado dividido em duas chaves: "estado" (leve, muda o tempo todo) e
// "leads"/"dedup" (pesados, mudam só quando chegam leads) — evita
// reescrever megabytes a cada atualização de log.
// ---------------------------------------------------------------------

const CONFIG_PADRAO = {
  intervaloMinSeg: 3,
  intervaloMaxSeg: 7,
  timeoutExtracaoSeg: 90,
  tamanhoBloco: 5,
  // Fallback de UF para o formato legado de payload (lista de nomes de cidade
  // sem metadados). O popup atual sempre envia estado/país por cidade.
  uf: "",
  deltaLat: 0.03,
  deltaLng: 0.03,
  zoomPonto: 14,
  // Quando a cidade tem poucos resultados, o Google EXPANDE a busca sozinho e
  // enche a lista com lugares de toda a região ("resultados fora da área
  // pesquisada"). Leads além deste raio do centro da cidade são descartados.
  // 0 = desligado. Metrópoles (9 pontos) usam raio x1.75 automaticamente.
  raioCidadeKm: 20,
  notificacoes: true,
  autoRetomar: false,
  modoProfundo: false,
  limiteFichasPorCidade: 150,
  // Chave da API Groq (opcional). Vazia = validação de relevância desligada.
  groqApiKey: ""
};

// Versão da config salva. A config do storage sobrepõe CONFIG_PADRAO, então
// mudanças de padrão só chegam a quem já salvou opções via migração única.
const CONFIG_VERSAO = 4;

const ESTADO_PADRAO = {
  status: "idle", // idle | running | paused | waiting_block | done
  modo: "blocos",
  termos: [],
  filaCidades: [],
  cidadesPrincipais: [],
  // FASE 4: metadados por cidade (mesma ordem de filaCidades). Cada item:
  // {estado, pais, paisBusca, pontos, ddi, tamanhos, tronco}. O background não
  // lê os arquivos data/paises: tudo que a URL/CSV precisa viaja aqui.
  filaMeta: [],
  estadoAtual: "",
  paisAtual: "BR",
  paisBuscaAtual: "",
  foneMeta: null,
  cidadeAtualIndex: 0,
  pontoAtualIndex: 0,
  termoAtualIndex: 0,
  pontosCidadeAtual: [],
  centroCidadeAtual: null, // {lat, lng, zoom} — de coords reais ou calibrado
  centroFixo: false, // true quando o centro veio de coordenadas reais (não calibrar)
  urlTextual: true,
  emFichas: false,
  fichasPendentes: [],
  contadores: {
    cidadesConcluidas: 0, totalCidades: 0, leadsUnicos: 0,
    tarefasConcluidas: 0, totalTarefas: 0, falhas: 0
  },
  mediaMsPorTarefa: 0,
  tarefaInicioTs: 0,
  log: [],
  falhas: [],
  fase: null, // "aguardando_navegacao" | "injetando" | "aguardando_extracao" | null
  faseTimestamp: 0,
  workTabId: null,
  blocoCount: 0,
  nomeBaseArquivo: "leads",
  cidadeAtual: "",
  quadranteAtual: "", // rótulo do ponto atual (coluna "Quadrante" no CSV)
  termoAtual: ""
};

function obterConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(["config"], dados => {
      resolve(Object.assign({}, CONFIG_PADRAO, dados.config || {}));
    });
  });
}

function obterEstado() {
  return new Promise(resolve => {
    chrome.storage.local.get(["estado"], dados => {
      const bruto = dados.estado || {};
      const estado = Object.assign({}, ESTADO_PADRAO, bruto);
      estado.contadores = Object.assign({}, ESTADO_PADRAO.contadores, bruto.contadores || {});
      resolve(estado);
    });
  });
}

function salvarEstado(estado) {
  atualizarBadge(estado);
  return new Promise(resolve => {
    chrome.storage.local.set({ estado }, resolve);
  });
}

function obterDados() {
  return new Promise(resolve => {
    chrome.storage.local.get(["leads", "dedup"], dados => {
      resolve({
        leads: dados.leads || [],
        dedup: Object.assign({ porId: {}, porNomeFone: {}, porNome: {} }, dados.dedup || {})
      });
    });
  });
}

function salvarDados(leads, dedup) {
  return new Promise(resolve => {
    chrome.storage.local.set({ leads, dedup }, resolve);
  });
}

function adicionarLog(estado, mensagem) {
  estado.log = estado.log || [];
  estado.log.push(`[${horaAgora()}] ${mensagem}`);
  if (estado.log.length > MAX_LOG_ENTRADAS) {
    estado.log = estado.log.slice(estado.log.length - MAX_LOG_ENTRADAS);
  }
}

function registrarFalha(estado, motivo) {
  if (estado.emFichas) return; // ficha falha é só enriquecimento perdido, não cobertura
  estado.falhas = estado.falhas || [];
  // Guarda o contexto COMPLETO da cidade (estado/país/coords/telefone): o
  // "Repetir falhas" re-enfileira com a mesma precisão geográfica — sem isso,
  // uma cidade internacional voltaria como busca textual "cidade UF" do BR.
  const meta = (estado.filaMeta && estado.filaMeta[estado.cidadeAtualIndex]) || null;
  estado.falhas.push({
    cidade: estado.cidadeAtual,
    ponto: estado.quadranteAtual,
    termo: estado.termoAtual,
    meta: meta ? {
      estado: meta.estado, pais: meta.pais, paisBusca: meta.paisBusca, pontos: meta.pontos,
      lat: meta.lat, lng: meta.lng, ddi: meta.ddi, tamanhos: meta.tamanhos, tronco: meta.tronco
    } : null,
    motivo,
    hora: horaAgora()
  });
  if (estado.falhas.length > MAX_FALHAS) {
    estado.falhas = estado.falhas.slice(-MAX_FALHAS);
  }
  estado.contadores.falhas = estado.falhas.length;
}

function atualizarBadge(estado) {
  try {
    let texto = "";
    let cor = "#0071e3";
    if (estado.status === "running") {
      const n = (estado.contadores && estado.contadores.leadsUnicos) || 0;
      texto = n > 999 ? "1k+" : String(n);
    } else if (estado.status === "paused") {
      texto = "!";
      cor = "#d70015";
    } else if (estado.status === "waiting_block") {
      texto = "II";
      cor = "#ff9500";
    }
    chrome.action.setBadgeText({ text: texto });
    chrome.action.setBadgeBackgroundColor({ color: cor });
  } catch (e) {
    // API indisponível (ambiente de teste) — ignora
  }
}

function notificar(config, titulo, mensagem) {
  if (!config.notificacoes) return;
  try {
    chrome.notifications.create("", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: titulo,
      message: mensagem
    });
  } catch (e) {
    // API indisponível — ignora
  }
}

// ---------------------------------------------------------------------
// Deduplicação global — O(1) por lead.
// Chave primária: placeId (identificador único do Maps no href do card).
// Fallback: nome normalizado + telefone, com busca secundária por nome
// para enriquecer registro antigo sem telefone. Quando os dois lados têm
// placeId e eles diferem, são negócios distintos (homônimos preservados).
// ---------------------------------------------------------------------

const CAMPOS_ENRIQUECIVEIS = ["telefone", "categoria", "endereco", "nota", "avaliacoes", "site", "lat", "lng", "linkMaps", "placeId"];

// Distância haversine em km entre dois pares lat/lng.
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function mesclarLeads(estado, leads, dedup, novosLeads, config) {
  const cidade = estado.cidadeAtual;
  const ponto = estado.quadranteAtual;
  const termo = estado.termoAtual;
  const uf = estado.estadoAtual || estado.uf || "";
  const pais = estado.paisAtual || "BR";
  const foneMeta = estado.foneMeta || FONE_META_BR;
  // Escopo das chaves SEM telefone: país|estado|cidade. "Springfield" existe em
  // dezenas de estados dos EUA; "Córdoba" em AR e ES. Chaves COM telefone e
  // placeId continuam globais (identidade forte do estabelecimento).
  const escopo = normalizarTexto(pais + "|" + uf + "|" + cidade) + "|";

  // Filtro de raio: o Google enche a lista com resultados de toda a região
  // quando a cidade tem poucos matches. Lead com coordenadas além do raio do
  // CENTRO da cidade é descartado (lead sem coordenadas passa — não dá para
  // julgar). Metrópoles (9 pontos) cobrem mancha urbana maior: raio x1.75.
  const centroCidade = estado.centroCidadeAtual;
  const raioBase = config && typeof config.raioCidadeKm === "number" ? config.raioCidadeKm : 20;
  const raioKm = (raioBase > 0 && centroCidade)
    ? raioBase * ((estado.pontosCidadeAtual || []).length >= 9 ? 1.75 : 1)
    : 0;
  let foraDoRaio = 0;

  (novosLeads || []).forEach(bruto => {
    const nomeNorm = normalizarTexto(bruto.nome);
    if (!nomeNorm) return;

    if (raioKm > 0) {
      const la = parseFloat(bruto.lat);
      const ln = parseFloat(bruto.lng);
      if (!isNaN(la) && !isNaN(ln) &&
          distanciaKm(centroCidade.lat, centroCidade.lng, la, ln) > raioKm) {
        foraDoRaio++;
        return;
      }
    }

    const fone = somenteDigitos(bruto.telefone);
    const pid = String(bruto.placeId || "").toLowerCase();
    const chaveNF = fone ? (nomeNorm + "|" + fone) : (escopo + nomeNorm + "|");

    // Conflito de placeId: se ambos os lados têm id e eles diferem, são
    // negócios distintos (homônimos) — nunca mesclar.
    const semConflitoDeId = cand => {
      const idExistente = String((leads[cand] && leads[cand].placeId) || "").toLowerCase();
      return !(pid && idExistente && idExistente !== pid);
    };

    let idx = -1;
    if (pid && dedup.porId[pid] !== undefined) {
      idx = dedup.porId[pid];
    }
    if (idx === -1 && dedup.porNomeFone[chaveNF] !== undefined) {
      const cand = dedup.porNomeFone[chaveNF];
      if (semConflitoDeId(cand)) idx = cand;
    }
    if (idx === -1 && fone && dedup.porNomeFone[escopo + nomeNorm + "|"] !== undefined) {
      const cand = dedup.porNomeFone[escopo + nomeNorm + "|"];
      if (semConflitoDeId(cand)) idx = cand;
    }
    if (idx === -1 && !fone && dedup.porNome[escopo + nomeNorm] !== undefined) {
      const cand = dedup.porNome[escopo + nomeNorm];
      if (semConflitoDeId(cand)) idx = cand;
    }

    if (idx !== -1 && leads[idx]) {
      const existente = leads[idx];
      CAMPOS_ENRIQUECIVEIS.forEach(campo => {
        if (!existente[campo] && bruto[campo]) existente[campo] = bruto[campo];
      });
      // telefone pode ter chegado agora: recalcula os derivados do país
      existente.telefoneNormalizado = telefoneNormalizadoPais(existente.telefone, foneMeta);
      existente.whatsapp = linkWhatsappPais(existente.telefone, foneMeta);
      const foneFinal = somenteDigitos(existente.telefone);
      const chaveReg = foneFinal ? (normalizarTexto(existente.nome) + "|" + foneFinal) : (escopo + nomeNorm + "|");
      dedup.porNomeFone[chaveReg] = idx;
      if (existente.placeId) dedup.porId[String(existente.placeId).toLowerCase()] = idx;
      return;
    }

    const novo = {
      nome: bruto.nome || "",
      categoria: bruto.categoria || "",
      telefone: bruto.telefone || "",
      endereco: bruto.endereco || "",
      nota: bruto.nota || "",
      avaliacoes: bruto.avaliacoes || "",
      site: bruto.site || "",
      lat: bruto.lat || "",
      lng: bruto.lng || "",
      linkMaps: bruto.linkMaps || "",
      placeId: bruto.placeId || "",
      cidade: cidade,
      estado: uf,
      pais: pais,
      quadrante: ponto,
      termo: termo,
      telefoneNormalizado: telefoneNormalizadoPais(bruto.telefone, foneMeta),
      whatsapp: linkWhatsappPais(bruto.telefone, foneMeta),
      dataColeta: new Date().toISOString().slice(0, 10)
    };
    const novoIdx = leads.length;
    leads.push(novo);
    dedup.porNomeFone[chaveNF] = novoIdx;
    if (pid) dedup.porId[pid] = novoIdx;
    if (dedup.porNome[escopo + nomeNorm] === undefined) dedup.porNome[escopo + nomeNorm] = novoIdx;
  });

  estado.contadores.leadsUnicos = leads.length;
  return foraDoRaio;
}

// Reconstrói os índices de dedup a partir do array de leads, aplicando o escopo
// país|estado|cidade nas chaves sem telefone. Usado pela migração (chaves
// antigas não tinham escopo).
function reconstruirDedup(leads) {
  const dedup = { porId: {}, porNomeFone: {}, porNome: {} };
  leads.forEach((l, idx) => {
    const nomeNorm = normalizarTexto(l.nome);
    if (!nomeNorm) return;
    const fone = somenteDigitos(l.telefone);
    const pid = String(l.placeId || "").toLowerCase();
    const escopo = normalizarTexto((l.pais || "BR") + "|" + (l.estado || "") + "|" + (l.cidade || "")) + "|";
    if (pid && dedup.porId[pid] === undefined) dedup.porId[pid] = idx;
    const chaveNF = fone ? (nomeNorm + "|" + fone) : (escopo + nomeNorm + "|");
    if (dedup.porNomeFone[chaveNF] === undefined) dedup.porNomeFone[chaveNF] = idx;
    if (dedup.porNome[escopo + nomeNorm] === undefined) dedup.porNome[escopo + nomeNorm] = idx;
  });
  return dedup;
}

// ---------------------------------------------------------------------
// Montagem de URLs das tarefas
// Ponto "Centro": busca textual "termo cidade UF" — além de coletar, ela
// CALIBRA o centro geográfico da cidade (o content script devolve o
// @lat,lng,zoom da URL final do Maps).
// Demais pontos: viewport real deslocado do centro (cobertura territorial
// de verdade). Sem centro calibrado, cai no fallback textual
// "termo Ponto cidade UF" — garantindo os 3+ pontos em qualquer caso.
// ---------------------------------------------------------------------

function comHl(url) {
  return url + (url.includes("?") ? "&" : "?") + "hl=pt-BR";
}

function montarUrlTarefa(estado, config) {
  if (estado.emFichas) {
    const ficha = estado.fichasPendentes[0];
    return { url: comHl(ficha.url), textual: false };
  }

  const cidade = estado.filaCidades[estado.cidadeAtualIndex];
  const ponto = estado.pontosCidadeAtual[estado.pontoAtualIndex];
  const termo = estado.termos[estado.termoAtualIndex];
  const uf = estado.estadoAtual || config.uf;
  const pais = estado.paisAtual || "BR";
  const paisBusca = estado.paisBuscaAtual || "";
  const centro = estado.centroCidadeAtual;
  // Metrópoles (9 pontos) abrem um pouco o raio para cobrir a mancha urbana,
  // MAS sem afastar o zoom (a cidade continua preenchendo a tela).
  const nPontos = (estado.pontosCidadeAtual || []).length;
  const fator = nPontos >= 9 ? 1.6 : 1;
  const zoom = config.zoomPonto;

  // O texto da busca SEMPRE leva o nome da cidade, mesmo nas buscas ancoradas
  // por viewport. Sem ele, quando a cidade tem poucos resultados o Google
  // "completa" a lista com lugares perto do USUÁRIO (conta logada/IP/permissão
  // de localização do google.com) — quem mora em outra cidade contamina a
  // lista inteira. Texto prende a intenção NA cidade; viewport prende o mapa.
  const qualificador = pais === "BR" ? `${cidade} ${uf}` : `${cidade}, ${uf}, ${paisBusca}`;
  const montarViewport = (lat, lng) =>
    "https://www.google.com/maps/search/" + encodeURIComponent(`${termo} ${qualificador}`) +
    "/@" + lat.toFixed(6) + "," + lng.toFixed(6) + "," + zoom + "z?hl=pt-BR";

  // COM centro geográfico (coords reais OU calibrado): TODA busca é ancorada
  // por viewport, num zoom fechado. Elimina a vista larga/oceano que a busca
  // textual pura causava.
  if (centro) {
    if (ponto === "Centro") {
      // com coords reais, o próprio Centro já é ancorado; sem elas (calibração
      // pendente), o Centro é textual para descobrir o centro — trata abaixo.
      if (estado.centroFixo) return { url: montarViewport(centro.lat, centro.lng), textual: false };
    } else if (DESLOCAMENTOS[ponto]) {
      const [dLat, dLng] = DESLOCAMENTOS[ponto];
      return {
        url: montarViewport(centro.lat + dLat * config.deltaLat * fator,
                            centro.lng + dLng * config.deltaLng * fator),
        textual: false
      };
    }
  }

  // Fallback textual (cidade sem coords, ou Centro para calibrar). Diagonais não
  // têm fallback textual (geocodificam para uma região) — a degradação as remove.
  const ehDiagonal = ["Nordeste", "Noroeste", "Sudeste", "Sudoeste"].includes(ponto);
  const palavraPonto = (ponto === "Centro" || ehDiagonal) ? "" : ponto + " ";
  const alvo = pais === "BR"
    ? `${termo} ${palavraPonto}${cidade} ${uf}`
    : `${termo} ${palavraPonto}${cidade}, ${uf}, ${paisBusca}`;
  const url = "https://www.google.com/maps/search/" + encodeURIComponent(alvo) + "?hl=pt-BR";
  return { url, textual: true };
}

// ---------------------------------------------------------------------
// Ciclo de vida da aba de trabalho / máquina de estados
// ---------------------------------------------------------------------

async function fecharAbaSeExistir(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (e) {
    // aba já pode ter sido fechada
  }
}

async function limparAlarmesDeEtapa() {
  await chrome.alarms.clear(ALARME_TAB_TIMEOUT);
  await chrome.alarms.clear(ALARME_EXTRACAO_TIMEOUT);
  await chrome.alarms.clear(ALARME_PROXIMA_ETAPA);
}

async function iniciarTarefaAtual() {
  const estado = await obterEstado();

  if (estado.status !== "running") return;
  if (estado.workTabId || estado.fase) return; // etapa já em andamento

  if (estado.cidadeAtualIndex >= estado.filaCidades.length) {
    await finalizarVarredura(estado);
    return;
  }

  const config = await obterConfig();
  const cidade = estado.filaCidades[estado.cidadeAtualIndex];
  const meta = (estado.filaMeta && estado.filaMeta[estado.cidadeAtualIndex]) || {
    estado: config.uf, pais: "BR", paisBusca: "Brasil", pontos: 3,
    ddi: FONE_META_BR.ddi, tamanhos: FONE_META_BR.tamanhos, tronco: FONE_META_BR.tronco
  };
  // contexto geográfico/telefônico da cidade atual (usado por URL, CSV e dedup)
  estado.estadoAtual = meta.estado;
  estado.paisAtual = meta.pais;
  estado.paisBuscaAtual = meta.paisBusca;
  estado.foneMeta = { ddi: meta.ddi, tamanhos: meta.tamanhos, tronco: meta.tronco };

  // entrando numa cidade nova: define os pontos de cobertura dela
  if (!estado.pontosCidadeAtual || !estado.pontosCidadeAtual.length) {
    estado.pontosCidadeAtual = pontosDaCidade(meta.pontos);
    estado.pontoAtualIndex = 0;
    estado.termoAtualIndex = 0;
    estado.emFichas = false;
    estado.fichasPendentes = [];
    // COORDENADAS REAIS: ancoram TODAS as buscas no centro da cidade, num zoom
    // fechado (a cidade preenche a tela). Dispensa a calibração via URL, que
    // era imprecisa (o Google escolhia uma vista larga/oceano). Sem coords
    // (cidade sem coordenadas nos dados) cai no modo textual + calibração.
    if (typeof meta.lat === "number" && typeof meta.lng === "number") {
      estado.centroCidadeAtual = { lat: meta.lat, lng: meta.lng, zoom: config.zoomPonto };
      estado.centroFixo = true;
    } else {
      estado.centroCidadeAtual = null;
      estado.centroFixo = false;
    }
  }

  await chrome.alarms.clear(ALARME_PROXIMA_ETAPA);

  const tarefa = montarUrlTarefa(estado, config);

  estado.cidadeAtual = cidade;
  if (estado.emFichas) {
    estado.quadranteAtual = "Ficha";
    estado.termoAtual = estado.termos[0] || "";
    adicionarLog(estado, `${cidade}: enriquecendo ficha (${estado.fichasPendentes.length} restante(s))...`);
  } else {
    estado.quadranteAtual = estado.pontosCidadeAtual[estado.pontoAtualIndex];
    estado.termoAtual = estado.termos[estado.termoAtualIndex];
    const sufixoTermo = estado.termos.length > 1 ? ` — "${estado.termoAtual}"` : "";
    adicionarLog(estado, `Varrendo ${cidade} (${estado.cidadeAtualIndex + 1}/${estado.filaCidades.length}) — Ponto ${estado.quadranteAtual}${sufixoTermo}...`);
  }
  estado.urlTextual = tarefa.textual;
  estado.fase = "aguardando_navegacao";
  estado.faseTimestamp = Date.now();
  estado.tarefaInicioTs = Date.now();

  // contexto lido pelo content.js (executeScript com "files" não aceita args)
  await new Promise(resolve => chrome.storage.local.set({
    cidadeAtual: estado.cidadeAtual,
    quadranteAtual: estado.quadranteAtual,
    termo: estado.termoAtual
  }, resolve));
  await salvarEstado(estado);

  try {
    const tab = await chrome.tabs.create({ url: tarefa.url, active: false });
    estado.workTabId = tab.id;
    await salvarEstado(estado);
    await chrome.alarms.create(ALARME_TAB_TIMEOUT, { delayInMinutes: TAB_LOAD_TIMEOUT_MIN });
  } catch (erro) {
    adicionarLog(estado, `Erro ao abrir aba para ${cidade} - ${estado.quadranteAtual}: ${erro.message || erro}`);
    registrarFalha(estado, "erro ao abrir aba");
    await salvarEstado(estado);
    await finalizarTarefaAtual(null);
  }
}

async function onAbaCarregada(tabId) {
  const estado = await obterEstado();
  if (estado.fase !== "aguardando_navegacao" || estado.workTabId !== tabId) return;

  estado.fase = "injetando";
  estado.faseTimestamp = Date.now();
  await salvarEstado(estado);
  await chrome.alarms.clear(ALARME_TAB_TIMEOUT);

  try {
    const injecao = chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    const timeoutInjecao = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("timeout de injeção")), INJECAO_TIMEOUT_MS);
    });
    await Promise.race([injecao, timeoutInjecao]);

    const config = await obterConfig();
    estado.fase = "aguardando_extracao";
    estado.faseTimestamp = Date.now();
    await salvarEstado(estado);
    await chrome.alarms.create(ALARME_EXTRACAO_TIMEOUT, { delayInMinutes: config.timeoutExtracaoSeg / 60 });
  } catch (erro) {
    adicionarLog(estado, `Erro ao injetar script em ${estado.cidadeAtual} - ${estado.quadranteAtual}: ${erro.message || erro}`);
    registrarFalha(estado, "erro de injeção");
    await salvarEstado(estado);
    await finalizarTarefaAtual(tabId);
  }
}

async function onTimeoutCarregamentoAba() {
  const estado = await obterEstado();
  if (estado.fase !== "aguardando_navegacao") return;

  adicionarLog(estado, `Timeout ao carregar página em ${estado.cidadeAtual} - ${estado.quadranteAtual}.`);
  registrarFalha(estado, "timeout de carregamento");
  await salvarEstado(estado);
  await finalizarTarefaAtual(estado.workTabId);
}

async function onTimeoutExtracao() {
  const estado = await obterEstado();
  if (estado.fase !== "aguardando_extracao") return;

  adicionarLog(estado, `Timeout em ${estado.cidadeAtual} - ${estado.quadranteAtual} (sem resposta do content script).`);
  registrarFalha(estado, "timeout de extração");
  await salvarEstado(estado);
  await finalizarTarefaAtual(estado.workTabId);
}

// Parciais chegam durante o scroll: mescla sem finalizar a etapa e
// estende o prazo de extração (houve progresso real na página).
async function onMensagemExtracaoParcial(tabId, novosLeads) {
  const estado = await obterEstado();
  if (estado.workTabId !== tabId) return;
  if (estado.fase !== "aguardando_extracao" && estado.fase !== "injetando") return;

  const config = await obterConfig();
  const { leads, dedup } = await obterDados();
  mesclarLeads(estado, leads, dedup, novosLeads, config);
  await salvarDados(leads, dedup);
  await salvarEstado(estado);

  await chrome.alarms.create(ALARME_EXTRACAO_TIMEOUT, { delayInMinutes: config.timeoutExtracaoSeg / 60 });
}

async function onMensagemExtracaoConcluida(tabId, novosLeads, centro) {
  const estado = await obterEstado();
  if (estado.workTabId !== tabId) return;
  if (estado.fase !== "aguardando_extracao" && estado.fase !== "injetando") return;

  await chrome.alarms.clear(ALARME_TAB_TIMEOUT);
  await chrome.alarms.clear(ALARME_EXTRACAO_TIMEOUT);

  // calibra o centro da cidade a partir da busca textual (ponto Centro)
  if (centro && estado.urlTextual && !estado.emFichas && !estado.centroCidadeAtual &&
      typeof centro.lat === "number" && typeof centro.lng === "number") {
    estado.centroCidadeAtual = { lat: centro.lat, lng: centro.lng, zoom: centro.zoom || 14 };
    adicionarLog(estado, `${estado.cidadeAtual}: centro calibrado (${centro.lat.toFixed(4)}, ${centro.lng.toFixed(4)}).`);
  }

  const config = await obterConfig();
  const { leads, dedup } = await obterDados();
  const foraDoRaio = mesclarLeads(estado, leads, dedup, novosLeads, config);
  await salvarDados(leads, dedup);
  const notaRaio = foraDoRaio > 0 ? ` (${foraDoRaio} fora do raio da cidade, descartados)` : "";
  adicionarLog(estado, `${estado.cidadeAtual} - ${estado.quadranteAtual}: ${(novosLeads || []).length} resultado(s)${notaRaio}. Únicos: ${estado.contadores.leadsUnicos}.`);
  await salvarEstado(estado);

  await finalizarTarefaAtual(tabId);
}

async function onMensagemBloqueioDetectado(tabId) {
  const estado = await obterEstado();
  if (estado.workTabId !== tabId) return;
  if (estado.fase !== "aguardando_navegacao" && estado.fase !== "injetando" && estado.fase !== "aguardando_extracao") return;

  await limparAlarmesDeEtapa();

  adicionarLog(estado, "Google pediu verificação — abra o Maps, resolva e clique em Continuar.");
  estado.status = "paused";
  estado.workTabId = null;
  estado.fase = null;
  estado.faseTimestamp = 0;
  await salvarEstado(estado);
  await fecharAbaSeExistir(tabId);

  const config = await obterConfig();
  notificar(config, "Verificação necessária", "O Google pediu verificação. Resolva o desafio no Maps e clique em Continuar na extensão.");
}

async function onAbaFechadaManualmente(tabId) {
  const estado = await obterEstado();
  if (estado.workTabId !== tabId) return;
  if (estado.fase !== "aguardando_navegacao" && estado.fase !== "injetando" && estado.fase !== "aguardando_extracao") return;

  await chrome.alarms.clear(ALARME_TAB_TIMEOUT);
  await chrome.alarms.clear(ALARME_EXTRACAO_TIMEOUT);

  adicionarLog(estado, `Aba fechada manualmente durante ${estado.cidadeAtual} - ${estado.quadranteAtual}. Etapa marcada como falha.`);
  registrarFalha(estado, "aba fechada manualmente");
  await salvarEstado(estado);

  await finalizarTarefaAtual(null);
}

// Encerra a tarefa atual e avança a fila ATOMICAMENTE:
// termo -> ponto -> (fichas do modo profundo) -> cidade.
// A cidade só se completa depois de TODOS os seus pontos (mínimo 3).
async function finalizarTarefaAtual(tabIdParaFechar) {
  const estado = await obterEstado();
  const config = await obterConfig();

  estado.workTabId = null;
  estado.fase = null;
  estado.faseTimestamp = 0;

  // média móvel do tempo por tarefa de busca (para o ETA no popup)
  if (!estado.emFichas && estado.tarefaInicioTs) {
    const duracao = Date.now() - estado.tarefaInicioTs;
    estado.mediaMsPorTarefa = estado.mediaMsPorTarefa
      ? Math.round(estado.mediaMsPorTarefa * 0.7 + duracao * 0.3)
      : duracao;
  }
  estado.tarefaInicioTs = 0;

  let cidadeCompleta = false;

  if (estado.emFichas) {
    estado.fichasPendentes.shift();
    if (!estado.fichasPendentes.length) {
      estado.emFichas = false;
      cidadeCompleta = true;
    }
  } else {
    estado.contadores.tarefasConcluidas += 1;
    estado.termoAtualIndex += 1;
    if (estado.termoAtualIndex >= estado.termos.length) {
      estado.termoAtualIndex = 0;
      estado.pontoAtualIndex += 1;
    }
    // Ao sair do Centro (índice 0 -> 1): se o centro não calibrou, remove as
    // diagonais (não têm fallback textual) e corrige o total de tarefas.
    if (estado.pontoAtualIndex === 1 && !estado.centroCidadeAtual &&
        estado.pontosCidadeAtual.length > 5) {
      const removidos = estado.pontosCidadeAtual.length - 5;
      estado.pontosCidadeAtual = estado.pontosCidadeAtual.slice(0, 5);
      estado.contadores.totalTarefas -= removidos * estado.termos.length;
      adicionarLog(estado, `${estado.cidadeAtual}: centro não calibrado — ${removidos} diagonal(is) puladas.`);
    }
    if (estado.pontoAtualIndex >= estado.pontosCidadeAtual.length) {
      // todos os pontos da cidade cobertos
      if (config.modoProfundo) {
        const { leads } = await obterDados();
        const pendentes = leads
          .filter(l => l.cidade === estado.cidadeAtual && !l.telefone && l.linkMaps)
          .slice(0, config.limiteFichasPorCidade)
          .map(l => ({ url: l.linkMaps }));
        if (pendentes.length) {
          estado.emFichas = true;
          estado.fichasPendentes = pendentes;
          adicionarLog(estado, `${estado.cidadeAtual}: modo profundo — ${pendentes.length} ficha(s) de lead sem telefone.`);
        } else {
          cidadeCompleta = true;
        }
      } else {
        cidadeCompleta = true;
      }
    }
  }

  if (cidadeCompleta) {
    estado.cidadeAtualIndex += 1;
    estado.contadores.cidadesConcluidas += 1;
    estado.pontosCidadeAtual = [];
    estado.pontoAtualIndex = 0;
    estado.termoAtualIndex = 0;
    estado.centroCidadeAtual = null;
    estado.centroFixo = false;
    estado.emFichas = false;
    estado.fichasPendentes = [];
  }

  if (estado.cidadeAtualIndex >= estado.filaCidades.length) {
    await fecharAbaSeExistir(tabIdParaFechar);
    await finalizarVarredura(estado);
    return;
  }

  if (cidadeCompleta && estado.modo === "blocos" &&
      estado.contadores.cidadesConcluidas % config.tamanhoBloco === 0) {
    estado.blocoCount += 1;
    adicionarLog(estado, `Bloco de ${config.tamanhoBloco} cidades concluído. Exportando CSV parcial (bloco ${estado.blocoCount})...`);
    const { leads } = await obterDados();
    await baixarCSVComIA(leads, `${estado.nomeBaseArquivo}_bloco${estado.blocoCount}.csv`, estado);
    estado.status = "waiting_block";
    notificar(config, "Bloco concluído", `CSV parcial (bloco ${estado.blocoCount}) baixado. Clique em Continuar para seguir.`);
  }

  await salvarEstado(estado);
  await fecharAbaSeExistir(tabIdParaFechar);

  if (estado.status === "running") {
    // Intervalo aleatório para não parecer tráfego robótico. Duas vias:
    // setTimeout (caminho rápido, morre se o worker suspender) + alarme
    // (rede de segurança persistente; empacotado arredonda p/ 30s).
    // A dupla chegada é inofensiva: o índice já avançou e os guards de
    // fase/workTabId tornam a segunda chamada um no-op.
    const segundos = randomEntre(config.intervaloMinSeg, config.intervaloMaxSeg);
    await chrome.alarms.create(ALARME_PROXIMA_ETAPA, { delayInMinutes: segundos / 60 });
    setTimeout(() => {
      processarAlarme({ name: ALARME_PROXIMA_ETAPA });
    }, Math.max(50, Math.round(segundos * 1000)));
  }
}

async function finalizarVarredura(estado) {
  adicionarLog(estado, `Varredura concluída. Total de leads únicos: ${estado.contadores.leadsUnicos}. Falhas: ${estado.contadores.falhas}.`);
  estado.status = "done";
  estado.workTabId = null;
  estado.fase = null;
  estado.faseTimestamp = 0;
  await salvarEstado(estado);
  await limparAlarmesDeEtapa();

  const { leads } = await obterDados();
  await baixarCSVComIA(leads, `${estado.nomeBaseArquivo}.csv`, estado);

  const config = await obterConfig();
  notificar(config, "Varredura concluída", `${estado.contadores.leadsUnicos} lead(s) único(s) exportado(s) em CSV.`);
}

// ---------------------------------------------------------------------
// Comandos do popup
// ---------------------------------------------------------------------

async function cmdStart(msg) {
  const estadoAnterior = await obterEstado();
  if (estadoAnterior.status === "running") return;

  await limparAlarmesDeEtapa();
  await fecharAbaSeExistir(estadoAnterior.workTabId);

  const config = await obterConfig();
  const termos = (msg.termos || []).map(t => String(t).trim()).filter(Boolean);

  // Aceita dois formatos de msg.cidades:
  //  - legado: ["Joinville", ...] + msg.principais (tratado como BR/config.uf);
  //  - FASE 4: [{nome, estado, pais, paisBusca, pontos, ddi, tamanhos, tronco}].
  const principaisLegado = (msg.principais || []);
  const brutas = (msg.cidades || []).map(c => {
    if (typeof c === "string") {
      const nome = c.trim();
      if (!nome) return null;
      return {
        nome,
        estado: config.uf,
        pais: "BR",
        paisBusca: "Brasil",
        pontos: principaisLegado.includes(nome) ? 5 : 3,
        ddi: FONE_META_BR.ddi, tamanhos: FONE_META_BR.tamanhos, tronco: FONE_META_BR.tronco
      };
    }
    if (!c || !c.nome) return null;
    let lat = parseFloat(c.lat), lng = parseFloat(c.lng);
    // coords fora de faixa são descartadas (a cidade cai no modo textual seguro)
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = NaN; lng = NaN; }
    return {
      nome: String(c.nome).trim(),
      estado: String(c.estado || config.uf).trim(),
      pais: String(c.pais || "BR").trim().toUpperCase().slice(0, 2),
      paisBusca: String(c.paisBusca || "").trim(),
      pontos: [3, 5, 9].includes(c.pontos) ? c.pontos : 3,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      ddi: String(c.ddi || FONE_META_BR.ddi),
      tamanhos: Array.isArray(c.tamanhos) ? c.tamanhos : FONE_META_BR.tamanhos,
      tronco: c.tronco !== undefined ? String(c.tronco) : FONE_META_BR.tronco
    };
  }).filter(Boolean);

  // dedup por pais|estado|nome (normalizado) e ordena por pais > estado > nome
  // (contiguidade exigida por qualquer fronteira futura de export/pausa).
  const vistas = new Set();
  const itens = [];
  brutas.forEach(c => {
    const chave = c.pais + "|" + normalizarTexto(c.estado) + "|" + normalizarTexto(c.nome);
    if (vistas.has(chave)) return;
    vistas.add(chave);
    itens.push(c);
  });
  itens.sort((a, b) =>
    a.pais.localeCompare(b.pais) ||
    a.estado.localeCompare(b.estado, "pt-BR") ||
    a.nome.localeCompare(b.nome, "pt-BR"));

  const cidades = itens.map(c => c.nome);
  const filaMeta = itens.map(c => ({
    estado: c.estado, pais: c.pais, paisBusca: c.paisBusca, pontos: c.pontos,
    lat: c.lat, lng: c.lng,
    ddi: c.ddi, tamanhos: c.tamanhos, tronco: c.tronco
  }));
  if (!cidades.length || !termos.length) return;

  // dados pesados: zera ou acumula com a coleta anterior
  let leads = [];
  let dedup = { porId: {}, porNomeFone: {}, porNome: {} };
  if (msg.acumular) {
    const dados = await obterDados();
    leads = dados.leads;
    dedup = dados.dedup;
  }
  await salvarDados(leads, dedup);

  const totalTarefas = filaMeta.reduce((soma, m) => soma + m.pontos * termos.length, 0);
  const principais = cidades.filter((c, i) => filaMeta[i].pontos >= 5);

  const novoEstado = Object.assign({}, ESTADO_PADRAO, {
    status: "running",
    modo: msg.modo || "blocos",
    termos: termos,
    filaCidades: cidades,
    filaMeta: filaMeta,
    cidadesPrincipais: principais,
    contadores: {
      cidadesConcluidas: 0,
      totalCidades: cidades.length,
      leadsUnicos: leads.length,
      tarefasConcluidas: 0,
      totalTarefas: totalTarefas,
      falhas: 0
    },
    log: [],
    falhas: [],
    nomeBaseArquivo: `leads_${slug(termos[0])}_${sufixoRegiao(filaMeta)}_${timestampArquivo()}`
  });

  adicionarLog(novoEstado, `Iniciando: ${cidades.length} cidade(s), ${termos.length} termo(s), ${totalTarefas} buscas — mínimo 3 pontos por cidade.${msg.acumular ? ` Acumulando com ${leads.length} lead(s) anteriores.` : ""}`);
  await salvarEstado(novoEstado);
  await iniciarTarefaAtual();
}

async function cmdPause() {
  const estado = await obterEstado();
  if (estado.status !== "running") return;
  estado.status = "paused";
  adicionarLog(estado, "Pausado pelo usuário. A etapa atual será concluída antes de parar.");
  await salvarEstado(estado);
}

async function cmdResume() {
  const estado = await obterEstado();
  if (estado.status !== "paused" && estado.status !== "waiting_block") return;

  estado.status = "running";
  adicionarLog(estado, "Retomando varredura...");
  await salvarEstado(estado);

  await iniciarTarefaAtual();
}

async function cmdStopExport() {
  const estado = await obterEstado();

  await limparAlarmesDeEtapa();
  await fecharAbaSeExistir(estado.workTabId);

  adicionarLog(estado, `Varredura interrompida pelo usuário. Exportando ${estado.contadores.leadsUnicos} lead(s).`);
  estado.status = "idle";
  estado.workTabId = null;
  estado.fase = null;
  estado.faseTimestamp = 0;
  await salvarEstado(estado);

  const { leads } = await obterDados();
  await baixarCSVComIA(leads, `${estado.nomeBaseArquivo}.csv`, estado);
}

// Zera TUDO para começar uma nova busca do zero: interrompe a varredura, fecha
// a aba de trabalho, apaga leads/dedup e volta ao estado ocioso. NÃO exporta
// (é um descarte deliberado; use "Parar e Exportar" antes se quiser o CSV).
async function cmdReset() {
  const estado = await obterEstado();
  await limparAlarmesDeEtapa();
  await fecharAbaSeExistir(estado.workTabId);

  await salvarDados([], { porId: {}, porNomeFone: {}, porNome: {} });
  const novo = Object.assign({}, ESTADO_PADRAO, { contadores: Object.assign({}, ESTADO_PADRAO.contadores) });
  await salvarEstado(novo);
  atualizarBadge(novo);
}

async function cmdExportNow() {
  const estado = await obterEstado();
  const { leads } = await obterDados();
  const agora = new Date();
  const p = n => String(n).padStart(2, "0");
  const sufixo = `${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}`;
  adicionarLog(estado, `Exportação manual: ${leads.length} lead(s) até agora.`);
  await salvarEstado(estado);
  await baixarCSVComIA(leads, `${estado.nomeBaseArquivo}_parcial_${sufixo}.csv`, estado);
}

// Reenfileira as CIDADES com falha (cobertura completa nelas de novo),
// acumulando com os leads já coletados — a dedup impede duplicatas.
async function cmdRetryFailures() {
  const estado = await obterEstado();
  if (estado.status !== "idle" && estado.status !== "done") return;

  // Reconstrói ITENS COMPLETOS a partir do meta salvo na falha (país, estado,
  // coords, telefone) — o retry mantém a busca ancorada e precisa. Falha
  // antiga sem meta cai no formato legado (BR/config.uf), como antes.
  const vistos = new Set();
  const cidades = [];
  const nomes = [];
  (estado.falhas || []).forEach(f => {
    if (!f.cidade) return;
    const m = f.meta || null;
    const chave = (m ? m.pais + "|" + normalizarTexto(m.estado || "") : "legado") +
      "|" + normalizarTexto(f.cidade);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    cidades.push(m ? Object.assign({ nome: f.cidade }, m) : f.cidade);
    nomes.push(f.cidade);
  });
  if (!cidades.length) return;

  await cmdStart({
    cidades: cidades,
    principais: estado.cidadesPrincipais.filter(c => nomes.includes(c)),
    termos: estado.termos,
    modo: estado.modo,
    acumular: true
  });
}

// ---------------------------------------------------------------------
// Watchdog: retoma a fila se o service worker foi morto no meio de uma
// etapa (alarme perdido, aba sumida, fase travada). A fila nunca fica
// parada em status "running".
// ---------------------------------------------------------------------

async function executarWatchdog() {
  const estado = await obterEstado();
  if (estado.status !== "running") return;

  if (estado.fase) {
    if (estado.faseTimestamp && Date.now() - estado.faseTimestamp > FASE_TRAVADA_MS) {
      adicionarLog(estado, `Watchdog: etapa travada em ${estado.cidadeAtual} - ${estado.quadranteAtual}; seguindo adiante.`);
      registrarFalha(estado, "etapa travada (watchdog)");
      await salvarEstado(estado);
      await chrome.alarms.clear(ALARME_TAB_TIMEOUT);
      await chrome.alarms.clear(ALARME_EXTRACAO_TIMEOUT);
      await finalizarTarefaAtual(estado.workTabId);
      return;
    }
    if (estado.workTabId) {
      try {
        await chrome.tabs.get(estado.workTabId);
      } catch (e) {
        adicionarLog(estado, `Watchdog: aba de trabalho desapareceu em ${estado.cidadeAtual} - ${estado.quadranteAtual}; seguindo adiante.`);
        registrarFalha(estado, "aba desapareceu (watchdog)");
        await salvarEstado(estado);
        await chrome.alarms.clear(ALARME_TAB_TIMEOUT);
        await chrome.alarms.clear(ALARME_EXTRACAO_TIMEOUT);
        await finalizarTarefaAtual(null);
      }
    }
    return;
  }

  const transicaoPendente = await chrome.alarms.get(ALARME_PROXIMA_ETAPA);
  if (!transicaoPendente) {
    await iniciarTarefaAtual();
  }
}

// ---------------------------------------------------------------------
// Listeners (registrados sincronamente no nível superior, como o MV3 exige)
// ---------------------------------------------------------------------

async function garantirWatchdog() {
  try {
    const existente = await chrome.alarms.get(ALARME_WATCHDOG);
    if (!existente) {
      await chrome.alarms.create(ALARME_WATCHDOG, { periodInMinutes: 1 });
    }
  } catch (erro) {
    console.error("Apex: falha ao criar watchdog:", erro);
  }
}
garantirWatchdog();

const processarAlarme = serializado(async alarm => {
  switch (alarm.name) {
    case ALARME_WATCHDOG:
      await executarWatchdog();
      break;
    case ALARME_TAB_TIMEOUT:
      await onTimeoutCarregamentoAba();
      break;
    case ALARME_EXTRACAO_TIMEOUT:
      await onTimeoutExtracao();
      break;
    case ALARME_PROXIMA_ETAPA:
      await iniciarTarefaAtual();
      break;
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  processarAlarme(alarm);
});

const processarAbaCarregada = serializado(onAbaCarregada);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    processarAbaCarregada(tabId);
  }
});

const processarAbaRemovida = serializado(onAbaFechadaManualmente);

chrome.tabs.onRemoved.addListener(tabId => {
  processarAbaRemovida(tabId);
});

// Ao reiniciar o navegador no meio de uma varredura, pausa e avisa
// (a menos que a opção auto-retomar esteja ligada).
const processarStartup = serializado(async () => {
  const config = await obterConfig();
  const estado = await obterEstado();
  if (estado.status === "running" && !config.autoRetomar) {
    await limparAlarmesDeEtapa();
    const abaAntiga = estado.workTabId;
    estado.status = "paused";
    estado.workTabId = null;
    estado.fase = null;
    estado.faseTimestamp = 0;
    adicionarLog(estado, "Navegador reiniciado — varredura pausada. Clique em Continuar para retomar.");
    await salvarEstado(estado);
    await fecharAbaSeExistir(abaAntiga);
    notificar(config, "Varredura pausada", "O navegador foi reiniciado. Abra a extensão e clique em Continuar para retomar.");
  }
});

chrome.runtime.onStartup.addListener(() => {
  processarStartup();
});

// v2: limiteFichasPorCidade subiu de 10 para 150 (teto antigo do campo: 50).
// Eleva uma única vez o valor salvo; depois o marcador configVersao preserva
// qualquer escolha manual futura, mesmo em reloads da extensão.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["config", "configVersao", "leads", "dedup"], dados => {
    const versao = dados.configVersao || 1;
    if (versao >= CONFIG_VERSAO) return;
    const novos = { configVersao: CONFIG_VERSAO };

    // v2: eleva limiteFichasPorCidade (teto antigo 50) para o novo padrão.
    if (versao < 2 && dados.config) {
      dados.config.limiteFichasPorCidade = CONFIG_PADRAO.limiteFichasPorCidade;
    }
    // v4: os deslocamentos largos antigos (0.045/0.055) jogavam pontos para fora
    // da cidade (oceano/vizinhos). Corrige para o novo padrão fechado, uma vez.
    if (versao < 4 && dados.config) {
      if (dados.config.deltaLat === 0.045) dados.config.deltaLat = CONFIG_PADRAO.deltaLat;
      if (dados.config.deltaLng === 0.055) dados.config.deltaLng = CONFIG_PADRAO.deltaLng;
    }
    if (dados.config) novos.config = dados.config;

    // v3 (FASE 4): leads antigos ganham país BR e estado = config.uf; a dedup é
    // reconstruída com o escopo país|estado|cidade (as chaves antigas não tinham).
    if (versao < 3 && Array.isArray(dados.leads) && dados.leads.length) {
      const uf = (dados.config && dados.config.uf) || CONFIG_PADRAO.uf;
      dados.leads.forEach(l => {
        if (!l.pais) l.pais = "BR";
        if (!l.estado) l.estado = uf;
        if (l.telefoneNormalizado === undefined) l.telefoneNormalizado = telefoneNormalizado(l.telefone);
        if (l.whatsapp === undefined) l.whatsapp = linkWhatsapp(l.telefone);
      });
      novos.leads = dados.leads;
      novos.dedup = reconstruirDedup(dados.leads);
    }

    chrome.storage.local.set(novos);
  });
});

const processarMensagem = serializado(async (msg, senderTabId) => {
  if (msg.tipo === "extracao_concluida" && senderTabId !== null) {
    await onMensagemExtracaoConcluida(senderTabId, msg.leads || [], msg.centro || null);
    return;
  }

  if (msg.tipo === "extracao_parcial" && senderTabId !== null) {
    await onMensagemExtracaoParcial(senderTabId, msg.leads || []);
    return;
  }

  if (msg.tipo === "bloqueio_detectado" && senderTabId !== null) {
    await onMensagemBloqueioDetectado(senderTabId);
    return;
  }

  switch (msg.cmd) {
    case "start":
      await cmdStart(msg);
      break;
    case "pause":
      await cmdPause();
      break;
    case "resume":
      await cmdResume();
      break;
    case "stop_export":
      await cmdStopExport();
      break;
    case "export_now":
      await cmdExportNow();
      break;
    case "retry_failures":
      await cmdRetryFailures();
      break;
    case "reset":
      await cmdReset();
      break;
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  processarMensagem(msg, sender.tab ? sender.tab.id : null);
});
