const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const { asyncHandler } = require('../middleware/errorHandler');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc    Create Stripe payment intent
// @route   POST /api/payments/stripe/intent
// @access  Private
const createStripePaymentIntent = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if user owns this order
  if (order.buyer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized for this order'
    });
  }

  if (order.payment.status === 'completed') {
    return res.status(400).json({
      success: false,
      message: 'Order is already paid'
    });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.totals.total * 100), // Amount in cents
      currency: 'usd',
      metadata: {
        orderId: order._id.toString(),
        buyerId: order.buyer.toString(),
        sellerId: order.seller.toString()
      }
    });

    // Update order with payment intent ID
    order.payment.paymentIntentId = paymentIntent.id;
    order.payment.status = 'processing';
    await order.save();

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error('Stripe payment intent creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment intent'
    });
  }
});

// @desc    Confirm Stripe payment
// @route   POST /api/payments/stripe/confirm
// @access  Private
const confirmStripePayment = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const orderId = paymentIntent.metadata.orderId;
      const order = await Order.findById(orderId);

      if (order) {
        order.payment.status = 'completed';
        order.payment.transactionId = paymentIntent.id;
        order.payment.paidAt = new Date();
        
        // Update order status to confirmed
        if (order.status === 'pending') {
          order.status = 'confirmed';
          order.statusHistory.push({
            status: 'confirmed',
            timestamp: new Date(),
            note: 'Payment confirmed',
            updatedBy: order.buyer
          });
        }

        await order.save();
      }

      res.status(200).json({
        success: true,
        message: 'Payment confirmed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not successful'
      });
    }
  } catch (error) {
    console.error('Stripe payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming payment'
    });
  }
});

// @desc    Create Razorpay order
// @route   POST /api/payments/razorpay/order
// @access  Private
const createRazorpayOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if user owns this order
  if (order.buyer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized for this order'
    });
  }

  if (order.payment.status === 'completed') {
    return res.status(400).json({
      success: false,
      message: 'Order is already paid'
    });
  }

  try {
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.totals.total * 100), // Amount in paise
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        orderId: order._id.toString(),
        buyerId: order.buyer.toString(),
        sellerId: order.seller.toString()
      }
    });

    // Update order with Razorpay order ID
    order.payment.transactionId = razorpayOrder.id;
    order.payment.status = 'processing';
    await order.save();

    res.status(200).json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating Razorpay order'
    });
  }
});

// @desc    Verify Razorpay payment
// @route   POST /api/payments/razorpay/verify
// @access  Private
const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  try {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature === razorpay_signature) {
      // Payment is verified
      const order = await Order.findOne({ 'payment.transactionId': razorpay_order_id });

      if (order) {
        order.payment.status = 'completed';
        order.payment.paymentIntentId = razorpay_payment_id;
        order.payment.paidAt = new Date();
        
        // Update order status to confirmed
        if (order.status === 'pending') {
          order.status = 'confirmed';
          order.statusHistory.push({
            status: 'confirmed',
            timestamp: new Date(),
            note: 'Payment verified',
            updatedBy: order.buyer
          });
        }

        await order.save();
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }
  } catch (error) {
    console.error('Razorpay payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment'
    });
  }
});

// @desc    Process refund
// @route   POST /api/payments/refund
// @access  Private
const processRefund = asyncHandler(async (req, res) => {
  const { orderId, reason } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check authorization (seller or admin can process refunds)
  if (order.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to process refunds for this order'
    });
  }

  if (order.payment.status !== 'completed') {
    return res.status(400).json({
      success: false,
      message: 'Order payment is not completed'
    });
  }

  if (order.payment.status === 'refunded') {
    return res.status(400).json({
      success: false,
      message: 'Order is already refunded'
    });
  }

  try {
    let refund;

    if (order.payment.method === 'stripe') {
      // Process Stripe refund
      refund = await stripe.refunds.create({
        payment_intent: order.payment.paymentIntentId,
        reason: 'requested_by_customer'
      });

      order.payment.refundId = refund.id;
    } else if (order.payment.method === 'razorpay') {
      // Process Razorpay refund
      refund = await razorpay.payments.refund(order.payment.paymentIntentId, {
        amount: Math.round(order.totals.total * 100),
        notes: {
          reason: reason,
          orderId: order._id.toString()
        }
      });

      order.payment.refundId = refund.id;
    }

    // Update order
    order.payment.status = 'refunded';
    order.payment.refundedAt = new Date();
    order.payment.refundReason = reason;
    order.status = 'refunded';

    order.statusHistory.push({
      status: 'refunded',
      timestamp: new Date(),
      note: `Refunded: ${reason}`,
      updatedBy: req.user._id
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      refundId: refund.id
    });
  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing refund'
    });
  }
});

// @desc    Get payment methods
// @route   GET /api/payments/methods
// @access  Public
const getPaymentMethods = asyncHandler(async (req, res) => {
  const methods = [
    {
      id: 'stripe',
      name: 'Credit/Debit Card',
      description: 'Pay securely with your credit or debit card',
      enabled: !!process.env.STRIPE_SECRET_KEY
    },
    {
      id: 'razorpay',
      name: 'Razorpay',
      description: 'Pay with UPI, Net Banking, or Cards',
      enabled: !!process.env.RAZORPAY_KEY_ID
    },
    {
      id: 'cash_on_delivery',
      name: 'Cash on Delivery',
      description: 'Pay when you receive your order',
      enabled: true
    }
  ];

  res.status(200).json({
    success: true,
    methods: methods.filter(method => method.enabled)
  });
});

// @desc    Stripe webhook handler
// @route   POST /api/payments/stripe/webhook
// @access  Public
const stripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      // Handle successful payment
      console.log('Payment succeeded:', paymentIntent.id);
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      // Handle failed payment
      console.log('Payment failed:', failedPayment.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = {
  createStripePaymentIntent,
  confirmStripePayment,
  createRazorpayOrder,
  verifyRazorpayPayment,
  processRefund,
  getPaymentMethods,
  stripeWebhook
};
