// =====================================================================
// Apex Leads Extractor — popup.js
// Seleção geográfica em três passos: país -> estado/província -> cidades.
// Os dados vêm de data/paises/: index.js (índice leve, sempre carregado) e
// <iso2>.json (carregado sob demanda e cacheado — nunca todos de uma vez).
// =====================================================================

let elementos = {};
let timerPrefs = null;

function normalizarBusca(texto) {
  return (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function iniciarElementos() {
  elementos = {
    termosBusca: document.getElementById("termosBusca"),
    flagsGrid: document.getElementById("flagsGrid"),
    cardEstado: document.getElementById("cardEstado"),
    selectEstado: document.getElementById("selectEstado"),
    cardCidades: document.getElementById("cardCidades"),
    tituloCidades: document.getElementById("tituloCidades"),
    filtroCidades: document.getElementById("filtroCidades"),
    marcarEstadoInteiro: document.getElementById("marcarEstadoInteiro"),
    limparEstado: document.getElementById("limparEstado"),
    subPrincipais: document.getElementById("subPrincipais"),
    listaCidades: document.getElementById("listaCidades"),
    selectionCounter: document.getElementById("selectionCounter"),
    chkAcumular: document.getElementById("chkAcumular"),
    btnIniciar: document.getElementById("btnIniciar"),
    btnPausar: document.getElementById("btnPausar"),
    btnParar: document.getElementById("btnParar"),
    btnExportarAgora: document.getElementById("btnExportarAgora"),
    btnRepetirFalhas: document.getElementById("btnRepetirFalhas"),
    btnNovaBusca: document.getElementById("btnNovaBusca"),
    btnAbrirResultados: document.getElementById("btnAbrirResultados"),
    btnAbrirOpcoes: document.getElementById("btnAbrirOpcoes"),
    statusLine: document.getElementById("statusLine"),
    progressBarInner: document.getElementById("progressBarInner"),
    counterLeads: document.getElementById("counterLeads"),
    counterTarefas: document.getElementById("counterTarefas"),
    counterCidades: document.getElementById("counterCidades"),
    counterFalhas: document.getElementById("counterFalhas"),
    etaLine: document.getElementById("etaLine"),
    logArea: document.getElementById("logArea")
  };
}

function aplicarFiltro(container, texto) {
  const termo = normalizarBusca(texto);
  container.querySelectorAll(".checkbox-row").forEach(row => {
    row.classList.toggle("oculta", termo !== "" && !row.dataset.busca.includes(termo));
  });
}

// =====================================================================
// Seleção geográfica: dados por país (lazy-load), seleção em memória por
// estado. O índice PAISES_INDEX vem de data/paises/index.js.
// =====================================================================
const cachePais = new Map();     // iso2 -> dados do JSON do país
const selecao = new Map();       // "iso2|estado" -> Set(nomes de cidade)
let paisAtivo = null;
let estadoAtivo = null;

const LIMIAR_5_PONTOS = 50000;
const LIMIAR_9_PONTOS = 500000;
function pontosPorPop(pop) {
  if (pop >= LIMIAR_9_PONTOS) return 9;
  if (pop >= LIMIAR_5_PONTOS) return 5;
  return 3;
}

function chaveSelecao(iso2, estado) { return iso2 + "|" + estado; }

async function carregarPais(iso2) {
  if (cachePais.has(iso2)) return cachePais.get(iso2);
  const resp = await fetch(chrome.runtime.getURL("data/paises/" + iso2 + ".json"));
  const dados = await resp.json();
  cachePais.set(iso2, dados);
  return dados;
}

function renderFlags() {
  elementos.flagsGrid.innerHTML = "";
  (typeof PAISES_INDEX !== "undefined" ? PAISES_INDEX : []).forEach(p => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "flag-btn";
    btn.dataset.iso2 = p.iso2;
    const img = document.createElement("img");
    img.src = p.bandeira;
    img.alt = p.nome;
    const span = document.createElement("span");
    span.textContent = p.nome;
    btn.appendChild(img);
    btn.appendChild(span);
    btn.addEventListener("click", () => selecionarPais(p.iso2));
    elementos.flagsGrid.appendChild(btn);
  });
}

// Troca o país e popula o seletor de estados. "estadoDesejado" é usado só na
// restauração das prefs, para o popup reabrir exatamente onde o usuário parou.
async function selecionarPais(iso2, estadoDesejado) {
  paisAtivo = iso2;
  estadoAtivo = null;
  document.querySelectorAll(".flag-btn").forEach(b => b.classList.toggle("ativa", b.dataset.iso2 === iso2));
  let dados;
  try {
    dados = await carregarPais(iso2);
  } catch (e) {
    elementos.selectEstado.innerHTML = "";
    return;
  }
  const estados = Object.keys(dados.estados).sort((a, b) => a.localeCompare(b, "pt-BR"));
  elementos.selectEstado.innerHTML = "";
  const op0 = document.createElement("option");
  op0.value = ""; op0.textContent = "— selecione o estado —";
  elementos.selectEstado.appendChild(op0);
  estados.forEach(e => {
    const op = document.createElement("option");
    op.value = e;
    op.textContent = dados.estados[e];
    elementos.selectEstado.appendChild(op);
  });
  elementos.cardEstado.hidden = false;
  elementos.cardCidades.hidden = true;
  if (estadoDesejado && estados.includes(estadoDesejado)) {
    elementos.selectEstado.value = estadoDesejado;
    selecionarEstado(estadoDesejado);
  }
  agendarSalvarPrefs();
}

function selecionarEstado(estado) {
  estadoAtivo = estado;
  if (!estado) { elementos.cardCidades.hidden = true; return; }
  renderCidades();
  elementos.cardCidades.hidden = false;
  agendarSalvarPrefs();
}

function renderCidades() {
  const dados = cachePais.get(paisAtivo);
  const lista = (dados && dados.cidades[estadoAtivo]) || []; // [[nome,pop,lat,lng]] pop DESC
  const principais = lista.slice(0, 30);                     // maiores primeiro
  const demais = lista.slice(30).slice().sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  const chave = chaveSelecao(paisAtivo, estadoAtivo);
  const marcadas = selecao.get(chave) || new Set();

  const nomeEstado = (dados && dados.estados[estadoAtivo]) || estadoAtivo;
  elementos.tituloCidades.textContent = `3. Cidades — ${nomeEstado}`;
  elementos.subPrincipais.textContent = principais.length
    ? `Principais (${principais.length}) primeiro; depois ${demais.length} demais.`
    : "";
  elementos.listaCidades.innerHTML = "";
  const ordem = principais.concat(demais);
  ordem.forEach(([nome], idx) => {
    const row = document.createElement("label");
    row.className = "checkbox-row";
    row.dataset.busca = normalizarBusca(nome);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = nome;
    input.id = "cidade_" + idx;
    input.checked = marcadas.has(nome);
    input.addEventListener("change", () => {
      const set = selecao.get(chave) || new Set();
      if (input.checked) set.add(nome); else set.delete(nome);
      if (set.size) selecao.set(chave, set); else selecao.delete(chave);
      atualizarContadorSelecao();
      agendarSalvarPrefs();
    });
    const span = document.createElement("span");
    span.textContent = idx < principais.length ? `${nome} ★` : nome;
    row.appendChild(input);
    row.appendChild(span);
    elementos.listaCidades.appendChild(row);
  });
  aplicarFiltro(elementos.listaCidades, elementos.filtroCidades.value);
}

function marcarEstadoInteiro() {
  const dados = cachePais.get(paisAtivo);
  const lista = (dados && dados.cidades[estadoAtivo]) || [];
  if (!lista.length) return;
  selecao.set(chaveSelecao(paisAtivo, estadoAtivo), new Set(lista.map(c => c[0])));
  elementos.listaCidades.querySelectorAll("input[type=checkbox]").forEach(el => { el.checked = true; });
  atualizarContadorSelecao();
  agendarSalvarPrefs();
}

// Limpa TODA a seleção do estado atual (não só a parte visível/filtrada), para
// combinar com "Marcar estado inteiro".
function limparEstadoTodo() {
  if (!paisAtivo || !estadoAtivo) return;
  selecao.delete(chaveSelecao(paisAtivo, estadoAtivo));
  elementos.listaCidades.querySelectorAll("input[type=checkbox]").forEach(el => { el.checked = false; });
  atualizarContadorSelecao();
  agendarSalvarPrefs();
}

function totalSelecionadas() {
  let n = 0;
  selecao.forEach(set => { n += set.size; });
  return n;
}

// Zera toda a seleção da UI. Usado pelo botão "Nova busca". Mantém os termos
// de busca (o usuário normalmente só troca a região).
function limparSelecaoUI() {
  elementos.listaCidades.querySelectorAll("input[type=checkbox]").forEach(el => { el.checked = false; });
  selecao.clear();
  atualizarContadorSelecao();
  salvarPrefs();
}

// Constrói o payload de cidades ({nome, estado, pais, ...}) carregando sob
// demanda os países selecionados ainda não cacheados — necessário para ler
// população (tier de pontos), coordenadas e metadados de telefone.
async function construirPayloadCidades() {
  const itens = [];
  for (const [chave, set] of selecao) {
    const [iso2, estado] = chave.split("|");
    let dados;
    try { dados = await carregarPais(iso2); } catch (e) { continue; }
    // índice por nome -> [pop, lat, lng] para tier e ancoragem geográfica
    const infoPorNome = new Map((dados.cidades[estado] || []).map(c => [c[0], [c[1], c[2], c[3]]]));
    set.forEach(nome => {
      const info = infoPorNome.get(nome) || [0, "", ""];
      itens.push({
        nome, estado, pais: iso2, paisBusca: dados.nomeBusca,
        pontos: pontosPorPop(info[0] || 0),
        lat: info[1], lng: info[2],   // coords reais -> busca ancorada e precisa
        ddi: dados.ddi, tamanhos: dados.telefone.tamanhos, tronco: dados.telefone.tronco
      });
    });
  }
  return itens;
}

function getTermos() {
  const linhas = (elementos.termosBusca.value || "").split("\n").map(t => t.trim()).filter(Boolean);
  return [...new Set(linhas)];
}

function atualizarContadorSelecao() {
  elementos.selectionCounter.textContent = totalSelecionadas() + " cidades selecionadas";
}

function configurarEntradas() {
  elementos.termosBusca.addEventListener("input", agendarSalvarPrefs);
  elementos.chkAcumular.addEventListener("change", agendarSalvarPrefs);
  document.querySelectorAll('input[name="modoExecucao"]').forEach(el => {
    el.addEventListener("change", agendarSalvarPrefs);
  });
}

// -------------------- persistência da seleção (uiPrefs) --------------------

function agendarSalvarPrefs() {
  clearTimeout(timerPrefs);
  timerPrefs = setTimeout(salvarPrefs, 300);
}

function salvarPrefs() {
  const sel = {};
  selecao.forEach((set, chave) => { sel[chave] = [...set]; });
  const prefs = {
    termos: elementos.termosBusca.value,
    modo: (document.querySelector('input[name="modoExecucao"]:checked') || {}).value || "blocos",
    acumular: elementos.chkAcumular.checked,
    paisAtivo: paisAtivo,
    estadoAtivo: estadoAtivo,
    selecao: sel
  };
  chrome.storage.local.set({ uiPrefs: prefs });
}

function aplicarPrefs(prefs) {
  if (!prefs) return;
  if (typeof prefs.termos === "string" && prefs.termos.trim()) {
    elementos.termosBusca.value = prefs.termos;
  }
  if (prefs.modo) {
    const radio = document.querySelector(`input[name="modoExecucao"][value="${prefs.modo}"]`);
    if (radio) radio.checked = true;
  }
  elementos.chkAcumular.checked = !!prefs.acumular;

  // restaura a seleção (só nomes; os dados do país carregam sob demanda)
  selecao.clear();
  if (prefs.selecao && typeof prefs.selecao === "object") {
    Object.keys(prefs.selecao).forEach(chave => {
      const arr = prefs.selecao[chave];
      if (Array.isArray(arr) && arr.length) selecao.set(chave, new Set(arr));
    });
  }
  if (prefs.paisAtivo) selecionarPais(prefs.paisAtivo, prefs.estadoAtivo);
  atualizarContadorSelecao();
}

// ------------------------------ comandos ------------------------------

function configurarBotoesControle() {
  elementos.btnIniciar.addEventListener("click", async () => {
    const termos = getTermos();
    if (!termos.length) {
      elementos.statusLine.textContent = "Informe pelo menos um termo de busca.";
      return;
    }
    const modo = document.querySelector('input[name="modoExecucao"]:checked').value;
    elementos.statusLine.textContent = "Preparando lista de cidades...";
    const cidades = await construirPayloadCidades();
    if (!cidades.length) {
      elementos.statusLine.textContent = "Selecione pelo menos uma cidade antes de iniciar.";
      return;
    }

    salvarPrefs();
    chrome.runtime.sendMessage({
      cmd: "start",
      cidades: cidades,          // objetos {nome, estado, pais, paisBusca, pontos, ...}
      termos: termos,
      modo: modo,
      acumular: elementos.chkAcumular.checked
    });
  });

  elementos.btnPausar.addEventListener("click", () => {
    const acao = elementos.btnPausar.dataset.acao || "pause";
    chrome.runtime.sendMessage({ cmd: acao });
  });

  elementos.btnParar.addEventListener("click", () => {
    chrome.runtime.sendMessage({ cmd: "stop_export" });
  });

  elementos.btnExportarAgora.addEventListener("click", () => {
    chrome.runtime.sendMessage({ cmd: "export_now" });
  });

  elementos.btnRepetirFalhas.addEventListener("click", () => {
    chrome.runtime.sendMessage({ cmd: "retry_failures" });
  });

  // "Nova busca (zerar tudo)": clique duplo para confirmar (sem diálogo nativo,
  // que travaria o event loop da extensão). Descarta leads e zera a seleção.
  let resetArmado = false;
  let resetTimer = null;
  elementos.btnNovaBusca.addEventListener("click", () => {
    if (!resetArmado) {
      resetArmado = true;
      elementos.btnNovaBusca.textContent = "Confirmar? (apaga os leads)";
      elementos.btnNovaBusca.classList.add("armado");
      resetTimer = setTimeout(() => {
        resetArmado = false;
        elementos.btnNovaBusca.textContent = "Nova busca (zerar tudo)";
        elementos.btnNovaBusca.classList.remove("armado");
      }, 3500);
      return;
    }
    clearTimeout(resetTimer);
    resetArmado = false;
    elementos.btnNovaBusca.textContent = "Nova busca (zerar tudo)";
    elementos.btnNovaBusca.classList.remove("armado");
    chrome.runtime.sendMessage({ cmd: "reset" });
    limparSelecaoUI();
    elementos.statusLine.textContent = "Tudo zerado. Faça uma nova seleção e clique em Iniciar.";
  });

  elementos.btnAbrirResultados.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("resultados.html") });
  });

  elementos.btnAbrirOpcoes.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

// ------------------------------ dashboard ------------------------------

function formatarEta(ms) {
  if (!ms || ms <= 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "≈ menos de 1 min restante";
  if (min < 60) return `≈ ${min} min restantes`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `≈ ${h}h ${m}min restantes`;
}

function formatarStatusLinha(estado) {
  if (!estado) return "Ocioso.";
  switch (estado.status) {
    case "idle":
      return "Ocioso.";
    case "running": {
      const fila = estado.filaCidades || [];
      const idx = Math.min(estado.cidadeAtualIndex || 0, Math.max(0, fila.length - 1));
      const cidade = estado.cidadeAtual || fila[idx] || "-";
      if (estado.emFichas) {
        return `Enriquecendo fichas em ${cidade} (${(estado.fichasPendentes || []).length} restante(s))...`;
      }
      const termoInfo = (estado.termos || []).length > 1 && estado.termoAtual ? ` — "${estado.termoAtual}"` : "";
      return `Varrendo ${cidade} (${idx + 1}/${fila.length}) — Ponto ${estado.quadranteAtual || "-"}${termoInfo}...`;
    }
    case "paused":
      return "Pausado. Clique em Continuar para retomar.";
    case "waiting_block":
      return "Bloco concluído. CSV parcial exportado. Clique em Continuar para prosseguir.";
    case "done":
      return "Varredura concluída. CSV final exportado.";
    default:
      return "Ocioso.";
  }
}

function aplicarEstadoNaUI(estado) {
  if (!estado || !estado.status) {
    elementos.statusLine.textContent = "Ocioso.";
    elementos.progressBarInner.style.width = "0%";
    elementos.counterLeads.textContent = "Leads únicos: 0";
    elementos.counterTarefas.textContent = "Buscas: 0/0";
    elementos.counterCidades.textContent = "Cidades concluídas: 0/0";
    elementos.counterFalhas.textContent = "";
    elementos.etaLine.textContent = "";
    elementos.logArea.innerHTML = "";
    elementos.btnIniciar.disabled = false;
    elementos.btnPausar.disabled = true;
    elementos.btnParar.disabled = true;
    elementos.btnExportarAgora.disabled = true;
    elementos.btnRepetirFalhas.hidden = true;
    return;
  }

  elementos.statusLine.textContent = formatarStatusLinha(estado);

  const c = estado.contadores || {};
  const totalTarefas = c.totalTarefas || 0;
  const tarefas = c.tarefasConcluidas || 0;
  const pct = totalTarefas > 0 ? Math.min(100, Math.round((tarefas / totalTarefas) * 100)) : 0;

  elementos.progressBarInner.style.width = pct + "%";
  elementos.counterLeads.textContent = "Leads únicos: " + (c.leadsUnicos || 0);
  elementos.counterTarefas.textContent = `Buscas: ${tarefas}/${totalTarefas}`;
  elementos.counterCidades.textContent = `Cidades concluídas: ${c.cidadesConcluidas || 0}/${c.totalCidades || 0}`;

  if (c.falhas > 0) {
    elementos.counterFalhas.textContent = `Falhas: ${c.falhas}`;
    elementos.counterFalhas.className = "falhas-alerta";
  } else {
    elementos.counterFalhas.textContent = "";
    elementos.counterFalhas.className = "";
  }

  if (estado.status === "running" && estado.mediaMsPorTarefa && totalTarefas > tarefas) {
    elementos.etaLine.textContent = formatarEta((totalTarefas - tarefas) * estado.mediaMsPorTarefa);
  } else {
    elementos.etaLine.textContent = "";
  }

  elementos.logArea.innerHTML = "";
  (estado.log || []).slice(-10).forEach(msg => {
    const div = document.createElement("div");
    div.className = "log-line";
    div.textContent = msg;
    elementos.logArea.appendChild(div);
  });
  elementos.logArea.scrollTop = elementos.logArea.scrollHeight;

  const rodando = estado.status === "running" || estado.status === "paused" || estado.status === "waiting_block";
  if (rodando) {
    if (estado.termos && estado.termos.length) {
      elementos.termosBusca.value = estado.termos.join("\n");
    }
    if (estado.modo) {
      const radio = document.querySelector(`input[name="modoExecucao"][value="${estado.modo}"]`);
      if (radio) radio.checked = true;
    }
  }

  const temLeads = (estado.contadores && estado.contadores.leadsUnicos > 0);
  const temFalhas = (estado.contadores && estado.contadores.falhas > 0);

  switch (estado.status) {
    case "idle":
    case "done":
      elementos.btnIniciar.disabled = false;
      elementos.btnPausar.disabled = true;
      elementos.btnPausar.textContent = "Pausar";
      elementos.btnPausar.dataset.acao = "pause";
      elementos.btnParar.disabled = !temLeads;
      elementos.btnExportarAgora.disabled = !temLeads;
      elementos.btnRepetirFalhas.hidden = !temFalhas;
      if (temFalhas) {
        elementos.btnRepetirFalhas.textContent = `Repetir falhas (${estado.contadores.falhas})`;
      }
      break;
    case "running":
      elementos.btnIniciar.disabled = true;
      elementos.btnPausar.disabled = false;
      elementos.btnPausar.textContent = "Pausar";
      elementos.btnPausar.dataset.acao = "pause";
      elementos.btnParar.disabled = false;
      elementos.btnExportarAgora.disabled = false;
      elementos.btnRepetirFalhas.hidden = true;
      break;
    case "paused":
    case "waiting_block":
      elementos.btnIniciar.disabled = true;
      elementos.btnPausar.disabled = false;
      elementos.btnPausar.textContent = "Continuar";
      elementos.btnPausar.dataset.acao = "resume";
      elementos.btnParar.disabled = false;
      elementos.btnExportarAgora.disabled = false;
      elementos.btnRepetirFalhas.hidden = true;
      break;
    default:
      elementos.btnIniciar.disabled = false;
      elementos.btnPausar.disabled = true;
      elementos.btnParar.disabled = true;
      elementos.btnExportarAgora.disabled = true;
      elementos.btnRepetirFalhas.hidden = true;
  }
}

function carregarEstadoInicial() {
  chrome.storage.local.get(["estado", "uiPrefs"], dados => {
    aplicarPrefs(dados.uiPrefs);
    aplicarEstadoNaUI(dados.estado || null);
  });
}

function escutarMudancasStorage() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.estado) return;
    aplicarEstadoNaUI(changes.estado.newValue || null);
  });
}

function configurarSeletorGeografico() {
  elementos.selectEstado.addEventListener("change", () => selecionarEstado(elementos.selectEstado.value));
  elementos.filtroCidades.addEventListener("input", () => aplicarFiltro(elementos.listaCidades, elementos.filtroCidades.value));
  elementos.marcarEstadoInteiro.addEventListener("click", marcarEstadoInteiro);
  elementos.limparEstado.addEventListener("click", limparEstadoTodo);
  renderFlags();
}

document.addEventListener("DOMContentLoaded", () => {
  iniciarElementos();
  configurarEntradas();
  configurarSeletorGeografico();
  configurarBotoesControle();
  carregarEstadoInicial();
  escutarMudancasStorage();
});
