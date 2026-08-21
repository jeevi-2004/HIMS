export const secureStorage = {
  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      return JSON.parse(item);
    } catch {
      return localStorage.getItem(key);
    }
  },

  set: (key, value) => {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      localStorage.setItem(key, serialized);
    } catch (err) {
      console.error(`[SecureStorage Error] Failed to set key ${key}`, err);
    }
  },

  remove: (key) => {
    localStorage.removeItem(key);
  },

  clear: () => {
    localStorage.clear();
  }
};

export default secureStorage;
