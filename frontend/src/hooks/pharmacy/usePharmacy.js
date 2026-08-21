import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pharmacyService } from '../../services';
import { QUERY_KEYS } from '../../constants/queryKeys';

export const useDispenseQueue = () => {
  return useQuery({
    queryKey: QUERY_KEYS.pharmacy.queue,
    queryFn: () => pharmacyService.getDispenseQueue(),
    staleTime: 30000,
    refetchInterval: 30000
  });
};

export const useDispenseHistory = () => {
  return useQuery({
    queryKey: QUERY_KEYS.pharmacy.history,
    queryFn: () => pharmacyService.getDispenseHistory(),
    staleTime: 60000
  });
};

export const useCompleteDispense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ prescriptionId, data }) => pharmacyService.completeDispense(prescriptionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pharmacy.queue });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pharmacy.history });
    }
  });
};
