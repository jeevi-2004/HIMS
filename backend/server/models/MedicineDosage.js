const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const MedicineDosageSchema = new mongoose.Schema({
  val: {
    type: String,
    required: [true, 'Dosage value is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
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

module.exports = createTenantModel('MedicineDosage', MedicineDosageSchema);
