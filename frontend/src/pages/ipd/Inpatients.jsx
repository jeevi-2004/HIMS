import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  UserPlus,
  ChevronDown,
  ArrowRight,
  Check,
  RefreshCw,
  AlertCircle,
  FileText,
  Bed,
  Calendar,
  User,
  HeartPulse,
  Printer,
  UserCheck,
  Stethoscope,
  Phone,
  ShieldAlert,
  Sparkles,
  ClipboardList,
  LogOut,
  Clock,
  CreditCard,
  ArrowLeft,
  Eye,
  MoreVertical
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../../components/Modal';
import Autocomplete from '../../components/Autocomplete';
import Input from '../../components/Input';
import workflowRealtimeService from '../../services/workflowRealtimeService';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import IPDDischargeWorkspaceModal from '../../components/ipd/IPDDischargeWorkspaceModal';
import IPDDoctorDischargeSummaryModal from '../../components/ipd/IPDDoctorDischargeSummaryModal';
import IPDDailyConsultationModal from '../../components/ipd/IPDDailyConsultationModal';
import InpatientDetailsModal from '../../components/ipd/InpatientDetailsModal';
import PatientHistoryDrawer from '../../components/PatientHistoryDrawer';
import { isIpdAvailable } from '../../utils/featureUtils';

// Helper to capitalize the first letter of each word
const capitalizeWords = (str) => {
  if (!str) return '';
  return str.replace(/(^|[\s,.\-/])([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase());
};

// Helper to format YYYY-MM-DD to DD/MM/YYYY for display
const formatDateDisplay = (val) => {
  if (!val) return 'Select Date';
  const parts = val.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return val;
};

// Helper to format HH:mm (24h) to 12h display with AM/PM
const formatTimeDisplay = (val) => {
  if (!val) return 'Select Time';
  const parts = val.split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    if (!isNaN(h)) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${m} ${period}`;
    }
  }
  return val;
};

// Doctor Formatter top-level helper (prevents TDZ ReferenceErrors in hooks)
const formatDoctor = (doc) => {
  if (!doc) return 'Not Assigned';
  let name = doc.name;
  if (!name && doc.firstName) {
    name = `${doc.firstName} ${doc.lastName || ''}`.trim();
  }
  if (!name) return 'Not Assigned';
  const prefix = name.startsWith('Dr.') ? name : `Dr. ${name}`;
  const qualification = doc.doctorProfile?.qualification ? `, ${doc.doctorProfile.qualification}` : '';
  return `${prefix}${qualification}`;
};

const Inpatients = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Scoping logic: Doctor Desk shows doctor's assigned/visited patients; Receptionist Desk shows all
  const isDoctorDesk = location.pathname.startsWith('/doctor') || (user?.roleId?.name === 'DOCTOR' && !location.pathname.startsWith('/reception'));

  const [searchParams] = useSearchParams();

  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(() => searchParams.get('admit') === 'true');
  const [selectedWorkspaceAdmission, setSelectedWorkspaceAdmission] = useState(null);

  // Patient Consultation History Drawer State
  const [consultationDrawerAdmission, setConsultationDrawerAdmission] = useState(null);
  const [visitHistoryAdmission, setVisitHistoryAdmission] = useState(null);
  const [isOpdHistoryDrawerOpen, setIsOpdHistoryDrawerOpen] = useState(false);

  // Active admission for patient history (either Visit History modal or OPD History drawer)
  const activeHistoryAdmission = visitHistoryAdmission || consultationDrawerAdmission;
  const consultationPatientId = activeHistoryAdmission?.patientId?._id
    || (typeof activeHistoryAdmission?.patientId === 'string' ? activeHistoryAdmission?.patientId : null)
    || activeHistoryAdmission?.raw?.patientId?._id
    || activeHistoryAdmission?.raw?.patientId;

  // Fetch complete patient medical, OPD & IPD consultation history (Fresh on open)
  const {
    data: patientConsultationData,
    isLoading: isLoadingConsultationHistory
  } = useQuery({
    queryKey: ['inpatientConsultationHistory', consultationPatientId],
    queryFn: async () => {
      if (!consultationPatientId) return null;
      const res = await api.get(`/operations/patients/${consultationPatientId}/history`);
      return res.data?.data || null;
    },
    enabled: Boolean(isIpdEnabled && activeHistoryAdmission && consultationPatientId),
    staleTime: 0
  });

  // Original details of patient for the consultation history drawer header
  const effectiveDrawerPatient = useMemo(() => {
    if (!activeHistoryAdmission) return null;
    const p = typeof activeHistoryAdmission.patientId === 'object' && activeHistoryAdmission.patientId !== null
      ? activeHistoryAdmission.patientId
      : (typeof activeHistoryAdmission.raw?.patientId === 'object' ? activeHistoryAdmission.raw.patientId : null);
    const pFromHistory = patientConsultationData?.patient;
    const row = activeHistoryAdmission;

    const rawAge = p?.age || pFromHistory?.age || row.age || '';
    const cleanAge = typeof rawAge === 'string' ? rawAge.replace(/[^0-9]/g, '') : rawAge;

    return {
      _id: p?._id || pFromHistory?._id || row.patientId || row._id,
      name: p?.name || pFromHistory?.name || row.patientName || 'Patient',
      gender: p?.gender || pFromHistory?.gender || row.gender || 'N/A',
      age: cleanAge || 'N/A',
      uhid: p?.uhid || pFromHistory?.uhid || row.uhid || 'N/A',
      bloodGroup: p?.bloodGroup || pFromHistory?.bloodGroup || row.bloodGroup || ''
    };
  }, [activeHistoryAdmission, patientConsultationData]);

  // Synthesize history with current IPD admission encounter and daily reviews
  const effectivePatientHistory = useMemo(() => {
    if (!activeHistoryAdmission) return null;
    const rawHistory = patientConsultationData || {};
    const existingConsultations = [...(rawHistory.consultations || [])];

    const adm = activeHistoryAdmission.raw || activeHistoryAdmission;

    // 1. Synthesize all Daily Reviews from the admission into consultation cards
    const dailyReviewsList = Array.isArray(adm.dailyReviews) ? adm.dailyReviews : [];
    const dailyConsultationCards = dailyReviewsList.map((review, idx) => {
      const dayNum = review.dayNumber || (idx + 1);
      const reviewDate = review.reviewDate || review.createdAt || adm.admissionDate || new Date();
      const reviewDoctorName = review.doctorName || review.doctorId?.name || formatDoctor(adm.attendingDoctorId);

      const formattedPrescriptions = (review.prescriptions || []).map(p => ({
        medicineName: p.medicineName || 'Medicine',
        dosage: p.dose || p.dosage || p.frequency || '1-0-1',
        morning: (p.dose && p.dose.split('-')[0]) || '1',
        afternoon: (p.dose && p.dose.split('-')[1]) || '0',
        night: (p.dose && p.dose.split('-')[2]) || '1',
        duration: p.duration || '3 Days',
        foodTiming: p.instructions || p.foodTiming || 'After Food',
        instructions: p.instructions || 'After Food',
        quantity: p.quantity !== undefined ? p.quantity : 1,
        notes: p.remarks || p.notes || p.pharmacyStatus || '—'
      }));

      return {
        _id: review._id || `${adm._id}_review_${dayNum}`,
        isIPDDailyReview: true,
        dayNumber: dayNum,
        createdAt: reviewDate,
        date: reviewDate,
        reviewTime: review.reviewTime,
        doctorId: { name: reviewDoctorName },
        doctorName: reviewDoctorName,
        doctorSpecialization: `IPD Daily Consultation (Round ${dayNum})`,
        hospitalName: 'In-Patient Department',
        wardBed: adm.bedId ? `Bed ${adm.bedId?.bedNumber || ''}` : '',
        diagnosis: review.diagnosis || adm.finalDiagnosis || adm.reasonForAdmission || 'Daily Inpatient Consultation',
        chiefComplaint: review.chiefComplaints || adm.reasonForAdmission || `Round ${dayNum} Inpatient Daily Review`,
        clinicalNotes: review.clinicalFindings || review.assessment || 'Inpatient clinical observation and progress monitored.',
        advice: review.treatmentPlan || review.assessment || '',
        vitals: review.vitals || adm.vitals || {},
        prescriptions: formattedPrescriptions,
        investigations: review.investigations || []
      };
    });

    // 2. Add Inpatient Admission card only if not already present in history
    const hasAdmissionEncounter = existingConsultations.some(c =>
      (c.isIPDAdmission || c.isIPDEncounter || c.isIpd) &&
      (String(c._id) === String(adm._id) || String(c.admissionId) === String(adm.admissionId))
    );

    const admissionEncounterCards = [];
    if (!hasAdmissionEncounter) {
      const wardBed = adm.bedId
        ? `${adm.bedId?.wardId?.name || 'Ward'} - Bed ${adm.bedId?.bedNumber || '—'}`
        : 'Inpatient Bed';

      const doctorName = formatDoctor(adm.attendingDoctorId);
      const cleanAdmissionNotes = (adm.admissionNotes || '')
        .replace(/Dr\.\s+Dr\./gi, 'Dr.')
        .trim();

      admissionEncounterCards.push({
        _id: adm._id,
        isIPDEncounter: true,
        isIPDAdmission: true,
        admissionId: adm.admissionId,
        admissionType: adm.admissionType || 'Inpatient Admission',
        wardBed,
        bedLabel: wardBed,
        createdAt: adm.admissionDate || adm.createdAt || new Date(),
        date: adm.admissionDate || adm.createdAt || new Date(),
        doctorId: { name: doctorName },
        doctorName: doctorName,
        doctorSpecialization: 'In-Patient Department',
        hospitalName: 'In-Patient Department',
        diagnosis: adm.finalDiagnosis || adm.reasonForAdmission || 'Inpatient Admission',
        chiefComplaint: adm.reasonForAdmission || 'Inpatient Admission & Care',
        clinicalNotes: cleanAdmissionNotes || (adm.reasonForAdmission ? `Admitted for ${adm.reasonForAdmission}.` : 'Inpatient admission and monitoring.'),
        advice: adm.dischargeInstructions || adm.treatmentSummary || '',
        vitals: adm.patientId?.vitals || adm.vitals || null,
        prescriptions: [],
        investigations: []
      });
    }

    // Merge daily consultation cards with existing consultations (preventing duplicates by round/encounter key)
    const existingRoundKeys = new Set(
      existingConsultations
        .filter(c => c.isIPDDailyReview)
        .map(c => `round_${c.admissionId || adm.admissionId || ''}_${c.dayNumber || c.roundNumber || 1}`)
    );
    const existingIds = new Set(existingConsultations.map(c => String(c._id)));
    const newDailyCards = dailyConsultationCards.filter(c => 
      !existingRoundKeys.has(`round_${c.admissionId || adm.admissionId || ''}_${c.dayNumber || 1}`) && 
      !existingIds.has(String(c._id))
    );

    const combinedList = [...newDailyCards, ...admissionEncounterCards, ...existingConsultations];
    combinedList.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    return {
      ...rawHistory,
      consultations: combinedList,
      snapshots: combinedList // Crucial: PatientHistoryDrawer prioritizes snapshots
    };
  }, [activeHistoryAdmission, patientConsultationData]);

  const handleOpenConsultation = (admission) => {
    setConsultationDrawerAdmission(admission);
  };

  // Discharge Modal State
  const [dischargeModalAdmission, setDischargeModalAdmission] = useState(null);
  const [dischargeModalMode, setDischargeModalMode] = useState('discharge'); // 'discharge' | 'charges'
  const [dischargeForm, setDischargeForm] = useState({
    dischargeDate: '',
    dischargeTime: '',
    dischargeCondition: 'Stable / Recovered',
    finalDiagnosis: '',
    treatmentSummary: '',
    dischargeInstructions: ''
  });

  // Filter States
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'Admitted');
  const [wardFilter, setWardFilter] = useState('All');
  const [doctorFilter, setDoctorFilter] = useState('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync URL status query param if user navigates with new search params
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    if (urlStatus && urlStatus !== statusFilter) {
      setStatusFilter(urlStatus);
    }
  }, [searchParams]);

  // Custom Dropdown Menu States for Filters (fixes dropdown menu overflowing card on mobile)
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isWardDropdownOpen, setIsWardDropdownOpen] = useState(false);
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false);
  const [openModalDropdown, setOpenModalDropdown] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const statusDropdownRef = useRef(null);
  const wardDropdownRef = useRef(null);
  const doctorDropdownRef = useRef(null);
  const modalDropdownRefs = useRef({});

  // Three-dot action dropdown state for table rows (rendered via createPortal to prevent overflow clipping)
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState(null);
  const dropdownMenuRef = useRef(null);

  const handleToggleRowDropdown = (rowId, e) => {
    e.stopPropagation();
    if (activeDropdownId === rowId) {
      setActiveDropdownId(null);
      setDropdownPos(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const menuWidth = 208; // 52 * 4 = 208px
      const menuHeight = 220; // approximate menu height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldFlipUp = spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow;

      const rawRight = window.innerWidth - rect.right;
      const clampedRight = Math.max(12, Math.min(rawRight, window.innerWidth - menuWidth - 12));

      setDropdownPos({
        top: shouldFlipUp ? undefined : Math.max(8, rect.bottom + 4),
        bottom: shouldFlipUp ? Math.max(8, window.innerHeight - rect.top + 4) : undefined,
        right: clampedRight
      });
      setActiveDropdownId(rowId);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setIsStatusDropdownOpen(false);
      }
      if (wardDropdownRef.current && !wardDropdownRef.current.contains(e.target)) {
        setIsWardDropdownOpen(false);
      }
      if (doctorDropdownRef.current && !doctorDropdownRef.current.contains(e.target)) {
        setIsDoctorDropdownOpen(false);
      }
      if (dropdownMenuRef.current && !dropdownMenuRef.current.contains(e.target)) {
        setActiveDropdownId(null);
        setDropdownPos(null);
      }
      if (openModalDropdown) {
        const activeRef = modalDropdownRefs.current[openModalDropdown];
        if (activeRef && !activeRef.contains(e.target)) {
          setOpenModalDropdown(null);
        }
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsStatusDropdownOpen(false);
        setIsWardDropdownOpen(false);
        setIsDoctorDropdownOpen(false);
        setOpenModalDropdown(null);
        setActiveDropdownId(null);
        setDropdownPos(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openModalDropdown]);

  // Handle outside scroll & window resize to keep portal menu perfectly synced
  useEffect(() => {
    if (!activeDropdownId) return;

    const handleScroll = (e) => {
      if (dropdownMenuRef.current && dropdownMenuRef.current.contains(e.target)) return;
      setActiveDropdownId(null);
      setDropdownPos(null);
    };

    const handleResize = () => {
      setActiveDropdownId(null);
      setDropdownPos(null);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeDropdownId]);

  // Admission Modal Mode: 'existing' or 'new'
  const [admissionMode, setAdmissionMode] = useState('existing');

  // Admit Form State
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [admitForm, setAdmitForm] = useState({
    bedId: '',
    attendingDoctorId: '',
    admissionType: 'Routine Admission',
    reasonForAdmission: '',
    admissionNotes: '',
    admissionDate: new Date().toISOString().split('T')[0],
    admissionTime: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
    totalBill: '',
    amountMode: 'Cash',
    amountPaid: ''
  });

  // New Patient Registration Form State (for admissionMode === 'new')
  const [newPatientForm, setNewPatientForm] = useState({
    name: '',
    age: '',
    gender: 'Male',
    mobileNumber: '',
    bloodGroup: '',
    address: '',
    email: '',
    diagnosis: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [suggestedDoctorInfo, setSuggestedDoctorInfo] = useState(null);

  // Queries
  // 1. IPD Admissions (Doctor Desk: scoped to doctor; Reception Desk: all patients)
  const {
    data: admissions = [],
    isLoading: isLoadingAdmissions,
    isError: isAdmissionsError,
    error: admissionsError,
    refetch: refetchAdmissions
  } = useQuery({
    queryKey: ['ipd-admissions', isDoctorDesk ? (user?._id || 'doctor') : 'all'],
    queryFn: async () => {
      const url = isDoctorDesk && user?._id
        ? `/ipd/admissions?doctorId=${user._id}`
        : '/ipd/admissions';
      const res = await api.get(url);
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // 2. Hospital Wards
  const { data: wards = [] } = useQuery({
    queryKey: ['ipd-wards'],
    queryFn: async () => {
      const res = await api.get('/ipd/wards');
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // 3. Available Beds (for Admission Modal)
  const { data: availableBeds = [] } = useQuery({
    queryKey: ['ipd-beds', 'Available'],
    queryFn: async () => {
      const res = await api.get('/ipd/beds');
      return (res.data || []).filter(b => b.status === 'Available');
    },
    enabled: Boolean(isIpdEnabled)
  });

  // 4. Doctors for attending assignment
  const { data: doctors = [] } = useQuery({
    queryKey: ['ipd-doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data?.data || res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // Refresh List Handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchAdmissions(),
        queryClient.invalidateQueries(['ipd-beds']),
        queryClient.invalidateQueries(['ipd-wards'])
      ]);
      toast.success('Patient directory refreshed');
    } catch {
      toast.error('Failed to refresh inpatient directory');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Autocomplete fetch for existing patients from central Registry
  const fetchPatients = useCallback(async (query) => {
    if (!query || !query.trim()) return [];
    try {
      const res = await api.get(`/operations/patients/search?query=${encodeURIComponent(query.trim())}`);
      const results = res.data?.data || [];
      return results.map(p => ({
        ...p,
        label: `${p.name} (${p.uhid || 'No UHID'}) - ${p.mobileNumber || ''}`,
        value: p._id
      }));
    } catch {
      return [];
    }
  }, []);

  // Check if selected patient already has an active IPD admission
  const activeAdmissionForSelected = useMemo(() => {
    if (!selectedPatient?._id) return null;
    return admissions.find(
      adm => adm.status === 'Admitted' && (adm.patientId?._id === selectedPatient._id || adm.patientId === selectedPatient._id)
    );
  }, [selectedPatient, admissions]);

  // When an existing patient is selected, check past encounters/history to suggest attending doctor
  const handlePatientSelect = async (patient) => {
    setSelectedPatient(patient);
    setSuggestedDoctorInfo(null);
    if (!patient?._id) return;

    try {
      const res = await api.get(`/operations/patients/${patient._id}/history`);
      const history = res.data?.data;
      const recentConsultation = history?.consultations?.[0] || history?.snapshots?.[0];
      const prevDocId = recentConsultation?.doctorId?._id || recentConsultation?.doctorId;
      const prevDocName = recentConsultation?.doctorId?.name;

      if (prevDocId && doctors.some(d => d._id === prevDocId)) {
        setSuggestedDoctorInfo({ id: prevDocId, name: prevDocName });
        // Automatically default attending doctor if none selected yet
        setAdmitForm(prev => prev.attendingDoctorId ? prev : { ...prev, attendingDoctorId: prevDocId });
      }
    } catch {
      // Non-critical, ignore suggestion error
    }
  };

  // Reset admission modal state
  const resetAdmissionModal = () => {
    setIsAdmitModalOpen(false);
    setOpenModalDropdown(null);
    setAdmissionMode('existing');
    setSelectedPatient(null);
    setSuggestedDoctorInfo(null);
    setFormErrors({});
    setAdmitForm({
      bedId: '',
      attendingDoctorId: '',
      admissionType: 'Routine Admission',
      reasonForAdmission: '',
      admissionNotes: '',
      admissionDate: new Date().toISOString().split('T')[0],
      admissionTime: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
      totalBill: '',
      amountMode: 'Cash',
      amountPaid: ''
    });
    setNewPatientForm({
      name: '',
      age: '',
      gender: 'Male',
      mobileNumber: '',
      bloodGroup: '',
      address: '',
      email: '',
      diagnosis: ''
    });
  };

  // Admission Mutation
  const admitMutation = useMutation({
    mutationFn: async (payload) => {
      let patientIdToAdmit = selectedPatient?._id;

      // If registering a new patient, register first via existing Central Registry API
      if (admissionMode === 'new') {
        const patientPayload = {
          name: newPatientForm.name.trim(),
          age: Number(newPatientForm.age),
          gender: newPatientForm.gender,
          mobileNumber: newPatientForm.mobileNumber.trim(),
          bloodGroup: newPatientForm.bloodGroup || undefined,
          address: newPatientForm.address.trim() || undefined,
          email: newPatientForm.email.trim() || undefined,
          diagnosis: newPatientForm.diagnosis.trim() || undefined
        };

        const regRes = await api.post('/operations/patients', patientPayload);
        const savedPatient = regRes.data?.data;
        if (!savedPatient?._id) {
          throw new Error('Failed to register patient profile in registry.');
        }

        patientIdToAdmit = savedPatient._id;
        setSelectedPatient(savedPatient);

        if (regRes.data?.isExisting) {
          toast.success(`Matched existing patient: ${savedPatient.name} (${savedPatient.uhid})`);
        } else {
          toast.success(`Patient registered with UHID: ${savedPatient.uhid}`);
        }
      }

      if (!patientIdToAdmit) {
        throw new Error('Valid patient profile is required for admission.');
      }

      // Re-verify admission with backend
      const admitRes = await api.post('/ipd/admissions/admit', {
        patientId: patientIdToAdmit,
        bedId: payload.bedId,
        attendingDoctorId: payload.attendingDoctorId,
        admissionType: payload.admissionType,
        reasonForAdmission: payload.reasonForAdmission.trim(),
        admissionNotes: payload.admissionNotes?.trim() || undefined,
        admissionDate: payload.admissionDate,
        admissionTime: payload.admissionTime,
        totalBill: payload.totalBill ? Number(payload.totalBill) : 0,
        amountMode: payload.amountMode,
        amountPaid: payload.amountPaid ? Number(payload.amountPaid) : 0
      });

      return admitRes.data;
    },
    onSuccess: (data) => {
      toast.success(`Patient admitted successfully (${data.admissionId || 'IPD'})`);
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
      queryClient.invalidateQueries({ queryKey: ['ipd', 'dashboardLiveStatus'] });
      try {
        workflowRealtimeService.broadcastLocalEvent('IPD_ADMISSION_CREATED', data);
      } catch (e) { }
      resetAdmissionModal();
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || 'Error admitting patient into IPD';
      toast.error(msg);
    }
  });

  const handleAdmit = (e) => {
    e.preventDefault();
    const errors = {};

    // Validate patient intake
    if (admissionMode === 'existing') {
      if (!selectedPatient) {
        errors.patient = 'Please search and select a patient from the registry.';
      } else if (activeAdmissionForSelected) {
        errors.patient = `Patient already has an active IPD admission (${activeAdmissionForSelected.admissionId}).`;
      }
    } else {
      // Validate New Patient Fields
      if (!newPatientForm.name.trim()) {
        errors.name = 'Patient full name is required.';
      }
      if (!newPatientForm.age || isNaN(newPatientForm.age) || Number(newPatientForm.age) <= 0 || Number(newPatientForm.age) > 120) {
        errors.age = 'Please enter a valid age (1-120).';
      }
      if (!newPatientForm.gender) {
        errors.gender = 'Gender is required.';
      }
      if (!newPatientForm.mobileNumber || !/^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(newPatientForm.mobileNumber.trim())) {
        errors.mobileNumber = 'Please enter a valid 10-digit mobile number.';
      }
    }

    // Validate Admission Details
    if (!admitForm.bedId) {
      errors.bedId = 'Please select an available bed.';
    }
    if (!admitForm.attendingDoctorId) {
      errors.attendingDoctorId = 'Please select an attending doctor.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return;
    }

    setFormErrors({});
    admitMutation.mutate(admitForm);
  };

  // Doctor Formatter helper uses top-level formatDoctor

  // Admission Date & Time Formatter helper
  const formatAdmissionDateTime = (admissionDate, admissionTime) => {
    if (!admissionDate) return { date: 'Not available', time: null };
    const d = new Date(admissionDate);
    if (isNaN(d.getTime())) return { date: 'Not available', time: null };

    const dateStr = d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    let timeStr = null;
    if (admissionTime && typeof admissionTime === 'string' && admissionTime.trim()) {
      const trimmed = admissionTime.trim();
      if (/am|pm/i.test(trimmed)) {
        timeStr = trimmed.toUpperCase();
      } else if (trimmed.includes(':')) {
        const [hh, mm] = trimmed.split(':');
        const h = parseInt(hh, 10);
        const m = parseInt(mm, 10);
        if (!isNaN(h) && !isNaN(m)) {
          const period = h >= 12 ? 'PM' : 'AM';
          const formattedH = h % 12 || 12;
          timeStr = `${String(formattedH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
        }
      }
    }

    if (!timeStr) {
      const hours = d.getHours();
      const minutes = d.getMinutes();
      if (hours !== 0 || minutes !== 0) {
        const period = hours >= 12 ? 'PM' : 'AM';
        const formattedH = hours % 12 || 12;
        timeStr = `${String(formattedH).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
      }
    }

    return { date: dateStr, time: timeStr };
  };

  // Discharge Patient Mutation
  const dischargeMutation = useMutation({
    mutationFn: async ({ admissionId, data }) => {
      const res = await api.put(`/ipd/admissions/${admissionId}/discharge`, data);
      return res.data;
    },
    onSuccess: (data) => {
      const pName = data?.patientId?.name || 'Patient';
      toast.success(`${pName} discharged and bed released successfully`);
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });
      queryClient.invalidateQueries({ queryKey: ['ipd', 'dashboardLiveStatus'] });
      try {
        workflowRealtimeService.broadcastLocalEvent('IPD_ADMISSION_DISCHARGED', data);
      } catch (e) { }
      setDischargeModalAdmission(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Error processing discharge');
    }
  });

  const handleOpenDischarge = (admission) => {
    if (!admission || (!isDoctorDesk && admission.status === 'Discharged')) return;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setDischargeModalMode('discharge');
    setDischargeModalAdmission(admission);
    setDischargeForm({
      dischargeDate: todayStr,
      dischargeTime: timeStr,
      dischargeCondition: admission.dischargeCondition || 'Stable / Recovered',
      finalDiagnosis: admission.finalDiagnosis || admission.reasonForAdmission || admission.patientId?.diagnosis || 'Under observation and medical management',
      treatmentSummary: admission.treatmentSummary || admission.dischargeSummary || 'Supportive inpatient care and treatment administered.',
      dischargeInstructions: admission.dischargeInstructions || ''
    });
  };

  const handleOpenManageCharges = (admission) => {
    if (!admission || admission.status === 'Discharged') return;
    setDischargeModalMode('charges');
    setDischargeModalAdmission(admission);
  };

  const handleConfirmDischarge = (e) => {
    e.preventDefault();
    if (!dischargeModalAdmission) return;
    if (!dischargeForm.dischargeDate) {
      return toast.error('Please select the discharge date');
    }
    if (!dischargeForm.finalDiagnosis.trim()) {
      return toast.error('Please enter the final discharge diagnosis');
    }
    if (!dischargeForm.treatmentSummary.trim()) {
      return toast.error('Please enter the treatment summary');
    }

    dischargeMutation.mutate({
      admissionId: dischargeModalAdmission._id,
      data: dischargeForm
    });
  };

  // Deduplicate admissions by unique ID / admissionId to guarantee only original, non-duplicate records are processed
  const uniqueAdmissions = useMemo(() => {
    if (!Array.isArray(admissions)) return [];
    const seen = new Set();
    return admissions.filter(item => {
      const key = item._id ? String(item._id) : (item.admissionId || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [admissions]);

  // Filter Admissions
  const filteredAdmissions = useMemo(() => {
    return uniqueAdmissions.filter(item => {
      // Strict Doctor Scoping Guard: On Doctor Desk, ONLY display patients where this doctor is attending or visited
      if (isDoctorDesk && user?._id) {
        const myDocId = String(user._id);
        const itemDocId = item.attendingDoctorId?._id
          ? String(item.attendingDoctorId._id)
          : String(item.attendingDoctorId || '');
        const hasVisited = (Array.isArray(item.visitedDoctorIds) && item.visitedDoctorIds.some(v => {
          const vDocId = v?._id ? String(v._id) : String(v || '');
          return vDocId === myDocId;
        })) || (Array.isArray(item.doctorVisits) && item.doctorVisits.some(v => {
          const vDocId = v.doctorId?._id ? String(v.doctorId._id) : String(v.doctorId || '');
          return vDocId === myDocId;
        }));

        if (itemDocId !== myDocId && !hasVisited) {
          return false;
        }
      }

      // 1. Status Filter
      if (statusFilter !== 'All') {
        const isComp = item.dischargeSummaryStatus === 'Sent to Reception' ||
          item.dischargeSummaryStatus === 'Completed' ||
          item.raw?.dischargeSummaryStatus === 'Sent to Reception' ||
          item.raw?.dischargeSummaryStatus === 'Completed' ||
          item.clinicalDischargeSummary?.status === 'Sent to Reception' ||
          item.raw?.clinicalDischargeSummary?.status === 'Sent to Reception';

        const isPending = item.dischargeSummaryStatus === 'Sent to Reception' ||
          item.raw?.dischargeSummaryStatus === 'Sent to Reception' ||
          item.clinicalDischargeSummary?.status === 'Sent to Reception' ||
          item.raw?.clinicalDischargeSummary?.status === 'Sent to Reception';

        if (statusFilter === 'Completed') {
          if (item.status !== 'Admitted' || !isComp) return false;
        } else if (statusFilter === 'Pending Discharge') {
          if (item.status !== 'Admitted' || !isPending) return false;
        } else if (statusFilter === 'Admitted') {
          // If statusFilter is 'Admitted':
          // 1. Must be currently admitted (not discharged or cancelled)
          if (item.status !== 'Admitted') return false;
          // 2. On Doctor Desk: Exclude completed patients (they appear under 'Completed')
          if (isDoctorDesk && isComp) return false;
          // 3. On Reception Desk: Exclude pending discharge patients (they appear under 'Pending Discharge')
          if (!isDoctorDesk && isPending) return false;
        } else if (item.status !== statusFilter) {
          return false;
        }
      }

      // 2. Ward Filter
      if (wardFilter !== 'All') {
        const itemWardId = item.bedId?.wardId?._id || item.bedId?.wardId;
        const itemWardName = item.bedId?.wardId?.name;
        if (itemWardId !== wardFilter && itemWardName !== wardFilter) {
          return false;
        }
      }

      // 3. Doctor Filter (Only for Receptionist Desk)
      if (!isDoctorDesk && doctorFilter !== 'All') {
        const itemDocId = item.attendingDoctorId?._id
          ? String(item.attendingDoctorId._id)
          : String(item.attendingDoctorId || '');
        const hasVisited = Array.isArray(item.doctorVisits) && item.doctorVisits.some(v => {
          const vDocId = v.doctorId?._id ? String(v.doctorId._id) : String(v.doctorId || '');
          return vDocId === doctorFilter;
        });
        if (itemDocId !== doctorFilter && !hasVisited) {
          return false;
        }
      }

      // 4. Search Query (Patient Name, UHID, IPD ID, Phone, Doctor Name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pName = item.patientId?.name?.toLowerCase() || '';
        const uhid = item.patientId?.uhid?.toLowerCase() || '';
        const ipdId = item.admissionId?.toLowerCase() || '';
        const phone = item.patientId?.mobileNumber?.toLowerCase() || '';
        const docName = formatDoctor(item.attendingDoctorId).toLowerCase();
        if (
          !pName.includes(q) &&
          !uhid.includes(q) &&
          !ipdId.includes(q) &&
          !phone.includes(q) &&
          !docName.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [admissions, statusFilter, wardFilter, doctorFilter, searchQuery, isDoctorDesk]);

  const isOnlyDischarged = statusFilter === 'Discharged';

  if (!isIpdEnabled) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-4 border border-amber-200">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">In-Patient Department (IPD) Disabled</h2>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          The In-Patient Department feature is not enabled for your assigned hospital. Please contact your hospital administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] px-2.5 sm:px-3 lg:px-4 pt-1 sm:pt-2 pb-6 space-y-6 -mt-2 sm:-mt-4">
      {/* ==================================================
          SECTION 1: PAGE HEADER (MATCHING EXISTING SECTIONS)
          ================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          {/* Top section category tag matching Hospital Settings pattern */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#2F63F2] uppercase tracking-wider mb-0.5">
            <Bed className="w-3.5 h-3.5 text-[#2F63F2]" />
            In-Patient Department
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {isDoctorDesk ? 'My IPD Patients' : 'IPD Patients Directory'}
          </h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            {isDoctorDesk
              ? 'Inpatient directory of your assigned and visited patients'
              : 'Complete hospital inpatient directory, clinical workspace access, and care timeline'}
          </p>
        </div>

        {/* Action Buttons: Discharge History and New Admission in one row */}
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:gap-2.5 sm:w-auto shrink-0">
          {!isDoctorDesk && (
            <button
              type="button"
              onClick={() => navigate(ROUTES.RECEPTION?.IPD_DISCHARGE || '/reception/ipd/discharge')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 h-9 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-[11px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wider rounded-lg shadow-xs transition-all duration-150 cursor-pointer truncate"
              title="Discharge History"
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[2.2] shrink-0" />
              <span className="truncate">Discharge History</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAdmitModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 h-9 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-[11px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wider rounded-lg shadow-xs transition-all duration-150 cursor-pointer truncate"
          >
            <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[2.2] shrink-0" />
            <span className="truncate">New Admission</span>
          </button>
        </div>
      </div>

      {/* ==================================================
          SECTION 2: PATIENT SEARCH AND FILTERS CARD
          ================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 sm:p-4 relative z-20">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-3.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-0 max-w-none sm:max-w-md w-full sm:w-auto">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Patient Name, UHID, or IPD ID"
                className="w-full h-10 pl-10 pr-4 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all"
              />
            </div>

            {/* Status & Ward (+ Doctor) Filters: 1 row and 2 columns in mobile view only */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 w-full sm:w-auto">
              {/* Status Filter */}
              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto min-w-0">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0">
                  Status:
                </label>
                <div className="relative flex-1 sm:flex-initial min-w-0" ref={statusDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsStatusDropdownOpen(prev => !prev);
                      setIsWardDropdownOpen(false);
                      setIsDoctorDropdownOpen(false);
                    }}
                    className={`w-full min-w-0 sm:min-w-[130px] flex items-center justify-between h-10 bg-white border rounded-lg pl-2.5 sm:pl-3 pr-2.5 sm:pr-3 text-xs sm:text-sm text-slate-700 font-medium transition-all cursor-pointer ${isStatusDropdownOpen
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="truncate">
                      {statusFilter === 'All' ? 'All Patients' : statusFilter}
                    </span>
                    <ChevronDown className={`w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {isStatusDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 min-w-[130px] max-w-[180px] w-full sm:w-auto bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1">
                      {[
                        { value: 'All', label: 'All Patients' },
                        { value: 'Admitted', label: 'Admitted' },
                        ...(isDoctorDesk
                          ? [{ value: 'Completed', label: 'Completed' }]
                          : [{ value: 'Pending Discharge', label: 'Pending Discharge' }]),
                        { value: 'Discharged', label: 'Discharged' }
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setStatusFilter(item.value);
                            setIsStatusDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-medium transition-colors flex items-center justify-between cursor-pointer ${statusFilter === item.value
                            ? 'bg-blue-50/80 text-[#2F63F2] font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span>{item.label}</span>
                          {statusFilter === item.value && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Ward Filter */}
              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto min-w-0">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0">
                  Ward:
                </label>
                <div className="relative flex-1 sm:flex-initial min-w-0" ref={wardDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsWardDropdownOpen(prev => !prev);
                      setIsStatusDropdownOpen(false);
                      setIsDoctorDropdownOpen(false);
                    }}
                    className={`w-full min-w-0 sm:min-w-[140px] flex items-center justify-between h-10 bg-white border rounded-lg pl-2.5 sm:pl-3 pr-2.5 sm:pr-3 text-xs sm:text-sm text-slate-700 font-medium transition-all cursor-pointer ${isWardDropdownOpen
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="truncate">{wardFilter === 'All' ? 'All Wards' : wardFilter}</span>
                    <ChevronDown className={`w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${isWardDropdownOpen ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>

                  {/* Dropdown Menu - Aligned to right on mobile so it stays 100% inside the card */}
                  {isWardDropdownOpen && (
                    <div className="absolute right-0 sm:left-0 top-full mt-1.5 min-w-[140px] max-w-[200px] w-full sm:w-auto bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 max-h-56 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setWardFilter('All');
                          setIsWardDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-medium transition-colors flex items-center justify-between cursor-pointer ${wardFilter === 'All'
                          ? 'bg-blue-50/80 text-[#2F63F2] font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <span>All Wards</span>
                        {wardFilter === 'All' && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                      </button>
                      {wards.map((ward) => (
                        <button
                          key={ward._id}
                          type="button"
                          onClick={() => {
                            setWardFilter(ward.name);
                            setIsWardDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-medium transition-colors flex items-center justify-between cursor-pointer ${wardFilter === ward.name
                            ? 'bg-blue-50/80 text-[#2F63F2] font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span className="truncate">{ward.name}</span>
                          {wardFilter === ward.name && <Check className="w-3.5 h-3.5 text-[#2F63F2] shrink-0 ml-1" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Doctor Filter (Only for Receptionist Desk) */}
              {!isDoctorDesk && (
                <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto min-w-0">
                  <label className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0">
                    Doctor:
                  </label>
                  <div className="relative flex-1 sm:flex-initial min-w-0" ref={doctorDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDoctorDropdownOpen(prev => !prev);
                        setIsStatusDropdownOpen(false);
                        setIsWardDropdownOpen(false);
                      }}
                      className={`w-full min-w-0 sm:min-w-[160px] flex items-center justify-between h-10 bg-white border rounded-lg pl-2.5 sm:pl-3 pr-2.5 sm:pr-3 text-xs sm:text-sm text-slate-700 font-medium transition-all cursor-pointer ${isDoctorDropdownOpen
                        ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                        : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <span className="truncate">
                        {doctorFilter === 'All'
                          ? 'All Doctors'
                          : formatDoctor(doctors.find((d) => d._id === doctorFilter))}
                      </span>
                      <ChevronDown className={`w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${isDoctorDropdownOpen ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {isDoctorDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 min-w-[160px] max-w-[240px] w-full sm:w-auto bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 max-h-56 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setDoctorFilter('All');
                            setIsDoctorDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-medium transition-colors flex items-center justify-between cursor-pointer ${doctorFilter === 'All'
                            ? 'bg-blue-50/80 text-[#2F63F2] font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span>All Doctors</span>
                          {doctorFilter === 'All' && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                        </button>
                        {doctors.map((doc) => (
                          <button
                            key={doc._id}
                            type="button"
                            onClick={() => {
                              setDoctorFilter(doc._id);
                              setIsDoctorDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-medium transition-colors flex items-center justify-between cursor-pointer ${doctorFilter === doc._id
                              ? 'bg-blue-50/80 text-[#2F63F2] font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            <span className="truncate">{formatDoctor(doc)}</span>
                            {doctorFilter === doc._id && <Check className="w-3.5 h-3.5 text-[#2F63F2] shrink-0 ml-1" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Refresh List Button */}
          <div className="shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-xs sm:text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh List</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================
          SECTION 3: IPD PATIENTS DIRECTORY TABLE CARD
          ================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left border-collapse table-fixed">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className={`${isOnlyDischarged ? (isDoctorDesk ? 'w-[15%]' : 'w-[13%]') : (isDoctorDesk ? 'w-[12%]' : 'w-[12.5%] min-w-[118px]')} pl-4 sm:pl-5 pr-2 py-2.5 text-[11px] font-bold text-slate-600 tracking-wide uppercase whitespace-nowrap`}>
                  IPD / UHID
                </th>
                <th className={`${isOnlyDischarged ? (isDoctorDesk ? 'w-[22%]' : 'w-[18%]') : (isDoctorDesk ? 'w-[18%]' : 'w-[16%] min-w-[150px]')} pl-7 sm:pl-9 pr-3 py-2.5 text-[11px] font-bold text-slate-600 tracking-wide uppercase text-left whitespace-nowrap`}>
                  PATIENT NAME
                </th>
                <th className={`${isOnlyDischarged ? (isDoctorDesk ? 'w-[13%]' : 'w-[12%]') : (isDoctorDesk ? 'w-[11%]' : 'w-[10%] min-w-[95px]')} px-3 py-2.5 text-[11px] font-bold text-slate-600 tracking-wide uppercase whitespace-nowrap`}>
                  AGE / GENDER
                </th>
                <th className={`${isOnlyDischarged ? (isDoctorDesk ? 'w-[16%]' : 'w-[13%]') : (isDoctorDesk ? 'w-[13%]' : 'w-[11%] min-w-[105px]')} px-3 py-2.5 text-[11px] font-bold text-slate-600 tracking-wide uppercase whitespace-nowrap`}>
                  BED & WARD NO
                </th>
                <th className={`${isOnlyDischarged ? (isDoctorDesk ? 'w-[16%]' : 'w-[14%]') : (isDoctorDesk ? 'w-[13%]' : 'w-[12%] min-w-[115px]')} px-3 py-2.5 text-[11px] font-bold text-slate-600 tracking-wide uppercase whitespace-nowrap`}>
                  <div className="leading-tight">
                    <div>ADMISSION DATE</div>
                    <div className="text-[10px] text-slate-500 font-semibold tracking-normal">& TIME</div>
                  </div>
                </th>
                {!isDoctorDesk && (
                  <th className={`${isOnlyDischarged ? 'w-[16%]' : 'w-[13%] min-w-[125px]'} px-3 py-2.5 text-[11px] font-bold text-slate-600 tracking-wide uppercase whitespace-nowrap`}>
                    PRIMARY DOCTOR
                  </th>
                )}
                <th className={`${isOnlyDischarged ? (isDoctorDesk ? 'w-[18%]' : 'w-[14%]') : (isDoctorDesk ? 'w-[12%]' : 'w-[10.5%] min-w-[110px]')} pl-3 pr-5 py-2.5 text-[11px] font-bold text-slate-600 tracking-normal uppercase ${isDoctorDesk ? 'text-left' : 'text-center'} whitespace-nowrap`}>
                  ADMISSION STATUS
                </th>
                {!isOnlyDischarged && (
                  <th className={`${isDoctorDesk ? 'w-[21%]' : 'w-[15.5%] min-w-[165px]'} pl-5 pr-4 sm:pr-5 py-2.5 text-[11px] font-bold text-slate-600 tracking-wide uppercase text-center whitespace-nowrap`}>
                    ACTIONS
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Loading State */}
              {isLoadingAdmissions ? (
                <tr>
                  <td colSpan={isOnlyDischarged ? (isDoctorDesk ? 6 : 7) : (isDoctorDesk ? 7 : 8)} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-3 border-blue-500/20 border-t-[#2F63F2] rounded-full animate-spin"></div>
                      <p className="text-sm font-medium text-slate-500">Loading inpatient records...</p>
                    </div>
                  </td>
                </tr>
              ) : isAdmissionsError ? (
                /* Error State */
                <tr>
                  <td colSpan={isOnlyDischarged ? (isDoctorDesk ? 6 : 7) : (isDoctorDesk ? 7 : 8)} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="w-8 h-8 text-rose-500" />
                      <p className="text-sm font-semibold text-slate-800">
                        {admissionsError?.response?.data?.message || 'Error loading inpatient directory'}
                      </p>
                      <button
                        onClick={() => refetchAdmissions()}
                        className="px-4 py-1.5 text-xs font-semibold text-[#2F63F2] border border-[#2F63F2] rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredAdmissions.length === 0 ? (
                /* Empty States */
                <tr>
                  <td colSpan={isOnlyDischarged ? (isDoctorDesk ? 6 : 7) : (isDoctorDesk ? 7 : 8)} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                        <User className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">
                        {searchQuery.trim()
                          ? 'No patients match your search.'
                          : 'No inpatient records found.'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {searchQuery.trim()
                          ? 'Try checking for spelling mistakes or clearing filters.'
                          : 'Admit patients from the central registry to get started.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                /* Patient Rows */
                filteredAdmissions.map((row, rowIdx) => {
                  const patient = row.patientId || {};
                  const isDischarged = row.status === 'Discharged';
                  const phoneFormatted = patient.mobileNumber
                    ? `${patient.countryCode || '+91'} ${patient.mobileNumber}`
                    : '—';
                  const admissionDateTime = formatAdmissionDateTime(row.admissionDate, row.admissionTime);

                  return (
                    <tr
                      key={row._id}
                      className="group hover:bg-slate-50/70 transition-colors duration-150"
                    >
                      {/* 1. IPD / UHID */}
                      <td className="pl-4 sm:pl-5 pr-2 py-2 sm:py-2.5 align-middle whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedWorkspaceAdmission(row)}
                          className="text-left group/btn cursor-pointer block leading-tight"
                          title="Click to view full patient and admission details"
                        >
                          <div className="text-[13px] font-semibold text-[#2F63F2] group-hover/btn:underline">
                            {row.admissionId || '—'}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 tracking-tight font-normal">
                            {patient.uhid || '—'}
                          </div>
                        </button>
                      </td>

                      {/* 2. PATIENT NAME */}
                      <td className="pl-7 sm:pl-9 pr-3 py-2 sm:py-2.5 align-middle whitespace-nowrap text-left">
                        <button
                          type="button"
                          onClick={() => setSelectedWorkspaceAdmission(row)}
                          className="text-left inline-flex flex-col items-start group/btn cursor-pointer leading-tight"
                          title="Click to view full patient and admission details"
                        >
                          <div className="text-[13px] sm:text-[14px] font-bold text-[#0f172a] group-hover/btn:text-[#2F63F2] transition-colors leading-tight text-left" title={patient.name}>
                            {patient.name || 'Unknown Patient'}
                          </div>
                          <div className="text-[11px] sm:text-[12px] text-slate-500 mt-0.5 font-normal leading-tight text-left">
                            {phoneFormatted}
                          </div>
                        </button>
                      </td>

                      {/* 3. AGE / GENDER & BLOOD GROUP */}
                      <td className="px-3 py-2 sm:py-2.5 align-middle whitespace-nowrap">
                        <div className="flex flex-col items-start gap-0.5 leading-tight">
                          <span className="text-[12px] sm:text-[13px] font-semibold text-slate-700 whitespace-nowrap leading-tight">
                            {patient.age ? `${patient.age} yrs` : '—'} / {patient.gender ? (patient.gender.length === 1 ? patient.gender.toUpperCase() : patient.gender.charAt(0).toUpperCase()) : '—'}
                          </span>
                          {(patient.bloodGroup || row.bloodGroup) && (patient.bloodGroup || row.bloodGroup) !== 'Unknown' && (patient.bloodGroup || row.bloodGroup) !== 'N/A' ? (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs">
                              {patient.bloodGroup || row.bloodGroup}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-medium leading-tight">—</span>
                          )}
                        </div>
                      </td>

                      {/* 4. BED & WARD NO */}
                      <td className="px-3 py-2 sm:py-2.5 align-middle whitespace-nowrap">
                        {isDischarged ? (
                          <div className="leading-tight">
                            <span className="text-[12px] text-slate-400 italic">Released</span>
                            <div className="text-[11px] text-slate-400 mt-0.5 font-normal truncate">
                              {row.bedId?.wardId?.name || row.ward || '—'}
                            </div>
                          </div>
                        ) : !row.bedId ? (
                          <div className="leading-tight">
                            <span className="text-[12px] text-slate-400 italic">Unassigned</span>
                            <div className="text-[11px] text-slate-400 mt-0.5 font-normal">
                              {row.ward || '—'}
                            </div>
                          </div>
                        ) : (
                          <div className="leading-tight">
                            <div className="text-[12px] sm:text-[13px] font-bold text-slate-900 leading-tight truncate" title={`${row.bedId?.wardId?.name || row.ward || 'General Ward'} • ${row.bedId?.bedNumber ? (String(row.bedId.bedNumber).toLowerCase().startsWith('bed') ? row.bedId.bedNumber : `Bed ${row.bedId.bedNumber}`) : (row.bedNo ? `Bed ${row.bedNo}` : 'Bed —')}`}>
                              {row.bedId?.bedNumber ? (String(row.bedId.bedNumber).toLowerCase().startsWith('bed') ? row.bedId.bedNumber : `Bed ${row.bedId.bedNumber}`) : (row.bedNo ? `Bed ${row.bedNo}` : 'Bed —')}
                            </div>
                            <div className="text-[11px] sm:text-[12px] text-slate-500 mt-0.5 font-medium leading-tight truncate">
                              {row.bedId?.wardId?.name || row.ward || 'General Ward'}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 5. ADMISSION DATE */}
                      <td className="px-3 py-2 sm:py-2.5 align-middle whitespace-nowrap">
                        {admissionDateTime.date === 'Not available' ? (
                          <span className="text-slate-400 italic text-[12px]">Not available</span>
                        ) : (
                          <div className="leading-tight">
                            <div className="text-[12px] sm:text-[13px] font-bold text-slate-900 leading-tight">
                              {admissionDateTime.date}
                            </div>
                            {admissionDateTime.time && (
                              <div className="text-[11px] sm:text-[12px] text-slate-500 mt-0.5 font-medium leading-tight">
                                {admissionDateTime.time}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 6. PRIMARY DOCTOR (Hidden on Doctor Desk) */}
                      {!isDoctorDesk && (
                        <td className="px-3 py-2 sm:py-2.5 align-middle whitespace-nowrap">
                          <div className="text-[12px] sm:text-[13px] font-medium text-slate-700 truncate leading-tight" title={formatDoctor(row.attendingDoctorId)}>
                            {formatDoctor(row.attendingDoctorId)}
                          </div>
                        </td>
                      )}

                      {/* 7. ADMISSION STATUS */}
                      <td className={`pl-3 pr-5 ${isOnlyDischarged ? 'pr-6 sm:pr-8' : ''} py-2 sm:py-2.5 align-middle ${isDoctorDesk ? 'text-left' : 'text-center'} whitespace-nowrap`}>
                        {isDischarged ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold bg-[#f8fafc] border border-slate-200 text-slate-700 shadow-2xs">
                            <Check className="w-3 h-3 text-slate-500 stroke-[2.5]" />
                            <span>Discharged</span>
                          </span>
                        ) : row.status === 'Admitted' ? (
                          isDoctorDesk && (
                            row.dischargeSummaryStatus === 'Sent to Reception' ||
                            row.dischargeSummaryStatus === 'Completed' ||
                            row.raw?.dischargeSummaryStatus === 'Sent to Reception' ||
                            row.raw?.dischargeSummaryStatus === 'Completed' ||
                            row.clinicalDischargeSummary?.status === 'Sent to Reception' ||
                            row.raw?.clinicalDischargeSummary?.status === 'Sent to Reception'
                          ) ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-[12px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs" title="Clinical discharge summary finalized and sent to reception">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>Completed</span>
                            </span>
                          ) : !isDoctorDesk && (
                            row.dischargeSummaryStatus === 'Sent to Reception' ||
                            row.raw?.dischargeSummaryStatus === 'Sent to Reception' ||
                            row.clinicalDischargeSummary?.status === 'Sent to Reception' ||
                            row.raw?.clinicalDischargeSummary?.status === 'Sent to Reception'
                          ) ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-700 shadow-2xs leading-tight" title="Doctor has submitted clinical discharge summary. Ready for billing settlement & discharge.">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                              <span className="flex flex-col text-left leading-tight">
                                <span className="font-bold text-[10.5px]">Pending</span>
                                <span className="font-semibold text-[9.5px]">Discharge</span>
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>Admitted</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold bg-slate-50 border border-slate-200 text-slate-700">
                            <span>{row.status || 'Active'}</span>
                          </span>
                        )}
                      </td>

                      {/* 8. ACTIONS: Consultation & Discharge Buttons */}
                      {!isOnlyDischarged && (
                        <td className="pl-5 pr-4 sm:pr-5 py-2 sm:py-2.5 align-middle text-center whitespace-nowrap">
                          {isDischarged ? (
                            <span className="text-slate-400 text-xs font-medium">—</span>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                              {/* Discharge Button: Primary action on Reception Desk */}
                              {!isDoctorDesk && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDischarge(row);
                                  }}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white border border-[#2F63F2] text-xs font-bold rounded-xl shadow-xs hover:shadow-sm transition-all duration-150 cursor-pointer shrink-0"
                                  title="Discharge patient and release bed"
                                >
                                  <LogOut className="w-3.5 h-3.5 text-white stroke-[2.2] animate-discharge-icon" />
                                  <span>Discharge</span>
                                </button>
                              )}

                              {/* Consultation Button: Primary action on Doctor Desk (Opens Current Consultation Prescription) */}
                              {isDoctorDesk && row.status !== 'Discharged' && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const admId = row._id || row.id || row.admissionId;
                                    try {
                                      if (admId) {
                                        await ipdService.updateAdmissionStatus(admId, { queueStatus: 'In Progress' });
                                        queryClient.invalidateQueries({ queryKey: ['ipd'] });
                                      }
                                    } catch (err) {
                                      console.warn('Could not update queue status:', err);
                                    }
                                    if (admId) {
                                      navigate(`/doctor/consultation/${admId}?type=ipd&mode=consultation`);
                                    }
                                  }}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white border border-[#2F63F2] text-xs font-bold rounded-xl shadow-xs hover:shadow-sm transition-all duration-150 cursor-pointer shrink-0"
                                  title="Open current clinical consultation & prescription workspace"
                                >
                                  <Stethoscope className="w-3.5 h-3.5 stroke-[2.2]" />
                                  <span>Consultation</span>
                                </button>
                              )}

                              {/* Eye Icon Button: IPD Daily Consultation & Prescription Details */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConsultationDrawerAdmission(row);
                                }}
                                className="p-1.5 rounded-xl text-[#2F63F2] hover:bg-blue-50 border border-blue-200/60 shadow-2xs hover:shadow-xs transition-all cursor-pointer group shrink-0"
                                title="IPD Daily Consultation & Prescription Details"
                              >
                                <Eye className="w-4 h-4 stroke-[2.2] group-hover:scale-110 transition-transform text-[#2F63F2]" />
                              </button>

                              {/* Three Dot Menu Button */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleRowDropdown(row._id, e)}
                                className={`p-1.5 rounded-xl transition-all cursor-pointer border ${activeDropdownId === row._id
                                  ? "bg-blue-50 text-[#2F63F2] border-blue-200 shadow-xs"
                                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-slate-200/60 shadow-2xs"
                                  }`}
                                title="More options"
                              >
                                <MoreVertical className="w-4 h-4 stroke-[2]" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>

                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portal Dropdown Menu for Inpatient Row Actions */}
      {activeDropdownId && dropdownPos && (() => {
        const row = filteredAdmissions.find(r => r._id === activeDropdownId);
        if (!row) return null;
        const isDischarged = row.status === 'Discharged';

        return createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] cursor-default bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setActiveDropdownId(null);
                setDropdownPos(null);
              }}
            />
            <div
              ref={dropdownMenuRef}
              className="fixed z-[9999] w-52 bg-white rounded-xl shadow-2xl border border-slate-200/90 py-1.5 text-left font-sans animate-in fade-in zoom-in-95 duration-100"
              style={{
                ...(dropdownPos.top !== undefined ? { top: `${dropdownPos.top}px` } : {}),
                ...(dropdownPos.bottom !== undefined ? { bottom: `${dropdownPos.bottom}px` } : {}),
                right: `${dropdownPos.right}px`,
                maxHeight: 'calc(100vh - 24px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="py-0.5">
                {/* 1. Discharge Summary (Doctor Desk only in 3-dot dropdown) */}
                {isDoctorDesk && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdownId(null);
                      setDropdownPos(null);
                      handleOpenDischarge(row);
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                    <span>Discharge Summary</span>
                  </button>
                )}

                {/* 2. Visit History */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveDropdownId(null);
                    setDropdownPos(null);
                    setVisitHistoryAdmission(row);
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                  <span>Visit History</span>
                </button>

                {/* 3. Consultation Report */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveDropdownId(null);
                    setDropdownPos(null);
                    setConsultationDrawerAdmission(row);
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                  <span>Consultation Report</span>
                </button>

                {/* 4. Admission Details */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveDropdownId(null);
                    setDropdownPos(null);
                    setSelectedWorkspaceAdmission(row);
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                >
                  <Eye className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                  <span>Admission Details</span>
                </button>

                {/* 5. Ward & Bed Allocation */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveDropdownId(null);
                    setDropdownPos(null);
                    navigate(isDoctorDesk ? (ROUTES.DOCTOR?.IPD_WARDS || '/doctor/ipd/wards') : (ROUTES.RECEPTION?.IPD_WARDS || '/reception/ipd/wards'));
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                >
                  <Bed className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                  <span>Ward & Bed Allocation</span>
                </button>
              </div>
            </div>
          </>,
          document.body
        );
      })()}

      {/* ==================================================
          MODAL 1: ENHANCED NEW ADMISSION WORKFLOW
          ================================================== */}
      <Modal
        isOpen={isAdmitModalOpen}
        onClose={resetAdmissionModal}
        title="Admit Patient into IPD"
        size="lg"
        className="!max-w-[530px]"
      >
        <form onSubmit={handleAdmit} className="space-y-3" autoComplete="off">
          {/* Intake Mode Switcher Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setAdmissionMode('existing');
                setFormErrors({});
              }}
              className={`flex-1 py-1.5 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${admissionMode === 'existing'
                ? 'bg-white text-[#2F63F2] shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <UserCheck className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>Existing OPD Patients</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAdmissionMode('new');
                setFormErrors({});
              }}
              className={`flex-1 py-1.5 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${admissionMode === 'new'
                ? 'bg-white text-[#2F63F2] shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <UserPlus className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>Register New Patient</span>
            </button>
          </div>

          {/* ==================== MODE 1: EXISTING PATIENT ==================== */}
          {admissionMode === 'existing' && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
              <div>
                <label className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-tight sm:tracking-wider text-slate-700 flex items-center justify-between sm:inline-flex sm:items-center sm:gap-1 w-full sm:w-auto">
                  <span>Select Patient from Central Registry</span>
                  <span className="text-rose-500 font-bold text-sm sm:text-xs leading-none shrink-0">*</span>
                </label>
                <p className="text-[10.5px] text-slate-500 font-normal mt-0.5">
                  Searches across OPD & Inpatient records
                </p>
              </div>
              <Autocomplete
                fetchOptions={fetchPatients}
                value={selectedPatient}
                onSelect={handlePatientSelect}
                placeholder="Search by Patient Name, UHID, or 10-digit Mobile..."
                icon={Search}
                transformInput={(val) => {
                  const noSpecial = val.replace(/[^a-zA-Z0-9\s]/g, '');
                  return capitalizeWords(noSpecial);
                }}
              />
              {formErrors.patient && (
                <p className="text-xs text-rose-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {formErrors.patient}
                </p>
              )}

              {/* Selected Patient Card */}
              {selectedPatient && (
                <div className="p-2.5 rounded-xl bg-white border border-blue-200/90 shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{selectedPatient.name}</span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100/70 text-[#2F63F2]">
                        {selectedPatient.uhid || 'NO UHID'}
                      </span>
                    </div>
                    {selectedPatient.mobileNumber && (
                      <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {selectedPatient.mobileNumber}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Age / Gender</span>
                      <span className="font-semibold text-slate-700">
                        {selectedPatient.age ? `${selectedPatient.age} yrs` : '—'} / {selectedPatient.gender || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Blood Group</span>
                      <span className="font-semibold text-slate-700">{selectedPatient.bloodGroup || 'Not Specified'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-400 block text-[10px] uppercase">Address</span>
                      <span className="font-medium text-slate-700 truncate block">
                        {selectedPatient.address || (selectedPatient.addresses?.[0] ? `${selectedPatient.addresses[0].city || ''}, ${selectedPatient.addresses[0].state || ''}` : '—')}
                      </span>
                    </div>
                  </div>

                  {/* Warning if patient already has active admission */}
                  {activeAdmissionForSelected && (
                    <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        <strong>Admission Conflict:</strong> Patient currently has an active IPD admission (
                        <strong>{activeAdmissionForSelected.admissionId}</strong>) in Bed{' '}
                        {activeAdmissionForSelected.bedId?.bedNumber || 'Assigned'}.
                      </span>
                    </div>
                  )}

                  {/* Doctor suggestion info banner */}
                  {suggestedDoctorInfo && (
                    <div className="mt-1 p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        Recent OPD Consulting Doctor detected: <strong>{suggestedDoctorInfo.name || 'Doctor'}</strong>. Auto-assigned below.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== MODE 2: REGISTER NEW PATIENT ==================== */}
          {admissionMode === 'new' && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-[#2F63F2]" />
                <span>Patient Demographics</span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-12 gap-2">
                {/* Full Name */}
                <div className="col-span-3 sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Patient full name"
                    value={newPatientForm.name}
                    onChange={(e) => {
                      const noNumbers = e.target.value.replace(/[0-9]/g, '');
                      const formatted = capitalizeWords(noNumbers);
                      setNewPatientForm({ ...newPatientForm, name: formatted });
                      if (formErrors.name) setFormErrors({ ...formErrors, name: null });
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  />
                  {formErrors.name && <p className="text-[11px] text-rose-600 mt-0.5">{formErrors.name}</p>}
                </div>

                {/* Mobile Number */}
                <div className="col-span-3 sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-form-type="other"
                    name="patient_mobile_no"
                    required
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={newPatientForm.mobileNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setNewPatientForm({ ...newPatientForm, mobileNumber: val });
                      if (formErrors.mobileNumber) setFormErrors({ ...formErrors, mobileNumber: null });
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  />
                  {formErrors.mobileNumber && <p className="text-[11px] text-rose-600 mt-0.5">{formErrors.mobileNumber}</p>}
                </div>

                {/* Age (Years): 1 of 3 columns on mobile, 3 of 12 cols (25%) on desktop */}
                <div className="col-span-1 sm:col-span-3 min-w-0">
                  <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Age (Years)">
                    Age (Years) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={2}
                    placeholder="Age"
                    value={newPatientForm.age}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setNewPatientForm({ ...newPatientForm, age: digits });
                      if (formErrors.age) setFormErrors({ ...formErrors, age: null });
                    }}
                    className="w-full h-9 px-2 sm:px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  />
                  {formErrors.age && <p className="text-[10px] text-rose-600 mt-0.5 leading-tight truncate">{formErrors.age}</p>}
                </div>

                {/* Gender: 2 of 3 columns on mobile, 3 of 12 cols (25%) on desktop */}
                <div className="col-span-1 sm:col-span-3 min-w-0">
                  <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Gender">
                    Gender <span className="text-rose-500">*</span>
                  </label>
                  {/* Desktop Native Select - 100% untouched */}
                  <select
                    value={newPatientForm.gender}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                    className="hidden sm:block w-full h-9 px-1.5 sm:px-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>

                  {/* Mobile Custom Dropdown - strictly contained within card without overflow */}
                  <div className="block sm:hidden relative" ref={el => modalDropdownRefs.current['gender'] = el}>
                    <button
                      type="button"
                      onClick={() => setOpenModalDropdown(prev => prev === 'gender' ? null : 'gender')}
                      className={`w-full h-9 px-1.5 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'gender'
                        ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                        : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <span className="truncate">{newPatientForm.gender || 'Male'}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5 transition-transform duration-200 ${openModalDropdown === 'gender' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                    </button>
                    {openModalDropdown === 'gender' && (
                      <div className="absolute left-0 top-full mt-1 min-w-[110px] w-full max-w-[140px] bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1">
                        {['Male', 'Female', 'Other'].map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => {
                              setNewPatientForm({ ...newPatientForm, gender: g });
                              setOpenModalDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${newPatientForm.gender === g ? 'bg-blue-50/80 text-[#2F63F2] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            <span>{g}</span>
                            {newPatientForm.gender === g && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Blood Group: 3 of 3 columns on mobile, 6 of 12 cols (50%) on desktop */}
                <div className="col-span-1 sm:col-span-6 min-w-0" ref={el => modalDropdownRefs.current['bloodGroup'] = el}>
                  <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Blood Group">
                    Blood Group
                  </label>
                  {/* Desktop Native Select - 100% untouched */}
                  <select
                    value={newPatientForm.bloodGroup}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, bloodGroup: e.target.value })}
                    className="hidden sm:block w-full h-9 px-1 sm:px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] truncate"
                  >
                    <option value="">Blood Group</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>

                  {/* Mobile Custom Dropdown - right-aligned, strictly contained within card */}
                  <div className="block sm:hidden relative">
                    <button
                      type="button"
                      onClick={() => setOpenModalDropdown(prev => prev === 'bloodGroup' ? null : 'bloodGroup')}
                      className={`w-full h-9 px-1.5 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'bloodGroup'
                        ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                        : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <span className="truncate">{newPatientForm.bloodGroup || 'Blood Group'}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5 transition-transform duration-200 ${openModalDropdown === 'bloodGroup' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                    </button>

                    {openModalDropdown === 'bloodGroup' && (
                      <div className="absolute right-0 top-full mt-1 min-w-[120px] max-w-[160px] w-auto bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 max-h-48 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setNewPatientForm({ ...newPatientForm, bloodGroup: '' });
                            setOpenModalDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${!newPatientForm.bloodGroup
                            ? 'bg-blue-50/80 text-[#2F63F2] font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span>Blood Group</span>
                          {!newPatientForm.bloodGroup && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                        </button>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                          <button
                            key={bg}
                            type="button"
                            onClick={() => {
                              setNewPatientForm({ ...newPatientForm, bloodGroup: bg });
                              setOpenModalDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${newPatientForm.bloodGroup === bg
                              ? 'bg-blue-50/80 text-[#2F63F2] font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            <span>{bg}</span>
                            {newPatientForm.bloodGroup === bg && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Address / Locality */}
                <div className="col-span-3 sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Address / Locality
                  </label>
                  <input
                    type="text"
                    placeholder="City, locality, or address"
                    value={newPatientForm.address}
                    onChange={(e) => {
                      const formatted = capitalizeWords(e.target.value);
                      setNewPatientForm({ ...newPatientForm, address: formatted });
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  />
                </div>

                {/* Diagnosis */}
                <div className="col-span-3 sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Diagnosis
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acute appendicitis, Hypertension, Trauma..."
                    value={newPatientForm.diagnosis}
                    onChange={(e) => {
                      const noNumbers = e.target.value.replace(/[0-9]/g, '');
                      const formatted = capitalizeWords(noNumbers);
                      setNewPatientForm({ ...newPatientForm, diagnosis: formatted });
                      if (!admitForm.reasonForAdmission || admitForm.reasonForAdmission === newPatientForm.diagnosis) {
                        setAdmitForm((prev) => ({ ...prev, reasonForAdmission: formatted }));
                      }
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ==================== COMMON ADMISSION DETAILS ==================== */}
          <div className="space-y-2.5 pt-0.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-[#2F63F2]" />
              <span>IPD Admission Assignment</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Bed Assignment */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Assign Vacant Bed <span className="text-rose-500">*</span>
                </label>
                {/* Desktop Native Select - 100% untouched */}
                <select
                  required
                  className="hidden sm:block w-full h-9 px-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] outline-none transition-all text-sm font-medium"
                  value={admitForm.bedId}
                  onChange={(e) => {
                    setAdmitForm({ ...admitForm, bedId: e.target.value });
                    if (formErrors.bedId) setFormErrors({ ...formErrors, bedId: null });
                  }}
                >
                  <option value="">-- Select Available Bed --</option>
                  {availableBeds.map(bed => (
                    <option key={bed._id} value={bed._id}>
                      {bed.wardId?.name || 'Ward'} - Bed {bed.bedNumber} ({bed.wardId?.type || 'General'})
                    </option>
                  ))}
                </select>

                {/* Mobile Custom Dropdown - strictly contained within card without overflow */}
                <div className="block sm:hidden relative" ref={el => modalDropdownRefs.current['bedId'] = el}>
                  <button
                    type="button"
                    onClick={() => setOpenModalDropdown(prev => prev === 'bedId' ? null : 'bedId')}
                    className={`w-full h-9 px-3 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'bedId'
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="truncate">
                      {admitForm.bedId
                        ? (() => {
                          const b = availableBeds.find(x => x._id === admitForm.bedId);
                          return b ? `${b.wardId?.name || 'Ward'} - Bed ${b.bedNumber} (${b.wardId?.type || 'General'})` : '-- Select Available Bed --';
                        })()
                        : '-- Select Available Bed --'}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${openModalDropdown === 'bedId' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>
                  {openModalDropdown === 'bedId' && (
                    <div className="absolute left-0 right-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 max-h-52 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setAdmitForm({ ...admitForm, bedId: '' });
                          setOpenModalDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${!admitForm.bedId ? 'bg-blue-50/80 text-[#2F63F2] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <span>-- Select Available Bed --</span>
                        {!admitForm.bedId && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                      </button>
                      {availableBeds.map(bed => {
                        const bedLabel = `${bed.wardId?.name || 'Ward'} - Bed ${bed.bedNumber} (${bed.wardId?.type || 'General'})`;
                        return (
                          <button
                            key={bed._id}
                            type="button"
                            onClick={() => {
                              setAdmitForm({ ...admitForm, bedId: bed._id });
                              if (formErrors.bedId) setFormErrors({ ...formErrors, bedId: null });
                              setOpenModalDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${admitForm.bedId === bed._id ? 'bg-blue-50/80 text-[#2F63F2] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            <span className="truncate">{bedLabel}</span>
                            {admitForm.bedId === bed._id && <Check className="w-3.5 h-3.5 text-[#2F63F2] shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {availableBeds.length === 0 ? (
                  <p className="text-[10.5px] text-amber-600 mt-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    No vacant beds available in hospital wards.
                  </p>
                ) : (
                  <p className="text-[10.5px] text-slate-500 mt-0.5">
                    {availableBeds.length} vacant bed{availableBeds.length > 1 ? 's' : ''} currently available
                  </p>
                )}
                {formErrors.bedId && <p className="text-[11px] text-rose-600 mt-0.5">{formErrors.bedId}</p>}
              </div>

              {/* Attending Doctor */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Attending Doctor <span className="text-rose-500">*</span>
                </label>
                {/* Desktop Native Select - 100% untouched */}
                <select
                  required
                  className="hidden sm:block w-full h-9 px-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] outline-none transition-all text-sm font-medium"
                  value={admitForm.attendingDoctorId}
                  onChange={(e) => {
                    setAdmitForm({ ...admitForm, attendingDoctorId: e.target.value });
                    if (formErrors.attendingDoctorId) setFormErrors({ ...formErrors, attendingDoctorId: null });
                  }}
                >
                  <option value="">-- Select Attending Doctor --</option>
                  {doctors.map(doc => {
                    const name = doc.name || `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
                    const qual = doc.doctorProfile?.qualification ? ` (${doc.doctorProfile.qualification})` : '';
                    return (
                      <option key={doc._id} value={doc._id}>
                        {name.startsWith('Dr.') ? name : `Dr. ${name}`}{qual}
                      </option>
                    );
                  })}
                </select>

                {/* Mobile Custom Dropdown - strictly contained within card without overflow */}
                <div className="block sm:hidden relative" ref={el => modalDropdownRefs.current['attendingDoctorId'] = el}>
                  <button
                    type="button"
                    onClick={() => setOpenModalDropdown(prev => prev === 'attendingDoctorId' ? null : 'attendingDoctorId')}
                    className={`w-full h-9 px-3 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'attendingDoctorId'
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="truncate">
                      {admitForm.attendingDoctorId
                        ? (() => {
                          const d = doctors.find(x => x._id === admitForm.attendingDoctorId);
                          if (!d) return '-- Select Attending Doctor --';
                          const name = d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim();
                          const qual = d.doctorProfile?.qualification ? ` (${d.doctorProfile.qualification})` : '';
                          return `${name.startsWith('Dr.') ? name : `Dr. ${name}`}${qual}`;
                        })()
                        : '-- Select Attending Doctor --'}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${openModalDropdown === 'attendingDoctorId' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>
                  {openModalDropdown === 'attendingDoctorId' && (
                    <div className="absolute left-0 right-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 max-h-52 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setAdmitForm({ ...admitForm, attendingDoctorId: '' });
                          setOpenModalDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${!admitForm.attendingDoctorId ? 'bg-blue-50/80 text-[#2F63F2] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <span>-- Select Attending Doctor --</span>
                        {!admitForm.attendingDoctorId && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                      </button>
                      {doctors.map(doc => {
                        const name = doc.name || `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
                        const qual = doc.doctorProfile?.qualification ? ` (${doc.doctorProfile.qualification})` : '';
                        const docLabel = `${name.startsWith('Dr.') ? name : `Dr. ${name}`}${qual}`;
                        return (
                          <button
                            key={doc._id}
                            type="button"
                            onClick={() => {
                              setAdmitForm({ ...admitForm, attendingDoctorId: doc._id });
                              if (formErrors.attendingDoctorId) setFormErrors({ ...formErrors, attendingDoctorId: null });
                              setOpenModalDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${admitForm.attendingDoctorId === doc._id ? 'bg-blue-50/80 text-[#2F63F2] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            <span className="truncate">{docLabel}</span>
                            {admitForm.attendingDoctorId === doc._id && <Check className="w-3.5 h-3.5 text-[#2F63F2] shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {suggestedDoctorInfo?.id === admitForm.attendingDoctorId && (
                  <p className="text-[10.5px] text-emerald-600 mt-0.5 font-medium">Matched with previous OPD doctor</p>
                )}
                {formErrors.attendingDoctorId && <p className="text-[11px] text-rose-600 mt-0.5">{formErrors.attendingDoctorId}</p>}
              </div>
            </div>

            {/* Admission Details & Financials Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              {/* 1. Admission Type: 1st col on mobile row 1 (col-span-1), full width on desktop (sm:col-span-6) */}
              <div className="col-span-1 sm:col-span-6 min-w-0">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Admission Type">
                  Admission Type <span className="text-rose-500">*</span>
                </label>
                {/* Desktop Native Select - 100% untouched */}
                <select
                  className="hidden sm:block w-full h-9 px-2 sm:px-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] outline-none transition-all text-xs sm:text-sm font-medium truncate"
                  value={admitForm.admissionType}
                  onChange={(e) => setAdmitForm({ ...admitForm, admissionType: e.target.value })}
                >
                  <option value="Routine Admission">Routine Admission</option>
                  <option value="Emergency Admission">Emergency Admission</option>
                  <option value="Transfer Admission">Transfer Admission</option>
                </select>

                {/* Mobile Custom Dropdown - strictly contained within card without overflow */}
                <div className="block sm:hidden relative" ref={el => modalDropdownRefs.current['admissionType'] = el}>
                  <button
                    type="button"
                    onClick={() => setOpenModalDropdown(prev => prev === 'admissionType' ? null : 'admissionType')}
                    className={`w-full h-9 px-2 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'admissionType'
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="truncate">{admitForm.admissionType || 'Routine Admission'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5 transition-transform duration-200 ${openModalDropdown === 'admissionType' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>
                  {openModalDropdown === 'admissionType' && (
                    <div className="absolute left-0 top-full mt-1 min-w-[150px] w-full max-w-[200px] bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1">
                      {['Routine Admission', 'Emergency Admission', 'Transfer Admission'].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setAdmitForm({ ...admitForm, admissionType: type });
                            setOpenModalDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${admitForm.admissionType === type ? 'bg-blue-50/80 text-[#2F63F2] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span className="truncate">{type}</span>
                          {admitForm.admissionType === type && <Check className="w-3.5 h-3.5 text-[#2F63F2] shrink-0 ml-1" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Date of Admission: 2nd col on mobile row 1 (col-span-1), 50% on desktop row 2 (sm:col-span-3) */}
              <div className="col-span-1 sm:col-span-3 min-w-0">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Date of Admission">
                  Date of Admission <span className="text-rose-500">*</span>
                </label>
                {/* Desktop Native Input - 100% untouched */}
                <input
                  type="date"
                  required
                  value={admitForm.admissionDate}
                  onChange={(e) => setAdmitForm({ ...admitForm, admissionDate: e.target.value })}
                  className="hidden sm:block w-full h-9 px-2 sm:px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                />

                {/* Mobile Custom Dropdown - right-aligned, strictly contained within card without overflow */}
                <div className="block sm:hidden relative" ref={el => modalDropdownRefs.current['admissionDate'] = el}>
                  <button
                    type="button"
                    onClick={() => {
                      if (openModalDropdown === 'admissionDate') {
                        setOpenModalDropdown(null);
                      } else {
                        if (admitForm.admissionDate) {
                          const parts = admitForm.admissionDate.split('-');
                          if (parts.length === 3) {
                            setCalendarMonth(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1));
                          }
                        }
                        setOpenModalDropdown('admissionDate');
                      }
                    }}
                    className={`w-full h-9 px-2 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'admissionDate'
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="flex items-center gap-1.5 truncate text-slate-800">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{formatDateDisplay(admitForm.admissionDate)}</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5 transition-transform duration-200 ${openModalDropdown === 'admissionDate' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>

                  {openModalDropdown === 'admissionDate' && (() => {
                    const monthNames = [
                      'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'
                    ];
                    const currentCalYear = calendarMonth.getFullYear();
                    const currentCalMonth = calendarMonth.getMonth();
                    const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
                    const firstDayOfWeek = new Date(currentCalYear, currentCalMonth, 1).getDay();
                    const todayStr = new Date().toISOString().split('T')[0];

                    return (
                      <div className="absolute right-0 top-full mt-1 w-[240px] max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2.5">
                        {/* Month & Year header */}
                        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                          <span className="text-xs font-bold text-slate-800">
                            {monthNames[currentCalMonth]} {currentCalYear}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                              title="Previous Month"
                            >
                              <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                              title="Next Month"
                            >
                              <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                            </button>
                          </div>
                        </div>

                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 gap-1 text-center mb-1">
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                            <span key={day} className="text-[10px] font-bold text-slate-400 uppercase">
                              {day}
                            </span>
                          ))}
                        </div>

                        {/* Days grid */}
                        <div className="grid grid-cols-7 gap-1 text-center">
                          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                            <div key={`empty-${i}`} className="w-7 h-7" />
                          ))}
                          {Array.from({ length: daysInMonth }).map((_, i) => {
                            const dayNum = i + 1;
                            const dayStr = `${currentCalYear}-${String(currentCalMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                            const isSelected = admitForm.admissionDate === dayStr;
                            const isToday = todayStr === dayStr;
                            return (
                              <button
                                key={dayNum}
                                type="button"
                                onClick={() => {
                                  setAdmitForm({ ...admitForm, admissionDate: dayStr });
                                  setOpenModalDropdown(null);
                                }}
                                className={`w-7 h-7 mx-auto rounded-lg text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${isSelected
                                  ? 'bg-[#2F63F2] text-white shadow-xs'
                                  : isToday
                                    ? 'border border-[#2F63F2] text-[#2F63F2] bg-blue-50/50 hover:bg-blue-100/50'
                                    : 'text-slate-700 hover:bg-slate-100'
                                  }`}
                              >
                                {dayNum}
                              </button>
                            );
                          })}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              setAdmitForm({ ...admitForm, admissionDate: todayStr });
                              setCalendarMonth(new Date());
                              setOpenModalDropdown(null);
                            }}
                            className="font-bold text-[#2F63F2] hover:text-blue-700 transition-colors cursor-pointer"
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenModalDropdown(null)}
                            className="font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 3. Time: 1st col on mobile row 2 (col-span-1), 50% on desktop row 2 (sm:col-span-3) */}
              <div className="col-span-1 sm:col-span-3 min-w-0">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Time">
                  Time <span className="text-rose-500">*</span>
                </label>
                {/* Desktop Native Input - 100% untouched */}
                <input
                  type="time"
                  required
                  value={admitForm.admissionTime}
                  onChange={(e) => setAdmitForm({ ...admitForm, admissionTime: e.target.value })}
                  className="hidden sm:block w-full h-9 px-2 sm:px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                />

                {/* Mobile Custom Dropdown - left-aligned, strictly contained within card without overflow */}
                <div className="block sm:hidden relative" ref={el => modalDropdownRefs.current['admissionTime'] = el}>
                  <button
                    type="button"
                    onClick={() => setOpenModalDropdown(prev => prev === 'admissionTime' ? null : 'admissionTime')}
                    className={`w-full h-9 px-2 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'admissionTime'
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="flex items-center gap-1.5 truncate text-slate-800">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{formatTimeDisplay(admitForm.admissionTime)}</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5 transition-transform duration-200 ${openModalDropdown === 'admissionTime' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>

                  {openModalDropdown === 'admissionTime' && (() => {
                    const currentHour = admitForm.admissionTime ? admitForm.admissionTime.split(':')[0] || '12' : '12';
                    const currentMinute = admitForm.admissionTime ? admitForm.admissionTime.split(':')[1] || '00' : '00';

                    return (
                      <div className="absolute left-0 top-full mt-1 w-[200px] max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2.5">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                          <span className="text-[11px] font-bold uppercase text-slate-700 tracking-wider">Select Time</span>
                          <button
                            type="button"
                            onClick={() => {
                              const now = new Date();
                              const hh = String(now.getHours()).padStart(2, '0');
                              const mm = String(now.getMinutes()).padStart(2, '0');
                              setAdmitForm({ ...admitForm, admissionTime: `${hh}:${mm}` });
                            }}
                            className="text-[10.5px] font-bold text-[#2F63F2] hover:text-blue-700 transition-colors cursor-pointer"
                          >
                            Current Time
                          </button>
                        </div>

                        {/* 2 Scrollable Columns: Hour & Minute */}
                        <div className="grid grid-cols-2 gap-2 text-center">
                          {/* Hours Column */}
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Hour</span>
                            <div className="h-40 overflow-y-auto space-y-1 pr-0.5 border border-slate-100 rounded-lg p-1 bg-slate-50/50">
                              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => {
                                const isSelected = currentHour === h;
                                return (
                                  <button
                                    key={h}
                                    type="button"
                                    onClick={() => {
                                      const minPart = admitForm.admissionTime ? admitForm.admissionTime.split(':')[1] || '00' : '00';
                                      setAdmitForm({ ...admitForm, admissionTime: `${h}:${minPart}` });
                                    }}
                                    className={`w-full py-1 text-xs rounded-md font-semibold transition-colors cursor-pointer ${isSelected
                                      ? 'bg-[#2F63F2] text-white shadow-xs'
                                      : 'text-slate-700 hover:bg-white'
                                      }`}
                                  >
                                    {h}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Minutes Column */}
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Minute</span>
                            <div className="h-40 overflow-y-auto space-y-1 pr-0.5 border border-slate-100 rounded-lg p-1 bg-slate-50/50">
                              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => {
                                const isSelected = currentMinute === m;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                      const hrPart = admitForm.admissionTime ? admitForm.admissionTime.split(':')[0] || '12' : '12';
                                      setAdmitForm({ ...admitForm, admissionTime: `${hrPart}:${m}` });
                                    }}
                                    className={`w-full py-1 text-xs rounded-md font-semibold transition-colors cursor-pointer ${isSelected
                                      ? 'bg-[#2F63F2] text-white shadow-xs'
                                      : 'text-slate-700 hover:bg-white'
                                      }`}
                                  >
                                    {m}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                          <span className="font-bold text-slate-800">
                            {formatTimeDisplay(admitForm.admissionTime)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setOpenModalDropdown(null)}
                            className="px-2.5 py-1 rounded-md bg-[#2F63F2] hover:bg-blue-600 text-white font-bold text-xs transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 4. Total Bill: 2nd col on mobile row 2 (col-span-1), 1/3 on desktop row 3 (sm:col-span-2) */}
              <div className="col-span-1 sm:col-span-2 min-w-0">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Total Bill">
                  Total Bill
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-xs sm:text-sm">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={admitForm.totalBill}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                      setAdmitForm({ ...admitForm, totalBill: val });
                    }}
                    className="w-full h-9 pl-6 sm:pl-7 pr-2 sm:pr-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  />
                </div>
              </div>

              {/* 5. Amount Mode: 1st col on mobile row 3 (col-span-1), 1/3 on desktop row 3 (sm:col-span-2) */}
              <div className="col-span-1 sm:col-span-2 min-w-0">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Amount Mode">
                  Amount Mode <span className="text-rose-500">*</span>
                </label>
                {/* Desktop Native Select - 100% untouched */}
                <select
                  required
                  value={admitForm.amountMode}
                  onChange={(e) => setAdmitForm({ ...admitForm, amountMode: e.target.value })}
                  className="hidden sm:block w-full h-9 px-2 sm:px-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] outline-none transition-all text-xs sm:text-sm font-medium truncate"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / Online</option>
                  <option value="Card">Debit / Credit Card</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Insurance">Insurance / TPA</option>
                </select>

                {/* Mobile Custom Dropdown - strictly contained within card without overflow */}
                <div className="block sm:hidden relative" ref={el => modalDropdownRefs.current['amountMode'] = el}>
                  <button
                    type="button"
                    onClick={() => setOpenModalDropdown(prev => prev === 'amountMode' ? null : 'amountMode')}
                    className={`w-full h-9 px-2 rounded-lg border bg-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${openModalDropdown === 'amountMode'
                      ? 'border-[#2F63F2] ring-2 ring-[#2F63F2]/20'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <span className="truncate">{admitForm.amountMode || 'Cash'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5 transition-transform duration-200 ${openModalDropdown === 'amountMode' ? 'rotate-180 text-[#2F63F2]' : ''}`} />
                  </button>
                  {openModalDropdown === 'amountMode' && (
                    <div className="absolute left-0 top-full mt-1 min-w-[140px] w-full max-w-[180px] bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 max-h-52 overflow-y-auto">
                      {[
                        { value: 'Cash', label: 'Cash' },
                        { value: 'UPI', label: 'UPI / Online' },
                        { value: 'Card', label: 'Debit / Credit Card' },
                        { value: 'Net Banking', label: 'Net Banking' },
                        { value: 'Cheque', label: 'Cheque' },
                        { value: 'Insurance', label: 'Insurance / TPA' }
                      ].map(mode => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => {
                            setAdmitForm({ ...admitForm, amountMode: mode.value });
                            setOpenModalDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${admitForm.amountMode === mode.value ? 'bg-blue-50/80 text-[#2F63F2] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span className="truncate">{mode.label}</span>
                          {admitForm.amountMode === mode.value && <Check className="w-3.5 h-3.5 text-[#2F63F2] shrink-0 ml-1" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Amount Paid: 2nd col on mobile row 3 (col-span-1), 1/3 on desktop row 3 (sm:col-span-2) */}
              <div className="col-span-1 sm:col-span-2 min-w-0">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5 truncate" title="Amount Paid">
                  Amount Paid
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-xs sm:text-sm">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={admitForm.amountPaid}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                      setAdmitForm({ ...admitForm, amountPaid: val });
                    }}
                    className="w-full h-9 pl-6 sm:pl-7 pr-2 sm:pr-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                  />
                </div>
              </div>
            </div>

            {/* Reason for Admission */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                Reason for Admission
              </label>
              <input
                type="text"
                placeholder="e.g. Acute appendicitis observation, Post-operative recovery, Severe fever..."
                value={admitForm.reasonForAdmission}
                onChange={(e) => {
                  const noNumbers = e.target.value.replace(/[0-9]/g, '');
                  const formatted = capitalizeWords(noNumbers);
                  setAdmitForm({ ...admitForm, reasonForAdmission: formatted });
                  if (formErrors.reasonForAdmission) setFormErrors({ ...formErrors, reasonForAdmission: null });
                }}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
              />
              {formErrors.reasonForAdmission && <p className="text-[11px] text-rose-600 mt-0.5">{formErrors.reasonForAdmission}</p>}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={resetAdmissionModal}
              className="px-4 py-2 border border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-blue-50 active:bg-blue-100 font-bold rounded-xl transition-all text-xs uppercase tracking-wider cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={admitMutation.isPending || (admissionMode === 'existing' && activeAdmissionForSelected)}
              className="px-4 py-1.5 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-lg shadow-xs transition-colors text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {admitMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Admission...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Confirm Admission</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================================================
          MODAL 2: INPATIENT DETAILS VIEW (UNIFIED)
          ================================================== */}
      {selectedWorkspaceAdmission && (
        <InpatientDetailsModal
          isOpen={Boolean(selectedWorkspaceAdmission)}
          onClose={() => setSelectedWorkspaceAdmission(null)}
          admission={selectedWorkspaceAdmission}
          isDoctorDesk={isDoctorDesk}
          onOpenDoctorRound={(adm) => {
            setSelectedWorkspaceAdmission(null);
            setConsultationDrawerAdmission(adm);
          }}
          onOpenDischarge={(adm) => {
            setSelectedWorkspaceAdmission(null);
            handleOpenDischarge(adm);
          }}
        />
      )}

      {/* ==================================================
          MODAL 3: DISCHARGE PATIENT FROM IPD (DOCTOR DESK: CLINICAL SUMMARY, RECEPTION DESK: BILLING WORKSPACE)
          ================================================== */}
      {dischargeModalAdmission && (
        isDoctorDesk ? (
          <IPDDoctorDischargeSummaryModal
            isOpen={Boolean(dischargeModalAdmission)}
            onClose={() => setDischargeModalAdmission(null)}
            admission={dischargeModalAdmission}
            user={user}
            onAdmissionUpdated={(updated) => {
              setDischargeModalAdmission(null);
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });
            }}
          />
        ) : (
          <IPDDischargeWorkspaceModal
            isOpen={Boolean(dischargeModalAdmission)}
            onClose={() => setDischargeModalAdmission(null)}
            admission={dischargeModalAdmission}
            initialMode={dischargeModalMode}
            user={user}
            onAdmissionUpdated={(updated) => {
              setDischargeModalAdmission(null);
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });
            }}
          />
        )
      )}
      {/* IPD Daily Consultation & Prescription Modal */}
      {consultationDrawerAdmission && (
        <IPDDailyConsultationModal
          isOpen={Boolean(consultationDrawerAdmission)}
          onClose={() => {
            setConsultationDrawerAdmission(null);
            setIsOpdHistoryDrawerOpen(false);
          }}
          admission={consultationDrawerAdmission}
          user={user}
          onOpenOpdHistory={() => setIsOpdHistoryDrawerOpen(true)}
          onSuccess={(updated) => {
            queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
            queryClient.invalidateQueries({ queryKey: ['ipd', 'dashboardLiveStatus'] });
          }}
        />
      )}

      {/* Patient OPD & IPD Consultation Clinical History Drawer */}
      <PatientHistoryDrawer
        isOpen={Boolean(visitHistoryAdmission || (isOpdHistoryDrawerOpen && consultationDrawerAdmission))}
        onClose={() => {
          setVisitHistoryAdmission(null);
          setIsOpdHistoryDrawerOpen(false);
        }}
        isLoading={isLoadingConsultationHistory}
        patient={effectiveDrawerPatient}
        patientHistory={effectivePatientHistory}
      />
    </div>
  );
};

export default Inpatients;
