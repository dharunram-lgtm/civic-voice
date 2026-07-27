/* Mock Python AI Services Server (Runs on port 8000) */

const express = require('express');
const multer = require('multer');

const app = express();
const PORT = 8000;

app.use(express.json());

// Set up simple multer for image uploads
const upload = multer();

// YOLOv8 Mock Endpoint
app.post('/predict/image', upload.single('image'), (req, res) => {
  console.log('[Mock Python API] Received YOLOv8 image prediction request');
  let issue = 'Major Pothole Damage';
  let confidence = 0.935;

  if (req.file) {
    console.log(`[Mock Python API] File details: name=${req.file.originalname}, size=${req.file.size} bytes`);
    const name = req.file.originalname.toLowerCase();

    if (name.includes('garbage') || name.includes('waste') || name.includes('trash') || name.includes('dump') || name.includes('bin') || name.includes('refuse') || name.includes('litter') || name.includes('scraps')) {
      issue = 'Garbage Accumulation & Overflow';
      confidence = 0.948;
    } else if (name.includes('water') || name.includes('leak') || name.includes('pipe') || name.includes('sewage') || name.includes('flood') || name.includes('drain')) {
      issue = 'Water Leakage & Pipeline Burst';
      confidence = 0.962;
    } else if (name.includes('light') || name.includes('lamp') || name.includes('electric') || name.includes('dark') || name.includes('wire')) {
      issue = 'Broken Street Light & Dark Zone';
      confidence = 0.920;
    } else if (name.includes('tree') || name.includes('branch') || name.includes('park') || name.includes('foliage')) {
      issue = 'Fallen Tree & Road Blockage';
      confidence = 0.895;
    }
  } else {
    console.log('[Mock Python API] Warning: No file received');
  }

  // Return dynamic YOLO prediction
  res.status(200).json({
    issue,
    confidence
  });
});

// NLP Mock Endpoint
app.post('/predict/text', (req, res) => {
  const { text } = req.body;
  console.log(`[Mock Python API] Received NLP text prediction request: "${text}"`);

  // Detect department and core issue from mock logic
  const content = (text || '').toLowerCase();
  let coreIssue = 'General Civic Concern';
  let department = 'Public Works';
  let priority = 'Medium';
  let summary = `The citizen reports an issue regarding: ${text}`;

  if (content.includes('garbage') || content.includes('waste') || content.includes('trash') || content.includes('dump')) {
    coreIssue = 'Illegal dumping or overflowing garbage bins';
    department = 'Sanitation';
    priority = 'Medium';
    summary = 'Garbage piling up in public street causing sanitation hazard.';
  } else if (content.includes('water') || content.includes('leak') || content.includes('pipe') || content.includes('sewage')) {
    coreIssue = 'Broken water mains or sewage pipe overflow';
    department = 'Water Supply';
    priority = 'High';
    summary = 'Active water leakage detected on local pipeline.';
  } else if (content.includes('light') || content.includes('dark') || content.includes('electricity') || content.includes('wire')) {
    coreIssue = 'Faulty street lamps or loose wiring';
    department = 'Electricity';
    priority = 'Low';
    summary = 'Broken street lights creating unsafe dark zones in neighborhood.';
  } else if (content.includes('pothole') || content.includes('road') || content.includes('street') || content.includes('crack')) {
    coreIssue = 'Damaged asphalt pavement or deep potholes';
    department = 'Public Works';
    priority = content.includes('accident') ? 'High' : 'Medium';
    summary = 'Damaged roadway surface posing hazard to vehicular traffic.';
  }

  res.status(200).json({
    coreIssue,
    department,
    priority,
    summary
  });
});

app.listen(PORT, () => {
  console.log(`[Mock Python API] Simulated YOLOv8/NLP services listening on http://localhost:${PORT}`);
});
