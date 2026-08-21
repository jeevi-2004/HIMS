import api from '../api';

export const adminService = {
  getHospitalProfile: async () => {
    const response = await api.get('/admin/hospital-profile');
    return response.data;
  },

  getDepartments: async () => {
    const response = await api.get('/admin/departments');
    return response.data;
  },

  getServices: async () => {
    const response = await api.get('/admin/services');
    return response.data;
  },

  getUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  },

  getBillingWorkflowSettings: async () => {
    const response = await api.get('/admin/billing-settings');
    return response.data;
  },

  updateBillingWorkflowSettings: async (settings) => {
    const response = await api.put('/admin/billing-settings', settings);
    return response.data;
  }
};

export default adminService;
