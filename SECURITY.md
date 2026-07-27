# Política de segurança

## Versões suportadas

Só a versão mais recente da branch `main` recebe correções de segurança.

| Versão | Suportada |
|---|---|
| 5.x | ✅ |
| < 5.0 | ❌ |

## Reportando uma vulnerabilidade

**Não abra uma issue pública para vulnerabilidades.**

Use o [Private vulnerability reporting](https://github.com/severoads3/apex-gmaps-extractor/security/advisories/new)
do GitHub (aba **Security** → **Report a vulnerability**). O relato fica visível só para os
mantenedores até que exista correção.

Inclua no relato:

- Uma descrição do problema e do impacto;
- Passos para reproduzir (ou um PoC);
- A versão da extensão (`manifest.json`) e do navegador;
- Se você já tem uma sugestão de correção.

Resposta esperada em até **7 dias**. Correção e divulgação coordenada dentro de **90 dias**,
ou antes se a correção for simples.

## Escopo

Estão no escopo, entre outros:

- Execução de código a partir de conteúdo controlado pela página do Google Maps (o `content.js`
  roda em página de terceiros);
- Vazamento da chave da API Groq armazenada em `chrome.storage.local`;
- XSS nas páginas da própria extensão (`popup.html`, `options.html`, `resultados.html`) via dados
  de lead — nomes de negócio vêm de terceiros e não são confiáveis;
- Escalada indevida das permissões declaradas no `manifest.json`;
- Exfiltração de leads ou de configuração para qualquer destino que não seja o próprio Google Maps
  ou a API da Groq.

**Fora do escopo:**

- O fato de a extensão automatizar o Google Maps (é o propósito declarado — veja
  "Uso responsável" no [README](README.md#uso-responsável-e-aviso-legal));
- O Google pedir verificação/CAPTCHA durante uma varredura;
- Vulnerabilidades no próprio Chrome ou no Google Maps;
- Engenharia social contra o usuário da extensão.

## Modelo de segurança e privacidade

Para você poder auditar as garantias que este projeto afirma ter:

- **Não existe backend.** O repositório não contém nem referencia nenhum servidor do projeto.
- **Nenhum dado sai da máquina do usuário**, exceto:
  - as próprias navegações no Google Maps, feitas no navegador do usuário;
  - se, e somente se, o usuário configurar uma chave, as chamadas à `https://api.groq.com`.
    Cada chamada envia nome, categoria e endereço dos leads do lote e o termo buscado — nada mais.
- **Nenhuma chave de API está no repositório.** A chave da Groq é digitada pelo usuário em Opções e
  fica em `chrome.storage.local`, na máquina dele. Ela nunca aparece no CSV nem em logs.
- **Nenhuma telemetria, analytics ou reporte de erro remoto.**
- **Permissões declaradas** em [`manifest.json`](manifest.json), com o motivo de cada uma:

  | Permissão | Por quê |
  |---|---|
  | `tabs`, `scripting` | Abrir a aba de trabalho e injetar o `content.js` na página do Maps |
  | `storage`, `unlimitedStorage` | Guardar leads, progresso e configuração localmente |
  | `downloads` | Salvar o CSV |
  | `alarms` | Watchdog e agendamento entre buscas (o service worker MV3 dorme) |
  | `notifications` | Avisar ao concluir, fechar bloco ou detectar verificação do Google |
  | `*://*.google.com/*`, `*://*.google.com.br/*` | Ler os resultados do Maps |
  | `https://api.groq.com/*` | Validação por IA — só usada se o usuário configurar uma chave |

Se você encontrar qualquer comportamento que contradiga o descrito acima, isso **é** uma
vulnerabilidade — reporte.
