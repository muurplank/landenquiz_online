// "Op tempo": question order for stuff you already know. Every (country, skill) pair keeps a need
// score: how slow you are compared to your own speed in the same context. Slow pairs come more
// often, fast ones less, but never never. No DOM here; the engine calls this.
//
//  processAnswer  -> turns one answer into a cleaned, relative time and updates the pair
//  computeNeed    -> need and sampling weight of a pair
//  pickNext       -> weighted draw with a hard gap, errors back after a few questions
//
// Items sync between devices as [m*100, n*10, day, flags]; baselines are per device.

export const P = {
  rho: 0.5,       // transfer: a new skill starts at rho × the country mean
  n0: 2,          // prior weight on the first measurements
  aMin: 0.2,      // after that an EMA: the last ~5 cold measurements count
  c: 0.12,        // forgetting per doubling of the days since the last cold measurement
  rLo: -0.8, rHi: 1.0, rErr: 1.2,
  typo: 0.3,      // an accepted typo is a slower answer
  R: 5,           // the slowest pair is asked at most R× as often as the fastest
  beta: 0.4,      // exploration bonus for pairs with few measurements
  eta: 0.05,      // baseline learning rate
  wrecTau: 90,    // seconds: a repeat soon after the last ask hardly counts
  Tmax: 28,       // days: after this a pair is overdue and jumps the queue
  minMs: 250, maxMs: 15000,
  ceilRatio: 1.15, ceilMin: 30, p10Keep: 50,
  legacyMax: 1.5, // old, impure measurements never weigh more than this
  seedW: 0.3,     // weight of one old measurement in the seed
  selfDirectW: 0.4, // a self-rated "good" without revealing is unverified
  control: false  // evaluation: arm 1 pairs drawn uniformly (off until there is a baseline)
};
const LAMBDA = Math.log(P.R) / 2;
const N_MAX = 20;
const FLAG_ERR = 1, STREAK_SHIFT = 1, FLAG_LEGACY = 8;
const BASE_MIN = 15, WARM = 5;

// How much a correct answer's time counts, per way of answering (report, table 5.7).
const FORM_W = { typed: 0.9, self_reveal: 0.7, self_direct: 0.7, list: 0.3, click: 0.6, locate: 0.4, mc: 0.6, none: 0 };
const POINTING = new Set(['click', 'locate', 'list']);
const B0 = ev => {
  switch (ev.answerMode) {
    case 'typed': return Math.log(1500);
    case 'self_reveal': case 'self_direct': case 'mc': return Math.log(ev.answerMode === 'mc' ? 1500 + 350 * Math.log2((ev.k || 2) + 1) : 2000);
    case 'click': return Math.log(2500);
    case 'list': case 'locate': return Math.log(3000);
    default: return 0;
  }
};

export const clip = (x, a, b) => Math.min(b, Math.max(a, x));
export const stale = d => Math.min(0.8, P.c * Math.log2(1 + Math.max(0, d)));
export const dayOf = (ms = Date.now()) => Math.floor(ms / 864e5);
export const keyOf = (country, skill) => `${country}|${skill}`;
export const parseKey = key => { const [country, skill] = key.split('|'); return { country, skill }; };
export const isLegacy = it => !!(it && it.flags & FLAG_LEGACY);

const streakOf = it => (it.flags >> STREAK_SHIFT) & 3;
const setStreak = (it, s) => { it.flags = (it.flags & ~(3 << STREAK_SHIFT)) | (s << STREAK_SHIFT); };
const setBucket = n => (n <= 12 ? 'S' : n <= 30 ? 'M' : n <= 60 ? 'L' : 'XL');

// Revealing and rating directly are the same recall up to the key press, so they share a baseline:
// people reveal mostly on hard countries, and a baseline of only those would make them look normal.
const baseMode = ev => (ev.answerMode === 'self_reveal' || ev.answerMode === 'self_direct' ? 'self' : ev.answerMode);

/** Lists are bucketed by their length, clicking on the map by the size of the set (what is in view is unstable). */
export function ctxKey(ev) {
  const bucket = ev.answerMode === 'list' ? `|${setBucket(ev.k || ev.setSize || 0)}` : ev.answerMode === 'click' ? `|${setBucket(ev.setSize || 0)}` : '';
  return `${baseMode(ev)}|${ev.skill}|${ev.device}${bucket}`;
}
const fallbackKey = ev => `${baseMode(ev)}|${ev.device}`;

/** Baseline ln(RT) for this answer: the full context once it has enough data, else answerMode × device,
 *  else the mean of what the context saw so far including this answer (so the first residuals are ~0). */
export function baselineFor(baselines, ev, lnRt) {
  const full = baselines[ctxKey(ev)], fb = baselines[fallbackKey(ev)];
  const b = full && full.n >= BASE_MIN ? full : fb && fb.n >= BASE_MIN ? fb : full;
  if (!b) return lnRt ?? B0(ev);
  if (b.n < WARM) return lnRt == null ? b.B : (b.s + lnRt) / (b.n + 1);
  return b.B;
}

function updateBaseline(baselines, ev, lnRt, cold) {
  for (const key of [ctxKey(ev), fallbackKey(ev)]) {
    const b = baselines[key] || (baselines[key] = { B: B0(ev), n: 0, s: 0 });
    b.s += lnRt;
    b.n++;
    b.B = b.n <= WARM ? b.s / b.n : b.B + P.eta * clip(lnRt - b.B, -1, 1);
    if (cold && key === ctxKey(ev)) { (b.p10 || (b.p10 = [])).push(Math.round(ev.rtMs / 10)); if (b.p10.length > P.p10Keep) b.p10.shift(); }
  }
}

/** 10th percentile of your cold correct times in this context, ×1.15; null until there are 30. */
function ceilingMs(baselines, ev) {
  const b = baselines[ctxKey(ev)];
  if (!b || !b.p10 || b.p10.length < P.ceilMin) return null;
  const s = [...b.p10].sort((x, y) => x - y);
  return s[Math.floor(s.length * 0.1)] * 10 * P.ceilRatio;
}

export function countryMean(items, country) {
  const own = Object.entries(items).filter(([k, it]) => k.startsWith(country + '|') && it.n > 0).map(([, it]) => it.m);
  return own.length ? own.reduce((a, b) => a + b, 0) / own.length : null;
}

/**
 * ev: {country, skill, answerMode, device, correct, rtMs, tMs, k?, setSize?, hidden?, cheatOpen?,
 *      editDist?, confusable?, distKm?, wForm?, wErr?}. Mutates items, baselines and session. Returns the item.
 */
export function processAnswer(ev, items, baselines, session, today = dayOf()) {
  const key = keyOf(ev.country, ev.skill);
  // A key or click within 250 ms of the question is a mis-press, right or wrong: book nothing,
  // only keep the country from coming straight back. The next ask still counts as cold.
  if (ev.answerMode !== 'none' && ev.rtMs != null && ev.rtMs < P.minMs) {
    session.lastCountryTrial.set(ev.country, session.trial);
    session.trial++;
    return items[key] || null;
  }
  const it = items[key] || { m: 0, n: 0, day: null, flags: 0 };
  const cold = !session.lastTrial.has(key);
  const correct = !!ev.correct && !ev.confusable;

  let r, w;
  if (!correct) { r = P.rErr; w = ev.wErr ?? (ev.device === 'coarse' && POINTING.has(ev.answerMode) ? 0.7 : 1); }
  else {
    const lnRt = Math.log(Math.max(1, ev.rtMs || 0));
    const B = baselineFor(baselines, ev, lnRt);
    const rtValid = !ev.hidden && !ev.cheatOpen && ev.rtMs >= P.minMs && ev.rtMs <= Math.max(P.maxMs, 6 * Math.exp(B));
    if (!rtValid) return finish(it, key, items, session, ev, correct);
    r = clip(lnRt - B, P.rLo, P.rHi);
    if (ev.editDist > 0) r += P.typo;
    if (ev.distKm != null && ev.distKm > 50) r += 0.3 * Math.min(1, (ev.distKm - 50) / 200);
    r = Math.min(r, P.rErr);
    w = ev.wForm ?? FORM_W[ev.answerMode] ?? 0;
    if (ev.answerMode === 'self_direct') w *= P.selfDirectW;
    if (ev.k > 1 && (ev.answerMode === 'mc' || ev.answerMode === 'list')) w *= 1 - 1 / ev.k;
    const ceil = ceilingMs(baselines, ev);
    updateBaseline(baselines, ev, lnRt, cold);
    if (cold) setStreak(it, ceil !== null && !isLegacy(it) && ev.rtMs <= ceil ? Math.min(3, streakOf(it) + 1) : 0);
  }
  if (!cold) w *= 0.3 * (1 - Math.exp(-((ev.tMs - session.lastTime.get(key)) / 1000) / P.wrecTau));
  if (w <= 0) return finish(it, key, items, session, ev, correct);

  const rAdj = r - (it.day == null ? 0 : stale(today - it.day));
  if (it.n === 0) { const cm = countryMean(items, ev.country); it.m = cm === null ? 0 : P.rho * cm; }
  const a = Math.max(1 / (it.n + P.n0), P.aMin);
  it.m += a * w * (rAdj - it.m);
  it.n = Math.min(N_MAX, it.n + w);
  if (cold) { it.day = today; if (correct) it.flags &= ~FLAG_LEGACY; }
  if (!correct) setStreak(it, 0);
  return finish(it, key, items, session, ev, correct);
}

function finish(it, key, items, session, ev, correct) {
  it.flags = correct ? it.flags & ~FLAG_ERR : it.flags | FLAG_ERR;
  items[key] = it;
  session.lastTrial.set(key, session.trial);
  session.lastTime.set(key, ev.tMs);
  session.lastCountryTrial.set(ev.country, session.trial);
  if (!correct) session.errQueue.push({ key, dueTrial: session.trial + session.gErr + 1 });
  session.trial++;
  return it;
}

export function computeNeed(it, today = dayOf()) {
  if (!it || it.n === 0) return { need: P.beta, weight: Math.exp(LAMBDA * P.beta) };
  const d = it.day == null ? 0 : today - it.day;
  if (d >= P.Tmax) return { need: 1, weight: 4 * Math.sqrt(P.R) };
  if (streakOf(it) >= 2) return { need: -1, weight: Math.exp(-LAMBDA) };
  const need = it.m + stale(d) + P.beta / Math.sqrt(it.n + 1);
  return { need, weight: Math.exp(LAMBDA * clip(need, -1, 1)) };
}

export const gapFor = N => ({ g: Math.min(4, Math.floor(N / 3)), kappa: Math.max(2, N / 4), gErr: Math.max(1, Math.min(3, N - 1)) });
/** Questions per session: 1.5 per country, doubled when there are two or more skills, 15 to 40. */
export const sessionLength = (N, S = 1) => clip(Math.round(1.5 * N * Math.min(S, 2)), 15, 40);

export function newSession(N) {
  return { trial: 0, lastTrial: new Map(), lastTime: new Map(), lastCountryTrial: new Map(), errQueue: [], ...gapFor(N) };
}

/** Evaluation arm of a pair, fixed per account so every device agrees: 0 = tempo, 1 = control. */
export function armOf(uid, key) {
  let h = 2166136261;
  for (const ch of `${uid || ''}${key}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h & 1;
}

/** candidates: [{country, skill}]. Returns one of them. */
export function pickNext(candidates, items, session, today = dayOf(), rand = Math.random, uid = '') {
  const { g, kappa } = session;
  const due = session.errQueue.find(e => e.dueTrial <= session.trial);
  if (due) { session.errQueue.splice(session.errQueue.indexOf(due), 1); return parseKey(due.key); }
  const fs = candidates.map(c => {
    const last = session.lastTrial.get(keyOf(c.country, c.skill));
    let f = 1;
    if (last != null) { const k = session.trial - last; f = k <= g ? 0 : 1 - Math.exp(-(k - g) / kappa); }
    const lastC = session.lastCountryTrial.get(c.country);
    if (lastC != null && session.trial - lastC <= 1) f = 0;
    return f;
  });
  let ws = candidates.map((c, i) => computeNeed(items[keyOf(c.country, c.skill)], today).weight * fs[i]);
  if (P.control) {
    // Arm 1 is drawn uniformly; both arms get half of the turns.
    const arms = candidates.map(c => armOf(uid, keyOf(c.country, c.skill)));
    const sum = [0, 0];
    ws = ws.map((w, i) => { const v = arms[i] ? fs[i] : w; sum[arms[i]] += v; return v; });
    if (sum[0] > 0 && sum[1] > 0) ws = ws.map((v, i) => v / sum[arms[i]]);
  }
  const sum = ws.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const open = candidates.filter(c => session.lastCountryTrial.get(c.country) !== session.trial - 1);
    const pool = open.length ? open : candidates;
    return pool[Math.floor(rand() * pool.length)];
  }
  let u = rand() * sum;
  for (let i = 0; i < ws.length; i++) { u -= ws[i]; if (u <= 0) return candidates[i]; }
  return candidates[candidates.length - 1];
}

/* ---------- For display ---------- */

export const levelOf = m => (m <= -0.2 ? 'snel' : m >= 0.2 ? 'traag' : 'gemiddeld');
const LABELS = { 'land>capital': 'Hoofdstad', 'capital>land': 'Hoofdstad → land', 'flag>land': 'Vlag', 'land>flag': 'Land → vlag', 'map>land': 'Kaart', 'land>map': 'Zoek op kaart', 'capital>map': 'Hoofdstad op kaart', 'outline>land': 'Omtrek' };
const PART = { land: 'land', capital: 'hoofdstad', flag: 'vlag', map: 'kaart', outline: 'omtrek' };
export function skillLabel(skill) {
  if (LABELS[skill]) return LABELS[skill];
  const [a, b] = skill.split('>'), from = PART[a] || a;
  return `${from[0].toUpperCase() + from.slice(1)} → ${PART[b] || b}`;
}

/** How well you know a country, slowest skill first; null when nothing is measured.
 *  `m` is the model's cautious mean (pulled towards 0 while there are few measurements) and drives the order;
 *  `est` is what the measurements themselves say (the update behaves like a mean with one prior measurement, so
 *  m·(n+1)/n), and that is what `level` and `rel` (your time relative to your own baseline, ×0,8 = faster) show.
 *  `legacy` = only estimated from old sessions. */
export function countrySummary(items, country) {
  const estOf = it => clip(it.m * (it.n + 1) / it.n, -1.2, 1.2);
  const skills = Object.entries(items).filter(([k, it]) => k.startsWith(country + '|') && it.n > 0)
    .map(([k, it]) => { const est = estOf(it); return { skill: parseKey(k).skill, m: it.m, n: it.n, est, rel: Math.exp(est), level: levelOf(est), err: !!(it.flags & FLAG_ERR), legacy: isLegacy(it) }; })
    .sort((a, b) => b.est - a.est);
  if (!skills.length) return null;
  const mean = f => skills.reduce((s, x) => s + f(x), 0) / skills.length;
  const est = mean(x => x.est);
  return { m: mean(x => x.m), est, n: skills.reduce((s, x) => s + x.n, 0), rel: Math.exp(est), level: levelOf(est), legacy: skills.every(s => s.legacy), err: skills.some(s => s.err), skills };
}

/* ---------- Storage ---------- */

export const encodeItems = items => Object.fromEntries(Object.entries(items).filter(([, it]) => it.n > 0 || it.flags)
  .map(([k, it]) => [k, [Math.round(it.m * 100), Math.round(it.n * 10), it.day ?? 0, it.flags | 0]]));

export const decodeItems = enc => Object.fromEntries(Object.entries(enc || {}).map(([k, [m, n, day, flags]]) => [k, { m: m / 100, n: n / 10, day: day || null, flags: flags | 0 }]));

/** Per item the newest day wins, on a tie the one with more measurements (local first). */
export function mergeTempo(a, b) {
  const items = { ...(b.items || {}) };
  for (const [k, v] of Object.entries(a.items || {})) {
    const o = items[k];
    if (!o || v[2] > o[2] || (v[2] === o[2] && v[1] >= o[1])) items[k] = v;
  }
  return { ...b, ...a, v: 1, items };
}

/* ---------- Old history ---------- */

const SUB_SKILL = {
  'land-to-capital': 'land>capital', 'capital-to-land': 'capital>land', 'flag-to-land': 'flag>land', 'land-to-flag': 'land>flag',
  snelle: 'map>land', satellite: 'map>land', 'continent-only': 'map>land', zoek: 'land>map', locate: 'capital>map'
};
const TYPE_SKILL = { outline: 'outline>land', capital: 'land>capital', flag: 'flag>land', map: 'map>land' };

/** Skill of an old event; null when the sub type says nothing about the direction (or the type has no time worth using). */
export function skillOf(quizType, subType) {
  if (quizType === 'mix') { const m = /^mega-(\w+)-(\w+)$/.exec(subType || ''); return m ? `${m[1]}>${m[2]}` : null; }
  if (subType in SUB_SKILL) return SUB_SKILL[subType];
  if (quizType === 'outline') return TYPE_SKILL.outline;
  if (/^[a-z]+-[a-z]+$/.test(subType || '') && quizType in TYPE_SKILL) { const [a, b] = subType.split('-'); return `${a}>${b}`; }
  return null;
}

/** One-time seed from sessions with per-answer times: first correct answer per item per session, weight 0.3, n capped. */
export function seedFromHistory(history, today = dayOf()) {
  const rows = [];
  for (const s of history.sessions || []) {
    if (!s.endedAt) continue;
    for (const [country, st] of Object.entries(s.perCountryStats || {})) {
      let seen = false;
      for (const e of st.events || []) {
        const skill = skillOf(e.quizType || s.quizType, e.subType || s.subMode);
        if (!skill) continue;
        const ok = e.result === 'correct';
        if (ok && seen) continue;
        if (!ok && e.responseTimeMs < P.minMs) continue;   // a mis-press, not a mistake
        seen = seen || ok;
        rows.push({ country, skill, ok, ms: e.responseTimeMs, ctx: `${e.quizType || s.quizType}|${e.subType || s.subMode}`, t: Date.parse(e.timestamp || s.startedAt) || 0 });
      }
    }
  }
  const base = {};
  rows.filter(r => r.ok && r.ms > P.minMs && r.ms < P.maxMs).forEach(r => { const b = base[r.ctx] || (base[r.ctx] = { s: 0, n: 0 }); b.s += Math.log(r.ms); b.n++; });
  const items = {};
  for (const r of rows.sort((a, b) => a.t - b.t)) {
    const b = base[r.ctx];
    let rr;
    if (!r.ok) rr = P.rErr;
    else if (!b || !(r.ms > P.minMs && r.ms < P.maxMs)) continue;
    else rr = clip(Math.log(r.ms) - b.s / b.n, P.rLo, P.rHi);
    const key = keyOf(r.country, r.skill);
    const it = items[key] || (items[key] = { m: 0, n: 0, day: null, flags: FLAG_LEGACY });
    const day = dayOf(r.t);
    const rAdj = rr - (it.day == null ? 0 : stale(day - it.day));
    const w = P.seedW, a = Math.max(1 / (it.n + P.n0), P.aMin);
    it.m += a * w * (rAdj - it.m);
    it.n = Math.min(P.legacyMax, it.n + w);
    it.day = day;
    it.flags = r.ok ? it.flags & ~FLAG_ERR : it.flags | FLAG_ERR;
  }
  return items;
}
