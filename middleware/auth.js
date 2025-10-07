const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - authenticate user
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found. Invalid token.'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account has been deactivated.'
        });
      }

      // Update last seen
      user.updateLastSeen();

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not authenticated.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Role '${req.user.role}' is not authorized to access this resource.`
      });
    }

    next();
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && user.isActive) {
          req.user = user;
          user.updateLastSeen();
        }
      } catch (error) {
        // Invalid token, but continue without authentication
        console.log('Optional auth: Invalid token, continuing without auth');
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};

// Check if user owns the resource
const checkOwnership = (resourceModel, resourceParam = 'id', ownerField = 'user') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }

      // Check if user owns the resource or is admin
      const ownerId = resource[ownerField];
      if (!req.user._id.equals(ownerId) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not own this resource.'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error checking resource ownership'
      });
    }
  };
};

// Check if user is seller
const requireSeller = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'seller' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Seller account required to access this resource'
    });
  }

  next();
};

// Check if user is verified seller
const requireVerifiedSeller = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'seller' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Seller account required'
    });
  }

  if (req.user.role === 'seller' && !req.user.businessInfo.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Verified seller account required to access this resource'
    });
  }

  next();
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
};

// Check if user is buyer (prevent sellers from buying)
const requireBuyer = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role === 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Sellers cannot purchase products. Please switch to a buyer account to make purchases.'
    });
  }

  if (req.user.role !== 'buyer' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Buyer account required to make purchases'
    });
  }

  next();
};

// Prevent buyers from selling (additional check for product operations)
const preventBuyerSelling = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role === 'buyer') {
    return res.status(403).json({
      success: false,
      message: 'Buyers cannot sell products. Please upgrade to a seller account to list products.'
    });
  }

  next();
};

module.exports = {
  protect,
  authorize,
  optionalAuth,
  checkOwnership,
  requireSeller,
  requireVerifiedSeller,
  requireAdmin,
  requireBuyer,
  preventBuyerSelling
};
