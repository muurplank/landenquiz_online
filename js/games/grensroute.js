// Grensroute: connect the start country and the goal through neighbouring countries.
// You may build from both sides: a guess must border the end of the route from the start (G.path)
// or the end of the route from the goal (G.back). Done when both ends border each other.
// A country that borders neither end counts as a mistake.
import { loadDataset, loadJSON, siteUrl } from '../core/data.js';
import { normalize, levenshtein, escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';
import { playDate, today as todayStr, isRandomMode, niceDate, hash, rng, saveResult } from './daily.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');
const STATS_KEY = 'landjes_grensroute';
const LEVELS = { easy: ['Makkelijk', 2, 3], normal: ['Normaal', 4, 5], hard: ['Moeilijk', 6, 9] };
const AREAS = { world: 'Hele wereld', Europe: 'Europa', Africa: 'Afrika', Asia: 'Azië', Americas: 'Amerika' };

(async () => {
  const [ds, allBorders] = await Promise.all([loadDataset('world'), loadJSON('data/borders.json')]);
  // Alleen over land reizen: grenzen via overzeese gebieden of exclaven aan de overkant van de zee tellen niet,
  // net als de grenzen op Borneo (dan zou je vanaf het Maleisische vasteland naar Indonesië 'lopen').
  const SEA = new Set(['BRA-FRA', 'FRA-SUR', 'ESP-MAR', 'IDN-MYS', 'BRN-MYS']);
  const borders = Object.fromEntries(Object.entries(allBorders).map(([id, ns]) => [id, ns.filter(n => !SEA.has([id, n].sort().join('-')))]));
  const nameOf = id => ds.items.get(id).name;
  const inArea = (id, area) => area === 'world' || (area === 'Americas'
    ? ['North America', 'South America'].includes(ds.items.get(id).region)
    : ds.items.get(id).region === area);

  const settings = Object.assign({ level: 'normal', area: 'world' }, prefs.get(STATS_KEY + '_settings', {}));
  let proj = prefs.get(STATS_KEY + '_proj', 'mercator');   // platte kaart of globe, geldt ook voor de dagroute
  const day = playDate(), DAYS_KEY = 'landjes_grensroute_days';
  let mode = isRandomMode() ? 'free' : 'daily';
  const cfg = () => mode === 'daily' ? { level: 'normal', area: 'world' } : settings;
  function saveDay() {
    if (mode !== 'daily' || !G) return;
    const days = prefs.get(DAYS_KEY, {}); days[day] = G; prefs.set(DAYS_KEY, days);
  }
  const stats = Object.assign({ played: 0, won: 0, perfect: 0, streak: 0, best: 0 }, prefs.get(STATS_KEY, {}));
  let G = null, map = null, wrongId = null;   // wrongId: fout gegokt land, even zichtbaar

  function bfs(from) {
    const dist = { [from]: 0 }, parent = {}, queue = [from];
    while (queue.length) {
      const c = queue.shift();
      for (const n of borders[c] || []) if (!(n in dist)) { dist[n] = dist[c] + 1; parent[n] = c; queue.push(n); }
    }
    return { dist, parent };
  }
  function pathTo(parent, from, to) { const p = [to]; while (p[0] !== from) p.unshift(parent[p[0]]); return p; }

  function newPuzzle(r = Math.random) {
    const { level, area } = cfg();
    const [, lo, hi] = LEVELS[level];
    const starts = Object.keys(borders).filter(id => borders[id].length && ds.items.has(id) && inArea(id, area)).sort();
    for (let tries = 0; tries < 400; tries++) {
      const start = starts[Math.floor(r() * starts.length)];
      const { dist, parent } = bfs(start);
      const ends = Object.keys(dist).filter(id => dist[id] >= lo && dist[id] <= hi && inArea(id, area)).sort();
      if (!ends.length) continue;
      const end = ends[Math.floor(r() * ends.length)];
      return { start, end, shortest: dist[end], best: pathTo(parent, start, end), path: [start], back: [end], order: [], mistakes: 0, hints: 0, done: false, msg: '', msgCls: '' };
    }
    return null;
  }

  const tips = () => [G.path[G.path.length - 1], G.back[G.back.length - 1]];
  const guessed = () => G.path.slice(1).concat(G.back.slice(1));
  const route = () => G.path.concat([...G.back].reverse());

  function render() {
    const [a, b] = tips();
    const steps = G.done ? route().length - 1 : guessed().length;
    const li = (id, cls = '') => `<li class="${cls}"><img class="flag" src="${ds.items.get(id).flag}" alt="" width="24" height="16"><span>${esc(nameOf(id))}</span></li>`;
    page.innerHTML = `
      <div class="game-head">
        <div><div class="eyebrow">Spel</div><h1>Grensroute</h1><p class="muted">Verbind het startland met het doel via buurlanden. Je mag vanaf beide kanten bouwen.</p></div>
        <div class="game-settings">
          <div class="seg small" role="group" aria-label="Spelvorm"><button data-mode="daily" aria-pressed="${mode === 'daily'}">${day === todayStr() ? 'Route van de dag' : esc(niceDate(day))}</button><button data-mode="free" aria-pressed="${mode === 'free'}">Oefenen</button></div>
          ${mode === 'daily' ? '' : `<div class="seg small" role="group" aria-label="Moeilijkheid">${Object.entries(LEVELS).map(([k, [t]]) => `<button data-level="${k}" aria-pressed="${settings.level === k}">${t}</button>`).join('')}</div>
          <label class="visually-hidden" for="area">Gebied</label>
          <select class="select" id="area">${Object.entries(AREAS).map(([k, t]) => `<option value="${k}" ${settings.area === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`}
        </div>
      </div>
      <div class="gr-grid">
        <section class="card gr-play">
          <div class="gr-ends">
            <div class="gr-end"><span class="label">Start</span><div><img class="flag" src="${ds.items.get(G.start).flag}" alt="" width="36" height="24"><b>${esc(nameOf(G.start))}</b></div></div>
            <div class="gr-arrow">${I.arrow}<span class="muted">${G.shortest} stappen kan</span></div>
            <div class="gr-end goal"><span class="label">Doel</span><div><img class="flag" src="${ds.items.get(G.end).flag}" alt="" width="36" height="24"><b>${esc(nameOf(G.end))}</b></div></div>
          </div>
          <div class="gr-mapwrap">
            <div class="quiz-map gr-map" id="gr-map"></div>
            <div class="seg small gr-proj" role="group" aria-label="Weergave"><button data-proj="mercator" aria-pressed="${proj === 'mercator'}">Kaart</button><button data-proj="globe" aria-pressed="${proj === 'globe'}">Globe</button></div>
          </div>
          ${G.done ? doneHtml() : `
          <form class="type-row" id="gr-form" autocomplete="off">
            <label class="visually-hidden" for="gr-input">Volgende land</label>
            <div class="suggest-wrap">
              <input id="gr-input" class="type-input" placeholder="Buurland van ${esc(nameOf(a))} of ${esc(nameOf(b))}…" spellcheck="false" autocapitalize="off" enterkeyhint="go">
              <div class="suggest" id="suggest" hidden></div>
            </div>
            <button class="btn lg primary" type="submit">Reis <span class="kbd">Enter</span></button>
          </form>`}
          <p class="type-feedback ${G.msgCls}" id="gr-msg" aria-live="polite">${esc(G.msg)}</p>
        </section>
        <aside class="side">
          <div class="card panel">
            <div class="panel-head"><h3>Jouw route</h3><span class="muted tabnum" style="font-size:13px">${steps} ${steps === 1 ? (G.done ? 'stap' : 'land') : (G.done ? 'stappen' : 'landen')}</span></div>
            <ol class="route">${G.done ? route().map(id => li(id)).join('') : G.path.map((id, i) => li(id, i === G.path.length - 1 ? 'now' : '')).join('')
              + '<li class="gap" aria-label="nog te vinden">…</li>'
              + [...G.back].reverse().map((id, i) => li(id, 'b ' + (i === 0 ? 'now ' : '') + (id === G.end ? 'goal' : ''))).join('')}</ol>
            ${G.done ? '' : `<div class="gr-tools"><button class="btn" data-act="undo" ${G.order.length ? '' : 'disabled'}>Stap terug</button><button class="btn" data-act="hint">Toon buurlanden</button></div>`}
          </div>
          <div class="tiles">
            <div class="card tile"><span class="v">${G.mistakes}</span><span class="k">Fouten</span></div>
            <div class="card tile"><span class="v">${G.hints}</span><span class="k">Hints</span></div>
            <div class="card tile"><span class="v">${stats.won}</span><span class="k">Gewonnen</span></div>
            <div class="card tile"><span class="v">${stats.streak}</span><span class="k">Perfecte reeks</span></div>
          </div>
          ${mode === 'free' ? '<button class="btn" data-act="new">Nieuwe route</button>' : '<a class="btn" href="archief.html?game=grensroute">Archief</a>'}
        </aside>
      </div>`;
    mountMap();
    const input = document.getElementById('gr-input');
    if (input) {
      input.focus();
      input.addEventListener('input', suggest);
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') moveSuggest(e);
      });
      document.getElementById('gr-form').addEventListener('submit', e => { e.preventDefault(); submitTyped(input.value); });
    }
  }

  function doneHtml() {
    const steps = route().length - 1, extra = steps - G.shortest;
    const perfect = extra === 0 && !G.mistakes && !G.hints;
    return `<div class="gr-done">
      <div class="done-icon">${I.check}</div>
      <div><h2>${perfect ? 'Perfecte route!' : 'Aangekomen!'}</h2>
        <p class="muted">${steps} stappen${extra ? `, ${extra} meer dan nodig` : ', de kortste route'}${G.mistakes ? ` · ${G.mistakes} ${G.mistakes === 1 ? 'fout' : 'fouten'}` : ''}${G.hints ? ` · ${G.hints} ${G.hints === 1 ? 'hint' : 'hints'}` : ''}.</p>
        ${extra ? `<p class="muted" style="margin-top:6px">Kortste route: ${G.best.map(id => esc(nameOf(id))).join(' → ')}</p>` : ''}
      </div>
      ${mode === 'free' ? `<button class="btn lg primary" data-act="new">Nieuwe route ${I.arrow}</button>` : '<a class="btn lg" href="archief.html?game=grensroute">Archief</a>'}
    </div>`;
  }

  function mountMap() {
    const el = document.getElementById('gr-map');
    const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
    if (map) { el.replaceWith(map.el); } else {
      // Geen satellietbeeld: alleen de omtrekken van start, doel en je route, in de kleur van het thema.
      const outline = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'outlineDark' : 'outline';
      map = new MapView(el, { geo: ds.geo, style: outline(), projection: proj, names, dotsFor: 'all', label: 'Kaart met start, doel en je route' });
      new MutationObserver(() => map.setStyle(outline())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      map.on('click', id => { if (G && !G.done) travel(id); });
      map.ready.then(() => { updateMap(); fit(false); });
    }
    if (map.geo) updateMap();
  }
  function fit(animate = true) { map.fitTo(G.done ? route().concat(G.best) : [G.start, G.end], { padding: .7, animate }); }
  // Alleen start, doel en wat je al gegokt hebt staat op de kaart; de rest moet je zelf weten.
  function updateMap() {
    const onRoute = route();
    const hint = G.showHint ? [...new Set(tips().flatMap(t => borders[t] || []))] : [];
    map.setVisible([...onRoute, ...hint, ...(G.done ? G.best : []), ...(wrongId ? [wrongId] : [])]);
    map.setDone(G.done ? onRoute : onRoute.filter(id => id !== G.end));
    map.setTarget(G.done ? null : G.end);
    map.setGroup(hint);
    map.setColors(Object.fromEntries(hint.filter(id => !onRoute.includes(id)).map(id => [id, 'rgba(250, 204, 21, .45)'])));
    map.setHighlight(null);
  }

  function say(msg, cls = '') { G.msg = msg; G.msgCls = cls; const el = document.getElementById('gr-msg'); if (el) { el.textContent = msg; el.className = 'type-feedback ' + cls; } }

  function travel(id) {
    const [a, b] = tips();
    if (!ds.items.has(id)) return;
    if (route().includes(id)) { say(`${nameOf(id)} staat al op je route. Gebruik "Stap terug" om een gok terug te nemen.`); return; }
    const side = (borders[a] || []).includes(id) ? 'f' : (borders[b] || []).includes(id) ? 'b' : null;
    if (!side) {
      G.mistakes++;
      wrongId = id;
      updateMap();
      map.flash(id, false, 700);
      setTimeout(() => { if (wrongId === id) { wrongId = null; if (map.geo) updateMap(); } }, 700);
      say(`${nameOf(id)} grenst niet aan ${nameOf(a)} of ${nameOf(b)}.`);
      render();
      return;
    }
    (side === 'f' ? G.path : G.back).push(id);
    G.order.push(side);
    G.showHint = false;
    const [x, y] = tips();
    if ((borders[x] || []).includes(y)) finish(); else say(`${nameOf(id)} staat op je route.`, 'ok');
    saveDay();
    render();
    if (G.done) fit();
  }

  function finish() {
    G.done = true;
    const steps = route().length - 1;
    const perfect = steps === G.shortest && !G.mistakes && !G.hints;
    stats.played++; stats.won++;
    if (perfect) { stats.perfect++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
    prefs.set(STATS_KEY, stats);
    G.msg = ''; G.msgCls = '';
    if (mode === 'daily') saveResult('grensroute', day, { done: true, won: true, steps, shortest: G.shortest, perfect });
  }

  // ---------- Typing with suggestions over all countries (no hint about neighbours) ----------
  const all = [...ds.items.values()].map(it => ({ id: it.id, name: it.name, n: normalize(it.name) }));
  let sugg = [], sel = 0;
  function suggest() {
    const q = normalize(document.getElementById('gr-input').value);
    const box = document.getElementById('suggest');
    sugg = q ? all.filter(c => c.n.startsWith(q)).concat(all.filter(c => !c.n.startsWith(q) && c.n.includes(q))).slice(0, 6) : [];
    sel = 0;
    box.hidden = !sugg.length;
    box.innerHTML = sugg.map((c, i) => `<button type="button" class="${i === sel ? 'on' : ''}" data-sug="${c.id}"><img class="flag" src="${ds.items.get(c.id).flag}" alt="" width="24" height="16">${esc(c.name)}</button>`).join('');
  }
  function moveSuggest(e) {
    if (!sugg.length) return;
    e.preventDefault();
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + sugg.length) % sugg.length;
    document.querySelectorAll('#suggest button').forEach((b, i) => b.classList.toggle('on', i === sel));
  }
  function submitTyped(value) {
    const q = normalize(value);
    if (!q) return;
    let pick = sugg[sel];
    if (!pick || (pick.n !== q && levenshtein(pick.n, q) > 3 && !pick.n.startsWith(q))) {
      pick = all.map(c => ({ c, d: levenshtein(c.n, q) })).sort((a, b) => a.d - b.d)[0];
      pick = pick.d <= 3 ? pick.c : null;
    }
    if (!pick) { say(`"${value}" ken ik niet als land.`); return; }
    travel(pick.id);
  }

  page.addEventListener('click', e => {
    const s = e.target.closest('[data-sug]'); if (s) { travel(s.dataset.sug); return; }
    const lv = e.target.closest('[data-level]'); if (lv) { settings.level = lv.dataset.level; prefs.set(STATS_KEY + '_settings', settings); start(); return; }
    const md = e.target.closest('[data-mode]');
    if (md && md.dataset.mode !== mode) { mode = md.dataset.mode; history.replaceState(null, '', mode === 'free' ? '?mode=random' : day !== todayStr() ? `?date=${day}` : location.pathname); start(); return; }
    const pj = e.target.closest('[data-proj]');
    if (pj && pj.dataset.proj !== proj) { proj = pj.dataset.proj; prefs.set(STATS_KEY + '_proj', proj); render(); map.setProjection(proj); fit(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'new') { if (G && !G.done && G.order.length) stats.streak = 0, prefs.set(STATS_KEY, stats); start(); }
    if (a.dataset.act === 'undo' && G.order.length) { (G.order.pop() === 'f' ? G.path : G.back).pop(); say(''); saveDay(); render(); }
    if (a.dataset.act === 'hint') { G.hints++; G.showHint = true; saveDay(); say(`De buurlanden van ${tips().map(nameOf).join(' en ')} lichten geel op.`); render(); }
  });
  page.addEventListener('change', e => { if (e.target.id === 'area') { settings.area = e.target.value; prefs.set(STATS_KEY + '_settings', settings); start(); } });

  function start() {
    const saved = mode === 'daily' ? prefs.get(DAYS_KEY, {})[day] : null;
    G = saved || newPuzzle(mode === 'daily' ? rng(hash('grensroute' + day)) : Math.random);
    // Opgeslagen dagroutes van vóór het bouwen vanaf twee kanten.
    if (G && !G.back) { if (G.path[G.path.length - 1] === G.end) G.path.pop(); G.back = [G.end]; G.order = G.path.slice(1).map(() => 'f'); }
    if (mode === 'daily' && !saved) saveDay();
    if (!G) { page.innerHTML = '<div class="card panel"><p>Geen route gevonden voor deze instellingen. Kies een ander gebied of niveau.</p></div>'; return; }
    render();
    if (map && map.geo) fit(false);
  }
  start();
})();
