const express = require('express');
const router = express.Router();
const { analyzeImage } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Route: POST /api/ai/image-analysis
// Protected by auth, wraps multer upload to return specific JSON error responses
router.post('/image-analysis', protect, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const isInvalidType = err.message && err.message.includes('Invalid file type');
      const isTooLarge = err.code === 'LIMIT_FILE_SIZE' || (err.message && err.message.includes('too large'));
      
      return res.status(400).json({
        success: false,
        error: isInvalidType ? 'INVALID_FILE_TYPE' : (isTooLarge ? 'FILE_TOO_LARGE' : 'INVALID_FILE')
      });
    }
    next();
  });
}, analyzeImage);

module.exports = router;
