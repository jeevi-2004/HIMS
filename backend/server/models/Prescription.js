const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const PrescriptionItemSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: false,
    default: null
  },
  medicineName: {
    type: String,
    required: [true, 'Medicine name is required']
  },
  dosage: String, // e.g. 500mg
  frequency: String, // e.g. 1-0-1, Once Daily
  duration: String, // e.g. 5 Days
  instructions: String, // e.g. After Food
  foodTiming: String,
  morning: String,
  afternoon: String,
  night: String,
  genericName: String,
  strength: String,
  route: String,
  quantity: {
    type: Number,
    default: 1
  },
  notes: String,
  dispensingStatus: {
    type: String,
    enum: ['Pending', 'Dispensed', 'Out of Stock'],
    default: 'Pending'
  },
  pharmacistNotes: String,
  substituteMedicine: String
});

const PrescriptionSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: false
  },
  admissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IPDAdmission',
    required: false
  },
  isIpd: {
    type: Boolean,
    default: false,
    index: true
  },
  consultationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation',
    required: [true, 'Consultation reference is required']
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: [true, 'Patient reference is required']
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Doctor reference is required']
  },
  tokenNumber: {
    type: String,
    trim: true,
    default: ''
  },
  items: [PrescriptionItemSchema],
  status: {
    type: String,
    enum: ['Pending', 'Sent to Pharmacy', 'Dispensing', 'In Progress', 'Waiting Payment', 'Paid', 'Completed', 'Dispensed', 'Partially Dispensed', 'Cancelled'],
    default: 'Pending'
  },
  dispensedAt: Date,
  dispensedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Paid'],
    default: 'Unpaid'
  },
  paidAt: Date,
  stockDeducted: {
    type: Boolean,
    default: false
  },
  completedAt: Date,
  generalRemarks: String,
  deliveredBy: String,
  counselingChecklist: {
    dosageExplained: { type: Boolean, default: false },
    foodTimingExplained: { type: Boolean, default: false },
    durationExplained: { type: Boolean, default: false }
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
PrescriptionSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

module.exports = createTenantModel('Prescription', PrescriptionSchema);
