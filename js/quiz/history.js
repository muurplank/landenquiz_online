// Geschiedenis: per land (of staat) een meerkeuzevraag over de weetjes uit
// data/history.json (wereld) of data/<dataset>/history.json.
// Na elk antwoord staan de vijf weetjes van dat land eronder. Met "Eerst lezen"
// zie je de weetjes vóór de vraag. Toetsen: 1-4 kiest, Enter/Spatie gaat door.
import { loadJSON } from '../core/data.js';
import { escapeHtml as esc } from '../core/text.js';

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function createMode({ ds, group, params }) {
  const data = await loadJSON(ds.name === 'world' ? 'data/history.json' : `data/${ds.name}/history.json`);
  const ids = group.countries.filter(id => ds.items.has(id) && data[id]);
  if (!ids.length) throw new Error('Voor deze set zijn nog geen geschiedenisvragen.');
  const read = params.dir === 'read';
  const lastQ = {};   // id → index van de vorige vraag, zodat dezelfde vraag niet direct terugkomt

  let api, item, q, opts, phase, n;

  const factsHtml = (it, open = true) => `
    <div class="hist-facts ${open ? '' : 'closed'}">
      <div class="hist-facts-h"><img src="${it.flag}" alt="" width="24" height="16">Weetjes over ${esc(it.name)}</div>
      <ul>${data[it.id].facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    </div>`;

  function pickQuestion(id) {
    const qs = data[id].questions;
    let i = Math.floor(Math.random() * qs.length);
    if (qs.length > 1 && i === lastQ[id]) i = (i + 1) % qs.length;
    lastQ[id] = i;
    return qs[i];
  }

  function renderRead() {
    phase = 'read';
    api.card.innerHTML = `
      <div class="qmeta"><span class="pill">Vraag ${n}</span><span class="pill">Eerst lezen</span></div>
      <div class="qgiven hist-title">${esc(item.name)}</div>
      ${factsHtml(item)}
      <div class="qactions"><button class="btn lg primary full" data-act="go">Naar de vraag <span class="kbd">Enter</span></button></div>`;
  }

  function renderQuestion() {
    phase = 'ask';
    opts = shuffle([q.a, ...q.w]);
    api.card.innerHTML = `
      <div class="qmeta"><span class="pill">Vraag ${n}</span><span class="pill">Geschiedenis</span></div>
      <div class="hist-q"><img class="flag" src="${item.flag}" alt="" width="36" height="24"><span>${esc(q.q)}</span></div>
      <div class="hist-opts" role="group" aria-label="Antwoorden">${opts.map((o, i) => `<button class="hist-opt" data-i="${i}"><span class="kbd">${i + 1}</span>${esc(o)}</button>`).join('')}</div>
      <p class="type-feedback" id="hist-fb" aria-live="assertive"></p>
      <div id="hist-after"></div>`;
  }

  function choose(i) {
    if (phase !== 'ask' || i < 0 || i >= opts.length) return;
    phase = 'done';
    const ok = opts[i] === q.a;
    api.answered(ok, { subType: read ? 'read' : 'ask' });
    api.card.querySelectorAll('.hist-opt').forEach((b, j) => {
      b.disabled = true;
      if (opts[j] === q.a) b.classList.add('ok');
      else if (j === i) b.classList.add('bad');
    });
    const fb = api.card.querySelector('#hist-fb');
    fb.className = 'type-feedback' + (ok ? ' ok' : '');
    fb.textContent = ok ? 'Goed!' : `Fout. Het juiste antwoord is: ${q.a}`;
    api.card.querySelector('#hist-after').innerHTML = `${factsHtml(item)}
      <div class="qactions" style="margin:14px auto 0"><button class="btn lg primary full" data-act="next">Volgende <span class="kbd">Enter</span></button></div>`;
  }

  return {
    ids,
    quizType: 'history',
    subMode: params.order === 'smart' ? 'thompson' : (read ? 'read' : 'ask'),
    endless: false,
    title: 'Geschiedenis',
    label: (read ? 'Eerst lezen, dan de vraag' : 'Meteen de vraag') + (params.order === 'smart' ? ' · slim herhalen' : ''),
    cheatItem: it => data[it.id] ? `<div class="cheat-cap hist-cheat"><b>${esc(it.name)}</b><ul>${data[it.id].facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : '',
    show(id, quizApi, num) {
      api = quizApi;
      if (!api.card.dataset.hist) {
        api.card.dataset.hist = '1';
        api.card.addEventListener('click', e => {
          const b = e.target.closest('[data-i]'); if (b) return choose(Number(b.dataset.i));
          const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
        });
      }
      item = api.ds.items.get(id);
      q = pickQuestion(id);
      n = num;
      read ? renderRead() : renderQuestion();
    },
    onKey(e) {
      if (/^[1-4]$/.test(e.key)) return choose(Number(e.key) - 1);
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (phase === 'read') act('go');
        else if (phase === 'done') act('next');
      }
    }
  };

  function act(a) {
    if (a === 'go' && phase === 'read') renderQuestion();
    else if (a === 'next' && phase === 'done') api.next();
  }
}
