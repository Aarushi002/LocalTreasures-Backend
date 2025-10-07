const Chat = require('../models/Chat');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Get user's chats
// @route   GET /api/chat
// @access  Private
const getChats = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const chats = await Chat.getUserChats(req.user._id, page, limit);

  // Add unread count for each chat
  const chatsWithUnread = chats.map(chat => ({
    ...chat.toObject(),
    unreadCount: chat.getUnreadCount(req.user._id)
  }));

  res.status(200).json({
    success: true,
    count: chats.length,
    chats: chatsWithUnread
  });
});

// @desc    Get or create direct chat
// @route   POST /api/chat/direct
// @access  Private
const getOrCreateDirectChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  if (userId === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'Cannot create chat with yourself'
    });
  }

  // Check if the other user exists
  const otherUser = await User.findById(userId);
  if (!otherUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const chat = await Chat.findOrCreateDirectChat(req.user._id, userId);

  res.status(200).json({
    success: true,
    chat: {
      ...chat.toObject(),
      unreadCount: chat.getUnreadCount(req.user._id)
    }
  });
});

// @desc    Get single chat with messages
// @route   GET /api/chat/:id
// @access  Private
const getChat = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  const chat = await Chat.findById(req.params.id)
    .populate('participants.user', 'name avatar businessInfo.businessName')
    .populate('relatedOrder', 'orderNumber status')
    .populate('relatedProduct', 'name images')
    .populate({
      path: 'messages.sender',
      select: 'name avatar'
    });

  if (!chat) {
    return res.status(404).json({
      success: false,
      message: 'Chat not found'
    });
  }

  // Check if user is participant
  const isParticipant = chat.participants.some(
    p => p.user._id.toString() === req.user._id.toString()
  );

  if (!isParticipant) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this chat'
    });
  }

  // Get paginated messages
  const totalMessages = chat.messages.filter(msg => !msg.isDeleted).length;
  const messages = chat.messages
    .filter(msg => !msg.isDeleted)
    .slice(-limit - skip, -skip || undefined);

  // Mark messages as read
  await chat.markAsRead(req.user._id);

  res.status(200).json({
    success: true,
    chat: {
      _id: chat._id,
      participants: chat.participants,
      type: chat.type,
      relatedOrder: chat.relatedOrder,
      relatedProduct: chat.relatedProduct,
      lastMessage: chat.lastMessage,
      isActive: chat.isActive,
      isBlocked: chat.isBlocked,
      blockedBy: chat.blockedBy,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    },
    messages,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: totalMessages,
      pages: Math.ceil(totalMessages / limit)
    }
  });
});

// @desc    Send message
// @route   POST /api/chat/:id/messages
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  const { content, messageType = 'text', attachments = [] } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Message content is required'
    });
  }

  const chat = await Chat.findById(req.params.id);

  if (!chat) {
    return res.status(404).json({
      success: false,
      message: 'Chat not found'
    });
  }

  // Check if user is participant
  const isParticipant = chat.participants.some(
    p => p.user.toString() === req.user._id.toString()
  );

  if (!isParticipant) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to send messages in this chat'
    });
  }

  // Check if chat is blocked
  if (chat.isBlocked && !chat.blockedBy.equals(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'This chat has been blocked'
    });
  }

  // Check for duplicate messages (same content from same user within last 5 seconds)
  const fiveSecondsAgo = new Date(Date.now() - 5000);
  const recentDuplicate = chat.messages.find(msg => 
    msg.sender.toString() === req.user._id.toString() &&
    msg.content === content.trim() &&
    msg.createdAt > fiveSecondsAgo &&
    !msg.isDeleted
  );

  if (recentDuplicate) {
    // Return the existing message instead of creating a duplicate
    return res.status(200).json({
      success: true,
      message: recentDuplicate,
      isDuplicate: true
    });
  }

  await chat.addMessage(req.user._id, content.trim(), messageType, attachments);
  await chat.populate('messages.sender', 'name avatar');

  const newMessage = chat.messages[chat.messages.length - 1];

  res.status(201).json({
    success: true,
    message: 'Message sent successfully',
    messageData: newMessage
  });
});

// @desc    Mark messages as read
// @route   PUT /api/chat/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);

  if (!chat) {
    return res.status(404).json({
      success: false,
      message: 'Chat not found'
    });
  }

  // Check if user is participant
  const isParticipant = chat.participants.some(
    p => p.user.toString() === req.user._id.toString()
  );

  if (!isParticipant) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this chat'
    });
  }

  await chat.markAsRead(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Messages marked as read'
  });
});

// @desc    Block/unblock chat
// @route   PUT /api/chat/:id/block
// @access  Private
const toggleBlock = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);

  if (!chat) {
    return res.status(404).json({
      success: false,
      message: 'Chat not found'
    });
  }

  // Check if user is participant
  const isParticipant = chat.participants.some(
    p => p.user.toString() === req.user._id.toString()
  );

  if (!isParticipant) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to block this chat'
    });
  }

  await chat.toggleBlock(req.user._id);

  const action = chat.isBlocked ? 'blocked' : 'unblocked';

  res.status(200).json({
    success: true,
    message: `Chat ${action} successfully`,
    isBlocked: chat.isBlocked
  });
});

// @desc    Delete message
// @route   DELETE /api/chat/:id/messages/:messageId
// @access  Private
const deleteMessage = asyncHandler(async (req, res) => {
  const { id: chatId, messageId } = req.params;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    return res.status(404).json({
      success: false,
      message: 'Chat not found'
    });
  }

  const message = chat.messages.id(messageId);

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found'
    });
  }

  // Check if user owns the message
  if (message.sender.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this message'
    });
  }

  // Soft delete - mark as deleted
  message.isDeleted = true;
  message.deletedAt = new Date();

  await chat.save();

  res.status(200).json({
    success: true,
    message: 'Message deleted successfully'
  });
});

// @desc    Search chats
// @route   GET /api/chat/search
// @access  Private
const searchChats = asyncHandler(async (req, res) => {
  const { query, page = 1, limit = 20 } = req.query;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  const skip = (page - 1) * limit;

  // Search for users to start new chats
  const users = await User.find({
    _id: { $ne: req.user._id },
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
      { 'businessInfo.businessName': { $regex: query, $options: 'i' } }
    ],
    isActive: true
  })
  .select('name avatar businessInfo.businessName role')
  .limit(Number(limit))
  .skip(skip);

  // Search existing chats
  const chats = await Chat.find({
    'participants.user': req.user._id,
    isActive: true,
    $or: [
      { 'messages.content': { $regex: query, $options: 'i' } }
    ]
  })
  .populate('participants.user', 'name avatar businessInfo.businessName')
  .limit(Number(limit))
  .skip(skip);

  res.status(200).json({
    success: true,
    users,
    chats
  });
});

module.exports = {
  getChats,
  getOrCreateDirectChat,
  getChat,
  sendMessage,
  markAsRead,
  toggleBlock,
  deleteMessage,
  searchChats
};
