// "Typ ze allemaal" — Sporcle-stijl typquizzen (sporcle.html, root-pagina).
// Drie modi: alle landen typen, alle hoofdsteden typen, alle vlaggen herkennen.
// Puur additief: raakt geen bestaande bestanden; hergebruikt window.App als loader.
(function () {
  'use strict';

  const CONTINENT_TITLES = {
    'Europe': 'Europa',
    'Asia': 'Azië',
    'Africa': 'Afrika',
    'North America': 'Noord-Amerika',
    'South America': 'Zuid-Amerika',
    'Oceania': 'Oceanië'
  };
  const CONTINENT_ORDER = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'];
  const MODE_TITLES = {
    landen: '🌍 Alle landen',
    hoofdsteden: '🏛️ Alle hoofdsteden',
    vlaggen: '🚩 Alle vlaggen'
  };

  const $ = id => document.getElementById(id);

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
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  /**
   * Toegestane typefouten schaalt mee met de lengte van het antwoord:
   * korte namen exact (anders matcht "Iran" ook "Irak"), lange namen soepel.
   */
  function toleranceFor(len) {
    if (len <= 4) return 0;
    if (len <= 7) return 1;
    if (len <= 11) return 2;
    return 3;
  }

  /**
   * Zoek het best passende antwoord binnen zijn eigen tolerantie.
   * Alleen een uniek beste match telt: bij gelijkspel tussen twee landen
   * (bijv. een typefout precies tussen Zambia en Gambia in) gebeurt er niets.
   */
  function findMatch(norm) {
    if (!norm) return null;
    let best = null;
    let bestDist = Infinity;
    let tie = false;
    answerMap.forEach((iso, key) => {
      if (Math.abs(key.length - norm.length) > toleranceFor(key.length)) return;
      const d = levenshtein(norm, key);
      if (d < bestDist) {
        bestDist = d;
        best = { iso, key };
        tie = false;
      } else if (d === bestDist && best && iso !== best.iso) {
        tie = true;
      }
    });
    if (!best || tie) return null;
    if (bestDist > toleranceFor(best.key.length)) return null;
    return best.iso;
  }

  // ---------- Sterrenveld (zelfde look als exam.html) ----------

  function buildStars(wrap, count) {
    if (!wrap || wrap.childElementCount) return;
    for (let i = 0; i < count; i++) {
      const star = document.createElement('i');
      const size = 1.5 + Math.random() * 3;
      star.style.left = (Math.random() * 100) + '%';
      star.style.top = (Math.random() * 100) + '%';
      star.style.width = size + 'px';
      star.style.height = size + 'px';
      star.style.animationDelay = (Math.random() * 4) + 's';
      star.style.animationDuration = (2.2 + Math.random() * 3) + 's';
      wrap.appendChild(star);
    }
  }

  function spawnRandomStars(wrap) {
    if (!wrap) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const spawn = () => {
      if (wrap.offsetParent !== null) {
        const star = document.createElement('i');
        star.className = 'star-pop';
        const size = 2 + Math.random() * 3.5;
        star.style.left = (Math.random() * 100) + '%';
        star.style.top = (Math.random() * 100) + '%';
        star.style.width = size + 'px';
        star.style.height = size + 'px';
        star.style.animationDuration = (1.8 + Math.random() * 2.4) + 's';
        star.addEventListener('animationend', () => star.remove());
        wrap.appendChild(star);
      }
      setTimeout(spawn, 350 + Math.random() * 1400);
    };
    setTimeout(spawn, 600);
  }

  // ---------- State ----------

  let countries = [];
  let mode = null;
  let answerMap = new Map(); // genormaliseerd antwoord → iso
  let found = new Set();     // iso's die geraden zijn
  let ended = false;
  let timerId = null;
  let startedAt = null;

  // ---------- Wereldkaart die opvult (grijs) bij goede antwoorden ----------

  let mapInitPromise = null;
  let mapReady = false;

  function modeUsesMap() {
    return mode === 'landen' || mode === 'hoofdsteden';
  }

  function ensureMap() {
    if (!mapInitPromise) {
      mapInitPromise = (async () => {
        try {
          if (!window.SatelliteMap || typeof maplibregl === 'undefined') throw new Error('MapLibre niet beschikbaar');
          const m = await window.SatelliteMap.init('sporcle-map-container', 'assets/maps/high_res_usa.json');
          if (!m) throw new Error('Kaart-init mislukt');
          mapReady = true;
        } catch (e) {
          console.warn('Sporcle-kaart niet beschikbaar:', e);
          $('sporcle-map-wrap').hidden = true;
        }
      })();
    }
    return mapInitPromise;
  }

  async function syncMap() {
    if (!modeUsesMap()) return;
    await ensureMap();
    if (!mapReady) return;
    window.SatelliteMap.resize();
    window.SatelliteMap.setCompletedCountries(Array.from(found));
  }

  function showScreen(name) {
    $('screen-modes').hidden = name !== 'modes';
    $('screen-quiz').hidden = name !== 'quiz';
  }

  // ---------- Timer ----------

  function formatTimer(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function startTimer() {
    stopTimer();
    startedAt = Date.now();
    $('sporcle-timer').textContent = '0:00';
    timerId = setInterval(() => {
      $('sporcle-timer').textContent = formatTimer(Date.now() - startedAt);
    }, 1000);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  // ---------- Bord ----------

  function slotLabelFor(c) {
    return mode === 'hoofdsteden' ? c.capitals_nl.join(' / ') : c.name_nl;
  }

  function buildBoard() {
    const board = $('sporcle-board');
    board.innerHTML = '';

    if (mode === 'vlaggen') {
      const grid = document.createElement('ul');
      grid.className = 'flag-board';
      // Willekeurige volgorde, zoals bij Sporcle (volgorde hoeft niet reproduceerbaar)
      const shuffled = [...countries].sort(() => Math.random() - 0.5);
      shuffled.forEach(c => {
        const li = document.createElement('li');
        li.className = 'flag-cell';
        li.dataset.iso = c.iso;
        const img = document.createElement('img');
        img.src = 'assets/flags/' + window.App.getFlagFilename(c.iso);
        img.alt = 'Vlag';
        img.loading = 'lazy';
        const label = document.createElement('span');
        label.className = 'flag-label';
        label.textContent = '···';
        li.appendChild(img);
        li.appendChild(label);
        grid.appendChild(li);
      });
      board.appendChild(grid);
      return;
    }

    CONTINENT_ORDER.forEach(cont => {
      const list = countries
        .filter(c => c.continent === cont)
        .sort((a, b) => slotLabelFor(a).localeCompare(slotLabelFor(b), 'nl'));
      if (!list.length) return;
      const section = document.createElement('section');
      section.className = 'continent-block glass-panel';
      const h = document.createElement('h3');
      h.innerHTML = `${CONTINENT_TITLES[cont] || cont} <span class="continent-count" data-continent="${cont}">0/${list.length}</span>`;
      const ul = document.createElement('ul');
      ul.className = 'slot-grid';
      list.forEach(c => {
        const li = document.createElement('li');
        li.className = 'slot';
        li.dataset.iso = c.iso;
        li.textContent = '···';
        ul.appendChild(li);
      });
      section.appendChild(h);
      section.appendChild(ul);
      board.appendChild(section);
    });
  }

  function updateCounters() {
    $('sporcle-score').textContent = `${found.size}/${countries.length}`;
    if (mode !== 'vlaggen') {
      document.querySelectorAll('.continent-count').forEach(el => {
        const cont = el.dataset.continent;
        const list = countries.filter(c => c.continent === cont);
        const hit = list.filter(c => found.has(c.iso)).length;
        el.textContent = `${hit}/${list.length}`;
      });
    }
  }

  function revealCountry(iso, cssClass) {
    const c = countries.find(x => x.iso === iso);
    if (!c) return;
    if (mode === 'vlaggen') {
      const cell = document.querySelector(`.flag-cell[data-iso="${iso}"]`);
      if (cell) {
        cell.classList.add(cssClass);
        cell.querySelector('.flag-label').textContent = c.name_nl;
      }
    } else {
      const slot = document.querySelector(`.slot[data-iso="${iso}"]`);
      if (slot) {
        slot.classList.add(cssClass);
        slot.textContent = slotLabelFor(c);
      }
    }
  }

  // ---------- Quizverloop ----------

  function startQuiz(m) {
    mode = m;
    found = new Set();
    ended = false;

    answerMap = new Map();
    countries.forEach(c => {
      const keys = mode === 'hoofdsteden' ? c.capitals_nl : [c.name_nl];
      keys.forEach(k => answerMap.set(normalizeForMatch(k), c.iso));
    });

    $('sporcle-title').textContent = MODE_TITLES[mode];
    $('sporcle-result').hidden = true;
    $('btn-giveup').hidden = false;
    const input = $('sporcle-input');
    input.value = '';
    input.disabled = false;

    buildBoard();
    updateCounters();
    $('sporcle-map-wrap').hidden = !modeUsesMap();
    syncMap(); // reset/leeg de kaart en toon hem (async, niet blokkerend)
    showScreen('quiz');
    startTimer();
    input.focus();
  }

  function handleInput() {
    if (ended) return;
    const iso = findMatch(normalizeForMatch($('sporcle-input').value));
    if (!iso || found.has(iso)) return;
    found.add(iso);
    revealCountry(iso, 'found');
    $('sporcle-input').value = '';
    updateCounters();
    syncMap();
    if (found.size === countries.length) finishQuiz(true);
  }

  function finishQuiz(completed) {
    ended = true;
    stopTimer();
    $('sporcle-input').disabled = true;
    $('btn-giveup').hidden = true;
    countries.forEach(c => {
      if (!found.has(c.iso)) revealCountry(c.iso, 'missed');
    });
    const time = formatTimer(Date.now() - startedAt);
    $('sporcle-result-text').textContent = completed
      ? `🎉 Alle ${countries.length} goed in ${time}!`
      : `Je had er ${found.size} van de ${countries.length} in ${time}. De gemiste staan in het rood.`;
    $('sporcle-result').hidden = false;
  }

  // ---------- Init ----------

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      countries = await window.App.loadCountriesFromRoot();
    } catch (e) {
      document.body.innerHTML = '<p style="color:#0f172a;padding:2rem;font-family:sans-serif">Kon data niet laden. Start een lokale webserver (bijv. <code>python3 -m http.server</code>) en open deze pagina opnieuw.</p>';
      console.error(e);
      return;
    }

    document.querySelectorAll('.mode-count').forEach(el => { el.textContent = String(countries.length); });
    buildStars($('page-stars'), 80);
    spawnRandomStars($('page-stars'));

    document.querySelectorAll('.mode-card').forEach(btn => {
      btn.addEventListener('click', () => startQuiz(btn.dataset.mode));
    });
    $('sporcle-input').addEventListener('input', handleInput);
    $('btn-giveup').addEventListener('click', () => { if (!ended) finishQuiz(false); });
    $('btn-again').addEventListener('click', () => startQuiz(mode));
    $('btn-back-modes').addEventListener('click', () => {
      stopTimer();
      ended = true;
      showScreen('modes');
    });

    const urlMode = window.App.getQueryParam('mode');
    if (urlMode && MODE_TITLES[urlMode]) startQuiz(urlMode);
    else showScreen('modes');
  });
})();
