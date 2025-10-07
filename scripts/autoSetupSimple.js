#!/usr/bin/env node

/**
 * 🚀 Local Treasures - Simple Auto Setup
 * 
 * One command setup: npm run script
 */

require('dotenv').config(); // Load environment variables
const { spawn } = require('child_process');
const mongoose = require('mongoose');

// Simple, clean console output
const log = (message, icon = '📋') => {
  console.log(`${icon} ${message}`);
};

// Execute command silently
const executeCommand = (command, args = []) => {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'pipe', // Hide output
      shell: true
    });
    
    child.on('close', (code) => {
      resolve(code);
    });
    
    child.on('error', () => {
      resolve(1); // Continue even on error
    });
  });
};

// Check MongoDB connection (Atlas or local)
const checkMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/local-treasures';
    const isAtlas = mongoURI.includes('mongodb+srv://') || mongoURI.includes('.mongodb.net');
    
    log(`Connecting to ${isAtlas ? 'MongoDB Atlas' : 'Local MongoDB'}...`);
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      ...(isAtlas && {
        ssl: true,
        authSource: 'admin'
      })
    };
    
    await mongoose.connect(mongoURI, options);
    await mongoose.connection.close();
    return true;
  } catch (error) {
    log(`❌ MongoDB connection failed: ${error.message}`);
    return false;
  }
};

// Main setup function
const setupDatabase = async () => {
  console.log('🚀 Local Treasures - Quick Setup\n');
  
  // Check MongoDB
  log('Checking MongoDB connection...');
  const mongoOk = await checkMongoDB();
  
  if (!mongoOk) {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/local-treasures';
    const isAtlas = mongoURI.includes('mongodb+srv://') || mongoURI.includes('.mongodb.net');
    
    if (isAtlas) {
      log('❌ MongoDB Atlas connection failed.');
      log('💡 Check your MONGODB_URI in .env file');
      log('💡 Ensure your IP is whitelisted in Atlas');
      log('💡 Verify your username and password');
    } else {
      log('❌ Local MongoDB not running. Please start MongoDB first.');
      log('💡 Run: net start MongoDB (Windows) or brew services start mongodb (Mac)');
      log('💡 Or switch to MongoDB Atlas in your .env file');
    }
    process.exit(1);
  }
  
  log('✅ MongoDB connected');
  
  // Setup database with all data
  log('🔄 Setting up database with sample data...');
  const result = await executeCommand('node', ['scripts/allInOne.js', 'seed']);
  
  if (result === 0) {
    log('✅ Database setup complete!');
    
    console.log('\n🎉 LOCAL TREASURES READY!');
  console.log('\n📊 Created:');
  console.log('   👥 50 Users (password: password123)');
    console.log('   🛍️  70 Products with images');
    console.log('   📦 100 Orders');
    console.log('   💬 50 Chat conversations');
    console.log('   ⭐ Featured products');
    
    console.log('\n🔑 Admin Login:');
    console.log('   Email: admin@localtreasures.com');
  console.log('   Password: password123');
    
    console.log('\n🚀 Next Steps:');
    console.log('   1. Start backend: npm run dev');
    console.log('   2. Start frontend: cd ../frontend && npm start');
    console.log('   3. Open: http://localhost:3000');
    
    console.log('\n✨ Enjoy your Local Treasures marketplace! ✨\n');
  } else {
    log('❌ Setup failed. Check MongoDB and try again.');
  }
};

// Run setup
setupDatabase().catch(error => {
  console.error('❌ Setup error:', error.message);
  process.exit(1);
});
