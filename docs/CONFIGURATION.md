# Guia de configuração

Referência de cada opção da extensão: o que faz, quando mexer e o que acontece se você exagerar.

**Onde ficam:** botão **Opções** no topo do popup, ou `chrome://extensions` → card da extensão →
**Detalhes** → **Opções da extensão**.

> As opções valem **a partir da próxima busca**. Alterar no meio de uma varredura não afeta a
> tarefa em andamento.
>
> O botão **Restaurar padrões** devolve tudo aos valores de fábrica e salva na hora.

---

## Ritmo da coleta

### Intervalo mínimo / máximo entre buscas

| | |
|---|---|
| **Padrão** | 3 s / 7 s |
| **Faixa** | 1–120 s / 1–300 s |

Antes de cada busca, a extensão espera um tempo **aleatório** entre esses dois valores. O sorteio
existe para o padrão de acesso não ficar mecânico.

**Quando aumentar:** se o Google pedir verificação/CAPTCHA. Tente **8–15 s**. Se persistir, 20–30 s.

**Quando diminuir:** raramente vale a pena. Você economiza minutos e arrisca horas.

> O mínimo não pode ser maior que o máximo — a extensão recusa salvar.

### Timeout de extração por busca

| | |
|---|---|
| **Padrão** | 90 s |
| **Faixa** | 30–600 s (passo de 10) |

Tempo máximo esperando o resultado de uma página. Estourou, a busca vira **falha** e a fila segue —
você pode recuperar depois com **Repetir falhas**.

**Quando aumentar:** conexão lenta, ou muitas falhas por timeout em cidades grandes (onde o scroll
infinito demora mais).

**Quando diminuir:** se você prefere que buscas problemáticas falhem rápido em vez de segurar a fila.

### Tamanho do bloco (cidades)

| | |
|---|---|
| **Padrão** | 5 cidades |
| **Faixa** | 1–50 |

No modo **Blocos**, a varredura pausa e exporta um CSV parcial a cada N cidades concluídas.

**Quando diminuir:** varreduras longas que você quer poder abandonar a qualquer momento (2 ou 3).

**Quando aumentar:** você não quer ser interrompido tanto (10, 15).

Não afeta o modo Contínuo.

---

## Cobertura geográfica

Estas opções controlam **onde** cada ponto de cobertura cai no mapa. Os padrões foram calibrados
para cidades brasileiras de porte médio. Mexer sem motivo piora o resultado.

### Deslocamento Norte/Sul (graus de latitude)

| | |
|---|---|
| **Padrão** | 0.03° (≈ 3,3 km) |
| **Faixa** | 0.01–0.2 |

Distância dos pontos Norte e Sul em relação ao centro da cidade.

### Deslocamento Leste/Oeste (graus de longitude)

| | |
|---|---|
| **Padrão** | 0.03° |
| **Faixa** | 0.01–0.2 |

Idem para Leste e Oeste.

> ⚠️ Um grau de longitude encolhe conforme você se afasta do Equador. 0.03° são ~3,3 km em
> Fortaleza e ~2,3 km em Porto Alegre. Se você varre países muito ao norte ou ao sul e os pontos
> parecem colados, aumente um pouco.

**Quando aumentar:** cidades geograficamente grandes e espalhadas — os pontos ficam perto demais e
retornam os mesmos negócios.

**Quando diminuir:** cidades pequenas — os pontos caem fora do perímetro urbano e trazem o
município vizinho.

### Zoom dos pontos de cobertura

| | |
|---|---|
| **Padrão** | 14 |
| **Faixa** | 11–16 |

Quanto o mapa "fecha" em cada ponto. `14` faz uma cidade média preencher a tela.

- **Maior (15, 16)** = mais fechado. Resultados mais precisos, menos abrangência por busca.
- **Menor (11, 12)** = mais aberto. Mais abrangência, mais chance de trazer negócio da região.

### Raio da cidade (km)

| | |
|---|---|
| **Padrão** | 20 km |
| **Faixa** | 0–200 (passo de 5) |

**A opção mais importante para a qualidade do CSV.**

Quando uma cidade tem poucos resultados para o termo, o Google **expande a busca sozinho** e enche
a lista com negócios de toda a região vizinha. O filtro de raio corta isso: cada lead traz suas
próprias coordenadas, e quem estiver além do raio do centro da cidade é **descartado**.

- Metrópoles (as de 9 pontos) usam raio **×1,75** automaticamente.
- `0` **desliga** o filtro.
- Lead sem coordenadas no link não é descartado — não há como julgar.

O log registra os descartes: `"N fora do raio da cidade, descartados"`.

**Quando aumentar:** você está varrendo uma região metropolitana onde o negócio da cidade vizinha
é um lead legítimo.

**Quando diminuir:** você quer estritamente a cidade. Em cidades pequenas, 10 km costuma ser mais
honesto que 20.

---

## Modo profundo (enriquecimento)

### Visitar a ficha de leads sem telefone

| | |
|---|---|
| **Padrão** | desligado |

Ao terminar todos os pontos de uma cidade, a extensão abre a **ficha individual** de cada lead que
ficou sem telefone e tenta extrair o dado de lá.

**Ganho:** mais leads com contato.
**Custo:** cada ficha é uma navegação a mais, com o mesmo intervalo entre buscas. Em uma cidade com
50 leads sem telefone, são 50 navegações extras.

**Quando ligar:** varreduras pequenas, de alto valor, onde telefone é obrigatório.
**Quando deixar desligado:** varreduras amplas, onde volume importa mais que completude.

### Limite de fichas por cidade

| | |
|---|---|
| **Padrão** | 150 |
| **Faixa** | 1–150 |

Teto de fichas visitadas por cidade no modo profundo. Impede que uma capital com centenas de leads
sem telefone trave a fila por horas.

---

## Comportamento

### Notificações do sistema

| | |
|---|---|
| **Padrão** | ligado |

Notificações nativas do sistema operacional quando:

- a varredura **conclui**;
- um **bloco** fecha (modo Blocos) e está esperando você;
- o Google pede **verificação/CAPTCHA**.

**Deixe ligado.** A notificação de verificação é o que evita você descobrir horas depois que a
varredura estava parada.

### Retomar sozinho após reiniciar o navegador

| | |
|---|---|
| **Padrão** | desligado |

- **Desligado:** ao reabrir o Chrome, a varredura fica **pausada** esperando você clicar em
  **Continuar**. Nada se perde.
- **Ligado:** ela retoma sozinha, sem perguntar.

**Quando ligar:** varreduras de muitas horas em uma máquina que você não acompanha, ou que reinicia
por atualização do sistema.

**Quando deixar desligado:** você quer controle sobre quando o navegador começa a automatizar
sozinho. É o padrão por segurança.

---

## Validação por IA (opcional)

### Chave da API Groq

| | |
|---|---|
| **Padrão** | vazio (recurso desligado) |

Cole aqui uma chave da [Groq](https://console.groq.com/keys) (começa com `gsk_`; o plano gratuito
atende) para ligar a validação e o enriquecimento por IA.

**Com a chave configurada**, cada lote de leads é avaliado contra **o termo que você buscou** — sem
lista fixa de palavras por nicho — e a extensão:

1. **Remove** os leads claramente de outro ramo;
2. **Enriquece** os que ficam com `NomeLimpo`, `Segmento`, `TipoNegocio`, `Prioridade` (A/B/C) e
   `Abordagem` (mensagem de primeiro contato);
3. **Ordena** o CSV por prioridade.

**Sem a chave**, nada muda: nenhum lead é removido e essas colunas saem vazias.

**Modelo usado:** `llama-3.3-70b-versatile`, via `https://api.groq.com/openai/v1/chat/completions`.

**O que é enviado à Groq:** o termo buscado e, para cada lead do lote, nome, categoria e endereço.
Nada mais — nem telefone, nem sua chave em log, nem qualquer identificador seu.

> 🔐 **Privacidade da chave**
>
> - Fica em `chrome.storage.local`, **na sua máquina**.
> - Nunca aparece no CSV, no log da extensão ou no console.
> - Nunca é enviada para lugar nenhum além da própria API da Groq.
> - **Não está e nunca estará neste repositório.** O campo é do tipo `password` e não é preenchido
>   por padrão.
>
> Se a Groq estiver fora do ar ou a chave for inválida, a extensão apenas registra o erro e segue
> sem o filtro. A varredura não quebra.

---

## Onde os dados ficam

| Chave em `chrome.storage.local` | Conteúdo |
|---|---|
| `config` | Tudo desta página |
| `uiPrefs` | Termos digitados, país ativo, cidades selecionadas, modo, acumular |
| `estado` | Progresso da varredura: fila, índices, contadores, log, falhas |
| `leads` | Os leads coletados |
| `dedup` | Índices de deduplicação |

Nada disso sai da sua máquina. Remover a extensão em `chrome://extensions` apaga tudo — os CSVs já
baixados continuam na sua pasta de downloads.

---

## Combinações recomendadas

### Prospecção rápida de teste

```
Intervalo:      3–7 s (padrão)
Modo:           Contínuo
Raio:           20 km (padrão)
Modo profundo:  desligado
1 cidade, 1 termo
```

### Varredura de estado inteiro (várias horas)

```
Intervalo:       8–15 s
Modo:            Blocos, tamanho 5
Timeout:         120 s
Raio:            15 km
Modo profundo:   desligado
Retomar sozinho: ligado
Notificações:    ligado
```

### Lista curta de alta qualidade

```
Intervalo:      5–10 s
Modo:           Contínuo
Raio:           10 km
Modo profundo:  ligado, limite 150
Chave Groq:     configurada
Poucas cidades, 2–3 termos complementares
```

### O Google está pedindo verificação toda hora

```
Intervalo:  20–30 s
Modo:       Blocos, tamanho 2
Perfil do Chrome sem conta logada
Menos cidades por sessão
```

---

Voltar para o [guia de uso](USAGE.md) ou seguir para a [arquitetura](ARCHITECTURE.md).
