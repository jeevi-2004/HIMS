import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const Input = forwardRef(({
  label,
  name,
  type = 'text',
  placeholder = '',
  error,
  required = false,
  className = '',
  icon: Icon,
  rightElement,
  value,
  ...rest
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordType = type === 'password';
  const effectiveType = isPasswordType ? (showPassword ? 'text' : 'password') : type;

  // Defensive check: if value accidentally receives an object (e.g. SyntheticEvent), extract string or fallback to empty string
  const safeValue = (value && typeof value === 'object')
    ? (value.target?.value !== undefined ? value.target.value : '')
    : (value ?? '');

  const handleWheel = (e) => {
    if (type === 'number') {
      e.target.blur();
    }
    if (rest.onWheel) {
      rest.onWheel(e);
    }
  };

  const handleKeyDown = (e) => {
    if (type === 'number' && (rest.min !== undefined && Number(rest.min) >= 0 || name === 'age' || label?.toString().toLowerCase().includes('age'))) {
      if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
        e.preventDefault();
      }
    }
    if (rest.onKeyDown) {
      rest.onKeyDown(e);
    }
  };

  const effectiveRightElement = rightElement || (isPasswordType ? (
    <button
      type="button"
      onClick={() => setShowPassword((prev) => !prev)}
      className="text-slate-400 hover:text-slate-600 focus:outline-none p-1 transition-colors flex items-center justify-center cursor-pointer"
      tabIndex={-1}
      title={showPassword ? 'Hide Security PIN' : 'Show Security PIN'}
      aria-label={showPassword ? 'Hide Security PIN' : 'Show Security PIN'}
    >
      {showPassword ? (
        <EyeOff className="w-4 h-4 text-slate-500" />
      ) : (
        <Eye className="w-4 h-4 text-slate-500" />
      )}
    </button>
  ) : null);

  const inputProps = {
    ref,
    name,
    type: effectiveType,
    placeholder,
    min: rest.min ?? (type === 'number' && (name === 'age' || label?.toString().toLowerCase().includes('age')) ? 0 : undefined),
    onWheel: handleWheel,
    onKeyDown: handleKeyDown,
    className: `enterprise-input w-full ${Icon ? '!pl-11' : ''} ${effectiveRightElement ? '!pr-11' : ''} ${
      error ? 'border-[#EF4444] focus:ring-[#EF4444]/10 focus:border-[#EF4444]' : ''
    }`,
    ...rest
  };

  if (value !== undefined) {
    inputProps.value = safeValue;
  }

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">
          {typeof label === 'string' ? label.replace(/\s*\*+$/, '') : label} {required && <span className="text-[#EF4444]">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute left-3.5 text-[#6B7280] pointer-events-none">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <input {...inputProps} />
        {effectiveRightElement && (
          <div className="absolute right-3 flex items-center justify-center">
            {effectiveRightElement}
          </div>
        )}
      </div>
      {error && <span className="text-xs text-[#EF4444] pl-1 mt-0.5">{error}</span>}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
