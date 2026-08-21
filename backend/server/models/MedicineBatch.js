const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const MedicineBatchSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: [true, 'Medicine reference is required']
  },
  batchCode: {
    type: String,
    required: [true, 'Batch code is required'],
    trim: true,
    uppercase: true
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  stock: {
    type: Number,
    required: [true, 'Batch stock quantity is required'],
    default: 0
  },
  unitPrice: {
    type: Number,
    required: [true, 'Batch unit price is required']
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
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Soft Delete filter
MedicineBatchSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

module.exports = createTenantModel('MedicineBatch', MedicineBatchSchema);
