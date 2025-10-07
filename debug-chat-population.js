const mongoose = require('mongoose');
const Chat = require('./models/Chat');

// Connect to MongoDB
// Load environment variables
require('dotenv').config();

// Connect to MongoDB Atlas
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
    throw new Error('MONGODB_URI environment variable is required. Please provide your MongoDB Atlas connection string.');
}

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function debugChatPopulation() {
  try {
    const chatId = '68caa41d76ea0e142d27abee'; // From your database example
    
    console.log('Testing chat population...');
    
    // Test without population first
    const chatWithoutPopulation = await Chat.findById(chatId);
    console.log('\nWithout population:');
    console.log('Messages count:', chatWithoutPopulation.messages.length);
    if (chatWithoutPopulation.messages.length > 0) {
      console.log('First message sender (raw):', chatWithoutPopulation.messages[0].sender);
    }
    
    // Test with population
    const chatWithPopulation = await Chat.findById(chatId)
      .populate('participants.user', 'name avatar businessInfo.businessName')
      .populate({
        path: 'messages.sender',
        select: 'name avatar'
      });
    
    console.log('\nWith population:');
    console.log('Messages count:', chatWithPopulation.messages.length);
    if (chatWithPopulation.messages.length > 0) {
      console.log('First message sender (populated):', chatWithPopulation.messages[0].sender);
    }
    
    // Test the exact same population as the controller
    const controllerStyleChat = await Chat.findById(chatId)
      .populate('participants.user', 'name avatar businessInfo.businessName')
      .populate('relatedOrder', 'orderNumber status')
      .populate('relatedProduct', 'name images')  
      .populate({
        path: 'messages.sender',
        select: 'name avatar'
      });
    
    console.log('\nController style population:');
    console.log('Messages count:', controllerStyleChat.messages.length);
    if (controllerStyleChat.messages.length > 0) {
      console.log('First message sender:', controllerStyleChat.messages[0].sender);
      console.log('Is sender populated?', typeof controllerStyleChat.messages[0].sender === 'object' && controllerStyleChat.messages[0].sender.name);
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugChatPopulation();