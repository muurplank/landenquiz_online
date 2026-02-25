document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');
  const typesParam = window.App.getQueryParam('types'); // bijv. "capital,flag" voor aangepaste mix (precies 2 van 3)
  const customParam = window.App.getQueryParam('custom'); // bijv. "land-capital,flag-land" – specifieke vraagtypen uit modal

  function parseCustomTypes(param) {
    if (!param || typeof param !== 'string') return null;
    const valid = ['capital', 'flag', 'map'];
    const parts = param.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const allowed = parts.filter(p => valid.includes(p));
    const unique = [...new Set(allowed)];
    return unique.length === 2 ? unique.sort() : null; // precies 2 types
  }

  // Mega mix: alle combinaties van "gegeven → antwoord" (moet voor parseCustomMegaTypes staan)
  const MEGA_TYPES = [
    { key: 'land-capital', from: 'land', to: 'capital', label: 'Land → Hoofdstad' },
    { key: 'capital-land', from: 'capital', to: 'land', label: 'Hoofdstad → Land' },
    { key: 'land-flag', from: 'land', to: 'flag', label: 'Land → Vlag' },
    { key: 'flag-land', from: 'flag', to: 'land', label: 'Vlag → Land' },
    { key: 'map-land', from: 'map', to: 'land', label: 'Kaart → Land' },
    { key: 'capital-flag', from: 'capital', to: 'flag', label: 'Hoofdstad → Vlag' },
    { key: 'capital-map', from: 'capital', to: 'map', label: 'Hoofdstad → Land (kaart)' },
    { key: 'flag-capital', from: 'flag', to: 'capital', label: 'Vlag → Hoofdstad' },
    { key: 'flag-map', from: 'flag', to: 'map', label: 'Vlag → Land (kaart)' },
    { key: 'map-capital', from: 'map', to: 'capital', label: 'Kaart → Hoofdstad' },
    { key: 'map-flag', from: 'map', to: 'flag', label: 'Kaart → Vlag' },
  ];

  function parseCustomMegaTypes(param) {
    if (!param || typeof param !== 'string') return null;
    const selected = param.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const keySet = new Set(selected);
    const filtered = MEGA_TYPES.filter(t => keySet.has(t.key));
    return filtered.length > 0 ? filtered : null;
  }

  const allowedTypes = parseCustomTypes(typesParam);
  const customMegaTypes = parseCustomMegaTypes(customParam);
  const infiniteMode = window.App.getQueryParam('infinite') === '1';
  const megaMix = window.App.getQueryParam('mega') === '1'; // Mega mix: alle combinaties
  const useCustomMega = customMegaTypes && customMegaTypes.length > 0; // Custom mix uit modal

  const flagContainerEl = document.getElementById('mix-flag-container');
  const questionEl = document.getElementById('mix-question');
  const answerEl = document.getElementById('mix-answer');
  const btnShow = document.getElementById('btn-show-answer');
  const btnCorrect = document.getElementById('btn-correct');
  const btnIncorrect = document.getElementById('btn-incorrect');

  const mapContainerEl = document.getElementById('mix-map-container');
  const mixCapFlagArea = document.getElementById('mix-capflag-area');
  const mixMapArea = document.getElementById('mix-map-area');
  const mixMapAnswerOverlay = document.getElementById('mix-map-answer-overlay');
  const mixMapControls = document.getElementById('mix-map-controls');
  const mixMapPrompt = document.getElementById('mix-map-prompt');
  const mixMapGivenWrap = document.getElementById('mix-map-given-wrap');
  const btnMixShow = document.getElementById('btn-mix-show-answer');
  const btnMixCorrect = document.getElementById('btn-mix-correct');
  const btnMixIncorrect = document.getElementById('btn-mix-incorrect');

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
  let countryStats;
  let session;
  let currentCountry = null;
  let currentQuestionType = 'capital'; // 'capital' | 'flag' | 'map'
  let currentSubType = null;
  let currentMegaType = null; // { from, to, label } bij mega mix
  let questionStartTime = null;
  let sessionEnded = false;
  const askedThisRound = new Set(); // eerst alle landen één keer, daarna ronde opnieuw
  let satelliteMapInitialized = false;

  // Oude SVG rendering functies verwijderd - vervangen door satelliet kaart

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
    if (infiniteMode) return; // Oneindige modus: nooit automatisch eindigen
    if (window.App.allMastered(countryStats)) {
      sessionEnded = true;
      window.App.finalizeSession(session);
      sessionStatusEl.textContent = 'Sessie voltooid: alle landen minstens 1x correct!';
      sessionStatusEl.className = 'status-label ok';
      btnShow.disabled = true;
      btnCorrect.disabled = true;
      btnIncorrect.disabled = true;
      if (mixMapControls) mixMapControls.style.display = 'none';
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
    if (window.SatelliteMap && satelliteMapInitialized) {
      window.SatelliteMap.highlightCountry(iso);
      window.SatelliteMap.fitToRegion([iso], {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        maxZoom: 4,
        duration: 500
      });
    }
  }

  function isMapOverlayQuestion() {
    return (currentQuestionType === 'map' && (currentSubType === 'continent-only' || currentSubType === 'map-to-capital' || currentSubType === 'map-to-flag'));
  }

  function setMixMapControlsForQuestion() {
    if (mixMapAnswerOverlay) mixMapAnswerOverlay.hidden = true;
    if (mixMapAnswerOverlay) mixMapAnswerOverlay.innerHTML = '';
    if (btnMixShow) btnMixShow.disabled = false;
    if (btnMixCorrect) btnMixCorrect.disabled = true;
    if (btnMixIncorrect) btnMixIncorrect.disabled = true;
  }

  function setCountryListVisible(visible) {
    const aside = countryButtonsEl && countryButtonsEl.closest('aside');
    if (!aside) return;
    const h2 = aside.querySelector('h2');
    const listWrap = aside.querySelector('.list-search-wrap');
    if (h2) h2.style.display = visible ? '' : 'none';
    if (listWrap) listWrap.style.display = visible ? '' : 'none';
    if (countryButtonsEl) countryButtonsEl.style.display = visible ? '' : 'none';
  }

  function showMixMapAnswer(content) {
    if (!mixMapAnswerOverlay) return;
    mixMapAnswerOverlay.innerHTML = '';
    if (typeof content === 'string') {
      mixMapAnswerOverlay.textContent = content;
    } else if (content && content.nodeType === 1) {
      mixMapAnswerOverlay.appendChild(content);
    }
    mixMapAnswerOverlay.hidden = false;
    if (btnMixShow) btnMixShow.disabled = true;
    if (btnMixCorrect) btnMixCorrect.disabled = false;
    if (btnMixIncorrect) btnMixIncorrect.disabled = false;
  }

  // Oude SVG rendering functies verwijderd - vervangen door satelliet kaart

  function chooseQuestionType() {
    if (useCustomMega) {
      const idx = Math.floor(Math.random() * customMegaTypes.length);
      return customMegaTypes[idx];
    }
    if (megaMix) {
      const idx = Math.floor(Math.random() * MEGA_TYPES.length);
      return MEGA_TYPES[idx];
    }
    const types = allowedTypes || ['capital', 'flag', 'map'];
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
    if (mixMapControls) mixMapControls.style.display = 'none';
    if (mixMapPrompt) mixMapPrompt.style.display = 'none';
    setCountryListVisible(true);
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
    if (mixMapControls) mixMapControls.style.display = 'none';
    if (mixMapPrompt) mixMapPrompt.style.display = 'none';
    setCountryListVisible(true);
    setControlsForCapFlagQuestion();
  }

  function prepareMapQuestion() {
    currentQuestionType = 'map';
    currentSubType = 'continent-only';
    questionTypeLabelEl.textContent = 'Kaart';
    mixCapFlagArea.style.display = 'none';
    mixMapArea.style.display = '';
    if (mixMapPrompt) { mixMapPrompt.textContent = 'Welk land is wit gemarkeerd?'; mixMapPrompt.style.display = ''; }
    if (mixMapGivenWrap) mixMapGivenWrap.style.display = 'none';
    if (mixMapControls) mixMapControls.style.display = 'flex';
    setCountryListVisible(false);
    setMixMapControlsForQuestion();
    sessionStatusEl.textContent = '';
    sessionStatusEl.className = 'status-label';
  }

  // Mega mix: hoofdstad → vlag
  function prepareCapitalToFlag(c) {
    flagContainerEl.innerHTML = '';
    questionEl.textContent = `Hoe ziet de vlag eruit van het land met hoofdstad ${c.capitals_nl.join(', ')}?`;
    answerEl.innerHTML = '';
    const img = document.createElement('img');
    img.src = `../assets/flags/${window.App.getFlagFilename(c.iso)}`;
    img.alt = `Vlag ${c.name_nl}`;
    img.style.maxWidth = '240px';
    img.style.border = '1px solid #cbd5e0';
    img.style.borderRadius = '4px';
    img.style.display = 'block';
    img.style.backgroundColor = '#fff';
    answerEl.appendChild(img);
    questionTypeLabelEl.textContent = 'Hoofdstad → Vlag';
    mixCapFlagArea.style.display = '';
    mixMapArea.style.display = 'none';
    if (mixMapControls) mixMapControls.style.display = 'none';
    if (mixMapPrompt) mixMapPrompt.style.display = 'none';
    setCountryListVisible(true);
    setControlsForCapFlagQuestion();
  }

  // Mega mix: hoofdstad → land (geen kaart nodig)
  function prepareCapitalToMap(c) {
    flagContainerEl.innerHTML = '';
    questionEl.textContent = `Van welk land is de hoofdstad ${c.capitals_nl.join(', ')}?`;
    answerEl.textContent = c.name_nl;
    answerEl.hidden = true;
    questionTypeLabelEl.textContent = 'Hoofdstad → Land';
    mixCapFlagArea.style.display = '';
    mixMapArea.style.display = 'none';
    if (mixMapControls) mixMapControls.style.display = 'none';
    setCountryListVisible(false);
    setControlsForCapFlagQuestion();
    sessionStatusEl.textContent = '';
    sessionStatusEl.className = 'status-label';
  }

  // Mega mix: vlag → hoofdstad
  function prepareFlagToCapital(c) {
    flagContainerEl.innerHTML = '';
    const img = document.createElement('img');
    img.src = `../assets/flags/${window.App.getFlagFilename(c.iso)}`;
    img.alt = `Vlag ${c.name_nl}`;
    img.style.maxWidth = '240px';
    img.style.border = '1px solid #cbd5e0';
    img.style.borderRadius = '4px';
    img.style.display = 'block';
    img.style.backgroundColor = '#fff';
    flagContainerEl.appendChild(img);
    questionEl.textContent = 'Wat is de hoofdstad van dit land?';
    answerEl.textContent = c.capitals_nl.join(', ');
    questionTypeLabelEl.textContent = 'Vlag → Hoofdstad';
    mixCapFlagArea.style.display = '';
    mixMapArea.style.display = 'none';
    if (mixMapControls) mixMapControls.style.display = 'none';
    if (mixMapPrompt) mixMapPrompt.style.display = 'none';
    setCountryListVisible(true);
    setControlsForCapFlagQuestion();
  }

  // Mega mix: vlag → land (geen kaart nodig)
  function prepareFlagToMap(c) {
    flagContainerEl.innerHTML = '';
    const img = document.createElement('img');
    img.src = `../assets/flags/${window.App.getFlagFilename(c.iso)}`;
    img.alt = `Vlag van ${c.name_nl}`;
    img.style.maxWidth = '240px';
    img.style.border = '1px solid #cbd5e0';
    img.style.borderRadius = '4px';
    img.style.display = 'block';
    img.style.backgroundColor = '#fff';
    flagContainerEl.appendChild(img);
    questionEl.textContent = 'Bij welk land hoort deze vlag?';
    answerEl.textContent = c.name_nl;
    answerEl.hidden = true;
    questionTypeLabelEl.textContent = 'Vlag → Land';
    mixCapFlagArea.style.display = '';
    mixMapArea.style.display = 'none';
    if (mixMapControls) mixMapControls.style.display = 'none';
    setCountryListVisible(false);
    setControlsForCapFlagQuestion();
    sessionStatusEl.textContent = '';
    sessionStatusEl.className = 'status-label';
  }

  // Mega mix: kaart → hoofdstad (Snelle style: overlay)
  function prepareMapToCapital(c) {
    currentQuestionType = 'map';
    currentSubType = 'map-to-capital';
    questionTypeLabelEl.textContent = 'Kaart → Hoofdstad';
    mixCapFlagArea.style.display = 'none';
    mixMapArea.style.display = '';
    if (mixMapPrompt) { mixMapPrompt.textContent = 'Wat is de hoofdstad van het wit gemarkeerde land?'; mixMapPrompt.style.display = ''; }
    if (mixMapGivenWrap) mixMapGivenWrap.style.display = 'none';
    if (mixMapControls) mixMapControls.style.display = 'flex';
    setTargetOnMap(c.iso);
    setCountryListVisible(false);
    setMixMapControlsForQuestion();
    sessionStatusEl.textContent = '';
    sessionStatusEl.className = 'status-label';
    btnShow.disabled = true;
    btnCorrect.disabled = true;
    btnIncorrect.disabled = true;
  }

  // Mega mix: kaart → vlag (Snelle style: overlay)
  function prepareMapToFlag(c) {
    currentQuestionType = 'map';
    currentSubType = 'map-to-flag';
    questionTypeLabelEl.textContent = 'Kaart → Vlag';
    mixCapFlagArea.style.display = 'none';
    mixMapArea.style.display = '';
    if (mixMapPrompt) { mixMapPrompt.textContent = 'Hoe ziet de vlag eruit van het wit gemarkeerde land?'; mixMapPrompt.style.display = ''; }
    if (mixMapGivenWrap) mixMapGivenWrap.style.display = 'none';
    if (mixMapControls) mixMapControls.style.display = 'flex';
    setTargetOnMap(c.iso);
    setCountryListVisible(false);
    setMixMapControlsForQuestion();
    sessionStatusEl.textContent = '';
    sessionStatusEl.className = 'status-label';
    btnShow.disabled = true;
    btnCorrect.disabled = true;
    btnIncorrect.disabled = true;
  }

  function showNextQuestion() {
    if (sessionEnded) return;
    if (window.App.allMastered(countryStats)) {
      maybeEndSessionIfMastered();
      if (!infiniteMode) return;
    }
    currentCountry = window.App.pickNextCountryNoRepeat(countryStats, askedThisRound);
    askedThisRound.add(currentCountry.iso);
    questionStartTime = performance.now();

    const chosen = chooseQuestionType();
    const c = countriesMap[currentCountry.iso];
    if (!c) {
      console.warn('Land niet gevonden in countriesMap:', currentCountry.iso);
      showNextQuestion();
      return;
    }

    if ((useCustomMega || megaMix) && typeof chosen === 'object') {
      currentMegaType = chosen;
      currentQuestionType = chosen.from === 'map' ? 'map' : chosen.to === 'map' ? 'map' : chosen.from;
      currentSubType = `mega-${chosen.from}-${chosen.to}`;

      if (chosen.from === 'land' && chosen.to === 'capital') prepareCapitalQuestion(c);
      else if (chosen.from === 'capital' && chosen.to === 'land') prepareCapitalQuestion(c);
      else if (chosen.from === 'land' && chosen.to === 'flag') prepareFlagQuestion(c);
      else if (chosen.from === 'flag' && chosen.to === 'land') prepareFlagQuestion(c);
      else if (chosen.from === 'map' && chosen.to === 'land') { prepareMapQuestion(); setTargetOnMap(currentCountry.iso); }
      else if (chosen.from === 'capital' && chosen.to === 'flag') prepareCapitalToFlag(c);
      else if (chosen.from === 'capital' && chosen.to === 'map') prepareCapitalToMap(c);
      else if (chosen.from === 'flag' && chosen.to === 'capital') prepareFlagToCapital(c);
      else if (chosen.from === 'flag' && chosen.to === 'map') prepareFlagToMap(c);
      else if (chosen.from === 'map' && chosen.to === 'capital') prepareMapToCapital(c);
      else if (chosen.from === 'map' && chosen.to === 'flag') prepareMapToFlag(c);
    } else {
      currentMegaType = null;
      currentQuestionType = chosen;
      if (currentQuestionType === 'capital') {
        prepareCapitalQuestion(c);
      } else if (currentQuestionType === 'flag') {
        prepareFlagQuestion(c);
      } else {
        prepareMapQuestion();
        setTargetOnMap(currentCountry.iso);
      }
    }

    updateDeckStatus();
  }

  function handleSelfScoredAnswer(wasCorrect) {
    if (!currentCountry || sessionEnded) return;
    const dt = performance.now() - questionStartTime;
    const quizTypeForRecord = (megaMix || useCustomMega) ? 'mix' : currentQuestionType;

    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: quizTypeForRecord,
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
    if (isMapOverlayQuestion()) return; // Gebruik self-scoring via overlay
    const isMapClick = currentQuestionType === 'map' || currentSubType === 'mega-capital-map' || currentSubType === 'mega-flag-map';
    if (!isMapClick) return;
    const dt = performance.now() - questionStartTime;
    const isCorrect = isoGuess === currentCountry.iso;

    const subTypeForRecord = currentSubType || 'continent-only';
    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: (megaMix || useCustomMega) ? 'mix' : 'map',
      subType: subTypeForRecord,
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
    // Bij map overlay-vragen wordt btnMixShow gebruikt
    if (isMapOverlayQuestion()) return;
    answerEl.hidden = false;
    btnShow.disabled = true;
    btnCorrect.disabled = false;
    btnIncorrect.disabled = false;
  });

  btnCorrect.addEventListener('click', () => handleSelfScoredAnswer(true));
  btnIncorrect.addEventListener('click', () => handleSelfScoredAnswer(false));

  if (btnMixShow) {
    btnMixShow.addEventListener('click', () => {
      if (!currentCountry || !countriesMap) return;
      const c = countriesMap[currentCountry.iso];
      if (currentSubType === 'continent-only' || currentSubType === 'mega-capital-map' || currentSubType === 'mega-flag-map') {
        showMixMapAnswer(c ? c.name_nl : currentCountry.iso);
      } else if (currentSubType === 'map-to-capital') {
        showMixMapAnswer(c ? c.capitals_nl.join(', ') : '');
      } else if (currentSubType === 'map-to-flag') {
        if (mixMapGivenWrap) {
          mixMapGivenWrap.innerHTML = '';
          const img = document.createElement('img');
          img.src = `../assets/flags/${window.App.getFlagFilename(currentCountry.iso)}`;
          img.alt = c ? c.name_nl : '';
          img.className = 'mix-map-given-flag';
          mixMapGivenWrap.appendChild(img);
          mixMapGivenWrap.style.display = 'block';
        }
        if (mixMapAnswerOverlay) mixMapAnswerOverlay.hidden = true;
        if (btnMixShow) btnMixShow.disabled = true;
        if (btnMixCorrect) btnMixCorrect.disabled = false;
        if (btnMixIncorrect) btnMixIncorrect.disabled = false;
      }
    });
  }
  if (btnMixCorrect) btnMixCorrect.addEventListener('click', () => handleSelfScoredAnswer(true));
  if (btnMixIncorrect) btnMixIncorrect.addEventListener('click', () => handleSelfScoredAnswer(false));

  function handleQuizKeydown(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
    if (window.SatelliteMap && satelliteMapInitialized) {
      if ((e.key === '-' || e.key === 'q' || e.key === 'Q' || e.code === 'Minus' || e.code === 'KeyQ') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        window.SatelliteMap.zoomOut();
        return;
      }
      if ((e.key === '=' || e.key === '+' || e.key === 'w' || e.key === 'W' || e.code === 'Equal' || e.code === 'KeyW') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        window.SatelliteMap.zoomIn();
        return;
      }
    }
    const isSpace = e.key === ' ' || e.code === 'Space';
    const useMixMapControls = isMapOverlayQuestion() && mixMapControls && mixMapControls.style.display !== 'none';
    if (isSpace) {
      e.preventDefault();
      if (useMixMapControls && btnMixShow && !btnMixShow.disabled) btnMixShow.click();
      else if (!useMixMapControls && btnShow && !btnShow.disabled) btnShow.click();
    } else if ((e.key === '1' || e.code === 'Digit1')) {
      if (useMixMapControls && btnMixCorrect && !btnMixCorrect.disabled) { e.preventDefault(); btnMixCorrect.click(); }
      else if (!useMixMapControls && btnCorrect && !btnCorrect.disabled) { e.preventDefault(); btnCorrect.click(); }
    } else if ((e.key === '2' || e.code === 'Digit2')) {
      if (useMixMapControls && btnMixIncorrect && !btnMixIncorrect.disabled) { e.preventDefault(); btnMixIncorrect.click(); }
      else if (!useMixMapControls && btnIncorrect && !btnIncorrect.disabled) { e.preventDefault(); btnIncorrect.click(); }
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
    // Cleanup satelliet kaart
    if (window.SatelliteMap) {
      window.SatelliteMap.destroy();
    }
  });

  try {
    group = await window.App.loadGroupById(groupId);
    countriesMap = await window.App.loadCountriesMap();

    const typeLabels = { capital: 'Hoofdstad', flag: 'Vlaggen', map: 'Kaart' };
    let titleBase = allowedTypes ? 'Aangepaste mix' : 'Mix-quiz';
    if (useCustomMega) titleBase = 'Custom mix';
    if (megaMix) titleBase = 'Mega mix';
    let subtitleText = useCustomMega
      ? `Geselecteerde vraagtypen: ${customMegaTypes.map(t => t.label).join(', ')}.`
      : megaMix
        ? 'Alle combinaties: hoofdstad↔vlag↔kaart. Bijv. vlag bij hoofdstad, land op kaart bij vlag.'
        : allowedTypes
          ? `Mix van ${allowedTypes.map(t => typeLabels[t]).join(' + ')}. Mastery telt per land.`
          : 'Combinatie van hoofdsteden, vlaggen en kaartvragen. Mastery telt per land.';
    if (infiniteMode) subtitleText += ' Oneindige modus: ga door zolang je wilt.';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = subtitleText;

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'mix',
      subMode: useCustomMega ? 'custom:' + customMegaTypes.map(t => t.key).join(',') : (megaMix ? 'mega' : (allowedTypes ? allowedTypes.join('+') : 'capital+flag+map'))
    });

    // Initialiseer satelliet kaart (niet blokkerend – quiz start direct, kaart laadt op de achtergrond)
    if (window.SatelliteMap) {
      window.SatelliteMap.init('mix-map-container', '../assets/maps/high_res_usa.json').then(() => {
        satelliteMapInitialized = true;
        if (group.countries && group.countries.length > 0) {
          const zoomCountries = groupId === 'week3_noord-amerika_deel2'
            ? group.countries.filter(iso => iso !== 'USA')
            : group.countries;
          window.SatelliteMap.fitToRegion(zoomCountries.length ? zoomCountries : group.countries, {
            padding: { top: 30, bottom: 30, left: 30, right: 30 },
            maxZoom: 5,
            duration: 0
          });
        }
        if (currentCountry && currentQuestionType === 'map') setTargetOnMap(currentCountry.iso);
      }).catch(err => console.warn('Kaart laden mislukt:', err));
    }

    // landknoppen
    group.countries.forEach(iso => {
      const c = countriesMap[iso];
      if (!c) return;
      const btn = document.createElement('button');
      btn.textContent = c.name_nl;
      btn.dataset.iso = iso;
      btn.dataset.search = (c.name_nl || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      btn.addEventListener('click', () => handleMapGuess(iso));
      countryButtonsEl.appendChild(btn);
    });

    const countryButtonsSearch = document.getElementById('country-buttons-search');
    if (countryButtonsSearch) {
      countryButtonsSearch.addEventListener('input', () => {
        const q = (countryButtonsSearch.value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
        countryButtonsEl.querySelectorAll('button').forEach(btn => {
          const show = !q || (btn.dataset.search || '').includes(q);
          btn.style.display = show ? '' : 'none';
        });
      });
    }

    showNextQuestion();
    if (quizCard) quizCard.focus();
  } catch (err) {
    console.error(err);
    questionEl.textContent = 'Kon mix-quiz niet starten. Controleer of je via een webserver laadt.';
    btnShow.disabled = true;
  }
});

