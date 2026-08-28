import React from 'react';

const Card = ({ children, className = '', title, subtitle, footer, action }) => {
  return (
    <div className={`bg-white border border-[#E5E7EB] rounded-[20px] p-6 shadow-card-soft hover:shadow-md transition-all duration-300 ${className}`}>
      {(title || subtitle || action) && (
        <div className="mb-5 pb-4 border-b border-[#E5E7EB] flex items-center justify-between gap-4">
          <div>
            {title && <h3 className="text-sm font-semibold uppercase tracking-wider text-[#2F63F2]">{title}</h3>}
            {subtitle && <p className="text-xs text-[#6B7280] mt-1 font-medium">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="text-[#111827]">{children}</div>
      {footer && <div className="mt-5 pt-4 border-t border-[#E5E7EB] flex justify-end gap-2">{footer}</div>}
    </div>
  );
};

export default Card;
