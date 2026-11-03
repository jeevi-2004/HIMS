const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const HospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Hospital name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Hospital code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive'],
    default: 'pending'
  },
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  contactCountryCode: {
    type: String,
    required: true,
    default: '+91'
  },
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  // Subscription Plan details
  planName: {
    type: String
  },
  planType: {
    type: String,
    enum: ['Monthly', 'Yearly']
  },
  subscriptionDuration: {
    years: { type: Number, default: 0 },
    months: { type: Number, default: 0 }
  },
  activationDate: {
    type: Date
  },
  defaultBranchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  // Primary Administrator Credentials (for first-time login)
  adminCountryCode: {
    type: String,
    default: '+91'
  },
  adminMobile: {
    type: String
  },
  adminPin: {
    type: String // Hashed PIN
  },
  
  // Extended Metadata for Redesign
  hospitalType: {
    type: String,
    default: 'General'
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  gstNumber: {
    type: String,
    trim: true
  },
  ownerName: {
    type: String,
    trim: true
  },
  ownerCountryCode: {
    type: String,
    default: '+91'
  },
  ownerMobile: {
    type: String,
    trim: true
  },
  databaseName: {
    type: String,
    trim: true
  },
  logo: {
    type: String,
    default: ''
  },
  opdOperationMode: {
    type: String,
    enum: ['TOKEN_ONLY', 'FULL_DIGITAL'],
    default: 'FULL_DIGITAL'
  },
  ipd_requested: {
    type: Boolean,
    default: false
  },
  featureModules: {
    type: Map,
    of: Boolean,
    default: {
      OPD: true,
      Appointments: true,
      IPD: true,
      Billing: true,
      Pharmacy: true,
      digitalPrescription: true,
      doctorConsultationDesk: true,
      voiceAnnouncements: true,
      Branches: false,
      Laboratory: false,
      Radiology: false,
      Inventory: false,
      HRMS: false,
      Finance: false,
      Insurance: false,
      PatientPortal: false
    }
  },
  geolocationSettings: {
    type: Object,
    default: {
      enabled: false,
      latitude: null,
      longitude: null,
      radiusMeters: 300,
      enforceRoles: ['RECEPTIONIST'],
      allowBypassWithPin: true
    }
  },
  billingWorkflowSettings: {
    type: Object,
    default: {
      feeCollectionRole: 'Reception',
      consultationFeeType: 'Predefined',
      paymentTiming: 'Before Consultation',
      collectMedicineInPharmacy: true,
      enableConsolidatedBilling: true,
      prescriptionDelivery: 'internal_pharmacy',
      emergencyQueuePriority: 'OVERRIDE'
    }
  },
  queueRulesSettings: {
    type: Object,
    default: {
      allowWalkInRegistration: true,
      tokenPrefix: 'OP'
    }
  },
  printConfiguration: {
    type: Object,
    default: {
      hospitalLogo: '',
      hospitalName: 'VillZone Multispeciality Hospital',
      registrationNumber: 'REG-TNMC/2026/45879',
      clinicAddress: '124 Healthcare Boulevard, City Center, Main District',
      contactNumber: '+91 98765 43210',
      email: 'contact@villzonehospital.com',
      website: 'www.villzonehospital.com',
      headerTitle: 'VillZone Multispeciality Hospital',
      headerSubtitle: 'Excellence in Enterprise Healthcare',
      headerAlignment: 'Left',
      footerText: 'Thank you for choosing VillZone Hospital. Please follow doctor instructions.',
      footerAlignment: 'Center',
      watermarkEnabled: true,
      watermarkText: 'VILLZONE HIMS',
      watermarkOpacity: '0.15',
      printMode: 'STANDARD',
      paperSize: 'A4',
      orientation: 'Portrait',
      margins: 'Medium',
      sections: {
        patientInfo: true,
        doctorInfo: true,
        diagnosis: true,
        medicines: true,
        investigations: true,
        advice: true,
        followUp: true,
        notes: true,
        vitals: true,
        hospitalHeader: true,
        hospitalFooter: true
      }
    }
  }
}, {
  timestamps: true
});

module.exports = createTenantModel('Hospital', HospitalSchema, { centralCollection: 'hospitals' });
