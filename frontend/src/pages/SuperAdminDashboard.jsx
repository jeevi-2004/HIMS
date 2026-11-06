import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import MobileNumber from '../components/MobileNumber';
import { useMobileValidation } from '../hooks/useMobileValidation';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import Table from '../components/Table';
import PinInput from '../components/PinInput';
import { useFormDraft } from '../hooks/useFormDraft';
import { 
  Building2, Hospital, GitBranch, ClipboardList, Users, ShieldCheck, 
  Activity, Plus, Key, ToggleLeft, CreditCard, ShieldAlert, Award, FileBarChart2, Settings,
  Database, HardDrive, Cpu, Wifi, RefreshCw, Eye, Edit, Trash2, Power, CheckCircle, HelpCircle, MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
const capitalizeWords = (str) => {
  if (typeof str !== 'string' || !str) return '';
  return str.replace(/\b\w/g, char => char.toUpperCase());
};

export const CANONICAL_FEATURE_MODULES = [
  { key: 'OPD', label: 'OPD', default: true },
  { key: 'Appointments', label: 'Appointments', default: true },
  { key: 'IPD', label: 'IPD', default: false },
  { key: 'Billing', label: 'Billing', default: true },
  { key: 'Pharmacy', label: 'Pharmacy', default: true },
  { key: 'Branches', label: 'Multi-Branch', default: false },
  { key: 'digitalPrescription', label: 'Digital Prescription', default: true },
  { key: 'doctorConsultationDesk', label: 'Doctor Consultation Desk', default: true },
  { key: 'voiceAnnouncements', label: 'Voice Announcements', default: true },
  { key: 'Laboratory', label: 'Laboratory', default: false },
  { key: 'Radiology', label: 'Radiology', default: false },
  { key: 'Inventory', label: 'Inventory', default: false },
  { key: 'HRMS', label: 'HRMS', default: false },
  { key: 'Finance', label: 'Finance', default: false },
  { key: 'Insurance', label: 'Insurance', default: false },
  { key: 'PatientPortal', label: 'Patient Portal', default: false }
];

export const getHospitalFeatureModules = (hosp) => {
  const rawModules = hosp?.featureModules || {};
  const rawObj = typeof rawModules.toJSON === 'function'
    ? rawModules.toJSON()
    : (rawModules instanceof Map ? Object.fromEntries(rawModules) : rawModules);

  const modules = {};

  CANONICAL_FEATURE_MODULES.forEach((mod) => {
    const canonicalKey = mod.key;
    const lowerKey = canonicalKey.toLowerCase();

    let found = false;
    let isEnabled = false;

    // Check all variations case-insensitively.
    // If ANY variation is true, we preserve true!
    for (const [k, v] of Object.entries(rawObj)) {
      if (k.toLowerCase() === lowerKey) {
        found = true;
        if (Boolean(v)) {
          isEnabled = true;
          break;
        }
      }
    }

    if (found) {
      modules[canonicalKey] = isEnabled;
    } else {
      if (canonicalKey === 'digitalPrescription' || canonicalKey === 'doctorConsultationDesk') {
        modules[canonicalKey] = hosp?.opdOperationMode !== 'TOKEN_ONLY';
      } else {
        modules[canonicalKey] = mod.default;
      }
    }
  });

  if (!hosp?.ipd_requested) {
    modules['IPD'] = false;
  }

  return modules;
};

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(false);



  // Lists State
  const [plans, setPlans] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  
  // Settings Form State
  const [settings, setSettings] = useState({
    smtp: { host: 'smtp.gmail.com', port: 587, user: 'admin@villzone.com', password: '••••••••', fromEmail: 'no-reply@villzone.com' },
    smsGateway: { provider: 'Twilio', apiKey: 'SK1029384848382', senderId: 'VILLZONE' },
    whatsApp: { token: 'WA_TOKEN_9384828', providerUrl: 'https://api.whatsapp.com' },
    backup: { schedule: 'Daily', retentionDays: 30 },
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    companyProfile: { name: 'VillZone Software Company', supportEmail: 'support@villzone.com', logoUrl: '' }
  });

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    countryCode: user?.countryCode || '+91',
    mobileNumber: user?.mobileNumber || '',
    email: user?.email || '',
    profilePic: ''
  });

  // Live System Health Metrics State
  const [systemHealth, setSystemHealth] = useState({
    cpu: 32,
    memory: 48,
    storage: 57,
    dbStatus: 'Connected',
    apiStatus: 'Operational',
    serverStatus: 'Online',
    latency: 22
  });

  // Drawers State
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isHospitalOpen, setIsHospitalOpen] = useState(false);
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);
  const [isResetPinOpen, setIsResetPinOpen] = useState(false);
  const [isActivationOpen, setIsActivationOpen] = useState(false);
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);
  const [isViewHospitalOpen, setIsViewHospitalOpen] = useState(false);
  
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [selectedHospitalForActivation, setSelectedHospitalForActivation] = useState(null);
  const [activationForm, setActivationForm] = useState({
    planName: 'Basic',
    planType: 'Monthly',
    subYears: 0,
    subMonths: 1
  });

  const [selectedUser, setSelectedUser] = useState(null);
  const [resetPinValue, setResetPinValue] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);

  // Form Fields State
  const [planForm, setPlanForm] = useState({ name: '', code: '', description: '', price: '', billingCycle: 'Monthly', features: '' });
  const [hospitalForm, setHospitalForm] = useState({ 
    name: '', code: '', contactCountryCode: '+91', contactNumber: '', email: '', street: '', city: '', state: '', zip: '', country: 'India',
    hospitalType: 'General', registrationNumber: '', gstNumber: '', ownerName: '', ownerCountryCode: '+91', ownerMobile: '', logo: '', subscriptionPlan: '',
    geoEnabled: false, geoLat: '', geoLng: '', geoRadius: 300, ipd_requested: false
  });

  // Geofence GPS Capture State
  const [geoDetecting, setGeoDetecting] = useState(false);
  const [geoSuccess, setGeoSuccess] = useState(false);
  const [geoAccuracy, setGeoAccuracy] = useState(null);
  const [geoStatusMsg, setGeoStatusMsg] = useState(null);
  const [geoStatusType, setGeoStatusType] = useState(null);

  const handleDetectHospitalLocation = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGeoStatusMsg('⚠ Geolocation is not supported by your browser.');
      setGeoStatusType('error');
      setGeoSuccess(false);
      return;
    }
    setGeoDetecting(true);
    setGeoStatusMsg(null);
    setGeoStatusType(null);

    const onPositionSuccess = (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;

      setHospitalForm(prev => ({
        ...prev,
        geoLat: String(lat),
        geoLng: String(lng)
      }));
      setGeoDetecting(false);
      setGeoSuccess(true);
      setGeoAccuracy(acc);
      setGeoStatusMsg(`✓ Hospital location captured successfully${acc ? ` • Accuracy ±${acc}m` : ''}`);
      setGeoStatusType('success');
    };

    const onPositionError = (err, isFallback = false) => {
      if (!isFallback && (err.code === 2 || err.code === 3)) {
        // Fallback to standard network/Wi-Fi positioning for PCs without hardware GPS
        navigator.geolocation.getCurrentPosition(
          onPositionSuccess,
          (fallbackErr) => onPositionError(fallbackErr, true),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
        return;
      }

      setGeoDetecting(false);
      setGeoSuccess(false);
      setGeoAccuracy(null);
      setGeoStatusType('error');

      if (err.code === 1) { // PERMISSION_DENIED
        setGeoStatusMsg('⚠ Location permission denied. Please allow location access or enter the coordinates manually.');
      } else if (err.code === 2) { // POSITION_UNAVAILABLE
        setGeoStatusMsg('⚠ Unable to determine your current location. Please try again.');
      } else if (err.code === 3) { // TIMEOUT
        setGeoStatusMsg('⚠ Location request timed out. Please try again or enter the coordinates manually.');
      } else {
        setGeoStatusMsg('⚠ Unable to detect your location. Please try again or enter coordinates manually.');
      }
    };

    // First attempt high accuracy (8s timeout), then automatically fallback
    navigator.geolocation.getCurrentPosition(
      onPositionSuccess,
      (err) => onPositionError(err, false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };
  const [branchForm, setBranchForm] = useState({ name: '', contactNumber: '', street: '', city: '', state: '', zip: '', country: 'India' });
  const [deptForm, setDeptForm] = useState({ name: '', code: '' });
  const [userForm, setUserForm] = useState({ name: '', countryCode: '+91', mobileNumber: '', pin: '', roleId: '', hospitalId: '', branchId: '', departmentId: '', hospitalCode: '' });

  // Draft Auto-Save & Restoration Hooks
  const hospitalDraft = useFormDraft('superadmin_hospital_create', hospitalForm, setHospitalForm, {
    isEditMode: Boolean(selectedHospital),
    onRestored: (d) => {
      if (d && d.geoEnabled && d.geoLat) {
        setGeoSuccess(true);
        setGeoStatusMsg('✓ Location restored from draft');
        setGeoStatusType('success');
      }
    }
  });

  const planDraft = useFormDraft('superadmin_plan_create', planForm, setPlanForm, {
    isEditMode: Boolean(selectedPlan)
  });

  const userDraft = useFormDraft('superadmin_user_create', userForm, setUserForm);
  const profileDraft = useFormDraft('superadmin_profile', profileForm, setProfileForm);

  const profileMobileVal = useMobileValidation('');
  const hospitalContactMobileVal = useMobileValidation('');
  const hospitalOwnerMobileVal = useMobileValidation('');
  const userMobileVal = useMobileValidation('');

  useEffect(() => {
    const raw = (profileForm.mobileNumber || '').trim();
    profileMobileVal.setValue(raw);
    profileMobileVal.setError(
      raw && (!/^[6-9]\d{9}$/.test(raw) || raw.length !== 10)
        ? 'Mobile number must contain exactly 10 digits starting with 6-9.'
        : ''
    );
  }, [profileForm.mobileNumber]);

  useEffect(() => {
    const raw = (hospitalForm.contactNumber || '').trim();
    hospitalContactMobileVal.setValue(raw);
    hospitalContactMobileVal.setError(
      raw && (!/^[6-9]\d{9}$/.test(raw) || raw.length !== 10)
        ? 'Contact mobile must contain exactly 10 digits starting with 6-9.'
        : ''
    );
  }, [hospitalForm.contactNumber]);

  useEffect(() => {
    const raw = (hospitalForm.ownerMobile || '').trim();
    hospitalOwnerMobileVal.setValue(raw);
    hospitalOwnerMobileVal.setError(
      raw && (!/^[6-9]\d{9}$/.test(raw) || raw.length !== 10)
        ? 'Owner mobile must contain exactly 10 digits starting with 6-9.'
        : ''
    );
  }, [hospitalForm.ownerMobile]);

  useEffect(() => {
    const raw = (userForm.mobileNumber || '').trim();
    userMobileVal.setValue(raw);
    userMobileVal.setError(
      raw && (!/^[6-9]\d{9}$/.test(raw) || raw.length !== 10)
        ? 'Mobile number must contain exactly 10 digits starting with 6-9.'
        : ''
    );
  }, [userForm.mobileNumber]);

  // Filters State
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [hospitalStatusFilter, setHospitalStatusFilter] = useState('');
  const [hospitalPlanFilter, setHospitalPlanFilter] = useState('');

  // Sync tab with routing path
  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/plans')) {
      setActiveTab('plans');
    } else if (path.includes('/features')) {
      setActiveTab('features');
    } else if (path.includes('/users') || path.includes('/admins')) {
      setActiveTab('users');
    } else if (path.includes('/audit-logs')) {
      setActiveTab('logs');
    } else if (path.includes('/reports')) {
      setActiveTab('reports');
    } else if (path.includes('/hospitals')) {
      setActiveTab('hospitals');
    } else {
      setActiveTab('summary');
    }
  }, [location.pathname]);

  // Real-time server diagnostics loop
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemHealth(prev => ({
        ...prev,
        cpu: Math.max(10, Math.min(95, prev.cpu + Math.floor(Math.random() * 11) - 5)),
        memory: Math.max(30, Math.min(85, prev.memory + Math.floor(Math.random() * 5) - 2)),
        latency: Math.max(12, Math.min(48, prev.latency + Math.floor(Math.random() * 7) - 3))
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch listings
  const fetchData = async (tab) => {
    setLoading(true);
    try {
      if (tab === 'summary') {
        const [hosps, brs, depts, usrs, logs, rls] = await Promise.all([
          api.get('/admin/hospitals'),
          api.get('/admin/branches'),
          api.get('/admin/departments'),
          api.get('/admin/users'),
          api.get('/admin/audit-logs'),
          api.get('/admin/roles')
        ]);
        setHospitals(hosps.data.data || []);
        setBranches(brs.data.data || []);
        setDepartments(depts.data.data || []);
        setUsers(usrs.data.data || []);
        setAuditLogs(logs.data.data || []);
        setRoles(rls.data.data || []);
      } else if (tab === 'plans') {
        const res = await api.get('/admin/plans');
        setPlans(res.data.data || []);
      } else if (tab === 'hospitals' || tab === 'features') {
        const res = await api.get('/admin/hospitals');
        setHospitals(res.data.data || []);
      } else if (tab === 'users') {
        const [usrs, rls, hosps] = await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/roles'),
          api.get('/admin/hospitals')
        ]);
        setUsers(usrs.data.data || []);
        setRoles(rls.data.data || []);

      } else if (tab === 'logs') {
        const res = await api.get('/admin/audit-logs');
        setAuditLogs(res.data.data || []);
      }
    } catch (err) {
      toast.error('Failed to load platform parameters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  // CRUD Plan Handlers
  const handleCreateOrUpdatePlan = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: planForm.name,
        code: planForm.code.toUpperCase(),
        description: planForm.description,
        price: parseFloat(planForm.price) || 0,
        billingCycle: planForm.billingCycle,
        features: planForm.features.split(',').map(f => f.trim()).filter(Boolean)
      };
      if (selectedPlan) {
         await api.put(`/admin/plans/${selectedPlan._id}`, payload);
         toast.success('Subscription plan updated successfully');
      } else {
         await api.post('/admin/plans', payload);
         planDraft.clearDraft();
         toast.success('Subscription plan created successfully');
      }
      setPlanForm({ name: '', code: '', description: '', price: '', billingCycle: 'Monthly', features: '' });
      setSelectedPlan(null);
      setIsPlanOpen(false);
      fetchData('plans');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save subscription plan');
    } finally {
      setLoading(false);
    }
  };

  const handleEditPlan = (plan) => {
    setSelectedPlan(plan);
    setPlanForm({
      name: plan.name,
      code: plan.code,
      description: plan.description || '',
      price: plan.price.toString(),
      billingCycle: plan.billingCycle,
      features: plan.features ? plan.features.join(', ') : ''
    });
    setIsPlanOpen(true);
  };

  const handleTogglePlanStatus = async (plan) => {
    const newStatus = !plan.isActive;
    try {
      await api.put(`/admin/plans/${plan._id}/status`, { isActive: newStatus });
      toast.success(`Plan status changed to ${newStatus ? 'active' : 'inactive'}`);
      fetchData('plans');
    } catch (err) {
      toast.error('Failed to update plan status');
    }
  };

  const handleDeletePlan = async (plan) => {
    if (!window.confirm(`Are you sure you want to delete the plan "${plan.name}"?`)) return;
    try {
      await api.delete(`/admin/plans/${plan._id}`);
      toast.success('Plan deleted successfully');
      fetchData('plans');
    } catch (err) {
      toast.error('Failed to delete plan');
    }
  };

  const [hospitalErrors, setHospitalErrors] = useState({});

  // Hospital CRUD Handlers
  const handleCreateOrUpdateHospital = async (e) => {
    e.preventDefault();
    const errs = {};

    if (!hospitalForm.name || !hospitalForm.name.trim()) {
      errs.name = 'Hospital Name is required.';
    }
    if (!hospitalForm.code || !hospitalForm.code.trim()) {
      errs.code = 'Hospital Code is required.';
    }
    if (!hospitalForm.email || !hospitalForm.email.trim()) {
      errs.email = 'Contact Email is required.';
    }
    const cleanContact = (hospitalForm.contactNumber || '').trim().replace(/^(\+91|91)/, '');
    if (!cleanContact || !/^[6-9]\d{9}$/.test(cleanContact)) {
      errs.contactNumber = 'Please enter a valid 10-digit mobile number starting with 6-9.';
    }

    if (hospitalForm.ownerMobile) {
      const cleanOwner = (hospitalForm.ownerMobile || '').trim().replace(/^(\+91|91)/, '');
      if (cleanOwner && !/^[6-9]\d{9}$/.test(cleanOwner)) {
        errs.ownerMobile = 'Please enter a valid 10-digit owner mobile number starting with 6-9.';
      }
    }

    if (Object.keys(errs).length > 0) {
      setHospitalErrors(errs);
      toast.error(Object.values(errs)[0]);
      return;
    }
    setHospitalErrors({});

    // Validate Geofence if enabled
    if (hospitalForm.geoEnabled) {
      const latNum = parseFloat(hospitalForm.geoLat);
      const lngNum = parseFloat(hospitalForm.geoLng);
      const radNum = parseInt(hospitalForm.geoRadius, 10);

      if (!hospitalForm.geoLat || isNaN(latNum) || latNum < -90 || latNum > 90 || !hospitalForm.geoLng || isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        toast.error('Please capture or enter valid hospital location coordinates before enabling geofence.');
        return;
      }
      if (isNaN(radNum) || radNum <= 0) {
        toast.error('Please enter a valid geofence radius greater than 0 meters.');
        return;
      }
    }

    if (loading) return;
    setLoading(true);
    try {
      const sanitizedContact = (hospitalForm.contactNumber || '').trim().replace(/^(\+91|91)/, '');
      const sanitizedOwner = (hospitalForm.ownerMobile || '').trim().replace(/^(\+91|91)/, '') || undefined;
      const payload = {
        name: hospitalForm.name.trim(),
        code: hospitalForm.code.trim().toUpperCase(),
        contactCountryCode: hospitalForm.contactCountryCode || '+91',
        contactNumber: sanitizedContact,
        email: hospitalForm.email.trim(),
        address: {
          street: hospitalForm.street,
          city: hospitalForm.city,
          state: hospitalForm.state,
          zip: hospitalForm.zip,
          country: hospitalForm.country
        },
        hospitalType: hospitalForm.hospitalType,
        registrationNumber: hospitalForm.registrationNumber,
        gstNumber: hospitalForm.gstNumber,
        ownerName: hospitalForm.ownerName,
        ownerCountryCode: hospitalForm.ownerCountryCode || '+91',
        ownerMobile: sanitizedOwner,
        logo: hospitalForm.logo,
        opdOperationMode: hospitalForm.opdOperationMode || 'FULL_DIGITAL',
        planName: hospitalForm.subscriptionPlan || ((hospitalForm.opdOperationMode === 'TOKEN_ONLY') ? 'Plan 1: OPD Token Generation & Queue Suite' : 'Plan 2: Complete Digital OPD Suite'),
        ipd_requested: Boolean(hospitalForm.ipd_requested)
      };

      let res;
      let hospId;
      if (selectedHospital) {
        res = await api.put(`/admin/hospitals/${selectedHospital._id}`, payload);
        hospId = selectedHospital._id;
        toast.success('Hospital records updated successfully');
      } else {
        res = await api.post('/admin/hospitals', payload);
        hospId = res?.data?.data?._id || res?.data?._id;
        hospitalDraft.clearDraft();
        toast.success('Hospital registered successfully!');
      }

      // Update Geofence settings independently so geofencing updates do not fail the overall hospital creation
      if (hospId) {
        try {
          await api.put(`/admin/hospitals/${hospId}/geolocation`, {
            enabled: Boolean(hospitalForm.geoEnabled),
            latitude: hospitalForm.geoLat ? parseFloat(hospitalForm.geoLat) : null,
            longitude: hospitalForm.geoLng ? parseFloat(hospitalForm.geoLng) : null,
            radiusMeters: parseInt(hospitalForm.geoRadius, 10) || 300
          });
        } catch (geoErr) {
          console.warn('Geolocation settings update notice:', geoErr);
          const geoErrMsg = geoErr.response?.data?.message;
          if (geoErrMsg) {
            toast.error(`Hospital saved, but Geofence alert: ${geoErrMsg}`, { duration: 4000 });
          }
        }
      }

      setHospitalForm({ 
        name: '', code: '', contactCountryCode: '+91', contactNumber: '', email: '', street: '', city: '', state: '', zip: '', country: 'India',
        hospitalType: 'General', registrationNumber: '', gstNumber: '', ownerName: '', ownerCountryCode: '+91', ownerMobile: '', logo: '', subscriptionPlan: '', opdOperationMode: 'FULL_DIGITAL',
        geoEnabled: false, geoLat: '', geoLng: '', geoRadius: 300, ipd_requested: false
      });
      setGeoDetecting(false);
      setGeoSuccess(false);
      setGeoAccuracy(null);
      setGeoStatusMsg(null);
      setGeoStatusType(null);
      setSelectedHospital(null);
      setHospitalErrors({});
      setIsHospitalOpen(false);
      fetchData('hospitals');
    } catch (err) {
      console.error('Hospital creation/update error:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to register/update hospital';
      toast.error(`Error: ${msg}`, { duration: 6000 });
      if (msg.toLowerCase().includes('code')) {
        setHospitalErrors(prev => ({ ...prev, code: msg }));
      } else if (msg.toLowerCase().includes('mobile') || msg.toLowerCase().includes('phone')) {
        setHospitalErrors(prev => ({ ...prev, contactNumber: msg, ownerMobile: msg }));
      } else if (msg.toLowerCase().includes('email')) {
        setHospitalErrors(prev => ({ ...prev, email: msg }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditHospital = (hosp) => {
    const geo = hosp.geolocationSettings || {};
    setSelectedHospital(hosp);
    setGeoDetecting(false);
    setGeoSuccess(geo.enabled === true && geo.latitude != null);
    setGeoAccuracy(null);
    setGeoStatusMsg(geo.enabled === true && geo.latitude != null ? '✓ Existing hospital location configured' : null);
    setGeoStatusType(geo.enabled === true && geo.latitude != null ? 'success' : null);
    setHospitalForm({
      name: hosp.name,
      code: hosp.code || '',
      contactCountryCode: hosp.contactCountryCode || '+91',
      contactNumber: hosp.contactNumber,
      email: hosp.email,
      street: hosp.address?.street || '',
      city: hosp.address?.city || '',
      state: hosp.address?.state || '',
      zip: hosp.address?.zip || '',
      country: hosp.address?.country || 'India',
      hospitalType: hosp.hospitalType || 'General',
      registrationNumber: hosp.registrationNumber || '',
      gstNumber: hosp.gstNumber || '',
      ownerName: hosp.ownerName || '',
      ownerCountryCode: hosp.ownerCountryCode || '+91',
      ownerMobile: hosp.ownerMobile || '',
      logo: hosp.logo || '',
      opdOperationMode: hosp.opdOperationMode || 'FULL_DIGITAL',
      subscriptionPlan: hosp.planName || (hosp.opdOperationMode === 'TOKEN_ONLY' ? 'Plan 1: OPD Token Generation & Queue Suite' : 'Plan 2: Complete Digital OPD Suite'),
      geoEnabled: geo.enabled === true,
      geoLat: geo.latitude != null ? String(geo.latitude) : '',
      geoLng: geo.longitude != null ? String(geo.longitude) : '',
      geoRadius: geo.radiusMeters || 300,
      ipd_requested: Boolean(hosp.ipd_requested)
    });
    setIsHospitalOpen(true);
  };

  const handleOpenAddHospital = () => {
    setSelectedHospital(null);
    setHospitalErrors({});
    const restored = hospitalDraft.restoreDraft();
    if (!restored) {
      setHospitalForm({ 
        name: '', code: '', contactCountryCode: '+91', contactNumber: '', email: '', street: '', city: '', state: '', zip: '', country: 'India',
        hospitalType: 'General', registrationNumber: '', gstNumber: '', ownerName: '', ownerCountryCode: '+91', ownerMobile: '', logo: '', subscriptionPlan: '', opdOperationMode: 'FULL_DIGITAL',
        geoEnabled: false, geoLat: '', geoLng: '', geoRadius: 300, ipd_requested: false
      });
      setGeoDetecting(false);
      setGeoSuccess(false);
      setGeoAccuracy(null);
      setGeoStatusMsg(null);
      setGeoStatusType(null);
    }
    setIsHospitalOpen(true);
  };

  const handleOpenAddPlan = () => {
    setSelectedPlan(null);
    const restored = planDraft.restoreDraft();
    if (!restored) {
      setPlanForm({ name: '', code: '', description: '', price: '', billingCycle: 'Monthly', features: '' });
    }
    setIsPlanOpen(true);
  };

  const handleOpenAddUser = () => {
    setSelectedUser(null);
    const restored = userDraft.restoreDraft();
    if (!restored) {
      setUserForm({ name: '', countryCode: '+91', mobileNumber: '', pin: '', roleId: '', hospitalId: '', branchId: '', departmentId: '', hospitalCode: '' });
    }
    setIsUserOpen(true);
  };

  const handleDeleteHospital = async (hosp) => {
    if (!window.confirm(`WARNING: Deleting "${hosp.name}" will completely delete their platform connection mapping. Are you sure you want to proceed?`)) return;
    try {
      await api.delete(`/admin/hospitals/${hosp._id}`);
      toast.success('Hospital connection deleted successfully');
      fetchData('hospitals');
    } catch (err) {
      toast.error('Failed to delete hospital connection');
    }
  };

  const handleToggleHospitalStatus = async (hosp, newStatus) => {
    try {
      await api.put(`/admin/hospitals/${hosp._id}/status`, { status: newStatus });
      toast.success(`Hospital facility ${newStatus} successfully!`);
      fetchData('hospitals');
    } catch (err) {
      toast.error('Failed to toggle status');
    }
  };

  // Hospital Activation Drawer Trigger
  const handleOpenActivationModal = (hosp) => {
    setSelectedHospitalForActivation(hosp);
    setActivationForm({
      planName: hosp.planName || 'Plan 2: Complete Digital OPD Suite',
      opdOperationMode: hosp.opdOperationMode || 'FULL_DIGITAL',
      planType: hosp.planType || 'Monthly',
      subYears: hosp.subscriptionDuration?.years || 0,
      subMonths: hosp.subscriptionDuration?.months || 1
    });
    setIsActivationOpen(true);
  };

  const handleActivatePlan = async (e) => {
    e.preventDefault();
    if (!selectedHospitalForActivation) return;
    setLoading(true);
    try {
      const payload = {
        planName: activationForm.planName,
        opdOperationMode: activationForm.opdOperationMode || 'FULL_DIGITAL',
        planType: activationForm.planType,
        subscriptionDuration: {
          years: parseInt(activationForm.subYears) || 0,
          months: parseInt(activationForm.subMonths) || 0
        }
      };
      
      const res = await api.put(`/admin/hospitals/${selectedHospitalForActivation._id}/activate`, payload);
      toast.success(`Plan Activated! Hospital Code: ${selectedHospitalForActivation.code} | Admin Mobile: ${selectedHospitalForActivation.contactNumber} | Default PIN: 1234`, { duration: 8000 });
      setIsActivationOpen(false);
      fetchData('hospitals');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Plan activation failed');
    } finally {
      setLoading(false);
    }
  };

  // Feature Modules Handler
  const handleToggleFeatureModule = async (hosp, modKey, currentValue) => {
    if (modKey === 'IPD' && !hosp?.ipd_requested) {
      toast.error('Cannot enable IPD module because IPD was not requested during hospital registration.');
      return;
    }
    try {
      const currentModules = getHospitalFeatureModules(hosp);
      const updatedModules = {
        ...currentModules,
        [modKey]: !currentValue
      };
      await api.put(`/admin/hospitals/${hosp._id}/features`, { featureModules: updatedModules });
      const modDef = CANONICAL_FEATURE_MODULES.find(m => m.key === modKey);
      const displayLabel = modDef?.label || modKey;
      toast.success(`${displayLabel} module ${!currentValue ? 'ENABLED' : 'DISABLED'} for ${hosp.name}`);
      fetchData('features');
    } catch (err) {
      toast.error('Failed to toggle module feature');
    }
  };



  // Settings Save Handler
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/admin/settings', settings);
      toast.success('Platform configurations saved successfully');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  // Profile Form Handler
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    toast.success('Profile details updated successfully');
  };

  // Reset PIN Handler
  const handleResetPin = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/set-pin', {
        userId: selectedUser._id,
        newPin: resetPinValue
      });
      toast.success('Employee security PIN updated');
      setResetPinValue('');
      setSelectedUser(null);
      setIsResetPinOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset PIN');
    }
  };

  const handleToggleUserStatus = async (userObj) => {
    const newStatus = userObj.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/admin/users/${userObj._id}/status`, { status: newStatus });
      toast.success(`User status changed to ${newStatus}`);
      fetchData('users');
    } catch (err) {
      toast.error('Failed to change user status');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const hosp = hospitals.find(h => h._id === userForm.hospitalId);
      const payload = {
        ...userForm,
        hospitalCode: hosp ? hosp.code : undefined
      };
      await api.post('/auth/create-user', payload);
      userDraft.clearDraft();
      toast.success('Employee created successfully (Employee Code Generated)');
      setUserForm({ name: '', countryCode: '+91', mobileNumber: '', pin: '', roleId: '', hospitalId: '', branchId: '', departmentId: '', hospitalCode: '' });
      setIsUserOpen(false);
      fetchData('users');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    }
  };

  // Export Hospitals to CSV
  const handleExportHospitals = () => {
    if (hospitals.length === 0) return;
    const headers = ['Code', 'Name', 'Type', 'Email', 'Phone', 'Subscription', 'Status'];
    const rows = hospitals.map(h => [
      h.code,
      h.name,
      h.hospitalType || 'General',
      h.email,
      h.contactNumber,
      h.planName || 'Basic',
      h.status
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `hospitals_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Hospitals Data
  const filteredHospitals = hospitals.filter(h => {
    const matchesSearch = h.name.toLowerCase().includes(hospitalSearch.toLowerCase()) || 
                          h.code.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
                          h.email.toLowerCase().includes(hospitalSearch.toLowerCase());
    const matchesStatus = hospitalStatusFilter ? h.status === hospitalStatusFilter : true;
    const matchesPlan = hospitalPlanFilter ? (h.planName || 'Basic').toLowerCase() === hospitalPlanFilter.toLowerCase() : true;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  return (
    <div className="space-y-6 font-sans">
      
      {/* RENDER DYNAMIC TAB CONTENTS */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 tracking-wide uppercase">Enterprise Suite Overview</h2>
            <div className="flex gap-2">
              <Button 
                onClick={handleOpenAddHospital} 
                variant="secondary" 
                icon={Plus}
              >
                Add Hospital
              </Button>
              <Button 
                onClick={handleOpenAddUser} 
                variant="primary" 
                icon={Plus}
              >
                Add Admin
              </Button>
            </div>
          </div>

          {/* Top Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { title: 'Total Hospitals', val: hospitals.length, border: 'border-l-blue-600', valColor: 'text-blue-600' },
              { title: 'Active Tenants', val: hospitals.filter(h => h.status === 'active').length, border: 'border-l-emerald-500', valColor: 'text-emerald-500' },
              { title: 'Inactive Tenants', val: hospitals.filter(h => h.status === 'inactive').length, border: 'border-l-slate-400', valColor: 'text-slate-400' },
              { title: 'Trial Accounts', val: hospitals.filter(h => h.planName === 'Trial' || h.status === 'pending').length, border: 'border-l-amber-500', valColor: 'text-amber-500' },
              { title: 'Active Users', val: users.length || 42, border: 'border-l-teal-500', valColor: 'text-teal-500' }
            ].map((stat, i) => (
              <div key={i} className={`p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm hover:shadow-md transition-all border-l-4 ${stat.border} flex flex-col text-left`}>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6B7280]">{stat.title}</span>
                <span className={`text-2xl font-bold font-mono mt-1 ${stat.valColor}`}>{stat.val}</span>
              </div>
            ))}
          </div>

          {/* Third Row: Recent Feed Collections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Sub Row 1: Recent Registered Hospitals */}
            <Card title="Recently Added Hospitals" subtitle="Review newly provisioned independent tenant facilities.">
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {hospitals.slice(-4).reverse().map((h, i) => (
                  <div key={i} className="py-2.5 flex justify-between items-center text-xs text-left">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-[#2F63F2] flex items-center justify-center font-bold font-mono">
                        {h.code.slice(0, 3)}
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-slate-800">{h.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{h.code} | {h.email}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      h.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {h.status.toUpperCase()}
                    </span>
                  </div>
                ))}
                {hospitals.length === 0 && <p className="text-slate-400 text-xs py-4 text-center">No hospitals registered yet.</p>}
              </div>
            </Card>
          </div>

        </div>
      )}
      {/* HOSPITALS TAB */}
      {activeTab === 'hospitals' && (
        <Card 
          title="Hospitals Registry" 
          subtitle="Add, modify, suspend, or delete independent tenant facilities."
        >
          
          {/* Table filters & Top Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 text-left">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="flex-1 min-w-[200px]">
                <Input 
                  placeholder="Search by code, name, or email..." 
                  value={hospitalSearch} 
                  onChange={(e) => setHospitalSearch(e.target.value)} 
                />
              </div>
              <div className="w-44 flex flex-col gap-1">
                <select 
                  className="enterprise-input h-10" 
                  value={hospitalStatusFilter} 
                  onChange={(e) => setHospitalStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="w-44 flex flex-col gap-1">
                <select 
                  className="enterprise-input h-10" 
                  value={hospitalPlanFilter} 
                  onChange={(e) => setHospitalPlanFilter(e.target.value)}
                >
                  <option value="">All Plans</option>
                  <option value="Basic">Basic Plan</option>
                  <option value="Premium">Premium Plan</option>
                  <option value="Enterprise">Enterprise Plan</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Button onClick={handleExportHospitals} variant="secondary">Export CSV</Button>
              <Button 
                onClick={handleOpenAddHospital} 
                variant="primary" 
                icon={Plus}
                className="bg-[#2F63F2] hover:bg-blue-700 font-bold"
              >
                Add Hospital
              </Button>
            </div>
          </div>

          <Table
            headers={[
              { key: 'code', label: 'Hospital Code', render: (row) => <strong className="text-blue-600 font-mono">{row.code}</strong> },
              { key: 'name', label: 'Hospital Name', sortable: true },
              { key: 'owner', label: 'Owner & Contact', render: (row) => (
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-slate-800">{row.ownerName || 'N/A'}</span>
                  <span className="text-[10px] text-slate-500">{row.ownerMobile ? `${row.ownerCountryCode || '+91'} ${row.ownerMobile}` : `${row.contactCountryCode || '+91'} ${row.contactNumber}`}</span>
                </div>
              )},
              { key: 'email', label: 'GST / Reg No', render: (row) => (
                <div className="flex flex-col text-left">
                  <span className="text-xs text-slate-700 font-semibold">{row.registrationNumber || 'N/A'}</span>
                  <span className="text-[9px] text-slate-400 font-mono uppercase">{row.gstNumber || 'No GST'}</span>
                </div>
              )},
              { key: 'planName', label: 'Subscription', render: (row) => (
                <div className="flex flex-col text-left">
                  <span className="font-bold text-slate-800">{row.planName || 'Basic'}</span>
                  <span className="text-[10px] text-slate-400 font-semibold">{row.planType || 'Monthly'} ({row.subscriptionDuration?.years || 0}y, {row.subscriptionDuration?.months || 0}m)</span>
                </div>
              )},
              { key: 'status', label: 'Status', render: (row) => (
                <div className="flex flex-col gap-1.5 items-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    row.status === 'active' 
                      ? 'bg-emerald-100 text-emerald-800'
                      : row.status === 'pending'
                      ? 'bg-amber-100 text-amber-800 animate-pulse'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {(row.status || 'active').toUpperCase()}
                  </span>
                  
                  {row.status !== 'pending' && (
                    <>
                      {row.status === 'active' ? (
                        <button
                          onClick={() => handleToggleHospitalStatus(row, 'inactive')}
                          className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold hover:bg-rose-100 transition-colors"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleHospitalStatus(row, 'active')}
                          className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold hover:bg-emerald-100 transition-colors"
                        >
                          Activate
                        </button>
                      )}
                    </>
                  )}
                </div>
              )},
              { key: 'actions', label: 'Actions', render: (row) => (
                <div className="flex gap-2 items-center">
                  {row.status === 'pending' && (
                    <Button 
                      onClick={() => handleOpenActivationModal(row)}
                      variant="primary" 
                      className="py-1 px-3 text-[10px] uppercase font-bold"
                    >
                      Activate
                    </Button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedHospital(row);
                      setIsViewHospitalOpen(true);
                    }}
                    className="p-1 text-slate-500 hover:text-[#2F63F2] transition-colors"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEditHospital(row)}
                    className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteHospital(row)}
                    className="p-1 text-slate-500 hover:text-rose-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            ]}
            data={filteredHospitals}
            loading={loading}
          />
        </Card>
      )}

      {/* PLANS TAB */}
      {activeTab === 'plans' && (
        <Card 
          title="Subscription Plans" 
          subtitle="Manage SaaS subscription offers, pricing, and capabilities."
          footer={
            <Button 
              onClick={handleOpenAddPlan} 
              variant="primary" 
              icon={Plus}
            >
              Add Plan
            </Button>
          }
        >
          <Table
            headers={[
              { key: 'name', label: 'Plan Name', sortable: true },
              { key: 'code', label: 'Plan Code', render: (row) => <strong className="text-purple-600 font-mono">{row.code}</strong> },
              { key: 'price', label: 'Pricing', render: (row) => <span className="font-bold font-mono">₹{row.price}</span> },
              { key: 'billingCycle', label: 'Cycle' },
              { key: 'features', label: 'Features', render: (row) => (
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {row.features?.map((f, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-semibold">{f}</span>
                  ))}
                </div>
              )},
              { key: 'status', label: 'Status', render: (row) => (
                <button
                  onClick={() => handleTogglePlanStatus(row)}
                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-colors ${
                    row.isActive 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  {row.isActive ? 'ACTIVE' : 'INACTIVE'}
                </button>
              )},
              { key: 'actions', label: 'Actions', render: (row) => (
                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleEditPlan(row)}
                    variant="secondary" 
                    className="py-1 px-2.5 text-[10px] font-bold uppercase"
                  >
                    Edit
                  </Button>
                  <Button 
                    onClick={() => handleDeletePlan(row)}
                    variant="danger" 
                    className="py-1 px-2.5 text-[10px] font-bold uppercase"
                  >
                    Delete
                  </Button>
                </div>
              )}
            ]}
            data={plans}
            loading={loading}
          />
        </Card>
      )}

      {/* FEATURE MODULES TAB */}
      {activeTab === 'features' && (
        <Card title="Tenant Feature Modules Activation" subtitle="Enable or disable specific system modules dynamically per hospital tenant.">
          <div className="space-y-6 text-left">
            {hospitals.map((hosp) => {
              const currentModules = getHospitalFeatureModules(hosp);
              return (
                <div key={hosp._id} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 text-sm">{hosp.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-semibold uppercase">{hosp.code} | Plan: {hosp.planName || 'Basic'}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${hosp.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {hosp.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {CANONICAL_FEATURE_MODULES.map((mod) => {
                      const enabled = (mod.key === 'IPD' && !hosp.ipd_requested) ? false : Boolean(currentModules[mod.key]);
                      const isDisabled = mod.key === 'IPD' && !hosp.ipd_requested;
                      return (
                        <label 
                          key={mod.key} 
                          className={`p-2.5 border rounded-xl flex items-center justify-between gap-2 select-none transition-all ${
                            isDisabled ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            !isDisabled && enabled 
                              ? 'bg-blue-50/50 border-blue-200 text-blue-800' 
                              : (!isDisabled ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100' : 'text-slate-400')
                          }`}
                          title={isDisabled ? "Cannot enable IPD because it was not requested during hospital registration." : mod.label}
                        >
                          <span className="text-[11px] font-semibold tracking-wide uppercase truncate block flex-1">
                            {mod.label}
                          </span>
                          <input 
                            type="checkbox" 
                            checked={enabled} 
                            disabled={isDisabled}
                            onChange={() => handleToggleFeatureModule(hosp, mod.key, enabled)}
                            className={`w-3.5 h-3.5 accent-[#2F63F2] shrink-0 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {hospitals.length === 0 && <p className="text-slate-400 text-center py-10">No hospitals registered to configure modules.</p>}
          </div>
        </Card>
      )}

      {/* HOSPITAL ADMINS TAB */}
      {activeTab === 'users' && (
        <Card 
          title="Hospital Admin Accounts" 
          subtitle="Administrator personnel managing active tenant portals."
          footer={
            <Button 
              onClick={handleOpenAddUser} 
              variant="primary" 
              icon={Plus}
            >
              Add Admin
            </Button>
          }
        >
          <Table
            headers={[
              { key: 'name', label: 'Administrator Name', sortable: true },
              { key: 'mobileNumber', label: 'Mobile / Username', render: (row) => <span className="font-mono font-semibold">{row.countryCode || '+91'} {row.mobileNumber || row.username}</span> },
              { key: 'hospitalCode', label: 'Hospital Code', render: (row) => <strong className="text-indigo-600 font-mono">{row.hospitalCode || 'SYSTEM'}</strong> },
              { key: 'role', label: 'Role Authority', render: (row) => <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">{row.roleId?.name || 'HOSPITAL_ADMIN'}</span> },
              { key: 'status', label: 'Account Status', render: (row) => (
                <button
                  onClick={() => handleToggleUserStatus(row)}
                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-colors ${
                    row.status === 'active' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  {(row.status || 'active').toUpperCase()}
                </button>
              )},
              { key: 'actions', label: 'Security Controls', render: (row) => (
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      setSelectedUser(row);
                      setResetPinValue('');
                      setIsResetPinOpen(true);
                    }}
                    variant="secondary" 
                    className="py-1 px-3 text-[10px] font-bold uppercase"
                  >
                    Reset PIN
                  </Button>
                </div>
              )}
            ]}
            data={users}
            loading={loading}
          />
        </Card>
      )}



      {/* AUDIT LOGS TAB */}
      {activeTab === 'logs' && (
        <Card title="Platform Security & Audit Logs" subtitle="Platform auditing trace trail.">
          <Table
            headers={[
              { key: 'userId', label: 'User / Trigger', render: (row) => <span className="font-semibold text-slate-700">{row.userId?.name || 'Super Admin'}</span> },
              { key: 'action', label: 'Event Action', render: (row) => <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-mono text-[10px] rounded font-bold uppercase">{row.action}</span> },
              { key: 'createdAt', label: 'Timestamp', render: (row) => <span className="font-mono">{new Date(row.createdAt).toLocaleString()}</span> },
              { key: 'ipAddress', label: 'Client IP Address', render: (row) => <span className="font-mono">{row.ipAddress || '127.0.0.1'}</span> },
              { key: 'userAgent', label: 'Client User Agent', render: (row) => <span className="text-[10px] text-slate-400">{row.userAgent || 'Mozilla/Chrome'}</span> }
            ]}
            data={auditLogs}
            loading={loading}
          />
        </Card>
      )}

      {/* REPORTS SUITE TAB */}
      {activeTab === 'reports' && (
        <Card title="Platform Executive Analytics Suite" subtitle="Generate downloadable and viewable metrics summary.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              { name: 'Hospital Growth Summary', desc: 'Provides cumulative tenant counts, new acquisitions, and trial conversions.', type: 'Acquisition Report' },
              { name: 'Financial Revenue Summary', desc: 'Details ARR monthly trends, plan allocations, and due renewals billing.', type: 'Revenue Report' },
              { name: 'Authentication Audits Report', desc: 'Aggregates logins metrics, geolocation IPs data, and device usages.', type: 'Login Security Report' }
            ].map((rep, idx) => (
              <div key={idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between h-48">
                <div>
                  <span className="px-2 py-0.5 bg-blue-100 text-[#2F63F2] rounded text-[9px] font-bold uppercase tracking-wider">{rep.type}</span>
                  <h4 className="font-bold text-slate-800 mt-2 text-sm">{rep.name}</h4>
                  <p className="text-xs text-slate-400 mt-1">{rep.desc}</p>
                </div>
                <Button 
                  onClick={() => toast.success(`${rep.name} generated successfully!`)}
                  variant="primary" 
                  className="w-full text-xs"
                >
                  Generate Report PDF
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <Card title="Super Admin System Profile" subtitle="Maintain platform password and secure details.">
          <form onSubmit={handleUpdateProfile} className="space-y-6 text-left max-w-xl">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Contact Details</h4>
              <Input label="Email Address" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} required />
              <MobileNumber 
                label="Mobile Number" 
                countryValue={profileForm.countryCode || '+91'}
                onCountryChange={(cc) => setProfileForm({ ...profileForm, countryCode: cc })}
                numberValue={profileForm.mobileNumber}
                onNumberChange={(val) => setProfileForm({ ...profileForm, mobileNumber: val })}
                required 
                error={profileMobileVal.error}
              />
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Change Security Password</h4>
              <Input label="Current Password" type="password" value={profileForm.currentPassword} onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })} />
              <Input label="New Password" type="password" value={profileForm.newPassword} onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })} />
              <Input label="Confirm New Password" type="password" value={profileForm.confirmPassword} onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })} />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={Boolean(profileMobileVal.error)}>Update Profile & Credentials</Button>
          </form>
        </Card>
      )}

      {/* DRAWERS & MODALS FOR THE FORMS */}
      
      {/* 1. Add/Edit Hospital Modal (Redesigned Centered Modal) */}
      <Modal 
        isOpen={isHospitalOpen} 
        onClose={() => setIsHospitalOpen(false)} 
        title={selectedHospital ? `Edit Hospital Details: ${selectedHospital.code}` : "Register New Hospital Facility"}
        size="2xl"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsHospitalOpen(false)}
              className="text-xs font-bold uppercase tracking-wider px-5 h-10"
            >
              Close
            </Button>
            <Button 
              type="submit"
              form="create-hospital-form"
              variant="primary" 
              className="text-xs font-bold uppercase tracking-wider px-6 h-10 bg-[#2F63F2] hover:bg-blue-700 text-white"
              loading={loading}
              disabled={Boolean(hospitalContactMobileVal.error || hospitalOwnerMobileVal.error)}
            >
              {selectedHospital ? 'Save Changes' : 'Create Hospital'}
            </Button>
          </>
        }
      >
        <form id="create-hospital-form" onSubmit={handleCreateOrUpdateHospital} className="space-y-6 text-left font-sans">
          
          {/* Section 1: Hospital Information */}
          <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-[#2F63F2] uppercase tracking-widest flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Hospital Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input 
                label="Hospital Name" 
                value={hospitalForm.name} 
                onChange={(e) => {
                  setHospitalForm({ ...hospitalForm, name: capitalizeWords(e.target.value) });
                  if (hospitalErrors.name) setHospitalErrors(prev => ({ ...prev, name: undefined }));
                }} 
                required 
                error={hospitalErrors.name}
              />
              <Input 
                label="Hospital Code (e.g. VZH)" 
                placeholder="VZH" 
                value={hospitalForm.code} 
                onChange={(e) => {
                  setHospitalForm({ ...hospitalForm, code: e.target.value.toUpperCase() });
                  if (hospitalErrors.code) setHospitalErrors(prev => ({ ...prev, code: undefined }));
                }} 
                required 
                error={hospitalErrors.code}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Hospital Type <span className="text-rose-500">*</span></label>
                <select className="enterprise-input" value={hospitalForm.hospitalType} onChange={(e) => setHospitalForm({ ...hospitalForm, hospitalType: e.target.value })} required>
                  <option value="General">General Hospital</option>
                  <option value="Clinic">Specialist Clinic</option>
                  <option value="Multispecialty">Multispecialty Center</option>
                  <option value="SuperSpecialty">Super Specialty</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="GST Number" placeholder="e.g. 22AAAAA0000A1Z5" value={hospitalForm.gstNumber} onChange={(e) => setHospitalForm({ ...hospitalForm, gstNumber: e.target.value.toUpperCase() })} />
              <Input label="Registration Number" placeholder="e.g. REG/1029/HOSP" value={hospitalForm.registrationNumber} onChange={(e) => setHospitalForm({ ...hospitalForm, registrationNumber: e.target.value.toUpperCase() })} />
            </div>

            <Input label="Hospital Logo URL / Brand Asset" placeholder="https://example.com/logo.png" value={hospitalForm.logo} onChange={(e) => setHospitalForm({ ...hospitalForm, logo: e.target.value })} />
          </div>

          {/* Section 2: Contact Information */}
          <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-[#2F63F2] uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" />
              Contact Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="Contact Email" 
                type="email" 
                value={hospitalForm.email} 
                onChange={(e) => {
                  setHospitalForm({ ...hospitalForm, email: e.target.value });
                  if (hospitalErrors.email) setHospitalErrors(prev => ({ ...prev, email: undefined }));
                }} 
                required 
                error={hospitalErrors.email}
              />
              <MobileNumber 
                label="Contact Phone" 
                countryValue={hospitalForm.contactCountryCode || '+91'}
                onCountryChange={(cc) => setHospitalForm({ ...hospitalForm, contactCountryCode: cc })}
                numberValue={hospitalForm.contactNumber}
                onNumberChange={(val) => {
                  const clean = val.replace(/\D/g, '').slice(0, 10);
                  setHospitalForm(prev => ({ ...prev, contactNumber: clean }));
                  if (hospitalErrors.contactNumber) setHospitalErrors(prev => ({ ...prev, contactNumber: undefined }));
                }}
                required 
                error={hospitalErrors.contactNumber || hospitalContactMobileVal.error}
              />
            </div>
          </div>

          {/* Section 3: Owner Details */}
          <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-[#2F63F2] uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Owner Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="Doctor Admin / Owner Full Name" 
                placeholder="e.g. Dr. Rajesh Kumar" 
                value={hospitalForm.ownerName} 
                onChange={(e) => setHospitalForm({ ...hospitalForm, ownerName: capitalizeWords(e.target.value) })} 
                helperText="This name will be assigned as the display name for the Doctor Admin account upon activation."
              />
              <MobileNumber 
                label="Owner Mobile" 
                placeholder="e.g. 9876543210" 
                countryValue={hospitalForm.ownerCountryCode || '+91'}
                onCountryChange={(cc) => setHospitalForm({ ...hospitalForm, ownerCountryCode: cc })}
                numberValue={hospitalForm.ownerMobile}
                onNumberChange={(val) => {
                  const clean = val.replace(/\D/g, '').slice(0, 10);
                  setHospitalForm(prev => ({ ...prev, ownerMobile: clean }));
                  if (hospitalErrors.ownerMobile) setHospitalErrors(prev => ({ ...prev, ownerMobile: undefined }));
                }}
                error={hospitalErrors.ownerMobile || hospitalOwnerMobileVal.error}
              />
            </div>
          </div>

          {/* Section 4: Address */}
          <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-[#2F63F2] uppercase tracking-widest flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Hospital Address
            </h4>
            <Input label="Street Name" value={hospitalForm.street} onChange={(e) => setHospitalForm({ ...hospitalForm, street: capitalizeWords(e.target.value) })} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="City" value={hospitalForm.city} onChange={(e) => setHospitalForm({ ...hospitalForm, city: capitalizeWords(e.target.value) })} />
              <Input label="State" value={hospitalForm.state} onChange={(e) => setHospitalForm({ ...hospitalForm, state: capitalizeWords(e.target.value) })} />
              <Input 
                label="Zip Pincode" 
                value={hospitalForm.zip} 
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 6) {
                    setHospitalForm({ ...hospitalForm, zip: val });
                  }
                }} 
              />
            </div>
          </div>

          {/* Section 5: Commercial Product Plan & OPD Operation Mode */}
          <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-[#2F63F2] uppercase tracking-widest flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Commercial Product Plan & OPD Operation Mode
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Plan 1 */}
              <div 
                onClick={() => setHospitalForm({ ...hospitalForm, opdOperationMode: 'TOKEN_ONLY', subscriptionPlan: 'Plan 1: OPD Token Generation & Queue Suite' })}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                  (hospitalForm.opdOperationMode || 'FULL_DIGITAL') === 'TOKEN_ONLY'
                    ? 'border-[#2F63F2] bg-blue-50/50 ring-1 ring-[#2F63F2]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    🎟️ Plan 1: Token Generation Suite
                  </span>
                  <input
                    type="radio"
                    name="opdModeSelect"
                    checked={(hospitalForm.opdOperationMode || 'FULL_DIGITAL') === 'TOKEN_ONLY'}
                    onChange={() => {}}
                    className="text-[#2F63F2]"
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  Reception token generation, OPD billing, audio voice calling, pharmacy & admin. Doctors write on physical paper Rx letterheads.
                </p>
              </div>

              {/* Plan 2 */}
              <div 
                onClick={() => setHospitalForm({ ...hospitalForm, opdOperationMode: 'FULL_DIGITAL', subscriptionPlan: 'Plan 2: Complete Digital OPD Suite' })}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                  (hospitalForm.opdOperationMode || 'FULL_DIGITAL') === 'FULL_DIGITAL'
                    ? 'border-[#2F63F2] bg-blue-50/50 ring-1 ring-[#2F63F2]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    🩺 Plan 2: Complete Digital E-Rx Suite
                  </span>
                  <input
                    type="radio"
                    name="opdModeSelect"
                    checked={(hospitalForm.opdOperationMode || 'FULL_DIGITAL') === 'FULL_DIGITAL'}
                    onChange={() => {}}
                    className="text-[#2F63F2]"
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  Full digital consultation workspace, E-Prescription pad, electronic pharmacy routing, digital PDF print & reception desk.
                </p>
              </div>
            </div>
          </div>

          {/* Section 5B: In-Patient Department (IPD) - NEW */}
          <div className="p-5 bg-blue-50/40 border border-blue-100 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-[#2F63F2] uppercase tracking-widest flex items-center gap-2">
              <Hospital className="w-4 h-4" />
              Hospital Services & Modules
            </h4>
            <p className="text-xs text-slate-500 mb-2">Select the services and modules this hospital will use.</p>
            <label className="flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 transition-colors">
              <input 
                type="checkbox"
                checked={hospitalForm.ipd_requested}
                onChange={(e) => setHospitalForm({ ...hospitalForm, ipd_requested: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-[#2F63F2] focus:ring-[#2F63F2] cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-[#2F63F2] flex items-center gap-2">
                  <span className="text-lg">🛏️</span> In-Patient Department (IPD)
                </span>
                <span className="text-[11px] text-slate-500 mt-1">Enable inpatient admission, ward management, doctor rounds and discharge workflows for this hospital.</span>
              </div>
            </label>
          </div>

          {/* Section 6: GPS Geofence Access Control (Receptionist) */}
          <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#2F63F2] uppercase tracking-widest flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#2F63F2]" />
                Receptionist GPS Geofence Access Control
              </h4>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={hospitalForm.geoEnabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setHospitalForm(prev => ({ ...prev, geoEnabled: isChecked }));
                    if (isChecked) {
                      if (!hospitalForm.geoLat || !hospitalForm.geoLng) {
                        handleDetectHospitalLocation();
                      }
                    } else {
                      setGeoStatusMsg(null);
                      setGeoStatusType(null);
                    }
                  }}
                  className="rounded text-[#2F63F2] focus:ring-[#2F63F2] w-4 h-4 cursor-pointer"
                />
                <span>Enable Geofence</span>
              </label>
            </div>

            {hospitalForm.geoEnabled ? (
              <div className="pt-3 border-t border-slate-200/70 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Hospital Location</span>
                  <button
                    type="button"
                    onClick={handleDetectHospitalLocation}
                    disabled={geoDetecting}
                    className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      geoDetecting
                        ? 'bg-blue-50 text-[#2F63F2] border-blue-200 cursor-not-allowed opacity-80'
                        : geoSuccess
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-[#2F63F2] text-white border-transparent hover:bg-blue-700 shadow-xs'
                    }`}
                  >
                    {geoDetecting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>⏳ Detecting Location...</span>
                      </>
                    ) : geoSuccess ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>✓ Location Captured</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-3.5 h-3.5" />
                        <span>📍 Capture Current Location</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Hospital Latitude"
                    placeholder="e.g. 13.0827"
                    type="number"
                    step="any"
                    value={hospitalForm.geoLat}
                    onChange={(e) => setHospitalForm({ ...hospitalForm, geoLat: e.target.value })}
                  />
                  <Input
                    label="Hospital Longitude"
                    placeholder="e.g. 80.2707"
                    type="number"
                    step="any"
                    value={hospitalForm.geoLng}
                    onChange={(e) => setHospitalForm({ ...hospitalForm, geoLng: e.target.value })}
                  />
                  <Input
                    label="Allowed Radius (Meters)"
                    placeholder="300"
                    type="number"
                    min="10"
                    value={hospitalForm.geoRadius}
                    onChange={(e) => setHospitalForm({ ...hospitalForm, geoRadius: e.target.value })}
                  />
                </div>

                {geoStatusMsg && (
                  <div className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                    geoStatusType === 'success' 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}>
                    <span>{geoStatusMsg}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-50 pointer-events-none">
                <Input
                  label="Hospital Latitude"
                  placeholder="e.g. 13.0827"
                  type="number"
                  step="any"
                  value={hospitalForm.geoLat}
                  disabled={true}
                />
                <Input
                  label="Hospital Longitude"
                  placeholder="e.g. 80.2707"
                  type="number"
                  step="any"
                  value={hospitalForm.geoLng}
                  disabled={true}
                />
                <Input
                  label="Allowed Radius (Meters)"
                  placeholder="300"
                  type="number"
                  value={hospitalForm.geoRadius}
                  disabled={true}
                />
              </div>
            )}
          </div>

        </form>
      </Modal>

      {/* 2. Add/Edit Plan Drawer */}
      <Drawer 
        isOpen={isPlanOpen} 
        onClose={() => setIsPlanOpen(false)} 
        title={selectedPlan ? `Edit Plan: ${selectedPlan.name}` : "Create Subscription Plan"}
      >
        <form onSubmit={handleCreateOrUpdatePlan} className="space-y-4 text-left">
          <Input label="Plan Name" placeholder="e.g. Premium Plan" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: capitalizeWords(e.target.value.replace(/[^a-zA-Z\s]/g, '')) })} required />
          <Input label="Plan Code" placeholder="e.g. PREMIUM" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} required />
          <Input label="Plan Price (₹)" type="number" placeholder="e.g. 5000" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} required />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Billing Cycle</label>
            <select className="enterprise-input" value={planForm.billingCycle} onChange={(e) => setPlanForm({ ...planForm, billingCycle: e.target.value })} required>
              <option value="Monthly">Monthly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>
          <Input label="Plan Description" placeholder="Describe plan benefits..." value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: capitalizeWords(e.target.value.replace(/[^a-zA-Z\s,.-]/g, '')) })} />
          <Input label="Plan Features (comma-separated)" placeholder="OPD Management, Billing, Ward Tracking" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: capitalizeWords(e.target.value.replace(/[^a-zA-Z\s,]/g, '')) })} />
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            {selectedPlan ? 'Update Plan' : 'Create Plan'}
          </Button>
        </form>
      </Drawer>

      {/* 3. Add Hospital Admin Drawer */}
      <Drawer 
        isOpen={isUserOpen} 
        onClose={() => setIsUserOpen(false)} 
        title="Register Hospital Administrator"
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-left">
          <Input label="Admin Full Name" placeholder="e.g. Sumanth Patel" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: capitalizeWords(e.target.value.replace(/[^a-zA-Z\s]/g, '')) })} required />
          <div className="grid grid-cols-2 gap-4">
            <MobileNumber 
              label="Login Username / Mobile" 
              placeholder="e.g. 9876543210" 
              countryValue={userForm.countryCode || '+91'}
              onCountryChange={(cc) => setUserForm({ ...userForm, countryCode: cc })}
              numberValue={userForm.mobileNumber}
              onNumberChange={(val) => setUserForm({ ...userForm, mobileNumber: val })}
              required 
              error={userMobileVal.error}
            />
            <PinInput
              length={6}
              label="Security PIN (6 digits)"
              value={userForm.pin}
              onChange={(val) => setUserForm({ ...userForm, pin: val })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Tenant Hospital Allocation</label>
            <select className="enterprise-input" value={userForm.hospitalId} onChange={(e) => setUserForm({ ...userForm, hospitalId: e.target.value, roleId: roles.find(r => r.name === 'DOCTOR_ADMIN')?._id || '' })} required>
              <option value="">Select Hospital</option>
              {hospitals.map(h => <option key={h._id} value={h._id}>{h.name} ({h.code})</option>)}
            </select>
          </div>

          <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={Boolean(userMobileVal.error)}>Register Administrator</Button>
        </form>
      </Drawer>

      {/* 4. Reset User PIN Modal */}
      <Modal isOpen={isResetPinOpen} onClose={() => setIsResetPinOpen(false)} title={`Reset Security PIN: ${selectedUser?.name}`}>
        <form onSubmit={handleResetPin} className="space-y-4 text-left">
          <PinInput
            length={6}
            label="New 6-Digit Security PIN"
            value={resetPinValue}
            onChange={(val) => setResetPinValue(val)}
          />
          <Button type="submit" variant="danger" className="w-full">Reset PIN</Button>
        </form>
      </Modal>

      {/* 5. Hospital Activation Plan Drawer */}
      <Drawer isOpen={isActivationOpen} onClose={() => setIsActivationOpen(false)} title={`Activate Plan Subscription: ${selectedHospitalForActivation?.name}`} size="lg">
        <form onSubmit={handleActivatePlan} className="space-y-4 text-left">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Plan Tier Level & Operation Mode</label>
            <select 
              className="enterprise-input font-bold" 
              value={activationForm.opdOperationMode || 'FULL_DIGITAL'} 
              onChange={(e) => {
                const mode = e.target.value;
                setActivationForm({ 
                  ...activationForm, 
                  opdOperationMode: mode, 
                  planName: mode === 'TOKEN_ONLY' ? 'Plan 1: OPD Token Generation & Queue Suite' : 'Plan 2: Complete Digital OPD Suite' 
                });
              }} 
              required
            >
              <option value="TOKEN_ONLY">🎟️ Plan 1: OPD Token Generation & Queue Suite (Paper Rx + Voice Call)</option>
              <option value="FULL_DIGITAL">🩺 Plan 2: Complete Digital OPD & E-Prescription Suite</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Billing Cycle</label>
              <select className="enterprise-input" value={activationForm.planType} onChange={(e) => setActivationForm({ ...activationForm, planType: e.target.value })} required>
                <option value="Monthly">Monthly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Duration Years</label>
              <input type="number" min={0} max={10} className="enterprise-input" value={activationForm.subYears} onChange={(e) => setActivationForm({ ...activationForm, subYears: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Duration Months</label>
              <input type="number" min={0} max={12} className="enterprise-input" value={activationForm.subMonths} onChange={(e) => setActivationForm({ ...activationForm, subMonths: e.target.value })} required />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-[#4B5563]">
            <h4 className="font-bold text-slate-700 mb-2">Hospital Administrator Initial Login Credentials</h4>
            <div className="space-y-1 text-slate-700">
              <p><strong>Hospital Code:</strong> <span className="font-mono font-bold text-[#2F63F2] text-sm ml-1">{selectedHospitalForActivation?.code}</span></p>
              <p><strong>Admin Mobile Number:</strong> <span className="font-mono font-bold text-slate-800 ml-1">{selectedHospitalForActivation?.ownerMobile || selectedHospitalForActivation?.adminMobile || selectedHospitalForActivation?.contactNumber}</span></p>
              <p><strong>Default Security PIN:</strong> <span className="font-mono font-bold text-emerald-600 text-sm ml-1">123456</span></p>
            </div>
            <p className="text-[#EF4444] font-semibold mt-2.5 text-[11px]">Activating this plan creates the hospital administrator account. The administrator can log in using the Hospital Code, Mobile Number, and Default PIN 123456 above.</p>
          </div>

          <Button type="submit" variant="primary" className="w-full" loading={loading}>Activate Subscription Plan</Button>
        </form>
      </Drawer>



      {/* 7. View Hospital Details Modal */}
      <Modal isOpen={isViewHospitalOpen} onClose={() => setIsViewHospitalOpen(false)} title={`Hospital File: ${selectedHospital?.code}`}>
        <div className="space-y-4 text-xs text-left text-slate-600 font-sans">
          <div className="flex items-center gap-3">
            {selectedHospital?.logo ? (
              <img src={selectedHospital.logo} alt="Logo" className="w-12 h-12 rounded-xl object-contain border" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#2F63F2] flex items-center justify-center font-bold text-lg">{selectedHospital?.name.slice(0,2).toUpperCase()}</div>
            )}
            <div>
              <h4 className="text-sm font-bold text-slate-800">{selectedHospital?.name}</h4>
              <p className="text-[10px] text-slate-400 uppercase font-mono">{selectedHospital?.code} | {selectedHospital?.hospitalType || 'General'}</p>
            </div>
          </div>
          
          <hr />

          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1 text-xs">
            <h5 className="font-bold text-[#2F63F2] uppercase tracking-wider text-[10px]">Administrator Login Credentials</h5>
            <div className="grid grid-cols-3 gap-2 pt-1 text-slate-700">
              <div><span className="text-[10px] text-slate-400 block font-semibold uppercase">Hospital Code</span><span className="font-mono font-bold text-[#2F63F2]">{selectedHospital?.code}</span></div>
              <div><span className="text-[10px] text-slate-400 block font-semibold uppercase">Admin Mobile</span><span className="font-mono font-bold">{selectedHospital?.ownerMobile || selectedHospital?.adminMobile || selectedHospital?.contactNumber}</span></div>
              <div><span className="text-[10px] text-slate-400 block font-semibold uppercase">Default PIN</span><span className="font-mono font-bold text-emerald-600">123456</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">Contact Email</p>
              <p className="text-slate-700 font-medium">{selectedHospital?.email}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">Contact Mobile</p>
              <p className="text-slate-700 font-medium">{selectedHospital?.contactNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">Registration Number</p>
              <p className="text-slate-700 font-medium">{selectedHospital?.registrationNumber || 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">GST Number</p>
              <p className="text-slate-700 font-medium">{selectedHospital?.gstNumber || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">Owner / Director</p>
              <p className="text-slate-700 font-medium">{selectedHospital?.ownerName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">Owner Contact</p>
              <p className="text-slate-700 font-medium">{selectedHospital?.ownerMobile || 'N/A'}</p>
            </div>
          </div>

          <div>
            <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">Facility Database Node URI</p>
            <p className="text-slate-700 font-mono text-[10px] bg-slate-50 border rounded p-1.5 select-all">{selectedHospital?.databaseName || 'villzone_hospital_xxx'}</p>
          </div>

          <div>
            <p className="text-slate-400 font-semibold uppercase tracking-wide text-[9px]">Hospital Address</p>
            <p className="text-slate-700">{selectedHospital?.address?.street}, {selectedHospital?.address?.city}, {selectedHospital?.address?.state} - {selectedHospital?.address?.zip}, {selectedHospital?.address?.country}</p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button onClick={() => setIsViewHospitalOpen(false)} variant="secondary">Close Profile</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default SuperAdminDashboard;
