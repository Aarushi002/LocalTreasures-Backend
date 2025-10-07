const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: ['handmade', 'food', 'art', 'clothing', 'jewelry', 'home_decor', 'other']
  },
  subcategory: {
    type: String,
    trim: true
  },
  images: [{
    public_id: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    }
  }],
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'Product location is required']
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  },
  availability: {
    inStock: {
      type: Boolean,
      default: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  ratings: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: [500, 'Review comment cannot exceed 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  specifications: {
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['cm', 'inch'],
        default: 'cm'
      }
    },
    weight: {
      value: Number,
      unit: {
        type: String,
        enum: ['g', 'kg', 'lb'],
        default: 'kg'
      }
    },
    material: String,
    color: String,
    customizable: {
      type: Boolean,
      default: false
    }
  },
  delivery: {
    available: {
      type: Boolean,
      default: true
    },
    radius: {
      type: Number,
      default: 10, // km
      min: 1,
      max: 50
    },
    fee: {
      type: Number,
      default: 0,
      min: 0
    },
    estimatedTime: {
      min: Number, // in hours
      max: Number  // in hours
    }
  },
  pickup: {
    available: {
      type: Boolean,
      default: true
    },
    location: {
      address: String,
      instructions: String
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Create geospatial index
productSchema.index({ "location.coordinates": "2dsphere" });

// Create text index for search
productSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  category: 'text',
  subcategory: 'text'
}, {
  weights: {
    name: 10,
    tags: 5,
    category: 3,
    subcategory: 3,
    description: 1
  }
});

// Create compound indexes for better query performance
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ seller: 1, isActive: 1 });
productSchema.index({ 'ratings.average': -1, isActive: 1 });
productSchema.index({ createdAt: -1, isActive: 1 });

// Static method to find products within radius
productSchema.statics.findNearby = function(longitude, latitude, maxDistance = 10000, filters = {}) {
  const query = {
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance // in meters
      }
    },
    isActive: true,
    "availability.inStock": true,
    ...filters
  };
  
  return this.find(query)
    .populate('seller', 'name businessInfo.businessName avatar ratings')
    .sort({ createdAt: -1 });
};

// Method to calculate average rating
productSchema.methods.calculateAverageRating = function() {
  if (this.reviews.length === 0) {
    this.ratings.average = 0;
    this.ratings.count = 0;
    return;
  }
  
  const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
  this.ratings.average = Number((totalRating / this.reviews.length).toFixed(1));
  this.ratings.count = this.reviews.length;
};

// Pre-save middleware to update ratings
productSchema.pre('save', function(next) {
  if (this.isModified('reviews')) {
    this.calculateAverageRating();
  }
  next();
});

// Method to increment views
productSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save({ validateBeforeSave: false });
};

module.exports = mongoose.model('Product', productSchema);
