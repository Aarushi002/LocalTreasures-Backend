const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Get user profile
// @route   GET /api/users/:id
// @access  Public
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (!user.isActive) {
    return res.status(404).json({
      success: false,
      message: 'User profile is not available'
    });
  }

  // Get user's products if seller
  let products = [];
  if (user.role === 'seller') {
    products = await Product.find({
      seller: user._id,
      isActive: true
    })
    .select('name images price category ratings')
    .limit(6)
    .sort('-createdAt');
  }

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      businessInfo: user.businessInfo,
      ratings: user.ratings,
      location: {
        address: user.location.address
      },
      createdAt: user.createdAt
    },
    products
  });
});

// @desc    Get nearby users/sellers
// @route   GET /api/users/nearby
// @access  Public
const getNearbyUsers = asyncHandler(async (req, res) => {
  const {
    latitude,
    longitude,
    radius = 10000, // 10km default
    role = 'seller',
    page = 1,
    limit = 20
  } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({
      success: false,
      message: 'Latitude and longitude are required'
    });
  }

  const skip = (page - 1) * limit;

  const users = await User.findNearby(
    Number(longitude),
    Number(latitude),
    Number(radius)
  )
  .find({ role: role })
  .select('name avatar businessInfo ratings location.address')
  .skip(skip)
  .limit(Number(limit));

  const total = await User.countDocuments({
    role: role,
    isActive: true,
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [Number(longitude), Number(latitude)]
        },
        $maxDistance: Number(radius)
      }
    }
  });

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit)
    },
    users
  });
});

// @desc    Update user avatar
// @route   PUT /api/users/avatar
// @access  Private
const updateAvatar = asyncHandler(async (req, res) => {
  const { avatar } = req.body;

  if (!avatar || !avatar.url) {
    return res.status(400).json({
      success: false,
      message: 'Avatar URL is required'
    });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { avatar },
    { new: true, runValidators: true }
  ).select('-password');

  res.status(200).json({
    success: true,
    message: 'Avatar updated successfully',
    user
  });
});

// @desc    Get user dashboard stats
// @route   GET /api/users/dashboard
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;

  let stats = {};

  if (userRole === 'seller') {
    // Seller dashboard stats
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      revenue
    ] = await Promise.all([
      Product.countDocuments({ seller: userId }),
      Product.countDocuments({ seller: userId, isActive: true }),
      Order.countDocuments({ seller: userId }),
      Order.countDocuments({ seller: userId, status: { $in: ['pending', 'confirmed'] } }),
      Order.aggregate([
        { $match: { seller: userId, 'payment.status': 'completed' } },
        { $group: { _id: null, total: { $sum: '$totals.total' } } }
      ])
    ]);

    stats = {
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      totalRevenue: revenue[0]?.total || 0
    };

  } else if (userRole === 'buyer') {
    // Buyer dashboard stats
    const [
      totalOrders,
      activeOrders,
      completedOrders,
      totalSpent
    ] = await Promise.all([
      Order.countDocuments({ buyer: userId }),
      Order.countDocuments({ buyer: userId, status: { $nin: ['delivered', 'cancelled', 'refunded'] } }),
      Order.countDocuments({ buyer: userId, status: 'delivered' }),
      Order.aggregate([
        { $match: { buyer: userId, 'payment.status': 'completed' } },
        { $group: { _id: null, total: { $sum: '$totals.total' } } }
      ])
    ]);

    stats = {
      totalOrders,
      activeOrders,
      completedOrders,
      totalSpent: totalSpent[0]?.total || 0
    };
  }

  // Recent activity for both roles
  const recentOrders = await Order.find({
    $or: [{ buyer: userId }, { seller: userId }]
  })
  .populate('buyer', 'name avatar')
  .populate('seller', 'name avatar businessInfo.businessName')
  .populate('items.product', 'name images')
  .sort('-createdAt')
  .limit(5);

  res.status(200).json({
    success: true,
    stats,
    recentOrders
  });
});

// @desc    Search users
// @route   GET /api/users/search
// @access  Public
const searchUsers = asyncHandler(async (req, res) => {
  const { query, role, page = 1, limit = 20 } = req.query;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  const skip = (page - 1) * limit;
  let searchQuery = {
    isActive: true,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { 'businessInfo.businessName': { $regex: query, $options: 'i' } },
      { 'businessInfo.description': { $regex: query, $options: 'i' } }
    ]
  };

  if (role) {
    searchQuery.role = role;
  }

  const users = await User.find(searchQuery)
    .select('name avatar businessInfo ratings role location.address')
    .skip(skip)
    .limit(Number(limit))
    .sort('name');

  const total = await User.countDocuments(searchQuery);

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit)
    },
    users
  });
});

// @desc    Follow/unfollow user
// @route   POST /api/users/:id/follow
// @access  Private
const toggleFollow = asyncHandler(async (req, res) => {
  const targetUserId = req.params.id;
  const currentUserId = req.user._id;

  if (targetUserId === currentUserId.toString()) {
    return res.status(400).json({
      success: false,
      message: 'Cannot follow yourself'
    });
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const currentUser = await User.findById(currentUserId);

  // For simplicity, we'll just return success
  // In a full implementation, you'd add followers/following arrays to the User model
  
  res.status(200).json({
    success: true,
    message: 'Follow status updated'
  });
});

// @desc    Report user
// @route   POST /api/users/:id/report
// @access  Private
const reportUser = asyncHandler(async (req, res) => {
  const { reason, description } = req.body;
  const reportedUserId = req.params.id;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Report reason is required'
    });
  }

  const reportedUser = await User.findById(reportedUserId);
  if (!reportedUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // In a full implementation, you'd save the report to a Reports collection
  // For now, we'll just log it
  console.log(`User ${req.user._id} reported user ${reportedUserId} for: ${reason}`);

  res.status(200).json({
    success: true,
    message: 'User reported successfully'
  });
});

// @desc    Get user's favorite products
// @route   GET /api/users/favorites
// @access  Private
const getFavorites = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  // Find products that the user has liked
  const products = await Product.find({
    likes: req.user._id,
    isActive: true
  })
  .populate('seller', 'name businessInfo.businessName avatar ratings')
  .skip(skip)
  .limit(Number(limit))
  .sort('-createdAt');

  const total = await Product.countDocuments({
    likes: req.user._id,
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
    products
  });
});

// @desc    Verify seller business
// @route   POST /api/users/verify-business
// @access  Private (Admin only)
const verifyBusiness = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (user.role !== 'seller') {
    return res.status(400).json({
      success: false,
      message: 'User is not a seller'
    });
  }

  user.businessInfo.isVerified = true;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Business verified successfully'
  });
});

// @desc    Change user role (Admin only)
// @route   PUT /api/users/:id/role
// @access  Private (Admin only)
const changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const userId = req.params.id;

  // Only admins can change user roles
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only administrators can change user roles.'
    });
  }

  // Validate role
  const validRoles = ['buyer', 'seller', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role. Valid roles are: buyer, seller, admin'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Prevent admins from changing their own role (safety measure)
  if (user._id.toString() === req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Administrators cannot change their own role for security reasons.'
    });
  }

  const oldRole = user.role;
  user.role = role;

  // If changing to seller, initialize business info
  if (role === 'seller' && !user.businessInfo.businessName) {
    user.businessInfo = {
      businessName: user.name + "'s Business",
      businessType: 'other',
      description: '',
      categories: [],
      isVerified: false
    };
  }

  await user.save();

  // Log the role change for audit purposes
  console.log(`Admin ${req.user._id} changed user ${userId} role from ${oldRole} to ${role}`);

  res.status(200).json({
    success: true,
    message: `User role changed from ${oldRole} to ${role} successfully`,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessInfo: user.businessInfo
    }
  });
});

module.exports = {
  getUserProfile,
  getNearbyUsers,
  updateAvatar,
  getDashboardStats,
  searchUsers,
  toggleFollow,
  reportUser,
  getFavorites,
  verifyBusiness,
  changeUserRole
};
