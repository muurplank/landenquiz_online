import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, stale, processAnswer, computeNeed, pickNext, newSession, sessionLength, gapFor, encodeItems, decodeItems, mergeTempo, seedFromHistory, skillOf, armOf, levelOf, countrySummary, skillLabel } from '../js/core/tempo.js';

const near = (a, b, eps = 2e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const B = Math.log(1500);
const CTX = 'typed|land>capital|fine';
const fixedBase = () => ({ [CTX]: { B, n: 100 } });
const typed = (country, rtMs, extra = {}) => ({ country, skill: 'land>capital', answerMode: 'typed', device: 'fine', correct: true, rtMs, tMs: 0, ...extra });

// Worked examples from the report (chapter 5.8): B = ln 1500, R = 5, typing, no country mean.
test('new item: need is the exploration bonus', () => {
  const { need, weight } = computeNeed(undefined, 100);
  near(need, 0.4); near(weight, 1.3797);
});

test('first cold measurement shrinks towards the prior', () => {
  const items = {}, session = newSession(10);
  const it = processAnswer(typed('DE', 1200), items, fixedBase(), session, 100);
  near(it.m, -0.1004); near(it.n, 0.9);
  const { need, weight } = computeNeed(it, 100);
  near(need, 0.1898); near(weight, 1.1650);
});

test('an accepted typo costs 0.3 on top of the slow residual', () => {
  const it = processAnswer(typed('FR', 3500, { editDist: 1 }), {}, fixedBase(), newSession(10), 100);
  near(it.m, 0.5163);
  near(computeNeed(it, 100).weight, 1.9136);
});

test('next day: the delay correction forgives part of a slow answer', () => {
  const items = {};
  processAnswer(typed('DE', 1200), items, fixedBase(), newSession(10), 100);
  const it = processAnswer(typed('DE', 950), items, fixedBase(), newSession(10), 101);
  near(it.m, -0.2482); near(it.n, 1.8);
  near(computeNeed(it, 101).need, -0.0092);
});

test('14 days unseen: need is capped, weight is √R', () => {
  const items = {};
  processAnswer(typed('FR', 3500, { editDist: 1 }), items, fixedBase(), newSession(10), 100);
  near(stale(14), 0.4688);
  near(computeNeed(items['FR|land>capital'], 114).weight, Math.sqrt(5));
});

test('a mistake counts as 1.2 with full weight and goes into the error queue', () => {
  const items = {}, session = newSession(10);
  processAnswer(typed('FR', 3500, { editDist: 1 }), items, fixedBase(), newSession(10), 100);
  const it = processAnswer(typed('FR', 2000, { correct: false }), items, fixedBase(), session, 114);
  near(it.m, 0.5904); near(it.n, 1.9);
  assert.equal(it.flags & 1, 1);
  assert.deepEqual(session.errQueue, [{ key: 'FR|land>capital', dueTrial: 4 }]);
});

test('a confusable answer (Iran for Irak) is a mistake even when the quiz accepted it', () => {
  const it = processAnswer(typed('IRQ', 800, { confusable: true }), {}, fixedBase(), newSession(10), 100);
  near(it.m, 0.6); assert.equal(it.flags & 1, 1);
});

test('a repeat 20 s later weighs about 7% of a cold measurement', () => {
  const items = {}, session = newSession(10);
  processAnswer(typed('DE', 1200), items, fixedBase(), session, 100);
  const before = items['DE|land>capital'].m;
  processAnswer(typed('DE', 700, { tMs: 20000 }), items, fixedBase(), session, 100);
  const full = -0.1004 + (1 / (0.9 + 2)) * 0.9 * (Math.log(700) - B - before);
  const got = items['DE|land>capital'].m - before;
  near(got / (full - before), 0.0602, 2e-3);
});

test('hidden tab: the time is thrown away, only the session state moves', () => {
  const items = {}, session = newSession(10), base = fixedBase();
  processAnswer(typed('DE', 1200, { hidden: true }), items, base, session, 100);
  assert.equal(items['DE|land>capital'].n, 0);
  assert.equal(session.trial, 1);
  near(base[CTX].B, B);
});

test('cheat sheet open drops the time, but a mistake still counts', () => {
  const items = {};
  processAnswer(typed('DE', 3000, { cheatOpen: true }), items, fixedBase(), newSession(10), 100);
  assert.equal(items['DE|land>capital'].n, 0);
  processAnswer(typed('DE', 3000, { cheatOpen: true, correct: false }), items, fixedBase(), newSession(10), 100);
  near(items['DE|land>capital'].m, 0.6);
});

test('an answer within 250 ms is a mis-press: nothing is booked, not even a mistake, and the country is not asked straight away', () => {
  const items = {}, session = newSession(10);
  processAnswer({ country: 'DE', skill: 'land>capital', answerMode: 'self_direct', device: 'fine', correct: false, rtMs: 150, tMs: 0 }, items, fixedBase(), session, 100);
  assert.equal(items['DE|land>capital'], undefined);
  assert.deepEqual(session.errQueue, []);
  assert.equal(session.trial, 1);
  assert.equal(session.lastCountryTrial.get('DE'), 0);
  assert.equal(session.lastTrial.has('DE|land>capital'), false);   // the next real ask is still a cold measurement
});

test('revealing and rating directly share one baseline, so revealing only on hard countries cannot hide that they are slow', () => {
  const base = {};
  for (let i = 0; i < 6; i++) processAnswer({ country: `c${i}`, skill: 'land>capital', answerMode: 'self_direct', device: 'fine', correct: true, rtMs: 1500, tMs: 0 }, {}, base, newSession(10), 100);
  const it = processAnswer({ country: 'KN', skill: 'land>capital', answerMode: 'self_reveal', device: 'fine', correct: true, rtMs: 4500, tMs: 0 }, {}, base, newSession(10), 100);
  assert.ok(it.m > 0.3, `m=${it.m}`);
  assert.equal(base['self_reveal|land>capital|fine'], undefined);
  assert.equal(base['self|land>capital|fine'].n, 7);
});

test('self-rated "good" without revealing weighs 0.4, multiple choice is corrected for guessing', () => {
  const base = { 'self|flag>land|fine': { B, n: 100 }, 'mc|alles|fine': { B, n: 100 } };
  const a = processAnswer({ country: 'DE', skill: 'flag>land', answerMode: 'self_direct', device: 'fine', correct: true, rtMs: 1500, tMs: 0 }, {}, base, newSession(10), 100);
  near(a.n, 0.7 * 0.4);
  const b = processAnswer({ country: 'DE', skill: 'alles', answerMode: 'mc', device: 'fine', k: 4, correct: true, rtMs: 1500, tMs: 0 }, {}, base, newSession(10), 100);
  near(b.n, 0.6 * 0.75);
});

test('a new skill of a known country starts at half the country mean', () => {
  const items = {};
  processAnswer(typed('FR', 3500, { editDist: 1 }), items, fixedBase(), newSession(10), 100);
  const it = processAnswer({ ...typed('FR', 1500), skill: 'flag>land', answerMode: 'self_reveal' }, items, { 'self|flag>land|fine': { B, n: 100 } }, newSession(10), 100);
  // m0 = 0.5 * 0.5163; alpha 0.5; w 0.7; r 0
  near(it.m, 0.25815 + 0.5 * 0.7 * (0 - 0.25815));
});

test('the baseline learns from every valid correct answer and falls back when thin', () => {
  const base = {};
  processAnswer(typed('DE', 1500), {}, base, newSession(10), 100);
  near(base[CTX].B, Math.log(1500) + 0.05 * (Math.log(1500) - Math.log(1500)));
  assert.equal(base[CTX].n, 1);
  near(base['typed|fine'].B, Math.log(1500));
});

test('the baseline update uses a capped step', () => {
  const base = fixedBase();
  processAnswer(typed('DE', 1500 * Math.E ** 1.5), {}, base, newSession(10), 100);
  near(base[CTX].B, B + 0.05);
});

test('gap and session length follow the set size, the length also the number of skills (max 2×)', () => {
  assert.deepEqual(gapFor(9), { g: 3, kappa: 2.25, gErr: 3 });
  assert.deepEqual(gapFor(196), { g: 4, kappa: 49, gErr: 3 });
  assert.deepEqual(gapFor(2), { g: 0, kappa: 2, gErr: 1 });
  assert.equal(sessionLength(9), 15);
  assert.equal(sessionLength(20), 30);
  assert.equal(sessionLength(196), 40);
  assert.equal(sessionLength(10, 2), 30);
  assert.equal(sessionLength(10, 11), 30);
});

test('a fresh context warms up: the first residual is 0, later ones compare with the mean so far', () => {
  const base = {}, items = {};
  processAnswer(typed('DE', 1000), items, base, newSession(10), 100);
  assert.equal(items['DE|land>capital'].m, 0);
  processAnswer(typed('FR', 3000), items, base, newSession(10), 100);
  near(items['FR|land>capital'].m, 0.5 * 0.9 * (Math.log(3000) - (Math.log(1000) + Math.log(3000)) / 2));
  near(base[CTX].B, (Math.log(1000) + Math.log(3000)) / 2);
});

test('a mistake while clicking on a touchscreen weighs 0.7', () => {
  const ev = { country: 'DE', skill: 'land>map', answerMode: 'click', device: 'coarse', correct: false, rtMs: 1500, tMs: 0 };
  const it = processAnswer(ev, {}, {}, newSession(10), 100);
  near(it.n, 0.7); near(it.m, 0.5 * 0.7 * 1.2);
  const fine = processAnswer({ ...ev, device: 'fine' }, {}, {}, newSession(10), 100);
  near(fine.n, 1);
});

test('a mistake can carry its own weight (Kwartet: 0.5)', () => {
  const it = processAnswer({ country: 'DE', skill: 'land>map', answerMode: 'none', device: 'fine', correct: false, wErr: 0.5, tMs: 0 }, {}, {}, newSession(10), 100);
  near(it.n, 0.5);
});

test('the ceiling needs 30 cold measurements, then two cold fast sessions pin the need', () => {
  const base = {}, items = {};
  for (let i = 0; i < 29; i++) processAnswer(typed('DE', 1000), items, base, newSession(10), 100 + i);
  for (let i = 0; i < 2; i++) processAnswer(typed('FR', 1000), items, base, newSession(10), 130 + i);
  assert.notEqual(computeNeed(items['FR|land>capital'], 131).need, -1);
  for (let i = 0; i < 2; i++) processAnswer(typed('FR', 1000), items, base, newSession(10), 132 + i);
  assert.equal(computeNeed(items['FR|land>capital'], 133).need, -1);
});

test('the first clean cold measurement clears the legacy flag', () => {
  const items = { 'DE|land>capital': { m: 0.3, n: 1.5, day: 90, flags: 8 } };
  processAnswer(typed('DE', 1200), items, fixedBase(), newSession(10), 100);
  assert.equal(items['DE|land>capital'].flags & 8, 0);
});

test('armOf is deterministic per account and item, and uses both arms', () => {
  const arms = new Set();
  for (let i = 0; i < 50; i++) { const a = armOf('uid1', `c${i}|land>capital`); assert.equal(a, armOf('uid1', `c${i}|land>capital`)); arms.add(a); }
  assert.deepEqual([...arms].sort(), [0, 1]);
});

const cands = (ids, skills = ['land>capital']) => ids.flatMap(c => skills.map(s => ({ country: c, skill: s })));

test('pickNext never repeats within the hard gap', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `c${i}`), items = {}, session = newSession(9);
  const asked = [];
  for (let t = 0; t < 60; t++) {
    const c = pickNext(cands(ids), items, session, 100);
    asked.push(c.country);
    processAnswer(typed(c.country, 1500, { tMs: t * 5000 }), items, fixedBase(), session, 100);
  }
  for (let i = 0; i < asked.length; i++) for (let j = 1; j <= 3 && i + j < asked.length; j++) assert.notEqual(asked[i], asked[i + j]);
});

test('a mistake comes back after exactly gErr other questions', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `c${i}`), items = {}, session = newSession(9);
  const first = pickNext(cands(ids), items, session, 100);
  processAnswer(typed(first.country, 1500, { correct: false }), items, fixedBase(), session, 100);
  const asked = [];
  for (let t = 1; t <= 4; t++) {
    const c = pickNext(cands(ids), items, session, 100);
    asked.push(c.country);
    processAnswer(typed(c.country, 1500, { tMs: t * 5000 }), items, fixedBase(), session, 100);
  }
  assert.deepEqual(asked.slice(0, 3).includes(first.country), false);
  assert.equal(asked[3], first.country);
});

test('slow items are asked more often, but fast ones stay in rotation', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `c${i}`), items = {};
  ids.forEach((c, i) => { items[`${c}|land>capital`] = { m: i < 10 ? 1 : i < 20 ? 0 : -1, n: 10, day: 100, flags: 0 }; });
  let seed = 7; const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const count = {};
  const session = newSession(30);
  for (let t = 0; t < 3000; t++) {
    const c = pickNext(cands(ids), items, session, 100, rand);
    count[c.country] = (count[c.country] || 0) + 1;
    session.lastTrial.set(`${c.country}|land>capital`, session.trial); session.lastCountryTrial.set(c.country, session.trial); session.trial++;
  }
  const sum = f => ids.filter(f).reduce((a, c) => a + count[c], 0);
  const slow = sum((_, i) => i < 10), fast = sum((_, i) => i >= 20);
  assert.ok(slow / fast > 2.5 && slow / fast < 5.5, `ratio ${slow / fast}`);
  assert.ok(ids.every(c => count[c] > 0));
});

test('the same country is not asked twice in a row across skills', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'], items = {}, session = newSession(6);
  const asked = [];
  for (let t = 0; t < 40; t++) {
    const c = pickNext(cands(ids, ['land>capital', 'capital>land']), items, session, 100);
    asked.push(c.country);
    session.lastTrial.set(`${c.country}|${c.skill}`, session.trial); session.lastCountryTrial.set(c.country, session.trial); session.trial++;
  }
  for (let i = 1; i < asked.length; i++) assert.notEqual(asked[i], asked[i - 1]);
});

test('an item unseen for 28 days gets the overdue boost', () => {
  near(computeNeed({ m: -1, n: 20, day: 72, flags: 0 }, 100).weight, 4 * Math.sqrt(5));
});

test('an automated item is pinned to the lowest need but keeps a weight', () => {
  const { need, weight } = computeNeed({ m: 0.5, n: 10, day: 100, flags: 0b110 }, 100);
  assert.equal(need, -1); near(weight, Math.exp(-Math.log(5) / 2));
});

test('items encode to four small integers and back', () => {
  const items = { 'DE|land>capital': { m: -0.2482, n: 1.8, day: 101, flags: 1 } };
  const enc = encodeItems(items);
  assert.deepEqual(enc, { 'DE|land>capital': [-25, 18, 101, 1] });
  const dec = decodeItems(enc);
  near(dec['DE|land>capital'].m, -0.25); near(dec['DE|land>capital'].n, 1.8);
  assert.equal(dec['DE|land>capital'].day, 101);
});

test('merge: per item the newest day wins, ties go to the higher n', () => {
  const a = { v: 1, items: { x: [10, 50, 100, 0], y: [20, 30, 101, 0], z: [5, 5, 99, 0] } };
  const b = { v: 1, items: { x: [-10, 60, 100, 0], y: [0, 90, 100, 0], w: [1, 1, 50, 0] } };
  assert.deepEqual(mergeTempo(a, b).items, { x: [-10, 60, 100, 0], y: [20, 30, 101, 0], z: [5, 5, 99, 0], w: [1, 1, 50, 0] });
});

test('skillOf maps old quiz types and sub types to skills', () => {
  assert.equal(skillOf('capital', 'land-to-capital'), 'land>capital');
  assert.equal(skillOf('flag', 'flag-to-land'), 'flag>land');
  assert.equal(skillOf('map', 'snelle'), 'map>land');
  assert.equal(skillOf('map', 'zoek'), 'land>map');
  assert.equal(skillOf('map', 'locate'), 'capital>map');
  assert.equal(skillOf('outline', 'self'), 'outline>land');
  assert.equal(skillOf('mix', 'mega-flag-capital'), 'flag>capital');
  assert.equal(skillOf('capital', 'thompson'), null);
  assert.equal(skillOf('kwartet', 'hint-land'), null);
});

test('levelOf: fast below -0.2, slow above 0.2, average in between', () => {
  assert.equal(levelOf(-0.5), 'snel');
  assert.equal(levelOf(-0.2), 'snel');
  assert.equal(levelOf(0), 'gemiddeld');
  assert.equal(levelOf(0.2), 'traag');
});

test('countrySummary: level and relative time show what the measurements say (without the prior), slowest skill first', () => {
  const items = {
    'DE|land>capital': { m: -0.4, n: 3, day: 100, flags: 0 },
    'DE|flag>land': { m: 0.6, n: 1, day: 99, flags: 1 },
    'DE|map>land': { m: 0, n: 0, day: null, flags: 0 },
    'FR|land>capital': { m: 0.1, n: 2, day: 100, flags: 8 }
  };
  const de = countrySummary(items, 'DE');
  near(de.m, 0.1); near(de.n, 4); assert.equal(de.legacy, false);
  assert.deepEqual(de.skills.map(s => s.skill), ['flag>land', 'land>capital']);
  near(de.skills[1].est, -0.4 * 4 / 3); near(de.skills[1].rel, Math.exp(-0.4 * 4 / 3)); assert.equal(de.skills[1].level, 'snel');
  near(de.skills[0].est, 1.2);   // one slow measurement, capped
  assert.equal(de.skills[0].level, 'traag'); assert.equal(de.skills[0].err, true);
  near(de.est, (1.2 - 0.4 * 4 / 3) / 2); assert.equal(de.level, 'traag'); near(de.rel, Math.exp(de.est));
  assert.equal(countrySummary(items, 'FR').legacy, true);
  assert.equal(countrySummary(items, 'NL'), null);
});

test('countrySummary: a single legacy measurement of a slow country is shown as slow', () => {
  // seeded: one old measurement of r = 1.0 at weight 0.3 gives m = 0.15, n = 0.3
  const s = countrySummary({ 'GD|land>capital': { m: 0.15, n: 0.3, day: 100, flags: 8 } }, 'GD');
  assert.equal(s.level, 'traag'); assert.equal(s.legacy, true);
});

test('skillLabel gives readable Dutch names', () => {
  assert.equal(skillLabel('land>capital'), 'Hoofdstad');
  assert.equal(skillLabel('flag>land'), 'Vlag');
  assert.equal(skillLabel('map>land'), 'Kaart');
  assert.equal(skillLabel('land>map'), 'Zoek op kaart');
  assert.equal(skillLabel('capital>map'), 'Hoofdstad op kaart');
  assert.equal(skillLabel('outline>land'), 'Omtrek');
  assert.equal(skillLabel('flag>capital'), 'Vlag → hoofdstad');
});

test('seedFromHistory ignores mistakes given within 250 ms (mis-presses)', () => {
  const ev = (ms, r) => ({ timestamp: '2026-10-10T10:00:01Z', quizType: 'map', subType: 'snelle', result: r, responseTimeMs: ms });
  const items = seedFromHistory({ sessions: [{ quizType: 'map', subMode: 'snelle', startedAt: '2026-10-10T10:00:00Z', endedAt: 'x',
    perCountryStats: { HN: { events: [ev(130, 'incorrect')] }, VE: { events: [ev(1320, 'incorrect')] } } }] }, 100);
  assert.equal(items['HN|map>land'], undefined);
  assert.equal(items['VE|map>land'].flags & 1, 1);
});

test('seedFromHistory caps the legacy weight at n = 1.5', () => {
  const ev = t => ({ timestamp: t, quizType: 'capital', subType: 'land-to-capital', result: 'correct', responseTimeMs: 1000 });
  const sessions = Array.from({ length: 10 }, (_, i) => ({ quizType: 'capital', subMode: 'land-to-capital', startedAt: `2026-10-${10 + i}T10:00:00Z`, endedAt: 'x',
    perCountryStats: { DE: { events: [ev(`2026-10-${10 + i}T10:00:01Z`)] } } }));
  near(seedFromHistory({ sessions }, 100)['DE|land>capital'].n, 1.5);
});

test('seedFromHistory: first correct answer per item per session, weight 0.3, legacy flag', () => {
  const ev = (t, ms, result = 'correct') => ({ timestamp: t, quizType: 'capital', subType: 'land-to-capital', result, responseTimeMs: ms });
  const history = { sessions: [
    { quizType: 'capital', subMode: 'land-to-capital', startedAt: '2026-10-01T10:00:00Z', endedAt: 'x', perCountryStats: {
      DE: { events: [ev('2026-10-01T10:00:01Z', 1000), ev('2026-10-01T10:00:30Z', 500)] },
      FR: { events: [ev('2026-10-01T10:00:02Z', 4000)] } } },
    { quizType: 'capital', subMode: 'thompson', startedAt: '2026-10-02T10:00:00Z', endedAt: 'x', perCountryStats: {
      FR: { events: [ev('2026-10-02T10:00:02Z', 4000, 'incorrect')] } } }
  ] };
  const items = seedFromHistory(history, 100);
  const de = items['DE|land>capital'], fr = items['FR|land>capital'];
  near(de.n, 0.3); assert.ok(de.m < 0); assert.equal(de.flags & 8, 8);
  assert.ok(fr.m > de.m); assert.equal(fr.flags & 1, 1);
  near(fr.n, 0.6);
});
