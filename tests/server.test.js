const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

test('JWT signing and verification works', () => {
  const secret = 'test-secret';
  const token = jwt.sign({ user: 'alice' }, secret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, secret);
  assert.strictEqual(decoded.user, 'alice');
});

test('JWT verification fails with wrong secret', () => {
  const token = jwt.sign({ user: 'alice' }, 'secret-A', { expiresIn: '1h' });
  assert.throws(() => jwt.verify(token, 'secret-B'));
});

test('basic sanity check', () => {
  assert.strictEqual(1 + 1, 2);
});
