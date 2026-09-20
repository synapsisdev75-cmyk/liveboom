const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sniffKind, inspectImageMeta } = require('./promoInspect');

describe('inspección de banners', () => {
  it('no cobra GIF animado como estático por ser imagen', () => {
    const gif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x2c, 0x2c,
    ]);
    const sniff = sniffKind(gif, 'image/gif', 'promo.gif');
    assert.equal(sniff.format, 'animated');
  });

  it('trata JPEG como estático', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    assert.equal(sniffKind(jpeg, '', 'x.jpg').format, 'static');
  });

  it('rechaza animaciones de más de 20 s', () => {
    const result = inspectImageMeta(
      { width: 2172, height: 724, durationSec: 21 },
      { container: 'mp4', format: 'animated' },
    );
    assert.equal(result.ready, false);
    assert.match(result.errors[0], /20/);
  });
});
