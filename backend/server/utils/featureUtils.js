/**
 * Centralized feature availability helpers for backend
 */

/**
 * Determines if the In-Patient Department (IPD) feature is available for a hospital.
 * Dual-control requirement: Both ipd_requested (from Add Hospital form) AND 
 * IPD feature module (from Feature Flags) must be true.
 * 
 * @param {Object} hospital - The hospital object containing ipd_requested and featureModules
 * @returns {boolean} True if IPD is available, false otherwise.
 */
const isIpdAvailable = (target) => {
  if (!target) return false;

  const hospital = target.hospital || target.hospitalInfo || target;
  const requested = Boolean(hospital?.ipd_requested ?? target?.ipd_requested);
  if (!requested) return false;

  const featModules = hospital?.featureModules || target?.featureModules;
  let enabled = false;
  if (featModules) {
    if (typeof featModules.get === 'function') {
      enabled = Boolean(featModules.get('IPD') || featModules.get('ipd'));
    } else if (typeof featModules === 'object') {
      enabled = Boolean(featModules.IPD || featModules.ipd);
    }
  }

  return requested && enabled;
};

/**
 * Determines if a specific feature module is enabled for a hospital or user.
 * 
 * @param {Object} target - The hospital or user object
 * @param {string} moduleKey - Key of the module (e.g. 'Laboratory', 'Radiology', 'IPD')
 * @returns {boolean} True if the module is enabled, false otherwise.
 */
const isFeatureModuleEnabled = (target, moduleKey) => {
  if (!target) return false;
  const normalizedKey = (moduleKey || '').toString().toLowerCase();
  
  const sources = [
    target?.featureModules,
    target?.hospital?.featureModules,
    target
  ];

  for (const src of sources) {
    if (!src) continue;
    if (typeof src.get === 'function') {
      if (src.has && src.has(moduleKey)) return Boolean(src.get(moduleKey));
      if (src.entries) {
        for (const [k, v] of src.entries()) {
          if (k && k.toString().toLowerCase() === normalizedKey) return Boolean(v);
        }
      }
    } else if (typeof src === 'object') {
      if (src[moduleKey] !== undefined) return Boolean(src[moduleKey]);
      const match = Object.keys(src).find(k => k.toLowerCase() === normalizedKey);
      if (match && src[match] !== undefined) return Boolean(src[match]);
    }
  }

  return false;
};

module.exports = {
  isIpdAvailable,
  isFeatureModuleEnabled
};
