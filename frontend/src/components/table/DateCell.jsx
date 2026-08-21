import React from 'react';

const DateCell = React.memo(({ date, format = 'DD/MM/YYYY', className = '' }) => {
  if (!date) return <span className={`text-slate-400 font-mono text-xs ${className}`}>-</span>;

  let formatted = date;
  try {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      formatted = `${day}/${month}/${year}`;
    }
  } catch {
    formatted = date;
  }

  return (
    <span className={`font-mono text-xs text-slate-700 font-medium ${className}`}>
      {formatted}
    </span>
  );
});

DateCell.displayName = 'DateCell';

export default DateCell;
