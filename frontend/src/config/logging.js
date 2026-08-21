/**
 * Enterprise Logging & Monitoring Configuration
 */

export const LOGGING_CONFIG = {
  ENABLE_CONSOLE: process.env.NODE_ENV !== 'production',
  ENABLE_DEBUG: true,
  ENABLE_REMOTE_LOGGING: false,
  LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
};

export default LOGGING_CONFIG;
