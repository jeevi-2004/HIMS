import React from 'react';

const MetricSummaryCard = React.memo(({
  title,
  value,
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBackground = 'bg-blue-50 border-blue-200',
  borderColor = 'border-slate-200',
  subtitle,
  badge,
  onClick,
  loading = false,
  className = ''
}) => {
  return (
    <div
      onClick={onClick}
      className={`p-4 bg-white border ${borderColor} rounded-2xl shadow-card-soft transition-all flex items-center justify-between ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300 active:scale-[0.99]' : ''
      } ${className}`}
    >
      <div className="space-y-1 min-w-0 flex-1 pr-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
            {title}
          </span>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {badge}
            </span>
          )}
        </div>
        {loading ? (
          <div className="h-8 w-16 bg-slate-200 animate-pulse rounded-lg mt-1" />
        ) : (
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {value ?? 0}
          </div>
        )}
        {subtitle && (
          <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {Icon && (
        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${iconBackground} ${iconColor}`}>
          <Icon className="w-5 h-5 stroke-[2.2]" />
        </div>
      )}
    </div>
  );
});

MetricSummaryCard.displayName = 'MetricSummaryCard';

export default MetricSummaryCard;
