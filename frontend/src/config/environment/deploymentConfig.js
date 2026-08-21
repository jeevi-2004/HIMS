/**
 * Deployment Environments Configuration Profile
 */

export const DEPLOYMENT_PROFILES = {
  DEVELOPMENT: {
    envName: 'Development',
    enableDevTools: true,
    strictMode: true
  },
  STAGING: {
    envName: 'Staging',
    enableDevTools: true,
    strictMode: false
  },
  PRODUCTION: {
    envName: 'Production',
    enableDevTools: false,
    strictMode: false
  }
};

export const getDeploymentProfile = (mode) => {
  if (mode === 'production') return DEPLOYMENT_PROFILES.PRODUCTION;
  if (mode === 'staging') return DEPLOYMENT_PROFILES.STAGING;
  return DEPLOYMENT_PROFILES.DEVELOPMENT;
};

export default DEPLOYMENT_PROFILES;
