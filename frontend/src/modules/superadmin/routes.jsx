import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import WorkspaceRoute from '../../components/layout/WorkspaceRoute';
import { ROUTES } from '../../constants/routes';

// Super Admin Module Lazy-Loaded Page Components
const SuperAdminDashboard = lazy(() => import('../../pages/SuperAdminDashboard'));

const SUPER_ADMIN_ROLES = ['SUPER_ADMIN'];

export const superAdminRoutes = (
  <>
    {/* Base Module Redirect */}
    <Route 
      path={ROUTES.SUPER_ADMIN.BASE} 
      element={<Navigate to={ROUTES.SUPER_ADMIN.DASHBOARD} replace />} 
    />

    {/* Standardized Super Admin Workspaces */}
    <Route 
      path={ROUTES.SUPER_ADMIN.DASHBOARD} 
      element={
        <WorkspaceRoute allowedRoles={SUPER_ADMIN_ROLES}>
          <SuperAdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.SUPER_ADMIN.HOSPITALS} 
      element={
        <WorkspaceRoute allowedRoles={SUPER_ADMIN_ROLES}>
          <SuperAdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.SUPER_ADMIN.SUBSCRIPTIONS} 
      element={
        <WorkspaceRoute allowedRoles={SUPER_ADMIN_ROLES}>
          <SuperAdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.SUPER_ADMIN.PLANS} 
      element={
        <WorkspaceRoute allowedRoles={SUPER_ADMIN_ROLES}>
          <SuperAdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.SUPER_ADMIN.AUDIT_LOGS} 
      element={
        <WorkspaceRoute allowedRoles={SUPER_ADMIN_ROLES}>
          <SuperAdminDashboard />
        </WorkspaceRoute>
      } 
    />
    <Route 
      path={ROUTES.SUPER_ADMIN.SETTINGS} 
      element={
        <WorkspaceRoute allowedRoles={SUPER_ADMIN_ROLES}>
          <SuperAdminDashboard />
        </WorkspaceRoute>
      } 
    />
  </>
);
