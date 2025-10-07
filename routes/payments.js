const express = require('express');
const { body } = require('express-validator');
const {
  createStripePaymentIntent,
  confirmStripePayment,
  createRazorpayOrder,
  verifyRazorpayPayment,
  processRefund,
  getPaymentMethods,
  stripeWebhook
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

// Validation rules
const paymentValidation = [
  body('orderId')
    .isMongoId()
    .withMessage('Valid order ID is required')
];

const refundValidation = [
  body('orderId')
    .isMongoId()
    .withMessage('Valid order ID is required'),
  body('reason')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Refund reason must be between 5 and 500 characters')
];

// Public routes
router.get('/methods', getPaymentMethods);
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Protected routes
router.post('/stripe/intent', protect, paymentValidation, handleValidationErrors, createStripePaymentIntent);
router.post('/stripe/confirm', protect, confirmStripePayment);
router.post('/razorpay/order', protect, paymentValidation, handleValidationErrors, createRazorpayOrder);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);
router.post('/refund', protect, refundValidation, handleValidationErrors, processRefund);

module.exports = router;
