import React from 'react';
import VisitStatusBadge from '../shared/VisitStatusBadge';

const StatusCell = React.memo(({ appointment, status, style, label, className = '' }) => {
  if (appointment) {
    return <VisitStatusBadge appointment={appointment} className={className} />;
  }

  return (
    <span className={`text-[9px] font-bold border px-2.5 py-1 rounded-xl uppercase tracking-wider inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 w-fit ${style || 'border-slate-200 bg-slate-100 text-slate-700'} ${className}`}>
      {label || status || '-'}
    </span>
  );
});

StatusCell.displayName = 'StatusCell';

export default StatusCell;
