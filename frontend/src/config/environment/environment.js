/**
 * Enterprise Centralized Environment Variables & Fallbacks
 */

const getEnv = (key, fallback) => {
  return import.meta?.env?.[key] || fallback;
};

export const ENVIRONMENT = {
  NODE_ENV: getEnv('MODE', 'development'),
  IS_PRODUCTION: import.meta?.env?.PROD ?? false,
  IS_DEVELOPMENT: import.meta?.env?.DEV ?? true,
  
  API_BASE_URL: getEnv('VITE_API_BASE_URL', 'http://localhost:5000/api'),
  APP_NAME: getEnv('VITE_APP_NAME', 'VillZone Enterprise HIMS'),
  APP_VERSION: getEnv('VITE_APP_VERSION', '1.0.0'),
  BUILD_NUMBER: getEnv('VITE_BUILD_NUMBER', '2026.08.05.001'),
  
  MULTI_BRANCH_ENABLED: getEnv('VITE_MULTI_BRANCH_ENABLED', 'true') === 'true',
  LOGGING_ENABLED: getEnv('VITE_LOGGING_ENABLED', 'true') === 'true'
};

export const validateEnvironment = () => {
  if (!ENVIRONMENT.API_BASE_URL) {
    console.warn('[HIMS Config Warning] VITE_API_BASE_URL is undefined. Falling back to http://localhost:5000/api');
  }
};

validateEnvironment();

export default ENVIRONMENT;
