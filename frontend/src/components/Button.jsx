import React from 'react';
import { Spinner } from './Loader';

const Button = ({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  className = '',
  icon: Icon,
  ...rest
}) => {
  const baseStyle = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white active:scale-95 disabled:scale-100 disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-wider';
  
  const variants = {
    primary: 'bg-[#2F63F2] hover:bg-[#2555E6] text-white shadow-sm hover:shadow-md focus:ring-[#2F63F2]',
    secondary: 'bg-transparent hover:bg-[#2F63F2]/5 text-[#2F63F2] border border-[#2F63F2] focus:ring-[#2F63F2]',
    glass: 'bg-white hover:bg-slate-50 text-[#6B7280] border border-[#E5E7EB] focus:ring-slate-300',
    danger: 'bg-[#EF4444] hover:bg-[#dc2626] text-white shadow-sm focus:ring-[#EF4444]',
    success: 'bg-[#10B981] hover:bg-[#059669] text-white shadow-sm focus:ring-[#10B981]',
  };

  const sizes = {
    sm: 'px-3 py-2 text-[10px]',
    md: 'px-4 py-2.5 text-xs',
    lg: 'px-6 py-3.5 text-sm',
  };

  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) return Icon;
    if (typeof Icon === 'function' || (typeof Icon === 'object' && (Icon.render || Icon.$$typeof))) {
      const Component = Icon;
      return <Component className="w-4 h-4 mr-2 flex-shrink-0" />;
    }
    return null;
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" className="mr-2" />
      ) : renderIcon()}
      {children}
    </button>
  );
};

export default Button;
