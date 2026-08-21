import React from 'react';
import FormLabel from './FormLabel';
import FormError from './FormError';

const FormField = React.memo(({
  label,
  required,
  error,
  children,
  className = ''
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && <FormLabel label={label} required={required} />}
      {children}
      {error && <FormError error={error} />}
    </div>
  );
});

FormField.displayName = 'FormField';

export default FormField;
