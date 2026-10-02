const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isShareCrawler,
  shareClientKind,
  sharePostIdFromPath,
  previewFromPost,
  renderShareOgHtml,
  renderOpenInBrowserHtml,
  shareAppHandoffEnabled,
  webPostPath,
} = require('./sharePreview');

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

test('sin apps publicadas, el enlace abre el sitio en el navegador', () => {
  delete process.env.SHARE_APP_HANDOFF;
  assert.equal(shareAppHandoffEnabled(), false);
  const html = renderOpenInBrowserHtml({ webUrl: 'https://liveboomapp.com/u/yemdups?post=abc&uid=uid1' });
  assert.match(html, /intent:\/\/liveboomapp\.com\/u\/yemdups\?post=abc&uid=uid1#Intent;scheme=https;/);
  assert.doesNotMatch(html, /play\.google\.com/);
  const og = renderShareOgHtml({
    preview: previewFromPost({ username: 'yemdups', visibility: 'public', type: 'text' }),
    pageUrl: 'https://liveboomapp.com/s/abc',
    webUrl: 'https://liveboomapp.com/u/yemdups?post=abc',
  });
  assert.match(og, /Ver publicación en LiveBoom/);
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
