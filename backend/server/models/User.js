const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createTenantModel } = require('../utils/tenantModel');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String
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
  pin: {
    type: String
  },
  rawPin: {
    type: String,
    trim: true
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: [true, 'Role ID is required']
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  hospitalCode: {
    type: String,
    trim: true,
    uppercase: true
  },
  employeeCode: {
    type: String,
    unique: true,
    required: [true, 'Employee code is required'],
    trim: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  
  // Enterprise Multi-Tenancy & Audit Fields
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
  },
  doctorProfile: {
    qualification: { type: String, default: '' },
    specialization: { type: String, default: '' },
    experience: { type: Number, default: 0 },
    consultationFee: { type: Number, default: 500 },
    consultationFees: {
      newConsultation: { type: Number, default: 500 },
      followUp: { type: Number, default: 300 },
      emergency: { type: Number, default: 1000 },
      teleconsultation: { type: Number, default: 400 },
      validityDays: { type: Number, default: 7 }
    },
    prescriptionPrintConfig: {
      headerText: { type: String, default: 'VILLZONE HOSPITAL & HEALTHCARE CENTER' },
      footerText: { type: String, default: 'Thank you for choosing VillZone HIMS. Get well soon!' },
      watermarkText: { type: String, default: 'VILLZONE HIMS' },
      paperSize: { type: String, default: 'A4' },
      showPatientInfo: { type: Boolean, default: true },
      showDiagnosis: { type: Boolean, default: true },
      showMedicines: { type: Boolean, default: true },
      showAdvice: { type: Boolean, default: true },
      showInvestigations: { type: Boolean, default: true },
      showFollowup: { type: Boolean, default: true },
      showClinicalNotes: { type: Boolean, default: true }
    }
  },
  nurseProfile: {
    qualification: { type: String, default: '' },
    assignedWard: { type: String, default: '' }
  },
  pharmacistProfile: {
    licenseNumber: { type: String, default: '' },
    counterNumber: { type: String, default: '' }
  },
  labTechProfile: {
    specialization: { type: String, default: '' },
    licenseNumber: { type: String, default: '' }
  },
  billingProfile: {
    counterNumber: { type: String, default: '' },
    maxDiscountPercent: { type: Number, default: 0 }
  },
  receptionistProfile: {
    deskNumber: { type: String, default: '' }
  }
}, {
  timestamps: true
});

// Compound index to guarantee uniqueness of (countryCode, mobileNumber)
UserSchema.index({ countryCode: 1, mobileNumber: 1 }, { unique: true });

// Pre-save hashing middleware for passwords and PINs
UserSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    const isBcryptHash = /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.password);
    if (!isBcryptHash) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }
  if (this.isModified('pin') && this.pin) {
    const isBcryptHash = /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.pin);
    if (!isBcryptHash) {
      const salt = await bcrypt.genSalt(10);
      this.pin = await bcrypt.hash(this.pin, salt);
    }
  }
  next();
});

// Pre-find hook to automatically filter out soft deleted users
UserSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password || enteredPassword === undefined || enteredPassword === null) return false;
  return await bcrypt.compare(String(enteredPassword), String(this.password));
};

UserSchema.methods.matchPin = async function (enteredPin) {
  if (!this.pin || enteredPin === undefined || enteredPin === null) return false;
  try {
    return await bcrypt.compare(String(enteredPin), String(this.pin));
  } catch (err) {
    return false;
  }
};

module.exports = createTenantModel('User', UserSchema, { centralCollection: 'platform_users', tenantCollection: 'users' });
