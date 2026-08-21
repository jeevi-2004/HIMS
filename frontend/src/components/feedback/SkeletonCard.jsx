import React from 'react';

const SkeletonCard = React.memo(({ count = 1, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 bg-slate-200 rounded-lg" />
            <div className="h-5 w-16 bg-slate-100 rounded-lg" />
          </div>
          <div className="h-3 w-48 bg-slate-100 rounded-lg" />
        </div>
      ))}
    </div>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

export default SkeletonCard;
