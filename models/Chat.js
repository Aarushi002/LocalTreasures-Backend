const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  }],
  type: {
    type: String,
    enum: ['direct', 'order_related', 'support'],
    default: 'direct'
  },
  relatedOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  relatedProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'location', 'order_update'],
      default: 'text'
    },
    attachments: [{
      type: {
        type: String,
        enum: ['image', 'document', 'location']
      },
      url: String,
      filename: String,
      size: Number,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    }],
    readBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    editedAt: Date,
    deletedAt: Date,
    isDeleted: {
      type: Boolean,
      default: false
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    totalMessages: {
      type: Number,
      default: 0
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  // Sorted participant IDs for unique indexing (prevents duplicate chats)
  participantIds: {
    type: [String],
    index: true
  }
}, {
  timestamps: true
});

// Indexes
chatSchema.index({ 'participants.user': 1, updatedAt: -1 });
chatSchema.index({ type: 1, isActive: 1 });
chatSchema.index({ relatedOrder: 1 });
chatSchema.index({ 'lastMessage.timestamp': -1 });

// Create compound index for participants (for direct messages)
chatSchema.index({
  'participants.user': 1,
  type: 1
});

// Unique index to prevent duplicate direct chats between same users
// This will be created with a pre-save middleware to sort participants
chatSchema.index({ 
  participantIds: 1, 
  type: 1, 
  isActive: 1 
}, { 
  unique: true, 
  partialFilterExpression: { type: 'direct', isActive: true }
});

// Pre-save middleware to update last message, metadata, and participantIds
chatSchema.pre('save', function(next) {
  // Update participantIds for unique indexing
  if (this.isModified('participants') || this.isNew) {
    this.participantIds = this.participants
      .map(p => p.user.toString())
      .sort();
  }
  
  if (this.isModified('messages') && this.messages.length > 0) {
    const lastMsg = this.messages[this.messages.length - 1];
    this.lastMessage = {
      content: lastMsg.content,
      sender: lastMsg.sender,
      timestamp: lastMsg.createdAt || new Date()
    };
    
    this.metadata.totalMessages = this.messages.filter(msg => !msg.isDeleted).length;
    
    // Update unread count for each participant
    this.participants.forEach(participant => {
      if (!participant.user.equals(lastMsg.sender)) {
        // Extract ObjectId string safely whether user is populated or not
        const userId = participant.user._id ? participant.user._id.toString() : participant.user.toString();
        const currentCount = this.metadata.unreadCount.get(userId) || 0;
        this.metadata.unreadCount.set(userId, currentCount + 1);
      }
    });
  }
  next();
});

// Static method to find or create direct chat between two users
chatSchema.statics.findOrCreateDirectChat = async function(user1Id, user2Id) {
  // Sort user IDs to ensure consistent ordering and prevent duplicate chats
  const sortedParticipantIds = [user1Id.toString(), user2Id.toString()].sort();
  
  try {
    // First try to find existing chat
    let chat = await this.findOne({
      participantIds: sortedParticipantIds,
      type: 'direct',
      isActive: true
    }).populate('participants.user', 'name avatar businessInfo.businessName role');
    
    if (chat) {
      return chat;
    }
    
    // Create new chat if none exists
    chat = new this({
      type: 'direct',
      participants: [
        { user: sortedParticipantIds[0] },
        { user: sortedParticipantIds[1] }
      ]
    });
    
    await chat.save();
    await chat.populate('participants.user', 'name avatar businessInfo.businessName role');
    
    return chat;
  } catch (error) {
    console.error('Error in findOrCreateDirectChat:', error);
    
    // If duplicate key error (race condition), try to find the existing chat
    if (error.code === 11000) {
      const existingChat = await this.findOne({
        participantIds: sortedParticipantIds,
        type: 'direct',
        isActive: true
      }).populate('participants.user', 'name avatar businessInfo.businessName role');
      
      if (existingChat) {
        return existingChat;
      }
    }
    
    throw error;
  }
};

// Method to add message
chatSchema.methods.addMessage = function(senderId, content, messageType = 'text', attachments = []) {
  // Check for duplicate messages (same content from same user within last 5 seconds)
  const fiveSecondsAgo = new Date(Date.now() - 5000);
  const recentDuplicate = this.messages.find(msg => 
    msg.sender.toString() === senderId.toString() &&
    msg.content === content &&
    msg.createdAt > fiveSecondsAgo &&
    !msg.isDeleted
  );

  if (recentDuplicate) {
    // Don't add duplicate message, just return without saving
    return Promise.resolve(this);
  }

  const message = {
    sender: senderId,
    content: content,
    messageType: messageType,
    attachments: attachments,
    readBy: [{ user: senderId }],
    createdAt: new Date()
  };
  
  this.messages.push(message);
  return this.save();
};

// Method to mark messages as read
chatSchema.methods.markAsRead = function(userId) {
  // Find unread messages and mark them as read
  this.messages.forEach(message => {
    if (!message.sender.equals(userId) && 
        !message.readBy.some(read => read.user.equals(userId))) {
      message.readBy.push({ user: userId });
    }
  });
  
  // Reset unread count for this user
  this.metadata.unreadCount.set(userId.toString(), 0);
  
  // Update last seen
  const participant = this.participants.find(p => p.user.equals(userId));
  if (participant) {
    participant.lastSeenAt = new Date();
  }
  
  return this.save();
};

// Method to get unread count for a user
chatSchema.methods.getUnreadCount = function(userId) {
  // Ensure userId is converted to string properly
  const userIdString = userId._id ? userId._id.toString() : userId.toString();
  return this.metadata.unreadCount.get(userIdString) || 0;
};

// Method to block/unblock chat
chatSchema.methods.toggleBlock = function(userId) {
  if (this.isBlocked && this.blockedBy.equals(userId)) {
    // Unblock
    this.isBlocked = false;
    this.blockedBy = undefined;
  } else if (!this.isBlocked) {
    // Block
    this.isBlocked = true;
    this.blockedBy = userId;
  }
  
  return this.save();
};

// Static method to get user's chats
chatSchema.statics.getUserChats = function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({
    'participants.user': userId,
    isActive: true
  })
  .populate('participants.user', 'name avatar businessInfo.businessName role')
  .populate('relatedOrder', 'orderNumber status')
  .populate('relatedProduct', 'name images')
  .sort({ 'lastMessage.timestamp': -1 })
  .skip(skip)
  .limit(limit);
};

module.exports = mongoose.model('Chat', chatSchema);
