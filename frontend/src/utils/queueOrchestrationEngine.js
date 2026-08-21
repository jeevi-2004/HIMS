/**
 * VillZone HIMS — Queue Orchestration Engine (Phase 3)
 * Centralized Service for Queue Progression, Doctor Isolation, FIFO Progression,
 * Priority Overrides, and Dashboard Counters.
 */

import { isPaidOrExempt } from './workflowDecisionEngine';
import { getQueueStrategy, STRATEGY_TYPES } from './queueStrategy';

export const QUEUE_STATES_P3 = {
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

export const createQueueOrchestrationEngine = (billingSettings = {}) => {
  const feeCollectionRole = billingSettings.feeCollectionRole || 'Reception';
  const paymentTiming = billingSettings.paymentTiming || 'Before Consultation';
  const defaultStrategy = billingSettings.queueStrategy || STRATEGY_TYPES.FIFO;

  /**
   * Helper: Determines if an appointment meets workflow prerequisites to become READY.
   */
  const evaluateReadiness = (app) => {
    if (!app) return false;
    const paid = isPaidOrExempt(app);
    if (feeCollectionRole === 'Reception' && paymentTiming === 'Before Consultation') {
      return paid;
    }
    return true; // Enabled immediately for After Consultation or Doctor/Pharmacy collection
  };

  return {
    feeCollectionRole,
    paymentTiming,
    defaultStrategy,

    /**
     * Evaluates full queue for all appointments, grouped per doctor.
     */
    evaluateQueue(allAppointments = [], strategyType = null) {
      const activeStrategy = getQueueStrategy(strategyType || defaultStrategy);
      const doctorQueues = {};

      // 1. Group by Doctor
      allAppointments.forEach((app) => {
        const docId = app.doctorId?._id || app.doctorId || 'unassigned';
        if (!doctorQueues[docId]) {
          doctorQueues[docId] = {
            activeApp: null,
            readyApps: [],
            waitingApps: [],
            otherApps: []
          };
        }

        const rawStatus = (app.workflow?.queueState || app.queueStatus || app.status || 'WAITING').toUpperCase();
        const isInConsult = rawStatus === 'IN_CONSULTATION' || rawStatus === 'IN-CONSULTATION' || rawStatus === 'IN CONSULTATION';
        const isCalled = rawStatus === 'CALLED';
        const isWaitingOrScheduled = rawStatus === 'WAITING' || rawStatus === 'SCHEDULED' || rawStatus === 'ADMITTED';

        if (isInConsult || isCalled) {
          doctorQueues[docId].activeApp = app;
          doctorQueues[docId].otherApps.push(app);
        } else if (isWaitingOrScheduled) {
          if (evaluateReadiness(app)) {
            doctorQueues[docId].readyApps.push(app);
          } else {
            doctorQueues[docId].waitingApps.push(app);
          }
        } else {
          doctorQueues[docId].otherApps.push(app);
        }
      });

      // 2. Sort READY apps per doctor using active strategy (FIFO)
      const evaluationMap = new Map();

      Object.keys(doctorQueues).forEach((docId) => {
        const qGroup = doctorQueues[docId];
        const sortedReady = activeStrategy.sort(qGroup.readyApps);

        sortedReady.forEach((app, index) => {
          const isTopCallable = index === 0;
          evaluationMap.set(String(app._id || app.id), {
            queueState: QUEUE_STATES_P3.READY,
            queuePosition: index + 1,
            canCall: isTopCallable,
            blockedReason: isTopCallable ? null : `Waiting for previous token (${sortedReady[0]?.tokenNumber || 'earlier token'}).`,
            nextCallableToken: sortedReady[0]?.tokenNumber || null
          });
        });

        qGroup.waitingApps.forEach((app) => {
          evaluationMap.set(String(app._id || app.id), {
            queueState: QUEUE_STATES_P3.WAITING,
            queuePosition: null,
            canCall: false,
            blockedReason: 'Consultation payment pending — Reception must collect fee.',
            nextCallableToken: sortedReady[0]?.tokenNumber || null
          });
        });
      });

      return evaluationMap;
    },

    /**
     * Evaluates a single appointment in context of all appointments.
     */
    evaluateAppointment(appointment, allAppointments = []) {
      if (!appointment) return null;
      const evalMap = this.evaluateQueue(allAppointments);
      const appKey = String(appointment._id || appointment.id);
      if (evalMap.has(appKey)) {
        return evalMap.get(appKey);
      }

      const rawStatus = (appointment.workflow?.queueState || appointment.queueStatus || appointment.status || 'WAITING').toUpperCase();
      return {
        queueState: rawStatus,
        queuePosition: null,
        canCall: rawStatus === 'READY' || (rawStatus === 'WAITING' && evaluateReadiness(appointment)),
        blockedReason: null,
        nextCallableToken: null
      };
    },

    /**
     * Live Dashboard Snapshot Counter
     */
    getQueueSnapshot(allAppointments = []) {
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
          if (evaluateReadiness(app)) counts.ready++;
          else counts.waiting++;
        }
      });

      return counts;
    }
  };
};
