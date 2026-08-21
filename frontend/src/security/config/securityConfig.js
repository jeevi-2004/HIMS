/**
 * Enterprise Security Configuration
 */

export const SECURITY_CONFIG = {
  SESSION_TIMEOUT_MS: 8 * 60 * 60 * 1000, // 8 hours
  IDLE_TIMEOUT_MS: 30 * 60 * 1000,       // 30 minutes
  AUDIT_ENABLED: true,
  ACTIVITY_TRACKING_ENABLED: true,
  SECURE_STORAGE_ENABLED: true
};

export default SECURITY_CONFIG;
