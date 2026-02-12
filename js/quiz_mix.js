document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');
  const typesParam = window.App.getQueryParam('types'); // bijv. "capital,flag" voor aangepaste mix (precies 2 van 3)
  const allowedTypes = parseCustomTypes(typesParam);
  const infiniteMode = window.App.getQueryParam('infinite') === '1';

  function parseCustomTypes(param) {
    if (!param || typeof param !== 'string') return null;
    const valid = ['capital', 'flag', 'map'];
    const parts = param.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const allowed = parts.filter(p => valid.includes(p));
    const unique = [...new Set(allowed)];
    return unique.length === 2 ? unique.sort() : null; // precies 2 types
  }

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
  let countryStats;
  let session;
  let currentCountry = null;
  let currentQuestionType = 'capital'; // 'capital' | 'flag' | 'map'
  let currentSubType = null;
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
    }
  }

  // Oude SVG rendering functies verwijderd - vervangen door satelliet kaart

  function chooseQuestionType() {
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
      if (!infiniteMode) return;
    }
    currentCountry = window.App.pickNextCountryNoRepeat(countryStats, askedThisRound);
    askedThisRound.add(currentCountry.iso);
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
    // Cleanup satelliet kaart
    if (window.SatelliteMap) {
      window.SatelliteMap.destroy();
    }
  });

  try {
    group = await window.App.loadGroupById(groupId);
    countriesMap = await window.App.loadCountriesMap();

    const typeLabels = { capital: 'Hoofdstad', flag: 'Vlaggen', map: 'Kaart' };
    const titleBase = allowedTypes ? 'Aangepaste mix' : 'Mix-quiz';
    let subtitleText = allowedTypes
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
      subMode: allowedTypes ? allowedTypes.join('+') : 'capital+flag+map'
    });

    // Initialiseer satelliet kaart
    if (window.SatelliteMap) {
      await window.SatelliteMap.init('mix-map-container', '../assets/maps/high_res_usa.json');
      satelliteMapInitialized = true;
      
      // Zoom naar de landen in dit deel (geen animatie)
      if (group.countries && group.countries.length > 0) {
        // Speciale zoom voor Noord-Amerika deel 2 (zonder USA)
        const zoomCountries = groupId === 'week3_noord-amerika_deel2'
          ? group.countries.filter(iso => iso !== 'USA')
          : group.countries;
        
        window.SatelliteMap.fitToRegion(zoomCountries.length ? zoomCountries : group.countries, {
          padding: { top: 30, bottom: 30, left: 30, right: 30 },
          maxZoom: 5,
          duration: 0
        });
      }
    } else {
      throw new Error('SatelliteMap module niet geladen');
    }

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

