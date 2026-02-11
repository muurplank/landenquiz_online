/**
 * SATELLIET KAART IMPLEMENTATIE (DROP-IN VERVANGING)
 * 
 * Deze module vervangt de oude SVG-based kaart door een satellietkaart met:
 * - Blue Marble achtergrond (equirectangular)
 * - Zwarte grenzen (Google Maps-stijl)
 * - Wit highlight voor het actieve land
 * - Efficiënte updates via feature-state (geen re-render)
 * 
 * INTERFACE:
 * - activeCountry (iso): String - ISO code van het actieve land
 * - activeRegion (isos): Array<String> - Lijst van landen voor zoom/fit
 * - mode: 'single' | 'region' - Enkele land of regio-modus
 * 
 * MATCHING:
 * - Case-insensitive + trim
 * - Ondersteunt iso_a3, iso_a2, sov_a3, adm0_a3
 * - Normaliseert via window.App.normalizeCountryIso
 */

(function() {
  'use strict';

  // Check of MapLibre beschikbaar is
  if (typeof maplibregl === 'undefined') {
    console.error('MapLibre GL JS niet geladen! Voeg <script src="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js"></script> toe.');
    return;
  }

  // Globale map instance
  let map = null;
  let currentHighlightedIso = null;
  let geoJsonData = null;
  let isoToFeatureId = new Map();
  let smallCountryMarkers = []; // Array van markers voor kleine landen
  let netherlandsArea = null; // Oppervlakte van Nederland als referentie
  let smallCountriesSet = new Set(); // Set van ISO codes van kleine landen

  /**
   * Normaliseer ISO code voor matching
   */
  function normalizeIso(iso) {
    if (!iso) return null;
    const normalized = String(iso).trim().toUpperCase();
    // Gebruik de bestaande App normalisatie als beschikbaar
    if (window.App && window.App.normalizeCountryIso) {
      return window.App.normalizeCountryIso(normalized);
    }
    return normalized;
  }

  /**
   * Haal ISO code uit GeoJSON feature properties
   */
  function getIsoFromProperties(props) {
    if (!props) return null;
    
    // Probeer verschillende property namen (volgorde is belangrijk)
    const candidates = [
      props.iso_a3,
      props.ISO_A3,
      props.adm0_a3,
      props.ADM0_A3,
      props.sov_a3,
      props.brk_a3,
      props.ISO3,
      props.iso3,
      props.iso_a2,
      props.ISO_A2
    ];

    for (const candidate of candidates) {
      if (candidate && candidate !== '-99' && String(candidate) !== '-99') {
        let iso = normalizeIso(candidate);
        
        // Kosovo correctie: KOS → XKX
        if (iso === 'KOS') {
          iso = 'XKX';
        }
        
        return iso;
      }
    }
    return null;
  }

  /**
   * Bouw index van ISO codes naar feature IDs
   * Met generateId: true gebruikt MapLibre de array index als feature ID
   */
  function buildIsoIndex(geojson) {
    const index = new Map();
    if (!geojson || !geojson.features) return index;

    geojson.features.forEach((feature, idx) => {
      const iso = getIsoFromProperties(feature.properties);
      if (iso) {
        // Met generateId: true is de feature ID gewoon de array index
        index.set(iso, idx);
      }
    });

    return index;
  }

  /**
   * Handmatige oppervlakte voor problematische landen (in vierkante graden)
   * Deze landen krijgen altijd een marker omdat ze klein zijn
   */
  const FORCE_SMALL_COUNTRIES = new Set([
    'KIR', 'TUV', 'NRU', 'PLW', 'MHL', 'FSM', // Pacifische eilandstaten
    'KNA', 'LCA', 'VCT', 'GRD', 'BRB', 'ATG', 'DMA', // Caribische eilandstaten
    'MLT', 'MDV', 'SYC', 'COM', 'MUS', 'STP', 'CPV', // Andere eilandstaten
    'SGP', 'BHR', 'LIE', 'MCO', 'SMR', 'VAT', 'AND', // Stadstaten
    'XKX' // Kosovo (kleiner dan Nederland)
  ]);

  /**
   * Bereken de oppervlakte van een feature (geschat via bounding box)
   */
  function getFeatureArea(feature) {
    const geom = feature.geometry;
    if (!geom) return 0;

    // Check of dit een geforceerd klein land is
    const iso = getIsoFromProperties(feature.properties);
    if (iso && FORCE_SMALL_COUNTRIES.has(iso)) {
      return 0.01; // Zeer klein, altijd onder Nederland
    }

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    const processCoords = (coords) => {
      if (typeof coords[0] === 'number') {
        minLng = Math.min(minLng, coords[0]);
        maxLng = Math.max(maxLng, coords[0]);
        minLat = Math.min(minLat, coords[1]);
        maxLat = Math.max(maxLat, coords[1]);
      } else {
        coords.forEach(processCoords);
      }
    };

    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => ring.forEach(processCoords));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(processCoords)));
    }

    if (!isFinite(minLng)) return 0;

    // Geschatte oppervlakte (breedte * hoogte in graden)
    const width = maxLng - minLng;
    const height = maxLat - minLat;
    
    // Als de breedte > 180°, dan ligt het land over de dateline
    // In dat geval is de berekening niet betrouwbaar
    if (width > 180) {
      console.warn(`Land met breedte > 180° gedetecteerd, waarschijnlijk dateline issue`);
      return 0.01; // Behandel als klein land
    }
    
    return width * height;
  }

  /**
   * Bereken centroid van een feature
   */
  function getFeatureCentroid(feature) {
    const geom = feature.geometry;
    if (!geom) return null;

    let sumLng = 0, sumLat = 0, count = 0;

    const processCoords = (coords) => {
      if (typeof coords[0] === 'number') {
        sumLng += coords[0];
        sumLat += coords[1];
        count++;
      } else {
        coords.forEach(processCoords);
      }
    };

    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => ring.forEach(processCoords));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(processCoords)));
    }

    if (count === 0) return null;
    return [sumLng / count, sumLat / count];
  }

  /**
   * Normaliseer longitude voor dateline wrapping
   * Voor landen die over de dateline liggen (bijv. Kiribati, Fiji)
   */
  function normalizeLongitude(coords, centerLng) {
    return coords.map(coord => {
      let lng = coord[0];
      // Als de longitude meer dan 180° verschilt van het centrum, wrap het
      if (Math.abs(lng - centerLng) > 180) {
        lng = lng < 0 ? lng + 360 : lng - 360;
      }
      return [lng, coord[1]];
    });
  }

  /**
   * Handmatige uitzonderingen voor problematische landen
   * Coördinaten zijn [longitude, latitude] van het hoofdeiland
   */
  const MANUAL_CENTROIDS = {
    'KIR': [172.979, 1.451],  // Kiribati - Tarawa atol (Zuid-Tarawa)
    'FJI': [178.065, -17.713], // Fiji - Viti Levu (Suva)
    'TON': [-175.198, -21.178], // Tonga - Tongatapu (Nuku'alofa)
    'WSM': [-171.751, -13.759], // Samoa - Upolu (Apia)
    'TUV': [179.194, -8.520],   // Tuvalu - Funafuti
    'MHL': [171.185, 7.131],    // Marshall Islands - Majuro
    'FSM': [158.215, 6.917],    // Micronesia - Pohnpei
    'PLW': [134.479, 7.515],    // Palau - Koror
    'NRU': [166.931, -0.522],   // Nauru
    'KNA': [-62.717, 17.357],   // Saint Kitts and Nevis
    'LCA': [-60.978, 13.909],   // Saint Lucia
    'VCT': [-61.212, 13.252],   // Saint Vincent
    'GRD': [-61.679, 12.116],   // Grenada
    'BRB': [-59.543, 13.194],   // Barbados
    'ATG': [-61.846, 17.060],   // Antigua and Barbuda
    'DMA': [-61.387, 15.415],   // Dominica
    'MLT': [14.514, 35.899],    // Malta
    'MDV': [73.509, 4.175],     // Maldives - Male
    'SYC': [55.492, -4.679],    // Seychelles - Mahe
    'COM': [43.872, -11.875],   // Comoros - Grande Comore
    'MUS': [57.552, -20.348],   // Mauritius
    'STP': [6.613, 0.336],      // Sao Tome and Principe
    'CPV': [-23.605, 14.933],   // Cape Verde - Santiago
    'SGP': [103.820, 1.290],    // Singapore
    'BHR': [50.586, 26.066],    // Bahrain
    'LIE': [9.555, 47.166],     // Liechtenstein
    'MCO': [7.419, 43.738],     // Monaco
    'SMR': [12.457, 43.942],    // San Marino
    'VAT': [12.453, 41.902],    // Vatican City
    'AND': [1.601, 42.546],     // Andorra
    'XKX': [20.903, 42.662]     // Kosovo - Pristina (KOS → XKX mapping)
  };

  /**
   * Vind de grootste polygon in een MultiPolygon feature
   */
  function getLargestPolygonCentroid(feature) {
    const geom = feature.geometry;
    if (!geom) return null;

    // Check eerst of er een handmatige uitzondering is
    const iso = getIsoFromProperties(feature.properties);
    if (iso && MANUAL_CENTROIDS[iso]) {
      console.log(`Gebruik handmatige centroid voor ${iso}:`, MANUAL_CENTROIDS[iso]);
      return MANUAL_CENTROIDS[iso];
    }

    // Als het een enkele Polygon is, gebruik gewoon de centroid
    if (geom.type === 'Polygon') {
      return getFeatureCentroid(feature);
    }

    // Voor MultiPolygon: vind de grootste polygon
    if (geom.type === 'MultiPolygon') {
      let largestPoly = null;
      let largestArea = 0;
      let largestPolyCenter = 0;

      // Eerste pass: vind geschat centrum van alle polygons
      let allLngs = [];
      geom.coordinates.forEach(poly => {
        poly.forEach(ring => {
          ring.forEach(coord => {
            allLngs.push(coord[0]);
          });
        });
      });
      const estimatedCenter = allLngs.reduce((a, b) => a + b, 0) / allLngs.length;

      geom.coordinates.forEach(poly => {
        // Bereken oppervlakte van deze polygon via bounding box
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        poly.forEach(ring => {
          ring.forEach(coord => {
            let lng = coord[0];
            // Normaliseer voor dateline
            if (Math.abs(lng - estimatedCenter) > 180) {
              lng = lng < 0 ? lng + 360 : lng - 360;
            }
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, coord[1]);
            maxLat = Math.max(maxLat, coord[1]);
          });
        });

        const area = (maxLng - minLng) * (maxLat - minLat);
        if (area > largestArea) {
          largestArea = area;
          largestPoly = poly;
          largestPolyCenter = (minLng + maxLng) / 2;
        }
      });

      if (!largestPoly) return null;

      // Bereken centroid van de grootste polygon met dateline correctie
      let sumLng = 0, sumLat = 0, count = 0;
      largestPoly.forEach(ring => {
        ring.forEach(coord => {
          let lng = coord[0];
          // Normaliseer voor dateline
          if (Math.abs(lng - largestPolyCenter) > 180) {
            lng = lng < 0 ? lng + 360 : lng - 360;
          }
          sumLng += lng;
          sumLat += coord[1];
          count++;
        });
      });

      if (count === 0) return null;
      
      let finalLng = sumLng / count;
      // Zorg dat de longitude binnen -180 tot 180 blijft
      if (finalLng > 180) finalLng -= 360;
      if (finalLng < -180) finalLng += 360;
      
      return [finalLng, sumLat / count];
    }

    return null;
  }

  /**
   * Bereken oppervlakte van Nederland (referentie)
   */
  function calculateNetherlandsArea() {
    if (!geoJsonData) return null;
    
    const nlFeatureId = isoToFeatureId.get('NLD');
    if (nlFeatureId === undefined) return null;
    
    const nlFeature = geoJsonData.features[nlFeatureId];
    if (!nlFeature) return null;
    
    const area = getFeatureArea(nlFeature);
    console.log(`Nederland oppervlakte (referentie): ${area.toFixed(4)}°²`);
    return area;
  }

  /**
   * Identificeer alle kleine landen (kleiner dan Nederland)
   */
  function identifySmallCountries() {
    if (!geoJsonData) return;
    
    // Bereken Nederland's oppervlakte
    if (netherlandsArea === null) {
      netherlandsArea = calculateNetherlandsArea();
      if (netherlandsArea === null) {
        console.warn('Kon Nederland niet vinden, gebruik fallback threshold');
        netherlandsArea = 0.5;
      }
    }

    smallCountriesSet.clear();

    // Loop door alle features en check oppervlakte
    geoJsonData.features.forEach((feature, idx) => {
      const iso = getIsoFromProperties(feature.properties);
      if (!iso) return;

      const area = getFeatureArea(feature);
      if (area < netherlandsArea && area > 0) {
        smallCountriesSet.add(iso);
        
        // Zet feature state voor styling
        map.setFeatureState(
          { source: 'countries', id: idx },
          { isSmall: true }
        );
      }
    });

    console.log(`${smallCountriesSet.size} kleine landen geïdentificeerd (< Nederland)`);
  }

  /**
   * Voeg een opvallende cirkel toe voor een klein land
   */
  function addSmallCountryMarker(iso) {
    if (!map || !geoJsonData) {
      console.warn('addSmallCountryMarker: map of geoJsonData niet beschikbaar');
      return;
    }

    const featureId = isoToFeatureId.get(iso);
    if (featureId === undefined) {
      console.warn(`addSmallCountryMarker: geen feature ID voor ${iso}`);
      return;
    }

    const feature = geoJsonData.features[featureId];
    if (!feature) {
      console.warn(`addSmallCountryMarker: geen feature voor ${iso}`);
      return;
    }

    const area = getFeatureArea(feature);
    console.log(`${iso} oppervlakte: ${area.toFixed(6)}°²`);
    
    let largestCentroid = getLargestPolygonCentroid(feature);
    
    // Fallback: als centroid berekening faalt, gebruik gewone centroid
    if (!largestCentroid) {
      console.warn(`Kon largest centroid niet berekenen voor ${iso}, probeer gewone centroid`);
      largestCentroid = getFeatureCentroid(feature);
    }
    
    if (!largestCentroid) {
      console.error(`Kon geen centroid berekenen voor ${iso}, skip marker`);
      return;
    }

    console.log(`${iso} centroid: [${largestCentroid[0].toFixed(2)}, ${largestCentroid[1].toFixed(2)}]`);

    // Bereken Nederland's oppervlakte als referentie (eenmalig)
    if (netherlandsArea === null) {
      netherlandsArea = calculateNetherlandsArea();
      if (netherlandsArea === null) {
        console.warn('Kon Nederland niet vinden, gebruik fallback threshold');
        netherlandsArea = 0.5; // Fallback
      }
    }
    
    // Threshold: landen kleiner dan Nederland krijgen een pijl
    if (area < netherlandsArea) {
      // Vaste pijl grootte (onafhankelijk van zoom)
      const arrowLength = 70; // pixels - vaste grootte
      
      // Maak een container voor de pijl die altijd naar het centrum wijst
      const arrowEl = document.createElement('div');
      arrowEl.className = 'small-country-arrow';
      
      // SVG pijl die van links-boven naar rechts-onder wijst (naar centrum)
      arrowEl.innerHTML = `
        <svg width="${arrowLength}" height="${arrowLength}" viewBox="0 0 ${arrowLength} ${arrowLength}" style="overflow: visible;">
          <defs>
            <marker id="arrowhead-${iso}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#ff6600" />
            </marker>
          </defs>
          <line x1="5" y1="5" x2="${arrowLength - 5}" y2="${arrowLength - 5}" 
                stroke="#ff6600" 
                stroke-width="4" 
                marker-end="url(#arrowhead-${iso})"
                stroke-linecap="round" />
        </svg>
      `;
      arrowEl.style.cssText = `
        width: ${arrowLength}px;
        height: ${arrowLength}px;
        pointer-events: none;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
      `;

      // Positioneer pijl zo dat de punt naar het centrum wijst
      // De pijl eindigt bij het centrum, dus we plaatsen de bottom-right hoek op het centrum
      const arrowMarker = new maplibregl.Marker({
        element: arrowEl,
        anchor: 'bottom-right',
        offset: [0, 0]
      })
        .setLngLat(largestCentroid)
        .addTo(map);

      smallCountryMarkers.push(arrowMarker);
      
      console.log(`Pijl toegevoegd voor klein land: ${iso} (oppervlakte: ${area.toFixed(4)}°² < NL: ${netherlandsArea.toFixed(4)}°²)`);
    }
  }

  /**
   * Verwijder alle kleine land markers
   */
  function clearSmallCountryMarkers() {
    smallCountryMarkers.forEach(marker => marker.remove());
    smallCountryMarkers = [];
  }

  /**
   * Bereken bounding box voor lijst van ISO codes
   */
  function getBoundsForCountries(isoCodes) {
    if (!geoJsonData || !isoCodes || isoCodes.length === 0) return null;

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    const normalizedIsos = isoCodes.map(normalizeIso).filter(Boolean);

    geoJsonData.features.forEach(feature => {
      const iso = getIsoFromProperties(feature.properties);
      if (!iso || !normalizedIsos.includes(iso)) return;

      const geom = feature.geometry;
      if (!geom) return;

      const processCoords = (coords) => {
        if (typeof coords[0] === 'number') {
          // [lng, lat]
          minLng = Math.min(minLng, coords[0]);
          maxLng = Math.max(maxLng, coords[0]);
          minLat = Math.min(minLat, coords[1]);
          maxLat = Math.max(maxLat, coords[1]);
        } else {
          coords.forEach(processCoords);
        }
      };

      if (geom.type === 'Polygon') {
        geom.coordinates.forEach(ring => ring.forEach(processCoords));
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(processCoords)));
      }
    });

    if (!isFinite(minLng)) return null;

    return [[minLng, minLat], [maxLng, maxLat]];
  }

  /**
   * Initialiseer de kaart
   */
  async function initMap(containerId, geojsonUrl) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container #${containerId} niet gevonden`);
      return null;
    }

    // Laad GeoJSON
    try {
      const response = await fetch(geojsonUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      geoJsonData = await response.json();
      
      // Geen IDs toevoegen - MapLibre doet dit automatisch met generateId: true

      isoToFeatureId = buildIsoIndex(geoJsonData);
      console.log(`GeoJSON geladen: ${geoJsonData.features.length} landen, ${isoToFeatureId.size} met ISO code`);
      
      // Debug: check eerste feature
      if (geoJsonData.features.length > 0) {
        const firstFeature = geoJsonData.features[0];
        console.log('Eerste feature:', {
          id: firstFeature.id,
          type: firstFeature.type,
          geometry: firstFeature.geometry ? firstFeature.geometry.type : 'geen geometry',
          properties: Object.keys(firstFeature.properties || {})
        });
      }
    } catch (err) {
      console.error('Kon GeoJSON niet laden:', err);
      return null;
    }

    // Maak MapLibre instance
    map = new maplibregl.Map({
      container: containerId,
      style: {
        version: 8,
        sources: {
          'satellite': {
            type: 'raster',
            tiles: [
              // NASA Blue Marble via public tile servers
              'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'
            ],
            tileSize: 256,
            attribution: 'NASA Blue Marble'
          },
          'countries': {
            type: 'geojson',
            data: geoJsonData,
            generateId: true // Laat MapLibre automatisch IDs genereren
          }
        },
        layers: [
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            paint: {
              'raster-opacity': 1.0
            }
          },
          {
            id: 'countries-fill',
            type: 'fill',
            source: 'countries',
            paint: {
              'fill-color': [
                'case',
                ['boolean', ['feature-state', 'active'], false],
                '#ffffff', // Wit voor actief land
                'rgba(0, 0, 0, 0)' // Transparant voor rest
              ],
              'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'active'], false],
                0.85, // Hoge opacity voor wit land
                0
              ]
            }
          },
          {
            id: 'countries-fill-small-active',
            type: 'fill',
            source: 'countries',
            paint: {
              'fill-color': '#ff6600',
              'fill-opacity': [
                'case',
                ['all',
                  ['boolean', ['feature-state', 'active'], false],
                  ['boolean', ['feature-state', 'isSmall'], false]
                ],
                0.5, // Oranje fill voor actieve kleine landen
                0
              ]
            }
          },
          {
            id: 'countries-fill-outline',
            type: 'line',
            source: 'countries',
            paint: {
              'line-color': '#000000',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 2,
                3, 3,
                5, 4,
                10, 5
              ],
              'line-opacity': [
                'case',
                ['boolean', ['feature-state', 'active'], false],
                1.0, // Extra dikke zwarte rand rond wit land
                0
              ]
            }
          },
          {
            id: 'countries-borders',
            type: 'line',
            source: 'countries',
            paint: {
              'line-color': '#000000',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 1,
                3, 1.5,
                5, 2,
                10, 3
              ],
              'line-opacity': 0.9
            }
          },
          {
            id: 'countries-borders-small-active',
            type: 'line',
            source: 'countries',
            paint: {
              'line-color': '#ff6600',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 2,
                3, 3,
                5, 4,
                10, 5
              ],
              'line-opacity': [
                'case',
                ['all',
                  ['boolean', ['feature-state', 'active'], false],
                  ['boolean', ['feature-state', 'isSmall'], false]
                ],
                1.0, // Oranje rand voor actieve kleine landen
                0
              ]
            }
          }
        ]
      },
      center: [0, 20],
      zoom: 1.5,
      maxZoom: 12,
      minZoom: 1
    });

    // Wacht tot kaart geladen is
    await new Promise(resolve => {
      map.on('load', resolve);
    });

    // Debug: check of layers zijn toegevoegd
    const style = map.getStyle();
    console.log('Layers geladen:', style.layers.map(l => l.id));
    console.log('Sources geladen:', Object.keys(style.sources));
    
    // Check of countries source data heeft
    const countriesSource = map.getSource('countries');
    if (countriesSource) {
      console.log('Countries source type:', countriesSource.type);
    }

    // Disable rotation
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    // Identificeer kleine landen en style ze oranje
    identifySmallCountries();

    console.log('Satelliet kaart geïnitialiseerd');
    return map;
  }

  /**
   * Highlight een land (wit maken)
   */
  function highlightCountry(iso) {
    if (!map || !geoJsonData) {
      console.warn('highlightCountry: map of geoJsonData niet beschikbaar');
      return;
    }

    const normalizedIso = normalizeIso(iso);
    console.log(`highlightCountry aangeroepen: ${iso} → ${normalizedIso}`);
    
    // Verwijder oude markers
    clearSmallCountryMarkers();
    
    // Reset vorige highlight
    if (currentHighlightedIso) {
      const prevFeatureId = isoToFeatureId.get(currentHighlightedIso);
      if (prevFeatureId !== undefined) {
        map.setFeatureState(
          { source: 'countries', id: prevFeatureId },
          { active: false }
        );
        console.log(`Reset vorige highlight: ${currentHighlightedIso}`);
      }
    }

    // Set nieuwe highlight
    if (normalizedIso) {
      const featureId = isoToFeatureId.get(normalizedIso);
      if (featureId !== undefined) {
        map.setFeatureState(
          { source: 'countries', id: featureId },
          { active: true }
        );
        currentHighlightedIso = normalizedIso;
        console.log(`✓ Land WIT gemaakt: ${normalizedIso} (feature ID: ${featureId})`);
        
        // Voeg marker toe voor kleine landen
        addSmallCountryMarker(normalizedIso);
        
        // Debug: check feature state
        const state = map.getFeatureState({ source: 'countries', id: featureId });
        console.log('Feature state na update:', state);
      } else {
        console.warn(`✗ Land niet gevonden in ISO index: ${normalizedIso}`);
        console.log('Beschikbare ISO codes (eerste 10):', Array.from(isoToFeatureId.keys()).slice(0, 10));
        currentHighlightedIso = null;
      }
    } else {
      console.log('Geen ISO code opgegeven, reset highlight');
      currentHighlightedIso = null;
    }
  }

  /**
   * Zoom naar regio (lijst van landen)
   */
  function fitToRegion(isoCodes, options = {}) {
    if (!map) return;

    const bounds = getBoundsForCountries(isoCodes);
    if (!bounds) {
      console.warn('Geen bounds gevonden voor regio:', isoCodes);
      return;
    }

    const defaultOptions = {
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      maxZoom: 6,
      duration: 1000
    };

    map.fitBounds(bounds, { ...defaultOptions, ...options });
    console.log(`Zoom naar regio: ${isoCodes.length} landen`);
  }

  /**
   * Reset naar wereld-overzicht
   */
  function resetView() {
    if (!map) return;
    map.flyTo({
      center: [0, 20],
      zoom: 1.5,
      duration: 1000
    });
  }

  /**
   * Cleanup
   */
  function destroy() {
    clearSmallCountryMarkers();
    if (map) {
      map.remove();
      map = null;
    }
    geoJsonData = null;
    isoToFeatureId.clear();
    currentHighlightedIso = null;
  }

  // Exporteer API
  window.SatelliteMap = {
    init: initMap,
    highlightCountry,
    fitToRegion,
    resetView,
    destroy,
    getMap: () => map
  };

})();
