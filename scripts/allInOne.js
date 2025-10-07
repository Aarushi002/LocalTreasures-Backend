#!/usr/bin/env node

/**
 * 🚀 Local Treasures - All-in-One Script
 * 
 * This comprehensive script handles all database operations:
 * - Database seeding with dummy data
 * - Image URL fixes and updates
 * - Data cleanup and maintenance
 * - User and product management
 * - Order and review generation
 * 
 * Usage:
 *   node allInOne.js [command] [options]
 * 
 * Commands:
 *   seed           - Generate complete dummy data (default)
 *   fix-images     - Fix product images with reliable URLs
 *   update-images  - Update with fresh Unsplash images
 *   check-images   - Check current image status
 *   clean          - Clean all data (WARNING: Destructive)
 *   users          - List all users
 *   products       - List all products
 *   orders         - List all orders
 *   featured       - Mark random products as featured
 *   reviews        - Generate product reviews
 *   help           - Show this help message
 * 
 * Examples:
 *   node allInOne.js                    # Full seed with dummy data
 *   node allInOne.js seed               # Same as above
 *   node allInOne.js fix-images         # Fix broken images
 *   node allInOne.js clean              # Clean all data
 *   node allInOne.js users              # List users
 *   node allInOne.js featured           # Mark featured products
 */

require('dotenv').config(); // Load environment variables
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// Import models
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Chat = require('../models/Chat');

// Database connection
// Suppress punycode deprecation warning
process.noDeprecation = true;

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/local-treasures';
    const isAtlas = mongoURI.includes('mongodb+srv://') || mongoURI.includes('.mongodb.net');
    
    console.log(`📦 Connecting to ${isAtlas ? 'MongoDB Atlas' : 'Local MongoDB'}...`);
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      ...(isAtlas && {
        ssl: true,
        authSource: 'admin',
        retryWrites: true,
        retryReads: true
      })
    };
    
    await mongoose.connect(mongoURI, options);
    console.log(`✅ MongoDB connected successfully (${isAtlas ? 'Atlas Cloud' : 'Local'})`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    if (error.message.includes('authentication failed')) {
      console.log('💡 Check your MongoDB Atlas credentials in .env file');
    } else if (error.message.includes('ENOTFOUND')) {
      console.log('💡 Check your internet connection and Atlas cluster URL');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('💡 If using local MongoDB, ensure it\'s running');
      console.log('💡 Or switch to MongoDB Atlas in your .env file');
    }
    
    process.exit(1);
  }
};

// Utility functions
const log = (message, type = 'info') => {
  const timestamp = new Date().toLocaleTimeString();
  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
  console.log(`${icons[type]} [${timestamp}] ${message}`);
};

const randomChoice = (array) => array[Math.floor(Math.random() * array.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Product categories and sample data
const categories = ['Handmade', 'Food', 'Art', 'Clothing', 'Jewelry', 'Home Decor'];

const productNames = {
  'Handmade': [
    'Handcrafted Wooden Bowl', 'Artisan Ceramic Mug', 'Hand-knitted Scarf', 'Carved Wooden Figurine',
    'Handmade Soap Set', 'Woven Basket', 'Pottery Vase', 'Embroidered Pillow', 'Macrame Wall Hanging',
    'Hand-painted Ornament', 'Quilted Table Runner', 'Leather Bookmark', 'Crocheted Baby Blanket'
  ],
  'Food': [
    'Local Honey Jar', 'Artisan Bread Loaf', 'Homemade Jam Set', 'Fresh Pasta Bundle', 'Herbal Tea Blend',
    'Pickled Vegetables', 'Craft Beer Selection', 'Cheese Wheel', 'Spice Mix Collection', 'Maple Syrup Bottle',
    'Dried Fruit Mix', 'Specialty Coffee Beans', 'Homemade Cookies'
  ],
  'Art': [
    'Original Oil Painting', 'Watercolor Portrait', 'Abstract Canvas Art', 'Pencil Sketch Drawing',
    'Digital Art Print', 'Photography Print', 'Sculpture Piece', 'Mixed Media Artwork', 'Acrylic Painting',
    'Charcoal Drawing', 'Pastel Landscape', 'Art Collage', 'Miniature Painting'
  ],
  'Clothing': [
    'Vintage Denim Jacket', 'Handmade Cotton Dress', 'Knitted Sweater', 'Silk Scarf Collection',
    'Leather Boots Pair', 'Artisan Hat', 'Embroidered Blouse', 'Wool Coat', 'Designer T-shirt',
    'Custom Apron', 'Handwoven Shawl', 'Vintage Accessories', 'Organic Cotton Shirt'
  ],
  'Jewelry': [
    'Silver Ring Set', 'Handmade Necklace', 'Gemstone Earrings', 'Vintage Brooch', 'Beaded Bracelet',
    'Gold Pendant Chain', 'Artisan Cufflinks', 'Pearl String Necklace', 'Copper Wire Bracelet',
    'Crystal Pendant', 'Handcrafted Anklet', 'Ethnic Jewelry Set', 'Statement Ring'
  ],
  'Home Decor': [
    'Rustic Wall Clock', 'Decorative Candle Set', 'Vintage Mirror Frame', 'Throw Pillow Collection',
    'Handmade Curtains', 'Wooden Wall Art', 'Ceramic Plant Pot', 'Antique Lamp Shade',
    'Woven Table Mat', 'Metal Wall Sculpture', 'Glass Vase Set', 'Decorative Bowl', 'Picture Frame Set'
  ]
};

const descriptions = {
  'Handmade': 'Carefully crafted by skilled artisans using traditional techniques and premium materials.',
  'Food': 'Fresh, locally sourced ingredients prepared with authentic recipes and traditional methods.',
  'Art': 'Original artwork created by talented local artists, perfect for home or office decoration.',
  'Clothing': 'Stylish and comfortable clothing made with high-quality fabrics and attention to detail.',
  'Jewelry': 'Beautiful jewelry pieces crafted with precious metals and stones by expert jewelers.',
  'Home Decor': 'Elegant home decoration items that add character and style to any living space.'
};

// Image URL generators - Category-specific product images
const getProductImage = (category, productName, index) => {
  // Create product-specific images based on category and product type
  const categoryImages = {
    'handmade': [
      'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=400&h=400&fit=crop', // pottery
      'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=400&fit=crop', // crafts
      'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop', // handmade items
      'https://images.unsplash.com/photo-1606107557405-4edbda45b88f?w=400&h=400&fit=crop', // wooden crafts
      'https://images.unsplash.com/photo-1580870069867-74c2ee967d0a?w=400&h=400&fit=crop', // textile crafts
      'https://images.unsplash.com/photo-1589992937404-9b17a69ae875?w=400&h=400&fit=crop'  // handmade ceramics
    ],
    'food': [
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=400&fit=crop', // local food
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=400&fit=crop', // fresh produce
      'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop', // baked goods
      'https://images.unsplash.com/photo-1586511925558-a4c6376fe65f?w=400&h=400&fit=crop', // artisan bread
      'https://images.unsplash.com/photo-1571197119213-be0d90ba1267?w=400&h=400&fit=crop', // honey products
      'https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=400&h=400&fit=crop'  // local specialties
    ],
    'art': [
      'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=400&h=400&fit=crop', // paintings
      'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400&h=400&fit=crop', // artwork
      'https://images.unsplash.com/photo-1549887534-1541e9326642?w=400&h=400&fit=crop', // abstract art
      'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=400&h=400&fit=crop', // sculpture
      'https://images.unsplash.com/photo-1594736797933-d0301ba6fe65?w=400&h=400&fit=crop', // local art
      'https://images.unsplash.com/photo-1549490349-8643362247b5?w=400&h=400&fit=crop'   // canvas art
    ],
    'clothing': [
      'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&h=400&fit=crop', // fashion
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&h=400&fit=crop', // clothing
      'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=400&fit=crop', // garments
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=400&fit=crop', // handmade clothes
      'https://images.unsplash.com/photo-1571455786673-9d9d6c194f90?w=400&h=400&fit=crop', // local fashion
      'https://images.unsplash.com/photo-1564859228273-274232fdb516?w=400&h=400&fit=crop'  // artisan wear
    ],
    'jewelry': [
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=400&fit=crop', // jewelry
      'https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=400&h=400&fit=crop', // accessories
      'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=400&h=400&fit=crop', // handmade jewelry
      'https://images.unsplash.com/photo-1603561596112-0a132b757442?w=400&h=400&fit=crop', // local jewelry
      'https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=400&h=400&fit=crop', // artisan jewelry
      'https://images.unsplash.com/photo-1599643475518-cd5c1e62c29e?w=400&h=400&fit=crop'  // craft jewelry
    ],
    'home_decor': [
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=400&fit=crop', // home decor
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop', // decorative items
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&h=400&fit=crop', // home accessories
      'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&h=400&fit=crop', // local crafts
      'https://images.unsplash.com/photo-1607734834519-d8576ae60ea4?w=400&h=400&fit=crop', // artisan decor
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=400&fit=crop'  // handmade decor
    ]
  };
  
  const categoryKey = category.toLowerCase().replace(/\s+/g, '_');
  const images = categoryImages[categoryKey] || categoryImages['handmade'];
  return images[index % images.length];
};

// Backup function for additional variety
const getUnsplashImage = (category) => {
  const unsplashImages = {
    'Handmade': [
      'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop'
    ],
    'Food': [
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop'
    ],
    'Art': [
      'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1594736797933-d0301ba6fe65?w=400&h=400&fit=crop'
    ],
    'Clothing': [
      'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=400&fit=crop'
    ],
    'Jewelry': [
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=400&h=400&fit=crop'
    ],
    'Home Decor': [
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&h=400&fit=crop'
    ]
  };
  return randomChoice(unsplashImages[category] || unsplashImages['Handmade']);
};

// Main script functions
const generateUsers = async (count = 50) => {
  log(`Generating ${count} users...`);
  const users = [];
  
  // Create admin user
  const adminPassword = await bcrypt.hash('password123', 10);
  users.push({
    name: 'Admin User',
    email: 'admin@localtreasures.com',
    password: adminPassword,
    phone: '+1234567890',
    role: 'admin',
    emailVerified: true,
    phoneVerified: true,
    location: {
      type: 'Point',
      coordinates: [-74.006, 40.7128], // NYC coordinates
      address: {
        street: 'Admin Office',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      }
    }
  });

  // Generate regular users
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  const roles = ['buyer', 'seller'];
  
  for (let i = 0; i < count - 1; i++) {
    const firstName = randomChoice(firstNames);
    const lastName = randomChoice(lastNames);
    const role = randomChoice(roles);
    const password = await bcrypt.hash('password123', 10);
    
    users.push({
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      password,
      phone: `+1${randomInt(100, 999)}${randomInt(100, 999)}${randomInt(1000, 9999)}`,
      role,
      emailVerified: Math.random() > 0.2,
      phoneVerified: Math.random() > 0.3,
      location: {
        type: 'Point',
        coordinates: [
          -74.006 + (Math.random() - 0.5) * 0.1, // Longitude around NYC
          40.7128 + (Math.random() - 0.5) * 0.1  // Latitude around NYC
        ],
        address: {
          street: `${randomInt(100, 9999)} ${randomChoice(['Main St', 'Oak Ave', 'Pine Rd', 'Elm Dr'])}`,
          city: randomChoice(['Springfield', 'Riverside', 'Franklin', 'Georgetown']),
          state: 'NY',
          zipCode: `${randomInt(10000, 99999)}`,
          country: 'USA'
        }
      },
      businessInfo: role === 'seller' ? {
        businessName: `${firstName}'s ${randomChoice(['Crafts', 'Creations', 'Workshop', 'Studio'])}`,
        businessType: randomChoice(['artisan', 'home_chef', 'small_business']),
        description: `Local artisan specializing in handmade ${randomChoice(categories.map(c => c.toLowerCase()))} products.`,
        categories: [randomChoice(['handmade', 'food', 'art', 'clothing', 'jewelry', 'home_decor'])],
        isVerified: Math.random() > 0.4
      } : undefined
    });
  }

  const savedUsers = await User.insertMany(users);
  log(`Created ${savedUsers.length} users`, 'success');
  return savedUsers;
};

const generateProducts = async (users, count = 70) => {
  log(`Generating ${count} products...`);
  
  const sellers = users.filter(user => user.role === 'seller');
  if (sellers.length === 0) {
    throw new Error('No sellers found to create products');
  }
  
  const products = [];

  for (let i = 0; i < count; i++) {
    const category = randomChoice(categories).toLowerCase().replace(/\s+/g, '_'); // Convert spaces to underscores
    
    // Convert to proper title case for productNames lookup
    const categoryKey = category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    if (!productNames[categoryKey]) {
      throw new Error(`No product names for category ${categoryKey}`);
    }
    
    const productName = randomChoice(productNames[categoryKey]);
    const seller = randomChoice(sellers);
    
    // Use category-specific product images
    const mainImageUrl = getProductImage(category, productName, i);
    
    // Generate multiple images for each product (proper schema format)
    const images = [{
      public_id: `product_${i}_main`,
      url: mainImageUrl
    }];
    
    for (let j = 1; j <= randomInt(2, 4); j++) {
      images.push({
        public_id: `product_${i}_${j}`,
        url: getProductImage(category, productName, i + j)
      });
    }

    const dimensionValues = [randomInt(5, 50), randomInt(5, 50), randomInt(5, 50)];
    const weightValue = randomInt(100, 5000);

    products.push({
      name: `${productName} #${i + 1}`,
      description: `${descriptions[categoryKey]} This unique ${productName.toLowerCase()} is perfect for those who appreciate quality craftsmanship and authentic local products.`,
      price: randomInt(10, 500),
      category: category, // Ensure lowercase
      seller: seller._id,
      images,
      availability: {
        inStock: true,
        quantity: randomInt(1, 20),
        reservedQuantity: 0
      },
      isActive: Math.random() > 0.1,
      isFeatured: Math.random() > 0.8,
      location: {
        type: 'Point',
        coordinates: [
          seller.location.coordinates[0] + (Math.random() - 0.5) * 0.01,
          seller.location.coordinates[1] + (Math.random() - 0.5) * 0.01
        ],
        address: seller.location.address
      },
      tags: [category, 'handmade', 'local', 'authentic'],
      specifications: {
        material: randomChoice(['Wood', 'Cotton', 'Ceramic', 'Metal', 'Glass', 'Leather']),
        dimensions: {
          length: dimensionValues[0],
          width: dimensionValues[1],
          height: dimensionValues[2],
          unit: 'cm'
        },
        weight: {
          value: weightValue / 1000, // Convert to kg
          unit: 'kg'
        },
        customizable: Math.random() > 0.7
      },
      delivery: {
        available: true,
        radius: randomInt(5, 25),
        fee: randomInt(0, 15),
        estimatedTime: {
          min: randomInt(2, 8),
          max: randomInt(12, 48)
        }
      },
      pickup: {
        available: true,
        location: {
          address: `${seller.location.address.street}, ${seller.location.address.city}`,
          instructions: 'Please call when you arrive'
        }
      }
    });
  }

  const savedProducts = await Product.insertMany(products);
  log(`Created ${savedProducts.length} products`, 'success');
  return savedProducts;
};

const generateOrders = async (users, products, count = 100) => {
  log(`Generating ${count} orders...`);
  const buyers = users.filter(user => user.role === 'buyer');
  const orders = [];

  for (let i = 0; i < count; i++) {
    const buyer = randomChoice(buyers);
    const seller = randomChoice(products).seller; // Pick a seller from products
    
    // Get products from the same seller for this order
    const sellerProducts = products.filter(p => p.seller.toString() === seller.toString());
    const orderItems = [];
    const numItems = randomInt(1, 3);

    for (let j = 0; j < numItems; j++) {
      const product = randomChoice(sellerProducts);
      const quantity = randomInt(1, 2);
      orderItems.push({
        product: product._id,
        quantity,
        price: product.price
      });
    }

    const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = Math.random() > 0.5 ? randomInt(5, 15) : 0;
    const tax = Math.round(subtotal * 0.08 * 100) / 100; // 8% tax
    const total = subtotal + deliveryFee + tax;
    
    const status = randomChoice(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']);
    const paymentStatus = status === 'cancelled' ? 'failed' : randomChoice(['pending', 'completed']);
    
    // Generate unique order number
    const orderNumber = `LT${String(Date.now()).slice(-8)}${String(i).padStart(3, '0')}`;

    orders.push({
      orderNumber,
      buyer: buyer._id,
      seller: seller,
      items: orderItems,
      totals: {
        subtotal,
        deliveryFee,
        tax,
        total
      },
      delivery: {
        method: randomChoice(['pickup', 'delivery']),
        address: {
          street: buyer.location.address.street,
          city: buyer.location.address.city,
          state: buyer.location.address.state,
          zipCode: buyer.location.address.zipCode,
          country: buyer.location.address.country,
          coordinates: buyer.location.coordinates
        },
        estimatedTime: {
          min: randomInt(2, 6),
          max: randomInt(8, 24)
        },
        instructions: randomChoice([
          'Please call when you arrive',
          'Leave at front door',
          'Ring the doorbell',
          'Contact via phone first'
        ])
      },
      payment: {
        method: randomChoice(['stripe', 'razorpay', 'cash_on_delivery']),
        status: paymentStatus,
        paidAt: paymentStatus === 'completed' ? new Date(Date.now() - randomInt(1, 10) * 24 * 60 * 60 * 1000) : undefined
      },
      status,
      statusHistory: [{
        status: 'pending',
        timestamp: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000),
        note: 'Order placed'
      }]
    });
  }

  const savedOrders = await Order.insertMany(orders);
  log(`Created ${savedOrders.length} orders`, 'success');
  return savedOrders;
};

const generateChats = async (users, count = 50) => {
  log(`Generating ${count} chat conversations...`);
  const chats = [];

  for (let i = 0; i < count; i++) {
    // Pick two different users
    const user1 = randomChoice(users);
    let user2 = randomChoice(users);
    while (user2._id.toString() === user1._id.toString()) {
      user2 = randomChoice(users);
    }

    const participants = [
      { user: user1._id, joinedAt: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000) },
      { user: user2._id, joinedAt: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000) }
    ];

    const messageCount = randomInt(3, 8);
    const messages = [];
    const messageTemplates = [
      'Hi! Is this item still available?',
      'Yes, it is! Would you like to know more about it?',
      'What are the dimensions?',
      'It measures about 20x15 cm.',
      'Great! Can we arrange pickup?',
      'Sure, when would work for you?',
      'How about this weekend?',
      'Perfect! Let me know the exact time.',
      'Thank you for your interest!',
      'Looking forward to the purchase!',
      'Is this handmade?',
      'Yes, everything is made by hand with care.',
      'How long does delivery take?',
      'Usually 2-3 business days.',
      'Can you customize this?',
      'Yes, I can make small customizations.'
    ];

    let lastMessageTime = new Date(Date.now() - randomInt(1, 7) * 24 * 60 * 60 * 1000);
    
    for (let j = 0; j < messageCount; j++) {
      const sender = j % 2 === 0 ? user1._id : user2._id;
      const messageTime = new Date(lastMessageTime.getTime() + randomInt(10, 120) * 60 * 1000); // 10 mins to 2 hours later
      
      messages.push({
        sender,
        content: randomChoice(messageTemplates),
        messageType: 'text',
        readBy: [{ user: sender }],
        createdAt: messageTime
      });
      
      lastMessageTime = messageTime;
    }

    const lastMsg = messages[messages.length - 1];
    
    chats.push({
      participants,
      type: 'direct',
      messages,
      lastMessage: {
        content: lastMsg.content,
        sender: lastMsg.sender,
        timestamp: lastMsg.createdAt
      },
      isActive: true,
      isBlocked: false,
      metadata: {
        totalMessages: messages.length,
        unreadCount: new Map()
      }
    });
  }

  const savedChats = await Chat.insertMany(chats);
  log(`Created ${savedChats.length} chat conversations`, 'success');
  return savedChats;
};

const generateReviews = async () => {
  log('Generating product reviews...');
  const products = await Product.find();
  const users = await User.find({ role: 'buyer' });
  
  let reviewCount = 0;
  for (const product of products) {
    if (Math.random() > 0.3) { // 70% chance of having reviews
      const numReviews = randomInt(1, 5);
      const reviews = [];
      
      for (let i = 0; i < numReviews; i++) {
        const reviewer = randomChoice(users);
        reviews.push({
          user: reviewer._id,
          userName: reviewer.name,
          rating: randomInt(3, 5), // Mostly positive reviews
          comment: randomChoice([
            'Excellent quality and fast delivery!',
            'Beautiful product, exactly as described.',
            'Great craftsmanship and attention to detail.',
            'Very satisfied with this purchase.',
            'Highly recommend this seller!',
            'Good value for money.',
            'Fast shipping and well packaged.',
            'Lovely item, will buy again.'
          ]),
          date: new Date(Date.now() - randomInt(0, 30) * 24 * 60 * 60 * 1000)
        });
      }
      
      await Product.findByIdAndUpdate(product._id, {
        reviews,
        averageRating: reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      });
      reviewCount += reviews.length;
    }
  }
  
  log(`Generated ${reviewCount} product reviews`, 'success');
};

// Image management functions
const fixImages = async () => {
  log('Fixing product images with reliable URLs...');
  const products = await Product.find();
  let updateCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const mainImageUrl = getProductImage(product.category, product.name, i);
    
    // Create proper image objects with public_id and url
    const images = [{
      public_id: `product_${product._id}_main_fixed`,
      url: mainImageUrl
    }];
    
    for (let j = 1; j <= randomInt(2, 4); j++) {
      images.push({
        public_id: `product_${product._id}_${j}_fixed`,
        url: getProductImage(product.category, product.name, i + j)
      });
    }

    await Product.findByIdAndUpdate(product._id, { images });
    updateCount++;
  }

  log(`Updated ${updateCount} products with reliable images`, 'success');
};

const updateWithUnsplash = async () => {
  log('Updating products with fresh product-specific images...');
  const products = await Product.find();
  let updateCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const images = [{
      public_id: `product_${product._id}_main_updated`,
      url: getProductImage(product.category, product.name, i)
    }];
    
    for (let j = 1; j <= randomInt(2, 4); j++) {
      images.push({
        public_id: `product_${product._id}_${j}_updated`,
        url: getProductImage(product.category, product.name, i + j)
      });
    }

    await Product.findByIdAndUpdate(product._id, { images });
    updateCount++;
  }

  log(`Updated ${updateCount} products with product-specific images`, 'success');
};

const checkImages = async () => {
  log('Checking current image status...');
  const products = await Product.find();
  
  let totalImages = 0;
  let picsumCount = 0;
  let unsplashCount = 0;
  let otherCount = 0;

  for (const product of products) {
    for (const image of product.images) {
      totalImages++;
      if (image.includes('picsum.photos')) {
        picsumCount++;
      } else if (image.includes('unsplash.com')) {
        unsplashCount++;
      } else {
        otherCount++;
      }
    }
  }

  log(`📊 Image Status Report:`, 'info');
  log(`   Total Images: ${totalImages}`);
  log(`   Picsum Photos: ${picsumCount} (${Math.round(picsumCount/totalImages*100)}%)`);
  log(`   Unsplash: ${unsplashCount} (${Math.round(unsplashCount/totalImages*100)}%)`);
  log(`   Other: ${otherCount} (${Math.round(otherCount/totalImages*100)}%)`);
  log(`   Products: ${products.length}`);
};

// Data management functions
const cleanAllData = async () => {
  log('⚠️  Cleaning all data from database...', 'warning');
  
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    Chat.deleteMany({})
  ]);
  
  log('🗑️  All data cleaned', 'success');
};

const listUsers = async () => {
  const users = await User.find().select('name email role isVerified');
  log(`📋 Found ${users.length} users:`);
  users.forEach(user => {
    const status = user.isVerified ? '✅' : '❌';
    log(`   ${status} ${user.name} (${user.email}) - ${user.role}`);
  });
};

const listProducts = async () => {
  const products = await Product.find().populate('seller', 'name');
  log(`📋 Found ${products.length} products:`);
  products.forEach(product => {
    const status = product.isActive ? '✅' : '❌';
    const featured = product.isFeatured ? '⭐' : '  ';
    const categoryDisplay = product.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    log(`   ${status}${featured} ${product.name} - $${product.price} (${categoryDisplay}) by ${product.seller.name}`);
  });
};

const listOrders = async () => {
  const orders = await Order.find().populate('buyer', 'name');
  log(`📋 Found ${orders.length} orders:`);
  orders.forEach(order => {
    const statusIcon = {
      pending: '⏳', confirmed: '✅', shipped: '📦', 
      delivered: '🏆', cancelled: '❌'
    };
    log(`   ${statusIcon[order.status]} Order #${order._id.toString().slice(-6)} - $${order.total} (${order.status}) by ${order.buyer.name}`);
  });
};

const markFeaturedProducts = async () => {
  log('Marking random products as featured...');
  const products = await Product.find();
  const featuredCount = Math.min(10, Math.floor(products.length * 0.2));
  
  // Reset all featured status
  await Product.updateMany({}, { isFeatured: false });
  
  // Mark random products as featured
  const shuffled = products.sort(() => 0.5 - Math.random());
  const featured = shuffled.slice(0, featuredCount);
  
  for (const product of featured) {
    await Product.findByIdAndUpdate(product._id, { isFeatured: true });
  }
  
  log(`Marked ${featuredCount} products as featured`, 'success');
};

// Main seed function
const fullSeed = async () => {
  log('🚀 Starting complete database seeding...', 'info');
  
  // Clean existing data
  await cleanAllData();
  
  // Generate all data
  await generateUsers(50);
  
  // Fetch users from database to get their _id fields
  const users = await User.find();
  const products = await generateProducts(users, 70);
  const orders = await generateOrders(users, products, 100);
  const chats = await generateChats(users, 50);
  await generateReviews();
  await markFeaturedProducts();
  
  log('🎉 Database seeding completed successfully!', 'success');
  log('📊 Summary:', 'info');
  log(`   👥 Users: ${users.length} (all with password: password123)`);
  log(`   🛍️  Products: ${products.length} with images`);
  log(`   📦 Orders: ${orders.length}`);
  log(`   💬 Chats: ${chats.length}`);
  log(`   ⭐ Featured products marked`);
  log(`   📝 Product reviews generated`);
};

// Help function
const showHelp = () => {
  console.log(`
🚀 Local Treasures - All-in-One Script

USAGE:
  node allInOne.js [command] [options]

COMMANDS:
  seed           Generate complete dummy data (default)
  fix-images     Fix product images with reliable URLs
  update-images  Update with fresh Unsplash images  
  check-images   Check current image status
  clean          Clean all data (⚠️  DESTRUCTIVE)
  users          List all users
  products       List all products
  orders         List all orders
  featured       Mark random products as featured
  reviews        Generate product reviews
  help           Show this help message

EXAMPLES:
  node allInOne.js                    # Full seed with dummy data
  node allInOne.js seed               # Same as above
  node allInOne.js fix-images         # Fix broken images
  node allInOne.js clean              # Clean all data
  node allInOne.js users              # List users
  node allInOne.js featured           # Mark featured products

DATA GENERATED:
  👥 50 Users (all password: password123)
  🛍️  70 Products with reliable images
  📦 100 Orders with realistic data
  💬 50 Chat conversations
  ⭐ Featured products
  📝 Product reviews

All users have the password: password123
Admin user: admin@localtreasures.com / password123
  `);
};

// Main execution
const main = async () => {
  const command = process.argv[2] || 'seed';
  
  // Handle help command without DB connection
  if (command === 'help') {
    showHelp();
    return;
  }
  
  await connectDB();
  
  try {
    switch (command) {
      case 'seed':
        await fullSeed();
        break;
      case 'fix-images':
        await fixImages();
        break;
      case 'update-images':
        await updateWithUnsplash();
        break;
      case 'check-images':
        await checkImages();
        break;
      case 'clean':
        await cleanAllData();
        break;
      case 'users':
        await listUsers();
        break;
      case 'products':
        await listProducts();
        break;
      case 'orders':
        await listOrders();
        break;
      case 'featured':
        await markFeaturedProducts();
        break;
      case 'reviews':
        await generateReviews();
        break;
      default:
        log(`❌ Unknown command: ${command}`, 'error');
        log('Use "node allInOne.js help" for available commands', 'info');
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'error');
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      log('👋 Database connection closed');
    }
  }
};

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  generateUsers,
  generateProducts,
  generateOrders,
  generateChats,
  generateReviews,
  fixImages,
  updateWithUnsplash,
  checkImages,
  cleanAllData,
  markFeaturedProducts
};
