import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentService } from '../../services';
import { QUERY_KEYS } from '../../constants/queryKeys';

export const useTodayAppointments = (params) => {
  return useQuery({
    queryKey: QUERY_KEYS.appointments.today,
    queryFn: () => appointmentService.getTodayAppointments(params),
    staleTime: 30000,
    refetchInterval: 60000
  });
};

export const useCheckInAppointment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => appointmentService.checkInPatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.appointments.all });
    }
  });
};
