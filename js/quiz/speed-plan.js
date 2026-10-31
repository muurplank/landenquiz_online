// Pure rules of the Snelheidstest (no DOM): answer matching, scoring, which countries are slow,
// and the drill that repeats them with other questions in between until they come up fast.
import { normalize } from '../core/text.js';

export const LIMIT_MS = 10000;     // per question; a miss counts as this long, so skipping never pays
export const DRILL_MAX = 15;       // a drill stays short: the rest comes up next time
export const FAST_HITS = 2;        // times in a row within the target before a country is done
export const GAP = 3;              // questions before a country comes back, right away only tests short-term memory
const TARGET_MIN = 800, TARGET_MAX = 2500;

const fold = s => normalize(s).replace(/[^\p{L}\p{N}]/gu, '');

/** Exact apart from capitals, accents, spaces and hyphens: the answer is accepted while typing,
 *  so a tolerance would pass "Iran" for "Irak". */
export function isExact(input, accepted) {
  const n = fold(input);
  return !!n && accepted.some(a => fold(a) === n);
}

export const scoreMs = results => results.reduce((sum, r) => sum + (r.ok ? r.ms : LIMIT_MS), 0);

/** The target is your own median: slow countries have to get as fast as your normal ones. */
export function targetMs(results) {
  const t = results.filter(r => r.ok).map(r => r.thinkMs).sort((a, b) => a - b);
  if (!t.length) return TARGET_MAX;
  const m = t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2;
  return Math.min(TARGET_MAX, Math.max(TARGET_MIN, m));
}

/** Missed countries first, then the slowest quarter above the target (at least 3, at most DRILL_MAX). */
export function pickSlow(results, target = targetMs(results)) {
  const missed = results.filter(r => !r.ok);
  const slow = results.filter(r => r.ok && r.thinkMs > target).sort((a, b) => b.thinkMs - a.thinkMs);
  const n = Math.max(3, Math.ceil(results.length / 4));
  return [...missed, ...slow].slice(0, Math.min(n, DRILL_MAX)).map(r => r.id);
}

const sameTest = (s, { dataset, groupId, dir }) => s.quizType === 'snel' && s.speed && s.groupId === groupId
  && (s.dataset || 'world') === dataset && (s.subMode === dir || s.subMode === `${dir}-train`);

/** Full tests only, oldest first. */
export const pastScores = (history, key) => history.sessions
  .filter(s => sameTest(s, key) && s.subMode === key.dir && s.speed.scoreMs != null).map(s => s.speed.scoreMs);

/** Latest cold measurement per country (null = missed). Sessions store only the first ask of each
 *  country, so a country drilled to speed stays on the list until it is still fast a session later. */
export function latestTimes(history, key) {
  const times = new Map();
  for (const s of history.sessions) if (sameTest(s, key)) for (const [id, ms] of Object.entries(s.speed.times || {})) times.set(id, ms);
  return times;
}

export const timesToResults = (times, ids) => ids.filter(id => times.has(id))
  .map(id => (times.get(id) === null ? { id, ok: false, thinkMs: null } : { id, ok: true, thinkMs: times.get(id) }));

/** Call next(), then record() with the answer to it; next() gives null when everything is fast. */
export class Drill {
  constructor(ids, target, fillers = [], rand = Math.random) {
    Object.assign(this, { target, fillers, rand, queue: [...ids], hits: new Map(), askedAt: new Map(), count: 0 });
  }

  get left() { return this.queue.length; }

  next() {
    if (!this.queue.length) return null;
    const id = this.queue[0];
    const since = this.count - (this.askedAt.has(id) ? this.askedAt.get(id) : -GAP);
    this.count++;
    if (since < GAP && this.fillers.length) return this.fillers[Math.floor(this.rand() * this.fillers.length)];
    this.queue.shift();
    this.pending = id;
    this.askedAt.set(id, this.count - 1);
    return id;
  }

  /** Returns true when the answer counted as fast. A filler question changes nothing. */
  record(id, ok, thinkMs) {
    const fast = ok && thinkMs <= this.target;
    if (id !== this.pending) return fast;
    this.pending = null;
    const hits = fast ? (this.hits.get(id) || 0) + 1 : 0;
    this.hits.set(id, hits);
    if (hits < FAST_HITS) this.queue.splice(Math.min(GAP - 1, this.queue.length), 0, id);
    return fast;
  }
}
