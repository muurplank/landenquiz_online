# Land Trainer (Landjes)

**Een statische webb app om landen, hoofdsteden, vlaggen en kaartherkenning per week/continent te oefenen — zonder backend, data blijft in de browser.**

---

## 1. Overzicht / Beschrijving

### Wat doet dit project?

Land Trainer is een **single-page-achtige webapplicatie** waarmee je geografie kunt oefenen in blokken van landen (“weeks” of “delen”): per week kies je een set landen (bijv. “Week 1 - Zuid-Amerika”) en oefen je via vier quiztypen:

- **Hoofdstad/Land** — Flashcards: land → hoofdstad, hoofdstad → land, of beide kanten.
- **Vlaggen** — Vlag herkennen of land bij vlag.
- **Kaart-quiz** — Welk land is wit gemarkeerd op de kaart (Mercator)?
- **Mix** — Willekeurige mix van hoofdstad-, vlag- en kaartvragen.

Voortgang en statistieken worden **lokaal** opgeslagen (localStorage). Er is geen server, account of database.

### Welk probleem lost het op?

- **Gestructureerd leren** — Werken in vaste weken/delen voorkomt overweldiging.
- **Geen afleiding** — Geen ads, geen login; werkt offline na eerste load.
- **Inzicht in voortgang** — Statistiekenpagina met KPIs, per week, per continent, en “beste/slechtste” landen.

### Voor wie is het bedoeld?

- Leerlingen en studenten die landen en hoofdsteden moeten leren.
- Iedereen die vlaggen en kaartherkenning wil oefenen.
- Ontwikkelaars die een voorbeeld willen van een puur front-end quiz-app met localStorage en GeoJSON-kaarten.

---

## 2. Features

- **Weeksets / Delen** — 16 groepen (Zuid-Amerika, Noord-Amerika, Europa, Oceanië, Afrika, Azië) met vaste landensets.
- **Per continent / Hele wereld** — Op de homepage een sectie met 7 kaartjes (6 continenten + Hele wereld). Klik opent dezelfde groepspagina met alle vier quiztypen voor dat continent of de hele wereld. Voortgang per continent/world wordt ook getoond.
- **Vier quiztypen** — Hoofdstad (één richting of beide kanten), vlag (één richting of beide kanten), kaart-quiz, mix.
- **Vraagvolgorde** — In alle quizzen komen eerst alle landen één keer aan bod (willekeurige volgorde); pas daarna kunnen vragen herhaald worden. Volgende ronde weer alle landen een keer.
- **Beide kanten (hoofdstad/vlag)** — De modus “Beide kanten” loopt **oneindig** door (geen automatisch einde); telt **niet** mee voor de progress bar op de homepage. Handig om onbeperkt te oefenen zonder dat het de sterren/voortgang beïnvloedt.
- **Voortgang per week** — Progress bar op de homepage: 33% per type (hoofdstad, vlag, kaart), 5 “sterren” totaal; beheersing = min. 1× correct per land per type. Alleen de één-richting-modussen en mix/kaart-quiz tellen mee; “Beide kanten”-sessies worden genegeerd.
- **Sessie-statistieken** — Tijdens de quiz: aantal vragen, nauwkeurigheid, gem. responstijd, streak. Sessie eindigt wanneer elk land min. 1× goed is — **behalve** bij Hoofdstad/Vlaggen “Beide kanten”, die loopt door tot je zelf stopt.
- **Uitgebreide statistiekenpagina** — Filters (periode, groep, quiztype), drie tabs:
  - **Algemeen** — KPIs (sessies, vragen, nauwkeurigheid, streak, studietijd), verdeling per quiztype, beste/slechtste landen (min. 3× gezien), extra inzichten (“meest geoefend”, “snel maar fout”, “langzaam maar goed”).
  - **Per week/onderdeel** — Per groupId: sessies, vragen, accuracy, streak, top 3 zwakke landen; rolling accuracy (k=5) per quiztype.
  - **Per continent** — Unieke landen, vragen, accuracy, top 5 beste/slechtste per continent; heatmap-achtige weergave.
- **Sterrenstatus per land** — Gebaseerd op accuracy + aantal keer gezien (en optioneel responstijd); tooltip met uitleg.
- **Groepspagina-layout** — Eerst grote wereldkaart + landenlijst naast elkaar (kaart links, lijst rechts in sticky kolom); daaronder de quiz-modi. Container max. 1500px breed.
- **Oefenen-sectie** — Boven de kaart een kop “Oefenen” met pijl (▼/▶) om de kaart+lijst in te klappen; de ingeklapte staat wordt **per week** onthouden in localStorage (`landjes_oefenen_collapsed`). Inline script in de head voorkomt flits bij laden.
- **Wereldkaart-preview** — Standaard een **lege wereldkaart** (alle landen groen); bij hover op een land: dat land wit, oranje pijl (+ ellips voor kleine landen) en een **vlag linksboven** op de kaart (zonder gekleurde doos). Lege kaart en per-land preview worden **gecached** (eerste keer tekenen, daarna hergebruik).
- **Lijnen op groepspagina** — Onder de titel “Landen in dit deel” en tussen elk land een scheidingslijn over de **volle breedte** van de card.
- **Dark mode** — Toggle in de header; voorkeur in localStorage.
- **Kaart-quiz per continent/world** — Bij kaart-quiz vanuit “Per continent” of “Hele wereld”: dezelfde wereldkaart als in de oefen-preview (gecentreerd op 0° Greenwich), een **typ-card** boven “Landen in dit deel” om de landnaam in te typen; antwoorden binnen **edit distance 4** (Levenshtein) worden goed gerekend. Bij week-quizzes blijft de ingezoomde kaart per deel.
- **Kaart-quiz scrollen** — De kaart-quizpagina kan scrollen bij veel inhoud (geen vaste viewport-hoogte meer).
- **Clear stats** — Knop om alle sessies en statistieken te wissen.
- **Export** — Download sessie-history als JSON (per quizpagina).

---

## 3. Technologieën

| Categorie        | Keuze |
|-----------------|-------|
| **Front-end**   | Vanilla HTML5, CSS3, JavaScript (ES6+), geen framework |
| **Data**        | JSON (groepen, landen), GeoJSON (wereldkaart) |
| **Opslag**      | Browser `localStorage` (sessies, per-group stats, thema) |
| **Kaarten**     | SVG gegenereerd uit GeoJSON; Mercator-projectie in JS |
| **Vlaggen**     | SVG-bestanden (bijv. van [country-flags](https://github.com/hampusborgos/country-flags)) |
| **Server**      | Geen; moet via een lokale HTTP-server worden geserveerd (geen `file://`) |

---

## 4. Installatie

### Vereisten

- Een moderne browser (Chrome, Firefox, Safari, Edge).
- Een lokale HTTP-server (geen `file://` vanwege `fetch()` en CORS).

### Stap-voor-stap

1. **Repository clonen of downloaden**

   ```bash
   git clone <repository-url> Landjes-V3
   cd Landjes-V3
   ```

2. **Vlaggen (optioneel)**  
   De app verwacht SVG-vlaggen in `assets/flags/`. Als die map leeg of incompleet is:

   ```bash
   chmod +x scripts/fetch-flags.sh
   ./scripts/fetch-flags.sh
   ```

   Dit kloont [country-flags](https://github.com/hampusborgos/country-flags) naar `.cache/country-flags` en kopieert `svg/*.svg` naar `assets/flags/`.

3. **Lokale server starten** (vanuit de projectroot)

   **Python 3:**

   ```bash
   python3 -m http.server 8000
   ```

   **Node (npx):**

   ```bash
   npx serve -p 8000
   ```

4. **Open in de browser**

   ```
   http://localhost:8000
   ```

   Voor pagina’s in `pages/`: `http://localhost:8000/pages/group.html?id=week1_zuid-amerika` of `?id=continent_Europe` / `?id=world` voor Per continent of Hele wereld.

---

## 5. Hosting (website online zetten)

De app is **puur statisch** (HTML, CSS, JS, JSON). Je kunt hem gratis hosten op een van deze diensten.

### Optie A: GitHub Pages (gratis)

1. Push je project naar een GitHub-repository.
2. Ga in de repo naar **Settings → Pages**.
3. Bij **Source** kies **Deploy from a branch**.
4. Branch: `main` (of `master`), map: **/ (root)**.
5. Klik **Save**. Na even wachten is de site bereikbaar op:
   **https://muurplank.github.io/landenquiz_online/**

Let op: bij een *project*-Pages site is de base-URL `.../landenquiz_online/`. Zorg dat links in de app relatief zijn (zoals `pages/group.html`) — dat is al het geval.

### Optie B: Netlify (gratis)

1. Ga naar [netlify.com](https://www.netlify.com) en maak een account.
2. **Sites → Add new site → Deploy manually**: sleep de **hele projectmap** (met `index.html`, `css/`, `js/`, `data/`, `assets/`, `pages/`) naar het upload-venster.
   - Of: **Import an existing project** en koppel je Git-repo; build command leeg laten, publish directory: `./` (root).
3. Netlify geeft je direct een URL (bijv. `https://random-naam.netlify.app`). Optioneel: eigen domein koppelen onder **Domain settings**.

### Optie C: Vercel (gratis)

1. Ga naar [vercel.com](https://vercel.com) en log in (bijv. met GitHub).
2. **Add New → Project** en importeer je repository.
3. **Root Directory**: `./` laten staan. **Build Command**: leeg laten. **Output Directory**: `./` (of leeg).
4. Deploy. Je krijgt een URL als `https://project-naam.vercel.app`.

### Algemeen

- **Geen build nodig**: upload of deploy gewoon de bestaande bestanden.
- **Vlaggen**: zorg dat `assets/flags/` (en eventueel `scripts/fetch-flags.sh` lokaal uitgevoerd) al gevuld is vóór je uploadt, anders ontbreken vlaggen op de live site.
- **HTTPS**: alle genoemde diensten bieden automatisch HTTPS.
- **localStorage**: werkt gewoon; data blijft per browser/device.
- **Git**: de map `.cache/` staat in `.gitignore` (gebruikt door `fetch-flags.sh`); er is geen submodule meer, zodat GitHub Pages zonder build-fouten deployt.

---

## 6. Gebruik

### Homepagina (`index.html`)

- **Delen / Weeksets** — Klik op een kaart (bijv. “Week 1 - Zuid-Amerika”) om naar het overzicht van dat deel te gaan.
- **Per continent** — Sectie met 7 kaartjes: Zuid-Amerika, Noord-Amerika, Europa, Afrika, Azië, Oceanië, en Hele wereld. Elk kaartje toont het aantal landen en een progress bar; klik opent `pages/group.html?id=continent_<Continent>` of `id=world` met de vier quiztypen voor dat bereik.
- **Statistieken** — Knop “Open statistieken” opent `pages/stats.html`.
- **Header** — Donkere modus (toggle), “Clear stats” (wist alle sessies).

### Groepspagina (`pages/group.html`)

- **Volgorde** — Eerst een sectie **Oefenen** (kaart + landenlijst), daaronder **Quiz-modi**.
- **Oefenen** — Kop “▼ Oefenen” (klikbaar om in te klappen; pijl wordt ▶). Links een grote **wereldkaart** (standaard leeg: alle landen groen), rechts een sticky kolom **Landen in dit deel** met landen + hoofdsteden. Onder de titel en tussen elk land een lijn over de volle breedte van de card.
- **Kaart** — Zonder hover: lege wereldkaart. **Hover** op een land: dat land wit, oranje pijl (+ ellips indien kleiner dan Nederland) en linksboven op de kaart de **vlag** van dat land. Bij mouseleave van het hele blok (kaart + lijst) weer lege kaart. Lege kaart en per-land preview worden gecached (geen hertekenen bij opnieuw hoveren).
- **Quiz-modi** — Kies Hoofdstad, Vlaggen, Kaart-quiz of Mix; knoppen linken naar de juiste quiz-URL met `id=<groupId>` en eventueel `mode=...`.
- Wereldkaart: `high_res_usa.json`; ingestorte staat Oefenen: `landjes_oefenen_collapsed` (per groep).

### Quizpagina’s (`pages/quiz_*.html`)

- **Hoofdstad** (`quiz_capitals.html`) — Vraag toont land of hoofdstad; je geeft aan of je antwoord correct/fout was (zelfscore); toon antwoord met Spatiebalk. Modus “Beide kanten” loopt oneindig door en telt niet mee voor de progress bar.
- **Vlaggen** (`quiz_flags.html`) — Zelfde idee: vlag of landnaam, correct/incorrect, antwoord tonen. Modus “Beide kanten” loopt oneindig door en telt niet mee voor de progress bar.
- **Kaart** (`quiz_map.html`) — Eén land wit op de kaart; kies het juiste land in de lijst rechts. Bij **Per continent / Hele wereld** (`id=continent_*` of `id=world`): dezelfde wereldkaart als de oefen-preview (Greenwich gecentreerd), een aparte **typ-card** boven “Landen in dit deel” om de landnaam te typen (Enter of Controleer); antwoorden met Levenshtein-afstand ≤ 4 worden goed gerekend. De kaart-quizpagina kan scrollen.
- **Mix** (`quiz_mix.html`) — Per vraag willekeurig hoofdstad-, vlag- of kaartvraag; antwoord tonen, dan correct/incorrect.
- **Vraagvolgorde** — In alle quizzen komen eerst alle landen één keer voorbij (geen herhaling tot iedereen aan bod is geweest); daarna begint een nieuwe ronde.
- **Sessie** — Loopt tot je stopt of (bij één-richting/mix/kaart) tot elk land min. 1× goed is. “Beide kanten” (hoofdstad/vlag) stopt niet automatisch. Bij afsluiten of verlaten wordt de sessie opgeslagen in `localStorage`.
- **Download log** — Sla de huidige sessie (of history) als JSON op.

### Statistieken (`pages/stats.html`)

- **Filters** — Periode (Alles, 7 dagen, 30 dagen, Deze week, Custom), Groep, Quiztype; “Laatste update” uit laatste `endedAt`.
- **Tab Algemene statistieken** — KPI-kaarten, verdeling per quiztype, beste/slechtste landen, extra inzichten.
- **Tab Per week/onderdeel** — Per groupId: sessies, vragen, accuracy, streak, top 3 zwakke landen; rolling accuracy (k=5) per type.
- **Tab Per continent** — Per continent: unieke landen, vragen, accuracy, top 5 beste/slechtste, verdeling per type; visueel als kaarten met kleur op accuracy.

---

## 7. Configuratie

Er is **geen** configuratiebestand of environment variables. Alles wordt bepaald door:

- **Data-bestanden** (zie hieronder).
- **localStorage**:
  - `landjes_history_v1` — Sessies en per-group aggregaten.
  - `landjes_theme` — `"light"` of `"dark"`.
  - `landjes_oefenen_collapsed` — JSON-object met per groep-id of de Oefenen-sectie is ingeklapt (bijv. `{"week1_zuid-amerika": true}`).

Je kunt de app aanpassen door:

- `data/groups.json` — Weken/delen en bijbehorende landen (ISO3).
- `data/countries.json` — Landnamen (NL), hoofdsteden, continent.
- `assets/maps/high_res_usa.json` — Wereldkaart-GeoJSON (en eventueel andere map-bestanden als je de code aanpast).

---

## 8. Projectstructuur

```
Landjes V4/
├── .gitignore              # .cache/, .DS_Store (geen country-flags submodule in repo)
├── index.html              # Homepagina: weeksets, Per continent, link naar stats
├── css/
│   ├── style.css           # Algemene stijlen, thema, quiz- en kaart-CSS
│   └── stats.css           # Statistiekenpagina: filters, tabs, KPI’s, grafieken
├── js/
│   ├── app.js              # Kern: data laden, sessies, history, kaart-helpers, voortgang
│   ├── quiz_capitals.js    # Hoofdstad-quiz logica
│   ├── quiz_flags.js       # Vlaggen-quiz logica
│   ├── quiz_map.js         # Kaart-quiz: week = eigen zoom; continent/world = preview-kaart + typ-box
│   ├── quiz_mix.js         # Mix-quiz: hoofdstad + vlag + kaart
│   └── stats.js            # Statistieken: filters, aggregatie, rendering
├── pages/
│   ├── group.html          # Overzicht per week: quiz-keuze + landenlijst + wereldkaart-preview
│   ├── quiz_capitals.html  # Hoofdstad-quiz UI
│   ├── quiz_flags.html     # Vlaggen-quiz UI
│   ├── quiz_map.html       # Kaart-quiz UI
│   ├── quiz_mix.html       # Mix-quiz UI
│   └── stats.html          # Statistieken met drie tabs
├── data/
│   ├── groups.json         # Weeksets: id, title, continent, countries (ISO3-lijst)
│   ├── countries.json      # Per land: iso, name_nl, capitals_nl, continent
│   └── iso3-to-iso2.json   # Mapping ISO3 → ISO2 (voor vlagbestanden)
├── assets/
│   ├── flags/              # SVG-vlaggen (bijv. nl.svg, fr.svg)
│   └── maps/
│       ├── high_res_usa.json  # Gebruikte wereldkaart-GeoJSON
│       ├── high_res.json
│       ├── custom_world.json
│       └── world.geojson
├── scripts/
│   └── fetch-flags.sh      # Kloont country-flags en kopieert SVG naar assets/flags
└── README.md
```

---

## 9. Bestanden en functies (gedetailleerd)

### `index.html`

- **Doel** — Startpagina: weeksets, sectie “Per continent”, link naar statistieken.
- **Gedrag** — Bij load: `App.loadGroups()` en `App.loadHistory()` voor de weeksets; daarna `App.getContinentAndWorldGroups()` voor de 7 continent/world-kaartjes. Voor elke groep (weeks en continent/world) wordt `App.getGroupProgress(group.id, group.countries, history)` gebruikt voor de progress bar. Geen build-stap.

---

### `css/style.css`

- **Design tokens** — CSS-variabelen voor kleuren, schaduw, radius, fonts (o.a. DM Sans); aparte set voor `[data-theme="dark"]`.
- **Layout** — Header, container (max-width 1500px), footer, grid voor kaarten.
- **Componenten** — Cards, buttons, badge, stats-list, quiz-controls, country-list-buttons, map-wrapper, pill.
- **Quiz-specifiek** — `.quiz-main`, `.quiz-card`, `.map-country`, `.target`; voor map-quiz: `.page-quiz-map` met `min-height: 100vh` (pagina kan scrollen). Rechterkolom: `.quiz-aside` met twee cards; bovenste card voor typ-box (`.map-quiz-type-card`, `#map-quiz-type-wrap`) bij continent/world.
- **Progress** — `.group-progress`, `.progress-bar-wrap`, `.progress-bar-fill`, `.progress-detail`.
- **Groepspagina** — `.group-oefenen-section`, `.group-oefenen-toggle`, `.group-oefenen-content` (collapsible); `html.oefenen-collapsed-init` tegen flits bij laden; `.group-map-row` (kaart + aside), `.group-countries-aside`, `.countries-hover-list` met lijntjes over volle breedte (titeltje + tussen landen); `.country-preview-flag-box` (vlag linksboven, geen achtergrondkleur); `.country-preview-world-map`, `.country-preview-box`.
- **Responsive** — Media queries o.a. voor small screens; groepspagina wordt één kolom, aside niet meer sticky.

---

### `css/stats.css`

- **Filters** — `.stats-filters`, `.filters-row`, `.filter-group` voor dropdowns/datums.
- **Tabs** — `.stats-tabs`, `.stats-tab`, `.stats-panel`; actieve tab met border.
- **KPI’s** — `.kpi-grid`, `.kpi-card`, `.kpi-value`, `.kpi-label`.
- **Grafieken** — `.bar-chart`, `.bar-row`, `.bar-fill`, `.bar-value`.
- **Lijsten** — `.country-stats-list`, `.country-stat-row`, `.country-stars`.
- **Per week** — `.per-group-cards`, `.group-stat-card`, `.rolling-chart`.
- **Per continent** — `.continent-cards`, `.continent-card`, `.continent-detail-card`.

---

### `js/app.js`

Kernmodule: één globale namespace `window.App` (IIFE). Belangrijkste onderdelen:

#### Data laden

- **`loadJSON(path)`** — `fetch(path)` + `.json()`; gebruikt voor alle JSON.
- **`loadGroups()`** — `data/groups.json` (aanroep vanaf root).
- **`loadGroupsFromPages()`** — `../data/groups.json` (aanroep vanuit `pages/`).
- **`loadCountries()`** / **`loadCountriesFromRoot()`** — Zelfde voor `countries.json`.
- **`loadGroupById(id)`** — Haalt één groep op uit de geladen groups. Ondersteunt virtuele groepen: `id=world` (alle landen uit `countries.json`) en `id=continent_<Continent>` (alle landen van dat continent). Zie ook `getContinentAndWorldGroups()`.
- **`getContinentAndWorldGroups()`** — Geeft een array van 7 virtuele groepen (6 continenten + Hele wereld) voor de homepage-sectie “Per continent”. Gebruikt `loadCountriesFromRoot()`.
- **`loadCountriesMap()`** — Geeft een object `{ [iso]: country }` voor snelle lookup.
- **`loadWorldGeoJSON()`** — Laadt `../assets/maps/high_res_usa.json?v=2` (wereldkaart).
- **`buildWorldMapEmpty(worldGeoJson)`** — Wereldkaart zonder highlight (alle landen groen); voor standaardweergave op groepspagina; wordt daar één keer gebouwd en gecached.

#### URL en landcodes

- **`getQueryParam(name)`** — Leest queryparameter (bijv. `id`, `mode`).
- **`getFlagFilename(iso3)`** — Bepaalt vlagbestandsnaam (bijv. `nl.svg`) via `ISO3_TO_ISO2` of fallback.
- **`normalizeCountryIso(iso)`** — Zet 2-letter naar 3-letter waar mogelijk (`ISO2_TO_ISO3`); anders ongewijzigd.

#### Sessies en history

- **`createInitialCountryStats(isoList)`** — Maakt per land een object `{ iso, seen_count, correct_count, incorrect_count, is_mastered, events: [] }`.
- **`allMastered(countryStats)`** — `true` als elk land `is_mastered` is.
- **`pickRandomCountry(countryStats)`** — Willekeurig land uit de lijst.
- **`pickNextCountryNoRepeat(countryStats, askedThisRound)`** — Zie onder “Voortgang per week”.
- **`nowIso()`** — Huidige tijd als ISO-string.
- **`loadHistory()`** — Leest `landjes_history_v1` uit localStorage; default `{ version: 1, sessions: [], perGroup: {} }`.
- **`saveHistory(history)`** — Schrijft history naar localStorage.
- **`clearHistory()`** — Zet history terug naar lege default en slaat op.
- **`startSession({ groupId, quizType, subMode })`** — Maakt sessie-object met `id`, `startedAt`, `endedAt: null`, `totals`, `perCountryStats`, enz.
- **`finalizeSession(session)`** — Zet `endedAt`, rekent `totals.accuracy` en `totals.avgResponseTimeMs`, voegt sessie toe aan history en werkt `perGroup` bij.
- **`recordQuestionResult({ session, countryStats, iso, quizType, subType, wasCorrect, responseTimeMs })`** — Werkt per-land stats en `session.totals` bij; voegt event toe aan `countryStats[iso].events`.

#### Export

- **`downloadHistoryAsJSON(filename)`** — Maakt een download-link voor de volledige history als JSON.

#### Kaart (Mercator en GeoJSON)

- **`mercatorProject(lon, lat)`** — Converteert lon/lat naar x/y (radialen / log-tan); lat geknipt op ±85°.

#### Voortgang per week (home)

- **`getGroupProgress(groupId, countryIds, history)`** — Berekent per type (capital, flag, map) welk deel van `countryIds` “beheerst” is (min. 1× correct in dat type, inclusief mix-events); geeft ook `stars` (0–5) als som van de drie bijdragen (elk max 5/3). Sessies met **Beide kanten** (`subMode === 'both'` voor capital/flag) worden **genegeerd** voor de progress bar.
- **`formatProgressStars(stars)`** — Geeft een string met ★/☆ voor weergave.
- **`pickNextCountryNoRepeat(countryStats, askedThisRound)`** — Kiest het volgende land zo dat eerst alle landen één keer aan bod komen (geen herhaling in dezelfde ronde); wanneer iedereen is gevraagd, wordt de ronde gereset. `askedThisRound` is een `Set` van iso-codes die de caller bijhoudt.

#### Wereldkaart-preview (group-pagina)

- **`isValidIsoCode(v)`** — `false` voor `null`, `''`, `'-99'`; anders true als 2- of 3-letterige alfanumerieke code.
- **`getIsoFromFeature(f)`** — Haalt ISO uit GeoJSON-feature (o.a. `iso_a3`, `adm0_a3`, `sov_a3`, `brk_a3`, `iso_a2`); negeert `-99`; KOS → XKX; expliciete SYC/MUS voor handmatig toegevoegde landen.
- **`computeScaleInfoSingleFeature(feature, w, h)`** — Berekent schaal en padding voor één feature (Mercator) in een rechthoek w×h.
- **`computeScaleInfoForFeatures(features, w, h)`** — Zelfde voor meerdere features (gezamenlijke extent).
- **`buildPathFromCoordsForPreview(coordsList, scaleInfo)`** — Zet arrays van [lon,lat]-ringen om naar een SVG path `d` (Mercator + schaal).
- **`buildCountryPreviewHtml(iso, worldGeoJson, groupCountries)`** — Kleine preview (vlag + minimap met omliggende landen); gebruikt in andere contexten indien nodig.
- **`buildWorldMapPreview(iso, worldGeoJson)`** — Grote wereldkaart-SVG: alle landen getekend, geselecteerd land wit, oranje pijl + optioneel ellips (zoals in kaart-quiz). Gebruikt door group-pagina bij hover; resultaat wordt per land gecached. Bij fout: catch en fallback-tekst.

Daarnaast bevat `app.js`:

- **Dark mode** — IIFE: leest `landjes_theme`, past `data-theme` toe, koppelt toggle aan checkbox.
- **Clear stats** — IIFE: bij klik op `#clear-stats-btn` bevestiging, dan `App.clearHistory()` en `location.reload()`.

---

### `js/quiz_capitals.js`

- **Doel** — Hoofdstad-quiz: vraag toont land of hoofdstad; gebruiker geeft correct/incorrect; sessie wordt bijgehouden.
- **Flow** — Leest `id` en `mode` uit URL; laadt groep en landen; initialiseert `countryStats` en `session`; toont vragen. Bij **één richting**: sessie eindigt wanneer alle landen “mastered”. Bij **Beide kanten** (`mode === 'both'`): sessie loopt oneindig door (geen `maybeEndSessionIfMastered`).
- **Vraagvolgorde** — `pickNextCountryNoRepeat` + `askedThisRound` (Set): eerst alle landen één keer, daarna nieuwe ronde.
- **Functies** — o.a. `updateSessionStatsUI`, `updateDeckStatus`, `showNextQuestion`, `handleAnswer`, `maybeEndSessionIfMastered`; roept `App.recordQuestionResult` en `App.finalizeSession` aan.
- **Keyboard** — Spatiebalk = toon antwoord; 1/2 = correct/incorrect (indien van toepassing).

---

### `js/quiz_flags.js`

- **Doel** — Vlaggen-quiz: zelfde patroon als hoofdstad, met vlag-afbeelding (`assets/flags/`) en vraagtypen “vlag→land” en “land→vlag”. **Beide kanten** (`mode === 'both'`) loopt oneindig door en telt niet mee voor de progress bar.
- **Vraagvolgorde** — `pickNextCountryNoRepeat` + `askedThisRound` (Set): eerst alle landen één keer, daarna nieuwe ronde.
- **Functies** — `renderFlag(iso)`, `updateSessionStatsUI`, `showNextQuestion`, `handleAnswer`, enz.; integratie met `App` identiek aan capitals.

---

### `js/quiz_map.js`

- **Doel** — Kaart-quiz: één land wit op de kaart; gebruiker kiest het land in de lijst (of typt de landnaam bij continent/world). **Vraagvolgorde** — `pickNextCountryNoRepeat` + `askedThisRound`: eerst alle landen één keer, daarna nieuwe ronde.
- **Twee modi:**
  - **Week-quizzes** (`id=week*`): Eigen Mercator-SVG: `renderMap`, `scaleInfo` uit groep-features, zoom op het deel. `setTargetOnMap(iso)` en `updateArrow(iso)` voor highlight en pijl/ellips (kleiner dan Nederland → ellips).
  - **Per continent / Hele wereld** (`id=continent_*` of `id=world`): Zelfde kaart als oefen-preview: `App.buildWorldMapEmpty(world)` bij start, bij elke vraag `App.buildWorldMapPreview(currentCountry.iso, worldGeo)`. Geen eigen `renderMap`; wereldkaart gecentreerd op 0° (Greenwich). **Typ-card** zichtbaar: input + Controleer; antwoord geldt als goed bij exacte match of Levenshtein-afstand ≤ 4 op de Nederlandse landnaam (`isTypedAnswerCorrect`, `levenshtein`).
- **Functies (week-modus)** — `toDisplayLon`, `getLonExtent`, `wrapLon`, `projectPoint`, `computeScaleInfo`, `buildPathFromCoords`, `getFeatureCentroid`, `centroidToSvg`, `getFeaturePointsSvg`, `minimumEnclosingEllipse`, `getNetherlandsSize`, `updateArrow`, `setTargetOnMap`. Voor wereld-quiz: `centerOnGreenwich` en vaste extent op -180°/180°; `useLonWrap` uit bij continent/world.
- **Events** — Klik op land in de lijst = gok; bij continent/world ook Enter/Controleer op de typ-input. Bij correct/incorrect wordt `recordQuestionResult` aangeroepen en na korte delay de volgende vraag.

---

### `js/quiz_mix.js`

- **Doel** — Mix-quiz: per vraag willekeurig hoofdstad-, vlag- of kaartvraag;zelfde sessie- en master-logica. **Vraagvolgorde** — `pickNextCountryNoRepeat` + `askedThisRound`: eerst alle landen één keer, daarna nieuwe ronde.
- **Functies** — Dezelfde kaart-/projectie-helpers als in quiz_map; `chooseQuestionType`, `prepareCapitalQuestion`, `prepareFlagQuestion`, `prepareMapQuestion`, `showNextQuestion`, `handleSelfScoredAnswer`, `handleMapGuess`; toetsenbord: Spatie, 1, 2.

---

### `js/stats.js`

- **Doel** — Filtert sessies, aggregeert data en vult de drie tabs op de statistiekenpagina.
- **Filters** — `getPeriodBounds(periodValue, customFrom, customTo)` voor datumbereik; `filterSessions(sessions, opts)` op periode, groupId, quizType.
- **Aggregatie** — `mergePerCountryStats(sessions)`: per ISO alle sessies samenvoegen (seen_count, correct_count, events, totalResponseTimeMs); `rollingAccuracyFromEvents(events, k)` voor rolling accuracy.
- **Sterren** — `starRating(accuracy, seenCount, avgResponseTimeMs, p80ResponseTimeMs)` volgens vaste regels (bijv. ≥0.90 + seen≥5 ⇒ 5 sterren); optionele straf bij hoge responstijd.
- **Rendering** — `renderKpis`, `renderQuizTypeChart`, `renderBestWorstCountries`, `renderExtraInsights`, `renderPerGroupCards`, `renderRollingAccuracy`, `renderContinentStats`; continent-namen uit `countries.json` (continent) en vaste mapping naar NL-labels.
- **Init** — Bij DOMContentLoaded: groups + countries laden, filters vullen, tabs en event listeners; `refreshStats()` bij wijziging van filters.

---

### `data/groups.json`

- **Structuur** — Array van objecten: `{ "id", "title", "continent", "countries" }`.
- **id** — Bijv. `week1_zuid-amerika`; gebruikt in URL en localStorage.
- **countries** — Array van ISO 3166-1 alpha-3 codes (bijv. `["ARG","BOL",...]`).

---

### `data/countries.json`

- **Structuur** — Array van objecten: `{ "iso", "name_nl", "capitals_nl", "continent" }`.
- **iso** — ISO 3166-1 alpha-3.
- **name_nl** — Nederlandse naam.
- **capitals_nl** — Array van hoofdsteden (meerdere mogelijk).
- **continent** — Bijv. "Europe", "Africa"; gebruikt voor statistieken en weergave.

---

### `data/iso3-to-iso2.json`

- **Doel** — Mapping van 3-letter naar 2-letter landcode; gebruikt voor vlagbestandsnamen (lowercase .svg). In `app.js` wordt daarnaast een volledige ISO2→ISO3 map afgeleid voor normalisatie.

---

### `assets/maps/high_res_usa.json`

- **Doel** — Enige gebruikte wereldkaart-GeoJSON in de app (group-pagina preview, kaart-quiz, mix-quiz).
- **Inhoud** — FeatureCollection met landpolygonen; properties o.a. `iso_a3`, `adm0_a3`, `sov_a3`, `iso_a2`, `admin`. Landen met `-99` in iso-velden worden in de app via `adm0_a3`/sov_a3 herkend; Kosovo via KOS→XKX; Seychellen en Mauritius handmatig toegevoegd met kleine polygonen op de juiste coördinaten.

---

### `pages/group.html`

- **Doel** — Overzicht van één week/deel: sectie Oefenen (kaart + landenlijst) en daaronder quiz-modi.
- **Layout** — Eerst `group-oefenen-section` met kop “Oefenen” (collapsible), dan `group-map-row`: links kaart, rechts `group-countries-aside` met titel “Landen in dit deel” en `countries-hover-list`. Onder de titel en tussen elk land een lijn over de volle breedte (CSS met negatieve marge t.o.v. aside-padding).
- **Init** — Inline script in `<head>` leest `landjes_oefenen_collapsed` en zet bij ingeklapte staat `html.oefenen-collapsed-init` om flits te voorkomen. Na DOMContentLoaded: opgeslagen staat toepassen, klik-handler voor toggle, state per groep opslaan.
- **Kaart** — Eerst `buildWorldMapEmpty(worldGeo)` tonen (eenmalig bouwen, daarna `cachedEmptyMapHtml`). Bij mouseenter op een land: uit cache of `buildWorldMapPreview(iso3, worldGeo)` + vlag in wrapper; resultaat in `previewCache`; bij mouseleave op het hele blok weer lege kaart.
- **Links** — Quiz-URLs dynamisch met `id=<groupId>` en eventueel `mode=...`.

---

### `pages/stats.html`

- **Structuur** — Boven: filters (periode, groep, quiztype, laatste update). Dan drie tabs; onder elke tab de bijbehorende secties (KPI’s, grafieken, lijsten, continent-kaarten). Lege staat als er geen sessies zijn.
- **Scripts** — Alleen `app.js` en `stats.js`; stats.js leest `App.loadHistory()` en vult de panels op basis van de geselecteerde filters.

---

## 10. Uitzonderingen voor landen

In de code en data zijn bewust uitzonderingen gemaakt voor bepaalde landen, zodat ze correct herkend worden in de GeoJSON-kaart, de juiste vlag tonen en (waar nodig) zichtbaar zijn op de kaart. Hieronder een overzicht.

### ISO-codes in GeoJSON

| Uitzondering | Reden | Waar |
|--------------|--------|------|
| **`-99`** | In Natural Earth / GeoJSON wordt `-99` gebruikt voor “onbekend” of betwist. | `isValidIsoCode()` in `app.js`: waarden `null`, `''`, `'-99'` worden afgewezen zodat ze niet als geldige ISO-code tellen. |
| **KOS → XKX** | Kosovo heeft in veel bronnen de code **KOS**; de app gebruikt de user-assigned ISO 3166-1 alpha-3 **XKX**. | Na het uitlezen van de feature in `getIsoFromFeature()`: `if (iso === 'KOS') iso = 'XKX'`. Zo sluit de kaart aan op `data/countries.json` en `groups.json` (Week 5 - Europa deel 2). |
| **SYC en MUS** | **Seychellen** en **Mauritius** ontbreken in de gebruikte wereldkaart of hebben verkeerde/ontbrekende properties. | In `getIsoFromFeature()`: expliciete check `if (p.iso_a3 === 'SYC' || p.iso_a3 === 'MUS') return p.iso_a3;` zodat handmatig toegevoegde polygonen in `high_res_usa.json` altijd als SYC/MUS herkend worden. |

### Handmatig toegevoegde landen in de kaart

| Land | ISO | Toelichting |
|------|-----|-------------|
| **Seychellen** | SYC | Geen of fout polygon in de bron-GeoJSON. In `assets/maps/high_res_usa.json` handmatig een kleine polygoon toegevoegd op de juiste coördinaten (Indische Oceaan). |
| **Mauritius** | MUS | Zelfde situatie. Handmatig toegevoegd in `high_res_usa.json` als kleine polygoon bij het eiland. |

Beide landen zitten in **Week 11 - Afrika (deel 5)** (`data/groups.json`). Zonder deze aanpassingen zouden ze in de kaart-quiz en op de wereldkaart-preview (group-pagina) niet of verkeerd getoond worden.

### Volgorde van properties bij het uitlezen van ISO

De app haalt de landcode uit GeoJSON-features in een vaste volgorde, omdat niet elke bron dezelfde property-namen gebruikt:

1. `iso_a3`, `ISO_A3`
2. `adm0_a3`, `ADM0_A3`
3. `sov_a3`, `brk_a3`
4. `ISO3`, `iso3`
5. `iso_a2`, `ISO_A2`

De eerste geldige waarde (geen `null`, `''` of `-99`) wordt genomen, daarna genormaliseerd naar ISO3 (2-letter → 3-letter via `ISO2_TO_ISO3`) en eventueel KOS→XKX. Zie `getIsoFromFeature()` in `app.js` en dezelfde volgorde/logica in `quiz_map.js` en `quiz_mix.js` voor feature-lookup.

### ISO3 ↔ ISO2 en vlagbestanden

- **Vlagbestanden** in `assets/flags/` zijn **lowercase** 2-letter (bijv. `nl.svg`, `sc.svg`, `mu.svg`). De mapping **ISO3 → ISO2** staat in `app.js` (`ISO3_TO_ISO2`) en in `data/iso3-to-iso2.json`; daar horen o.a. **SYC → sc** en **MUS → mu** bij.
- **ISO2 → ISO3** wordt in `app.js` afgeleid uit die mapping (plus een paar hardcoded zoals US→USA, GB/UK→GBR) en gebruikt bij `normalizeCountryIso()`, zodat GeoJSON die alleen `iso_a2` heeft toch naar dezelfde ISO3 leidt als in `countries.json` en `groups.json`.

### Nederland (NLD) als referentie voor “kleine” landen

Op de **kaart-quiz** en op de **wereldkaart-preview** (group-pagina) wordt bij het geselecteerde land een **oranje pijl** naar het centrum getekend. Voor **kleine** landen (moeilijk zichtbaar) wordt daarnaast een **ellips** om het land getekend.

- **Regel:** Een land krijgt een ellips **alleen als het kleiner is dan Nederland** in dezelfde kaartweergave.
- **Implementatie:** De “grootte” van een land wordt benaderd als de oppervlakte van de minimum-omhullende ellips (`rx * ry`) in SVG-coördinaten. Nederland (NLD) wordt in dezelfde GeoJSON/scale opgezocht; als de ellips-oppervlakte van het doelland **kleiner** is dan die van Nederland, wordt de ellips getekend.
- **Waar:** `quiz_map.js`: `getNetherlandsSize()`, `updateArrow()`; `app.js`: `buildArrowAndEllipseSvg()`, `getEllipseSizeForFeature()`, `minimumEnclosingEllipse()`.

Er is dus geen vaste lijst “kleine landen”: het is puur geometrisch. Kleine eilandstaten (Seychellen, Mauritius, Malta, enz.) krijgen hierdoor automatisch een ellips als ze kleiner zijn dan Nederland.

### Samenvatting per bestand

| Bestand | Uitzonderingen |
|---------|----------------|
| **`js/app.js`** | `isValidIsoCode(-99)`; `getIsoFromFeature`: SYC/MUS expliciet, KOS→XKX, property-volgorde; `buildArrowAndEllipseSvg`: ellips alleen als kleiner dan NLD. |
| **`js/quiz_map.js`** | Zelfde ISO-volgorde bij feature-lookup; `getNetherlandsSize()` voor ellips-drempel; `normalizeCountryIso()` voor 2→3. |
| **`js/quiz_mix.js`** | Zelfde ISO-uitlezing en `normalizeCountryIso()` voor kaartvragen. |
| **`data/countries.json`** | XKX (Kosovo), SYC (Seychellen), MUS (Mauritius) met Nederlandse naam en hoofdstad. |
| **`data/groups.json`** | XKX in week5_europa_deel2; SYC en MUS in week11_afrika_deel5. |
| **`assets/maps/high_res_usa.json`** | Handmatige polygonen voor SYC en MUS op de juiste geografische positie. |

---

## 11. Development

### Lokaal ontwikkelen

1. Start een lokale server (zie Installatie).
2. Bewerk HTML/CSS/JS; ververs de browser (hard refresh bij wijzigingen in JSON of scripts).
3. Voor wijzigingen in `data/` of `assets/maps/`: geen build; eventueel cache-busting in `loadWorldGeoJSON` (bijv. `?v=2`) aanpassen.

### Tests en linting

- Er zijn **geen** geautomatiseerde tests of lint-configuratie in de repo.
- Handmatig: alle quiztypen en de statistiekenpagina in meerdere browsers controleren; localStorage legen met “Clear stats” om schone state te testen.

### Handige acties

- **History resetten** — Header → “Clear stats” of in de console: `localStorage.removeItem('landjes_history_v1')`.
- **Oefenen-ingeklapt resetten** — In de console: `localStorage.removeItem('landjes_oefenen_collapsed')` (of het object aanpassen).
- **History exporteren** — Op een quizpagina: “Download log (JSON)” of in de console: `App.downloadHistoryAsJSON()`.

---

## 12. Roadmap (optioneel)

- **Offline-first** — Service worker + caching van JSON/GeoJSON en vlaggen voor volledig offline gebruik.
- **Meer kaartbestanden** — Optioneel kiezen tussen `high_res_usa` en een volledige wereldkaart voor landen die nu ontbreken.
- **Toetsenbord-navigatie** — Consistente shortcuts op alle pagina’s (bijv. Escape om preview te sluiten).
- **Toegankelijkheid** — ARIA-labels, focus management en screenreader-teksten verbeteren.
- **Tests** — Unit tests voor `getGroupProgress`, `mergePerCountryStats`, `getIsoFromFeature` en datumfilters.

---

## 13. Contributing

- **Branches** — Werk bij voorkeur in een feature-branch; baseer op `main` (of de actuele default branch).
- **Pull requests** — Beschrijf wijziging en waarom; verwijs naar issue indien van toepassing.
- **Code style** — Geen formatter gedefinieerd; houd bestaande stijl aan (2 spaces, Nederlandse commentaren en UI-teksten waar het project NL gebruikt).
- **Reikwijdte** — Wijzigingen in `data/countries.json` of `data/groups.json`: houd ISO- en veldnamen consistent; bij nieuwe landen ook `iso3-to-iso2` en vlag-SVG overwegen.
- **GeoJSON** — Bij aanpassingen aan de wereldkaart: test zowel kaart-quiz als wereldkaart-preview op de groepspagina; controleer landen met `-99` of 2-letter codes.

---

## 14. Licentie

Het project bevat geen licentiebestand in de repo. Vlaggen komen mogelijk uit een externe bron (bijv. [country-flags](https://github.com/hampusborgos/country-flags)); controleer daar de licentie. Voor de rest van de code: neem contact op met de rechthebbenden of voeg een licentie (bijv. MIT) toe aan de repository.

---

*README bijgewerkt voor Land Trainer (Landjes) — statische geografie-oefenapp met localStorage en GeoJSON-kaarten.*
