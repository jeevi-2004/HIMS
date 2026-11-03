const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const PatientContactSchema = new mongoose.Schema({
  name: String,
  relationship: String,
  phone: String
});

const PatientAddressSchema = new mongoose.Schema({
  street: String,
  city: String,
  state: String,
  zip: String,
  country: { type: String, default: 'India' }
});

const PatientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true
  },
  uhid: {
    type: String,
    required: [true, 'UHID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [0, 'Age cannot be negative'],
    max: [120, 'Age cannot exceed 120']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Gender is required']
  },
  bloodGroup: {
    type: String,
    trim: true
  },
  countryCode: {
    type: String,
    required: true,
    default: '+91'
  },
  mobileNumber: {
    type: String,
    required: [true, 'Mobile number is required'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  alternativeMobile: {
    type: String,
    trim: true
  },
  dob: {
    type: Date
  },
  aadhaarNumber: {
    type: String,
    trim: true
  },
  occupation: {
    type: String,
    trim: true
  },
  maritalStatus: {
    type: String,
    trim: true
  },
  medicalAlerts: {
    type: String,
    trim: true
  },
  diagnosis: {
    type: String,
    trim: true
  },
  allergies: [{
    type: String,
    trim: true
  }],
  contacts: [PatientContactSchema],
  addresses: [PatientAddressSchema],
  address: {
    type: String,
    trim: true
  },
  isProfileCompleted: {
    type: Boolean,
    default: false
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
PatientSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

// Compound index to guarantee uniqueness of (countryCode, mobileNumber)
PatientSchema.index({ countryCode: 1, mobileNumber: 1 }, { unique: true });

module.exports = createTenantModel('Patient', PatientSchema);
