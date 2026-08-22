const express = require('express');
const { requireAuth, requireDbUser } = require('../middleware/auth');
const { createOrder, completeWidget } = require('../controllers/paymentsController');

const router = express.Router();

router.post('/create-order', requireAuth, requireDbUser, createOrder);
router.post('/complete-widget', requireAuth, completeWidget);

module.exports = router;
