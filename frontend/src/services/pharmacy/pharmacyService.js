import api from '../api';

export const pharmacyService = {
  getDispenseQueue: async () => {
    const response = await api.get('/pharmacy/queue');
    return response.data;
  },

  getDispenseHistory: async () => {
    const response = await api.get('/pharmacy/history');
    return response.data;
  },

  completeDispense: async (prescriptionId, data) => {
    const response = await api.post(`/pharmacy/dispense/${prescriptionId}`, data);
    return response.data;
  },

  getMedicineStock: async () => {
    const response = await api.get('/pharmacy/stock');
    return response.data;
  }
};

export default pharmacyService;
