const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Upload product images
// @route   POST /api/upload/products
// @access  Private (Seller only)
const uploadProductImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files uploaded'
    });
  }

  // Process uploaded files
  const imageData = req.files.map(file => ({
    public_id: file.filename.split('.')[0], // Use filename without extension as public_id
    url: `/uploads/products/${file.filename}`, // Relative path format
    filename: file.filename,
    originalName: file.originalname,
    size: file.size
  }));

  res.status(200).json({
    success: true,
    message: `${req.files.length} image(s) uploaded successfully`,
    images: imageData
  });
});

// @desc    Delete uploaded image
// @route   DELETE /api/upload/products/:filename
// @access  Private (Seller only)
const deleteProductImage = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '../public/uploads/products', filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'Image not found'
    });
  }

  try {
    // Delete the file
    fs.unlinkSync(filePath);
    
    res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image'
    });
  }
});

module.exports = {
  uploadProductImages,
  deleteProductImage
};
