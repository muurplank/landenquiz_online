document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');

  const mapContainerEl = document.getElementById('map-container');
  const countryButtonsEl = document.getElementById('country-buttons');
  const deckStatusEl = document.getElementById('deck-status');
  const continentLabelEl = document.getElementById('continent-label');
  const titleEl = document.getElementById('quiz-title');
  const subtitleEl = document.getElementById('quiz-subtitle');
  const sessionStatusEl = document.getElementById('session-status');

  const statQuestionsEl = document.getElementById('stat-questions');
  const statAccuracyEl = document.getElementById('stat-accuracy');
  const statAvgTimeEl = document.getElementById('stat-avg-time');
  const statStreakEl = document.getElementById('stat-streak');

  const btnDownloadLog = document.getElementById('btn-download-log');
  const mapQuizTypeWrap = document.getElementById('map-quiz-type-wrap');
  const mapQuizTypeInput = document.getElementById('map-quiz-type-input');
  const mapQuizTypeSubmit = document.getElementById('map-quiz-type-submit');

  if (!groupId) {
    sessionStatusEl.textContent = 'Geen deel geselecteerd.';
    sessionStatusEl.className = 'status-label bad';
    return;
  }

  let group;
  let countriesMap;
  let countryStats;
  let session;
  let currentCountry = null;
  let questionStartTime = null;
  let svgEl = null;
  let pathsByIso = {};
  let sessionEnded = false;
  const askedThisRound = new Set(); // eerst alle landen één keer, daarna ronde opnieuw
  let scaleInfo = null;
  let allContinentFeatures = [];
  let useLonWrap = false;
  let centerOnGreenwich = false;
  let worldGeo = null;
  let useTypeBox = false;

  function toDisplayLon(lon) {
    return centerOnGreenwich && lon > 180 ? lon - 360 : lon;
  }

  function getLonExtent(features) {
    let minLon = Infinity, maxLon = -Infinity;
    const walk = (coords) => {
      coords.forEach(c => {
        if (typeof c[0] === 'number') {
          const d = toDisplayLon(c[0]);
          if (d < minLon) minLon = d;
          if (d > maxLon) maxLon = d;
        } else walk(c);
      });
    };
    features.forEach(f => {
      const geom = f.geometry;
      if (!geom) return;
      if (geom.type === 'Polygon') geom.coordinates.forEach(ring => walk(ring));
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(ring => walk(ring)));
    });
    return { minLon, maxLon };
  }

  const LON_WRAP_THRESHOLD = -100;
  function wrapLon(lon) {
    return useLonWrap && lon < LON_WRAP_THRESHOLD ? lon + 360 : lon;
  }

  function projectPoint(lon, lat) {
    return window.App.mercatorProject(wrapLon(toDisplayLon(lon)), lat);
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const d = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return d[m][n];
  }

  function isTypedAnswerCorrect(typed, correctNameNl) {
    const t = (typed || '').trim().toLowerCase();
    const c = (correctNameNl || '').toLowerCase();
    if (!t) return false;
    if (t === c) return true;
    return levenshtein(t, c) <= 4;
  }

  function updateDeckStatus() {
    const all = Object.values(countryStats);
    const mastered = all.filter(c => c.is_mastered).length;
    deckStatusEl.textContent = `Deck: ${mastered}/${all.length} mastered`;
  }

  function updateSessionStatsUI() {
    const t = session.totals;
    statQuestionsEl.textContent = t.questions;
    const acc = t.questions ? Math.round((t.correct / t.questions) * 100) : 0;
    statAccuracyEl.textContent = `${acc}%`;
    statAvgTimeEl.textContent = t.avgResponseTimeMs
      ? `${Math.round(t.avgResponseTimeMs)} ms`
      : '-';
    statStreakEl.textContent = `${t.streakEnd} (beste ${t.streakBest})`;
  }

  function maybeEndSessionIfMastered() {
    if (window.App.allMastered(countryStats)) {
      sessionEnded = true;
      window.App.finalizeSession(session);
      sessionStatusEl.textContent = 'Sessie voltooid: alle landen minstens 1x correct!';
      sessionStatusEl.className = 'status-label ok';
    }
  }

  function getFeatureCentroid(feature) {
    const geom = feature.geometry;
    if (!geom) return null;
    let sumLon = 0, sumLat = 0, count = 0;
    const addCoords = (coords) => {
      coords.forEach(c => {
        if (typeof c[0] === 'number') {
          sumLon += c[0];
          sumLat += c[1];
          count++;
        } else {
          addCoords(c);
        }
      });
    };
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => addCoords(ring));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => poly.forEach(ring => addCoords(ring)));
    }
    return count ? [sumLon / count, sumLat / count] : null;
  }

  function centroidToSvg(lon, lat) {
    if (!scaleInfo) return null;
    const proj = projectPoint(lon, lat);
    const x = scaleInfo.pad + (proj.x - scaleInfo.minX) * scaleInfo.scaleX;
    const y = scaleInfo.pad + (scaleInfo.maxY - proj.y) * scaleInfo.scaleY;
    return { x, y };
  }

  function getFeaturePointsSvg(feature, sample = 5) {
    if (!scaleInfo) return [];
    const geom = feature.geometry;
    if (!geom) return [];
    const pts = [];
    let idx = 0;
    const addPoint = (lon, lat) => {
      if (idx++ % sample !== 0) return;
      const pt = centroidToSvg(lon, lat);
      if (pt) pts.push(pt);
    };
    const walkCoords = (coords) => {
      coords.forEach(c => {
        if (typeof c[0] === 'number') addPoint(c[0], c[1]);
        else walkCoords(c);
      });
    };
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => walkCoords(ring));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => poly.forEach(ring => walkCoords(ring)));
    }
    return pts;
  }

  function minimumEnclosingEllipse(pts) {
    if (pts.length === 0) return null;
    if (pts.length === 1) return { cx: pts[0].x, cy: pts[0].y, rx: 8, ry: 8 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const rx = (maxX - minX) / 2 || 8;
    const ry = (maxY - minY) / 2 || 8;
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rx, ry };
  }

  function getEllipseSizeForFeature(f) {
    const pts = getFeaturePointsSvg(f);
    const me = minimumEnclosingEllipse(pts);
    return me ? me.rx * me.ry : Infinity;
  }

  function getNetherlandsSize() {
    const nl = allContinentFeatures.find(f => {
      const raw = f.properties && (f.properties.iso_a3 || f.properties.sov_a3 || f.properties.adm0_a3);
      return (raw && window.App.normalizeCountryIso(raw)) === 'NLD';
    });
    return nl ? getEllipseSizeForFeature(nl) : 0;
  }

  function updateArrow(iso) {
    const arrowGroup = svgEl && svgEl.querySelector('.map-arrow');
    if (arrowGroup) arrowGroup.remove();

    if (!iso || !scaleInfo || !svgEl) return;
    const feature = allContinentFeatures.find(f => {
      const p = f.properties || {};
      const raw = p.iso_a3 || p.ISO_A3 || p.ADM0_A3 || p.ISO3 || p.iso3 || p.sov_a3 || p.adm0_a3 || p.iso_a2;
      const fi = raw ? window.App.normalizeCountryIso(raw) : raw;
      return fi === iso;
    });
    if (!feature) return;

    const centroid = getFeatureCentroid(feature);
    if (!centroid) return;

    const tip = centroidToSvg(centroid[0], centroid[1]);
    if (!tip) return;

    const arrowColor = '#f97316';
    const arrowLen = 55;
    const angle = Math.PI / 4; // 45°
    const tail = {
      x: tip.x - arrowLen * Math.cos(angle),
      y: tip.y - arrowLen * Math.sin(angle)
    };

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'map-arrow');

    const pts = getFeaturePointsSvg(feature);
    const me = minimumEnclosingEllipse(pts);
    const nlSize = getNetherlandsSize();
    const targetSize = me ? me.rx * me.ry : Infinity;
    const isSmallerThanNL = targetSize < nlSize;
    if (me && (me.rx > 0 || me.ry > 0) && isSmallerThanNL) {
      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('cx', me.cx);
      ellipse.setAttribute('cy', me.cy);
      ellipse.setAttribute('rx', me.rx);
      ellipse.setAttribute('ry', me.ry);
      ellipse.setAttribute('fill', 'none');
      ellipse.setAttribute('stroke', arrowColor);
      ellipse.setAttribute('stroke-width', '2');
      g.appendChild(ellipse);
    }

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', tail.x);
    line.setAttribute('y1', tail.y);
    line.setAttribute('x2', tip.x);
    line.setAttribute('y2', tip.y);
    line.setAttribute('stroke', arrowColor);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-linecap', 'round');

    const headLen = 14;
    const headAngle = 0.65;
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const h1x = tip.x - headLen * Math.cos(angle - headAngle);
    const h1y = tip.y - headLen * Math.sin(angle - headAngle);
    const h2x = tip.x - headLen * Math.cos(angle + headAngle);
    const h2y = tip.y - headLen * Math.sin(angle + headAngle);
    p1.setAttribute('d', `M ${tip.x} ${tip.y} L ${h1x} ${h1y} L ${h2x} ${h2y} Z`);
    p1.setAttribute('fill', arrowColor);
    p1.setAttribute('stroke', arrowColor);

    g.appendChild(line);
    g.appendChild(p1);
    svgEl.appendChild(g);
  }

  function setTargetOnMap(iso) {
    Object.keys(pathsByIso).forEach(k => {
      const path = pathsByIso[k];
      if (!path) return;
      if (k === iso) {
        path.classList.add('target');
        path.setAttribute('fill', '#fff');
        path.setAttribute('stroke', '#000');
        path.setAttribute('stroke-width', '0.5');
      } else {
        path.classList.remove('target');
        path.setAttribute('fill', '#16a34a');
        path.setAttribute('stroke', '#000');
        path.setAttribute('stroke-width', '0.5');
      }
    });
    updateArrow(iso);
  }

  function showNextQuestion() {
    if (sessionEnded) return;
    if (window.App.allMastered(countryStats)) {
      maybeEndSessionIfMastered();
      return;
    }
    currentCountry = window.App.pickNextCountryNoRepeat(countryStats, askedThisRound);
    askedThisRound.add(currentCountry.iso);
    questionStartTime = performance.now();
    const isContinentOrWorld = groupId === 'world' || groupId.startsWith('continent_');
    if (isContinentOrWorld && worldGeo && currentCountry && mapContainerEl) {
      const html = window.App.buildWorldMapPreview(currentCountry.iso, worldGeo);
      mapContainerEl.innerHTML = html || '';
    } else {
      setTargetOnMap(currentCountry.iso);
    }
    sessionStatusEl.textContent = useTypeBox ? 'Typ de landnaam hieronder.' : 'Klik op de landnaam rechts.';
    sessionStatusEl.className = 'status-label';
    updateDeckStatus();
    if (useTypeBox && mapQuizTypeInput) {
      mapQuizTypeInput.value = '';
      mapQuizTypeInput.focus();
    }
  }

  function handleTypedAnswer() {
    if (!currentCountry || sessionEnded || !mapQuizTypeInput) return;
    const typed = mapQuizTypeInput.value;
    const correctName = countriesMap[currentCountry.iso] && countriesMap[currentCountry.iso].name_nl;
    const isCorrect = isTypedAnswerCorrect(typed, correctName);
    const dt = performance.now() - questionStartTime;

    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: 'map',
      subType: 'continent-only',
      wasCorrect: isCorrect,
      responseTimeMs: dt
    });

    updateSessionStatsUI();

    if (isCorrect) {
      sessionStatusEl.textContent = 'Correct!';
      sessionStatusEl.className = 'status-label ok';
    } else {
      sessionStatusEl.textContent = `Incorrect. Het witte land is: ${correctName}.`;
      sessionStatusEl.className = 'status-label bad';
    }

    maybeEndSessionIfMastered();
    if (!sessionEnded) {
      setTimeout(() => {
        showNextQuestion();
      }, 900);
    }
  }

  function handleGuess(isoGuess) {
    if (!currentCountry || sessionEnded) return;
    const dt = performance.now() - questionStartTime;
    const isCorrect = isoGuess === currentCountry.iso;

    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: 'map',
      subType: 'continent-only',
      wasCorrect: isCorrect,
      responseTimeMs: dt
    });

    updateSessionStatsUI();

    const clickedBtn = countryButtonsEl.querySelector(`button[data-iso="${isoGuess}"]`);
    if (clickedBtn) {
      clickedBtn.classList.remove('correct', 'incorrect');
      clickedBtn.classList.add(isCorrect ? 'correct' : 'incorrect');
    }

    if (isCorrect) {
      sessionStatusEl.textContent = 'Correct!';
      sessionStatusEl.className = 'status-label ok';
    } else {
      const c = countriesMap[currentCountry.iso];
      sessionStatusEl.textContent = `Incorrect. Het witte land is: ${c.name_nl}.`;
      sessionStatusEl.className = 'status-label bad';
    }

    maybeEndSessionIfMastered();
    if (!sessionEnded) {
      setTimeout(() => {
        // reset button styles
        countryButtonsEl.querySelectorAll('button').forEach(btn => {
          btn.classList.remove('correct', 'incorrect');
        });
        showNextQuestion();
      }, 900);
    }
  }

  function computeScaleInfo(features) {
    const ext = getLonExtent(features);
    useLonWrap = !centerOnGreenwich && (ext.maxLon - ext.minLon) > 180;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    features.forEach(f => {
      const geom = f.geometry;
      if (!geom) return;
      const type = geom.type;

      const processRing = ring => {
        ring.forEach(coord => {
          const [lon, lat] = coord;
          const proj = projectPoint(lon, lat);
          if (proj.x < minX) minX = proj.x;
          if (proj.x > maxX) maxX = proj.x;
          if (proj.y < minY) minY = proj.y;
          if (proj.y > maxY) maxY = proj.y;
        });
      };

      if (type === 'Polygon') {
        geom.coordinates.forEach(ring => processRing(ring));
      } else if (type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => {
          poly.forEach(ring => processRing(ring));
        });
      }
    });

    if (centerOnGreenwich) {
      const xAt180 = projectPoint(180, 0).x;
      const xAtMinus180 = projectPoint(-180, 0).x;
      minX = xAtMinus180;
      maxX = xAt180;
    }

    const pad = 20;
    const contentWidth = 800;
    const contentHeight = 450;
    let dx = maxX - minX || 1;
    let dy = maxY - minY || 1;
    const expand = centerOnGreenwich ? 0 : 0.08;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    dx *= (1 + expand);
    dy *= (1 + expand);
    minX = cx - dx / 2;
    maxX = cx + dx / 2;
    minY = cy - dy / 2;
    maxY = cy + dy / 2;
    const innerW = contentWidth - 2 * pad;
    const innerH = contentHeight - 2 * pad;
    const scaleX = innerW / dx;
    const scaleY = innerH / dy;

    return { minX, maxY, scaleX, scaleY, pad, contentWidth, contentHeight };
  }

  function buildPathFromCoords(coordsList, scaleInfo) {
    const { minX, maxY, scaleX, scaleY, pad, contentWidth } = scaleInfo;
    const wrapThreshold = contentWidth * 0.5;
    let d = '';
    coordsList.forEach((ring) => {
      let prevX = null;
      ring.forEach((coord, i) => {
        const [lon, lat] = coord;
        const proj = projectPoint(lon, lat);
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

  function renderMap(featuresToDraw, group, scaleInfoFromGroup) {
    const scaleInfo = scaleInfoFromGroup || computeScaleInfo(featuresToDraw);
    const groupCountrySet = new Set(group.countries);
    mapContainerEl.innerHTML = '';

    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', `0 0 ${scaleInfo.contentWidth} ${scaleInfo.contentHeight}`);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgEl.classList.add('map-overlay');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', scaleInfo.contentWidth);
    rect.setAttribute('height', scaleInfo.contentHeight);
    rect.setAttribute('fill', '#2563eb');
    svgEl.appendChild(rect);

    pathsByIso = {};

    featuresToDraw.forEach(f => {
      const geom = f.geometry;
      if (!geom) return;
      const type = geom.type;
      let coordsList = [];

      if (type === 'Polygon') {
        coordsList = geom.coordinates;
      } else if (type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => coordsList.push(...poly));
      }

      const d = buildPathFromCoords(coordsList, scaleInfo);
      const p = f.properties || {};
      const raw = p.iso_a3 || p.ISO_A3 || p.ADM0_A3 || p.ISO3 || p.iso3 || p.sov_a3 || p.adm0_a3 || p.iso_a2;
      const iso = raw ? window.App.normalizeCountryIso(raw) : raw;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'map-country');
      const isInGroup = iso && groupCountrySet && groupCountrySet.has(iso);
      path.setAttribute('fill', '#16a34a');
      path.setAttribute('stroke', '#000');
      path.setAttribute('stroke-width', '0.5');
      if (iso) path.dataset.iso = iso;

      svgEl.appendChild(path);
      if (isInGroup) pathsByIso[iso] = path;
    });

    mapContainerEl.appendChild(svgEl);
  }

  btnDownloadLog.addEventListener('click', () => {
    window.App.downloadHistoryAsJSON();
  });

  window.addEventListener('beforeunload', () => {
    if (!sessionEnded && session) {
      window.App.finalizeSession(session);
    }
  });

  try {
    group = await window.App.loadGroupById(groupId);
    countriesMap = await window.App.loadCountriesMap();
    const world = await window.App.loadWorldGeoJSON();

    const isContinentOrWorld = groupId === 'world' || groupId.startsWith('continent_');
    if (isContinentOrWorld) worldGeo = world;

    centerOnGreenwich = (groupId === 'world');

    const titleBase = 'Kaart-quiz';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = isContinentOrWorld
      ? 'Herken het wit gemarkeerde land (zelfde kaart als oefen-preview).'
      : 'Herken het wit gemarkeerde land (continent-only, Mercator projectie).';
    continentLabelEl.textContent = group.continent;

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'map',
      subMode: 'continent-only'
    });

    if (isContinentOrWorld) {
      mapContainerEl.innerHTML = window.App.buildWorldMapEmpty(world) || '';
    } else {
      const setIso = new Set(group.countries);
      const cont = group.continent;
      const getIso = (f) => {
        const p = f.properties || {};
        const raw = p.iso_a3 || p.ISO_A3 || p.ADM0_A3 || p.ISO3 || p.iso3 || p.sov_a3 || p.adm0_a3 || p.iso_a2;
        return raw ? window.App.normalizeCountryIso(raw) : raw;
      };
      const getContinent = (f) => {
        const p = f.properties || {};
        return p.continent || p.CONTINENT || p.Continent;
      };
      const matchesContinent = (iso, c) =>
        !cont || cont === 'World' || c === cont || (countriesMap[iso] && countriesMap[iso].continent === cont);
      const groupFeatures = world.features.filter(f => {
        const iso = getIso(f);
        const c = getContinent(f);
        return iso && setIso.has(iso) && matchesContinent(iso, c);
      });
      const featuresForExtent = groupId === 'week3_noord-amerika_deel2'
        ? groupFeatures.filter(f => getIso(f) !== 'USA')
        : groupFeatures;
      scaleInfo = computeScaleInfo(featuresForExtent.length ? featuresForExtent : groupFeatures);
      allContinentFeatures = world.features.filter(f => {
        const raw = f.properties && (f.properties.iso_a3 || f.properties.ISO_A3 || f.properties.ADM0_A3 || f.properties.ISO3 || f.properties.iso3 || f.properties.sov_a3 || f.properties.adm0_a3 || f.properties.iso_a2);
        return raw;
      });
      renderMap(allContinentFeatures, group, scaleInfo);
    }

    useTypeBox = isContinentOrWorld;
    if (useTypeBox && mapQuizTypeWrap && mapQuizTypeInput && mapQuizTypeSubmit) {
      mapQuizTypeWrap.style.display = 'block';
      mapQuizTypeSubmit.addEventListener('click', () => handleTypedAnswer());
      mapQuizTypeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleTypedAnswer();
        }
      });
    }

    // knoppen rechts
    group.countries.forEach(iso => {
      const c = countriesMap[iso];
      if (!c) return;
      const btn = document.createElement('button');
      btn.textContent = c.name_nl;
      btn.dataset.iso = iso;
      btn.addEventListener('click', () => handleGuess(iso));
      countryButtonsEl.appendChild(btn);
    });

    showNextQuestion();
  } catch (err) {
    console.error(err);
    sessionStatusEl.textContent = 'Kon kaart-quiz niet starten. Controleer of je via een webserver laadt.';
    sessionStatusEl.className = 'status-label bad';
  }
});

