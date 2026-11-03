import { doctorNavigation } from './doctorNavigation';
import { receptionNavigation } from './receptionNavigation';
import { pharmacyNavigation } from './pharmacyNavigation';
import { adminNavigation } from './adminNavigation';
import { superAdminNavigation } from './superAdminNavigation';
import { USER_ROLES } from '../../constants/roles';

import { isIpdAvailable } from '../../utils/featureUtils';

export const getNavigationByRole = (userRole, workspaceMode, hospitalMode = 'FULL_DIGITAL', user = null) => {
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
  } else if (userRole === USER_ROLES.ADMIN) {
    navItems = adminNavigation;
  } else {
    navItems = adminNavigation;
  }

  if (hospitalMode === 'TOKEN_ONLY') {
    navItems = navItems.filter(item => item.id !== 'doctor.consultation' && item.id !== 'doctor.masters');
  }

  // Filter out IPD items and submenus if IPD is not available for this hospital
  if (!isIpdAvailable(user?.hospital || user)) {
    navItems = navItems
      .filter(item => item.featureFlag !== 'IPD' && !item.id?.toLowerCase().includes('ipd'))
      .map(item => {
        if (item.submenu) {
          return {
            ...item,
            submenu: item.submenu.filter(sub => sub.featureFlag !== 'IPD' && !sub.id?.toLowerCase().includes('ipd'))
          };
        }
        return item;
      });
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
