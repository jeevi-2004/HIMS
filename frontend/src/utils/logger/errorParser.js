/**
 * Standardized Error Parser Utility
 */

export const parseError = (error) => {
  if (!error) {
    return { message: 'An unknown error occurred.', code: 'UNKNOWN_ERROR', status: 500 };
  }

  // Axios API response error
  if (error.response) {
    return {
      message: error.response.data?.message || error.response.data?.error || 'Server error occurred.',
      code: error.response.data?.code || `HTTP_${error.response.status}`,
      status: error.response.status,
      stack: error.stack
    };
  }

  // Axios network failure error (no response)
  if (error.request) {
    return {
      message: 'Network error. Please check your internet connection.',
      code: 'NETWORK_ERROR',
      status: 0,
      stack: error.stack
    };
  }

  // Standard JavaScript / React Error
  return {
    message: error.message || String(error),
    code: error.name || 'CLIENT_ERROR',
    status: 500,
    stack: error.stack
  };
};

export default parseError;
