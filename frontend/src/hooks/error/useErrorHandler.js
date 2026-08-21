import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { logger, parseError } from '../../utils/logger';

export const useErrorHandler = () => {
  const handleError = useCallback((error, customMessage) => {
    const parsed = parseError(error);
    logger.error(customMessage || parsed.message, error);

    toast.error(customMessage || parsed.message || 'An error occurred.');
    return parsed;
  }, []);

  return { handleError };
};

export default useErrorHandler;
