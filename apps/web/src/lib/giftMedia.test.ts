/**
 * Fuente de reproducción de animaciones de regalo.
 * Ejecutar: npx tsx apps/web/src/lib/giftMedia.test.ts
 */
import {
  defaultGiftMedia,
  giftAssetKey,
  giftPlaybackSrc,
  giftStackedAlphaSrc,
  normalizeGiftMedia,
  preserveGiftStackedAlpha,
  sameGiftAsset,
} from './giftMedia';

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

const storageA =
  'https://firebasestorage.googleapis.com/v0/b/liveboom-app.firebasestorage.app/o/config%2Fgifts%2Fjaguar.webm?alt=media&token=aaa';
const storageB =
  'https://firebasestorage.googleapis.com/v0/b/liveboom-app.firebasestorage.app/o/config%2Fgifts%2Fjaguar.webm?alt=media&token=bbb';
assert(giftAssetKey(storageA) === 'config/gifts/jaguar.webm', 'clave ignora token');
assert(sameGiftAsset(storageA, storageB), 'mismo archivo con otro token');
const stackedByPath = normalizeGiftMedia({
  processedAsset: storageB,
  stackedAlphaAsset: stackedUrl,
  stackedAlphaSource: storageA,
});
assert(giftStackedAlphaSrc(stackedByPath, storageB) === stackedUrl, 'iPhone usa stacked aunque cambie el token');

const published = preserveGiftStackedAlpha(
  { video: storageA, media: stackedByPath },
  { video: storageB, media: normalizeGiftMedia({ processedAsset: storageB }) },
);
assert(published.media?.stackedAlphaAsset === stackedUrl, 'publicar no borra la versión iPhone');
assert(giftStackedAlphaSrc(published.media, storageB) === stackedUrl, 'tras publicar iPhone sigue usando stacked');

const replaced = preserveGiftStackedAlpha(
  { video: storageA, media: stackedByPath },
  { video: catalog, media: normalizeGiftMedia({ processedAsset: catalog }) },
);
assert(!replaced.media?.stackedAlphaAsset, 'si cambia el video no se reutiliza el stacked viejo');

console.log('giftMedia.test.ts ok');
