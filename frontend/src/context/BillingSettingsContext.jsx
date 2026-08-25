import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { createWorkflowEngine } from '../utils/workflowPermissions';
import { createWorkflowDecisionEngine } from '../utils/workflowDecisionEngine';
import { createQueueOrchestrationEngine } from '../utils/queueOrchestrationEngine';

const DEFAULT_SETTINGS = {
  feeCollectionRole: 'Reception',
  paymentTiming: 'Before Consultation',
  collectMedicineInPharmacy: true,
  enableEmergencyModule: false,
  allowUnknownPatients: true,
  emergencyQueuePriority: 'OVERRIDE',
  emergencyTokenPrefix: 'EMG',
  notifyDoctorAlert: true,
  notifyDisplayBoard: true,
  notifyVoiceAnnouncement: true,
  emergencyBillingPolicy: 'POSTPONE'
};

const BillingSettingsContext = createContext();

export const BillingSettingsProvider = ({ children }) => {
  const [billingSettings, setBillingSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('villzone_billing_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          enableEmergencyModule: parsed.enableEmergencyModule === true
        };
      }
    } catch {
      console.error('Failed to load local billing settings');
    }
    return DEFAULT_SETTINGS;
  });

  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    const token = localStorage.getItem('vzh_token') || localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/admin/hospital/billing-settings');
      if (res.data?.data) {
        const fetched = res.data.data;
        const merged = {
          ...DEFAULT_SETTINGS,
          ...fetched,
          enableEmergencyModule: fetched.enableEmergencyModule === true
        };
        setBillingSettings(merged);
        localStorage.setItem('villzone_billing_settings', JSON.stringify(merged));
      }
    } catch (err) {
      if (err?.response?.status !== 401) {
        console.log('Using cached or default billing settings:', err?.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateBillingSettings = async (newSettings, successMessage) => {
    const updated = { ...billingSettings, ...newSettings };
    setBillingSettings(updated);
    localStorage.setItem('villzone_billing_settings', JSON.stringify(updated));

    try {
      const res = await api.put('/admin/hospital/billing-settings', updated);
      if (res.data?.data) {
        setBillingSettings(res.data.data);
        localStorage.setItem('villzone_billing_settings', JSON.stringify(res.data.data));
      }
      toast.success(successMessage || 'Hospital Settings updated successfully!');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to sync settings with server, saved locally');
      return false;
    }
  };

  const workflow = useMemo(() => createWorkflowEngine(billingSettings), [billingSettings]);
  const workflowDecisionEngine = useMemo(() => createWorkflowDecisionEngine(billingSettings), [billingSettings]);
  const queueEngine = useMemo(() => createQueueOrchestrationEngine(billingSettings), [billingSettings]);

  const getAppointmentActions = (appointment, role) => {
    return workflowDecisionEngine.evaluateActions(appointment, role);
  };

  const getWorkflowSnapshot = (appointment, role) => {
    return workflowDecisionEngine.getWorkflowSnapshot(appointment, role);
  };

  const getQueueEvaluation = (appointment, allAppointments = []) => {
    return queueEngine.evaluateAppointment(appointment, allAppointments);
  };

  const getQueueSnapshot = (allAppointments = []) => {
    return queueEngine.getQueueSnapshot(allAppointments);
  };

  return (
    <BillingSettingsContext.Provider 
      value={{ 
        billingSettings,
        workflow,
        workflowDecisionEngine,
        queueEngine,
        getAppointmentActions,
        getWorkflowSnapshot,
        getQueueEvaluation,
        getQueueSnapshot,
        updateBillingSettings, 
        refetchSettings: fetchSettings,
        loading 
      }}
    >
      {children}
    </BillingSettingsContext.Provider>
  );
};

export const useBillingSettings = () => {
  const context = useContext(BillingSettingsContext);
  if (!context) {
    throw new Error('useBillingSettings must be used within a BillingSettingsProvider');
  }
  return context;
};
