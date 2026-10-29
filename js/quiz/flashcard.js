// Flashcards for capitals and flags: rate yourself (space, 1, 2) or type the answer.
import { isCloseEnough, escapeHtml as esc, veil, unveil } from '../core/text.js';

const WRONG_FEEDBACK_MS = 2200;

const DIRS = {
  capital: { a: 'land-to-capital', b: 'capital-to-land' },
  flag: { a: 'flag-to-land', b: 'land-to-flag' }
};

export function createMode({ ds, params }) {
  const type = params.type === 'flag' ? 'flag' : 'capital';
  const dir = ['a', 'b', 'both'].includes(params.dir) ? params.dir : 'a';
  // Typing a flag is impossible, so "Land -> vlag" always uses self-rating.
  const typing = params.ans === 'type' && !(type === 'flag' && dir !== 'a');
  const N = ds.noun;
  const dirLabel = {
    'land-to-capital': `${N.One} → hoofdstad`, 'capital-to-land': `Hoofdstad → ${N.one}`,
    'flag-to-land': `Vlag → ${N.one}`, 'land-to-flag': `${N.One} → vlag`
  };
  const subMode = params.order === 'smart' ? 'thompson' : (dir === 'both' ? 'both' : DIRS[type][dir]);

  let item = null, qdir = null, revealed = false, locked = false, api = null;

  function pickDir() {
    if (dir === 'both') return Math.random() < .5 ? DIRS[type].a : DIRS[type].b;
    return DIRS[type][dir];
  }

  function answerText(it, d) {
    if (d === 'land-to-capital') return it.answers.join(', ');
    return it.name;
  }
  function acceptedAnswers(it, d) {
    return d === 'land-to-capital' ? it.answers : [it.name, ...(it.aliases || [])];
  }

  function questionHtml(it, d) {
    switch (d) {
      case 'land-to-capital':
        return `<div class="qprompt">Wat is de hoofdstad van</div><div class="qgiven">${esc(it.name)}</div>`;
      case 'capital-to-land':
        return `<div class="qprompt">Van ${N.which.toLowerCase()} ${esc(N.one)} is dit de hoofdstad?</div><div class="qgiven">${esc(it.answers.join(', '))}</div>`;
      case 'flag-to-land':
        return `<img class="qflag" src="${it.flag}" alt="Vlag om te raden"><div class="qprompt">Bij ${N.which.toLowerCase()} ${esc(N.one)} hoort deze vlag?</div>`;
      default:
        return `<div class="qprompt">Hoe ziet de vlag eruit van</div><div class="qgiven">${esc(it.name)}</div>`;
    }
  }

  function revealHtml(it, d) {
    if (d === 'land-to-flag') return `<img class="qflag small" src="${it.flag}" alt="Vlag van ${esc(it.name)}">`;
    const sub = d === 'flag-to-land' ? `<div class="c">Hoofdstad: ${esc(it.answers.join(', '))}</div>` : '';
    return `<div><div class="a">${esc(answerText(it, d))}</div>${sub}</div>`;
  }

  function render(n) {
    const card = api.card;
    card.innerHTML = `
      <div class="qmeta"><span class="pill">Vraag ${n}</span><span class="pill">${esc(dirLabel[qdir])}</span></div>
      ${questionHtml(item, qdir)}
      <div class="answer" id="answer">${(revealed ? unveil : veil)(revealHtml(item, qdir))}</div>
      ${typing ? `
        <form class="type-row" id="type-form" autocomplete="off">
          <label class="visually-hidden" for="type-input">Jouw antwoord</label>
          <input id="type-input" class="type-input" placeholder="Typ je antwoord…" enterkeyhint="done" spellcheck="false" autocapitalize="off">
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
        const b = e.target.closest('[data-act]'); if (!b) return;
        act(b.dataset.act);
      });
    }
  }

  function actionsHtml() {
    return revealed
      ? `<button class="btn lg bad" data-act="wrong">Fout <span class="kbd">2</span></button><button class="btn lg ok" data-act="right">Goed <span class="kbd">1</span></button>`
      : `<button class="btn lg primary full" data-act="reveal">Toon antwoord <span class="kbd">Spatie</span></button>`;
  }

  function act(a) {
    if (locked) return;
    if (a === 'reveal' && !revealed) {
      revealed = true;
      api.card.querySelector('#answer').innerHTML = unveil(revealHtml(item, qdir));
      api.card.querySelector('#actions').innerHTML = actionsHtml();
    } else if ((a === 'right' || a === 'wrong') && revealed) {
      api.answered(a === 'right', { subType: qdir });
      api.next();
    }
  }

  function submitTyped(value) {
    if (locked || !value.trim()) return;
    if (isCloseEnough(value, acceptedAnswers(item, qdir))) {
      api.answered(true, { subType: qdir });
      api.next();
      return;
    }
    locked = true;
    api.answered(false, { subType: qdir });
    const card = api.card;
    card.querySelector('#answer').innerHTML = unveil(revealHtml(item, qdir));
    card.querySelector('#type-input').disabled = true;
    card.querySelector('#type-feedback').textContent = 'Fout. Dit is het juiste antwoord.';
    setTimeout(() => { locked = false; api.next(); }, WRONG_FEEDBACK_MS);
  }

  return {
    quizType: type,
    subMode,
    endless: dir === 'both',
    title: type === 'flag' ? 'Vlaggen' : 'Hoofdsteden',
    label: (dir === 'both' ? 'Beide kanten' : dirLabel[DIRS[type][dir]]) + (typing ? ' · typen' : '') + (params.order === 'smart' ? ' · slim herhalen' : ''),
    cheatItem: type === 'flag'
      ? it => `<div><img class="flag" src="${it.flag}" alt="" width="36" height="24" loading="lazy"><span>${esc(it.name)}</span></div>`
      : it => `<div class="cheat-cap"><b>${esc(it.name)}</b><span>${esc(it.answers.join(', '))}</span></div>`,
    show(id, quizApi, n) {
      api = quizApi;
      item = api.ds.items.get(id);
      qdir = pickDir();
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
