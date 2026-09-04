import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import DatePicker from '../components/DatePicker';
import Autocomplete from '../components/Autocomplete';
import { 
  GitBranch, ClipboardList, Users, ShieldCheck, ShieldAlert, Plus, Key, Activity, Calendar, 
  FileBarChart2, Settings, Building2, History, UserRound, Pill, 
  CreditCard, Clock, Trash2, Edit, CheckCircle, PlusCircle, Search, Eye,
  Ticket, Stethoscope, FileText, Database
} from 'lucide-react';
import { motion } from 'framer-motion';

const AdminDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('summary');
  const [branchSubTab, setBranchSubTab] = useState('branches');
  const [workforceRoleTab, setWorkforceRoleTab] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [hospitalInfo, setHospitalInfo] = useState(null);

  const isMultiBranchEnabled = Boolean(
    user?.featureModules?.Branches ||
    hospitalInfo?.featureModules?.Branches === true ||
    (hospitalInfo?.featureModules && typeof hospitalInfo.featureModules.get === 'function' && hospitalInfo.featureModules.get('Branches') === true)
  );

  // Synchronize activeTab and branchSubTab with URL route & search params (?tab=...)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');
    const path = location.pathname;

    if (path.includes('/admin/departments') || tabParam === 'branches' || tabParam === 'departments' || tabParam === 'hospitals') {
      setActiveTab('branches');
      if (tabParam === 'departments' || !isMultiBranchEnabled) {
        setBranchSubTab('departments');
      } else {
        setBranchSubTab('branches');
      }
    } else if (path.includes('/admin/workforce') || path.includes('/admin/users') || path.includes('/admin/doctors') || tabParam === 'workforce' || tabParam === 'staff' || tabParam === 'users' || tabParam === 'roster') {
      setActiveTab('staff');
    } else if (path.includes('/admin/patients') || tabParam === 'patients' || tabParam === 'registry') {
      setActiveTab('patients');
    } else if (path.includes('/admin/services') || tabParam === 'services') {
      setActiveTab('services');
    } else if (tabParam === 'summary') {
      setActiveTab('summary');
    } else if (tabParam) {
      setActiveTab(tabParam);
    } else if (path === '/admin/dashboard' && !tabParam) {
      setActiveTab('summary');
    }
  }, [location.pathname, location.search, isMultiBranchEnabled]);

  // Workforce filtering/tabbing states
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDept, setFilterDept] = useState('');

  // Core administrative collections
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [services, setServices] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');

  // Modals & Drawers Open States
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [isServiceOpen, setIsServiceOpen] = useState(false);
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [isDoctorProfileOpen, setIsDoctorProfileOpen] = useState(false);
  const [isResetPinOpen, setIsResetPinOpen] = useState(false);
  const [isStaffViewOnly, setIsStaffViewOnly] = useState(false);

  // Receptionist-style Modals (Quick Actions)
  const [isRegOpen, setIsRegOpen] = useState(false);
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [isVitalsOpen, setIsVitalsOpen] = useState(false);
  const [isFinanceBillOpen, setIsFinanceBillOpen] = useState(false);

  // Selections
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedPatientForBooking, setSelectedPatientForBooking] = useState(null);
  const [selectedAppointmentForVitals, setSelectedAppointmentForVitals] = useState(null);
  const [selectedAppointmentForBilling, setSelectedAppointmentForBilling] = useState(null);

  // Form Fields Binds
  const [resetPinValue, setResetPinValue] = useState('');
  const [branchForm, setBranchForm] = useState({ 
    name: '', contactNumber: '', street: '', city: '', state: '', zip: '', country: 'India' 
  });
  const [deptForm, setDeptForm] = useState({ 
    name: '', code: '', description: '', branchId: '' 
  });
  const [serviceForm, setServiceForm] = useState({ 
    name: '', code: '', price: 150, description: '', status: 'active' 
  });
  const [staffForm, setStaffForm] = useState({ 
    name: '', countryCode: '+91', mobileNumber: '', pin: '', roleId: '', branchId: '', departmentId: '',
    qualification: '', specialization: '', experience: 0, consultationFee: 500, emergencyFee: 1000,
    nurseQualification: '', nurseAssignedWard: '',
    pharmacistLicenseNumber: '', pharmacistCounterNumber: '',
    labTechSpecialization: '', labTechLicenseNumber: '',
    billingCounterNumber: '', billingMaxDiscountPercent: 0,
    receptionistDeskNumber: ''
  });
  const [doctorProfileForm, setDoctorProfileForm] = useState({
    qualification: '', specialization: '', experience: 1, consultationFee: 300
  });

  // Settings Configuration Binds
  const [profileForm, setProfileForm] = useState({
    name: '', registrationNumber: '', gstNumber: '', street: '', city: '', state: '', zip: '', contactCountryCode: '+91', contactNumber: '', email: '', website: '', logo: ''
  });
  const [billingSettings, setBillingSettings] = useState({ invoicePrefix: 'INV-', receiptFormat: 'Thermal Receipt', gstPercent: 18 });

  // Quick Action Forms
  const [patientForm, setPatientForm] = useState({ name: '', age: '', gender: 'Male', countryCode: '+91', mobileNumber: '', email: '', bloodGroup: 'O+', allergies: '', contactName: '', contactPhone: '', street: '', city: '', state: '', zip: '' });
  const [appForm, setAppForm] = useState({ date: '', time: '', doctorId: '' });
  const [vitalsForm, setVitalsForm] = useState({ weight: '', height: '', bpSystolic: '', bpDiastolic: '', pulse: '', temperature: '', spo2: '' });
  const [billingForm, setBillingForm] = useState({ discount: 0, paymentMode: 'Cash' });

  // Mobile Validation hooks
  const branchMobileVal = useMobileValidation('');
  const staffMobileVal = useMobileValidation('');
  const profileMobileVal = useMobileValidation('');
  const patientMobileVal = useMobileValidation('');

  const defaultBranchDisplayName = (hospitalInfo?.address?.city || '').toString().trim() ||
    (branches.find(b => b.isDefault)?.address?.city || '').toString().trim() ||
    (branches.find(b => b.isDefault)?.name && branches.find(b => b.isDefault)?.name !== 'Main Facility' ? branches.find(b => b.isDefault)?.name : null) ||
    branches.find(b => b.isDefault)?.name ||
    branches[0]?.name ||
    'Main Facility';

  useEffect(() => {
    branchMobileVal.setValue(branchForm.contactNumber || '');
    branchMobileVal.setError(
      branchForm.contactNumber && branchForm.contactNumber.length < 10
        ? 'Mobile number must contain exactly 10 digits.'
        : ''
    );
  }, [branchForm.contactNumber]);

  useEffect(() => {
    staffMobileVal.setValue(staffForm.mobileNumber || '');
    staffMobileVal.setError(
      staffForm.mobileNumber && staffForm.mobileNumber.length < 10
        ? 'Mobile number must contain exactly 10 digits.'
        : ''
    );
  }, [staffForm.mobileNumber]);

  useEffect(() => {
    profileMobileVal.setValue(profileForm.contactNumber || '');
    profileMobileVal.setError(
      profileForm.contactNumber && profileForm.contactNumber.length < 10
        ? 'Mobile number must contain exactly 10 digits.'
        : ''
    );
  }, [profileForm.contactNumber]);

  useEffect(() => {
    patientMobileVal.setValue(patientForm.mobileNumber || '');
    patientMobileVal.setError(
      patientForm.mobileNumber && patientForm.mobileNumber.length < 10
        ? 'Mobile number must contain exactly 10 digits.'
        : ''
    );
  }, [patientForm.mobileNumber]);

  // Sync tab with location.pathname
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/branches')) {
      setActiveTab('branches');
      setBranchSubTab('branches');
    } else if (path.includes('/departments')) {
      setActiveTab('branches');
      setBranchSubTab('departments');
    } else if (path.includes('/services')) setActiveTab('services');
    else if (path.includes('/consultation-fees')) setActiveTab('consultation-fees');
    else if (path.includes('/workforce') || path.includes('/doctors') || path.includes('/staff') || path.includes('/users')) setActiveTab('workforce');
    else if (path.includes('/patients')) setActiveTab('patients');
    else if (path.includes('/reports')) {
      setActiveTab('reports');
    } else if (path.includes('/hospital-profile')) setActiveTab('hospital-profile');
    else if (path.includes('/settings/working-hours')) setActiveTab('working-hours');
    else setActiveTab('summary');
  }, [location.pathname]);

  const fetchData = async (tab) => {
    setLoading(true);
    try {
      if (tab === 'summary') {
        const [brs, depts, stf, hospitalRes, todayApps] = await Promise.all([
          api.get('/admin/branches').catch(() => ({ data: { data: [] } })),
          api.get('/admin/departments').catch(() => ({ data: { data: [] } })),
          api.get('/admin/users').catch(() => ({ data: { data: [] } })),
          api.get('/admin/hospitals').catch(() => ({ data: { data: [] } })),
          api.get('/operations/appointments/today', { params: { date: new Date().toISOString().split('T')[0] } }).catch(() => ({ data: { data: [] } }))
        ]);
        setBranches(Array.isArray(brs.data?.data) ? brs.data.data : []);
        setDepartments(Array.isArray(depts.data?.data) ? depts.data.data : []);
        setStaff(Array.isArray(stf.data?.data) ? stf.data.data : []);
        setTodayAppointments(Array.isArray(todayApps.data?.data) ? todayApps.data.data : (Array.isArray(todayApps.data) ? todayApps.data : []));
        if (hospitalRes.data?.data?.length > 0) {
          setHospitalInfo(hospitalRes.data.data[0]);
        }
      } else if (tab === 'branches' || tab === 'departments') {
        const [brs, depts] = await Promise.all([
          api.get('/admin/branches').catch(() => ({ data: { data: [] } })),
          api.get('/admin/departments').catch(() => ({ data: { data: [] } }))
        ]);
        setBranches(Array.isArray(brs.data?.data) ? brs.data.data : []);
        setDepartments(Array.isArray(depts.data?.data) ? depts.data.data : []);
      } else if (tab === 'services') {
        const res = await api.get('/admin/services').catch(() => ({ data: { data: [] } }));
        setServices(Array.isArray(res.data?.data) ? res.data.data : []);
      } else if (tab === 'workforce' || tab === 'doctors' || tab === 'staff' || tab === 'users') {
        const [stf, rls, brs, depts] = await Promise.all([
          api.get('/admin/users').catch(() => ({ data: { data: [] } })),
          api.get('/admin/roles').catch(() => ({ data: { data: [] } })),
          api.get('/admin/branches').catch(() => ({ data: { data: [] } })),
          api.get('/admin/departments').catch(() => ({ data: { data: [] } }))
        ]);
        setStaff(Array.isArray(stf.data?.data) ? stf.data.data : []);
        setRoles(Array.isArray(rls.data?.data) ? rls.data.data : []);
        setBranches(Array.isArray(brs.data?.data) ? brs.data.data : []);
        setDepartments(Array.isArray(depts.data?.data) ? depts.data.data : []);
      } else if (tab === 'patients') {
        const res = await api.get('/operations/patients').catch(() => ({ data: { data: [] } }));
        setPatients(Array.isArray(res.data?.data) ? res.data.data : []);
      } else if (tab === 'reports' || tab === 'audit-logs') {
        const [depts, stf, todayApps] = await Promise.all([
          api.get('/admin/departments').catch(() => ({ data: { data: [] } })),
          api.get('/admin/users').catch(() => ({ data: { data: [] } })),
          api.get('/operations/appointments/today', { params: { date: new Date().toISOString().split('T')[0] } }).catch(() => ({ data: { data: [] } }))
        ]);
        setDepartments(Array.isArray(depts.data?.data) ? depts.data.data : []);
        setStaff(Array.isArray(stf.data?.data) ? stf.data.data : []);
        setTodayAppointments(Array.isArray(todayApps.data?.data) ? todayApps.data.data : (Array.isArray(todayApps.data) ? todayApps.data : []));
      } else if (tab === 'hospital-profile') {
        const res = await api.get('/admin/hospitals').catch(() => ({ data: { data: [] } }));
        if (res.data?.data?.length > 0) {
          const hosp = res.data.data[0];
          setHospitalInfo(hosp);
          setProfileForm({
            name: hosp.name,
            registrationNumber: hosp.registrationNumber || '',
            gstNumber: hosp.gstNumber || '',
            street: hosp.address?.street || '',
            city: hosp.address?.city || '',
            state: hosp.address?.state || '',
            zip: hosp.address?.zip || '',
            contactCountryCode: hosp.contactCountryCode || '+91',
            contactNumber: hosp.contactNumber || '',
            email: hosp.email || '',
            website: hosp.website || '',
            logo: hosp.logo || ''
          });
        }
      }
    } catch (err) {
      console.error('Data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  // --------------------------------------------------------
  // RECEPTIONIST & BILLING MUTATIONS
  // --------------------------------------------------------

  // Register Patient Mutation
  const registerPatientMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/operations/patients', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success(`Patient registered successfully! UHID: ${data.uhid}`);
      setPatientForm({ name: '', age: '', gender: 'Male', countryCode: '+91', mobileNumber: '', email: '', bloodGroup: 'O+', allergies: '', contactName: '', contactPhone: '', street: '', city: '', state: '', zip: '' });
      setIsRegOpen(false);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to register patient');
    }
  });

  // Book Appointment Mutation
  const bookAppointmentMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/operations/appointments', payload);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Appointment booked successfully!');
      setAppForm({ date: '', time: '', doctorId: '' });
      setSelectedPatientForBooking(null);
      setIsBookOpen(false);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to book appointment');
    }
  });

  // Enter Vitals Mutation
  const enterVitalsMutation = useMutation({
    mutationFn: async ({ id, vitals }) => {
      const res = await api.put(`/operations/appointments/${id}/vitals`, { vitals });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Patient vitals recorded successfully!');
      setIsVitalsOpen(false);
      setVitalsForm({ weight: '', height: '', bpSystolic: '', bpDiastolic: '', pulse: '', temperature: '', spo2: '' });
      setSelectedAppointmentForVitals(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to log vitals');
    }
  });

  // Create & Pay Invoice Mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/operations/invoices', payload);
      return res.data.data;
    },
    onSuccess: async (data) => {
      await api.put(`/operations/invoices/${data._id}/payment`, { paymentMode: billingForm.paymentMode });
      toast.success(`Invoice generated & payment processed! Receipt: ${data.invoiceNo}`);
      setBillingForm({ discount: 0, paymentMode: 'Cash' });
      setSelectedAppointmentForBilling(null);
      setIsFinanceBillOpen(false);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to complete billing transaction');
    }
  });

  const [patientsAutocompleteResults, setPatientsAutocompleteResults] = useState([]);
  const handlePatientSearchForBooking = async (val) => {
    if (val.length < 2) return;
    try {
      const res = await api.get(`/operations/patients/search?query=${val}`);
      setPatientsAutocompleteResults(res.data.data);
    } catch (err) {}
  };

  // --------------------------------------------------------
  // Quick Add Context State (from Staff Modal)
  const [quickContextFromStaff, setQuickContextFromStaff] = useState(null);
  const [branchErrors, setBranchErrors] = useState({});

  const handleOpenQuickAddBranch = () => {
    setSelectedBranch(null);
    setBranchForm({ name: '', contactNumber: '', street: '', city: '', state: '', zip: '', country: 'India' });
    setBranchErrors({});
    setQuickContextFromStaff('branch');
    setIsBranchOpen(true);
  };

  const handleOpenQuickAddDept = () => {
    setSelectedDept(null);
    setDeptForm({ name: '', code: '', description: '', branchId: '' });
    setQuickContextFromStaff('department');
    setIsDeptOpen(true);
  };

  const handleSaveBranch = async (e) => {
    e.preventDefault();
    const errs = {};

    if (!branchForm.name || !branchForm.name.trim()) {
      errs.name = 'Branch Name is required.';
    }
    if (!branchForm.contactNumber || !/^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(branchForm.contactNumber)) {
      errs.contactNumber = 'Please enter a valid 10-digit mobile number.';
    }

    if (Object.keys(errs).length > 0) {
      setBranchErrors(errs);
      return;
    }
    setBranchErrors({});

    try {
      const payload = {
        name: branchForm.name,
        address: {
          street: branchForm.street,
          city: branchForm.city,
          state: branchForm.state,
          zip: branchForm.zip,
          country: branchForm.country
        },
        contactNumber: branchForm.contactNumber
      };

      if (selectedBranch) {
        await api.put(`/admin/branches/${selectedBranch._id}`, payload);
        toast.success('Branch details updated');
      } else {
        const res = await api.post('/admin/branches', payload);
        const newBranch = res.data?.data;
        toast.success('New branch registered successfully');

        if (quickContextFromStaff === 'branch' && newBranch?._id) {
          setStaffForm(prev => ({ ...prev, branchId: newBranch._id }));
          if (staffErrors.branchId) setStaffErrors(prev => ({ ...prev, branchId: undefined }));
          setQuickContextFromStaff(null);
        }
      }
      setIsBranchOpen(false);
      setSelectedBranch(null);
      setBranchErrors({});
      setBranchForm({ name: '', contactNumber: '', street: '', city: '', state: '', zip: '', country: 'India' });
      fetchData('branches');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save branch';
      if (msg.toLowerCase().includes('mobile') || msg.toLowerCase().includes('contact')) {
        setBranchErrors({ contactNumber: msg });
      } else if (msg.toLowerCase().includes('name')) {
        setBranchErrors({ name: msg });
      } else {
        toast.error(msg);
      }
    }
  };

  const handleEditBranch = (br) => {
    setSelectedBranch(br);
    setBranchErrors({});
    setBranchForm({
      name: br.name,
      contactNumber: br.contactNumber,
      street: br.address?.street || '',
      city: br.address?.city || '',
      state: br.address?.state || '',
      zip: br.address?.zip || '',
      country: br.address?.country || 'India'
    });
    setIsBranchOpen(true);
  };

  const handleSaveDept = async (e) => {
    e.preventDefault();
    try {
      if (selectedDept) {
        await api.put(`/admin/departments/${selectedDept._id}`, deptForm);
        toast.success('Department updated successfully');
      } else {
        const res = await api.post('/admin/departments', deptForm);
        const newDept = res.data?.data;
        toast.success('Department registered successfully');

        if (quickContextFromStaff === 'department' && newDept?._id) {
          setStaffForm(prev => ({ ...prev, departmentId: newDept._id }));
          setQuickContextFromStaff(null);
        }
      }
      setIsDeptOpen(false);
      setSelectedDept(null);
      setDeptForm({ name: '', code: '', description: '', branchId: '' });
      fetchData('departments');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Department save failed');
    }
  };

  const handleEditDept = (dept) => {
    setSelectedDept(dept);
    setDeptForm({
      name: dept.name,
      code: dept.code,
      description: dept.description || '',
      branchId: dept.branchId?._id || dept.branchId || ''
    });
    setIsDeptOpen(true);
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    try {
      if (selectedService) {
        await api.put(`/admin/services/${selectedService._id}`, serviceForm);
        toast.success('Service configuration updated');
      } else {
        await api.post('/admin/services', serviceForm);
        toast.success('Diagnostic/Clinical service added');
      }
      setIsServiceOpen(false);
      setSelectedService(null);
      setServiceForm({ name: '', code: '', price: 150, description: '', status: 'active' });
      fetchData('services');
    } catch (err) {
      toast.error('Service save failed');
    }
  };

  const handleEditService = (srv) => {
    setSelectedService(srv);
    setServiceForm({
      name: srv.name,
      code: srv.code,
      price: srv.price || 150,
      description: srv.description || '',
      status: srv.status
    });
    setIsServiceOpen(true);
  };

  const handleDeleteService = async (srv) => {
    if (!window.confirm('Delete this healthcare service parameter?')) return;
    try {
      await api.delete(`/admin/services/${srv._id}`);
      toast.success('Service parameters deleted');
      fetchData('services');
    } catch (err) {
      toast.error('Deletion failed');
    }
  };

  const [staffErrors, setStaffErrors] = useState({});

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    const errs = {};

    if (!staffForm.name || !staffForm.name.trim()) {
      errs.name = 'Employee Full Name is required.';
    }
    if (!staffForm.mobileNumber || !/^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(staffForm.mobileNumber)) {
      errs.mobileNumber = 'Please enter a valid 10-digit Indian mobile number.';
    }
    if (!selectedStaff && (!staffForm.pin || staffForm.pin.length !== 6)) {
      errs.pin = 'Security PIN must be 6 numeric digits.';
    }
    if (!staffForm.roleId) {
      errs.roleId = 'Role Clearance selection is required.';
    }
    
    const activeBranchId = staffForm.branchId || branches.find(b => b.isDefault)?._id || branches[0]?._id || user?.branchId;
    if (!activeBranchId) {
      errs.branchId = 'Branch Location selection is required.';
    }

    if (Object.keys(errs).length > 0) {
      setStaffErrors(errs);
      return;
    }
    setStaffErrors({});

    try {
      const selectedRoleObj = roles.find(r => r._id === staffForm.roleId);
      const roleName = selectedRoleObj?.name;

      const payload = {
        name: staffForm.name,
        countryCode: staffForm.countryCode,
        mobileNumber: staffForm.mobileNumber,
        roleId: staffForm.roleId,
        branchId: activeBranchId,
        departmentId: staffForm.departmentId || null,
        ...(staffForm.pin ? { pin: staffForm.pin } : {})
      };

      if (['DOCTOR', 'DOCTOR_ADMIN'].includes(roleName)) {
        payload.doctorProfile = {
          qualification: (staffForm.qualification || '').trim().toUpperCase(),
          specialization: staffForm.specialization,
          experience: Number(staffForm.experience) || 0,
          consultationFee: Number(staffForm.consultationFee) || 500,
          consultationFees: {
            general: Number(staffForm.consultationFee) || 500,
            followup: Math.round((Number(staffForm.consultationFee) || 500) * 0.6),
            emergency: Number(staffForm.emergencyFee) || 1000
          }
        };
      } else if (roleName === 'NURSE') {
        payload.nurseProfile = {
          qualification: staffForm.nurseQualification,
          assignedWard: staffForm.nurseAssignedWard
        };
      } else if (roleName === 'PHARMACIST') {
        payload.pharmacistProfile = {
          licenseNumber: staffForm.pharmacistLicenseNumber,
          counterNumber: staffForm.pharmacistCounterNumber
        };
      } else if (roleName === 'LABORATORY') {
        payload.labTechProfile = {
          specialization: staffForm.labTechSpecialization,
          licenseNumber: staffForm.labTechLicenseNumber
        };
      } else if (roleName === 'BILLING') {
        payload.billingProfile = {
          counterNumber: staffForm.billingCounterNumber,
          maxDiscountPercent: Number(staffForm.billingMaxDiscountPercent) || 0
        };
      } else if (roleName === 'RECEPTIONIST') {
        payload.receptionistProfile = {
          deskNumber: staffForm.receptionistDeskNumber
        };
      }

      if (selectedStaff) {
        await api.put(`/admin/users/${selectedStaff._id}`, payload);
        toast.success('Workforce member record updated');
      } else {
        const createPayload = {
          ...payload,
          hospitalId: user.hospitalId,
          hospitalCode: user.hospitalCode
        };
        await api.post('/auth/create-user', createPayload);
        toast.success('Staff added successfully');
      }
      setIsStaffOpen(false);
      setSelectedStaff(null);
      setStaffErrors({});
      setStaffForm({ 
        name: '', countryCode: '+91', mobileNumber: '', pin: '', roleId: '', branchId: '', departmentId: '',
        qualification: '', specialization: '', experience: 0, consultationFee: 500, emergencyFee: 1000,
        nurseQualification: '', nurseAssignedWard: '',
        pharmacistLicenseNumber: '', pharmacistCounterNumber: '',
        labTechSpecialization: '', labTechLicenseNumber: '',
        billingCounterNumber: '', billingMaxDiscountPercent: 0,
        receptionistDeskNumber: ''
      });
      fetchData(activeTab);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save workforce record';
      if (msg.toLowerCase().includes('mobile')) {
        setStaffErrors({ mobileNumber: msg });
      } else {
        toast.error(msg);
      }
    }
  };

  const handleEditStaff = (row) => {
    setSelectedStaff(row);
    setIsStaffViewOnly(false);
    setStaffForm({
      name: row.name || '',
      countryCode: row.countryCode || '+91',
      mobileNumber: row.mobileNumber || '',
      pin: '',
      roleId: row.roleId?._id || row.roleId || '',
      branchId: row.branchId?._id || row.branchId || '',
      departmentId: row.departmentId?._id || row.departmentId || '',
      qualification: row.doctorProfile?.qualification || '',
      specialization: row.doctorProfile?.specialization || '',
      experience: row.doctorProfile?.experience || 0,
      consultationFee: row.doctorProfile?.consultationFee || 500,
      emergencyFee: row.doctorProfile?.consultationFees?.emergency || 1000,
      nurseQualification: row.nurseProfile?.qualification || '',
      nurseAssignedWard: row.nurseProfile?.assignedWard || '',
      pharmacistLicenseNumber: row.pharmacistProfile?.licenseNumber || '',
      pharmacistCounterNumber: row.pharmacistProfile?.counterNumber || '',
      labTechSpecialization: row.labTechProfile?.specialization || '',
      labTechLicenseNumber: row.labTechProfile?.licenseNumber || '',
      billingCounterNumber: row.billingProfile?.counterNumber || '',
      billingMaxDiscountPercent: row.billingProfile?.maxDiscountPercent || 0,
      receptionistDeskNumber: row.receptionistProfile?.deskNumber || ''
    });
    setIsStaffOpen(true);
  };

  const handleOpenAddStaff = () => {
    setSelectedStaff(null);
    setIsStaffViewOnly(false);
    setStaffErrors({});
    setStaffForm({
      name: '',
      countryCode: '+91',
      mobileNumber: '',
      pin: '',
      roleId: '',
      branchId: branches.find(b => b.isDefault)?._id || branches[0]?._id || user?.branchId || '',
      departmentId: '',
      qualification: '', specialization: '', experience: 0, consultationFee: 500, emergencyFee: 1000,
      nurseQualification: '', nurseAssignedWard: '',
      pharmacistLicenseNumber: '', pharmacistCounterNumber: '',
      labTechSpecialization: '', labTechLicenseNumber: '',
      billingCounterNumber: '', billingMaxDiscountPercent: 0,
      receptionistDeskNumber: ''
    });
    setIsStaffOpen(true);
  };

  const handleAddDoctor = () => {
    const docRole = roles.find(r => r.name === 'DOCTOR' || r.name === 'DOCTOR_ADMIN');
    setStaffForm({
      name: '',
      countryCode: '+91',
      mobileNumber: '',
      pin: '',
      roleId: docRole?._id || '',
      branchId: branches[0]?._id || '',
      departmentId: departments[0]?._id || '',
      qualification: '', specialization: '', experience: 0, consultationFee: 500, emergencyFee: 1000,
      nurseQualification: '', nurseAssignedWard: '',
      pharmacistLicenseNumber: '', pharmacistCounterNumber: '',
      labTechSpecialization: '', labTechLicenseNumber: '',
      billingCounterNumber: '', billingMaxDiscountPercent: 0,
      receptionistDeskNumber: ''
    });
    setSelectedStaff(null);
    setIsStaffViewOnly(false);
    setStaffErrors({});
    setIsStaffOpen(true);
  };

  const handleViewStaff = (row) => {
    setSelectedStaff(row);
    setIsStaffViewOnly(true);
    setStaffForm({
      name: row.name || '',
      countryCode: row.countryCode || '+91',
      mobileNumber: row.mobileNumber || '',
      pin: '••••',
      roleId: row.roleId?._id || row.roleId || '',
      branchId: row.branchId?._id || row.branchId || '',
      departmentId: row.departmentId?._id || row.departmentId || '',
      qualification: row.doctorProfile?.qualification || '',
      specialization: row.doctorProfile?.specialization || '',
      experience: row.doctorProfile?.experience || 0,
      consultationFee: row.doctorProfile?.consultationFee || 500,
      emergencyFee: row.doctorProfile?.consultationFees?.emergency || 1000,
      nurseQualification: row.nurseProfile?.qualification || '',
      nurseAssignedWard: row.nurseProfile?.assignedWard || '',
      pharmacistLicenseNumber: row.pharmacistProfile?.licenseNumber || '',
      pharmacistCounterNumber: row.pharmacistProfile?.counterNumber || '',
      labTechSpecialization: row.labTechProfile?.specialization || '',
      labTechLicenseNumber: row.labTechProfile?.licenseNumber || '',
      billingCounterNumber: row.billingProfile?.counterNumber || '',
      billingMaxDiscountPercent: row.billingProfile?.maxDiscountPercent || 0,
      receptionistDeskNumber: row.receptionistProfile?.deskNumber || ''
    });
    setIsStaffOpen(true);
  };

  const handleDeleteStaff = async (row) => {
    if (!window.confirm(`Permanently remove employee ${row.name}?`)) return;
    try {
      await api.delete(`/admin/users/${row._id}`);
      toast.success('User login and employee profiles deleted');
      fetchData(activeTab);
    } catch (err) {
      toast.error('Deletion failed');
    }
  };

  const handleToggleUserStatus = async (row) => {
    const newStatus = row.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/admin/users/${row._id}/status`, { status: newStatus });
      toast.success(`User status changed to ${newStatus}`);
      fetchData(activeTab);
    } catch (err) {
      toast.error('Status toggle failed');
    }
  };

  const handleResetPin = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/set-pin', {
        userId: selectedStaff._id,
        newPin: resetPinValue
      });
      toast.success('Employee security PIN updated');
      setResetPinValue('');
      setSelectedStaff(null);
      setIsResetPinOpen(false);
    } catch (err) {
      toast.error('PIN reset failed');
    }
  };

  const handleEditDoctorProfile = (row) => {
    setSelectedDoctor(row);
    setDoctorProfileForm({
      qualification: row.doctorProfile?.qualification || 'MBBS',
      specialization: row.doctorProfile?.specialization || 'General Consultation',
      experience: row.doctorProfile?.experience || 2,
      consultationFee: row.doctorProfile?.consultationFee || 300
    });
    setIsDoctorProfileOpen(true);
  };

  const handleSaveDoctorProfile = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/admin/users/${selectedDoctor._id}/doctor-profile`, doctorProfileForm);
      toast.success('Doctor consultation credentials configured');
      setIsDoctorProfileOpen(false);
      setSelectedDoctor(null);
      fetchData('doctors');
    } catch (err) {
      toast.error('Failed to configure doctor details');
    }
  };

  const handleSaveHospitalProfile = async (e) => {
    e.preventDefault();
    if (!hospitalInfo) return;
    try {
      const payload = {
        logo: profileForm.logo,
        registrationNumber: profileForm.registrationNumber,
        gstNumber: profileForm.gstNumber,
        contactCountryCode: profileForm.contactCountryCode || '+91',
        contactNumber: profileForm.contactNumber,
        email: profileForm.email,
        website: profileForm.website,
        address: {
          street: profileForm.street,
          city: profileForm.city,
          state: profileForm.state,
          zip: profileForm.zip,
          country: 'India'
        }
      };
      await api.put(`/admin/hospitals/${hospitalInfo._id}/profile`, payload);
      toast.success('Hospital profile parameters updated successfully');
      fetchData('hospital-profile');
    } catch (err) {
      toast.error('Profile update failed');
    }
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name: patientForm.name,
      age: parseInt(patientForm.age),
      gender: patientForm.gender,
      bloodGroup: patientForm.bloodGroup,
      countryCode: patientForm.countryCode || '+91',
      mobileNumber: patientForm.mobileNumber,
      email: patientForm.email,
      allergies: patientForm.allergies ? patientForm.allergies.split(',').map(a => a.trim()) : [],
      contacts: patientForm.contactName ? [{ name: patientForm.contactName, phone: patientForm.contactPhone, relationship: 'Emergency' }] : [],
      addresses: patientForm.street ? [{ street: patientForm.street, city: patientForm.city, state: patientForm.state, zip: patientForm.zip }] : []
    };
    registerPatientMutation.mutate(payload);
  };

  const handleBookingSubmit = (e) => {
    e.preventDefault();
    if (!selectedPatientForBooking) {
      toast.error('Please select a patient first');
      return;
    }
    bookAppointmentMutation.mutate({
      patientId: selectedPatientForBooking._id,
      doctorId: appForm.doctorId,
      date: appForm.date,
      time: appForm.time
    });
  };

  const handleVitalsSubmit = (e) => {
    e.preventDefault();
    if (!selectedAppointmentForVitals) return;
    enterVitalsMutation.mutate({
      id: selectedAppointmentForVitals._id,
      vitals: vitalsForm
    });
  };

  const handleBillingSubmit = (e) => {
    e.preventDefault();
    if (!selectedAppointmentForBilling) return;
    const payload = {
      appointmentId: selectedAppointmentForBilling._id,
      patientId: selectedAppointmentForBilling.patientId._id,
      services: [
        {
          name: 'General Consultation OPD',
          price: selectedAppointmentForBilling.doctorId?.doctorProfile?.consultationFee || 200,
          quantity: 1
        }
      ],
      discount: parseFloat(billingForm.discount) || 0,
      tax: billingSettings.gstPercent
    };
    createInvoiceMutation.mutate(payload);
  };

  const handleClearFilters = () => {
    setFilterSearch('');
    setFilterStatus('');
    setFilterBranch('');
    setFilterDept('');
  };

  const filteredBranchesData = branches.filter(br => {
    if (filterStatus && br.status !== filterStatus) return false;
    if (filterSearch) {
      const s = filterSearch.toLowerCase();
      return br.name.toLowerCase().includes(s) || br.code.toLowerCase().includes(s);
    }
    return true;
  });

  const filteredDeptsData = departments.filter(dept => {
    if (filterStatus && dept.status !== filterStatus) return false;
    if (filterSearch) {
      const s = filterSearch.toLowerCase();
      return dept.name.toLowerCase().includes(s) || dept.code.toLowerCase().includes(s);
    }
    return true;
  });

  const filteredStaffData = staff.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterBranch && (s.branchId?._id || s.branchId) !== filterBranch) return false;
    if (filterDept && (s.departmentId?._id || s.departmentId) !== filterDept) return false;
    if (filterSearch) {
      const term = filterSearch.toLowerCase();
      return (
        s.name.toLowerCase().includes(term) ||
        (s.employeeCode || '').toLowerCase().includes(term) ||
        (s.mobileNumber || '').includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* --------------------------------------------------------
          1. SUMMARY DASHBOARD
          -------------------------------------------------------- */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="text-left">
              <h2 className="text-xl font-bold text-slate-800">Hospital Administration</h2>
              <p className="text-xs text-slate-500 mt-1 font-sans">Configure hospital settings, manage departments, manage billing channels, and register staff rosters.</p>
            </div>
            
            <div className="flex flex-wrap gap-2 justify-end">
              <Button 
                onClick={handleOpenAddStaff} 
                variant="secondary" 
                className="!text-[10px] uppercase font-bold py-1.5 px-3"
              >
                Add Staff
              </Button>
              <Button onClick={() => { setSelectedBranch(null); setIsBranchOpen(true); }} variant="secondary" className="!text-[10px] uppercase font-bold py-1.5 px-3">Add Branch</Button>
            </div>
          </div>

          {/* Top Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            {(() => {
              const doctorCount = staff.filter(s => s.roleId?.name === 'DOCTOR' || s.roleId?.name === 'DOCTOR_ADMIN').length;
              const paidApps = todayAppointments.filter(a => {
                const ps = a.billingStatus || a.paymentStatus || a?.workflow?.paymentState;
                return ps === 'Paid' || ps === 'PAID';
              });
              const todayRevenue = paidApps.reduce((sum, a) => sum + (parseFloat(a.consultationFee) || 0), 0);
              const unpaidApps = todayAppointments.filter(a => {
                const ps = a.billingStatus || a.paymentStatus || a?.workflow?.paymentState;
                return !ps || ps === 'Unpaid' || ps === 'PENDING' || ps === 'Pending';
              });
              const pendingBills = unpaidApps.reduce((sum, a) => sum + (parseFloat(a.consultationFee) || 0), 0);
              return [
                { title: 'Total Doctors', val: doctorCount, border: 'border-l-teal-500', color: 'text-teal-500', sub: 'On duty' },
                { title: 'Total Branches', val: branches.length, border: 'border-l-sky-500', color: 'text-sky-500', sub: 'Locations' },
                { title: "Today's Revenue", val: `₹${todayRevenue.toLocaleString('en-IN')}`, border: 'border-l-indigo-600', color: 'text-indigo-600', sub: `${paidApps.length} paid consultation${paidApps.length !== 1 ? 's' : ''}` },
                { title: 'Pending Bills', val: `₹${pendingBills.toLocaleString('en-IN')}`, border: 'border-l-pink-500', color: 'text-pink-500', sub: `${unpaidApps.length} unsettled` }
              ];
            })().map((stat, i) => (
              <div key={i} className={`p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-xs border-l-4 ${stat.border} flex flex-col`}>
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#6B7280]">{stat.title}</span>
                <span className={`text-2xl font-extrabold font-mono mt-1 ${stat.color}`}>{stat.val}</span>
                <span className="text-[9px] text-[#9CA3AF] mt-0.5 font-semibold font-sans">{stat.sub}</span>
              </div>
            ))}
          </div>

          {/* 2-Column Live Operational Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Left Column: Today's Live OPD Consultation Queue Status */}
            <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5 shadow-card-soft space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#2F63F2]" />
                    Today's OPD Queue Live Status
                  </h3>
                  <p className="text-[11px] text-[#6B7280]">Real-time outpatient consultation progress</p>
                </div>
                <span className="text-xs font-mono font-bold text-[#2F63F2] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                  {todayAppointments.length} Total Visits
                </span>
              </div>

              {/* Status Breakdown Bar */}
              {(() => {
                const waiting = todayAppointments.filter(a => ['Waiting', 'Scheduled'].includes(a.status || a.queueStatus)).length;
                const inConsultation = todayAppointments.filter(a => ['In-Progress', 'In Consultation'].includes(a.status || a.queueStatus)).length;
                const completed = todayAppointments.filter(a => a.status === 'Completed').length;
                return (
                  <div className="grid grid-cols-3 gap-3 font-mono text-center text-xs">
                    <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl space-y-0.5">
                      <div className="text-[10px] font-bold text-amber-700 uppercase">Waiting</div>
                      <div className="text-xl font-extrabold text-amber-900">{waiting}</div>
                    </div>
                    <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-0.5">
                      <div className="text-[10px] font-bold text-blue-700 uppercase">In Progress</div>
                      <div className="text-xl font-extrabold text-blue-900">{inConsultation}</div>
                    </div>
                    <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl space-y-0.5">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase">Completed</div>
                      <div className="text-xl font-extrabold text-emerald-900">{completed}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Recent Appointments Preview List */}
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recent Outpatient Entries</h4>
                {todayAppointments.slice(0, 4).map((app, idx) => (
                  <div key={app._id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{app.patientId?.name || 'Patient'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">UHID: {app.patientId?.uhid || 'N/A'} | Doctor: {app.doctorId?.name || 'Assigned'}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                      app.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      app.status === 'In-Progress' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {app.status || 'Scheduled'}
                    </span>
                  </div>
                ))}
                {todayAppointments.length === 0 && (
                  <div className="p-6 text-center text-slate-400 text-xs font-mono bg-slate-50 border border-dashed rounded-xl">
                    No outpatient tokens generated for today yet.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Hospital Roster & Staff Overview */}
            <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5 shadow-card-soft space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-[#2F63F2]" />
                    On-Duty Doctors & Clinical Roster
                  </h3>
                  <p className="text-[11px] text-[#6B7280]">Registered clinicians and workforce staff</p>
                </div>
                <Button onClick={() => setActiveTab('staff')} variant="outline" className="text-xs py-1 px-2.5 h-[30px]">
                  View All ({staff.length})
                </Button>
              </div>

              {/* Doctors Roster List */}
              <div className="space-y-2">
                {staff
                  .filter(s => ['DOCTOR', 'DOCTOR_ADMIN'].includes(s.roleId?.name))
                  .slice(0, 4)
                  .map((doc, idx) => (
                    <div key={doc._id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-bold flex items-center justify-center">
                          {doc.name ? doc.name.charAt(0) : 'D'}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">{doc.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{doc.doctorProfile?.specialization || 'Consultant Doctor'}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                        Active Doctor
                      </span>
                    </div>
                  ))}

                {staff.filter(s => ['DOCTOR', 'DOCTOR_ADMIN'].includes(s.roleId?.name)).length === 0 && (
                  <div className="p-6 text-center text-slate-400 text-xs font-mono bg-slate-50 border border-dashed rounded-xl">
                    No doctor staff members registered yet.
                  </div>
                )}
              </div>

              {/* Total Registered Patients Banner */}
              <div className="p-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl text-white flex items-center justify-between shadow-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Registered Patient Base</div>
                  <div className="text-xl font-extrabold font-mono mt-0.5">{patients.length} Total Patients</div>
                </div>
                <Button 
                  onClick={() => setActiveTab('patients')} 
                  variant="secondary" 
                  className="text-xs py-1.5 px-3 bg-white text-blue-700 hover:bg-blue-50 border-none font-bold"
                >
                  Manage Registry
                </Button>
              </div>

            </div>

          </div>

          {/* Quick Administrative Shortcuts */}
          <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5 shadow-card-soft space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#2F63F2]" />
                  Quick Management Shortcuts
                </h3>
                <p className="text-[11px] text-[#6B7280]">
                  Fast 1-tap administrative actions & module navigation.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setActiveTab('staff')}
                className="p-3 bg-slate-50 hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 rounded-xl transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform mb-2">
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600">Staff Directory</div>
                <div className="text-[10px] text-slate-500">Manage Roster</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('patients')}
                className="p-3 bg-slate-50 hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform mb-2">
                  <UserRound className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Patient Registry</div>
                <div className="text-[10px] text-slate-500">Medical Records</div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/billing/transactions')}
                className="p-3 bg-slate-50 hover:bg-emerald-50/80 border border-slate-200 hover:border-emerald-300 rounded-xl transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform mb-2">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-600">Billing History</div>
                <div className="text-[10px] text-slate-500">Audit Receipts</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('branches')}
                className="p-3 bg-slate-50 hover:bg-sky-50/80 border border-slate-200 hover:border-sky-300 rounded-xl transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform mb-2">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-800 group-hover:text-sky-600">Departments</div>
                <div className="text-[10px] text-slate-500">Wing Setup</div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/hospital/prescription-print')}
                className="p-3 bg-slate-50 hover:bg-purple-50/80 border border-slate-200 hover:border-purple-300 rounded-xl transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform mb-2">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-800 group-hover:text-purple-600">Print Setup</div>
                <div className="text-[10px] text-slate-500">Rx Header</div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/display-board')}
                className="p-3 bg-slate-50 hover:bg-rose-50/80 border border-slate-200 hover:border-rose-300 rounded-xl transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform mb-2">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-800 group-hover:text-rose-600">Live TV Display</div>
                <div className="text-[10px] text-slate-500">Token Screen</div>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* --------------------------------------------------------
          2. BRANCHES & DEPARTMENTS WORKSPACE
          -------------------------------------------------------- */}
      {activeTab === 'branches' && (
        <div className="space-y-4 text-left">
          {branchSubTab === 'branches' && !isMultiBranchEnabled && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px]">Single Facility Mode</span>
                <span className="text-slate-300">|</span>
                <span>Operating from <strong>Main Facility</strong>. Multi-Branch creation is disabled by Super Admin.</span>
              </div>
            </div>
          )}

          {/* Horizontal Sub-Tab Header */}
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
            {isMultiBranchEnabled && (
              <button
                onClick={() => setBranchSubTab('branches')}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 border flex items-center gap-2 ${
                  branchSubTab === 'branches'
                    ? 'bg-[#2F63F2] text-white border-[#2F63F2] shadow-xs'
                    : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-slate-50 hover:text-[#111827]'
                }`}
              >
                <GitBranch className="w-4 h-4" />
                Branches Setup
              </button>
            )}
            <button
              onClick={() => setBranchSubTab('departments')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 border flex items-center gap-2 ${
                branchSubTab === 'departments' || !isMultiBranchEnabled
                  ? 'bg-[#2F63F2] text-white border-[#2F63F2] shadow-xs'
                  : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-slate-50 hover:text-[#111827]'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Medical Departments Setup
            </button>
          </div>

          {/* Sub-tab 1: Branches Table View */}
          {branchSubTab === 'branches' && isMultiBranchEnabled && (
            <Card 
              title="Hospital Branches Setup" 
              subtitle="Manage administrative subdivisions and regional branches"
              action={
                <Button 
                  onClick={() => { setSelectedBranch(null); setIsBranchOpen(true); }} 
                  variant="primary" 
                  icon={Plus}
                >
                  Add Branch Location
                </Button>
              }
            >
              <Table
                inlineActions={true}
                headers={[
                  { key: 'name', label: 'Branch Name', render: (row) => (row.name === 'Main Facility' || !row.name) ? defaultBranchDisplayName : row.name, sortable: true },
                  { key: 'code', label: 'Branch Code', render: (row) => <strong className="text-indigo-600 font-mono">{row.code}</strong> },
                  { key: 'contactNumber', label: 'Contact Phone', render: (row) => <span>{row.contactNumber}</span> },
                  { key: 'address.city', label: 'City', render: (row) => row.address?.city || '—' }
                ]}
                data={filteredBranchesData}
                actions={[
                  { label: 'Edit Info', icon: Edit, variant: 'primary', onClick: (row) => handleEditBranch(row) }
                ]}
                loading={loading}
              />
            </Card>
          )}

          {/* Sub-tab 2: Departments Table View */}
          {(branchSubTab === 'departments' || !isMultiBranchEnabled) && (
            <Card 
              title="Medical Departments Setup" 
              subtitle="Configure department wings and base consultation charges"
              action={
                <Button 
                  onClick={() => { setSelectedDept(null); setIsDeptOpen(true); }} 
                  variant="primary" 
                  icon={Plus}
                >
                  Create Department Module
                </Button>
              }
            >
              <Table
                inlineActions={true}
                headers={[
                  { key: 'name', label: 'Department Name', sortable: true },
                  { key: 'code', label: 'Dept Code', render: (row) => <span className="font-mono text-purple-600 font-bold">{row.code}</span> }
                ]}
                data={filteredDeptsData}
                actions={[
                  { label: 'Edit Dept', icon: Edit, variant: 'primary', onClick: (row) => handleEditDept(row) }
                ]}
                loading={loading}
              />
            </Card>
          )}
        </div>
      )}

      {/* --------------------------------------------------------
          4. SERVICES REGISTRY VIEW
          -------------------------------------------------------- */}
      {activeTab === 'services' && (
        <Card 
          title="Healthcare Services & Pricing Registry" 
          subtitle="Configure charges for ECG, Lab tests, Ward check-ins, or diagnostic procedures"
          action={
            <Button 
              onClick={() => { setSelectedService(null); setIsServiceOpen(true); }} 
              variant="primary" 
              icon={Plus}
            >
              Add Service Item
            </Button>
          }
        >
          <Table
            headers={[
              { key: 'name', label: 'Service Name', sortable: true },
              { key: 'code', label: 'Service Code', render: (row) => <strong className="text-blue-600 font-mono">{row.code}</strong> },
              { key: 'price', label: 'Standard Price', render: (row) => <span className="font-mono font-bold">₹{row.price}</span> },
              { key: 'description', label: 'Description' },
              { key: 'status', label: 'Status', isStatus: true }
            ]}
            data={services}
            actions={[
              { label: 'Edit', icon: Edit, onClick: (row) => handleEditService(row) },
              { label: 'Delete', icon: Trash2, onClick: (row) => handleDeleteService(row) }
            ]}
            loading={loading}
          />
        </Card>
      )}

      {/* --------------------------------------------------------
          5. CONSULTATION FEES VIEW
          -------------------------------------------------------- */}
      {activeTab === 'consultation-fees' && (
        <Card title="Consultation Fee Structures" subtitle="Catalog of general OPD department consultation price tiers">
          <div className="overflow-hidden border border-slate-200 rounded-2xl shadow-xs bg-white text-left">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">OPD Department Name</th>
                  <th className="p-4">Department Code</th>
                  <th className="p-4">Current Consultation Fee</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {departments.map((dept) => (
                  <tr key={dept._id} className="hover:bg-slate-50">
                    <td className="p-4 text-slate-700 font-semibold font-sans">{dept.name}</td>
                    <td className="p-4 text-slate-500">{dept.code}</td>
                    <td className="p-4 text-[#2F63F2] font-bold">₹{dept.consultationFee || 200}</td>
                    <td className="p-4">
                      <Button onClick={() => handleEditDept(dept)} variant="secondary" className="!py-1 px-3">Adjust Fee</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* --------------------------------------------------------
          STAFF MANAGEMENT VIEW (/admin/workforce)
          -------------------------------------------------------- */}
      {activeTab === 'workforce' && (
        <Card 
          title="Staff Management" 
          subtitle="Manage workforce accounts, role clearance, department wings, and clinical configurations across all hospital staff."
          action={
            <Button 
              onClick={handleOpenAddStaff} 
              variant="primary" 
              icon={Plus} 
            >
              Add Staff Member
            </Button>
          }
        >
          {/* Horizontal Role Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 border-b border-[#E5E7EB] no-scrollbar">
            {[
              { id: 'ALL', label: 'All Staff' },
              { id: 'DOCTOR', label: 'Doctors' },
              { id: 'RECEPTIONIST', label: 'Receptionists' },
              { id: 'PHARMACIST', label: 'Pharmacists' },
              { id: 'NURSE', label: 'Nurses' },
              { id: 'LABORATORY', label: 'Lab Techs' },
              { id: 'BILLING', label: 'Billing Cashiers' },
              { id: 'DOCTOR_ADMIN', label: 'Admins' }
            ].map(tabItem => (
              <button
                key={tabItem.id}
                onClick={() => setWorkforceRoleTab(tabItem.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 border ${
                  workforceRoleTab === tabItem.id
                    ? 'bg-[#2F63F2] text-white border-[#2F63F2] shadow-xs'
                    : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-slate-50 hover:text-[#111827]'
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-xs mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <input
                type="text"
                placeholder="Search by employee name, code, or mobile..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="enterprise-input w-full py-2 text-xs !pl-10"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <div className="min-w-[140px]">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="enterprise-input w-full py-2 text-xs">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {branches.length > 0 && (
              <div className="min-w-[140px]">
                <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="enterprise-input w-full py-2 text-xs">
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <Button onClick={handleClearFilters} variant="secondary" className="py-2 px-4 !text-[11px]">Clear Filters</Button>
          </div>

          <Table
            headers={[
              { key: 'employeeCode', label: 'Employee Code', render: (row) => <span className="font-mono font-bold text-[#2F63F2]">{row.employeeCode}</span>, sortable: true },
              { key: 'name', label: 'Member Name', sortable: true },
              { key: 'roleId.name', label: 'Role / Designation', render: (row) => (
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                  ['DOCTOR', 'DOCTOR_ADMIN'].includes(row.roleId?.name) ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                  row.roleId?.name === 'RECEPTIONIST' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  row.roleId?.name === 'PHARMACIST' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  row.roleId?.name === 'NURSE' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                  row.roleId?.name === 'LABORATORY' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                  'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {row.roleId?.name?.replace('_', ' ')}
                </span>
              )},
              { key: 'branchId.name', label: 'Branch / Dept', render: (row) => `${row.branchId?.name || 'Main'} ${row.departmentId?.name ? `/ ${row.departmentId.name}` : ''}` },
              { key: 'mobileNumber', label: 'Contact Phone', render: (row) => <span>{row.countryCode || '+91'} {row.mobileNumber}</span> },
              { key: 'status', label: 'Status', isStatus: true }
            ]}
            data={filteredStaffData.filter(s => {
              if (s.roleId?.name === 'SUPER_ADMIN') return false;
              if (workforceRoleTab !== 'ALL' && s.roleId?.name !== workforceRoleTab) return false;
              return true;
            })}
            actions={[
              { label: 'View Details', icon: Eye, isPrimary: true, variant: 'view', onClick: (row) => handleViewStaff(row) },
              { label: 'Edit Roster Info', icon: Edit, onClick: (row) => handleEditStaff(row) },
              { label: 'Reset Security PIN', icon: Key, onClick: (row) => { setSelectedStaff(row); setIsResetPinOpen(true); } },
              { 
                label: (row) => row.status === 'active' ? 'Deactivate' : 'Activate', 
                icon: (row) => row.status === 'active' ? ShieldAlert : ShieldCheck, 
                onClick: (row) => handleToggleStaffStatus(row) 
              }
            ]}
            loading={loading}
          />
        </Card>
      )}

      {/* --------------------------------------------------------
          6B. PATIENTS REGISTRY VIEW (/admin/patients)
          -------------------------------------------------------- */}
      {activeTab === 'patients' && (
        <Card 
          title="Patients Registry & Records" 
          subtitle="View registered patient demographics, medical history, or register new OPD patients."
        >
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-xs mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <Input 
                placeholder="Search patient by UHID, Name, Mobile or Aadhaar..." 
                value={patientSearchQuery} 
                onChange={(e) => setPatientSearchQuery(e.target.value)} 
                className="w-full py-2 text-xs !pl-10"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            {patientSearchQuery && (
              <Button onClick={() => setPatientSearchQuery('')} variant="secondary" className="py-2 px-4 !text-[11px]">
                Clear Search
              </Button>
            )}
            <Button 
              onClick={() => setIsRegOpen(true)} 
              variant="primary" 
              icon={Plus}
              className="ml-auto py-2 px-4 !text-[11px]"
            >
              Register New Patient
            </Button>
          </div>

          <Table
            headers={[
              { 
                key: 'uhid', 
                label: 'UHID', 
                render: (row) => <strong className="font-mono font-bold text-[#2F63F2]">{row.uhid}</strong>,
                sortable: true
              },
              { key: 'name', label: 'Patient Name', sortable: true },
              { key: 'mobileNumber', label: 'Mobile Number', render: (row) => <span>{row.countryCode || '+91'} {row.mobileNumber}</span> },
              { key: 'age', label: 'Age / Gender', render: (row) => <span>{row.age} Yrs / {row.gender}</span> },
              { key: 'bloodGroup', label: 'Blood Group', render: (row) => <span className="font-mono font-bold text-rose-600">{row.bloodGroup || 'O+'}</span> },
              { key: 'address', label: 'Place / Address', render: (row) => <span>{typeof row.address === 'string' ? row.address : (row.addresses?.[0]?.city || row.addresses?.[0]?.street || 'N/A')}</span> },
              { key: 'createdAt', label: 'Registration Date', render: (row) => <span className="font-mono text-slate-500">{new Date(row.createdAt || Date.now()).toLocaleDateString('en-GB')}</span> }
            ]}
            data={patients.filter(p => {
              if (!patientSearchQuery) return true;
              const q = patientSearchQuery.toLowerCase();
              return (p.name || '').toLowerCase().includes(q) || 
                     (p.uhid || '').toLowerCase().includes(q) || 
                     (p.mobileNumber || '').includes(q) ||
                     (p.aadhaarNumber || '').includes(q);
            })}
            actions={[
              { 
                label: 'Book OPD Token', 
                icon: Ticket, 
                isPrimary: true, 
                onClick: (row) => { 
                  setSelectedPatientForBooking(row);
                  setIsBookOpen(true); 
                } 
              },
              { 
                label: 'Medical History', 
                icon: FileText, 
                onClick: (row) => navigate(`/clinical/medical-history?patientId=${row._id}`) 
              }
            ]}
            loading={loading}
          />
        </Card>
      )}

      {/* --------------------------------------------------------
          7. STAFF WORKFORCE DIRECTORY VIEW
          -------------------------------------------------------- */}
      {activeTab === 'staff' && (
        <Card 
          title="Staff Workforce Directory" 
          subtitle="Roster and login setups for Receptionists, Nurses, Pharmacy, Lab technicians, and Billing cashiers"
        >
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-xs mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <input
                type="text"
                placeholder="Search staff by name or code..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="enterprise-input w-full py-2 text-xs !pl-10"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <div className="min-w-[140px]">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="enterprise-input w-full py-2 text-xs">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <Button onClick={handleClearFilters} variant="secondary" className="py-2 px-4 !text-[11px]">Clear Filters</Button>
            <Button 
              onClick={handleOpenAddStaff} 
              variant="primary" 
              icon={Plus} 
              className="ml-auto py-2 px-4 !text-[11px]"
            >
              Register Hospital Staff
            </Button>
          </div>

          <Table
            headers={[
              { key: 'employeeCode', label: 'Employee Code', render: (row) => <span className="font-mono font-bold text-[#2F63F2]">{row.employeeCode}</span>, sortable: true },
              { key: 'name', label: 'Employee Name', sortable: true },
              { key: 'roleId.name', label: 'Designation', render: (row) => row.roleId?.name?.replace('_', ' ') },
              { key: 'branchId.name', label: 'Branch', render: (row) => (row.branchId?.name === 'Main Facility' || !row.branchId?.name || row.branchId?.name === 'Main') ? defaultBranchDisplayName : row.branchId.name },
              { key: 'mobileNumber', label: 'Mobile Phone', render: (row) => <span>{row.countryCode || '+91'} {row.mobileNumber}</span> },
              { key: 'status', label: 'Status', isStatus: true }
            ]}
            data={filteredStaffData.filter(s => s.roleId?.name !== 'SUPER_ADMIN')}
            actions={[
              { label: 'View details', icon: Eye, onClick: (row) => handleViewStaff(row) },
              { label: 'Edit Info', icon: Edit, onClick: (row) => handleEditStaff(row) },
              { label: 'Reset PIN', icon: Key, onClick: (row) => { setSelectedStaff(row); setIsResetPinOpen(true); } },
              { 
                label: (row) => row.status === 'active' ? 'Deactivate' : 'Activate', 
                icon: (row) => row.status === 'active' ? ShieldAlert : ShieldCheck, 
                onClick: (row) => handleToggleUserStatus(row) 
              },
              { label: 'Delete Staff Account', icon: Trash2, onClick: (row) => handleDeleteStaff(row) }
            ]}
            loading={loading}
          />
        </Card>
      )}

      {/* --------------------------------------------------------
          7b. STAFF & USER MANAGEMENT VIEW (/admin/users)
          -------------------------------------------------------- */}
      {activeTab === 'users' && (
        <Card 
          title="Staff & User Management" 
          subtitle="Complete roster of all hospital users — Doctors, Receptionists, Pharmacists, Nurses, Lab technicians, and Billing staff"
        >
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-xs mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <input
                type="text"
                placeholder="Search users by name, code or mobile..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="enterprise-input w-full py-2 text-xs !pl-10"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <div className="min-w-[140px]">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="enterprise-input w-full py-2 text-xs">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="min-w-[140px]">
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="enterprise-input w-full py-2 text-xs">
                <option value="">All Branches</option>
                {branches.map(br => (
                  <option key={br._id} value={br._id}>{br.name === 'Main Facility' ? defaultBranchDisplayName : br.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleClearFilters} variant="secondary" className="py-2 px-4 !text-[11px]">Clear Filters</Button>
            <Button 
              onClick={handleOpenAddStaff} 
              variant="primary" 
              icon={Plus} 
              className="ml-auto py-2 px-4 !text-[11px]"
            >
              Add Staff
            </Button>
          </div>

          <Table
            headers={[
              { key: 'employeeCode', label: 'Employee Code', render: (row) => <span className="font-mono font-bold text-[#2F63F2]">{row.employeeCode}</span>, sortable: true },
              { key: 'name', label: 'Full Name', sortable: true },
              { key: 'roleId.name', label: 'Role / Designation', render: (row) => row.roleId?.name?.replace('_', ' ') || 'N/A' },
              { key: 'branchId.name', label: 'Branch', render: (row) => (row.branchId?.name === 'Main Facility' || !row.branchId?.name || row.branchId?.name === 'Main') ? defaultBranchDisplayName : row.branchId.name },
              { key: 'departmentId.name', label: 'Department', render: (row) => row.departmentId?.name || '—' },
              { key: 'mobileNumber', label: 'Mobile', render: (row) => <span>{row.countryCode || '+91'} {row.mobileNumber}</span> },
              { key: 'status', label: 'Status', isStatus: true }
            ]}
            data={filteredStaffData.filter(s => s.roleId?.name !== 'SUPER_ADMIN')}
            actions={[
              { label: 'View details', icon: Eye, onClick: (row) => handleViewStaff(row) },
              { label: 'Edit Info', icon: Edit, onClick: (row) => handleEditStaff(row) },
              { label: 'Reset PIN', icon: Key, onClick: (row) => { setSelectedStaff(row); setIsResetPinOpen(true); } },
              { 
                label: (row) => row.status === 'active' ? 'Deactivate' : 'Activate', 
                icon: (row) => row.status === 'active' ? ShieldAlert : ShieldCheck, 
                onClick: (row) => handleToggleUserStatus(row) 
              },
              { label: 'Delete User', icon: Trash2, onClick: (row) => handleDeleteStaff(row) }
            ]}
            loading={loading}
          />
        </Card>
      )}

      {/* --------------------------------------------------------
          8. REPORTS WORKSPACE
          -------------------------------------------------------- */}
      {activeTab === 'reports' && (
        <div className="space-y-6 text-left">
          <div className="pb-3 border-b border-slate-200 text-left">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileBarChart2 className="w-5 h-5 text-[#2F63F2]" />
              Hospital Performance Reports & Analytics
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Overview of monthly revenue channels, doctor consultancy counts, department performance, and operational trends.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <Card title="Today's Performance Metrics">
              {(() => {
                const totalRegs = todayAppointments.length;
                const dispensedCount = todayAppointments.filter(a => (a.prescriptions && a.prescriptions.length > 0) || a.pharmacyStatus === 'SENT' || a.pharmacyStatus === 'DISPENSING' || a.status === 'Sent to Pharmacy' || a.status === 'Completed').length;
                const paidApps = todayAppointments.filter(a => {
                  const st = a.billingStatus || a.paymentStatus || a.workflow?.paymentState;
                  return st === 'Paid' || st === 'PAID';
                });
                const totalRevenue = paidApps.reduce((sum, a) => sum + (parseFloat(a.consultationFee) || 0), 0);

                return (
                  <div className="space-y-3 font-sans text-xs">
                    <div className="flex justify-between py-2 border-b">
                      <span className="font-semibold text-slate-500">OPD Registrations</span>
                      <span className="font-mono font-bold text-slate-850">{totalRegs} Patient{totalRegs === 1 ? '' : 's'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="font-semibold text-slate-500">Dispensed Prescriptions</span>
                      <span className="font-mono font-bold text-slate-850">{dispensedCount} Form{dispensedCount === 1 ? '' : 's'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="font-semibold text-slate-500">Invoiced Revenue</span>
                      <span className="font-mono font-bold text-emerald-600">₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                );
              })()}
            </Card>

            <Card title="Top Performing Departments">
              <div className="space-y-3 font-sans text-xs">
                {departments.map(d => (
                  <div key={d._id} className="flex justify-between py-2 border-b">
                    <span className="font-semibold text-slate-700">{d.name} ({d.code})</span>
                    <span className="font-mono font-bold text-indigo-600">₹{d.consultationFee || 200} base fee</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Doctor Consultations Summary">
              <div className="space-y-3 font-sans text-xs">
                {staff.filter(s => ['DOCTOR', 'DOCTOR_ADMIN'].includes(s.roleId?.name)).map(doc => (
                  <div key={doc._id} className="flex justify-between py-2 border-b">
                    <span className="font-semibold text-slate-700">{doc.name}</span>
                    <span className="font-mono font-bold text-[#2F63F2]">₹{doc.doctorProfile?.consultationFee || 300} / consult</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------
          9. SETTINGS PANELS
          -------------------------------------------------------- */}
      {activeTab === 'hospital-profile' && (
        <Card title="Hospital Enterprise Profile Settings" subtitle="Configure logo URL, registration markers, invoices preferences and tax rules">
          <form onSubmit={handleSaveHospitalProfile} className="space-y-6 text-left">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b pb-2">Hospital Credentials</h3>
                <Input label="Hospital Name" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="GST Identification Number" placeholder="07AAAAA0000A1Z" value={profileForm.gstNumber} onChange={(e) => setProfileForm({ ...profileForm, gstNumber: e.target.value })} />
                  <Input label="Medical Registration Number" placeholder="REG-102938" value={profileForm.registrationNumber} onChange={(e) => setProfileForm({ ...profileForm, registrationNumber: e.target.value })} />
                </div>
                <Input label="Branding Logo URL" placeholder="https://image-host.com/logo.png" value={profileForm.logo} onChange={(e) => setProfileForm({ ...profileForm, logo: e.target.value })} />
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b pb-2">Facility Contact Info</h3>
                <div className="grid grid-cols-2 gap-4">
                  <MobileNumber 
                    label="Contact Phone" 
                    countryValue={profileForm.contactCountryCode} 
                    onCountryChange={(cc) => setProfileForm({ ...profileForm, contactCountryCode: cc })}
                    numberValue={profileForm.contactNumber} 
                    onNumberChange={(num) => setProfileForm({ ...profileForm, contactNumber: num })}
                    required
                    error={profileMobileVal.error}
                  />
                  <Input label="Email address" type="email" placeholder="contact@hospital.com" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} required />
                </div>
                <Input label="Website Domain URL" placeholder="www.hospital.com" value={profileForm.website} onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })} />
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider pl-1">Address Coordinates</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Street" placeholder="12 Main St" value={profileForm.street} onChange={(e) => setProfileForm({ ...profileForm, street: e.target.value })} required />
                <Input label="City" placeholder="Noida" value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} required />
                <Input label="State" placeholder="Uttar Pradesh" value={profileForm.state} onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })} required />
                <Input label="ZIP Code" placeholder="201301" value={profileForm.zip} onChange={(e) => setProfileForm({ ...profileForm, zip: e.target.value })} required />
              </div>
            </div>

            <Button type="submit" variant="primary" className="py-2.5 px-6 font-semibold" disabled={!profileMobileVal.isValid}>
              Save Profile Coordinates
            </Button>
          </form>
        </Card>
      )}

      {activeTab === 'working-hours' && (
        <Card title="Hospital Configuration" subtitle="Configure invoice formats and facility parameters">
          <div className="space-y-6 text-left">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 border p-6 rounded-2xl bg-white shadow-xs">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b pb-2">Invoices Prefix & Formats</h3>
                <Input label="Invoice Prefix" value={billingSettings.invoicePrefix} onChange={(e) => setBillingSettings({ ...billingSettings, invoicePrefix: e.target.value })} />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Default Receipt Format</label>
                  <select className="enterprise-input" value={billingSettings.receiptFormat} onChange={(e) => setBillingSettings({ ...billingSettings, receiptFormat: e.target.value })}>
                    <option value="Thermal">Thermal Receipt (58mm)</option>
                    <option value="A4">A4 Invoice Sheets</option>
                  </select>
                </div>
                <Button onClick={() => toast.success('Billing formats updated')} variant="primary" className="w-full">
                  Save Formats
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* --------------------------------------------------------
          10. DRAWERS & MODALS
          -------------------------------------------------------- */}

      {/* Add Branch Modal */}
      <Modal isOpen={isBranchOpen} onClose={() => { setIsBranchOpen(false); setBranchErrors({}); }} title={selectedBranch ? "Modify Branch Location" : "Register Branch Location"}>
        <form onSubmit={handleSaveBranch} className="space-y-4 text-left">
          <Input 
            label="Branch Name" 
            placeholder="e.g. Noida Sector 62 Branch" 
            value={branchForm.name} 
            onChange={(e) => {
              setBranchForm({ ...branchForm, name: e.target.value });
              if (branchErrors.name) setBranchErrors(prev => ({ ...prev, name: undefined }));
            }} 
            required 
            error={branchErrors.name}
          />
          <Input 
            label="Contact Mobile" 
            placeholder="9876543210" 
            value={branchForm.contactNumber}
            onChange={(e) => {
              let inputVal = e.target.value.replace(/[^0-9]/g, '');
              if (inputVal.length > 10) inputVal = inputVal.slice(0, 10);
              setBranchForm({ ...branchForm, contactNumber: inputVal });
              if (branchErrors.contactNumber) setBranchErrors(prev => ({ ...prev, contactNumber: undefined }));
            }}
            required 
            error={branchErrors.contactNumber}
          />
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Address Details</h4>
            <div className="grid grid-cols-2 gap-2">
              <input className="enterprise-input py-2 text-xs" placeholder="Street" value={branchForm.street} onChange={(e) => setBranchForm({ ...branchForm, street: e.target.value })} />
              <input className="enterprise-input py-2 text-xs" placeholder="City" value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} />
              <input className="enterprise-input py-2 text-xs" placeholder="State" value={branchForm.state} onChange={(e) => setBranchForm({ ...branchForm, state: e.target.value })} />
              <input className="enterprise-input py-2 text-xs" placeholder="ZIP Code" value={branchForm.zip} onChange={(e) => setBranchForm({ ...branchForm, zip: e.target.value })} />
            </div>
          </div>
          <Button type="submit" variant="primary" className="w-full">
            {selectedBranch ? "Save Changes" : "Register Branch"}
          </Button>
        </form>
      </Modal>

      {/* Add Department Modal */}
      <Modal isOpen={isDeptOpen} onClose={() => setIsDeptOpen(false)} title={selectedDept ? "Modify Department" : "Create Department Module"}>
        <form onSubmit={handleSaveDept} className="space-y-4 text-left">
          <Input label="Department Name" placeholder="e.g. Cardiology" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required />
          <Input label="Short Code" placeholder="e.g. CARD" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} required />
          <Input label="Description" placeholder="Optional notes" value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} />
          <Button type="submit" variant="primary" className="w-full">
            {selectedDept ? "Save Changes" : "Create Department"}
          </Button>
        </form>
      </Modal>

      {/* Add Service Modal */}
      <Modal isOpen={isServiceOpen} onClose={() => setIsServiceOpen(false)} title={selectedService ? "Modify Service Item" : "Add Service Item"}>
        <form onSubmit={handleSaveService} className="space-y-4 text-left">
          <Input label="Service Name" placeholder="e.g. Pathological blood analysis" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} required />
          <Input label="Service Code" placeholder="e.g. LAB" value={serviceForm.code} onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })} required />
          <Input label="Standard Price (INR)" type="number" placeholder="150" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 150 })} required />
          <Input label="Description" placeholder="Optional notes" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
          <Button type="submit" variant="primary" className="w-full">
            {selectedService ? "Save Changes" : "Add Service"}
          </Button>
        </form>
      </Modal>

      {/* Register / Edit / View Staff Modal */}
      <Modal isOpen={isStaffOpen} onClose={() => setIsStaffOpen(false)} title={isStaffViewOnly ? "View Staff Employee Details" : selectedStaff ? "Modify Staff Employee Details" : "Register Hospital Employee"} size="lg">
        <form onSubmit={handleSaveStaff} className="space-y-4 text-left">
          <Input 
            label="Employee Full Name" 
            placeholder="Dr. Rajesh Patel" 
            value={staffForm.name} 
            onChange={(e) => {
              setStaffForm({ ...staffForm, name: e.target.value });
              if (staffErrors.name) setStaffErrors(prev => ({ ...prev, name: undefined }));
            }} 
            required 
            disabled={isStaffViewOnly}
            error={staffErrors.name} 
          />
          <div className="grid grid-cols-2 gap-4">
            <MobileNumber 
              label="Mobile Number" 
              placeholder="10 digit number" 
              countryValue={staffForm.countryCode || '+91'}
              onCountryChange={(cc) => setStaffForm({ ...staffForm, countryCode: cc })}
              numberValue={staffForm.mobileNumber}
              onNumberChange={(num) => {
                setStaffForm({ ...staffForm, mobileNumber: num });
                if (staffErrors.mobileNumber) setStaffErrors(prev => ({ ...prev, mobileNumber: undefined }));
              }}
              required
              disabled={isStaffViewOnly}
              error={staffErrors.mobileNumber || staffMobileVal.error}
            />
            {!selectedStaff && (
              <PinInput 
                length={6}
                label="Security PIN (6 digits)" 
                value={staffForm.pin} 
                onChange={(val) => {
                  setStaffForm({ ...staffForm, pin: val });
                  if (staffErrors.pin) setStaffErrors(prev => ({ ...prev, pin: undefined }));
                }} 
                error={staffErrors.pin}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Role <span className="text-[#EF4444]">*</span></label>
              <select 
                className={`enterprise-input ${staffErrors.roleId ? 'border-[#EF4444] focus:ring-[#EF4444]/10 focus:border-[#EF4444]' : ''}`}
                value={staffForm.roleId} 
                onChange={(e) => {
                  setStaffForm({ ...staffForm, roleId: e.target.value });
                  if (staffErrors.roleId) setStaffErrors(prev => ({ ...prev, roleId: undefined }));
                }} 
                required 
                disabled={isStaffViewOnly}
              >
                <option value="">Select Role</option>
                {roles.filter(r => r.name !== 'SUPER_ADMIN').map(r => (
                  <option key={r._id} value={r._id}>{r.name?.replace('_', ' ')}</option>
                ))}
              </select>
              {staffErrors.roleId && <span className="text-xs text-[#EF4444] pl-1 mt-0.5">{staffErrors.roleId}</span>}
            </div>
            
            {isMultiBranchEnabled ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Branch Location <span className="text-[#EF4444]">*</span></label>
                  {!isStaffViewOnly && (
                    <button
                      type="button"
                      onClick={handleOpenQuickAddBranch}
                      className="p-1 bg-blue-50 hover:bg-blue-100 text-[#2F63F2] rounded-md flex items-center justify-center transition-colors cursor-pointer"
                      title="Add Branch"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <select 
                  className={`enterprise-input ${staffErrors.branchId ? 'border-[#EF4444] focus:ring-[#EF4444]/10 focus:border-[#EF4444]' : ''}`}
                  value={staffForm.branchId} 
                  onChange={(e) => {
                    setStaffForm({ ...staffForm, branchId: e.target.value });
                    if (staffErrors.branchId) setStaffErrors(prev => ({ ...prev, branchId: undefined }));
                  }} 
                  required 
                  disabled={isStaffViewOnly}
                >
                  <option value="">Select Branch</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
                {staffErrors.branchId && <span className="text-xs text-[#EF4444] pl-1 mt-0.5">{staffErrors.branchId}</span>}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Branch Location</label>
                <input type="text" className="enterprise-input bg-slate-50 text-slate-700 font-semibold" value={defaultBranchDisplayName} disabled />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Department</label>
                {!isStaffViewOnly && (
                  <button
                    type="button"
                    onClick={handleOpenQuickAddDept}
                    className="p-1 bg-blue-50 hover:bg-blue-100 text-[#2F63F2] rounded-md flex items-center justify-center transition-colors cursor-pointer"
                    title="Add Department"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select className="enterprise-input" value={staffForm.departmentId} onChange={(e) => setStaffForm({ ...staffForm, departmentId: e.target.value })} disabled={isStaffViewOnly}>
                <option value="">Select Department (Optional)</option>
                {departments.map(d => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic Role-Specific Fields */}
          {(() => {
            const selectedRoleObj = roles.find(r => r._id === staffForm.roleId);
            const roleName = selectedRoleObj?.name;

            if (['DOCTOR', 'DOCTOR_ADMIN'].includes(roleName)) {
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#2F63F2] flex items-center gap-2">
                    <Stethoscope className="w-4 h-4" /> Doctor Clinical Profile Setup
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Specialization" placeholder="e.g. Cardiologist" value={staffForm.specialization} onChange={(e) => setStaffForm({ ...staffForm, specialization: e.target.value })} disabled={isStaffViewOnly} />
                    <Input label="Qualification" placeholder="e.g. MBBS, MD" value={staffForm.qualification} onChange={(e) => setStaffForm({ ...staffForm, qualification: e.target.value.toUpperCase() })} disabled={isStaffViewOnly} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Experience (Years)" type="number" value={staffForm.experience} onChange={(e) => setStaffForm({ ...staffForm, experience: e.target.value })} disabled={isStaffViewOnly} />
                    <Input label="Consultation Fee (INR)" type="number" value={staffForm.consultationFee} onChange={(e) => setStaffForm({ ...staffForm, consultationFee: e.target.value })} disabled={isStaffViewOnly} />
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <Input label="Emergency Fee (INR)" type="number" value={staffForm.emergencyFee} onChange={(e) => setStaffForm({ ...staffForm, emergencyFee: e.target.value })} disabled={isStaffViewOnly} />
                  </div>
                </div>
              );
            }

            if (roleName === 'NURSE') {
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-teal-600 flex items-center gap-2">
                    <UserRound className="w-4 h-4" /> Nursing Staff Configuration
                  </h4>
                  <Input label="Qualification / Cert" placeholder="e.g. B.Sc Nursing, GNM" value={staffForm.nurseQualification} onChange={(e) => setStaffForm({ ...staffForm, nurseQualification: e.target.value })} disabled={isStaffViewOnly} />
                  <Input label="Assigned Ward / Station" placeholder="e.g. ICU Wing 3, OPD Ward" value={staffForm.nurseAssignedWard} onChange={(e) => setStaffForm({ ...staffForm, nurseAssignedWard: e.target.value })} disabled={isStaffViewOnly} />
                </div>
              );
            }

            if (roleName === 'PHARMACIST') {
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-2">
                    <Pill className="w-4 h-4" /> Pharmacy Department Profile
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Pharmacy License Reg No" placeholder="e.g. PH-987654" value={staffForm.pharmacistLicenseNumber} onChange={(e) => setStaffForm({ ...staffForm, pharmacistLicenseNumber: e.target.value })} disabled={isStaffViewOnly} />
                    <Input label="Dispensing Counter No" placeholder="e.g. Counter 1" value={staffForm.pharmacistCounterNumber} onChange={(e) => setStaffForm({ ...staffForm, pharmacistCounterNumber: e.target.value })} disabled={isStaffViewOnly} />
                  </div>
                </div>
              );
            }

            if (roleName === 'LABORATORY') {
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600 flex items-center gap-2">
                    <Database className="w-4 h-4" /> Laboratory Technician Profile
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Lab Specialization" placeholder="e.g. Pathology, Microbiology" value={staffForm.labTechSpecialization} onChange={(e) => setStaffForm({ ...staffForm, labTechSpecialization: e.target.value })} disabled={isStaffViewOnly} />
                    <Input label="Technician License No" placeholder="e.g. LT-45678" value={staffForm.labTechLicenseNumber} onChange={(e) => setStaffForm({ ...staffForm, labTechLicenseNumber: e.target.value })} disabled={isStaffViewOnly} />
                  </div>
                </div>
              );
            }

            if (roleName === 'BILLING') {
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Billing Cashier Profile
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Cash Counter / Till ID" placeholder="e.g. Till-A1" value={staffForm.billingCounterNumber} onChange={(e) => setStaffForm({ ...staffForm, billingCounterNumber: e.target.value })} disabled={isStaffViewOnly} />
                    <Input label="Max Allowed Discount (%)" type="number" placeholder="10" value={staffForm.billingMaxDiscountPercent} onChange={(e) => setStaffForm({ ...staffForm, billingMaxDiscountPercent: e.target.value })} disabled={isStaffViewOnly} />
                  </div>
                </div>
              );
            }

            if (roleName === 'RECEPTIONIST') {
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Receptionist Desk Profile
                  </h4>
                  <Input label="Reception Desk ID" placeholder="e.g. Desk-02" value={staffForm.receptionistDeskNumber} onChange={(e) => setStaffForm({ ...staffForm, receptionistDeskNumber: e.target.value })} disabled={isStaffViewOnly} />
                </div>
              );
            }

            return null;
          })()}

          {!isStaffViewOnly && (
            <Button type="submit" variant="primary" className="w-full mt-4" disabled={!staffMobileVal.isValid}>
              {selectedStaff ? "Save Workforce Changes" : "Register Facility Account"}
            </Button>
          )}
        </form>
      </Modal>

      {/* Reset Security PIN Modal */}
      <Modal isOpen={isResetPinOpen} onClose={() => setIsResetPinOpen(false)} title={`Reset Security PIN: ${selectedStaff?.name}`}>
        <form onSubmit={handleResetPin} className="space-y-4 text-left">
          <Input label="New 4-Digit Security PIN" placeholder="e.g. 4321" maxLength={4} value={resetPinValue} onChange={(e) => setResetPinValue(e.target.value.replace(/[^0-9]/g, ''))} required />
          <Button type="submit" variant="danger" className="w-full">Reset PIN</Button>
        </form>
      </Modal>

      {/* Configure Doctor Profile Modal */}
      <Modal isOpen={isDoctorProfileOpen} onClose={() => setIsDoctorProfileOpen(false)} title={`Configure Profile: ${selectedDoctor?.name}`}>
        <form onSubmit={handleSaveDoctorProfile} className="space-y-4 text-left">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Professional Specialty" placeholder="e.g. Cardiologist" value={doctorProfileForm.specialization} onChange={(e) => setDoctorProfileForm({ ...doctorProfileForm, specialization: e.target.value })} required />
            <Input label="Academic Qualification" placeholder="e.g. MBBS, MD" value={doctorProfileForm.qualification} onChange={(e) => setDoctorProfileForm({ ...doctorProfileForm, qualification: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Years of Experience" type="number" placeholder="5" value={doctorProfileForm.experience} onChange={(e) => setDoctorProfileForm({ ...doctorProfileForm, experience: parseInt(e.target.value) || 0 })} required />
            <Input label="Consultation Fee (INR)" type="number" placeholder="300" value={doctorProfileForm.consultationFee} onChange={(e) => setDoctorProfileForm({ ...doctorProfileForm, consultationFee: parseFloat(e.target.value) || 300 })} required />
          </div>

          <Button type="submit" variant="primary" className="w-full mt-2">
            Save Consulting Profile Parameters
          </Button>
        </form>
      </Modal>

      {/* QUICK ACTION: Register Patient Modal */}
      <Modal isOpen={isRegOpen} onClose={() => setIsRegOpen(false)} title="Register Patient Intake" size="lg">
        <form onSubmit={handleRegisterSubmit} className="space-y-4 text-left">
          <Input label="Patient Full Name" placeholder="Rajesh Kumar" value={patientForm.name} onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Age (Years)" type="number" placeholder="28" value={patientForm.age} onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })} required />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Gender</label>
              <select className="enterprise-input" value={patientForm.gender} onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })} required>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <MobileNumber
            label="Mobile Number"
            placeholder="15 digit number"
            countryValue={patientForm.countryCode}
            onCountryChange={(cc) => setPatientForm({ ...patientForm, countryCode: cc })}
            numberValue={patientForm.mobileNumber}
            onNumberChange={(num) => setPatientForm({ ...patientForm, mobileNumber: num })}
            required
            error={patientMobileVal.error}
          />
          <Input label="Email address (Optional)" type="email" placeholder="rajesh@gmail.com" value={patientForm.email} onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Blood Group</label>
              <select className="enterprise-input" value={patientForm.bloodGroup} onChange={(e) => setPatientForm({ ...patientForm, bloodGroup: e.target.value })}>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>
            <Input label="Known Allergies" placeholder="Dust, Penicillin" value={patientForm.allergies} onChange={(e) => setPatientForm({ ...patientForm, allergies: e.target.value })} />
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Emergency Contact</h4>
            <div className="grid grid-cols-2 gap-2">
              <input className="enterprise-input py-2 text-xs" placeholder="Contact Name" value={patientForm.contactName} onChange={(e) => setPatientForm({ ...patientForm, contactName: e.target.value })} />
              <input className="enterprise-input py-2 text-xs" placeholder="Contact Phone" value={patientForm.contactPhone} onChange={(e) => setPatientForm({ ...patientForm, contactPhone: e.target.value })} />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Address Details</h4>
            <div className="grid grid-cols-2 gap-2">
              <input className="enterprise-input py-2 text-xs" placeholder="Street" value={patientForm.street} onChange={(e) => setPatientForm({ ...patientForm, street: e.target.value })} />
              <input className="enterprise-input py-2 text-xs" placeholder="City" value={patientForm.city} onChange={(e) => setPatientForm({ ...patientForm, city: e.target.value })} />
              <input className="enterprise-input py-2 text-xs" placeholder="State" value={patientForm.state} onChange={(e) => setPatientForm({ ...patientForm, state: e.target.value })} />
              <input className="enterprise-input py-2 text-xs" placeholder="ZIP Code" value={patientForm.zip} onChange={(e) => setPatientForm({ ...patientForm, zip: e.target.value })} />
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full mt-2 py-3" disabled={!patientMobileVal.isValid} loading={registerPatientMutation.isPending}>
            Submit Registration
          </Button>
        </form>
      </Modal>

      {/* QUICK ACTION: Book Appointment Modal */}
      <Modal isOpen={isBookOpen} onClose={() => setIsBookOpen(false)} title="Schedule Consultation Appointment" size="lg">
        <form onSubmit={handleBookingSubmit} className="space-y-4 text-left">
          {selectedPatientForBooking && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-xs">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Patient Details</div>
                <div className="text-sm font-bold text-slate-800">{selectedPatientForBooking.name}</div>
                <div className="text-xs text-slate-500 font-mono">
                  UHID: <span className="text-[#2F63F2] font-semibold">{selectedPatientForBooking.uhid}</span>
                  {selectedPatientForBooking.mobileNumber && ` • Phone: ${selectedPatientForBooking.countryCode || '+91'} ${selectedPatientForBooking.mobileNumber}`}
                </div>
              </div>
              <span className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                {selectedPatientForBooking.gender || 'N/A'} {selectedPatientForBooking.age ? `/ ${selectedPatientForBooking.age} Yrs` : ''}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Assign Doctor</label>
            <select className="enterprise-input" value={appForm.doctorId} onChange={(e) => setAppForm({ ...appForm, doctorId: e.target.value })} required>
              <option value="">Select Doctor</option>
              {staff.filter(s => ['DOCTOR', 'DOCTOR_ADMIN'].includes(s.roleId?.name)).map(d => (
                <option key={d._id} value={d._id}>{d.name} ({d.doctorProfile?.specialization || 'Consultant'})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DatePicker label="Appointment Date" value={appForm.date} onChange={(date) => setAppForm({ ...appForm, date })} />
            <Input label="Timing Slot" placeholder="e.g. 10:30 AM" value={appForm.time} onChange={(e) => setAppForm({ ...appForm, time: e.target.value })} required />
          </div>

          <Button type="submit" variant="primary" className="w-full mt-2 py-3" loading={bookAppointmentMutation.isPending} disabled={!selectedPatientForBooking}>
            Confirm Booking Slot
          </Button>
        </form>
      </Modal>

      {/* Record Vitals Modal */}
      <Modal isOpen={isVitalsOpen} onClose={() => setIsVitalsOpen(false)} title={`Record Patient Vitals Intake: ${selectedAppointmentForVitals?.patientId?.name}`}>
        <form onSubmit={handleVitalsSubmit} className="space-y-4 text-left">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Weight (kg)" type="number" step="0.1" value={vitalsForm.weight} onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })} />
            <Input label="Height (cm)" type="number" value={vitalsForm.height} onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Blood Pressure Systolic" type="number" value={vitalsForm.bpSystolic} onChange={(e) => setVitalsForm({ ...vitalsForm, bpSystolic: e.target.value })} />
            <Input label="Blood Pressure Diastolic" type="number" value={vitalsForm.bpDiastolic} onChange={(e) => setVitalsForm({ ...vitalsForm, bpDiastolic: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Pulse (bpm)" type="number" value={vitalsForm.pulse} onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })} />
            <Input label="Temp (°F)" type="number" step="0.1" value={vitalsForm.temperature} onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })} />
            <Input label="SPO2 (%)" type="number" value={vitalsForm.spo2} onChange={(e) => setVitalsForm({ ...vitalsForm, spo2: e.target.value })} />
          </div>
          <Button type="submit" variant="primary" className="w-full mt-2" loading={enterVitalsMutation.isPending}>
            Record Vitals
          </Button>
        </form>
      </Modal>

      {/* Billing Checkout Modal */}
      <Modal isOpen={isFinanceBillOpen} onClose={() => setIsFinanceBillOpen(false)} title={`Generate OPD Consultation Bill: ${selectedAppointmentForBilling?.patientId?.name}`}>
        <form onSubmit={handleBillingSubmit} className="space-y-4 text-left">
          <div className="p-4 bg-slate-50 border rounded-2xl text-xs font-mono space-y-2">
            <div className="flex justify-between">
              <span>OPD Consultation Fee:</span>
              <span className="font-bold">₹{selectedAppointmentForBilling?.doctorId?.doctorProfile?.consultationFee || 200}.00</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Standard Tax ({billingSettings.gstPercent}%):</span>
              <span>₹{((selectedAppointmentForBilling?.doctorId?.doctorProfile?.consultationFee || 200) * billingSettings.gstPercent / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-dashed pt-2 font-bold text-slate-800 text-sm">
              <span>Grand Total:</span>
              <span className="text-[#2F63F2]">₹{((selectedAppointmentForBilling?.doctorId?.doctorProfile?.consultationFee || 200) * (1 + billingSettings.gstPercent / 100) - (parseFloat(billingForm.discount) || 0)).toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Discount (INR)" type="number" placeholder="0" value={billingForm.discount} onChange={(e) => setBillingForm({ ...billingForm, discount: e.target.value })} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Payment Mode</label>
              <select className="enterprise-input" value={billingForm.paymentMode} onChange={(e) => setBillingForm({ ...billingForm, paymentMode: e.target.value })}>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
              </select>
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full mt-2 py-2.5" loading={createInvoiceMutation.isPending}>
            Process Billing & Generate Invoice
          </Button>
        </form>
      </Modal>
    </div>
  );
};

export default AdminDashboard;
