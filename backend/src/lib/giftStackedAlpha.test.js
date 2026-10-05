const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { playbackSrcFor, stackedObjectPath, needsStacked, evenScaleFilter } = require('./giftStackedAlpha');

const webm = 'https://firebasestorage.googleapis.com/v0/b/x/o/config%2Fgifts%2Fbotas-1.webm?alt=media&token=t';

describe('versión iPhone (stacked alpha)', () => {
  it('usa la misma fuente que el reproductor del cliente', () => {
    assert.equal(playbackSrcFor({ video: '/gifts/a.webm' }), '/gifts/a.webm');
    assert.equal(
      playbackSrcFor({ video: '/gifts/a.webm', media: { processedAsset: webm, originalAsset: 'x.mov' } }),
      webm,
    );
    assert.equal(playbackSrcFor({ media: { originalAsset: 'https://e.com/a.mov' } }), 'https://e.com/a.mov');
  });

  it('nombre de archivo determinista por regalo y fuente', () => {
    const a = stackedObjectPath('regalo_1', webm);
    assert.match(a, /^config\/gifts\/regalo_1-ios-[0-9a-f]{12}\.mp4$/);
    assert.equal(a, stackedObjectPath('regalo_1', webm));
    assert.notEqual(a, stackedObjectPath('regalo_1', `${webm}2`));
  });

  it('solo pide versión nueva si falta o cambió el video', () => {
    assert.equal(needsStacked({ id: 'g1', video: webm }), true);
    assert.equal(
      needsStacked({ id: 'g1', video: webm, media: { stackedAlphaAsset: 'u', stackedAlphaSource: webm } }),
      false,
    );
    assert.equal(
      needsStacked({ id: 'g1', video: webm, media: { stackedAlphaAsset: 'u', stackedAlphaSource: 'old' } }),
      true,
    );
    assert.equal(needsStacked({ id: 'g1', image: 'a.png' }), false);
    assert.equal(needsStacked({ id: 'bad id', video: webm }), false);
  });

  it('cada mitad queda par y con lado mayor ≤ 1280', () => {
    assert.equal(evenScaleFilter(608, 1080), 'scale=608:1080:flags=lanczos');
    assert.equal(evenScaleFilter(1920, 1080), 'scale=1280:720:flags=lanczos');
    assert.equal(evenScaleFilter(1080, 1920), 'scale=720:1280:flags=lanczos');
  });
});
