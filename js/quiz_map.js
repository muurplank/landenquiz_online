document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');
  const mode = window.App.getQueryParam('mode') || '';
  const isSnelleMode = mode === 'snelle';

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
  const mapQuizAnswerEl = document.getElementById('map-quiz-answer');
  const mapQuizControlsEl = document.getElementById('map-quiz-controls');
  const btnShowAnswer = document.getElementById('btn-show-answer');
  const btnCorrect = document.getElementById('btn-correct');
  const btnIncorrect = document.getElementById('btn-incorrect');
  let countryButtonsSearch = null;

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
    if (isSnelleMode) return; // Snelle quiz is oneindig
    if (window.App.allMastered(countryStats)) {
      sessionEnded = true;
      window.App.finalizeSession(session);
      sessionStatusEl.textContent = 'Sessie voltooid: alle landen minstens 1x correct!';
      sessionStatusEl.className = 'status-label ok';
      if (mapQuizControlsEl) mapQuizControlsEl.style.display = 'none';
    }
  }

  function setControlsForQuestionSnelle() {
    if (mapQuizAnswerEl) mapQuizAnswerEl.hidden = true;
    if (btnShowAnswer) btnShowAnswer.disabled = false;
    if (btnCorrect) btnCorrect.disabled = false;
    if (btnIncorrect) btnIncorrect.disabled = false;
    sessionStatusEl.textContent = '';
  }

  function handleAnswerSnelle(wasCorrect) {
    if (!currentCountry || sessionEnded) return;
    const dt = performance.now() - questionStartTime;
    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: 'map',
      subType: 'snelle',
      wasCorrect,
      responseTimeMs: dt
    });
    updateSessionStatsUI();
    maybeEndSessionIfMastered();
    if (!sessionEnded) {
      showNextQuestion();
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
    if (window.App.allMastered(countryStats) && !isSnelleMode) {
      maybeEndSessionIfMastered();
      return;
    }
    currentCountry = window.App.pickNextCountryNoRepeat(countryStats, askedThisRound);
    askedThisRound.add(currentCountry.iso);
    questionStartTime = performance.now();
    
    // Gebruik satelliet kaart voor highlight + zoom en centreer op dit land
    setTargetOnMap(currentCountry.iso);
    if (window.SatelliteMap && satelliteMapInitialized) {
      window.SatelliteMap.fitToRegion([currentCountry.iso], {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        maxZoom: 4,
        duration: 500
      });
    }
    
    if (isSnelleMode) {
      setControlsForQuestionSnelle();
      sessionStatusEl.textContent = '';
    } else {
      sessionStatusEl.textContent = useTypeBox ? 'Typ de landnaam hieronder.' : 'Klik op de landnaam rechts.';
    }
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
      if (mapQuizTypeInput) mapQuizTypeInput.value = '';
      if (countryButtonsSearch) {
        countryButtonsSearch.value = '';
        countryButtonsSearch.dispatchEvent(new Event('input'));
      }
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
      if (countryButtonsSearch) {
        countryButtonsSearch.value = '';
        countryButtonsSearch.dispatchEvent(new Event('input'));
      }
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

    const titleBase = isSnelleMode ? 'Snelle quiz' : 'Kaart-quiz';
    document.title = `${titleBase} – ${group.title}`;
    titleEl.textContent = `${titleBase} – ${group.title}`;
    subtitleEl.textContent = isSnelleMode
      ? 'Herken het land, toon antwoord en geef aan of je het goed of fout had. Oneindige modus.'
      : 'Herken het wit gemarkeerde land op de satellietkaart.';
    continentLabelEl.textContent = group.continent;

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'map',
      subMode: isSnelleMode ? 'snelle' : 'satellite'
    });

    // Initialiseer satelliet kaart
    if (window.SatelliteMap) {
      const mapOptions = isSnelleMode ? { smallCountryColor: 'orange' } : {};
      await window.SatelliteMap.init('map-container', '../assets/maps/high_res_usa.json', mapOptions);
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

    useTypeBox = !isSnelleMode && isContinentOrWorld;
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

    if (isSnelleMode) {
      document.body.classList.add('snelle-quiz-mode');
      mapQuizControlsEl.style.display = 'flex';
      const countryListArticle = countryButtonsEl && countryButtonsEl.closest('article');
      if (countryListArticle) {
        const h2 = countryListArticle.querySelector('h2');
        const listWrap = countryListArticle.querySelector('.list-search-wrap');
        if (h2) h2.style.display = 'none';
        if (listWrap) listWrap.style.display = 'none';
        countryButtonsEl.style.display = 'none';
      }
      btnShowAnswer.addEventListener('click', () => {
        if (!currentCountry) return;
        const c = countriesMap[currentCountry.iso];
        mapQuizAnswerEl.textContent = c ? c.name_nl : currentCountry.iso;
        mapQuizAnswerEl.hidden = false;
        btnShowAnswer.disabled = true;
        btnCorrect.disabled = false;
        btnIncorrect.disabled = false;
      });
      btnCorrect.addEventListener('click', () => handleAnswerSnelle(true));
      btnIncorrect.addEventListener('click', () => handleAnswerSnelle(false));
      function handleSnelleKeydown(e) {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          if (btnShowAnswer && !btnShowAnswer.disabled) btnShowAnswer.click();
        } else if ((e.key === '1' || e.code === 'Digit1') && btnCorrect && !btnCorrect.disabled) {
          e.preventDefault();
          btnCorrect.click();
        } else if ((e.key === '2' || e.code === 'Digit2') && btnIncorrect && !btnIncorrect.disabled) {
          e.preventDefault();
          btnIncorrect.click();
        }
      }
      window.addEventListener('keydown', handleSnelleKeydown, true);
    } else {
      group.countries.forEach(iso => {
        const c = countriesMap[iso];
        if (!c) return;
        const btn = document.createElement('button');
        btn.textContent = c.name_nl;
        btn.dataset.iso = iso;
        btn.dataset.search = (c.name_nl || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
        btn.addEventListener('click', () => handleGuess(iso));
        countryButtonsEl.appendChild(btn);
      });
    }

    countryButtonsSearch = document.getElementById('country-buttons-search');
    if (countryButtonsSearch && !isSnelleMode) {
      countryButtonsSearch.addEventListener('input', () => {
        const q = (countryButtonsSearch.value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
        countryButtonsEl.querySelectorAll('button').forEach(btn => {
          const show = !q || (btn.dataset.search || '').includes(q);
          btn.style.display = show ? '' : 'none';
        });
      });
    }

    // Pijltje omhoog/omlaag: navigeer door landenlijst, Enter: selecteer highlighted item
    function getVisibleCountryButtons() {
      return Array.from(countryButtonsEl.querySelectorAll('button')).filter(btn => btn.style.display !== 'none');
    }

    document.addEventListener('keydown', (e) => {
      if (sessionEnded) return;

      const inInput = useTypeBox && mapQuizTypeInput && document.activeElement === mapQuizTypeInput;
      const inSearch = countryButtonsSearch && document.activeElement === countryButtonsSearch;
      if (!inInput && !inSearch && window.SatelliteMap && satelliteMapInitialized) {
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

      if (isSnelleMode || !countryButtonsEl) return;
      if (inInput) return;

      const visible = getVisibleCountryButtons();
      if (!visible.length) return;

      const active = document.activeElement;
      const inSearchBox = countryButtonsSearch && active === countryButtonsSearch;
      const currentIdx = visible.indexOf(active);
      let nextIdx = -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (inSearchBox) {
          visible[0].focus();
        } else {
          nextIdx = currentIdx < visible.length - 1 ? currentIdx + 1 : 0;
          visible[nextIdx].focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (inSearchBox) {
          visible[visible.length - 1].focus();
        } else {
          nextIdx = currentIdx <= 0 ? visible.length - 1 : currentIdx - 1;
          visible[nextIdx].focus();
        }
      } else if (e.key === 'Enter') {
        if (currentIdx >= 0 && active === visible[currentIdx]) {
          e.preventDefault();
          visible[currentIdx].click();
        }
      }
    }, true);

    showNextQuestion();
  } catch (err) {
    console.error(err);
    sessionStatusEl.textContent = 'Kon kaart-quiz niet starten. Controleer of je via een webserver laadt.';
    sessionStatusEl.className = 'status-label bad';
  }
});

