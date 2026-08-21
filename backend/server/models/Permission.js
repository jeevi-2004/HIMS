const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const PermissionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Permission name is required'],
    unique: true,
    trim: true
  },
  module: {
    type: String,
    required: [true, 'Module name is required'],
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = createTenantModel('Permission', PermissionSchema);
