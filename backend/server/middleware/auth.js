const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');
const Role = require('../models/Role');
const UserSession = require('../models/UserSession');
const { tenantLocalStorage } = require('../utils/tenantModel');
const { getTenantConnection } = require('../utils/dbManager');

// Protect routes - verify token and active session
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route, no token provided'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);

    const executeInContext = async () => {
      // Check if session exists in DB (for active session tracking)
      let session = await UserSession.findOne({ token, userId: decoded.id });

      // Fallback: check central DB if session not found in tenant context
      if (!session && decoded.hospitalCode) {
        try {
          await tenantLocalStorage.run({ connection: null }, async () => {
            session = await UserSession.findOne({ token, userId: decoded.id });
          });
        } catch (e) {}
      }

      if (!session || session.expiresAt < new Date()) {
        // Invalidate if token session is expired or deleted
        if (session) {
          try { await UserSession.deleteOne({ _id: session._id }); } catch (e) {}
        }
        return res.status(401).json({
          success: false,
          message: 'Session expired or invalidated. Please login again.'
        });
      }

      // Get user and populate role
      let user = await User.findById(decoded.id).populate('roleId');
      
      // Fallback: check central DB if user not found in tenant context
      if (!user && decoded.hospitalCode) {
        try {
          await tenantLocalStorage.run({ connection: null }, async () => {
            user = await User.findById(decoded.id).populate('roleId');
          });
        } catch (e) {}
      }

      if (!user || user.status !== 'active') {
        return res.status(401).json({
          success: false,
          message: 'User no longer exists or account is deactivated'
        });
      }

      // Attach user and role to request
      req.user = user;
      req.token = token;
      next();
    };

    if (decoded.hospitalCode) {
      const conn = await getTenantConnection(decoded.hospitalCode);
      await tenantLocalStorage.run({ connection: conn }, executeInContext);
    } else {
      // Central database context
      await executeInContext();
    }
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token verification failed, not authorized'
    });
  }
};

// Check if user has specific role(s)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roleId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: No role assigned'
      });
    }

    const userRole = req.user.roleId.name;
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${userRole}' is not authorized to access this resource`
      });
    }
    next();
  };
};

// Check if user has specific permission string(s)
const hasPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roleId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Permissions cannot be resolved'
      });
    }

    // Super Admin has all permissions bypass
    if (req.user.roleId.name === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = req.user.roleId.permissions || [];
    
    // Check if user has all of the required permissions
    const hasAll = requiredPermissions.every(perm => userPermissions.includes(perm));
    if (!hasAll) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have the required permissions to perform this action'
      });
    }
    next();
  };
};

module.exports = {
  protect,
  authorize,
  hasPermission
};
