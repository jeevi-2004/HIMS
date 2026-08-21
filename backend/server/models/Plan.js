const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Plan code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Plan price is required'],
    min: [0, 'Price cannot be negative']
  },
  billingCycle: {
    type: String,
    enum: ['Monthly', 'Yearly'],
    default: 'Monthly'
  },
  features: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Plan', PlanSchema);
