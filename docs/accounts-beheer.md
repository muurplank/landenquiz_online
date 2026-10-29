# Accounts: beheer

Firebase-project: `landtrainer-yb9x` (Spark, gratis). Console: https://console.firebase.google.com/project/landtrainer-yb9x

Alle commando's gaan uit van `firebase login` op deze computer.

```bash
TOK=$(node -e 'const c=require(process.env.HOME+"/.config/configstore/firebase-tools.json");console.log(c.tokens.access_token)')
H=(-H "Authorization: Bearer $TOK" -H "x-goog-user-project: landtrainer-yb9x" -H "Content-Type: application/json")
```

Is het token verlopen (na ongeveer een uur), voer dan een willekeurig `firebase`-commando uit, bijvoorbeeld `firebase projects:list`. Daarmee wordt het ververst.

## Wachtwoord resetten (gebruikersnaam-account)

Een gebruikersnaam-account logt in met het e-mailadres `<naam in kleine letters>@users.landtrainer.invalid`.

```bash
# uid opzoeken
curl -s "${H[@]}" -d '{"email":["piet@users.landtrainer.invalid"]}' \
  https://identitytoolkit.googleapis.com/v1/projects/landtrainer-yb9x/accounts:lookup
# nieuw wachtwoord zetten
curl -s "${H[@]}" -d '{"localId":"<uid>","password":"nieuwwachtwoord"}' \
  https://identitytoolkit.googleapis.com/v1/projects/landtrainer-yb9x/accounts:update
```

## Beveiligingsregels aanpassen

Pas `firestore.rules` aan en voer dan uit: `firebase deploy --only firestore:rules`.

## Hoe het werkt

- `js/core/account.js`: inloggen (Google, of gebruikersnaam + wachtwoord) en het claimen van een naam (`names/{naam}` en `users/{uid}`).
- `js/core/sync.js`: synchroniseert alle `landjes_*`-sleutels uit localStorage naar `users/{uid}/progress`. Apparaatinstellingen gaan niet mee, zie `isSyncedKey` in `js/core/merge.js`.
- `js/core/merge.js`: per sleutel de regel waarmee twee apparaten worden samengevoegd.
- Testen: `node --test 'tests/*.test.mjs'`.
