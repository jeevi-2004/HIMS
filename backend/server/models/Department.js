const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const DepartmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Department code is required'],
    unique: true,
    trim: true,
    uppercase: true
  }
}, {
  timestamps: true
});

module.exports = createTenantModel('Department', DepartmentSchema);
