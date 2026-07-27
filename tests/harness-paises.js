// Valida os dados gerados da FASE 4 (cobertura mundial): index + arquivos de
// país. Garante estrutura, ordenação por população (maiores primeiro) e a
// completude do Brasil (IBGE).
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "data", "paises");

let falhas = 0;
function assert(cond, rotulo) {
  console.log((cond ? "PASS: " : (falhas++, "FAIL: ")) + rotulo);
}

// index.js define PAISES_INDEX (const): avalia isolado.
const idxSrc = fs.readFileSync(path.join(DIR, "index.js"), "utf8");
const PAISES_INDEX = new Function(idxSrc + "\nreturn PAISES_INDEX;")();

assert(Array.isArray(PAISES_INDEX) && PAISES_INDEX.length >= 25, "index tem >= 25 países");
assert(PAISES_INDEX[0].iso2 === "BR", "Brasil é o primeiro país do índice");
assert(PAISES_INDEX.every(p => p.iso2 && p.nome && p.bandeira), "todo país do índice tem iso2, nome e bandeira");
assert(PAISES_INDEX.every(p => fs.existsSync(path.join(__dirname, "..", p.bandeira))), "toda bandeira referenciada existe em disco");

// cada arquivo de país existe e tem forma válida
PAISES_INDEX.forEach(p => {
  const arq = path.join(DIR, p.iso2 + ".json");
  assert(fs.existsSync(arq), `arquivo ${p.iso2}.json existe`);
});

function carregar(iso2) {
  return JSON.parse(fs.readFileSync(path.join(DIR, iso2 + ".json"), "utf8"));
}

// checagem estrutural + ordenação + COORDENADAS em uma amostra representativa
["BR", "US", "PT", "JP"].forEach(iso2 => {
  const d = carregar(iso2);
  assert(d.ddi && d.telefone && Array.isArray(d.telefone.tamanhos), `${iso2}: metadados de telefone presentes`);
  const estados = Object.keys(d.cidades);
  assert(estados.length >= 1, `${iso2}: tem estados`);
  let ordenadoOk = true, naoVazioOk = true, comCoord = 0, total = 0, coordValida = true;
  estados.forEach(e => {
    const lista = d.cidades[e];
    if (!lista.length) naoVazioOk = false;
    for (let i = 0; i < lista.length; i++) {
      total++;
      const [, pop, lat, lng] = lista[i];
      if (typeof lat === "number" && typeof lng === "number") {
        comCoord++;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) coordValida = false;
      }
      if (i > 0 && lista[i][1] > lista[i - 1][1]) ordenadoOk = false;
    }
  });
  assert(naoVazioOk, `${iso2}: nenhum estado vazio`);
  assert(ordenadoOk, `${iso2}: cidades ordenadas por população decrescente`);
  assert(comCoord / total >= 0.9, `${iso2}: >= 90% das cidades têm coordenadas (${Math.round(comCoord/total*100)}%)`);
  assert(coordValida, `${iso2}: coordenadas dentro de faixas válidas (lat<=90, lng<=180)`);
});
// a maior cidade de SP deve ter coords plausíveis (São Paulo ~ -23.5, -46.6)
const sp0 = carregar("BR").cidades["SP"][0];
assert(Math.abs(sp0[2] - (-23.55)) < 1 && Math.abs(sp0[3] - (-46.63)) < 1, "coordenadas de São Paulo plausíveis");

// Brasil via IBGE: cobertura de municípios e SC presente
const br = carregar("BR");
const totalBR = Object.values(br.cidades).reduce((s, a) => s + a.length, 0);
assert(totalBR >= 5000, `Brasil com >= 5000 municípios (IBGE): ${totalBR}`);
assert(Array.isArray(br.cidades["SC"]) && br.cidades["SC"].length >= 290, "SC presente no Brasil com >= 290 municípios");
assert(br.cidades["SP"][0][0] === "São Paulo", "maior cidade de SP é São Paulo (ordenação populacional)");

if (falhas > 0) { console.log(`\n${falhas} FALHA(S) — dados de países`); process.exit(1); }
console.log("\nTODOS OS TESTES PASSARAM");
