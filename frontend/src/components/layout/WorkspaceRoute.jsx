import React, { Suspense } from 'react';
import ProtectedRoute from '../../routes/ProtectedRoute';
import DashboardLayout from '../../layouts/DashboardLayout';
import PageLoader from '../common/PageLoader';

const WorkspaceRoute = ({
  children,
  allowedRoles,
  fallback = <PageLoader />
}) => {
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
