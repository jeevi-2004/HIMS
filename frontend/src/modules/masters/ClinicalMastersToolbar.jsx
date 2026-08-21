import React from 'react';

const ClinicalMastersToolbar = React.memo(({
  searchQuery,
  onSearchChange,
  activeMasterTitle,
  onAddNew,
  onExportCSV,
  className = ''
}) => {
  return (
    <div className={`p-4 bg-white border border-slate-200 rounded-2xl shadow-card-soft space-y-3 ${className}`}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold text-slate-900 truncate">
            {activeMasterTitle || 'Clinical Master Registry'}
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[220px] flex-1 sm:flex-none">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search master items..."
              className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2F63F2] focus:border-transparent transition-all"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {onExportCSV && (
            <button
              type="button"
              onClick={onExportCSV}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Export CSV</span>
            </button>
          )}

          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="h-9 px-4 rounded-xl bg-[#2F63F2] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <span>+ Add Entry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

ClinicalMastersToolbar.displayName = 'ClinicalMastersToolbar';

export default ClinicalMastersToolbar;
