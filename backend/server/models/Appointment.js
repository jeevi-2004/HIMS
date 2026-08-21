const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const AppointmentSchema = new mongoose.Schema({
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
  date: {
    type: Date,
    required: [true, 'Appointment date is required']
  },
  time: {
    type: String,
    required: [true, 'Time slot is required']
  },
  status: {
    type: String,
    enum: ['Scheduled', 'Waiting', 'Called', 'Admitted', 'In Consultation', 'In-Consultation', 'Sent to Pharmacy', 'Sent To Pharmacy', 'SENT_TO_PHARMACY', 'Dispensing', 'Dispensed', 'Completed', 'Cancelled', 'Skipped', 'Emergency', 'No Show', 'NO_SHOW'],
    default: 'Waiting'
  },
  queueStatus: {
    type: String,
    enum: ['Scheduled', 'Waiting', 'Called', 'Admitted', 'In Consultation', 'In-Consultation', 'Sent to Pharmacy', 'Sent To Pharmacy', 'SENT_TO_PHARMACY', 'Dispensing', 'Dispensed', 'Completed', 'Skipped', 'Cancelled', 'Emergency', 'No Show', 'NO_SHOW'],
    default: 'Waiting'
  },
  billingStatus: {
    type: String,
    enum: ['Unpaid', 'Paid', 'Partial', 'Exempt', 'Refunded'],
    default: 'Unpaid'
  },
  pharmacyStatus: {
    type: String,
    enum: ['Pending', 'SENT', 'DISPENSING', 'DISPENSED', 'Cancelled'],
    default: 'Pending'
  },
  tokenNumber: {
    type: String,
    trim: true
  },
  consultationType: {
    type: String,
    enum: ['Walk-In', 'Appointment', 'Emergency', 'Follow-Up'],
    default: 'Walk-In'
  },
  consultationFee: {
    type: Number,
    default: 500
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'UPI', 'Card', 'Credit'],
    default: 'Cash'
  },
  chiefComplaint: {
    type: String
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['NORMAL', 'EMERGENCY'],
    default: 'NORMAL'
  },
  tokenType: {
    type: String,
    enum: ['NORMAL', 'EMERGENCY'],
    default: 'NORMAL'
  },
  queueType: {
    type: String,
    enum: ['NORMAL', 'EMERGENCY'],
    default: 'NORMAL'
  },
  
  // Vitals entry from reception / intake nurse
  vitals: {
    weight: Number, // in kg
    height: Number, // in cm
    bpSystolic: Number, // mmHg
    bpDiastolic: Number, // mmHg
    pulse: Number, // bpm
    temperature: Number, // Fahrenheit
    spo2: Number, // %
    bloodSugar: Number, // mg/dL
    bmi: Number,
    remarks: String
  },

  // Centralized Workflow State Engine (Phase 1)
  workflow: {
    queueState: {
      type: String,
      enum: ['WAITING', 'READY', 'CALLED', 'IN_CONSULTATION', 'CONSULTATION_COMPLETED', 'SENT_TO_PHARMACY', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW'],
      default: 'WAITING'
    },
    paymentState: {
      type: String,
      enum: ['PENDING', 'PARTIAL', 'PAID', 'EXEMPT', 'REFUNDED'],
      default: 'PENDING'
    },
    consultationState: {
      type: String,
      enum: ['NOT_STARTED', 'STARTED', 'COMPLETED'],
      default: 'NOT_STARTED'
    },
    pharmacyState: {
      type: String,
      enum: ['NOT_REQUIRED', 'WAITING', 'DISPENSING', 'DISPENSED'],
      default: 'NOT_REQUIRED'
    },
    billingState: {
      type: String,
      enum: ['NOT_GENERATED', 'GENERATED', 'PARTIAL', 'PAID'],
      default: 'NOT_GENERATED'
    },
    timestamps: {
      tokenGeneratedAt: { type: Date, default: Date.now },
      paymentCompletedAt: Date,
      calledAt: Date,
      consultationStartedAt: Date,
      consultationCompletedAt: Date,
      pharmacyStartedAt: Date,
      pharmacyCompletedAt: Date,
      completedAt: Date
    }
  },
  workflowMetadata: {
    calledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    consultationStartedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    consultationCompletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pharmacyDispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    priorityOverride: { type: Boolean, default: false },
    priorityReason: String
  },
  
  // Encounter Snapshot Billing Policy (Encounter Stability Guard)
  billingPolicySnapshot: {
    consultationFeeType: String,
    feeCollectionRole: String,
    paymentTiming: String,
    capturedAt: { type: Date, default: Date.now }
  },
  workflowHistory: [{
    fromState: String,
    toState: String,
    stateType: {
      type: String,
      enum: ['queueState', 'paymentState', 'consultationState', 'pharmacyState', 'billingState']
    },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedByName: String,
    changedByRole: String,
    timestamp: { type: Date, default: Date.now },
    note: String
  }],

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
AppointmentSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

module.exports = createTenantModel('Appointment', AppointmentSchema);
