// Config dos países suportados pela FASE 4 (cobertura mundial).
// Fácil estender: adicione uma linha aqui e rode `node scripts/gerar-paises.js`.
//   iso2       código ISO-3166 alpha-2 (bate com o country_code do GeoNames)
//   nome       exibição na UI (pt-BR)
//   nomeBusca  sufixo usado na URL de busca do Maps (nome no idioma local/inglês)
//   ddi        código telefônico internacional (sem "+")
//   tamanhos   comprimentos válidos do número nacional em dígitos (sem DDI)
//   tronco     prefixo de tronco a remover antes de montar E.164 (""/"0")
//   fonte      "geonames" (padrão) ou "ibge" (Brasil: municípios oficiais)
module.exports = [
  { iso2: "BR", nome: "Brasil", nomeBusca: "Brasil", ddi: "55", tamanhos: [10, 11], tronco: "0", fonte: "ibge" },
  { iso2: "US", nome: "Estados Unidos", nomeBusca: "United States", ddi: "1", tamanhos: [10], tronco: "" },
  { iso2: "CA", nome: "Canadá", nomeBusca: "Canada", ddi: "1", tamanhos: [10], tronco: "" },
  { iso2: "MX", nome: "México", nomeBusca: "México", ddi: "52", tamanhos: [10], tronco: "01" },
  { iso2: "AR", nome: "Argentina", nomeBusca: "Argentina", ddi: "54", tamanhos: [10], tronco: "0" },
  { iso2: "CL", nome: "Chile", nomeBusca: "Chile", ddi: "56", tamanhos: [9], tronco: "0" },
  { iso2: "CO", nome: "Colômbia", nomeBusca: "Colombia", ddi: "57", tamanhos: [10], tronco: "0" },
  { iso2: "PE", nome: "Peru", nomeBusca: "Perú", ddi: "51", tamanhos: [9], tronco: "0" },
  { iso2: "UY", nome: "Uruguai", nomeBusca: "Uruguay", ddi: "598", tamanhos: [8, 9], tronco: "0" },
  { iso2: "PY", nome: "Paraguai", nomeBusca: "Paraguay", ddi: "595", tamanhos: [9], tronco: "0" },
  { iso2: "BO", nome: "Bolívia", nomeBusca: "Bolivia", ddi: "591", tamanhos: [8], tronco: "" },
  { iso2: "EC", nome: "Equador", nomeBusca: "Ecuador", ddi: "593", tamanhos: [9], tronco: "0" },
  { iso2: "PT", nome: "Portugal", nomeBusca: "Portugal", ddi: "351", tamanhos: [9], tronco: "" },
  { iso2: "ES", nome: "Espanha", nomeBusca: "España", ddi: "34", tamanhos: [9], tronco: "" },
  { iso2: "FR", nome: "França", nomeBusca: "France", ddi: "33", tamanhos: [9], tronco: "0" },
  { iso2: "DE", nome: "Alemanha", nomeBusca: "Deutschland", ddi: "49", tamanhos: [10, 11], tronco: "0" },
  { iso2: "IT", nome: "Itália", nomeBusca: "Italia", ddi: "39", tamanhos: [9, 10], tronco: "" },
  { iso2: "GB", nome: "Reino Unido", nomeBusca: "United Kingdom", ddi: "44", tamanhos: [10], tronco: "0" },
  { iso2: "NL", nome: "Países Baixos", nomeBusca: "Nederland", ddi: "31", tamanhos: [9], tronco: "0" },
  { iso2: "BE", nome: "Bélgica", nomeBusca: "België", ddi: "32", tamanhos: [8, 9], tronco: "0" },
  { iso2: "CH", nome: "Suíça", nomeBusca: "Schweiz", ddi: "41", tamanhos: [9], tronco: "0" },
  { iso2: "AT", nome: "Áustria", nomeBusca: "Österreich", ddi: "43", tamanhos: [10, 11], tronco: "0" },
  { iso2: "IE", nome: "Irlanda", nomeBusca: "Ireland", ddi: "353", tamanhos: [9], tronco: "0" },
  { iso2: "PL", nome: "Polônia", nomeBusca: "Polska", ddi: "48", tamanhos: [9], tronco: "" },
  { iso2: "AU", nome: "Austrália", nomeBusca: "Australia", ddi: "61", tamanhos: [9], tronco: "0" },
  { iso2: "NZ", nome: "Nova Zelândia", nomeBusca: "New Zealand", ddi: "64", tamanhos: [8, 9], tronco: "0" },
  { iso2: "ZA", nome: "África do Sul", nomeBusca: "South Africa", ddi: "27", tamanhos: [9], tronco: "0" },
  { iso2: "JP", nome: "Japão", nomeBusca: "Japan", ddi: "81", tamanhos: [9, 10], tronco: "0" },
  { iso2: "AE", nome: "Emirados Árabes Unidos", nomeBusca: "UAE", ddi: "971", tamanhos: [8, 9], tronco: "0" },
  { iso2: "IN", nome: "Índia", nomeBusca: "India", ddi: "91", tamanhos: [10], tronco: "0" }
];
