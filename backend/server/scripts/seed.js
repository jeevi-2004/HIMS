/**
 * Seed Script: Creates the initial SUPER_ADMIN role and user
 * Run with: npm run seed
 */

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jeevithavillzone_db_user:uDQWYc2aAfC68L299@hims.lusmhsf.mongodb.net/villzone_platform?appName=HIMS';

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Use the central collections directly (matching the tenantModel setup)
    const RoleSchema = require('../models/Role').schema;
    const UserSchema = require('../models/User').schema;

    // Get or create models on the default connection with the central collection names
    const Role = mongoose.models.Role || mongoose.model('Role', RoleSchema, 'roles');
    const User = mongoose.models.User || mongoose.model('User', UserSchema, 'platform_users');

    // 1. Seed SUPER_ADMIN role
    let superAdminRole = await Role.findOne({ name: 'SUPER_ADMIN' });
    if (!superAdminRole) {
      superAdminRole = await Role.create({
        name: 'SUPER_ADMIN',
        description: 'Platform Super Administrator with full access',
        permissions: ['*']
      });
      console.log('✅ SUPER_ADMIN role created');
    } else {
      console.log('ℹ️  SUPER_ADMIN role already exists');
    }

    // 2. Seed Super Admin user
    let superAdmin = await User.findOne({ username: 'superadmin' });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: 'Super Admin',
        username: 'superadmin',
        password: 'admin123',        // Will be hashed by pre-save hook
        countryCode: '+91',
        mobileNumber: '9999999999',
        roleId: superAdminRole._id,
        employeeCode: 'VZH-SA001',
        status: 'active',
        isActive: true
      });
      console.log('✅ Super Admin user created');
      console.log('   Username: superadmin');
      console.log('   Password: admin123');
    } else {
      console.log('ℹ️  Super Admin user already exists');
    }

    // 3. Seed other default roles if they don't exist
    const defaultRoles = [
      { name: 'DOCTOR_ADMIN', description: 'Hospital Doctor Administrator', permissions: ['hospital:manage', 'opd:manage', 'staff:manage'] },
      { name: 'DOCTOR', description: 'Doctor', permissions: ['opd:view', 'opd:manage', 'prescription:create'] },
      { name: 'RECEPTIONIST', description: 'Front Desk Receptionist', permissions: ['opd:view', 'patient:register', 'appointment:manage'] },
      { name: 'PHARMACIST', description: 'Pharmacy Staff', permissions: ['pharmacy:view', 'pharmacy:manage'] },
      { name: 'NURSE', description: 'Nursing Staff', permissions: ['opd:view', 'vitals:manage'] },
      { name: 'LAB_TECHNICIAN', description: 'Lab Technician', permissions: ['lab:view', 'lab:manage'] },
      { name: 'BILLING', description: 'Billing Staff', permissions: ['billing:view', 'billing:manage'] }
    ];

    for (const roleData of defaultRoles) {
      const exists = await Role.findOne({ name: roleData.name });
      if (!exists) {
        await Role.create(roleData);
        console.log(`✅ ${roleData.name} role created`);
      } else {
        console.log(`ℹ️  ${roleData.name} role already exists`);
      }
    }

    console.log('\n🎉 Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
