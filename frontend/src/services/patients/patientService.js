import api from '../api';

export const patientService = {
  searchPatients: async (query) => {
    const response = await api.get('/patients/search', { params: { query } });
    return response.data;
  },

  getPatient: async (id) => {
    const response = await api.get(`/patients/${id}`);
    return response.data;
  },

  createPatient: async (data) => {
    const response = await api.post('/patients', data);
    return response.data;
  },

  updatePatient: async (id, data) => {
    const response = await api.put(`/patients/${id}`, data);
    return response.data;
  },

  getMedicalHistory: async (id) => {
    const response = await api.get(`/patients/${id}/medical-history`);
    return response.data;
  }
};

export default patientService;
