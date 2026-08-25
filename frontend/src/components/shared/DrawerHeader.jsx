import React from 'react';
import { X } from 'lucide-react';

const DrawerHeader = React.memo(({
  title,
  subtitle,
  icon: Icon,
  onClose,
  children,
  className = ''
}) => {
  return (
    <div className={`p-5 border-b border-[#E5E7EB] flex items-center justify-between bg-slate-50 shrink-0 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2F63F2] shrink-0">
            {React.isValidElement(Icon) ? Icon : <Icon className="w-4 h-4" />}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-bold text-sm uppercase tracking-wider text-[#2F63F2] truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {children}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Close Drawer"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
});

DrawerHeader.displayName = 'DrawerHeader';

export default DrawerHeader;
