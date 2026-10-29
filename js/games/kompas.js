// Kompas: a circle with the five nearest countries around it, each in its true compass direction.
// Guess the country in the middle. Four guesses; every wrong one reveals a hint and shows which
// way (and how far) the answer lies from your guess.
import { loadDataset, loadJSON } from '../core/data.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';
import { countryInput, samplePoints, countryDistanceKm, haversineKm, gameStats, fmtKm } from './common.js';
import { playDate, today as todayStr, isRandomMode, niceDate, hash, saveResult } from './daily.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');
const MAX = 4, AROUND = 5, DAYS_KEY = 'landjes_kompas_days';   // {date: game state}
const REVEALS = ['Alleen de buren', 'Het continent', 'De hoofdstad', 'De eerste letter'];
const WIND = ['noorden', 'noordoosten', 'oosten', 'zuidoosten', 'zuiden', 'zuidwesten', 'westen', 'noordwesten'];
const WIND_SHORT = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
const windIndex = deg => Math.round(deg / 45) % 8;

/** Initial great-circle bearing from a to b ([lon, lat]), degrees clockwise from north. */
function bearing(a, b) {
  const r = Math.PI / 180, φ1 = a[1] * r, φ2 = b[1] * r, Δλ = (b[0] - a[0]) * r;
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / r + 360) % 360;
}

(async () => {
  const [ds, borders] = await Promise.all([loadDataset('world'), loadJSON('data/borders.json')]);
  const geo = await MapView.loadGeo(ds.geo);
  const ids = [...ds.items.keys()].filter(id => geo.anchor.has(id));
  const pts = new Map();
  const pointsOf = id => { if (!pts.has(id)) pts.set(id, geo.byId.has(id) ? samplePoints(geo.byId.get(id), 200) : [geo.anchor.get(id)]); return pts.get(id); };
  const dist = (a, b) => a === b ? 0 : (borders[a] || []).includes(b) ? 0 : countryDistanceKm(pointsOf(a), pointsOf(b));
  const at = id => geo.anchor.get(id);
  /** Direction from a to the side of b that faces it (Germany is east of the Netherlands, not south-east). */
  function towards(a, b) {
    const A = pointsOf(a), B = pointsOf(b);
    const dB = B.map(p => Math.min(...A.map(q => haversineKm(p, q)))), m = Math.min(...dB);
    let c = d3.geoCentroid({ type: 'MultiPoint', coordinates: B.filter((p, i) => dB[i] <= m + 120) });
    if (haversineKm(at(a), c) < 40) c = at(b);   // enclaves: the near side surrounds you
    return bearing(at(a), c);
  }

  /** The five nearest countries: neighbours first, then the closest ones across the water. */
  const aroundCache = new Map();
  function around(secret) {
    if (aroundCache.has(secret)) return aroundCache.get(secret);
    const near = ids.filter(id => id !== secret)
      .map(id => ({ id, c: haversineKm(at(secret), at(id)) }))
      .sort((a, b) => a.c - b.c).slice(0, 30)
      .map(o => ({ ...o, km: Math.round(dist(secret, o.id)) }))
      .sort((a, b) => a.km - b.km || a.c - b.c)
      .slice(0, AROUND)
      .map(o => ({ id: o.id, km: o.km, deg: towards(secret, o.id) }));
    aroundCache.set(secret, near);
    return near;
  }

  const stats = { daily: gameStats('landjes_kompas_stats_daily'), free: gameStats('landjes_kompas_stats') };
  const day = playDate();
  let mode = isRandomMode() ? 'free' : 'daily';
  let G;

  const dailySecret = () => { const sorted = [...ids].sort(); return sorted[hash('kompas' + day) % sorted.length]; };
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
    if (G.done) saveResult('kompas', day, { done: true, won: G.won, guesses: G.guesses.length });
  };
  const wrong = () => G.guesses.filter(g => g.id !== G.secret).length;
  const level = () => G.done ? 99 : wrong();

  function guess(id) {
    if (G.done || !ds.items.has(id) || G.guesses.some(g => g.id === id)) return;
    const ok = id === G.secret;
    G.guesses.push(ok ? { id, km: 0, deg: 0 } : { id, km: Math.round(dist(id, G.secret)), deg: towards(id, G.secret) });
    if (ok) { G.done = true; G.won = true; stats[mode].record(true, G.guesses.length); }
    else if (wrong() >= MAX) { G.done = true; stats[mode].record(false, 0); }
    save(); render();
  }

  // ---------- The compass ----------
  /** Label angles: the true bearings, nudged apart so no two labels are closer than `gap` degrees. */
  function spread(list, gap = 52) {
    const out = list.map((o, i) => ({ i, a: o.deg })).sort((x, y) => x.a - y.a);
    for (let pass = 0; pass < 200; pass++) {
      let moved = false;
      out.sort((x, y) => x.a - y.a);
      for (let k = 0; k < out.length; k++) {
        const p = out[k], q = out[(k + 1) % out.length];
        const d = (q.a - p.a + 360) % 360;
        if (out.length > 1 && d < gap) { const push = (gap - d) / 2; p.a = (p.a - push + 360) % 360; q.a = (q.a + push) % 360; moved = true; }
      }
      if (!moved) break;
    }
    // Hand the spread-out slots back in true compass order, so leader lines never cross.
    const slots = out.map(o => o.a).sort((x, y) => x - y);
    const order = list.map((o, i) => i).sort((x, y) => list[x].deg - list[y].deg);
    const off = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    let best = 0, bestCost = Infinity;
    for (let r = 0; r < slots.length; r++) {
      const cost = order.reduce((s, i, k) => s + off(slots[(k + r) % slots.length], list[i].deg), 0);
      if (cost < bestCost) { bestCost = cost; best = r; }
    }
    const res = []; order.forEach((i, k) => { res[i] = slots[(k + best) % slots.length]; }); return res;
  }

  function compass() {
    const list = around(G.secret), secret = ds.items.get(G.secret);
    const W = 720, H = 600, cx = W / 2, cy = H / 2;
    const pos = (deg, r) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
    const labelAt = spread(list);
    const ticks = WIND_SHORT.map((w, i) => {
      const [x1, y1] = pos(i * 45, 112), [x2, y2] = pos(i * 45, i % 2 ? 120 : 126), [tx, ty] = pos(i * 45, 140);
      return `<line class="tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${i % 2 ? '' : `<text class="wind" x="${tx}" y="${ty}">${w}</text>`}`;
    }).join('');
    const arrows = list.map(o => {
      const [x1, y1] = pos(o.deg, 82), [x2, y2] = pos(o.deg, 168);
      return `<line class="arrow" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#kp-head)"/>`;
    }).join('');
    const labels = list.map((o, i) => {
      const it = ds.items.get(o.id), [ax, ay] = pos(o.deg, 176), [lx, ly] = pos(labelAt[i], 232);
      return `<line class="lead" x1="${ax}" y1="${ay}" x2="${lx}" y2="${ly - 4}"/>
        <g class="kp-label" transform="translate(${lx} ${ly})">
          <rect x="-78" y="-26" width="156" height="58" rx="16"/>
          <image href="${it.flag}" x="-15" y="-19" width="30" height="20" preserveAspectRatio="xMidYMid slice"/>
          <text class="nm" y="16">${esc(it.name.length > 18 ? it.name.slice(0, 17) + '…' : it.name)}</text>
          <text class="km" y="29">${WIND[windIndex(o.deg)]} · ${fmtKm(o.km)}</text>
        </g>`;
    }).join('');
    const centre = G.done
      ? `<image href="${secret.flag}" x="${cx - 36}" y="${cy - 34}" width="72" height="48" preserveAspectRatio="xMidYMid slice"/>
         <text class="answer" x="${cx}" y="${cy + 36}">${esc(secret.name.length > 14 ? secret.name.slice(0, 13) + '…' : secret.name)}</text>`
      : `<text class="q" x="${cx}" y="${cy + 22}">?</text>`;
    return `<svg class="kp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kompas: ${list.map(o => `${ds.items.get(o.id).name} ligt in het ${WIND[windIndex(o.deg)]}`).join(', ')}">
      <defs><marker id="kp-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="head"/></marker></defs>
      <circle class="ring" cx="${cx}" cy="${cy}" r="116"/>
      ${ticks}${arrows}${labels}
      <circle class="core ${G.done ? (G.won ? 'won' : 'lost') : ''}" cx="${cx}" cy="${cy}" r="76"/>
      ${centre}
    </svg>`;
  }

  function render() {
    const st = stats[mode], secret = ds.items.get(G.secret), lv = level(), left = MAX - wrong();
    const shown = new Set(around(G.secret).map(o => o.id));
    page.innerHTML = `
      <div class="game-head">
        <div><div class="eyebrow">Spel</div><h1>Kompas</h1><p class="muted">Welk land ligt in het midden? Je ziet de vijf dichtstbijzijnde landen, elk in hun echte richting.</p></div>
        <div class="game-settings"><div class="seg small" role="group" aria-label="Spelvorm">
          <button data-mode="daily" aria-pressed="${mode === 'daily'}">${day === todayStr() ? 'Kompas van de dag' : esc(niceDate(day))}</button>
          <button data-mode="free" aria-pressed="${mode === 'free'}">Oefenen</button>
        </div></div>
      </div>
      <div class="gr-grid">
        <section class="card gr-play">
          <div class="kp-stage">
            ${compass()}
            <div class="sil-chips">
              ${lv >= 1 ? `<span class="pill">${esc(ds.regionTitle(secret.region))}</span>` : ''}
              ${lv >= 2 ? `<span class="pill">Hoofdstad: ${esc(secret.answers[0])}</span>` : ''}
              ${lv >= 3 ? `<span class="pill">Begint met ${esc(secret.name[0])}</span>` : ''}
            </div>
          </div>
          ${G.done ? `<div class="gr-done">
              <img class="flag" src="${secret.flag}" alt="" width="60" height="40">
              <div><h2>${G.won ? `${esc(secret.name)}!` : `Het was ${esc(secret.name)}`}</h2>
                <p class="muted">${G.won ? `Geraden in ${G.guesses.length} ${G.guesses.length === 1 ? 'gok' : 'gokken'}.` : 'Alle vier gokken op.'} Hoofdstad: ${esc(secret.answers.join(', '))}.</p></div>
              ${mode === 'free' ? `<button class="btn lg primary" data-act="new">Nieuw kompas ${I.arrow}</button>` : '<a class="btn" href="archief.html?game=kompas">Archief</a>'}
            </div>` : `<form id="kp-form"></form>`}
        </section>
        <aside class="side">
          <div class="card panel">
            <div class="panel-head"><h3>Gokken</h3><span class="muted tabnum" style="font-size:13px">${G.done ? '' : `nog ${left}`}</span></div>
            <ol class="guesses slots">${Array.from({ length: MAX }, (_, i) => {
              const g = G.guesses[i];
              if (!g) return `<li class="empty"><i></i><span></span><span class="nm muted">${i === G.guesses.length && !G.done ? (i === MAX - 1 ? 'Laatste kans' : 'Fout? Dan zie je: ' + REVEALS[i + 1].toLowerCase()) : ''}</span><span></span></li>`;
              const ok = g.id === G.secret;
              return `<li><i style="background:${ok ? 'var(--success)' : 'var(--danger)'}"></i><img class="flag" src="${ds.items.get(g.id).flag}" alt="" width="24" height="16"><span class="nm">${esc(ds.items.get(g.id).name)}</span><span class="km">${ok ? 'Raak' : `<span class="kp-dir" style="--deg:${Math.round(g.deg)}deg" title="Het land ligt naar het ${WIND[windIndex(g.deg)]}">↑</span> ${fmtKm(g.km)}`}</span></li>`;
            }).join('')}</ol>
            ${!G.done && G.guesses.length ? '<p class="muted" style="font-size:12.5px">De pijl wijst vanaf jouw gok naar het goede land.</p>' : ''}
          </div>
          <div class="tiles">
            <div class="card tile"><span class="v">${st.data.won}</span><span class="k">Geraden</span></div>
            <div class="card tile"><span class="v">${st.avg}</span><span class="k">Gem. gokken</span></div>
            <div class="card tile"><span class="v">${st.data.streak}</span><span class="k">Reeks</span></div>
            <div class="card tile"><span class="v">${st.data.best}</span><span class="k">Beste reeks</span></div>
          </div>
        </aside>
      </div>`;
    if (!G.done) countryInput(document.getElementById('kp-form'), ds, { onPick: guess, placeholder: 'Welk land ligt in het midden?', exclude: id => shown.has(id) || G.guesses.some(g => g.id === id) }).focus();
  }

  page.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]');
    if (m && m.dataset.mode !== mode) { mode = m.dataset.mode; history.replaceState(null, '', mode === 'free' ? '?mode=random' : day !== todayStr() ? `?date=${day}` : location.pathname); newGame(); render(); return; }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'new') { newGame(); render(); }
  });
  newGame();
  render();
})();
