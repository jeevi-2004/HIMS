const express = require('express');
const router = express.Router();
const {
  registerPatient,
  getPatients,
  searchPatients,
  updatePatient,
  bookAppointment,
  checkInAppointment,
  getAppointments,
  enterVitals,
  updateQueueStatus,
  createConsultation,
  getPatientHistory,
  createMedicine,
  getMedicines,
  addMedicineBatch,
  getMedicineBatches,
  getPrescriptionQueue,
  getPrescriptionById,
  dispensePrescription,
  createInvoice,
  recordPayment,
  getInvoices,
  getBillingReports,
  createPharmacyBill,
  getPharmacyBills,
  payPharmacyBill,
  getOPDReports,
  getConsultationSnapshot,
  searchClinicalDiagnoses,
  createClinicalDiagnosis,
  getFrequentDiagnoses,
  toggleFavoriteDiagnosis,
  updateClinicalDiagnosis,
  deleteClinicalDiagnosis,
  getAllClinicalDiagnoses,
  getMedicineForms,
  createMedicineForm,
  deleteMedicineForm,
  getMedicineFrequencies,
  createMedicineFrequency,
  deleteMedicineFrequency,
  getMedicineDosages,
  createMedicineDosage,
  deleteMedicineDosage,
  getFoodInstructions,
  createFoodInstruction,
  deleteFoodInstruction,
  updateDoctorPresence,
  getDoctorPresence
} = require('../controllers/operationalController');
const { protect, requireActiveSubscription } = require('../middleware/auth');
const { validateMobileNumber, checkUserMobileUniqueness } = require('../middleware/validation');

// Protect all routes
router.use(protect);

// Doctor In-Memory Presence
router.get('/doctors/presence', getDoctorPresence);
router.post('/doctors/presence', updateDoctorPresence);

// Medicine Forms
router.get('/medicine-forms', getMedicineForms);
router.post('/medicine-forms', createMedicineForm);
router.delete('/medicine-forms/:id', deleteMedicineForm);

// Medicine Frequencies
router.get('/medicine-frequencies', getMedicineFrequencies);
router.post('/medicine-frequencies', createMedicineFrequency);
router.delete('/medicine-frequencies/:id', deleteMedicineFrequency);

// Medicine Dosages
router.get('/medicine-dosages', getMedicineDosages);
router.post('/medicine-dosages', createMedicineDosage);
router.delete('/medicine-dosages/:id', deleteMedicineDosage);

// Food Instructions
router.get('/food-instructions', getFoodInstructions);
router.post('/food-instructions', createFoodInstruction);
router.delete('/food-instructions/:id', deleteFoodInstruction);

// Clinical Diagnosis Master
router.get('/clinical-diagnoses/search', searchClinicalDiagnoses);
router.get('/clinical-diagnoses/frequent', getFrequentDiagnoses);
router.get('/clinical-diagnoses/all', getAllClinicalDiagnoses);
router.post('/clinical-diagnoses', createClinicalDiagnosis);
router.post('/clinical-diagnoses/:id/favorite', toggleFavoriteDiagnosis);
router.patch('/clinical-diagnoses/:id', updateClinicalDiagnosis);
router.delete('/clinical-diagnoses/:id', deleteClinicalDiagnosis);

// Reports
router.get('/reports/opd', getOPDReports);

// Patients
router.post('/patients', requireActiveSubscription, validateMobileNumber, checkUserMobileUniqueness, registerPatient);
router.get('/patients', getPatients);
router.get('/patients/search', searchPatients);
router.put('/patients/:id', updatePatient);
router.get('/patients/:patientId/history', getPatientHistory);

// Appointments & Queue
router.post('/appointments', requireActiveSubscription, bookAppointment);
router.get('/appointments', getAppointments);
router.get('/appointments/today', getAppointments);
router.put('/appointments/:id/check-in', checkInAppointment);
router.put('/appointments/:id/vitals', enterVitals);
router.put('/appointments/:id/queue', requireActiveSubscription, updateQueueStatus);

// Consultations & Prescription
router.post('/consultations', requireActiveSubscription, createConsultation);
router.get('/consultations/:consultationId/snapshot', getConsultationSnapshot);

// Pharmacy Catalog & Dispensing
router.post('/medicines', createMedicine);
router.get('/medicines', getMedicines);
router.post('/medicines/batch', addMedicineBatch);
router.get('/medicines/:medicineId/batches', getMedicineBatches);

router.post('/pharmacy/medicines', createMedicine);
router.get('/pharmacy/medicines', getMedicines);
router.post('/pharmacy/medicines/batch', addMedicineBatch);
router.get('/pharmacy/medicines/:medicineId/batches', getMedicineBatches);

router.get('/pharmacy/prescriptions', getPrescriptionQueue);
router.get('/pharmacy/queue', getPrescriptionQueue);
router.get('/pharmacy/prescriptions/:id', getPrescriptionById);
router.post('/pharmacy/dispense', dispensePrescription);

// Billing & Reports
router.post('/invoices', createInvoice);
router.get('/invoices', getInvoices);
router.put('/invoices/:id/payment', recordPayment);
router.get('/billing/reports', getBillingReports);

// Pharmacy Billing
router.post('/pharmacy/bills', createPharmacyBill);
router.get('/pharmacy/bills', getPharmacyBills);
router.put('/pharmacy/bills/:id/payment', payPharmacyBill);

module.exports = router;
