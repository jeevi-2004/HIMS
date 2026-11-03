const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const IPDWardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Ward name is required'],
    trim: true
  },
  code: {
    type: String,
    trim: true,
    uppercase: true
  },
  type: {
    type: String,
    default: 'GENERAL',
    trim: true
  },
  building: {
    type: String,
    trim: true
  },
  floor: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  baseCharges: {
    type: Number,
    default: 0
  },
  dailyBaseRate: {
    type: Number,
    default: 0
  },
  nursingRate: {
    type: Number,
    default: 0
  },
  // Enterprise Multi-Tenancy & Audit Fields
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = createTenantModel('IPDWard', IPDWardSchema);
