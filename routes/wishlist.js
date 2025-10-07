const express = require('express');
const router = express.Router();
const { protect, requireBuyer } = require('../middleware/auth');
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  checkIfInWishlist
} = require('../controllers/wishlistController');

// Get user's wishlist
router.get('/', protect, requireBuyer, getWishlist);

// Add product to wishlist
router.post('/add', protect, requireBuyer, addToWishlist);

// Remove product from wishlist
router.delete('/remove/:productId', protect, requireBuyer, removeFromWishlist);

// Clear entire wishlist
router.delete('/', protect, requireBuyer, clearWishlist);

// Check if product is in wishlist
router.get('/check/:productId', protect, requireBuyer, checkIfInWishlist);

module.exports = router;
