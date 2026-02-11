# Satellietkaart Upgrade - Documentatie

## Overzicht

De oude SVG-based kaart in de quiz is vervangen door een moderne satellietkaart met:
- **NASA Blue Marble** achtergrond (via GIBS tile server)
- **Zwarte grenzen** (Google Maps-stijl)
- **Witte highlight** voor het actieve land
- **Efficiënte updates** via MapLibre GL JS feature-state (geen re-render)

## Gewijzigde Bestanden

### Nieuwe Bestanden
- `js/quiz_map_satellite.js` - Satellietkaart module met MapLibre GL JS

### Gewijzigde Bestanden
- `js/quiz_map.js` - Aangepast om satellietkaart te gebruiken (oude SVG code verwijderd)
- `pages/quiz_map.html` - MapLibre GL JS toegevoegd
- `css/style.css` - MapLibre specifieke styles toegevoegd

## Technische Details

### MapLibre GL JS Implementatie

De nieuwe kaart gebruikt MapLibre GL JS v4 met:

1. **Raster Layer (Satelliet)**
   - Bron: NASA GIBS Blue Marble tiles
   - URL: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/...`
   - Equirectangular projectie, Web Mercator tiles

2. **Vector Layer (Grenzen)**
   - Bron: `assets/maps/custom_world.json` (bestaande GeoJSON)
   - Fill: Transparant (standaard) / Wit (actief land)
   - Stroke: Zwart, 0.5-1.5px (zoom-aware)

3. **Feature State voor Highlights**
   - Gebruikt MapLibre's `setFeatureState()` API
   - Geen volledige re-render nodig bij land-wissel
   - Smooth transitions

### ISO Code Matching

De module ondersteunt robuuste ISO code matching:
- Properties: `iso_a3`, `ISO_A3`, `adm0_a3`, `ADM0_A3`, `sov_a3`, `iso_a2`
- Normaliseert via `window.App.normalizeCountryIso()`
- Case-insensitive, trim whitespace
- Filtert `-99` waarden

### API Interface

```javascript
// Initialiseer kaart
await window.SatelliteMap.init('map-container', '../assets/maps/custom_world.json');

// Highlight land (wit maken)
window.SatelliteMap.highlightCountry('NLD'); // ISO code

// Zoom naar regio (lijst landen)
window.SatelliteMap.fitToRegion(['NLD', 'BEL', 'DEU'], {
  padding: { top: 50, bottom: 50, left: 50, right: 50 },
  maxZoom: 6,
  duration: 1000
});

// Reset naar wereld-overzicht
window.SatelliteMap.resetView();

// Cleanup
window.SatelliteMap.destroy();
```

## Integratie met Bestaande Quiz Flow

De satellietkaart is een **drop-in vervanging** die naadloos integreert met:

### State Management
- `currentCountry.iso` → `highlightCountry(iso)`
- `group.countries` → `fitToRegion(countries)` (voor regionale zoom)

### Update Triggers
- `showNextQuestion()` → roept `setTargetOnMap(iso)` aan
- `setTargetOnMap(iso)` → roept `SatelliteMap.highlightCountry(iso)` aan

### Bestaande Features Behouden
- ✅ Deck/mastery tracking
- ✅ Session statistieken
- ✅ Type-in mode (continent/wereld)
- ✅ Button-click mode (regionale delen)
- ✅ Dark mode support
- ✅ Responsive layout

## Geen Blue Marble Image Nodig

De implementatie gebruikt **NASA GIBS tile server** voor de satelliet achtergrond:
- Geen lokale `bluemarble.jpg` nodig
- Tiles worden on-demand geladen
- Automatische caching door browser
- Hoge resolutie bij inzoomen

## Performance

### Voordelen vs Oude SVG Implementatie
- ✅ **Snellere updates**: Feature-state vs volledige SVG re-render
- ✅ **Betere zoom**: Hardware-accelerated WebGL
- ✅ **Lagere memory**: Tiles worden on-demand geladen
- ✅ **Smooth pan/zoom**: Native MapLibre controls

### Optimalisaties
- Feature IDs voor snelle state updates
- ISO index (Map) voor O(1) lookups
- Zoom-aware line widths
- Disabled rotation (niet nodig voor quiz)

## Browser Compatibiliteit

MapLibre GL JS vereist:
- Modern browsers met WebGL support
- Chrome 65+, Firefox 57+, Safari 12+, Edge 79+
- Mobiel: iOS 12+, Android 5+

## Fallback Strategie

Als MapLibre niet laadt:
```javascript
if (typeof maplibregl === 'undefined') {
  console.error('MapLibre GL JS niet geladen!');
  // Toon error message aan gebruiker
  return;
}
```

De oude SVG code is verwijderd, maar kan uit git history worden hersteld indien nodig.

## Toekomstige Uitbreidingen

Mogelijke verbeteringen:
1. **Offline mode**: Download tiles voor offline gebruik
2. **Custom tiles**: Eigen Blue Marble image hosten
3. **Animaties**: Smooth highlight transitions
4. **Markers**: Pijlen/labels voor kleine landen
5. **3D terrain**: Hoogte-data voor bergachtige gebieden

## Troubleshooting

### Kaart laadt niet
- Check browser console voor errors
- Verify MapLibre GL JS script is geladen
- Check GeoJSON path: `../assets/maps/custom_world.json`
- Verify webserver draait (geen `file://` protocol)

### Landen worden niet gehighlight
- Check ISO code matching in console logs
- Verify GeoJSON heeft `iso_a3` of `iso_a2` properties
- Check `normalizeCountryIso()` functie in `app.js`

### Performance issues
- Reduce tile quality (lagere zoom levels)
- Disable animations (`duration: 0`)
- Check WebGL support in browser

## Credits

- **MapLibre GL JS**: Open-source mapping library
- **NASA GIBS**: Blue Marble satellite imagery
- **GeoJSON**: Natural Earth data (bestaand)
