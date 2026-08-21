import api from '../api';

export const doctorService = {
  getDoctors: async () => {
    const response = await api.get('/doctors');
    return response.data;
  },

  getDoctorDashboard: async (doctorId) => {
    const response = await api.get(`/doctors/${doctorId}/dashboard`);
    return response.data;
  },

  getDoctorAvailability: async (doctorId) => {
    const response = await api.get(`/doctors/${doctorId}/availability`);
    return response.data;
  }
};

export default doctorService;
