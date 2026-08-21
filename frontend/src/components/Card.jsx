import React from 'react';

const Card = ({ children, className = '', title, subtitle, footer }) => {
  return (
    <div className={`bg-white border border-[#E5E7EB] rounded-[20px] p-6 shadow-card-soft hover:shadow-md transition-all duration-300 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-5 pb-4 border-b border-[#E5E7EB]">
          {title && <h3 className="text-sm font-semibold uppercase tracking-wider text-[#2F63F2]">{title}</h3>}
          {subtitle && <p className="text-xs text-[#6B7280] mt-1 font-medium">{subtitle}</p>}
        </div>
      )}
      <div className="text-[#111827]">{children}</div>
      {footer && <div className="mt-5 pt-4 border-t border-[#E5E7EB] flex justify-end gap-2">{footer}</div>}
    </div>
  );
};

export default Card;
