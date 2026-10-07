const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isShareCrawler,
  shareClientKind,
  sharePostIdFromPath,
  previewFromPost,
  renderShareOgHtml,
  renderAndroidChoiceHtml,
  browserIntentUrl,
  shareImageUrl,
  isShareImagePath,
  webPostPath,
} = require('./sharePreview');
const { shareCardBox } = require('./shareImage');

test('crawlers de redes se reconocen y el celular no', () => {
  assert.equal(isShareCrawler('WhatsApp/2.23.1'), true);
  assert.equal(isShareCrawler('facebookexternalhit/1.1'), true);
  assert.equal(isShareCrawler('Twitterbot/1.0'), true);
  assert.equal(isShareCrawler('Mozilla/5.0 (Linux; Android 14) Chrome/120'), false);
});

test('el dispositivo manda a tienda o al sitio', () => {
  assert.equal(shareClientKind('Mozilla/5.0 (Linux; Android 14)'), 'android');
  assert.equal(shareClientKind('Mozilla/5.0 (Linux; Android 14; wv)'), 'app');
  assert.equal(shareClientKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(shareClientKind('Mozilla/5.0 (Windows NT 10.0)'), 'desktop');
  assert.equal(
    shareClientKind('Mozilla/5.0 (Linux; Android 14; wv) Chrome/120 Instagram 300.0.0'),
    'android-inapp',
  );
  assert.equal(
    shareClientKind('Mozilla/5.0 (Linux; Android 14; wv) Chrome/120 [FB_IAB/FB4A;FBAV/450.0]'),
    'android-inapp',
  );
});

test('Android: Google Play o seguir en el navegador; dentro de Instagram sale al navegador', () => {
  const webUrl = 'https://liveboomapp.com/u/yemdups?post=abc&uid=uid1';
  const preview = previewFromPost({ username: 'yemdups', visibility: 'public', type: 'photo', caption: 'Goku' });
  const html = renderAndroidChoiceHtml({ preview, webUrl, imageUrl: 'https://liveboomapp.com/s/abc/og.jpg?v=1' });
  assert.match(html, /scheme=market;package=com\.android\.vending/);
  assert.match(html, /id=com\.liveboom\.app/);
  assert.match(html, /Continuar en el navegador/);
  assert.match(html, /href="https:\/\/liveboomapp\.com\/u\/yemdups\?post=abc&amp;uid=uid1"/);
  assert.match(html, /og\.jpg/);
  assert.doesNotMatch(html, /scheme=https;/);
  const inApp = renderAndroidChoiceHtml({ preview, webUrl, imageUrl: 'x', inApp: true });
  assert.match(inApp, /intent:\/\/liveboomapp\.com\/u\/yemdups\?post=abc&uid=uid1#Intent;scheme=https;/);
  assert.equal(
    browserIntentUrl(webUrl),
    `intent://liveboomapp.com/u/yemdups?post=abc&uid=uid1#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`,
  );
  const og = renderShareOgHtml({
    preview: previewFromPost({ username: 'yemdups', visibility: 'public', type: 'text' }),
    pageUrl: 'https://liveboomapp.com/s/abc',
    webUrl: 'https://liveboomapp.com/u/yemdups?post=abc',
  });
  assert.match(og, /Ver publicación en LiveBoom/);
});

test('WhatsApp recibe la imagen grande 1200×630 generada', () => {
  const preview = previewFromPost({
    username: 'yemdups',
    visibility: 'public',
    type: 'photo',
    mediaUrl: 'https://cdn.example/goku.jpg',
    mediaWidth: 1080,
    mediaHeight: 1350,
  });
  const ogImage = shareImageUrl('abc', preview);
  assert.match(ogImage, /^https:\/\/liveboomapp\.com\/s\/abc\/og\.jpg\?v=[0-9a-f]{10}$/);
  assert.notEqual(ogImage, shareImageUrl('abc', { ...preview, image: 'https://cdn.example/otra.jpg' }));
  const html = renderShareOgHtml({ preview, pageUrl: 'https://liveboomapp.com/s/abc', ogImage });
  assert.match(html, /og:image" content="https:\/\/liveboomapp\.com\/s\/abc\/og\.jpg/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
  assert.match(html, /og:image:type" content="image\/jpeg"/);
  assert.match(html, /summary_large_image/);
  assert.equal(isShareImagePath('/s/abc/og.jpg'), true);
  assert.equal(isShareImagePath('/s/abc'), false);
  assert.equal(sharePostIdFromPath('/s/abc/og.jpg'), 'abc');
});

test('la tarjeta de la imagen: vertical se recorta a lo ancho, horizontal entra completa', () => {
  const portrait = shareCardBox(9 / 16);
  assert.deepEqual([portrait.width, portrait.height], [720, 590]);
  const wide = shareCardBox(16 / 9);
  assert.equal(wide.height, 590);
  assert.equal(wide.width, 1049);
  const pano = shareCardBox(3);
  assert.deepEqual([pano.width, pano.height], [1080, 360]);
  for (const box of [portrait, wide, pano]) {
    assert.ok(box.left >= 0 && box.top >= 0);
    assert.ok(box.left + box.width <= 1200 && box.top + box.height <= 630);
  }
});

test('la vista previa usa el video público y no filtra uno privado', () => {
  const pub = previewFromPost({
    username: 'yemdups',
    authorUid: 'uid1',
    visibility: 'public',
    type: 'video',
    caption: 'trabajo',
    mediaUrl: 'https://cdn.example/video.mp4',
    thumbUrl: 'https://cdn.example/thumb.jpg',
    mediaWidth: 1920,
    mediaHeight: 1080,
  });
  assert.equal(pub.video, 'https://cdn.example/video.mp4');
  assert.equal(pub.image, 'https://cdn.example/thumb.jpg');
  const html = renderShareOgHtml({ preview: pub, pageUrl: 'https://liveboomapp.com/s/abc' });
  assert.match(html, /og:video/);
  assert.match(html, /thumb\.jpg/);

  const hidden = previewFromPost({
    username: 'yemdups',
    visibility: 'private',
    type: 'video',
    mediaUrl: 'https://cdn.example/secret.mp4',
    thumbUrl: 'https://cdn.example/secret.jpg',
  });
  assert.equal(hidden.video, '');
  assert.equal(hidden.image.includes('secret'), false);
  assert.equal(webPostPath(pub, 'abc'), '/u/yemdups?post=abc&uid=uid1');
  assert.equal(sharePostIdFromPath('/s/abc'), 'abc');
});

test('Flash Boom (circle) muestra su foto o video al compartir', () => {
  const flashPhoto = previewFromPost({
    username: 'yemdups',
    visibility: 'circle',
    type: 'photo',
    mediaUrl: 'https://cdn.example/flash.jpg',
  });
  assert.equal(flashPhoto.image, 'https://cdn.example/flash.jpg');
  const flashVideo = previewFromPost({
    username: 'yemdups',
    visibility: 'circle',
    type: 'video',
    mediaUrl: 'https://cdn.example/flash.mp4',
    thumbUrl: 'https://cdn.example/flash-thumb.jpg',
  });
  assert.equal(flashVideo.video, 'https://cdn.example/flash.mp4');
  assert.equal(flashVideo.image, 'https://cdn.example/flash-thumb.jpg');
  const friendsOnly = previewFromPost({
    username: 'yemdups',
    visibility: 'friends',
    type: 'photo',
    mediaUrl: 'https://cdn.example/friends.jpg',
  });
  assert.equal(friendsOnly.image.includes('friends.jpg'), false);
});

test('sin foto/miniatura usa la carátula del enlace, luego la foto de perfil', () => {
  const withLink = previewFromPost({
    username: 'yemdups',
    visibility: 'public',
    type: 'text',
    caption: 'mira',
    linkPreview: { image: 'https://cdn.example/link.jpg' },
    authorAvatarUrl: 'https://cdn.example/avatar.jpg',
  });
  assert.equal(withLink.image, 'https://cdn.example/link.jpg');
  const textOnly = previewFromPost({
    username: 'yemdups',
    visibility: 'public',
    type: 'text',
    caption: 'Ahora me encuentran en liveboom',
    mediaWidth: 1080,
    mediaHeight: 1920,
    authorAvatarUrl: 'https://cdn.example/avatar.jpg',
  });
  assert.equal(textOnly.image, 'https://cdn.example/avatar.jpg');
  assert.equal(textOnly.width, 0);
  assert.match(previewFromPost({ username: 'x', type: 'text' }).image, /logo-clear\.png$/);
});

test('los emojis LiveBoom salen como emojis normales en la vista previa', () => {
  const p = previewFromPost({
    username: 'yemdups',
    visibility: 'public',
    type: 'text',
    caption: ':heart_eyes: :heart_eyes: :angel: hola :emo_happy_dance_gif_2: a las 10:30:00',
  });
  assert.equal(p.title, '😍 😍 😇 hola a las 10:30:00');
  assert.equal(p.description, p.title);
});
