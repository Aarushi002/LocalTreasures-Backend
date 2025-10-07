const mongoose = require('mongoose');
const Chat = require('../models/Chat');

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/local-treasures');

async function testChatCreation() {
  try {
    console.log('🧪 Testing chat creation race condition fix...');
    
    // Sample user IDs (use real ones from your database)
    const user1Id = '68ca556861982a55b225622a';
    const user2Id = '68ca568261982a55b2256398';
    
    console.log(`Testing chat creation between users: ${user1Id} and ${user2Id}`);
    
    // Simulate concurrent requests (like clicking Contact Seller multiple times quickly)
    const promises = [];
    const numberOfConcurrentRequests = 5;
    
    for (let i = 0; i < numberOfConcurrentRequests; i++) {
      console.log(`Creating request ${i + 1}...`);
      promises.push(Chat.findOrCreateDirectChat(user1Id, user2Id));
    }
    
    console.log(`Executing ${numberOfConcurrentRequests} concurrent chat creation requests...`);
    const results = await Promise.all(promises);
    
    console.log('✅ All requests completed!');
    
    // Check how many unique chat IDs we got
    const uniqueChatIds = new Set(results.map(chat => chat._id.toString()));
    
    console.log(`📊 Results:`);
    console.log(`- Requests made: ${numberOfConcurrentRequests}`);
    console.log(`- Unique chats created: ${uniqueChatIds.size}`);
    console.log(`- Chat IDs: ${Array.from(uniqueChatIds).join(', ')}`);
    
    if (uniqueChatIds.size === 1) {
      console.log('🎉 SUCCESS: Only one chat was created despite multiple concurrent requests!');
    } else {
      console.log('❌ FAILURE: Multiple chats were created - race condition still exists.');
    }
    
    // Verify in database
    const chatsInDb = await Chat.find({
      type: 'direct',
      'participants.user': { $all: [user1Id, user2Id] },
      isActive: true
    });
    
    console.log(`📊 Chats in database: ${chatsInDb.length}`);
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    mongoose.disconnect();
  }
}

testChatCreation();