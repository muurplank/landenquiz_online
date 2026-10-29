// Warm of koud: guess the secret country. Every guess is coloured on the map from ice blue (far)
// to glowing red (close), with the border-to-border distance in km.
import { loadDataset, loadJSON } from '../core/data.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';
import { countryInput, samplePoints, countryDistanceKm, gameStats, fmtKm } from './common.js';
import { playDate, today as todayStr, isRandomMode, niceDate, hash, saveResult } from './daily.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');
const DAYS_KEY = 'landjes_warmkoud_days';   // {date: game state}
const HINT_CONTINENT = 5, HINT_LETTER = 8;

const heat = d3.scaleLinear().domain([0, 400, 1200, 3000, 6000, 12000])
  .range(['#ff1f1f', '#ff7a00', '#ffc400', '#ffe9a3', '#8fd3ff', '#2f6fdf']).clamp(true).interpolate(d3.interpolateRgb);
const label = km => km < 1 ? 'Gloeiend heet' : km < 400 ? 'Heet' : km < 1200 ? 'Warm' : km < 3000 ? 'Lauw' : km < 6000 ? 'Koud' : 'IJskoud';

(async () => {
  const [ds, borders] = await Promise.all([loadDataset('world'), loadJSON('data/borders.json')]);
  const geo = await MapView.loadGeo(ds.geo);
  const ids = [...ds.items.keys()].filter(id => geo.byId.has(id) || geo.anchor.has(id));
  const pts = new Map();
  const pointsOf = id => {
    if (!pts.has(id)) pts.set(id, geo.byId.has(id) ? samplePoints(geo.byId.get(id)) : [geo.anchor.get(id)]);
    return pts.get(id);
  };
  const dist = (a, b) => a === b ? 0 : (borders[a] || []).includes(b) ? 0 : countryDistanceKm(pointsOf(a), pointsOf(b));
  const stats = { daily: gameStats('landjes_warmkoud_stats_daily'), free: gameStats('landjes_warmkoud_stats') };

  const day = playDate();
  const dailySecret = () => { const sorted = [...ids].sort(); return sorted[hash('warmkoud' + day) % sorted.length]; };

  let mode = isRandomMode() ? 'free' : 'daily';
  let G, map;

  function newGame() {
    if (mode === 'daily') {
      const saved = prefs.get(DAYS_KEY, {})[day];
      if (saved) { G = saved; return; }
      G = { date: day, secret: dailySecret(), guesses: [], done: false, gaveUp: false };
    } else {
      G = { secret: ids[Math.floor(Math.random() * ids.length)], guesses: [], done: false, gaveUp: false };
    }
    save();
  }
  function save() {
    if (mode !== 'daily') return;
    const days = prefs.get(DAYS_KEY, {});
    days[day] = G;
    prefs.set(DAYS_KEY, days);
    if (G.done) saveResult('warmkoud', day, { done: true, won: !G.gaveUp, guesses: G.guesses.length });
  }

  function guess(id) {
    if (G.done || !ds.items.has(id)) return;
    if (G.guesses.some(g => g.id === id)) { msg(`${ds.items.get(id).name} had je al.`); return; }
    const km = id === G.secret ? 0 : dist(id, G.secret);
    G.guesses.push({ id, km: Math.round(km) });
    if (id === G.secret) { G.done = true; stats[mode === 'daily' ? 'daily' : 'free'].record(true, G.guesses.length); }
    save();
    render();
    if (!G.done) {
      const prev = G.guesses.length > 1 ? Math.min(...G.guesses.slice(0, -1).map(g => g.km)) : null;
      msg(prev === null ? `${label(km)}: ${fmtKm(km)}.` : km < prev ? `Warmer! ${fmtKm(km)}.` : `Niet warmer dan je beste gok. ${fmtKm(km)}.`, km < (prev ?? Infinity) ? 'ok' : '');
    }
  }

  function giveUp() {
    if (G.done) return;
    G.done = true; G.gaveUp = true;
    stats[mode === 'daily' ? 'daily' : 'free'].record(false, 0);
    save(); render();
  }

  function msg(text, cls = '') { const el = document.getElementById('wk-msg'); if (el) { el.textContent = text; el.className = 'type-feedback ' + cls; } }

  function render() {
    const st = stats[mode === 'daily' ? 'daily' : 'free'];
    const sorted = [...G.guesses].sort((a, b) => a.km - b.km);
    const secret = ds.items.get(G.secret);
    const n = G.guesses.length;
    page.innerHTML = `
      <div class="game-head">
        <div><div class="eyebrow">Spel</div><h1>Warm of koud</h1><p class="muted">Raad het geheime land. Hoe dichterbij je gok, hoe warmer de kleur op de kaart.</p></div>
        <div class="game-settings">
          <div class="seg small" role="group" aria-label="Spelvorm">
            <button data-mode="daily" aria-pressed="${mode === 'daily'}">${day === todayStr() ? 'Land van de dag' : esc(niceDate(day))}</button>
            <button data-mode="free" aria-pressed="${mode === 'free'}">Oefenen</button>
          </div>
        </div>
      </div>
      <div class="gr-grid">
        <section class="card gr-play">
          <div class="quiz-map gr-map" id="wk-map"><div class="heat-legend" aria-hidden="true"><span>Heet</span><i></i><span>IJskoud</span></div></div>
          ${G.done ? `<div class="gr-done">
              <img class="flag" src="${secret.flag}" alt="" width="60" height="40">
              <div><h2>${G.gaveUp ? `Het was ${esc(secret.name)}` : `${esc(secret.name)}!`}</h2>
                <p class="muted">${G.gaveUp ? `Opgegeven na ${n} ${n === 1 ? 'gok' : 'gokken'}.` : `Geraden in ${n} ${n === 1 ? 'gok' : 'gokken'}.`} Hoofdstad: ${esc(secret.answers.join(', '))}.</p></div>
              ${mode === 'free' ? `<button class="btn lg primary" data-act="new">Nieuw land ${I.arrow}</button>` : `<a class="btn" href="archief.html?game=warmkoud">Archief</a>`}
            </div>`
            : `<form id="wk-form"></form>`}
          <p class="type-feedback" id="wk-msg" aria-live="polite"></p>
        </section>
        <aside class="side">
          <div class="card panel">
            <div class="panel-head"><h3>Gokken</h3><span class="muted tabnum" style="font-size:13px">${n}</span></div>
            ${sorted.length ? `<ol class="guesses">${sorted.map(g => `<li><i style="background:${g.id === G.secret ? 'var(--success)' : heat(g.km)}"></i><img class="flag" src="${ds.items.get(g.id).flag}" alt="" width="24" height="16"><span class="nm">${esc(ds.items.get(g.id).name)}</span><span class="km">${g.id === G.secret ? 'Raak' : fmtKm(g.km)}</span></li>`).join('')}</ol>`
              : '<p class="muted" style="font-size:14px">Typ de naam van een land om te gokken.</p>'}
          </div>
          <div class="card panel hints">
            <h3>Hints</h3>
            <p>${n >= HINT_CONTINENT || G.done ? `Continent: <b>${esc(ds.regionTitle(secret.region))}</b>` : `<span class="muted">Continent na ${HINT_CONTINENT} gokken</span>`}</p>
            <p>${n >= HINT_LETTER || G.done ? `Begint met: <b>${esc(secret.name[0])}</b>` : `<span class="muted">Eerste letter na ${HINT_LETTER} gokken</span>`}</p>
            ${G.done ? '' : '<button class="btn ghost danger" data-act="giveup">Geef op</button>'}
          </div>
          <div class="tiles">
            <div class="card tile"><span class="v">${st.data.won}</span><span class="k">Geraden</span></div>
            <div class="card tile"><span class="v">${st.avg}</span><span class="k">Gem. gokken</span></div>
            <div class="card tile"><span class="v">${st.data.streak}</span><span class="k">Reeks</span></div>
            <div class="card tile"><span class="v">${st.data.best}</span><span class="k">Beste reeks</span></div>
          </div>
        </aside>
      </div>`;
    mountMap();
    if (!G.done) countryInput(document.getElementById('wk-form'), ds, { onPick: guess, onUnknown: t => msg(`"${t}" ken ik niet als land.`), placeholder: 'Welk land is het?', exclude: id => G.guesses.some(g => g.id === id) }).focus();
  }

  function mountMap() {
    const el = document.getElementById('wk-map');
    if (map) { el.replaceWith(map.el); }
    else {
      const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
      // Alleen typen telt: de kaart toont de gokken maar is niet klikbaar.
      map = new MapView(el, { geo: ds.geo, style: 'sat', names, dotsFor: 'group', hoverHighlight: false, label: 'Wereldkaart met je gokken' });
      map.ready.then(() => { paintMap(); map.fitTo(ids, { animate: false, padding: .98 }); });
    }
    if (map.geo) paintMap();
  }
  function paintMap() {
    map.setGroup(G.guesses.map(g => g.id));
    map.setColors(Object.fromEntries(G.guesses.filter(g => g.id !== G.secret).map(g => [g.id, heat(g.km)])));
    map.setTarget(G.done ? G.secret : null);
    if (G.done) map.fitTo([G.secret, ...G.guesses.slice(-3).map(g => g.id)], { padding: .6 });
  }

  page.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]');
    if (m && m.dataset.mode !== mode) { mode = m.dataset.mode; history.replaceState(null, '', mode === 'free' ? '?mode=random' : day !== todayStr() ? `?date=${day}` : location.pathname); newGame(); render(); if (map && map.geo) map.fitTo(ids, { animate: false, padding: .98 }); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'giveup') giveUp();
    if (a.dataset.act === 'new') { newGame(); render(); map.fitTo(ids, { padding: .98 }); }
  });

  newGame();
  render();
})();
