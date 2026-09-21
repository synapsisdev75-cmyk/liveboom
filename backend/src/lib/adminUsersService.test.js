const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readLevelXpFields, mapUserRow, normalizeQuery } = require('./adminUsersService');

describe('adminUsersService', () => {
  it('normaliza búsqueda', () => {
    assert.equal(normalizeQuery(' @Ana '), 'ana');
  });

  it('XP efectivo respeta fijado vs orgánico', () => {
    assert.equal(readLevelXpFields({ levelXp: 80 }).effective, 80);
    assert.equal(readLevelXpFields({ levelXp: 80, levelXpPinned: 10 }).effective, 10);
    assert.equal(readLevelXpFields({ levelXp: 80, levelXpPinned: null }).pinned, null);
  });

  it('separa BLAST comprados y ganados y no inventa earned', () => {
    const row = mapUserRow(
      'u1',
      {
        username: 'ana',
        displayName: 'Ana',
        email: 'ana@x.com',
        coinsBalance: 150,
        purchasedBlastBalance: 100,
        earnedBlastBalance: 50,
        earnedBlastReserved: 20,
        levelXp: 9,
      },
      { online: true, presenceAt: '2026-01-01T00:00:00.000Z' },
    );
    assert.equal(row.purchasedBlastBalance, 100);
    assert.equal(row.earnedBlastBalance, 50);
    assert.equal(row.earnedBlastReserved, 20);
    assert.equal(row.coinsBalance, 150);
    assert.equal(row.online, true);
    const legacy = mapUserRow('u2', { coinsBalance: 70, username: 'bob' });
    assert.equal(legacy.purchasedBlastBalance, 70);
    assert.equal(legacy.earnedBlastBalance, 0);
  });
});
