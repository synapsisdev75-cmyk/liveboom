/**
 * Ejecutar: node --test backend/src/lib/superAdminCapabilities.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { OWNER_EMAIL, hasCapability } = require('./superAdminCapabilities');

test('owner always has every capability', () => {
  assert.equal(hasCapability(OWNER_EMAIL, 'gifts', { emails: [], grants: {} }), true);
  assert.equal(hasCapability(OWNER_EMAIL, 'withdrawals', { emails: [OWNER_EMAIL], grants: { [OWNER_EMAIL]: [] } }), true);
});

test('listed delegate has full access (same delegation)', () => {
  const doc = { emails: [OWNER_EMAIL, 'ana@x.com'] };
  assert.equal(hasCapability('ana@x.com', 'messages', doc), true);
  assert.equal(hasCapability('ana@x.com', 'verification', doc), true);
  assert.equal(hasCapability('ana@x.com', 'gifts', doc), true);
});

test('limited grants no longer block listed delegates', () => {
  const limited = { emails: ['ana@x.com'], grants: { 'ana@x.com': ['messages', 'ads'] } };
  assert.equal(hasCapability('ana@x.com', 'messages', limited), true);
  assert.equal(hasCapability('ana@x.com', 'gifts', limited), true);
  const none = { emails: ['ana@x.com'], grants: { 'ana@x.com': [] } };
  assert.equal(hasCapability('ana@x.com', 'ads', none), true);
});

test('unknown email is never super admin', () => {
  assert.equal(hasCapability('intruso@x.com', 'gifts', { emails: ['ana@x.com'] }), false);
});

test('grant keys and login email are case-insensitive for listing', () => {
  const doc = {
    emails: ['Ana@X.com'],
    grants: { 'Ana@X.com': ['gifts', 'blast'] },
  };
  assert.equal(hasCapability('ana@x.com', 'gifts', doc), true);
  assert.equal(hasCapability('ANA@X.COM', 'blast', doc), true);
  assert.equal(hasCapability('ana@x.com', 'ads', doc), true);
});
