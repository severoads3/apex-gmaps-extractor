const CONFIG_PADRAO = {
  intervaloMinSeg: 3,
  intervaloMaxSeg: 7,
  timeoutExtracaoSeg: 90,
  tamanhoBloco: 5,
  deltaLat: 0.03,
  deltaLng: 0.03,
  zoomPonto: 14,
  raioCidadeKm: 20,
  notificacoes: true,
  autoRetomar: false,
  modoProfundo: false,
  limiteFichasPorCidade: 150,
  groqApiKey: ""
};

const CAMPOS_NUMERICOS = [
  "intervaloMinSeg", "intervaloMaxSeg", "timeoutExtracaoSeg", "tamanhoBloco",
  "deltaLat", "deltaLng", "zoomPonto", "raioCidadeKm", "limiteFichasPorCidade"
];
const CAMPOS_BOOLEANOS = ["notificacoes", "autoRetomar", "modoProfundo"];

function preencher(config) {
  CAMPOS_NUMERICOS.forEach(id => {
    document.getElementById(id).value = config[id];
  });
  CAMPOS_BOOLEANOS.forEach(id => {
    document.getElementById(id).checked = !!config[id];
  });
  document.getElementById("groqApiKey").value = config.groqApiKey || "";
}

function lerFormulario() {
  const config = {};
  for (const id of CAMPOS_NUMERICOS) {
    const el = document.getElementById(id);
    const valor = parseFloat(el.value);
    if (isNaN(valor)) return { erro: "Preencha todos os campos numéricos." };
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    if (valor < min || valor > max) {
      return { erro: `Valor fora do intervalo permitido (${min}–${max}).` };
    }
    config[id] = valor;
  }
  CAMPOS_BOOLEANOS.forEach(id => {
    config[id] = document.getElementById(id).checked;
  });
  config.groqApiKey = (document.getElementById("groqApiKey").value || "").trim();

  if (config.intervaloMinSeg > config.intervaloMaxSeg) {
    return { erro: "O intervalo mínimo não pode ser maior que o máximo." };
  }
  return { config };
}

function avisar(texto) {
  const el = document.getElementById("aviso");
  el.textContent = texto;
  setTimeout(() => {
    if (el.textContent === texto) el.textContent = "";
  }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["config"], dados => {
    preencher(Object.assign({}, CONFIG_PADRAO, dados.config || {}));
  });

  document.getElementById("btnSalvar").addEventListener("click", () => {
    const resultado = lerFormulario();
    if (resultado.erro) {
      avisar(resultado.erro);
      return;
    }
    chrome.storage.local.set({ config: resultado.config }, () => {
      avisar("Opções salvas. Valem a partir da próxima busca.");
    });
  });

  document.getElementById("btnPadroes").addEventListener("click", () => {
    preencher(CONFIG_PADRAO);
    chrome.storage.local.set({ config: Object.assign({}, CONFIG_PADRAO) }, () => {
      avisar("Padrões restaurados e salvos.");
    });
  });
});
