import api from '../api';

export const clinicalMastersService = {
  getMasterData: async (masterKey) => {
    const response = await api.get(`/clinical-masters/${masterKey}`);
    return response.data;
  },

  saveMasterData: async (masterKey, items) => {
    const response = await api.put(`/clinical-masters/${masterKey}`, { items });
    return response.data;
  }
};

export default clinicalMastersService;
