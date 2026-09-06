const express = require('express');
const { asFn } = require('../lib/asFn');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

const ALLOWED = new Set(['es', 'en', 'fr', 'it', 'pt', 'zh', 'zh-CN', 'auto']);
const buckets = new Map();

function normalizeLang(value) {
  const raw = String(value || 'auto').trim();
  if (raw === 'zh') return 'zh-CN';
  return raw;
}

function allowed(value) {
  const code = normalizeLang(value);
  return ALLOWED.has(code) || ALLOWED.has(String(value || '').slice(0, 2));
}

function rateOk(uid) {
  const now = Date.now();
  const row = buckets.get(uid) || { count: 0, start: now };
  if (now - row.start > 60_000) {
    row.count = 0;
    row.start = now;
  }
  row.count += 1;
  buckets.set(uid, row);
  return row.count <= 80;
}

function parseGoogleChunks(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return '';
  return data[0]
    .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
    .join('')
    .trim();
}

async function googleTranslate(text, source, target) {
  const sl = source === 'auto' ? 'auto' : source;
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx' +
    `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) return null;
  const data = await response.json();
  const out = parseGoogleChunks(data);
  return out || null;
}

async function myMemoryTranslate(text, source, target) {
  const sl = source === 'auto' ? 'Autodetect' : source;
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}` +
    `&langpair=${encodeURIComponent(`${sl}|${target}`)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) return null;
  const data = await response.json();
  const out = String(data?.responseData?.translatedText || '').trim();
  if (!out || /MYMEMORY WARNING/i.test(out)) return null;
  return out;
}

router.post('/', requireAuth, async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!rateOk(uid)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  const source = normalizeLang(req.body?.source || 'auto');
  const target = normalizeLang(req.body?.target || 'es');
  if (!text) {
    res.status(400).json({ error: 'text_required' });
    return;
  }
  if (!allowed(source) || !allowed(target) || target === 'auto') {
    res.status(400).json({ error: 'unsupported_language' });
    return;
  }
  if (source !== 'auto' && source === target) {
    res.json({ text, source, target });
    return;
  }
  try {
    const translated = (await googleTranslate(text, source, target)) || (await myMemoryTranslate(text, source, target));
    res.json({ text: translated || text, source, target });
  } catch (error) {
    console.error('[translate]', error?.message || error);
    res.json({ text, source, target });
  }
});

module.exports = router;
module.exports.default = router;
