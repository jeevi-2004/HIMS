import React from 'react';
import { RotateCw } from 'lucide-react';

const RetryButton = React.memo(({ onClick, loading = false, children = 'Retry', className = '' }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`h-8 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all cursor-pointer inline-flex items-center gap-1.5 border border-slate-200 ${loading ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      <span>{children}</span>
    </button>
  );
});

RetryButton.displayName = 'RetryButton';

export default RetryButton;
