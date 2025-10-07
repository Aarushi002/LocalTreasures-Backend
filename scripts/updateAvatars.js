const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const updateAvatars = async () => {
  try {
    // Connect to MongoDB
    // Connect to MongoDB Atlas
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
        throw new Error('MONGODB_URI environment variable is required. Please provide your MongoDB Atlas connection string.');
    }
    await mongoose.connect(mongoURI);
    console.log('📦 Connected to MongoDB');

    // Find all users with via.placeholder.com avatars
    const usersToUpdate = await User.find({
      'avatar.url': { $regex: 'via\.placeholder\.com' }
    });

    console.log(`🔍 Found ${usersToUpdate.length} users with old placeholder avatars`);

    if (usersToUpdate.length === 0) {
      console.log('✅ No users need avatar updates');
      process.exit(0);
    }

    // Update each user's avatar URL
    const updatePromises = usersToUpdate.map(user => {
      const newAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4285f4&color=ffffff&size=150`;
      return User.findByIdAndUpdate(user._id, {
        'avatar.url': newAvatarUrl
      });
    });

    await Promise.all(updatePromises);

    console.log(`✅ Successfully updated ${usersToUpdate.length} user avatars`);
    console.log('🎉 Avatar update complete!');

  } catch (error) {
    console.error('❌ Error updating avatars:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

// Run the update
updateAvatars();
