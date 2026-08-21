import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientService } from '../../services';
import { QUERY_KEYS } from '../../constants/queryKeys';

export const usePatientSearch = (query) => {
  return useQuery({
    queryKey: QUERY_KEYS.patients.search(query),
    queryFn: () => patientService.searchPatients(query),
    enabled: Boolean(query && query.trim().length >= 2),
    staleTime: 60000
  });
};

export const usePatientMedicalHistory = (patientId) => {
  return useQuery({
    queryKey: QUERY_KEYS.patients.history(patientId),
    queryFn: () => patientService.getMedicalHistory(patientId),
    enabled: Boolean(patientId),
    staleTime: 60000
  });
};
