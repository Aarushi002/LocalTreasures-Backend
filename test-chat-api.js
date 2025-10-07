const axios = require('axios');

// Test the chat API endpoint
async function testChatAPI() {
  try {
    // You'll need to replace these with actual tokens from your browser
    const buyerToken = 'YOUR_BUYER_TOKEN_HERE';
    const sellerToken = 'YOUR_SELLER_TOKEN_HERE';
    const chatId = '68caa41d76ea0e142d27abee'; // From your database example
    
    console.log('Testing getChat API...');
    
    // Test with seller token
    const response = await axios.get(`http://localhost:5000/api/chat/${chatId}`, {
      headers: {
        'Authorization': `Bearer ${sellerToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('API Response:');
    console.log('Chat ID:', response.data.chat._id);
    console.log('Messages count:', response.data.messages?.length || 0);
    
    if (response.data.messages && response.data.messages.length > 0) {
      console.log('\nFirst message:');
      console.log('- Content:', response.data.messages[0].content);
      console.log('- Sender (raw):', response.data.messages[0].sender);
      console.log('- Sender type:', typeof response.data.messages[0].sender);
      console.log('- Has sender._id:', !!response.data.messages[0].sender?._id);
    }
    
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
  }
}

testChatAPI();