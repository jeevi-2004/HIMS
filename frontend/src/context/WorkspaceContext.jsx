import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext(null);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

export const WorkspaceProvider = ({ children }) => {
  const { user } = useAuth();
  const [workspaceMode, setWorkspaceModeState] = useState(() => {
    try {
      const storedUserStr = localStorage.getItem('vzh_user');
      if (storedUserStr) {
        const u = JSON.parse(storedUserStr);
        if (u.role === 'DOCTOR') return 'clinical_consultation';
      }
    } catch {
      // ignore
    }
    return localStorage.getItem('workspaceMode') || 'clinical_consultation';
  });

  // Enforce role boundaries on user change
  useEffect(() => {
    if (user) {
      if (user.role === 'DOCTOR') {
        setWorkspaceModeState('clinical_consultation');
      } else if (user.role === 'DOCTOR_ADMIN') {
        const stored = localStorage.getItem('workspaceMode');
        if (stored === 'hospital_management' || stored === 'clinical_consultation') {
          setWorkspaceModeState(stored);
        } else {
          setWorkspaceModeState('hospital_management');
        }
      } else if (user.role === 'ADMIN') {
        setWorkspaceModeState('hospital_management');
      }
    }
  }, [user]);

  const setWorkspaceMode = (mode) => {
    if (user?.role === 'DOCTOR' && mode !== 'clinical_consultation') {
      return; // Restrict standard doctors to clinical mode only
    }
    if (user?.role === 'ADMIN' && mode !== 'hospital_management') {
      return; // Restrict standard admins to hospital management mode only
    }
    setWorkspaceModeState(mode);
    localStorage.setItem('workspaceMode', mode);
  };

  const allowedWorkspaces = [];
  if (user?.role === 'DOCTOR_ADMIN') {
    allowedWorkspaces.push(
      { id: 'hospital_management', label: 'Hospital Management', desc: 'Manage hospital operations', icon: 'Building2' },
      { id: 'clinical_consultation', label: 'Doctor Consultation', desc: 'Manage patients & consultations', icon: 'Stethoscope' }
    );
  } else if (user?.role === 'DOCTOR') {
    allowedWorkspaces.push(
      { id: 'clinical_consultation', label: 'Doctor Consultation', desc: 'Manage patients & consultations', icon: 'Stethoscope' }
    );
  }

  return (
    <WorkspaceContext.Provider value={{
      workspaceMode,
      setWorkspaceMode,
      allowedWorkspaces,
      showSwitcher: user?.role === 'DOCTOR_ADMIN'
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
