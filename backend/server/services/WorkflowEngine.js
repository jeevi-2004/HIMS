/**
 * VillZone HIMS — Workflow State Engine (Phase 1)
 * Centralized Service for Appointment Workflow States, Transition Validation,
 * Legacy Field Synchronization (WorkflowMapper), and Audit Trails.
 */

const WorkflowEventHub = require('./WorkflowEventHub');

const QUEUE_STATES = {
  SCHEDULED: 'SCHEDULED',
  CHECKED_IN: 'CHECKED_IN',
  WAITING: 'WAITING',
  READY: 'READY',
  CALLED: 'CALLED',
  IN_CONSULTATION: 'IN_CONSULTATION',
  CONSULTATION_COMPLETED: 'CONSULTATION_COMPLETED',
  SENT_TO_PHARMACY: 'SENT_TO_PHARMACY',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW'
};

const PAYMENT_STATES = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  EXEMPT: 'EXEMPT',
  REFUNDED: 'REFUNDED'
};

const CONSULTATION_STATES = {
  NOT_STARTED: 'NOT_STARTED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED'
};

const PHARMACY_STATES = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  WAITING: 'WAITING',
  DISPENSING: 'DISPENSING',
  DISPENSED: 'DISPENSED'
};

const BILLING_STATES = {
  NOT_GENERATED: 'NOT_GENERATED',
  GENERATED: 'GENERATED',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID'
};

// Allowed State Transitions for Queue State
const QUEUE_STATE_TRANSITIONS = {
  [QUEUE_STATES.SCHEDULED]: [QUEUE_STATES.CHECKED_IN, QUEUE_STATES.WAITING, QUEUE_STATES.READY, QUEUE_STATES.CALLED, QUEUE_STATES.IN_CONSULTATION, QUEUE_STATES.SKIPPED, QUEUE_STATES.CANCELLED, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.CHECKED_IN]: [QUEUE_STATES.WAITING, QUEUE_STATES.READY, QUEUE_STATES.CALLED, QUEUE_STATES.IN_CONSULTATION, QUEUE_STATES.CANCELLED, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.WAITING]: [QUEUE_STATES.SCHEDULED, QUEUE_STATES.READY, QUEUE_STATES.CALLED, QUEUE_STATES.IN_CONSULTATION, QUEUE_STATES.SKIPPED, QUEUE_STATES.CANCELLED, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.READY]: [QUEUE_STATES.CALLED, QUEUE_STATES.IN_CONSULTATION, QUEUE_STATES.SKIPPED, QUEUE_STATES.CANCELLED, QUEUE_STATES.WAITING, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.CALLED]: [QUEUE_STATES.IN_CONSULTATION, QUEUE_STATES.CONSULTATION_COMPLETED, QUEUE_STATES.SENT_TO_PHARMACY, QUEUE_STATES.COMPLETED, QUEUE_STATES.SKIPPED, QUEUE_STATES.CANCELLED, QUEUE_STATES.WAITING, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.IN_CONSULTATION]: [QUEUE_STATES.CONSULTATION_COMPLETED, QUEUE_STATES.SENT_TO_PHARMACY, QUEUE_STATES.COMPLETED, QUEUE_STATES.SKIPPED, QUEUE_STATES.CANCELLED, QUEUE_STATES.WAITING, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.CONSULTATION_COMPLETED]: [QUEUE_STATES.SENT_TO_PHARMACY, QUEUE_STATES.COMPLETED, QUEUE_STATES.CANCELLED, QUEUE_STATES.WAITING, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.SENT_TO_PHARMACY]: [QUEUE_STATES.COMPLETED, QUEUE_STATES.CANCELLED, QUEUE_STATES.WAITING, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.SKIPPED]: [QUEUE_STATES.WAITING, QUEUE_STATES.SCHEDULED, QUEUE_STATES.READY, QUEUE_STATES.CALLED, QUEUE_STATES.IN_CONSULTATION, QUEUE_STATES.CANCELLED, QUEUE_STATES.NO_SHOW],
  [QUEUE_STATES.CANCELLED]: [QUEUE_STATES.WAITING, QUEUE_STATES.SCHEDULED, QUEUE_STATES.READY],
  [QUEUE_STATES.COMPLETED]: [QUEUE_STATES.WAITING, QUEUE_STATES.SCHEDULED, QUEUE_STATES.READY],
  [QUEUE_STATES.NO_SHOW]: [QUEUE_STATES.WAITING, QUEUE_STATES.SCHEDULED, QUEUE_STATES.READY]
};

class WorkflowEngine {
  /**
   * Initializes the workflow object on a new appointment document.
   */
  static initializeWorkflow(appointmentData = {}, user = null) {
    const now = new Date();
    const workflow = {
      queueState: QUEUE_STATES.WAITING,
      paymentState: appointmentData.billingStatus === 'Paid' ? PAYMENT_STATES.PAID : 
                    appointmentData.billingStatus === 'Exempt' ? PAYMENT_STATES.EXEMPT : PAYMENT_STATES.PENDING,
      consultationState: CONSULTATION_STATES.NOT_STARTED,
      pharmacyState: PHARMACY_STATES.NOT_REQUIRED,
      billingState: BILLING_STATES.NOT_GENERATED,
      timestamps: {
        tokenGeneratedAt: now,
        ...(appointmentData.billingStatus === 'Paid' ? { paymentCompletedAt: now } : {})
      }
    };

    const metadata = {
      priorityOverride: appointmentData.isVIP || appointmentData.consultationType === 'Emergency',
      priorityReason: appointmentData.consultationType === 'Emergency' ? 'Emergency' : appointmentData.isVIP ? 'VIP' : undefined
    };

    const initialHistory = [{
      fromState: 'NONE',
      toState: QUEUE_STATES.WAITING,
      stateType: 'queueState',
      changedBy: user?._id || user?.id,
      changedByName: user?.name || 'System',
      changedByRole: user?.role || 'SYSTEM',
      timestamp: now,
      note: 'Appointment Token Created'
    }];

    return { workflow, metadata, history: initialHistory };
  }

  /**
   * WorkflowMapper — Synchronizes legacy fields from workflow state object.
   */
  static syncLegacyFields(appointment) {
    if (!appointment.workflow) return;

    const { queueState, paymentState, pharmacyState } = appointment.workflow;

    // Queue State -> Legacy Status & QueueStatus
    switch (queueState) {
      case QUEUE_STATES.SCHEDULED:
        appointment.status = 'Scheduled';
        appointment.queueStatus = 'Scheduled';
        break;
      case QUEUE_STATES.CHECKED_IN:
        appointment.status = 'Waiting';
        appointment.queueStatus = 'Waiting';
        break;
      case QUEUE_STATES.WAITING:
        appointment.status = 'Waiting';
        appointment.queueStatus = 'Waiting';
        break;
      case QUEUE_STATES.READY:
        appointment.status = 'Waiting';
        appointment.queueStatus = 'Waiting';
        break;
      case QUEUE_STATES.CALLED:
        appointment.status = 'Called';
        appointment.queueStatus = 'Called';
        break;
      case QUEUE_STATES.IN_CONSULTATION:
      case QUEUE_STATES.CONSULTATION_COMPLETED:
        appointment.status = 'In Consultation';
        appointment.queueStatus = 'In-Consultation';
        break;
      case QUEUE_STATES.SENT_TO_PHARMACY:
        appointment.status = 'Sent to Pharmacy';
        appointment.queueStatus = 'Sent to Pharmacy';
        appointment.pharmacyStatus = 'SENT';
        break;
      case QUEUE_STATES.COMPLETED:
        appointment.status = 'Completed';
        appointment.queueStatus = 'Completed';
        if (pharmacyState === PHARMACY_STATES.DISPENSED) {
          appointment.pharmacyStatus = 'DISPENSED';
        }
        break;
      case QUEUE_STATES.SKIPPED:
        appointment.status = 'Skipped';
        appointment.queueStatus = 'Skipped';
        break;
      case QUEUE_STATES.NO_SHOW:
        appointment.status = 'Cancelled';
        appointment.queueStatus = 'Skipped';
        break;
      case QUEUE_STATES.CANCELLED:
        appointment.status = 'Cancelled';
        appointment.queueStatus = 'Cancelled';
        appointment.pharmacyStatus = 'Cancelled';
        break;
      default:
        break;
    }

    // Payment State -> Legacy BillingStatus
    switch (paymentState) {
      case PAYMENT_STATES.PAID:
        appointment.billingStatus = 'Paid';
        break;
      case PAYMENT_STATES.EXEMPT:
        appointment.billingStatus = 'Exempt';
        break;
      case PAYMENT_STATES.PARTIAL:
        appointment.billingStatus = 'Partial';
        break;
      case PAYMENT_STATES.REFUNDED:
        appointment.billingStatus = 'Refunded';
        break;
      case PAYMENT_STATES.PENDING:
        appointment.billingStatus = 'Unpaid';
        break;
      default:
        break;
    }
  }

  /**
   * Converts legacy input status fields into workflow queueState enum.
   */
  static mapLegacyToQueueState(statusInput) {
    if (!statusInput) return null;
    const str = String(statusInput).trim().toUpperCase();
    if (str === 'SCHEDULED') return QUEUE_STATES.SCHEDULED;
    if (str === 'CHECKED_IN' || str === 'CHECKED IN') return QUEUE_STATES.CHECKED_IN;
    if (str === 'WAITING' || str === 'ADMITTED') return QUEUE_STATES.WAITING;
    if (str === 'READY') return QUEUE_STATES.READY;
    if (str === 'CALLED') return QUEUE_STATES.CALLED;
    if (str === 'IN CONSULTATION' || str === 'IN-CONSULTATION' || str === 'IN_CONSULTATION') return QUEUE_STATES.IN_CONSULTATION;
    if (str === 'CONSULTATION_COMPLETED') return QUEUE_STATES.CONSULTATION_COMPLETED;
    if (str === 'SENT TO PHARMACY' || str === 'SENT_TO_PHARMACY' || str === 'DISPENSING') return QUEUE_STATES.SENT_TO_PHARMACY;
    if (str === 'COMPLETED' || str === 'DISPENSED') return QUEUE_STATES.COMPLETED;
    if (str === 'SKIPPED') return QUEUE_STATES.SKIPPED;
    if (str === 'CANCELLED') return QUEUE_STATES.CANCELLED;
    if (str === 'NO SHOW' || str === 'NO_SHOW') return QUEUE_STATES.NO_SHOW;
    return null;
  }

  /**
   * Converts legacy input billingStatus into workflow paymentState enum.
   */
  static mapLegacyToPaymentState(billingStatusInput) {
    if (!billingStatusInput) return null;
    const str = String(billingStatusInput).trim().toUpperCase();
    if (str === 'PAID') return PAYMENT_STATES.PAID;
    if (str === 'EXEMPT') return PAYMENT_STATES.EXEMPT;
    if (str === 'PARTIAL') return PAYMENT_STATES.PARTIAL;
    if (str === 'REFUNDED') return PAYMENT_STATES.REFUNDED;
    if (str === 'UNPAID' || str === 'PENDING') return PAYMENT_STATES.PENDING;
    return null;
  }

  /**
   * Transitions Queue State with validation, timestamp tracking, and history logging.
   */
  static transitionQueueState(appointment, targetState, user = null, note = '') {
    if (!appointment.workflow) {
      const init = this.initializeWorkflow(appointment, user);
      appointment.workflow = init.workflow;
      appointment.workflowMetadata = init.metadata;
      appointment.workflowHistory = init.history;
    }

    const currentState = appointment.workflow.queueState || QUEUE_STATES.WAITING;

    if (currentState === targetState) {
      this.syncLegacyFields(appointment);
      return appointment;
    }

    // Validate Transition
    const allowed = QUEUE_STATE_TRANSITIONS[currentState] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Invalid Workflow Transition: Cannot transition queueState from ${currentState} to ${targetState}`);
    }

    const now = new Date();
    appointment.workflow.queueState = targetState;

    // Update Timestamps & Metadata
    if (!appointment.workflow.timestamps) appointment.workflow.timestamps = {};
    if (!appointment.workflowMetadata) appointment.workflowMetadata = {};

    switch (targetState) {
      case QUEUE_STATES.CALLED:
        appointment.workflow.timestamps.calledAt = now;
        if (user) appointment.workflowMetadata.calledBy = user._id || user.id;
        break;
      case QUEUE_STATES.IN_CONSULTATION:
        appointment.workflow.timestamps.consultationStartedAt = now;
        appointment.workflow.consultationState = CONSULTATION_STATES.STARTED;
        if (user) appointment.workflowMetadata.consultationStartedBy = user._id || user.id;
        break;
      case QUEUE_STATES.CONSULTATION_COMPLETED:
        appointment.workflow.timestamps.consultationCompletedAt = now;
        appointment.workflow.consultationState = CONSULTATION_STATES.COMPLETED;
        if (user) appointment.workflowMetadata.consultationCompletedBy = user._id || user.id;
        break;
      case QUEUE_STATES.SENT_TO_PHARMACY:
        appointment.workflow.timestamps.pharmacyStartedAt = now;
        appointment.workflow.consultationState = CONSULTATION_STATES.COMPLETED;
        appointment.workflow.pharmacyState = PHARMACY_STATES.WAITING;
        if (user) appointment.workflowMetadata.consultationCompletedBy = user._id || user.id;
        break;
      case QUEUE_STATES.COMPLETED:
        appointment.workflow.timestamps.completedAt = now;
        appointment.workflow.consultationState = CONSULTATION_STATES.COMPLETED;
        if (appointment.workflow.pharmacyState === PHARMACY_STATES.WAITING || appointment.workflow.pharmacyState === PHARMACY_STATES.DISPENSING) {
          appointment.workflow.pharmacyState = PHARMACY_STATES.DISPENSED;
          appointment.workflow.timestamps.pharmacyCompletedAt = now;
          if (user) appointment.workflowMetadata.pharmacyDispensedBy = user._id || user.id;
        }
        break;
      default:
        break;
    }

    // Append to History Audit Trail
    if (!appointment.workflowHistory) appointment.workflowHistory = [];
    appointment.workflowHistory.push({
      fromState: currentState,
      toState: targetState,
      stateType: 'queueState',
      changedBy: user?._id || user?.id,
      changedByName: user?.name || 'System',
      changedByRole: user?.role || 'SYSTEM',
      timestamp: now,
      note: note || `Queue state transitioned from ${currentState} to ${targetState}`
    });

    // Synchronize Legacy Fields
    this.syncLegacyFields(appointment);

    // Publish Real-Time Event (Phase 5)
    try {
      let eventType = `QueueState_${targetState}`;
      if (targetState === QUEUE_STATES.CALLED) eventType = 'PatientCalled';
      else if (targetState === QUEUE_STATES.IN_CONSULTATION) eventType = 'ConsultationStarted';
      else if (targetState === QUEUE_STATES.SENT_TO_PHARMACY) eventType = 'SentToPharmacy';
      else if (targetState === QUEUE_STATES.COMPLETED) eventType = 'VisitCompleted';
      else if (targetState === QUEUE_STATES.SKIPPED) eventType = 'PatientSkipped';
      else if (targetState === QUEUE_STATES.CANCELLED) eventType = 'PatientCancelled';

      WorkflowEventHub.publish(eventType, {
        ...appointment.toObject ? appointment.toObject() : appointment,
        queueState: targetState,
        performedBy: user?.name || 'System'
      });
    } catch (e) {
      console.error('[WORKFLOW ENGINE] Failed to publish event:', e?.message);
    }

    console.log(`[WORKFLOW ENGINE] Transitioned appointment ${appointment._id || appointment.id} | queueState: ${currentState} -> ${targetState} | By: ${user?.name || 'System'}`);

    return appointment;
  }

  /**
   * Transitions Payment State with validation, timestamp tracking, and history logging.
   */
  static transitionPaymentState(appointment, targetState, user = null, note = '') {
    if (!appointment.workflow) {
      const init = this.initializeWorkflow(appointment, user);
      appointment.workflow = init.workflow;
      appointment.workflowMetadata = init.metadata;
      appointment.workflowHistory = init.history;
    }

    const currentState = appointment.workflow.paymentState || PAYMENT_STATES.PENDING;

    if (currentState === targetState) {
      this.syncLegacyFields(appointment);
      return appointment;
    }

    const now = new Date();
    appointment.workflow.paymentState = targetState;

    if (!appointment.workflow.timestamps) appointment.workflow.timestamps = {};
    if (!appointment.workflowMetadata) appointment.workflowMetadata = {};

    if (targetState === PAYMENT_STATES.PAID || targetState === PAYMENT_STATES.EXEMPT) {
      appointment.workflow.timestamps.paymentCompletedAt = now;
      if (user) appointment.workflowMetadata.paymentCollectedBy = user._id || user.id;
    }

    if (!appointment.workflowHistory) appointment.workflowHistory = [];
    appointment.workflowHistory.push({
      fromState: currentState,
      toState: targetState,
      stateType: 'paymentState',
      changedBy: user?._id || user?.id,
      changedByName: user?.name || 'System',
      changedByRole: user?.role || 'SYSTEM',
      timestamp: now,
      note: note || `Payment state transitioned from ${currentState} to ${targetState}`
    });

    this.syncLegacyFields(appointment);

    console.log(`[WORKFLOW ENGINE] Transitioned appointment ${appointment._id || appointment.id} | paymentState: ${currentState} -> ${targetState} | By: ${user?.name || 'System'}`);

    return appointment;
  }

  /**
   * Transitions Pharmacy State.
   */
  static transitionPharmacyState(appointment, targetState, user = null, note = '') {
    if (!appointment.workflow) {
      const init = this.initializeWorkflow(appointment, user);
      appointment.workflow = init.workflow;
      appointment.workflowMetadata = init.metadata;
      appointment.workflowHistory = init.history;
    }

    const currentState = appointment.workflow.pharmacyState || PHARMACY_STATES.NOT_REQUIRED;
    if (currentState === targetState) return appointment;

    const now = new Date();
    appointment.workflow.pharmacyState = targetState;

    if (targetState === PHARMACY_STATES.DISPENSED) {
      appointment.workflow.timestamps.pharmacyCompletedAt = now;
      if (user) appointment.workflowMetadata.pharmacyDispensedBy = user._id || user.id;
    }

    if (!appointment.workflowHistory) appointment.workflowHistory = [];
    appointment.workflowHistory.push({
      fromState: currentState,
      toState: targetState,
      stateType: 'pharmacyState',
      changedBy: user?._id || user?.id,
      changedByName: user?.name || 'System',
      changedByRole: user?.role || 'SYSTEM',
      timestamp: now,
      note: note || `Pharmacy state transitioned from ${currentState} to ${targetState}`
    });

    this.syncLegacyFields(appointment);

    return appointment;
  }
}

module.exports = {
  WorkflowEngine,
  QUEUE_STATES,
  PAYMENT_STATES,
  CONSULTATION_STATES,
  PHARMACY_STATES,
  BILLING_STATES
};
