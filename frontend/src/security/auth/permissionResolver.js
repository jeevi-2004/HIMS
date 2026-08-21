import authorization from './authorization';

export const resolvePermissions = (user) => {
  if (!user) return [];

  // Super Admin bypass
  if (user.role === 'SUPER_ADMIN' || user.roleId?.name === 'SUPER_ADMIN') {
    return ['*'];
  }

  // Parse permissions from roleId or direct permissions array
  if (Array.isArray(user.permissions)) {
    return user.permissions;
  }

  if (user.roleId && Array.isArray(user.roleId.permissions)) {
    return user.roleId.permissions.map((p) => (typeof p === 'string' ? p : p.name || p.code));
  }

  return [];
};

export default resolvePermissions;
