// Snelheidstest: for countries you already know but want to recall faster.
//  ans=test  -> every country once against the clock, then a drill of the slowest ones
//  ans=train -> straight to the drill, with the countries that were slow last time
// Typing is checked on every key, no Enter needed. The time until the first key is the "denktijd":
// that is the recall itself, without the length of the name.
// The rules live in speed-plan.js.
import { escapeHtml as esc } from '../core/text.js';
import { loadHistory } from '../core/store.js';
import { outlineSvg } from './outline-shape.js';
import { isExact, scoreMs, targetMs, pickSlow, pastScores, latestTimes, timesToResults, Drill, LIMIT_MS, FAST_HITS } from './speed-plan.js';

const KINDS = ['map', 'capital', 'flag', 'outline'];
const FOCUS = { padding: .55, maxZoom: 5, animate: false };
const MISS_MS = 1600;      // the answer stays this long, outside your time
const NOT_FAST_MS = 700;
const TILES_MAX_MS = 1500;  // a slow connection must not count as a slow memory

const secs = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const clock = ms => `${Math.floor(ms / 60000)}:${(ms / 1000 % 60).toFixed(1).replace('.', ',').padStart(4, '0')}`;

export async function createMode({ ds, group, params }) {
  const N = ds.noun;
  const dir = [...KINDS, 'mix'].includes(params.dir) ? params.dir : 'map';
  const geo = await MapView.loadGeo(ds.geo);
  const needsShape = dir === 'outline' || dir === 'mix';   // a few anchor-only countries have no outline
  const ids = group.countries.filter(id => ds.items.has(id) && ds.items.get(id).answers.length && (!needsShape || geo.byId.has(id)));

  const key = { dataset: ds.name, groupId: group.id, dir };
  const history = loadHistory();
  const scores = pastScores(history, key);
  const known = timesToResults(latestTimes(history, key), ids);
  const weak = params.ans === 'train' ? pickSlow(known) : [];
  const training = weak.length > 0;
  const noTrainYet = params.ans === 'train' && !training;
  const kindName = { map: `Kaart → ${N.one}`, capital: `${N.One} → hoofdstad`, flag: `Vlag → ${N.one}`, outline: `Omtrek → ${N.one}`, mix: 'Door elkaar' }[dir];

  let api, map, item, kind, drill = null, token = 0, timer = null, ticker = null;
  let startedAt = null, firstKeyMs = null, locked = true, doneMs = 0, pendingDrill = null, drilled = [];
  const results = [], before = new Map(), after = new Map();
  const speed = { scoreMs: null, target: training ? targetMs(known) : null, times: {} };
  const $ = sel => api.card.querySelector(sel);

  const accepted = () => (kind === 'capital' ? item.answers : [item.name, ...(item.aliases || [])]);
  const answerText = () => (kind === 'capital' ? item.answers.join(', ') : item.name);

  function intro() {
    const n = training ? weak.length : ids.length;
    return `<div class="done speed-intro">
      <div class="done-icon">${STOPWATCH}</div>
      <h2>${training ? 'Trage ' + esc(N.many) + ' trainen' : 'Snelheidstest'}</h2>
      <p class="muted">${noTrainYet ? `Nog geen trage ${esc(N.many)} bekend, dus je begint met de test. ` : ''}${training
        ? `Je ${n} traagste ${esc(N.many)} komen terug tot je ze ${FAST_HITS} keer op rij binnen ${secs(speed.target)} weet.`
        : `${n} ${esc(N.many)}, elk één keer. Begin zo snel je kunt met typen, je hoeft geen Enter te geven. Daarna train je de traagste.`}</p>
      <button class="btn lg primary" data-act="begin">Start <span class="kbd">Enter</span></button>
    </div>`;
  }

  function buildQuestion() {
    api.card.classList.add('speed-card');
    api.card.innerHTML = `
      <div class="qmeta"><span class="pill" id="sp-count"></span><span class="pill tabnum" id="sp-clock"></span></div>
      <div class="speed-bar" aria-hidden="true"><i id="sp-bar"></i></div>
      <div id="sp-given" class="mix-given"></div>
      <div class="quiz-map mix-map" id="sp-map" hidden></div>
      <div class="qprompt" id="sp-prompt"></div>
      <form class="type-row" id="sp-form" autocomplete="off">
        <label class="visually-hidden" for="sp-input">Jouw antwoord</label>
        <input id="sp-input" class="type-input" placeholder="Typ het antwoord…" enterkeyhint="next" spellcheck="false" autocapitalize="off" autocorrect="off">
        <button class="btn lg" type="submit">Weet ik niet <span class="kbd">Enter</span></button>
      </form>
      <p class="type-feedback" id="sp-feedback" aria-live="assertive"></p>`;
    const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
    map = new MapView($('#sp-map'), { geo: ds.geo, style: 'sat', names, group: ids, label: 'Kaart' });
    $('#sp-input').addEventListener('input', e => {
      if (locked) return;
      if (firstKeyMs === null && e.target.value) firstKeyMs = startedAt === null ? 0 : performance.now() - startedAt;
      if (isExact(e.target.value, accepted())) finish(true);
    });
    $('#sp-form').addEventListener('submit', e => { e.preventDefault(); if (!locked) finish(false, 'skip'); });
    $('#sp-input').focus();
    ticker = setInterval(tick, 100);
    return map.ready;
  }

  function tick() {
    const el = $('#sp-clock');
    if (el) el.textContent = drill ? `Doel ${secs(drill.target)}` : clock(doneMs + (startedAt === null ? 0 : performance.now() - startedAt));
  }

  function setStage() {
    const showsMap = kind === 'map';
    $('#sp-map').hidden = !showsMap;
    $('#sp-given').innerHTML = kind === 'capital' ? `<div class="qgiven">${esc(item.name)}</div>`
      : kind === 'flag' ? `<img class="qflag" src="${item.flag}" alt="Vlag om te raden">`
      : kind === 'outline' ? outlineSvg(geo, item.id, `Omtrek van ${N.the} ${N.one} om te raden`) : '';
    $('#sp-prompt').textContent = { map: `${N.which} ${N.one} licht op?`, capital: 'Wat is de hoofdstad?', flag: `${N.which} ${N.one} is dit?`, outline: `${N.which} ${N.one} heeft deze vorm?` }[kind];
    map.setTarget(showsMap ? item.id : null);
    if (showsMap) { map.map.resize(); map.fitTo([item.id], FOCUS); }
  }

  function ask(id, label) {
    item = ds.items.get(id);
    kind = dir === 'mix' ? KINDS[Math.floor(Math.random() * KINDS.length)] : dir;
    locked = false;
    startedAt = null;
    firstKeyMs = null;
    const me = ++token;
    $('#sp-count').textContent = label;
    $('#sp-feedback').textContent = '';
    $('#sp-feedback').className = 'type-feedback';
    const input = $('#sp-input');
    input.value = '';
    input.readOnly = false;
    input.focus();
    setStage();
    const go = () => {
      if (me !== token) return;
      startedAt = performance.now();
      api.engine.t0 = startedAt;
      const bar = $('#sp-bar');
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = '';
      timer = setTimeout(() => finish(false, 'time'), LIMIT_MS);
    };
    if (kind !== 'map') return go();
    const t0 = performance.now();
    (function wait() {
      if (me !== token) return;
      map.map.areTilesLoaded() || performance.now() - t0 > TILES_MAX_MS ? go() : setTimeout(wait, 40);
    })();
  }

  function finish(ok, why) {
    if (locked) return;
    locked = true;
    token++;
    clearTimeout(timer);
    const now = performance.now();
    const ms = ok && startedAt !== null ? now - startedAt : LIMIT_MS;
    const thinkMs = ok ? (firstKeyMs ?? 0) : null;
    startedAt = null;
    $('#sp-bar').style.animation = 'none';
    $('#sp-input').readOnly = true;
    api.answered(ok, { id: item.id, subType: ok ? kind : 'gemist' });
    // Only the first ask per session is a cold measurement.
    if (!(item.id in speed.times)) speed.times[item.id] = thinkMs;

    let wait = 0;
    const fb = $('#sp-feedback');
    if (!ok) { wait = MISS_MS; fb.textContent = `${why === 'time' ? 'Te traag. ' : ''}Het was ${answerText()}.`; }
    if (drill) {
      after.set(item.id, thinkMs);
      const fast = drill.record(item.id, ok, thinkMs);
      if (ok && !fast) { wait = NOT_FAST_MS; fb.className = 'type-feedback ok'; fb.textContent = `Goed, in ${secs(thinkMs)}. Dat kan sneller.`; }
      setTimeout(askDrill, wait);
    } else {
      results.push({ id: item.id, ok, ms, thinkMs });
      doneMs = scoreMs(results);
      setTimeout(() => (results.length === ids.length ? endTest() : api.next()), wait);
    }
  }

  function askDrill() {
    const id = drill.next();
    if (id === null) return endDrill();
    ask(id, `Trainen · nog ${drill.left + (id === drill.pending ? 1 : 0)}`);
  }

  function startDrill(list, target) {
    const set = new Set(list);
    drill = new Drill(list, target, ids.filter(id => !set.has(id)));
    drilled = list;
    askDrill();
  }

  const timeCell = ms => (ms === null || ms === undefined ? '<span class="speed-miss">gemist</span>' : secs(ms));
  const countryRow = (id, cells) => { const it = ds.items.get(id); return `<li><img class="flag" src="${it.flag}" alt="" width="30" height="20"><span class="nm">${esc(it.name)}</span>${cells}</li>`; };

  function compareLine(score) {
    if (!scores.length) return 'Je eerste tijd op deze test.';
    const best = Math.min(...scores), last = scores[scores.length - 1];
    if (score < best) return `<b class="speed-up">Nieuw record!</b> Vorig record ${clock(best)}.`;
    const diff = score - last;
    return `${secs(Math.abs(diff))} ${diff < 0 ? 'sneller' : 'langzamer'} dan vorige keer · record ${clock(best)}`;
  }

  function endTest() {
    clearInterval(ticker);
    map.destroy();
    const score = scoreMs(results), right = results.filter(r => r.ok);
    const target = targetMs(results), slow = pickSlow(results, target);
    speed.scoreMs = score;
    speed.target = target;
    results.forEach(r => before.set(r.id, r.thinkMs));
    if (!slow.length) api.engine.finish();
    const avg = right.length ? right.reduce((a, r) => a + r.thinkMs, 0) / right.length : null;
    api.card.classList.remove('speed-card');
    api.card.innerHTML = `
      <div class="done speed-done">
        <h2 class="speed-time tabnum">${clock(score)}</h2>
        <p class="muted">${compareLine(score)}</p>
        <dl class="speed-facts">
          <div><dt>Goed</dt><dd>${right.length}/${results.length}</dd></div>
          <div><dt>Gem. denktijd</dt><dd>${avg === null ? '–' : secs(avg)}</dd></div>
          <div><dt>Doel</dt><dd>${secs(target)}</dd></div>
        </dl>
        ${slow.length ? `<h3>Hier verlies je je tijd</h3>
        <ul class="speed-list">${slow.map(id => countryRow(id, `<span class="tabnum">${timeCell(before.get(id))}</span>`)).join('')}</ul>
        <p class="muted">Deze ${slow.length} ${esc(N.many)} komen terug tussen andere vragen, tot je ze ${FAST_HITS} keer op rij binnen ${secs(target)} weet.</p>` : `<p class="muted">Geen trage ${esc(N.many)}: alles zit onder je doel.</p>`}
        <div class="qactions">
          <button class="btn lg" data-act="again">Nog een keer</button>
          ${slow.length ? `<button class="btn lg primary" data-act="drill">Train ze nu <span class="kbd">Enter</span></button>` : `<a class="btn lg" href="${backHref()}">Terug naar de set</a>`}
        </div>
      </div>`;
    pendingDrill = slow.length ? { slow, target } : null;
    (($('[data-act="drill"]')) || $('[data-act="again"]')).focus();
  }

  function endDrill() {
    clearInterval(ticker);
    map.destroy();
    api.engine.finish();
    api.card.classList.remove('speed-card');
    api.card.innerHTML = `
      <div class="done speed-done">
        <div class="done-icon">${STOPWATCH}</div>
        <h2>Getraind</h2>
        <ul class="speed-list">${drilled.map(id => countryRow(id, `<span class="tabnum muted">${timeCell(before.get(id))}</span><span aria-hidden="true">→</span><span class="tabnum speed-up">${timeCell(after.get(id))}</span>`)).join('')}</ul>
        <p class="muted">Dit is direct na het oefenen. Of het blijft hangen zie je morgen: kies dan <b>Alleen trainen</b>. ${esc(N.many[0].toUpperCase() + N.many.slice(1))} die je dan nog niet snel weet, komen terug.</p>
        <div class="qactions"><a class="btn lg" href="${backHref()}">Terug naar de set</a><button class="btn lg primary" data-act="again">Nog een keer</button></div>
      </div>`;
    $('[data-act="again"]').focus();
  }

  const backHref = () => `set.html?id=${encodeURIComponent(group.id)}${ds.name !== 'world' ? '&dataset=' + ds.name : ''}`;

  return {
    ids,
    quizType: 'snel',
    subMode: training ? `${dir}-train` : dir,
    endless: true,   // the mode itself decides when it ends: every country once, whether right or wrong
    title: 'Snelheidstest',
    label: `${kindName} · ${training ? 'trainen' : 'test'}`,
    start(quizApi) {
      api = quizApi;
      api.engine.session.speed = speed;
      if (dir === 'flag' || dir === 'mix') ids.forEach(id => { new Image().src = ds.items.get(id).flag; });
      if (training) weak.forEach(id => { const r = known.find(x => x.id === id); before.set(id, r.thinkMs); });
      api.card.innerHTML = intro();
      api.card.addEventListener('click', e => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (a === 'again') location.reload();
        if (a === 'drill' && pendingDrill) {
          const { slow, target } = pendingDrill;
          pendingDrill = null;
          buildQuestion().then(() => startDrill(slow, target));
        }
      });
      const begin = api.card.querySelector('[data-act="begin"]');
      begin.focus();
      return new Promise(resolve => {
        begin.addEventListener('click', () => { locked = true; buildQuestion().then(resolve); }, { once: true });
      });
    },
    show(id) {
      if (training) { if (!drill) startDrill(weak, speed.target); return; }
      ask(id, `${results.length + 1} van ${ids.length}`);
    }
  };
}

const STOPWATCH = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="8"/><path d="M12 10v4l2.5 2M9.5 2h5M12 2v4"/></svg>';
