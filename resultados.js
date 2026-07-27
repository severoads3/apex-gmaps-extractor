const COLUNAS = [
  { chave: "nome", rotulo: "Nome", quebra: true },
  { chave: "categoria", rotulo: "Categoria", quebra: true },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "whatsapp", rotulo: "WhatsApp", tipo: "link", texto: "abrir" },
  { chave: "site", rotulo: "Site", tipo: "link", texto: "abrir" },
  { chave: "endereco", rotulo: "Endereço", quebra: true },
  { chave: "cidade", rotulo: "Cidade" },
  { chave: "estado", rotulo: "Estado" },
  { chave: "pais", rotulo: "País" },
  { chave: "quadrante", rotulo: "Ponto" },
  { chave: "termo", rotulo: "Termo", quebra: true },
  { chave: "nota", rotulo: "Nota", numerica: true },
  { chave: "avaliacoes", rotulo: "Avaliações", numerica: true },
  { chave: "score", rotulo: "Score", numerica: true },
  { chave: "linkMaps", rotulo: "Maps", tipo: "link", texto: "ficha" },
  { chave: "dataColeta", rotulo: "Data" }
];

let leadsBrutos = [];
let ordenacao = { chave: "score", crescente: false };
let timerRefresh = null;

function somenteDigitos(texto) {
  return texto ? String(texto).replace(/\D/g, "") : "";
}

function linkWhatsapp(telefone) {
  const d = somenteDigitos(telefone);
  if (d.length === 11 && d[2] === "9") return "https://wa.me/55" + d;
  return "";
}

function telefoneNormalizado(telefone) {
  const d = somenteDigitos(telefone);
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  return "55" + d;
}

function numeroDe(valor) {
  const n = parseFloat(String(valor || "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// Score simples de priorização comercial: nota x log(1 + avaliações).
function calcularScore(lead) {
  const nota = numeroDe(lead.nota);
  const avaliacoes = numeroDe(lead.avaliacoes);
  if (!nota) return 0;
  return Math.round(nota * Math.log(1 + avaliacoes) * 10) / 10;
}

function normalizar(texto) {
  return (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function prepararLeads(brutos) {
  return (brutos || []).map(l => Object.assign({}, l, {
    // FASE 4: usa o WhatsApp já calculado com o DDI do país (salvo no lead);
    // leads antigos (sem o campo) caem no cálculo BR.
    whatsapp: l.whatsapp !== undefined && l.whatsapp !== "" ? l.whatsapp : linkWhatsapp(l.telefone),
    score: calcularScore(l)
  }));
}

function preencherFiltros(leads) {
  const selCidade = document.getElementById("filtroCidade");
  const selTermo = document.getElementById("filtroTermo");
  const cidadeAtual = selCidade.value;
  const termoAtual = selTermo.value;

  const cidades = [...new Set(leads.map(l => l.cidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const termos = [...new Set(leads.map(l => l.termo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  selCidade.innerHTML = '<option value="">Todas as cidades</option>';
  cidades.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    selCidade.appendChild(opt);
  });
  selCidade.value = cidades.includes(cidadeAtual) ? cidadeAtual : "";

  selTermo.innerHTML = '<option value="">Todos os termos</option>';
  termos.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    selTermo.appendChild(opt);
  });
  selTermo.value = termos.includes(termoAtual) ? termoAtual : "";
}

function leadsFiltrados() {
  const texto = normalizar(document.getElementById("filtroTexto").value);
  const cidade = document.getElementById("filtroCidade").value;
  const termo = document.getElementById("filtroTermo").value;
  const soTelefone = document.getElementById("soComTelefone").checked;

  return leadsBrutos.filter(l => {
    if (cidade && l.cidade !== cidade) return false;
    if (termo && l.termo !== termo) return false;
    if (soTelefone && !l.telefone) return false;
    if (texto) {
      const alvo = normalizar(`${l.nome} ${l.categoria} ${l.endereco} ${l.telefone}`);
      if (!alvo.includes(texto)) return false;
    }
    return true;
  });
}

function ordenar(leads) {
  const { chave, crescente } = ordenacao;
  const col = COLUNAS.find(c => c.chave === chave) || {};
  const fator = crescente ? 1 : -1;
  return leads.slice().sort((a, b) => {
    if (col.numerica) {
      return (numeroDe(a[chave]) - numeroDe(b[chave])) * fator;
    }
    return String(a[chave] || "").localeCompare(String(b[chave] || ""), "pt-BR") * fator;
  });
}

function renderCabecalho() {
  const linha = document.getElementById("linhaCabecalho");
  linha.innerHTML = "";
  COLUNAS.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.rotulo + " ";
    if (ordenacao.chave === col.chave) {
      const seta = document.createElement("span");
      seta.className = "seta";
      seta.textContent = ordenacao.crescente ? "▲" : "▼";
      th.appendChild(seta);
    }
    th.addEventListener("click", () => {
      if (ordenacao.chave === col.chave) {
        ordenacao.crescente = !ordenacao.crescente;
      } else {
        ordenacao = { chave: col.chave, crescente: !col.numerica };
      }
      renderTabela();
    });
    linha.appendChild(th);
  });
}

function renderTabela() {
  renderCabecalho();
  const corpo = document.getElementById("corpoTabela");
  const filtrados = ordenar(leadsFiltrados());

  corpo.innerHTML = "";
  filtrados.forEach(lead => {
    const tr = document.createElement("tr");
    COLUNAS.forEach(col => {
      const td = document.createElement("td");
      if (col.quebra) td.className = "quebra";
      const valor = lead[col.chave] || "";
      if (col.tipo === "link" && valor) {
        const a = document.createElement("a");
        a.href = valor;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = col.texto;
        td.appendChild(a);
      } else {
        td.textContent = valor;
      }
      tr.appendChild(td);
    });
    corpo.appendChild(tr);
  });

  document.getElementById("mensagemVazio").hidden = leadsBrutos.length > 0;
  document.getElementById("resumo").textContent =
    `Exibindo ${filtrados.length} de ${leadsBrutos.length} lead(s) · ${leadsBrutos.filter(l => l.telefone).length} com telefone`;
}

// ------------------------- exportações -------------------------

function escaparCampoCSV(valor) {
  const str = valor === undefined || valor === null ? "" : String(valor);
  if (/[;"\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function gerarCSV(leads) {
  const cabecalho = [
    "Nome", "Categoria", "Telefone", "Endereco", "Nota", "Avaliacoes", "Cidade", "Quadrante",
    "Termo", "TelefoneNormalizado", "WhatsApp", "Site", "Lat", "Lng", "LinkMaps", "DataColeta",
    "Estado", "Pais"
  ];
  const linhas = [cabecalho.join(";")];
  leads.forEach(l => {
    const foneNorm = l.telefoneNormalizado !== undefined && l.telefoneNormalizado !== "" ? l.telefoneNormalizado : telefoneNormalizado(l.telefone);
    linhas.push([
      l.nome, l.categoria, l.telefone, l.endereco, l.nota, l.avaliacoes, l.cidade, l.quadrante,
      l.termo, foneNorm, l.whatsapp, l.site, l.lat, l.lng, l.linkMaps, l.dataColeta,
      l.estado || "", l.pais || ""
    ].map(escaparCampoCSV).join(";"));
  });
  return "\uFEFF" + linhas.join("\r\n");
}

function gerarTSV(leads) {
  const cabecalho = ["Nome", "Categoria", "Telefone", "WhatsApp", "Site", "Endereco", "Cidade", "Estado", "Pais", "Ponto", "Termo", "Nota", "Avaliacoes", "Score", "LinkMaps"];
  const limpar = v => String(v === undefined || v === null ? "" : v).replace(/[\t\r\n]+/g, " ");
  const linhas = [cabecalho.join("\t")];
  leads.forEach(l => {
    linhas.push([
      l.nome, l.categoria, l.telefone, l.whatsapp, l.site, l.endereco, l.cidade, l.estado || "", l.pais || "",
      l.quadrante, l.termo, l.nota, l.avaliacoes, l.score, l.linkMaps
    ].map(limpar).join("\t"));
  });
  return linhas.join("\n");
}

function configurarAcoes() {
  ["filtroTexto", "filtroCidade", "filtroTermo", "soComTelefone"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", renderTabela);
    el.addEventListener("change", renderTabela);
  });

  document.getElementById("btnCopiarTsv").addEventListener("click", async () => {
    const filtrados = ordenar(leadsFiltrados());
    try {
      await navigator.clipboard.writeText(gerarTSV(filtrados));
      document.getElementById("resumo").textContent = `${filtrados.length} lead(s) copiados — cole direto no Google Sheets/Excel.`;
    } catch (e) {
      document.getElementById("resumo").textContent = "Não foi possível copiar (permissão de área de transferência).";
    }
  });

  document.getElementById("btnExportarCsv").addEventListener("click", () => {
    const filtrados = ordenar(leadsFiltrados());
    const blob = new Blob([gerarCSV(filtrados)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads_filtrados.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  document.getElementById("btnAtualizar").addEventListener("click", carregar);
}

function carregar() {
  chrome.storage.local.get(["leads"], dados => {
    leadsBrutos = prepararLeads(dados.leads || []);
    preencherFiltros(leadsBrutos);
    renderTabela();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  configurarAcoes();
  carregar();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.leads) return;
    clearTimeout(timerRefresh);
    timerRefresh = setTimeout(carregar, 1000);
  });
});
