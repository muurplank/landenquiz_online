// Map quizzes on the shared MapView:
//  dir a + ans self  -> "Snelle quiz": a country lights up, show the answer, rate yourself
//  dir a + ans pick  -> a country lights up, pick its name from the list or type it
//  dir b (click)     -> "Zoek op kaart": you get a name and click the country
import { isCloseEnough, normalize, escapeHtml as esc } from '../core/text.js';

const NEXT_OK_MS = 900;
const NEXT_BAD_MS = 1600;

export function createMode({ ds, group, params }) {
  const find = params.dir === 'b';
  const kind = find ? 'zoek' : (params.ans === 'pick' ? 'pick' : 'snelle');
  const N = ds.noun;
  const ids = group.countries.filter(id => ds.items.has(id));
  const sorted = [...ids].sort((a, b) => ds.items.get(a).name.localeCompare(ds.items.get(b).name, 'nl'));
  const label = { snelle: `Kaart → ${N.one} · zelf beoordelen`, pick: `Kaart → ${N.one} · aanklikken of typen`, zoek: `${N.One} → kaart` }[kind];

  let api, map, item = null, revealed = false, locked = false;
  const $ = sel => api.card.querySelector(sel);

  function controlsHtml() {
    if (kind === 'snelle') {
      return revealed
        ? `<div class="qactions"><button class="btn lg bad" data-act="wrong">Fout <span class="kbd">2</span></button><button class="btn lg ok" data-act="right">Goed <span class="kbd">1</span></button></div>`
        : `<div class="qactions"><button class="btn lg primary full" data-act="reveal">Toon antwoord <span class="kbd">Spatie</span></button></div>`;
    }
    if (kind === 'pick') {
      return `<form class="type-row" id="pick-form" autocomplete="off">
          <label class="visually-hidden" for="pick-input">Naam van het ${esc(N.one)}</label>
          <input id="pick-input" class="type-input" placeholder="Typ of kies hieronder…" spellcheck="false" autocapitalize="off" enterkeyhint="done">
          <button class="btn lg primary" type="submit">Controleer <span class="kbd">Enter</span></button>
        </form>
        <div class="pick-list" id="pick-list">${sorted.map(id => `<button class="chip" data-pick="${id}">${esc(ds.items.get(id).name)}</button>`).join('')}</div>`;
    }
    return '';
  }

  function setPrompt(html) { $('#map-prompt').innerHTML = html; }

  function render(n) {
    $('#qnum').textContent = `Vraag ${n}`;
    $('#controls').innerHTML = controlsHtml();
    if (kind === 'zoek') setPrompt(`<small>Klik op</small><b>${esc(item.name)}</b>`);
    else setPrompt(`<small>Welk ${esc(N.one)} licht op?</small><b>&nbsp;</b>`);
    $('#feedback').textContent = '';
    $('#feedback').className = 'type-feedback';
    if (kind === 'pick') {
      const input = $('#pick-input');
      input.focus();
      input.addEventListener('input', () => {
        const q = normalize(input.value);
        api.card.querySelectorAll('[data-pick]').forEach(b => { b.hidden = !!q && !normalize(b.textContent).includes(q); });
      });
      $('#pick-form').addEventListener('submit', e => { e.preventDefault(); if (input.value.trim()) judge(isCloseEnough(input.value, [item.name], 4)); });
    }
  }

  function revealName(ok) {
    setPrompt(`<small>${ok === false ? 'Het juiste antwoord' : 'Dit is'}</small><b>${esc(item.name)}</b>`);
  }

  function judge(correct, clickedId) {
    if (locked) return;
    locked = true;
    api.answered(correct, { subType: kind === 'pick' ? 'continent-only' : kind });
    if (kind === 'zoek') {
      map.flash(clickedId, correct, correct ? NEXT_OK_MS : NEXT_BAD_MS);
      if (!correct) map.setTarget(item.id);
    } else {
      map.flash(item.id, correct, correct ? NEXT_OK_MS : NEXT_BAD_MS);
      revealName(correct);
    }
    const fb = $('#feedback');
    if (fb) {
      fb.className = 'type-feedback ' + (correct ? 'ok' : '');
      fb.textContent = correct ? `Goed, het was ${item.name}.`
        : (kind === 'zoek' && clickedId ? `Dat was ${ds.items.get(clickedId)?.name || 'een ander ' + N.one}. ${item.name} knippert.` : `Fout, het was ${item.name}.`);
    }
    map.setDone([...Object.values(api.engine.stats)].filter(s => s.is_mastered).map(s => s.iso));
    setTimeout(() => { locked = false; map.setTarget(null); api.next(); }, correct ? NEXT_OK_MS : NEXT_BAD_MS);
  }

  function act(a) {
    if (kind !== 'snelle' || locked) return;
    if (a === 'reveal' && !revealed) { revealed = true; revealName(); $('#controls').innerHTML = controlsHtml(); }
    else if ((a === 'right' || a === 'wrong') && revealed) {
      api.answered(a === 'right', { subType: 'snelle' });
      map.setDone([...Object.values(api.engine.stats)].filter(s => s.is_mastered).map(s => s.iso));
      api.next();
    }
  }

  return {
    ids,
    quizType: 'map',
    subMode: kind === 'pick' ? 'satellite' : kind,
    endless: kind === 'snelle',
    title: 'Kaart',
    label,
    start(quizApi) {
      api = quizApi;
      api.card.classList.add('map-card');
      api.card.innerHTML = `
        <div class="qmeta"><span class="pill" id="qnum">Vraag 1</span><span class="pill">${esc(label)}</span></div>
        <div class="quiz-map" id="quiz-map"><div class="map-prompt" id="map-prompt"></div>
          <div class="map-zoom"><button class="zbtn" data-zoom="1.6" aria-label="Inzoomen">+</button><button class="zbtn" data-zoom="0.625" aria-label="Uitzoomen">−</button><button class="zbtn" data-zoom="fit" aria-label="Hele set tonen">⤢</button></div>
        </div>
        <div class="map-controls" id="controls"></div>
        <p class="type-feedback" id="feedback" aria-live="assertive"></p>`;
      const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
      map = new MapView($('#quiz-map'), { geo: ds.geo, style: 'sat', names, group: ids, hoverHighlight: kind === 'zoek', label: 'Quizkaart' });
      map.on('click', id => { if (kind === 'zoek' && item && !locked) judge(id === item.id, id); });
      api.card.addEventListener('click', e => {
        const z = e.target.closest('[data-zoom]');
        if (z) { z.dataset.zoom === 'fit' ? map.fitTo(ids) : map.zoomBy(Number(z.dataset.zoom)); return; }
        const p = e.target.closest('[data-pick]');
        if (p && item) { judge(p.dataset.pick === item.id); return; }
        const b = e.target.closest('[data-act]');
        if (b) act(b.dataset.act);
      });
      return map.ready.then(() => map.fitTo(ids, { animate: false }));
    },
    show(id, quizApi, n) {
      item = ds.items.get(id);
      revealed = false;
      locked = false;
      map.setTarget(kind === 'zoek' ? null : id);
      render(n);
    },
    onKey(e) {
      if (kind !== 'snelle') return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); act('reveal'); }
      else if (e.key === '1') act('right');
      else if (e.key === '2') act('wrong');
    }
  };
}
