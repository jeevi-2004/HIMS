import { doctorNavigation } from './doctorNavigation';
import { receptionNavigation } from './receptionNavigation';
import { pharmacyNavigation } from './pharmacyNavigation';
import { adminNavigation } from './adminNavigation';
import { superAdminNavigation } from './superAdminNavigation';
import { USER_ROLES } from '../../constants/roles';

export const getNavigationByRole = (userRole, workspaceMode, hospitalMode = 'FULL_DIGITAL') => {
  let navItems = [];
  if (userRole === USER_ROLES.SUPER_ADMIN) {
    navItems = superAdminNavigation;
  } else if (userRole === USER_ROLES.RECEPTIONIST) {
    navItems = receptionNavigation;
  } else if (userRole === USER_ROLES.PHARMACIST) {
    navItems = pharmacyNavigation;
  } else if (userRole === USER_ROLES.DOCTOR_ADMIN) {
    navItems = workspaceMode === 'clinical_consultation' ? doctorNavigation : adminNavigation;
  } else if (userRole === USER_ROLES.DOCTOR) {
    navItems = doctorNavigation;
  } else {
    navItems = adminNavigation;
  }

  if (hospitalMode === 'TOKEN_ONLY') {
    return navItems.filter(item => item.id !== 'doctor.consultation' && item.id !== 'doctor.masters');
  }

  return navItems;
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
