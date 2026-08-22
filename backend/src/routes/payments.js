const express = require('express');
const { asFn } = require('../lib/asFn');
const { bind } = require('../lib/bind');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));

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
module.exports.default = router;
