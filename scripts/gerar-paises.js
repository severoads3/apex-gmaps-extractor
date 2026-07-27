// Gera data/paises/<iso2>.json + data/paises/index.js a partir de dados abertos.
// Fontes (baixadas em desenvolvimento, NUNCA em runtime):
//   - GeoNames cities500.txt + admin1CodesASCII.txt (CC BY 4.0)
//   - IBGE (apenas Brasil: municípios oficiais com população)
// Uso: baixe os arquivos GeoNames em scripts/geonames_tmp/ e rode:
//   node scripts/gerar-paises.js
// Runtime nunca acessa rede: determinístico, offline, sem CORS.
const fs = require("fs");
const path = require("path");
const PAISES = require("./paises-config");

const TMP = path.join(__dirname, "geonames_tmp");
const OUT = path.join(__dirname, "..", "data", "paises");

// -------- admin1: "CC.code" -> nome ASCII do estado/província --------
function carregarAdmin1() {
  const txt = fs.readFileSync(path.join(TMP, "admin1.txt"), "utf8");
  const map = {};
  txt.split("\n").forEach(l => {
    if (!l.trim()) return;
    const [chave, nome, ascii] = l.split("\t");
    map[chave] = ascii || nome; // ASCII é geocodificável no Maps
  });
  return map;
}

// nome ASCII de estado brasileiro (GeoNames) -> sigla UF (para casar coords IBGE)
const ESTADO_BR_PARA_UF = {
  "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA",
  "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES", "goias": "GO",
  "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR",
  "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO",
  "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE",
  "tocantins": "TO"
};
function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function coord4(v) {
  const n = parseFloat(v);
  return isNaN(n) ? "" : Math.round(n * 1e4) / 1e4; // ~11 m, compacto
}

// -------- cidades por país (GeoNames), agrupadas por admin1, com coords --------
// Retorna { porPais, coordBR }. coordBR indexa lat/lng por "UF|nomeNormalizado"
// para enriquecer os municípios do IBGE (Brasil).
function carregarCidadesGeoNames(admin1) {
  const txt = fs.readFileSync(path.join(TMP, "cities500.txt"), "utf8");
  const porPais = {}; // iso2 -> { estadoNome -> [[cidade, pop, lat, lng], ...] }
  const coordBR = {}; // "UF|norm(nome)" -> [lat, lng]
  const linhas = txt.split("\n");
  for (const l of linhas) {
    if (!l) continue;
    const c = l.split("\t");
    const nome = c[1];
    const pais = c[8];
    const lat = coord4(c[4]);
    const lng = coord4(c[5]);
    const admin1code = c[10];
    const pop = parseInt(c[14], 10) || 0;
    if (!nome || !pais) continue;
    const estado = admin1[pais + "." + admin1code];
    if (!estado) continue; // sem estado mapeável, descarta
    (porPais[pais] = porPais[pais] || {});
    (porPais[pais][estado] = porPais[pais][estado] || []).push([nome, pop, lat, lng]);
    if (pais === "BR") {
      const uf = ESTADO_BR_PARA_UF[norm(estado)];
      if (uf && lat !== "" && lng !== "") coordBR[uf + "|" + norm(nome)] = [lat, lng];
    }
  }
  return { porPais, coordBR };
}

// -------- Brasil via IBGE (municípios oficiais + população + coords GeoNames) --------
async function carregarBrasilIBGE(coordBR) {
  const munReq = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado");
  const mun = await munReq.json();
  // população estimada (agregado 6579)
  const popReq = await fetch("https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[all]");
  const popJson = await popReq.json();
  const popPorId = {};
  popJson[0].resultados[0].series.forEach(s => {
    const id = s.localidade.id;
    const v = Object.values(s.serie)[0];
    popPorId[id] = parseInt(v, 10) || 0;
  });
  const estados = {}; // UF -> [[cidade, pop, lat, lng]]
  mun.forEach(m => {
    const uf = m["UF-sigla"];
    const nome = m["municipio-nome"];
    const id = String(m["municipio-id"]);
    const co = (coordBR && coordBR[uf + "|" + norm(nome)]) || ["", ""];
    (estados[uf] = estados[uf] || []).push([nome, popPorId[id] || 0, co[0], co[1]]);
  });
  return estados;
}

function ordenarCidades(estados) {
  // dentro de cada estado: população DECRESCENTE (maiores primeiro),
  // desempate alfabético estável. Preserva lat/lng (posições 2 e 3).
  const out = {};
  Object.keys(estados).sort((a, b) => a.localeCompare(b, "pt-BR")).forEach(est => {
    const dedup = new Map();
    estados[est].forEach(tuple => {
      const [n, p] = tuple;
      const k = n.toLowerCase();
      if (!dedup.has(k) || dedup.get(k)[1] < p) dedup.set(k, tuple);
    });
    out[est] = [...dedup.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  });
  return out;
}

function validar(iso2, dados) {
  const ests = Object.keys(dados.cidades);
  if (ests.length < 1) throw new Error(`${iso2}: sem estados`);
  let comCoord = 0, total = 0;
  for (const e of ests) {
    if (!dados.cidades[e].length) throw new Error(`${iso2}/${e}: sem cidades`);
    for (const [n, p, lat, lng] of dados.cidades[e]) {
      if (!n) throw new Error(`${iso2}/${e}: cidade sem nome`);
      if (typeof p !== "number" || p < 0) throw new Error(`${iso2}/${e}: pop inválida em ${n}`);
      total++;
      if (typeof lat === "number" && typeof lng === "number") comCoord++;
    }
  }
  return { comCoord, total };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const admin1 = carregarAdmin1();
  const { porPais: geo, coordBR } = carregarCidadesGeoNames(admin1);

  const index = [];
  for (const p of PAISES) {
    let estadosBrutos;
    if (p.fonte === "ibge") {
      estadosBrutos = await carregarBrasilIBGE(coordBR);
    } else {
      estadosBrutos = geo[p.iso2];
      if (!estadosBrutos) { console.warn(`AVISO: sem dados GeoNames para ${p.iso2}, pulando`); continue; }
    }
    const cidades = ordenarCidades(estadosBrutos);
    // mapa de exibição do estado = próprio nome (ASCII); UI mostra como vem
    const estadosMap = {};
    Object.keys(cidades).forEach(e => { estadosMap[e] = e; });

    const dados = {
      nome: p.nome,
      nomeBusca: p.nomeBusca,
      ddi: p.ddi,
      telefone: { tamanhos: p.tamanhos, tronco: p.tronco },
      estados: estadosMap,
      cidades
    };
    const { comCoord, total } = validar(p.iso2, dados);
    fs.writeFileSync(path.join(OUT, p.iso2 + ".json"), JSON.stringify(dados));
    const pct = total ? Math.round((comCoord / total) * 100) : 0;
    console.log(`${p.iso2}: ${Object.keys(cidades).length} estados, ${total} cidades, ${pct}% com coordenadas`);
    index.push({ iso2: p.iso2, nome: p.nome, bandeira: "icons/flags/" + p.iso2.toLowerCase() + ".svg" });
  }

  const idxSrc =
    "// Gerado por scripts/gerar-paises.js — NÃO editar à mão.\n" +
    "// Índice leve carregado sempre pelo popup; os <iso2>.json vêm sob demanda.\n" +
    "const PAISES_INDEX = " + JSON.stringify(index, null, 2) + ";\n";
  fs.writeFileSync(path.join(OUT, "index.js"), idxSrc);
  console.log(`\nindex.js: ${index.length} países`);
}

main().catch(e => { console.error("FALHA:", e.message); process.exit(1); });
