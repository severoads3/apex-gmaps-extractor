(function () {
  // Evita dupla execução se o script for injetado duas vezes na mesma aba.
  if (window.__apexLeadsEmExecucao) return;
  window.__apexLeadsEmExecucao = true;

  const TIMEOUT_CENARIO_MS = 20000;
  const POLL_INTERVAL_MS = 500;
  const SCROLL_INTERVAL_MS = 2500;
  const SCROLL_TIMEOUT_MS = 60000;
  const MAX_TENTATIVAS_ESTAGNADAS = 4;
  const TIMEOUT_H1_MS = 10000;
  const RODADAS_POR_PARCIAL = 3;

  function enviarMensagem(payload) {
    try {
      chrome.runtime.sendMessage(payload);
    } catch (e) {
      // contexto da extensão invalidado (extensão recarregada) — nada a fazer
    }
  }

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

  function extrairTelefone(texto) {
    if (!texto) return "";
    const match = texto.match(/\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/);
    return match ? match[0].trim() : "";
  }

  // Identificador único do lugar (ftid) e coordenadas embutidos no href.
  function extrairDadosDaAncora(ancora) {
    const href = ancora && ancora.href ? ancora.href : "";
    const dados = { placeId: "", linkMaps: href, lat: "", lng: "" };
    const mId = href.match(/0x[0-9a-f]+:0x[0-9a-f]+/i);
    if (mId) dados.placeId = mId[0];
    const mCoord = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (mCoord) {
      dados.lat = mCoord[1];
      dados.lng = mCoord[2];
    }
    return dados;
  }

  // Centro do viewport atual do Maps (padrão @lat,lng,ZOOMz na URL).
  function capturarCentro(url) {
    const m = String(url || "").match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/);
    if (!m) return null;
    return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), zoom: parseFloat(m[3]) };
  }

  // O background grava cidadeAtual/quadranteAtual/termo no storage antes de
  // injetar este script (executeScript com "files" não aceita argumentos).
  function lerContextoStorage() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(["cidadeAtual", "quadranteAtual", "termo"], dados => resolve(dados || {}));
      } catch (e) {
        resolve({});
      }
    });
  }

  function aguardarCondicao(condicaoFn, timeoutMs, intervalMs) {
    return new Promise(resolve => {
      const inicio = Date.now();
      const tentar = () => {
        let resultado = null;
        try {
          resultado = condicaoFn();
        } catch (e) {
          resultado = null;
        }
        if (resultado) {
          resolve(resultado);
          return;
        }
        if (Date.now() - inicio >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(tentar, intervalMs);
      };
      tentar();
    });
  }

  // Descobre em que tela o Maps caiu. A ordem importa: a URL de ficha única
  // (/maps/place/) vem antes do feed, pois a ficha pode conter um feed de
  // avaliações que não é a lista de resultados.
  function detectarCenario() {
    const url = window.location.href;
    if (url.includes("consent.google") || url.includes("/sorry/")) return { tipo: "bloqueio" };
    if (url.includes("/maps/place/")) return { tipo: "place" };
    const feed = document.querySelector('div[role="feed"]');
    if (feed) return { tipo: "feed" };
    const texto = document.body ? document.body.textContent || "" : "";
    if (texto.includes("O Google Maps não encontrou")) return { tipo: "vazio" };
    return null;
  }

  // Heurística fraca de bloqueio — usada somente APÓS o timeout de 20s, para
  // não confundir o app do Maps ainda carregando com uma página de CAPTCHA.
  function paginaSemAppMaps() {
    const marcador = document.querySelector('div[role="feed"], a[href*="/maps/place/"], h1');
    const recaptcha = document.querySelector('iframe[src*="recaptcha"], form[action*="sorry"]');
    if (recaptcha) return true;
    const texto = document.body ? document.body.textContent || "" : "";
    return !marcador && texto.length < 2000;
  }

  // Sobe a partir da âncora enquanto o ancestral ainda contém apenas ESTA
  // ficha; o maior ancestral com uma única âncora de /maps/place/ é o card.
  // (Subir um número fixo de níveis englobaria a lista inteira e misturaria
  // telefones de estabelecimentos vizinhos.)
  function encontrarContainerCard(ancora, limite) {
    let el = ancora;
    let candidato = ancora;
    while (el.parentElement && el.parentElement !== limite && el.parentElement !== document.body) {
      el = el.parentElement;
      const quantasFichas = el.querySelectorAll('a[href*="/maps/place/"]').length;
      if (quantasFichas === 1) {
        candidato = el;
      } else {
        break;
      }
    }
    return candidato;
  }

  function extrairNome(card, ancora) {
    const ariaLabel = ancora.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const heading = card.querySelector('[role="heading"], strong');
    if (heading && heading.textContent) return heading.textContent.trim();
    return "";
  }

  // A linha "Categoria · Endereço" é o MENOR elemento cujo texto contém o
  // separador; contêineres externos concatenam o card inteiro e viram lixo.
  function extrairCategoriaEEndereco(card) {
    const candidatos = Array.from(card.querySelectorAll("div, span"))
      .map(el => (el.textContent || "").trim())
      .filter(t => t.length >= 3 && t.length <= 120 && /[·⋅]/.test(t))
      .filter(t => !/aberto|fechado|fecha às|abre às/i.test(t))
      .sort((a, b) => a.length - b.length);

    for (const linha of candidatos) {
      const partes = linha.split(/[·⋅]/).map(p => p.trim()).filter(Boolean);
      if (partes.length < 2) continue;
      if (/^\d/.test(partes[0])) continue; // linha de nota/avaliações, não de categoria
      return { categoria: partes[0], endereco: partes[1] };
    }
    return { categoria: "", endereco: "" };
  }

  function extrairNotaEAvaliacoes(escopo) {
    let nota = "";
    let avaliacoes = "";
    const spans = escopo.querySelectorAll('span[role="img"]');
    for (const el of spans) {
      const rotulo = el.getAttribute("aria-label") || "";
      if (!/estrela|avalia/i.test(rotulo)) continue;
      const matchNota = rotulo.match(/^\s*(\d+[.,]\d+|\d+)\s*estrela/i);
      if (matchNota) nota = matchNota[1];
      const matchAvaliacoes = rotulo.match(/([\d.,]+)\s*avalia/i);
      if (matchAvaliacoes) avaliacoes = somenteDigitos(matchAvaliacoes[1]);
      break;
    }
    return { nota, avaliacoes };
  }

  function extrairSiteDoCard(card) {
    const chip = card.querySelector('a[data-value="Website"]');
    return chip && chip.href ? chip.href : "";
  }

  function chaveDoLead(lead) {
    if (lead.placeId) return "id:" + lead.placeId.toLowerCase();
    return "nf:" + normalizarTexto(lead.nome) + "|" + somenteDigitos(lead.telefone);
  }

  // Colhe os cards visíveis do feed e mescla no Map acumulador — chamada a
  // cada rodada de scroll, para que um timeout não perca o que já carregou.
  function colherFeed(feed, contexto, acumulador) {
    const ancoras = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));

    ancoras.forEach(ancora => {
      const card = encontrarContainerCard(ancora, feed);
      const nome = extrairNome(card, ancora);
      if (!nome) return;

      const telefone = extrairTelefone(card.textContent || "");
      const { categoria, endereco } = extrairCategoriaEEndereco(card);
      const { nota, avaliacoes } = extrairNotaEAvaliacoes(card);
      const dadosAncora = extrairDadosDaAncora(ancora);
      const site = extrairSiteDoCard(card);

      const lead = {
        nome,
        categoria,
        telefone,
        endereco,
        nota,
        avaliacoes,
        site,
        placeId: dadosAncora.placeId,
        linkMaps: dadosAncora.linkMaps,
        lat: dadosAncora.lat,
        lng: dadosAncora.lng,
        cidade: contexto.cidadeAtual || "",
        quadrante: contexto.quadranteAtual || ""
      };

      const chave = chaveDoLead(lead);
      if (acumulador.has(chave)) {
        const existente = acumulador.get(chave);
        Object.keys(lead).forEach(campo => {
          if (!existente[campo] && lead[campo]) existente[campo] = lead[campo];
        });
        return;
      }
      acumulador.set(chave, lead);
    });
  }

  // CASO B: a busca caiu direto na ficha de um único lugar (ou tarefa de
  // enriquecimento do modo profundo). Usa atributos semânticos estáveis.
  async function extrairLeadUnico(contexto) {
    const h1 = await aguardarCondicao(() => document.querySelector("h1"), TIMEOUT_H1_MS, POLL_INTERVAL_MS);
    const nome = h1 && h1.textContent ? h1.textContent.trim() : "";
    if (!nome) return [];

    let telefone = "";
    const btnFone = document.querySelector('button[data-item-id^="phone"]');
    if (btnFone) {
      telefone = extrairTelefone((btnFone.getAttribute("aria-label") || "") + " " + (btnFone.textContent || ""));
    }
    if (!telefone) {
      telefone = extrairTelefone(document.body ? document.body.textContent || "" : "");
    }

    let endereco = "";
    const btnEndereco = document.querySelector('button[data-item-id="address"]');
    if (btnEndereco) {
      endereco = (btnEndereco.getAttribute("aria-label") || "").replace(/^endereço:\s*/i, "").trim();
    }

    let site = "";
    const linkSite = document.querySelector('a[data-item-id="authority"]');
    if (linkSite && linkSite.href) site = linkSite.href;

    const { nota, avaliacoes } = extrairNotaEAvaliacoes(document);

    const url = window.location.href;
    const mId = url.match(/0x[0-9a-f]+:0x[0-9a-f]+/i);
    const mCoord = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);

    return [{
      nome,
      categoria: "",
      telefone,
      endereco,
      nota,
      avaliacoes,
      site,
      placeId: mId ? mId[0] : "",
      linkMaps: url,
      lat: mCoord ? mCoord[1] : "",
      lng: mCoord ? mCoord[2] : "",
      cidade: contexto.cidadeAtual || "",
      quadrante: contexto.quadranteAtual || ""
    }];
  }

  function chegouAoFimDaLista(feed) {
    const texto = feed.textContent || "";
    return texto.includes("final da lista");
  }

  // Scroll infinito com colheita incremental: a cada rodada os cards já
  // renderizados são acumulados, e a cada N rodadas um parcial é enviado ao
  // background — um timeout no meio não perde o que já foi visto.
  async function fazerScrollComColheita(contexto, acumulador) {
    const inicio = Date.now();
    let tentativasEstagnadas = 0;
    let alturaAnterior = -1;
    let rodada = 0;
    let enviadosNaUltimaParcial = 0;

    while (Date.now() - inicio < SCROLL_TIMEOUT_MS) {
      // re-consulta o feed a cada rodada: o SPA pode recriar o elemento
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) break;

      colherFeed(feed, contexto, acumulador);

      if (chegouAoFimDaLista(feed)) break;

      rodada += 1;
      if (rodada % RODADAS_POR_PARCIAL === 0 && acumulador.size > enviadosNaUltimaParcial) {
        enviadosNaUltimaParcial = acumulador.size;
        enviarMensagem({ tipo: "extracao_parcial", leads: Array.from(acumulador.values()) });
      }

      feed.scrollTop = feed.scrollHeight;
      await new Promise(r => setTimeout(r, SCROLL_INTERVAL_MS));

      const feedAtual = document.querySelector('div[role="feed"]');
      if (!feedAtual) break;
      const alturaAtual = feedAtual.scrollHeight;
      if (alturaAtual === alturaAnterior) {
        tentativasEstagnadas += 1;
        if (tentativasEstagnadas >= MAX_TENTATIVAS_ESTAGNADAS) break;
      } else {
        tentativasEstagnadas = 0;
      }
      alturaAnterior = alturaAtual;
    }

    // colheita final sobre o que estiver na página
    const feedFinal = document.querySelector('div[role="feed"]');
    if (feedFinal) colherFeed(feedFinal, contexto, acumulador);
  }

  async function iniciarExtracao() {
    try {
      const contexto = await lerContextoStorage();
      const cenario = await aguardarCondicao(detectarCenario, TIMEOUT_CENARIO_MS, POLL_INTERVAL_MS);

      if (!cenario) {
        if (paginaSemAppMaps()) {
          enviarMensagem({ tipo: "bloqueio_detectado" });
        } else {
          enviarMensagem({ tipo: "extracao_concluida", leads: [], centro: capturarCentro(window.location.href) });
        }
        return;
      }

      if (cenario.tipo === "bloqueio") {
        enviarMensagem({ tipo: "bloqueio_detectado" });
        return;
      }

      if (cenario.tipo === "vazio") {
        enviarMensagem({ tipo: "extracao_concluida", leads: [], centro: capturarCentro(window.location.href) });
        return;
      }

      if (cenario.tipo === "place") {
        const leads = await extrairLeadUnico(contexto);
        enviarMensagem({ tipo: "extracao_concluida", leads, centro: capturarCentro(window.location.href) });
        return;
      }

      // cenario.tipo === "feed": scroll com colheita incremental
      const acumulador = new Map();
      await fazerScrollComColheita(contexto, acumulador);
      enviarMensagem({
        tipo: "extracao_concluida",
        leads: Array.from(acumulador.values()),
        centro: capturarCentro(window.location.href)
      });
    } catch (erro) {
      enviarMensagem({ tipo: "extracao_concluida", leads: [], centro: null });
    }
  }

  iniciarExtracao();
})();
