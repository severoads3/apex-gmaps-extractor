# Guia de instalação

Este guia leva você do zero à extensão funcionando no navegador. Tempo estimado: **2 minutos**.

Não é preciso saber programar. Não é preciso instalar Node.js (isso só serve para quem vai
contribuir com código).

---

## Requisitos

| | |
|---|---|
| **Navegador** | Chrome, Edge, Brave, Opera ou qualquer Chromium com Manifest V3 (Chrome 88+) |
| **Sistema** | Windows, macOS ou Linux — tanto faz |
| **Conta** | Nenhuma. Não precisa de conta em lugar nenhum |
| **Pagamento** | Nenhum. Nem API paga, nem assinatura |

> A extensão ainda **não está na Chrome Web Store**, por isso a instalação é manual, em modo
> desenvolvedor. É o mesmo processo usado por qualquer extensão em teste — e permite que você
> leia o código antes de rodar.

---

## Passo 1 — Baixe o código

### Opção A: com Git (recomendado — facilita atualizar depois)

```bash
git clone https://github.com/severoads3/apex-gmaps-extractor.git
```

A pasta `apex-gmaps-extractor` vai aparecer onde você rodou o comando.

### Opção B: sem Git (ZIP)

1. Abra <https://github.com/severoads3/apex-gmaps-extractor>
2. Clique no botão verde **Code** → **Download ZIP**
3. Descompacte o arquivo
4. **Guarde a pasta em um lugar definitivo** (ex.: `Documentos/apex-gmaps-extractor`).
   Se você apagar ou mover essa pasta, a extensão para de funcionar — o Chrome carrega os
   arquivos direto dali, não faz cópia.

---

## Passo 2 — Carregue no navegador

1. Abra `chrome://extensions` na barra de endereços.
   *(No Edge: `edge://extensions`. No Brave: `brave://extensions`.)*

2. No canto superior direito, ligue o **Modo do desenvolvedor**.

3. Aparecem três botões novos. Clique em **Carregar sem compactação**
   (*Load unpacked*, se o navegador estiver em inglês).

4. Navegue até a pasta que você baixou e **selecione a pasta que contém o `manifest.json`**.

   > ⚠️ Se você baixou o ZIP, cuidado: às vezes a descompactação cria uma pasta dentro de outra
   > com o mesmo nome. Você precisa selecionar a **de dentro**, aquela onde o `manifest.json` está
   > diretamente visível.

5. O card **Apex Leads Extractor** aparece na lista. Pronto.

---

## Passo 3 — Fixe o ícone na barra

1. Clique no ícone de peça de quebra-cabeça 🧩 à direita da barra de endereços.
2. Encontre **Apex Leads Extractor** e clique no alfinete 📌.

O ícone fica visível permanentemente. É por ele que você abre a extensão.

---

## Passo 4 — Prepare o perfil do Chrome (recomendado)

Este passo é opcional, mas **melhora muito a qualidade dos leads**.

O Google personaliza os resultados do Maps usando a **sua** localização — conta logada, IP e
permissão de localização do site. Se você está em São Paulo e manda varrer Curitiba, o Maps pode
completar a lista com negócios de São Paulo.

A extensão já se defende disso com três camadas (nome da cidade no texto, viewport ancorada nas
coordenadas reais e filtro de raio), mas a defesa fica melhor se você:

- **Rodar num perfil do Chrome sem conta Google logada.**
  Crie um perfil novo: clique no seu avatar no canto superior direito → **Adicionar** → siga sem
  fazer login. Instale a extensão nesse perfil.
- **Revogar a permissão de localização de `google.com`.**
  Vá em `chrome://settings/content/location`, procure `google.com` na lista de sites permitidos e
  remova. Ou coloque `google.com` na lista de sites bloqueados.

A extensão **nunca pede sua localização**. O viés vem da página do Maps, não dela.

---

## Passo 5 — Teste

1. Clique no ícone da extensão.
2. Digite um termo em **Termos de busca**, ex.: `padaria`.
3. Clique na bandeira do **Brasil**.
4. Escolha um estado.
5. Marque **uma** cidade pequena.
6. Clique em **Iniciar**.

Uma aba nova abre no Google Maps e começa a rolar sozinha. O painel da extensão mostra o progresso.
Em poucos minutos o CSV baixa sozinho.

Deu certo? Você está pronto. Leia o [guia de uso](USAGE.md) para varreduras de verdade.

---

## Atualizando

### Se você clonou com Git

```bash
cd apex-gmaps-extractor
git pull
```

Depois vá em `chrome://extensions` e clique no ícone de **recarregar** ↻ no card da extensão.

### Se você baixou o ZIP

Baixe o ZIP novo, substitua o conteúdo da pasta e recarregue a extensão em `chrome://extensions`.

> Seus leads coletados e suas configurações **não se perdem** ao atualizar — eles ficam no
> `chrome.storage.local`, não nos arquivos.

---

## Desinstalando

Vá em `chrome://extensions` e clique em **Remover** no card da extensão. Isso apaga também todos os
dados armazenados (leads, configuração, progresso). Os CSVs já baixados continuam na sua pasta de
downloads.

---

## Solução de problemas

<details>
<summary><b>"Não foi possível carregar a extensão" / "Manifest file is missing or unreadable"</b></summary>

Você selecionou a pasta errada. Precisa ser a pasta onde o `manifest.json` está **diretamente**
dentro — não a pasta que contém a pasta que contém o manifest.

Abra a pasta que você vai selecionar: você deve ver `manifest.json`, `background.js`, `popup.html`
lado a lado.
</details>

<details>
<summary><b>O botão "Carregar sem compactação" não aparece</b></summary>

O **Modo do desenvolvedor** não está ligado. Ele fica no canto superior direito da página
`chrome://extensions`, como um interruptor.
</details>

<details>
<summary><b>O ícone da extensão sumiu da barra</b></summary>

Ele não sumiu, só não está fixado. Clique no 🧩 e no alfinete 📌 ao lado do nome da extensão.
</details>

<details>
<summary><b>Cliquei em Iniciar e não acontece nada</b></summary>

Cheque, na ordem:

1. **Tem termo de busca?** O campo não pode estar vazio.
2. **Tem cidade marcada?** O contador acima de "Modo de Execução" precisa mostrar 1 ou mais.
3. **A linha de status diz alguma coisa?** Ela explica o que está faltando.

Se ainda assim nada, abra o console do service worker: `chrome://extensions` → card da extensão →
**Service worker** (link azul) → aba **Console**. Erros aparecem lá. Copie e
[abra uma issue](https://github.com/severoads3/apex-gmaps-extractor/issues/new/choose).
</details>

<details>
<summary><b>O Google está pedindo verificação/CAPTCHA</b></summary>

A extensão detecta isso, pausa a varredura e emite uma notificação. Para retomar:

1. Vá na aba de trabalho e resolva a verificação manualmente.
2. Volte ao popup e clique em **Continuar**.

Para reduzir a chance de acontecer de novo, aumente **Intervalo mínimo/máximo entre buscas** nas
Opções (tente 8–15 s) e varra menos cidades por sessão.
</details>

<details>
<summary><b>A extensão parou no meio e não avança</b></summary>

Há um watchdog que resgata fase travada sozinho — espere ~3 minutos. Se não voltar:

1. Clique em **Pausar** e depois em **Continuar**.
2. Se ainda travado, clique em **Exportar agora** para salvar o que já coletou, e depois em
   **Repetir falhas**.
</details>

<details>
<summary><b>Funciona no Firefox ou no Safari?</b></summary>

Não. O projeto usa APIs MV3 específicas do Chromium. Uma porta para Firefox é bem-vinda como
[contribuição](../CONTRIBUTING.md).
</details>

---

Ainda travado? [Abra uma issue](https://github.com/severoads3/apex-gmaps-extractor/issues/new/choose)
com o seu navegador, versão e o que aparece no console do service worker.
