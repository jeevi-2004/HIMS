import api from '../api';

/**
 * IPD (In-Patient Department) Centralized API Service
 */
export const ipdService = {
  /**
   * Fetches today's live IPD queue status and recent admissions.
   * @param {Object} params - Optional query params like { date: 'YYYY-MM-DD' }
   */
  getDashboardLiveStatus: async (params = {}) => {
    const res = await api.get('/ipd/dashboard', { params });
    return res.data;
  },

  /**
   * Fetches admissions list with optional status/date filters.
   */
  getAdmissions: async (params = {}) => {
    const res = await api.get('/ipd/admissions', { params });
    return res.data;
  },

  /**
   * Fetches full admission details by ID.
   */
  getAdmissionById: async (id) => {
    const res = await api.get(`/ipd/admissions/${id}`);
    return res.data;
  },

  /**
   * Creates an IPD patient admission record.
   */
  admitPatient: async (admissionData) => {
    const res = await api.post('/ipd/admissions/admit', admissionData);
    return res.data;
  },

  /**
   * Updates an admission's queueStatus ('Waiting' | 'In Progress' | 'Completed' | 'Cancelled').
   */
  updateAdmissionStatus: async (id, statusData) => {
    const res = await api.put(`/ipd/admissions/${id}/status`, statusData);
    return res.data;
  },

  /**
   * Saves or sends clinical discharge summary for an active inpatient (Doctor Desk).
   */
  saveClinicalDischargeSummary: async (id, summaryData) => {
    const res = await api.put(`/ipd/admissions/${id}/clinical-discharge`, summaryData);
    return res.data;
  },

  /**
   * Discharges an active inpatient.
   */
  dischargePatient: async (id, dischargeData) => {
    const res = await api.put(`/ipd/admissions/${id}/discharge`, dischargeData);
    return res.data;
  },

  /**
   * Records a payment against an inpatient admission.
   */
  recordPayment: async (id, paymentData) => {
    const res = await api.post(`/ipd/admissions/${id}/payment`, paymentData);
    return res.data;
  },

  /**
   * Updates billing charges and adjustments for an inpatient admission.
   */
  updateBilling: async (id, billingData) => {
    const res = await api.put(`/ipd/admissions/${id}/billing`, billingData);
    return res.data;
  },

  /**
   * Adds a manual service or charge item to an inpatient admission's bill.
   */
  addBillingItem: async (id, itemData) => {
    const res = await api.post(`/ipd/admissions/${id}/billing-items`, itemData);
    return res.data;
  },

  /**
   * Deletes a manual service item from an inpatient admission's bill.
   */
  deleteBillingItem: async (admissionId, itemId) => {
    const res = await api.delete(`/ipd/admissions/${admissionId}/billing-items/${itemId}`);
    return res.data;
  },

  /**
   * Fetches all hospital wards.
   */
  getWards: async () => {
    const res = await api.get('/ipd/wards');
    return res.data;
  },

  /**
   * Fetches all hospital beds.
   */
  getBeds: async () => {
    const res = await api.get('/ipd/beds');
    return res.data;
  },

  /**
   * Deletes a bed (soft delete).
   */
  deleteBed: async (id) => {
    const res = await api.delete(`/ipd/beds/${id}`);
    return res.data;
  },

  /**
   * Fetches daily clinical reviews for an admission.
   */
  getDailyReviews: async (admissionId) => {
    const res = await api.get(`/ipd/admissions/${admissionId}/daily-reviews`);
    return res.data;
  },

  /**
   * Saves or updates a daily clinical review with optional pharmacy prescription dispatch.
   */
  saveDailyReview: async (admissionId, reviewData) => {
    const res = await api.post(`/ipd/admissions/${admissionId}/daily-reviews`, reviewData);
    return res.data;
  },

  /**
   * Fetches the IPD prescription queue for pharmacy dispensing.
   * @param {Object} params - Optional { filter: 'queue' | 'history' | 'all', search: string }
   */
  getPrescriptionQueue: async (params = {}) => {
    const res = await api.get('/ipd/prescriptions/queue', { params });
    return res.data;
  },

  /**
   * Dispenses IPD prescribed medications to the ward.
   * @param {Object} payload - { admissionId, reviewId, prescriptionIds, pharmacistNotes }
   */
  dispensePrescription: async (payload) => {
    const res = await api.post('/ipd/prescriptions/dispense', payload);
    return res.data;
  }
};

export default ipdService;
