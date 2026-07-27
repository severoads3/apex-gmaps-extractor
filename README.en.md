# Apex Leads Extractor — B2B lead extractor for Google Maps

**A Chrome (Manifest V3) extension that extracts B2B leads from Google Maps across 30 countries and exports them to CSV.**
Pick a country → state → cities, and the extension sweeps **at least 3 geographic points per city** (up to 9 in large metros), deduplicates results, discards businesses that aren't actually in the city, and — optionally — uses AI to filter and enrich every lead.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![Tests](https://github.com/severoads3/apex-gmaps-extractor/actions/workflows/ci.yml/badge.svg)](https://github.com/severoads3/apex-gmaps-extractor/actions/workflows/ci.yml)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-blue.svg)](CONTRIBUTING.md)

> 🇧🇷 A interface e a documentação principal estão em português: [README.md](README.md).

---

## Why it exists

Searching "bike shop" on Google Maps and copying phone numbers by hand does not scale. Worse:
Maps **hides results** — a single search per city only returns what fits that viewport, and when a
city has few matches Google **silently widens** the search and floods the list with businesses from
the whole surrounding region.

Apex Leads Extractor fixes both:

1. **Coverage** — every city is swept from several geographic points (center, north, south, east,
   west and diagonals), not from a single search.
2. **Precision** — every search is anchored to the city's real coordinates, and a radius filter
   drops anything that came from outside it.

Everything runs **entirely in your browser**. No server, no paid API, no account, no data leaving your
machine (except, if you opt in, the AI validation call).

## Features

| | |
|---|---|
| 🌎 **30 countries** | ~133k cities and 578 states/provinces bundled offline |
| 📍 **3 to 9 points per city** | 3 by default, 5 above 50k inhabitants, 9 above 500k |
| 🎯 **Anchored search** | Viewport locked to real coordinates + city name in the query (kills location bias) |
| ✂️ **Radius filter** | Leads outside the city radius are dropped (20 km default, ×1.75 for metros) |
| 🔁 **Strong deduplication** | By `placeId`, falling back to name+phone, scoped by country\|state\|city |
| 🔎 **Multiple search terms** | One per line; each term is swept at each point |
| ⏯️ **Blocks or continuous** | Pause and export a partial CSV every N cities, or run straight through |
| 📞 **Phone + WhatsApp** | E.164 normalization with per-country dialing code and a ready `wa.me` link |
| 🕳️ **Deep mode** | Opens the listing page of leads with no phone to try to fill it in |
| 🤖 **Optional AI (Groq)** | Removes off-topic leads and enriches with segment, A/B/C priority and an outreach message |
| 📊 **Results page** | Sortable, filterable table with a commercial priority score |
| 💾 **Resumable** | Pause, resume, retry failures, survives a browser restart |
| 📦 **Zero dependencies** | Plain JavaScript, MV3, no build step |

## Geographic coverage

**30 countries**, generated from open data ([GeoNames](https://www.geonames.org/) CC BY 4.0 and,
for Brazil, [IBGE](https://www.ibge.gov.br/)):

🇧🇷 Brazil (5,571 municipalities) · 🇺🇸 United States · 🇨🇦 Canada · 🇲🇽 Mexico · 🇦🇷 Argentina ·
🇨🇱 Chile · 🇨🇴 Colombia · 🇵🇪 Peru · 🇺🇾 Uruguay · 🇵🇾 Paraguay · 🇧🇴 Bolivia · 🇪🇨 Ecuador ·
🇵🇹 Portugal · 🇪🇸 Spain · 🇫🇷 France · 🇩🇪 Germany · 🇮🇹 Italy · 🇬🇧 United Kingdom ·
🇳🇱 Netherlands · 🇧🇪 Belgium · 🇨🇭 Switzerland · 🇦🇹 Austria · 🇮🇪 Ireland · 🇵🇱 Poland ·
🇦🇺 Australia · 🇳🇿 New Zealand · 🇿🇦 South Africa · 🇯🇵 Japan · 🇦🇪 United Arab Emirates · 🇮🇳 India

Each city carries its name, population and coordinates. Data lives in `data/paises/` and is loaded
**on demand** — only the country you click is read into memory.

Missing a country? [Open an issue](https://github.com/severoads3/apex-gmaps-extractor/issues/new/choose),
or see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — it's one line in `scripts/paises-config.js`
plus one command.

## Installation

The extension is **not on the Chrome Web Store yet**. Install it locally in developer mode — under a minute.

```bash
git clone https://github.com/severoads3/apex-gmaps-extractor.git
```

> No Git? Click **Code → Download ZIP** here on GitHub and unzip it.

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `apex-gmaps-extractor` folder (the one containing `manifest.json`).
5. Pin it: puzzle icon 🧩 → pin 📌.

Works on Chrome, Edge, Brave and Opera (any Chromium browser with MV3).

**Recommended:** Google personalizes Maps results using *your* location. To keep the sweep clean, run
it in a Chrome profile with **no Google account signed in**, and revoke `google.com`'s location
permission at `chrome://settings/content/location`. The extension never requests GPS — but the Maps
page uses whatever your profile hands it.

> 📖 Detailed walkthrough and troubleshooting: [`docs/INSTALL.md`](docs/INSTALL.md).

## Usage

1. Click the extension icon.
2. **Search terms** — one per line (e.g. `bike shop`, `bicycle repair`).
3. **1. Pick a country** — click a flag.
4. **2. Pick a state/province**.
5. **3. Cities** — check what you want. The 30 largest come first, marked ★. Use the filter, or
   **Select entire state**.
6. **Execution mode** — *Blocks* (pauses and exports a partial CSV every 5 cities, safer for long
   runs), *Continuous*, and *Accumulate* (adds to the previous collection instead of clearing it).
7. **Start**. A work tab opens and the sweep begins. The panel shows progress, unique leads, cities
   completed, failures and ETA.
8. The CSV downloads automatically at the end. You can also **Export now** at any time, or open
   **Results** to browse, sort and filter the table in the browser.

Keep the Chrome window open during the sweep. Minimizing and using other tabs is fine.

> 📖 Full guide with timing estimates: [`docs/USAGE.md`](docs/USAGE.md).

## CSV output

File `leads_<term>_<region>_<date>_<time>.csv`, semicolon-separated with a UTF-8 BOM (opens cleanly in Excel).

Columns: `Nome`, `Categoria`, `Telefone`, `Endereco`, `Nota`, `Avaliacoes`, `Cidade`, `Quadrante`,
`Termo`, `TelefoneNormalizado`, `WhatsApp`, `Site`, `Lat`, `Lng`, `LinkMaps`, `DataColeta`,
`Estado`, `Pais` — plus `Relevancia`, `NomeLimpo`, `Segmento`, `TipoNegocio`, `Prioridade`,
`Abordagem` when the optional AI pass is enabled.

Column names are Portuguese because the extension's UI is Portuguese; the meaning is documented in
[`docs/USAGE.md`](docs/USAGE.md).

## Configuration

Open **Opções** from the popup. Defaults work well. See
[`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) for every knob — pacing between searches, extraction
timeout, block size, point offsets, zoom, city radius, deep mode, notifications, auto-resume and the
optional Groq API key.

## Optional AI validation and enrichment

Google Maps widens searches on its own: looking for `electric scooter` can return car repair shops.
With a free [Groq](https://console.groq.com/keys) API key set in Options, every lead is judged
against **the term you searched** — no per-niche keyword lists — and the extension removes clearly
off-topic leads, enriches the rest (clean business name, segment, business type, **A/B/C** priority
and a ready outreach message), and sorts the CSV by priority.

Without a key nothing changes — the extension works the same, just without that filter.

> 🔐 **The key lives only in your machine's `chrome.storage.local`.** It is never committed, never
> appears in the CSV, and never goes anywhere except Groq's own API. This repository contains no API keys.

## Architecture

```
popup.js          country → state → cities selection; builds the payload with coords, population, dialing code
   │  chrome.runtime.sendMessage({cmd:"start", cidades, termos, modo})
   ▼
background.js     MV3 service worker: the queue state machine
   │              city → coverage point → term, one task at a time
   │              opens the work tab, injects the content script, applies delays,
   │              deduplicates, filters by radius, builds the CSV, runs the watchdog
   ▼
content.js        runs on the Maps page: infinite scroll with incremental harvesting,
                  extracts feed cards (or a single listing) and returns the leads
```

The codebase and its comments are in Portuguese. `docs/ARCHITECTURE.md` explains the data formats and
extension points.

## Development

No build step. Edit the files and hit **Reload** on `chrome://extensions`.

```bash
npm test              # test suite (Node 18+, zero dependencies)
npm run build:paises  # regenerate data/paises/ from GeoNames + IBGE
```

The tests are harnesses that stub the `chrome.*` API and run the **real** `background.js` and
`content.js` — the whole state machine is exercised without a browser.

## Contributing

Contributions are very welcome — issues, PRs, new countries, data fixes, translations.
See [`CONTRIBUTING.md`](CONTRIBUTING.md). Good first issues: add a country (one line in
`scripts/paises-config.js`), fix Maps selectors when Google changes its HTML, translate the UI
(Portuguese only today), improve `docs/`.

## Responsible use and disclaimer

This tool automates navigation on a public page, in your own browser, for legitimate commercial
prospecting. Before using it:

- Automating Google Maps may conflict with [Google's Terms of Service](https://policies.google.com/terms).
  **You are responsible for how you use it.**
- Business contact data can still be personal data. Under **GDPR/LGPD** its processing requires a
  lawful basis, a purpose, and honoring the right to object.
- Respect unsolicited-communication rules in your jurisdiction (GDPR, LGPD, CAN-SPAM, CASL).
- Keep a moderate pace. Do not overload the service.

Provided "as is", without warranty, under the MIT license. The maintainers are not responsible for
third-party use.

## License

[MIT](LICENSE) © 2026 [severoads3](https://github.com/severoads3)

City data derived from [GeoNames](https://www.geonames.org/) (CC BY 4.0) and
[IBGE](https://www.ibge.gov.br/) (open data). Flag SVGs are public domain.

---

<sub>**Keywords:** google maps scraper · google maps lead extractor · b2b lead generation ·
chrome extension lead scraper · extract business contacts from google maps · local business data ·
export google maps to csv · manifest v3 · free prospecting tool · sales prospecting automation ·
local lead generation software</sub>
