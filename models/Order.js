const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    customizations: {
      type: String,
      maxlength: [500, 'Customization details cannot exceed 500 characters']
    }
  }],
  totals: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0
    },
    tax: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  delivery: {
    method: {
      type: String,
      enum: ['pickup', 'delivery'],
      required: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: false // Make coordinates optional
      }
    },
    estimatedTime: {
      min: Number, // in hours
      max: Number  // in hours
    },
    actualDeliveryTime: Date,
    instructions: String
  },
  payment: {
    method: {
      type: String,
      enum: ['stripe', 'razorpay', 'cash_on_delivery'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: String,
    paymentIntentId: String,
    paidAt: Date,
    refundId: String,
    refundedAt: Date,
    refundReason: String
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  communication: {
    messages: [{
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      message: {
        type: String,
        required: true,
        maxlength: [1000, 'Message cannot exceed 1000 characters']
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      read: {
        type: Boolean,
        default: false
      }
    }],
    lastMessageAt: Date
  },
  rating: {
    buyerRating: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      review: String,
      createdAt: Date
    },
    sellerRating: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      review: String,
      createdAt: Date
    }
  },
  cancellation: {
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    cancelledAt: Date
  },
  scheduledFor: Date, // For pre-orders or scheduled deliveries
  notes: {
    buyerNotes: String,
    sellerNotes: String,
    adminNotes: String
  },
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile'],
      default: 'web'
    },
    ipAddress: String,
    userAgent: String
  }
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ seller: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1 });

// Pre-save middleware to generate order number
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Generate unique order number only if not already set
    if (!this.orderNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.orderNumber = `LT-${timestamp}-${random}`;
    }
    
    // Add initial status to history only if no history exists
    if (this.statusHistory.length === 0) {
      this.statusHistory.push({
        status: this.status,
        timestamp: new Date(),
        updatedBy: this.buyer
      });
    }
  }
  next();
});

// Method to update order status
orderSchema.methods.updateStatus = function(newStatus, updatedBy, note = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note: note,
    updatedBy: updatedBy
  });
  
  // Update payment status based on order status
  if (newStatus === 'delivered' && this.payment.status === 'processing') {
    this.payment.status = 'completed';
    this.payment.paidAt = new Date();
  } else if (newStatus === 'cancelled' && this.payment.status !== 'completed') {
    this.payment.status = 'failed';
  }
  
  return this.save();
};

// Method to add message
orderSchema.methods.addMessage = function(senderId, message) {
  this.communication.messages.push({
    sender: senderId,
    message: message,
    timestamp: new Date()
  });
  this.communication.lastMessageAt = new Date();
  return this.save();
};

// Method to calculate totals
orderSchema.methods.calculateTotals = function() {
  this.totals.subtotal = this.items.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);
  
  // Calculate tax (assuming 8% tax rate)
  this.totals.tax = this.totals.subtotal * 0.08;
  
  this.totals.total = this.totals.subtotal + this.totals.deliveryFee + this.totals.tax;
  
  return this.totals;
};

// Static method to get order statistics
orderSchema.statics.getOrderStats = function(sellerId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        seller: mongoose.Types.ObjectId(sellerId),
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totals.total' },
        averageOrderValue: { $avg: '$totals.total' },
        completedOrders: {
          $sum: {
            $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0]
          }
        },
        cancelledOrders: {
          $sum: {
            $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]
          }
        }
      }
    }
  ]);
};

module.exports = mongoose.model('Order', orderSchema);
