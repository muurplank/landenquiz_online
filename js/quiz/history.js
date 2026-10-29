// Geschiedenis: per land (of staat) vijf weetjes uit data/history.json (wereld) of
// data/<dataset>/history.json, met per weetje één vraag: meerkeuze, waar/niet waar of zelf typen.
// Daarnaast maakt de quiz zelf vragen die weetjes combineren:
//   eerder   – welke van twee gebeurtenissen (ook uit verschillende landen) was eerst?
//   volgorde – zet drie gebeurtenissen van één land op volgorde
//   welk     – bij welk land hoort dit weetje (naam weggelaten)?
// Na elk antwoord staan de weetjes van het land eronder. Met "Eerst lezen" zie je ze vóór de vraag.
// Toetsen: 1-4 kiest, Enter/Spatie gaat door.
import { loadJSON } from '../core/data.js';
import { escapeHtml as esc, isCloseEnough, normalize } from '../core/text.js';

const COMBO_CHANCE = .35;
const MIN_GAP = 10;   // jaren verschil voor "Wat gebeurde eerder?"

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
// Jaartallen in een weetje wegpoetsen, anders verraadt de tekst het antwoord.
const maskYears = s => s.replace(/\b\d{3,4}(\s*v\.\s*Chr\.)?/g, '····');
const yearLabel = y => y < 0 ? `${-y} v.Chr.` : String(y);

export async function createMode({ ds, group, params }) {
  const data = await loadJSON(ds.name === 'world' ? 'data/history.json' : `data/${ds.name}/history.json`);
  const ids = group.countries.filter(id => ds.items.has(id) && data[id]);
  if (!ids.length) throw new Error('Voor deze set zijn nog geen geschiedenisvragen.');
  const read = params.dir === 'read';
  const N = ds.noun;
  const queue = {};   // id → nog niet gestelde eigen vragen (door elkaar), zodat elk weetje aan de beurt komt

  let api, item, Q, phase, n, order;
  const $ = s => api.card.querySelector(s);
  const it = id => ds.items.get(id);
  const flag = (id, w = 24) => `<img class="flag" src="${it(id).flag}" alt="" width="${w}" height="${w * 2 / 3}">`;

  /* ---------- Vragen kiezen ---------- */
  function nextOwn(id) {
    if (!queue[id] || !queue[id].length) queue[id] = shuffle(data[id].questions);
    const q = queue[id].pop();
    return { kind: q.type, q, facts: [[id, q.f]] };
  }

  // Alleen weetjes met precies één datering, anders is niet duidelijk welke gebeurtenis bedoeld wordt.
  const dateCount = t => (t.match(/\b\d{3,4}\b/g) || []).length + (t.match(/eeuw/g) || []).length;
  // [id, weetje, jaar, alleen een eeuw?]. Een eeuw is als middenjaar opgeslagen, dus dan ruime marge.
  const dated = id => data[id].years.map((y, f) => [id, f, y, !/\b\d{3,4}\b/.test(data[id].facts[f])])
    .filter(x => x[2] !== null && x[2] !== undefined && dateCount(data[id].facts[x[1]]) === 1);
  const apart = (a, b, min) => Math.abs(a[2] - b[2]) >= (a[3] || b[3] ? 100 : min);

  function comboEerder(id) {
    const own = dated(id);
    if (!own.length) return null;
    const others = shuffle(ids.filter(o => o !== id)).flatMap(dated).concat(own);
    for (const a of shuffle(own)) {
      const b = others.find(x => !(x[0] === a[0] && x[1] === a[1]) && apart(x, a, MIN_GAP));
      if (b) return { kind: 'eerder', items: shuffle([a, b]), facts: [a, b] };
    }
    return null;
  }

  function comboVolgorde(id) {
    const own = dated(id);
    for (let t = 0; t < 8 && own.length >= 3; t++) {
      const three = shuffle(own).slice(0, 3);
      const s = [...three].sort((a, b) => a[2] - b[2]);
      if (apart(s[0], s[1], 2) && apart(s[1], s[2], 2)) return { kind: 'volgorde', items: three, facts: three };
    }
    return null;
  }

  function comboWelk(id) {
    const fs = data[id].anon.map((a, f) => [f, a]).filter(x => x[1]);
    if (!fs.length) return null;
    const [f, text] = pick(fs);
    // Een land dat in het weetje zelf genoemd wordt, is geen eerlijke foute keuze.
    const fair = o => o !== id && !normalize(text).includes(normalize(it(o).name));
    let pool = ids.filter(fair);
    if (pool.length < 3) pool = pool.concat([...ds.items.keys()].filter(o => fair(o) && data[o] && !pool.includes(o) && it(o).region === it(id).region));
    if (pool.length < 3) return null;
    return { kind: 'welk', text, answer: id, options: shuffle([id, ...shuffle(pool).slice(0, 3)]), facts: [[id, f]] };
  }

  function choose(id) {
    if (Math.random() < COMBO_CHANCE) {
      const c = shuffle([comboEerder, comboVolgorde, comboWelk]).map(fn => fn(id)).find(Boolean);
      if (c) return c;
    }
    return nextOwn(id);
  }

  /* ---------- Weergave ---------- */
  const factsHtml = id => `
    <div class="hist-facts">
      <div class="hist-facts-h">${flag(id)}Weetjes over ${esc(it(id).name)}</div>
      <ul>${data[id].facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    </div>`;

  const optsHtml = labels => `<div class="hist-opts" role="group" aria-label="Antwoorden">${labels.map((l, i) => `<button class="hist-opt" data-i="${i}"><span class="kbd">${i + 1}</span>${l}</button>`).join('')}</div>`;
  const factCard = ([id, f], i, extra = '') => `<button class="hist-card" data-i="${i}">${extra}<span class="hc-who">${flag(id, 21)}${esc(it(id).name)}</span><span class="hc-t">${esc(maskYears(data[id].facts[f]))}</span></button>`;

  const KIND_LABEL = { mc: 'Meerkeuze', tf: 'Waar of niet waar', open: 'Zelf typen', eerder: 'Wat was eerder?', volgorde: 'Volgorde', welk: `${N.which} ${N.one}?` };

  function renderRead() {
    phase = 'read';
    api.card.innerHTML = `
      <div class="qmeta"><span class="pill">Vraag ${n}</span><span class="pill">Eerst lezen</span></div>
      <div class="qgiven hist-title">${esc(item.name)}</div>
      ${factsHtml(item.id)}
      <div class="qactions"><button class="btn lg primary full" data-act="go">Naar de vraag <span class="kbd">Enter</span></button></div>`;
  }

  function renderQuestion() {
    phase = 'ask';
    let body = '';
    const head = text => `<div class="hist-q">${flag(item.id, 36)}<span>${esc(text)}</span></div>`;
    if (Q.kind === 'mc') {
      Q.opts = shuffle([Q.q.a, ...Q.q.w]);
      body = head(Q.q.q) + optsHtml(Q.opts.map(esc));
    } else if (Q.kind === 'tf') {
      body = `<div class="hist-q-sub">Waar of niet waar?</div>` + head(Q.q.s) + optsHtml(['Waar', 'Niet waar']);
    } else if (Q.kind === 'open') {
      body = head(Q.q.q) + `
        <form class="type-row" id="hist-form" autocomplete="off">
          <label class="visually-hidden" for="hist-input">Jouw antwoord</label>
          <input id="hist-input" class="type-input" placeholder="Typ je antwoord…" enterkeyhint="done" spellcheck="false" autocapitalize="off">
          <button class="btn lg primary" type="submit">Controleer <span class="kbd">Enter</span></button>
        </form>`;
    } else if (Q.kind === 'eerder') {
      body = `<div class="hist-q"><span>Wat gebeurde eerder?</span></div><div class="hist-cards two">${Q.items.map((x, i) => factCard(x, i, `<span class="kbd">${i + 1}</span>`)).join('')}</div>`;
    } else if (Q.kind === 'volgorde') {
      order = [];
      body = head(`Zet deze gebeurtenissen uit ${item.name} op volgorde, de oudste eerst.`) + `<div class="hist-cards">${Q.items.map((x, i) => factCard(x, i, `<span class="kbd hc-n"></span>`)).join('')}</div>`;
    } else if (Q.kind === 'welk') {
      body = `<div class="hist-q"><span>Bij ${N.which.toLowerCase()} ${esc(N.one)} hoort dit weetje?</span></div>
        <blockquote class="hist-quote">${esc(Q.text)}</blockquote>` + optsHtml(Q.options.map(id => `${flag(id)}${esc(it(id).name)}`));
    }
    api.card.innerHTML = `
      <div class="qmeta"><span class="pill">Vraag ${n}</span><span class="pill">${KIND_LABEL[Q.kind]}</span></div>
      ${body}
      <p class="type-feedback" id="hist-fb" aria-live="assertive"></p>
      <div id="hist-after"></div>`;
    if (Q.kind === 'open') {
      const input = $('#hist-input');
      input.focus();
      $('#hist-form').addEventListener('submit', e => { e.preventDefault(); if (input.value.trim()) judgeOpen(input.value); });
    }
  }

  /* ---------- Beoordelen ---------- */
  function judgeOpen(value) {
    if (phase !== 'ask') return;
    const accepted = [Q.q.a, ...(Q.q.alt || [])];
    // Jaartallen moeten exact kloppen; namen mogen een kleine typfout hebben.
    const ok = /^\d+$/.test(normalize(Q.q.a).replace(/\s/g, ''))
      ? accepted.some(a => normalize(a).replace(/\D/g, '') === normalize(value).replace(/\D/g, ''))
      : isCloseEnough(value, accepted, Q.q.a.length <= 5 ? 1 : 2);
    $('#hist-input').disabled = true;
    finish(ok, ok ? '' : `Het juiste antwoord is: ${Q.q.a}`);
  }

  function pickOption(i) {
    if (phase !== 'ask') return;
    const btns = [...api.card.querySelectorAll('[data-i]')];
    if (i < 0 || i >= btns.length) return;
    if (Q.kind === 'volgorde') return pickOrder(i, btns);
    let ok, right;
    if (Q.kind === 'mc') { right = Q.opts.indexOf(Q.q.a); ok = i === right; }
    else if (Q.kind === 'tf') { right = Q.q.ok ? 0 : 1; ok = i === right; }
    else if (Q.kind === 'eerder') { right = Q.items[0][2] <= Q.items[1][2] ? 0 : 1; ok = i === right; }
    else if (Q.kind === 'welk') { right = Q.options.indexOf(Q.answer); ok = i === right; }
    else return;
    btns.forEach((b, j) => { b.disabled = true; if (j === right) b.classList.add('ok'); else if (j === i) b.classList.add('bad'); });
    let msg = '';
    if (Q.kind === 'tf') msg = Q.q.ok ? (ok ? '' : 'Het is wél waar.') : `Niet waar. ${Q.q.fix}`;
    else if (!ok && Q.kind === 'mc') msg = `Het juiste antwoord is: ${Q.q.a}`;
    else if (!ok && Q.kind === 'welk') msg = `Het juiste antwoord is: ${item.name}`;
    finish(ok, msg);
  }

  function pickOrder(i, btns) {
    const at = order.indexOf(i);
    if (at >= 0) order = order.slice(0, at); else order.push(i);
    btns.forEach((b, j) => { const k = order.indexOf(j); b.classList.toggle('picked', k >= 0); b.querySelector('.hc-n').textContent = k >= 0 ? k + 1 : ''; });
    if (order.length < Q.items.length) return;
    const ok = order.every((j, k) => k === 0 || Q.items[order[k - 1]][2] <= Q.items[j][2]);
    btns.forEach(b => { b.disabled = true; b.classList.add(ok ? 'ok' : 'bad'); });
    finish(ok, ok ? '' : 'Niet de goede volgorde.');
  }

  function finish(ok, msg) {
    phase = 'done';
    api.answered(ok, { subType: Q.kind });
    const fb = $('#hist-fb');
    fb.className = 'type-feedback' + (ok ? ' ok' : '');
    fb.textContent = ok ? `Goed! ${msg}`.trim() : (msg || 'Fout.');
    // Bij gecombineerde vragen eerst de gebeurtenissen mét jaartal, op volgorde.
    const timeline = (Q.kind === 'eerder' || Q.kind === 'volgorde')
      ? `<ol class="hist-timeline">${[...Q.items].sort((a, b) => a[2] - b[2]).map(([id, f, y]) => `<li><b>${yearLabel(y)}</b>${flag(id, 18)}<span>${esc(data[id].facts[f])}</span></li>`).join('')}</ol>` : '';
    const others = Q.kind === 'eerder' ? [...new Set(Q.items.map(x => x[0]))].filter(id => id !== item.id) : [];
    $('#hist-after').innerHTML = `${timeline}${factsHtml(item.id)}${others.map(factsHtml).join('')}
      <div class="qactions" style="margin:14px auto 0"><button class="btn lg primary full" data-act="next">Volgende <span class="kbd">Enter</span></button></div>`;
  }

  function act(a) {
    if (a === 'go' && phase === 'read') renderQuestion();
    else if (a === 'next' && phase === 'done') api.next();
  }

  return {
    ids,
    quizType: 'history',
    subMode: params.order === 'smart' ? 'thompson' : (read ? 'read' : 'ask'),
    endless: false,
    title: 'Geschiedenis',
    label: (read ? 'Eerst lezen, dan de vraag' : 'Meteen de vraag') + (params.order === 'smart' ? ' · slim herhalen' : ''),
    cheatItem: x => data[x.id] ? `<div class="cheat-cap hist-cheat"><b>${esc(x.name)}</b><ul>${data[x.id].facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : '',
    show(id, quizApi, num) {
      api = quizApi;
      if (!api.card.dataset.hist) {
        api.card.dataset.hist = '1';
        api.card.addEventListener('click', e => {
          const b = e.target.closest('[data-i]'); if (b) return pickOption(Number(b.dataset.i));
          const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
        });
      }
      item = it(id);
      Q = choose(id);
      n = num;
      read ? renderRead() : renderQuestion();
    },
    onKey(e) {
      if (/^[1-4]$/.test(e.key)) return pickOption(Number(e.key) - 1);
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (phase === 'read') act('go');
        else if (phase === 'done') act('next');
      }
    }
  };
}
