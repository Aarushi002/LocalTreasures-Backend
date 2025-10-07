const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const chatRoutes = require('./routes/chat');
const paymentRoutes = require('./routes/payments');
const uploadRoutes = require('./routes/upload');
const wishlistRoutes = require('./routes/wishlist');

// Import socket handlers
const socketHandlers = require('./utils/socketHandlers');

// Import database connection
const { connectDB } = require('./config/database');

const app = express();
const server = createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Enhanced CORS configuration for both development and production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://local-treasures-frontend.vercel.app',
      'https://local-treasures-frontend-4boyx7lt4-aarushi-krishnas-projects.vercel.app',
      process.env.FRONTEND_URL,
      process.env.PRODUCTION_FRONTEND_URL
    ].filter(Boolean);
    
    // Allow Vercel preview deployments
    if (origin.includes('vercel.app') || origin.includes('local-treasures')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type', 
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-File-Name',
    'Access-Control-Allow-Origin'
  ],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200,
  preflightContinue: false
};

app.use(cors(corsOptions));

// Explicit preflight handling with dynamic origin
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001', 
    'https://local-treasures-frontend.vercel.app',
    'https://local-treasures-frontend-4boyx7lt4-aarushi-krishnas-projects.vercel.app',
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_FRONTEND_URL
  ].filter(Boolean);
  
  if (!origin || allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,X-File-Name');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
  }
  
  res.sendStatus(200);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Debug middleware for CORS issues
app.use((req, res, next) => {
  next();
});

// Serve static files from uploads directory with dynamic CORS
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'https://local-treasures-frontend.vercel.app',
    'https://local-treasures-frontend-4boyx7lt4-aarushi-krishnas-projects.vercel.app',
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_FRONTEND_URL
  ].filter(Boolean);
  
  if (!origin || allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  }
  next();
}, express.static('public/uploads'));

// Database connection
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/wishlist', wishlistRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.status(200).json({ 
    status: 'OK', 
    message: 'Local Treasures API is running',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Keepalive endpoint to prevent idle timeouts
app.get('/api/keepalive', (req, res) => {
  res.status(200).json({ 
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// Handle manifest.json requests (return 404 instead of 401)
app.get('/manifest.json', (req, res) => {
  res.status(404).json({ 
    error: 'Manifest not found on backend',
    message: 'This should be served by the frontend'
  });
});

// Socket.io connection handling
socketHandlers(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error stack:', err.stack);
  
  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      error: 'Origin not allowed'
    });
  }
  
  // Handle other errors
  res.status(err.status || 500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});