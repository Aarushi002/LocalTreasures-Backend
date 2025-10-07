const express = require('express');
const { body } = require('express-validator');
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  addReview,
  updateReview,
  deleteReview,
  canReview,
  getSellerProducts,
  toggleLike,
  getCategories,
  getFeaturedProducts,
  toggleFeatured
} = require('../controllers/productController');
const { protect, requireSeller, optionalAuth, preventBuyerSelling, requireBuyer } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

// Validation rules
const createProductValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('category')
    .isIn(['handmade', 'food', 'art', 'clothing', 'jewelry', 'home_decor', 'other'])
    .withMessage('Invalid category'),
  body('images')
    .isArray({ min: 1 })
    .withMessage('At least one image is required'),
  body('images.*.url')
    .custom((value) => {
      // Accept full URLs or relative paths starting with /uploads/
      if (value.startsWith('/uploads/') || value.match(/^https?:\/\//)) {
        return true;
      }
      throw new Error('Invalid image URL');
    })
    .withMessage('Invalid image URL')
];

const reviewValidation = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment cannot exceed 500 characters')
];

// Public routes
router.get('/categories', getCategories);
router.get('/featured', getFeaturedProducts);
router.get('/', optionalAuth, getProducts);
router.get('/seller/:sellerId', getSellerProducts);
router.get('/:id', getProduct);

// Protected routes
router.post('/', protect, preventBuyerSelling, requireSeller, createProductValidation, handleValidationErrors, createProduct);
router.put('/:id', protect, preventBuyerSelling, requireSeller, updateProduct);
router.delete('/:id', protect, preventBuyerSelling, requireSeller, deleteProduct);
router.get('/:id/can-review', protect, canReview);
router.post('/:id/reviews', protect, requireBuyer, reviewValidation, handleValidationErrors, addReview);
router.put('/:id/reviews/:reviewId', protect, requireBuyer, reviewValidation, handleValidationErrors, updateReview);
router.delete('/:id/reviews/:reviewId', protect, deleteReview);
router.post('/:id/like', protect, requireBuyer, toggleLike);
router.put('/:id/featured', protect, toggleFeatured);

module.exports = router;
