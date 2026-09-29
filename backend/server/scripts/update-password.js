const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jeevithavillzone_db_user:uDQWYc2aAfC68L299@hims.lusmhsf.mongodb.net/villzone_platform?appName=HIMS';

async function updatePassword() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const UserSchema = require('../models/User').schema;
    const User = mongoose.models.User || mongoose.model('User', UserSchema, 'platform_users');

    const superAdmin = await User.findOne({ username: 'superadmin' });
    if (superAdmin) {
      superAdmin.password = 'superadmin123'; // Will be hashed by pre-save hook
      await superAdmin.save();
      console.log('✅ Super Admin password updated successfully!');
    } else {
      console.log('❌ Superadmin user not found.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to update password:', error);
    process.exit(1);
  }
}

updatePassword();
