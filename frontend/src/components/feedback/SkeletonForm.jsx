import React from 'react';

const SkeletonForm = React.memo(({ fields = 3, className = '' }) => {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-5 space-y-4 animate-pulse ${className}`}>
      {Array.from({ length: fields }).map((_, idx) => (
        <div key={idx} className="space-y-1.5">
          <div className="h-3 w-24 bg-slate-200 rounded-lg" />
          <div className="h-9 w-full bg-slate-100 rounded-xl" />
        </div>
      ))}
    </div>
  );
});

SkeletonForm.displayName = 'SkeletonForm';

export default SkeletonForm;
