const express = require('express');
const router = express.Router();
const {
  createHospital,
  getHospitals,
  activateHospitalPlan,
  createBranch,
  getBranches,
  updateBranch,
  createDepartment,
  getDepartments,
  updateDepartment,
  deleteDepartment,
  getUsers,
  updateUserStatus,
  getRoles,
  getPermissions,
  getAuditLogs,
  getLoginHistory,
  getPlans,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan,
  updateHospital,
  deleteHospital,
  toggleHospitalFeatures,
  toggleHospitalStatus,
  getLicenses,
  createLicense,
  renewLicense,
  getSettings,
  saveSettings,
  getServices,
  createService,
  updateService,
  deleteService,
  updateDoctorProfile,
  updateHospitalProfile,
  updateUser,
  deleteUser,
  getBillingSettings,
  updateBillingSettings,
  getPrintTemplates,
  getActivePrintTemplate,
  createPrintTemplate,
  updatePrintTemplate,
  activatePrintTemplate,
  duplicatePrintTemplate,
  updateHospitalGeolocation
} = require('../controllers/adminController');

const { protect, authorize } = require('../middleware/auth');
const { validateMobileNumber, checkUserMobileUniqueness } = require('../middleware/validation');
const { USER_ROLES, ROLE_GROUPS } = require('../constants/roles');

// Apply protection middleware to all admin endpoints
router.use(protect);

// Plan Management (Super Admin only, Doctor Admin can view)
router.get('/plans', authorize(...ROLE_GROUPS.ADMIN), getPlans);
router.post('/plans', authorize(USER_ROLES.SUPER_ADMIN), createPlan);
router.put('/plans/:id', authorize(USER_ROLES.SUPER_ADMIN), updatePlan);
router.put('/plans/:id/status', authorize(USER_ROLES.SUPER_ADMIN), updatePlanStatus);
router.delete('/plans/:id', authorize(USER_ROLES.SUPER_ADMIN), deletePlan);

// Hospital Management (Super Admin only to create/activate, Doctor Admin to view own)
router.post('/hospitals', authorize(USER_ROLES.SUPER_ADMIN), validateMobileNumber, createHospital);
router.get('/hospitals', authorize(USER_ROLES.SUPER_ADMIN, ...ROLE_GROUPS.ALL_STAFF), getHospitals);
router.put('/hospitals/:id/activate', authorize(USER_ROLES.SUPER_ADMIN), activateHospitalPlan);
router.put('/hospitals/:id', authorize(USER_ROLES.SUPER_ADMIN), validateMobileNumber, updateHospital);
router.delete('/hospitals/:id', authorize(USER_ROLES.SUPER_ADMIN), deleteHospital);
router.put('/hospitals/:id/features', authorize(USER_ROLES.SUPER_ADMIN), toggleHospitalFeatures);
router.put('/hospitals/:id/status', authorize(USER_ROLES.SUPER_ADMIN), toggleHospitalStatus);
router.put('/hospitals/:id/profile', authorize(...ROLE_GROUPS.ADMIN), updateHospitalProfile);
router.put('/hospitals/:id/geolocation', authorize(...ROLE_GROUPS.ADMIN), updateHospitalGeolocation);

// Prescription Print Setup & Template Management
router.get('/hospitals/:hospitalId/print-templates', authorize(...ROLE_GROUPS.ADMIN), getPrintTemplates);
router.get('/hospitals/:hospitalId/print-templates/active', authorize(...ROLE_GROUPS.ALL_STAFF), getActivePrintTemplate);
router.get('/hospitals/:hospitalId/print-template/active', authorize(...ROLE_GROUPS.ALL_STAFF), getActivePrintTemplate);
router.post('/hospitals/:hospitalId/print-templates', authorize(...ROLE_GROUPS.ADMIN), createPrintTemplate);
router.put('/print-templates/:id', authorize(...ROLE_GROUPS.ADMIN), updatePrintTemplate);
router.post('/print-templates/:id/activate', authorize(...ROLE_GROUPS.ADMIN), activatePrintTemplate);
router.post('/print-templates/:id/duplicate', authorize(...ROLE_GROUPS.ADMIN), duplicatePrintTemplate);

// Hospital Billing & Payment Workflow Settings
router.get('/hospital/billing-settings', authorize(USER_ROLES.SUPER_ADMIN, ...ROLE_GROUPS.ALL_STAFF), getBillingSettings);
router.put('/hospital/billing-settings', authorize(...ROLE_GROUPS.ADMIN), updateBillingSettings);

// License Management (Super Admin only - Commented out)
// router.get('/licenses', authorize(USER_ROLES.SUPER_ADMIN), getLicenses);
// router.post('/licenses', authorize(USER_ROLES.SUPER_ADMIN), createLicense);
// router.put('/licenses/:id/renew', authorize(USER_ROLES.SUPER_ADMIN), renewLicense);

// Platform Settings (Super Admin only - Commented out)
// router.get('/settings', authorize(USER_ROLES.SUPER_ADMIN), getSettings);
// router.post('/settings', authorize(USER_ROLES.SUPER_ADMIN), saveSettings);

// Branch Management (Super Admin & Doctor Admin only to create, all can view based on context)
router.post('/branches', authorize(...ROLE_GROUPS.ADMIN), validateMobileNumber, createBranch);
router.get('/branches', getBranches);
router.put('/branches/:id', authorize(...ROLE_GROUPS.ADMIN), updateBranch);

// Department Management (Super and Doctor admins can create/update/delete, all can view)
router.post('/departments', authorize(...ROLE_GROUPS.ADMIN), createDepartment);
router.get('/departments', authorize(USER_ROLES.SUPER_ADMIN, ...ROLE_GROUPS.ALL_STAFF), getDepartments);
router.put('/departments/:id', authorize(...ROLE_GROUPS.ADMIN), updateDepartment);
router.delete('/departments/:id', authorize(...ROLE_GROUPS.ADMIN), deleteDepartment);

// User Management (Admins only)
router.get('/users', authorize(USER_ROLES.SUPER_ADMIN, ...ROLE_GROUPS.ALL_STAFF), getUsers);
router.put('/users/:id', authorize(...ROLE_GROUPS.ADMIN), validateMobileNumber, checkUserMobileUniqueness, updateUser);
router.delete('/users/:id', authorize(...ROLE_GROUPS.ADMIN), deleteUser);
router.put('/users/:id/status', authorize(...ROLE_GROUPS.ADMIN), updateUserStatus);
router.put('/users/:id/doctor-profile', authorize(USER_ROLES.DOCTOR_ADMIN), updateDoctorProfile);

// Healthcare Services (Doctor Admin, Doctors, and Receptionist read-access; Admins manage)
router.get('/services', authorize(USER_ROLES.DOCTOR_ADMIN, USER_ROLES.DOCTOR, USER_ROLES.RECEPTIONIST, ...ROLE_GROUPS.ADMIN), getServices);
router.post('/services', authorize(...ROLE_GROUPS.ADMIN), createService);
router.put('/services/:id', authorize(...ROLE_GROUPS.ADMIN), updateService);
router.delete('/services/:id', authorize(...ROLE_GROUPS.ADMIN), deleteService);

// Role & Permission Metadata
router.get('/roles', authorize(USER_ROLES.SUPER_ADMIN, ...ROLE_GROUPS.ALL_STAFF), getRoles);
router.get('/permissions', authorize(USER_ROLES.SUPER_ADMIN), getPermissions);

// Security & Audit Logs (Admins only)
router.get('/audit-logs', authorize(...ROLE_GROUPS.ADMIN), getAuditLogs);
router.get('/login-history', authorize(...ROLE_GROUPS.ADMIN), getLoginHistory);

module.exports = router;
