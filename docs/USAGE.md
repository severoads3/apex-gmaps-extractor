# Guia de uso

Como tirar o máximo do Apex Leads Extractor — da primeira varredura ao CSV pronto para o time comercial.

Ainda não instalou? Comece pelo [guia de instalação](INSTALL.md).

---

## Índice

- [O fluxo em 30 segundos](#o-fluxo-em-30-segundos)
- [1. Termos de busca](#1-termos-de-busca)
- [2. Seleção geográfica](#2-seleção-geográfica)
- [3. Modo de execução](#3-modo-de-execução)
- [4. Acompanhando a varredura](#4-acompanhando-a-varredura)
- [5. Exportando](#5-exportando)
- [A página de Resultados](#a-página-de-resultados)
- [Entendendo o CSV](#entendendo-o-csv)
- [Quanto tempo demora](#quanto-tempo-demora)
- [Boas práticas](#boas-práticas)
- [Problemas comuns](#problemas-comuns)

---

## O fluxo em 30 segundos

```
Termos → País → Estado → Cidades → Modo → Iniciar → (espera) → CSV
```

Tudo acontece no popup da extensão. Você pode fechar o popup: a varredura continua no service
worker. Reabra quando quiser para ver o progresso.

---

## 1. Termos de busca

Um termo por linha. Cada termo é buscado em **cada ponto de cobertura de cada cidade**.

```
loja de bicicletas
oficina de bicicletas
bicicletaria
```

**Por que usar mais de um termo?** O Google Maps categoriza negócios de forma inconsistente. Uma
oficina pode não aparecer buscando "loja de bicicletas". Termos complementares aumentam bastante a
cobertura real.

**O custo:** o tempo de varredura é multiplicado pelo número de termos. 3 termos = 3× o tempo.
Comece com 1 ou 2, veja o resultado, depois amplie.

**Dicas de termos:**

| Situação | Faça |
|---|---|
| Nicho amplo | Use o nome da categoria como o Maps a chama (ex.: `restaurante`, não `lugar pra comer`) |
| Nicho específico | Combine categoria + especialidade (`clínica odontológica`, `dentista`) |
| Termos ambíguos | Ative a [validação por IA](#validação-por-ia) — `scooter elétrica` traz oficina de carro sem ela |
| Testando | Rode 1 termo em 1 cidade pequena antes de comprometer horas |

---

## 2. Seleção geográfica

Três passos encadeados.

### Passo 1 — País

Clique na bandeira. São 30 países. Os dados daquele país são carregados na hora (nenhum outro é
lido — a extensão não carrega os 133 mil registros de uma vez).

### Passo 2 — Estado/província

O seletor popula com os estados do país escolhido, em ordem alfabética.

### Passo 3 — Cidades

A lista traz as **30 maiores cidades primeiro**, marcadas com **★**, e depois todas as demais em
ordem alfabética.

| Controle | O que faz |
|---|---|
| **Filtrar cidades…** | Busca por nome, ignorando acento e maiúscula |
| **Marcar estado inteiro** | Marca *todas* as cidades do estado — inclusive as fora do filtro |
| **Desmarcar estado** | Limpa *toda* a seleção do estado, não só o que está visível |

O contador logo abaixo mostra o total selecionado, **somando todos os estados e países** que você
marcou. Dá para montar uma varredura de várias regiões: marque cidades em SP, troque para MG, marque
mais, troque de país — tudo entra na mesma fila.

A seleção fica salva. Se você fechar o popup e reabrir, está tudo lá.

### Quantos pontos cada cidade recebe

A cobertura é automática, definida pela população da cidade:

| População | Pontos | Quais |
|---|---|---|
| < 50 mil | **3** | Centro, Norte, Sul |
| 50 mil – 500 mil | **5** | Centro, Norte, Sul, Leste, Oeste |
| > 500 mil | **9** | Os 5 acima + Nordeste, Noroeste, Sudeste, Sudoeste |

Cada ponto é uma busca separada, ancorada num deslocamento do centro real da cidade. É isso que faz
a extensão achar negócios que uma busca única deixaria de fora.

---

## 3. Modo de execução

### Executar em Blocos *(padrão, recomendado)*

A cada **5 cidades** (configurável em Opções), a varredura **pausa** e **exporta um CSV parcial**.
Você clica em **Continuar** para seguir.

Use isso quando: a varredura é longa, você quer resultado incremental, ou quer poder parar sem perder
nada.

### Executar Tudo (Contínuo)

Vai do começo ao fim sem parar, e exporta um CSV único no final.

Use isso quando: a varredura é curta, ou você vai deixar a máquina rodando sozinha.

### Acumular com a coleta anterior

Checkbox independente do modo. Quando marcado, os leads novos **somam** aos que já estavam
armazenados, em vez de zerar.

Use isso quando: você quer juntar várias varreduras (termos diferentes, regiões diferentes) em um
CSV só. A deduplicação continua valendo — o mesmo negócio não entra duas vezes.

---

## 4. Acompanhando a varredura

Ao clicar em **Iniciar**, a extensão abre uma **aba de trabalho** no Google Maps e começa.

> Deixe a janela do Chrome aberta. Pode minimizar, pode usar outras abas normalmente — só não
> feche o navegador (ou, se fechar, veja "Retomar após reiniciar" nas Opções).
>
> **Não interaja com a aba de trabalho.** Ela é controlada pela extensão.

O painel mostra:

| Indicador | Significado |
|---|---|
| **Linha de status** | O que está acontecendo agora: cidade, ponto e termo |
| **Barra de progresso** | Percentual de tarefas concluídas |
| **Leads únicos** | Quantos negócios distintos já entraram (já deduplicados) |
| **Buscas** | Tarefas concluídas / total. Uma tarefa = 1 cidade × 1 ponto × 1 termo |
| **Cidades concluídas** | Quantas cidades terminaram todos os pontos |
| **Falhas** | Buscas que deram timeout ou erro. Recuperáveis depois |
| **ETA** | Estimativa de tempo restante, calculada do seu ritmo real |
| **Log** | As últimas 10 mensagens |

### Controles durante a varredura

| Botão | O que faz |
|---|---|
| **Pausar** / **Continuar** | Para depois da tarefa atual, sem perder nada |
| **Parar e Exportar** | Encerra a varredura e baixa o CSV com tudo que coletou |
| **Exportar agora** | Baixa um CSV do que já tem, **sem parar** a varredura |
| **Repetir falhas** | Aparece ao fim se houve falhas. Re-enfileira só as buscas que falharam, com a mesma precisão geográfica |
| **Nova busca (zerar tudo)** | ⚠️ Apaga os leads e zera a seleção. Pede confirmação (clique duas vezes) |

---

## 5. Exportando

O CSV baixa automaticamente:

- ao **concluir** a varredura;
- ao fim de cada **bloco**, no modo Blocos;
- quando você clica em **Parar e Exportar** ou **Exportar agora**.

Nome do arquivo: `leads_<termo>_<regiao>_<AAAA-MM-DD>_<HHMM>.csv`

O `<regiao>` é o estado, se você varreu um só (ex.: `sp`); o país, se foram vários estados de um
país (ex.: `us`); ou `multi`, se foram vários países.

---

## A página de Resultados

Botão **Resultados** no topo do popup. Abre uma aba com todos os leads em uma tabela:

- **Ordenável** por qualquer coluna (clique no cabeçalho; clique de novo inverte);
- **Filtrável** por nome, categoria ou endereço;
- Com uma coluna **Score** — uma priorização comercial simples: `nota × log(1 + avaliações)`.
  Negócio bem avaliado e com volume de avaliações sobe; negócio sem avaliação nenhuma desce.
- Com botão de exportar a visão atual.

Serve para triar antes de mandar o CSV para o time.

---

## Entendendo o CSV

Separado por `;`, com BOM UTF-8 — abre no Excel com acentuação correta, sem importação manual.

### Colunas sempre presentes

| Coluna | O que é |
|---|---|
| `Nome` | Nome do negócio no Maps |
| `Categoria` | Categoria que o Maps atribui |
| `Telefone` | Como exibido pelo Maps |
| `Endereco` | Como exibido pelo Maps |
| `Nota` | Nota média (ex.: `4,5`) |
| `Avaliacoes` | Número de avaliações |
| `Cidade` / `Estado` / `Pais` | De onde o lead veio |
| `Quadrante` | Qual ponto de cobertura achou o lead (Centro, Norte…) |
| `Termo` | Qual termo trouxe o lead |
| `TelefoneNormalizado` | Só dígitos, E.164 com DDI do país (ex.: `5548999998888`) |
| `WhatsApp` | Link `wa.me` pronto. Vazio se o número não for válido para o país |
| `Site` | Site do negócio, se houver |
| `Lat` / `Lng` | Coordenadas do lead |
| `LinkMaps` | Link direto para a ficha no Maps |
| `DataColeta` | Quando foi coletado |

### Colunas da IA (só com chave da Groq configurada)

| Coluna | O que é |
|---|---|
| `Relevancia` | Julgamento da IA sobre o lead pertencer ao ramo buscado |
| `NomeLimpo` | Nome comercial normalizado (sem ruído de formatação) |
| `Segmento` | Segmento de mercado inferido |
| `TipoNegocio` | Tipo de operação |
| `Prioridade` | `A`, `B` ou `C` — o CSV vem ordenado por isso |
| `Abordagem` | Uma mensagem de primeiro contato sugerida |

### Validação por IA

Sem chave, essas colunas vêm vazias e nenhum lead é removido.

Com uma chave da [Groq](https://console.groq.com/keys) (plano gratuito serve) colada em **Opções**,
cada lead é avaliado **contra o termo que você buscou** — não contra uma lista fixa de palavras.
Leads claramente de outro ramo são **removidos** do CSV.

Isso resolve o problema clássico: buscar `scooter elétrica` e receber oficina de carro, porque o
Google expandiu a busca sozinho.

> A chave fica só na sua máquina, em `chrome.storage.local`. Nunca aparece no CSV nem em log.

---

## Quanto tempo demora

Uma **tarefa** = 1 cidade × 1 ponto × 1 termo, e leva tipicamente **15 a 40 segundos** (depende do
número de resultados, do seu intervalo configurado e da velocidade da sua conexão).

Fórmula: `tarefas = Σ(pontos de cada cidade) × número de termos`

| Cenário | Tarefas | Tempo aproximado |
|---|---|---|
| 1 cidade pequena, 1 termo | 3 | ~1,5 min |
| 1 capital, 1 termo | 9 | ~5 min |
| 10 cidades médias, 1 termo | 50 | ~25 min |
| 10 cidades médias, 3 termos | 150 | ~1h15 |
| Estado inteiro (295 cidades), 1 termo | ~950 | ~8 horas |

Use o **ETA** no painel — ele calcula pelo seu ritmo real, não por estes números genéricos.

Para varreduras de várias horas, use o **modo Blocos**: você tem CSV parcial a cada 5 cidades e pode
parar quando quiser.

---

## Boas práticas

**Comece pequeno.** Uma cidade, um termo. Veja o CSV. Ajuste o termo. Só então escale.

**Perfil limpo do Chrome.** Sem conta Google logada e sem permissão de localização para
`google.com` — reduz a contaminação por negócios da *sua* cidade. Veja
[INSTALL.md, passo 4](INSTALL.md#passo-4--prepare-o-perfil-do-chrome-recomendado).

**Respeite o ritmo.** Se o Google pedir verificação, a extensão pausa e avisa. Aumente o intervalo
entre buscas nas Opções (8–15 s) e varra menos por sessão. Correr mais rápido não termina antes —
termina bloqueado.

**Use o modo profundo com parcimônia.** Ele abre a ficha de cada lead sem telefone, o que
completa dados mas **multiplica o tempo**. Ligue em varreduras pequenas de alto valor.

**Filtro de raio é seu amigo.** O padrão de 20 km existe porque o Google enche a lista com negócios
da região quando a cidade tem poucos resultados. Se estiver varrendo uma região metropolitana onde
o "vizinho" é legítimo, aumente. Se quer só a cidade, diminua.

**Acumule por termo, não por sessão.** Rode um termo por vez com "Acumular" marcado. Fica mais fácil
diagnosticar qual termo trouxe o quê.

**Exporte antes de mexer.** "Nova busca (zerar tudo)" apaga mesmo. Exporte primeiro.

---

## Problemas comuns

<details>
<summary><b>Vieram muitos leads de outra cidade</b></summary>

Duas causas possíveis:

1. **Viés de localização do seu perfil.** Rode num perfil sem conta Google logada e revogue a
   permissão de localização de `google.com`.
2. **Raio muito grande.** Diminua **Raio da cidade (km)** nas Opções. O padrão de 20 km é generoso
   para cidades pequenas.

A coluna `Cidade` do CSV mostra a cidade que a extensão estava varrendo; `Endereco` mostra onde o
negócio realmente está. Comparar as duas diagnostica rápido.
</details>

<details>
<summary><b>Vieram poucos leads</b></summary>

- **Termo muito específico?** Teste o termo direto no Google Maps e veja quantos resultados dão.
- **Cidade pequena?** 3 pontos numa cidade de 5 mil habitantes pode render 10 leads. É o mercado.
- **Filtro de raio cortando demais?** Cheque o log: ele registra "N fora do raio da cidade,
  descartados".
- **IA removendo demais?** Se a chave da Groq está configurada, ela remove o que julga de outro ramo.
  Teste sem a chave para comparar.
</details>

<details>
<summary><b>Muitos leads sem telefone</b></summary>

Nem todo negócio publica telefone no Maps. Ligue o **Modo profundo** nas Opções: ele abre a ficha
individual de cada lead sem telefone ao fim da cidade e tenta completar. Custa tempo.
</details>

<details>
<summary><b>Apareceram falhas no contador</b></summary>

Normal em varreduras longas — timeout, página lenta, um soluço do Maps. Ao fim, clique em
**Repetir falhas**: a extensão re-enfileira só as buscas que falharam, mantendo país, estado e
coordenadas originais.
</details>

<details>
<summary><b>O Google pediu verificação</b></summary>

A extensão detecta, pausa e notifica. Vá na aba de trabalho, resolva manualmente, volte ao popup e
clique em **Continuar**. Depois, aumente o intervalo entre buscas.
</details>

<details>
<summary><b>Fechei o Chrome no meio</b></summary>

O progresso está salvo. Ao reabrir, a varredura fica **pausada** esperando você clicar em
**Continuar** — ou retoma sozinha, se "Retomar após reiniciar o navegador" estiver ligado nas Opções.
</details>

---

Próximo passo: [ajustar as opções](CONFIGURATION.md) ou [entender como funciona por dentro](ARCHITECTURE.md).
