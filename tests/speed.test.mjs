import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExact, scoreMs, targetMs, pickSlow, pastScores, latestTimes, timesToResults, Drill, LIMIT_MS, GAP, DRILL_MAX } from '../js/quiz/speed-plan.js';

const ok = (id, thinkMs, ms = thinkMs + 500) => ({ id, ok: true, thinkMs, ms });
const miss = id => ({ id, ok: false, thinkMs: null, ms: LIMIT_MS });

test('isExact ignores capitals, accents, spaces and hyphens but no letters', () => {
  assert.ok(isExact('noord korea', ['Noord-Korea']));
  assert.ok(isExact('bahamas', ["Bahama's"]));
  assert.ok(isExact('sao tome en principe', ['Sao Tomé en Principe']));
  assert.ok(isExact('la paz', ['Sucre', 'La Paz']));
  assert.ok(!isExact('Iran', ['Irak']));
  assert.ok(!isExact('Niger', ['Nigeria']));
  assert.ok(!isExact('', ['Irak']));
});

test('a miss costs the full limit, so skipping is never faster', () => {
  assert.equal(scoreMs([ok('a', 500, 1000), miss('b')]), 1000 + LIMIT_MS);
});

test('target is the median, kept within sensible bounds', () => {
  assert.equal(targetMs([ok('a', 1000), ok('b', 2000), ok('c', 1500), miss('d')]), 1500);
  assert.equal(targetMs([ok('a', 100)]), 800);
  assert.equal(targetMs([ok('a', 9000)]), 2500);
  assert.equal(targetMs([miss('a')]), 2500);
});

test('pickSlow takes missed first, then the slowest, and never what is already fast', () => {
  const r = [ok('a', 900), ok('b', 1000), ok('c', 1100), ok('d', 5000), ok('e', 3000), miss('f'), ok('g', 950), ok('h', 1050)];
  assert.deepEqual(pickSlow(r), ['f', 'd', 'e']);
  assert.deepEqual(pickSlow([ok('a', 500), ok('b', 600), ok('c', 700)]), []);
});

test('pickSlow stays short on a big set', () => {
  const r = Array.from({ length: 196 }, (_, i) => ok(`x${i}`, 1000 + i * 40));
  assert.equal(pickSlow(r).length, DRILL_MAX);
});

const session = (subMode, speed, extra = {}) => ({ quizType: 'snel', groupId: 'g', dataset: 'world', subMode, speed, ...extra });
const key = { dataset: 'world', groupId: 'g', dir: 'map' };

test('pastScores: only complete tests of the same kind on the same set', () => {
  const history = { sessions: [
    session('map', { scoreMs: 5000 }), session('map', { scoreMs: null }), session('map-train', { scoreMs: null }),
    session('flag', { scoreMs: 1 }), session('map', { scoreMs: 2 }, { groupId: 'other' }), session('map', { scoreMs: 4000 })
  ] };
  assert.deepEqual(pastScores(history, key), [5000, 4000]);
});

test('latestTimes: the newest cold measurement wins, training sessions included', () => {
  const history = { sessions: [session('map', { times: { a: 3000, b: null } }), session('map-train', { times: { a: 1200 } }), { quizType: 'map' }] };
  const t = latestTimes(history, key);
  assert.deepEqual([...t], [['a', 1200], ['b', null]]);
  assert.deepEqual(timesToResults(t, ['b', 'c']), [{ id: 'b', ok: false, thinkMs: null }]);
});

function runDrill(drill, answer) {
  const asked = [];
  for (let id = drill.next(); id !== null && asked.length < 200; id = drill.next()) {
    asked.push(id);
    drill.record(id, ...answer(id, asked.length));
  }
  return asked;
}

test('drill: a country is done after two fast answers in a row', () => {
  const asked = runDrill(new Drill(['a', 'b'], 1000), () => [true, 500]);
  assert.equal(asked.filter(x => x === 'a').length, 2);
  assert.equal(asked.filter(x => x === 'b').length, 2);
});

test('drill: a slow or wrong answer resets the count', () => {
  let tries = 0;
  const asked = runDrill(new Drill(['a'], 1000), () => (++tries === 2 ? [true, 4000] : [true, 500]));
  assert.equal(asked.length, 4);   // fast, slow, then two fast ones
});

test('drill: other questions come between two asks of the same country', () => {
  const asked = runDrill(new Drill(['a'], 1000, ['x', 'y']), () => [true, 500]);
  assert.equal(asked[0], 'a');
  assert.equal(asked.lastIndexOf('a') - asked.indexOf('a'), GAP);
  assert.equal(asked.filter(x => x === 'a').length, 2);
});

test('drill: a filler answer changes nothing', () => {
  const drill = new Drill(['a'], 1000, ['x']);
  drill.next(); drill.record('a', true, 500);
  assert.equal(drill.next(), 'x');
  drill.record('x', false, null);
  assert.equal(drill.left, 1);
});
