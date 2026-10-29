// Geo trivia: rounds of 10 multiple-choice questions, generated from the site's own data
// (borders, area, population, capital positions, coastline). Faster answers score more.
import { loadDataset, loadJSON } from '../core/data.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');
const KEY = 'landjes_geotrivia';
const ROUND = 10, SECONDS = 15;

const CATS = {
  buren: 'Buurlanden',
  grootte: 'Oppervlakte',
  inwoners: 'Inwoners',
  ligging: 'Ligging',
  kust: 'Kust',
  continent: 'Continenten'
};

/** Small seeded random generator (mulberry32), so the daily round is the same for everyone. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

(async () => {
  const [ds, borders, facts, capAt] = await Promise.all([
    loadDataset('world'), loadJSON('data/borders.json'), loadJSON('data/country_facts.json'), loadJSON('data/capital_locations.json')
  ]);
  const ids = [...ds.items.keys()];
  const it = id => ds.items.get(id);
  const nf = new Intl.NumberFormat('nl-NL');
  const fmtArea = a => `${nf.format(Math.round(a / 1000) * 1000)} km²`;
  const fmtPop = p => p >= 1e6 ? `${(p / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} miljoen` : nf.format(p);
  const km = (a, b) => d3.geoDistance(a, b) * 6371;

  // ---------- Question generators: each returns {cat, q, options:[id|text], answer, explain} or null ----------
  function pick(r, arr, n) { const a = [...arr]; const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; }
  const sameRegion = (id, pool) => pool.filter(x => it(x).region === it(id).region);

  const GEN = {
    buren(r) {
      const x = pick(r, ids.filter(i => facts[i].neighbours >= 1), 1)[0];
      const yes = pick(r, borders[x], 1)[0];
      const no = pick(r, sameRegion(x, ids).filter(i => i !== x && !borders[x].includes(i)), 3);
      if (no.length < 3) return null;
      return { q: `Welk land grenst aan ${it(x).name}?`, options: [yes, ...no], answer: yes, explain: `${it(x).name} grenst aan ${borders[x].map(i => it(i).name).join(', ')}.` };
    },
    buren_aantal(r) {
      const x = pick(r, ids.filter(i => facts[i].neighbours >= 2), 1)[0];
      const n = facts[x].neighbours;
      const opts = [...new Set([n, n + 1, n - 1, n + 2, n - 2].filter(v => v >= 0))].slice(0, 4).map(String);
      return { cat: 'buren', q: `Hoeveel buurlanden heeft ${it(x).name}?`, options: opts, answer: String(n), text: true, explain: `${it(x).name}: ${borders[x].map(i => it(i).name).join(', ')}.` };
    },
    grootte(r) {
      for (let t = 0; t < 30; t++) {
        const base = pick(r, ids.filter(i => facts[i].area > 1000), 1)[0];
        const four = [base, ...pick(r, sameRegion(base, ids).filter(i => i !== base && facts[i].area > 1000), 3)];
        if (four.length < 4) continue;
        const s = [...four].sort((a, b) => facts[b].area - facts[a].area);
        if (facts[s[0]].area < 1.4 * facts[s[1]].area) continue;
        const small = r() < .35;
        const ans = small ? s[3] : s[0];
        if (small && facts[s[2]].area < 1.4 * facts[s[3]].area) continue;
        return { cat: 'grootte', q: small ? 'Welk land is het kleinst?' : 'Welk land is het grootst?', options: four, answer: ans, explain: s.map(i => `${it(i).name} ${fmtArea(facts[i].area)}`).join(' · ') };
      }
      return null;
    },
    inwoners(r) {
      for (let t = 0; t < 30; t++) {
        const pool = ids.filter(i => facts[i].pop);
        const base = pick(r, pool, 1)[0];
        const four = [base, ...pick(r, sameRegion(base, pool).filter(i => i !== base), 3)];
        if (four.length < 4) continue;
        const s = [...four].sort((a, b) => facts[b].pop - facts[a].pop);
        if (facts[s[0]].pop < 1.5 * facts[s[1]].pop) continue;
        return { cat: 'inwoners', q: 'Welk land heeft de meeste inwoners?', options: four, answer: s[0], explain: s.map(i => `${it(i).name} ${fmtPop(facts[i].pop)}`).join(' · ') + ' (schatting 2019)' };
      }
      return null;
    },
    ligging(r) {
      for (let t = 0; t < 30; t++) {
        const pool = ids.filter(i => capAt[i]);
        const four = pick(r, pool, 4);
        const dir = pick(r, ['noord', 'zuid', 'oost', 'west'], 1)[0];
        const key = { noord: i => -capAt[i][1], zuid: i => capAt[i][1], oost: i => -capAt[i][0], west: i => capAt[i][0] }[dir];
        const s = [...four].sort((a, b) => key(a) - key(b));
        if (Math.abs(key(s[0]) - key(s[1])) < 4) continue;
        const word = { noord: 'noordelijkst', zuid: 'zuidelijkst', oost: 'oostelijkst', west: 'westelijkst' }[dir];
        return { cat: 'ligging', q: `Welke hoofdstad ligt het ${word}?`, options: four, answer: s[0], capitals: true,
          explain: s.map(i => `${it(i).answers[0]} ${dir === 'noord' || dir === 'zuid' ? `${Math.abs(capAt[i][1]).toFixed(0)}°${capAt[i][1] >= 0 ? 'N' : 'Z'}` : `${Math.abs(capAt[i][0]).toFixed(0)}°${capAt[i][0] >= 0 ? 'O' : 'W'}`}`).join(' · ') };
      }
      return null;
    },
    afstand(r) {
      for (let t = 0; t < 30; t++) {
        const pool = ids.filter(i => capAt[i]);
        const x = pick(r, pool, 1)[0];
        const cand = sameRegion(x, pool).filter(i => i !== x);
        const four = pick(r, cand, 4);
        if (four.length < 4) continue;
        const s = [...four].sort((a, b) => km(capAt[x], capAt[a]) - km(capAt[x], capAt[b]));
        if (km(capAt[x], capAt[s[1]]) < 1.25 * km(capAt[x], capAt[s[0]])) continue;
        return { cat: 'ligging', q: `Welke hoofdstad ligt het dichtst bij ${it(x).answers[0]} (${it(x).name})?`, options: four, answer: s[0], capitals: true,
          explain: s.map(i => `${it(i).answers[0]} ${nf.format(Math.round(km(capAt[x], capAt[i]) / 10) * 10)} km`).join(' · ') };
      }
      return null;
    },
    kust(r) {
      const inland = r() < .6;
      const yes = pick(r, ids.filter(i => facts[i].landlocked === inland && facts[i].area > 0), 1)[0];
      const no = pick(r, sameRegion(yes, ids).filter(i => facts[i].landlocked !== inland), 3);
      if (no.length < 3) return null;
      return { cat: 'kust', q: inland ? 'Welk land heeft geen zeekust?' : 'Welk land ligt aan zee?', options: [yes, ...no], answer: yes,
        explain: inland ? `${it(yes).name} is een van de 44 landen zonder zeekust.` : `De andere drie liggen ingesloten tussen andere landen.` };
    },
    continent(r) {
      const x = pick(r, ids, 1)[0];
      const regions = ds.regions.map(c => ds.regionTitle(c));
      const ans = ds.regionTitle(it(x).region);
      return { cat: 'continent', q: `Op welk continent ligt ${it(x).name}?`, options: [ans, ...pick(r, regions.filter(c => c !== ans), 3)], answer: ans, text: true, explain: `${it(x).name} hoort bij ${ans}.` };
    }
  };
  const GEN_CAT = { buren: 'buren', buren_aantal: 'buren', grootte: 'grootte', inwoners: 'inwoners', ligging: 'ligging', afstand: 'ligging', kust: 'kust', continent: 'continent' };

  function makeRound(seed, cats) {
    const r = rng(seed);
    const gens = Object.keys(GEN).filter(g => cats.includes(GEN_CAT[g]));
    const qs = [], seen = new Set();
    for (let guard = 0; qs.length < ROUND && guard < 400; guard++) {
      const g = gens[Math.floor(r() * gens.length)];
      const q = GEN[g](r);
      if (!q || seen.has(q.q)) continue;
      seen.add(q.q);
      q.cat = GEN_CAT[g];
      // shuffle options with the same generator
      q.options = q.options.map(o => [r(), o]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      qs.push(q);
    }
    return qs;
  }

  // ---------- State & screens ----------
  const store = Object.assign({ best: 0, bestDaily: {}, rounds: 0, cats: Object.keys(CATS) }, prefs.get(KEY, {}));
  const save = () => prefs.set(KEY, store);
  const today = new Date().toISOString().slice(0, 10);
  let R = null, timer = null;

  function start(daily) {
    const cats = daily ? Object.keys(CATS) : store.cats;
    const seed = daily ? hash('geotrivia' + today) : Math.floor(Math.random() * 2 ** 32);
    R = { daily, qs: makeRound(seed, cats), i: 0, score: 0, correct: 0, picked: null, t0: 0, log: [] };
    question();
  }

  function startScreen() {
    clearInterval(timer);
    const playedToday = store.bestDaily[today] != null;
    page.innerHTML = `
      <div class="game-head"><div><div class="eyebrow">Spel</div><h1>Geo trivia</h1><p class="muted">10 snelle vragen over grenzen, oppervlakte, inwoners en ligging. Hoe sneller je antwoordt, hoe meer punten.</p></div></div>
      <div class="gt-start">
        <section class="card panel gt-mode">
          <span class="label">Ronde van de dag</span>
          <h2>${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p class="muted">Dezelfde 10 vragen voor iedereen, alle categorieën.${playedToday ? ` Jouw score vandaag: <b>${store.bestDaily[today]}</b>.` : ''}</p>
          <button class="btn lg primary" data-act="daily">${playedToday ? 'Nog eens spelen' : 'Start ronde van de dag'} ${I.arrow}</button>
        </section>
        <section class="card panel gt-mode">
          <span class="label">Oefenen</span>
          <h2>Kies je categorieën</h2>
          <div class="gt-cats">${Object.entries(CATS).map(([k, t]) => `<button class="opt" data-cat="${k}" aria-pressed="${store.cats.includes(k)}">${store.cats.includes(k) ? I.check.replace('<svg', '<svg width="13" height="13"') : ''}${t}</button>`).join('')}</div>
          <button class="btn lg" data-act="free" ${store.cats.length ? '' : 'disabled'}>Start oefenronde ${I.arrow}</button>
        </section>
      </div>
      <div class="tiles gt-tiles">
        <div class="card tile"><span class="v">${store.best}</span><span class="k">Beste score</span></div>
        <div class="card tile"><span class="v">${store.rounds}</span><span class="k">Rondes gespeeld</span></div>
      </div>`;
  }

  function optionLabel(q, o) {
    if (q.text) return `<span>${esc(o)}</span>`;
    const x = it(o);
    return `<img class="flag" src="${x.flag}" alt="" width="30" height="20"><span>${esc(q.capitals ? `${x.answers[0]}` : x.name)}${q.capitals ? `<small>${esc(x.name)}</small>` : ''}</span>`;
  }

  function question() {
    const q = R.qs[R.i];
    if (!q) return finish();
    R.picked = null;
    R.t0 = performance.now();
    page.innerHTML = `
      <div class="gt-head">
        <button class="icon-btn" data-act="quit" aria-label="Stoppen">${I.back}</button>
        <div class="gt-progress"><span>Vraag ${R.i + 1} van ${R.qs.length}</span><div class="meter"><i style="width:${R.i / R.qs.length * 100}%"></i></div></div>
        <div class="gt-score"><span class="label">Score</span><b class="tabnum">${R.score}</b></div>
      </div>
      <article class="card gt-card">
        <span class="pill">${CATS[q.cat]}</span>
        <h2 class="gt-q">${esc(q.q)}</h2>
        <div class="gt-timer"><i id="gt-time"></i></div>
        <div class="gt-options">${q.options.map((o, i) => `<button class="gt-opt" data-opt="${i}"><span class="kbd">${i + 1}</span>${optionLabel(q, o)}</button>`).join('')}</div>
        <p class="gt-explain" id="gt-explain" aria-live="polite"></p>
        <div class="gt-next" id="gt-next"></div>
      </article>`;
    clearInterval(timer);
    timer = setInterval(() => {
      const left = 1 - (performance.now() - R.t0) / (SECONDS * 1000);
      const bar = document.getElementById('gt-time');
      if (bar) bar.style.width = `${Math.max(0, left) * 100}%`;
      if (left <= 0) answer(null);
    }, 100);
  }

  function answer(idx) {
    if (R.picked !== null) return;
    clearInterval(timer);
    const q = R.qs[R.i];
    R.picked = idx === null ? -1 : idx;
    const ok = idx !== null && q.options[idx] === q.answer;
    const secs = (performance.now() - R.t0) / 1000;
    const pts = ok ? 100 + Math.round(Math.max(0, SECONDS - secs) / SECONDS * 50) : 0;
    R.score += pts; if (ok) R.correct++;
    R.log.push({ q: q.q, ok });
    document.querySelectorAll('.gt-opt').forEach((b, i) => {
      b.disabled = true;
      if (q.options[i] === q.answer) b.classList.add('ok');
      else if (i === idx) b.classList.add('bad');
    });
    document.querySelector('.gt-score b').textContent = R.score;
    document.getElementById('gt-explain').innerHTML = `<b class="${ok ? 'ok' : 'bad'}">${ok ? `Goed! +${pts}` : idx === null ? 'De tijd is op.' : 'Helaas.'}</b> ${esc(q.explain)}`;
    document.getElementById('gt-next').innerHTML = `<button class="btn lg primary" data-act="next">${R.i + 1 < R.qs.length ? 'Volgende vraag' : 'Bekijk je score'} <span class="kbd">Enter</span></button>`;
  }

  function finish() {
    clearInterval(timer);
    store.rounds++;
    const isBest = R.score > store.best;
    store.best = Math.max(store.best, R.score);
    if (R.daily) store.bestDaily = { [today]: Math.max(store.bestDaily[today] || 0, R.score) };
    save();
    page.innerHTML = `
      <article class="card gt-card gt-end">
        <div class="done-icon">${I.check}</div>
        <span class="label">${R.daily ? 'Ronde van de dag' : 'Oefenronde'}</span>
        <h2>${R.score} punten</h2>
        <p class="muted">${R.correct} van ${R.qs.length} goed${isBest ? ' · nieuwe beste score!' : ` · beste score ${store.best}`}</p>
        <ol class="gt-log">${R.log.map(l => `<li class="${l.ok ? 'ok' : 'bad'}">${l.ok ? I.check.replace('<svg', '<svg width="14" height="14"') : '<span>×</span>'}${esc(l.q)}</li>`).join('')}</ol>
        <div class="qactions"><button class="btn lg" data-act="home">Terug</button><button class="btn lg primary" data-act="${R.daily ? 'daily' : 'free'}">Nog een ronde</button></div>
      </article>`;
  }

  page.addEventListener('click', e => {
    const o = e.target.closest('[data-opt]'); if (o) { answer(Number(o.dataset.opt)); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { const k = c.dataset.cat; store.cats = store.cats.includes(k) ? store.cats.filter(x => x !== k) : [...store.cats, k]; save(); startScreen(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    ({ daily: () => start(true), free: () => start(false), next: () => { R.i++; question(); }, quit: startScreen, home: startScreen })[a.dataset.act]?.();
  });
  document.addEventListener('keydown', e => {
    if (!R || e.target.closest('input, select, textarea')) return;
    if (/^[1-4]$/.test(e.key) && R.picked === null && document.querySelector('.gt-opt')) answer(Number(e.key) - 1);
    else if (e.key === 'Enter' && R.picked !== null && document.querySelector('[data-act="next"]')) { e.preventDefault(); R.i++; question(); }
  });
  startScreen();
})();
