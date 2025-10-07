const express = require('express');
const { body } = require('express-validator');
const {
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
} = require('../controllers/userController');
const { protect, requireAdmin } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

// Validation rules
const avatarValidation = [
  body('avatar.url')
    .isURL()
    .withMessage('Valid avatar URL is required'),
  body('avatar.public_id')
    .optional()
    .isString()
    .withMessage('Avatar public ID must be a string')
];

const reportValidation = [
  body('reason')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Report reason must be between 5 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
];

// Public routes
router.get('/search', searchUsers);
router.get('/nearby', getNearbyUsers);
router.get('/:id', getUserProfile);

// Protected routes
router.get('/dashboard', protect, getDashboardStats);
router.get('/favorites', protect, getFavorites);
router.put('/avatar', protect, avatarValidation, handleValidationErrors, updateAvatar);
router.post('/:id/follow', protect, toggleFollow);
router.post('/:id/report', protect, reportValidation, handleValidationErrors, reportUser);

// Admin only routes
router.post('/verify-business', protect, requireAdmin, verifyBusiness);
router.put('/:id/role', protect, requireAdmin, [
  body('role')
    .isIn(['buyer', 'seller', 'admin'])
    .withMessage('Invalid role. Valid roles are: buyer, seller, admin')
], handleValidationErrors, changeUserRole);

module.exports = router;
