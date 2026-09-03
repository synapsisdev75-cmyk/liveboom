const express = require('express');
const { asFn } = require('../lib/asFn');
const { bind } = require('../lib/bind');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));

router.get(
  '/status',
  bind(() => require('../controllers/paymentsController'), 'getPaymentStatus'),
);

router.post(
  '/create-order',
  requireAuth,
  requireDbUser,
  bind(() => require('../controllers/paymentsController'), 'createOrder'),
);

router.post(
  '/complete-redirect',
  requireAuth,
  bind(() => require('../controllers/paymentsController'), 'completeRedirect'),
);

router.post(
  '/complete-widget',
  requireAuth,
  bind(() => require('../controllers/paymentsController'), 'completeWidget'),
);

router.get(
  '/withdrawals',
  requireAuth,
  requireDbUser,
  bind(() => require('../controllers/paymentsController'), 'listMyWithdrawals'),
);

router.post(
  '/withdraw',
  requireAuth,
  requireDbUser,
  bind(() => require('../controllers/paymentsController'), 'withdrawCoins'),
);

module.exports = router;
module.exports.default = router;
