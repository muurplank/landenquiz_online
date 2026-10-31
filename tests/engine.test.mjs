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

test('retryOnly: endless starts over when everything is correct', () => {
  const engine = new QuizEngine({ ids: ['a', 'b'], groupId: 'g', quizType: 'x', subMode: 'y', retryOnly: true, endless: true });
  for (let i = 0; i < 2; i++) { engine.next(); engine.answer(true); }
  assert.ok(['a', 'b'].includes(engine.next()));
});
