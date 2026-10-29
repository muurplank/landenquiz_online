// Text helpers for typed answers.

export const normalize = s => (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** True when the input is at most `max` edits away from one of the accepted answers. */
export function isCloseEnough(input, accepted, max = 3) {
  const n = normalize(input);
  if (!n) return false;
  return accepted.some(t => { const tn = normalize(t); return tn && levenshtein(n, tn) <= max; });
}

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Blurred stand-in until the answer is revealed; unveil() animates the real answer in.
 *  The stand-in is the same for every question, so its length or colours give nothing away. */
export const veil = (kind = 'text') => `<div class="censored" aria-hidden="true">${kind === 'flag'
  ? '<div class="qflag small"></div>' : '<div class="a">Verborgen antwoord</div>'}</div>`;
export const unveil = html => `<div class="unveil">${html}</div>`;
