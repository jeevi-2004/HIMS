/**
 * Standardized Error Parser Utility
 */

export const parseError = (error) => {
  if (!error) {
    return { message: 'An unknown error occurred.', code: 'UNKNOWN_ERROR', status: 500 };
  }

  // Unwrap if nested { error, componentStack }
  const target = error.error || error;

  // Axios API response error
  if (target.response) {
    return {
      message: target.response.data?.message || target.response.data?.error || 'Server error occurred.',
      code: target.response.data?.code || `HTTP_${target.response.status}`,
      status: target.response.status,
      stack: target.stack
    };
  }

  // Axios network failure error (no response)
  if (target.request) {
    return {
      message: 'Network error. Please check your internet connection.',
      code: 'NETWORK_ERROR',
      status: 0,
      stack: target.stack
    };
  }

  // Standard JavaScript / React Error
  return {
    message: target.message || (typeof target === 'string' ? target : JSON.stringify(target)),
    code: target.name || 'CLIENT_ERROR',
    status: 500,
    stack: target.stack || error.componentStack
  };
};

export default parseError;
