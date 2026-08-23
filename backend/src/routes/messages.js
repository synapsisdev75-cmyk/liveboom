const express = require('express');
const { asFn } = require('../lib/asFn');
const messages = require('../lib/messageMemory');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

router.get('/conversations', requireAuth, (req, res) => {
  res.json({ conversations: messages.listConversations(req.user.uid) });
});

router.get('/:username', requireAuth, (req, res) => {
  const result = messages.listMessages(req.user.uid, req.params.username);
  if (result.error) {
    res.status(result.error === 'Usuario no encontrado' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json(result);
});

router.post('/:username', requireAuth, (req, res) => {
  const result = messages.sendMessage(req.user.uid, req.params.username, req.body?.text);
  if (result.error) {
    res.status(result.error === 'Usuario no encontrado' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

module.exports = router;
module.exports.default = router;
