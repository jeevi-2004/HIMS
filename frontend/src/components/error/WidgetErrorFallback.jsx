import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

const WidgetErrorFallback = React.memo(({
  title = 'Component Error',
  resetErrorBoundary,
  className = ''
}) => {
  return (
    <div className={`p-4 bg-rose-50/60 border border-rose-200 rounded-xl text-center space-y-2 ${className}`}>
      <div className="flex items-center justify-center gap-1.5 text-rose-700 text-xs font-bold">
        <AlertTriangle className="w-4 h-4 text-rose-500" />
        <span>{title}</span>
      </div>
      {resetErrorBoundary && (
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="h-7 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1"
        >
          <RotateCw className="w-3 h-3" />
          <span>Reload Widget</span>
        </button>
      )}
    </div>
  );
});

WidgetErrorFallback.displayName = 'WidgetErrorFallback';

export default WidgetErrorFallback;
