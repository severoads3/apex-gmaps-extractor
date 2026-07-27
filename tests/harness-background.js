// Harness: simula a API chrome.* e executa o background.js real da
// extensão, exercitando a máquina de estados completa (v2: pontos de
// cobertura, calibração de centro, viewport, multi-termo, parciais,
// falhas, retry e acumulação).
const fs = require("fs");
const path = require("path");
const code = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");

// ------------------------- stub da API chrome -------------------------
const storage = {};
const alarms = {};
let alarmListeners = [];
let updatedListeners = [];
let removedListeners = [];
let messageListeners = [];
let startupListeners = [];
let installedListeners = [];
let tabs = {};
let nextTabId = 1;
const downloads = [];
const notificacoes = [];

const chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach(k => {
          if (k in storage) out[k] = JSON.parse(JSON.stringify(storage[k]));
        });
        cb(out);
      },
      set(obj, cb) {
        Object.assign(storage, JSON.parse(JSON.stringify(obj)));
        if (cb) cb();
      }
    }
  },
  alarms: {
    async create(name, info) { alarms[name] = info; },
    async clear(name) { delete alarms[name]; },
    async get(name) { return alarms[name] ? Object.assign({ name }, alarms[name]) : undefined; },
    onAlarm: { addListener(fn) { alarmListeners.push(fn); } }
  },
  tabs: {
    async create({ url }) { const id = nextTabId++; tabs[id] = { url }; return { id }; },
    async remove(id) {
      if (!tabs[id]) throw new Error("no tab " + id);
      delete tabs[id];
      removedListeners.forEach(f => f(id));
    },
    async get(id) { if (!tabs[id]) throw new Error("no tab " + id); return { id }; },
    onUpdated: { addListener(fn) { updatedListeners.push(fn); } },
    onRemoved: { addListener(fn) { removedListeners.push(fn); } }
  },
  scripting: {
    async executeScript() { return [{}]; }
  },
  runtime: {
    onMessage: { addListener(fn) { messageListeners.push(fn); } },
    onStartup: { addListener(fn) { startupListeners.push(fn); } },
    onInstalled: { addListener(fn) { installedListeners.push(fn); } },
    getURL(p) { return "chrome-extension://teste/" + p; }
  },
  downloads: {
    async download({ url, filename }) { downloads.push({ url, filename }); }
  },
  action: {
    setBadgeText() {},
    setBadgeBackgroundColor() {}
  },
  notifications: {
    create(id, opts) { notificacoes.push(opts); }
  }
};

// intervalos mínimos para o teste andar rápido (o caminho rápido usa setTimeout real);
// "uf" exercita o fallback do formato legado de payload (lista de nomes de cidade).
storage.config = { intervaloMinSeg: 0.01, intervaloMaxSeg: 0.02, uf: "SC" };

new Function("chrome", code)(chrome);

// ----------------------------- helpers --------------------------------
const wait = ms => new Promise(r => setTimeout(r, ms));

async function fireAlarm(name) {
  delete alarms[name];
  for (const f of alarmListeners) await f({ name });
}

function sendCmd(cmd, extra) {
  messageListeners.forEach(f => f(Object.assign({ cmd }, extra || {}), {}));
}

function contentMessage(tabId, msg) {
  messageListeners.forEach(f => f(msg, { tab: { id: tabId } }));
}

let falhas = 0;
function assert(cond, rotulo) {
  if (cond) {
    console.log("PASS: " + rotulo);
  } else {
    falhas++;
    console.log("FAIL: " + rotulo);
  }
}

function abaDeTrabalhoUnica() {
  const ids = Object.keys(tabs);
  if (ids.length !== 1) return null;
  return Number(ids[0]);
}

// Processa uma tarefa: espera a aba, responde com leads (ou simula timeout)
// e espera o caminho rápido avançar sozinho para a próxima.
async function processarTarefa(leads, opts) {
  opts = opts || {};
  await wait(30);
  const tabId = abaDeTrabalhoUnica();
  if (tabId === null) {
    falhas++;
    console.log("FAIL: esperava exatamente 1 aba de trabalho, achei " + Object.keys(tabs).length);
    return null;
  }
  const url = tabs[tabId].url;
  updatedListeners.forEach(f => f(tabId, { status: "complete" }));
  await wait(30);
  if (opts.timeout) {
    await fireAlarm("extractionTimeout");
  } else {
    contentMessage(tabId, { tipo: "extracao_concluida", leads: leads || [], centro: opts.centro || null });
  }
  await wait(80); // caminho rápido (10-20ms) dispara a próxima tarefa
  if (tabs[tabId]) {
    falhas++;
    console.log("FAIL: aba de trabalho nao foi fechada");
  }
  return url;
}

function decodificarCSV(download) {
  return decodeURIComponent(download.url.replace("data:text/csv;charset=utf-8,", ""));
}

// ------------------------------ testes ---------------------------------
(async () => {
  // ===== T0: migração de config (limiteFichasPorCidade 10 -> 150) =====
  storage.config.limiteFichasPorCidade = 10;
  installedListeners.forEach(f => f({ reason: "update" }));
  assert(storage.config.limiteFichasPorCidade === 150, "T0: valor salvo antigo elevado para 150");
  assert(storage.configVersao === 4, "T0: configVersao marcada");
  storage.config.limiteFichasPorCidade = 30;
  installedListeners.forEach(f => f({ reason: "update" }));
  assert(storage.config.limiteFichasPorCidade === 30, "T0: escolha manual preservada em reload");
  delete storage.config.limiteFichasPorCidade;

  // ===== T1: cidade comum tem exatamente 3 pontos; principal tem 5;
  // ===== centro calibrado gera URLs de viewport deslocadas ============
  sendCmd("start", {
    cidades: ["CidadeA", "Principal1"],
    principais: ["Principal1"],
    termos: ["loja teste"],
    modo: "continuo",
    acumular: false
  });
  await wait(40);

  assert(storage.estado.status === "running", "T1: status running apos start");
  assert(storage.estado.contadores.totalTarefas === 3 + 5, "T1: totalTarefas = 3 (comum) + 5 (principal)");

  // CidadeA — ponto Centro (textual, sem palavra de ponto) calibra o centro
  let url = await processarTarefa(
    [{ nome: "Loja Única", telefone: "", categoria: "Loja", placeId: "0xaa:0x01" }],
    { centro: { lat: -26.3, lng: -48.85, zoom: 13 } }
  );
  assert(url.includes(encodeURIComponent("loja teste CidadeA SC")), "T1: ponto Centro e busca textual 'termo cidade UF'");
  assert(url.includes("hl=pt-BR"), "T1: URL com hl=pt-BR");
  assert(!url.includes(encodeURIComponent("Centro CidadeA")), "T1: Centro nao vira palavra na busca");

  // CidadeA — ponto Norte: viewport deslocado +0.045 lat
  url = await processarTarefa([{ nome: "Loja Unica", telefone: "(47) 99999-8888", placeId: "0xaa:0x01" }]);
  assert(url.includes("/@-26.270000,-48.850000,14z"), "T1: ponto Norte usa viewport deslocado do centro calibrado (delta 0.03)");
  assert(url.includes(encodeURIComponent("CidadeA SC")), "T1: viewport mantem o nome da cidade no texto (anti-vies de localizacao do usuario)");

  // CidadeA — ponto Sul: viewport deslocado -0.03 lat
  url = await processarTarefa([]);
  assert(url.includes("/@-26.330000,-48.850000,14z"), "T1: ponto Sul usa viewport deslocado para o sul");

  assert(storage.estado.contadores.cidadesConcluidas === 1, "T1: CidadeA concluida apos os 3 pontos");
  assert(storage.leads.length === 1, "T1: dedup por placeId (mesmo lugar nos 3 pontos = 1 lead)");
  assert(storage.leads[0].telefone === "(47) 99999-8888", "T1: telefone enriqueceu o registro via placeId");

  // Principal1 — 5 pontos; sem calibracao (centro null) -> fallback textual
  url = await processarTarefa([], { centro: null });
  assert(url.includes(encodeURIComponent("loja teste Principal1 SC")), "T1: Principal1 ponto Centro textual");
  url = await processarTarefa([]);
  assert(url.includes(encodeURIComponent("loja teste Norte Principal1 SC")), "T1: sem centro calibrado, Norte cai no fallback textual");
  url = await processarTarefa([]);
  assert(url.includes(encodeURIComponent("Sul Principal1")), "T1: ponto Sul textual");
  url = await processarTarefa([]);
  assert(url.includes(encodeURIComponent("Leste Principal1")), "T1: cidade principal tem ponto Leste");
  url = await processarTarefa([]);
  assert(url.includes(encodeURIComponent("Oeste Principal1")), "T1: cidade principal tem ponto Oeste");

  await wait(40);
  assert(storage.estado.status === "done", "T1: done ao fim da fila");
  assert(storage.estado.contadores.tarefasConcluidas === 8, "T1: 8 tarefas concluidas");
  assert(downloads.length === 1 && /^leads_loja-teste_sc_\d{4}-\d{2}-\d{2}_\d{4}\.csv$/.test(downloads[0].filename),
    "T1: CSV final com slug do termo + data");

  const csv = decodificarCSV(downloads[0]);
  assert(csv.charCodeAt(0) === 0xFEFF, "T1: CSV comeca com BOM");
  assert(csv.includes("Nome;Categoria;Telefone;Endereco;Nota;Avaliacoes;Cidade;Quadrante;Termo;TelefoneNormalizado;WhatsApp;Site;Lat;Lng;LinkMaps;DataColeta"),
    "T1: cabecalho v2 com colunas novas");
  assert(csv.includes("https://wa.me/5547999998888"), "T1: coluna WhatsApp gerada para celular");
  assert(csv.includes(";5547999998888;"), "T1: telefone normalizado com 55");

  // ===== T2: multi-termo — ordem ponto x termo e coluna Termo ==========
  downloads.length = 0;
  sendCmd("start", {
    cidades: ["CidadeB"],
    principais: [],
    termos: ["termo1", "termo2"],
    modo: "continuo",
    acumular: false
  });
  await wait(40);
  assert(storage.estado.contadores.totalTarefas === 6, "T2: 3 pontos x 2 termos = 6 tarefas");

  url = await processarTarefa([{ nome: "Lead T1", telefone: "" }]);
  assert(url.includes(encodeURIComponent("termo1 CidadeB SC")), "T2: Centro com termo1");
  url = await processarTarefa([{ nome: "Lead T2", telefone: "" }]);
  assert(url.includes(encodeURIComponent("termo2 CidadeB SC")), "T2: Centro com termo2 antes de mudar de ponto");
  for (let i = 0; i < 4; i++) await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T2: done");
  assert(storage.leads.some(l => l.termo === "termo1") && storage.leads.some(l => l.termo === "termo2"),
    "T2: coluna Termo registra qual busca achou o lead");

  // ===== T3: parciais incrementais + timeout preserva parciais =========
  downloads.length = 0;
  sendCmd("start", { cidades: ["CidadeC"], principais: [], termos: ["x"], modo: "continuo", acumular: false });
  await wait(40);
  let tabId = abaDeTrabalhoUnica();
  updatedListeners.forEach(f => f(tabId, { status: "complete" }));
  await wait(30);
  contentMessage(tabId, { tipo: "extracao_parcial", leads: [{ nome: "Parcial 1", telefone: "" }, { nome: "Parcial 2", telefone: "" }] });
  await wait(30);
  assert(storage.leads.length === 2, "T3: parcial mesclado durante o scroll");
  assert(!!alarms["extractionTimeout"], "T3: parcial estende o prazo de extracao");
  await fireAlarm("extractionTimeout"); // timeout depois do parcial
  await wait(80);
  assert(storage.leads.length === 2, "T3: timeout NAO perdeu os leads parciais");
  assert(storage.estado.falhas.length === 1, "T3: timeout registrado no painel de falhas");
  for (let i = 0; i < 2; i++) await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T3: fila seguiu apos timeout");

  // ===== T4: repetir falhas re-enfileira a cidade acumulando ===========
  downloads.length = 0;
  sendCmd("retry_failures", {});
  await wait(40);
  assert(storage.estado.status === "running", "T4: retry_failures reiniciou");
  assert(storage.estado.filaCidades.length === 1 && storage.estado.filaCidades[0] === "CidadeC",
    "T4: apenas a cidade com falha re-enfileirada");
  assert(storage.leads.length === 2, "T4: leads anteriores preservados (acumular)");
  await processarTarefa([{ nome: "Parcial 1", telefone: "(48) 3333-1111" }]);
  assert(storage.leads.length === 2, "T4: dedup acumulada nao duplicou lead antigo");
  assert(storage.leads.find(l => l.nome === "Parcial 1").telefone === "(48) 3333-1111",
    "T4: retry enriqueceu telefone do lead antigo");
  await processarTarefa([]);
  await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T4: retry concluido");

  // ===== T5: modo blocos com tamanho configuravel ======================
  downloads.length = 0;
  storage.config.tamanhoBloco = 2;
  sendCmd("start", { cidades: ["B1", "B2", "B3"], principais: [], termos: ["x"], modo: "blocos", acumular: false });
  await wait(40);
  for (let c = 0; c < 2; c++) {
    for (let p = 0; p < 3; p++) {
      await processarTarefa(p === 0 ? [{ nome: "Lead B" + c, telefone: "" }] : []);
    }
  }
  await wait(40);
  assert(storage.estado.status === "waiting_block", "T5: waiting_block apos 2 cidades (config)");
  assert(downloads.some(d => d.filename.includes("_bloco1.csv")), "T5: CSV parcial bloco1");
  assert(notificacoes.some(n => n.title === "Bloco concluído"), "T5: notificacao de bloco");
  sendCmd("resume", {});
  await wait(60);
  for (let p = 0; p < 3; p++) await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T5: done apos resume");
  storage.config.tamanhoBloco = 5;

  // ===== T6: export_now nao interrompe; bloqueio pausa e notifica ======
  downloads.length = 0;
  sendCmd("start", { cidades: ["D1"], principais: [], termos: ["x"], modo: "continuo", acumular: false });
  await wait(40);
  sendCmd("export_now", {});
  await wait(30);
  assert(downloads.some(d => d.filename.includes("_parcial_")), "T6: export_now baixa parcial sem parar");
  assert(storage.estado.status === "running", "T6: continua rodando apos export_now");

  tabId = abaDeTrabalhoUnica();
  updatedListeners.forEach(f => f(tabId, { status: "complete" }));
  await wait(30);
  contentMessage(tabId, { tipo: "bloqueio_detectado" });
  await wait(40);
  assert(storage.estado.status === "paused", "T6: bloqueio pausa");
  assert(notificacoes.some(n => n.title === "Verificação necessária"), "T6: notificacao de bloqueio");
  const idxAntes = storage.estado.pontoAtualIndex;
  sendCmd("resume", {});
  await wait(60);
  assert(storage.estado.pontoAtualIndex === idxAntes, "T6: retomada repete o MESMO ponto bloqueado");
  assert(abaDeTrabalhoUnica() !== null, "T6: nova aba na retomada");
  sendCmd("stop_export", {});
  await wait(40);
  assert(storage.estado.status === "idle", "T6: stop_export -> idle");

  // ===== T7: reinicio do navegador pausa (autoRetomar desligado) =======
  downloads.length = 0;
  sendCmd("start", { cidades: ["E1"], principais: [], termos: ["x"], modo: "continuo", acumular: false });
  await wait(40);
  for (const f of startupListeners) await f();
  await wait(30);
  assert(storage.estado.status === "paused", "T7: onStartup pausa varredura em andamento");
  assert(storage.estado.log.some(l => l.includes("Navegador reiniciado")), "T7: log explica a pausa");
  sendCmd("stop_export", {});
  await wait(40);

  // ===== T8: dedup preserva homonimos com placeIds diferentes ==========
  downloads.length = 0;
  sendCmd("start", { cidades: ["F1"], principais: [], termos: ["x"], modo: "continuo", acumular: false });
  await wait(40);
  await processarTarefa([
    { nome: "Bicicletaria Central", telefone: "", placeId: "0xaa:0x111" },
    { nome: "Bicicletaria Central", telefone: "", placeId: "0xbb:0x222" }
  ]);
  assert(storage.leads.length === 2, "T8: homonimos com placeIds diferentes NAO sao mesclados");
  await processarTarefa([{ nome: "Bicicletaria Central", telefone: "(47) 3333-9999", placeId: "0xaa:0x111" }]);
  const comFone = storage.leads.filter(l => l.telefone).length;
  assert(storage.leads.length === 2 && comFone === 1, "T8: telefone foi para o placeId certo");
  await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T8: done");

  // ===== T9: watchdog respeita transicao pendente e resgata fase travada =
  downloads.length = 0;
  sendCmd("start", { cidades: ["G1"], principais: [], termos: ["x"], modo: "continuo", acumular: false });
  await wait(40);
  tabId = abaDeTrabalhoUnica();
  // trava a fase artificialmente no passado
  storage.estado.faseTimestamp = Date.now() - 10 * 60 * 1000;
  await fireAlarm("watchdog");
  await wait(60);
  assert(storage.estado.falhas.some(f => f.motivo.includes("travada")), "T9: watchdog resgatou fase travada como falha");
  assert(Object.keys(tabs).length <= 1, "T9: aba antiga fechada no resgate");
  // deixa terminar
  for (let p = 0; p < 2; p++) await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T9: fila terminou apos resgate");

  // ===== T16: FASE 4 — item internacional gera URL "cidade, estado, pais",
  // ===== coluna Estado/Pais no CSV e telefone com DDI do pais ============
  downloads.length = 0;
  sendCmd("start", {
    cidades: [{ nome: "Los Angeles", estado: "California", pais: "US", paisBusca: "United States", pontos: 3, ddi: "1", tamanhos: [10], tronco: "" }],
    termos: ["coffee shop"], modo: "continuo", acumular: false
  });
  await wait(40);
  assert(storage.estado.contadores.totalTarefas === 3, "T16: cidade internacional tem 3 pontos");
  let u = await processarTarefa([{ nome: "Blue Bottle", telefone: "(213) 555-0142", placeId: "0xus:0x01" }], { centro: null });
  assert(u.includes(encodeURIComponent("coffee shop Los Angeles, California, United States")), "T16: URL textual com cidade, estado, pais");
  assert(u.includes("hl=pt-BR"), "T16: mantem hl=pt-BR mesmo fora do Brasil");
  await processarTarefa([]); await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T16: done");
  assert(storage.leads[0].pais === "US" && storage.leads[0].estado === "California", "T16: lead carrega pais e estado");
  assert(storage.leads[0].telefoneNormalizado === "12135550142", "T16: telefone normalizado com DDI 1");
  const csv16 = decodificarCSV(downloads[0]);
  // Estado/Pais entram DEPOIS das colunas legadas (compatibilidade do cabeçalho);
  // as colunas de enriquecimento por IA vêm em seguida.
  const colunas16 = csv16.trim().split("\r\n")[0].split(";");
  assert(colunas16.indexOf("Estado") === colunas16.indexOf("DataColeta") + 1 &&
         colunas16.indexOf("Pais") === colunas16.indexOf("Estado") + 1,
    "T16: CSV ganha colunas Estado;Pais logo apos as legadas");
  assert(/^leads_coffee-shop_california_/.test(downloads[0].filename), "T16: nome de arquivo usa o estado unico");

  // ===== T17: homonimos entre estados/paises NAO se fundem sem telefone ===
  downloads.length = 0;
  sendCmd("start", {
    cidades: [
      { nome: "Springfield", estado: "Illinois", pais: "US", paisBusca: "United States", pontos: 3, ddi: "1", tamanhos: [10], tronco: "" },
      { nome: "Springfield", estado: "Missouri", pais: "US", paisBusca: "United States", pontos: 3, ddi: "1", tamanhos: [10], tronco: "" }
    ],
    termos: ["x"], modo: "continuo", acumular: false
  });
  await wait(40);
  // Illinois (ordem alfabetica < Missouri): 3 pontos, mesma "Padaria" sem fone
  for (let p = 0; p < 3; p++) await processarTarefa([{ nome: "Padaria Central", telefone: "" }], { centro: null });
  for (let p = 0; p < 3; p++) await processarTarefa([{ nome: "Padaria Central", telefone: "" }], { centro: null });
  await wait(40);
  assert(storage.leads.length === 2, "T17: mesma cidade/nome em estados diferentes = 2 leads (escopo por estado)");

  // ===== T18: ZIP+4 dos EUA NAO vira telefone (validacao por tamanho) =====
  downloads.length = 0;
  sendCmd("start", {
    cidades: [{ nome: "Austin", estado: "Texas", pais: "US", paisBusca: "United States", pontos: 3, ddi: "1", tamanhos: [10], tronco: "" }],
    termos: ["x"], modo: "continuo", acumular: false
  });
  await wait(40);
  await processarTarefa([{ nome: "Loja ZIP", telefone: "78701-1234", placeId: "0xtx:0x1" }], { centro: null });
  await processarTarefa([]); await processarTarefa([]);
  await wait(40);
  assert(storage.leads[0].telefoneNormalizado === "", "T18: ZIP+4 (9 digitos) nao vira telefone valido nos EUA");
  assert(storage.leads[0].whatsapp === "", "T18: sem WhatsApp para numero invalido");

  // ===== T20: coordenadas reais ancoram TODA busca por viewport (precisão) =
  // O ponto Centro deixa de ser busca textual larga e passa a viewport fechado
  // no lat/lng real da cidade; os demais pontos deslocam a partir dele.
  downloads.length = 0;
  sendCmd("start", {
    cidades: [{ nome: "San Diego", estado: "California", pais: "US", paisBusca: "United States",
                pontos: 3, lat: 32.7157, lng: -117.1611, ddi: "1", tamanhos: [10], tronco: "" }],
    termos: ["dispensary"], modo: "continuo", acumular: false
  });
  await wait(40);
  // ponto Centro: viewport ancorado nas coords reais, SEM busca textual larga
  let uc = await processarTarefa([{ nome: "Green Co", telefone: "", placeId: "0xsd:0x1" }], { centro: null });
  assert(uc.includes("/@32.715700,-117.161100,14z"), "T20: Centro ancorado nas coordenadas reais (viewport fechado)");
  assert(uc.includes(encodeURIComponent("San Diego, California, United States")),
    "T20: Centro ancorado MANTEM o qualificador da cidade no texto (anti-vies)");
  // ponto Norte: desloca +0.03 de latitude a partir do centro real
  uc = await processarTarefa([]);
  assert(uc.includes("/@32.745700,-117.161100,14z"), "T20: Norte desloca do centro real");
  await processarTarefa([]); // ponto Sul, encerra a cidade
  await wait(40);
  assert(storage.estado.status === "done", "T20: varredura concluida");

  // ===== T21: "Repetir falhas" preserva contexto internacional e coords ==
  // Sem o meta salvo na falha, a cidade voltaria como busca textual BR
  // ("termo cidade SC") — regressão direta da precisão geográfica.
  downloads.length = 0;
  sendCmd("start", {
    cidades: [{ nome: "Lyon", estado: "Auvergne-Rhone-Alpes", pais: "FR", paisBusca: "France",
                pontos: 3, lat: 45.7578, lng: 4.832, ddi: "33", tamanhos: [9], tronco: "0" }],
    termos: ["boulangerie"], modo: "continuo", acumular: false
  });
  await wait(40);
  let u21 = await processarTarefa([{ nome: "Pain Dore", telefone: "", placeId: "0xfr:0x1" }]);
  assert(u21.includes("/@45.757800,4.832000,14z"), "T21: Centro internacional ancorado nas coords reais");
  await processarTarefa(null, { timeout: true }); // Norte falha por timeout
  await processarTarefa([]);                      // Sul
  await wait(40);
  assert(storage.estado.status === "done", "T21: varredura concluiu com 1 falha");
  assert(storage.estado.falhas.length === 1 && storage.estado.falhas[0].meta &&
    storage.estado.falhas[0].meta.pais === "FR" && storage.estado.falhas[0].meta.lat === 45.7578,
    "T21: falha guarda meta completo (pais + coordenadas)");
  sendCmd("retry_failures", {});
  await wait(40);
  assert(storage.estado.status === "running", "T21: retry reiniciou");
  assert(storage.estado.filaMeta[0].pais === "FR" && storage.estado.filaMeta[0].lat === 45.7578,
    "T21: retry re-enfileira com pais e coords preservados");
  u21 = await processarTarefa([]);
  assert(u21.includes("/@45.757800,4.832000,14z"), "T21: retry volta ANCORADO (nao textual BR)");
  await processarTarefa([]); await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T21: retry concluiu");

  // ===== T22: raio da cidade descarta leads que o Google trouxe de longe ==
  // Cenário real: Tubarão tem ~8 lojas do nicho; o Google enche a lista com
  // lojas de Balneário Camboriú (~170 km). O filtro de raio corta o excesso.
  downloads.length = 0;
  sendCmd("start", {
    cidades: [{ nome: "Tubarão", estado: "SC", pais: "BR", paisBusca: "Brasil",
                pontos: 3, lat: -28.4713, lng: -49.0144, ddi: "55", tamanhos: [10, 11], tronco: "0" }],
    termos: ["scooter"], modo: "continuo", acumular: false
  });
  await wait(40);
  await processarTarefa([
    { nome: "Loja Local", telefone: "", placeId: "0xtb:0x1", lat: "-28.4751", lng: "-48.9950" },   // ~2 km
    { nome: "Loja Vizinha", telefone: "", placeId: "0xtb:0x2", lat: "-28.4200", lng: "-48.9500" }, // ~8 km
    { nome: "Loja BC", telefone: "", placeId: "0xtb:0x3", lat: "-26.9801", lng: "-48.6405" }       // ~170 km
  ]);
  assert(storage.leads.length === 2, "T22: lead a 170 km descartado pelo raio da cidade");
  assert(!storage.leads.some(l => l.nome === "Loja BC"), "T22: lead distante nao entrou no CSV");
  assert(storage.estado.log.some(l => l.includes("fora do raio")), "T22: descarte registrado no log");
  await processarTarefa([]); await processarTarefa([]);
  await wait(40);
  assert(storage.estado.status === "done", "T22: varredura concluida");

  // raioCidadeKm: 0 desliga o filtro
  storage.config = storage.config || {};
  storage.config.raioCidadeKm = 0;
  downloads.length = 0;
  sendCmd("start", {
    cidades: [{ nome: "Tubarão", estado: "SC", pais: "BR", paisBusca: "Brasil",
                pontos: 3, lat: -28.4713, lng: -49.0144, ddi: "55", tamanhos: [10, 11], tronco: "0" }],
    termos: ["scooter"], modo: "continuo", acumular: false
  });
  await wait(40);
  await processarTarefa([{ nome: "Loja BC2", telefone: "", placeId: "0xtb:0x9", lat: "-26.98", lng: "-48.64" }]);
  assert(storage.leads.some(l => l.nome === "Loja BC2"), "T22: raio 0 desliga o filtro");
  await processarTarefa([]); await processarTarefa([]);
  await wait(40);
  delete storage.config.raioCidadeKm;

  // ===== T19: reset zera leads, dedup e estado (nova busca do zero) ======
  downloads.length = 0;
  sendCmd("start", { cidades: ["Z1"], principais: [], termos: ["x"], modo: "continuo", acumular: false });
  await wait(40);
  await processarTarefa([{ nome: "Loja Z", telefone: "(47) 3333-1111", placeId: "0xz:0x1" }], { centro: null });
  assert(storage.leads.length >= 1, "T19: há leads antes do reset");
  sendCmd("reset", {});
  await wait(40);
  assert(storage.leads.length === 0, "T19: reset apagou os leads");
  assert(storage.estado.status === "idle", "T19: reset volta ao estado ocioso");
  assert(storage.estado.contadores.leadsUnicos === 0 && storage.estado.contadores.totalTarefas === 0, "T19: contadores zerados");
  assert(downloads.length === 0, "T19: reset NÃO exporta (descarte deliberado)");
  assert(Object.keys(tabs).length === 0, "T19: aba de trabalho fechada no reset");

  console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : "\n" + falhas + " TESTE(S) FALHARAM");
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error("ERRO NO HARNESS:", e); process.exit(1); });
