const Product = require('../models/Product');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Get all products with location-based filtering
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  const {
    latitude,
    longitude,
    radius = 10000, // 10km default
    category,
    subcategory,
    minPrice,
    maxPrice,
    search,
    sort = '-createdAt',
    page = 1,
    limit = 20,
    inStockOnly,
    freeDelivery,
    minRating,
    tags
  } = req.query;

  let query = { isActive: true };
  let products;

  // Stock filter
  if (inStockOnly === 'true' || inStockOnly === true) {
    query['availability.inStock'] = true;
  }

  // Build filter object
  if (category && category !== '') {
    query.category = category;
  }
  
  if (subcategory && subcategory !== '') {
    query.subcategory = new RegExp(subcategory, 'i');
  }
  
  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice && minPrice !== '') query.price.$gte = Number(minPrice);
    if (maxPrice && maxPrice !== '') query.price.$lte = Number(maxPrice);
  }

  // Rating filter
  if (minRating && minRating !== '') {
    query['ratings.average'] = { $gte: Number(minRating) };
  }

  // Free delivery filter
  if (freeDelivery === 'true' || freeDelivery === true) {
    query['delivery.fee'] = { $lte: 0 };
  }

  // Tags filter
  if (tags && tags !== '') {
    const tagArray = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    query.tags = { $in: tagArray };
  }

  // Text search - improved to handle partial matches
  if (search && search.trim() !== '') {
    // Try MongoDB text search first
    const textSearchQuery = { ...query, $text: { $search: search.trim() } };
    
    // Also create a regex-based search as fallback for partial matches
    const regexSearchQuery = {
      ...query,
      $or: [
        { name: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { tags: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } },
        { subcategory: { $regex: search.trim(), $options: 'i' } }
      ]
    };
    
    // Use text search first, fallback to regex search
    query = textSearchQuery;
  }

  const skip = (page - 1) * limit;

  if (latitude && longitude) {
    // Location-based query
    products = await Product.findNearby(
      Number(longitude),
      Number(latitude),
      Number(radius),
      query
    )
    .skip(skip)
    .limit(Number(limit))
    .sort(sort);
  } else {
    // Regular query without location
    products = await Product.find(query)
      .populate('seller', 'name businessInfo.businessName avatar ratings')
      .skip(skip)
      .limit(Number(limit))
      .sort(sort);
      
    // If text search returned no results and we have a search term, try regex search
    if (products.length === 0 && search && search.trim() !== '') {
      const regexSearchQuery = {
        isActive: true,
        $or: [
          { name: { $regex: search.trim(), $options: 'i' } },
          { description: { $regex: search.trim(), $options: 'i' } },
          { tags: { $regex: search.trim(), $options: 'i' } },
          { category: { $regex: search.trim(), $options: 'i' } },
          { subcategory: { $regex: search.trim(), $options: 'i' } }
        ]
      };
      
      // Apply other filters to regex query
      if (category && category !== '') {
        regexSearchQuery.category = category;
      }
      if (subcategory && subcategory !== '') {
        regexSearchQuery.subcategory = new RegExp(subcategory, 'i');
      }
      if (minPrice || maxPrice) {
        regexSearchQuery.price = {};
        if (minPrice && minPrice !== '') regexSearchQuery.price.$gte = Number(minPrice);
        if (maxPrice && maxPrice !== '') regexSearchQuery.price.$lte = Number(maxPrice);
      }
      if (minRating && minRating !== '') {
        regexSearchQuery['ratings.average'] = { $gte: Number(minRating) };
      }
      if (freeDelivery === 'true' || freeDelivery === true) {
        regexSearchQuery['delivery.fee'] = { $lte: 0 };
      }
      if (inStockOnly === 'true' || inStockOnly === true) {
        regexSearchQuery['availability.inStock'] = true;
      }
      if (tags && tags !== '') {
        const tagArray = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
        regexSearchQuery.tags = { $in: tagArray };
      }
      
      products = await Product.find(regexSearchQuery)
        .populate('seller', 'name businessInfo.businessName avatar ratings')
        .skip(skip)
        .limit(Number(limit))
        .sort(sort);
        
      // Update query for count calculation
      query = regexSearchQuery;
    }
  }

  // Get total count for pagination (using same query but without skip/limit)
  const total = latitude && longitude ? 
    await Product.countDocuments({
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [Number(longitude), Number(latitude)]
          },
          $maxDistance: Number(radius)
        }
      },
      ...query
    }) :
    await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      limit: Number(limit),
      hasNextPage: Number(page) < Math.ceil(total / limit),
      hasPrevPage: Number(page) > 1
    },
    products
  });
});

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('seller', 'name businessInfo avatar ratings location')
    .populate('reviews.user', 'name avatar');

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  if (!product.isActive) {
    return res.status(404).json({
      success: false,
      message: 'Product is not available'
    });
  }

  // Increment views (async, don't wait)
  product.incrementViews();

  res.status(200).json({
    success: true,
    product
  });
});

// @desc    Create new product
// @route   POST /api/products
// @access  Private (Seller only)
const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    price,
    category,
    subcategory,
    images,
    location,
    availability,
    specifications,
    delivery,
    pickup,
    tags
  } = req.body;

  // Use seller's location if product location not provided
  let productLocation = location;
  if (!productLocation) {
    productLocation = req.user.location;
  }

  // Handle different coordinate formats
  let coordinates;
  if (productLocation.coordinates && Array.isArray(productLocation.coordinates)) {
    // Frontend sends coordinates as [longitude, latitude]
    coordinates = productLocation.coordinates;
  } else if (productLocation.longitude && productLocation.latitude) {
    // Legacy format with separate longitude/latitude fields
    coordinates = [productLocation.longitude, productLocation.latitude];
  } else if (req.user.location && req.user.location.coordinates) {
    // Fallback to user's location
    coordinates = req.user.location.coordinates;
  } else {
    // Default coordinates (San Francisco)
    coordinates = [-122.4194, 37.7749];
  }

  const product = await Product.create({
    name,
    description,
    price,
    category,
    subcategory,
    images,
    seller: req.user._id,
    location: {
      type: 'Point',
      coordinates: coordinates,
      address: productLocation.address || {}
    },
    availability,
    specifications,
    delivery,
    pickup,
    tags
  });

  await product.populate('seller', 'name businessInfo.businessName avatar ratings');

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    product
  });
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Owner only)
const updateProduct = asyncHandler(async (req, res) => {
  let product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Check ownership
  if (product.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this product'
    });
  }

  product = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  ).populate('seller', 'name businessInfo.businessName avatar ratings');

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    product
  });
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private (Owner only)
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Check ownership
  if (product.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this product'
    });
  }

  // Soft delete - just mark as inactive
  product.isActive = false;
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully'
  });
});

// @desc    Add product review
// @route   POST /api/products/:id/reviews
// @access  Private (Buyers who purchased the product)
const addReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Prevent sellers from reviewing products
  if (req.user.role === 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Sellers cannot review products. Only buyers who have purchased the product can leave reviews.'
    });
  }

  // Check if user already reviewed this product
  const existingReview = product.reviews.find(
    review => review.user.toString() === req.user._id.toString()
  );

  if (existingReview) {
    return res.status(400).json({
      success: false,
      message: 'You have already reviewed this product'
    });
  }

  // Check if user actually purchased this product (skip in development mode)
  const Order = require('../models/Order');
  const skipPurchaseCheck = process.env.NODE_ENV === 'development' && process.env.SKIP_REVIEW_VERIFICATION === 'true';
  
  if (!skipPurchaseCheck) {
    const userOrder = await Order.findOne({
      buyer: req.user._id,
      'items.product': req.params.id,
      status: 'delivered' // Only allow reviews for delivered orders
    });

    if (!userOrder) {
      return res.status(400).json({
        success: false,
        message: 'You can only review products you have purchased and received'
      });
    }
  }

  const review = {
    user: req.user._id,
    rating,
    comment
  };

  product.reviews.push(review);
  await product.save();

  await product.populate('reviews.user', 'name avatar');

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    reviews: product.reviews
  });
});

// @desc    Get seller's products
// @route   GET /api/products/seller/:sellerId
// @access  Public
const getSellerProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, sort = '-createdAt' } = req.query;
  const skip = (page - 1) * limit;

  const seller = await User.findById(req.params.sellerId);
  
  if (!seller || seller.role !== 'seller') {
    return res.status(404).json({
      success: false,
      message: 'Seller not found'
    });
  }

  const products = await Product.find({
    seller: req.params.sellerId,
    isActive: true
  })
  .populate('seller', 'name businessInfo.businessName avatar ratings')
  .skip(skip)
  .limit(Number(limit))
  .sort(sort);

  const total = await Product.countDocuments({
    seller: req.params.sellerId,
    isActive: true
  });

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit)
    },
    seller: {
      id: seller._id,
      name: seller.name,
      businessInfo: seller.businessInfo,
      avatar: seller.avatar,
      ratings: seller.ratings
    },
    products
  });
});

// @desc    Toggle product like
// @route   POST /api/products/:id/like
// @access  Private
const toggleLike = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Prevent sellers from liking products
  if (req.user.role === 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Sellers cannot like products. Only buyers can like products they are interested in purchasing.'
    });
  }

  const likeIndex = product.likes.indexOf(req.user._id);
  let message;

  if (likeIndex > -1) {
    // Unlike
    product.likes.splice(likeIndex, 1);
    message = 'Product unliked';
  } else {
    // Like
    product.likes.push(req.user._id);
    message = 'Product liked';
  }

  await product.save();

  res.status(200).json({
    success: true,
    message,
    likesCount: product.likes.length,
    isLiked: likeIndex === -1
  });
});

// @desc    Get product categories
// @route   GET /api/products/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  res.status(200).json({
    success: true,
    categories
  });
});

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
const getFeaturedProducts = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  // First try to get explicitly featured products
  let products = await Product.find({
    isActive: true,
    isFeatured: true,
    'availability.inStock': true
  })
  .populate('seller', 'name businessInfo.businessName avatar ratings')
  .limit(Number(limit))
  .sort('-createdAt');

  // If no featured products found, get the most popular/recent products
  if (products.length === 0) {
    products = await Product.find({
      isActive: true,
      'availability.inStock': true
    })
    .populate('seller', 'name businessInfo.businessName avatar ratings')
    .limit(Number(limit))
    .sort({ views: -1, 'ratings.average': -1, createdAt: -1 }); // Sort by views, then rating, then newest
  }

  res.status(200).json({
    success: true,
    count: products.length,
    products,
    isFallback: products.length > 0 && !products[0].isFeatured
  });
});

// @desc    Toggle product featured status
// @route   PUT /api/products/:id/featured
// @access  Private (Admin only)
const toggleFeatured = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Check if user is admin or product owner
  if (req.user.role !== 'admin' && product.seller.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to modify featured status'
    });
  }

  product.isFeatured = !product.isFeatured;
  await product.save();

  res.status(200).json({
    success: true,
    message: `Product ${product.isFeatured ? 'marked as featured' : 'removed from featured'}`,
    isFeatured: product.isFeatured
  });
});

// @desc    Check if user can review a product
// @route   GET /api/products/:id/can-review
// @access  Private
const canReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Prevent sellers from reviewing products
  if (req.user.role === 'seller') {
    return res.status(200).json({
      success: true,
      canReview: false,
      reason: 'seller_not_allowed',
      message: 'Sellers cannot review products. Only buyers who have purchased the product can leave reviews.'
    });
  }

  // Check if user already reviewed this product
  const existingReview = product.reviews.find(
    review => review.user.toString() === req.user._id.toString()
  );

  if (existingReview) {
    return res.status(200).json({
      success: true,
      canReview: false,
      reason: 'already_reviewed',
      message: 'You have already reviewed this product'
    });
  }

  // Check if user purchased this product (skip in development mode)
  const Order = require('../models/Order');
  const skipPurchaseCheck = process.env.NODE_ENV === 'development' && process.env.SKIP_REVIEW_VERIFICATION === 'true';
  
  if (!skipPurchaseCheck) {
    const userOrder = await Order.findOne({
      buyer: req.user._id,
      'items.product': req.params.id,
      status: 'delivered'
    });

    if (!userOrder) {
      return res.status(200).json({
        success: true,
        canReview: false,
        reason: 'not_purchased',
        message: 'You can only review products you have purchased and received'
      });
    }
  }

  res.status(200).json({
    success: true,
    canReview: true,
    message: 'You can review this product'
  });
});

// @desc    Update product review
// @route   PUT /api/products/:id/reviews/:reviewId
// @access  Private (Review author only)
const updateReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  const review = product.reviews.id(req.params.reviewId);

  if (!review) {
    return res.status(404).json({
      success: false,
      message: 'Review not found'
    });
  }

  // Check if user is the review author
  if (review.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this review'
    });
  }

  review.rating = rating;
  review.comment = comment;

  await product.save();
  await product.populate('reviews.user', 'name avatar');

  res.status(200).json({
    success: true,
    message: 'Review updated successfully',
    reviews: product.reviews
  });
});

// @desc    Delete product review
// @route   DELETE /api/products/:id/reviews/:reviewId
// @access  Private (Review author or admin)
const deleteReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  const review = product.reviews.id(req.params.reviewId);

  if (!review) {
    return res.status(404).json({
      success: false,
      message: 'Review not found'
    });
  }

  // Check if user is the review author or admin
  if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this review'
    });
  }

  product.reviews.pull(req.params.reviewId);
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Review deleted successfully',
    reviews: product.reviews
  });
});

module.exports = {
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
};
