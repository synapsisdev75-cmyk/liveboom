const express = require('express');
const { requireAuth, requireDbUser } = require('../middleware/auth');
const { createOrder } = require('../controllers/paymentsController');

const router = express.Router();

router.post('/create-order', requireAuth, requireDbUser, createOrder);

module.exports = router;
