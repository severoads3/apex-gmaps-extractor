// Testa as funções puras de extração do content.js real, isolando-as do IIFE.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

function extrairFuncao(nome) {
  const inicio = src.indexOf("  function " + nome);
  if (inicio === -1) throw new Error("funcao nao encontrada: " + nome);
  let profundidade = 0;
  let i = src.indexOf("{", inicio);
  for (; i < src.length; i++) {
    if (src[i] === "{") profundidade++;
    if (src[i] === "}") { profundidade--; if (profundidade === 0) break; }
  }
  return src.slice(inicio, i + 1);
}

const corpo = [
  "normalizarTexto", "somenteDigitos", "extrairTelefone", "extrairDadosDaAncora",
  "capturarCentro", "extrairNotaEAvaliacoes", "extrairCategoriaEEndereco",
  "encontrarContainerCard", "chaveDoLead"
].map(extrairFuncao).join("\n");

const fakeDocumentBody = {};
const sandbox = new Function("document", corpo + `
  return { normalizarTexto, somenteDigitos, extrairTelefone, extrairDadosDaAncora,
           capturarCentro, extrairNotaEAvaliacoes, extrairCategoriaEEndereco,
           encontrarContainerCard, chaveDoLead };
`)({ body: fakeDocumentBody });

let falhas = 0;
function assert(cond, rotulo) {
  console.log((cond ? "PASS: " : (falhas++, "FAIL: ")) + rotulo);
}

// --- normalizarTexto ---
assert(sandbox.normalizarTexto("  Loja ÚNICA  ") === "loja unica", "normaliza acentos, caixa e espacos");

// --- extrairTelefone ---
assert(sandbox.extrairTelefone("Ligue (47) 3433-1234 hoje") === "(47) 3433-1234", "telefone fixo com DDD");
assert(sandbox.extrairTelefone("Cel 47 99999 8888") === "47 99999 8888", "celular com espacos");
assert(sandbox.extrairTelefone("CEP 89201-000, Joinville") === "", "CEP nao vira telefone");
assert(sandbox.extrairTelefone("") === "", "texto vazio");

// --- extrairDadosDaAncora ---
const hrefExemplo = "https://www.google.com/maps/place/Loja+X/data=!4m7!3m6!1s0x94dea3f5a423:0x8f7c31b2a!8m2!3d-26.304408!4d-48.845871!16s";
let r = sandbox.extrairDadosDaAncora({ href: hrefExemplo });
assert(r.placeId === "0x94dea3f5a423:0x8f7c31b2a", "placeId (ftid) extraido do href");
assert(r.lat === "-26.304408" && r.lng === "-48.845871", "coordenadas !3d/!4d extraidas");
assert(r.linkMaps === hrefExemplo, "linkMaps preservado");
r = sandbox.extrairDadosDaAncora({ href: "https://www.google.com/maps/place/Loja" });
assert(r.placeId === "" && r.lat === "", "href sem dados nao inventa valores");

// --- capturarCentro ---
let c = sandbox.capturarCentro("https://www.google.com/maps/search/loja/@-26.3044,-48.8487,13z?hl=pt-BR");
assert(c && c.lat === -26.3044 && c.lng === -48.8487 && c.zoom === 13, "centro capturado da URL @lat,lng,zoom");
assert(sandbox.capturarCentro("https://www.google.com/maps/search/loja") === null, "URL sem viewport retorna null");

// --- chaveDoLead ---
assert(sandbox.chaveDoLead({ placeId: "0xAA:0x01", nome: "X", telefone: "" }) === "id:0xaa:0x01", "chave por placeId");
assert(sandbox.chaveDoLead({ placeId: "", nome: "Loja Á", telefone: "(47) 9999-8888" }) === "nf:loja a|4799998888", "chave por nome+fone");

// --- extrairNotaEAvaliacoes ---
function fakeSpan(label) {
  return { getAttribute: n => (n === "aria-label" ? label : null) };
}
function fakeEscopo(spans) {
  return { querySelectorAll: () => spans };
}
r = sandbox.extrairNotaEAvaliacoes(fakeEscopo([fakeSpan("4,5 estrelas 32 avaliações")]));
assert(r.nota === "4,5" && r.avaliacoes === "32", "nota 4,5 e 32 avaliacoes");
r = sandbox.extrairNotaEAvaliacoes(fakeEscopo([fakeSpan("4,8 estrelas 1.234 avaliações")]));
assert(r.nota === "4,8" && r.avaliacoes === "1234", "milhar 1.234 vira 1234");
r = sandbox.extrairNotaEAvaliacoes(fakeEscopo([fakeSpan("Foto do local"), fakeSpan("4,2 estrelas 7 avaliações")]));
assert(r.nota === "4,2", "ignora span[role=img] que nao e avaliacao");

// --- extrairCategoriaEEndereco ---
function fakeEl(texto) {
  return { textContent: texto };
}
function fakeCard(textos) {
  return { querySelectorAll: () => textos.map(fakeEl) };
}
r = sandbox.extrairCategoriaEEndereco(fakeCard([
  "Loja Scooter X4,5(32)Loja de scooter · R. das Flores, 123Aberto ⋅ Fecha às 18:00(47) 3433-1234",
  "Loja de scooter · R. das Flores, 123",
  "Aberto ⋅ Fecha às 18:00"
]));
assert(r.categoria === "Loja de scooter" && r.endereco === "R. das Flores, 123", "menor linha Categoria/Endereco vence o container externo");
r = sandbox.extrairCategoriaEEndereco(fakeCard(["4,5 · 32 avaliações", "Bicicletaria · Av. Brasil, 45"]));
assert(r.categoria === "Bicicletaria", "linha comecando com digito e ignorada");

// --- encontrarContainerCard ---
function noh(nome) {
  const el = { nome, children: [], parentElement: null };
  el.querySelectorAll = () => {
    const encontradas = [];
    (function desce(n) { if (n._ehAncora) encontradas.push(n); n.children.forEach(desce); })(el);
    return encontradas;
  };
  return el;
}
function pendura(pai, filho) { pai.children.push(filho); filho.parentElement = pai; }

const body = noh("body");
const feed = noh("feed");
const wrapper1 = noh("wrapper1");
const card1 = noh("card1");
const a1 = noh("a1"); a1._ehAncora = true;
const info1 = noh("info1");
const wrapper2 = noh("wrapper2");
const card2 = noh("card2");
const a2 = noh("a2"); a2._ehAncora = true;
pendura(body, feed);
pendura(feed, wrapper1); pendura(feed, wrapper2);
pendura(wrapper1, card1); pendura(card1, a1); pendura(card1, info1);
pendura(wrapper2, card2); pendura(card2, a2);

const container = sandbox.encontrarContainerCard(a1, feed);
assert(container === wrapper1, "sobe ate o filho direto do feed que contem so esta ancora");
assert(container.querySelectorAll().length === 1, "container do card contem exatamente 1 ancora");

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : "\n" + falhas + " TESTE(S) FALHARAM");
process.exit(falhas === 0 ? 0 : 1);
