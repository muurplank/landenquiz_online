// Set page (one week, region, continent or custom selection):
// quiz picker on top, "Bekijken en leren" with the map below.
import { loadDataset, getGroup, shortTitle, groupLabel, siteUrl } from '../core/data.js';
import { groupProgress } from '../core/store.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const page = document.getElementById('page');
const INFINITE_KEY = 'landjes_alles_oneindig';   // same key as the old group page ('1' / '0')
const PICKER_KEY = 'landjes_picker_v2';
const LEARN_KEY = 'landjes_oefenen_collapsed';    // same key as the old group page: {groupId: true}
const OUTLINE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l5 2 4-1 3 4-1 4 2 3-4 4-5-1-3 2-3-4 1-4-2-4z"/></svg>';
const HISTORY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5z"/><path d="M4 19a2 2 0 002 2h12M9 7h5M9 11h5"/></svg>';

renderTopbar(document.getElementById('topbar'), { current: 'oefenen', dataset: params.dataset || 'world' });

const readInfinite = () => { try { return localStorage.getItem(INFINITE_KEY) === '1'; } catch (_) { return false; } };
const writeInfinite = v => { try { localStorage.setItem(INFINITE_KEY, v ? '1' : '0'); } catch (_) { /* ignore */ } };

(async () => {
  let ds, group;
  try {
    ds = await loadDataset(params.dataset || 'world');
    group = await getGroup(ds, params.id);
  } catch (e) {
    page.innerHTML = `<div class="card" style="padding:24px"><h1 style="font-size:22px">Set niet gevonden</h1><p class="muted" style="margin-top:6px">${esc(e.message)}</p><p style="margin-top:14px"><a class="btn" href="${siteUrl('wereld.html')}">Naar het overzicht</a></p></div>`;
    return;
  }
  render(ds, group);
})();

function subjects(ds, oceania) {
  const N = ds.noun, L = N.One, l = N.one;
  const ans = [['self', 'Zelf beoordelen', 'Antwoord tonen, dan zeg je of je het wist'], ['type', 'Typen', 'Typ het antwoord, Enter om te checken']];
  const ord = [['deck', 'Normaal', `${N.every} ${l} komt aan de beurt tot je alles goed hebt`], ['smart', 'Slim herhalen', 'Vaker wat je moeilijk vindt (Thompson Sampling)']];
  return [
    { k: 'capital', icon: 'capital', t: 'Hoofdsteden', d: `${L} en hoofdstad aan elkaar koppelen.`, steps: [
      ['dir', 'Wat krijg je te zien?', [['a', `${L} → hoofdstad`, `Je ziet ${N.the} ${l}, jij noemt de hoofdstad`], ['b', `Hoofdstad → ${l}`, `Je ziet de hoofdstad, jij noemt ${N.the} ${l}`], ['both', 'Beide kanten', 'Allebei door elkaar']]],
      ['ans', 'Hoe antwoord je?', ans], ['order', 'In welke volgorde?', ord]] },
    { k: 'flag', icon: 'flag', t: 'Vlaggen', d: 'Vlaggen herkennen en terugvinden.', steps: [
      ['dir', 'Wat krijg je te zien?', [['a', `Vlag → ${l}`, `Je ziet de vlag, jij noemt ${N.the} ${l}`], ['b', `${L} → vlag`, `Je ziet ${N.the} ${l}, jij denkt aan de vlag`], ['both', 'Beide kanten', 'Allebei door elkaar']]],
      ['ans', 'Hoe antwoord je?', ans, c => c.dir !== 'a' ? { type: `Typen kan alleen bij Vlag → ${l}` } : {}], ['order', 'In welke volgorde?', ord]] },
    { k: 'map', icon: 'map', t: 'Kaart', d: `${N.many[0].toUpperCase() + N.many.slice(1)} vinden op de satellietkaart.`, steps: [
      ['dir', 'Wat krijg je te zien?', [['a', `Kaart → ${l}`, `Er licht een ${l} op, jij noemt de naam`], ['b', `${L} → kaart`, `Je krijgt een naam en klikt ${N.the} ${l} aan`], ['c', 'Hoofdstad → plek', 'Klik op de kaart waar de hoofdstad ligt']]],
      ['ans', 'Hoe antwoord je?', [['self', 'Zelf beoordelen', 'Snel achter elkaar, antwoord tonen'], ['pick', 'Aanklikken of typen', 'Kies uit de lijst of typ de naam'], ['click', 'Op de kaart klikken', 'Je zoekt de plek zelf op']],
        c => c.dir === 'a' ? { click: `Hoort bij ${L} → kaart` } : { self: `Hoort bij Kaart → ${l}`, pick: `Hoort bij Kaart → ${l}` }]] },
    { k: 'outline', svg: OUTLINE_ICON, t: 'Omtrek', d: `Je ziet alleen de omtrek van ${N.the} ${l}, jij noemt de naam.`, steps: [
      ['ans', 'Hoe antwoord je?', ans], ['order', 'In welke volgorde?', ord]] },
    { k: 'kwartet', icon: 'cards', t: 'Kwartet', d: `Kaart, ${l}, hoofdstad en vlag bij elkaar zoeken.`, steps: [] },
    { k: 'mix', icon: 'shuffle', t: 'Mix', d: 'Hoofdstad, vlag en kaart door elkaar.', steps: [
      ['mix', 'Welke mix?', [['std', 'Standaard', 'Hoofdstad-, vlag- en kaartvragen'], ['mega', 'Mega mix', 'Ook kruisvragen, zoals vlag → hoofdstad'], ['own', 'Zelf samenstellen', 'Kies precies welke vraagtypen']]]] },
    { k: 'history', svg: HISTORY_ICON, t: 'Geschiedenis', d: `Vijf weetjes over de geschiedenis van ${N.every.toLowerCase()} ${l}, met vragen erover.`, steps: [
      ['dir', 'Hoe wil je oefenen?', [['ask', 'Meteen de vraag', `Na je antwoord zie je de weetjes van ${N.the} ${l}`], ['read', 'Eerst lezen', 'Je leest de weetjes, daarna volgt de vraag']]],
      ['combi', 'Welke vragen?', [['mix', 'Door elkaar', `Vragen over één ${l} en combinatievragen`], ['single', `Over één ${l}`, `Elke vraag gaat over één weetje van één ${l}`], ['combi', 'Combinatievragen', `Wat was eerder, volgorde, ${N.which.toLowerCase()} ${l}`]]],
      ['order', 'In welke volgorde?', ord]] }
  ];
}

const MIX_ROWS = L => [
  [L, [['land-capital', 'Hoofdstad'], ['land-flag', 'Vlag'], ['land-outline', 'Omtrek']]],
  ['Hoofdstad', [['capital-land', L], ['capital-flag', 'Vlag'], ['capital-map', `${L} op kaart`], ['capital-outline', 'Omtrek']]],
  ['Vlag', [['flag-land', L], ['flag-capital', 'Hoofdstad'], ['flag-map', `${L} op kaart`], ['flag-outline', 'Omtrek']]],
  ['Kaart', [['map-land', L], ['map-capital', 'Hoofdstad'], ['map-flag', 'Vlag']]],
  ['Omtrek', [['outline-land', L], ['outline-capital', 'Hoofdstad'], ['outline-flag', 'Vlag']]]
];

function render(ds, group) {
  const isWeek = !!groupLabel(group);
  const ids = group.countries.filter(id => ds.items.has(id));
  const items = ids.map(id => ds.items.get(id)).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const prog = groupProgress(group.id, ids);
  const oceania = group.continent === 'Oceania';
  const list = subjects(ds, oceania);
  const saved = prefs.get(PICKER_KEY, {});
  const S = {
    subj: list.some(s => s.k === saved.subj) ? saved.subj : 'capital',
    cfg: Object.assign({ capital: { dir: 'a', ans: 'self', order: 'deck' }, flag: { dir: 'a', ans: 'self', order: 'deck' }, map: { dir: 'a', ans: 'self' }, outline: { ans: 'self', order: 'deck' }, kwartet: {}, mix: { mix: 'std' }, history: { dir: 'ask', combi: 'mix', order: 'deck' } }, saved.cfg || {}),
    mix: new Set(saved.mixTypes || []),
    infinite: readInfinite()
  };
  const title = isWeek && ds.name === 'world' ? shortTitle(group) : group.title;
  const sub = isWeek ? `${groupLabel(group)} · ${ids.length} ${ds.noun.many}` : `${ids.length} ${ds.noun.many}`;
  const crumb = group.id === 'custom' || group.id.startsWith('sel.') ? 'Mijn selectie' : (ds.regionTitle(group.continent) || group.title);
  document.title = `${title} — Land Trainer`;

  page.innerHTML = `
    <div class="set-head">
      <div>
        <nav class="crumbs" aria-label="Kruimelpad"><a href="${siteUrl('index.html')}">Spellen</a><span>/</span><a href="${siteUrl('wereld.html' + (ds.name === 'world' ? '' : '?dataset=' + ds.name))}">${esc(ds.title)}</a><span>/</span><span>${esc(crumb)}</span></nav>
        <h1>${esc(title)}</h1>
        <p class="sub">${esc(sub)}</p>
      </div>
      <div class="card set-progress" aria-label="Voortgang">
        ${[['Hoofdstad', prog.capital], ['Vlag', prog.flag], ['Kaart', prog.map], ['Omtrek', prog.outline], ['Geschiedenis', prog.history]].map(([l, p]) => `<div class="ring-wrap"><div class="ring" style="--p:${p}"><b>${p}%</b></div><span>${l}</span></div>`).join('')}
      </div>
    </div>
    <div class="flagstrip set-flags">${items.slice(0, 16).map(it => `<img class="flag" src="${it.flag}" alt="" width="30" height="20" loading="lazy">`).join('')}${items.length > 16 ? `<span class="more">+${items.length - 16}</span>` : ''}</div>
    <section class="card picker" id="picker" aria-label="Quiz kiezen"></section>
    <section class="card learn ${prefs.get(LEARN_KEY, {})[group.id] ? 'closed' : ''}" id="learn" aria-label="Bekijken en leren">
      <div class="learn-head">
        <button id="learn-toggle" aria-expanded="true">${I.chev} Bekijken en leren</button>
        <span class="muted" style="font-size:13px">Ga met je muis over een ${esc(ds.noun.one)}</span>
      </div>
      <div class="learn-body">
        <div class="learn-map" id="learn-map">
          <div class="map-tag" id="map-tag" hidden></div>
        </div>
        <div class="list-side">
          <div class="search">${I.search}<label class="visually-hidden" for="lsearch">Zoek</label><input id="lsearch" placeholder="Zoek ${esc(ds.noun.one)} of hoofdstad…" autocomplete="off"></div>
          <ul class="clist" id="clist">${items.map(it => `<li data-id="${it.id}" data-search="${esc(fold(it.name + ' ' + it.answers.join(' ')))}"><img class="flag" src="${it.flag}" alt="" width="30" height="20" loading="lazy"><div><div class="nm">${esc(it.name)}</div><div class="cap">${esc(it.answers.join(', '))}</div></div></li>`).join('')}</ul>
        </div>
      </div>
    </section>`;

  // ---------- Picker ----------
  const picker = document.getElementById('picker');
  function save() { prefs.set(PICKER_KEY, { subj: S.subj, cfg: S.cfg, mixTypes: [...S.mix] }); }
  function fix(subj) {
    const c = S.cfg[subj.k];
    subj.steps.forEach(([key, , opts, rule]) => {
      if (!opts.some(o => o[0] === c[key])) c[key] = opts[0][0];
      const dis = rule ? rule(c) : {};
      if (dis[c[key]]) c[key] = opts.find(o => !dis[o[0]])[0];
    });
  }
  function quizUrl(subj) {
    const c = S.cfg[subj.k];
    const q = new URLSearchParams({ set: group.id, type: subj.k });
    if (ds.name !== 'world') q.set('dataset', ds.name);
    for (const k of ['dir', 'ans', 'order', 'mix', 'combi']) if (c[k]) q.set(k, c[k]);
    if (subj.k === 'mix' && c.mix === 'own') q.set('custom', [...S.mix].join(','));
    if (S.infinite) q.set('infinite', '1');
    return siteUrl('quiz.html?' + q);
  }
  function renderPicker() {
    const subj = list.find(x => x.k === S.subj);
    fix(subj);
    const c = S.cfg[subj.k];
    const progOf = { capital: prog.capital, flag: prog.flag, map: prog.map, outline: prog.outline, history: prog.history };
    const summary = subj.steps.map(([key, , opts]) => (opts.find(o => o[0] === c[key]) || [])[1]).filter(Boolean);
    const ownEmpty = subj.k === 'mix' && c.mix === 'own' && !S.mix.size;
    picker.innerHTML = `
      <div class="rail" role="tablist" aria-label="Onderwerp">
        <div class="label rail-label">Wat wil je oefenen?</div>
        ${list.map(x => `<button class="subj" role="tab" data-subj="${x.k}" aria-selected="${x.k === subj.k}">
          <span class="gicon">${x.svg || I[x.icon]}</span>
          <span class="subj-t"><b>${x.t}</b>${progOf[x.k] != null ? `<span class="tabnum">${progOf[x.k]}% beheerst</span>` : ''}</span>
        </button>`).join('')}
      </div>
      <div class="cfg">
        <div class="cfg-head"><h2>${subj.t}</h2><p>${esc(subj.d)}</p></div>
        ${subj.steps.length ? subj.steps.map(([key, label, opts, rule], si) => {
          const dis = rule ? rule(c) : {};
          return `<div class="step">
            <div class="step-label"><span class="n">${si + 1}</span>${label}</div>
            <div class="choices" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v, t, d]) => `<button class="choice" role="radio" data-choice="${key}:${v}" aria-checked="${c[key] === v}" ${dis[v] ? `aria-disabled="true" title="${esc(dis[v])}"` : ''}><b>${esc(t)}</b><span>${esc(dis[v] || d)}</span></button>`).join('')}</div>
            ${key === 'mix' && c.mix === 'own' ? `<div class="matrix inline-matrix">${mixMatrix()}</div>` : ''}
          </div>`;
        }).join('') : `<div class="kw-explain">
            <div class="kw-cards">${['Kaart', ds.noun.One, 'Hoofdstad', 'Vlag'].map((k, i) => `<div class="kw ${i === 1 ? 'given' : ''}"><span>${k}</span>${i === 1 ? '<b>Gegeven</b>' : '<i>?</i>'}</div>`).join('')}</div>
            <p class="muted">Je krijgt er één van de vier. Zoek de andere drie die erbij horen.</p>
          </div>`}
        <div class="cfg-foot">
          <label class="switch" title="De quiz stopt niet als je alles goed hebt, maar blijft vragen stellen.">
            <input type="checkbox" id="infinite" ${S.infinite ? 'checked' : ''}><span class="track"></span><span>Oneindig</span>
          </label>
          <div class="summary"><b>${esc(subj.t + (summary.length ? ' · ' + summary.join(' · ') : ''))}</b>${S.infinite ? 'Stopt niet als alles goed is' : 'Stopt als je alles goed hebt'}</div>
          <a class="btn primary lg" id="start" href="${ownEmpty ? '#' : quizUrl(subj)}" ${ownEmpty ? 'aria-disabled="true" style="opacity:.45;pointer-events:none"' : ''}>Start ${I.arrow}</a>
        </div>
      </div>`;
  }
  function mixMatrix() {
    return MIX_ROWS(ds.noun.One).map(([from, opts]) => `<div class="mrow"><div class="from">Je ziet ${from.toLowerCase()} →</div><div class="opts">${opts.map(([k, t]) => `<button class="opt" data-mix="${k}" aria-pressed="${S.mix.has(k)}">${S.mix.has(k) ? I.check.replace('<svg', '<svg width="13" height="13"') : ''}${esc(t)}</button>`).join('')}</div></div>`).join('')
      + `<div class="mrow"><div></div><div class="opts"><button class="btn ghost" data-mixall style="height:32px">${S.mix.size ? 'Niets' : 'Alles'} selecteren</button></div></div>`;
  }
  picker.addEventListener('click', e => {
    const t = e.target;
    const s = t.closest('[data-subj]'); if (s) { S.subj = s.dataset.subj; save(); renderPicker(); return; }
    const ch = t.closest('[data-choice]');
    if (ch) { if (ch.getAttribute('aria-disabled') === 'true') return; const [k, v] = ch.dataset.choice.split(':'); S.cfg[S.subj][k] = v; save(); renderPicker(); return; }
    const m = t.closest('[data-mix]'); if (m) { const k = m.dataset.mix; S.mix.has(k) ? S.mix.delete(k) : S.mix.add(k); save(); renderPicker(); return; }
    if (t.closest('[data-mixall]')) { if (S.mix.size) S.mix.clear(); else MIX_ROWS('').flatMap(r => r[1]).forEach(([k]) => S.mix.add(k)); save(); renderPicker(); }
  });
  picker.addEventListener('change', e => { if (e.target.id === 'infinite') { S.infinite = e.target.checked; writeInfinite(S.infinite); renderPicker(); } });
  renderPicker();

  // ---------- Learn: list + map ----------
  const learn = document.getElementById('learn');
  const toggle = document.getElementById('learn-toggle');
  let map = null;
  function setLearnOpen(open) {
    learn.classList.toggle('closed', !open);
    toggle.setAttribute('aria-expanded', open);
    const st = prefs.get(LEARN_KEY, {}); st[group.id] = !open; prefs.set(LEARN_KEY, st);
    if (open) initMap();
  }
  toggle.addEventListener('click', () => setLearnOpen(learn.classList.contains('closed')));

  const tag = document.getElementById('map-tag');
  const clist = document.getElementById('clist');
  function showItem(id) {
    clist.querySelectorAll('li.on').forEach(li => li.classList.remove('on'));
    if (!id || !ds.items.has(id)) { tag.hidden = true; map && map.setHighlight(null); map && map.setPointHighlight(null); return; }
    const it = ds.items.get(id);
    const li = clist.querySelector(`li[data-id="${id}"]`); if (li) li.classList.add('on');
    tag.innerHTML = `<img src="${it.flag}" alt=""><div><b>${esc(it.name)}</b><span>${esc(it.answers.join(', '))}</span></div>`;
    tag.hidden = false;
    map && map.setHighlight(id);
    map && map.setPointHighlight(id);
  }
  clist.addEventListener('mouseover', e => { const li = e.target.closest('li[data-id]'); if (li) showItem(li.dataset.id); });
  clist.addEventListener('mouseleave', () => showItem(null));
  document.getElementById('lsearch').addEventListener('input', e => {
    const q = fold(e.target.value.trim());
    clist.querySelectorAll('li').forEach(li => { li.hidden = !!q && !li.dataset.search.includes(q); });
  });

  function initMap() {
    if (map || !window.MapView) return;
    const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
    map = new MapView(document.getElementById('learn-map'), { geo: ds.geo, style: 'sat', names, group: ids, label: `Kaart van ${title}` });
    map.setPoints(items.filter(it => it.capitalAt).map(it => ({ id: it.id, ll: it.capitalAt })));
    map.on('hover', id => showItem(id && ids.includes(id) ? id : null));
    map.ready.then(() => map.fitTo(ids, { animate: false }));
  }
  if (!learn.classList.contains('closed')) {
    if (window.MapView) initMap(); else window.addEventListener('load', initMap, { once: true });
  }
}

function fold(s) { return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''); }
