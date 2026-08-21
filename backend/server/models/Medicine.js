const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const MedicineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Medicine name is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  },
  stock: {
    type: Number,
    default: 0
  },
  unitPrice: {
    type: Number,
    required: [true, 'Unit price is required']
  },
  rackNo: {
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

module.exports = createTenantModel('Medicine', MedicineSchema);
