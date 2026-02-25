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
    if (width > 180) {
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
    
    return getFeatureArea(nlFeature);
  }

  /**
   * Identificeer alle kleine landen (kleiner dan Nederland)
   */
  function identifySmallCountries() {
    if (!geoJsonData) return;
    
    // Bereken Nederland's oppervlakte
    if (netherlandsArea === null) {
      netherlandsArea = calculateNetherlandsArea() || 0.5;
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
   * @param {string} containerId
   * @param {string} geojsonUrl
   * @param {object} [options]
   * @param {'orange'|'white'} [options.smallCountryColor='white'] - Kleur voor kleine landen bij highlight (snelle quiz gebruikt 'orange')
   */
  async function initMap(containerId, geojsonUrl, options = {}) {
    const smallColor = options.smallCountryColor === 'orange' ? '#ff6600' : '#ffffff';
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
          },
          'completed-countries': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
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
              'fill-color': smallColor,
              'fill-opacity': [
                'case',
                ['all',
                  ['boolean', ['feature-state', 'active'], false],
                  ['boolean', ['feature-state', 'isSmall'], false]
                ],
                smallColor === '#ff6600' ? 0.5 : 0.9,
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
              'line-color': smallColor,
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
                1.0,
                0
              ]
            }
          },
          {
            id: 'countries-fill-completed',
            type: 'fill',
            source: 'completed-countries',
            paint: {
              'fill-color': 'rgba(100, 100, 100, 0.85)',
              'fill-opacity': 1
            }
          },
          {
            id: 'countries-outline-completed',
            type: 'line',
            source: 'completed-countries',
            paint: {
              'line-color': 'rgba(80, 80, 80, 0.9)',
              'line-width': 2
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

    // Disable rotation
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    // Identificeer kleine landen en style ze oranje
    identifySmallCountries();

    return map;
  }

  /**
   * Highlight een land (wit maken)
   */
  function highlightCountry(iso) {
    if (!map || !geoJsonData) return;

    const normalizedIso = normalizeIso(iso);
    
    // Reset vorige highlight
    if (currentHighlightedIso) {
      const prevFeatureId = isoToFeatureId.get(currentHighlightedIso);
      if (prevFeatureId !== undefined) {
        map.setFeatureState(
          { source: 'countries', id: prevFeatureId },
          { active: false }
        );
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
        // Geen pijl meer; oranje fill (countries-fill-small-active) is genoeg voor kleine landen
      } else {
        currentHighlightedIso = null;
      }
    } else {
      currentHighlightedIso = null;
    }
  }

  /**
   * Zoom naar regio (lijst van landen)
   */
  function fitToRegion(isoCodes, options = {}) {
    if (!map) return;

    const bounds = getBoundsForCountries(isoCodes);
    if (!bounds) return;

    const defaultOptions = {
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      maxZoom: 6,
      duration: 1000
    };

    map.fitBounds(bounds, { ...defaultOptions, ...options });
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
   * Zoom in rond het huidige centrum (land blijft in het midden)
   */
  function zoomIn(amount = 0.5, duration = 300) {
    if (!map) return;
    const center = map.getCenter();
    const zoom = Math.min(map.getZoom() + amount, map.getMaxZoom());
    map.easeTo({
      center: [center.lng, center.lat],
      zoom,
      duration
    });
  }

  /**
   * Zoom uit rond het huidige centrum (land blijft in het midden)
   */
  function zoomOut(amount = 0.5, duration = 300) {
    if (!map) return;
    const center = map.getCenter();
    const zoom = Math.max(map.getZoom() - amount, map.getMinZoom());
    map.easeTo({
      center: [center.lng, center.lat],
      zoom,
      duration
    });
  }

  /**
   * Zet landen als "voltooid" (grijs op kaart, voor kwartet-quiz).
   * Gebruikt een aparte GeoJSON-bron zodat voltooide landen altijd zichtbaar grijs zijn.
   * @param {string[]} isoList - Lijst van ISO3 codes
   */
  function setCompletedCountries(isoList) {
    if (!map || !geoJsonData) return;
    const set = new Set(isoList && isoList.length ? isoList.map(iso => normalizeIso(iso)) : []);
    const features = [];
    geoJsonData.features.forEach((feature) => {
      const iso = getIsoFromProperties(feature.properties);
      const normalizedIso = iso ? normalizeIso(iso) : null;
      if (normalizedIso && set.has(normalizedIso)) {
        features.push({ type: 'Feature', properties: feature.properties, geometry: feature.geometry });
      }
    });
    try {
      const source = map.getSource('completed-countries');
      if (source) source.setData({ type: 'FeatureCollection', features });
    } catch (e) {
      console.warn('setCompletedCountries:', e);
    }
  }

  /**
   * Cleanup
   */
  function destroy() {
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
    setCompletedCountries,
    fitToRegion,
    resetView,
    zoomIn,
    zoomOut,
    destroy,
    getMap: () => map,
    getIsoFromProperties
  };

})();
