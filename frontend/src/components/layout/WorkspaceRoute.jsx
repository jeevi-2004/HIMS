import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from '../../routes/ProtectedRoute';
import DashboardLayout from '../../layouts/DashboardLayout';
import PageLoader from '../common/PageLoader';
import { useAuth } from '../../context/AuthContext';
import { isIpdAvailable } from '../../utils/featureUtils';

const WorkspaceRoute = ({
  children,
  allowedRoles,
  featureFlag,
  fallback = <PageLoader />
}) => {
  const { user } = useAuth();

  if (featureFlag === 'IPD' && !isIpdAvailable(user?.hospital || user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <DashboardLayout>
        <Suspense fallback={fallback}>
          {children}
        </Suspense>
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default WorkspaceRoute;
