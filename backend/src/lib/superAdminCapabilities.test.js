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

test('legacy delegate without grants keeps full access', () => {
  const doc = { emails: [OWNER_EMAIL, 'ana@x.com'] };
  assert.equal(hasCapability('ana@x.com', 'messages', doc), true);
  assert.equal(hasCapability('ana@x.com', 'verification', doc), true);
});

test('delegate can receive all or a subset', () => {
  const all = {
    emails: ['ana@x.com'],
    grants: {
      'ana@x.com': [
        'messages',
        'gifts',
        'blast',
        'ads',
        'levels',
        'community',
        'requests',
        'withdrawals',
        'verification',
      ],
    },
  };
  assert.equal(hasCapability('ana@x.com', 'blast', all), true);
  const limited = { emails: ['ana@x.com'], grants: { 'ana@x.com': ['messages', 'ads'] } };
  assert.equal(hasCapability('ana@x.com', 'messages', limited), true);
  assert.equal(hasCapability('ana@x.com', 'gifts', limited), false);
  const none = { emails: ['ana@x.com'], grants: { 'ana@x.com': [] } };
  assert.equal(hasCapability('ana@x.com', 'ads', none), false);
});

test('unknown email is never super admin', () => {
  assert.equal(hasCapability('intruso@x.com', 'gifts', { emails: ['ana@x.com'] }), false);
});
