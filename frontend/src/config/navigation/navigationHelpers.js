import { doctorNavigation } from './doctorNavigation';
import { receptionNavigation } from './receptionNavigation';
import { pharmacyNavigation } from './pharmacyNavigation';
import { adminNavigation } from './adminNavigation';
import { superAdminNavigation } from './superAdminNavigation';
import { USER_ROLES } from '../../constants/roles';

export const getNavigationByRole = (userRole, workspaceMode) => {
  if (userRole === USER_ROLES.SUPER_ADMIN) {
    return superAdminNavigation;
  }
  if (userRole === USER_ROLES.RECEPTIONIST) {
    return receptionNavigation;
  }
  if (userRole === USER_ROLES.PHARMACIST) {
    return pharmacyNavigation;
  }
  if (userRole === USER_ROLES.DOCTOR_ADMIN) {
    if (workspaceMode === 'clinical_consultation') {
      return doctorNavigation;
    }
    return adminNavigation;
  }
  if (userRole === USER_ROLES.DOCTOR) {
    return doctorNavigation;
  }
  return adminNavigation;
};

export const filterNavigationByPermission = (items = [], userPermissions = []) => {
  if (!userPermissions || userPermissions.length === 0) return items;
  return items.filter((item) => {
    if (!item.permission) return true;
    return userPermissions.includes(item.permission);
  });
};

export const filterNavigationByFeatureFlags = (items = [], activeFlags = {}) => {
  return items.filter((item) => {
    if (!item.featureFlag) return true;
    return Boolean(activeFlags[item.featureFlag]);
  });
};
