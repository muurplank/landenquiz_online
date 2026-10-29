# Accounts + synchronisatie: implementatieplan (deel 1 van 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spelers kunnen inloggen met Google of met gebruikersnaam + wachtwoord, kiezen een unieke naam, en al hun `landjes_*`-voortgang synchroniseert tussen apparaten.

**Architecture:** Firebase Auth + Firestore (Spark-plan), geladen als ES-modules van gstatic. De site blijft statisch op GitHub Pages. Een nieuwe module `js/core/sync.js` onderschept `localStorage.setItem/removeItem` voor sleutels die gesynchroniseerd worden. Daardoor hoeven de spellen zelf niet te veranderen. Merges per sleutel zitten in de pure module `js/core/merge.js`, die met `node --test` getest wordt. De UI (inlogknop + dialoog) komt in `js/ui/account.js` en wordt vanuit `renderTopbar` gemount.

**Tech Stack:** Vanilla ES-modules, Firebase JS SDK 10.12.2 (modular, CDN), Firestore, firebase-tools (CLI), `node --test` (Node 22).

**Spec:** `docs/superpowers/specs/2026-10-29-accounts-scoreboards-design.md`

Deel 2 (dagpogingen 1–3 met eigen seed, dagquizzen, scoreborden) is een apart plan, te schrijven nadat dit deel live staat. Dit deel legt de `users/{uid}`-structuur vast waar deel 2 op voortbouwt.

## Global Constraints

- Alleen het gratis Firebase **Spark**-plan, geen billing-account koppelen.
- Geen buildstap, geen `package.json` in de site. SDK-URL's met vaste versie: `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js`, `…/firebase-auth.js`, `…/firebase-firestore.js`.
- Uitgelogd gedraagt de site zich exact zoals nu. Inloggen is optioneel.
- Nooit lokale voortgang weggooien, behalve in het expliciete accountwissel-geval (Task 4) en alleen nadat die data in de cloud staat.
- Taal van alle UI-teksten: Nederlands, in de toon van de site (kort, geen nep-SaaS-teksten).
- Stijl: bestaande tokens en componenten uit `css/ui.css` (`.btn`, `.card`, `.seg`, `.icon-btn`), licht + donker.
- Gebruikersnaam/naam: 3–20 tekens, `[A-Za-z0-9_-]`, uniek zonder hoofdlettergevoeligheid.
- Afgeleid e-mailadres voor gebruikersnaam-login: `<naam in kleine letters>@users.landtrainer.invalid`. Wachtwoord minimaal 6 tekens (Firebase-minimum).
- Gedeelde bestanden (`js/ui/shell.js`, `js/core/store.js`, `js/games/*.js`): eerst via SendMessage afstemmen met andere actieve Claude-sessies (ListAgents). Wijzigingen daarin minimaal houden.
- Niet gesynchroniseerd (apparaatgebonden): `landjes_theme`, `landjes_oefenen_collapsed`, `landjes_stats_filters`, `landjes_exam_intro_seen`, `landjes_exam_show_feedback`, `landjes_picker_v*`, `landjes_alles_oneindig`, `landjes_cheat_open_*`, en alles met prefix `landjes__` (eigen sync-administratie).

## Review Focus

1. **Twee apparaten spelen offline en synchroniseren daarna**: geen sessie raakt kwijt. De geschiedenis is een vereniging op sessie-`id`, en `perGroup` wordt opnieuw berekend. Wordt getest in Task 2.
2. **Geschiedenis groter dan de Firestore-limiet van 1 MiB**: de cloudkopie wordt compact gemaakt (events eruit) en zo nodig in delen opgeslagen. De sync faalt dan niet stil. Wordt getest in Task 2 (`compactHistory`) en Task 4 (`chunk`).
3. **Twee mensen op hetzelfde apparaat** (A logt uit, B logt in): de lokale data van A wordt niet in het account van B gemerged. Wordt getest in Task 4 (`planSignIn`).
4. **Naam bezet in andere hoofdletters** ("Piet" tegenover "piet"): wordt geweigerd met een duidelijke melding. Wordt getest in Task 3 (`normalizeName`) en in de regels (Task 1).
5. **Popup geblokkeerd (iPhone Safari) of localStorage geblokkeerd (privémodus)**: bij een geblokkeerde popup volgt een redirect-fallback. Zonder storage toont de dialoog een melding en blijft de site werken. Wordt handmatig gecontroleerd in Task 5.

---

### Task 1: Firebase-project, regels en config via de CLI

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`
- Create: `js/core/firebase-config.js`
- Create: `docs/accounts-beheer.md` (beheer-cheatsheet: wachtwoord resetten, regels deployen)

**Interfaces:**
- Produces: `export const firebaseConfig = { apiKey, authDomain, projectId, appId, … }` in `js/core/firebase-config.js`. Firestore-paden: `users/{uid}` = `{ name: string, nameKey: string, createdAt }`; `users/{uid}/progress/{docId}` = `{ value: string /* JSON */, updatedAt: number, part?: number, parts?: number }`; `names/{nameKey}` = `{ uid }`.

- [ ] **Step 1: CLI installeren en inloggen.** `npm i -g firebase-tools`, dan `firebase login`. Dit is de enige stap waarbij de gebruiker in de browser inlogt. Vertel dat vooraf in één zin.
- [ ] **Step 2: Project en web-app aanmaken.** `firebase projects:create landtrainer-<4 tekens random> --display-name "Land Trainer"`, `firebase apps:create web "Land Trainer" --project <id>`, `firebase apps:sdkconfig web --project <id>`. Schrijf de config naar `js/core/firebase-config.js`.
- [ ] **Step 3: Firestore aanmaken** in de EU: `firebase firestore:databases:create "(default)" --location=eur3 --project <id>`. Verwacht: database aangemaakt, geen billing gevraagd.
- [ ] **Step 4: `firestore.rules` schrijven** met deze eisen:
  - `users/{uid}`: lezen mag iedereen die is ingelogd. Schrijven mag alleen als `request.auth.uid == uid`. `name` matcht `^[A-Za-z0-9_-]{3,20}$` en `nameKey == name.lower()`.
  - `users/{uid}/progress/{doc}`: lezen en schrijven alleen door de eigenaar.
  - `names/{key}`: lezen mag iedereen die is ingelogd. Aanmaken alleen met `uid == request.auth.uid` en alleen als het document nog niet bestaat. Verwijderen alleen door de eigenaar. Updaten nooit.
  - Al het andere: geweigerd.

  Deployen met `firebase deploy --only firestore:rules --project <id>`.
- [ ] **Step 5: Auth-providers en domeinen aanzetten.** Probeer eerst via de REST-API van Identity Toolkit met het token van firebase-tools: Auth initialiseren, e-mail/wachtwoord aan, Google aan, en `muurplank.github.io` plus `localhost` toevoegen aan de geautoriseerde domeinen. Lukt een van deze onderdelen niet via de CLI, geef de gebruiker dan een exacte klikinstructie (Console → Authentication → Aan de slag → Sign-in method: E-mail/wachtwoord aan, Google aan → Instellingen → Geautoriseerde domeinen: `muurplank.github.io`). Controleer daarna met `curl` op `accounts:signUp` met een testaccount dat e-mail/wachtwoord werkt, en verwijder het testaccount weer.
- [ ] **Step 6: Rooktest van de regels.** Schrijf met een testaccount via REST naar `users/<ander-uid>`. Verwacht: `PERMISSION_DENIED`. Schrijven naar het eigen `users/<uid>`: OK. Ruim het testaccount op.
- [ ] **Step 7: `docs/accounts-beheer.md` schrijven** met de commando's voor wachtwoord-reset en het deployen van de regels. Commit `firebase.json .firebaserc firestore.rules js/core/firebase-config.js docs/accounts-beheer.md`: "Add Firebase project config and Firestore rules".

### Task 2: Pure merge-logica (`js/core/merge.js`)

**Files:**
- Create: `js/core/merge.js`
- Test: `tests/merge.test.mjs` (draaien met `node --test tests/`)

**Interfaces:**
- Produces:
  - `isSyncedKey(key: string): boolean` past de uitsluitlijst uit Global Constraints toe, en alleen voor sleutels die beginnen met `landjes_`.
  - `mergeValue(key: string, local: any, remote: any, localAt: number, remoteAt: number): any` geeft de samengevoegde waarde (zie hieronder).
  - `compactHistory(history): history` geeft een kopie terug zonder `perCountryStats[*].events`.
  - `recomputePerGroup(sessions): perGroup` met dezelfde velden als `finalizeSession` in `js/core/store.js`.

Merge-regels per sleutel:
- `landjes_history_v1`: `sessions` worden verenigd op `id`. Bij een dubbele id wint de sessie met events. Sorteer op `startedAt` en bereken `perGroup` opnieuw.
- `landjes_daily_results`: diepe merge spel → datum. Bij een conflict wint `done: true`. Zijn beide klaar, dan wint de lokale.
- `landjes_*_days` (`warmkoud`, `silhouet`, `grensroute`): per datum wint de klare stand. Zijn beide klaar of beide niet, dan wint de stand met de meeste `guesses`/stappen (de langste array in het object).
- `gameStats`-vormen (`landjes_*_stats`, `landjes_*_stats_daily`, `{played, won, streak, best, guesses}`): `played`, `won` en `best` krijgen het maximum. `streak` en `guesses` komen van de kant met de hoogste `played`.
- `landjes_geotrivia`: `best` en `rounds` krijgen het maximum. `cats` komt van de nieuwste kant.
- Alle andere sleutels: de nieuwste kant wint, op basis van `localAt`/`remoteAt`.
- `null`/ontbrekend aan één kant: neem de andere kant.

- [ ] **Step 1: Schrijf de falende tests**, onder andere:
  - `history: union of sessions from two devices keeps all ids`: local `[a,b]`, remote `[b,c]` → ids `[a,b,c]`, en `perGroup[g].sessionsPlayed === 3`.
  - `history: duplicate id prefers the copy with events`.
  - `daily_results: done beats not-done, other dates kept`.
  - `days: finished game beats unfinished`.
  - `gameStats: takes max played/won/best and streak from higher played`.
  - `unknown key: newest wins`.
  - `isSyncedKey`: `landjes_theme` → false, `landjes_cheat_open_x` → false, `landjes__sync_meta` → false, `landjes_history_v1` → true, `landjes_geotrivia` → true, `other` → false.
  - `compactHistory strips events but keeps correct_count`.
- [ ] **Step 2:** `node --test tests/`. Verwacht: FAIL (module bestaat niet).
- [ ] **Step 3: Implementeer** `js/core/merge.js`, zonder imports van DOM-modules.
- [ ] **Step 4:** `node --test tests/`. Verwacht: alles PASS.
- [ ] **Step 5: Commit** `js/core/merge.js tests/merge.test.mjs`: "Add progress merge rules for sync".

### Task 3: Account-laag (`js/core/account.js`)

**Files:**
- Create: `js/core/account.js`, `js/core/names.js`
- Test: `tests/names.test.mjs`

**Interfaces:**
- Consumes: `firebaseConfig` (Task 1).
- Produces:
  - `names.js` (puur): `normalizeName(s: string): string` (trim, kleine letters); `validateName(s: string): string|null` (null = OK, anders een Nederlandse foutmelding); `usernameEmail(name: string): string`.
  - `account.js`:
    - `onUser(cb: (user: {uid, name: string|null, provider: 'google'|'password'}|null) => void): () => void`
    - `signInGoogle(): Promise<void>` (popup; bij `auth/popup-blocked` of `auth/operation-not-supported-in-this-environment` volgt `signInWithRedirect`)
    - `signUpPassword(name, password): Promise<void>`
    - `signInPassword(name, password): Promise<void>`
    - `claimName(name): Promise<void>` (Firestore-transactie: `names/{key}` mag niet bestaan → aanmaken, `users/{uid}` zetten. Een oude naam wordt in dezelfde transactie verwijderd. Bezet geeft `Error('Die naam is al bezet.')`)
    - `signOut(): Promise<void>`
    - `db`, `auth` (geëxporteerd voor `sync.js`)
  - Bij `signUpPassword`: eerst nagaan of `names/{key}` vrij is, dan `createUserWithEmailAndPassword`, dan `claimName`. Faalt de claim, verwijder dan de net aangemaakte auth-user.
  - Foutcodes vertaald naar het Nederlands: `auth/invalid-credential` → "Naam of wachtwoord klopt niet.", `auth/email-already-in-use` → "Die naam is al bezet.", `auth/weak-password` → "Kies een wachtwoord van minstens 6 tekens.", netwerk → "Geen verbinding. Probeer het zo opnieuw."

- [ ] **Step 1: Falende tests voor `names.js`**: `validateName('ab')` geeft een melding, `validateName('Piet_01')` geeft null, `validateName('piet piet')` geeft een melding, `normalizeName(' Piet ') === 'piet'`, `usernameEmail('Piet') === 'piet@users.landtrainer.invalid'`.
- [ ] **Step 2:** `node --test tests/`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer `names.js` en `account.js`.**
- [ ] **Step 4:** `node --test tests/`. Verwacht: PASS. Rooktest in de browser via een lokale server (`python3 -m http.server 8000`): in de console van `index.html` `import('/js/core/account.js')`, dan `signUpPassword('testpiet', 'geheim1')`. Verwacht: `users/{uid}.name === 'testpiet'`. Een tweede claim van `TestPiet` met een ander account geeft "Die naam is al bezet." Ruim de testaccounts op.
- [ ] **Step 5: Commit**: "Add account layer with Google and username login".

### Task 4: Synchronisatie (`js/core/sync.js`)

**Files:**
- Create: `js/core/sync.js`
- Modify: `exam.html`, `sporcle.html` (één regel `<script type="module" src="js/core/sync.js"></script>`, omdat die pagina's `renderTopbar` niet gebruiken)
- Test: `tests/sync-plan.test.mjs`

**Interfaces:**
- Consumes: `isSyncedKey`, `mergeValue`, `compactHistory` (Task 2); `onUser`, `db` (Task 3).
- Produces:
  - Puur, en getest: `planSignIn({ ownerUid: string|null, uid: string }): 'merge'|'replace'`. Geen owner of dezelfde owner geeft `'merge'`. Een andere owner geeft `'replace'` (lokale gesynchroniseerde sleutels worden vervangen door de cloud).
  - Puur, en getest: `chunk(json: string, max = 900_000): string[]`.
  - Neveneffecten: bij het laden van de module wordt `Storage.prototype.setItem/removeItem` gepatcht. Bij een gesynchroniseerde sleutel komt `landjes__sync_meta[key] = Date.now()` en een vlag `landjes__sync_dirty`, plus een debounced push (2 s), en `flush()` bij `pagehide`/`visibilitychange:hidden`.
  - `syncStatus` event: `window.dispatchEvent(new CustomEvent('landjes:sync', { detail: { state: 'idle'|'syncing'|'error'|'offline' } }))`.
  - `export function flush(): Promise<void>`.
  - Bij inloggen (`onUser` met user): alle `users/{uid}/progress`-docs ophalen. Documenten die in delen staan (`docId = key + '#' + part`) aan elkaar plakken. Dan per sleutel `planSignIn` → `mergeValue` of vervangen. Lokaal schrijven (zonder dirty te markeren), pushen wat afwijkt, `landjes__sync_owner = uid` zetten, en `location.reload()` als er lokaal iets veranderde, zodat open pagina's de nieuwe stand tonen. Dat laatste alleen bij de eerste sync op dit apparaat in deze sessie, om lussen te voorkomen (vlag in `sessionStorage`).
  - Bij uitloggen: eerst `flush()`. `landjes__sync_owner` blijft staan.
  - Push: `landjes_history_v1` gaat als `compactHistory`, en alles via `chunk` naar `{ value, updatedAt, part, parts }`. Oude, overbodige delen worden verwijderd.

- [ ] **Step 1: Falende tests**: `planSignIn({ownerUid:null, uid:'a'}) === 'merge'`, `planSignIn({ownerUid:'a', uid:'a'}) === 'merge'`, `planSignIn({ownerUid:'a', uid:'b'}) === 'replace'`. `chunk('x'.repeat(2_000_000)).length === 3`, en de delen samen geven de originele string. `chunk('{}').length === 1`.
- [ ] **Step 2:** `node --test tests/`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer `sync.js`.** Zet de pure functies bovenaan, zonder Firebase-imports in die functies. Importeer `account.js` dynamisch, zodat de tests `sync.js` kunnen importeren zonder netwerk (of zet de pure delen in `js/core/sync-plan.js`).
- [ ] **Step 4:** `node --test tests/`. Verwacht: PASS. Handmatig, met twee browserprofielen en hetzelfde testaccount:
  - Speel in profiel A een quiz, en ververs profiel B. Verwacht: de sessie staat in `stats.html` van B.
  - Zet A offline, speel, en ga weer online. Verwacht: het pushen gebeurt alsnog.
  - Log in profiel B in met een tweede account. Verwacht: B toont de data van het tweede account, en de data van A zit niet in de cloud van het tweede account.
- [ ] **Step 5: Commit**: "Sync landjes progress to Firestore".

### Task 5: Inlogknop en dialoog (`js/ui/account.js`)

**Files:**
- Create: `js/ui/account.js`
- Modify: `js/ui/shell.js` (in `renderTopbar` een `<div class="account-slot" data-account></div>` vóór de themaknop, en `import('./account.js').then(m => m.mountAccount(el.querySelector('[data-account]')))`. Dit importeert ook `sync.js`. Stem eerst af met andere sessies.)
- Modify: `css/ui.css` (stijl voor de dialoog en de accountchip, met bestaande tokens)
- Modify: `exam.html`, `sporcle.html`: alleen de sync (Task 4). Geen knop, want die pagina's hebben een eigen chrome, en de bestaande stijl blijft ongemoeid.

**Interfaces:**
- Consumes: alles uit `account.js` (Task 3), het event `landjes:sync` (Task 4).
- Produces: `mountAccount(slot: HTMLElement): void`.

Gedrag:
- Uitgelogd: knop "Inloggen" (`.btn`, klein).
- De knop opent een `<dialog>` met: de knop "Inloggen met Google", een scheiding "of", en een `.seg`-schakelaar Inloggen / Account maken met de velden Gebruikersnaam en Wachtwoord. Fouten staan inline (`aria-live`).
- Na een Google-login zonder naam opent de dialoog direct op de stap "Kies je naam", met de uitleg "Deze naam zien je vrienden op de scoreborden." Deze stap kan niet worden overgeslagen. Sluit de speler de dialoog, dan blijft de chip "Kies je naam" tonen.
- Ingelogd: een chip met de naam en een klein sync-bolletje (idle, syncing, error). Het menu bevat "Naam wijzigen" en "Uitloggen".
- Escape en een klik naast de dialoog sluiten hem. De focus gaat naar het eerste veld. Bij een fout wordt het wachtwoordveld leeggemaakt.

- [ ] **Step 1: Implementeer `mountAccount`** en de stijlen.
- [ ] **Step 2: Handmatige controle** via de lokale server, licht en donker, ook op telefoonbreedte (390 px):
  - een account aanmaken met een gebruikersnaam
  - uitloggen en weer inloggen
  - een verkeerd wachtwoord geeft "Naam of wachtwoord klopt niet."
  - Google-login gevolgd door de naamkeuze
  - de naam wijzigen
  - in privémodus met geblokkeerde storage blijft de site werken, en de dialoog meldt "Inloggen werkt niet in deze browserinstelling."
- [ ] **Step 3: Commit**: "Add login button and account dialog".

### Task 6: Live zetten en controleren

- [ ] **Step 1:** `node --test tests/`. Verwacht: alles PASS.
- [ ] **Step 2: Push naar `main`** na `git pull --rebase` (de andere sessie werkt ook op main).
- [ ] **Step 3: Controleer `https://muurplank.github.io/landenquiz_online/`**: de knop verschijnt, inloggen met een gebruikersnaam werkt op het live domein, en Google-login werkt (er is geen `auth/unauthorized-domain`).
- [ ] **Step 4:** Werk de memory bij (`landtrainer-accounts-plan.md`): deel 1 staat live, en de projectnaam staat erbij. Schrijf daarna het plan voor deel 2 (dagpogingen, dagquizzen, scoreborden).
