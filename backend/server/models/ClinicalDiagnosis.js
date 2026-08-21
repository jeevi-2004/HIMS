const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const ClinicalDiagnosisSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Diagnosis name is required'],
    trim: true
  },
  normalizedName: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true
  },
  icd10Code: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    default: 'General Medicine',
    trim: true
  },
  template: {
    symptoms: [{ type: String, trim: true }],
    medicines: [{
      name: String,
      dosage: String,
      duration: String,
      frequency: String,
      foodInstruction: String
    }],
    advice: [{ type: String, trim: true }],
    followupDuration: { type: String, default: '3 Days' },
    investigations: [{ type: String, trim: true }],
    notes: { type: String, default: '' }
  },
  source: {
    type: String,
    enum: ['SYSTEM', 'DOCTOR_ADDED'],
    default: 'DOCTOR_ADDED'
  },
  frequentlyUsed: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
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

module.exports = createTenantModel('ClinicalDiagnosis', ClinicalDiagnosisSchema);
