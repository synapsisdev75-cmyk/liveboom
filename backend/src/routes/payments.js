const express = require('express');
const auth = require('../middleware/auth');
const { bind } = require('../lib/bind');

const router = express.Router();

const requireAuth = auth.requireAuth || auth.default?.requireAuth;
const requireDbUser = auth.requireDbUser || auth.default?.requireDbUser;

router.post(
  '/create-order',
  requireAuth,
  requireDbUser,
  bind(() => require('../controllers/paymentsController'), 'createOrder'),
);

router.post(
  '/complete-widget',
  requireAuth,
  bind(() => require('../controllers/paymentsController'), 'completeWidget'),
);

module.exports = router;
