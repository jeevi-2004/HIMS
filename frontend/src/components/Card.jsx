import React from 'react';

const Card = ({ children, className = '', bodyClassName = '', title, subtitle, footer, action }) => {
  const hasPadding = /\bp[xy]?-\d+/.test(className);
  return (
    <div className={`bg-white border border-[#E5E7EB] rounded-[20px] ${hasPadding ? '' : 'p-4 sm:p-6'} shadow-card-soft hover:shadow-md transition-all duration-300 ${className}`}>
      {(title || subtitle || action) && (
        <div className="mb-4 pb-3 border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold uppercase tracking-wider text-[#2F63F2] break-words">{title}</h3>}
            {subtitle && <p className="text-xs text-[#6B7280] mt-1 font-medium break-words">{subtitle}</p>}
          </div>
          {action && <div className="w-full sm:w-auto shrink-0 flex items-center justify-start sm:justify-end">{action}</div>}
        </div>
      )}
      <div className={`text-[#111827] ${bodyClassName}`}>{children}</div>
      {footer && <div className="mt-5 pt-4 border-t border-[#E5E7EB] flex justify-end gap-2">{footer}</div>}
    </div>
  );
};

export default Card;
