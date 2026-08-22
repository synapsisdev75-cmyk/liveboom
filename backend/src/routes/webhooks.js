const express = require('express');
const { handleWompiWebhook } = require('../controllers/wompiWebhookController');

const router = express.Router();

router.post('/wompi', handleWompiWebhook);

module.exports = router;
