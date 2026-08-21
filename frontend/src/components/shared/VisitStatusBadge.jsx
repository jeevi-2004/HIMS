import React from 'react';
import { getVisitStatus, getVisitStatusBadgeConfig, VISIT_STATUSES } from '../../utils/visitStatus';

const VisitStatusBadge = React.memo(({
  status,
  appointment,
  className = ''
}) => {
  const visitSt = status || (appointment ? getVisitStatus(appointment) : VISIT_STATUSES.WAITING);
  const badge = getVisitStatusBadgeConfig(visitSt);
  const isEmg = appointment && (appointment.isEmergency || appointment.priorityLevel === 'EMERGENCY' || appointment.priority === 'EMERGENCY' || (appointment.tokenNumber || '').startsWith('EMG'));

  if (isEmg && (visitSt === VISIT_STATUSES.WAITING || visitSt === VISIT_STATUSES.SCHEDULED)) {
    return (
      <span className={`text-[9px] font-extrabold border border-rose-300 bg-rose-100 text-rose-800 px-2.5 py-1 rounded-xl uppercase tracking-wider animate-pulse inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 w-fit ${className}`}>
        🚨 PRIORITY WAITING
      </span>
    );
  }

  return (
    <span className={`text-[9px] font-bold border px-2.5 py-1 rounded-xl uppercase tracking-wider inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 w-fit ${badge.style} ${className}`}>
      {badge.label}
    </span>
  );
});

VisitStatusBadge.displayName = 'VisitStatusBadge';

export default VisitStatusBadge;
