const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceFromPost, battlePatch } = require('./giftTransactions');

test('gift source keeps publications, Boom Clips and Flash Boom isolated', () => {
  assert.equal(sourceFromPost({ type: 'photo', postFormat: 'post' }), 'publication');
  assert.equal(
    sourceFromPost({
      type: 'video',
      mediaUrl: 'clip.mp4',
      postFormat: 'post',
      durationSec: 45,
    }),
    'boom_clip',
  );
  assert.equal(
    sourceFromPost({ type: 'photo', postFormat: 'story', storyExpiresAtMs: Date.now() + 1_000 }),
    'flashboom',
  );
});

test('battle gift damages only the opponent and credits receiver score', () => {
  const patch = battlePatch(
    {
      status: 'live',
      hostAUsername: 'host_a',
      hostBUsername: 'host_b',
      hpA: 100,
      hpB: 100,
      scoreA: 0,
      scoreB: 0,
    },
    'host_a',
    100,
  );
  assert.equal(patch.hpA, 100);
  assert.equal(patch.hpB, 95);
  assert.equal(patch.scoreA, 5);
  assert.equal(patch.scoreB, 0);
});
