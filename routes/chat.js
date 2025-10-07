const express = require('express');
const { body } = require('express-validator');
const {
  getChats,
  getOrCreateDirectChat,
  getChat,
  sendMessage,
  markAsRead,
  toggleBlock,
  deleteMessage,
  searchChats
} = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

// Validation rules
const messageValidation = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message content must be between 1 and 1000 characters'),
  body('messageType')
    .optional()
    .isIn(['text', 'image', 'file', 'location'])
    .withMessage('Invalid message type')
];

const directChatValidation = [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required')
];

// All routes are protected
router.use(protect);

// Routes
router.get('/search', searchChats);
router.get('/', getChats);
router.post('/direct', directChatValidation, handleValidationErrors, getOrCreateDirectChat);
router.get('/:id', getChat);
router.post('/:id/messages', messageValidation, handleValidationErrors, sendMessage);
router.put('/:id/read', markAsRead);
router.put('/:id/block', toggleBlock);
router.delete('/:id/messages/:messageId', deleteMessage);

module.exports = router;
