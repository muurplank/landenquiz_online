document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');
  const mode = window.App.getQueryParam('mode') || 'flag-to-land';

  const flagContainerEl = document.getElementById('flag-container');
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
  let currentQuestionMode = null; // bij mode 'both': 'flag-to-land' of 'land-to-flag'
  let questionStartTime = null;
  let sessionEnded = false;
  const askedThisRound = new Set(); // eerst alle landen één keer, daarna ronde opnieuw

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
    btnCorrect.disabled = false;
    btnIncorrect.disabled = false;
    sessionStatusEl.textContent = '';
  }

  function maybeEndSessionIfMastered() {
    if (mode === 'both') return; // Beide kanten: oneindig doorgaan
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
    if (sessionEnded) return;
    if (mode !== 'both' && window.App.allMastered(countryStats)) {
      maybeEndSessionIfMastered();
      return;
    }
    currentCountry = window.App.pickNextCountryNoRepeat(countryStats, askedThisRound);
    askedThisRound.add(currentCountry.iso);
    questionStartTime = performance.now();

    const c = countriesMap[currentCountry.iso];
    currentQuestionMode = (mode === 'both' && Math.random() < 0.5) ? 'land-to-flag' : (mode === 'both' ? 'flag-to-land' : mode);

    if (currentQuestionMode === 'flag-to-land') {
      renderFlag(c.iso);
      questionEl.textContent = 'Bij welke land hoort deze vlag?';
      answerEl.textContent = c.name_nl;
    } else {
      flagContainerEl.innerHTML = '';
      questionEl.textContent = `Hoe ziet de vlag van ${c.name_nl} eruit?`;
      const preview = document.createElement('div');
      preview.className = 'small';
      preview.textContent = '(De vlag wordt zichtbaar bij het antwoord.)';
      flagContainerEl.appendChild(preview);

      const img = document.createElement('img');
      img.src = `../assets/flags/${window.App.getFlagFilename(c.iso)}`;
      img.alt = `Vlag ${c.name_nl}`;
      img.style.maxWidth = '240px';
      img.style.border = '1px solid #cbd5e0';
      img.style.borderRadius = '4px';
      img.style.display = 'block';
      img.style.backgroundColor = '#fff';

      // toon vlag pas bij antwoord
      answerEl.innerHTML = '';
      answerEl.appendChild(img);
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
      quizType: 'flag',
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

    // In modus vlag → land kan er een los tekstantwoord staan.
    if (mode === 'flag-to-land') {
      // niets extra’s nodig, tekst staat er al.
    }
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

    const titleBase = 'Vlaggen';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = 'Vlag-flashcards: beoordeel zelf of je antwoord goed was.';

    modeLabelEl.textContent =
      mode === 'both' ? 'Beide kanten' : (mode === 'flag-to-land' ? 'Vlag → Land' : 'Land → Vlag');

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'flag',
      subMode: mode
    });

    const cheatsheetTableWrap = document.getElementById('vlaggen-cheatsheet-table-wrap');
    const cheatsheetContent = document.getElementById('vlaggen-cheatsheet-content');
    const cheatsheetToggle = document.getElementById('vlaggen-cheatsheet-toggle');
    const CHEATSHEET_STORAGE_KEY = 'landjes_vlaggen_cheatsheet_collapsed';

    function getCheatsheetCollapsedState() {
      try {
        const raw = localStorage.getItem(CHEATSHEET_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (_) {
        return {};
      }
    }

    function setCheatsheetCollapsedForGroup(gid, collapsed) {
      const state = getCheatsheetCollapsedState();
      state[gid] = collapsed;
      try {
        localStorage.setItem(CHEATSHEET_STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
    }

    if (cheatsheetTableWrap) {
      const table = document.createElement('table');
      const countries = group.countries.filter(iso => countriesMap[iso]);
      const COLUMNS = countries.length > 16 ? 8 : 4;
      table.className = 'flags-cheatsheet-table';
      table.setAttribute('role', 'table');
      table.dataset.columns = String(COLUMNS);
      const tbody = document.createElement('tbody');
      for (let i = 0; i < countries.length; i += COLUMNS) {
        const tr = document.createElement('tr');
        for (let j = 0; j < COLUMNS; j++) {
          const iso = countries[i + j];
          const td = document.createElement('td');
          if (iso) {
            const c = countriesMap[iso];
            td.dataset.search = (c.name_nl || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
            const cellInner = document.createElement('div');
            cellInner.className = 'flags-cheatsheet-cell';
            const img = document.createElement('img');
            img.src = `../assets/flags/${window.App.getFlagFilename(iso)}`;
            img.alt = '';
            img.className = 'flags-cheatsheet-flag';
            cellInner.appendChild(img);
            const name = document.createElement('span');
            name.className = 'flags-cheatsheet-name';
            name.textContent = c.name_nl;
            cellInner.appendChild(name);
            td.appendChild(cellInner);
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      cheatsheetTableWrap.appendChild(table);

      const cheatsheetSearch = document.getElementById('vlaggen-cheatsheet-search');
      if (cheatsheetSearch) {
        cheatsheetSearch.addEventListener('input', () => {
          const q = (cheatsheetSearch.value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
          tbody.querySelectorAll('td').forEach(td => {
            const search = td.dataset.search;
            const show = !search || !q || search.includes(q);
            td.style.display = show ? '' : 'none';
          });
        });
      }
    }

    const cheatsheetSection = document.querySelector('.vlaggen-cheatsheet-section');
    const savedCheatsheetCollapsed = getCheatsheetCollapsedState()[group.id] === true;
    document.documentElement.classList.remove('vlaggen-cheatsheet-collapsed-init');
    if (cheatsheetContent) {
      if (savedCheatsheetCollapsed) {
        cheatsheetContent.classList.add('collapsed');
        if (cheatsheetSection) cheatsheetSection.classList.add('cheatsheet-collapsed');
        if (cheatsheetToggle) cheatsheetToggle.setAttribute('aria-expanded', 'false');
      } else {
        cheatsheetContent.classList.remove('collapsed');
        if (cheatsheetSection) cheatsheetSection.classList.remove('cheatsheet-collapsed');
        if (cheatsheetToggle) cheatsheetToggle.setAttribute('aria-expanded', 'true');
      }
    }

    if (cheatsheetToggle && cheatsheetContent) {
      cheatsheetToggle.addEventListener('click', () => {
        const isCollapsed = cheatsheetContent.classList.toggle('collapsed');
        if (cheatsheetSection) cheatsheetSection.classList.toggle('cheatsheet-collapsed', isCollapsed);
        setCheatsheetCollapsedForGroup(group.id, isCollapsed);
        if (cheatsheetToggle) cheatsheetToggle.setAttribute('aria-expanded', String(!isCollapsed));
      });
    }

    showNextQuestion();
    if (quizCard) quizCard.focus();
  } catch (err) {
    console.error(err);
    questionEl.textContent = 'Kon quiz niet starten. Controleer of je via een webserver laadt.';
    btnShow.disabled = true;
  }
});

