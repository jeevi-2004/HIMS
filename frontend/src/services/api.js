const api = {
  // Basic configurations
  baseURL: 'http://localhost:5000/api',
  
  // Custom fetch wrapper because we can write a highly optimized Axios-like client
  // Or use standard Axios since we installed it. Let's write Axios client.
};

import axios from 'axios';

const apiInstance = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject JWT from localStorage
apiInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('vzh_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to check for 401 errors and handle automatic logout
apiInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('vzh_token');
      localStorage.removeItem('vzh_user');
      // If we are not on the login page, redirect to login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiInstance;
