const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  smtp: {
    host: { type: String, default: '' },
    port: { type: Number, default: 587 },
    user: { type: String, default: '' },
    password: { type: String, default: '' },
    fromEmail: { type: String, default: '' }
  },
  smsGateway: {
    provider: { type: String, default: 'Twilio' },
    apiKey: { type: String, default: '' },
    senderId: { type: String, default: '' }
  },
  whatsApp: {
    token: { type: String, default: '' },
    providerUrl: { type: String, default: '' }
  },
  backup: {
    schedule: { type: String, default: 'Daily' },
    retentionDays: { type: Number, default: 30 }
  },
  timezone: { type: String, default: 'Asia/Kolkata' },
  currency: { type: String, default: 'INR' },
  companyProfile: {
    name: { type: String, default: 'VillZone Software Company' },
    supportEmail: { type: String, default: 'support@villzone.com' },
    logoUrl: { type: String, default: '' }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SystemSetting', SystemSettingSchema);
