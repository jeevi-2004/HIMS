import api from '../api';

export const consultationService = {
  startConsultation: async (visitId) => {
    const response = await api.post(`/consultations/start`, { visitId });
    return response.data;
  },

  getConsultationByVisit: async (visitId) => {
    const response = await api.get(`/consultations/visit/${visitId}`);
    return response.data;
  },

  saveConsultation: async (id, data) => {
    const response = await api.put(`/consultations/${id}`, data);
    return response.data;
  },

  finishConsultation: async (id) => {
    const response = await api.post(`/consultations/${id}/finish`);
    return response.data;
  }
};

export default consultationService;
