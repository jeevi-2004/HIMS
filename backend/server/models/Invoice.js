const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const InvoiceItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 1
  },
  unitPrice: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  }
});

const InvoiceSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: [true, 'Patient reference is required']
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  items: [InvoiceItemSchema],
  totalAmount: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Paid', 'Partially-Paid'],
    default: 'Unpaid'
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Insurance', 'NetBanking', 'N/A'],
    default: 'N/A'
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
InvoiceSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

module.exports = createTenantModel('Invoice', InvoiceSchema);
