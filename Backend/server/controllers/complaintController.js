const complaintService = require('../services/complaintService');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/userModel');
const aiService = require('../services/aiService');
const { sendSuccess } = require('../utils/responseFormatter');

// Helper to extract uploaded file path
const getUploadedFilePath = (req, fieldName) => {
  if (req.file && req.file.fieldname === fieldName) {
    return `uploads/${req.file.filename}`;
  }
  if (req.files && req.files[fieldName] && req.files[fieldName][0]) {
    return `uploads/${req.files[fieldName][0].filename}`;
  }
  return null;
};

// @desc    Create a new complaint
// @route   POST /api/complaints
// @access  Private (Citizen)
const createComplaint = asyncHandler(async (req, res) => {
  const { title, description, department, latitude, longitude, address, priority } = req.body;

  // Build complaint data
  const complaintData = {
    title,
    description,
    department,
    citizen: req.user._id,
  };

  // Handle latitude, longitude, and address fallbacks seamlessly
  const reqLat = req.body.latitude || req.body.lat;
  const reqLng = req.body.longitude || req.body.lng;
  const reqAddr = req.body.address || req.body.location;

  if (priority) complaintData.priority = priority;
  if (reqAddr) complaintData.address = reqAddr;
  if (reqLat !== undefined && reqLat !== null && reqLat !== '') {
    complaintData.latitude = Number(reqLat);
  }
  if (reqLng !== undefined && reqLng !== null && reqLng !== '') {
    complaintData.longitude = Number(reqLng);
  }

  // Handle uploaded beforeImage
  const beforeImagePath = getUploadedFilePath(req, 'beforeImage');
  if (beforeImagePath) {
    complaintData.beforeImage = beforeImagePath;
  }

  // Check if description consists only of spaces, dots, or special characters (no letters or numbers)
  const isDescSpecial = !description || typeof description !== 'string' || !/[\p{L}\p{N}]/u.test(description);
  let resolvedDescription = description;

  if (isDescSpecial) {
    if (beforeImagePath) {
      console.log('Description contains only spaces, dots, or special characters. Retrieving AI visual description context...');
      resolvedDescription = await aiService.getVisualDescription(beforeImagePath);
      if (!resolvedDescription) {
        resolvedDescription = 'Civic issue reported via image analysis.';
      }
    } else {
      resolvedDescription = 'Civic issue reported.';
    }
    complaintData.description = resolvedDescription;
  }

  // Invoke AI Services (YOLOv8 and NLP APIs) with retry handling and fallbacks
  console.log('Initiating backend AI prediction pipeline...');
  const aiPrediction = await aiService.analyzeComplaint(beforeImagePath, resolvedDescription || title);
  
  complaintData.aiPrediction = aiPrediction;

  // Overwrite or fallback department and priority based on AI recommendations if not provided or set to General
  if (aiPrediction.department) {
    if (!complaintData.department || complaintData.department === 'Other') {
      complaintData.department = aiPrediction.department;
    }
  }
  if (aiPrediction.priority && !complaintData.priority) {
    complaintData.priority = aiPrediction.priority;
  }

  const complaint = await complaintService.createComplaint(complaintData);

  return sendSuccess(res, complaint, 201, 'Complaint created successfully');
});

// @desc    Get all complaints (Citizen gets own, Admin/Officer gets all)
// @route   GET /api/complaints
// @access  Private
const getComplaints = asyncHandler(async (req, res) => {
  const filter = {};

  // If user is a Citizen, restrict to their own complaints
  if (req.user.role === 'Citizen') {
    filter.citizen = req.user._id;
  } else if (req.user.role === 'Officer') {
    // Officers see complaints assigned to them
    filter.assignedOfficer = req.user._id;
  } else {
    // For HeadOfficer/Admin, allow filtering by status, department, priority, assignedOfficer
    const { status, department, priority, assignedOfficer } = req.query;
    if (status) filter.status = status;
    if (department) filter.department = department;
    if (priority) filter.priority = priority;
    if (assignedOfficer) filter.assignedOfficer = assignedOfficer;
  }

  const { complaints, pagination } = await complaintService.getComplaints(filter, req.query);

  return sendSuccess(res, complaints, 200, 'Complaints retrieved successfully', pagination);
});

// @desc    Get single complaint by ID
// @route   GET /api/complaints/:id
// @access  Private
const getComplaintById = asyncHandler(async (req, res) => {
  const complaint = await complaintService.getComplaintById(req.params.id);

  if (!complaint) {
    res.status(404);
    throw new Error('Complaint not found');
  }

  // Authorization Check: Citizen can only view their own complaints
  if (req.user.role === 'Citizen' && complaint.citizen._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this complaint');
  }

  res.status(200).json({
    success: true,
    data: complaint,
  });
});

// @desc    Update complaint details or status
// @route   PUT /api/complaints/:id
// @access  Private
const updateComplaint = asyncHandler(async (req, res) => {
  let complaint = await complaintService.getComplaintById(req.params.id);

  if (!complaint) {
    res.status(404);
    throw new Error('Complaint not found');
  }

  const updateData = {};

  if (req.user.role === 'Citizen') {
    // Citizen Authorization check: Must own the complaint
    if (complaint.citizen._id.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to update this complaint');
    }

    // Citizens cannot change status or assignment
    const forbiddenCitizenFields = ['status', 'assignedOfficer', 'priority', 'aiPrediction', 'afterImage'];
    for (const field of forbiddenCitizenFields) {
      if (req.body[field] !== undefined) {
        res.status(403);
        throw new Error(`Citizens are not authorized to update ${field}`);
      }
    }

    // Citizen can only update if status is Pending
    if (complaint.status !== 'Pending') {
      res.status(400);
      throw new Error(`Cannot update complaint once it has been processed (current status is ${complaint.status})`);
    }

    // Citizen can update these fields:
    const { title, description, department, latitude, longitude, address } = req.body;
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (department) updateData.department = department;
    if (address) updateData.address = address;
    if (latitude !== undefined && latitude !== null && latitude !== '') {
      updateData.latitude = Number(latitude);
    }
    if (longitude !== undefined && longitude !== null && longitude !== '') {
      updateData.longitude = Number(longitude);
    }

    // Citizen updates beforeImage
    const beforeImagePath = getUploadedFilePath(req, 'beforeImage');
    if (beforeImagePath) {
      updateData.beforeImage = beforeImagePath;
    }

  } else if (req.user.role === 'Officer') {
    // Officers can only update status (and upload afterImage)
    const { status } = req.body;
    if (status) updateData.status = status;

    const afterImagePath = getUploadedFilePath(req, 'afterImage');
    if (afterImagePath) {
      updateData.afterImage = afterImagePath;
    }

    // Block editing other fields for standard Officer role
    const forbiddenOfficerFields = ['title', 'description', 'department', 'priority', 'assignedOfficer', 'aiPrediction', 'beforeImage'];
    for (const field of forbiddenOfficerFields) {
      if (req.body[field] !== undefined) {
        res.status(403);
        throw new Error(`Officers are not authorized to update ${field}`);
      }
    }
  } else {
    // HeadOfficer, or Admin can update: status, priority, assignedOfficer, aiPrediction, afterImage
    const { status, priority, assignedOfficer, aiPrediction } = req.body;

    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assignedOfficer) {
      // Validate assignedOfficer user role is Officer or HeadOfficer
      const officerUser = await User.findById(assignedOfficer);
      if (!officerUser || (officerUser.role !== 'Officer' && officerUser.role !== 'HeadOfficer')) {
        res.status(400);
        throw new Error('Assigned officer must be a valid User with role Officer or HeadOfficer');
      }
      updateData.assignedOfficer = assignedOfficer;
    }
    
    if (aiPrediction) {
      try {
        updateData.aiPrediction = typeof aiPrediction === 'string'
          ? JSON.parse(aiPrediction)
          : aiPrediction;
      } catch (e) {
        updateData.aiPrediction = { raw: aiPrediction };
      }
    }

    // HeadOfficer/Admin uploads afterImage
    const afterImagePath = getUploadedFilePath(req, 'afterImage');
    if (afterImagePath) {
      updateData.afterImage = afterImagePath;
    }
  }

  // Perform update
  const updatedComplaint = await complaintService.updateComplaint(req.params.id, updateData);

  res.status(200).json({
    success: true,
    message: 'Complaint updated successfully',
    data: updatedComplaint,
  });
});

// @desc    Delete a complaint
// @route   DELETE /api/complaints/:id
// @access  Private (Admin only)
const deleteComplaint = asyncHandler(async (req, res) => {
  // Only Admins can delete complaints
  if (req.user.role !== 'Admin') {
    res.status(403);
    throw new Error('Not authorized. Only Admins can delete complaints');
  }

  const complaint = await complaintService.getComplaintById(req.params.id);

  if (!complaint) {
    res.status(404);
    throw new Error('Complaint not found');
  }

  await complaintService.deleteComplaint(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Complaint deleted successfully',
  });
});

module.exports = {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateComplaint,
  deleteComplaint,
};
