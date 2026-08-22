const express = require('express');
const { bind, mw } = require('../lib/bind');

const router = express.Router();
const auth = () => require('../middleware/auth');
const payments = () => require('../controllers/paymentsController');

router.post(
  '/create-order',
  mw(auth, 'requireAuth'),
  mw(auth, 'requireDbUser'),
  bind(payments, 'createOrder'),
);

router.post(
  '/complete-widget',
  mw(auth, 'requireAuth'),
  bind(payments, 'completeWidget'),
);

module.exports = router;
module.exports.default = router;
