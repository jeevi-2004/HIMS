import LOGGING_CONFIG from '../../config/logging';
import parseError from './errorParser';

export const logger = {
  info: (message, meta) => {
    if (LOGGING_CONFIG.ENABLE_CONSOLE) {
      console.info(`[HIMS INFO] ${message}`, meta || '');
    }
  },

  warn: (message, meta) => {
    if (LOGGING_CONFIG.ENABLE_CONSOLE) {
      console.warn(`[HIMS WARN] ${message}`, meta || '');
    }
  },

  error: (message, error) => {
    const parsed = parseError(error);
    if (LOGGING_CONFIG.ENABLE_CONSOLE) {
      console.error(`[HIMS ERROR] ${message}`, parsed);
    }
    // Reserved hook for future remote APM service (Sentry, LogRocket, Datadog)
  },

  debug: (message, meta) => {
    if (LOGGING_CONFIG.ENABLE_CONSOLE && LOGGING_CONFIG.ENABLE_DEBUG) {
      console.debug(`[HIMS DEBUG] ${message}`, meta || '');
    }
  }
};

export default logger;
