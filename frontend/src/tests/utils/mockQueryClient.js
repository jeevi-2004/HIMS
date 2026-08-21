import { QueryClient } from '@tanstack/react-query';

export const createMockQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity
      },
      mutations: {
        retry: false
      }
    }
  });
};

export default createMockQueryClient;
