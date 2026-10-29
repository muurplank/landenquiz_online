// Kwartet: one of land / capital / flag is given; find the other three (and the country on the map).
// Checks automatically once every column has a choice. A wrong set can be corrected and tried again.
import { normalize, escapeHtml as esc } from '../core/text.js';

const HINTS = ['land', 'capital', 'flag'];

export function createMode({ ds, group }) {
  const N = ds.noun;
  const ids = group.countries.filter(id => ds.items.has(id));
  const items = ids.map(id => ds.items.get(id));
  const byName = [...items].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const byCap = [...items].sort((a, b) => (a.answers[0] || '').localeCompare(b.answers[0] || '', 'nl'));
  const byFlag = [...items].sort(() => Math.random() - .5);

  let api, map, target, hint, sel = {}, completed = new Set(), checking = false;
  const $ = s => api.card.querySelector(s);
  const required = () => ['map', 'land', 'capital', 'flag'].filter(c => c !== hint);

  function hintHtml(it) {
    if (hint === 'land') return `<b>${esc(it.name)}</b><span>${esc(N.one)}</span>`;
    if (hint === 'capital') return `<b>${esc(it.answers.join(', '))}</b><span>hoofdstad</span>`;
    return `<img src="${it.flag}" alt="Gegeven vlag"><span>vlag</span>`;
  }

  function lists() {
    const opt = (col, id, inner) => `<button class="kw-opt ${completed.has(id) ? 'done' : ''} ${sel[col] === id ? 'selected' : ''}" data-col="${col}" data-id="${id}" ${completed.has(id) ? 'disabled' : ''}>${inner}</button>`;
    $('#col-land').hidden = hint === 'land';
    $('#col-capital').hidden = hint === 'capital';
    $('#col-flag').hidden = hint === 'flag';
    $('#list-land').innerHTML = byName.map(it => opt('land', it.id, esc(it.name))).join('');
    $('#list-capital').innerHTML = byCap.map(it => opt('capital', it.id, esc(it.answers.join(', ')))).join('');
    $('#list-flag').innerHTML = byFlag.map(it => opt('flag', it.id, `<img src="${it.flag}" alt="Vlag" loading="lazy">`)).join('');
    filter('land'); filter('capital');
  }

  function filter(col) {
    const input = $(`#search-${col}`); if (!input) return;
    const q = normalize(input.value);
    api.card.querySelectorAll(`#list-${col} .kw-opt`).forEach(b => { b.hidden = !!q && !normalize(b.textContent).includes(q); });
  }

  function choose(col, id) {
    if (checking || completed.has(id)) return;
    sel[col] = sel[col] === id ? null : id;
    if (col === 'map') map.setHighlight(sel.map);
    api.card.querySelectorAll(`.kw-opt[data-col="${col}"]`).forEach(b => b.classList.toggle('selected', b.dataset.id === sel[col]));
    updateStatus();
    if (required().every(c => sel[c])) check();
  }

  function updateStatus(text, cls = '') {
    const missing = required().filter(c => !sel[c]).map(c => ({ map: 'kaart', land: N.one, capital: 'hoofdstad', flag: 'vlag' }[c]));
    $('#kw-status').className = 'type-feedback ' + cls;
    $('#kw-status').textContent = text || (missing.length ? `Nog kiezen: ${missing.join(', ')}` : '');
  }

  function check() {
    const ok = required().every(c => sel[c] === target.id);
    api.answered(ok, { quizType: 'kwartet', subType: `hint-${hint}` });
    if (!ok) {
      updateStatus('Niet goed. Pas je keuze aan en probeer opnieuw.');
      return;
    }
    checking = true;
    completed.add(target.id);
    map.setDone([...completed]);
    map.flash(target.id, true, 700);
    updateStatus(`Goed! ${target.name} is compleet.`, 'ok');
    setTimeout(() => { checking = false; api.next(); }, 700);
  }

  return {
    ids,
    quizType: 'kwartet',
    subMode: 'kwartet',
    endless: false,
    wide: true,
    title: 'Kwartet',
    label: `Kaart, ${N.one}, hoofdstad en vlag`,
    start(quizApi) {
      api = quizApi;
      api.card.classList.add('kw-card');
      api.card.innerHTML = `
        <div class="kw-top">
          <div class="kw-hint" id="kw-hint" aria-live="polite"></div>
          <p class="type-feedback" id="kw-status" aria-live="polite"></p>
        </div>
        <div class="kw-grid">
          <div class="kw-col kw-mapcol"><h3>Kaart</h3><div class="quiz-map kw-map" id="kw-map"></div></div>
          <div class="kw-col" id="col-land"><h3>${esc(N.One)}</h3><input class="kw-search" id="search-land" placeholder="Zoek ${esc(N.one)}…" autocomplete="off" aria-label="Zoek ${esc(N.one)}"><div class="kw-list" id="list-land"></div></div>
          <div class="kw-col" id="col-capital"><h3>Hoofdstad</h3><input class="kw-search" id="search-capital" placeholder="Zoek hoofdstad…" autocomplete="off" aria-label="Zoek hoofdstad"><div class="kw-list" id="list-capital"></div></div>
          <div class="kw-col" id="col-flag"><h3>Vlag</h3><div class="kw-list kw-flags" id="list-flag"></div></div>
        </div>`;
      api.card.addEventListener('click', e => { const b = e.target.closest('.kw-opt'); if (b) choose(b.dataset.col, b.dataset.id); });
      api.card.addEventListener('input', e => { if (e.target.id === 'search-land') filter('land'); if (e.target.id === 'search-capital') filter('capital'); });
      const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
      map = new MapView($('#kw-map'), { geo: ds.geo, style: 'sat', names, group: ids, label: 'Kies het land op de kaart' });
      map.on('click', id => { if (ids.includes(id)) choose('map', id); });
      return map.ready.then(() => map.fitTo(ids, { animate: false }));
    },
    show(id) {
      target = ds.items.get(id);
      hint = HINTS[Math.floor(Math.random() * HINTS.length)];
      sel = {};
      map.setHighlight(null);
      $('#kw-hint').innerHTML = `<span class="label">Gegeven</span>${hintHtml(target)}`;
      lists();
      updateStatus();
    }
  };
}
