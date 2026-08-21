import api from '../api';

export const prescriptionService = {
  savePrescription: async (data) => {
    const response = await api.post('/prescriptions', data);
    return response.data;
  },

  getPrescriptionByVisit: async (visitId) => {
    const response = await api.get(`/prescriptions/visit/${visitId}`);
    return response.data;
  },

  getPrescriptionById: async (id) => {
    const response = await api.get(`/prescriptions/${id}`);
    return response.data;
  }
};

export default prescriptionService;
