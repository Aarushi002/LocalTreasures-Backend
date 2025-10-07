const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  role: {
    type: String,
    enum: ['buyer', 'seller', 'admin'],
    default: 'buyer'
  },
  avatar: {
    public_id: String,
    url: {
      type: String,
      default: 'https://ui-avatars.com/api/?name=User&background=4285f4&color=ffffff&size=150'
    }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'Location coordinates are required']
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  },
  businessInfo: {
    businessName: String,
    businessType: {
      type: String,
      enum: ['artisan', 'home_chef', 'small_business', 'other']
    },
    description: String,
    categories: [{
      type: String,
      enum: ['handmade', 'food', 'art', 'clothing', 'jewelry', 'home_decor', 'other']
    }],
    isVerified: {
      type: Boolean,
      default: false
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
  isActive: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }]
}, {
  timestamps: true
});

// Create geospatial index
userSchema.index({ "location.coordinates": "2dsphere" });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Track role changes and add validation
userSchema.pre('save', function(next) {
  // If role is being modified, log it for audit purposes
  if (this.isModified('role')) {
    console.log(`Role change detected for user ${this._id}: ${this.role} (Previous: ${this.get('role', null, { getters: false })})`);
    
    // Validate role value
    const validRoles = ['buyer', 'seller', 'admin'];
    if (!validRoles.includes(this.role)) {
      return next(new Error('Invalid role specified'));
    }
  }
  
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Update last seen
userSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date();
  return this.save({ validateBeforeSave: false });
};

// Static method to find users within radius
userSchema.statics.findNearby = function(longitude, latitude, maxDistance = 10000) {
  return this.find({
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance // in meters
      }
    },
    isActive: true
  });
};

module.exports = mongoose.model('User', userSchema);
