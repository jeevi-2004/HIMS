const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const RoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    trim: true
  },
  permissions: [{
    type: String, // Stored as keys, e.g., 'opd:view', 'hospital:create'
    trim: true
  }]
}, {
  timestamps: true
});

module.exports = createTenantModel('Role', RoleSchema);
