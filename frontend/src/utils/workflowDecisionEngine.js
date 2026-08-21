/**
 * VillZone HIMS — Central Workflow Decision Engine (Phase 2)
 * Single Source of Truth for Role-Based Action Permissions & Blocked Reasons.
 */

export const isPaidOrExempt = (patient) => {
  if (!patient) return false;
  const bStatus = patient.billingStatus || patient.paymentStatus || patient?.workflow?.paymentState;
  return bStatus === 'Paid' || bStatus === 'Exempt' || bStatus === 'PAID' || bStatus === 'EXEMPT';
};

export const getWorkflowState = (patient) => {
  if (!patient) return {};
  if (patient.workflow) return patient.workflow;
  return {
    queueState: patient.queueStatus === 'In-Consultation' ? 'IN_CONSULTATION' :
                patient.queueStatus === 'Sent to Pharmacy' ? 'SENT_TO_PHARMACY' :
                patient.queueStatus === 'Completed' ? 'COMPLETED' :
                patient.queueStatus === 'Skipped' ? 'SKIPPED' :
                patient.queueStatus === 'Called' ? 'CALLED' : 'WAITING',
    paymentState: isPaidOrExempt(patient) ? 'PAID' : 'PENDING',
    consultationState: patient.status === 'In Consultation' ? 'STARTED' :
                       (patient.status === 'Sent to Pharmacy' || patient.status === 'Completed') ? 'COMPLETED' : 'NOT_STARTED',
    pharmacyState: patient.pharmacyStatus === 'DISPENSED' ? 'DISPENSED' :
                   patient.pharmacyStatus === 'DISPENSING' ? 'DISPENSING' :
                   (patient.status === 'Sent to Pharmacy') ? 'WAITING' : 'NOT_REQUIRED',
    billingState: isPaidOrExempt(patient) ? 'PAID' : 'NOT_GENERATED'
  };
};

export const createWorkflowDecisionEngine = (billingSettings = {}, currentUserRole = '') => {
  const feeCollectionRole = billingSettings.feeCollectionRole || 'Reception'; // 'Reception' | 'Doctor' | 'Pharmacy'
  const paymentTiming = billingSettings.paymentTiming || 'Before Consultation'; // 'Before Consultation' | 'After Consultation'
  const collectMedicineInPharmacy = billingSettings.collectMedicineInPharmacy !== false;

  return {
    feeCollectionRole,
    paymentTiming,
    collectMedicineInPharmacy,

    /**
     * Evaluates full set of role-based actions and blocked reasons for a given appointment.
     */
    evaluateActions(appointment, roleOverride = null) {
      if (!appointment) {
        return {
          actions: {},
          reasons: {}
        };
      }

      const role = roleOverride || currentUserRole || 'Reception';
      const paid = isPaidOrExempt(appointment);
      const wf = getWorkflowState(appointment);
      const rawState = (wf.queueState || appointment.queueStatus || appointment.status || 'WAITING').toUpperCase();
      const qState = rawState === 'SENT TO PHARMACY' ? 'SENT_TO_PHARMACY' : 
                     rawState === 'IN-CONSULTATION' || rawState === 'IN CONSULTATION' ? 'IN_CONSULTATION' : rawState;

      const isReceptionCollector = feeCollectionRole === 'Reception';
      const isDoctorCollector = feeCollectionRole === 'Doctor';
      const isPharmacyCollector = feeCollectionRole === 'Pharmacy';
      const isBeforeTiming = paymentTiming === 'Before Consultation';
      const isAfterTiming = paymentTiming === 'After Consultation';

      // ── 1. Reception Permissions ──
      const canCollectPayment = isReceptionCollector && !paid && (qState === 'WAITING' || qState === 'READY' || qState === 'CALLED' || isAfterTiming);
      const canCallPatient = (isReceptionCollector && isBeforeTiming) ? paid : (qState === 'WAITING' || qState === 'READY');
      const canSkipPatient = qState === 'WAITING' || qState === 'READY' || qState === 'CALLED';
      const canRecallPatient = qState === 'SKIPPED' || qState === 'CALLED' || qState === 'WAITING';
      const canCancelAppointment = qState !== 'COMPLETED' && qState !== 'CANCELLED';
      const canPrintToken = true;
      const canViewPatient = true;

      // ── 2. Doctor Permissions ──
      let canStartConsultation = true;
      let startConsultationReason = null;

      const isEmergencyPatient = appointment.isEmergency || appointment.priorityLevel === 'EMERGENCY' || appointment.priority === 'EMERGENCY' || (appointment.consultationType || '').toLowerCase() === 'emergency' || (appointment.tokenNumber || '').startsWith('EMG');

      if (!isEmergencyPatient && isBeforeTiming && (isReceptionCollector || isDoctorCollector)) {
        if (!paid) {
          canStartConsultation = false;
          startConsultationReason = isReceptionCollector 
            ? '🔒 Payment Pending — Waiting for Reception to collect consultation fee'
            : '🔒 Payment Required — Collect consultation fee before starting consultation';
        }
      }

      if (canStartConsultation && qState === 'COMPLETED') {
        canStartConsultation = false;
        startConsultationReason = 'Consultation has already been completed.';
      }

      const canEditConsultation = qState === 'IN_CONSULTATION' || qState === 'CALLED' || qState === 'WAITING';
      const canCompleteConsultation = isDoctorCollector && isAfterTiming ? paid : (qState === 'IN_CONSULTATION' || qState === 'CALLED');
      const canSendToPharmacy = qState === 'IN_CONSULTATION' || qState === 'CALLED';
      const canCancelConsultation = qState === 'IN_CONSULTATION';
      const canViewPaymentStatus = true;

      // ── 3. Pharmacy Permissions ──
      const canStartDispensing = qState === 'SENT_TO_PHARMACY' || qState === 'IN_CONSULTATION';
      const canCollectMedicinePayment = isPharmacyCollector || (collectMedicineInPharmacy && !paid);
      const canCollectConsultationPayment = isPharmacyCollector && !paid;
      const canCompleteDispensing = qState === 'SENT_TO_PHARMACY' || wf.pharmacyState === 'DISPENSING' || wf.pharmacyState === 'WAITING';

      // ── 4. Billing Permissions ──
      const canGenerateInvoice = true;
      const canCollectBalance = !paid;
      const canRefund = paid;
      const canPrintInvoice = true;

      // ── Blocked Reasons Map ──
      const reasons = {
        callPatient: !canCallPatient 
          ? 'Consultation payment is pending — Reception must collect fee before calling patient.'
          : null,
        startConsultation: startConsultationReason,
        completeConsultation: (!canCompleteConsultation && isDoctorCollector && isAfterTiming && !paid)
          ? '🔒 Consultation fee payment pending — Collect fee to finish consultation.'
          : null,
        dispense: (!canStartDispensing)
          ? 'Doctor consultation has not been sent to pharmacy yet.'
          : null,
        collectPayment: (!canCollectPayment && paid)
          ? 'Payment has already been completed.'
          : null
      };

      const actions = {
        canCollectPayment,
        canCallPatient,
        canSkipPatient,
        canRecallPatient,
        canCancelAppointment,
        canPrintToken,
        canViewPatient,
        canStartConsultation,
        canEditConsultation,
        canCompleteConsultation,
        canSendToPharmacy,
        canCancelConsultation,
        canViewPaymentStatus,
        canStartDispensing,
        canCollectMedicinePayment,
        canCollectConsultationPayment,
        canCompleteDispensing,
        canGenerateInvoice,
        canCollectBalance,
        canRefund,
        canPrintInvoice
      };

      return { actions, reasons };
    },

    /**
     * Developer Diagnostic Snapshot Helper
     */
    getWorkflowSnapshot(appointment, roleOverride = null) {
      if (!appointment) return null;
      const role = roleOverride || currentUserRole || 'Reception';
      const evaluated = this.evaluateActions(appointment, role);
      const wf = getWorkflowState(appointment);

      return {
        workflow: wf,
        actions: evaluated.actions,
        blockedReasons: evaluated.reasons,
        legacyFields: {
          status: appointment.status,
          queueStatus: appointment.queueStatus,
          billingStatus: appointment.billingStatus,
          pharmacyStatus: appointment.pharmacyStatus
        }
      };
    }
  };
};
