import React from 'react';
import ErrorState from '../feedback/ErrorState';

const PageErrorFallback = React.memo(({
  title = 'Workspace Render Error',
  description = 'An unexpected UI rendering error occurred in this workspace.',
  error,
  resetErrorBoundary
}) => {
  const errorMessage = error?.message || (typeof error === 'string' ? error : description);

  const handleClearCacheAndReload = () => {
    try {
      // Clear any corrupted local consultation drafts
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('consult_') || key.startsWith('cm_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (_) {}
    if (resetErrorBoundary) {
      resetErrorBoundary();
    }
    window.location.reload();
  };

  return (
    <div className="min-h-[70vh] w-full flex flex-col items-center justify-center p-6 bg-[#F8FAFC]">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto text-xl">
          ⚠️
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-red-600 font-mono mt-2 bg-red-50 p-2.5 rounded-lg border border-red-100 text-left overflow-auto max-h-32 break-words">
            {errorMessage}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          {resetErrorBoundary && (
            <button
              type="button"
              onClick={resetErrorBoundary}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-xs"
            >
              Retry View
            </button>
          )}
          <button
            type="button"
            onClick={handleClearCacheAndReload}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 cursor-pointer shadow-xs"
          >
            Reset Draft & Reload
          </button>
        </div>
      </div>
    </div>
  );
});

PageErrorFallback.displayName = 'PageErrorFallback';

export default PageErrorFallback;
