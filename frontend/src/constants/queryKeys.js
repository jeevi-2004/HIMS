/**
 * Enterprise Centralized React Query Key Definitions
 */

export const QUERY_KEYS = {
  appointments: {
    all: ['appointments'],
    today: ['appointments', 'today'],
    detail: (id) => ['appointments', id]
  },
  patients: {
    all: ['patients'],
    search: (query) => ['patients', 'search', query],
    detail: (id) => ['patients', id],
    history: (id) => ['patients', id, 'history']
  },
  consultations: {
    byVisit: (visitId) => ['consultations', 'visit', visitId],
    detail: (id) => ['consultations', id]
  },
  prescriptions: {
    byVisit: (visitId) => ['prescriptions', 'visit', visitId],
    detail: (id) => ['prescriptions', id]
  },
  pharmacy: {
    queue: ['pharmacy', 'queue'],
    history: ['pharmacy', 'history'],
    stock: ['pharmacy', 'stock']
  },
  masters: {
    byKey: (key) => ['masters', key]
  },
  admin: {
    profile: ['admin', 'profile'],
    departments: ['admin', 'departments'],
    services: ['admin', 'services'],
    users: ['admin', 'users'],
    billingSettings: ['admin', 'billing-settings']
  },
  reports: {
    dashboard: ['reports', 'dashboard'],
    doctor: ['reports', 'doctor'],
    pharmacy: ['reports', 'pharmacy']
  }
};

export default QUERY_KEYS;
