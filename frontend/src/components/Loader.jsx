import React from 'react';

export const Spinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={`animate-spin rounded-full border-t-[#2F63F2] border-r-transparent border-b-transparent border-l-transparent ${sizes[size]} ${className}`}
      role="status"
    />
  );
};

export const CardSkeleton = () => {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-6 w-full flex flex-col gap-4 animate-pulse shadow-sm">
      <div className="h-6 w-2/5 bg-slate-100 rounded-lg"></div>
      <div className="h-4 w-full bg-slate-50 rounded-md"></div>
      <div className="h-4 w-5/6 bg-slate-50 rounded-md"></div>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#E5E7EB]">
        <div className="h-4 w-1/4 bg-slate-50 rounded-md"></div>
        <div className="h-8 w-1/4 bg-slate-100 rounded-lg"></div>
      </div>
    </div>
  );
};

export const TableSkeleton = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="w-full flex flex-col gap-3">
      <div className="h-10 w-full bg-slate-100 rounded-xl skeleton-pulse" />
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-12 w-full bg-white border border-[#E5E7EB] rounded-xl flex items-center px-4 justify-between gap-4">
          {[...Array(cols)].map((_, j) => (
            <div key={j} className="h-4 flex-1 bg-slate-50 rounded" />
          ))}
        </div>
      ))}
    </div>
  );
};
