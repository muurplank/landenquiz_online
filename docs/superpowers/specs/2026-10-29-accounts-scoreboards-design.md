# Accounts, synchronisatie en scoreborden: ontwerp

Datum: 2026-10-29 · Status: goedgekeurd in gesprek met de gebruiker

## Waarom

De gebruiker en een paar vrienden spelen Land Trainer op verschillende apparaten. De voortgang staat nu alleen in de browser (localStorage), dus op een ander apparaat begin je opnieuw. Ze willen ook tegen elkaar kunnen spelen: per spel zien wie er goed in is, en elke dag een gedeelde uitdaging.

## Doelen

1. **Account** met twee manieren van inloggen:
   - met Google;
   - met een gebruikersnaam en wachtwoord, zonder e-mailadres.
2. **Weergavenaam**: na de eerste login kiest de speler een naam. Die naam staat op de scoreborden, nooit de Google-naam. Namen zijn uniek.
3. **Alle voortgang synchroniseert** met het account: alle `landjes_*`-sleutels in localStorage, behalve puur apparaatgebonden instellingen (zie Sync). Nieuwe spellen die later een `landjes_*`-sleutel krijgen, gaan vanzelf mee.
4. **Scorebord per spel** in de vorm van tabel C uit de mockups (artifact inmiddels verwijderd). Per speler een rij met de onderdelen beste, snelheid, keer gespeeld en totaal. Onder elk onderdeel staat klein hoeveel punten het oplevert. Sorteren kan op totaal en op elk onderdeel. Je eigen rij is gemarkeerd.
5. **Dagopdracht voor elk spel**: elke dag zijn er per spel **3 dagpuzzels**, voor iedereen dezelfde. Poging 1 is puzzel 1, poging 2 is puzzel 2, poging 3 is puzzel 3 (seed = spel + datum + pogingnummer). Zo levert opnieuw spelen geen voorkennis op. Voor het **scorebord van vandaag** telt de **beste van je 3 pogingen**. Daarna mag je onbeperkt verder spelen met willekeurige puzzels, maar die tellen niet mee voor vandaag. (Besloten door de gebruiker.)
6. **Scorebord van vandaag** per spel, naast het algemene scorebord.
7. Alles is **openbaar binnen de site**: iedereen met een account ziet de scoreborden van iedereen. Er zijn geen vriendenlijsten nodig.

## Geen doel

- Vriendschapsverzoeken, chat, profielfoto's.
- Bescherming tegen valsspelen. De scores worden in de browser berekend, en voor een groepje vrienden is dat goed genoeg.
- Wachtwoord vergeten via e-mail. Een beheerder (Claude, via de CLI) kan een wachtwoord resetten.

## Anti-doelen (hier is het mislukt, ook al werkt het technisch)

- **Iets kost geld**, of er is een creditcard of betaald plan nodig. Alleen het gratis Firebase Spark-plan.
- **De site kan niet meer op GitHub Pages draaien**, of heeft een buildstap of server nodig. Het blijft statische bestanden met ES-modules, zoals nu.
- **De spellen werken anders zonder account.** Inloggen is optioneel. Uitgelogd werkt alles precies zoals nu, lokaal. Bestaande voortgang mag nooit verloren gaan (zie de memory-regel: de werking nooit ongevraagd wijzigen).
- **De gebruiker moet veel zelf klikken.** Claude regelt zoveel mogelijk via de CLI (Firebase CLI, REST-API's). Handwerk van de gebruiker blijft beperkt tot een eenmalige browser-login (`firebase login`) en eventueel één schakelaar in de console, als dat echt niet via de CLI kan. Is dat zo, dan krijgt de gebruiker een exacte klikinstructie.
- Een scorebord waarop je **niet kunt zien hoe de score is opgebouwd**.

## Randvoorwaarden

- Hosting: GitHub Pages, repo `muurplank/landenquiz_online`, branch `main`. De site draait onder `muurplank.github.io`. Dat domein moet een geautoriseerd domein zijn in Firebase Auth, net als `localhost` voor lokaal testen.
- Geen bundler en geen `package.json`. De Firebase JS SDK wordt als ES-module van de officiële CDN (gstatic) geladen, met een vaste versie.
- De Firebase-webconfig (apiKey enzovoort) mag in de repo staan, want die is publiek. De beveiliging zit in de Firestore-regels.
- Designtaal: de bestaande lichte SaaS-stijl en het licht/donker-thema van de site (`css/ui.css`, `js/ui/shell.js`).
- Er werkt soms een andere Claude-sessie tegelijk in deze repo. Stem af voordat je gedeelde bestanden aanpast (`js/core/store.js`, `js/ui/shell.js`, `js/games/common.js`, `js/games/daily.js`): stuur via SendMessage een bericht naar de andere sessie (ListAgents toont welke er draaien) met welke bestanden je gaat wijzigen, en wacht op akkoord. Werk in kleine commits op `main` en pull vooraf. De bestanden mogen worden aangepast. Houd de wijzigingen erin klein en zet de nieuwe logica in eigen modules (bijvoorbeeld `js/core/account.js`, `js/core/sync.js`, `js/core/scores.js`).

## Wat besloten is

**Dienst: Firebase** (Auth + Firestore, Spark-plan). Daar zit Google-login in zonder dat je zelf een OAuth-client in Google Cloud hoeft aan te maken. Zo blijft het handwerk het kleinst.

**Gebruikersnaam + wachtwoord**: dit loopt via Firebase e-mail/wachtwoord met een afgeleid, niet-bestaand e-mailadres (bijvoorbeeld `<gebruikersnaam>@users.landtrainer.invalid`). De speler ziet alleen een veld voor de gebruikersnaam.

**Inlogknop**: in de bovenbalk van elke pagina (shell). Ingelogd staat daar je naam, met een menu met Uitloggen.

**Eerste login op een apparaat met lokale voortgang**: die voortgang wordt samengevoegd met wat er al in het account staat. Er gaat nooit iets verloren.

**Bestaande dagspellen** (Warm of koud, Silhouet, Grensroute, Geo trivia) hebben al een dagversie (`js/games/daily.js`: `playDate`, `hash`/`rng`-seed per dag, `landjes_daily_results`). Voor deze spellen verandert alleen dat je vaker mag spelen en dat de eerste 3 pogingen worden bijgehouden. De rest van hoe ze werken blijft gelijk.

## Keuzes van Claude (de gebruiker heeft ze niet expliciet bevestigd)

- **Puntenformule**, net als in de mockup: kwaliteit levert tot 1000 punten op, plus een snelheidsbonus (max. 200) en 5 punten per keer gespeeld (max. 100). "Kwaliteit" verschilt per spel: % goed bij quizzen, aantal gokken bij Warm of koud, gebruikte hints bij Silhouet, stappen ten opzichte van de kortste route bij Grensroute, score bij Geo trivia. De precieze vertaling naar punten is aan de bouwer. Eis: de onderdelen tellen zichtbaar op tot het totaal, en de uitleg staat onder de tabel.
- **Scorebord van vandaag**: dezelfde tabelvorm, met als onderdelen de beste van de eerste 3 pogingen en de tijd van die poging. "Keer gespeeld" is daar niet nodig.
- **Welke scoreborden er zijn** (besloten door de gebruiker): de vier dagspellen (Warm of koud, Silhouet, Grensroute, Geo trivia), **één dagquiz per quiztype**: Hoofdsteden, Vlaggen, Kaart (vragen uit alle landen, via een seed per dag en poging), Het Grote Eindexamen en Typ ze allemaal (dagvariant via een seed). Flashcards en kwartet krijgen geen scorebord. De bestaande quizzen per set blijven zoals ze zijn. De dagquizzen komen er als nieuw item bij.
- **Algemeen scorebord**: houdt alle tijden bij en is gebaseerd op alle gespeelde potjes in je gesynchroniseerde voortgang (ook van vóór je account, na de merge). Archief en willekeurige potjes van de bordspellen tellen mee voor het algemene bord, maar niet voor vandaag. Elke speler houdt per spel een kleine samenvatting bij (beste, gem. tijd, keer gespeeld) die de scoreborden lezen. Zo hoef je niet de hele geschiedenis van iedereen op te halen. (Keuze van Claude.)
- **Naam**: één naam per speler. Bij gebruikersnaam + wachtwoord is de gebruikersnaam ook de weergavenaam. Google-spelers kiezen er na de eerste login een. Een naam kan later worden veranderd. Scores hangen aan het account (uid), niet aan de naam. Uniek maken via een namenregister dat in een transactie wordt geclaimd. (Keuze van Claude.)
- **Geschiedenis in de cloud mag ingekort worden**: de per-vraag-events van oude sessies mogen in de cloudkopie wegvallen (zoals `saveHistory` lokaal al doet als de opslag vol is). Sessietotalen en per-land-stand blijven bewaard, zodat statistieken en voortgang kloppen. Lokaal blijft alles zoals nu. (Keuze van Claude.)
- **Archiefdagen** (`?date=` uit `archief.html`) en de willekeurige modus tellen niet voor het scorebord van vandaag.
- **De dag** is de lokale datum (zoals nu in `daily.js`).
- **Apparaatgebonden instellingen synchroniseren niet**: thema (`landjes_theme`), ingeklapte panelen, filters en de examen-intro-vlag.

## Aan de bouwer

- De Firestore-datastructuur en de beveiligingsregels. Eisen: iedereen die is ingelogd mag de scoreborden lezen; elke speler schrijft alleen zijn of haar eigen voortgang en scores; namen zijn uniek.
- De sync-strategie (wanneer, conflictafhandeling, offline). Eisen: geen dataverlies, en de site werkt zonder netwerk zoals nu.
- Hoe de scoreborden in de bestaande pagina's komen (tabblad, paneel of aparte pagina), in de huisstijl.
- De volgorde van bouwen, en hoe de Firebase-setup via de CLI verloopt (projectnaam, Firestore-locatie in de EU, providers aanzetten, geautoriseerde domeinen).
- De puntentabel per spel (zie hierboven).
