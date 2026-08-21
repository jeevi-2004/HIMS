const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const MedicineFrequencySchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Frequency code is required'],
    trim: true,
    uppercase: true
  },
  englishName: {
    type: String,
    required: [true, 'English name is required'],
    trim: true
  },
  explanation: {
    type: String,
    required: [true, 'Explanation is required'],
    trim: true
  },
  gridPattern: {
    type: String,
    required: [true, 'Grid pattern is required'],
    unique: true,
    trim: true,
    uppercase: true
  },

  // Enterprise Multi-Tenancy & Audit Fields
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
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
  }
}, {
  timestamps: true
});

module.exports = createTenantModel('MedicineFrequency', MedicineFrequencySchema);
