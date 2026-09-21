/**
 * Ingesta universal de animaciones: decisión pura, sin FFmpeg.
 * Ejecutar: node --test backend/src/lib/giftAnimIngest.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planGiftAnimIngest, REASONS } = require('./giftAnimIngest');

describe('planGiftAnimIngest', () => {
  it('reutiliza WebM VP9 con alfa real', () => {
    const plan = planGiftAnimIngest({
      hasAlphaChannel: true,
      alphaUsable: true,
      codec: 'vp9',
      container: 'matroska,webm',
    });
    assert.equal(plan.action, 'ready');
    assert.equal(plan.reason, REASONS.WEB_M_ALPHA);
  });

  it('convierte MOV/MP4 con canal alfa sin aplanar', () => {
    const plan = planGiftAnimIngest({
      hasAlphaChannel: true,
      alphaUsable: true,
      codec: 'prores',
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
    });
    assert.equal(plan.action, 'convert-alpha');
    assert.equal(plan.reason, REASONS.KEEP_ALPHA);
  });

  it('quita solo croma verde o rojo uniforme', () => {
    const green = planGiftAnimIngest({
      hasAlphaChannel: false,
      alphaUsable: null,
      codec: 'h264',
      container: 'mp4',
      bgKind: 'green',
      bgUniform: true,
    });
    assert.equal(green.action, 'bg-remove');
    assert.equal(green.reason, REASONS.CHROMA);

    const red = planGiftAnimIngest({
      hasAlphaChannel: false,
      alphaUsable: null,
      codec: 'h264',
      container: 'mp4',
      bgKind: 'red',
      bgUniform: true,
    });
    assert.equal(red.action, 'bg-remove');
  });

  it('no aplica key de negro o blanco: marca revisión o empaqueta sin recortar', () => {
    const black = planGiftAnimIngest({
      hasAlphaChannel: false,
      alphaUsable: null,
      codec: 'h264',
      container: 'mp4',
      bgKind: 'black',
      bgUniform: true,
    });
    assert.equal(black.action, 'convert-alpha');
    assert.equal(black.reason, REASONS.PACKAGING);

    const whiteWebm = planGiftAnimIngest({
      hasAlphaChannel: false,
      alphaUsable: null,
      codec: 'vp9',
      container: 'webm',
      bgKind: 'white',
      bgUniform: true,
    });
    assert.equal(whiteWebm.action, 'review');
    assert.equal(whiteWebm.reason, REASONS.REVIEW);
  });

  it('marca revisión si el alfa declarado está opaco o el fondo es complejo', () => {
    const opaqueWebm = planGiftAnimIngest({
      hasAlphaChannel: true,
      alphaUsable: false,
      codec: 'vp9',
      container: 'webm',
      bgKind: 'flat',
      bgUniform: false,
    });
    assert.equal(opaqueWebm.action, 'review');

    const complex = planGiftAnimIngest({
      hasAlphaChannel: false,
      alphaUsable: null,
      codec: 'vp9',
      container: 'webm',
      bgKind: 'flat',
      bgUniform: false,
    });
    assert.equal(complex.action, 'review');
  });

  it('empaqueta MOV/MP4 opaco a WebM de producción sin quitar fondo', () => {
    const plan = planGiftAnimIngest({
      hasAlphaChannel: false,
      alphaUsable: null,
      codec: 'h264',
      container: 'mov',
      bgKind: 'flat',
      bgUniform: false,
    });
    assert.equal(plan.action, 'convert-alpha');
    assert.equal(plan.reason, REASONS.PACKAGING);
  });
});
