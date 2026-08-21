/**
 * VillZone HIMS — Queue Orchestration Engine (Phase 3)
 * Backend Service for Patient Queue Progression, Doctor Isolation, FIFO Strategy,
 * Priority Overrides, and Live Dashboard Counters.
 */

const { getQueueStrategy, STRATEGY_TYPES } = require('./QueueStrategy');

const isPaidOrExempt = (patient) => {
  if (!patient) return false;
  const bStatus = patient.billingStatus || patient.paymentStatus || patient?.workflow?.paymentState;
  return bStatus === 'Paid' || bStatus === 'Exempt' || bStatus === 'PAID' || bStatus === 'EXEMPT';
};

class QueueOrchestrationEngine {
  static evaluateReadiness(app, billingSettings = {}) {
    if (!app) return false;
    const feeCollectionRole = billingSettings.feeCollectionRole || 'Reception';
    const paymentTiming = billingSettings.paymentTiming || 'Before Consultation';
    const paid = isPaidOrExempt(app);

    if (feeCollectionRole === 'Reception' && paymentTiming === 'Before Consultation') {
      return paid;
    }
    return true;
  }

  static evaluateQueue(allAppointments = [], billingSettings = {}, strategyType = STRATEGY_TYPES.FIFO) {
    const activeStrategy = getQueueStrategy(strategyType);
    const doctorQueues = {};

    allAppointments.forEach((app) => {
      const docId = app.doctorId?._id || app.doctorId || 'unassigned';
      if (!doctorQueues[docId]) {
        doctorQueues[docId] = { readyApps: [], waitingApps: [], otherApps: [] };
      }

      const rawStatus = (app.workflow?.queueState || app.queueStatus || app.status || 'WAITING').toUpperCase();
      const isWaitingOrScheduled = rawStatus === 'WAITING' || rawStatus === 'SCHEDULED' || rawStatus === 'ADMITTED';

      if (isWaitingOrScheduled) {
        if (this.evaluateReadiness(app, billingSettings)) {
          doctorQueues[docId].readyApps.push(app);
        } else {
          doctorQueues[docId].waitingApps.push(app);
        }
      } else {
        doctorQueues[docId].otherApps.push(app);
      }
    });

    const evaluationMap = new Map();

    Object.keys(doctorQueues).forEach((docId) => {
      const qGroup = doctorQueues[docId];
      const sortedReady = activeStrategy.sort(qGroup.readyApps);

      sortedReady.forEach((app, index) => {
        const isTopCallable = index === 0;
        evaluationMap.set(String(app._id || app.id), {
          queueState: 'READY',
          queuePosition: index + 1,
          canCall: isTopCallable,
          blockedReason: isTopCallable ? null : `Waiting for previous token (${sortedReady[0]?.tokenNumber || 'earlier token'}).`,
          nextCallableToken: sortedReady[0]?.tokenNumber || null
        });
      });

      qGroup.waitingApps.forEach((app) => {
        evaluationMap.set(String(app._id || app.id), {
          queueState: 'WAITING',
          queuePosition: null,
          canCall: false,
          blockedReason: 'Consultation payment pending — Reception must collect fee.',
          nextCallableToken: sortedReady[0]?.tokenNumber || null
        });
      });
    });

    return evaluationMap;
  }

  static getQueueSnapshot(allAppointments = [], billingSettings = {}) {
    const counts = {
      waiting: 0,
      ready: 0,
      called: 0,
      inConsultation: 0,
      sentToPharmacy: 0,
      completed: 0,
      skipped: 0,
      noShow: 0
    };

    allAppointments.forEach((app) => {
      const rawStatus = (app.workflow?.queueState || app.queueStatus || app.status || 'WAITING').toUpperCase();
      if (rawStatus === 'CALLED') counts.called++;
      else if (rawStatus === 'IN_CONSULTATION' || rawStatus === 'IN-CONSULTATION' || rawStatus === 'IN CONSULTATION') counts.inConsultation++;
      else if (rawStatus === 'SENT_TO_PHARMACY' || rawStatus === 'SENT TO PHARMACY') counts.sentToPharmacy++;
      else if (rawStatus === 'COMPLETED') counts.completed++;
      else if (rawStatus === 'SKIPPED') counts.skipped++;
      else if (rawStatus === 'NO_SHOW' || rawStatus === 'NO SHOW' || rawStatus === 'CANCELLED') counts.noShow++;
      else if (rawStatus === 'WAITING' || rawStatus === 'SCHEDULED' || rawStatus === 'ADMITTED') {
        if (this.evaluateReadiness(app, billingSettings)) counts.ready++;
        else counts.waiting++;
      }
    });

    return counts;
  }

  static applyPriorityOverride(appointment, priorityReason = 'Emergency', user = null) {
    if (!appointment) return appointment;

    if (!appointment.workflowMetadata) appointment.workflowMetadata = {};
    appointment.workflowMetadata.priorityOverride = true;
    appointment.workflowMetadata.priorityReason = priorityReason;

    if (!appointment.workflowHistory) appointment.workflowHistory = [];
    appointment.workflowHistory.push({
      fromState: appointment.workflow?.queueState || appointment.queueStatus || 'WAITING',
      toState: 'READY',
      stateType: 'queueState',
      changedBy: user?._id || user?.id,
      changedByName: user?.name || 'System',
      changedByRole: user?.role || 'SYSTEM',
      timestamp: new Date(),
      note: `Priority override applied: ${priorityReason}`
    });

    console.log(`[QUEUE ORCHESTRATION ENGINE] Priority override applied | Appointment: ${appointment._id || appointment.id} | Reason: ${priorityReason} | By: ${user?.name || 'System'}`);

    return appointment;
  }
}

module.exports = QueueOrchestrationEngine;
