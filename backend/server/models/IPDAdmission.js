const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const IPDAdmissionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  admissionId: {
    type: String, // E.g., IPD-2026-0001
    required: true,
    unique: true
  },
  bedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IPDBed'
  },
  attendingDoctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  visitedDoctorIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  admissionDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  expectedDischargeDate: {
    type: Date
  },
  dischargeDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Admitted', 'Discharged', 'Transferred', 'Deceased', 'Cancelled'],
    default: 'Admitted'
  },
  queueStatus: {
    type: String,
    enum: ['Waiting', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Waiting'
  },
  consultationStatus: {
    type: String,
    enum: ['Waiting', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Waiting'
  },
  consultationFinished: {
    type: Boolean,
    default: false
  },
  consultationCompletedAt: {
    type: Date
  },
  reasonForAdmission: {
    type: String,
    required: false,
    default: 'Clinical observation and inpatient care'
  },
  admissionNotes: {
    type: String
  },
  vitals: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  dischargeSummary: {
    type: String
  },
  treatmentSummary: {
    type: String
  },
  finalDiagnosis: {
    type: String
  },
  dischargeCondition: {
    type: String,
    default: 'Stable / Recovered'
  },
  dischargeInstructions: {
    type: String
  },
  dischargeTime: {
    type: String
  },
  dischargeType: {
    type: String,
    default: 'Routine Discharge'
  },
  nextReviewDate: {
    type: Date
  },
  followupAdvice: {
    type: String
  },
  referralDetails: {
    type: String
  },
  dischargeSummaryStatus: {
    type: String,
    enum: ['Draft', 'Sent to Reception', 'Completed'],
    default: 'Draft'
  },
  dischargeMedicines: [{
    medicineName: { type: String },
    dosage: { type: String },
    duration: { type: String }
  }],
  clinicalDischargeSummary: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  admissionType: {
    type: String,
    default: 'Routine Admission'
  },
  admissionTime: {
    type: String
  },
  amountMode: {
    type: String,
    default: 'Cash'
  },
  amountPaid: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Partially Paid', 'Pending', 'Unpaid'],
    default: 'Paid'
  },
  clinicalWorkload: {
    doctorRounds: { type: Number, default: 0 },
    labTests: { type: Number, default: 0 },
    imagingScans: { type: Number, default: 0 },
    medsPrescribed: { type: Number, default: 0 }
  },
  billingDetails: {
    bedCharges: { type: Number, default: 0 },
    consultationCharges: { type: Number, default: 0 },
    nursingCharges: { type: Number, default: 0 },
    procedureCharges: { type: Number, default: 0 },
    labCharges: { type: Number, default: 0 },
    medicationCharges: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    totalBill: { type: Number, default: 0 },
    dailyRate: { type: Number, default: 0 },
    chargeableDays: { type: Number, default: 1 },
    isCustomized: { type: Boolean, default: false },
    adjustments: [{
      chargeType: { type: String },
      previousAmount: { type: Number },
      newAmount: { type: Number },
      reason: { type: String },
      adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      adjustedAt: { type: Date, default: Date.now }
    }],
    paymentTransactions: [{
      amount: { type: Number },
      paymentMode: { type: String },
      referenceNo: { type: String },
      notes: { type: String },
      paymentType: { type: String, default: 'Interim Payment' },
      receiptNumber: { type: String },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }],
    billingItems: [{
      serviceCategory: {
        type: String,
        default: 'Other'
      },
      serviceName: { type: String, required: true },
      description: { type: String, default: '' },
      quantity: { type: Number, default: 1 },
      unitPrice: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
      dateTime: { type: Date, default: Date.now },
      status: { type: String, default: 'Added to Bill' },
      isManual: { type: Boolean, default: true },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }],
    settlementException: {
      allowed: { type: Boolean, default: false },
      reason: { type: String },
      authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      authorizedAt: { type: Date }
    }
  },
  // IPD Daily Consultation & Clinical Reviews (Chronological Daily Reviews)
  dailyReviews: [{
    dayNumber: { type: Number },
    reviewDate: { type: Date, default: Date.now },
    reviewTime: { type: String },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    doctorName: { type: String },
    chiefComplaints: { type: String },
    vitals: {
      bp: { type: String },
      pulse: { type: String },
      temperature: { type: String },
      spo2: { type: String }
    },
    clinicalFindings: { type: String },
    examinationFindings: { type: String },
    generalCondition: { type: String, default: 'Stable' },
    consciousnessLevel: { type: String, default: 'Alert' },
    painScore: { type: String, default: '2' },
    diagnosis: { type: String },
    assessment: { type: String },
    assessmentPlan: { type: String },
    treatmentPlan: { type: String },
    statusBadge: { type: String, default: 'Symptoms improving' },
    prescriptions: [{
      medicineName: { type: String },
      dose: { type: String },
      route: { type: String, default: 'Oral' },
      frequency: { type: String, default: 'Once daily' },
      duration: { type: String, default: '3 days' },
      instructions: { type: String, default: 'After food' },
      quantity: { type: Number, default: 1 },
      pharmacyStatus: { type: String, enum: ['Pending', 'Sent to Pharmacy', 'Dispensed'], default: 'Pending' }
    }],
    investigations: [{
      serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
      name: { type: String },
      code: { type: String },
      serviceType: { type: String },
      category: { type: String },
      price: { type: Number, default: 0 },
      notes: { type: String }
    }],
    isDraft: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
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

IPDAdmissionSchema.index({ hospitalId: 1, admissionDate: -1, isActive: 1 });
IPDAdmissionSchema.index({ hospitalId: 1, queueStatus: 1, isActive: 1 });
IPDAdmissionSchema.index({ hospitalId: 1, patientId: 1, status: 1 });

module.exports = createTenantModel('IPDAdmission', IPDAdmissionSchema);
