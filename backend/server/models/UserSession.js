const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const UserSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    index: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

module.exports = createTenantModel('UserSession', UserSessionSchema);
