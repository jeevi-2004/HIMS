import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consultationService } from '../../services';
import { QUERY_KEYS } from '../../constants/queryKeys';

export const useConsultationByVisit = (visitId) => {
  return useQuery({
    queryKey: QUERY_KEYS.consultations.byVisit(visitId),
    queryFn: () => consultationService.getConsultationByVisit(visitId),
    enabled: Boolean(visitId && visitId !== 'new_workspace'),
    staleTime: 30000
  });
};

export const useSaveConsultation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => consultationService.saveConsultation(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.consultations.byVisit(variables.data?.visitId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.appointments.all });
    }
  });
};
