import React, { forwardRef } from 'react';

const FormSelect = forwardRef(({
  label,
  name,
  value,
  onChange,
  error,
  required = false,
  className = '',
  options = [],
  placeholder = '-- Select --',
  children,
  ...rest
}, ref) => {
  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">
          {typeof label === 'string' ? label.replace(/\s*\*+$/, '') : label} {required && <span className="text-[#EF4444]">*</span>}
        </label>
      )}
      <select
        ref={ref}
        name={name}
        value={value}
        onChange={onChange}
        className={`enterprise-input w-full h-[42px] cursor-pointer ${
          error ? 'border-[#EF4444] focus:ring-[#EF4444]/10 focus:border-[#EF4444]' : ''
        }`}
        {...rest}
      >
        {children ? (
          children
        ) : (
          <>
            <option value="">{placeholder}</option>
            {options.map((opt) => {
              const val = typeof opt === 'object' ? opt.value : opt;
              const lbl = typeof opt === 'object' ? opt.label : opt;
              return (
                <option key={val} value={val}>
                  {lbl}
                </option>
              );
            })}
          </>
        )}
      </select>
      {error && <span className="text-xs text-[#EF4444] pl-1 mt-0.5">{error}</span>}
    </div>
  );
});

FormSelect.displayName = 'FormSelect';

export default FormSelect;
