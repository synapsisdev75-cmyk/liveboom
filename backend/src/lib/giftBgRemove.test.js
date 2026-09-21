/**
 * Pruebas de quitar fondo / borrado de regalos.
 * Ejecutar: node --test backend/src/lib/giftBgRemove.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKeyFilter, classifyBg, inspectMedia } = require('./giftBgRemove');
const { collectUrls, storagePathFromUrl, isExclusivePath } = require('./giftCatalogDelete');

test('classifyBg detects studio colors', () => {
  assert.equal(classifyBg({ r: 12, g: 200, b: 18 }), 'green');
  assert.equal(classifyBg({ r: 250, g: 250, b: 248 }), 'white');
  assert.equal(classifyBg({ r: 8, g: 8, b: 10 }), 'black');
});

test('buildKeyFilter never omits alpha format', () => {
  const green = buildKeyFilter({ hex: '0x00ff00', kind: 'green', similarity: 0.14, blend: 0.08 });
  assert.match(green, /chromakey=/);
  assert.match(green, /format=yuva420p/);
  const white = buildKeyFilter({ hex: '0xf4f4f5', kind: 'white', similarity: 0.16, blend: 0.08 });
  assert.match(white, /colorkey=/);
  assert.match(white, /format=yuva420p/);
});

test('inspectMedia reports audio and duration', () => {
  const info = inspectMedia({
    format: { duration: '8.2', format_name: 'mp4' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, duration: '8.2', avg_frame_rate: '30/1', pix_fmt: 'yuv420p' },
      { codec_type: 'audio', codec_name: 'aac', duration: '8.2' },
    ],
  });
  assert.equal(info.hasAudio, true);
  assert.equal(info.hasAlphaChannel, false);
  assert.ok(Math.abs(info.durationSec - 8.2) < 0.01);
});

test('inspectMedia detects WebM alpha from ALPHA_MODE even if pix_fmt is yuv420p', () => {
  const info = inspectMedia({
    format: { duration: '3.1', format_name: 'matroska,webm' },
    streams: [
      {
        codec_type: 'video',
        codec_name: 'vp9',
        width: 512,
        height: 512,
        duration: '3.1',
        avg_frame_rate: '30/1',
        pix_fmt: 'yuv420p',
        tags: { ALPHA_MODE: '1' },
      },
    ],
  });
  assert.equal(info.hasAlphaChannel, true);
});

test('black and white keys stay conservative so sparkles survive', () => {
  const black = buildKeyFilter({ hex: '0x000000', kind: 'black', similarity: 0.16, blend: 0.08 });
  assert.match(black, /colorkey=0x000000:0\.100:0\.120/);
  const white = buildKeyFilter({ hex: '0xf4f4f5', kind: 'white', similarity: 0.16, blend: 0.08 });
  assert.match(white, /colorkey=0xf4f4f5:0\.100:0\.120/);
});

test('delete helpers keep shared and public assets', () => {
  const gift = {
    id: 'nuevo',
    video: 'https://firebasestorage.googleapis.com/v0/b/liveboom-app.firebasestorage.app/o/config%2Fgifts%2Fnuevo-original-1.webm?alt=media',
    image: '/gifts/besito.png',
    media: { originalAsset: 'https://firebasestorage.googleapis.com/v0/b/x/o/config%2Fgifts%2Fnuevo-original-1.webm?alt=media' },
  };
  const urls = collectUrls(gift);
  assert.equal(urls.has('/gifts/besito.png'), true);
  const path = storagePathFromUrl([...urls][0]);
  if (path) {
    assert.equal(isExclusivePath(path, 'nuevo'), true);
    assert.equal(isExclusivePath(path, 'otro'), false);
  }
  assert.equal(storagePathFromUrl('/gifts/besito.png'), null);
});
