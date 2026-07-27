const mongoose = require('mongoose');

// Helper to validate mongoose ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Validate Complaint Creation Payload
 */
const validateCreateComplaint = (req, res, next) => {
  const { title, description, department, latitude, longitude } = req.body;

  const errors = [];

  if (!title || typeof title !== 'string' || title.trim() === '') {
    errors.push('Title is required and must be a non-empty string');
  } else if (title.length > 100) {
    errors.push('Title cannot exceed 100 characters');
  }

  const hasImage = !!(req.file || (req.files && Object.keys(req.files).length > 0));
  const isDescEmpty = !description || typeof description !== 'string' || description.trim() === '';

  if (isDescEmpty && !hasImage) {
    errors.push('Description is required and must be a non-empty string');
  }

  if (!department || typeof department !== 'string' || department.trim() === '') {
    errors.push('Department is required and must be a non-empty string');
  }

  if (latitude !== undefined && latitude !== null && latitude !== '') {
    const lat = Number(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('Latitude must be a valid number between -90 and 90');
    }
  }

  if (longitude !== undefined && longitude !== null && longitude !== '') {
    const lng = Number(longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push('Longitude must be a valid number between -180 and 180');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Validate Complaint Update Payload
 */
const validateUpdateComplaint = (req, res, next) => {
  const { status, priority, assignedOfficer, latitude, longitude } = req.body;
  const errors = [];

  if (status !== undefined) {
    const validStatuses = ['Pending', 'Assigned', 'Accepted', 'In Progress', 'Completed', 'Rejected'];
    if (!validStatuses.includes(status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  if (priority !== undefined) {
    const validPriorities = ['Low', 'Medium', 'High'];
    if (!validPriorities.includes(priority)) {
      errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
    }
  }

  if (assignedOfficer !== undefined && assignedOfficer !== null && assignedOfficer !== '') {
    if (!isValidObjectId(assignedOfficer)) {
      errors.push('Assigned officer must be a valid MongoDB ObjectId');
    }
  }

  if (latitude !== undefined && latitude !== null && latitude !== '') {
    const lat = Number(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('Latitude must be a valid number between -90 and 90');
    }
  }

  if (longitude !== undefined && longitude !== null && longitude !== '') {
    const lng = Number(longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push('Longitude must be a valid number between -180 and 180');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

module.exports = {
  validateCreateComplaint,
  validateUpdateComplaint,
};
