/**
 * VillZone HIMS — Central Workflow Decision Engine (Phase 2)
 * Backend Decision Service for Role Action Evaluation & Audit Diagnostics.
 */

const isPaidOrExempt = (appointment) => {
  if (!appointment) return false;
  const bStatus = appointment.billingStatus || appointment.paymentStatus || appointment?.workflow?.paymentState;
  return bStatus === 'Paid' || bStatus === 'Exempt' || bStatus === 'PAID' || bStatus === 'EXEMPT';
};

class WorkflowDecisionEngine {
  /**
   * Evaluates role permissions and returns allowed actions and blocked reasons.
   */
  static evaluateActions(appointment, billingSettings = {}, userRole = 'Reception') {
    if (!appointment) {
      return { actions: {}, reasons: {} };
    }

    const feeCollectionRole = billingSettings.feeCollectionRole || 'Reception';
    const paymentTiming = billingSettings.paymentTiming || 'Before Consultation';
    const collectMedicineInPharmacy = billingSettings.collectMedicineInPharmacy !== false;

    const paid = isPaidOrExempt(appointment);
    const rawState = (appointment.workflow?.queueState || appointment.queueStatus || appointment.status || 'WAITING').toUpperCase();
    const qState = rawState === 'SENT TO PHARMACY' ? 'SENT_TO_PHARMACY' : 
                   rawState === 'IN-CONSULTATION' || rawState === 'IN CONSULTATION' ? 'IN_CONSULTATION' : rawState;

    const isReceptionCollector = feeCollectionRole === 'Reception';
    const isDoctorCollector = feeCollectionRole === 'Doctor';
    const isPharmacyCollector = feeCollectionRole === 'Pharmacy';
    const isBeforeTiming = paymentTiming === 'Before Consultation';
    const isAfterTiming = paymentTiming === 'After Consultation';

    // 1. Reception
    const canCollectPayment = isReceptionCollector && !paid && (qState === 'WAITING' || qState === 'READY' || qState === 'CALLED' || isAfterTiming);
    const canCallPatient = (isReceptionCollector && isBeforeTiming) ? paid : (qState === 'WAITING' || qState === 'READY');
    const canSkipPatient = qState === 'WAITING' || qState === 'READY' || qState === 'CALLED';
    const canRecallPatient = qState === 'SKIPPED' || qState === 'CALLED' || qState === 'WAITING';
    const canCancelAppointment = qState !== 'COMPLETED' && qState !== 'CANCELLED';

    // 2. Doctor
    let canStartConsultation = true;
    let startConsultationReason = null;

    if (isBeforeTiming && (isReceptionCollector || isDoctorCollector) && !paid) {
      canStartConsultation = false;
      startConsultationReason = isReceptionCollector 
        ? '🔒 Payment Pending — Waiting for Reception to collect consultation fee'
        : '🔒 Payment Required — Collect consultation fee before starting consultation';
    }

    if (canStartConsultation && (qState === 'COMPLETED' || qState === 'SENT_TO_PHARMACY')) {
      canStartConsultation = false;
      startConsultationReason = 'Consultation has already been completed.';
    }

    const canEditConsultation = qState === 'IN_CONSULTATION' || qState === 'CALLED' || qState === 'WAITING';
    const canCompleteConsultation = isDoctorCollector && isAfterTiming ? paid : (qState === 'IN_CONSULTATION' || qState === 'CALLED');
    const canSendToPharmacy = qState === 'IN_CONSULTATION' || qState === 'CALLED';

    // 3. Pharmacy
    const canStartDispensing = qState === 'SENT_TO_PHARMACY' || qState === 'IN_CONSULTATION';
    const canCollectMedicinePayment = isPharmacyCollector || (collectMedicineInPharmacy && !paid);
    const canCollectConsultationPayment = isPharmacyCollector && !paid;
    const canCompleteDispensing = qState === 'SENT_TO_PHARMACY' || appointment.workflow?.pharmacyState === 'DISPENSING';

    // 4. Billing
    const canGenerateInvoice = true;
    const canCollectBalance = !paid;
    const canRefund = paid;

    const reasons = {
      callPatient: !canCallPatient ? 'Consultation payment is pending.' : null,
      startConsultation: startConsultationReason,
      completeConsultation: (!canCompleteConsultation && isDoctorCollector && isAfterTiming && !paid) ? 'Consultation fee payment pending.' : null,
      dispense: !canStartDispensing ? 'Doctor consultation has not been completed.' : null
    };

    const actions = {
      canCollectPayment,
      canCallPatient,
      canSkipPatient,
      canRecallPatient,
      canCancelAppointment,
      canStartConsultation,
      canEditConsultation,
      canCompleteConsultation,
      canSendToPharmacy,
      canStartDispensing,
      canCollectMedicinePayment,
      canCollectConsultationPayment,
      canCompleteDispensing,
      canGenerateInvoice,
      canCollectBalance,
      canRefund
    };

    // Log diagnostic blocked actions
    Object.keys(reasons).forEach(act => {
      if (reasons[act]) {
        console.log(`[WORKFLOW DECISION ENGINE] Action blocked | Appointment: ${appointment._id || appointment.id} | Role: ${userRole} | Action: ${act} | Reason: ${reasons[act]} | QueueState: ${qState} | Timestamp: ${new Date().toISOString()}`);
      }
    });

    return { actions, reasons };
  }

  /**
   * Returns a full diagnostic snapshot.
   */
  static getWorkflowSnapshot(appointment, billingSettings = {}, userRole = 'Reception') {
    const evaluated = this.evaluateActions(appointment, billingSettings, userRole);
    return {
      workflow: appointment?.workflow || {},
      actions: evaluated.actions,
      blockedReasons: evaluated.reasons,
      legacyFields: {
        status: appointment?.status,
        queueStatus: appointment?.queueStatus,
        billingStatus: appointment?.billingStatus,
        pharmacyStatus: appointment?.pharmacyStatus
      }
    };
  }
}

module.exports = WorkflowDecisionEngine;
