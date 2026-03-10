const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME || 'local-treasures';
    
    // Ensure MongoDB Atlas URI is provided
    if (!mongoURI) {
      throw new Error('MONGODB_URI environment variable is required. Please provide your MongoDB Atlas connection string.');
    }
    
    // Validate that it's a MongoDB Atlas URI
    if (!mongoURI.includes('mongodb+srv://') && !mongoURI.includes('.mongodb.net')) {
      throw new Error('Please use a MongoDB Atlas connection string (mongodb+srv://...). Local MongoDB is not supported.');
    }
    
    console.log('🔄 Connecting to MongoDB Atlas...');
    console.log(`📍 URI: ${mongoURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
    
    // MongoDB Atlas connection configuration
    const isAtlas = true; // Always using MongoDB Atlas
    
    const options = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  bufferCommands: false,
  family: 4
};

    const conn = await mongoose.connect(mongoURI, options);

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🌐 Connection Type: MongoDB Atlas (Cloud)`);
    
    // Create geospatial indexes for location-based queries
    await createGeospatialIndexes();
    
    // Set up connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('🟢 Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('🔴 Mongoose connection error:', err);
      
      // Provide specific error guidance
      if (err.message.includes('authentication failed')) {
        console.log('\n🔐 Authentication Error - Check your MongoDB Atlas credentials:');
        console.log('1. Verify username and password in connection string');
        console.log('2. Ensure user has proper database permissions');
        console.log('3. Check if IP address is whitelisted in Atlas');
      } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
        console.log('\n🌐 Network Error - Check your MongoDB Atlas connection:');
        console.log('1. Verify cluster URL is correct');
        console.log('2. Check your internet connection');
        console.log('3. Ensure cluster is not paused');
      }
      
      // Don't exit, attempt to reconnect
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect to MongoDB...');
        connectDB();
      }, 5000);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🟡 Mongoose disconnected from MongoDB');
      // Attempt to reconnect
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect to MongoDB...');
        connectDB();
      }, 5000);
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🔴 MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    // Provide helpful error messages based on error type
    if (error.message.includes('MONGODB_URI environment variable is required')) {
      console.log('\n📝 MongoDB Atlas Setup Required:');
      console.log('1. Create a MongoDB Atlas account: https://www.mongodb.com/atlas');
      console.log('2. Create a cluster and database user');
      console.log('3. Whitelist your IP address (0.0.0.0/0 for development)');
      console.log('4. Get connection string and set MONGODB_URI in .env file');
      console.log('\n📝 Example Atlas URI format:');
      console.log('   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/local-treasures?retryWrites=true&w=majority');
    } else if (error.message.includes('Please use a MongoDB Atlas connection string')) {
      console.log('\n🔗 MongoDB Atlas Required:');
      console.log('This application requires MongoDB Atlas. Local MongoDB is not supported.');
      console.log('Please update your MONGODB_URI to use a MongoDB Atlas connection string.');
    } else if (error.message.includes('authentication failed')) {
      console.log('\n🔐 MongoDB Atlas Authentication Error:');
      console.log('1. Check username and password in MONGODB_URI');
      console.log('2. Ensure user has proper database permissions');
      console.log('3. Verify database user exists in Atlas');
      console.log('4. Check if IP address is whitelisted');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.log('\n🌐 MongoDB Atlas Network Error:');
      console.log('1. Check your internet connection');
      console.log('2. Verify cluster URL in MONGODB_URI');
      console.log('3. Ensure cluster is not paused in Atlas');
      console.log('4. Check DNS resolution');
    } else if (error.message.includes('bad auth')) {
      console.log('\n� MongoDB Atlas Credentials Error:');
      console.log('1. Double-check username and password');
      console.log('2. Ensure password doesn\'t contain special characters that need URL encoding');
      console.log('3. Try resetting database user password in Atlas');
    }
    
    console.log('\n🔗 MongoDB Atlas Setup Guide:');
    console.log('1. Create account: https://www.mongodb.com/atlas');
    console.log('2. Create cluster and database user');
    console.log('3. Whitelist your IP address');
    console.log('4. Get connection string and update MONGODB_URI');
    console.log('\n📝 Example Atlas URI format:');
    console.log('   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/local-treasures?retryWrites=true&w=majority');
    
    // Don't exit the process, let the app continue without database
    console.log('⚠️  Server will continue running without database connection');
    console.log('🔄 Will retry connection in 30 seconds...');
    
    // Retry connection after 30 seconds
    setTimeout(() => {
      console.log('🔄 Retrying MongoDB connection...');
      connectDB();
    }, 30000);
  }
};

const createGeospatialIndexes = async () => {
  try {
    // Create 2dsphere index for location-based queries on products
    await mongoose.connection.db.collection('products').createIndex({
      "location.coordinates": "2dsphere"
    });
    
    // Create 2dsphere index for user locations
    await mongoose.connection.db.collection('users').createIndex({
      "location.coordinates": "2dsphere"
    });
    
    console.log('✅ Geospatial indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating geospatial indexes:', error);
  }
};

// Graceful shutdown
const closeDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
};

module.exports = { connectDB, closeDB };
