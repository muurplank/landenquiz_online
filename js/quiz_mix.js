document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');

  const flagContainerEl = document.getElementById('mix-flag-container');
  const questionEl = document.getElementById('mix-question');
  const answerEl = document.getElementById('mix-answer');
  const btnShow = document.getElementById('btn-show-answer');
  const btnCorrect = document.getElementById('btn-correct');
  const btnIncorrect = document.getElementById('btn-incorrect');

  const mapContainerEl = document.getElementById('mix-map-container');
  const mixCapFlagArea = document.getElementById('mix-capflag-area');
  const mixMapArea = document.getElementById('mix-map-area');

  const countryButtonsEl = document.getElementById('country-buttons');
  const deckStatusEl = document.getElementById('deck-status');
  const questionTypeLabelEl = document.getElementById('question-type-label');
  const titleEl = document.getElementById('quiz-title');
  const subtitleEl = document.getElementById('quiz-subtitle');
  const sessionStatusEl = document.getElementById('session-status');

  const statQuestionsEl = document.getElementById('stat-questions');
  const statAccuracyEl = document.getElementById('stat-accuracy');
  const statAvgTimeEl = document.getElementById('stat-avg-time');
  const statStreakEl = document.getElementById('stat-streak');

  const btnDownloadLog = document.getElementById('btn-download-log');

  if (!groupId) {
    questionEl.textContent = 'Geen deel geselecteerd.';
    btnShow.disabled = true;
    return;
  }

  let group;
  let countriesMap;
  let worldGeo;
  let countryStats;
  let session;
  let currentCountry = null;
  let currentQuestionType = 'capital'; // 'capital' | 'flag' | 'map'
  let currentSubType = null;
  let questionStartTime = null;
  let sessionEnded = false;
  let svgEl = null;
  let pathsByIso = {};
  let useLonWrap = false;

  function getLonExtent(features) {
    let minLon = Infinity, maxLon = -Infinity;
    const walk = (coords) => {
      coords.forEach(c => {
        if (typeof c[0] === 'number') {
          if (c[0] < minLon) minLon = c[0];
          if (c[0] > maxLon) maxLon = c[0];
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

  // Alleen lon < -100° wrappen (Pacific eilanden, Rusland Verre Oosten), zodat UK/Portugal links blijven
  const LON_WRAP_THRESHOLD = -100;
  function wrapLon(lon) {
    return useLonWrap && lon < LON_WRAP_THRESHOLD ? lon + 360 : lon;
  }

  function projectPoint(lon, lat) {
    return window.App.mercatorProject(wrapLon(lon), lat);
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
      btnShow.disabled = true;
      btnCorrect.disabled = true;
      btnIncorrect.disabled = true;
    }
  }

  function setControlsForCapFlagQuestion() {
    answerEl.hidden = true;
    btnShow.disabled = false;
    btnCorrect.disabled = true;
    btnIncorrect.disabled = true;
    sessionStatusEl.textContent = '';
  }

  function setTargetOnMap(iso) {
    Object.keys(pathsByIso).forEach(k => {
      const path = pathsByIso[k];
      if (!path) return;
      if (k === iso) {
        path.classList.add('target');
        path.setAttribute('fill', '#fff');
      } else {
        path.classList.remove('target');
        path.setAttribute('fill', '#16a34a');
      }
    });
  }

  function computeScaleInfo(features) {
    const ext = getLonExtent(features);
    useLonWrap = (ext.maxLon - ext.minLon) > 180;

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

    const pad = 20;
    const contentWidth = 800;
    const contentHeight = 450;
    let dx = maxX - minX || 1;
    let dy = maxY - minY || 1;
    const expand = 0.08;
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

  function renderMap(featuresToDraw, scaleInfoFromGroup, groupCountrySet) {
    const scaleInfo = scaleInfoFromGroup || computeScaleInfo(featuresToDraw);
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', `0 0 ${scaleInfo.contentWidth} ${scaleInfo.contentHeight}`);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

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

      const isInGroup = iso && groupCountrySet && groupCountrySet.has(iso);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'map-country');
      path.setAttribute('fill', '#16a34a');
      path.setAttribute('stroke', '#000');
      path.setAttribute('stroke-width', '0.5');
      if (iso) path.dataset.iso = iso;

      svgEl.appendChild(path);
      if (isInGroup) pathsByIso[iso] = path;
    });

    mapContainerEl.innerHTML = '';
    mapContainerEl.appendChild(svgEl);
  }

  function chooseQuestionType() {
    const types = ['capital', 'flag', 'map'];
    const idx = Math.floor(Math.random() * types.length);
    return types[idx];
  }

  function prepareCapitalQuestion(c) {
    flagContainerEl.innerHTML = '';
    if (Math.random() < 0.5) {
      currentSubType = 'land-to-capital';
      questionEl.textContent = `Wat is de hoofdstad van ${c.name_nl}?`;
      answerEl.textContent = c.capitals_nl.join(', ');
      questionTypeLabelEl.textContent = 'Hoofdstad (land → hoofdstad)';
    } else {
      currentSubType = 'capital-to-land';
      questionEl.textContent = `Van welk land is de hoofdstad: ${c.capitals_nl.join(', ')}?`;
      answerEl.textContent = c.name_nl;
      questionTypeLabelEl.textContent = 'Hoofdstad (hoofdstad → land)';
    }
    mixCapFlagArea.style.display = '';
    mixMapArea.style.display = 'none';
    setControlsForCapFlagQuestion();
  }

  function prepareFlagQuestion(c) {
    const iso = c.iso;
    if (Math.random() < 0.5) {
      currentSubType = 'flag-to-land';
      flagContainerEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = `../assets/flags/${window.App.getFlagFilename(iso)}`;
      img.alt = `Vlag ${c.name_nl}`;
      img.style.maxWidth = '240px';
      img.style.border = '1px solid #cbd5e0';
      img.style.borderRadius = '4px';
      img.style.display = 'block';
      img.style.backgroundColor = '#fff';
      flagContainerEl.appendChild(img);

      questionEl.textContent = 'Bij welke land hoort deze vlag?';
      answerEl.textContent = c.name_nl;
      questionTypeLabelEl.textContent = 'Vlag (vlag → land)';
    } else {
      currentSubType = 'land-to-flag';
      flagContainerEl.innerHTML = '';
      const preview = document.createElement('div');
      preview.className = 'small';
      preview.textContent = '(De vlag wordt zichtbaar bij het antwoord.)';
      flagContainerEl.appendChild(preview);

      const img = document.createElement('img');
      img.src = `../assets/flags/${window.App.getFlagFilename(iso)}`;
      img.alt = `Vlag ${c.name_nl}`;
      img.style.maxWidth = '240px';
      img.style.border = '1px solid #cbd5e0';
      img.style.borderRadius = '4px';
      img.style.display = 'block';
      img.style.backgroundColor = '#fff';

      answerEl.innerHTML = '';
      answerEl.appendChild(img);

      questionEl.textContent = `Hoe ziet de vlag van ${c.name_nl} eruit?`;
      questionTypeLabelEl.textContent = 'Vlag (land → vlag)';
    }
    mixCapFlagArea.style.display = '';
    mixMapArea.style.display = 'none';
    setControlsForCapFlagQuestion();
  }

  function prepareMapQuestion() {
    currentQuestionType = 'map';
    currentSubType = 'continent-only';
    questionTypeLabelEl.textContent = 'Kaart';
    mixCapFlagArea.style.display = 'none';
    mixMapArea.style.display = '';
    sessionStatusEl.textContent = 'Klik op de juiste landnaam in de lijst.';
    sessionStatusEl.className = 'status-label';
  }

  function showNextQuestion() {
    if (sessionEnded) return;
    if (window.App.allMastered(countryStats)) {
      maybeEndSessionIfMastered();
      return;
    }
    currentCountry = window.App.pickRandomCountry(countryStats);
    questionStartTime = performance.now();

    currentQuestionType = chooseQuestionType();
    const c = countriesMap[currentCountry.iso];

    if (currentQuestionType === 'capital') {
      prepareCapitalQuestion(c);
    } else if (currentQuestionType === 'flag') {
      prepareFlagQuestion(c);
    } else {
      prepareMapQuestion();
      setTargetOnMap(currentCountry.iso);
    }

    updateDeckStatus();
  }

  function handleSelfScoredAnswer(wasCorrect) {
    if (!currentCountry || sessionEnded) return;
    const dt = performance.now() - questionStartTime;

    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: currentQuestionType,
      subType: currentSubType,
      wasCorrect,
      responseTimeMs: dt
    });
    updateSessionStatsUI();
    maybeEndSessionIfMastered();
    if (!sessionEnded) {
      showNextQuestion();
    }
  }

  function handleMapGuess(isoGuess) {
    if (!currentCountry || sessionEnded) return;
    if (currentQuestionType !== 'map') return;
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
        countryButtonsEl.querySelectorAll('button').forEach(btn => {
          btn.classList.remove('correct', 'incorrect');
        });
        showNextQuestion();
      }, 900);
    }
  }

  btnShow.addEventListener('click', () => {
    if (currentQuestionType === 'map') return;
    answerEl.hidden = false;
    btnShow.disabled = true;
    btnCorrect.disabled = false;
    btnIncorrect.disabled = false;
  });

  btnCorrect.addEventListener('click', () => handleSelfScoredAnswer(true));
  btnIncorrect.addEventListener('click', () => handleSelfScoredAnswer(false));

  function handleQuizKeydown(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
    const isSpace = e.key === ' ' || e.code === 'Space';
    if (isSpace) {
      e.preventDefault();
      if (btnShow && !btnShow.disabled) btnShow.click();
    } else if ((e.key === '1' || e.code === 'Digit1') && btnCorrect && !btnCorrect.disabled) {
      e.preventDefault();
      btnCorrect.click();
    } else if ((e.key === '2' || e.code === 'Digit2') && btnIncorrect && !btnIncorrect.disabled) {
      e.preventDefault();
      btnIncorrect.click();
    }
  }
  window.addEventListener('keydown', handleQuizKeydown, true);
  const quizCard = btnShow && btnShow.closest('.quiz-card');
  if (quizCard) {
    quizCard.setAttribute('tabindex', '0');
    quizCard.addEventListener('keydown', handleQuizKeydown);
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
    worldGeo = await window.App.loadWorldGeoJSON();

    const titleBase = 'Mix-quiz';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = 'Combinatie van hoofdsteden, vlaggen en kaartvragen. Mastery telt per land.';

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'mix',
      subMode: 'capital+flag+map'
    });

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
      !cont || c === cont || (countriesMap[iso] && countriesMap[iso].continent === cont);

    const groupFeatures = worldGeo.features.filter(f => {
      const iso = getIso(f);
      const c = getContinent(f);
      return iso && setIso.has(iso) && matchesContinent(iso, c);
    });
    // Noord-Amerika deel 2: zoom zonder USA, zodat Mexico/Caraïben goed passen
    const featuresForExtent = groupId === 'week3_noord-amerika_deel2'
      ? groupFeatures.filter(f => getIso(f) !== 'USA')
      : groupFeatures;
    const scaleInfo = computeScaleInfo(featuresForExtent.length ? featuresForExtent : groupFeatures);

    // Alle landen tekenen (zoom blijft gelijk, landen buiten zicht worden geknipt)
    const allContinentFeatures = worldGeo.features.filter(f => getIso(f));

    renderMap(allContinentFeatures, scaleInfo, setIso);

    // landknoppen
    group.countries.forEach(iso => {
      const c = countriesMap[iso];
      if (!c) return;
      const btn = document.createElement('button');
      btn.textContent = c.name_nl;
      btn.dataset.iso = iso;
      btn.addEventListener('click', () => handleMapGuess(iso));
      countryButtonsEl.appendChild(btn);
    });

    showNextQuestion();
    if (quizCard) quizCard.focus();
  } catch (err) {
    console.error(err);
    questionEl.textContent = 'Kon mix-quiz niet starten. Controleer of je via een webserver laadt.';
    btnShow.disabled = true;
  }
});

