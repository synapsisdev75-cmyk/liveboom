const express = require('express');
const { bind } = require('../lib/bind');

const router = express.Router();

router.post(
  '/wompi',
  bind(() => require('../controllers/wompiWebhookController'), 'handleWompiWebhook'),
);

module.exports = router;
