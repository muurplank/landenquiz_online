// Het Grote Eindexamen — standalone examenlogica voor exam.html (root-pagina).
// Puur additief: raakt geen bestaande quiz-bestanden; hergebruikt window.App en window.SatelliteMap.
(function () {
  'use strict';

  const STATE_KEY = 'landjes_exam_state_v1';
  const INTRO_KEY = 'landjes_exam_intro_seen';
  const FEEDBACK_KEY = 'landjes_exam_show_feedback';
  const MAX_DISTANCE = 3;
  const CORRECT_FEEDBACK_MS = 500;
  const WRONG_FEEDBACK_MS = 1500;
  const NEUTRAL_FEEDBACK_MS = 400;

  const CONTINENT_TITLES = {
    'South America': 'Zuid-Amerika',
    'North America': 'Noord-Amerika',
    'Europe': 'Europa',
    'Oceania': 'Oceanië',
    'Africa': 'Afrika',
    'Asia': 'Azië'
  };
  const TYPE_LABELS = { capital: 'Hoofdstad', flag: 'Vlag', map: 'Kaart' };

  // ---------- Seeded RNG (xmur3 string-hash + mulberry32) ----------

  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRng(seedString) {
    const seedFn = xmur3(String(seedString));
    return mulberry32(seedFn());
  }

  function seededShuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Vaste namenlijst als seeds: leuker om te delen ("speel het thijs-examen").
  // De randomizer geeft eerst de primaire namen (in willekeurige volgorde),
  // daarna pas de overige; daarna begint de cyclus opnieuw.
  const SEED_NAMES_PRIMARY = ['Demetrius', 'Terrance', 'DeShawn', 'Marquis', 'DeAndre'];
  const SEED_NAMES_SECONDARY = ['Tyrone', 'Malik', 'Darnell', 'Tarik', 'LebBron'];
  let seedQueue = [];

  function shuffleRandom(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randomSeed() {
    // Mag Math.random gebruiken: dit kiest alleen een seed vóór het examen.
    if (!seedQueue.length) {
      seedQueue = [...shuffleRandom(SEED_NAMES_PRIMARY), ...shuffleRandom(SEED_NAMES_SECONDARY)];
    }
    return seedQueue.shift();
  }

  // ---------- Levenshtein (zelfde aanpak als quiz_typing.js) ----------

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

  // ---------- Vraaggenerator (volledig deterministisch per seed) ----------

  /**
   * Bouwt de volledige vragenlijst voor een seed. Zelfde seed + zelfde dataset
   * = exact hetzelfde examen (volgorde én vlag-distractors).
   * Per land: 1 hoofdstadvraag (typen), 1 vlagvraag (4 opties), 1 kaartvraag (typen).
   */
  function buildExam(countries, seed) {
    // Test-seed: alleen de hoofdstadvraag van Sri Lanka (o.a. om de disco te testen)
    if (String(seed).trim().toLowerCase() === 'sri lanka') {
      return Array.from({ length: 10 }, () => ({ type: 'capital', iso: 'LKA' }));
    }
    const rng = createRng(seed);
    const sorted = [...countries].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
    const byContinent = {};
    sorted.forEach(c => {
      if (!byContinent[c.continent]) byContinent[c.continent] = [];
      byContinent[c.continent].push(c);
    });

    const questions = [];
    sorted.forEach(c => {
      questions.push({ type: 'capital', iso: c.iso });

      const pool = byContinent[c.continent].filter(x => x.iso !== c.iso);
      const poolCopy = [...pool];
      const distractors = [];
      for (let i = 0; i < 3 && poolCopy.length > 0; i++) {
        const idx = Math.floor(rng() * poolCopy.length);
        distractors.push(poolCopy.splice(idx, 1)[0].iso);
      }
      // Aanvullen buiten het continent als daar te weinig landen zijn (kan alleen
      // bij kleine sets zoals ?debug=1; met 196 landen nooit)
      if (distractors.length < 3) {
        const rest = sorted.filter(x => x.iso !== c.iso && !distractors.includes(x.iso));
        while (distractors.length < 3 && rest.length > 0) {
          const idx = Math.floor(rng() * rest.length);
          distractors.push(rest.splice(idx, 1)[0].iso);
        }
      }
      const options = seededShuffle([c.iso, ...distractors], rng);
      questions.push({ type: 'flag', iso: c.iso, options });

      questions.push({ type: 'map', iso: c.iso });
    });

    const shuffled = seededShuffle(questions, rng);
    // Eén deterministische pass: directe herhaling van hetzelfde land wegswappen.
    for (let i = 1; i < shuffled.length; i++) {
      if (shuffled[i].iso === shuffled[i - 1].iso && i + 2 < shuffled.length) {
        const t = shuffled[i];
        shuffled[i] = shuffled[i + 2];
        shuffled[i + 2] = t;
      }
    }
    return shuffled;
  }

  function examTotal() {
    return activeCountries().length * 3;
  }

  function examChecksum(questions) {
    return questions.length ? `${questions[0].iso}-${questions[0].type}` : 'leeg';
  }

  // ---------- State / persistentie ----------

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !parsed.seed || !Array.isArray(parsed.results)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Kon examenstatus niet opslaan:', e);
    }
  }

  function clearState() {
    try {
      localStorage.removeItem(STATE_KEY);
    } catch (_) {}
  }

  // ---------- Globale runtime ----------

  let countries = [];
  let countriesMap = {};
  let questions = [];
  let state = null; // { version, seed, createdAt, currentIndex, results, checksum, total, finished }
  let questionStartTime = null;
  let inputLocked = false;
  let questionToken = 0;

  let mapInitPromise = null;
  let mapMode = null; // 'satellite' | 'svg' | 'none'
  let worldGeo = null;

  // Toon goed/fout na elk antwoord? Uit = echte examenstand (resultaat pas aan het eind).
  let showAnswerFeedback = true;

  function loadFeedbackPref() {
    try { showAnswerFeedback = localStorage.getItem(FEEDBACK_KEY) !== '0'; } catch (_) {}
  }

  function saveFeedbackPref() {
    try { localStorage.setItem(FEEDBACK_KEY, showAnswerFeedback ? '1' : '0'); } catch (_) {}
  }

  function updateFeedbackToggleUi() {
    const btn = $('btn-feedback-toggle');
    if (!btn) return;
    btn.textContent = showAnswerFeedback ? '👁 Goed/fout: aan' : '🙈 Goed/fout: uit';
    btn.classList.toggle('is-off', !showAnswerFeedback);
  }

  // ---------- Aardbol-textuur (gedeeld door intro-globe en header-globe) ----------

  const NASA_TILE = (z, y, x) =>
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;

  let globeTexturePromise = null;

  function loadImage(src, crossOrigin) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Kan afbeelding niet laden: ' + src));
      img.src = src;
    });
  }

  // Breedtegraad-bereik van de bijgesneden textuur (Web Mercator blaast de polen
  // extreem op — Antarctica beslaat bijna een kwart van de tegel)
  function mercY(latDeg) {
    return Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI / 180) / 2));
  }
  const GLOBE_LAT_TOP = 75;   // °N
  const GLOBE_LAT_BOT = -63;  // °S
  const MERC_TOP = mercY(GLOBE_LAT_TOP);
  const MERC_BOT = mercY(GLOBE_LAT_BOT);
  const MERC_FULL = Math.PI; // volledige Web Mercator-tegel loopt tot ±85.05° = ±π

  /** Snijd een volledige mercator-wereldtextuur bij tot 75°N t/m 63°S. */
  function cropWorldTexture(source, size) {
    const top = Math.round(size * (0.5 - MERC_TOP / (2 * Math.PI)));
    const bottom = Math.round(size * (0.5 - MERC_BOT / (2 * Math.PI)));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = bottom - top;
    canvas.getContext('2d').drawImage(source, 0, top, size, bottom - top, 0, 0, size, bottom - top);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // 2×2 NASA-tiles stitchen tot één scherpe wereldtextuur (zelfde foto als de kaartvragen)
  function stitchedNasaTexture() {
    return Promise.all([
      loadImage(NASA_TILE(1, 0, 0), true),
      loadImage(NASA_TILE(1, 0, 1), true),
      loadImage(NASA_TILE(1, 1, 0), true),
      loadImage(NASA_TILE(1, 1, 1), true)
    ]).then(tiles => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const c = canvas.getContext('2d');
      c.drawImage(tiles[0], 0, 0);
      c.drawImage(tiles[1], 256, 0);
      c.drawImage(tiles[2], 0, 256);
      c.drawImage(tiles[3], 256, 256);
      return { url: cropWorldTexture(canvas, 512), yTop: MERC_TOP, yBot: MERC_BOT };
    });
  }

  function singleNasaTexture() {
    // Eerst met CORS zodat we kunnen bijsnijden; lukt dat niet, dan de tegel onbijgesneden
    return loadImage(NASA_TILE(0, 0, 0), true)
      .then(img => {
        try {
          return { url: cropWorldTexture(img, 256), yTop: MERC_TOP, yBot: MERC_BOT };
        } catch (_) {
          return { url: NASA_TILE(0, 0, 0), yTop: MERC_FULL, yBot: -MERC_FULL };
        }
      })
      .catch(() => loadImage(NASA_TILE(0, 0, 0))
        .then(() => ({ url: NASA_TILE(0, 0, 0), yTop: MERC_FULL, yBot: -MERC_FULL })));
  }

  function svgWorldTexture() {
    return window.App.loadJSON('assets/maps/custom_world.json').then(geo => {
      let svg = window.App.buildWorldMapEmpty(geo);
      if (!svg) throw new Error('Geen SVG');
      svg = svg
        // xmlns is verplicht voor een standalone SVG-afbeelding (data-URI)
        .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
        .replace('preserveAspectRatio="xMidYMid meet"', 'preserveAspectRatio="none"')
        .replace(/#2563eb/g, '#0d2f6e')
        .replace(/#16a34a/g, '#2ec27e')
        .replace(/#14532d/g, '#0b6b4a');
      return {
        url: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
        yTop: MERC_FULL,
        yBot: -MERC_FULL
      };
    });
  }

  /** Fallback-keten: NASA-foto gestitcht → losse wereldtegel → vector-kaart → null (emoji blijft). */
  function getGlobeTexture() {
    if (!globeTexturePromise) {
      globeTexturePromise = stitchedNasaTexture()
        .catch(() => singleNasaTexture())
        .catch(() => svgWorldTexture())
        .catch(() => null);
    }
    return globeTexturePromise;
  }

  /**
   * Verticale voorbewerking voor de bol-weergave: zet mercator-rijen om naar
   * orthografische projectie (schermhoogte = sin(breedtegraad)), zodat de
   * kaart verticaal bolt. Eén keer per textuur.
   */
  function buildSphereRows(img, yTop, yBot) {
    const H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = H;
    const c = canvas.getContext('2d');
    const latTop = GLOBE_LAT_TOP * Math.PI / 180;
    const latBot = GLOBE_LAT_BOT * Math.PI / 180;
    for (let j = 0; j < H; j++) {
      const v = 1 - (2 * (j + 0.5)) / H; // +1 (boven) … −1 (onder)
      let theta = Math.asin(Math.max(-1, Math.min(1, v)));
      theta = Math.max(latBot, Math.min(latTop, theta));
      const yM = Math.log(Math.tan(Math.PI / 4 + theta / 2));
      const s = (yTop - yM) / (yTop - yBot);
      const sy = Math.max(0, Math.min(img.height - 1, s * img.height));
      c.drawImage(img, 0, sy, img.width, 1, 0, j, img.width, 1);
    }
    return canvas;
  }

  // Actieve bollen; één rAF-loop tekent ze allemaal
  const activeGlobes = [];
  let globeLoopRunning = false;
  const GLOBE_ROTATION_MS = 16000;

  function drawGlobeFrame(g, rot) {
    if (!g.size) {
      const cssSize = g.wrap.clientWidth;
      if (!cssSize) return; // nog verborgen; volgende frame opnieuw proberen
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      g.size = Math.max(2, Math.round(cssSize * dpr));
      g.canvas.width = g.size;
      g.canvas.height = g.size;
    }
    const { ctx, size, src } = g;
    const srcW = src.width;
    ctx.clearRect(0, 0, size, size);
    // Horizontale bol-warp: schermkolom → lengtegraad via asin, zodat de
    // randen samendrukken en het midden uitvergroot — geen vlakke slide meer.
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const lam = Math.asin(Math.max(-1, Math.min(1, u)));
      let fx = rot + lam / (2 * Math.PI);
      fx = ((fx % 1) + 1) % 1;
      ctx.drawImage(src, Math.min(srcW - 1, fx * srcW), 0, 1, src.height, i, 0, 1, size);
    }
  }

  function startGlobeLoop() {
    if (globeLoopRunning) return;
    globeLoopRunning = true;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = now => {
      const rot = (now % GLOBE_ROTATION_MS) / GLOBE_ROTATION_MS;
      activeGlobes.forEach(g => drawGlobeFrame(g, rot));
      if (!reduced) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function initGlobe(rootEl) {
    if (!rootEl) return;
    const wrap = rootEl.querySelector('.globe-tex');
    if (!wrap || wrap.dataset.globeInit) return;
    wrap.dataset.globeInit = '1';
    getGlobeTexture().then(tex => {
      if (!tex) return; // emoji-fallback blijft staan
      loadImage(tex.url).then(img => {
        const src = buildSphereRows(img, tex.yTop, tex.yBot);
        const canvas = document.createElement('canvas');
        canvas.className = 'globe-canvas';
        wrap.appendChild(canvas);
        activeGlobes.push({ wrap, canvas, ctx: canvas.getContext('2d'), src, size: 0 });
        rootEl.classList.add('textured');
        startGlobeLoop();
      }).catch(() => {});
    });
  }

  const $ = id => document.getElementById(id);

  function isDebug() {
    return window.App.getQueryParam('debug') === '1';
  }

  function activeCountries() {
    if (!isDebug()) return countries;
    return [...countries].sort((a, b) => (a.iso < b.iso ? -1 : 1)).slice(0, 3);
  }

  // ---------- Schermen ----------

  function showScreen(name) {
    ['start', 'exam', 'result'].forEach(n => {
      const el = $('screen-' + n);
      if (el) el.hidden = n !== name;
    });
  }

  // ---------- Intro-animatie ----------

  function buildMarquee(rowEl, isoList) {
    const makeSet = () => {
      const frag = document.createDocumentFragment();
      isoList.forEach(iso => {
        const img = document.createElement('img');
        img.src = 'assets/flags/' + window.App.getFlagFilename(iso);
        img.alt = '';
        img.loading = 'eager';
        frag.appendChild(img);
      });
      return frag;
    };
    const inner = document.createElement('div');
    inner.className = 'intro-marquee-inner';
    inner.appendChild(makeSet());
    inner.appendChild(makeSet()); // duplicaat voor naadloze loop
    rowEl.appendChild(inner);
  }

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

  function buildIntroStars(overlay) {
    buildStars(overlay.querySelector('.intro-stars'), 70);
  }

  /**
   * Laat af en toe een extra ster op een willekeurige plek verschijnen;
   * die twinkelt kort en ruimt zichzelf op. Geeft een stopfunctie terug.
   */
  function spawnRandomStars(wrap) {
    if (!wrap) return () => {};
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return () => {};
    let timer = null;
    const spawn = () => {
      if (wrap.offsetParent !== null) { // alleen als de laag zichtbaar is
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
      timer = setTimeout(spawn, 350 + Math.random() * 1400);
    };
    timer = setTimeout(spawn, 600);
    return () => clearTimeout(timer);
  }

  function buildIntroTitleLetters(overlay) {
    const lines = overlay.querySelectorAll('.intro-line');
    let letterIndex = 0;
    let totalLetters = 0;
    lines.forEach(line => { totalLetters += (line.dataset.text || '').length; });
    lines.forEach(line => {
      if (line.childElementCount) return;
      const text = line.dataset.text || '';
      [...text].forEach(ch => {
        const span = document.createElement('span');
        span.className = 'intro-ltr';
        span.textContent = ch === ' ' ? ' ' : ch;
        span.style.animationDelay = (1.3 + letterIndex * 0.055) + 's';
        // Doorlopende gradient over alle letters heen
        const pos = totalLetters > 1 ? (letterIndex / (totalLetters - 1)) * 100 : 0;
        span.style.backgroundPosition = pos + '% 0';
        line.appendChild(span);
        letterIndex++;
      });
    });
  }

  function playIntro(onDone) {
    const overlay = $('intro');
    if (!overlay) { onDone(); return; }

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { finishIntro(); return; }

    // Vlaggen voor de marquees (selectie hoeft niet deterministisch: puur decor)
    const isoList = countries.map(c => c.iso);
    const pick = n => {
      const copy = [...isoList];
      const out = [];
      while (out.length < n && copy.length) {
        out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
      }
      return out;
    };
    const rowA = overlay.querySelector('.intro-marquee.row-a');
    const rowB = overlay.querySelector('.intro-marquee.row-b');
    if (rowA && !rowA.childElementCount) buildMarquee(rowA, pick(22));
    if (rowB && !rowB.childElementCount) buildMarquee(rowB, pick(22));
    buildIntroStars(overlay);
    const stopStarSpawner = spawnRandomStars(overlay.querySelector('.intro-stars'));
    buildIntroTitleLetters(overlay);

    overlay.hidden = false;
    overlay.classList.add('playing');

    // Draaiende aardbol met dezelfde NASA Blue Marble-foto als de kaartvragen
    initGlobe($('intro-globe'));

    // Count-up naar het totaal
    const countEl = $('intro-count');
    const total = examTotal();
    const countStart = 3300;
    const countDur = 1600;
    let rafId = null;
    const t0 = performance.now();
    function tick(now) {
      const el = now - t0;
      if (el >= countStart) {
        const p = Math.min(1, (el - countStart) / countDur);
        const eased = 1 - Math.pow(1 - p, 3);
        if (countEl) countEl.textContent = String(Math.round(eased * total));
      }
      if (el < countStart + countDur) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    let done = false;
    const timer = setTimeout(finishIntro, 7600);

    function finishIntro() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stopStarSpawner();
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', onKey);
      try { localStorage.setItem(INTRO_KEY, '1'); } catch (_) {}
      overlay.classList.add('leaving');
      setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.remove('playing', 'leaving');
        onDone();
      }, 600);
    }

    function onKey(e) {
      if (e.key === 'Escape') finishIntro();
    }
    document.addEventListener('keydown', onKey);
    const skipBtn = $('intro-skip');
    if (skipBtn) skipBtn.onclick = finishIntro;
  }

  function maybePlayIntro(onDone) {
    let seen = false;
    try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch (_) {}
    if (seen) {
      const overlay = $('intro');
      if (overlay) overlay.hidden = true;
      onDone();
    } else {
      playIntro(onDone);
    }
  }

  // ---------- Startscherm ----------

  function updateResumePanel() {
    const panel = $('resume-panel');
    if (!panel) return;
    const s = loadState();
    if (s && !s.finished && s.results.length > 0) {
      const correct = s.results.reduce((acc, r) => acc + (r[0] ? 1 : 0), 0);
      const pct = Math.round((correct / s.results.length) * 100);
      $('resume-info').textContent = `${s.results.length}/${s.total} vragen · ${pct}% goed · seed ${s.seed}`;
      panel.hidden = false;
    } else {
      panel.hidden = true;
    }
  }

  function showStartScreen() {
    discoOff();
    showScreen('start');
    $('start-total').textContent = String(examTotal());
    $('start-countries').textContent = String(activeCountries().length);
    const input = $('seed-input');
    if (!input.value) {
      const urlSeed = window.App.getQueryParam('seed');
      input.value = (urlSeed && urlSeed.trim()) ? urlSeed.trim() : randomSeed();
    }
    updateResumePanel();
  }

  function currentSeedFromInput() {
    const input = $('seed-input');
    let v = (input.value || '').trim();
    if (!v) {
      v = randomSeed();
      input.value = v;
    }
    return v;
  }

  // ---------- Examenloop ----------

  function startExam(seed, resumeState) {
    questions = buildExam(activeCountries(), seed);
    if (resumeState) {
      state = resumeState;
      if (state.checksum !== examChecksum(questions) || state.total !== questions.length ||
          state.results.length !== state.currentIndex) {
        alert('De opgeslagen voortgang past niet meer bij de huidige landenlijst. Het examen wordt opnieuw gestart.');
        state = null;
      }
    }
    if (!state) {
      state = {
        version: 1,
        seed,
        createdAt: new Date().toISOString(),
        currentIndex: 0,
        results: [],
        checksum: examChecksum(questions),
        total: questions.length,
        finished: false
      };
      saveState(state);
    }

    // Warm de kaart alvast op (niet blokkerend)
    ensureMapReady();

    $('exam-seed').textContent = state.seed;
    $('exam-total').textContent = String(state.total);
    initGlobe($('exam-globe'));
    showScreen('exam');
    renderQuestion();
  }

  function updateExamHeader() {
    const answered = state.results.length;
    const correct = state.results.reduce((acc, r) => acc + (r[0] ? 1 : 0), 0);
    let streak = 0;
    for (let i = state.results.length - 1; i >= 0; i--) {
      if (state.results[i][0]) streak++;
      else break;
    }
    $('exam-qnum').textContent = String(Math.min(answered + 1, state.total));
    if (showAnswerFeedback) {
      $('exam-score').textContent = answered ? `${correct}/${answered} goed` : '—';
      $('exam-streak').textContent = streak > 1 ? `🔥 ${streak}` : '';
    } else {
      // Score verklapt goed/fout; verbergen in examenstand
      $('exam-score').textContent = answered ? `${answered} beantwoord` : '—';
      $('exam-streak').textContent = '';
    }
    $('exam-progress-fill').style.width = `${(answered / state.total) * 100}%`;
  }

  function hideAllQuestionUi() {
    $('q-flag-grid').hidden = true;
    $('q-flag-grid').innerHTML = '';
    $('q-input-wrap').hidden = true;
    $('map-wrap').hidden = true;
    $('q-feedback').className = 'q-feedback';
    $('q-feedback').innerHTML = '';
    $('q-input').value = '';
  }

  function renderQuestion() {
    if (state.currentIndex >= state.total) {
      finishExam();
      return;
    }
    inputLocked = false;
    questionToken++;
    updateExamHeader();
    hideAllQuestionUi();

    const q = questions[state.currentIndex];
    if (q.type === 'capital' && q.iso === 'LKA') discoOn();
    else discoOff();
    const c = countriesMap[q.iso];
    const badge = $('q-type-badge');
    badge.textContent = TYPE_LABELS[q.type];
    badge.dataset.type = q.type;

    if (q.type === 'capital') {
      $('q-prompt').textContent = `Wat is de hoofdstad van ${c.name_nl}?`;
      $('q-input-wrap').hidden = false;
      $('q-input').placeholder = 'Typ de hoofdstad…';
      $('q-input').focus();
    } else if (q.type === 'flag') {
      $('q-prompt').textContent = `Welke vlag hoort bij ${c.name_nl}?`;
      renderFlagOptions(q);
    } else {
      renderMapQuestion(q);
    }
    questionStartTime = performance.now();
  }

  function renderFlagOptions(q) {
    const grid = $('q-flag-grid');
    grid.hidden = false;
    q.options.forEach((iso, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flag-option';
      btn.dataset.iso = iso;
      const img = document.createElement('img');
      img.src = 'assets/flags/' + window.App.getFlagFilename(iso);
      img.alt = `Vlag optie ${i + 1}`;
      const key = document.createElement('span');
      key.className = 'flag-option-key';
      key.textContent = String(i + 1);
      btn.appendChild(img);
      btn.appendChild(key);
      btn.addEventListener('click', () => handleFlagChoice(q, btn));
      grid.appendChild(btn);
    });
  }

  function handleFlagChoice(q, btn) {
    if (inputLocked) return;
    inputLocked = true;
    const chosen = btn.dataset.iso;
    const wasCorrect = chosen === q.iso;
    const grid = $('q-flag-grid');
    grid.querySelectorAll('.flag-option').forEach(b => {
      b.disabled = true;
      if (!showAnswerFeedback) {
        if (b === btn) b.classList.add('is-chosen');
        else b.classList.add('is-dimmed');
      } else if (b.dataset.iso === q.iso) {
        b.classList.add('is-correct');
      } else if (b === btn) {
        b.classList.add('is-wrong');
      } else {
        b.classList.add('is-dimmed');
      }
    });
    showFeedback(wasCorrect, wasCorrect ? null : `Dit is de vlag van ${countriesMap[q.iso].name_nl}.`);
    commitAnswer(wasCorrect, feedbackDelay(wasCorrect));
  }

  async function renderMapQuestion(q) {
    const token = questionToken;
    $('q-prompt').textContent = 'Welk land is wit gemarkeerd op de kaart?';
    $('map-wrap').hidden = false;
    $('q-input-wrap').hidden = false;
    $('q-input').placeholder = 'Typ de landnaam…';
    $('map-loading').hidden = false;

    await ensureMapReady();
    if (token !== questionToken) return; // gebruiker is al verder

    $('map-loading').hidden = true;
    const satContainer = $('exam-map-container');
    const fallback = $('map-fallback');

    if (mapMode === 'satellite') {
      satContainer.hidden = false;
      fallback.hidden = true;
      window.SatelliteMap.resize();
      window.SatelliteMap.highlightCountry(q.iso);
      window.SatelliteMap.fitToRegion([q.iso], {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        maxZoom: 4,
        duration: 500
      });
    } else if (mapMode === 'svg' && worldGeo) {
      satContainer.hidden = true;
      fallback.hidden = false;
      fallback.innerHTML = window.App.buildWorldMapPreview(q.iso, worldGeo);
    } else {
      // Geen kaart beschikbaar: maak de vraag toch beantwoordbaar
      satContainer.hidden = true;
      fallback.hidden = false;
      const caps = countriesMap[q.iso].capitals_nl.join(' / ');
      fallback.innerHTML = `<p class="map-unavailable">⚠️ Kaart niet beschikbaar. Welk land heeft als hoofdstad <strong>${caps}</strong>?</p>`;
    }
    $('q-input').focus();
  }

  function ensureMapReady() {
    if (!mapInitPromise) {
      mapInitPromise = (async () => {
        try {
          if (window.SatelliteMap && typeof maplibregl !== 'undefined') {
            const m = await window.SatelliteMap.init('exam-map-container', 'assets/maps/high_res_usa.json');
            if (m) {
              mapMode = 'satellite';
              return;
            }
          }
          throw new Error('SatelliteMap niet beschikbaar');
        } catch (e) {
          console.warn('Satellietkaart faalt, probeer SVG-fallback:', e);
          try {
            worldGeo = await window.App.loadJSON('assets/maps/high_res_usa.json?v=2');
            mapMode = 'svg';
          } catch (e2) {
            console.error('Ook SVG-fallback faalt:', e2);
            mapMode = 'none';
          }
        }
      })();
    }
    return mapInitPromise;
  }

  function acceptedAnswersFor(q) {
    const c = countriesMap[q.iso];
    if (!c) return [];
    if (q.type === 'capital') return c.capitals_nl.slice();
    return [c.name_nl];
  }

  function handleTypedSubmit() {
    if (inputLocked) return;
    const q = questions[state.currentIndex];
    if (!q || (q.type !== 'capital' && q.type !== 'map')) return;
    const value = $('q-input').value;
    if (!normalizeForMatch(value)) return;
    inputLocked = true;

    const targets = acceptedAnswersFor(q);
    const wasCorrect = minDistanceToAny(value, targets) <= MAX_DISTANCE;
    const answerText = targets.join(' / ');
    showFeedback(wasCorrect, wasCorrect ? `Antwoord: ${answerText}` : `Het juiste antwoord is: ${answerText}`);
    commitAnswer(wasCorrect, feedbackDelay(wasCorrect));
  }

  function feedbackDelay(wasCorrect) {
    if (!showAnswerFeedback) return NEUTRAL_FEEDBACK_MS;
    return wasCorrect ? CORRECT_FEEDBACK_MS : WRONG_FEEDBACK_MS;
  }

  // Easter egg: zodra de hoofdstadvraag van Sri Lanka verschijnt gaat overal
  // de RGB-disco aan; bij de volgende vraag weer uit.
  let discoTimer = null;

  function discoOn() {
    const el = $('disco');
    if (!el) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    clearTimeout(discoTimer);
    el.hidden = false;
  }

  function discoOff() {
    const el = $('disco');
    if (!el) return;
    clearTimeout(discoTimer);
    el.hidden = true;
  }

  function triggerDisco(durationMs = 4000) {
    discoOn();
    discoTimer = setTimeout(discoOff, durationMs);
  }
  window.__examDisco = triggerDisco; // debug/preview: __examDisco() in de console

  function showFeedback(wasCorrect, detail) {
    const fb = $('q-feedback');
    if (!showAnswerFeedback) {
      // Examenstand: verklap niets (ook niet het land — dat is bij kaartvragen het antwoord)
      fb.className = 'q-feedback show neutral';
      fb.innerHTML = `<div class="q-feedback-text"><strong>Antwoord opgeslagen</strong>` +
        `<span>Je ziet aan het eind of het goed was.</span></div>`;
      return;
    }
    const q = questions[state.currentIndex];
    const c = countriesMap[q.iso];
    fb.className = 'q-feedback show ' + (wasCorrect ? 'ok' : 'nope');
    const flagFile = window.App.getFlagFilename(q.iso);
    fb.innerHTML =
      `<img class="q-feedback-flag" src="assets/flags/${flagFile}" alt="">` +
      `<div class="q-feedback-text"><strong>${wasCorrect ? 'Goed!' : 'Helaas…'}</strong>` +
      `<span>${c.name_nl}${detail ? ' — ' + detail : ''}</span></div>`;
  }

  function commitAnswer(wasCorrect, delayMs) {
    const elapsed = Math.max(0, Math.round(performance.now() - questionStartTime));
    state.results.push([wasCorrect ? 1 : 0, elapsed]);
    state.currentIndex += 1;
    saveState(state);
    updateExamHeader();
    setTimeout(() => {
      renderQuestion();
    }, delayMs);
  }

  // ---------- Resultaat ----------

  function computeSummary() {
    const answered = state.results.length;
    const correct = state.results.reduce((acc, r) => acc + (r[0] ? 1 : 0), 0);
    const totalTime = state.results.reduce((acc, r) => acc + (r[1] || 0), 0);
    const accuracy = answered ? correct / answered : 0;
    const grade = Math.max(1, Math.min(10, 1 + 9 * accuracy));

    const byType = {};
    const byContinent = {};
    const wrongByCountry = {};
    for (let i = 0; i < answered; i++) {
      const q = questions[i];
      const ok = state.results[i][0] === 1;
      const c = countriesMap[q.iso];
      if (!byType[q.type]) byType[q.type] = { correct: 0, total: 0 };
      byType[q.type].total++;
      if (ok) byType[q.type].correct++;
      const cont = c ? c.continent : '?';
      if (!byContinent[cont]) byContinent[cont] = { correct: 0, total: 0 };
      byContinent[cont].total++;
      if (ok) byContinent[cont].correct++;
      if (!ok) {
        if (!wrongByCountry[q.iso]) wrongByCountry[q.iso] = { iso: q.iso, count: 0, types: new Set() };
        wrongByCountry[q.iso].count++;
        wrongByCountry[q.iso].types.add(q.type);
      }
    }
    const worst = Object.values(wrongByCountry)
      .sort((a, b) => b.count - a.count || a.iso.localeCompare(b.iso))
      .slice(0, 10);

    return { answered, correct, totalTime, accuracy, grade, byType, byContinent, worst };
  }

  function formatDuration(ms) {
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}u ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatGrade(grade) {
    return grade.toFixed(1).replace('.', ',');
  }

  function breakdownRow(label, correct, total) {
    const pct = total ? Math.round((correct / total) * 100) : 0;
    return (
      `<div class="bd-row">` +
      `<span class="bd-label">${label}</span>` +
      `<span class="bd-bar"><span class="bd-fill" style="width:${pct}%"></span></span>` +
      `<span class="bd-value">${correct}/${total} · ${pct}%</span>` +
      `</div>`
    );
  }

  function renderResultScreen() {
    discoOff();
    const s = computeSummary();
    showScreen('result');

    const passed = s.grade >= 5.5;
    const gradeEl = $('result-grade');
    gradeEl.textContent = formatGrade(s.grade);
    gradeEl.classList.toggle('passed', passed);
    gradeEl.classList.toggle('failed', !passed);
    $('result-grade-label').textContent = passed ? 'Geslaagd! 🎉' : 'Gezakt… probeer het nog eens!';
    $('result-correct').textContent = `${s.correct}/${s.answered}`;
    $('result-accuracy').textContent = `${Math.round(s.accuracy * 100)}%`;
    $('result-time').textContent = formatDuration(s.totalTime);
    $('result-seed').textContent = state.seed;

    const typeHtml = ['capital', 'flag', 'map']
      .filter(t => s.byType[t])
      .map(t => breakdownRow(TYPE_LABELS[t], s.byType[t].correct, s.byType[t].total))
      .join('');
    $('result-type-breakdown').innerHTML = typeHtml || '<p class="muted">Geen gegevens.</p>';

    const contHtml = Object.keys(s.byContinent)
      .sort()
      .map(cont => breakdownRow(CONTINENT_TITLES[cont] || cont, s.byContinent[cont].correct, s.byContinent[cont].total))
      .join('');
    $('result-continent-breakdown').innerHTML = contHtml || '<p class="muted">Geen gegevens.</p>';

    const wrongHtml = s.worst.map(w => {
      const c = countriesMap[w.iso];
      const types = [...w.types].map(t => `<span class="mini-badge" data-type="${t}">${TYPE_LABELS[t]}</span>`).join('');
      return (
        `<li><img src="assets/flags/${window.App.getFlagFilename(w.iso)}" alt="">` +
        `<span class="wrong-name">${c ? c.name_nl : w.iso}</span>` +
        `<span class="wrong-count">${w.count}× fout</span>${types}</li>`
      );
    }).join('');
    $('result-wrong-wrap').hidden = s.worst.length === 0;
    $('result-wrong-list').innerHTML = wrongHtml;

    if (passed) launchConfetti();
  }

  function launchConfetti() {
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const wrap = $('confetti');
    if (!wrap) return;
    wrap.innerHTML = '';
    const colors = ['#22d3ee', '#8b5cf6', '#34d399', '#fbbf24', '#fb7185', '#f8fafc'];
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDelay = (Math.random() * 2.2) + 's';
      p.style.animationDuration = (2.6 + Math.random() * 2) + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(p);
    }
    setTimeout(() => { wrap.innerHTML = ''; }, 7000);
  }

  // ---------- Finish + history-integratie ----------

  function finishExam() {
    if (!state.finished) {
      state.finished = true;
      saveState(state);
      replayIntoHistory();
    }
    renderResultScreen();
  }

  /**
   * Replay het hele examen als één sessie in de bestaande history
   * (localStorage landjes_history_v1) zodat de statistiekenpagina het oppikt.
   * Events krijgen per stuk quizType capital/flag/map zodat rolling accuracy klopt.
   */
  function replayIntoHistory() {
    try {
      const session = window.App.startSession({ groupId: 'world', quizType: 'exam', subMode: state.seed });
      const isoList = activeCountries().map(c => c.iso);
      const stats = window.App.createInitialCountryStats(isoList);
      for (let i = 0; i < state.results.length; i++) {
        const q = questions[i];
        window.App.recordQuestionResult({
          session,
          countryStats: stats,
          iso: q.iso,
          quizType: q.type,
          subType: 'exam',
          wasCorrect: state.results[i][0] === 1,
          responseTimeMs: state.results[i][1] || 0
        });
      }
      window.App.finalizeSession(session);
    } catch (e) {
      console.warn('Kon examensessie niet in history opslaan:', e);
    }
  }

  // ---------- Event wiring ----------

  function copyShareLink(seed, feedbackEl) {
    const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(seed)}`;
    const done = () => {
      if (!feedbackEl) return;
      feedbackEl.textContent = 'Link gekopieerd!';
      setTimeout(() => { feedbackEl.textContent = ''; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {
        window.prompt('Kopieer deze link:', url);
      });
    } else {
      window.prompt('Kopieer deze link:', url);
    }
  }

  function wireEvents() {
    $('btn-dice').addEventListener('click', () => {
      $('seed-input').value = randomSeed();
    });

    $('btn-copy-link').addEventListener('click', () => {
      copyShareLink(currentSeedFromInput(), $('copy-feedback'));
    });

    $('btn-start').addEventListener('click', () => {
      const seed = currentSeedFromInput();
      const existing = loadState();
      if (existing && !existing.finished && existing.results.length > 0) {
        if (!confirm(`Er staat nog een examen open met seed ${existing.seed} (${existing.results.length}/${existing.total}). Nieuw examen starten en die voortgang wissen?`)) {
          return;
        }
      }
      clearState();
      state = null;
      startExam(seed, null);
    });

    $('btn-resume').addEventListener('click', () => {
      const s = loadState();
      if (!s || s.finished) { updateResumePanel(); return; }
      $('seed-input').value = s.seed;
      startExam(s.seed, s);
    });

    $('btn-discard').addEventListener('click', () => {
      if (!confirm('Opgeslagen examenvoortgang wissen?')) return;
      clearState();
      state = null;
      updateResumePanel();
    });

    $('btn-pause').addEventListener('click', () => {
      // State is al na elk antwoord opgeslagen; alleen terug naar start.
      showStartScreen();
    });

    $('btn-feedback-toggle').addEventListener('click', () => {
      showAnswerFeedback = !showAnswerFeedback;
      saveFeedbackPref();
      updateFeedbackToggleUi();
      if (state && !state.finished) updateExamHeader();
    });

    $('btn-submit').addEventListener('click', handleTypedSubmit);
    $('q-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleTypedSubmit();
      }
    });

    document.addEventListener('keydown', e => {
      // 1-4: vlagoptie kiezen (alleen bij zichtbare vlagvraag, niet in een invoerveld)
      if (inputLocked) return;
      const grid = $('q-flag-grid');
      if (grid.hidden) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx >= 0) {
        const btn = grid.querySelectorAll('.flag-option')[idx];
        if (btn && !btn.disabled) btn.click();
      }
    });

    $('btn-share-result').addEventListener('click', () => {
      copyShareLink(state.seed, $('share-feedback'));
    });

    $('btn-new-exam').addEventListener('click', () => {
      clearState();
      state = null;
      $('seed-input').value = randomSeed();
      showStartScreen();
    });

    $('btn-replay-intro').addEventListener('click', e => {
      e.preventDefault();
      playIntro(() => showStartScreen());
    });

    window.addEventListener('beforeunload', () => {
      // Geen finalizeSession: halve examens horen niet in de history.
      if (window.SatelliteMap && mapMode === 'satellite') window.SatelliteMap.destroy();
    });
  }

  // ---------- Init ----------

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      countries = await window.App.loadCountriesFromRoot();
    } catch (e) {
      document.body.innerHTML = '<p style="color:#fff;padding:2rem;font-family:sans-serif">Kon data niet laden. Start een lokale webserver (bijv. <code>python3 -m http.server</code>) en open deze pagina opnieuw.</p>';
      console.error(e);
      return;
    }
    countriesMap = {};
    countries.forEach(c => { countriesMap[c.iso] = c; });

    loadFeedbackPref();
    updateFeedbackToggleUi();
    buildStars($('page-stars'), 80);
    spawnRandomStars($('page-stars'));
    wireEvents();

    maybePlayIntro(() => {
      const s = loadState();
      if (s && s.finished) {
        // Resultaat van het laatste examen opnieuw tonen
        state = s;
        questions = buildExam(activeCountries(), s.seed);
        if (state.checksum === examChecksum(questions) && state.total === questions.length) {
          renderResultScreen();
          return;
        }
        clearState();
        state = null;
      }
      showStartScreen();
    });
  });
})();
