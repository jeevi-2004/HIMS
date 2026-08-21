import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';

const ErrorState = React.memo(({
  title = 'Something Went Wrong',
  description = 'An error occurred while loading this section. Please try again.',
  retry,
  icon: Icon = AlertCircle,
  className = ''
}) => {
  return (
    <div className={`bg-rose-50/80 border border-rose-200 rounded-2xl p-6 text-center space-y-3 max-w-md mx-auto my-4 ${className}`}>
      <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
        <Icon className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-rose-900">{title}</h3>
        <p className="text-xs text-rose-700 leading-relaxed max-w-xs mx-auto">
          {description}
        </p>
      </div>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-2 h-8 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Retry Request</span>
        </button>
      )}
    </div>
  );
});

ErrorState.displayName = 'ErrorState';

export default ErrorState;
