// Silhouet: recognise a country by its shape. Six guesses; every wrong guess reveals more context
// (scale, neighbours, continent, capital, first letter) and tells you how far off you were.
import { loadDataset, loadJSON } from '../core/data.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';
import { countryInput, samplePoints, countryDistanceKm, gameStats, fmtKm } from './common.js';
import { playDate, today as todayStr, isRandomMode, niceDate, hash, saveResult } from './daily.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');
const MAX = 6, DAYS_KEY = 'landjes_silhouet_days';   // {date: game state}
const REVEALS = ['Alleen de vorm', 'De buurlanden', 'Het continent', 'De hoofdstad', 'De eerste letter', 'Niets meer'];

(async () => {
  const [ds, borders, capAt] = await Promise.all([loadDataset('world'), loadJSON('data/borders.json'), loadJSON('data/capital_locations.json')]);
  const geo = await MapView.loadGeo(ds.geo);
  // Only countries with a recognisable shape (not micro-states).
  const ids = [...ds.items.keys()].filter(id => geo.byId.has(id) && d3.geoArea(geo.byId.get(id)) > 2.5e-5);
  const pts = new Map();
  const pointsOf = id => { if (!pts.has(id)) pts.set(id, geo.byId.has(id) ? samplePoints(geo.byId.get(id)) : [geo.anchor.get(id)]); return pts.get(id); };
  const dist = (a, b) => a === b ? 0 : (borders[a] || []).includes(b) ? 0 : countryDistanceKm(pointsOf(a), pointsOf(b));
  const heat = d3.scaleLinear().domain([0, 400, 1200, 3000, 6000, 12000]).range(['#ff1f1f', '#ff7a00', '#ffc400', '#ffe9a3', '#8fd3ff', '#2f6fdf']).clamp(true);
  const stats = { daily: gameStats('landjes_silhouet_stats_daily'), free: gameStats('landjes_silhouet_stats') };
  const day = playDate();
  let mode = isRandomMode() ? 'free' : 'daily';
  let G;

  const dailySecret = () => { const sorted = [...ids].sort(); return sorted[hash('silhouet' + day) % sorted.length]; };
  function newGame() {
    if (mode === 'daily') {
      const saved = prefs.get(DAYS_KEY, {})[day];
      if (saved) { G = saved; return; }
      G = { date: day, secret: dailySecret(), guesses: [], done: false, won: false };
    } else G = { secret: ids[Math.floor(Math.random() * ids.length)], guesses: [], done: false, won: false };
    save();
  }
  const save = () => {
    if (mode !== 'daily') return;
    const days = prefs.get(DAYS_KEY, {});
    days[day] = G;
    prefs.set(DAYS_KEY, days);
    if (G.done) saveResult('silhouet', day, { done: true, won: G.won, guesses: G.guesses.length });
  };
  const wrong = () => G.guesses.filter(g => g.id !== G.secret).length;
  const level = () => G.done ? 99 : wrong();

  function guess(id) {
    if (G.done || !ds.items.has(id)) return;
    if (G.guesses.some(g => g.id === id)) return;
    const ok = id === G.secret;
    G.guesses.push({ id, km: ok ? 0 : Math.round(dist(id, G.secret)) });
    if (ok) { G.done = true; G.won = true; stats[mode].record(true, G.guesses.length); }
    else if (wrong() >= MAX) { G.done = true; stats[mode].record(false, 0); }
    save(); render();
  }

  // ---------- Drawing ----------
  function draw() {
    const canvas = document.getElementById('sil'); if (!canvas) return;
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1), W = box.width, H = box.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const f = geo.byId.get(G.secret), main = geo.main.get(G.secret);
    const lv = level();
    const neighbours = lv >= 1 ? (borders[G.secret] || []).filter(n => geo.byId.has(n)) : [];
    const c = d3.geoCentroid(main);
    const proj = d3.geoAzimuthalEqualArea().rotate([-c[0], -c[1]]).clipAngle(150);
    // Frame every part at least 10% the size of the largest (Malaysia's two halves, not French Guiana).
    const parts = f.geometry.coordinates.map(c => ({ type: 'Polygon', coordinates: c }));
    const biggest = Math.max(...parts.map(p => d3.geoArea(p)));
    const shape = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: parts.filter(p => d3.geoArea(p) >= biggest * .1).map(p => p.coordinates) } };
    const fitTo = lv >= 1 && neighbours.length
      ? { type: 'FeatureCollection', features: [shape, ...neighbours.map(n => geo.main.get(n))] }
      : shape;
    proj.fitExtent([[28, 28], [W - 28, H - 28]], fitTo);
    const path = d3.geoPath(proj, ctx);

    ctx.clearRect(0, 0, W, H);
    // neighbours
    for (const n of neighbours) {
      ctx.beginPath(); path(geo.byId.get(n));
      ctx.fillStyle = css.getPropertyValue('--surface-3'); ctx.fill();
      ctx.strokeStyle = css.getPropertyValue('--border-strong'); ctx.lineWidth = 1; ctx.stroke();
    }
    // the country itself
    const [[x0, y0], [x1, y1]] = path.bounds(main);
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, G.done ? (G.won ? '#10b981' : '#ef4444') : '#2563eb'); grad.addColorStop(1, G.done ? (G.won ? '#34d399' : '#f97316') : '#06b6d4');
    ctx.beginPath(); path(f); ctx.fillStyle = grad; ctx.fill();
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    // capital
    if (lv >= 3 && capAt[G.secret]) {
      const p = proj(capAt[G.secret]);
      if (p) { star(ctx, p[0], p[1], 8); }
    }
    // scale bar (100 / 200 / 500 / 1000 km, whichever fits ~120px)
    const a = proj.invert([W / 2 - 60, H - 18]), b = proj.invert([W / 2 + 60, H - 18]);
    if (a && b) {
      const kmPerPx = d3.geoDistance(a, b) * 6371 / 120;
      const nice = [50, 100, 200, 500, 1000, 2000, 5000].find(v => v / kmPerPx > 60) || 5000;
      const px = nice / kmPerPx;
      ctx.strokeStyle = css.getPropertyValue('--muted'); ctx.fillStyle = css.getPropertyValue('--muted'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(18, H - 16); ctx.lineTo(18 + px, H - 16); ctx.moveTo(18, H - 21); ctx.lineTo(18, H - 11); ctx.moveTo(18 + px, H - 21); ctx.lineTo(18 + px, H - 11); ctx.stroke();
      ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillText(`${nice.toLocaleString('nl-NL')} km`, 18, H - 26);
    }
  }
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = '#facc15'; ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function render() {
    const st = stats[mode], secret = ds.items.get(G.secret), lv = level(), left = MAX - wrong();
    page.innerHTML = `
      <div class="game-head">
        <div><div class="eyebrow">Spel</div><h1>Silhouet</h1><p class="muted">Welk land heeft deze vorm? Na elke foute gok zie je meer.</p></div>
        <div class="game-settings"><div class="seg small" role="group" aria-label="Spelvorm">
          <button data-mode="daily" aria-pressed="${mode === 'daily'}">${day === todayStr() ? 'Vorm van de dag' : esc(niceDate(day))}</button>
          <button data-mode="free" aria-pressed="${mode === 'free'}">Oefenen</button>
        </div></div>
      </div>
      <div class="gr-grid">
        <section class="card gr-play">
          <div class="sil-stage"><canvas id="sil" aria-label="Silhouet van het te raden land"></canvas>
            <div class="sil-chips">
              ${lv >= 2 ? `<span class="pill">${esc(ds.regionTitle(secret.region))}</span>` : ''}
              ${lv >= 4 ? `<span class="pill">Begint met ${esc(secret.name[0])}</span>` : ''}
              ${lv >= 3 ? `<span class="pill">★ hoofdstad</span>` : ''}
            </div>
          </div>
          ${G.done ? `<div class="gr-done">
              <img class="flag" src="${secret.flag}" alt="" width="60" height="40">
              <div><h2>${G.won ? `${esc(secret.name)}!` : `Het was ${esc(secret.name)}`}</h2>
                <p class="muted">${G.won ? `Geraden in ${G.guesses.length} ${G.guesses.length === 1 ? 'gok' : 'gokken'}.` : 'Alle zes gokken op.'} Hoofdstad: ${esc(secret.answers.join(', '))}.</p></div>
              ${mode === 'free' ? `<button class="btn lg primary" data-act="new">Nieuwe vorm ${I.arrow}</button>` : '<a class="btn" href="archief.html?game=silhouet">Archief</a>'}
            </div>` : `<form id="sil-form"></form>`}
        </section>
        <aside class="side">
          <div class="card panel">
            <div class="panel-head"><h3>Gokken</h3><span class="muted tabnum" style="font-size:13px">${G.done ? '' : `nog ${left}`}</span></div>
            <ol class="guesses slots">${Array.from({ length: MAX }, (_, i) => {
              const g = G.guesses[i];
              if (!g) return `<li class="empty"><i></i><span></span><span class="nm muted">${i === G.guesses.length && !G.done ? (i === MAX - 1 ? 'Laatste kans' : 'Fout? Dan zie je: ' + REVEALS[i + 1].toLowerCase()) : ''}</span><span></span></li>`;
              const ok = g.id === G.secret;
              return `<li><i style="background:${ok ? 'var(--success)' : heat(g.km)}"></i><img class="flag" src="${ds.items.get(g.id).flag}" alt="" width="24" height="16"><span class="nm">${esc(ds.items.get(g.id).name)}</span><span class="km">${ok ? 'Raak' : fmtKm(g.km)}</span></li>`;
            }).join('')}</ol>
          </div>
          <div class="tiles">
            <div class="card tile"><span class="v">${st.data.won}</span><span class="k">Geraden</span></div>
            <div class="card tile"><span class="v">${st.avg}</span><span class="k">Gem. gokken</span></div>
            <div class="card tile"><span class="v">${st.data.streak}</span><span class="k">Reeks</span></div>
            <div class="card tile"><span class="v">${st.data.best}</span><span class="k">Beste reeks</span></div>
          </div>
        </aside>
      </div>`;
    if (!G.done) countryInput(document.getElementById('sil-form'), ds, { onPick: guess, placeholder: 'Welk land is dit?', exclude: id => G.guesses.some(g => g.id === id) }).focus();
    requestAnimationFrame(draw);
  }

  page.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]');
    if (m && m.dataset.mode !== mode) { mode = m.dataset.mode; history.replaceState(null, '', mode === 'free' ? '?mode=random' : day !== todayStr() ? `?date=${day}` : location.pathname); newGame(); render(); return; }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'new') { newGame(); render(); }
  });
  new ResizeObserver(() => draw()).observe(page);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  newGame();
  render();
})();
