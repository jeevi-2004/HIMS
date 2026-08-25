import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import WorkspaceRoute from '../../components/layout/WorkspaceRoute';
import { ROUTES } from '../../constants/routes';
import { ROLE_GROUPS } from '../../constants/roles';

// Reception Module Lazy-Loaded Page Components
const ReceptionistDashboard = lazy(() => import('../../pages/ReceptionistDashboard'));
const ReceptionistAppointments = lazy(() => import('../../pages/ReceptionistAppointments'));
const AppointmentBookingModule = lazy(() => import('./pages/AppointmentBookingModule'));
const ReceptionistLiveQueue = lazy(() => import('../../pages/ReceptionistLiveQueue'));
const ReceptionistPrintQueue = lazy(() => import('../../pages/ReceptionistPrintQueue'));
const ReceptionistReports = lazy(() => import('../../pages/ReceptionistReports'));

const RECEPTION_ROLES = ROLE_GROUPS.RECEPTION;

export const receptionRoutes = (
  <>
    {/* Base Module Redirect */}
    <Route 
      path={ROUTES.RECEPTION.BASE} 
      element={<Navigate to={ROUTES.RECEPTION.DASHBOARD} replace />} 
    />

    {/* Standardized Reception Workspaces */}
    <Route 
      path={ROUTES.RECEPTION.DASHBOARD} 
      element={
        <WorkspaceRoute allowedRoles={RECEPTION_ROLES}>
          <ReceptionistDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.RECEPTION.APPOINTMENTS} 
      element={
        <WorkspaceRoute allowedRoles={RECEPTION_ROLES}>
          <ReceptionistAppointments />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.RECEPTION.BOOK_APPOINTMENTS} 
      element={
        <WorkspaceRoute allowedRoles={RECEPTION_ROLES}>
          <AppointmentBookingModule />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.RECEPTION.QUEUE} 
      element={
        <WorkspaceRoute allowedRoles={RECEPTION_ROLES}>
          <ReceptionistLiveQueue />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.RECEPTION.PRINT_QUEUE} 
      element={
        <WorkspaceRoute allowedRoles={RECEPTION_ROLES}>
          <ReceptionistPrintQueue />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.RECEPTION.BILLING} 
      element={
        <WorkspaceRoute allowedRoles={RECEPTION_ROLES}>
          <ReceptionistAppointments />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.RECEPTION.REPORTS} 
      element={
        <WorkspaceRoute allowedRoles={RECEPTION_ROLES}>
          <ReceptionistReports />
        </WorkspaceRoute>
      } 
    />

    {/* Legacy Compatibility Redirects */}
    <Route path="/reception/today-patients" element={<Navigate to={ROUTES.RECEPTION.APPOINTMENTS} replace />} />
    <Route path="/reception/patient-registration" element={<Navigate to={ROUTES.RECEPTION.APPOINTMENTS} replace />} />
    <Route path="/reception/register" element={<Navigate to={ROUTES.RECEPTION.APPOINTMENTS} replace />} />
    <Route path="/reception/registration" element={<Navigate to={ROUTES.RECEPTION.APPOINTMENTS} replace />} />
    <Route path="/reception/token-queue" element={<Navigate to={ROUTES.RECEPTION.APPOINTMENTS} replace />} />
    <Route path="/reception/vitals" element={<Navigate to={ROUTES.RECEPTION.APPOINTMENTS} replace />} />
  </>
);
