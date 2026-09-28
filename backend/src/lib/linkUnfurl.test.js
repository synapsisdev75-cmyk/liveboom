const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractFirstHttpUrl,
  isAllowedPreviewUrl,
  normalizePlayerUrl,
  isWeakTitle,
  isWeakImage,
} = require('./linkUnfurl');

test('extrae la primera URL http(s) del texto', () => {
  const url = extractFirstHttpUrl(
    'Mira esto https://open.spotify.com/track/3AR1c3Dssq51WIGGkuYJNj?si=abc y comenta',
  );
  assert.match(url, /^https:\/\/open\.spotify\.com\/track\//);
});

test('bloquea hosts locales', () => {
  assert.equal(isAllowedPreviewUrl('https://open.spotify.com/track/1'), true);
  assert.equal(isAllowedPreviewUrl('http://127.0.0.1/x'), false);
  assert.equal(isAllowedPreviewUrl('ftp://example.com/x'), false);
});

test('normaliza URLs de Spotify y youtu.be', () => {
  assert.equal(
    normalizePlayerUrl(
      'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=abc&utm_source=native-share-menu',
    ),
    'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
  );
  assert.equal(
    normalizePlayerUrl('https://youtu.be/dQw4w9WgXcQ?si=xyz'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
});

test('detecta títulos e imágenes genéricas de Spotify', () => {
  assert.equal(isWeakTitle('Spotify – Web Player'), true);
  assert.equal(isWeakTitle('Shape of You'), false);
  assert.equal(
    isWeakImage('https://open.spotifycdn.com/cdn/images/download-page-image-mac.fec937cc.png'),
    true,
  );
  assert.equal(
    isWeakImage('https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96'),
    false,
  );
});
