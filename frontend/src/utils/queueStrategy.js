/**
 * VillZone HIMS — Queue Strategy Architecture (Phase 3)
 * Pluggable strategies for sorting READY tokens per doctor/department.
 */

export const QUEUE_PRIORITY_MODE_ENUM = {
  OVERRIDE: 'OVERRIDE',
  AFTER_CURRENT: 'AFTER_CURRENT',
  FIFO: 'FIFO',
  APPOINTMENT_TIME: 'APPOINTMENT_TIME'
};

export const STRATEGY_TYPES = QUEUE_PRIORITY_MODE_ENUM;

const extractTokenIndex = (app) => {
  if (!app?.tokenNumber) return 999999;
  const match = String(app.tokenNumber).match(/\d+/);
  return match ? parseInt(match[0], 10) : 999999;
};

export class FIFOStrategy {
  static name = STRATEGY_TYPES.FIFO;
  static sort(appointments = []) {
    return [...appointments].sort((a, b) => {
      const idxA = extractTokenIndex(a);
      const idxB = extractTokenIndex(b);
      if (idxA !== idxB) return idxA - idxB;
      return new Date(a.createdAt || a.date || 0) - new Date(b.createdAt || b.date || 0);
    });
  }
}

export class PriorityStrategy {
  static name = STRATEGY_TYPES.PRIORITY;
  static sort(appointments = []) {
    return [...appointments].sort((a, b) => {
      const isEmergencyA = a.consultationType === 'Emergency' || a.workflowMetadata?.priorityReason === 'Emergency';
      const isEmergencyB = b.consultationType === 'Emergency' || b.workflowMetadata?.priorityReason === 'Emergency';
      if (isEmergencyA && !isEmergencyB) return -1;
      if (!isEmergencyA && isEmergencyB) return 1;

      const isVipA = a.isVIP || a.workflowMetadata?.priorityOverride;
      const isVipB = b.isVIP || b.workflowMetadata?.priorityOverride;
      if (isVipA && !isVipB) return -1;
      if (!isVipA && isVipB) return 1;

      return FIFOStrategy.sort([a, b])[0] === a ? -1 : 1;
    });
  }
}

export class AppointmentTimeStrategy {
  static name = STRATEGY_TYPES.APPOINTMENT_TIME;
  static sort(appointments = []) {
    return [...appointments].sort((a, b) => {
      const timeA = a.time || '23:59';
      const timeB = b.time || '23:59';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return FIFOStrategy.sort([a, b])[0] === a ? -1 : 1;
    });
  }
}

export const getQueueStrategy = (strategyType = STRATEGY_TYPES.FIFO) => {
  switch (strategyType) {
    case STRATEGY_TYPES.PRIORITY:
      return PriorityStrategy;
    case STRATEGY_TYPES.APPOINTMENT_TIME:
      return AppointmentTimeStrategy;
    case STRATEGY_TYPES.FIFO:
    default:
      return FIFOStrategy;
  }
};
