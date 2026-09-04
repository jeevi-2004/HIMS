import React, { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

const PinInput = ({
  length = 6,
  value = '',
  onChange,
  label = 'Security PIN',
  error,
  disabled = false,
  autoFocus = false,
  className = ''
}) => {
  const [showPin, setShowPin] = useState(false);
  const inputRefs = useRef([]);

  // Ensure value is converted to an array of digits of exact length
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (e, index) => {
    const rawVal = e.target.value;
    const digit = rawVal.replace(/[^0-9]/g, '').slice(-1); // Only take last typed numeric digit

    const newDigits = [...digits];
    newDigits[index] = digit;
    const combinedVal = newDigits.join('');

    if (onChange) {
      onChange(combinedVal);
    }

    // Auto-advance focus to next empty input box
    if (digit && index < length - 1 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0 && inputRefs.current[index - 1]) {
        // If current box is empty, move focus back and erase previous digit
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        if (onChange) onChange(newDigits.join(''));
        inputRefs.current[index - 1].focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0 && inputRefs.current[index - 1]) {
      e.preventDefault();
      inputRefs.current[index - 1].focus();
    } else if (e.key === 'ArrowRight' && index < length - 1 && inputRefs.current[index + 1]) {
      e.preventDefault();
      inputRefs.current[index + 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const numericText = pastedText.replace(/[^0-9]/g, '').slice(0, length);
    if (numericText && onChange) {
      onChange(numericText);
      // Focus on last filled digit box or next empty box
      const targetIndex = Math.min(numericText.length, length - 1);
      if (inputRefs.current[targetIndex]) {
        inputRefs.current[targetIndex].focus();
      }
    }
  };

  return (
    <div className={`space-y-2 text-left ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
            <Lock className="w-3.5 h-3.5 text-[#2F63F2]" />
            <span>{label}</span>
          </label>
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="text-[11px] font-semibold text-slate-500 hover:text-[#2F63F2] flex items-center gap-1 transition-colors cursor-pointer"
            tabIndex={-1}
          >
            {showPin ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Hide PIN</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>Show PIN</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 6 Individual Box Keypad Grid */}
      <div className="grid grid-cols-6 gap-2" onPaste={handlePaste}>
        {Array.from({ length }).map((_, index) => {
          const isFilled = Boolean(digits[index]);
          return (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digits[index]}
              onChange={(e) => handleChange(e, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={disabled}
              className={`w-full h-12 text-center text-lg font-bold font-mono rounded-xl border transition-all duration-150 focus:outline-none select-none ${
                error
                  ? 'border-rose-300 bg-rose-50/50 text-rose-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                  : isFilled
                  ? 'border-[#2F63F2] bg-blue-50/40 text-slate-900 ring-1 ring-[#2F63F2]/30'
                  : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus:border-[#2F63F2] focus:bg-white focus:ring-2 focus:ring-[#2F63F2]/20'
              } disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
              autoComplete="one-time-code"
            />
          );
        })}
      </div>

      {error && (
        <p className="text-[11px] font-semibold text-rose-600 pl-0.5 animate-in fade-in">
          {error}
        </p>
      )}
    </div>
  );
};

export default PinInput;
