# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [5.0.0] — 2026-07-27 — APEX LEADS EXTRACTOR

### Alterado (breaking)
- **Renomeado** de `Prospector B2B - Google Maps` para **Apex Leads Extractor**.
- **Removida a seção dedicada a Santa Catarina.** As abas "Santa Catarina" /
  "Mundo" deram lugar a um **seletor único de três passos: país → estado →
  cidades**. Todos os 295 municípios catarinenses continuam disponíveis (via
  Brasil → SC), agora com coordenadas reais, tier de pontos por população e o
  mesmo tratamento dos outros 29 países — nada de cobertura foi perdido.
- Removidos os presets de mesorregião de SC, os grupos fixos de municípios e o
  campo "Cidades personalizadas", que existiam só para suprir a lista fixa de SC.
- Removida a opção **UF (sufixo das buscas)**: cada cidade já carrega o próprio
  estado/país vindo de `data/paises/`.

### Adicionado
- Documentação pública completa: `README.md`, guias em `docs/`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, templates de issue/PR e CI no GitHub Actions.
- Licença MIT.

### Corrigido
- Asserção desatualizada do teste T16 (o cabeçalho do CSV ganhou colunas de
  enriquecimento por IA depois das colunas `Estado;Pais`).

### Removido
- `tests/harness-popup.js`, que validava exclusivamente a lista fixa de SC e os
  presets de mesorregião.

## [4.3.1] — 2026-07-18 — ANTI-VIÉS DE LOCALIZAÇÃO DO USUÁRIO

- Diagnóstico (relato real): varrendo Tubarão a partir de uma máquina em
  Balneário Camboriú, o Maps enchia a lista com lojas de BC — o Google usa a
  localização do PRÓPRIO usuário (conta logada, IP, permissão de localização
  do site google.com) para completar buscas com poucos resultados. A extensão
  NÃO pede GPS; o viés vem da página do Maps no perfil do usuário.
- Correção: o texto da busca agora SEMPRE inclui o nome da cidade, mesmo nas
  buscas ancoradas por viewport ("termo cidade UF" + @lat,lng,14z). O texto
  prende a intenção na cidade pesquisada; o viewport prende o mapa; e o filtro
  de raio (v4.3.0) garante a lista final. Três camadas independentes.
- Recomendações de uso (mitigam o que a URL não controla): rodar num perfil
  do Chrome sem conta Google logada e revogar a permissão de localização de
  google.com (chrome://settings/content/location).

## [4.3.0] — 2026-07-18 — FILTRO DE RAIO — lead só entra se for DA cidade

- PROBLEMA REAL (CSV de Tubarão): de 119 leads, só 8 eram de Tubarão — 106
  estavam a 170 km (polo de Balneário Camboriú/Itajaí). Causa: quando a cidade
  tem poucos resultados, o GOOGLE EXPANDE a busca sozinho e enche a lista com
  lugares de toda a região; a ancoragem por viewport não impede esse enchimento.
- Correção: FILTRO DE RAIO na mesclagem — cada lead traz lat/lng do próprio
  href; lead além do raio do centro da cidade é DESCARTADO e o log registra
  ("N fora do raio da cidade, descartados"). Implementa de vez o item 1.7 do
  MELHORIAS (validação "o lead é mesmo desta cidade?"), de forma mais forte.
- Configurável em Opções: "Raio da cidade (km)" — padrão 20 km; metrópoles
  (9 pontos) usam raio x1.75 automaticamente; 0 desliga o filtro. Lead sem
  coordenadas no href não é descartado (não dá para julgar).
- Validado contra o CSV real: o filtro mantém exatamente as 8 lojas genuínas
  de Tubarão e corta as 111 intrusas. Teste T22 reproduz o cenário.
  npm test: 193 asserções.

## [4.2.1] — 2026-07-18 — ROBUSTEZ DA PRECISÃO GEOGRÁFICA

- CORREÇÃO: "Repetir falhas" perdia o contexto da cidade — uma cidade
  internacional que falhasse voltava como busca textual do BR ("termo cidade
  SC") e qualquer cidade perdia a ancoragem por coordenadas. Agora cada falha
  guarda o meta completo (país, estado, coords, telefone) e o retry
  re-enfileira com a MESMA precisão (teste T21).
- Aba Santa Catarina também ancorada: as seleções da aba SC agora recebem as
  coordenadas reais do BR.json (292/295 municípios, casamento por nome
  normalizado — "Grão Pará" casa com "Grão-Pará" do IBGE). As 3 exceções
  (Monte Carlo, Presidente Castello Branco, São Miguel do Oeste — grafias
  divergentes no GeoNames) permanecem no modo textual + calibração, que segue
  correto.
- Validação de coordenadas no start: lat/lng fora de faixa (|lat|>90,
  |lng|>180) são descartadas e a cidade cai no modo textual seguro.
- Testes: T21 (retry ancorado) + consistência aba SC x BR.json no
  harness-popup. npm test: 188 asserções.

## [4.2.0] — 2026-07-18 — PRECISÃO GEOGRÁFICA — buscas ancoradas na cidade

- CORREÇÃO CENTRAL: as buscas agora são ANCORADAS nas coordenadas reais da
  cidade, num zoom fechado (a cidade preenche a tela). Antes, o ponto "Centro"
  era uma busca textual pura e o Google escolhia a vista — muitas vezes larga
  demais ou no oceano —, e os demais pontos herdavam esse centro impreciso.
- Coordenadas embarcadas: data/paises/<iso2>.json agora traz [nome, pop, lat,
  lng] por cidade. GeoNames cobre 100% do exterior; o Brasil (IBGE) é
  enriquecido via GeoNames em 99% dos municípios. Onde não há coordenada
  (aba SC com lista fixa), mantém-se o modo textual + calibração anterior.
- Deslocamentos reduzidos: deltaLat/deltaLng de 0.045/0.055 para 0.03/0.03
  (~3 km) — os pontos ficam DENTRO da cidade, não em vizinhas/oceano. Migração
  v4 corrige automaticamente quem tinha os valores largos antigos salvos.
- Metrópoles (9 pontos) não afastam mais o zoom (removido o zoom-1) e usam raio
  moderado (x1.6 em vez de x2), cobrindo a mancha urbana sem perder precisão.
- Testes novos: T20 (Centro ancorado nas coords reais, não mais textual) e
  cobertura de coordenadas no harness-paises. npm test: 178 asserções.

## [4.1.0] — 2026-07-18 — REDESIGN VISUAL — inspiração Apple / Vercel

- Novo sistema visual no popup: superfícies em camadas, bordas capilares +
  sombras suaves, escala tipográfica com rótulos em maiúsculas, foco acessível
  (focus-visible) e microinterações. Modo claro e escuro refinados.
- Abas SC/Mundo viram um CONTROLE SEGMENTADO estilo Apple (trilha + segmento
  ativo elevado). Marca com ícone de pino em gradiente no cabeçalho.
- Bandeiras em cartões com leve elevação no hover e anel de seleção no país
  ativo. Botão primário com gradiente e brilho; barra de progresso com brilho
  deslizante; contadores viram "chips"; "Nova busca" com pulso ao confirmar.
- Páginas de Opções e Resultados alinhadas ao mesmo sistema (paleta, raios,
  sombras, botão primário em gradiente, cabeçalhos de tabela em maiúsculas).
- Nenhuma função alterada: todos os hooks de JS (IDs/classes) preservados;
  npm test segue verde. Redesign validado visualmente no popup (claro e escuro).

## [4.0.0] — 2026-07-18 — FASE 4 — COBERTURA MUNDIAL

- Duas abas no popup: "Santa Catarina" (experiência original intacta) e "Mundo".
  Na aba Mundo: clique na BANDEIRA do país -> escolha o ESTADO/província ->
  marque todas ou cidades específicas. As MAIORES cidades vêm sempre primeiro
  (ordenação por população). 30 países cobertos (Américas, Europa e outros).
- Dados embarcados (offline, sem API em runtime): data/paises/<iso2>.json
  gerados de GeoNames (cities500 + admin1, CC BY 4.0) e, para o Brasil, do IBGE
  (5.570 municípios). Carga sob demanda por país; índice leve sempre carregado.
  Gerador: scripts/gerar-paises.js + scripts/paises-config.js.
- Núcleo generalizado: item de fila {nome, estado, pais, paisBusca, pontos,
  ddi, tamanhos, tronco}. URLs por país ("cidade, estado, país" fora do BR; o
  formato "cidade UF" do Brasil é preservado). ?hl=pt-BR mantido em TODAS as
  URLs — as detecções textuais do content.js seguem funcionando no mundo todo
  (content.js não mudou).
- Tier de pontos por população: 9 (>= 500 mil), 5 (>= 50 mil), 3 (demais);
  metrópoles cobrem raio maior (delta x2, zoom -1). Diagonais só com centro
  calibrado; sem centro, a cidade degrada e o total de tarefas é corrigido.
- Dedup: placeId e nome+telefone continuam globais; chaves SEM telefone agora
  escopadas por país|estado|cidade (não funde "Springfield/IL" com
  "Springfield/MO", nem "Córdoba/AR" com "Córdoba/ES").
- Telefone/WhatsApp internacionais: DDI e validação por país. Best-effort fora
  do BR (formatos locais variam, sem bibliotecas externas). O ZIP+4 dos EUA
  não é mais confundido com telefone (validação por tamanho).
- CSV/Resultados/TSV ganham colunas Estado e Pais. Página de resultados com
  atribuição GeoNames/IBGE no rodapé.
- Migração v3 idempotente: leads antigos recebem país BR + estado (config.uf)
  e a dedup é reconstruída com o novo escopo.
- Testes: harness-paises.js (dados dos países) + T16-T18 (comportamento
  internacional). npm test roda 4 harnesses (159 asserções).
- Botão "Nova busca (zerar tudo)": descarta leads/dedup e volta ao estado
  ocioso, com duplo clique de confirmação (sem diálogo nativo). Elimina a
  necessidade de reinstalar a extensão para começar outra busca do zero.
- Aba Mundo: removido o botão "Marcar visíveis" (redundante — a lista já mostra
  o estado inteiro); ficam "Marcar estado inteiro" e "Desmarcar estado", que
  agora atuam sobre TODAS as cidades do estado.
- Manifest: nome "Prospector B2B - Google Maps"; nenhuma permissão nova
  (host_permissions *.google.com já cobrem o Maps de qualquer país).
  Recomendação: modo profundo apenas em varreduras por estado/UF.

## [2.2.0] — 2026-07-18

- Presets regionais no popup: 6 botões (Grande Florianópolis, Vale do Itajaí,
  Norte, Sul, Serra e Oeste Catarinense) que marcam/desmarcam em bloco os
  municípios da mesorregião (toggle). A tabela veio da API de localidades do
  IBGE (estado 42) e particiona exatamente os 295 municípios, sem sobreposição
  — supera a decisão da v2.0.0 de não implementar por falta de tabela curada.
- Teste novo: tests/harness-popup.js valida a integridade da lista base e a
  partição das regiões (soma 295, sem duplicatas, cobertura total). npm test
  agora roda os 3 harnesses (95 asserções).

## [2.1.0] — 2026-07-17

- Modo profundo: limite de fichas por cidade sobe de 10 para 150 (novo padrão
  e novo teto do campo em Opções) — extrai o máximo de cada cidade.
- Migração automática única: config já salva com o limite antigo é elevada
  para 150 no reload da extensão; ajustes manuais feitos depois disso são
  preservados (marcador configVersao).

## [2.0.0] — 2026-07-17

Implementação das 3 fases do roadmap de MELHORIAS.txt, com a regra central
pedida: TODA cidade é coberta em NO MÍNIMO 3 pontos geográficos (Centro,
Norte e Sul; as 30 cidades principais ganham também Leste e Oeste, 5 pontos)
e a fila só avança para a próxima cidade quando todos os pontos dela foram
varridos até o fim da lista.

COBERTURA GEOGRÁFICA (novo núcleo da coleta)
  - Ponto "Centro": busca textual "termo cidade UF", que além de coletar
    CALIBRA o centro da cidade (o content script devolve o @lat,lng,zoom da
    URL final do Maps).
  - Pontos Norte/Sul/Leste/Oeste: buscas por viewport real
    (/maps/search/termo/@lat,lng,14z) deslocado do centro calibrado —
    cobertura territorial de verdade, não palavra no termo.
  - Fallback garantido: sem centro calibrado, os pontos usam a busca textual
    "termo Ponto cidade UF" — os 3+ pontos acontecem em qualquer cenário.
  - ?hl=pt-BR em todas as URLs: detecções de texto ("final da lista",
    "não encontrou", "estrelas") independem do idioma do navegador.

FASE 1 (ganhos rápidos)
  - Colunas novas no CSV: Termo, TelefoneNormalizado (55+DDD+número),
    WhatsApp (link wa.me para celulares), Site, Lat, Lng, LinkMaps (ficha do
    lugar no Maps), DataColeta.
  - Nome de arquivo com termo e data: leads_<slug>_<uf>_<data_hora>.csv
    (blocos: ..._blocoN.csv; parciais manuais: ..._parcial_HHMMSS.csv).
  - Botão "Exportar agora" (baixa parcial sem interromper a varredura).
  - Progresso por busca (não mais por cidade) + estimativa de término (ETA).
  - Log com hora em cada entrada.
  - Ícones da extensão (16/32/48/128) gerados.
  - Testes no repositório: tests/ + npm test (78 asserções sobre o código
    real: máquina de estados completa com chrome.* simulado + funções de
    extração).
  - Versionamento git iniciado.

FASE 2 (qualidade e escala da coleta)
  - Dedup por placeId (identificador único 0x...:0x... do href de cada card):
    elimina falsas mesclagens de homônimos e falsas duplicatas por variação
    de nome; fallback nome+telefone com enriquecimento de registro antigo.
  - Extração incremental: o content script colhe os cards A CADA rodada de
    scroll e envia parciais ao background — timeout no meio do scroll não
    perde mais o que já tinha carregado (e estende o prazo a cada progresso).
  - Multi-termo: vários termos de busca por varredura (um por linha), fila
    cidade -> ponto -> termo, coluna Termo no CSV.
  - Painel de falhas persistente + botão "Repetir falhas" (re-enfileira as
    cidades falhas acumulando com o já coletado).
  - Filtro de texto nas listas de municípios + marcar/desmarcar visíveis +
    seleção persistente entre aberturas do popup.
  - Grupo 3: cidades personalizadas (qualquer cidade/UF, uma por linha).
  - Badge no ícone (nº de leads; "!" quando pausado; "II" em bloco) e
    notificações do sistema (conclusão, bloco, captcha, reinício).
  - Storage dividido: estado leve separado dos leads/dedup (sem reescrever
    megabytes a cada linha de log).
  - Modo "Acumular com a coleta anterior" (dedup entre execuções).
  - Lista oficial de municípios: adicionados Araquari, Armazém, Bocaina do
    Sul e Pescaria Brava; removido "Colônia Santana" (distrito de São José).
    Total: 295 municípios (IBGE).

FASE 3 (produto)
  - Página de RESULTADOS em aba: tabela com busca, filtros (cidade, termo,
    só com telefone), ordenação por coluna, coluna Score (nota x
    log(1+avaliações)), links WhatsApp/Site/Maps, Copiar TSV (cola direto no
    Sheets/Excel) e Exportar CSV dos filtrados.
  - Página de OPÇÕES: intervalos entre buscas, timeout de extração, tamanho
    do bloco, UF, deslocamentos N/S e L/O, zoom dos pontos, notificações,
    auto-retomada e modo profundo.
  - MODO PROFUNDO (opcional): ao fim dos pontos de cada cidade, visita a
    ficha dos leads sem telefone (limite configurável) e enriquece telefone/
    site/endereço via atributos semânticos estáveis (data-item-id).
  - Pausa segura pós-reinício do navegador: varredura em andamento pausa e
    avisa, em vez de navegar sozinha (configurável em Opções).
  - Intervalo 3-7s com via dupla: setTimeout (caminho rápido) + alarme
    persistente (rede de segurança), idempotente por construção.

DECISÕES / NÃO IMPLEMENTADO (com motivo)
  - Redução de cidades pequenas para 1 busca (item 2.5 de MELHORIAS.txt):
    substituída, a pedido, pela regra de mínimo 3 pontos por cidade.
  - Presets regionais de municípios: exigiria tabela curada de mesorregiões;
    o filtro por texto cobre o caso de uso principal.
  - Google Sheets via OAuth: exige client id do Google Cloud do usuário;
    o "Copiar TSV" da página de resultados cobre o fluxo (colar no Sheets).
  - Places API (7.3) e pipeline CNPJ (7.2): fontes/integrações externas à
    extensão; ver MELHORIAS.txt para o caminho sugerido.
  - Exportação XLSX: exigiria vendorar biblioteca; CSV com BOM + ";" abre
    corretamente no Excel pt-BR.

## [1.0.0] — 2026-07-17

  - Versão inicial conforme EXTENSÃO-REVISADO.txt: MV3, varredura por
    quadrantes textuais (Norte/Centro/Sul), scroll infinito, dedup global
    nome+telefone, CSV via data URL com BOM e ";", modo blocos, watchdog,
    pausa por captcha. Revisada com serialização de handlers e 62 asserções
    de teste.
