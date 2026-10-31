import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { QuizEngine } = await import('../js/core/engine.js');

const play = (engine, wrong) => {
  const asked = [];
  for (let id = engine.next(); id !== null; id = engine.next()) {
    asked.push(id);
    engine.answer(!wrong.delete(id));
  }
  return asked;
};

test('deck: a new round holds everything again', () => {
  const engine = new QuizEngine({ ids: ['a', 'b', 'c'], groupId: 'g', quizType: 'x', subMode: 'y' });
  for (let i = 0; i < 3; i++) { const id = engine.next(); engine.answer(id !== 'a'); }
  engine.next();
  assert.equal(engine.deck.length, 2);
});

test('retryOnly: a new round asks only what was wrong', () => {
  const asked = play(new QuizEngine({ ids: ['a', 'b', 'c'], groupId: 'g', quizType: 'x', subMode: 'y', retryOnly: true }), new Set(['a']));
  assert.equal(asked.length, 4);
  assert.equal(asked[3], 'a');
});

const tempoEngine = (opts = {}) => {
  const tempo = { items: {}, baselines: {}, device: 'fine', saves: 0, save() { this.saves++; } };
  const engine = new QuizEngine({ ids: ['a', 'b', 'c', 'd', 'e', 'f'], groupId: 'g', quizType: 'capital', subMode: 'x', picker: 'tempo', skills: ['land>capital', 'capital>land'], tempo, ...opts });
  return { engine, tempo };
};

test('tempo: picks a country and a skill, stops after the session length', () => {
  const { engine } = tempoEngine();
  let n = 0;
  for (let id = engine.next(); id !== null; id = engine.next()) {
    n++;
    assert.ok(['a', 'b', 'c', 'd', 'e', 'f'].includes(id));
    assert.ok(['land>capital', 'capital>land'].includes(engine.skill));
    engine.answer(true, { answerMode: 'typed', rtMs: 1500 });
  }
  assert.equal(n, 18);   // 1.5 × 6 countries × 2 skills
  assert.ok(engine.finished);
});

test('tempo: every answer updates and saves the pair, a mistake is flagged', () => {
  const { engine, tempo } = tempoEngine();
  const id = engine.next(), skill = engine.skill;
  engine.answer(false, { answerMode: 'typed', rtMs: 1500 });
  assert.equal(tempo.items[`${id}|${skill}`].flags & 1, 1);
  assert.equal(tempo.saves, 1);
  assert.equal(engine.stats[id].events[0].mode, 'typed');
});

test('tempo items are also kept up to date in deck order, with the skill the mode passes', () => {
  const { engine, tempo } = tempoEngine({ picker: 'deck' });
  const id = engine.next();
  engine.answer(true, { skill: 'capital>land', answerMode: 'typed', rtMs: 1500 });
  assert.ok(tempo.items[`${id}|capital>land`].n > 0);
  assert.equal(engine.finished, false);
});

test('tempo: a chain of steps books every step on its own skill (Alles of niets, Kwartet)', () => {
  const { engine, tempo } = tempoEngine({ picker: 'deck', skills: ['outline>land', 'land>capital', 'land>flag', 'land>map'], skillCount: 1 });
  const id = engine.next();
  engine.answer(false, { steps: [
    { skill: 'outline>land', correct: true, answerMode: 'typed', rtMs: 1500, wForm: 0.6 },
    { skill: 'land>capital', correct: false, answerMode: 'typed', wForm: 0.6 }
  ] });
  assert.ok(tempo.items[`${id}|outline>land`].n > 0);
  assert.equal(tempo.items[`${id}|land>capital`].flags & 1, 1);
  assert.equal(tempo.items[`${id}|land>flag`], undefined);
  assert.ok([0, 1].includes(engine.stats[id].events[0].arm));
  engine.answer(true, { steps: [] });   // a later try of the same set: nothing to book
  assert.equal(engine.stats[id].events.length, 2);
});

test('tempo: endless keeps going past the session length', () => {
  const { engine } = tempoEngine({ endless: true });
  for (let i = 0; i < 20; i++) { assert.notEqual(engine.next(), null); engine.answer(true, { answerMode: 'typed', rtMs: 1500 }); }
});

test('retryOnly: endless starts over when everything is correct', () => {
  const engine = new QuizEngine({ ids: ['a', 'b'], groupId: 'g', quizType: 'x', subMode: 'y', retryOnly: true, endless: true });
  for (let i = 0; i < 2; i++) { engine.next(); engine.answer(true); }
  assert.ok(['a', 'b'].includes(engine.next()));
});
