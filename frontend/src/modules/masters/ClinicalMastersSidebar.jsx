import React from 'react';

const ClinicalMastersSidebar = React.memo(({
  mastersList = [],
  activeMasterKey,
  onSelectMaster,
  favorites = [],
  onToggleFavorite,
  className = ''
}) => {
  return (
    <div className={`w-full lg:w-[280px] shrink-0 bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 sticky top-4 shadow-card-soft ${className}`}>
      <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Clinical Library
        </span>
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-50 text-[#2F63F2] border border-blue-200">
          {mastersList.length} Masters
        </span>
      </div>

      <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 custom-scrollbar">
        {mastersList.map((master) => {
          const isActive = activeMasterKey === master.key;
          const Icon = master.icon;
          const isFav = favorites.includes(master.key);

          return (
            <div
              key={master.key}
              onClick={() => onSelectMaster(master.key)}
              className={`w-full p-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer select-none group ${
                isActive
                  ? 'bg-[#2F63F2] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                {Icon && (
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                )}
                <span className="truncate">{master.title}</span>
              </div>

              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(master.key);
                  }}
                  className={`p-1 rounded-lg transition-all ${
                    isFav
                      ? isActive ? 'text-amber-300' : 'text-amber-500'
                      : isActive ? 'text-white/40 hover:text-white' : 'text-slate-300 hover:text-slate-500'
                  }`}
                  title={isFav ? 'Remove Favorite' : 'Mark Favorite'}
                >
                  ★
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

ClinicalMastersSidebar.displayName = 'ClinicalMastersSidebar';

export default ClinicalMastersSidebar;
