/**
 * Fuente de reproducción de animaciones de regalo.
 * Ejecutar: npx tsx apps/web/src/lib/giftMedia.test.ts
 */
import { defaultGiftMedia, giftPlaybackSrc, giftStackedAlphaSrc, normalizeGiftMedia } from './giftMedia';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const original = 'https://example.com/original.mov';
const processed = 'https://example.com/processed.webm';
const catalog = 'https://example.com/catalog.webm';

assert(
  giftPlaybackSrc(undefined, catalog) === catalog,
  'sin media usa video del catálogo',
);

assert(
  giftPlaybackSrc(
    { ...defaultGiftMedia(), originalAsset: original, processedAsset: processed },
    catalog,
  ) === processed,
  'producción usa el archivo procesado',
);

assert(
  giftPlaybackSrc(
    { ...defaultGiftMedia(), originalAsset: original, processedAsset: processed },
    catalog,
    'original',
  ) === original,
  'prefer original conserva el archivo subido',
);

assert(
  giftPlaybackSrc(
    { ...defaultGiftMedia(), originalAsset: original, processedAsset: null, needsReview: true },
    catalog,
  ) === catalog,
  'en revisión no inventa un procesado',
);

const normalized = normalizeGiftMedia({
  hasAudio: true,
  duration: 4.2,
  needsReview: true,
  ingestReason: 'opaque-or-complex',
  ingestMessage: 'Revisar',
  processedAsset: processed,
  originalAsset: original,
});
assert(normalized.needsReview === true, 'needsReview persiste');
assert(normalized.ingestReason === 'opaque-or-complex', 'ingestReason persiste');
assert(giftPlaybackSrc(normalized, catalog) === processed, 'si hay procesado se reutiliza');

const stackedUrl = 'https://example.com/gift-ios.mp4';
const withStacked = normalizeGiftMedia({ processedAsset: processed, stackedAlphaAsset: stackedUrl, stackedAlphaSource: processed });
assert(withStacked.stackedAlphaAsset === stackedUrl, 'stackedAlphaAsset persiste al normalizar');
assert(giftStackedAlphaSrc(withStacked, processed) === stackedUrl, 'versión iPhone vigente');
assert(giftStackedAlphaSrc(withStacked, catalog) === '', 'versión iPhone de otro video no se usa');
assert(giftStackedAlphaSrc(defaultGiftMedia(), processed) === '', 'sin versión iPhone usa el WebM');

console.log('giftMedia.test.ts ok');
