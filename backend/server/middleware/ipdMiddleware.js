const { isIpdAvailable } = require('../utils/featureUtils');

/**
 * Middleware to check if IPD is available for the current hospital.
 * Uses the hospital information populated on req.user.
 */
const requireIPD = (req, res, next) => {
  // Ensure we have hospital context
  if (!req.hospital && (!req.user || !req.user.hospital)) {
    return res.status(403).json({ success: false, message: 'Hospital context missing' });
  }

  const hospitalObj = req.hospital || req.user.hospital;

  if (!isIpdAvailable(hospitalObj)) {
    return res.status(403).json({ success: false, message: 'In-Patient Department (IPD) is not enabled for this hospital' });
  }

  next();
};

module.exports = {
  requireIPD
};
