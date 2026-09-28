const test = require('node:test');
const assert = require('node:assert/strict');
const { levelSlugFromXp, isLevelTrophyId, LEVEL_TROPHY_COINS } = require('./levelTrophies');

test('slug por XP de trofeos', () => {
  assert.equal(levelSlugFromXp(0), 'mecha');
  assert.equal(levelSlugFromXp(8), 'mecha');
  assert.equal(levelSlugFromXp(100), 'mecha');
  assert.equal(levelSlugFromXp(101), 'boom');
  assert.equal(levelSlugFromXp(300), 'fuego');
  assert.equal(levelSlugFromXp(600), 'impacto');
  assert.equal(levelSlugFromXp(1000), 'estrella');
});

test('ids de trofeo y precio', () => {
  assert.equal(LEVEL_TROPHY_COINS, 15);
  assert.equal(isLevelTrophyId('trophy_mecha'), true);
  assert.equal(isLevelTrophyId('besito'), false);
});
