const express = require('express');
const router = express.Router();
const { uploadProductImages, deleteProductImage } = require('../controllers/uploadController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Upload product images (max 5 images)
router.post('/products', protect, authorize('seller'), upload.array('images', 5), uploadProductImages);

// Delete product image
router.delete('/products/:filename', protect, authorize('seller'), deleteProductImage);

module.exports = router;
