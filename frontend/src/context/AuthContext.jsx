import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Re-fetch user profile to sync state
  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem('vzh_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    
    try {
      const response = await api.get('/auth/profile');
      if (response.data.success) {
        setUser(response.data.user);
        localStorage.setItem('vzh_user', JSON.stringify(response.data.user));
      } else {
        logout();
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      logout();
    } finally {
      setLoading(false);
    }
  }, []);

  // Run on startup to restore session
  useEffect(() => {
    const storedUser = localStorage.getItem('vzh_user');
    const storedToken = localStorage.getItem('vzh_token');
    
    if (storedToken && storedUser) {
      setUser(JSON.parse(storedUser));
      // Asynchronously refresh profile to ensure validity
      loadProfile();
    } else {
      setLoading(false);
    }
  }, [loadProfile]);

  // Set session directly (used by developer login or direct token authentication)
  const setSession = useCallback((token, loggedUser) => {
    localStorage.setItem('vzh_token', token);
    localStorage.setItem('vzh_user', JSON.stringify(loggedUser));
    setUser(loggedUser);
    setLoading(false);
  }, []);

  // Handle Login
  const login = async (credentials) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', credentials);
      if (response.data.success) {
        const { token, user: loggedUser } = response.data;
        setSession(token, loggedUser);
        return { success: true };
      }
    } catch (error) {
      console.error('Login error details:', error);
      const msg = error.response?.data?.message || 'Login failed. Please check connection and try again.';
      const code = error.response?.data?.code;
      const distanceMeters = error.response?.data?.distanceMeters;
      const allowedRadius = error.response?.data?.allowedRadius;
      return { success: false, message: msg, code, distanceMeters, allowedRadius };
    } finally {
      setLoading(false);
    }
  };

  // Handle Logout
  const logout = async () => {
    try {
      // Best effort logout on backend
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Backend logout failed:', err);
    } finally {
      localStorage.removeItem('vzh_token');
      localStorage.removeItem('vzh_user');
      setUser(null);
      setLoading(false);
    }
  };

  // Check if current user has specific permission
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true; // Super Admin bypasses all
    return user.permissions?.includes(permission) || false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setSession, hasPermission, reloadProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
