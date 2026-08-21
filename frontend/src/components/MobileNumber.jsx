import React from 'react';

const MobileNumber = ({
  label,
  countryValue = '+91',
  onCountryChange,
  numberValue,
  onNumberChange,
  value,
  onChange,
  error,
  required = false,
  className = '',
  disabled = false,
  placeholder = 'Enter Mobile Number',
  ...rest
}) => {
  const displayVal = numberValue !== undefined ? (typeof numberValue === 'object' ? '' : numberValue) : (value !== undefined ? (typeof value === 'object' ? '' : value) : '');

  const handleNumberInput = (e) => {
    let val = e.target.value;
    
    // Allow digits, +, -, and spaces
    val = val.replace(/[^0-9+\-\s]/g, '');
    
    if (val.length > 15) {
      val = val.slice(0, 15);
    }
    
    if (onNumberChange) {
      onNumberChange(val);
    }
    if (onChange) {
      onChange(val);
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">
          {typeof label === 'string' ? label.replace(/\s*\*+$/, '') : label} {required && <span className="text-[#EF4444]">*</span>}
        </label>
      )}
      <div className={`relative flex items-stretch rounded-lg border overflow-hidden transition-all bg-white ${
        error ? 'border-[#EF4444] focus-within:ring-2 focus-within:ring-[#EF4444]/10 focus-within:border-[#EF4444]' : 'border-slate-300 focus-within:ring-2 focus-within:ring-[#2F63F2]/10 focus-within:border-[#2F63F2]'
      }`}>
        
        {/* Country Code Dropdown */}
        <div className="flex items-center px-3 bg-slate-50 border-r border-slate-200 select-none">
          <select
            value={countryValue}
            onChange={(e) => onCountryChange && onCountryChange(e.target.value)}
            disabled={disabled}
            className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer pr-1 appearance-none"
          >
            <option value="+91">+91</option>
          </select>
          <span className="text-[7px] text-slate-500 pointer-events-none -ml-0.5">▼</span>
        </div>

        {/* Number Input */}
        <input
          type="text"
          value={displayVal}
          onChange={handleNumberInput}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={15}
          className="w-full px-3 py-2 text-xs text-slate-800 placeholder-slate-400 bg-transparent outline-none border-none"
          {...rest}
        />
      </div>
      {error && <span className="text-xs text-[#EF4444] pl-1 mt-0.5">{error}</span>}
    </div>
  );
};

export default MobileNumber;
