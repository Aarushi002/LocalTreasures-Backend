const Order = require('../models/Order');
const Product = require('../models/Product');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const {
    seller,
    items,
    totals,
    delivery,
    payment,
    notes,
    metadata
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Order items are required'
    });
  }

  if (!seller) {
    return res.status(400).json({
      success: false,
      message: 'Seller is required'
    });
  }

  // Additional check: Prevent sellers from buying their own products
  if (req.user.role === 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Sellers cannot purchase products. Please use a buyer account for purchases.'
    });
  }

  // Validate items and check stock
  const orderItems = [];

  for (const item of items) {
    const product = await Product.findById(item.product);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product not found: ${item.product}`
      });
    }

    if (!product.isActive || !product.availability.inStock) {
      return res.status(400).json({
        success: false,
        message: `Product is not available: ${product.name}`
      });
    }

    if (product.availability.quantity < item.quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for: ${product.name}. Available: ${product.availability.quantity}, Requested: ${item.quantity}`
      });
    }

    orderItems.push({
      product: product._id,
      quantity: item.quantity,
      price: item.price,
      customizations: item.customizations
    });

    // Reserve product quantity
    product.availability.reservedQuantity += item.quantity;
    await product.save();
  }

  // Generate unique order number
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const orderNumber = `LT-${timestamp}-${random}`;

  try {
    const order = await Order.create({
      orderNumber,
      buyer: req.user._id,
      seller: seller,
      items: orderItems,
      totals: totals || {
        subtotal: 0,
        deliveryFee: 0,
        tax: 0,
        total: 0
      },
      delivery,
      payment: {
        method: payment.method,
        status: payment.method === 'cash_on_delivery' ? 'pending' : 'processing'
      },
      notes: {
        buyerNotes: notes?.buyerNotes
      },
      metadata: metadata || {
        source: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'web',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });

    await order.populate([
      { path: 'buyer', select: 'name email phone avatar' },
      { path: 'seller', select: 'name email phone avatar businessInfo' },
      { path: 'items.product', select: 'name images price' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    // Rollback reserved quantities if order creation fails
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      if (product) {
        product.availability.reservedQuantity -= item.quantity;
        await product.save();
      }
    }
    
    console.error('Order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// @desc    Get user orders
// @route   GET /api/orders
// @access  Private
const getOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  let query = {};

  // Filter by user role
  if (req.user.role === 'seller') {
    query.seller = req.user._id;
  } else {
    query.buyer = req.user._id;
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  const orders = await Order.find(query)
    .populate([
      { path: 'buyer', select: 'name email phone avatar' },
      { path: 'seller', select: 'name email phone avatar businessInfo' },
      { path: 'items.product', select: 'name images price' }
    ])
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const total = await Order.countDocuments(query);

  res.status(200).json({
    success: true,
    count: orders.length,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit)
    },
    orders
  });
});

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate([
      { path: 'buyer', select: 'name email phone avatar location' },
      { path: 'seller', select: 'name email phone avatar businessInfo location' },
      { path: 'items.product', select: 'name images price description' },
      { path: 'statusHistory.updatedBy', select: 'name' }
    ]);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if user has access to this order
  if (order.buyer._id.toString() !== req.user._id.toString() && 
      order.seller._id.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this order'
    });
  }

  res.status(200).json({
    success: true,
    order
  });
});

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check authorization
  if (order.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this order'
    });
  }

  // Validate status transition
  const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready': ['out_for_delivery', 'delivered'],
    'out_for_delivery': ['delivered'],
    'delivered': [],
    'cancelled': [],
    'refunded': []
  };

  if (!validTransitions[order.status].includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot change status from ${order.status} to ${status}`
    });
  }

  await order.updateStatus(status, req.user._id, note);

  await order.populate([
    { path: 'buyer', select: 'name email phone avatar' },
    { path: 'seller', select: 'name email phone avatar businessInfo' },
    { path: 'items.product', select: 'name images price' }
  ]);

  res.status(200).json({
    success: true,
    message: 'Order status updated successfully',
    order
  });
});

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check authorization (buyer can cancel pending orders, seller can cancel confirmed orders)
  const canCancel = (
    (order.buyer.toString() === req.user._id.toString() && order.status === 'pending') ||
    (order.seller.toString() === req.user._id.toString() && ['pending', 'confirmed'].includes(order.status)) ||
    req.user.role === 'admin'
  );

  if (!canCancel) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to cancel this order'
    });
  }

  // Update order
  order.status = 'cancelled';
  order.cancellation = {
    cancelledBy: req.user._id,
    reason: reason,
    cancelledAt: new Date()
  };

  order.statusHistory.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: `Cancelled: ${reason}`,
    updatedBy: req.user._id
  });

  await order.save();

  // Release reserved product quantities
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product) {
      product.availability.reservedQuantity -= item.quantity;
      await product.save();
    }
  }

  res.status(200).json({
    success: true,
    message: 'Order cancelled successfully',
    order
  });
});

// @desc    Add message to order
// @route   POST /api/orders/:id/messages
// @access  Private
const addOrderMessage = asyncHandler(async (req, res) => {
  const { message } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check authorization
  if (order.buyer.toString() !== req.user._id.toString() && 
      order.seller.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to message this order'
    });
  }

  await order.addMessage(req.user._id, message);

  res.status(201).json({
    success: true,
    message: 'Message added successfully'
  });
});

// @desc    Add rating to order
// @route   POST /api/orders/:id/rating
// @access  Private
const addOrderRating = asyncHandler(async (req, res) => {
  const { rating, review } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  if (order.status !== 'delivered') {
    return res.status(400).json({
      success: false,
      message: 'Can only rate delivered orders'
    });
  }

  // Check authorization and determine rating type
  let ratingField;
  if (order.buyer.toString() === req.user._id.toString()) {
    ratingField = 'buyerRating';
  } else if (order.seller.toString() === req.user._id.toString()) {
    ratingField = 'sellerRating';
  } else {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to rate this order'
    });
  }

  // Check if already rated
  if (order.rating[ratingField].rating) {
    return res.status(400).json({
      success: false,
      message: 'You have already rated this order'
    });
  }

  order.rating[ratingField] = {
    rating,
    review,
    createdAt: new Date()
  };

  await order.save();

  res.status(200).json({
    success: true,
    message: 'Rating added successfully'
  });
});

// @desc    Get order statistics (for sellers)
// @route   GET /api/orders/stats
// @access  Private (Seller only)
const getOrderStats = asyncHandler(async (req, res) => {
  if (req.user.role !== 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Sellers only.'
    });
  }

  const { startDate, endDate } = req.query;
  
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const end = endDate ? new Date(endDate) : new Date();

  const stats = await Order.getOrderStats(req.user._id, start, end);

  res.status(200).json({
    success: true,
    stats: stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      completedOrders: 0,
      cancelledOrders: 0
    }
  });
});

module.exports = {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  addOrderMessage,
  addOrderRating,
  getOrderStats
};
