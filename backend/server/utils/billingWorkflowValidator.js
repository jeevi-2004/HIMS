/**
 * Centralized Billing Workflow Validator & Policy Engine
 * Single source of truth for validating billing settings matrix across frontend & backend.
 */

const VALID_BILLING_MATRIX = [
  { feeDeterminationMode: 'Predefined', feeCollectionRole: 'Reception', paymentTiming: 'Before Consultation' },
  { feeDeterminationMode: 'Predefined', feeCollectionRole: 'Reception', paymentTiming: 'After Consultation' },
  { feeDeterminationMode: 'Predefined', feeCollectionRole: 'Doctor', paymentTiming: 'Before Consultation' },
  { feeDeterminationMode: 'Predefined', feeCollectionRole: 'Doctor', paymentTiming: 'After Consultation' },
  { feeDeterminationMode: 'Predefined', feeCollectionRole: 'Pharmacy', paymentTiming: 'After Consultation' },
  
  { feeDeterminationMode: 'On Consultation', feeCollectionRole: 'Reception', paymentTiming: 'After Consultation' },
  { feeDeterminationMode: 'On Consultation', feeCollectionRole: 'Doctor', paymentTiming: 'After Consultation' },
  { feeDeterminationMode: 'On Consultation', feeCollectionRole: 'Pharmacy', paymentTiming: 'After Consultation' }
];

const DEFAULT_BILLING_SETTINGS = {
  consultationFeeType: 'Predefined',
  feeCollectionRole: 'Reception',
  paymentTiming: 'Before Consultation',
  collectMedicineInPharmacy: true,
  enableConsolidatedBilling: true,
  emergencyQueuePriority: 'OVERRIDE'
};

/**
 * Validates a billing configuration object.
 * Returns { isValid: boolean, message?: string, sanitized?: object }
 */
const validateBillingConfiguration = (settings = {}) => {
  const feeDeterminationMode = settings.consultationFeeType || settings.feeDeterminationMode || 'Predefined';
  const feeCollectionRole = settings.feeCollectionRole || 'Reception';
  let paymentTiming = settings.paymentTiming || 'Before Consultation';

  // Rule 1: Pharmacy collects only after consultation
  if (feeCollectionRole === 'Pharmacy' && paymentTiming === 'Before Consultation') {
    return {
      isValid: false,
      message: 'Pharmacy can collect consultation payment only after consultation.'
    };
  }

  // Rule 2: On Consultation (Manual Entry) supports after-consultation payment only
  if (feeDeterminationMode === 'On Consultation' && paymentTiming === 'Before Consultation') {
    return {
      isValid: false,
      message: 'Manual consultation fee entry supports after-consultation payment only.'
    };
  }

  // Check against matrix
  const isMatch = VALID_BILLING_MATRIX.some(
    m => m.feeDeterminationMode === feeDeterminationMode &&
         m.feeCollectionRole === feeCollectionRole &&
         m.paymentTiming === paymentTiming
  );

  if (!isMatch) {
    return {
      isValid: false,
      message: `Invalid billing configuration combination: [${feeDeterminationMode} + ${feeCollectionRole} + ${paymentTiming}]`
    };
  }

  return {
    isValid: true,
    sanitized: {
      consultationFeeType: feeDeterminationMode,
      feeCollectionRole,
      paymentTiming,
      prescriptionDelivery: settings.prescriptionDelivery || 'internal_pharmacy',
      collectMedicineInPharmacy: feeCollectionRole === 'Pharmacy' ? true : (settings.collectMedicineInPharmacy !== false)
    }
  };
};

module.exports = {
  VALID_BILLING_MATRIX,
  DEFAULT_BILLING_SETTINGS,
  validateBillingConfiguration
};
