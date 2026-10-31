import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typoInfo } from '../js/core/text.js';

test('typoInfo: exact answer has distance 0', () => {
  assert.deepEqual(typoInfo('parijs', ['Parijs'], ['Berlijn']), { editDist: 0, confusable: false });
});

test('typoInfo: an accepted typo reports its distance', () => {
  assert.deepEqual(typoInfo('Parjs', ['Parijs'], ['Berlijn']), { editDist: 1, confusable: false });
});

test('typoInfo: typing another valid answer of the set is confusable, even when the quiz accepts it', () => {
  assert.deepEqual(typoInfo('Iran', ['Irak'], ['Iran', 'Oman']), { editDist: 1, confusable: true });
  assert.deepEqual(typoInfo('Niger', ['Nigeria'], ['Niger']), { editDist: 2, confusable: true });
});

test('typoInfo: a plain typo that is nobody else is not confusable', () => {
  assert.equal(typoInfo('Irka', ['Irak'], ['Iran']).confusable, false);
});
