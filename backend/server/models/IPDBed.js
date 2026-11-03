const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const IPDBedSchema = new mongoose.Schema({
  bedNumber: {
    type: String,
    required: [true, 'Bed number is required'],
    trim: true
  },
  wardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IPDWard',
    required: true
  },
  roomNumber: {
    type: String,
    trim: true
  },
  bedType: {
    type: String,
    default: 'STANDARD',
    trim: true
  },
  dailyCharge: {
    type: Number,
    default: 0
  },
  equipment: {
    oxygen: { type: Boolean, default: false },
    ventilator: { type: Boolean, default: false },
    cardiacMonitor: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: ['Available', 'Occupied', 'Blocked', 'Cleaning', 'Maintenance'],
    default: 'Available'
  },
  currentAdmissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IPDAdmission'
  },
  notes: {
    type: String,
    trim: true
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

module.exports = createTenantModel('IPDBed', IPDBedSchema);
