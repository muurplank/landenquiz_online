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
  assert.equal(parts.length, 5);
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

import { reconcile } from '../js/core/sync-plan.js';
const J = v => JSON.stringify(v);

test('reconcile replace: stashes the previous account\'s unpushed values and loads the cloud', () => {
  const r = reconcile({
    uid: 'b', owner: 'a', meta: { landjes_geotrivia: 5 }, dirty: ['landjes_geotrivia'], stashes: {},
    local: { landjes_geotrivia: J({ best: 9 }), landjes_custom_group: J(['nl']) },
    remote: { landjes_custom_group: { json: J(['be']), updatedAt: 3 } }
  });
  assert.deepEqual(r.stashes.a.values, { landjes_geotrivia: J({ best: 9 }) });
  assert.equal(r.writes.landjes_geotrivia, null);
  assert.equal(r.writes.landjes_custom_group, J(['be']));
  assert.deepEqual(r.dirty, []);
});

test('reconcile: a stash comes back when its account signs in after another account used the device', () => {
  const r = reconcile({
    uid: 'a', owner: 'b', meta: {}, dirty: [], local: {},
    stashes: { a: { at: 10, values: { landjes_geotrivia: J({ best: 9, rounds: 1 }) } } },
    remote: { landjes_geotrivia: { json: J({ best: 4, rounds: 6 }), updatedAt: 3 } }
  });
  assert.deepEqual(JSON.parse(r.writes.landjes_geotrivia), { best: 9, rounds: 6 });
  assert.ok(r.dirty.includes('landjes_geotrivia'));
  assert.equal(r.stashes.a, undefined);
});

test('reconcile merge: a newer local deletion is not undone by the cloud', () => {
  const r = reconcile({
    uid: 'a', owner: 'a', meta: { landjes_custom_group: 20 }, dirty: ['landjes_custom_group'], stashes: {},
    local: {}, remote: { landjes_custom_group: { json: J(['nl']), updatedAt: 10 } }
  });
  assert.equal('landjes_custom_group' in r.writes, false);
  assert.ok(r.dirty.includes('landjes_custom_group'));
});

test('reconcile merge: cloud-only values are written locally and not re-pushed', () => {
  const r = reconcile({
    uid: 'a', owner: null, meta: {}, dirty: [], stashes: {}, local: {},
    remote: { landjes_geotrivia: { json: J({ best: 2 }), updatedAt: 10 } }
  });
  assert.equal(r.writes.landjes_geotrivia, J({ best: 2 }));
  assert.deepEqual(r.dirty, []);
});

test('chunk stays far below the 1 MiB limit even for multi-byte text', () => {
  assert.ok(chunk('é'.repeat(600_000)).every(p => new TextEncoder().encode(p).length < 1_000_000));
});
