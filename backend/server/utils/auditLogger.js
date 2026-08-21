const AuditLog = require('../models/AuditLog');

/**
 * Log action to the AuditLog collection
 * @param {string} userId - User performing the action
 * @param {string} action - Action name (e.g., 'CREATE_HOSPITAL', 'USER_LOGIN')
 * @param {string} module - Application module (e.g., 'HOSPITAL', 'AUTH')
 * @param {Object} details - Contextual details of the action
 * @param {Object} req - Express request object to extract IP address
 */
const logAudit = async (userId, action, module, details, req) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip) : 'unknown';
    
    await AuditLog.create({
      userId,
      action,
      module,
      details,
      ipAddress
    });
  } catch (error) {
    console.error('Audit Logging Error:', error);
  }
};

module.exports = logAudit;
