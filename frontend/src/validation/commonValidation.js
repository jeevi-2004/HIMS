/**
 * Enterprise Common Validation Rules
 */

export const validators = {
  required: (value, fieldName = 'Field') => {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return `${fieldName} is required.`;
    }
    return null;
  },

  mobile: (value) => {
    if (!value) return null;
    const clean = String(value).replace(/\D/g, '');
    if (clean.length !== 10) {
      return 'Mobile number must be 10 digits.';
    }
    return null;
  },

  email: (value) => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Invalid email address format.';
    }
    return null;
  },

  age: (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (isNaN(num) || num < 0 || num > 120) {
      return 'Age must be between 0 and 120.';
    }
    return null;
  },

  numeric: (value, fieldName = 'Value') => {
    if (value === null || value === undefined || value === '') return null;
    if (isNaN(Number(value))) {
      return `${fieldName} must be a number.`;
    }
    return null;
  }
};

export default validators;
