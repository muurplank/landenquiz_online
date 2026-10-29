import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, validateName, usernameEmail } from '../js/core/names.js';

test('validateName rejects too short, spaces and odd characters', () => {
  assert.equal(typeof validateName('ab'), 'string');
  assert.equal(typeof validateName('piet piet'), 'string');
  assert.equal(typeof validateName('piët'), 'string');
  assert.equal(typeof validateName('a'.repeat(21)), 'string');
});

test('validateName accepts letters, digits, _ and -', () => {
  assert.equal(validateName('Piet_01'), null);
  assert.equal(validateName('noord-nina'), null);
  assert.equal(validateName('  Piet  '), null, 'surrounding spaces are trimmed');
});

test('normalizeName trims and lower-cases', () => {
  assert.equal(normalizeName(' Piet '), 'piet');
});

test('usernameEmail derives the hidden login address', () => {
  assert.equal(usernameEmail('Piet'), 'piet@users.landtrainer.invalid');
});
