const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const AuditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true, // e.g., 'CREATE_HOSPITAL', 'UPDATE_USER'
    trim: true
  },
  module: {
    type: String,
    required: true, // e.g., 'ORGANIZATION', 'USER', 'AUTHENTICATION'
    trim: true,
    uppercase: true
  },
  details: {
    type: mongoose.Schema.Types.Map,
    of: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

module.exports = createTenantModel('AuditLog', AuditLogSchema);
