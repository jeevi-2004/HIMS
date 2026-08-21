import React from 'react';

const FormLabel = React.memo(({ label, required = false, htmlFor, className = '' }) => {
  return (
    <label htmlFor={htmlFor} className={`block text-xs font-bold text-slate-700 mb-1 ${className}`}>
      {typeof label === 'string' ? label.replace(/\s*\*+$/, '') : label}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
});

FormLabel.displayName = 'FormLabel';

export default FormLabel;
