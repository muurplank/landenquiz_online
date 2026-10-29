// Daily games: local date, archive dates (?date=YYYY-MM-DD), seeded randomness and per-day results.
import { prefs } from '../ui/shell.js';

export const LAUNCH = '2026-10-29';
const RESULTS_KEY = 'landjes_daily_results';   // { game: { 'YYYY-MM-DD': {done, won, ...} } }

/** The daily games, in the order of the hub. */
export const DAILY_GAMES = [
  { id: 'warmkoud', href: 'warmkoud.html', title: 'Warm of koud', sub: 'Raad het land van de dag aan de hand van warmte.', color: 'heat', since: '2026-10-29' },
  { id: 'silhouet', href: 'silhouet.html', title: 'Silhouet', sub: 'Herken een land aan zijn vorm.', color: 'violet', since: '2026-10-29' },
  { id: 'grensroute', href: 'grensroute.html', title: 'Grensroute', sub: 'Reis van land naar land over de grens.', color: 'green', since: '2026-10-29' },
  { id: 'geotrivia', href: 'geotrivia.html', title: 'Geo trivia', sub: 'Tien snelle vragen over de wereld.', color: 'blue', since: '2026-10-29' },
  { id: 'kompas', href: 'kompas.html', title: 'Kompas', sub: 'Vijf buren in hun richting. Welk land ligt in het midden?', color: 'blue', since: '2026-10-29' }
];

const pad = n => String(n).padStart(2, '0');
export function localDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export const today = () => localDate();

/** The day being played: a valid ?date= from the archive, otherwise today. */
export function playDate() {
  const d = new URLSearchParams(location.search).get('date');
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= LAUNCH && d <= today() ? d : today();
}
export const isRandomMode = () => new URLSearchParams(location.search).get('mode') === 'random';

export function niceDate(d) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** All days from launch until today, newest first. */
export function archiveDates() {
  const out = [];
  const [y, m, d] = LAUNCH.split('-').map(Number);
  for (let t = new Date(y, m - 1, d); localDate(t) <= today(); t.setDate(t.getDate() + 1)) out.unshift(localDate(t));
  return out;
}

export function msToMidnight() {
  const now = new Date(), mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  return mid - now;
}

export function hash(s) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Seeded random generator (mulberry32): same seed, same sequence. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function results(game) { return (prefs.get(RESULTS_KEY, {})[game]) || {}; }
export function saveResult(game, date, result) {
  const all = prefs.get(RESULTS_KEY, {});
  all[game] = Object.assign(all[game] || {}, { [date]: result });
  prefs.set(RESULTS_KEY, all);
}
