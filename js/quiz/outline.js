// Omtrek: you see the outline of a country and name it. Rate yourself (space, 1, 2) or type the name.
import { isCloseEnough, escapeHtml as esc, veil, unveil, prevAnswer } from '../core/text.js';
import { outlineSvg } from './outline-shape.js';

const WRONG_FEEDBACK_MS = 2200;

export async function createMode({ ds, group, params }) {
  const typing = params.ans === 'type';
  const N = ds.noun;
  const geo = await MapView.loadGeo(ds.geo);
  // Only countries with a shape in the map file (a few anchor-only ones have none).
  const ids = group.countries.filter(id => ds.items.has(id) && geo.byId.has(id));

  let api = null, item = null, revealed = false, locked = false, prev = null;   // prev: vorige vraag, beoordeeld zonder antwoord te tonen

  function revealHtml(it) {
    return `<div class="outline-ans"><img class="flag" src="${it.flag}" alt="" height="26"><div><div class="a">${esc(it.name)}</div><div class="c">Hoofdstad: ${esc(it.answers.join(', '))}</div></div></div>`;
  }

  function render(n) {
    const card = api.card;
    card.innerHTML = `
      <div class="qmeta"><div class="qmeta-l"><span class="pill">Vraag ${n}</span>${prevAnswer(prev)}</div><span class="pill">Omtrek → ${esc(N.one)}</span></div>
      ${outlineSvg(geo, item.id, `Omtrek van ${N.the} ${N.one} om te raden`)}
      <div class="qprompt">${N.which} ${esc(N.one)} heeft deze vorm?</div>
      <div class="answer" id="answer">${revealed ? unveil(revealHtml(item)) : veil()}</div>
      ${typing ? `
        <form class="type-row" id="type-form" autocomplete="off">
          <label class="visually-hidden" for="type-input">Jouw antwoord</label>
          <input id="type-input" class="type-input" placeholder="Typ ${esc(N.the)} ${esc(N.one)}…" enterkeyhint="done" spellcheck="false" autocapitalize="off">
          <button class="btn lg primary" type="submit">Controleer <span class="kbd">Enter</span></button>
        </form>
        <p class="type-feedback" id="type-feedback" aria-live="assertive"></p>`
      : `<div class="qactions" id="actions">${actionsHtml()}</div>`}`;
    if (typing) {
      const input = card.querySelector('#type-input');
      input.focus();
      card.querySelector('#type-form').addEventListener('submit', e => { e.preventDefault(); submitTyped(input.value); });
    } else {
      card.querySelector('#actions').addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act);
      });
    }
  }

  function actionsHtml() {
    return revealed
      ? `<button class="btn lg ok" data-act="right">Goed <span class="kbd">1</span></button><button class="btn lg bad" data-act="wrong">Fout <span class="kbd">2</span></button>`
      : `<button class="btn lg primary full" data-act="reveal">Toon antwoord <span class="kbd">Spatie</span></button>`;
  }

  function act(a) {
    if (locked) return;
    if (a === 'reveal' && !revealed) {
      revealed = true;
      api.card.querySelector('#answer').innerHTML = unveil(revealHtml(item));
      api.card.querySelector('#actions').innerHTML = actionsHtml();
    } else if (a === 'right' || a === 'wrong') {
      prev = revealed ? null : item;
      api.answered(a === 'right');
      api.next();
    }
  }

  function submitTyped(value) {
    if (locked || !value.trim()) return;
    if (isCloseEnough(value, [item.name, ...(item.aliases || [])])) {
      api.answered(true);
      api.next();
      return;
    }
    locked = true;
    api.answered(false);
    const card = api.card;
    card.querySelector('#answer').innerHTML = unveil(revealHtml(item));
    card.querySelector('#type-input').disabled = true;
    card.querySelector('#type-feedback').textContent = 'Fout. Dit is het juiste antwoord.';
    setTimeout(() => { locked = false; api.next(); }, WRONG_FEEDBACK_MS);
  }

  return {
    ids,
    quizType: 'outline',
    subMode: typing ? 'type' : 'self',
    title: 'Omtrek',
    label: `Omtrek → ${N.one}` + (typing ? ' · typen' : ' · zelf beoordelen') + (params.order === 'smart' ? ' · slim herhalen' : ''),
    cheatItem: it => `<div><img class="flag" src="${it.flag}" alt="" width="36" height="24" loading="lazy"><span>${esc(it.name)}</span></div>`,
    show(id, quizApi, n) {
      api = quizApi;
      item = ds.items.get(id);
      revealed = false;
      locked = false;
      render(n);
    },
    onKey(e) {
      if (typing) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); act('reveal'); }
      else if (e.key === '1') act('right');
      else if (e.key === '2') act('wrong');
    }
  };
}
