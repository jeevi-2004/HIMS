import React, { lazy } from 'react';
import { Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import WorkspaceRoute from '../../components/layout/WorkspaceRoute';
import { ROUTES } from '../../constants/routes';
import { ROLE_GROUPS } from '../../constants/roles';

// Doctor Module Lazy-Loaded Page Components
const DoctorDashboard = lazy(() => import('../../pages/DoctorDashboard'));
const DoctorTodayQueue = lazy(() => import('../../pages/DoctorTodayQueue'));
const DoctorConsultation = lazy(() => import('../../pages/DoctorConsultation'));
const DoctorCompletedVisits = lazy(() => import('../../pages/DoctorCompletedVisits'));
const DoctorFollowUps = lazy(() => import('../../pages/DoctorFollowUps'));
const DoctorReports = lazy(() => import('../../pages/DoctorReports'));
const DoctorClinicalMasters = lazy(() => import('../../pages/DoctorClinicalMasters'));
const DoctorPatientSearch = lazy(() => import('../../pages/DoctorPatientSearch'));

// Reused IPD Pages — same components as Admin IPD, no new pages needed
const IPDDepartmentPage = lazy(() => import('../../pages/ipd/IPDDepartmentPage'));
const Inpatients = lazy(() => import('../../pages/ipd/Inpatients'));
const WardsBeds = lazy(() => import('../../pages/ipd/WardsBeds'));
const Discharge = lazy(() => import('../../pages/ipd/Discharge'));
const IPDReports = lazy(() => import('../../pages/ipd/IPDReports'));

// Keyed wrapper for Doctor Consultation workspace to guarantee 100% component unmounting and state isolation when switching patients
export const DoctorConsultationKeyed = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const activeVisitId = params.visitId || params.appointmentId || params.consultationId || searchParams.get('visitId') || searchParams.get('appointmentId') || searchParams.get('consultationId') || 'new_workspace';

  return <DoctorConsultation key={activeVisitId} />;
};

const DOCTOR_ROLES = ROLE_GROUPS.CLINICAL;

export const doctorRoutes = (
  <>
    {/* Base Module Redirect */}
    <Route 
      path={ROUTES.DOCTOR.BASE} 
      element={<Navigate to={ROUTES.DOCTOR.DASHBOARD} replace />} 
    />

    {/* Primary Doctor Standalone Workspaces */}
    <Route 
      path={ROUTES.DOCTOR.DASHBOARD} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES}>
          <DoctorDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.QUEUE} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES}>
          <DoctorTodayQueue />
        </WorkspaceRoute>
      } 
    />

    {/* Consultation Workspace Routes */}
    <Route 
      path={`${ROUTES.DOCTOR.CONSULTATION}/:visitId`} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES}>
          <DoctorConsultationKeyed />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.CONSULTATION} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES}>
          <DoctorConsultationKeyed />
        </WorkspaceRoute>
      } 
    />

    {/* Prescription Redirect to Consultation */}
    <Route 
      path={`${ROUTES.DOCTOR.PRESCRIPTIONS}/:visitId`} 
      element={<Navigate to={`${ROUTES.DOCTOR.CONSULTATION}/:visitId`} replace />} 
    />
    <Route 
      path={ROUTES.DOCTOR.PRESCRIPTIONS} 
      element={<Navigate to={ROUTES.DOCTOR.QUEUE} replace />} 
    />

    <Route 
      path={ROUTES.DOCTOR.COMPLETED_VISITS} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES}>
          <DoctorCompletedVisits />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.FOLLOW_UPS} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES}>
          <DoctorFollowUps />
        </WorkspaceRoute>
      } 
    />

    <Route 
      path={ROUTES.DOCTOR.CLINICAL_MASTERS} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES}>
          <DoctorClinicalMasters />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.REPORTS} 
      element={<Navigate to={ROUTES.DOCTOR.DASHBOARD} replace />} 
    />

    {/* Medical History & Patient Case Sheet Workspace */}
    <Route 
      path={ROUTES.DOCTOR.MEDICAL_HISTORY} 
      element={
        <WorkspaceRoute allowedRoles={ROLE_GROUPS.ALL_STAFF}>
          <DoctorPatientSearch />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path="/clinical/medical-history" 
      element={
        <WorkspaceRoute allowedRoles={ROLE_GROUPS.ALL_STAFF}>
          <DoctorPatientSearch />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path="/doctor/patient-search" 
      element={
        <WorkspaceRoute allowedRoles={ROLE_GROUPS.ALL_STAFF}>
          <DoctorPatientSearch />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path="/doctor/patient-history" 
      element={
        <WorkspaceRoute allowedRoles={ROLE_GROUPS.ALL_STAFF}>
          <DoctorPatientSearch />
        </WorkspaceRoute>
      } 
    />

    {/* IPD Department Routes — gated by featureFlag="IPD" */}
    <Route 
      path="/doctor/ipd" 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES} featureFlag="IPD">
          <IPDDepartmentPage />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.IPD_DEPARTMENT} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES} featureFlag="IPD">
          <IPDDepartmentPage />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.IPD_INPATIENTS} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES} featureFlag="IPD">
          <Inpatients />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.IPD_WARDS} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES} featureFlag="IPD">
          <WardsBeds />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.IPD_DISCHARGE} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES} featureFlag="IPD">
          <Discharge />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.DOCTOR.IPD_REPORTS} 
      element={
        <WorkspaceRoute allowedRoles={DOCTOR_ROLES} featureFlag="IPD">
          <IPDReports />
        </WorkspaceRoute>
      } 
    />

    {/* Legacy Compatibility Redirects */}
    <Route path="/clinical/today-patients" element={<Navigate to={ROUTES.DOCTOR.QUEUE} replace />} />
    <Route path="/today-patients" element={<Navigate to={ROUTES.DOCTOR.QUEUE} replace />} />
    <Route path="/doctor/queue" element={<Navigate to={ROUTES.DOCTOR.QUEUE} replace />} />
    <Route path="/doctor/patients" element={<Navigate to={ROUTES.DOCTOR.QUEUE} replace />} />
    <Route path="/doctor/consultations/:visitId" element={<Navigate to={`${ROUTES.DOCTOR.CONSULTATION}/:visitId`} replace />} />
    <Route path="/doctor/consultations" element={<Navigate to={ROUTES.DOCTOR.CONSULTATION} replace />} />
    <Route path="/clinical/consultation/:visitId" element={<Navigate to={`${ROUTES.DOCTOR.CONSULTATION}/:visitId`} replace />} />
    <Route path="/clinical/consultation" element={<Navigate to={ROUTES.DOCTOR.CONSULTATION} replace />} />
    <Route path="/clinical/start-consultation/:visitId" element={<Navigate to={`${ROUTES.DOCTOR.CONSULTATION}/:visitId`} replace />} />
    <Route path="/clinical/start-consultation" element={<Navigate to={ROUTES.DOCTOR.CONSULTATION} replace />} />
    <Route path="/clinical/prescription/:visitId" element={<Navigate to={`${ROUTES.DOCTOR.PRESCRIPTIONS}/:visitId`} replace />} />
    <Route path="/clinical/prescription" element={<Navigate to={ROUTES.DOCTOR.PRESCRIPTIONS} replace />} />
    <Route path="/clinical/completed-visits" element={<Navigate to={ROUTES.DOCTOR.COMPLETED_VISITS} replace />} />
    <Route path="/clinical/follow-ups" element={<Navigate to={ROUTES.DOCTOR.FOLLOW_UPS} replace />} />

    <Route path="/clinical-masters" element={<Navigate to={ROUTES.DOCTOR.CLINICAL_MASTERS} replace />} />
  </>
);
