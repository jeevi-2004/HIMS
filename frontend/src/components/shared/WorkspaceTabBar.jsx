import React from 'react';

const WorkspaceTabBar = React.memo(({
  tabs = [],
  activeTab,
  onTabChange,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-1.5 p-1.5 bg-slate-100/80 border border-slate-200/80 rounded-2xl overflow-x-auto no-scrollbar ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer select-none ${
              isActive
                ? 'bg-white text-[#2F63F2] shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {Icon && <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#2F63F2]' : 'text-slate-400'}`} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count !== null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                isActive ? 'bg-blue-100 text-[#2F63F2]' : 'bg-slate-200/70 text-slate-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

WorkspaceTabBar.displayName = 'WorkspaceTabBar';

export default WorkspaceTabBar;
