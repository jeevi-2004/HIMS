import React from 'react';
import { Calendar } from 'lucide-react';

const EmptyStateCard = React.memo(({
  icon: Icon = Calendar,
  title = 'No Records Found',
  description = 'There are no items to display for the current filter criteria.',
  buttonText,
  buttonAction,
  className = ''
}) => {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 my-4 max-w-md mx-auto shadow-card-soft ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto">
        <Icon className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      {buttonText && buttonAction && (
        <button
          type="button"
          onClick={buttonAction}
          className="mt-2 h-9 px-4 rounded-xl bg-[#2F63F2] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
        >
          {buttonText}
        </button>
      )}
    </div>
  );
});

EmptyStateCard.displayName = 'EmptyStateCard';

export default EmptyStateCard;
