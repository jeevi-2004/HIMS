import React from 'react';

const WorkspaceFilterBar = React.memo(({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search patient name, ID or mobile...',
  children,
  className = ''
}) => {
  return (
    <div className={`p-4 bg-white border border-slate-200 rounded-2xl shadow-card-soft space-y-3 ${className}`}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {searchValue !== undefined && (
          <div className="relative flex-1 min-w-[240px]">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2F63F2] focus:border-transparent transition-all"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}
        {children && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
});

WorkspaceFilterBar.displayName = 'WorkspaceFilterBar';

export default WorkspaceFilterBar;
