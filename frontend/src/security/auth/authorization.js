import PERMISSIONS from '../../constants/permissions';
import USER_ROLES from '../../constants/roles';

export const authorization = {
  hasPermission: (userPermissions, requiredPermission) => {
    if (!requiredPermission) return true;
    if (!userPermissions || !Array.isArray(userPermissions)) return false;
    return userPermissions.includes(requiredPermission) || userPermissions.includes(PERMISSIONS.ALL);
  },

  hasRole: (userRole, requiredRole) => {
    if (!requiredRole) return true;
    if (!userRole) return false;
    return String(userRole).toUpperCase() === String(requiredRole).toUpperCase();
  },

  hasAnyRole: (userRole, allowedRoles = []) => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    if (!userRole) return false;
    const current = String(userRole).toUpperCase();
    return allowedRoles.some((role) => String(role).toUpperCase() === current);
  },

  canView: (userPermissions, permission) => authorization.hasPermission(userPermissions, permission),
  canCreate: (userPermissions, permission) => authorization.hasPermission(userPermissions, permission),
  canEdit: (userPermissions, permission) => authorization.hasPermission(userPermissions, permission),
  canDelete: (userPermissions, permission) => authorization.hasPermission(userPermissions, permission),
  canPrint: (userPermissions, permission) => authorization.hasPermission(userPermissions, permission),
  canExport: (userPermissions, permission) => authorization.hasPermission(userPermissions, permission)
};

export default authorization;
