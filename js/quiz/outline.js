// Omtrek: you see the outline of a country and name it. Rate yourself (space, 1, 2) or type the name.
import { isCloseEnough, escapeHtml as esc, veil, unveil, prevAnswer } from '../core/text.js';

const WRONG_FEEDBACK_MS = 2200;
const W = 400, H = 300;

export async function createMode({ ds, group, params }) {
  const typing = params.ans === 'type';
  const N = ds.noun;
  const geo = await MapView.loadGeo(ds.geo);
  // Only countries with a shape in the map file (a few anchor-only ones have none).
  const ids = group.countries.filter(id => ds.items.has(id) && geo.byId.has(id));

  let api = null, item = null, revealed = false, locked = false, prev = null;   // prev: vorige vraag, beoordeeld zonder antwoord te tonen

  // The outline in an equal-area projection centred on the country. First framed on the large parts
  // (at least 10% of the largest) that lie in a chain within ~2200 km of each other (Malaysia's two
  // halves, Indonesia, not French Guiana or Alaska). Then nearby islands are added (Croatia's coast);
  // far-away parts are left out instead of cut off at the edge.
  function shapeSvg(id) {
    const f = geo.byId.get(id), main = geo.main.get(id);
    const parts = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map(c => ({ type: 'Polygon', coordinates: c })) : [f.geometry];
    const biggest = Math.max(...parts.map(p => d3.geoArea(p)));
    const multi = ps => ({ type: 'MultiPolygon', coordinates: ps.map(p => p.coordinates) });
    const c = d3.geoCentroid(main);
    const proj = d3.geoAzimuthalEqualArea().rotate([-c[0], -c[1]]).clipAngle(150);
    const fit = ps => proj.fitExtent([[16, 16], [W - 16, H - 16]], multi(ps));
    const large = parts.filter(p => d3.geoArea(p) >= biggest * .1).map(p => ({ p, c: d3.geoCentroid(p) }));
    const core = [large.find(x => d3.geoArea(x.p) === biggest)];
    for (let added = true; added;) {
      added = false;
      for (const x of large) if (!core.includes(x) && core.some(y => d3.geoDistance(x.c, y.c) * 6371 < 2200)) { core.push(x); added = true; }
    }
    fit(core.map(x => x.p));
    const path = d3.geoPath(proj);
    const near = parts.filter(p => { const [[x0, y0], [x1, y1]] = path.bounds(p); return x1 > -W * .25 && x0 < W * 1.25 && y1 > -H * .25 && y0 < H * 1.25; });
    fit(near);
    return `<svg class="outline-shape" viewBox="0 0 ${W} ${H}" role="img" aria-label="Omtrek van ${esc(N.one)} om te raden"><path d="${path(multi(near))}"/></svg>`;
  }

  function revealHtml(it) {
    return `<div class="outline-ans"><img class="flag" src="${it.flag}" alt="" height="26"><div><div class="a">${esc(it.name)}</div><div class="c">Hoofdstad: ${esc(it.answers.join(', '))}</div></div></div>`;
  }

  function render(n) {
    const card = api.card;
    card.innerHTML = `
      <div class="qmeta"><div class="qmeta-l"><span class="pill">Vraag ${n}</span>${prevAnswer(prev)}</div><span class="pill">Omtrek → ${esc(N.one)}</span></div>
      ${shapeSvg(item.id)}
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
