import React from 'react';

const PageLoader = () => {
  return (
    <div className="min-h-[75vh] w-full flex flex-col items-center justify-center p-6 space-y-6 bg-[#F8FAFC]">
      {/* Central Blue Loader Graphic */}
      <div className="relative flex items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2] animate-bounce shadow-soft">
          <svg className="w-8 h-8 stroke-[2.2] animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.75v1.5M12 17.75v1.5M4.75 12h1.5M17.75 12h1.5M6.636 6.636l1.06 1.06M16.303 16.303l1.06 1.06M6.636 17.364l1.06-1.06M16.303 7.697l1.06-1.06" />
          </svg>
        </div>
      </div>

      {/* Loading Status Text */}
      <div className="text-center space-y-1.5 max-w-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
          Loading Workspace...
        </h3>
        <p className="text-xs text-slate-500 font-medium animate-pulse">
          Syncing enterprise clinical data & modules...
        </p>
      </div>

      {/* Skeleton Card Workspace Preview */}
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-slate-200 animate-pulse rounded-lg" />
          <div className="h-6 w-20 bg-blue-100 animate-pulse rounded-xl" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="h-16 bg-slate-100 animate-pulse rounded-xl" />
          <div className="h-16 bg-slate-100 animate-pulse rounded-xl" />
          <div className="h-16 bg-slate-100 animate-pulse rounded-xl" />
        </div>
        <div className="h-28 bg-slate-50 border border-slate-100 animate-pulse rounded-xl" />
      </div>
    </div>
  );
};

export default PageLoader;
