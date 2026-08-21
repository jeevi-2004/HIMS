/**
 * Centralized Workflow Permission Engine for VillZone HIMS
 * Evaluates action visibility, enablement, and locks dynamically based on Hospital Admin Billing Settings.
 */

export const createWorkflowEngine = (billingSettings = {}, currentUserRole = '') => {
  const getPolicy = (patient) => {
    if (patient?.billingPolicySnapshot?.feeCollectionRole) {
      return patient.billingPolicySnapshot;
    }
    return {
      feeCollectionRole: billingSettings.feeCollectionRole || 'Reception',
      consultationFeeType: billingSettings.consultationFeeType || 'Predefined',
      paymentTiming: billingSettings.paymentTiming || 'Before Consultation'
    };
  };

  const feeCollectionRole = billingSettings.feeCollectionRole || 'Reception'; // 'Reception' | 'Doctor' | 'Pharmacy'
  const paymentTiming = billingSettings.paymentTiming || 'Before Consultation'; // 'Before Consultation' | 'After Consultation'
  const collectMedicineInPharmacy = billingSettings.collectMedicineInPharmacy !== false;

  const isPaidOrExempt = (patient) => {
    if (!patient) return false;
    const bStatus = patient.billingStatus || patient.paymentStatus;
    return bStatus === 'Paid' || bStatus === 'Exempt';
  };

  return {
    feeCollectionRole,
    paymentTiming,
    collectMedicineInPharmacy,

    // Helper checks
    isReceptionCollector: feeCollectionRole === 'Reception',
    isDoctorCollector: feeCollectionRole === 'Doctor',
    isPharmacyCollector: feeCollectionRole === 'Pharmacy',
    isBeforeConsultation: paymentTiming === 'Before Consultation',
    isAfterConsultation: paymentTiming === 'After Consultation',

    /**
     * Doctor: Can edit Consultation Fee in Consultation Workspace?
     * Rule:
     * - Disabled (Read Only) if Predefined Fee Structure AND Reception Role AND Before Consultation.
     * - Disabled if payment is already marked Paid.
     * - Editable if Flexible Entry (On Consultation) OR Payment After Consultation.
     */
    canDoctorEditFee(appointment) {
      const isPredefinedBeforeReception = (billingSettings.consultationFeeType || 'Predefined') === 'Predefined' && 
                                         feeCollectionRole === 'Reception' && 
                                         paymentTiming === 'Before Consultation';
      const isPaid = isPaidOrExempt(appointment);
      return !isPaid && !isPredefinedBeforeReception;
    },

    /**
     * Receptionist: Can Call Patient into room?
     * Rule:
     * - If Reception collects BEFORE consultation: disabled until payment is Paid or Exempt.
     * - In all other matrix cases: enabled immediately.
     */
    canCallPatient(patient) {
      if (!patient) return false;
      const pol = getPolicy(patient);
      if (pol.feeCollectionRole === 'Reception' && pol.paymentTiming === 'Before Consultation') {
        return isPaidOrExempt(patient);
      }
      return true;
    },

    getCallPatientLockReason(patient) {
      const pol = getPolicy(patient);
      if (pol.feeCollectionRole === 'Reception' && pol.paymentTiming === 'Before Consultation' && !isPaidOrExempt(patient)) {
        return 'Payment Pending — Reception must collect consultation fee before calling patient';
      }
      return null;
    },

    /**
     * Doctor: Can Doctor Start Consultation?
     * Rule:
     * - Reception + Before Consultation: disabled until Paid or Exempt.
     * - Doctor + Before Consultation: disabled until Paid or Exempt (collected by Doctor).
     * - All other timing/role combinations: enabled immediately.
     */
    canStartConsultation(patient) {
      if (!patient) return false;
      const isEmg = patient.isEmergency || patient.priorityLevel === 'EMERGENCY' || patient.priority === 'EMERGENCY' || (patient.consultationType || '').toLowerCase() === 'emergency' || (patient.tokenNumber || '').startsWith('EMG');
      if (isEmg) return true;

      const pol = getPolicy(patient);
      if (pol.feeCollectionRole === 'Reception' && pol.paymentTiming === 'Before Consultation') {
        return isPaidOrExempt(patient);
      }
      if (pol.feeCollectionRole === 'Doctor' && pol.paymentTiming === 'Before Consultation') {
        return isPaidOrExempt(patient);
      }
      return true;
    },

    getStartConsultationLockReason(patient) {
      if (!patient) return null;
      const isEmg = patient.isEmergency || patient.priorityLevel === 'EMERGENCY' || patient.priority === 'EMERGENCY' || (patient.consultationType || '').toLowerCase() === 'emergency' || (patient.tokenNumber || '').startsWith('EMG');
      if (isEmg) return null;
      if (isPaidOrExempt(patient)) return null;

      const pol = getPolicy(patient);
      if (pol.feeCollectionRole === 'Reception' && pol.paymentTiming === 'Before Consultation') {
        return '🔒 Payment Pending — Waiting for Reception to collect consultation fee';
      }
      if (pol.feeCollectionRole === 'Doctor' && pol.paymentTiming === 'Before Consultation') {
        return '🔒 Payment Required — Collect consultation fee before starting consultation';
      }
      return null;
    },

    /**
     * Can a specific role collect the OPD consultation fee?
     * Only the designated feeCollectionRole (Reception, Doctor, or Pharmacy) is authorized to collect the fee.
     */
    canCollectConsultationFee(role, patient) {
      if (!patient) return false;
      if (isPaidOrExempt(patient)) return false; // Already paid

      const targetRole = role || currentUserRole;
      const pol = getPolicy(patient);
      if (pol.feeCollectionRole === 'Pharmacy') {
        return targetRole === 'Pharmacy' || targetRole === 'PHARMACIST' || targetRole === 'SUPER_ADMIN';
      }
      return pol.feeCollectionRole === targetRole;
    },

    /**
     * Doctor: Can Doctor Finish Consultation?
     * Rule:
     * - If Doctor collects AFTER consultation: Doctor must collect fee before completing consultation.
     * - Other cases: enabled.
     */
    canFinishConsultation(patient) {
      if (!patient) return true;
      const pol = getPolicy(patient);
      if (pol.feeCollectionRole === 'Doctor' && pol.paymentTiming === 'After Consultation') {
        return isPaidOrExempt(patient);
      }
      return true;
    },

    getFinishConsultationLockReason(patient) {
      if (feeCollectionRole === 'Doctor' && paymentTiming === 'After Consultation' && !isPaidOrExempt(patient)) {
        return '🔒 Consultation fee payment pending — Collect fee to finish consultation';
      }
      return null;
    },

    /**
     * Pharmacy: Can Pharmacy Dispense Medicines?
     * Rule:
     * - If Pharmacy collects BEFORE consultation: Consultation fee must be paid before dispensing.
     * - If Pharmacy collects AFTER consultation: Consultation fee + Medicine charges collected together.
     * - Other cases: Pharmacy dispenses medicines once patient arrives at pharmacy queue.
     */
    canDispenseMedicines(patient) {
      if (!patient) return true;
      if (feeCollectionRole === 'Pharmacy' && paymentTiming === 'Before Consultation') {
        return isPaidOrExempt(patient);
      }
      return true;
    },

    /**
     * Can complete patient visit lifecycle?
     */
    canCompleteVisit(patient) {
      if (!patient) return false;
      return isPaidOrExempt(patient);
    }
  };
};
