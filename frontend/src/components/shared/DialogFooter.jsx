import React from 'react';

const DialogFooter = React.memo(({
  primaryText = 'Save',
  onPrimary,
  secondaryText = 'Cancel',
  onSecondary,
  loading = false,
  disabled = false,
  danger = false,
  children,
  className = ''
}) => {
  return (
    <div className={`px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex justify-end items-center gap-3 shrink-0 ${className}`}>
      {children}

      {onSecondary && (
        <button
          type="button"
          onClick={onSecondary}
          disabled={loading}
          className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
        >
          {secondaryText}
        </button>
      )}

      {onPrimary && (
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled || loading}
          className={`h-9 px-5 rounded-xl text-white text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-2 ${
            danger
              ? 'bg-rose-600 hover:bg-rose-700'
              : 'bg-[#2F63F2] hover:bg-blue-700'
          } ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading && (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.75v1.5M12 17.75v1.5M4.75 12h1.5M17.75 12h1.5" />
            </svg>
          )}
          <span>{primaryText}</span>
        </button>
      )}
    </div>
  );
});

DialogFooter.displayName = 'DialogFooter';

export default DialogFooter;
