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
  let sessionEnded = false;
  const askedThisRound = new Set();
  let useTypeBox = false;
  let satelliteMapInitialized = false;

  // Oude projectie functies verwijderd - niet meer nodig met satelliet kaart

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

  // Oude SVG rendering functies verwijderd - vervangen door satelliet kaart

  function setTargetOnMap(iso) {
    // Nieuwe implementatie: gebruik satelliet kaart
    if (window.SatelliteMap && satelliteMapInitialized) {
      window.SatelliteMap.highlightCountry(iso);
    }
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
    
    // Gebruik satelliet kaart voor highlight
    setTargetOnMap(currentCountry.iso);
    
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
      sessionStatusEl.textContent = `✓ Correct! Het was ${correctName}.`;
      sessionStatusEl.className = 'status-label ok';
    } else {
      sessionStatusEl.textContent = `✗ Fout! Het witte land was ${correctName}.`;
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
      sessionStatusEl.textContent = `✓ Correct! Het was ${countriesMap[currentCountry.iso].name_nl}.`;
      sessionStatusEl.className = 'status-label ok';
    } else {
      const c = countriesMap[currentCountry.iso];
      sessionStatusEl.textContent = `✗ Fout! Het witte land was ${c.name_nl}.`;
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

  // Oude SVG rendering functies verwijderd - niet meer nodig

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

    const isContinentOrWorld = groupId === 'world' || groupId.startsWith('continent_');

    const titleBase = 'Kaart-quiz';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = 'Herken het wit gemarkeerde land op de satellietkaart.';
    continentLabelEl.textContent = group.continent;

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'map',
      subMode: 'satellite'
    });

    // Initialiseer satelliet kaart
    if (window.SatelliteMap) {
      await window.SatelliteMap.init('map-container', '../assets/maps/high_res_usa.json');
      satelliteMapInitialized = true;
      
      // Zoom naar regio als het een specifiek deel is (niet wereld/continent)
      if (!isContinentOrWorld && group.countries && group.countries.length > 0) {
        window.SatelliteMap.fitToRegion(group.countries, {
          padding: { top: 30, bottom: 30, left: 30, right: 30 },
          maxZoom: 5,
          duration: 0
        });
      }
    } else {
      throw new Error('SatelliteMap module niet geladen');
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

