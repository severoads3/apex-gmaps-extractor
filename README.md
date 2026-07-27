# Apex Leads Extractor — extrator de leads B2B do Google Maps

**Extensão para Chrome (Manifest V3) que extrai leads B2B do Google Maps em 30 países e exporta tudo para CSV.**
Escolha país → estado → cidades, e a extensão varre **no mínimo 3 pontos geográficos por cidade** (até 9 em metrópoles), remove duplicados, descarta resultados de fora da cidade e — opcionalmente — usa IA para filtrar e enriquecer cada lead.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![Zero dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)](package.json)
[![Testes](https://github.com/severoads3/apex-gmaps-extractor/actions/workflows/ci.yml/badge.svg)](https://github.com/severoads3/apex-gmaps-extractor/actions/workflows/ci.yml)
[![PRs bem-vindos](https://img.shields.io/badge/PRs-bem--vindos-blue.svg)](CONTRIBUTING.md)

> 🇬🇧 **English speaker?** Read the [English README](README.en.md).

---

## Índice

- [Por que existe](#por-que-existe)
- [Recursos](#recursos)
- [Cobertura geográfica](#cobertura-geográfica)
- [Instalação](#instalação)
- [Como usar](#como-usar)
- [O que sai no CSV](#o-que-sai-no-csv)
- [Configuração](#configuração)
- [Validação e enriquecimento por IA (opcional)](#validação-e-enriquecimento-por-ia-opcional)
- [Como funciona por dentro](#como-funciona-por-dentro)
- [Desenvolvimento](#desenvolvimento)
- [Contribuindo](#contribuindo)
- [Perguntas frequentes](#perguntas-frequentes)
- [Uso responsável e aviso legal](#uso-responsável-e-aviso-legal)
- [Licença](#licença)

---

## Por que existe

Buscar "loja de bicicletas" no Google Maps e copiar telefones à mão não escala. Pior: o Maps
**esconde resultados** — uma única busca por cidade mostra só o que cabe naquela viewport, e quando
a cidade tem poucos resultados o Google **expande sozinho** a busca e mistura negócios de toda a
região vizinha.

O Apex Leads Extractor resolve os dois problemas:

1. **Cobertura** — varre cada cidade em vários pontos geográficos (centro, norte, sul, leste, oeste
   e diagonais), não em uma busca só.
2. **Precisão** — cada busca é ancorada nas coordenadas reais da cidade e um filtro de raio
   descarta o que veio de fora dela.

Tudo roda **100% no seu navegador**. Sem servidor, sem API paga, sem conta, sem dado saindo da sua máquina
(exceto, se você quiser, a validação opcional por IA).

## Recursos

| | |
|---|---|
| 🌎 **30 países** | ~133 mil cidades e 578 estados/províncias já embarcados, offline |
| 📍 **3 a 9 pontos por cidade** | 3 pontos (padrão), 5 acima de 50 mil hab., 9 acima de 500 mil hab. |
| 🎯 **Busca ancorada** | Viewport fixa nas coordenadas reais + nome da cidade no texto (anti-viés de localização) |
| ✂️ **Filtro de raio** | Lead fora do raio da cidade é descartado (padrão 20 km; ×1,75 em metrópoles) |
| 🔁 **Deduplicação forte** | Por `placeId`, com fallback nome+telefone, escopado por país\|estado\|cidade |
| 🔎 **Múltiplos termos** | Uma lista de termos por linha; cada termo é varrido em cada ponto |
| ⏯️ **Blocos ou contínuo** | Pausa e exporta CSV parcial a cada N cidades, ou roda tudo direto |
| 📞 **Telefone + WhatsApp** | Normalização E.164 com DDI por país e link `wa.me` pronto |
| 🕳️ **Modo profundo** | Abre a ficha dos leads sem telefone para tentar completar o dado |
| 🤖 **IA opcional (Groq)** | Remove leads de outro ramo e enriquece com segmento, prioridade A/B/C e mensagem de abordagem |
| 📊 **Página de resultados** | Tabela ordenável e filtrável com score de priorização comercial |
| 💾 **Retomável** | Pausa, continua, repete falhas e sobrevive a reinício do navegador |
| 📦 **Zero dependências** | JavaScript puro, MV3, sem build step, sem `node_modules` em runtime |

## Cobertura geográfica

**30 países**, com dados gerados a partir de fontes abertas ([GeoNames](https://www.geonames.org/)
CC BY 4.0 e, para o Brasil, o [IBGE](https://www.ibge.gov.br/)):

🇧🇷 Brasil (5.571 municípios) · 🇺🇸 Estados Unidos · 🇨🇦 Canadá · 🇲🇽 México · 🇦🇷 Argentina ·
🇨🇱 Chile · 🇨🇴 Colômbia · 🇵🇪 Peru · 🇺🇾 Uruguai · 🇵🇾 Paraguai · 🇧🇴 Bolívia · 🇪🇨 Equador ·
🇵🇹 Portugal · 🇪🇸 Espanha · 🇫🇷 França · 🇩🇪 Alemanha · 🇮🇹 Itália · 🇬🇧 Reino Unido ·
🇳🇱 Países Baixos · 🇧🇪 Bélgica · 🇨🇭 Suíça · 🇦🇹 Áustria · 🇮🇪 Irlanda · 🇵🇱 Polônia ·
🇦🇺 Austrália · 🇳🇿 Nova Zelândia · 🇿🇦 África do Sul · 🇯🇵 Japão · 🇦🇪 Emirados Árabes · 🇮🇳 Índia

Cada cidade traz nome, população e coordenadas. Os dados ficam em `data/paises/` e são carregados
**sob demanda** — só o país que você clicar entra na memória.

Falta um país? [Abra uma issue](https://github.com/severoads3/apex-gmaps-extractor/issues/new/choose)
ou veja [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#adicionando-um-país) — é uma linha em
`scripts/paises-config.js` e um comando.

## Instalação

A extensão ainda **não está na Chrome Web Store**. A instalação é local, em modo desenvolvedor —
leva menos de um minuto.

### 1. Baixe o código

```bash
git clone https://github.com/severoads3/apex-gmaps-extractor.git
```

> Sem Git? Clique em **Code → Download ZIP** aqui no GitHub e descompacte a pasta.

### 2. Carregue no Chrome

1. Abra `chrome://extensions` (ou **⋮ → Extensões → Gerenciar extensões**).
2. Ligue o **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `apex-gmaps-extractor` (a que contém o `manifest.json`).
5. Fixe a extensão na barra clicando no ícone de peça 🧩 → alfinete 📌.

Pronto. Funciona em Chrome, Edge, Brave e Opera (qualquer navegador Chromium com suporte a MV3).

> 📖 Passo a passo com mais detalhes e solução de problemas: [`docs/INSTALL.md`](docs/INSTALL.md).

### 3. Ajuste seu perfil do Chrome (recomendado)

O Google personaliza os resultados do Maps pela **sua** localização. Para não contaminar a coleta:

- Rode num perfil do Chrome **sem conta Google logada**.
- Revogue a permissão de localização de `google.com` em `chrome://settings/content/location`.

A extensão nunca pede GPS — mas a página do Maps usa o que o seu perfil entrega a ela.

## Como usar

1. Clique no ícone da extensão.
2. **Termos de busca** — um por linha. Ex.: `loja de bicicletas`, `oficina de bicicletas`.
3. **1. Escolha o país** — clique na bandeira.
4. **2. Escolha o estado/província** — no seletor.
5. **3. Cidades** — marque as que quiser. As 30 maiores aparecem primeiro, marcadas com ★.
   Use o filtro para achar rápido, ou **Marcar estado inteiro**.
6. **Modo de execução**:
   - **Blocos** (padrão) — pausa e exporta um CSV parcial a cada 5 cidades. Mais seguro em varreduras longas.
   - **Contínuo** — vai até o fim sem parar.
   - **Acumular** — soma à coleta anterior em vez de zerar.
7. **Iniciar**. A extensão abre uma aba de trabalho e vai varrendo. O painel mostra progresso,
   leads únicos, cidades concluídas, falhas e ETA.
8. Ao terminar, o CSV baixa sozinho. Você também pode **Exportar agora** a qualquer momento, ou abrir
   **Resultados** para ver, ordenar e filtrar a tabela no navegador.

Deixe a janela do Chrome aberta durante a varredura. Pode minimizar e usar outras abas normalmente.

> 📖 Guia completo, com estimativas de tempo e boas práticas: [`docs/USAGE.md`](docs/USAGE.md).

## O que sai no CSV

Arquivo `leads_<termo>_<regiao>_<data>_<hora>.csv`, separado por `;` e com BOM UTF-8
(abre direto no Excel com acentuação correta).

| Coluna | Descrição |
|---|---|
| `Nome` | Nome do negócio no Maps |
| `Categoria` | Categoria informada pelo Maps |
| `Telefone` | Telefone como exibido |
| `Endereco` | Endereço como exibido |
| `Nota` / `Avaliacoes` | Nota média e número de avaliações |
| `Cidade` / `Estado` / `Pais` | Origem geográfica do lead |
| `Quadrante` | Ponto de cobertura que encontrou o lead (Centro, Norte, …) |
| `Termo` | Termo de busca que trouxe o lead |
| `TelefoneNormalizado` | Só dígitos, em formato E.164 com DDI do país |
| `WhatsApp` | Link `wa.me` pronto (vazio se o número não for válido) |
| `Site` | Site do negócio |
| `Lat` / `Lng` / `LinkMaps` | Coordenadas e link direto para a ficha |
| `DataColeta` | Quando o lead foi coletado |
| `Relevancia`, `NomeLimpo`, `Segmento`, `TipoNegocio`, `Prioridade`, `Abordagem` | Preenchidas só com a [IA opcional](#validação-e-enriquecimento-por-ia-opcional) |

## Configuração

Botão **Opções** no popup (ou `chrome://extensions` → Detalhes → Opções). Os padrões funcionam bem;
mexa só se souber o que quer.

| Opção | Padrão | O que faz |
|---|---|---|
| Intervalo mín./máx. entre buscas | 3–7 s | Pausa aleatória entre buscas. **Aumente se o Google pedir verificação.** |
| Timeout de extração | 90 s | Espera máxima pelo resultado de uma página |
| Tamanho do bloco | 5 cidades | No modo Blocos, pausa e exporta a cada N cidades |
| Deslocamento Norte/Sul e Leste/Oeste | 0.03° | Distância dos pontos ao centro (~3 km) |
| Zoom dos pontos | 14 | Quanto o mapa fecha em cada ponto |
| Raio da cidade | 20 km | Lead além disso é descartado. `0` desliga |
| Modo profundo | desligado | Abre a ficha de leads sem telefone (mais lento, mais completo) |
| Limite de fichas por cidade | 150 | Teto do modo profundo |
| Notificações | ligado | Avisa ao concluir, fechar bloco ou detectar verificação |
| Retomar após reiniciar | desligado | Se ligado, continua sozinho depois de reiniciar o navegador |
| Chave da API Groq | vazio | Liga a validação/enriquecimento por IA |

> 📖 Detalhe de cada opção e como calibrar: [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

## Validação e enriquecimento por IA (opcional)

O Google Maps expande buscas sozinho: procurar `scooter elétrica` pode trazer oficina de carro.
Com uma chave da [Groq](https://console.groq.com/keys) (tem plano gratuito) configurada em Opções,
cada lead é avaliado contra **o termo que você buscou** — sem listas fixas por nicho — e a extensão:

- **Remove** os leads claramente de outro ramo;
- **Enriquece** os que ficam com nome comercial limpo, segmento, tipo de negócio,
  prioridade **A/B/C** e uma mensagem de abordagem pronta;
- **Ordena** o CSV por prioridade.

Sem chave, nada muda — a extensão funciona igual, só sem esse filtro.

> 🔐 **A chave fica apenas no `chrome.storage.local` da sua máquina.** Ela nunca é commitada,
> nunca aparece no CSV e nunca vai para nenhum servidor além da própria API da Groq.
> Este repositório não contém nenhuma chave de API.

## Como funciona por dentro

```
popup.js          seleção país → estado → cidades; monta o payload com coords, população e DDI
   │  chrome.runtime.sendMessage({cmd:"start", cidades, termos, modo})
   ▼
background.js     service worker MV3: máquina de estados da fila
   │              cidade → ponto de cobertura → termo, uma tarefa por vez
   │              abre a aba de trabalho, injeta o content script, aplica delays,
   │              deduplica, filtra por raio, monta o CSV e cuida do watchdog
   ▼
content.js        roda na página do Maps: scroll infinito com colheita incremental,
                  extrai os cards do feed (ou a ficha única) e devolve os leads
```

- **Estado dividido em duas chaves** no `storage`: `estado` (leve, muda toda hora) e `leads`/`dedup`
  (pesados, mudam só quando chegam leads) — evita reescrever megabytes a cada log.
- **Watchdog por `chrome.alarms`** resgata fase travada e sobrevive ao service worker dormir.
- **Nenhuma requisição de rede em runtime** além do próprio Google Maps (e da Groq, se você ligar a IA).

> 📖 Arquitetura detalhada, formato dos dados e como estender: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Desenvolvimento

Não há build step. Edite os arquivos e clique em **Recarregar** em `chrome://extensions`.

```bash
# rodar a suíte de testes (Node 18+, zero dependências)
npm test

# regerar data/paises/ a partir do GeoNames + IBGE
# (baixe os dumps em scripts/geonames_tmp/ antes — ver o cabeçalho do script)
npm run build:paises
```

Os testes são *harnesses* que fazem stub da API `chrome.*` e executam o `background.js` e o
`content.js` **reais** — a máquina de estados inteira é exercitada sem navegador.

```
apex-gmaps-extractor/
├── manifest.json          MV3
├── popup.html/.css/.js    UI e seleção geográfica
├── background.js          service worker: fila, dedup, CSV, IA
├── content.js             extração na página do Maps
├── options.html/.js       configurações
├── resultados.html/.js    tabela de leads no navegador
├── data/paises/           index.js + 30 arquivos <ISO2>.json
├── scripts/               geração dos dados de países
├── tests/                 harnesses (npm test)
└── docs/                  guias de instalação, uso, configuração e arquitetura
```

## Contribuindo

Contribuições são muito bem-vindas — issues, PRs, novos países, correções de dados, tradução.
Leia o [`CONTRIBUTING.md`](CONTRIBUTING.md) para o passo a passo, o padrão de commits e o checklist do PR.

Boas primeiras contribuições:

- 🌍 Adicionar um país (uma linha em `scripts/paises-config.js`)
- 🐛 Corrigir seletores do Maps quando o Google mudar o HTML
- 🌐 Traduzir a interface (hoje só pt-BR)
- 📝 Melhorar a documentação em `docs/`

## Perguntas frequentes

<details>
<summary><b>Isso é um scraper? Corro risco de bloqueio?</b></summary>

A extensão automatiza a navegação no Google Maps no **seu** navegador, como se você clicasse.
Ela usa delays aleatórios entre buscas justamente para não parecer um robô. Ainda assim, volume alto
pode fazer o Google pedir verificação — a extensão detecta isso, pausa e avisa. Se acontecer,
aumente o intervalo entre buscas nas Opções e varra menos cidades por vez.
</details>

<details>
<summary><b>Preciso de API key do Google ou pagar alguma coisa?</b></summary>

Não. A extensão não usa a Places API nem qualquer serviço pago. A única chave opcional é a da Groq,
que tem plano gratuito, e serve só para o filtro por IA.
</details>

<details>
<summary><b>Meus dados vão para algum servidor?</b></summary>

Não. Leads, configurações e progresso ficam no `chrome.storage.local` da sua máquina, e o CSV vai
para a sua pasta de downloads. Não existe backend neste projeto.
</details>

<details>
<summary><b>Quanto tempo leva uma varredura?</b></summary>

Uma tarefa = 1 cidade × 1 ponto × 1 termo, e leva algo entre 15 e 40 segundos. Uma cidade pequena
(3 pontos) com 1 termo dá ~3 tarefas; uma capital (9 pontos) com 3 termos dá 27. O painel mostra
o ETA calculado a partir do seu ritmo real.
</details>

<details>
<summary><b>Posso fechar o Chrome no meio?</b></summary>

Pode. O progresso é salvo. Ao reabrir, a varredura fica pausada esperando você clicar em
**Continuar** — ou retoma sozinha, se você tiver ligado "Retomar após reiniciar" nas Opções.
</details>

<details>
<summary><b>Onde foi parar a aba de Santa Catarina?</b></summary>

Ela foi removida na v5.0.0. Os 295 municípios catarinenses continuam todos lá, em
**Brasil → Santa Catarina**, agora com coordenadas reais e tier de pontos por população —
o mesmo tratamento dos outros 29 países. Nenhuma cobertura foi perdida.
</details>

<details>
<summary><b>Funciona no Firefox ou no Safari?</b></summary>

Não hoje. O projeto usa APIs MV3 do Chromium (`chrome.alarms`, `chrome.scripting`, service worker).
Uma porta para Firefox é bem-vinda como contribuição.
</details>

## Uso responsável e aviso legal

Esta ferramenta automatiza navegação em uma página pública, no seu próprio navegador, para uso
comercial legítimo de prospecção. Antes de usar, note que:

- Automatizar o Google Maps pode conflitar com os [Termos de Serviço do Google](https://policies.google.com/terms).
  **Você é responsável pelo uso que faz da ferramenta.**
- Dados de contato de empresas ainda podem ser dados pessoais. Se você está no Brasil, na UE ou no
  Reino Unido, o tratamento desses dados está sujeito a **LGPD/GDPR** — inclusive base legal,
  finalidade e direito de oposição.
- Respeite as regras de comunicação não solicitada da sua jurisdição (LGPD, GDPR, CAN-SPAM, CASL).
- Use ritmo moderado. Não sobrecarregue o serviço.

O projeto é fornecido "como está", sem garantias, sob a licença MIT. Os mantenedores não se
responsabilizam pelo uso feito por terceiros.

## Licença

[MIT](LICENSE) © 2026 [severoads3](https://github.com/severoads3)

Dados de cidades derivados do [GeoNames](https://www.geonames.org/) (CC BY 4.0) e do
[IBGE](https://www.ibge.gov.br/) (dados abertos). Bandeiras em SVG de domínio público.

---

<sub>**Palavras-chave:** extrator de leads google maps · google maps scraper · lead generation chrome extension ·
prospecção B2B · gerador de leads · google maps lead extractor · extrair contatos google maps ·
raspagem google maps · lista de empresas por cidade · exportar google maps para CSV ·
manifest v3 · ferramenta de prospecção gratuita · b2b lead scraper</sub>
