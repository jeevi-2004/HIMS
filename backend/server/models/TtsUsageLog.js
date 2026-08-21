const mongoose = require('mongoose');

const TtsUsageLogSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: false
  },
  provider: {
    type: String,
    enum: ['sarvam', 'azure', 'google', 'browser'],
    required: true,
    default: 'sarvam'
  },
  language: {
    type: String,
    default: 'ta-IN'
  },
  voiceId: {
    type: String,
    default: 'ananya'
  },
  characterCount: {
    type: Number,
    required: true,
    default: 0
  },
  announcementCount: {
    type: Number,
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for fast multi-tenant usage reporting per hospital
TtsUsageLogSchema.index({ hospitalId: 1, provider: 1, createdAt: -1 });

module.exports = mongoose.model('TtsUsageLog', TtsUsageLogSchema);
