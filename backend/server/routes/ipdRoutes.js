
const express = require('express');
const router = express.Router();
const ipdController = require('../controllers/ipdController');
const { protect, authorize } = require('../middleware/auth');
const { requireIPD } = require('../middleware/ipdMiddleware');

// All IPD routes require authentication
router.use(protect);

// Dashboard Live Status endpoint (checks IPD enablement internally and returns enabled: true/false cleanly)
router.get('/dashboard', ipdController.getIpdDashboardStatus);
router.get('/dashboard/live-status', ipdController.getIpdDashboardStatus);

// All subsequent clinical/management IPD routes require IPD feature to be enabled for this hospital
router.use(requireIPD);

// Wards
router.route('/wards')
  .get(ipdController.getWards)
  .post(ipdController.createWard);

router.route('/wards/:id')
  .put(ipdController.updateWard)
  .delete(ipdController.deleteWard);

// Beds
router.route('/beds')
  .get(ipdController.getBeds)
  .post(ipdController.createBed);

router.route('/beds/:id')
  .put(ipdController.updateBed)
  .delete(ipdController.deleteBed);

// Admissions & Discharges
router.route('/admissions')
  .get(ipdController.getAdmissions);

router.route('/admissions/admit')
  .post(ipdController.admitPatient);

router.route('/admissions/:id')
  .get(ipdController.getAdmissionById);

router.route('/admissions/:id/clinical-discharge')
  .put(ipdController.saveClinicalDischargeSummary);

router.route('/admissions/:id/discharge-summary')
  .put(ipdController.saveClinicalDischargeSummary);

router.route('/admissions/:id/discharge')
  .put(ipdController.dischargePatient);

router.route('/admissions/:id/payment')
  .post(ipdController.recordAdmissionPayment);

router.route('/admissions/:id/billing')
  .put(ipdController.updateAdmissionBilling);

router.route('/admissions/:id/billing-items')
  .post(ipdController.addAdmissionBillingItem);

router.route('/admissions/:id/billing-items/:itemId')
  .delete(ipdController.deleteAdmissionBillingItem);

router.route('/admissions/:id/status')
  .put(ipdController.updateAdmissionQueueStatus);

router.route('/admissions/:id/queue')
  .put(ipdController.updateAdmissionQueueStatus);

router.route('/admissions/:id/visit')
  .post(ipdController.recordDoctorVisit);

router.route('/admissions/:id/daily-reviews')
  .get(ipdController.getDailyReviews)
  .post(ipdController.saveDailyReview);

// IPD Pharmacy Prescriptions Queue & Dispense
router.route('/prescriptions/queue')
  .get(ipdController.getIpdPrescriptionQueue);

router.route('/prescriptions/dispense')
  .post(ipdController.dispenseIpdPrescription);

module.exports = router;
