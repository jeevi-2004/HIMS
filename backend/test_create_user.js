const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testCreateUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const Role = require('./server/models/Role');
    const User = require('./server/models/User');
    const Hospital = require('./server/models/Hospital');

    const superAdminRole = await Role.findOne({ name: 'SUPER_ADMIN' });
    const doctorAdminRole = await Role.findOne({ name: 'DOCTOR_ADMIN' });
    
    if (!superAdminRole || !doctorAdminRole) throw new Error("Roles not found");

    const superAdmin = await User.findOne({ roleId: superAdminRole._id });
    if (!superAdmin) throw new Error("Super admin not found");

    const hospital = await Hospital.findOne({});
    if (!hospital) throw new Error("Hospital not found");

    const token = jwt.sign({ id: superAdmin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    console.log("Token:", token.substring(0, 20) + "...");

    const payload = {
      name: 'Test Admin',
      countryCode: '+91',
      mobileNumber: '9988776655', // random unused number
      pin: '123456',
      roleId: doctorAdminRole._id.toString(),
      hospitalId: hospital._id.toString(),
      branchId: '',
      departmentId: '',
      hospitalCode: hospital.code
    };

    console.log("Sending payload:", payload);

    const response = await fetch('http://localhost:5000/api/auth/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("Response Status:", response.status);
    console.log("Response Body:", data);

  } catch (error) {
    console.error("Test Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

testCreateUser();
