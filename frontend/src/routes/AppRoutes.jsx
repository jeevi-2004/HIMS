import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import DashboardLayout from '../layouts/DashboardLayout';
import Login from '../pages/Login';
import Profile from '../pages/Profile';
import NotFound from '../pages/NotFound';
import WorkspaceRoute from '../components/layout/WorkspaceRoute';
import PageLoader from '../components/common/PageLoader';
import ErrorBoundary from '../components/error/ErrorBoundary';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { ROUTES } from '../constants/routes';

// Import Domain Module Route Collections
import { doctorRoutes } from '../modules/doctor/routes';
import { receptionRoutes } from '../modules/reception/routes';
import { pharmacyRoutes } from '../modules/pharmacy/routes';
import { adminRoutes } from '../modules/admin/routes';
import { superAdminRoutes } from '../modules/superadmin/routes';

// Lazy-loaded Standalone Pages
const DigitalDisplayBoard = lazy(() => import('../pages/DigitalDisplayBoard'));

import { USER_ROLES } from '../constants/roles';

// Dynamic resolver for the base dashboard home redirect only
const DashboardHome = () => {
  const { user } = useAuth();
  const { workspaceMode } = useWorkspace();

  if (!user) {
    return <Navigate to={ROUTES.PUBLIC.LOGIN} replace />;
  }

  const role = (user.role || '').toUpperCase().replace(/ /g, '_');

  if (role === USER_ROLES.SUPER_ADMIN || role === 'SUPER_ADMIN' || role === 'SUPERADMIN' || role === 'SUPER_ADMIN_ROLE') {
    return <Navigate to={ROUTES.SUPER_ADMIN.DASHBOARD} replace />;
  }

  if (role === USER_ROLES.ADMIN || role === 'ADMIN' || role === 'HOSPITAL_ADMIN') {
    return <Navigate to={ROUTES.ADMIN.DASHBOARD} replace />;
  }

  if (role === USER_ROLES.DOCTOR_ADMIN || role === 'DOCTOR_ADMIN' || role === 'DOCTORADMIN') {
    if (workspaceMode === 'clinical_consultation') {
      return <Navigate to={ROUTES.DOCTOR.DASHBOARD} replace />;
    }
    return <Navigate to={ROUTES.ADMIN.DASHBOARD} replace />;
  }

  if (role === USER_ROLES.DOCTOR || role === 'DOCTOR') {
    return <Navigate to={ROUTES.DOCTOR.DASHBOARD} replace />;
  }

  if (role === USER_ROLES.RECEPTIONIST || role === 'RECEPTIONIST' || role === 'RECEPTION') {
    return <Navigate to={ROUTES.RECEPTION.DASHBOARD} replace />;
  }

  if (role === USER_ROLES.PHARMACIST || role === 'PHARMACIST' || role === 'PHARMACY') {
    return <Navigate to={ROUTES.PHARMACY.DASHBOARD} replace />;
  }

  // Fallback for any other valid logged in user (e.g. Owner/Admin/Custom Role)
  return <Navigate to={ROUTES.ADMIN.DASHBOARD} replace />;
};

const AppRoutes = () => {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/login/superadmin" element={<Login />} />

          {/* Protected Base Redirect */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardHome />
              </ProtectedRoute>
            } 
          />

          {/* Super Admin Domain Routes */}
          {superAdminRoutes}

          {/* Hospital Admin Domain Routes */}
          {adminRoutes}

          {/* Doctor & Clinical Domain Routes */}
          {doctorRoutes}

          {/* Receptionist Domain Routes */}
          {receptionRoutes}

          {/* Pharmacy Domain Routes */}
          {pharmacyRoutes}

          {/* Shared Profile Route */}
          <Route 
            path="/profile" 
            element={
              <WorkspaceRoute>
                <Profile />
              </WorkspaceRoute>
            } 
          />

          {/* Digital Display Board (TV Queue Screen) */}
          <Route path="/display-board" element={<DigitalDisplayBoard />} />

          {/* Fallback Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};

export default AppRoutes;
