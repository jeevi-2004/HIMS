/**
 * Single Source of Truth for Visit Status in Doctor OPD Workflow
 */

export const VISIT_STATUSES = {
  SCHEDULED: 'Scheduled',
  WAITING: 'Waiting',
  IN_CONSULTATION: 'In Consultation',
  SENT_TO_PHARMACY: 'Sent to Pharmacy',
  SKIPPED: 'Skipped',
  CONSULTATION_COMPLETED: 'Consultation Completed',
  PRESCRIPTION_READY: 'Prescription Ready',
  BILLING_PENDING: 'Billing Pending',
  PHARMACY_PENDING: 'Pharmacy Pending',
  COMPLETED: 'Completed',
  NO_SHOW: 'No Show'
};

/**
 * Calculates the authoritative Visit Status for an appointment
 * @param {Object} app Appointment object
 * @returns {String} Visit Status
 */
export const getVisitStatus = (app) => {
  if (!app) return VISIT_STATUSES.SCHEDULED;

  // 1. Cancelled / No Show
  if (app.status === 'Cancelled' || app.status === 'No Show') {
    return VISIT_STATUSES.NO_SHOW;
  }

  // 2. Check if upcoming/future date
  const now = new Date();
  const currY = now.getFullYear();
  const currM = String(now.getMonth() + 1).padStart(2, '0');
  const currD = String(now.getDate()).padStart(2, '0');
  const currentTodayStr = `${currY}-${currM}-${currD}`;

  let appDateStr = '';
  if (app.date) {
    try {
      const d = new Date(app.date);
      if (!isNaN(d.getTime())) {
        appDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    } catch (_) {}
  }

  // Strictly future booking date (appDateStr > currentTodayStr) is SCHEDULED.
  // Future dates cannot be actively in consultation today.
  const isFuture = Boolean(appDateStr && appDateStr > currentTodayStr);
  if (isFuture) {
    return VISIT_STATUSES.SCHEDULED;
  }

  // Currently in Consultation Room (today's active visits)
  if (app.queueStatus === 'In-Consultation' || app.status === 'In Consultation' || app.workflow?.queueState === 'IN_CONSULTATION') {
    return VISIT_STATUSES.IN_CONSULTATION;
  }

  // Emergency Override: Emergency patients enter Waiting Queue immediately once checked in
  const isEmg = app.isEmergency || app.priorityLevel === 'EMERGENCY' || (app.consultationType || '').toLowerCase() === 'emergency';
  if (isEmg && app.status !== 'Completed' && app.queueStatus !== 'Completed' && app.status !== 'Sent to Pharmacy') {
    return VISIT_STATUSES.WAITING;
  }

  // 4. Sent to Pharmacy
  if (
    app.status === 'Sent to Pharmacy' ||
    app.status === 'Sent To Pharmacy' ||
    app.queueStatus === 'Sent to Pharmacy' ||
    app.queueStatus === 'Sent To Pharmacy' ||
    app.pharmacyStatus === 'SENT' ||
    app.pharmacyStatus === 'DISPENSING' ||
    app.workflow?.queueState === 'SENT_TO_PHARMACY' ||
    app.workflow?.pharmacyState === 'SENT' ||
    app.workflow?.pharmacyState === 'DISPENSING'
  ) {
    if (app.pharmacyStatus === 'DISPENSED' || app.workflow?.pharmacyState === 'DISPENSED') {
      return VISIT_STATUSES.COMPLETED;
    }
    return VISIT_STATUSES.SENT_TO_PHARMACY;
  }

  // 5. Skipped by Doctor
  if (app.queueStatus === 'Skipped' || app.status === 'Skipped') {
    return VISIT_STATUSES.SKIPPED;
  }

  // 6. Completed / Post-Consultation Stages
  if (
    app.queueStatus === 'Completed' || 
    app.status === 'Completed' ||
    app.workflow?.queueState === 'COMPLETED' ||
    app.workflow?.consultationState === 'COMPLETED' ||
    app.workflow?.pharmacyState === 'DISPENSED' ||
    app.pharmacyStatus === 'SENT' ||
    app.pharmacyStatus === 'DISPENSING' ||
    app.pharmacyStatus === 'DISPENSED' ||
    Boolean(app.workflow?.timestamps?.completedAt) ||
    Boolean(app.workflow?.timestamps?.pharmacyCompletedAt)
  ) {
    if (
      app.pharmacyStatus === 'SENT' || 
      app.pharmacyStatus === 'DISPENSING' || 
      app.workflow?.pharmacyState === 'SENT' || 
      app.workflow?.pharmacyState === 'DISPENSING' ||
      app.status === 'Sent to Pharmacy' ||
      app.queueStatus === 'Sent to Pharmacy'
    ) {
      return VISIT_STATUSES.SENT_TO_PHARMACY;
    }
    if (app.pharmacyStatus === 'DISPENSED' || app.workflow?.pharmacyState === 'DISPENSED') {
      return VISIT_STATUSES.COMPLETED;
    }
    // In Doctor Desk for Plan 2 / Digital OPD: after consultation, compulsory place Sent to Pharmacy!
    if (app.hasPrescription !== false && app.prescriptionsCount !== 0 && !app.isTokenOnly) {
      return VISIT_STATUSES.SENT_TO_PHARMACY;
    }
    return VISIT_STATUSES.COMPLETED;
  }

  // 7. Checked-in / Waiting in Lobby
  if (app.status === 'Admitted' && (app.queueStatus === 'Waiting' || !app.queueStatus)) {
    return VISIT_STATUSES.WAITING;
  }

  return VISIT_STATUSES.WAITING;
};

/**
 * Checks if a Visit Status is active (Waiting, In Consultation, Skipped, Emergency)
 * @param {String} visitStatus 
 * @returns {Boolean}
 */
export const isActiveVisit = (visitStatus) => {
  return [
    VISIT_STATUSES.WAITING,
    VISIT_STATUSES.IN_CONSULTATION,
    VISIT_STATUSES.SKIPPED
  ].includes(visitStatus);
};

/**
 * Checks if a Visit Status is completed (Consultation Completed, Prescription Ready, Billing Pending, Pharmacy Pending, Completed)
 * @param {String} visitStatus 
 * @returns {Boolean}
 */
export const isCompletedVisit = (visitStatus) => {
  return [
    VISIT_STATUSES.SENT_TO_PHARMACY,
    VISIT_STATUSES.CONSULTATION_COMPLETED,
    VISIT_STATUSES.PRESCRIPTION_READY,
    VISIT_STATUSES.BILLING_PENDING,
    VISIT_STATUSES.PHARMACY_PENDING,
    VISIT_STATUSES.COMPLETED,
    'Completed',
    'Sent to Pharmacy',
    'Sent To Pharmacy',
    'SENT_TO_PHARMACY'
  ].includes(visitStatus);
};

/**
 * Returns color-coded style configuration for Visit Status badges
 * @param {String} visitStatus 
 * @returns {Object} { label, style }
 */
export const getVisitStatusBadgeConfig = (visitStatus) => {
  switch (visitStatus) {
    case VISIT_STATUSES.SCHEDULED:
      return { label: 'Scheduled', style: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20' };
    case VISIT_STATUSES.WAITING:
      return { label: 'Waiting', style: 'bg-slate-100 text-slate-700 border-slate-300 font-semibold' };
    case VISIT_STATUSES.IN_CONSULTATION:
      return { label: 'In Consultation', style: 'bg-purple-50 text-purple-700 border-purple-200 font-bold animate-pulse' };
    case VISIT_STATUSES.SENT_TO_PHARMACY:
    case 'Sent to Pharmacy':
    case 'Sent To Pharmacy':
    case 'SENT_TO_PHARMACY':
      return { label: 'Sent to Pharmacy', style: 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold' };
    case VISIT_STATUSES.SKIPPED:
      return { label: 'Skipped', style: 'bg-amber-50 text-amber-600 border-amber-200' };
    case VISIT_STATUSES.CONSULTATION_COMPLETED:
      return { label: 'Consultation Completed', style: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' };
    case VISIT_STATUSES.PRESCRIPTION_READY:
      return { label: 'Prescription Ready', style: 'bg-purple-50 text-purple-600 border-purple-200' };
    case VISIT_STATUSES.BILLING_PENDING:
      return { label: 'Billing Pending', style: 'bg-amber-50 text-amber-700 border-amber-200' };
    case VISIT_STATUSES.PHARMACY_PENDING:
      return { label: 'Pharmacy Pending', style: 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold' };
    case VISIT_STATUSES.COMPLETED:
      return { label: 'Completed', style: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' };
    case VISIT_STATUSES.NO_SHOW:
      return { label: 'No Show', style: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20' };
    default:
      return { label: visitStatus, style: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
};
