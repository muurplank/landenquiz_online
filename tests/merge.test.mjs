import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSyncedKey, mergeValue, compactHistory } from '../js/core/merge.js';

const sess = (id, groupId, correct, incorrect, events = []) => ({
  id, groupId, startedAt: `2026-10-${id.charCodeAt(0) - 96}T10:00:00Z`, endedAt: 'x',
  perCountryStats: { nl: { correct_count: correct, events } },
  totals: { questions: correct + incorrect, correct, incorrect, accuracy: correct / (correct + incorrect) }
});

test('history: union of sessions from two devices keeps all ids', () => {
  const local = { version: 1, sessions: [sess('a', 'g', 1, 1), sess('b', 'g', 2, 0)], perGroup: {} };
  const remote = { version: 1, sessions: [sess('b', 'g', 2, 0), sess('c', 'g', 3, 1)], perGroup: {} };
  const m = mergeValue('landjes_history_v1', local, remote, 1, 2);
  assert.deepEqual(m.sessions.map(s => s.id), ['a', 'b', 'c']);
  assert.equal(m.perGroup.g.sessionsPlayed, 3);
  assert.equal(m.perGroup.g.totalCorrect, 6);
  assert.equal(m.perGroup.g.bestAccuracy, 1);
});

test('history: duplicate id prefers the copy with events', () => {
  const withEv = sess('a', 'g', 1, 0, [{ result: 'correct' }]);
  const without = sess('a', 'g', 1, 0);
  const m = mergeValue('landjes_history_v1', { sessions: [without] }, { sessions: [withEv] }, 5, 1);
  assert.equal(m.sessions[0].perCountryStats.nl.events.length, 1);
});

test('daily_results: done beats not-done, other dates kept', () => {
  const local = { warmkoud: { '2026-10-29': { done: false } }, silhouet: { '2026-10-28': { done: true, won: true } } };
  const remote = { warmkoud: { '2026-10-29': { done: true, won: true, guesses: 4 }, '2026-10-30': { done: true } } };
  const m = mergeValue('landjes_daily_results', local, remote, 9, 1);
  assert.equal(m.warmkoud['2026-10-29'].guesses, 4);
  assert.ok(m.warmkoud['2026-10-30']);
  assert.ok(m.silhouet['2026-10-28'].won);
});

test('days: finished game beats unfinished', () => {
  const local = { '2026-10-29': { done: false, guesses: [1, 2, 3, 4, 5] } };
  const remote = { '2026-10-29': { done: true, guesses: [1, 2] } };
  assert.equal(mergeValue('landjes_warmkoud_days', local, remote, 9, 1)['2026-10-29'].done, true);
});

test('days: both unfinished keeps the longer game', () => {
  const local = { d: { done: false, guesses: [1] } };
  const remote = { d: { done: false, guesses: [1, 2, 3] } };
  assert.equal(mergeValue('landjes_silhouet_days', local, remote, 9, 1).d.guesses.length, 3);
});

test('gameStats: takes max played/won/best and streak from higher played', () => {
  const local = { played: 10, won: 4, streak: 1, best: 6, guesses: [1] };
  const remote = { played: 12, won: 3, streak: 3, best: 2, guesses: [2, 2] };
  assert.deepEqual(mergeValue('landjes_warmkoud_stats', local, remote, 9, 1),
    { played: 12, won: 4, streak: 3, best: 6, guesses: [2, 2] });
});

test('geotrivia: max best and rounds, cats from newest', () => {
  const m = mergeValue('landjes_geotrivia', { best: 8, rounds: 2, cats: ['a'] }, { best: 6, rounds: 5, cats: ['b'] }, 1, 2);
  assert.deepEqual(m, { best: 8, rounds: 5, cats: ['b'] });
});

test('unknown key: newest wins', () => {
  assert.equal(mergeValue('landjes_custom_group', 'old', 'new', 1, 2), 'new');
  assert.equal(mergeValue('landjes_custom_group', 'mine', 'theirs', 3, 2), 'mine');
});

test('one side missing: take the other', () => {
  assert.deepEqual(mergeValue('landjes_daily_results', null, { a: {} }, 1, 2), { a: {} });
  assert.equal(mergeValue('landjes_custom_group', 'x', undefined, 1, 2), 'x');
});

test('isSyncedKey applies the device-only exclusions', () => {
  for (const k of ['landjes_theme', 'landjes_cheat_open_x', 'landjes__sync_meta', 'landjes_oefenen_collapsed',
    'landjes_stats_filters', 'landjes_exam_intro_seen', 'landjes_exam_show_feedback', 'landjes_picker_v2', 'landjes_alles_oneindig', 'other'])
    assert.equal(isSyncedKey(k), false, k);
  for (const k of ['landjes_history_v1', 'landjes_geotrivia', 'landjes_daily_results', 'landjes_exam_state_v1'])
    assert.equal(isSyncedKey(k), true, k);
});

test('compactHistory strips events but keeps correct_count', () => {
  const h = { version: 1, sessions: [sess('a', 'g', 2, 0, [{ result: 'correct' }])], perGroup: {} };
  const c = compactHistory(h);
  assert.equal(c.sessions[0].perCountryStats.nl.correct_count, 2);
  assert.equal(c.sessions[0].perCountryStats.nl.events, undefined);
  assert.equal(h.sessions[0].perCountryStats.nl.events.length, 1, 'original untouched');
});

test('compactHistory keeps mix events trimmed to quizType and result (needed for progress)', () => {
  const s = { ...sess('a', 'g', 1, 0, [{ quizType: 'flag', result: 'correct', ms: 900, answer: 'x' }]), quizType: 'mix' };
  const c = compactHistory({ sessions: [s] });
  assert.deepEqual(c.sessions[0].perCountryStats.nl.events, [{ quizType: 'flag', result: 'correct' }]);
});

test('history: a reset (clearedAt) drops older sessions from the other side', () => {
  const local = { version: 1, sessions: [], perGroup: {}, clearedAt: '2026-10-20T00:00:00Z' };
  const remote = { version: 1, sessions: [sess('a', 'g', 1, 0), { ...sess('z', 'g', 1, 0), startedAt: '2026-10-25T00:00:00Z' }], perGroup: {} };
  const m = mergeValue('landjes_history_v1', local, remote, 1, 2);
  assert.deepEqual(m.sessions.map(s => s.id), ['z']);
  assert.equal(m.clearedAt, '2026-10-20T00:00:00Z');
});
