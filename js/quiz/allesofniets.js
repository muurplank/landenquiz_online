// Alles of niets: four questions in a row about one country: outline → name, capital, flag, place on the map.
// One mistake ends the chain: you see everything about the country and it comes back later.
//  ans=self -> show the answer and rate yourself at every step (space, 1, 2)
//  ans=type -> type name and capital, pick the flag (1-4), click on the map
import { isCloseEnough, escapeHtml as esc, veil, unveil } from '../core/text.js';
import { outlineSvg } from './outline-shape.js';

const STEPS = ['land', 'capital', 'flag', 'map'];
const FOCUS = { padding: .55, maxZoom: 5 };

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function createMode({ ds, group, params }) {
  const typing = params.ans === 'type';
  const N = ds.noun;
  const geo = await MapView.loadGeo(ds.geo);
  // Only countries with a shape in the map file (a few anchor-only ones have none).
  const ids = group.countries.filter(id => ds.items.has(id) && geo.byId.has(id));
  const STEP_NAMES = { land: N.One, capital: 'Hoofdstad', flag: 'Vlag', map: 'Kaart' };

  let api, map, item, n, step, revealed, failed, flags, fitTimer;
  const $ = sel => api.card.querySelector(sel);

  // The real flag among three flags of nearby countries in the set, those are the ones you mix up.
  function flagOptions(id) {
    const at = geo.anchor.get(id);
    const near = ids.filter(x => x !== id).sort((a, b) => d3.geoDistance(at, geo.anchor.get(a)) - d3.geoDistance(at, geo.anchor.get(b))).slice(0, 6);
    return shuffle([id, ...shuffle(near).slice(0, 3)]);
  }

  function promptText(st) {
    return { land: `${N.which} ${N.one} heeft deze vorm?`, capital: 'Wat is de hoofdstad?', flag: 'Welke vlag hoort erbij?', map: `Waar ligt ${N.this} ${N.one}?` }[st];
  }
  function answerHtml(st) {
    if (st === 'land') return `<div class="a">${esc(item.name)}</div>`;
    if (st === 'capital') return `<div class="a">${esc(item.answers.join(', '))}</div>`;
    if (st === 'flag') return `<img class="qflag small" src="${item.flag}" alt="Vlag van ${esc(item.name)}">`;
    return `<div class="c">${N.The} ${esc(N.one)} knippert op de kaart.</div>`;
  }
  function typeForm(st) {
    const what = st === 'land' ? `${N.the} ${N.one}` : 'de hoofdstad';
    return `<form class="type-row" id="type-form" autocomplete="off">
        <label class="visually-hidden" for="type-input">Jouw antwoord</label>
        <input id="type-input" class="type-input" placeholder="Typ ${esc(what)}…" enterkeyhint="done" spellcheck="false" autocapitalize="off">
        <button class="btn lg primary" type="submit">Controleer <span class="kbd">Enter</span></button>
      </form>`;
  }
  function selfActions() {
    return `<div class="qactions">${revealed
      ? `<button class="btn lg ok" data-act="right">Goed <span class="kbd">1</span></button><button class="btn lg bad" data-act="wrong">Fout <span class="kbd">2</span></button>`
      : `<button class="btn lg primary full" data-act="reveal">Toon antwoord <span class="kbd">Spatie</span></button>`}</div>`;
  }

  function showMap(show, fit) {
    $('#chain-map').hidden = !show;
    clearTimeout(fitTimer);
    if (show) fitTimer = setTimeout(fit, 60);
  }

  function render() {
    const st = STEPS[step];
    $('#qnum').textContent = `Vraag ${n}`;
    $('#qstep').textContent = `Stap ${step + 1} van 4 · ${STEP_NAMES[st]}`;
    $('#chain-steps').innerHTML = STEPS.map((_, i) => `<i class="${i < step ? 'past' : i === step ? (failed ? 'bad' : 'on') : ''}"></i>`).join('');
    if (failed) return renderLearn(st);

    $('#given').innerHTML = st === 'land' ? outlineSvg(geo, item.id, `Omtrek van ${N.the} ${N.one} om te raden`) : `<div class="qgiven">${esc(item.name)}</div>`;
    $('#prompt').textContent = promptText(st);
    $('#feedback').textContent = '';
    const answer = $('#answer'), actions = $('#actions');
    if (typing) {
      answer.innerHTML = '';
      answer.hidden = true;
      if (st === 'land' || st === 'capital') {
        actions.innerHTML = typeForm(st);
        const input = $('#type-input');
        input.focus();
        $('#type-form').addEventListener('submit', e => { e.preventDefault(); submitTyped(input.value); });
      } else if (st === 'flag') {
        actions.innerHTML = `<div class="chain-flags">${flags.map((id, i) => `<button class="flag-choice" data-flag="${id}" aria-label="Vlag ${i + 1}"><img src="${ds.items.get(id).flag}" alt=""><span class="kbd">${i + 1}</span></button>`).join('')}</div>`;
      } else actions.innerHTML = '';
    } else {
      answer.hidden = false;
      answer.innerHTML = revealed ? unveil(answerHtml(st)) : veil(st === 'flag' ? 'flag' : 'text');
      actions.innerHTML = selfActions();
    }
    if (st === 'map') {
      map.setTarget(revealed ? item.id : null);
      showMap(true, () => (revealed ? map.fitTo([item.id], FOCUS) : map.fitTo(ids, { animate: false })));
    } else {
      map.setTarget(null);
      showMap(false);
    }
  }

  // Everything about the country at once, and it stays until you go on.
  function renderLearn(st) {
    $('#given').innerHTML = '';
    $('#prompt').textContent = `${STEP_NAMES[st]} ging mis`;
    $('#answer').hidden = false;
    $('#answer').innerHTML = `<div class="chain-learn">
        ${outlineSvg(geo, item.id, `Omtrek van ${item.name}`).replace('class="outline-shape"', 'class="outline-shape small"')}
        <div class="outline-ans"><img class="flag" src="${item.flag}" alt="Vlag van ${esc(item.name)}" height="40"><div><div class="a">${esc(item.name)}</div><div class="c">Hoofdstad: ${esc(item.answers.join(', '))}</div></div></div>
      </div>`;
    $('#actions').innerHTML = `<div class="qactions"><button class="btn lg primary full" data-act="next">Verder <span class="kbd">Spatie</span></button></div>`;
    $('#feedback').textContent = `${N.this[0].toUpperCase() + N.this.slice(1)} ${N.one} komt later terug.`;
    map.setTarget(item.id);
    showMap(true, () => map.fitTo([item.id], FOCUS));
  }

  function advance() {
    if (step === STEPS.length - 1) {
      api.answered(true, { subType: 'compleet' });
      api.next();
      return;
    }
    step++;
    revealed = false;
    render();
  }

  function fail() {
    failed = true;
    api.answered(false, { subType: `fout-${STEPS[step]}` });
    render();
  }

  function submitTyped(value) {
    if (failed || !value.trim()) return;
    const accepted = STEPS[step] === 'land' ? [item.name, ...(item.aliases || [])] : item.answers;
    isCloseEnough(value, accepted) ? advance() : fail();
  }

  function act(a) {
    if (a === 'next' && failed) { api.next(); return; }
    if (failed || typing) return;
    if (a === 'reveal' && !revealed) { revealed = true; render(); }
    else if (a === 'right') advance();
    else if (a === 'wrong') fail();
  }

  function pickFlag(id) {
    if (failed || !typing || STEPS[step] !== 'flag' || !id) return;
    id === item.id ? advance() : fail();
  }

  return {
    ids,
    quizType: 'alles',
    subMode: typing ? 'type' : 'self',
    retryOnly: true,
    title: 'Alles of niets',
    label: (typing ? 'Typen' : 'Zelf beoordelen') + (params.order === 'smart' ? ' · slim herhalen' : ''),
    start(quizApi) {
      api = quizApi;
      api.card.innerHTML = `
        <div class="qmeta"><div class="qmeta-l"><span class="pill" id="qnum">Vraag 1</span></div><span class="pill" id="qstep"></span></div>
        <div class="chain-steps" id="chain-steps" aria-hidden="true"></div>
        <div id="given" class="mix-given"></div>
        <div class="qprompt" id="prompt"></div>
        <div class="answer" id="answer" aria-live="polite"></div>
        <div id="actions"></div>
        <p class="type-feedback" id="feedback" aria-live="assertive"></p>
        <div class="quiz-map mix-map" id="chain-map" hidden>
          <div class="map-zoom"><button class="zbtn" data-zoom="1.6" aria-label="Inzoomen">+</button><button class="zbtn" data-zoom="0.625" aria-label="Uitzoomen">−</button><button class="zbtn" data-zoom="fit" aria-label="Hele set tonen">⤢</button></div>
        </div>`;
      api.card.addEventListener('click', e => {
        const z = e.target.closest('[data-zoom]');
        if (z) { z.dataset.zoom === 'fit' ? map.fitTo(ids) : map.zoomBy(Number(z.dataset.zoom)); return; }
        const f = e.target.closest('[data-flag]');
        if (f) { pickFlag(f.dataset.flag); return; }
        const b = e.target.closest('[data-act]');
        if (b) act(b.dataset.act);
      });
      const names = Object.fromEntries([...ds.items.values()].map(it => [it.id, it.name]));
      map = new MapView($('#chain-map'), { geo: ds.geo, style: 'sat', names, group: ids, hoverHighlight: typing, label: 'Kaart' });
      map.on('click', id => {
        if (failed || !typing || !item || STEPS[step] !== 'map' || !id) return;
        map.flash(id, id === item.id);
        id === item.id ? advance() : fail();
      });
      return map.ready;
    },
    show(id, quizApi, num) {
      item = ds.items.get(id);
      n = num;
      step = 0;
      revealed = false;
      failed = false;
      flags = flagOptions(id);
      render();
    },
    onKey(e) {
      if (e.repeat) return;
      const space = e.key === ' ' || e.code === 'Space';
      if (failed) { if (space || e.key === 'Enter') { e.preventDefault(); act('next'); } return; }
      if (typing) { if (flags[e.key - 1]) pickFlag(flags[e.key - 1]); return; }
      if (space) { e.preventDefault(); act('reveal'); }
      else if (e.key === '1') act('right');
      else if (e.key === '2') act('wrong');
    }
  };
}
