# Smart Civic Complaint System — AI Image Analysis Integration Guide

This guide explains how to swap the simulated/mock AI response in `POST /api/ai/image-analysis` for a real Vision/Captioning model (such as BLIP, GPT-4o, Claude 3.5 Sonnet, or a custom YOLOv8-based captioning pipeline).

---

## Current Architecture

The `POST /api/ai/image-analysis` endpoint is handled by `Backend/server/controllers/aiController.js`. It performs:
1. Mime-type and size checks.
2. Calls a private helper function `runVisionModel(file)` that simulates network/inference latency and returns a mock object matching the required client-side format.

---

## Swapping for a Real Model

To integrate a real image analysis API, you only need to modify the `runVisionModel(file)` function in [aiController.js](file:///c:/Users/dharu/Documents/rush%20hour/Backend/server/controllers/aiController.js).

Here are implementation examples for common services:

### Option A: Integrating OpenAI GPT-4o (Node.js)

1. Install the OpenAI package:
   ```bash
   npm install openai
   ```
2. Configure your API key in `.env`:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```
3. Update `runVisionModel` in `aiController.js`:
   ```javascript
   const { OpenAI } = require('openai');
   const fs = require('fs');

   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

   const runVisionModel = async (file) => {
     // Read file buffer and encode to base64
     const imageBase64 = fs.readFileSync(file.path, { encoding: 'base64' });
     const mimeType = file.mimetype;

     const response = await openai.chat.completions.create({
       model: "gpt-4o",
       messages: [
         {
           role: "user",
           content: [
             {
               type: "text",
               text: "Analyze this image and identify the civic issue. Return a JSON object with: 1) 'description' (a concise one-sentence description of the issue), 2) 'objects' (an array of names of the core physical objects related to the issue), 3) 'confidence' (a float between 0.0 and 1.0 representing your classification confidence). Return ONLY the raw JSON string, without markdown formatting."
             },
             {
               type: "image_url",
               image_url: {
                 url: `data:${mimeType};base64,${imageBase64}`
               }
             }
           ]
         }
       ],
       response_format: { type: "json_object" }
     });

     const result = JSON.parse(response.choices[0].message.content);
     return {
       description: result.description || "Civic issue detected.",
       objects: result.objects || [],
       confidence: Number(result.confidence || 0.90)
     };
   };
   ```

### Option B: Integrating a Python-based BLIP / YOLOv8 API

If you have a Python FastAPI service running a local model (similar to the existing mock-python-api running on port 8000), you can pipe the request directly to it:

1. Update `runVisionModel` in `aiController.js` to send a multipart request using Axios:
   ```javascript
   const axios = require('axios');
   const FormData = require('form-data');
   const fs = require('fs');

   const runVisionModel = async (file) => {
     const pythonServiceUrl = process.env.PYTHON_VISION_URL || 'http://localhost:8000/predict/caption';
     
     const form = new FormData();
     form.append('image', fs.createReadStream(file.path));

     const response = await axios.post(pythonServiceUrl, form, {
       headers: {
         ...form.getHeaders()
       }
     });

     return {
       description: response.data.description,
       objects: response.data.objects,
       confidence: Number(response.data.confidence || 0.95)
     };
   };
   ```

---

## Contract Verification

Ensure that whichever model is swapped in, the return structure remains exactly as follows:
```json
{
  "description": "Concise text description...",
  "objects": ["Object1", "Object2"],
  "confidence": 0.85
}
```
This guarantees that the frontend service layer `ImageAnalysisService` and the visual component `AIImageAnalysisCard` function seamlessly without requiring modifications.
