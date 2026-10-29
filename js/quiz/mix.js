// Mix: capital, flag and map questions mixed, always self-rated (space, 1, 2).
//  mix=std  -> land→hoofdstad, vlag→land, kaart→land (counts per type for progress)
//  mix=mega -> all 11 cross types, mix=own -> the chosen subset (counts as 'mix')
import { escapeHtml as esc, veil, unveil, prevAnswer } from '../core/text.js';
import { outlineSvg } from './outline-shape.js';

const ALL_TYPES = ['land-capital', 'capital-land', 'land-flag', 'flag-land', 'map-land', 'capital-flag', 'capital-map', 'flag-capital', 'flag-map', 'map-capital', 'map-flag'];
// Only in 'Zelf samenstellen': questions with the outline of a country (the mega mix stays as it was).
const OUTLINE_TYPES = ['outline-land', 'outline-capital', 'outline-flag', 'land-outline', 'capital-outline', 'flag-outline'];
const STD_TYPES = ['land-capital', 'flag-land', 'map-land'];
const STD_QUIZTYPE = { 'land-capital': 'capital', 'flag-land': 'flag', 'map-land': 'map' };

export function createMode({ ds, group, params }) {
  const variant = ['mega', 'own'].includes(params.mix) ? params.mix : 'std';
  let types = variant === 'std' ? STD_TYPES : ALL_TYPES;
  if (variant === 'own') {
    const chosen = (params.custom || '').split(',').filter(t => ALL_TYPES.includes(t) || OUTLINE_TYPES.includes(t));
    if (chosen.length) types = chosen;
  }
  const N = ds.noun;
  const ids = group.countries.filter(id => ds.items.has(id));
  const usesMap = types.some(t => t.includes('map'));
  const usesOutline = types.some(t => t.includes('outline'));
  const NAMES = { land: N.One, capital: 'Hoofdstad', flag: 'Vlag', map: 'Kaart', outline: 'Omtrek' };
  const typeLabel = t => { const [a, b] = t.split('-'); return `${NAMES[a]} → ${b === 'map' ? N.one + ' op kaart' : NAMES[b].toLowerCase()}`; };

  let api, map, geo, item, type, revealed = false, prev = null;   // prev: vorige vraag, beoordeeld zonder antwoord te tonen
  const $ = sel => api.card.querySelector(sel);

  function given(it, from) {
    if (from === 'land') return `<div class="qgiven">${esc(it.name)}</div>`;
    if (from === 'capital') return `<div class="qgiven">${esc(it.answers.join(', '))}</div>`;
    if (from === 'flag') return `<img class="qflag" src="${it.flag}" alt="Vlag om te raden">`;
    if (from === 'outline') return outlineSvg(geo, it.id, `Omtrek van ${N.the} ${N.one} om te raden`);
    return '';
  }
  function prompt(from, to) {
    const what = { land: `${N.which} ${N.one}?`, capital: 'Welke hoofdstad?', flag: 'Welke vlag hoort erbij?', map: `Waar ligt ${N.this} ${N.one}?`, outline: 'Welke omtrek hoort erbij?' }[to];
    if (from === 'outline') return to === 'land' ? `${N.which} ${N.one} heeft deze vorm?` : `${N.which} ${N.one} heeft deze vorm? ${what}`;
    return from === 'map' ? `${N.which} ${N.one} licht op? ${to === 'land' ? '' : what}` : what;
  }
  function answerHtml(it, to) {
    if (to === 'land') return `<div class="a">${esc(it.name)}</div>`;
    if (to === 'capital') return `<div class="a">${esc(it.answers.join(', '))}</div>`;
    if (to === 'flag') return `<img class="qflag small" src="${it.flag}" alt="Vlag van ${esc(it.name)}">`;
    if (to === 'outline') return outlineSvg(geo, it.id, `Omtrek van ${it.name}`).replace('class="outline-shape"', 'class="outline-shape small"');
    return `<div class="c">${N.The} ${esc(N.one)} knippert op de kaart.</div>`;
  }
  function actions() {
    return revealed
      ? `<button class="btn lg ok" data-act="right">Goed <span class="kbd">1</span></button><button class="btn lg bad" data-act="wrong">Fout <span class="kbd">2</span></button>`
      : `<button class="btn lg primary full" data-act="reveal">Toon antwoord <span class="kbd">Spatie</span></button>`;
  }

  function render(n) {
    const [from, to] = type.split('-');
    const showMap = from === 'map' || (to === 'map' && revealed);
    $('#qnum').textContent = `Vraag ${n}`;
    $('#qprev').innerHTML = prevAnswer(prev);
    $('#qtype').textContent = typeLabel(type);
    $('#given').innerHTML = given(item, from);
    $('#prompt').textContent = prompt(from, to);
    $('#answer').innerHTML = revealed ? unveil(answerHtml(item, to)) : veil(to === 'flag' ? 'flag' : 'text');
    $('#actions').innerHTML = actions();
    if (map) {
      $('#mix-map').hidden = !showMap;
      if (showMap) { map.setTarget(item.id); setTimeout(() => map.fitTo([item.id], { padding: .55, maxZoom: 5, animate: false }), 60); }
      else map.setTarget(null);
    }
  }

  function act(a) {
    if (a === 'reveal' && !revealed) { revealed = true; render(api.engine.totals.questions + 1); return; }
    if (a === 'right' || a === 'wrong') {
      prev = revealed ? null : item;
      api.answered(a === 'right', variant === 'std' ? { quizType: STD_QUIZTYPE[type], subType: type } : { quizType: 'mix', subType: `mega-${type}` });
      api.next();
    }
  }

  return {
    ids,
    quizType: 'mix',
    subMode: variant === 'std' ? 'standard' : variant,
    endless: false,
    title: 'Mix',
    label: { std: 'Standaard', mega: 'Mega mix', own: `Zelf samengesteld (${types.length})` }[variant],
    start(quizApi) {
      api = quizApi;
      api.card.innerHTML = `
        <div class="qmeta"><div class="qmeta-l"><span class="pill" id="qnum">Vraag 1</span><span id="qprev"></span></div><span class="pill" id="qtype"></span></div>
        <div class="quiz-map mix-map" id="mix-map" hidden></div>
        <div id="given" class="mix-given"></div>
        <div class="qprompt" id="prompt"></div>
        <div class="answer" id="answer" aria-live="polite"></div>
        <div class="qactions" id="actions"></div>`;
      api.card.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
      const shapes = usesOutline ? MapView.loadGeo(ds.geo).then(g => { geo = g; }) : Promise.resolve();
      if (!usesMap) return shapes;
      const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
      map = new MapView($('#mix-map'), { geo: ds.geo, style: 'sat', names, group: ids, hoverHighlight: false, label: 'Kaart' });
      return Promise.all([map.ready, shapes]);
    },
    show(id, quizApi, n) {
      item = ds.items.get(id);
      // A country without a shape in the map file (Maldives) gets no outline question.
      const fits = types.filter(t => !t.includes('outline') || geo.byId.has(id));
      type = fits.length ? fits[Math.floor(Math.random() * fits.length)] : 'land-capital';
      revealed = false;
      render(n);
    },
    onKey(e) {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); act('reveal'); }
      else if (e.key === '1') act('right');
      else if (e.key === '2') act('wrong');
    }
  };
}
