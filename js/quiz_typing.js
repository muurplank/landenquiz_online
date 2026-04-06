document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');
  const mode = window.App.getQueryParam('mode') || 'land-to-capital';
  const infiniteMode = window.App.getQueryParam('infinite') === '1';
  const category = window.App.getQueryParam('category') || '';

  const flagContainerEl = document.getElementById('flag-container');
  const questionEl = document.getElementById('question');
  const answerEl = document.getElementById('answer');
  const typingInput = document.getElementById('typing-input');
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

  const MAX_DISTANCE = 3;
  const WRONG_FEEDBACK_MS = 2200;

  const isFlagQuiz =
    category === 'flags' || mode === 'flag-to-land' || mode === 'land-to-flag';

  if (!groupId) {
    questionEl.textContent = 'Geen deel geselecteerd.';
    if (typingInput) typingInput.disabled = true;
    return;
  }

  let group;
  let countriesMap;
  let countryStats;
  let session;
  let currentCountry = null;
  let currentQuestionMode = null;
  let questionStartTime = null;
  let sessionEnded = false;
  const askedThisRound = new Set();
  const roundState = {};
  let wrongFeedbackTimer = null;
  let blockInputUntil = 0;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function normalizeForMatch(s) {
    return (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  /** Kleinste Levenshtein-afstand naar één van de doelstrings (genormaliseerd). */
  function minDistanceToAny(input, targets) {
    const n = normalizeForMatch(input);
    if (!n) return Infinity;
    let best = Infinity;
    for (let k = 0; k < targets.length; k++) {
      const tn = normalizeForMatch(targets[k]);
      if (!tn) continue;
      best = Math.min(best, levenshtein(n, tn));
    }
    return best;
  }

  function getAcceptedAnswerStrings() {
    const c = countriesMap[currentCountry.iso];
    if (!c) return [];
    if (isFlagQuiz) {
      if (currentQuestionMode === 'flag-to-land') {
        return [c.name_nl];
      }
      if (currentQuestionMode === 'land-to-flag') {
        return c.capitals_nl.slice();
      }
    }
    if (currentQuestionMode === 'land-to-capital') {
      return c.capitals_nl.slice();
    }
    return [c.name_nl];
  }

  function isCloseEnough(input) {
    return minDistanceToAny(input, getAcceptedAnswerStrings()) <= MAX_DISTANCE;
  }

  function updateDeckStatus() {
    const all = Object.values(countryStats);
    const mastered = all.filter(c => c.is_mastered).length;
    deckStatusEl.textContent = `Deck: ${mastered}/${all.length} mastered`;
  }

  function updateSessionStatsUI() {
    const t = session.totals;
    statQuestionsEl.textContent = t.questions;
    const statRoundsEl = document.getElementById('stat-rounds');
    if (statRoundsEl) statRoundsEl.textContent = t.rounds ?? 0;
    const acc = t.questions ? Math.round((t.correct / t.questions) * 100) : 0;
    statAccuracyEl.textContent = `${acc}%`;
    statAvgTimeEl.textContent = t.avgResponseTimeMs
      ? `${Math.round(t.avgResponseTimeMs)} ms`
      : '-';
    statStreakEl.textContent = `${t.streakEnd} (beste ${t.streakBest})`;
  }

  function setTypingEnabled(on) {
    if (!typingInput) return;
    typingInput.disabled = !on;
    typingInput.classList.toggle('quiz-typing-input--blocked', !on);
  }

  function clearWrongFeedbackTimer() {
    if (wrongFeedbackTimer) {
      clearTimeout(wrongFeedbackTimer);
      wrongFeedbackTimer = null;
    }
  }

  function setControlsForQuestion() {
    answerEl.hidden = true;
    sessionStatusEl.textContent = '';
    sessionStatusEl.className = 'status-label';
    if (typingInput) {
      typingInput.value = '';
      setTypingEnabled(!sessionEnded);
    }
  }

  function maybeEndSessionIfMastered() {
    if (mode === 'both' || mode === 'thompson' || infiniteMode) return;
    if (window.App.allMastered(countryStats)) {
      sessionEnded = true;
      window.App.finalizeSession(session);
      sessionStatusEl.textContent = 'Sessie voltooid: alle landen minstens 1x correct!';
      sessionStatusEl.className = 'status-label ok';
      setTypingEnabled(false);
    }
  }

  function renderFlag(iso) {
    flagContainerEl.innerHTML = '';
    const img = document.createElement('img');
    img.src = `../assets/flags/${window.App.getFlagFilename(iso)}`;
    img.alt = `Vlag ${iso}`;
    img.style.maxWidth = '240px';
    img.style.border = '1px solid #cbd5e0';
    img.style.borderRadius = '4px';
    img.style.display = 'block';
    img.style.backgroundColor = '#fff';
    flagContainerEl.appendChild(img);
  }

  function showNextQuestion() {
    clearWrongFeedbackTimer();
    blockInputUntil = 0;
    if (sessionEnded) return;
    if (mode !== 'both' && mode !== 'thompson' && !infiniteMode && window.App.allMastered(countryStats)) {
      maybeEndSessionIfMastered();
      return;
    }
    currentCountry = mode === 'thompson'
      ? window.App.pickNextCountryThompson(countryStats)
      : window.App.pickNextCountryNoRepeat(countryStats, askedThisRound, roundState);
    if (mode !== 'thompson') askedThisRound.add(currentCountry.iso);
    session.totals.rounds = mode === 'thompson' ? 0 : (roundState.roundsCompleted ?? 0);
    questionStartTime = performance.now();

    const c = countriesMap[currentCountry.iso];

    if (isFlagQuiz) {
      currentQuestionMode = (mode === 'both' && Math.random() < 0.5) ? 'land-to-flag'
        : (mode === 'both' ? 'flag-to-land'
        : (mode === 'thompson' ? (Math.random() < 0.5 ? 'flag-to-land' : 'land-to-flag')
        : mode));

      if (currentQuestionMode === 'flag-to-land') {
        flagContainerEl.style.display = '';
        renderFlag(c.iso);
        questionEl.textContent = 'Bij welk land hoort deze vlag? Typ de landnaam.';
        answerEl.textContent = c.name_nl;
      } else {
        flagContainerEl.innerHTML = '';
        flagContainerEl.style.display = 'none';
        questionEl.innerHTML = `Hoe ziet de vlag van <span class="quiz-question-given">${escapeHtml(c.name_nl)}</span> eruit? Typ de hoofdstad.`;
        answerEl.textContent = c.capitals_nl.join(', ');
      }
    } else {
      flagContainerEl.style.display = 'none';
      currentQuestionMode = (mode === 'both' && Math.random() < 0.5) ? 'capital-to-land'
        : (mode === 'both' ? 'land-to-capital'
        : (mode === 'thompson' ? (Math.random() < 0.5 ? 'land-to-capital' : 'capital-to-land')
        : mode));
      if (currentQuestionMode === 'land-to-capital') {
        questionEl.innerHTML = `Wat is de hoofdstad van<br><span class="quiz-question-given">${escapeHtml(c.name_nl)}</span>?`;
        answerEl.textContent = c.capitals_nl.join(', ');
      } else {
        questionEl.innerHTML = `Van welk land is de hoofdstad:<br><span class="quiz-question-given">${escapeHtml(c.capitals_nl.join(', '))}</span>?`;
        answerEl.textContent = c.name_nl;
      }
    }

    setControlsForQuestion();
    updateDeckStatus();
    if (typingInput && !sessionEnded) typingInput.focus();
  }

  function getQuizTypeForSession() {
    return isFlagQuiz ? 'flag' : 'capital';
  }

  function handleAnswer(wasCorrect) {
    if (!currentCountry || sessionEnded) return;
    const dt = performance.now() - questionStartTime;
    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: getQuizTypeForSession(),
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

  function showWrongFeedbackAndContinue() {
    if (!currentCountry || sessionEnded) return;
    const correctText = getAcceptedAnswerStrings().join(', ');
    answerEl.textContent = correctText;
    answerEl.hidden = false;
    sessionStatusEl.textContent = 'Fout — dit was het juiste antwoord.';
    sessionStatusEl.className = 'status-label bad';
    setTypingEnabled(false);
    blockInputUntil = performance.now() + WRONG_FEEDBACK_MS;

    clearWrongFeedbackTimer();
    wrongFeedbackTimer = setTimeout(() => {
      wrongFeedbackTimer = null;
      handleAnswer(false);
    }, WRONG_FEEDBACK_MS);
  }

  function onTypingKeydown(e) {
    if (e.key !== 'Enter') return;
    if (sessionEnded || !currentCountry) return;
    if (performance.now() < blockInputUntil) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (isCloseEnough(typingInput.value)) {
      handleAnswer(true);
    } else {
      showWrongFeedbackAndContinue();
    }
  }

  if (typingInput) {
    typingInput.addEventListener('keydown', onTypingKeydown);
  }

  if (btnDownloadLog) {
    btnDownloadLog.addEventListener('click', () => {
      window.App.downloadHistoryAsJSON();
    });
  }

  window.addEventListener('beforeunload', () => {
    if (!sessionEnded && session) {
      window.App.finalizeSession(session);
    }
  });

  try {
    group = await window.App.loadGroupById(groupId);
    countriesMap = await window.App.loadCountriesMap();

    const titleBase = 'Typ-quiz';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = 'Typ je antwoord en druk op Enter om te controleren. Bij maximaal 3 tikfouten telt het als goed; anders zie je het juiste antwoord en gaat de quiz verder.';

    if (isFlagQuiz) {
      modeLabelEl.textContent =
        mode === 'both' ? 'Beide kanten (typ)' :
        mode === 'thompson' ? 'Thompson Sampling (typ)' :
        (mode === 'flag-to-land' ? 'Vlag → Land (typ)' : 'Land → Vlag (typ)');
    } else {
      modeLabelEl.textContent =
        mode === 'both' ? 'Beide kanten (typ)' :
        mode === 'thompson' ? 'Thompson Sampling (typ)' :
        (mode === 'land-to-capital' ? 'Land → Hoofdstad (typ)' : 'Hoofdstad → Land (typ)');
    }

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: getQuizTypeForSession(),
      subMode: mode
    });

    showNextQuestion();
  } catch (err) {
    console.error(err);
    questionEl.textContent = 'Kon quiz niet starten. Controleer of je via een webserver laadt.';
    if (typingInput) typingInput.disabled = true;
  }
});
