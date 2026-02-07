// Globale namespace voor gedeelde logica
window.App = (function () {
  const HISTORY_KEY = 'landjes_history_v1';

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Kon JSON niet laden: ${path}`);
    return res.json();
  }

  async function loadGroups() {
    return loadJSON('data/groups.json');
  }

  async function loadGroupsFromPages() {
    return loadJSON('../data/groups.json');
  }

  async function loadCountries() {
    return loadJSON('../data/countries.json');
  }

  async function loadCountriesFromRoot() {
    return loadJSON('data/countries.json');
  }

  const CONTINENT_TITLES = {
    'South America': 'Zuid-Amerika',
    'North America': 'Noord-Amerika',
    'Europe': 'Europa',
    'Oceania': 'Oceanië',
    'Africa': 'Afrika',
    'Asia': 'Azië'
  };

  const CONTINENT_IDS = ['South America', 'North America', 'Europe', 'Africa', 'Asia', 'Oceania'];

  async function loadGroupById(id) {
    if (id === 'world') {
      const countries = await loadCountries();
      return {
        id: 'world',
        title: 'Hele wereld',
        continent: 'World',
        countries: countries.map(c => c.iso)
      };
    }
    if (id && id.startsWith('continent_')) {
      const continent = id.replace('continent_', '');
      const countries = await loadCountries();
      const list = countries.filter(c => c.continent === continent).map(c => c.iso);
      return {
        id,
        title: CONTINENT_TITLES[continent] || continent,
        continent,
        countries: list
      };
    }
    const groups = await loadGroupsFromPages();
    const group = groups.find(g => g.id === id);
    if (!group) throw new Error(`Onbekend deel: ${id}`);
    return group;
  }

  async function getContinentAndWorldGroups() {
    const countries = await loadCountriesFromRoot();
    const result = [];
    CONTINENT_IDS.forEach(cont => {
      const list = countries.filter(c => c.continent === cont).map(c => c.iso);
      if (list.length) {
        result.push({
          id: 'continent_' + cont,
          title: CONTINENT_TITLES[cont] || cont,
          continent: cont,
          countries: list
        });
      }
    });
    result.push({
      id: 'world',
      title: 'Hele wereld',
      continent: 'World',
      countries: countries.map(c => c.iso)
    });
    return result;
  }

  async function loadCountriesMap() {
    const arr = await loadCountries();
    const map = {};
    arr.forEach(c => {
      map[c.iso] = c;
    });
    return map;
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  // ISO 3166-1 alpha-3 → alpha-2 voor vlagbestanden (country-flags repo gebruikt 2 letters, lowercase)
  const ISO3_TO_ISO2 = {
    ARG: 'ar', BOL: 'bo', BRA: 'br', CHL: 'cl', COL: 'co', ECU: 'ec', GUY: 'gy', PRY: 'py', PER: 'pe', SUR: 'sr', URY: 'uy', VEN: 've',
    ATG: 'ag', BHS: 'bs', BRB: 'bb', BLZ: 'bz', CAN: 'ca', CRI: 'cr', CUB: 'cu', DMA: 'dm', DOM: 'do', SLV: 'sv', GRD: 'gd', GTM: 'gt', HTI: 'ht', HND: 'hn', JAM: 'jm', MEX: 'mx', NIC: 'ni', PAN: 'pa', KNA: 'kn', LCA: 'lc', VCT: 'vc', TTO: 'tt', USA: 'us',
    ALB: 'al', AND: 'ad', BEL: 'be', BIH: 'ba', BGR: 'bg', CYP: 'cy', DNK: 'dk', DEU: 'de', EST: 'ee', FIN: 'fi', FRA: 'fr', GRC: 'gr', HUN: 'hu', IRL: 'ie', ISL: 'is', ITA: 'it', HRV: 'hr', LVA: 'lv', LIE: 'li', LTU: 'lt', LUX: 'lu', MLT: 'mt', MDA: 'md', MCO: 'mc', MNE: 'me', NLD: 'nl', MKD: 'mk', NOR: 'no', UKR: 'ua', AUT: 'at', POL: 'pl', PRT: 'pt', ROU: 'ro', RUS: 'ru', SMR: 'sm', SRB: 'rs', SVK: 'sk', SVN: 'si', ESP: 'es', CZE: 'cz', VAT: 'va', GBR: 'gb', BLR: 'by', CHE: 'ch', XKX: 'xk',
    AUS: 'au', FJI: 'fj', KIR: 'ki', MHL: 'mh', FSM: 'fm', NRU: 'nr', NZL: 'nz', PLW: 'pw', PNG: 'pg', SLB: 'sb', WSM: 'ws', TON: 'to', TUV: 'tv', VUT: 'vu',
    DZA: 'dz', EGY: 'eg', LBY: 'ly', TUN: 'tn', MAR: 'ma', SDN: 'sd', SSD: 'ss', ETH: 'et', ERI: 'er', DJI: 'dj', SOM: 'so', NGA: 'ng', GHA: 'gh', CIV: 'ci', SEN: 'sn', GMB: 'gm', GIN: 'gn', GNB: 'gw', SLE: 'sl', LBR: 'lr', BEN: 'bj', TGO: 'tg', CMR: 'cm', CAF: 'cf', TCD: 'td', COG: 'cg', COD: 'cd', GNQ: 'gq', GAB: 'ga', STP: 'st', AGO: 'ao', NAM: 'na', ZMB: 'zm', ZWE: 'zw', MOZ: 'mz', MWI: 'mw', TZA: 'tz', KEN: 'ke', UGA: 'ug', RWA: 'rw', BDI: 'bi', ZAF: 'za', LSO: 'ls', SWZ: 'sz', BWA: 'bw', NER: 'ne', MLI: 'ml', BFA: 'bf', MRT: 'mr', CPV: 'cv', SYC: 'sc', COM: 'km', MUS: 'mu', MDG: 'mg',
    CHN: 'cn', JPN: 'jp', KOR: 'kr', PRK: 'kp', MNG: 'mn', TWN: 'tw', THA: 'th', VNM: 'vn', LAO: 'la', KHM: 'kh', IND: 'in', PAK: 'pk', BGD: 'bd', LKA: 'lk', NPL: 'np', BTN: 'bt', MMR: 'mm', MDV: 'mv', AFG: 'af', IRN: 'ir', KAZ: 'kz', UZB: 'uz', TKM: 'tm', TJK: 'tj', KGZ: 'kg', ARM: 'am', AZE: 'az', GEO: 'ge', TUR: 'tr', SAU: 'sa', ARE: 'ae', QAT: 'qa', KWT: 'kw', OMN: 'om', YEM: 'ye', IRQ: 'iq', SYR: 'sy', JOR: 'jo', ISR: 'il', IDN: 'id', MYS: 'my', SGP: 'sg', PHL: 'ph', BRN: 'bn', TLS: 'tl', BHR: 'bh', LBN: 'lb'
  };

  function getFlagFilename(iso3) {
    const code = ISO3_TO_ISO2[iso3] || iso3;
    return (typeof code === 'string' ? code : iso3).toLowerCase() + '.svg';
  }

  // Bouw 2-letter → 3-letter uit bestaande 3→2, zodat GeoJSON (vaak iso_a2) altijd matcht
  const ISO2_TO_ISO3 = { US: 'USA', GB: 'GBR', UK: 'GBR', RU: 'RUS', CN: 'CHN', KR: 'KOR', JP: 'JPN', IR: 'IRN', IN: 'IND', FR: 'FRA', DE: 'DEU', ES: 'ESP', IT: 'ITA', NL: 'NLD' };
  (function () {
    for (const [iso3, iso2] of Object.entries(ISO3_TO_ISO2)) {
      if (typeof iso2 === 'string') ISO2_TO_ISO3[iso2.toUpperCase()] = iso3;
    }
  })();
  function normalizeCountryIso(iso) {
    if (!iso || iso.length === 3) return iso;
    return ISO2_TO_ISO3[iso.toUpperCase()] || iso;
  }

  // Deck / statistieken per land binnen één sessie
  function createInitialCountryStats(isoList) {
    const stats = {};
    isoList.forEach(iso => {
      stats[iso] = {
        iso,
        seen_count: 0,
        correct_count: 0,
        incorrect_count: 0,
        is_mastered: false,
        events: []
      };
    });
    return stats;
  }

  function allMastered(countryStats) {
    return Object.values(countryStats).every(c => c.is_mastered);
  }

  function pickRandomCountry(countryStats) {
    const list = Object.values(countryStats);
    if (!list.length) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }

  /**
   * Kiest het volgende land zo dat eerst alle landen één keer aan bod komen
   * voordat er herhalingen zijn. askedThisRound is een Set van iso-codes
   * die deze ronde al gevraagd zijn; wordt door de caller bijgehouden.
   */
  function pickNextCountryNoRepeat(countryStats, askedThisRound) {
    const list = Object.values(countryStats);
    if (!list.length) return null;
    const notYetAsked = list.filter(c => !askedThisRound.has(c.iso));
    const pool = notYetAsked.length > 0 ? notYetAsked : list;
    if (pool.length === list.length && askedThisRound.size === list.length) {
      askedThisRound.clear();
    }
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) {
        return { version: 1, sessions: [], perGroup: {} };
      }
      const parsed = JSON.parse(raw);
      if (!parsed.version) parsed.version = 1;
      if (!parsed.sessions) parsed.sessions = [];
      if (!parsed.perGroup) parsed.perGroup = {};
      return parsed;
    } catch (e) {
      console.error('Kon history niet lezen, reset.', e);
      return { version: 1, sessions: [], perGroup: {} };
    }
  }

  function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function clearHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, sessions: [], perGroup: {} }));
  }

  function startSession({ groupId, quizType, subMode }) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: 1,
      groupId,
      quizType,
      subMode,
      startedAt: nowIso(),
      endedAt: null,
      questions: [],
      perCountryStats: {},
      totals: {
        questions: 0,
        correct: 0,
        incorrect: 0,
        accuracy: 0,
        totalResponseTimeMs: 0,
        avgResponseTimeMs: null,
        streakBest: 0,
        streakEnd: 0,
        correctByType: {
          capital: 0,
          flag: 0,
          map: 0
        }
      }
    };
  }

  function finalizeSession(session) {
    session.endedAt = nowIso();
    const t = session.totals;
    const q = Math.max(1, t.questions);
    t.accuracy = t.correct / q;
    t.avgResponseTimeMs = t.totalResponseTimeMs / q;

    const history = loadHistory();
    history.sessions.push(session);

    const g = history.perGroup[session.groupId] || {
      sessionsPlayed: 0,
      bestAccuracy: 0,
      totalCorrect: 0,
      totalIncorrect: 0
    };
    g.sessionsPlayed += 1;
    g.bestAccuracy = Math.max(g.bestAccuracy, t.accuracy);
    g.totalCorrect += t.correct;
    g.totalIncorrect += t.incorrect;
    history.perGroup[session.groupId] = g;

    saveHistory(history);
  }

  function recordQuestionResult({
    session,
    countryStats,
    iso,
    quizType,
    subType,
    wasCorrect,
    responseTimeMs
  }) {
    const now = nowIso();
    const stats = countryStats[iso];
    if (!stats) return;

    stats.seen_count += 1;
    if (wasCorrect) {
      stats.correct_count += 1;
      stats.is_mastered = stats.correct_count >= 1;
    } else {
      stats.incorrect_count += 1;
    }
    stats.events.push({
      timestamp: now,
      quizType,
      subType,
      result: wasCorrect ? 'correct' : 'incorrect',
      responseTimeMs
    });

    const t = session.totals;
    t.questions += 1;
    if (wasCorrect) {
      t.correct += 1;
      t.correctByType[quizType] = (t.correctByType[quizType] || 0) + 1;
      t.streakEnd += 1;
      if (t.streakEnd > t.streakBest) t.streakBest = t.streakEnd;
    } else {
      t.incorrect += 1;
      t.streakEnd = 0;
    }
    t.totalResponseTimeMs += responseTimeMs;

    session.perCountryStats[iso] = stats;
  }

  function downloadHistoryAsJSON(filename = 'landjes_history.json') {
    const history = loadHistory();
    const blob = new Blob([JSON.stringify(history, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Mercator projectie: x = longitude (rad), y = ln(tan(π/4 + φ/2))
  const MERCATOR_MAX_LAT = 85.051129; // clip om pool-oneindigheid te vermijden

  function mercatorProject(lon, lat) {
    const lonRad = (lon * Math.PI) / 180;
    const latClipped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
    const latRad = (latClipped * Math.PI) / 180;
    const x = lonRad;
    const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return { x, y };
  }

  async function loadWorldGeoJSON() {
    return loadJSON('../assets/maps/high_res_usa.json?v=2');
  }

  /**
   * Voortgang per week: elk quiztype (capital, flag, map) telt voor 33% van 5 sterren.
   * "Beheerst" = minstens 1× correct voor dat type (in type-sessies of in mix-events).
   * @param {string} groupId
   * @param {string[]} countryIds - ISO-codes van landen in deze groep
   * @param {{ sessions: Array }} history - uit loadHistory()
   * @returns {{ progressCapital: number, progressFlag: number, progressMap: number, stars: number }}
   */
  function getGroupProgress(groupId, countryIds, history) {
    const sessions = (history.sessions || []).filter(s => s.endedAt && s.groupId === groupId);
    const total = countryIds.length;
    if (total === 0) return { progressCapital: 0, progressFlag: 0, progressMap: 0, stars: 0 };

    const mastered = { capital: new Set(), flag: new Set(), map: new Set() };
    const types = ['capital', 'flag', 'map'];

    sessions.forEach(s => {
      const sessionType = s.quizType;
      if (types.includes(sessionType)) {
        Object.entries(s.perCountryStats || {}).forEach(([iso, stat]) => {
          if (!countryIds.includes(iso)) return;
          if ((stat.correct_count || 0) >= 1) mastered[sessionType].add(iso);
        });
      } else if (sessionType === 'mix') {
        Object.entries(s.perCountryStats || {}).forEach(([iso, stat]) => {
          if (!countryIds.includes(iso)) return;
          (stat.events || []).forEach(e => {
            const t = e.quizType;
            if (t && mastered[t] && e.result === 'correct') mastered[t].add(iso);
          });
        });
      }
    });

    const progressCapital = total ? (mastered.capital.size / total) * 100 : 0;
    const progressFlag = total ? (mastered.flag.size / total) * 100 : 0;
    const progressMap = total ? (mastered.map.size / total) * 100 : 0;
    const stars = Math.min(5, (progressCapital + progressFlag + progressMap) / 100 * (5 / 3));
    return { progressCapital, progressFlag, progressMap, stars };
  }

  function formatProgressStars(stars) {
    const n = Math.round(stars);
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  // Hover-preview (vlag + mini-kaart) voor overzichtspagina group.html
  function isValidIsoCode(v) {
    if (v == null || v === '' || v === '-99' || String(v) === '-99') return false;
    const s = String(v);
    return (s.length === 2 || s.length === 3) && /^[A-Za-z0-9]+$/.test(s);
  }

  function getIsoFromFeature(f) {
    const p = f.properties || {};
    if (p.iso_a3 === 'SYC' || p.iso_a3 === 'MUS') return p.iso_a3;
    const candidates = [
      p.iso_a3, p.ISO_A3, p.adm0_a3, p.ADM0_A3, p.sov_a3, p.brk_a3,
      p.ISO3, p.iso3, p.iso_a2, p.ISO_A2
    ];
    let raw = null;
    for (let i = 0; i < candidates.length; i++) {
      if (isValidIsoCode(candidates[i])) { raw = candidates[i]; break; }
    }
    if (!raw) return null;
    let iso = normalizeCountryIso(raw);
    if (iso === 'KOS') iso = 'XKX';
    return iso;
  }

  function computeScaleInfoSingleFeature(feature, contentWidth, contentHeight) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const geom = feature.geometry;
    if (!geom) return null;
    const processRing = (ring) => {
      ring.forEach(coord => {
        const [lon, lat] = coord;
        const proj = mercatorProject(lon, lat);
        if (proj.x < minX) minX = proj.x;
        if (proj.x > maxX) maxX = proj.x;
        if (proj.y < minY) minY = proj.y;
        if (proj.y > maxY) maxY = proj.y;
      });
    };
    if (geom.type === 'Polygon') geom.coordinates.forEach(ring => processRing(ring));
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(ring => processRing(ring)));
    const pad = 4;
    let dx = maxX - minX || 1, dy = maxY - minY || 1;
    const expand = 0.15;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    dx *= (1 + expand); dy *= (1 + expand);
    const minX2 = cx - dx / 2, maxX2 = cx + dx / 2, minY2 = cy - dy / 2, maxY2 = cy + dy / 2;
    const innerW = contentWidth - 2 * pad, innerH = contentHeight - 2 * pad;
    const scaleX = innerW / dx, scaleY = innerH / dy;
    return { minX: minX2, maxY: maxY2, scaleX, scaleY, pad, contentWidth, contentHeight };
  }

  function computeScaleInfoForFeatures(features, contentWidth, contentHeight) {
    if (!features.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const processRing = (ring) => {
      ring.forEach(coord => {
        const [lon, lat] = coord;
        const proj = mercatorProject(lon, lat);
        if (proj.x < minX) minX = proj.x;
        if (proj.x > maxX) maxX = proj.x;
        if (proj.y < minY) minY = proj.y;
        if (proj.y > maxY) maxY = proj.y;
      });
    };
    features.forEach(f => {
      const geom = f.geometry;
      if (!geom) return;
      if (geom.type === 'Polygon') geom.coordinates.forEach(ring => processRing(ring));
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(ring => processRing(ring)));
    });
    const pad = 4;
    let dx = maxX - minX || 1, dy = maxY - minY || 1;
    const expand = 0.08;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    dx *= (1 + expand); dy *= (1 + expand);
    const minX2 = cx - dx / 2, maxX2 = cx + dx / 2, minY2 = cy - dy / 2, maxY2 = cy + dy / 2;
    const innerW = contentWidth - 2 * pad, innerH = contentHeight - 2 * pad;
    const scaleX = innerW / dx, scaleY = innerH / dy;
    return { minX: minX2, maxY: maxY2, scaleX, scaleY, pad, contentWidth, contentHeight };
  }

  function buildPathFromCoordsForPreview(coordsList, scaleInfo) {
    const { minX, maxY, scaleX, scaleY, pad, contentWidth } = scaleInfo;
    const wrapThreshold = contentWidth * 0.5;
    let d = '';
    coordsList.forEach((ring) => {
      let prevX = null;
      ring.forEach((coord, i) => {
        const [lon, lat] = coord;
        const proj = mercatorProject(lon, lat);
        const x = pad + (proj.x - minX) * scaleX;
        const y = pad + (maxY - proj.y) * scaleY;
        const useMove = i === 0 || (prevX !== null && Math.abs(x - prevX) > wrapThreshold);
        d += (useMove ? 'M' : 'L') + x + ' ' + y + ' ';
        prevX = x;
      });
      d += 'Z ';
    });
    return d.trim();
  }

  function buildCountryPreviewHtml(iso, worldGeoJson, groupCountries) {
    const features = worldGeoJson.features || [];
    const groupSet = groupCountries && groupCountries.length ? new Set(groupCountries) : null;
    const groupFeatures = groupSet ? features.filter(f => groupSet.has(getIsoFromFeature(f))) : [];
    const highlightFeature = features.find(f => getIsoFromFeature(f) === iso);
    if (!highlightFeature || !highlightFeature.geometry) return '';

    const flagFilename = getFlagFilename(iso);
    const mapW = 140;
    const mapH = 90;

    let scaleInfo;
    let paths = [];

    if (groupFeatures.length > 0) {
      scaleInfo = computeScaleInfoForFeatures(groupFeatures, mapW, mapH);
      if (!scaleInfo) return '';
      groupFeatures.forEach(f => {
        const fIso = getIsoFromFeature(f);
        const geom = f.geometry;
        if (!geom) return;
        let coordsList = [];
        if (geom.type === 'Polygon') coordsList = geom.coordinates;
        else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => coordsList.push(...poly));
        const d = buildPathFromCoordsForPreview(coordsList, scaleInfo);
        const fill = fIso === iso ? '#f8fafc' : '#16a34a';
        const stroke = fIso === iso ? '#0f172a' : '#14532d';
        paths.push('<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.4"/>');
      });
    } else {
      scaleInfo = computeScaleInfoSingleFeature(highlightFeature, mapW, mapH);
      if (!scaleInfo) return '';
      const geom = highlightFeature.geometry;
      let coordsList = [];
      if (geom.type === 'Polygon') coordsList = geom.coordinates;
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => coordsList.push(...poly));
      const d = buildPathFromCoordsForPreview(coordsList, scaleInfo);
      paths.push('<path d="' + d + '" fill="#f8fafc" stroke="#0f172a" stroke-width="0.4"/>');
    }

    return '<div class="country-hover-preview-inner">' +
      '<div class="country-hover-preview-flag-wrap">' +
      '<img src="../assets/flags/' + flagFilename + '" alt="" class="country-hover-flag">' +
      '</div>' +
      '<div class="country-hover-preview-map-wrap">' +
      '<svg class="country-hover-map" viewBox="0 0 ' + mapW + ' ' + mapH + '" preserveAspectRatio="xMidYMid meet">' +
      '<rect width="' + mapW + '" height="' + mapH + '" fill="#2563eb"/>' +
      paths.join('') +
      '</svg></div></div>';
  }

  /** Wereldkaart met één land wit en pijl+ellips (zoals map-quiz). Geen vlag. */
  function getFeatureCentroid(feature) {
    const geom = feature.geometry;
    if (!geom) return null;
    let sumLon = 0, sumLat = 0, count = 0;
    const addCoords = (coords) => {
      coords.forEach(c => {
        if (typeof c[0] === 'number') { sumLon += c[0]; sumLat += c[1]; count++; }
        else addCoords(c);
      });
    };
    if (geom.type === 'Polygon') geom.coordinates.forEach(ring => addCoords(ring));
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(ring => addCoords(ring)));
    return count ? [sumLon / count, sumLat / count] : null;
  }

  function centroidToSvg(lon, lat, scaleInfo) {
    const proj = mercatorProject(lon, lat);
    const x = scaleInfo.pad + (proj.x - scaleInfo.minX) * scaleInfo.scaleX;
    const y = scaleInfo.pad + (scaleInfo.maxY - proj.y) * scaleInfo.scaleY;
    return { x, y };
  }

  function getFeaturePointsSvg(feature, scaleInfo, sample) {
    sample = sample || 5;
    const geom = feature.geometry;
    if (!geom) return [];
    const pts = [];
    let idx = 0;
    const addPoint = (lon, lat) => {
      if (idx++ % sample !== 0) return;
      const pt = centroidToSvg(lon, lat, scaleInfo);
      if (pt) pts.push(pt);
    };
    const walk = (coords) => {
      coords.forEach(c => {
        if (typeof c[0] === 'number') addPoint(c[0], c[1]);
        else walk(c);
      });
    };
    if (geom.type === 'Polygon') geom.coordinates.forEach(ring => walk(ring));
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(ring => walk(ring)));
    return pts;
  }

  function minimumEnclosingEllipse(pts) {
    if (pts.length === 0) return null;
    if (pts.length === 1) return { cx: pts[0].x, cy: pts[0].y, rx: 8, ry: 8 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(p => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rx: (maxX - minX) / 2 || 8, ry: (maxY - minY) / 2 || 8 };
  }

  function getEllipseSizeForFeature(feature, scaleInfo) {
    const pts = getFeaturePointsSvg(feature, scaleInfo);
    const me = minimumEnclosingEllipse(pts);
    return me ? me.rx * me.ry : Infinity;
  }

  function buildArrowAndEllipseSvg(feature, scaleInfo, allFeatures, iso) {
    const centroid = getFeatureCentroid(feature);
    if (!centroid) return '';
    const tip = centroidToSvg(centroid[0], centroid[1], scaleInfo);
    const arrowColor = '#f97316';
    const arrowLen = 55;
    const angle = Math.PI / 4;
    const tail = { x: tip.x - arrowLen * Math.cos(angle), y: tip.y - arrowLen * Math.sin(angle) };

    const pts = getFeaturePointsSvg(feature, scaleInfo);
    const me = minimumEnclosingEllipse(pts);
    const nlFeature = allFeatures.find(f => getIsoFromFeature(f) === 'NLD');
    const nlSize = nlFeature ? getEllipseSizeForFeature(nlFeature, scaleInfo) : 0;
    const targetSize = me ? me.rx * me.ry : Infinity;
    const isSmallerThanNL = targetSize < nlSize;

    let s = '';
    if (me && (me.rx > 0 || me.ry > 0) && isSmallerThanNL) {
      s += '<ellipse cx="' + me.cx + '" cy="' + me.cy + '" rx="' + me.rx + '" ry="' + me.ry + '" fill="none" stroke="' + arrowColor + '" stroke-width="2"/>';
    }
    s += '<line x1="' + tail.x + '" y1="' + tail.y + '" x2="' + tip.x + '" y2="' + tip.y + '" stroke="' + arrowColor + '" stroke-width="3" stroke-linecap="round"/>';
    const headLen = 14, headAngle = 0.65;
    const h1x = tip.x - headLen * Math.cos(angle - headAngle), h1y = tip.y - headLen * Math.sin(angle - headAngle);
    const h2x = tip.x - headLen * Math.cos(angle + headAngle), h2y = tip.y - headLen * Math.sin(angle + headAngle);
    s += '<path d="M ' + tip.x + ' ' + tip.y + ' L ' + h1x + ' ' + h1y + ' L ' + h2x + ' ' + h2y + ' Z" fill="' + arrowColor + '" stroke="' + arrowColor + '"/>';
    return s;
  }

  /** Wereldkaart zonder highlight: alle landen groen, voor standaard/lege weergave. */
  function buildWorldMapEmpty(worldGeoJson) {
    try {
      const features = worldGeoJson.features || [];
      const mapW = 900;
      const mapH = 500;
      const scaleInfo = computeScaleInfoForFeatures(features, mapW, mapH);
      if (!scaleInfo) return '';

      const paths = [];
      features.forEach(f => {
        const geom = f.geometry;
        if (!geom) return;
        let coordsList = [];
        if (geom.type === 'Polygon') coordsList = geom.coordinates;
        else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => coordsList.push(...poly));
        const d = buildPathFromCoordsForPreview(coordsList, scaleInfo);
        paths.push('<path d="' + d + '" fill="#16a34a" stroke="#14532d" stroke-width="0.4"/>');
      });

      return '<svg class="country-preview-map-svg country-preview-world-map" viewBox="0 0 ' + mapW + ' ' + mapH + '" preserveAspectRatio="xMidYMid meet">' +
        '<rect width="' + mapW + '" height="' + mapH + '" fill="#2563eb"/>' +
        paths.join('') + '</svg>';
    } catch (e) {
      console.error('buildWorldMapEmpty', e);
      return '';
    }
  }

  /** Wereldkaart: hele wereld, één land wit, pijl + ellips eromheen. Geen vlag. */
  function buildWorldMapPreview(iso, worldGeoJson) {
    try {
      const features = worldGeoJson.features || [];
      const highlightFeature = features.find(f => getIsoFromFeature(f) === iso);
      if (!highlightFeature || !highlightFeature.geometry) return '';

    const mapW = 900;
    const mapH = 500;
    const scaleInfo = computeScaleInfoForFeatures(features, mapW, mapH);
    if (!scaleInfo) return '';

    const paths = [];
    features.forEach(f => {
      const geom = f.geometry;
      if (!geom) return;
      let coordsList = [];
      if (geom.type === 'Polygon') coordsList = geom.coordinates;
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => coordsList.push(...poly));
      const d = buildPathFromCoordsForPreview(coordsList, scaleInfo);
      const fIso = getIsoFromFeature(f);
      const fill = fIso === iso ? '#f8fafc' : '#16a34a';
      const stroke = fIso === iso ? '#0f172a' : '#14532d';
      paths.push('<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.4"/>');
    });

      const arrowSvg = buildArrowAndEllipseSvg(highlightFeature, scaleInfo, features, iso);
      return '<svg class="country-preview-map-svg country-preview-world-map" viewBox="0 0 ' + mapW + ' ' + mapH + '" preserveAspectRatio="xMidYMid meet">' +
        '<rect width="' + mapW + '" height="' + mapH + '" fill="#2563eb"/>' +
        paths.join('') +
        '<g class="map-arrow">' + arrowSvg + '</g></svg>';
    } catch (e) {
      console.error('buildWorldMapPreview', iso, e);
      return '<p class="country-preview-placeholder">Preview niet beschikbaar voor dit land.</p>';
    }
  }

  return {
    loadJSON,
    loadGroups,
    loadGroupsFromPages,
    loadCountries,
    loadCountriesFromRoot,
    loadGroupById,
    getContinentAndWorldGroups,
    loadCountriesMap,
    getQueryParam,
    getFlagFilename,
    normalizeCountryIso,
    createInitialCountryStats,
    allMastered,
    pickRandomCountry,
    pickNextCountryNoRepeat,
    startSession,
    finalizeSession,
    recordQuestionResult,
    downloadHistoryAsJSON,
    mercatorProject,
    loadWorldGeoJSON,
    loadHistory,
    saveHistory,
    clearHistory,
    getGroupProgress,
    formatProgressStars,
    buildCountryPreviewHtml,
    buildWorldMapPreview,
    buildWorldMapEmpty
  };
})();

// Dark mode: direct toepassen zodat er geen flits is
(function () {
  const THEME_KEY = 'landjes_theme';
  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || 'light';
    } catch (_) {
      return 'light';
    }
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }
  applyTheme(getStoredTheme());

  function initDarkModeSwitch() {
    const cb = document.getElementById('dark-mode-cb');
    if (!cb) return;
    cb.checked = getStoredTheme() === 'dark';
    cb.addEventListener('change', function () {
      const theme = this.checked ? 'dark' : 'light';
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (_) {}
      applyTheme(theme);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDarkModeSwitch);
  } else {
    initDarkModeSwitch();
  }
})();

// Clear stats-knop (waar aanwezig)
(function () {
  function initClearStats() {
    const btn = document.getElementById('clear-stats-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!confirm('Alle sessies en statistieken wissen? Dit kan niet ongedaan worden.')) return;
      if (window.App && window.App.clearHistory) window.App.clearHistory();
      location.reload();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClearStats);
  } else {
    initClearStats();
  }
})();

