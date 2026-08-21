import { useState } from 'react';

export const useMobileValidation = (initialValue = '') => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');

  const handleChange = (val) => {
    let sanitized = val.replace(/[^0-9+\-\s]/g, '');
    if (sanitized.length > 15) {
      sanitized = sanitized.slice(0, 15);
    }
    
    setValue(sanitized);
    validate(sanitized);
  };

  const validate = (val) => {
    if (!val || val.length === 0) {
      setError('Mobile number is required.');
    } else if (!/^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(val)) {
      setError('Please enter a valid mobile number.');
    } else {
      setError('');
    }
  };

  const isValid = value && /^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(value) && !error;

  return {
    value,
    setValue,
    error,
    setError,
    handleChange,
    validate,
    isValid
  };
};
