const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const PharmacyBillItemSchema = new mongoose.Schema({
  medicineName: {
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
    required: true,
    default: 0
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  }
});

const PharmacyBillSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    required: true,
    unique: true
  },
  consultationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  prescriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prescription',
    required: true
  },
  medicines: [PharmacyBillItemSchema],
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  gst: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    required: true,
    default: 0
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'UPI', 'Card', 'Credit'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Unpaid'],
    required: true,
    default: 'Paid'
  },
  dueAmount: {
    type: Number,
    default: 0
  },
  dueDate: {
    type: Date
  },
  creditRemarks: {
    type: String,
    trim: true
  },
  collectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collectedAt: {
    type: Date,
    default: Date.now
  },
  receiptNumber: String,
  invoiceNumber: String,
  printedAt: Date,

  // Multi-Tenancy
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Soft Delete filter
PharmacyBillSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

module.exports = createTenantModel('PharmacyBill', PharmacyBillSchema);
