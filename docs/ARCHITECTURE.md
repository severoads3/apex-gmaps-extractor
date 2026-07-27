# Arquitetura

Como o Apex Leads Extractor funciona por dentro. Leitura recomendada antes de abrir um PR.

O código e os comentários estão em **português**. Os comentários explicam o *porquê* das decisões —
muitos registram um caso real que motivou o tratamento. Vale ler.

---

## Índice

- [Visão geral](#visão-geral)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [O modelo de cobertura](#o-modelo-de-cobertura)
- [A máquina de estados](#a-máquina-de-estados)
- [Protocolo de mensagens](#protocolo-de-mensagens)
- [Precisão geográfica: três camadas](#precisão-geográfica-três-camadas)
- [Deduplicação](#deduplicação)
- [Formato dos dados de países](#formato-dos-dados-de-países)
- [Adicionando um país](#adicionando-um-país)
- [Armazenamento](#armazenamento)
- [Resiliência](#resiliência)
- [Validação por IA](#validação-por-ia)
- [Testes](#testes)
- [Decisões de projeto](#decisões-de-projeto)

---

## Visão geral

```
┌─────────────────────────────────────────────────────────────────┐
│ popup.js                                                        │
│  seleção país → estado → cidades                                │
│  monta o payload: nome, estado, país, pontos, lat/lng, DDI      │
└────────────────────────┬────────────────────────────────────────┘
                         │  chrome.runtime.sendMessage
                         │  {cmd:"start", cidades[], termos[], modo, acumular}
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ background.js  (service worker MV3)                             │
│                                                                 │
│  fila: cidade → ponto de cobertura → termo                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ monta a URL do Maps (ancorada em @lat,lng,zoom)           │  │
│  │ abre/reusa a aba de trabalho                              │  │
│  │ injeta content.js via chrome.scripting                    │  │
│  │ recebe os leads, deduplica, filtra por raio               │  │
│  │ agenda a próxima tarefa (delay aleatório)                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  + watchdog (chrome.alarms) · CSV · notificações · IA opcional  │
└────────────────────────┬────────────────────────────────────────┘
                         │  chrome.scripting.executeScript
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ content.js  (roda em google.com/maps)                           │
│  identifica o cenário: feed · ficha única · vazio · bloqueio    │
│  scroll infinito com colheita incremental                       │
│  extrai nome, categoria, telefone, endereço, nota, coords       │
│  devolve os leads via chrome.runtime.sendMessage                │
└─────────────────────────────────────────────────────────────────┘
```

**Nenhuma requisição de rede em runtime** além do próprio Google Maps — e da API da Groq, se o
usuário configurar uma chave. Os dados de cidades já vêm embarcados no pacote.

---

## Estrutura de arquivos

```
apex-gmaps-extractor/
├── manifest.json           MV3: permissões, service worker, popup, options
├── popup.html/.css/.js     UI principal e seleção geográfica
├── background.js           service worker: fila, dedup, CSV, IA, watchdog
├── content.js              extração na página do Maps
├── options.html/.js        página de configurações
├── resultados.html/.js     tabela de leads no navegador
├── data/paises/
│   ├── index.js            PAISES_INDEX: iso2, nome, bandeira (carregado sempre)
│   └── <ISO2>.json         estados + cidades de um país (carregado sob demanda)
├── icons/
│   ├── icon{16,32,48,128}.png
│   └── flags/<iso2>.svg    bandeiras dos 30 países
├── scripts/
│   ├── paises-config.js    a lista de países suportados (edite aqui)
│   └── gerar-paises.js     gerador dos dados a partir de GeoNames + IBGE
├── tests/
│   ├── harness-background.js
│   ├── harness-content.js
│   └── harness-paises.js
└── docs/                   INSTALL · USAGE · CONFIGURATION · ARCHITECTURE
```

Não há build step. O que está no repositório é exatamente o que o Chrome carrega.

---

## O modelo de cobertura

A ideia central do projeto: **uma busca por cidade não é suficiente**.

O Google Maps só retorna o que cabe na viewport atual. Uma busca por "padaria" em Joinville retorna
as padarias perto do centro do mapa, não todas as padarias de Joinville.

A solução são **pontos de cobertura**: a mesma busca é repetida com o mapa deslocado em torno do
centro da cidade.

```
        Noroeste    Norte    Nordeste
                 ╲    │    ╱
          Oeste ──── Centro ──── Leste
                 ╱    │    ╲
        Sudoeste    Sul     Sudeste
```

Quantos pontos cada cidade recebe depende da **população**:

| População | Pontos | Constante em `background.js` |
|---|---|---|
| < 50.000 | 3 (Centro, Norte, Sul) | `PONTOS_PADRAO` |
| 50.000 – 500.000 | 5 (+ Leste, Oeste) | `PONTOS_PRINCIPAIS` |
| > 500.000 | 9 (+ as 4 diagonais) | `PONTOS_TODOS` |

Os limiares vivem em `popup.js` (`LIMIAR_5_PONTOS`, `LIMIAR_9_PONTOS`) e o tier é calculado por
`pontosPorPop(pop)` no momento de montar o payload.

O deslocamento de cada ponto é `DESLOCAMENTOS[ponto] × [deltaLat, deltaLng]` da configuração.

> **As diagonais exigem centro calibrado.** Não existe fallback textual para elas: buscar
> `"termo Nordeste cidade"` geocodifica para uma *região*, não para um quadrante. Se o centro da
> cidade não pôde ser determinado, a cidade é rebaixada para 5 pontos.

**A fila só avança quando a cidade termina.** Todos os pontos × todos os termos de uma cidade rodam
antes de a próxima começar. Isso mantém o CSV parcial coerente e torna a pausa por bloco previsível.

---

## A máquina de estados

`background.js` é uma máquina de estados persistida em `chrome.storage.local`, porque o service
worker MV3 **dorme** a qualquer momento. Nada pode viver só em memória.

### Status da varredura

| Status | Significado |
|---|---|
| `idle` | Parado. Sem fila ativa |
| `running` | Varrendo |
| `paused` | Usuário pausou |
| `waiting_block` | Bloco fechou, CSV parcial exportado, esperando **Continuar** |
| `done` | Fila terminou, CSV final exportado |

### Fases dentro de uma tarefa

Uma tarefa (1 cidade × 1 ponto × 1 termo) passa por:

```
fase = null  →  "aguardando_navegacao"  →  "injetando"  →  "aguardando_extracao"  →  fase = null
```

`estado.faseTimestamp` marca quando a fase começou. Se uma fase passa de `FASE_TRAVADA_MS`
(3 minutos), o **watchdog** a resgata como falha, fecha a aba e segue a fila.

### Índices da fila

| Campo | O que é |
|---|---|
| `filaCidades[]` | Nomes das cidades, na ordem |
| `filaMeta[]` | Metadados por cidade: `{estado, pais, paisBusca, pontos, lat, lng, ddi, tamanhos, tronco}` |
| `cidadeAtualIndex` | Onde estamos na fila |
| `pontosCidadeAtual[]` | Os pontos desta cidade (3, 5 ou 9) |
| `pontoAtualIndex` | Qual ponto |
| `termoAtualIndex` | Qual termo |
| `falhas[]` | Falhas com o **meta completo**, para o retry manter a mesma precisão |

O `filaMeta` é a razão de o retry funcionar direito: uma cidade internacional que falha volta com
seu país, estado e coordenadas — não como uma busca textual genérica.

---

## Protocolo de mensagens

### Popup → background (`msg.cmd`)

| Comando | Efeito |
|---|---|
| `start` | Inicia a varredura com `{cidades[], termos[], modo, acumular}` |
| `pause` / `resume` | Pausa após a tarefa atual / retoma |
| `stop_export` | Encerra e exporta o CSV |
| `export_now` | Exporta sem parar |
| `retry_failures` | Re-enfileira só as falhas, com o meta preservado |
| `reset` | Zera tudo: leads, dedup, fila, seleção |

### Content → background (`msg.tipo`)

| Mensagem | Quando |
|---|---|
| `extracao_parcial` | A cada rodada de scroll — não perde o que já carregou se der timeout |
| `extracao_concluida` | Fim da extração. Traz `leads[]` e `centro` (lido da URL `@lat,lng,zoom`) |
| `bloqueio_detectado` | A página caiu em `consent.google` ou `/sorry/` (verificação/CAPTCHA) |

O popup **não** faz polling: ele lê `chrome.storage.local` e escuta `chrome.storage.onChanged` para
a chave `estado`. Por isso pode ser fechado e reaberto sem afetar nada.

### Payload de cidade

Montado por `construirPayloadCidades()` em `popup.js`:

```js
{
  nome: "Curitiba",
  estado: "PR",
  pais: "BR",
  paisBusca: "Brasil",   // sufixo usado na URL de busca do Maps
  pontos: 9,             // 3, 5 ou 9 — derivado da população
  lat: -25.4284,
  lng: -49.2733,
  ddi: "55",
  tamanhos: [10, 11],    // comprimentos válidos do número nacional
  tronco: "0"            // prefixo removido antes de montar o E.164
}
```

`background.js` também aceita um formato legado (array de nomes de cidade), tratado como BR com o
fallback `config.uf`. Ele existe para compatibilidade e continua coberto por testes, mas o popup
atual nunca o usa.

---

## Precisão geográfica: três camadas

O problema real que motivou isso: varrendo Tubarão (SC) a partir de uma máquina em Balneário
Camboriú, **106 dos 119 leads** eram de BC. O Google usa a localização do *usuário* para completar
buscas com poucos resultados.

Três defesas independentes, todas ativas ao mesmo tempo:

### 1. Nome da cidade sempre no texto da busca

Mesmo nas buscas ancoradas por viewport, a query textual carrega o qualificador:

- Brasil: `termo cidade UF`
- Internacional: `termo cidade, estado, país`

O texto prende a **intenção** na cidade pesquisada, contra o viés de localização do perfil.

### 2. Viewport ancorada nas coordenadas reais

A URL do Maps recebe `@lat,lng,<zoom>z` com as coordenadas reais da cidade (vindas de
`data/paises/`) e um zoom fechado. O viewport prende o **mapa**.

Sem coordenadas nos dados, a extensão cai no modo antigo: o ponto Centro é uma busca textual pura
que **calibra** o centro (lido de volta da URL pelo `content.js`), e os pontos seguintes usam esse
centro calibrado.

### 3. Filtro de raio na mesclagem

Cada lead traz suas próprias coordenadas, extraídas do `href` do card. Lead além de
`raioCidadeKm` do centro da cidade é **descartado** e o log registra quanto caiu.

- Metrópoles (9 pontos) usam raio ×1,75 automaticamente.
- `raioCidadeKm = 0` desliga.
- Lead sem coordenadas passa — não há como julgar.

O filtro prende a **lista final**.

---

## Deduplicação

Três índices, mantidos em `dedup` e reconstruíveis a partir do array de leads:

| Índice | Chave |
|---|---|
| `porId` | `placeId` — o identificador do Google. Mais forte |
| `porNomeFone` | `nome normalizado \| telefone` |
| `porNome` | `escopo + nome normalizado` |

**O escopo importa.** Chaves sem telefone são prefixadas por `pais\|estado\|cidade` normalizado,
porque "Springfield" existe em vários estados e "Auto Center" existe em toda cidade. Sem escopo,
negócios distintos com nome igual seriam mesclados indevidamente.

Quando um lead novo casa com um existente, os campos vazios do registro antigo são completados
pelos do novo (o lead pode ter sido visto sem telefone no ponto Norte e com telefone no Centro).

---

## Formato dos dados de países

### `data/paises/index.js`

Carregado sempre, no `<script>` do `popup.html`. Só o essencial para desenhar a grade de bandeiras:

```js
const PAISES_INDEX = [
  { "iso2": "BR", "nome": "Brasil", "bandeira": "icons/flags/br.svg" },
  ...
];
```

### `data/paises/<ISO2>.json`

Carregado sob demanda (via `fetch(chrome.runtime.getURL(...))`) e cacheado em memória:

```jsonc
{
  "nome": "Brasil",
  "nomeBusca": "Brasil",        // sufixo usado na URL do Maps
  "ddi": "55",
  "telefone": { "tamanhos": [10, 11], "tronco": "0" },
  "estados": { "PR": "Paraná", "SC": "Santa Catarina", ... },
  "cidades": {
    "PR": [
      ["Curitiba", 1773718, -25.4284, -49.2733],   // [nome, população, lat, lng]
      ["Londrina",  575377, -23.3103, -51.1628],
      ...
    ]
  }
}
```

**Invariantes** (validados por `tests/harness-paises.js`):

- `cidades[estado]` está ordenado por **população decrescente** — as 30 primeiras são as "★" da UI;
- ≥ 90% das cidades têm coordenadas numéricas;
- coordenadas dentro de faixa válida (`|lat| ≤ 90`, `|lng| ≤ 180`);
- nenhum estado vazio;
- Brasil tem os 5.571 municípios do IBGE.

Total embarcado hoje: **30 países, 578 estados/províncias, ~133 mil cidades**.

---

## Adicionando um país

1. **Uma linha** em [`scripts/paises-config.js`](../scripts/paises-config.js):

   ```js
   { iso2: "SE", nome: "Suécia", nomeBusca: "Sverige", ddi: "46", tamanhos: [7, 8, 9], tronco: "0" },
   ```

   | Campo | O que é |
   |---|---|
   | `iso2` | ISO-3166 alpha-2. Precisa bater com o `country_code` do GeoNames |
   | `nome` | Exibição na UI, em pt-BR |
   | `nomeBusca` | Sufixo na URL do Maps. Use o nome no idioma local ou em inglês |
   | `ddi` | Código telefônico internacional, sem `+` |
   | `tamanhos` | Comprimentos válidos do número **nacional**, sem DDI |
   | `tronco` | Prefixo removido antes de montar o E.164 (`""` ou `"0"`) |
   | `fonte` | `"geonames"` (padrão) ou `"ibge"` (só o Brasil) |

2. **Bandeira** em `icons/flags/<iso2 minúsculo>.svg` — SVG de domínio público, proporção 4:3.

3. **Gere os dados.** Baixe `cities500.txt` e `admin1CodesASCII.txt` do
   [GeoNames](https://download.geonames.org/export/dump/) em `scripts/geonames_tmp/`
   (veja o cabeçalho de [`scripts/gerar-paises.js`](../scripts/gerar-paises.js)) e rode:

   ```bash
   npm run build:paises
   ```

4. **Valide:** `npm test` — o `harness-paises.js` checa a estrutura do arquivo gerado.

5. **Teste no navegador:** a bandeira aparece, o seletor de estado popula, e uma cidade gera uma
   URL de busca correta.

Commite os `data/paises/<ISO2>.json` gerados — o usuário final não roda o gerador.

> A geração acontece **só em desenvolvimento**. O runtime nunca acessa rede para obter dados
> geográficos: é determinístico, offline e sem CORS.

---

## Armazenamento

O estado é **dividido em duas chaves** de propósito:

| Chave | Conteúdo | Frequência de escrita |
|---|---|---|
| `estado` | Fila, índices, contadores, log, falhas | Alta — a cada log e a cada tarefa |
| `leads` + `dedup` | Os leads e seus índices | Baixa — só quando chegam leads |

Sem essa divisão, cada linha de log reescreveria megabytes de leads. Daí também a permissão
`unlimitedStorage`.

Outras chaves: `config` (opções) e `uiPrefs` (seleção da UI, restaurada ao reabrir o popup).

---

## Resiliência

O service worker MV3 dorme. A extensão foi construída assumindo isso.

| Mecanismo | O que resolve |
|---|---|
| **Watchdog** (`chrome.alarms`) | Fase parada há mais de 3 min é resgatada como falha; a fila segue |
| **Timeout por alarme** | `chrome.alarms` sobrevive ao worker dormir; `setTimeout` não. O caminho rápido usa `setTimeout`, mas sempre com um alarme de rede de segurança |
| **Estado persistido** | Todo avanço da fila é gravado antes de continuar |
| **`onStartup` / `onInstalled`** | Ao reabrir o navegador, a varredura fica pausada — ou retoma, se `autoRetomar` |
| **Aba de trabalho rastreada** | `tabs.onRemoved` detecta o usuário fechando a aba e trata como falha |
| **Detecção de bloqueio** | `consent.google` ou `/sorry/` pausam a varredura e notificam |
| **Falhas com meta completo** | O retry re-enfileira com país, estado e coordenadas originais |

---

## Validação por IA

Opcional, desligada por padrão. Ativada por uma chave da Groq nas Opções.

- **Endpoint:** `https://api.groq.com/openai/v1/chat/completions`
- **Modelo:** `llama-3.3-70b-versatile`
- **Enviado:** o termo buscado e, por lead do lote, nome, categoria e endereço. Nada mais.
- **Recebido:** para cada lead — relevância, nome limpo, segmento, tipo de negócio,
  prioridade (A/B/C) e uma mensagem de abordagem.

Leads julgados de outro ramo são **removidos**; o CSV sai ordenado por prioridade.

O prompt classifica **contra o termo que o usuário buscou** — deliberadamente sem whitelist por
nicho, para a extensão não precisar de manutenção a cada novo segmento.

Falha de rede, chave inválida ou resposta malformada são registradas no console e **ignoradas**: a
varredura segue sem o filtro. A IA nunca é caminho crítico.

---

## Testes

```bash
npm test
```

Node puro, sem navegador, sem dependências.

| Harness | Como funciona |
|---|---|
| `harness-background.js` | Faz stub completo da API `chrome.*` (storage, alarms, tabs, scripting, runtime, downloads, notifications) e executa o `background.js` **real** via `new Function("chrome", code)`. Exercita a máquina de estados inteira: fila, calibração de centro, viewport, multi-termo, parciais, falhas, retry, filtro de raio, dedup, blocos, CSV e reset |
| `harness-content.js` | Extrai funções reais do `content.js` por análise de texto e as roda contra HTML sintético do Maps |
| `harness-paises.js` | Valida os arquivos de `data/paises/`: estrutura, ordenação, coordenadas, completude |

O padrão de asserção é um `assert(condicao, "Tn: rótulo")` simples. Ao adicionar um cenário, use o
próximo número de `T` livre e coloque no fim da sequência.

**Toda mudança de comportamento no `background.js` ou no `content.js` precisa de asserção nova.**
Para bug, escreva primeiro a asserção que falha.

---

## Decisões de projeto

Fronteiras deliberadas. Se você discorda de alguma, abra uma issue de discussão antes do PR.

| Decisão | Por quê |
|---|---|
| **Zero dependências** | A extensão precisa ser auditável linha a linha por quem a instala em modo desenvolvedor |
| **Sem build step** | O que está no repositório é o que roda. Nada de "confie no bundle" |
| **Português no código** | Consistência com o que já existe vale mais que preferência individual |
| **Sem backend, sem telemetria** | Leads são dados de terceiros. Eles não saem da máquina do usuário |
| **Sem API paga** | Places API, enriquecimento de CNPJ e afins ficaram de fora para a ferramenta continuar gratuita |
| **CSV, não XLSX** | Universal, sem biblioteca pesada, abre no Excel com o BOM |
| **Delays aleatórios não negociáveis** | Rodar mais rápido não termina antes — termina bloqueado |
| **A IA nunca é caminho crítico** | Se a Groq falhar, a varredura continua |

---

Dúvida sobre alguma parte? [Abra uma issue](https://github.com/severoads3/apex-gmaps-extractor/issues/new/choose)
— documentar melhor é sempre bem-vindo.
