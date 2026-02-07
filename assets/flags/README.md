# Vlaggen (country-flags)

De app laadt vlaggen als **SVG** met 2-letter landcodes (lowercase), bijvoorbeeld `ar.svg` voor Argentinië. Die bestandsnamen komen overeen met de [country-flags](https://github.com/hampusborgos/country-flags) repository.

## Alle vlaggen in één keer toevoegen

**Optie 1 – Script (aanbevolen)**

In de projectmap (Landjes app):

```bash
./scripts/fetch-flags.sh
```

Dit script kloont de country-flags repo (eenmalig) en kopieert alle SVG-bestanden naar `assets/flags/`.

**Optie 2 – Handmatig**

1. Kloon of download de repository:
   ```bash
   git clone https://github.com/hampusborgos/country-flags.git
   ```
2. Kopieer de inhoud van de map **svg** naar `assets/flags/`:
   ```bash
   cp country-flags/svg/*.svg "assets/flags/"
   ```

De app gebruikt een interne mapping van ISO3 (bijv. ARG) naar de 2-letter bestandsnaam (ar.svg), dus de bestaande bestanden uit country-flags werken direct.

## Bron

- [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags) – accurate vlaggen in SVG en PNG (o.a. van Wikimedia Commons, public domain).
