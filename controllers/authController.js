const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { 
    name, 
    email, 
    password, 
    phone, 
    role, 
    location, 
    businessInfo 
  } = req.body;

  // Check if user already exists
  const userExists = await User.findOne({ 
    $or: [{ email }, { phone }] 
  });

  if (userExists) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email or phone number'
    });
  }

  // Create user
  const userData = {
    name,
    email,
    password,
    phone,
    role: role || 'buyer',
    location: {
      coordinates: [location.longitude, location.latitude],
      address: location.address
    }
  };

  // Add business info for sellers
  if (role === 'seller' && businessInfo) {
    userData.businessInfo = businessInfo;
  }

  const user = await User.create(userData);

  // Generate token
  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      location: user.location,
      businessInfo: user.businessInfo,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }

  // Find user and include password field
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Check if account is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account has been deactivated. Please contact support.'
    });
  }

  // Check password
  const isPasswordMatch = await user.comparePassword(password);

  if (!isPasswordMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Update last seen
  user.updateLastSeen();

  // Generate token
  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      location: user.location,
      businessInfo: user.businessInfo,
      ratings: user.ratings,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      lastSeen: user.lastSeen
    }
  });
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  res.status(200).json({
    success: true,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      location: user.location,
      businessInfo: user.businessInfo,
      ratings: user.ratings,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt
    }
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    location,
    businessInfo,
    role, // Extract role to prevent it from being updated
    ...otherFields // Capture any other fields
  } = req.body;

  // Prevent role changes - users cannot change their own role
  if (role !== undefined) {
    return res.status(403).json({
      success: false,
      message: 'Role cannot be changed. Contact support if you need to upgrade your account.'
    });
  }

  // Log warning if someone tries to send restricted fields
  const restrictedFields = ['email', '_id', 'password', 'resetPasswordToken', 'resetPasswordExpire'];
  const attemptedRestrictedFields = Object.keys(otherFields).filter(field => 
    restrictedFields.includes(field)
  );
  
  if (attemptedRestrictedFields.length > 0) {
    console.warn(`User ${req.user._id} attempted to update restricted fields: ${attemptedRestrictedFields.join(', ')}`);
    return res.status(403).json({
      success: false,
      message: 'Cannot update restricted fields. Some fields can only be changed through specific endpoints.'
    });
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Update fields
  if (name) user.name = name;
  if (phone) user.phone = phone;
  
  if (location) {
    user.location = {
      coordinates: [location.longitude, location.latitude],
      address: location.address
    };
  }

  // Update business info for sellers
  if (user.role === 'seller' && businessInfo) {
    user.businessInfo = { ...user.businessInfo.toObject(), ...businessInfo };
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      location: user.location,
      businessInfo: user.businessInfo,
      ratings: user.ratings
    }
  });
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Please provide current password and new password'
    });
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  const isCurrentPasswordMatch = await user.comparePassword(currentPassword);

  if (!isCurrentPasswordMatch) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  // Validate new password
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters long'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found with this email'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire (10 minutes)
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await user.save({ validateBeforeSave: false });

  // In production, send email with reset link
  // For now, return the token (remove this in production)
  res.status(200).json({
    success: true,
    message: 'Password reset token sent',
    resetToken: resetToken // Remove this in production
  });
});

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resettoken
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;

  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }

  // Set new password
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  // Generate new token
  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    message: 'Password reset successful',
    token
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  // In a real-world scenario, you might want to blacklist the token
  // For now, we'll just send a success response
  
  res.status(200).json({
    success: true,
    message: 'Logout successful'
  });
});

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  logout
};
