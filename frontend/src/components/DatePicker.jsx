import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';

const DatePicker = ({
  label,
  value,
  onChange,
  required = false,
  error,
  min,
  max,
  placeholder = 'dd/mm/yyyy',
  className = '',
  ...rest
}) => {
  const inputRef = useRef(null);

  // Format YYYY-MM-DD to DD/MM/YYYY format for clean display
  const formatDisplayDate = (val) => {
    if (!val) return '';
    const parts = val.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    return val;
  };

  const handleContainerClick = () => {
    if (inputRef.current) {
      if (typeof inputRef.current.showPicker === 'function') {
        try {
          inputRef.current.showPicker();
        } catch {
          inputRef.current.focus();
        }
      } else {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">
          {typeof label === 'string' ? label.replace(/\s*\*+$/, '') : label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div 
        onClick={handleContainerClick}
        className={`relative flex items-center h-[40px] px-3 bg-white border rounded-xl cursor-pointer transition-all ${
          error 
            ? 'border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/10' 
            : 'border-slate-300 hover:border-slate-400 focus-within:border-[#2F63F2] focus-within:ring-2 focus-within:ring-[#2F63F2]/10'
        }`}
      >
        <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0 mr-2.5 pointer-events-none" />
        
        {/* Formatted Text Display dd/mm/yyyy */}
        <span className={`text-xs font-medium flex-grow pointer-events-none select-none ${
          value ? 'text-slate-800 font-semibold' : 'text-slate-400'
        }`}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>

        {/* Hidden Native Input Date Trigger */}
        <input
          ref={inputRef}
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          {...rest}
        />
      </div>
      {error && <span className="text-xs text-rose-500 pl-1 mt-0.5">{error}</span>}
    </div>
  );
};

export default DatePicker;
