/**
 * Zoek-op-kaart quiz: je krijgt een landnaam en moet het land op de kaart vinden door erop te klikken.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');

  const mapContainerEl = document.getElementById('map-container');
  const deckStatusEl = document.getElementById('deck-status');
  const continentLabelEl = document.getElementById('continent-label');
  const titleEl = document.getElementById('quiz-title');
  const subtitleEl = document.getElementById('quiz-subtitle');
  const sessionStatusEl = document.getElementById('session-status');
  const mapQuizPromptEl = document.getElementById('map-quiz-prompt');
  const mapQuizAnswerEl = document.getElementById('map-quiz-answer');

  const statQuestionsEl = document.getElementById('stat-questions');
  const statAccuracyEl = document.getElementById('stat-accuracy');
  const statAvgTimeEl = document.getElementById('stat-avg-time');
  const statStreakEl = document.getElementById('stat-streak');

  const btnDownloadLog = document.getElementById('btn-download-log');

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
  let satelliteMapInitialized = false;

  function getIsoFromMapFeature(feature) {
    if (!feature || !feature.properties) return null;
    const iso = window.SatelliteMap && window.SatelliteMap.getIsoFromProperties
      ? window.SatelliteMap.getIsoFromProperties(feature.properties)
      : (feature.properties.iso_a3 || feature.properties.ISO_A3 || feature.properties.adm0_a3 || feature.properties.iso_a2);
    return iso ? window.App.normalizeCountryIso(String(iso).trim().toUpperCase()) : null;
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

  function showNextQuestion() {
    if (sessionEnded) return;
    if (window.App.allMastered(countryStats)) {
      maybeEndSessionIfMastered();
      return;
    }
    currentCountry = window.App.pickNextCountryNoRepeat(countryStats, askedThisRound);
    askedThisRound.add(currentCountry.iso);
    questionStartTime = performance.now();

    const c = countriesMap[currentCountry.iso];
    const landNaam = c ? c.name_nl : currentCountry.iso;
    mapQuizPromptEl.innerHTML = `Waar ligt <span class="map-quiz-land-name">${landNaam}</span>? Klik op de kaart.`;
    sessionStatusEl.textContent = 'Klik op het land op de kaart.';
    sessionStatusEl.className = 'status-label';

    // Geen highlight - gebruiker moet zelf zoeken
    if (window.SatelliteMap && satelliteMapInitialized) {
      window.SatelliteMap.highlightCountry(null);
      // Zoom naar regio zodat gebruiker kan zoeken
      const isContinentOrWorld = groupId === 'world' || groupId.startsWith('continent_');
      if (isContinentOrWorld) {
        window.SatelliteMap.fitToRegion(group.countries, {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom: 4,
          duration: 500
        });
      } else {
        window.SatelliteMap.fitToRegion(group.countries, {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom: 5,
          duration: 500
        });
      }
    }

    if (mapQuizAnswerEl) mapQuizAnswerEl.hidden = true;
    updateDeckStatus();
  }

  function handleMapClick(isoClicked) {
    if (!currentCountry || sessionEnded || !isoClicked) return;

    const dt = performance.now() - questionStartTime;
    const isCorrect = isoClicked === currentCountry.iso;

    window.App.recordQuestionResult({
      session,
      countryStats,
      iso: currentCountry.iso,
      quizType: 'map',
      subType: 'zoek',
      wasCorrect: isCorrect,
      responseTimeMs: dt
    });

    updateSessionStatsUI();

    const correctName = countriesMap[currentCountry.iso]?.name_nl || currentCountry.iso;

    if (isCorrect) {
      sessionStatusEl.textContent = `✓ Correct! Het was ${correctName}.`;
      sessionStatusEl.className = 'status-label ok';
      window.SatelliteMap.highlightCountry(currentCountry.iso);
    } else {
      const clickedName = countriesMap[isoClicked]?.name_nl || isoClicked;
      sessionStatusEl.textContent = `✗ Fout! Je klikte op ${clickedName}. Het juiste antwoord was ${correctName}.`;
      sessionStatusEl.className = 'status-label bad';
      window.SatelliteMap.highlightCountry(currentCountry.iso);
    }

    maybeEndSessionIfMastered();
    if (!sessionEnded) {
      setTimeout(() => {
        showNextQuestion();
      }, 1200);
    }
  }

  btnDownloadLog.addEventListener('click', () => {
    window.App.downloadHistoryAsJSON();
  });

  window.addEventListener('beforeunload', () => {
    if (!sessionEnded && session) {
      window.App.finalizeSession(session);
    }
    if (window.SatelliteMap) {
      window.SatelliteMap.destroy();
    }
  });

  try {
    group = await window.App.loadGroupById(groupId);
    countriesMap = await window.App.loadCountriesMap();

    const isContinentOrWorld = groupId === 'world' || groupId.startsWith('continent_');

    document.title = `Zoek op kaart – ${group.title}`;
    titleEl.textContent = `Zoek op kaart – ${group.title}`;
    subtitleEl.textContent = 'Krijg een landnaam en vind het op de kaart.';
    continentLabelEl.textContent = group.continent;

    countryStats = window.App.createInitialCountryStats(group.countries);
    session = window.App.startSession({
      groupId,
      quizType: 'map',
      subMode: 'zoek'
    });

    if (window.SatelliteMap) {
      await window.SatelliteMap.init('map-container', '../assets/maps/high_res_usa.json');
      satelliteMapInitialized = true;

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

    const map = window.SatelliteMap.getMap();
    if (map) {
      map.on('click', (e) => {
        if (sessionEnded || !currentCountry) return;
        const features = map.queryRenderedFeatures(e.point).filter(
          f => f.source === 'countries' && f.layer.id && f.layer.id.startsWith('countries')
        );
        if (features.length === 0) return;
        const feature = features[0];
        const iso = getIsoFromMapFeature(feature);
        if (!iso) return;
        handleMapClick(iso);
      });
      map.getCanvas().style.cursor = 'pointer';
    }

    // Zoom/pan shortcuts
    document.addEventListener('keydown', (e) => {
      if (sessionEnded) return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return;
      if (window.SatelliteMap && satelliteMapInitialized) {
        if ((e.key === '-' || e.key === 'q' || e.key === 'Q' || e.code === 'Minus' || e.code === 'KeyQ') && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          window.SatelliteMap.zoomOut();
        } else if ((e.key === '=' || e.key === '+' || e.key === 'w' || e.key === 'W' || e.code === 'Equal' || e.code === 'KeyW') && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          window.SatelliteMap.zoomIn();
        }
      }
    }, true);

    showNextQuestion();
  } catch (err) {
    console.error(err);
    sessionStatusEl.textContent = 'Kon zoek-op-kaart quiz niet starten. Controleer of je via een webserver laadt.';
    sessionStatusEl.className = 'status-label bad';
  }
});
