const User = require('../models/User');
const Product = require('../models/Product');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Get user's wishlist
// @route   GET /api/wishlist
// @access  Private
const getWishlist = asyncHandler(async (req, res) => {
  try {
    // Prevent sellers from accessing wishlist
    if (req.user.role === 'seller') {
      return res.status(403).json({
        success: false,
        message: 'Sellers cannot access wishlist. Wishlist is only available for buyers to track products they want to purchase.'
      });
    }

    const user = await User.findById(req.user.id)
      .populate({
        path: 'wishlist',
        populate: {
          path: 'seller',
          select: 'name businessInfo avatar'
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      wishlist: user.wishlist,
      count: user.wishlist.length
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching wishlist'
    });
  }
});

// @desc    Add product to wishlist
// @route   POST /api/wishlist/add
// @access  Private
const addToWishlist = asyncHandler(async (req, res) => {
  try {
    const { productId } = req.body;

    // Prevent sellers from using wishlist
    if (req.user.role === 'seller') {
      return res.status(403).json({
        success: false,
        message: 'Sellers cannot use wishlist. Wishlist is only available for buyers to track products they want to purchase.'
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user is trying to add their own product
    if (product.seller.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot add your own product to wishlist'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if product is already in wishlist
    if (user.wishlist.includes(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Product is already in your wishlist'
      });
    }

    // Add to wishlist
    user.wishlist.push(productId);
    await user.save();

    // Get updated wishlist with populated data
    const updatedUser = await User.findById(req.user.id)
      .populate({
        path: 'wishlist',
        populate: {
          path: 'seller',
          select: 'name businessInfo avatar'
        }
      });

    res.status(200).json({
      success: true,
      message: 'Product added to wishlist',
      wishlist: updatedUser.wishlist,
      count: updatedUser.wishlist.length
    });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding to wishlist'
    });
  }
});

// @desc    Remove product from wishlist
// @route   DELETE /api/wishlist/remove/:productId
// @access  Private
const removeFromWishlist = asyncHandler(async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if product is in wishlist
    if (!user.wishlist.includes(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Product is not in your wishlist'
      });
    }

    // Remove from wishlist
    user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    await user.save();

    // Get updated wishlist with populated data
    const updatedUser = await User.findById(req.user.id)
      .populate({
        path: 'wishlist',
        populate: {
          path: 'seller',
          select: 'name businessInfo avatar'
        }
      });

    res.status(200).json({
      success: true,
      message: 'Product removed from wishlist',
      wishlist: updatedUser.wishlist,
      count: updatedUser.wishlist.length
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing from wishlist'
    });
  }
});

// @desc    Clear entire wishlist
// @route   DELETE /api/wishlist
// @access  Private
const clearWishlist = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.wishlist = [];
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Wishlist cleared successfully',
      wishlist: [],
      count: 0
    });
  } catch (error) {
    console.error('Clear wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while clearing wishlist'
    });
  }
});

// @desc    Check if product is in wishlist
// @route   GET /api/wishlist/check/:productId
// @access  Private
const checkIfInWishlist = asyncHandler(async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isInWishlist = user.wishlist.includes(productId);

    res.status(200).json({
      success: true,
      isInWishlist,
      productId
    });
  } catch (error) {
    console.error('Check wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking wishlist'
    });
  }
});

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  checkIfInWishlist
};
