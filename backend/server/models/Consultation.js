const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const ConsultationSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: [true, 'Appointment reference is required']
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
  diagnosis: {
    type: String,
    required: [true, 'Diagnosis is required'],
    trim: true
  },
  clinicalNotes: {
    type: String,
    trim: true
  },
  advice: {
    type: String,
    trim: true
  },
  followupDate: {
    type: Date
  },
  // Detailed OPD Workflow Fields
  chiefComplaint: String,
  historyOfPresentIllness: String,
  examinationFindings: String,
  painScale: Number,
  symptoms: String,
  vitals: {
    bpSystolic: String,
    bpDiastolic: String,
    pulse: String,
    temperature: String,
    RR: String,
    weight: String,
    height: String,
    spo2: String
  },
  primaryDiagnosis: String,
  diagnoses: [String],
  secondaryDiagnosis: String,
  icd10Code: String,
  clinicalImpression: String,
  differentialDiagnosis: String,
  assessmentNotes: String,
  diagnosisStatus: {
    type: String,
    default: 'Provisional'
  },
  status: {
    type: String,
    enum: ['active', 'past', 'COMPLETED', 'Completed', 'IN_PROGRESS', 'DRAFT'],
    default: 'COMPLETED',
    index: true
  },
  dietAdvice: String,
  exerciseAdvice: String,
  restrictions: String,
  generalInstructions: String,
  returnPrecautions: String,
  patientEducation: String,
  followupRequired: {
    type: Boolean,
    default: false
  },
  followupTime: String,
  followupReason: String,
  followupPriority: {
    type: String,
    enum: ['Routine', 'Urgent', 'Emergency'],
    default: 'Routine'
  },
  documents: [{
    name: String,
    fileType: String,
    data: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
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
ConsultationSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

module.exports = createTenantModel('Consultation', ConsultationSchema);
