import api from '../api';

export const reportService = {
  getDashboardAnalytics: async (params) => {
    const response = await api.get('/reports/dashboard', { params });
    return response.data;
  },

  getDoctorReports: async (params) => {
    const response = await api.get('/reports/doctor', { params });
    return response.data;
  },

  getPharmacyReports: async (params) => {
    const response = await api.get('/reports/pharmacy', { params });
    return response.data;
  },

  getReceptionReports: async (params) => {
    const response = await api.get('/reports/reception', { params });
    return response.data;
  }
};

export default reportService;
