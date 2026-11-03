/**
 * Enterprise Route Definitions (Phase 7 Standardized Hierarchy)
 */

export const ROUTES = {
  PUBLIC: {
    LOGIN: '/login',
    LOGIN_SUPERADMIN: '/login/superadmin'
  },
  DOCTOR: {
    BASE: '/doctor',
    DASHBOARD: '/doctor/dashboard',
    QUEUE: '/doctor/queue',
    TODAY_PATIENTS: '/doctor/queue', // Alias mapped to standardized queue
    CONSULTATION: '/doctor/consultation',
    PRESCRIPTIONS: '/doctor/prescriptions',
    COMPLETED_VISITS: '/doctor/completed',
    FOLLOW_UPS: '/doctor/follow-ups',
    MEDICAL_HISTORY: '/doctor/history',
    CLINICAL_MASTERS: '/doctor/clinical-masters',
    REPORTS: '/doctor/reports',
    // IPD sub-module (shown only when hospital has IPD enabled)
    IPD_DEPARTMENT: '/doctor/ipd',
    IPD_INPATIENTS: '/doctor/ipd/inpatients',
    IPD_WARDS: '/doctor/ipd/wards',
    IPD_DISCHARGE: '/doctor/ipd/discharge',
    IPD_REPORTS: '/doctor/ipd/reports'
  },
  RECEPTION: {
    BASE: '/reception',
    DASHBOARD: '/reception/dashboard',
    APPOINTMENTS: '/reception/appointments',
    BOOK_APPOINTMENTS: '/reception/appointment-booking',
    QUEUE: '/reception/queue',
    PRINT_QUEUE: '/reception/print-queue',
    BILLING: '/reception/billing',
    REPORTS: '/reception/reports',
    // IPD sub-module (shown only when hospital has IPD enabled)
    IPD_DEPARTMENT: '/reception/ipd',
    IPD_INPATIENTS: '/reception/ipd/inpatients',
    IPD_WARDS: '/reception/ipd/wards',
    IPD_DISCHARGE: '/reception/ipd/discharge',
    IPD_REPORTS: '/reception/ipd/reports'
  },
  PHARMACY: {
    BASE: '/pharmacy',
    DASHBOARD: '/pharmacy/dashboard',
    DISPENSE: '/pharmacy/dispense',
    IPD_DISPENSE: '/pharmacy/ipd-dispense',
    REPORTS: '/pharmacy/reports'
  },
  ADMIN: {
    BASE: '/admin',
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users',
    WORKFORCE: '/admin/workforce',
    DEPARTMENTS: '/admin/departments',
    DOCTORS: '/admin/doctors',
    PATIENTS: '/admin/patients',
    SERVICES: '/admin/services',
    WORKFLOW: '/admin/workflow',
    SETTINGS: '/admin/settings',
    REPORTS: '/admin/reports',
    DISPLAY_BOARD: '/display-board',
    PRESCRIPTION_PRINT: '/hospital/prescription-print',
    IPD_INPATIENTS: '/admin/ipd/inpatients',
    IPD_WARDS: '/admin/ipd/wards',
    IPD_DISCHARGE: '/admin/ipd/discharge',
    IPD_REPORTS: '/admin/ipd/reports'
  },
  SUPER_ADMIN: {
    BASE: '/superadmin',
    DASHBOARD: '/superadmin/dashboard',
    HOSPITALS: '/superadmin/hospitals',
    SUBSCRIPTIONS: '/superadmin/subscriptions',
    PLANS: '/superadmin/plans',
    AUDIT_LOGS: '/superadmin/audit-logs',
    SETTINGS: '/superadmin/settings'
  }
};

export default ROUTES;
