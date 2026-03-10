const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME || 'local-treasures';

    if (!mongoURI) {
      throw new Error(
        'MONGODB_URI environment variable is required. Please provide your MongoDB Atlas connection string.'
      );
    }

    if (!mongoURI.includes('mongodb+srv://') && !mongoURI.includes('.mongodb.net')) {
      throw new Error(
        'Please use a MongoDB Atlas connection string (mongodb+srv://...). Local MongoDB is not supported.'
      );
    }

    console.log('🔄 Connecting to MongoDB Atlas...');
    console.log(`📍 URI: ${mongoURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);

    const options = {
      dbName,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      bufferCommands: false,
      family: 4
    };

    const conn = await mongoose.connect(mongoURI, options);

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log('🌐 Connection Type: MongoDB Atlas (Cloud)');

    await createGeospatialIndexes();

    mongoose.connection.on('connected', () => {
      console.log('🟢 Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('🔴 Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🟡 Mongoose disconnected from MongoDB');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🔴 MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

const createGeospatialIndexes = async () => {
  try {
    await mongoose.connection.db.collection('products').createIndex({
      'location.coordinates': '2dsphere'
    });

    await mongoose.connection.db.collection('users').createIndex({
      'location.coordinates': '2dsphere'
    });

    console.log('✅ Geospatial indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating geospatial indexes:', error);
  }
};

const closeDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
};

module.exports = { connectDB, closeDB };
