import React, { lazy } from 'react';
import { Route, Navigate, useParams } from 'react-router-dom';
import WorkspaceRoute from '../../components/layout/WorkspaceRoute';
import { ROUTES } from '../../constants/routes';
import { ROLE_GROUPS } from '../../constants/roles';

// Pharmacy Module Lazy-Loaded Page Components
const PharmacyDashboard = lazy(() => import('../../pages/PharmacyDashboard'));

// Parameter-preserving redirect for Pharmacy Billing
export const PharmacyBillingRedirect = () => {
  const params = useParams();
  const prescriptionId = params.prescriptionId;
  return <Navigate to={prescriptionId ? `${ROUTES.PHARMACY.DISPENSE}/${prescriptionId}` : ROUTES.PHARMACY.DISPENSE} replace />;
};

const PHARMACY_ROLES = ROLE_GROUPS.PHARMACY;

export const pharmacyRoutes = (
  <>
    {/* Base Module Redirect */}
    <Route 
      path={ROUTES.PHARMACY.BASE} 
      element={<Navigate to={ROUTES.PHARMACY.DASHBOARD} replace />} 
    />

    {/* Standardized Pharmacy Dashboard Routes */}
    {[
      ROUTES.PHARMACY.DASHBOARD,
      ROUTES.PHARMACY.DISPENSE,
      ROUTES.PHARMACY.REPORTS
    ].map((path) => (
      <Route 
        key={path}
        path={path} 
        element={
          <WorkspaceRoute allowedRoles={PHARMACY_ROLES}>
            <PharmacyDashboard />
          </WorkspaceRoute>
        } 
      />
    ))}
    <Route 
      path={`${ROUTES.PHARMACY.DISPENSE}/:prescriptionId`} 
      element={
        <WorkspaceRoute allowedRoles={PHARMACY_ROLES}>
          <PharmacyDashboard />
        </WorkspaceRoute>
      } 
    />

    {/* IPD Dispense Desk Route - Strictly conditional on IPD feature flag */}
    <Route 
      path={ROUTES.PHARMACY.IPD_DISPENSE} 
      element={
        <WorkspaceRoute allowedRoles={PHARMACY_ROLES} featureFlag="IPD">
          <PharmacyDashboard />
        </WorkspaceRoute>
      } 
    />

    <Route path="/pharmacy/settings" element={<Navigate to={ROUTES.PHARMACY.DASHBOARD} replace />} />
    <Route path="/pharmacy/purchase" element={<Navigate to={ROUTES.PHARMACY.DISPENSE} replace />} />
    <Route path="/pharmacy/stock" element={<Navigate to={ROUTES.PHARMACY.DISPENSE} replace />} />
    <Route path="/pharmacy/medicine-master" element={<Navigate to={ROUTES.PHARMACY.DISPENSE} replace />} />
    <Route path="/pharmacy/suppliers" element={<Navigate to={ROUTES.PHARMACY.DISPENSE} replace />} />
    <Route path="/pharmacy/history" element={<Navigate to={ROUTES.PHARMACY.DISPENSE} replace />} />
    <Route path="/pharmacy/dispense/history" element={<Navigate to={ROUTES.PHARMACY.DISPENSE} replace />} />
    <Route path="/pharmacy/dispense/queue" element={<Navigate to={ROUTES.PHARMACY.DISPENSE} replace />} />
    <Route path="/pharmacy/billing/:prescriptionId" element={<PharmacyBillingRedirect />} />
    <Route path="/pharmacy/billing" element={<PharmacyBillingRedirect />} />
  </>
);
