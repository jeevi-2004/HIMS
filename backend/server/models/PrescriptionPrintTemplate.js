const mongoose = require('mongoose');

const fieldMappingSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true },
  fieldName: { type: String, required: true },
  section: { type: String, enum: ['HOSPITAL', 'BRANCH', 'PATIENT', 'VISIT', 'CLINICAL', 'PRESCRIPTION', 'DOCTOR'], default: 'PATIENT' },
  x: { type: Number, default: 20 }, // in mm
  y: { type: Number, default: 20 }, // in mm
  width: { type: Number, default: 80 }, // in mm
  height: { type: Number, default: 10 }, // in mm
  fontFamily: { type: String, default: 'Segoe UI' },
  fontSize: { type: Number, default: 12 }, // in pt/px
  fontWeight: { type: String, default: 'normal' }, // 'normal', 'bold', '500', '600', '700'
  fontStyle: { type: String, default: 'normal' }, // 'normal', 'italic'
  textDecoration: { type: String, default: 'none' }, // 'none', 'underline'
  alignment: { type: String, default: 'left' }, // 'left', 'center', 'right'
  color: { type: String, default: '#0f172a' },
  visible: { type: Boolean, default: true }
}, { _id: false });

const prescriptionPrintTemplateSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  name: { type: String, required: true, default: 'General OPD Prescription' },
  description: { type: String, default: 'Default OPD Prescription Print Template' },
  
  mode: { 
    type: String, 
    enum: ['STANDARD', 'PRE_PRINTED'], 
    default: 'STANDARD' 
  },

  // Hospital Pre-Printed Pad Background File
  backgroundFile: { type: String, default: '' },
  backgroundFileType: { type: String, default: '' }, // 'pdf', 'image/png', 'image/jpeg'
  backgroundFileName: { type: String, default: '' },
  backgroundFileSize: { type: Number, default: 0 },
  uploadedAt: { type: Date },

  // Paper & Print Settings
  paperSize: { type: String, enum: ['A4', 'A5', 'Letter', 'Custom'], default: 'A4' },
  orientation: { type: String, enum: ['Portrait', 'Landscape'], default: 'Portrait' },
  margins: { type: String, enum: ['None', 'Small', 'Medium', 'Large'], default: 'Medium' },
  scale: { type: Number, default: 100 },
  customWidth: { type: Number, default: 210 }, // in mm
  customHeight: { type: Number, default: 297 }, // in mm

  // Dynamic Field Overlay Mappings (Pre-Printed Pad Mode)
  fieldMappings: {
    type: [fieldMappingSchema],
    default: []
  },

  // Special Prescription Medicine Table Component Config
  medicineTableConfig: {
    type: Object,
    default: {
      x: 20,
      y: 120,
      width: 170,
      height: 100,
      columns: {
        medicineName: { visible: true, label: 'Medicine Name', width: 35 },
        dosage: { visible: true, label: 'Dosage', width: 15 },
        frequency: { visible: true, label: 'Frequency', width: 15 },
        duration: { visible: true, label: 'Duration', width: 15 },
        foodTiming: { visible: true, label: 'Food Timing', width: 20 },
        instructions: { visible: false, label: 'Instructions', width: 20 }
      },
      fontSize: 11,
      rowHeight: 24,
      showHeader: true,
      maxRows: 10,
      showLines: true
    }
  },

  // Standard VillZone Mode Configuration
  standardConfig: {
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
  },

  // Print Hardware Alignment Calibration Offsets
  calibration: {
    topOffset: { type: Number, default: 0 }, // in mm
    leftOffset: { type: Number, default: 0 }, // in mm
    scale: { type: Number, default: 100 }
  },

  version: { type: Number, default: 1 },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED', 'DRAFT'], default: 'ACTIVE' },
  isDefault: { type: Boolean, default: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('PrescriptionPrintTemplate', prescriptionPrintTemplateSchema);
