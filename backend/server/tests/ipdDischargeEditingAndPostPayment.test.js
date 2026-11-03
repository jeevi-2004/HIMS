const mongoose = require('mongoose');
const config = require('../config/config');
const { getTenantDatabaseUri } = require('../utils/dbManager');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const Patient = require('../models/Patient');
const IPDWard = require('../models/IPDWard');
const IPDBed = require('../models/IPDBed');
const IPDAdmission = require('../models/IPDAdmission');
const ipdController = require('../controllers/ipdController');

async function runCompleteDischargeTest() {
  console.log('========================================================================');
  console.log('  TESTING 12 TEST CASES: DISCHARGE EDITING & POST-DISCHARGE PAYMENT    ');
  console.log('========================================================================\n');

  await mongoose.connect(config.MONGO_URI);
  let hospital = await Hospital.findOne({ code: 'RH' }) || await Hospital.findOne({ status: 'active' });
  const hospitalId = hospital._id;
  const tenantUri = getTenantDatabaseUri(config.MONGO_URI, `hospital_${hospital.code.toLowerCase()}`);
  const tenantConn = await mongoose.createConnection(tenantUri).asPromise();

  const TenantAdmission = tenantConn.model('IPDAdmission', IPDAdmission.schema);
  const TenantBed = tenantConn.model('IPDBed', IPDBed.schema);
  const TenantWard = tenantConn.model('IPDWard', IPDWard.schema);
  const TenantPatient = tenantConn.model('Patient', Patient.schema);
  const TenantUser = tenantConn.model('User', User.schema);

  let passed = 0;
  let failed = 0;
  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // Setup staff user
  let staffUser = await TenantUser.findOne({ hospitalId });
  if (!staffUser) {
    staffUser = { _id: new mongoose.Types.ObjectId(), name: 'Test Nurse', hospitalId };
  }

  // Setup patient
  let testPatient = await TenantPatient.findOne({ hospitalId });
  if (!testPatient) {
    testPatient = await TenantPatient.create({
      name: 'Verification Patient',
      uhid: 'UHID-DISCH-TEST-001',
      age: 38,
      gender: 'Female',
      mobileNumber: '9876543210',
      hospitalId
    });
  }

  // Setup ward and bed
  let testWard = await TenantWard.findOne({ hospitalId, isActive: true });
  if (!testWard) {
    testWard = await TenantWard.create({
      name: 'Test General Ward',
      type: 'General Ward',
      code: 'TGW',
      baseCharges: 500,
      dailyBaseRate: 500,
      hospitalId
    });
  }

  let testBed = await TenantBed.findOne({ wardId: testWard._id, status: 'Available' });
  if (!testBed) {
    testBed = await TenantBed.create({
      bedNumber: 'B-TEST-99',
      wardId: testWard._id,
      dailyCharge: 500,
      status: 'Available',
      hospitalId
    });
  }

  // Helper to create mock req / res
  function mockReqRes(body = {}, params = {}, query = {}) {
    let statusCode = 200;
    let responseData = null;
    const req = {
      body,
      params,
      query,
      hospitalId,
      branchId: hospital.branches?.[0]?._id,
      user: staffUser,
      tenantConnection: tenantConn
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };
    return { req, res, getStatus: () => statusCode, getData: () => responseData };
  }

  // Create a fresh test admission
  const admissionIdStr = `IPD-TEST-${Date.now()}`;
  let admission = await TenantAdmission.create({
    patientId: testPatient._id,
    admissionId: admissionIdStr,
    bedId: testBed._id,
    admissionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    admissionTime: '10:00',
    reasonForAdmission: 'Acute Gastrointestinal distress',
    status: 'Admitted',
    queueStatus: 'In Progress',
    amountMode: 'Cash',
    amountPaid: 0,
    paymentStatus: 'Unpaid',
    billingDetails: {
      bedCharges: 1000,
      consultationCharges: 1500,
      nursingCharges: 500,
      procedureCharges: 0,
      labCharges: 2000,
      medicationCharges: 0,
      otherCharges: 0,
      discount: 0,
      tax: 0,
      totalBill: 5000,
      dailyRate: 500,
      chargeableDays: 2,
      isCustomized: true,
      adjustments: [],
      paymentTransactions: []
    },
    hospitalId
  });

  await TenantBed.findByIdAndUpdate(testBed._id, { status: 'Occupied', currentAdmissionId: admission._id });

  console.log(`Created test admission: ${admission.admissionId} (ID: ${admission._id})`);

  // =========================================================================
  // TEST 1: Patient is admitted.
  // Open Discharge Summary from Inpatients.
  // Authorized staff can edit clinical discharge details and billing charges.
  // =========================================================================
  console.log('\n--- TEST 1: Editing Allowed While Admitted ---');
  {
    // Update billing charges via API
    const { req, res, getStatus, getData } = mockReqRes({
      bedCharges: 1000,
      consultationCharges: 2000, // increased consultation from 1500 to 2000
      nursingCharges: 500,
      procedureCharges: 0,
      labCharges: 2500, // increased lab from 2000 to 2500
      medicationCharges: 0,
      otherCharges: 0,
      discount: 0,
      tax: 0,
      dailyRate: 500,
      chargeableDays: 2,
      adjustmentReason: 'Added routine lab panel'
    }, { id: admission._id });

    // Run within tenant connection context
    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.updateAdmissionBilling(req, res);
    });

    assert(getStatus() === 200, `Billing updated while admitted (status ${getStatus()})`);
    const updatedAdm = getData();
    assert(updatedAdm.billingDetails.totalBill === 6000, `Total bill recalculated to ₹6,000 (was ₹5,000)`);
    assert(updatedAdm.billingDetails.adjustments.length === 1, `Adjustment logged with reason: "${updatedAdm.billingDetails.adjustments[0].reason}"`);
  }

  // =========================================================================
  // TEST 2: Patient is admitted. Collect a payment.
  // Paid and pending amounts update correctly.
  // =========================================================================
  console.log('\n--- TEST 2: Collect Payment While Admitted ---');
  {
    const { req, res, getStatus, getData } = mockReqRes({
      amount: 1000,
      paymentMode: 'Cash',
      referenceNo: 'REC-001',
      notes: 'Initial deposit'
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.recordAdmissionPayment(req, res);
    });

    assert(getStatus() === 200, `Payment recorded while admitted (status ${getStatus()})`);
    const updated = getData();
    assert(updated.amountPaid === 1000, `amountPaid updated to ₹1,000`);
    const pending = updated.billingDetails.totalBill - updated.amountPaid;
    assert(pending === 5000, `pending amount correctly calculated as ₹5,000 (Total ₹6,000 - Paid ₹1,000)`);
    assert(updated.paymentStatus === 'Partially Paid', `paymentStatus updated to 'Partially Paid'`);
  }

  // =========================================================================
  // TEST 3: Finalize discharge successfully.
  // Patient moves out of Active Inpatients and appears in Discharge History.
  // Bed is released.
  // =========================================================================
  console.log('\n--- TEST 3: Finalize Discharge with Settlement Exception ---');
  {
    // The bill has ₹5,000 pending. Finalize with authorized settlement exception.
    const { req, res, getStatus, getData } = mockReqRes({
      dischargeDate: new Date().toISOString().split('T')[0],
      dischargeTime: '14:30',
      finalDiagnosis: 'Acute Gastroenteritis, resolved',
      treatmentSummary: 'Rehydration IV fluids, antiemetics, stable recovery',
      dischargeCondition: 'Stable / Recovered',
      dischargeInstructions: 'Soft diet for 3 days, review in OPD if needed',
      settlementException: {
        allowed: true,
        reason: 'Authorized credit settlement terms approved by MS'
      },
      billingDetails: {
        totalBill: 6000,
        bedCharges: 1000,
        consultationCharges: 2000,
        nursingCharges: 500,
        labCharges: 2500,
        dailyRate: 500,
        chargeableDays: 2
      }
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.dischargePatient(req, res);
    });

    assert(getStatus() === 200, `Discharge finalized successfully (status ${getStatus()})`);
    const discharged = getData();
    assert(discharged.status === 'Discharged', `Admission status set to 'Discharged'`);
    assert(Boolean(discharged.dischargeDate), `Discharge date recorded: ${discharged.dischargeDate}`);
    assert(discharged.billingDetails.settlementException.allowed === true, `Settlement exception documented`);

    // Verify bed is released
    const releasedBed = await TenantBed.findById(testBed._id);
    assert(releasedBed.status === 'Available', `Assigned bed released to status 'Available'`);
    assert(!releasedBed.currentAdmissionId, `Bed currentAdmissionId unset`);
  }

  // =========================================================================
  // TEST 4: Open finalized discharge summary.
  // Clinical information is read-only. Hospital stay is read-only. Finalized billing is read-only.
  // =========================================================================
  console.log('\n--- TEST 4: Finalized Summary Read-Only State ---');
  {
    const reloaded = await TenantAdmission.findById(admission._id);
    assert(reloaded.status === 'Discharged', `Admission status is strictly 'Discharged'`);
    assert(reloaded.finalDiagnosis === 'Acute Gastroenteritis, resolved', `Clinical final diagnosis preserved: "${reloaded.finalDiagnosis}"`);
    assert(reloaded.billingDetails.totalBill === 6000, `Billing snapshot locked at ₹6,000`);
    assert(reloaded.billingDetails.chargeableDays === 2, `Chargeable days locked at 2`);
  }

  // =========================================================================
  // TEST 5: Discharged patient has ₹5,000 pending.
  // Collect Payment remains available.
  // =========================================================================
  console.log('\n--- TEST 5: Check Pending Balance on Discharged Patient ---');
  {
    const reloaded = await TenantAdmission.findById(admission._id);
    const pending = reloaded.billingDetails.totalBill - reloaded.amountPaid;
    assert(pending === 5000, `Discharged patient has pending balance of ₹${pending}`);
    assert(pending > 0, `Pending balance > 0 allows Collect Payment action`);
  }

  // =========================================================================
  // TEST 6: Collect ₹2,000 after discharge.
  // Pending amount becomes ₹3,000. Finalized bill remains unchanged.
  // =========================================================================
  console.log('\n--- TEST 6: Collect ₹2,000 Post-Discharge Payment ---');
  {
    const { req, res, getStatus, getData } = mockReqRes({
      amount: 2000,
      paymentMode: 'UPI',
      referenceNo: 'UPI-POST-DISCH-001',
      notes: 'Post-discharge installment'
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.recordAdmissionPayment(req, res);
    });

    assert(getStatus() === 200, `Post-discharge payment accepted (status ${getStatus()})`);
    const updated = getData();
    assert(updated.status === 'Discharged', `Admission status remains 'Discharged' (not reopened)`);
    assert(updated.amountPaid === 3000, `Amount paid updated to ₹3,000 (was ₹1,000)`);
    assert(updated.billingDetails.totalBill === 6000, `Finalized bill remains unchanged at ₹6,000`);
    const pending = updated.billingDetails.totalBill - updated.amountPaid;
    assert(pending === 3000, `Pending amount correctly reduced to ₹3,000`);
    assert(updated.billingDetails.paymentTransactions.length === 2, `Transaction history preserved: 2 transactions recorded`);
  }

  // =========================================================================
  // TEST 7: Collect remaining ₹3,000.
  // Pending amount becomes ₹0. Payment status becomes Fully Paid ('Paid').
  // =========================================================================
  console.log('\n--- TEST 7: Collect Final ₹3,000 to Fully Settle ---');
  {
    const { req, res, getStatus, getData } = mockReqRes({
      amount: 3000,
      paymentMode: 'Card',
      referenceNo: 'CARD-POST-DISCH-002',
      notes: 'Final settlement payment'
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.recordAdmissionPayment(req, res);
    });

    assert(getStatus() === 200, `Final payment recorded (status ${getStatus()})`);
    const updated = getData();
    assert(updated.amountPaid === 6000, `Amount paid equals total bill of ₹6,000`);
    const pending = updated.billingDetails.totalBill - updated.amountPaid;
    assert(pending === 0, `Pending amount is now ₹0`);
    assert(updated.paymentStatus === 'Paid', `Payment status is now 'Paid' (Fully Settled)`);
    assert(updated.status === 'Discharged', `Admission remains 'Discharged'`);
  }

  // =========================================================================
  // TEST 8: Reopen the discharge summary.
  // Updated payment information is displayed. All finalized discharge info remains locked.
  // =========================================================================
  console.log('\n--- TEST 8: Reopen Summary Verification ---');
  {
    const reloaded = await TenantAdmission.findById(admission._id);
    assert(reloaded.billingDetails.totalBill === 6000, `Finalized total bill remains ₹6,000`);
    assert(reloaded.amountPaid === 6000, `Total paid is ₹6,000`);
    assert(reloaded.paymentStatus === 'Paid', `Payment status confirmed 'Paid'`);
    assert(reloaded.billingDetails.paymentTransactions.length === 3, `All 3 payment transactions recorded and preserved`);
    assert(reloaded.finalDiagnosis === 'Acute Gastroenteritis, resolved', `Final diagnosis intact`);
  }

  // =========================================================================
  // TEST 9: Attempt to edit finalized clinical details through a direct API request.
  // Backend rejects the modification.
  // =========================================================================
  console.log('\n--- TEST 9: Backend Blocks Direct API Clinical/Discharge Modification ---');
  {
    const { req, res, getStatus, getData } = mockReqRes({
      finalDiagnosis: 'Tampered diagnosis after discharge',
      treatmentSummary: 'Tampered summary'
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.dischargePatient(req, res);
    });

    assert(getStatus() === 400, `Direct discharge edit rejected with status 400 (got ${getStatus()})`);
    assert(getData().message.includes('not currently admitted'), `Error message: "${getData().message}"`);
  }

  // =========================================================================
  // TEST 10: Attempt to edit finalized billing charges through a direct API request.
  // Backend rejects the modification.
  // =========================================================================
  console.log('\n--- TEST 10: Backend Blocks Direct API Billing Charge Modification ---');
  {
    const { req, res, getStatus, getData } = mockReqRes({
      bedCharges: 5000,
      totalBill: 10000,
      adjustmentReason: 'Malicious rate change after discharge'
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.updateAdmissionBilling(req, res);
    });

    assert(getStatus() === 400, `Direct billing edit rejected with status 400 (got ${getStatus()})`);
    assert(getData().message.includes('Cannot modify billing charges on a finalized discharge'), `Error message: "${getData().message}"`);
  }

  // =========================================================================
  // TEST 11: Refresh the page after post-discharge payment.
  // Payment totals remain correct. No duplicate records.
  // Overpayment attempt also rejected!
  // =========================================================================
  console.log('\n--- TEST 11: Data Consistency & Overpayment Prevention ---');
  {
    // Check overpayment rejection (pending is 0)
    const { req, res, getStatus, getData } = mockReqRes({
      amount: 500,
      paymentMode: 'Cash'
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.recordAdmissionPayment(req, res);
    });

    assert(getStatus() === 400, `Overpayment rejected when balance is 0 (status ${getStatus()})`);
    assert(getData().message.includes('cannot exceed remaining pending balance'), `Overpayment message: "${getData().message}"`);

    // Verify record consistency after query
    const refreshed = await TenantAdmission.findById(admission._id);
    assert(refreshed.amountPaid === 6000, `Persisted amountPaid is ₹6,000`);
    assert(refreshed.billingDetails.totalBill === 6000, `Persisted totalBill is ₹6,000`);
    assert(refreshed.billingDetails.paymentTransactions.length === 3, `No duplicate payment transactions (exactly 3)`);
  }

  // =========================================================================
  // TEST 12: Attempt to finalize the same admission twice.
  // No duplicate discharge completion or bed release.
  // =========================================================================
  console.log('\n--- TEST 12: Prevent Duplicate Finalization ---');
  {
    const { req, res, getStatus, getData } = mockReqRes({
      dischargeDate: new Date().toISOString().split('T')[0],
      dischargeTime: '15:00',
      finalDiagnosis: 'Duplicate finalization attempt'
    }, { id: admission._id });

    const { tenantLocalStorage } = require('../utils/tenantModel');
    await tenantLocalStorage.run({ connection: tenantConn }, async () => {
      await ipdController.dischargePatient(req, res);
    });

    assert(getStatus() === 400, `Duplicate discharge finalization rejected with status 400 (got ${getStatus()})`);
    assert(getData().message.includes('not currently admitted'), `Protection message: "${getData().message}"`);
  }

  // Clean up test admission
  await TenantAdmission.findByIdAndDelete(admission._id);
  await TenantBed.findByIdAndUpdate(testBed._id, { status: 'Available', $unset: { currentAdmissionId: 1 } });

  await tenantConn.close();
  await mongoose.disconnect();

  console.log('\n========================================================================');
  console.log(`   FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED                     `);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCompleteDischargeTest().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
