const mongoose = require('mongoose');

const LicenseSchema = new mongoose.Schema({
  licenseKey: {
    type: String,
    required: [true, 'License key is required'],
    unique: true,
    trim: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'Hospital reference is required']
  },
  activationDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('License', LicenseSchema);
