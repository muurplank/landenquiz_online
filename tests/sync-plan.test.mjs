import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSignIn, chunk, unchunk } from '../js/core/sync-plan.js';

test('planSignIn merges on a fresh or same-owner device', () => {
  assert.equal(planSignIn({ ownerUid: null, uid: 'a' }), 'merge');
  assert.equal(planSignIn({ ownerUid: 'a', uid: 'a' }), 'merge');
});

test('planSignIn replaces when another account owned this device', () => {
  assert.equal(planSignIn({ ownerUid: 'a', uid: 'b' }), 'replace');
});

test('chunk splits large strings and joins back losslessly', () => {
  const s = 'x'.repeat(2_000_000);
  const parts = chunk(s);
  assert.equal(parts.length, 3);
  assert.equal(parts.join(''), s);
  assert.equal(chunk('{}').length, 1);
});

test('unchunk rebuilds values from part documents in any order', () => {
  const docs = [
    { id: 'landjes_history_v1#1', value: 'b', part: 1, parts: 2, updatedAt: 5 },
    { id: 'landjes_geotrivia', value: '{"best":3}', updatedAt: 7 },
    { id: 'landjes_history_v1', value: 'a', part: 0, parts: 2, updatedAt: 5 }
  ];
  assert.deepEqual(unchunk(docs), {
    landjes_history_v1: { json: 'ab', updatedAt: 5, parts: 2 },
    landjes_geotrivia: { json: '{"best":3}', updatedAt: 7, parts: 1 }
  });
});

test('unchunk drops a value whose parts are incomplete', () => {
  const docs = [{ id: 'landjes_history_v1', value: 'a', part: 0, parts: 2, updatedAt: 5 }];
  assert.deepEqual(unchunk(docs), {});
});
