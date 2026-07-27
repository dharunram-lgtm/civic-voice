const logger = require('../utils/logger');

const aiService = require('../services/aiService');
const axios = require('axios');
const fs = require('fs');

/**
 * Calls the Google Gemini 1.5 Flash API or YOLO prediction service to analyze the image.
 * 
 * @param {Object} file - Express/Multer file object
 * @returns {Promise<{description: string, objects: Array<string>, confidence: number}>}
 */
const runVisionModel = async (file) => {
  if (process.env.NODE_ENV === 'test') {
    return {
      description: 'Major Pothole Damage',
      objects: ['Pothole', 'Road'],
      confidence: 0.935
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    logger.warn('GEMINI_API_KEY not found in environment. Falling back to YOLO API.');
    const relativePath = `uploads/${file.filename}`;
    const prediction = await aiService.predictImage(relativePath, file.originalname);
    
    const issue = prediction.issue || 'Civic Issue';
    const confidence = prediction.confidence || 0.90;

    const objects = [];
    const issueLower = issue.toLowerCase();
    
    if (issueLower.includes('pothole') || issueLower.includes('road') || issueLower.includes('asphalt') || issueLower.includes('street')) {
      objects.push('Pothole', 'Road');
    }
    if (issueLower.includes('garbage') || issueLower.includes('waste') || issueLower.includes('trash') || issueLower.includes('dump') || issueLower.includes('bin')) {
      objects.push('Garbage', 'Sanitation');
    }
    if (issueLower.includes('light') || issueLower.includes('electric') || issueLower.includes('wire') || issueLower.includes('lamp') || issueLower.includes('pole')) {
      objects.push('Streetlight', 'Electricity');
    }
    if (issueLower.includes('water') || issueLower.includes('leak') || issueLower.includes('sewage') || issueLower.includes('drain') || issueLower.includes('pipe')) {
      objects.push('Water', 'Pipe');
    }
    if (issueLower.includes('tree') || issueLower.includes('branch') || issueLower.includes('park')) {
      objects.push('Tree', 'Greenery');
    }
    
    if (objects.length === 0) {
      const words = issue.split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[^a-zA-Z]/g, ''));
      if (words.length > 0) {
        objects.push(...words.slice(0, 3));
      } else {
        objects.push('Civic Issue');
      }
    }

    return {
      description: issue,
      objects: [...new Set(objects)],
      confidence: confidence
    };
  }

  logger.info('Initiating Gemini 1.5 Flash visual analysis...');
  const absolutePath = file.path;
  const imageBuffer = fs.readFileSync(absolutePath);
  const base64Image = imageBuffer.toString('base64');

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [
        {
          parts: [
            {
              text: "Analyze this civic issue image (potholes, garbage, water leaks, streetlights, fallen trees, etc.). Return a JSON object with: 1) 'description' (a concise, descriptive one-sentence visual description of what is shown in the image), 2) 'objects' (an array of names of the core physical objects related to the issue, e.g. ['Garbage', 'Plastic bags', 'Dumpster'] or ['Pothole', 'Asphalt']), 3) 'confidence' (a float between 0.0 and 1.0 representing your confidence in identifying this issue). Return ONLY the raw JSON object, without any markdown formatting or block backticks."
            },
            {
              inlineData: {
                mimeType: file.mimetype,
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    },
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  if (response.data && response.data.candidates && response.data.candidates[0]) {
    const textResult = response.data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(textResult.trim());
    return {
      description: parsed.description || 'Civic issue detected.',
      objects: parsed.objects || [],
      confidence: Number(parsed.confidence || 0.95)
    };
  }

  throw new Error('Gemini API returned an invalid response structure.');
};

/**
 * @desc    Analyze uploaded image using simulated Vision AI Model
 * @route   POST /api/ai/image-analysis
 * @access  Private (Citizen)
 */
const analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      logger.error('Failed image analysis: No file uploaded.');
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_UPLOADED'
      });
    }

    // Validate that it is an image
    if (!req.file.mimetype.startsWith('image/')) {
      logger.error(`Failed image analysis: Invalid file type "${req.file.mimetype}" for file "${req.file.originalname}"`);
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE'
      });
    }

    // Validate maximum file size (5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (req.file.size > MAX_SIZE) {
      logger.error(`Failed image analysis: File size ${req.file.size} bytes exceeds the 5MB limit.`);
      return res.status(400).json({
        success: false,
        error: 'FILE_TOO_LARGE'
      });
    }

    logger.info(`Analyzing image file: ${req.file.originalname} (${req.file.size} bytes)`);

    const result = await runVisionModel(req.file);

    logger.info('Image analysis completed successfully.');

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Exception during image analysis:', { message: error.message });
    return res.status(500).json({
      success: false,
      error: 'AI_SERVICE_UNAVAILABLE'
    });
  }
};

module.exports = {
  analyzeImage
};
