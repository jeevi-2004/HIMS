import api from '../api';

export const appointmentService = {
  getTodayAppointments: async (params) => {
    const response = await api.get('/appointments/today', { params });
    return response.data;
  },

  getAppointments: async (params) => {
    const response = await api.get('/appointments', { params });
    return response.data;
  },

  getAppointment: async (id) => {
    const response = await api.get(`/appointments/${id}`);
    return response.data;
  },

  createAppointment: async (data) => {
    const response = await api.post('/appointments', data);
    return response.data;
  },

  updateAppointmentStatus: async (id, status) => {
    const response = await api.put(`/appointments/${id}/status`, { status });
    return response.data;
  },

  checkInPatient: async (id) => {
    const response = await api.put(`/appointments/${id}/check-in`);
    return response.data;
  },

  markNoShow: async (id) => {
    const response = await api.put(`/appointments/${id}/status`, { status: 'NO_SHOW' });
    return response.data;
  }
};

export default appointmentService;
