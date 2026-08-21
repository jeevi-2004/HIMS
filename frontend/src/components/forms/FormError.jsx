import React from 'react';

const FormError = React.memo(({ error, className = '' }) => {
  if (!error) return null;
  return (
    <p className={`text-[11px] font-medium text-rose-500 mt-1 ${className}`}>
      {error}
    </p>
  );
});

FormError.displayName = 'FormError';

export default FormError;
