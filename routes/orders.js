const express = require('express');
const { body } = require('express-validator');
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  addOrderMessage,
  addOrderRating,
  getOrderStats
} = require('../controllers/orderController');
const { protect, requireSeller, requireBuyer } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

// Validation rules
const createOrderValidation = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  body('items.*.product')
    .isMongoId()
    .withMessage('Valid product ID is required'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('delivery.method')
    .isIn(['pickup', 'delivery'])
    .withMessage('Delivery method must be pickup or delivery'),
  body('payment.method')
    .isIn(['stripe', 'razorpay', 'cash_on_delivery'])
    .withMessage('Invalid payment method')
];

const updateStatusValidation = [
  body('status')
    .isIn(['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])
    .withMessage('Invalid status')
];

const ratingValidation = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5')
];

// Routes
router.get('/stats', protect, requireSeller, getOrderStats);
router.get('/', protect, getOrders);
router.post('/', protect, requireBuyer, createOrderValidation, handleValidationErrors, createOrder);
router.get('/:id', protect, getOrder);
router.put('/:id/status', protect, updateStatusValidation, handleValidationErrors, updateOrderStatus);
router.put('/:id/cancel', protect, cancelOrder);
router.post('/:id/messages', protect, addOrderMessage);
router.post('/:id/rating', protect, ratingValidation, handleValidationErrors, addOrderRating);

module.exports = router;
