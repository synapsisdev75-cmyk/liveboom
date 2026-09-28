const express = require('express');
const { extractFirstHttpUrl, unfurlLink } = require('../lib/linkUnfurl');

const router = express.Router();

router.get('/preview', async (req, res) => {
  try {
    const raw = String(req.query.url || req.query.q || '').trim();
    const hint = String(req.query.hint || '').trim().slice(0, 160);
    const fromText = extractFirstHttpUrl(raw);
    const target = fromText || raw;
    if (!target) {
      res.status(400).json({ error: 'Falta la URL' });
      return;
    }
    const preview = await unfurlLink(target, { hint: hint || raw });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ ok: true, preview });
  } catch (error) {
    const status = Number(error?.status) || 502;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'No se pudo leer el enlace',
    });
  }
});

module.exports = router;
