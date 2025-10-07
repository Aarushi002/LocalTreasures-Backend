const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');

// Store active users
const activeUsers = new Map();

const socketHandlers = (io) => {
  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    // Add user to active users
    activeUsers.set(socket.userId, {
      socketId: socket.id,
      user: socket.user,
      lastSeen: new Date()
    });

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Emit user online status
    socket.broadcast.emit('user_online', {
      userId: socket.userId,
      name: socket.user.name
    });

    // Handle joining chat rooms
    socket.on('join_chat', async (chatId) => {
      try {
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        // Check if user is participant
        const isParticipant = chat.participants.some(
          p => p.user.toString() === socket.userId
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Not authorized to join this chat' });
          return;
        }

        socket.join(`chat_${chatId}`);
        socket.emit('joined_chat', { chatId });
      } catch (error) {
        socket.emit('error', { message: 'Error joining chat' });
      }
    });

    // Handle leaving chat rooms
    socket.on('leave_chat', (chatId) => {
      socket.leave(`chat_${chatId}`);
      socket.emit('left_chat', { chatId });
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
      try {
        const { chatId, content, messageType = 'text', attachments = [] } = data;

        const chat = await Chat.findById(chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        // Check if user is participant
        const isParticipant = chat.participants.some(
          p => p.user.toString() === socket.userId
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Not authorized to send messages in this chat' });
          return;
        }

        // Check if chat is blocked
        if (chat.isBlocked && !chat.blockedBy.equals(socket.userId)) {
          socket.emit('error', { message: 'This chat has been blocked' });
          return;
        }

        // Add message to chat
        await chat.addMessage(socket.userId, content, messageType, attachments);
        await chat.populate('messages.sender', 'name avatar');

        const newMessage = chat.messages[chat.messages.length - 1];

        // Emit message to all participants in the chat
        io.to(`chat_${chatId}`).emit('new_message', {
          chatId,
          message: newMessage
        });

        // Send push notification to offline users (implement later)
        const offlineParticipants = chat.participants.filter(
          p => p.user.toString() !== socket.userId && 
               !activeUsers.has(p.user.toString())
        );

        // TODO: Implement push notifications for offline users

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Error sending message' });
      }
    });

    // Handle marking messages as read
    socket.on('mark_read', async (data) => {
      try {
        const { chatId } = data;

        const chat = await Chat.findById(chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        await chat.markAsRead(socket.userId);

        // Notify other participants
        socket.to(`chat_${chatId}`).emit('messages_read', {
          chatId,
          userId: socket.userId
        });

      } catch (error) {
        console.error('Error marking messages as read:', error);
        socket.emit('error', { message: 'Error marking messages as read' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId,
        userId: socket.userId,
        name: socket.user.name
      });
    });

    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_stopped_typing', {
        chatId,
        userId: socket.userId
      });
    });

    // Handle location sharing
    socket.on('share_location', async (data) => {
      try {
        const { chatId, latitude, longitude, address } = data;

        const chat = await Chat.findById(chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        const locationMessage = {
          type: 'location',
          coordinates: { latitude, longitude },
          address
        };

        await chat.addMessage(socket.userId, 'Shared location', 'location', [locationMessage]);

        // Emit to all participants
        io.to(`chat_${chatId}`).emit('location_shared', {
          chatId,
          location: locationMessage,
          sender: socket.userId
        });

      } catch (error) {
        console.error('Error sharing location:', error);
        socket.emit('error', { message: 'Error sharing location' });
      }
    });

    // Handle order updates (for order-related chats)
    socket.on('order_update', async (data) => {
      try {
        const { orderId, status, message } = data;

        // TODO: Implement order update logic
        // This would involve updating the order status and notifying relevant users

        socket.emit('order_updated', {
          orderId,
          status,
          message
        });

      } catch (error) {
        console.error('Error updating order:', error);
        socket.emit('error', { message: 'Error updating order' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      // Remove user from active users
      activeUsers.delete(socket.userId);

      // Emit user offline status
      socket.broadcast.emit('user_offline', {
        userId: socket.userId,
        name: socket.user.name
      });

      // Update user's last seen
      User.findByIdAndUpdate(socket.userId, {
        lastSeen: new Date()
      }).exec();
    });

    // Send current online users to the connected user
    socket.emit('online_users', Array.from(activeUsers.values()).map(u => ({
      userId: u.user._id,
      name: u.user.name,
      avatar: u.user.avatar
    })));
  });

  // Helper function to get online users count
  const getOnlineUsersCount = () => activeUsers.size;

  // Helper function to check if user is online
  const isUserOnline = (userId) => activeUsers.has(userId);

  // Helper function to send notification to user
  const sendNotificationToUser = (userId, notification) => {
    io.to(`user_${userId}`).emit('notification', notification);
  };

  return {
    getOnlineUsersCount,
    isUserOnline,
    sendNotificationToUser
  };
};

module.exports = socketHandlers;
