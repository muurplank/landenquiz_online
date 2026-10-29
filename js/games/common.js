// Shared pieces for the games: country input with suggestions, distances between countries, scores.
import { normalize, levenshtein, escapeHtml as esc } from '../core/text.js';
import { prefs } from '../ui/shell.js';

/** Up to `max` points per country (all rings, evenly sampled) for distance calculations. */
export function samplePoints(feature, max = 500) {
  const pts = [];
  for (const poly of feature.geometry.coordinates) for (const ring of poly) for (const p of ring) pts.push(p);
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  return Array.from({ length: max }, (_, i) => pts[Math.floor(i * step)]);
}

const R = 6371, rad = Math.PI / 180;
export function haversineKm(a, b) {
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest border-to-border distance in km (0 for neighbours). */
export function countryDistanceKm(aPts, bPts) {
  let best = Infinity;
  for (const a of aPts) for (const b of bPts) { const d = haversineKm(a, b); if (d < best) best = d; }
  return best;
}

/**
 * Text input with suggestions from every country (so it never gives away the answer).
 * Calls onPick(id) for a recognised country, onUnknown(text) otherwise.
 */
export function countryInput(form, ds, { onPick, onUnknown, placeholder = 'Typ een land…', exclude = () => false }) {
  const all = [...ds.items.values()].map(it => ({ id: it.id, name: it.name, n: normalize(it.name) }));
  form.classList.add('type-row');
  form.setAttribute('autocomplete', 'off');
  form.innerHTML = `
    <label class="visually-hidden" for="${form.id}-input">Land</label>
    <div class="suggest-wrap">
      <input id="${form.id}-input" class="type-input" placeholder="${esc(placeholder)}" spellcheck="false" autocapitalize="off" enterkeyhint="go">
      <div class="suggest" hidden></div>
    </div>
    <button class="btn lg primary" type="submit">Gok <span class="kbd">Enter</span></button>`;
  const input = form.querySelector('input'), box = form.querySelector('.suggest');
  let list = [], sel = 0;
  function paint() {
    box.hidden = !list.length;
    box.innerHTML = list.map((c, i) => `<button type="button" class="${i === sel ? 'on' : ''}" data-sug="${c.id}"><img class="flag" src="${ds.items.get(c.id).flag}" alt="" width="24" height="16">${esc(c.name)}</button>`).join('');
  }
  input.addEventListener('input', () => {
    const q = normalize(input.value);
    const pool = all.filter(c => !exclude(c.id));
    list = q ? pool.filter(c => c.n.startsWith(q)).concat(pool.filter(c => !c.n.startsWith(q) && c.n.includes(q))).slice(0, 6) : [];
    sel = 0; paint();
  });
  input.addEventListener('keydown', e => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length) {
      e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length; paint();
    }
    if (e.key === 'Escape') { list = []; paint(); }
  });
  box.addEventListener('click', e => { const b = e.target.closest('[data-sug]'); if (b) pick(b.dataset.sug); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = normalize(input.value); if (!q) return;
    let c = list[sel];
    if (!c || (c.n !== q && !c.n.startsWith(q) && levenshtein(c.n, q) > 3)) {
      const best = all.map(x => ({ x, d: levenshtein(x.n, q) })).sort((a, b) => a.d - b.d)[0];
      c = best && best.d <= 3 ? best.x : null;
    }
    if (c) pick(c.id); else onUnknown && onUnknown(input.value);
  });
  function pick(id) { input.value = ''; list = []; paint(); onPick(id); input.focus(); }
  return { focus: () => input.focus(), input };
}

/** Per-game win statistics in localStorage. */
export function gameStats(key) {
  const s = Object.assign({ played: 0, won: 0, streak: 0, best: 0, guesses: [] }, prefs.get(key, {}));
  return {
    data: s,
    record(won, guesses) {
      s.played++;
      if (won) { s.won++; s.streak++; s.best = Math.max(s.best, s.streak); s.guesses = s.guesses.concat(guesses).slice(-50); } else s.streak = 0;
      prefs.set(key, s);
    },
    get avg() { return s.guesses.length ? (s.guesses.reduce((a, b) => a + b, 0) / s.guesses.length).toFixed(1).replace('.', ',') : '–'; }
  };
}

export const fmtKm = km => km < 1 ? 'grenst eraan' : `${Math.round(km).toLocaleString('nl-NL')} km`;
