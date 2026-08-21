import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import WorkspaceRoute from '../../components/layout/WorkspaceRoute';
import { ROUTES } from '../../constants/routes';
import { USER_ROLES, ROLE_GROUPS } from '../../constants/roles';

// Hospital Admin Module Lazy-Loaded Page Components
const AdminDashboard = lazy(() => import('../../pages/AdminDashboard'));
const DigitalDisplayBoard = lazy(() => import('../../pages/DigitalDisplayBoard'));
const HospitalBillingWorkflowSettings = lazy(() => import('../../pages/HospitalBillingWorkflowSettings'));
const BillingTransactions = lazy(() => import('../../pages/BillingTransactions'));
const HospitalPrescriptionPrintConfiguration = lazy(() => import('../../pages/HospitalPrescriptionPrintConfiguration'));
const SuperAdminDashboard = lazy(() => import('../../pages/SuperAdminDashboard'));

const ADMIN_ROLES = ROLE_GROUPS.ADMIN;

export const adminRoutes = (
  <>
    {/* Base Module Redirect */}
    <Route 
      path={ROUTES.ADMIN.BASE} 
      element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} 
    />

    {/* Standardized Hospital Admin Workspaces */}
    <Route 
      path={ROUTES.ADMIN.DASHBOARD} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <AdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.WORKFORCE} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <AdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.DEPARTMENTS} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <AdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.PATIENTS} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <AdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.SERVICES} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <AdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.WORKFLOW} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <HospitalBillingWorkflowSettings />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.SETTINGS} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <HospitalBillingWorkflowSettings />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path="/admin/billing/transactions" 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <BillingTransactions />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.REPORTS} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <AdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.ADMIN.PRESCRIPTION_PRINT} 
      element={
        <WorkspaceRoute allowedRoles={ADMIN_ROLES}>
          <HospitalPrescriptionPrintConfiguration />
        </WorkspaceRoute>
      } 
    />

    {/* Fallback tabs for Super Admin System Modules */}
    <Route path="/features" element={<WorkspaceRoute allowedRoles={['SUPER_ADMIN']}><SuperAdminDashboard /></WorkspaceRoute>} />


    {/* Legacy Compatibility Redirects */}
    <Route path="/admin/live-operations" element={<Navigate to="/display-board" replace />} />
    <Route path="/hospitals" element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
    <Route path="/branches" element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
    <Route path="/departments" element={<Navigate to={ROUTES.ADMIN.DEPARTMENTS} replace />} />
    <Route path="/users" element={<Navigate to={ROUTES.ADMIN.WORKFORCE} replace />} />
    <Route path="/admin/users" element={<Navigate to={ROUTES.ADMIN.WORKFORCE} replace />} />
    <Route path="/admin/doctors" element={<Navigate to={ROUTES.ADMIN.WORKFORCE} replace />} />
    <Route path="/services" element={<Navigate to={ROUTES.ADMIN.SERVICES} replace />} />
    <Route path="/doctors" element={<Navigate to={ROUTES.ADMIN.WORKFORCE} replace />} />
    <Route path="/staff" element={<Navigate to={ROUTES.ADMIN.WORKFORCE} replace />} />
    <Route path="/hospital-profile" element={<Navigate to={ROUTES.ADMIN.SETTINGS} replace />} />
    <Route path="/consultation-fees" element={<Navigate to={ROUTES.ADMIN.SERVICES} replace />} />
    <Route path="/finance/billing" element={<Navigate to={ROUTES.ADMIN.REPORTS} replace />} />
    <Route path="/finance/pharmacy" element={<Navigate to={ROUTES.ADMIN.REPORTS} replace />} />
    <Route path="/settings/working-hours" element={<Navigate to={ROUTES.ADMIN.SETTINGS} replace />} />
    <Route path="/audit-logs" element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
    <Route path="/login-history" element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
    <Route path="/plans" element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
    <Route path="/admin/billing-settings" element={<Navigate to={ROUTES.ADMIN.SETTINGS} replace />} />
    <Route path="/reports" element={<Navigate to={ROUTES.ADMIN.REPORTS} replace />} />
  </>
);
