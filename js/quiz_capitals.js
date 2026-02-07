document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');
  const mode = window.App.getQueryParam('mode') || 'land-to-capital';

  const questionEl = document.getElementById('question');
  const answerEl = document.getElementById('answer');
  const btnShow = document.getElementById('btn-show-answer');
  const btnCorrect = document.getElementById('btn-correct');
  const btnIncorrect = document.getElementById('btn-incorrect');
  const deckStatusEl = document.getElementById('deck-status');
  const modeLabelEl = document.getElementById('mode-label');
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
  let currentQuestionMode = null; // bij mode 'both': 'land-to-capital' of 'capital-to-land'
  let questionStartTime = null;
  let sessionEnded = false;

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

  function setControlsForQuestion() {
    answerEl.hidden = true;
    btnShow.disabled = false;
    btnCorrect.disabled = true;
    btnIncorrect.disabled = true;
    sessionStatusEl.textContent = '';
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

  function showNextQuestion() {
    if (sessionEnded) return;
    if (window.App.allMastered(countryStats)) {
      maybeEndSessionIfMastered();
      return;
    }
    currentCountry = window.App.pickRandomCountry(countryStats);
    questionStartTime = performance.now();

    const c = countriesMap[currentCountry.iso];
    currentQuestionMode = (mode === 'both' && Math.random() < 0.5) ? 'capital-to-land' : (mode === 'both' ? 'land-to-capital' : mode);
    if (currentQuestionMode === 'land-to-capital') {
      questionEl.textContent = `Wat is de hoofdstad van ${c.name_nl}?`;
      answerEl.textContent = c.capitals_nl.join(', ');
    } else {
      questionEl.textContent = `Van welk land is de hoofdstad: ${c.capitals_nl.join(', ')}?`;
      answerEl.textContent = c.name_nl;
    }

    setControlsForQuestion();
    updateDeckStatus();
  }

  function handleAnswer(wasCorrect) {
    if (!currentCountry || sessionEnded) return;
    const dt = performance.now() - questionStartTime;
    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: 'capital',
      subType: currentQuestionMode || mode,
      wasCorrect,
      responseTimeMs: dt
    });
    updateSessionStatsUI();
    maybeEndSessionIfMastered();
    if (!sessionEnded) {
      showNextQuestion();
    }
  }

  btnShow.addEventListener('click', () => {
    answerEl.hidden = false;
    btnShow.disabled = true;
    btnCorrect.disabled = false;
    btnIncorrect.disabled = false;
  });

  btnCorrect.addEventListener('click', () => handleAnswer(true));
  btnIncorrect.addEventListener('click', () => handleAnswer(false));

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

    const titleBase = 'Hoofdsteden';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = 'Flashcards: beoordeel zelf of je antwoord goed was.';

    modeLabelEl.textContent =
      mode === 'both' ? 'Beide kanten' : (mode === 'land-to-capital' ? 'Land → Hoofdstad' : 'Hoofdstad → Land');

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'capital',
      subMode: mode
    });

    showNextQuestion();
    if (quizCard) quizCard.focus();
  } catch (err) {
    console.error(err);
    questionEl.textContent = 'Kon quiz niet starten. Controleer of je via een webserver laadt.';
    btnShow.disabled = true;
  }
});
