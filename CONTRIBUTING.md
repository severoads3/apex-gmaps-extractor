# Contribuindo com o Apex Leads Extractor

Obrigado pelo interesse! Este projeto é aberto a contribuições de qualquer tamanho —
de uma correção de digitação a um país novo.

> 🇬🇧 English speakers are welcome. Open issues and PRs in English if you prefer;
> the codebase and comments are in Portuguese, but you don't need to be fluent to contribute.

## Índice

- [Como posso ajudar?](#como-posso-ajudar)
- [Preparando o ambiente](#preparando-o-ambiente)
- [Fluxo de contribuição](#fluxo-de-contribuição)
- [Padrões do código](#padrões-do-código)
- [Testes](#testes)
- [Adicionando um país](#adicionando-um-país)
- [Mensagens de commit](#mensagens-de-commit)
- [Checklist do Pull Request](#checklist-do-pull-request)
- [O que não entra no projeto](#o-que-não-entra-no-projeto)

## Como posso ajudar?

Boas primeiras contribuições:

| | |
|---|---|
| 🌍 **Adicionar um país** | Uma linha em `scripts/paises-config.js` + regerar os dados |
| 🐛 **Corrigir seletores do Maps** | O Google muda o HTML de tempos em tempos e a extração quebra |
| 🌐 **Traduzir a interface** | Hoje só pt-BR; a UI está em `popup.html`, `options.html` e `resultados.html` |
| 📝 **Melhorar a documentação** | `README.md`, `README.en.md` e `docs/` |
| 🧪 **Ampliar os testes** | Novos cenários nos harnesses de `tests/` |
| 💡 **Propor um recurso** | Abra uma issue antes de codar algo grande |

Se for algo grande, **abra uma issue primeiro** para alinhar o desenho. Evita você gastar
tempo em um PR que não entra.

## Preparando o ambiente

Você precisa de **Node.js 18+** (só para os testes e a geração de dados; a extensão em si não usa Node)
e um navegador Chromium.

```bash
git clone https://github.com/severoads3/apex-gmaps-extractor.git
cd apex-gmaps-extractor
npm test          # não instala nada: zero dependências
```

Para carregar sua cópia no navegador, siga [`docs/INSTALL.md`](docs/INSTALL.md).
Depois de cada alteração, clique em **Recarregar** no card da extensão em `chrome://extensions`.

Não há `npm install`, bundler, transpilador ou linter obrigatório. É JavaScript puro rodando
direto no navegador — o que você edita é o que executa.

## Fluxo de contribuição

1. **Fork** o repositório.
2. Crie um branch a partir de `main`:
   ```bash
   git checkout -b feat/nome-curto-do-que-voce-faz
   ```
3. Faça a alteração, com testes quando fizer sentido.
4. Rode `npm test` — precisa passar inteiro.
5. Teste **de verdade no navegador**. Os harnesses cobrem a lógica, não a UI.
6. Abra o Pull Request contra `main`, preenchendo o template.

## Padrões do código

O projeto tem convenções deliberadas. Siga-as para o PR não virar uma discussão de estilo:

- **Português no código.** Nomes de variáveis, funções e comentários em pt-BR, como o resto do
  arquivo. Consistência vale mais que preferência pessoal.
- **Zero dependências em runtime.** Nada de biblioteca externa no `manifest.json`, nada de `import`
  de CDN. A extensão precisa continuar funcionando offline e auditável linha a linha.
- **Sem build step.** Nada de TypeScript, bundler ou transpilador. O que está no repositório é o que
  o Chrome carrega.
- **Sem permissão nova sem justificativa.** Cada item de `permissions`/`host_permissions` no
  `manifest.json` precisa de motivo explícito no PR. Usuários auditam isso.
- **Comentários explicam o *porquê*, não o *o quê*.** O código já diz o que faz. O comentário
  registra a decisão, o caso real que motivou o tratamento, a armadilha que ele evita — é o estilo
  do arquivo hoje, mantenha.
- **Nenhuma requisição de rede em runtime** além do Google Maps e da API da Groq (opcional).
  Geração de dados acontece em desenvolvimento, via `scripts/`, nunca no navegador do usuário.
- **Nenhum segredo no repositório.** Chave de API é responsabilidade do usuário e vive em
  `chrome.storage.local`. Nunca commite uma.
- **Nenhum dado de lead no repositório.** CSVs de coleta são de terceiros e estão no `.gitignore`.

## Testes

```bash
npm test
```

Isso roda três harnesses, em Node puro, sem navegador:

| Harness | O que cobre |
|---|---|
| `tests/harness-background.js` | Faz stub da API `chrome.*` e executa o `background.js` **real**: fila de cidades → pontos → termos, calibração de centro, viewport, multi-termo, resultados parciais, falhas, retry, filtro de raio, dedup, CSV e reset |
| `tests/harness-content.js` | Executa funções reais do `content.js` contra HTML sintético do Maps |
| `tests/harness-paises.js` | Valida `data/paises/`: estrutura, ordenação por população, coordenadas e completude do Brasil |

**Toda mudança de comportamento no `background.js` ou no `content.js` precisa de asserção nova.**
Os testes usam um `assert(condicao, rotulo)` simples — siga o padrão dos arquivos, com um rótulo
`Tn: descrição` e um número de teste novo no fim da sequência.

Correção de bug? Adicione primeiro a asserção que falha, depois corrija.

## Adicionando um país

1. Adicione uma linha em [`scripts/paises-config.js`](scripts/paises-config.js):
   ```js
   { iso2: "SE", nome: "Suécia", nomeBusca: "Sverige", ddi: "46", tamanhos: [7, 8, 9], tronco: "0" },
   ```
   - `nomeBusca` é o que entra na URL do Maps — use o nome no idioma local ou em inglês, o que o
     Google reconhece melhor.
   - `tamanhos` são os comprimentos válidos do número **nacional**, sem DDI.
   - `tronco` é o prefixo removido antes de montar o E.164 (`""` ou `"0"`).
2. Adicione a bandeira em `icons/flags/<iso2 minúsculo>.svg` (SVG de domínio público, proporção 4:3).
3. Baixe os dumps do GeoNames em `scripts/geonames_tmp/` (veja o cabeçalho de
   [`scripts/gerar-paises.js`](scripts/gerar-paises.js)) e rode:
   ```bash
   npm run build:paises
   ```
4. Rode `npm test` — o `harness-paises.js` valida o arquivo gerado.
5. Teste no navegador: a bandeira deve aparecer, o seletor de estado deve popular e uma cidade
   deve gerar uma URL de busca correta.

Commite os `data/paises/<ISO2>.json` gerados. Eles são o produto do build — o usuário final não roda
o gerador.

## Mensagens de commit

Formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
feat: adiciona Suécia à cobertura geográfica
fix: corrige seletor de telefone quando o Maps usa aria-label
docs: explica o filtro de raio no README
test: cobre retry de cidade internacional
refactor: extrai montagem da URL de busca
chore: atualiza dados do IBGE
```

Uma mudança lógica por commit. Se o PR tem 12 commits de "ajuste", faça squash antes de abrir.

## Checklist do Pull Request

Antes de marcar como pronto para revisão:

- [ ] `npm test` passa inteiro
- [ ] Testei manualmente no Chrome, carregando a extensão sem compactação
- [ ] Adicionei/atualizei asserções para o comportamento que mudei
- [ ] Não adicionei dependências nem build step
- [ ] Não adicionei permissão nova (ou justifiquei a nova no corpo do PR)
- [ ] Nenhuma chave de API, CSV de leads ou dado pessoal no diff
- [ ] Atualizei `README.md`/`README.en.md`/`docs/` se o comportamento visível mudou
- [ ] Adicionei uma entrada no `CHANGELOG.md` se for mudança relevante ao usuário

## O que não entra no projeto

Para manter a ferramenta gratuita, leve e auditável, algumas coisas estão fora de escopo por decisão
de projeto:

- **APIs pagas** (Google Places, enriquecimento de CNPJ, validadores de e-mail pagos).
- **Backend próprio** ou qualquer telemetria. Nada do usuário sai da máquina dele.
- **Bibliotecas pesadas** para exportação (XLSX, PDF). CSV resolve e é universal.
- **Recursos que aumentem o risco de bloqueio**, como paralelismo agressivo ou remoção dos delays.
- **Qualquer coisa que dificulte auditoria** por um usuário lendo o código.

Contribuição rejeitada por escopo não é contribuição ruim — é só um projeto com fronteira definida.
Se discorda de alguma dessas fronteiras, abra uma issue de discussão.

---

Ao contribuir, você concorda que sua contribuição será licenciada sob a
[MIT License](LICENSE) e se compromete com o [Código de Conduta](CODE_OF_CONDUCT.md).
