import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, 
  ChevronDown, 
  Check, 
  RefreshCw, 
  AlertCircle,
  FileText,
  Bed,
  Calendar,
  HeartPulse,
  Printer,
  Clock,
  UserCheck,
  ArrowLeft,
  Eye,
  ClipboardList,
  MoreVertical,
  Stethoscope
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../../components/Modal';
import Input from '../../components/Input';
import workflowRealtimeService from '../../services/workflowRealtimeService';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { isIpdAvailable } from '../../utils/featureUtils';
import { motion } from 'framer-motion';
import IPDDischargeWorkspaceModal from '../../components/ipd/IPDDischargeWorkspaceModal';
import IPDDoctorDischargeSummaryModal from '../../components/ipd/IPDDoctorDischargeSummaryModal';
import InpatientDetailsModal from '../../components/ipd/InpatientDetailsModal';
import IPDDailyConsultationModal from '../../components/ipd/IPDDailyConsultationModal';
import PatientHistoryDrawer from '../../components/PatientHistoryDrawer';

const Discharge = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

  // Scoping logic: Doctor Desk shows doctor's assigned/visited patients; Receptionist Desk shows all
  const isDoctorDesk = location.pathname.startsWith('/doctor') || (user?.roleId?.name === 'DOCTOR' && !location.pathname.startsWith('/reception'));

  // Search & Refresh state
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states
  const [selectedAdmissionDetail, setSelectedAdmissionDetail] = useState(null);
  const [selectedWorkspaceAdmission, setSelectedWorkspaceAdmission] = useState(null);
  const [selectedDailyConsultationAdmission, setSelectedDailyConsultationAdmission] = useState(null);
  const [visitHistoryAdmission, setVisitHistoryAdmission] = useState(null);

  // Three-dot action dropdown state for table rows
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
      const menuWidth = 224; // w-56 (224px)
      const menuHeight = 200;
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
    const handleClose = () => {
      setActiveDropdownId(null);
      setDropdownPos(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, []);

  // Discharge processing form state (inside workspace)
  const [dischargeForm, setDischargeForm] = useState({
    finalDiagnosis: '',
    dischargeSummary: ''
  });

  // 1. Fetch IPD Discharged Admissions (Doctor Desk: scoped to doctor; Reception Desk: all discharged patients)
  const { 
    data: admissions = [], 
    isLoading, 
    isError, 
    error,
    refetch 
  } = useQuery({
    queryKey: ['ipd-admissions-discharge', isDoctorDesk ? (user?._id || 'doctor') : 'all'],
    queryFn: async () => {
      const url = isDoctorDesk && user?._id
        ? `/ipd/admissions?status=Discharged&doctorId=${user._id}`
        : '/ipd/admissions?status=Discharged';
      const res = await api.get(url);
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries(['ipd-beds'])
      ]);
      toast.success('Discharge history refreshed');
    } catch {
      toast.error('Failed to refresh discharge history');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Doctor Formatter helper
  const formatDoctor = (doc) => {
    if (!doc) return 'Not Assigned';
    let name = doc.name;
    if (!name && doc.firstName) {
      name = `${doc.firstName} ${doc.lastName || ''}`.trim();
    }
    if (!name) return 'Not Assigned';
    name = name.replace(/^Dr\.?\s*/i, '');
    const prefix = `Dr. ${name}`;
    const qualification = doc.doctorProfile?.qualification ? `, ${doc.doctorProfile.qualification}` : '';
    return `${prefix}${qualification}`;
  };

  // Formatter for date and time
  const formatDateTime = (dateVal, timeVal) => {
    if (!dateVal) return { date: '—', time: null };
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return { date: '—', time: null };

    const dateStr = d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    let timeStr = null;
    if (timeVal && typeof timeVal === 'string' && timeVal.trim()) {
      const trimmed = timeVal.trim();
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

  // Display only original live records from the database without duplicate or mock data
  const displayAdmissions = useMemo(() => {
    if (!Array.isArray(admissions)) return [];
    const seen = new Set();
    return admissions.filter(item => {
      const key = item._id ? String(item._id) : (item.admissionId || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [admissions]);

  const consultationPatientId = visitHistoryAdmission?.patientId?._id 
    || (typeof visitHistoryAdmission?.patientId === 'string' ? visitHistoryAdmission?.patientId : null)
    || visitHistoryAdmission?.raw?.patientId?._id
    || visitHistoryAdmission?.raw?.patientId;

  // Complete consultation history query for Consultation Reports
  const {
    data: patientConsultationData,
    isLoading: isLoadingConsultationHistory
  } = useQuery({
    queryKey: ['dischargeConsultationHistory', consultationPatientId],
    queryFn: async () => {
      if (!consultationPatientId) return null;
      const res = await api.get(`/operations/patients/${consultationPatientId}/history`);
      return res.data?.data || null;
    },
    enabled: Boolean(isIpdEnabled && visitHistoryAdmission && consultationPatientId),
    staleTime: 0
  });

  const effectiveDrawerPatient = useMemo(() => {
    if (!visitHistoryAdmission) return null;
    const p = typeof visitHistoryAdmission.patientId === 'object' && visitHistoryAdmission.patientId !== null
      ? visitHistoryAdmission.patientId
      : (typeof visitHistoryAdmission.raw?.patientId === 'object' ? visitHistoryAdmission.raw.patientId : null);
    const pFromHistory = patientConsultationData?.patient;
    const row = visitHistoryAdmission;

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
  }, [visitHistoryAdmission, patientConsultationData]);

  // Synthesize history with current IPD admission encounter and daily reviews
  const effectivePatientHistory = useMemo(() => {
    if (!visitHistoryAdmission) return null;
    const rawHistory = patientConsultationData || {};
    const existingConsultations = [...(rawHistory.consultations || [])];

    const adm = visitHistoryAdmission.raw || visitHistoryAdmission;

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

    // 2. Add Inpatient Admission card if not already in existingConsultations
    const hasAdmissionEncounter = existingConsultations.some(c =>
      String(c._id) === String(adm._id) || String(c.admissionId) === String(adm.admissionId)
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

    const existingIds = new Set(existingConsultations.map(c => String(c._id)));
    const newDailyCards = dailyConsultationCards.filter(c => !existingIds.has(String(c._id)));

    const combinedList = [...newDailyCards, ...admissionEncounterCards, ...existingConsultations];
    combinedList.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    return {
      ...rawHistory,
      consultations: combinedList,
      snapshots: combinedList
    };
  }, [visitHistoryAdmission, patientConsultationData]);

  // Filter discharged admissions based on search query
  const filteredAdmissions = useMemo(() => {
    return displayAdmissions
      .filter(item => item.status === 'Discharged')
      .filter(item => {
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

        // Search Query (Patient Name, Bed, IPD ID, UHID, Mobile, Doctor, Diagnosis)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const pName = item.patientId?.name?.toLowerCase() || '';
          const uhid = item.patientId?.uhid?.toLowerCase() || '';
          const ipdId = item.admissionId?.toLowerCase() || '';
          const bedNum = item.bedId?.bedNumber?.toLowerCase() || '';
          const wardName = item.bedId?.wardId?.name?.toLowerCase() || '';
          const phone = item.patientId?.mobileNumber?.toLowerCase() || '';
          const docName = formatDoctor(item.attendingDoctorId).toLowerCase();
          const diag = (item.finalDiagnosis || item.reasonForAdmission || '').toLowerCase();

          const matches = 
            pName.includes(q) ||
            uhid.includes(q) ||
            ipdId.includes(q) ||
            bedNum.includes(q) ||
            wardName.includes(q) ||
            phone.includes(q) ||
            docName.includes(q) ||
            diag.includes(q);

          if (!matches) return false;
        }

        return true;
      });
  }, [displayAdmissions, searchQuery]);

  // Discharge Mutation
  const dischargeMutation = useMutation({
    mutationFn: async ({ admissionId, data }) => {
      return api.put(`/ipd/admissions/${admissionId}/discharge`, data);
    },
    onSuccess: (res) => {
      toast.success('Patient discharged and bed released successfully');
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });
      queryClient.invalidateQueries({ queryKey: ['ipd', 'dashboardLiveStatus'] });
      try {
        workflowRealtimeService.broadcastLocalEvent('IPD_ADMISSION_DISCHARGED', res?.data);
      } catch (e) {}
      if (selectedWorkspaceAdmission && res.data) {
        setSelectedWorkspaceAdmission(res.data);
      } else {
        setSelectedWorkspaceAdmission(null);
      }
      setDischargeForm({ finalDiagnosis: '', dischargeSummary: '' });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Error processing discharge');
    }
  });

  const handleConfirmDischarge = (e) => {
    e.preventDefault();
    if (!selectedWorkspaceAdmission) return;
    if (!dischargeForm.finalDiagnosis.trim()) {
      return toast.error('Please enter the final diagnosis');
    }
    if (!dischargeForm.dischargeSummary.trim()) {
      return toast.error('Please enter the discharge summary');
    }

    dischargeMutation.mutate({
      admissionId: selectedWorkspaceAdmission._id,
      data: dischargeForm
    });
  };

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
    <div className="min-h-screen bg-[#f8fafc] px-4 sm:px-6 lg:px-8 pt-1 sm:pt-2 pb-6 space-y-6 -mt-2 sm:-mt-4">
      {/* ==================================================
          SECTION 1: PAGE HEADER (MATCHING REFERENCE IMAGE)
          ================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#2F63F2] uppercase tracking-wider mb-0.5">
            <Bed className="w-3.5 h-3.5 text-[#2F63F2]" />
            In-Patient Department
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Discharge History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5">
            View all discharged patients
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:gap-2.5 sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => navigate(isDoctorDesk ? (ROUTES.DOCTOR?.IPD_INPATIENTS || '/doctor/ipd/inpatients') : (ROUTES.RECEPTION?.IPD_INPATIENTS || '/reception/ipd/inpatients'))}
            className="w-full sm:w-auto group inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 h-9 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-[11px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wider rounded-lg shadow-xs transition-all duration-150 cursor-pointer truncate"
            title="Back to IPD Patients Directory"
          >
            <motion.span
              className="inline-flex items-center"
              animate={{ x: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[2.2] shrink-0" />
            </motion.span>
            <span className="truncate">Inpatient</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 h-9 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-[11px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wider rounded-lg shadow-xs transition-all duration-150 cursor-pointer disabled:opacity-60 truncate"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-white stroke-[2.2] shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="truncate">Refresh</span>
          </button>
        </div>
      </div>

      {/* ==================================================
          SECTION 2: SEARCH & FILTER CARD
          ================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Patient Name, Bed, ID, Doctor, Diagnosis..."
            className="w-full h-10 pl-9 pr-4 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2F63F2] focus:border-[#2F63F2] transition-all"
          />
        </div>

        {/* Total Discharged Count Badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700">
            <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
            <span>Discharged Records: <strong className="text-slate-900">{filteredAdmissions.length}</strong></span>
          </span>
        </div>
      </div>

      {/* ==================================================
          SECTION 3: DISCHARGED PATIENTS TABLE CARD
          ================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Loading State */}
        {isLoading && (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#2F63F2] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading discharge records...</p>
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <div className="py-12 px-6 text-center space-y-3">
            <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Failed to load discharge records</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {error?.response?.data?.message || error?.message || 'Server error occurred while fetching admissions.'}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Discharge Table matching reference image */}
        {!isLoading && !isError && (
          <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            <table className="w-full min-w-[1150px] text-left border-collapse table-fixed">
              <thead>
                <tr className="border-b border-slate-100 bg-white h-12">
                  <th className={`${isDoctorDesk ? 'w-[12%] min-w-[110px]' : 'w-[11%] min-w-[110px]'} pl-5 sm:pl-6 pr-2 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap text-left`}>
                    IPD / UHID
                  </th>
                  <th className={`${isDoctorDesk ? 'w-[18%] min-w-[155px]' : 'w-[16%] min-w-[155px]'} pl-7 sm:pl-9 pr-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap text-left`}>
                    PATIENT NAME
                  </th>
                  <th className={`${isDoctorDesk ? 'w-[11%] min-w-[95px]' : 'w-[9%] min-w-[90px]'} px-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap text-left`}>
                    AGE / GENDER
                  </th>
                  <th className={`${isDoctorDesk ? 'w-[12%] min-w-[105px]' : 'w-[10%] min-w-[105px]'} px-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap text-left`}>
                    BED & WARD NO
                  </th>
                  <th className={`${isDoctorDesk ? 'w-[12%] min-w-[105px]' : 'w-[11%] min-w-[105px]'} px-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap text-left`}>
                    ADMISSION DATE
                  </th>
                  <th className={`${isDoctorDesk ? 'w-[12%] min-w-[105px]' : 'w-[11%] min-w-[105px]'} px-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap text-left`}>
                    DISCHARGE DATE
                  </th>
                  {!isDoctorDesk && (
                    <th className="w-[11%] min-w-[110px] px-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap text-left">
                      PRIMARY DOCTOR
                    </th>
                  )}
                  <th className={`${isDoctorDesk ? 'w-[12%] min-w-[135px] pl-3 pr-6 sm:pr-8 text-left' : 'w-[12%] min-w-[135px] pl-2 pr-6 sm:pr-8 text-center'} py-3 text-[11px] font-bold text-slate-600 tracking-normal uppercase whitespace-nowrap`}>
                    PAYMENT STATUS
                  </th>
                  <th className={`${isDoctorDesk ? 'w-[11%] min-w-[120px] pl-6 sm:pl-8' : 'w-[11%] min-w-[125px] pl-6 sm:pl-8'} pr-5 sm:pr-6 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-center whitespace-nowrap`}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdmissions.length === 0 ? (
                  <tr>
                    <td colSpan={isDoctorDesk ? 8 : 9} className="py-12 text-center text-slate-400 text-xs">
                      {searchQuery.trim()
                        ? 'No discharged patients match your search.'
                        : 'No discharged patient records found.'}
                    </td>
                  </tr>
                ) : (
                  filteredAdmissions.map((row) => {
                    const patient = row.patientId || {};
                    const phoneFormatted = patient.mobileNumber
                       ? `${patient.countryCode || '+91'} ${patient.mobileNumber}`
                       : '—';
                    const admTime = formatDateTime(row.admissionDate, row.admissionTime);
                    const disTime = formatDateTime(row.dischargeDate, row.dischargeTime);
                    const totBill = Number(row.billingDetails?.totalBill) || 0;
                    const paidAmt = Number(row.amountPaid) || 0;
                    const isFullyPaid = row.paymentStatus === 'Paid' || (totBill > 0 && paidAmt >= totBill) || row.billingDetails?.settlementException?.reason?.toLowerCase().includes('fully settled');
                    const isPartiallyPaid = !isFullyPaid && (row.paymentStatus === 'Partially Paid' || (paidAmt > 0 && paidAmt < totBill));
                    const bedDisplay = row.bedId?.bedNumber
                      ? (String(row.bedId.bedNumber).toLowerCase().startsWith('bed') ? row.bedId.bedNumber : `Bed ${row.bedId.bedNumber}`)
                      : (row.bedNo ? (String(row.bedNo).toLowerCase().startsWith('bed') ? row.bedNo : `Bed ${row.bedNo}`) : '—');
                    const wardDisplay = row.bedId?.wardId?.name || row.ward || '—';

                    return (
                      <tr key={row._id} className="group hover:bg-slate-50/70 transition-colors">
                        {/* COLUMN 1: IPD / UHID */}
                        <td className="pl-5 sm:pl-6 pr-2 py-2.5 sm:py-3 align-middle whitespace-nowrap text-left">
                          <button
                            type="button"
                            onClick={() => setSelectedAdmissionDetail(row)}
                            className="text-left font-semibold text-xs sm:text-sm text-[#2F63F2] hover:underline block leading-tight font-mono cursor-pointer"
                            title="Click to view full admission details"
                          >
                            {row.admissionId || '—'}
                          </button>
                          <span className="text-[11px] text-slate-400 block tracking-tight font-medium mt-1 leading-tight">
                            {patient.uhid || '—'}
                          </span>
                        </td>

                        {/* COLUMN 2: PATIENT NAME */}
                        <td className="pl-7 sm:pl-9 pr-3 py-2.5 sm:py-3 align-middle whitespace-nowrap text-left">
                          <div className="flex flex-col items-start justify-center text-left">
                            <button
                              type="button"
                              onClick={() => setSelectedAdmissionDetail(row)}
                              className="text-left inline-flex flex-col items-start font-bold text-xs sm:text-sm text-slate-900 hover:text-[#2F63F2] truncate leading-tight cursor-pointer"
                              title="Click to view full admission details"
                            >
                              <span className="block text-left">{patient.name || '—'}</span>
                              <span className="text-xs text-slate-500 block mt-1 font-normal truncate leading-tight text-left">
                                {phoneFormatted}
                              </span>
                            </button>
                          </div>
                        </td>

                        {/* COLUMN 3: AGE / GENDER & BLOOD GROUP */}
                        <td className="px-3 py-2.5 sm:py-3 align-middle whitespace-nowrap text-left">
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-xs sm:text-sm font-semibold text-slate-700 leading-tight">
                              {patient.age ? `${patient.age} yrs` : '—'} / {patient.gender ? (patient.gender.length === 1 ? patient.gender.toUpperCase() : patient.gender.charAt(0).toUpperCase()) : '—'}
                            </span>
                            {(patient.bloodGroup || row.bloodGroup) && (patient.bloodGroup || row.bloodGroup) !== 'Unknown' && (patient.bloodGroup || row.bloodGroup) !== 'N/A' ? (
                              <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight">
                                {patient.bloodGroup || row.bloodGroup}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px] font-medium leading-tight">—</span>
                            )}
                          </div>
                        </td>

                        {/* COLUMN 4: BED & WARD NO */}
                        <td className="px-3 py-2.5 sm:py-3 align-middle whitespace-nowrap text-left">
                          <div className="leading-tight">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate" title={`${wardDisplay} - ${bedDisplay}`}>
                              {bedDisplay}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 font-medium leading-tight truncate">
                              {wardDisplay}
                            </div>
                          </div>
                        </td>

                        {/* COLUMN 5: ADMISSION DATE */}
                        <td className="px-3 py-2.5 sm:py-3 align-middle whitespace-nowrap text-left">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                            {admTime.date}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-medium leading-tight">
                            {admTime.time || '—'}
                          </div>
                        </td>

                        {/* COLUMN 6: DISCHARGE DATE */}
                        <td className="px-3 py-2.5 sm:py-3 align-middle whitespace-nowrap text-left">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                            {disTime.date}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-medium leading-tight">
                            {disTime.time || '—'}
                          </div>
                        </td>

                        {/* COLUMN 7: PRIMARY DOCTOR (Hidden on Doctor Desk) */}
                        {!isDoctorDesk && (
                          <td className="px-3 py-2.5 sm:py-3 align-middle whitespace-nowrap text-left">
                            <span className="text-xs sm:text-sm text-slate-800 font-semibold truncate block leading-tight">
                              {formatDoctor(row.attendingDoctorId)}
                            </span>
                          </td>
                        )}

                        {/* COLUMN 8: PAYMENT STATUS */}
                        <td className={`${isDoctorDesk ? 'pl-3 pr-6 sm:pr-8 text-left' : 'pl-2 pr-6 sm:pr-8 text-center'} py-2.5 sm:py-3 align-middle whitespace-nowrap`}>
                          <div className={`flex items-center ${isDoctorDesk ? 'justify-start' : 'justify-center'}`}>
                            {isPartiallyPaid ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0 whitespace-nowrap shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                                <span>Partially Paid</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 whitespace-nowrap shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                <span>Paid</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* COLUMN 9: ACTIONS */}
                        <td className="pl-6 sm:pl-8 pr-5 sm:pr-6 py-2.5 sm:py-3 align-middle whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Discharge Summary (Eye button) */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedWorkspaceAdmission(row);
                                setDischargeForm({
                                  finalDiagnosis: row.finalDiagnosis || '',
                                  dischargeSummary: row.treatmentSummary || row.dischargeSummary || ''
                                });
                              }}
                              className="p-1.5 rounded-xl text-[#2F63F2] hover:bg-blue-50 border border-blue-200/60 shadow-2xs hover:shadow-xs transition-all cursor-pointer group shrink-0"
                              title="Discharge Summary"
                              aria-label="Discharge Summary"
                            >
                              <Eye className="w-4 h-4 stroke-[2.2] group-hover:scale-110 transition-transform text-[#2F63F2]" />
                            </button>

                            {/* Three Dot Menu Button */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleRowDropdown(row._id, e)}
                              className={`p-1.5 rounded-xl transition-all cursor-pointer border ${
                                activeDropdownId === row._id
                                  ? "bg-blue-50 text-[#2F63F2] border-blue-200 shadow-xs"
                                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-slate-200/60 shadow-2xs"
                              }`}
                              title="More options"
                              aria-label="More options"
                            >
                              <MoreVertical className="w-4 h-4 stroke-[2]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Portal Dropdown Menu for Discharge Row Actions */}
        {activeDropdownId && dropdownPos && (() => {
          const row = filteredAdmissions.find(r => r._id === activeDropdownId);
          if (!row) return null;

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
                className="fixed z-[9999] w-56 bg-white rounded-xl shadow-2xl border border-slate-200/90 py-1.5 text-left font-sans animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100"
                style={{
                  ...(dropdownPos.top !== undefined ? { top: `${dropdownPos.top}px` } : {}),
                  ...(dropdownPos.bottom !== undefined ? { bottom: `${dropdownPos.bottom}px` } : {}),
                  right: `${dropdownPos.right}px`,
                  maxHeight: 'calc(100vh - 24px)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="py-0.5">
                  {/* 1. Discharge Summary */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdownId(null);
                      setDropdownPos(null);
                      setSelectedWorkspaceAdmission(row);
                      setDischargeForm({
                        finalDiagnosis: row.finalDiagnosis || '',
                        dischargeSummary: row.treatmentSummary || row.dischargeSummary || ''
                      });
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                    <span>Discharge Summary</span>
                  </button>

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

                  {/* 3. Consultation Report (Available for both Reception Desk and Doctor Desk) */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDropdownId(null);
                      setDropdownPos(null);
                      setSelectedDailyConsultationAdmission(row);
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
                      setSelectedAdmissionDetail(row);
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                    <span>Admission Details</span>
                  </button>
                </div>
              </div>
            </>,
            document.body
          );
        })()}

        {/* Table Footer with Pagination matching screenshot */}
        {!isLoading && !isError && (
          <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 bg-white text-xs font-bold disabled:opacity-40 cursor-not-allowed"
              >
                &lt;
              </button>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#2F63F2] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                1
              </button>
              <button
                type="button"
                disabled
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 bg-white text-xs font-bold disabled:opacity-40 cursor-not-allowed"
              >
                &gt;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================
          SECTION 4: REDESIGNED IPD DISCHARGE WORKSPACE MODAL (DOCTOR: CLINICAL SUMMARY, RECEPTION: BILLING SETTLEMENT)
          ================================================== */}
      {selectedWorkspaceAdmission && (
        isDoctorDesk ? (
          <IPDDoctorDischargeSummaryModal
            isOpen={Boolean(selectedWorkspaceAdmission)}
            onClose={() => setSelectedWorkspaceAdmission(null)}
            admission={selectedWorkspaceAdmission}
            user={user}
            onAdmissionUpdated={(updated) => {
              setSelectedWorkspaceAdmission(updated);
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
            }}
          />
        ) : (
          <IPDDischargeWorkspaceModal
            isOpen={Boolean(selectedWorkspaceAdmission)}
            onClose={() => setSelectedWorkspaceAdmission(null)}
            admission={selectedWorkspaceAdmission}
            user={user}
            onAdmissionUpdated={(updated) => {
              setSelectedWorkspaceAdmission(updated);
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
            }}
          />
        )
      )}

      {/* ==================================================
          SECTION 5: UNIFIED INPATIENT DETAILS MODAL
          ================================================== */}
      {selectedAdmissionDetail && (
        <InpatientDetailsModal
          isOpen={Boolean(selectedAdmissionDetail)}
          onClose={() => setSelectedAdmissionDetail(null)}
          admission={selectedAdmissionDetail}
          isDoctorDesk={isDoctorDesk}
          onOpenDischarge={(adm) => {
            setSelectedAdmissionDetail(null);
            setSelectedWorkspaceAdmission(adm);
          }}
        />
      )}

      {/* ==================================================
          SECTION 6: IPD DAILY CONSULTATION & PRESCRIPTION MODAL
          ================================================== */}
      {selectedDailyConsultationAdmission && (
        <IPDDailyConsultationModal
          isOpen={Boolean(selectedDailyConsultationAdmission)}
          onClose={() => setSelectedDailyConsultationAdmission(null)}
          admission={selectedDailyConsultationAdmission}
          user={user}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
          }}
        />
      )}

      {/* ==================================================
          SECTION 7: PATIENT CONSULTATION REPORTS HISTORY DRAWER
          ================================================== */}
      <PatientHistoryDrawer
        isOpen={Boolean(visitHistoryAdmission)}
        onClose={() => setVisitHistoryAdmission(null)}
        isLoading={isLoadingConsultationHistory}
        patient={effectiveDrawerPatient}
        patientHistory={effectivePatientHistory}
      />
    </div>
  );
};

export default Discharge;
