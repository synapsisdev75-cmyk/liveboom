const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  playbackSrcFor,
  stackedObjectPath,
  needsStacked,
  evenScaleFilter,
  buildStackedFilter,
  sameGiftAsset,
} = require('./giftStackedAlpha');

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
    assert.match(a, /^config\/gifts\/regalo_1-ios2-[0-9a-f]{12}\.mp4$/);
    assert.equal(a, stackedObjectPath('regalo_1', webm));
    assert.equal(a, stackedObjectPath('regalo_1', webm.replace('token=t', 'token=other')));
    assert.notEqual(a, stackedObjectPath('regalo_1', webm.replace('botas-1', 'botas-2')));
  });

  it('solo pide versión nueva si falta, cambió el video o es la v1 opaca', () => {
    const current = `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(stackedObjectPath('g1', webm))}?alt=media&token=t`;
    assert.equal(needsStacked({ id: 'g1', video: webm }), true);
    assert.equal(
      needsStacked({ id: 'g1', video: webm, media: { stackedAlphaAsset: current, stackedAlphaSource: webm } }),
      false,
    );
    assert.equal(
      needsStacked({
        id: 'g1',
        video: webm,
        media: { stackedAlphaAsset: 'https://e.com/g1-ios-old.mp4', stackedAlphaSource: webm },
      }),
      true,
    );
    assert.equal(
      needsStacked({ id: 'g1', video: webm, media: { stackedAlphaAsset: current, stackedAlphaSource: 'old' } }),
      true,
    );
    assert.equal(needsStacked({ id: 'g1', image: 'a.png' }), false);
    assert.equal(needsStacked({ id: 'bad id', video: webm }), false);
  });

  it('compara el archivo sin el token de Storage', () => {
    const otherToken = webm.replace('token=t', 'token=other');
    assert.equal(sameGiftAsset(webm, otherToken), true);
    assert.equal(
      needsStacked({
        id: 'g1',
        video: otherToken,
        media: {
          stackedAlphaAsset: `https://x/o/${encodeURIComponent(stackedObjectPath('g1', otherToken))}?alt=media`,
          stackedAlphaSource: webm,
        },
      }),
      false,
    );
  });

  it('extrae el alfa en rgba antes de escalar', () => {
    const filter = buildStackedFilter({ width: 608, height: 1080 }, null);
    assert.match(filter, /format=rgba,scale=608:1080/);
    assert.match(filter, /alphaextract/);
    const dual = buildStackedFilter({ width: 608, height: 1080 }, { width: 608, height: 1080 });
    assert.match(dual, /0:v:1/);
    assert.match(dual, /format=gray/);
  });

  it('cada mitad queda par y con lado mayor ≤ 1280', () => {
    assert.equal(evenScaleFilter(608, 1080), 'scale=608:1080:flags=lanczos');
    assert.equal(evenScaleFilter(1920, 1080), 'scale=1280:720:flags=lanczos');
    assert.equal(evenScaleFilter(1080, 1920), 'scale=720:1280:flags=lanczos');
  });
});
