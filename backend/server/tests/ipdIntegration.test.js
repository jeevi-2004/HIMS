/**
 * End-to-End Integration Test for IPD Dashboard Live Status
 * Validates actual HTTP requests against localhost:5000 server.
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config/config');

async function runIntegrationTests() {
  console.log('--- Starting IPD Dashboard Live Status Integration Tests ---');

  // Connect to DB to set up / verify fixtures
  await mongoose.connect(config.MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const Hospital = require('../models/Hospital');
  const User = require('../models/User');
  const Role = require('../models/Role');
  const UserSession = require('../models/UserSession');
  const IPDAdmission = require('../models/IPDAdmission');
  const Patient = require('../models/Patient');
  const IPDWard = require('../models/IPDWard');
  const IPDBed = require('../models/IPDBed');

  // 1. Setup Role
  let adminRole = await Role.findOne({ name: 'DOCTOR_ADMIN' });
  if (!adminRole) {
    adminRole = await Role.create({ name: 'DOCTOR_ADMIN', permissions: ['*'] });
  }

  // 2. Setup Hospital A (IPD Enabled)
  const hospACode = 'TEST_HOSP_IPD_EN';
  let hospA = await Hospital.findOne({ code: hospACode });
  if (!hospA) {
    hospA = await Hospital.create({
      name: 'Test Hospital IPD Enabled',
      code: hospACode,
      status: 'active',
      contactNumber: '9999999901',
      email: 'hospA@test.com',
      ipd_requested: true,
      featureModules: { IPD: true, OPD: true }
    });
  } else {
    hospA.status = 'active';
    hospA.ipd_requested = true;
    hospA.featureModules = { IPD: true, OPD: true };
    await hospA.save();
  }

  // 3. Setup Hospital B (IPD Disabled)
  const hospBCode = 'TEST_HOSP_IPD_DIS';
  let hospB = await Hospital.findOne({ code: hospBCode });
  if (!hospB) {
    hospB = await Hospital.create({
      name: 'Test Hospital IPD Disabled',
      code: hospBCode,
      status: 'active',
      contactNumber: '9999999902',
      email: 'hospB@test.com',
      ipd_requested: false,
      featureModules: { IPD: false, OPD: true }
    });
  } else {
    hospB.status = 'active';
    hospB.ipd_requested = false;
    hospB.featureModules = { IPD: false, OPD: true };
    await hospB.save();
  }

  // 4. Setup Admin Users for Hospital A & B
  let userA = await User.findOne({ mobileNumber: '9999999901' });
  if (!userA) {
    userA = await User.create({
      name: 'Admin Hospital A',
      mobileNumber: '9999999901',
      employeeCode: 'EMP9901',
      hospitalCode: hospACode,
      hospitalId: hospA._id,
      roleId: adminRole._id,
      status: 'active',
      pin: '1234'
    });
  }

  let userB = await User.findOne({ mobileNumber: '9999999902' });
  if (!userB) {
    userB = await User.create({
      name: 'Admin Hospital B',
      mobileNumber: '9999999902',
      employeeCode: 'EMP9902',
      hospitalCode: hospBCode,
      hospitalId: hospB._id,
      roleId: adminRole._id,
      status: 'active',
      pin: '1234'
    });
  }

  // Generate tokens & active sessions
  const tokenA = jwt.sign(
    { id: userA._id.toString(), role: 'DOCTOR_ADMIN', hospitalCode: hospACode },
    config.JWT_SECRET,
    { expiresIn: '2h' }
  );
  await UserSession.deleteMany({ userId: userA._id });
  await UserSession.create({
    userId: userA._id,
    token: tokenA,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
  });

  const tokenB = jwt.sign(
    { id: userB._id.toString(), role: 'DOCTOR_ADMIN', hospitalCode: hospBCode },
    config.JWT_SECRET,
    { expiresIn: '2h' }
  );
  await UserSession.deleteMany({ userId: userB._id });
  await UserSession.create({
    userId: userB._id,
    token: tokenB,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
  });

  console.log('✓ Test fixtures, hospitals and sessions initialized');

  // Clean previous test admissions in Hosp A & B (both central and tenant databases)
  const { getTenantConnection } = require('../utils/dbManager');
  const { tenantLocalStorage } = require('../utils/tenantModel');
  const connA = await getTenantConnection(hospACode);
  const connB = await getTenantConnection(hospBCode);

  await IPDAdmission.deleteMany({ hospitalId: hospA._id });
  await IPDAdmission.deleteMany({ hospitalId: hospB._id });
  if (connA) {
    await tenantLocalStorage.run({ connection: connA }, async () => {
      await IPDAdmission.deleteMany({ hospitalId: hospA._id });
    });
  }
  if (connB) {
    await tenantLocalStorage.run({ connection: connB }, async () => {
      await IPDAdmission.deleteMany({ hospitalId: hospB._id });
    });
  }

  // -------------------------------------------------------------
  // Test 1: Verify Hospital B (IPD Disabled) returns enabled: false
  // -------------------------------------------------------------
  const resB = await fetch('http://localhost:5000/api/ipd/dashboard', {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const dataB = await resB.json();
  if (dataB.enabled !== false || dataB.totalAdmissions !== 0) {
    throw new Error(`Test 1 Failed: Expected Hospital B to have enabled: false, got ${JSON.stringify(dataB)}`);
  }
  console.log('✓ Test 1 Passed: Hospital B with IPD disabled returns enabled: false');

  // -------------------------------------------------------------
  // Test 2: Verify Hospital A (IPD Enabled) returns enabled: true and 0 admissions initially
  // -------------------------------------------------------------
  const resA = await fetch('http://localhost:5000/api/ipd/dashboard', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const dataA = await resA.json();
  if (dataA.enabled !== true || dataA.totalAdmissions !== 0) {
    throw new Error(`Test 2 Failed: Expected Hospital A enabled: true, total: 0, got ${JSON.stringify(dataA)}`);
  }
  console.log('✓ Test 2 Passed: Hospital A with IPD enabled returns enabled: true and 0 initial admissions');

  // -------------------------------------------------------------
  // Test 3: Create a Patient and Admit to IPD in Hospital A
  // -------------------------------------------------------------
  let patient = await Patient.findOne({ hospitalId: hospA._id });
  if (!patient) {
    patient = await Patient.create({
      name: 'Ravi Kumar',
      uhid: 'PAT000123',
      mobileNumber: '9876543210',
      hospitalId: hospA._id,
      gender: 'Male',
      age: 35
    });
  } else {
    patient.name = 'Ravi Kumar';
    patient.uhid = patient.uhid || 'PAT000123';
    await patient.save();
  }

  // Create Ward & Bed in Hosp A
  let ward = await IPDWard.findOne({ hospitalId: hospA._id });
  if (!ward) {
    ward = await IPDWard.create({
      name: 'General Ward',
      code: 'GEN',
      hospitalId: hospA._id,
      createdBy: userA._id
    });
  }

  let bed = await IPDBed.findOne({ hospitalId: hospA._id });
  if (!bed) {
    bed = await IPDBed.create({
      bedNumber: '101',
      wardId: ward._id,
      hospitalId: hospA._id,
      status: 'Available',
      createdBy: userA._id
    });
  } else {
    bed.status = 'Available';
    bed.currentAdmissionId = null;
    await bed.save();
  }

  const admitRes = await fetch('http://localhost:5000/api/ipd/admissions/admit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      patientId: patient._id.toString(),
      bedId: bed._id.toString(),
      attendingDoctorId: userA._id.toString(),
      reasonForAdmission: 'Acute fever and dehydration',
      admissionType: 'Emergency / Trauma'
    })
  });
  const admitData = await admitRes.json();
  if (!admitRes.ok || !admitData._id) {
    throw new Error(`Test 3 Failed: Admit patient failed: ${JSON.stringify(admitData)}`);
  }
  const admissionId = admitData._id;
  console.log(`✓ Test 3 Passed: Successfully admitted patient (${admitData.admissionId})`);

  // -------------------------------------------------------------
  // Test 4: Dashboard Counts Reflect 1 Total, 1 Waiting, 0 In Progress, 0 Completed
  // -------------------------------------------------------------
  const resAAfterAdmit = await fetch('http://localhost:5000/api/ipd/dashboard', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const dataAfterAdmit = await resAAfterAdmit.json();
  if (
    dataAfterAdmit.totalAdmissions !== 1 ||
    dataAfterAdmit.waiting !== 1 ||
    dataAfterAdmit.inProgress !== 0 ||
    dataAfterAdmit.completed !== 0 ||
    dataAfterAdmit.recentAdmissions.length !== 1
  ) {
    throw new Error(`Test 4 Failed: Expected 1 Total, 1 Waiting, got ${JSON.stringify(dataAfterAdmit)}`);
  }

  const recent = dataAfterAdmit.recentAdmissions[0];
  if (recent.patientName !== 'Ravi Kumar' || recent.status !== 'Waiting') {
    throw new Error(`Test 4 Failed: Recent admission details mismatch: ${JSON.stringify(recent)}`);
  }
  console.log('✓ Test 4 Passed: Dashboard counts accurately show Total: 1, Waiting: 1, In Progress: 0, Completed: 0');

  // -------------------------------------------------------------
  // Test 5: Verify Tenant Isolation (Hospital B counts remain 0)
  // -------------------------------------------------------------
  const resBCheck = await fetch('http://localhost:5000/api/ipd/dashboard', {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const dataBCheck = await resBCheck.json();
  if (dataBCheck.totalAdmissions !== 0 || dataBCheck.recentAdmissions.length !== 0) {
    throw new Error(`Test 5 Failed: Hospital B saw Hospital A data! ${JSON.stringify(dataBCheck)}`);
  }
  console.log('✓ Test 5 Passed: Hospital B data isolation preserved (0 admissions)');

  // -------------------------------------------------------------
  // Test 6: Status Transitions (Waiting -> In Progress -> Completed)
  // -------------------------------------------------------------
  // 6a. Transition to In Progress
  const updateRes1 = await fetch(`http://localhost:5000/api/ipd/admissions/${admissionId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`
    },
    body: JSON.stringify({ queueStatus: 'In Progress' })
  });
  const updateData1 = await updateRes1.json();
  if (updateData1.queueStatus !== 'In Progress') {
    throw new Error(`Test 6a Failed: Failed to update to In Progress: ${JSON.stringify(updateData1)}`);
  }

  const resAInProgress = await fetch('http://localhost:5000/api/ipd/dashboard', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const dataInProgress = await resAInProgress.json();
  if (dataInProgress.waiting !== 0 || dataInProgress.inProgress !== 1 || dataInProgress.completed !== 0) {
    throw new Error(`Test 6a Failed: Counts not moved to In Progress: ${JSON.stringify(dataInProgress)}`);
  }
  console.log('✓ Test 6a Passed: Status transitioned to In Progress (Waiting: 0, In Progress: 1, Completed: 0)');

  // 6b. Transition to Completed
  const updateRes2 = await fetch(`http://localhost:5000/api/ipd/admissions/${admissionId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`
    },
    body: JSON.stringify({ queueStatus: 'Completed' })
  });
  const updateData2 = await updateRes2.json();
  if (updateData2.queueStatus !== 'Completed') {
    throw new Error(`Test 6b Failed: Failed to update to Completed: ${JSON.stringify(updateData2)}`);
  }

  const resACompleted = await fetch('http://localhost:5000/api/ipd/dashboard', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const dataCompleted = await resACompleted.json();
  if (dataCompleted.waiting !== 0 || dataCompleted.inProgress !== 0 || dataCompleted.completed !== 1) {
    throw new Error(`Test 6b Failed: Counts not moved to Completed: ${JSON.stringify(dataCompleted)}`);
  }
  console.log('✓ Test 6b Passed: Status transitioned to Completed (Waiting: 0, In Progress: 0, Completed: 1)');

  // -------------------------------------------------------------
  // Test 7: Prevent Duplicate Concurrent Admission for Same Patient
  // -------------------------------------------------------------
  const dupRes = await fetch('http://localhost:5000/api/ipd/admissions/admit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      patientId: patient._id.toString(),
      reasonForAdmission: 'Duplicate admission attempt'
    })
  });
  if (dupRes.status !== 400) {
    throw new Error(`Test 7 Failed: Expected 400 for duplicate active admission, got ${dupRes.status}`);
  }
  console.log('✓ Test 7 Passed: Idempotency check prevents duplicate active admission for same patient');

  // -------------------------------------------------------------
  // Test 8: Discharge Patient & Bed Release
  // -------------------------------------------------------------
  const dischargeRes = await fetch(`http://localhost:5000/api/ipd/admissions/${admissionId}/discharge`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      dischargeSummary: 'Patient fully recovered and vitals stable',
      finalDiagnosis: 'Viral fever - resolved'
    })
  });
  const dischargeData = await dischargeRes.json();
  if (dischargeData.status !== 'Discharged') {
    throw new Error(`Test 8 Failed: Discharge failed: ${JSON.stringify(dischargeData)}`);
  }

  const bedAfter = await IPDBed.findById(bed._id);
  if (bedAfter.status !== 'Available' || bedAfter.currentAdmissionId) {
    throw new Error(`Test 8 Failed: Bed was not released: ${JSON.stringify(bedAfter)}`);
  }
  console.log('✓ Test 8 Passed: Patient discharged successfully and bed released to Available');

  // Cleanup test records
  await IPDAdmission.deleteMany({ hospitalId: hospA._id });
  if (connA) {
    await tenantLocalStorage.run({ connection: connA }, async () => {
      await IPDAdmission.deleteMany({ hospitalId: hospA._id });
    });
  }
  await UserSession.deleteMany({ userId: userA._id });
  await UserSession.deleteMany({ userId: userB._id });

  console.log('\nAll 8 Integration Tests Passed Successfully!');
  await mongoose.disconnect();
}

runIntegrationTests().catch(err => {
  console.error('Integration Test Error:', err);
  process.exit(1);
});
