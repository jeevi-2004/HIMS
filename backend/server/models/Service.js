const mongoose = require('mongoose');
const { createTenantModel } = require('../utils/tenantModel');

const ServiceSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Service name is required'],
    trim: true
  },
  code: { 
    type: String, 
    required: [true, 'Service code is required'],
    trim: true,
    uppercase: true
  },
  serviceType: {
    type: String,
    trim: true,
    default: 'General'
  },
  category: {
    type: String,
    trim: true,
    default: 'General'
  },
  price: { 
    type: Number, 
    required: [true, 'Service price is required'],
    min: [0, 'Price cannot be negative']
  },
  description: { 
    type: String,
    trim: true
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive'], 
    default: 'active' 
  }
}, {
  timestamps: true
});

module.exports = createTenantModel('Service', ServiceSchema, { tenantCollection: 'services' });
