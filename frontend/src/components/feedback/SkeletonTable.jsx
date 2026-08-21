import React from 'react';

const SkeletonTable = React.memo(({ rows = 5, cols = 4, className = '' }) => {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-4 space-y-3 animate-pulse ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        {Array.from({ length: cols }).map((_, idx) => (
          <div key={idx} className="h-3 w-20 bg-slate-200 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3 pt-1">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="flex items-center justify-between">
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div key={cIdx} className="h-3 w-24 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

SkeletonTable.displayName = 'SkeletonTable';

export default SkeletonTable;
