import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import Button from '../components/Button';
import Modal from '../components/Modal';
import OpdTokenPrintModal from '../components/OpdTokenPrintModal';
import ConsultationRecordModal from '../components/ConsultationRecordModal';
import PatientHistoryDrawer from '../components/PatientHistoryDrawer';
import { initClinicalMasters } from '../utils/clinicalMasters';
import { 
  Clock, Play, Eye, 
  History as HistoryIcon, RefreshCw, XCircle, Printer, Volume2,
  UserX, FileText, CheckCircle2, Users, Stethoscope,
  Search, Calendar, Filter, RotateCw, Lock, Bed
} from 'lucide-react';
import { ipdService } from '../services/ipd/ipdService';
import { ROUTES } from '../constants/routes';
import TransferToIPDModal from '../components/ipd/TransferToIPDModal';
import { isIpdAvailable } from '../utils/featureUtils';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { formatTimeTo12Hr, formatTimeTo24Hr } from '../utils/timeFormat';
import { 
  getVisitStatus, 
  getVisitStatusBadgeConfig, 
  VISIT_STATUSES, 
  isCompletedVisit 
} from '../utils/visitStatus';
import { MetricSummaryCard, VisitStatusBadge } from '../components/shared';

// Custom Formatted Date Input Component (Forces DD/MM/YYYY inside input field and removes external badges)
const CustomFormattedDateInput = ({ label, value, onChange }) => {
  const dateInputRef = useRef(null);

  const displayValue = useMemo(() => {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length !== 3) return value;
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
  }, [value]);

  const triggerPicker = () => {
    if (dateInputRef.current) {
      try {
        if (typeof dateInputRef.current.showPicker === 'function') {
          dateInputRef.current.showPicker();
        } else {
          dateInputRef.current.focus();
          dateInputRef.current.click();
        }
      } catch (err) {
        dateInputRef.current.click();
      }
    }
  };

  return (
    <div className="w-full sm:w-auto flex-1 text-left min-w-0">
      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap truncate">
        <Calendar className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
        <span className="shrink-0">{label}</span>
        <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium shrink-0">(DD/MM/YYYY)</span>
      </label>
      
      <div 
        onClick={triggerPicker}
        className="relative w-full h-[40px] px-2.5 sm:px-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl flex items-center justify-between cursor-pointer focus-within:ring-2 focus-within:ring-[#2F63F2] focus-within:bg-white transition-all shadow-2xs"
      >
        <span className="text-xs font-semibold text-slate-800 font-mono tracking-tight sm:tracking-wide truncate">
          {displayValue || 'DD/MM/YYYY'}
        </span>

        {/* Hidden Native Date Input overlay */}
        <input
          ref={dateInputRef}
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />

        <Calendar className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-500 shrink-0 pointer-events-none ml-1" />
      </div>
    </div>
  );
};

const DoctorTodayQueue = () => {
  const { user } = useAuth();
  const { billingSettings, workflow, getAppointmentActions } = useBillingSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    initClinicalMasters();
    if (user?._id) {
      const docId = String(user._id);
      api.post('/operations/doctors/presence', { doctorId: docId, isOnline: true }).catch(() => {});
      workflowRealtime.broadcastLocalEvent('DOCTOR_PRESENCE_UPDATED', { doctorId: docId, isOnline: true });
    }
  }, [user?._id]);

  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  
  // Date Range Pickers State (Default both to Today)
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [appliedFromDate, setAppliedFromDate] = useState(todayStr);
  const [appliedToDate, setAppliedToDate] = useState(todayStr);

  const isDoctor = useMemo(() => {
    const roleName = user?.roleId?.name || user?.role || '';
    return ['DOCTOR', 'DOCTOR_ADMIN'].includes(roleName);
  }, [user]);

  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState(() => (user?._id ? String(user._id) : ''));

  // Ensure selectedDoctorFilter is synced to current doctor user ID
  useEffect(() => {
    if (isDoctor && user?._id) {
      setSelectedDoctorFilter(String(user._id));
    }
  }, [isDoctor, user?._id]);

  // Effective Doctor ID: If doctor is logged in, strictly lock to user._id
  const effectiveDoctorId = useMemo(() => {
    if (isDoctor && user?._id) return String(user._id);
    return selectedDoctorFilter || '';
  }, [isDoctor, user?._id, selectedDoctorFilter]);

  const [activeTab, setActiveTab] = useState('waiting');
  const [selectedApp, setSelectedApp] = useState(null);
  const [isPatientDetailOpen, setIsPatientDetailOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isPrintTokenOpen, setIsPrintTokenOpen] = useState(false);
  const [transferToIpdApp, setTransferToIpdApp] = useState(null);
  const [selectedConsultationRecordApp, setSelectedConsultationRecordApp] = useState(null);
  const [isConsultationRecordOpen, setIsConsultationRecordOpen] = useState(false);
  const [historyPatient, setHistoryPatient] = useState(null);

  const [transferDoctorId, setTransferDoctorId] = useState('');
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' });

  // Helper to format date string YYYY-MM-DD to DD/MM/YYYY
  const formatDateDMY = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
  };

  // Format ISO YYYY-MM-DD to full date string (e.g. "Tuesday, 05 Aug 2026")
  const formatHeaderDate = (dateStr) => {
    if (!dateStr || dateStr === 'Unknown') return 'Unscheduled Date';
    try {
      const [y, m, d] = dateStr.split('-');
      const dObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return dObj.toLocaleDateString('en-US', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Handle Search Filter Apply
  const handleSearchFilter = (e) => {
    if (e) e.preventDefault();
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    toast.success(`Filter applied: ${formatDateDMY(fromDate)} to ${formatDateDMY(toDate)}`);
  };

  // Handle Reset Filter
  const handleResetFilter = () => {
    setFromDate(todayStr);
    setToDate(todayStr);
    setAppliedFromDate(todayStr);
    setAppliedToDate(todayStr);
    if (isDoctor && user?._id) {
      setSelectedDoctorFilter(String(user._id));
    } else {
      setSelectedDoctorFilter('');
    }
    toast.success("Filters reset to today");
  };

  // Fetch doctors list
  const { data: rawDoctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data.data;
    }
  });

  // Ensure current user is in doctors list if they are a doctor
  const doctors = useMemo(() => {
    let list = rawDoctors || [];
    if (user && (['DOCTOR', 'DOCTOR_ADMIN'].includes(user.role) || ['DOCTOR', 'DOCTOR_ADMIN'].includes(user.roleId?.name))) {
      if (!list.some(d => String(d._id) === String(user._id))) {
        list = [user, ...list];
      }
    }
    return list;
  }, [rawDoctors, user]);

  const doctorsMap = useMemo(() => {
    const map = new Map();
    (doctors || []).forEach(d => {
      if (d && d._id) map.set(String(d._id), d);
    });
    return map;
  }, [doctors]);

  // Fetch appointments for date range scoped to effective doctor (Strictly pure OPD queue)
  const { data: queue, isLoading: queueLoading, refetch } = useQuery({
    queryKey: ['doctorQueue', effectiveDoctorId, appliedFromDate, appliedToDate],
    queryFn: async () => {
      const docParam = effectiveDoctorId ? `&doctorId=${effectiveDoctorId}` : '';
      const scopeParam = isDoctor ? '&scope=my_desk' : '';
      const appRes = await api.get(`/operations/appointments?fromDate=${appliedFromDate}&toDate=${appliedToDate}&date=${appliedFromDate}${docParam}${scopeParam}`).catch(() => ({ data: { data: [] } }));
      const appList = appRes.data?.data || [];
      // Strictly pure OPD appointments: exclude any IPD admissions or IPD-related patients
      return appList.filter(app => !app.isIpd && !app.isIPDAdmission && !app.ipdAdmissionId && (app.consultationType || '').toUpperCase() !== 'IPD');
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });

  // Listen to real-time workflow events for immediate queue updates
  useEffect(() => {
    const unsubscribe = workflowRealtime.subscribe((event) => {
      refetch();
    });
    return () => unsubscribe();
  }, [refetch]);

  // Filter Queue based on Date Range and Strict Doctor Scoping Guard
  const dateFilteredQueue = useMemo(() => {
    const raw = queue || [];
    return raw.filter(a => {
      // Strict Doctor Scoping Guard: Ensure doctor only sees their own patients
      if (effectiveDoctorId) {
        const aDocId = a.doctorId?._id || a.doctorId;
        if (aDocId && String(aDocId) !== String(effectiveDoctorId)) {
          return false;
        }
      }

      let appDate = '';
      const rawDate = a.date || a.createdAt;
      if (typeof rawDate === 'string') {
        appDate = rawDate.split('T')[0];
      } else if (rawDate) {
        try {
          appDate = new Date(rawDate).toISOString().split('T')[0];
        } catch (e) {
          appDate = '';
        }
      }

      if (!appDate) return true;
      return appDate >= appliedFromDate && appDate <= appliedToDate;
    });
  }, [queue, effectiveDoctorId, appliedFromDate, appliedToDate]);

  const currentApp = useMemo(() => {
    return dateFilteredQueue.find(a => getVisitStatus(a) === VISIT_STATUSES.IN_CONSULTATION);
  }, [dateFilteredQueue]);

  const activeWaitingQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => {
      const st = getVisitStatus(a);
      if (st === VISIT_STATUSES.SCHEDULED) return false;
      return st === VISIT_STATUSES.WAITING || st === VISIT_STATUSES.SKIPPED;
    });
  }, [dateFilteredQueue]);

  const scheduledTodayQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => {
      const st = getVisitStatus(a);
      return st === VISIT_STATUSES.SCHEDULED;
    });
  }, [dateFilteredQueue]);

  const enableEmergency = billingSettings?.enableEmergencyModule !== false;

  const sortedWaitingQueue = useMemo(() => {
    const arrivedOnly = activeWaitingQueue;
    const priorityMode = billingSettings?.emergencyQueuePriority || 'OVERRIDE';

    return [...arrivedOnly].sort((a, b) => {
      // 0. Skipped patients ALWAYS move to the LAST position of the waiting queue (same as doctor desk dashboard)
      const isSkippedA = getVisitStatus(a) === VISIT_STATUSES.SKIPPED || (a.status || a.queueStatus || '').toLowerCase() === 'skipped';
      const isSkippedB = getVisitStatus(b) === VISIT_STATUSES.SKIPPED || (b.status || b.queueStatus || '').toLowerCase() === 'skipped';
      if (isSkippedA && !isSkippedB) return 1;
      if (!isSkippedA && isSkippedB) return -1;

      // 1. If FIFO mode selected, sort strictly by token sequence
      if (priorityMode === 'FIFO') {
        return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
      }

      // 2. If APPOINTMENT_TIME mode selected, sort by appointment scheduled time
      if (priorityMode === 'APPOINTMENT_TIME') {
        const timeA = a.time || '23:59';
        const timeB = b.time || '23:59';
        if (timeA !== timeB) return timeA.localeCompare(timeB);
      }

      // 3. For OVERRIDE & AFTER_CURRENT modes, prioritize Emergency Patients to Position #1
      if (enableEmergency) {
        const aIsEmg = a.isEmergency || a.priorityLevel === 'EMERGENCY' || a.priority === 'EMERGENCY' || (a.consultationType || '').toLowerCase() === 'emergency' || String(a.tokenNumber || '').startsWith('EMG');
        const bIsEmg = b.isEmergency || b.priorityLevel === 'EMERGENCY' || b.priority === 'EMERGENCY' || (b.consultationType || '').toLowerCase() === 'emergency' || String(b.tokenNumber || '').startsWith('EMG');
        if (aIsEmg && !bIsEmg) return -1;
        if (!aIsEmg && bIsEmg) return 1;
      }
      return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
    });
  }, [activeWaitingQueue, enableEmergency, billingSettings?.emergencyQueuePriority]);

  const inConsultationQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => getVisitStatus(a) === VISIT_STATUSES.IN_CONSULTATION);
  }, [dateFilteredQueue]);

  const completedTodayQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => {
      const st = getVisitStatus(a);
      if (st === VISIT_STATUSES.SCHEDULED) return false;
      const appSt = a.status || a.queueStatus || '';
      return isCompletedVisit(st) || 
             ['Completed', 'Sent to Pharmacy', 'Sent To Pharmacy'].includes(appSt) || 
             ['SENT', 'DISPENSING', 'DISPENSED', 'SENT_TO_PHARMACY'].includes(a.pharmacyStatus);
    });
  }, [dateFilteredQueue]);

  const noShowQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => getVisitStatus(a) === VISIT_STATUSES.NO_SHOW);
  }, [dateFilteredQueue]);

  // Dynamic Display List based on Selected Tab
  const currentDisplayList = useMemo(() => {
    if (activeTab === 'all') return dateFilteredQueue;
    if (activeTab === 'scheduled') return scheduledTodayQueue;
    if (activeTab === 'in_consultation') return inConsultationQueue;
    if (activeTab === 'completed') return completedTodayQueue;
    if (activeTab === 'noshow') return noShowQueue;
    return sortedWaitingQueue;
  }, [activeTab, dateFilteredQueue, scheduledTodayQueue, inConsultationQueue, completedTodayQueue, noShowQueue, sortedWaitingQueue]);

  // Adaptive View Determination
  // CASE 1: Single-day view if fromDate === toDate
  // CASE 2: Multi-day Timeline View if fromDate !== toDate
  const isMultiDayView = useMemo(() => {
    return appliedFromDate !== appliedToDate;
  }, [appliedFromDate, appliedToDate]);

  // Group currentDisplayList by date for multi-day timeline view (sorted descending)
  const groupedTimelineData = useMemo(() => {
    if (!isMultiDayView) return [];

    const groups = {};
    (currentDisplayList || []).forEach(item => {
      let dateKey = '';
      const rawDate = item.date || item.createdAt;
      if (typeof rawDate === 'string') {
        dateKey = rawDate.split('T')[0];
      } else if (rawDate) {
        try {
          dateKey = new Date(rawDate).toISOString().split('T')[0];
        } catch (e) {
          dateKey = 'Unknown';
        }
      } else {
        dateKey = 'Unknown';
      }

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(item);
    });

    // Sort date keys descending (newest date first)
    const sortedDateKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    return sortedDateKeys.map(dateKey => ({
      dateKey,
      formattedDate: formatHeaderDate(dateKey),
      patients: groups[dateKey]
    }));
  }, [currentDisplayList, isMultiDayView]);

  // Table Headers definition matching exact doctor workflow rules
  const tableHeaders = useMemo(() => [
    { 
      key: 'tokenNumber', 
      label: 'Token', 
      render: (row) => {
        const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || String(row.tokenNumber || '').startsWith('EMG');
        return (
          <span className={`font-bold font-mono px-2.5 py-1 rounded-lg border text-xs inline-block ${
            isEmg ? 'text-rose-700 bg-rose-100/80 border-rose-300 ring-2 ring-rose-500/20 font-extrabold' : 'text-[#2F63F2] bg-blue-50 border-blue-200'
          }`}>
            #{row.tokenNumber || 'N/A'}
          </span>
        );
      } 
    },
    { 
      key: 'patientId.name', 
      label: 'Patient', 
      render: (row) => {
        const patientName = row.patientId?.name || 'Walk-in Patient';
        const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || String(row.tokenNumber || '').startsWith('EMG');
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setSelectedApp(row); setIsPatientDetailOpen(true); }}
              className="font-bold text-slate-900 hover:text-[#2F63F2] hover:underline cursor-pointer text-left"
              title="Click to view Patient Medical History"
            >
              {patientName}
            </button>
            {isEmg && (
              <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse shrink-0">
                🚨 EMERGENCY
              </span>
            )}
          </div>
        );
      } 
    },
    { 
      key: 'patientId.age', 
      label: 'Age / Gender', 
      render: (row) => {
        const p = row.patientId || {};
        const age = p.age || row.age;
        const gender = p.gender || row.gender;
        const bloodGroup = p.bloodGroup || row.bloodGroup || row.patientBloodGroup;
        const genderLetter = gender ? (gender.length === 1 ? gender.toUpperCase() : gender.charAt(0).toUpperCase()) : '';
        const ageGenderText = age ? `${age} yrs / ${genderLetter || gender}` : (genderLetter || '—');
        return (
          <div className="flex flex-col items-start gap-0.5 whitespace-nowrap">
            <span className="text-slate-700 font-semibold text-xs">
              {ageGenderText}
            </span>
            {bloodGroup && bloodGroup !== 'Unknown' && bloodGroup !== 'N/A' && bloodGroup !== '—' ? (
              <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs">
                {bloodGroup}
              </span>
            ) : (
              <span className="text-slate-400 text-[10px] font-medium leading-tight">—</span>
            )}
          </div>
        );
      }
    },
    { 
      key: 'doctor', 
      label: 'Doctor', 
      render: (row) => {
        const raw = row.doctorId?.name || row.doctorName || user?.name || '';
        const clean = String(raw).replace(/^(Dr\.?\s*)+/i, '').trim();
        return <span className="text-xs font-semibold text-slate-800">{clean ? `Dr. ${clean}` : 'Dr. On Duty'}</span>;
      } 
    },
    { 
      key: 'time', 
      label: 'Appointment Time', 
      render: (row) => <span className="font-mono text-xs text-slate-600">{row.time || '-'}</span> 
    },
    {
      key: 'visitStatus', 
      label: 'Visit Status', 
      render: (row) => {
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();

        if (visitSt === VISIT_STATUSES.IN_CONSULTATION || appSt === 'in consultation' || appSt === 'in-consultation') {
          return (
            <span className="text-[10px] font-bold border border-purple-200 bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg uppercase tracking-wider inline-block">
              In Consultation
            </span>
          );
        }
        if (visitSt === VISIT_STATUSES.SENT_TO_PHARMACY || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy' || row.pharmacyStatus === 'SENT') {
          return (
            <span className="text-[10px] font-bold border border-[#F59E0B] bg-[#FFF3CD] text-[#B45309] px-2.5 py-1 rounded-lg uppercase tracking-wider inline-block">
              Sent to Pharmacy
            </span>
          );
        }
        if (isCompletedVisit(visitSt) || appSt === 'completed') {
          return (
            <span className="text-[10px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg uppercase tracking-wider inline-block">
              Completed
            </span>
          );
        }
        if (appSt === 'cancelled') {
          return (
            <span className="text-[10px] font-bold border border-slate-200 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg uppercase tracking-wider inline-block">
              Cancelled
            </span>
          );
        }
        if (visitSt === VISIT_STATUSES.SKIPPED || appSt === 'skipped') {
          return (
            <span className="text-[10px] font-bold border border-amber-200 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg uppercase tracking-wider inline-block">
              Skipped
            </span>
          );
        }
        if (visitSt === VISIT_STATUSES.NO_SHOW || appSt === 'no show') {
          return (
            <span className="text-[10px] font-extrabold border border-rose-200 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-lg uppercase tracking-wider inline-block">
              No Show
            </span>
          );
        }
        // Default: Waiting / Scheduled (Blue)
        return (
          <span className="text-[10px] font-bold border border-blue-200 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg uppercase tracking-wider inline-block">
            Waiting
          </span>
        );
      }
    }
  ], []);

  // Mutations
  const startConsultationMutation = useMutation({
    mutationFn: async (appOrId) => {
      const appId = typeof appOrId === 'object' ? appOrId._id : appOrId;
      const app = typeof appOrId === 'object' ? appOrId : (dateFilteredQueue || []).find(a => a._id === appId);

      if (currentApp) {
        if (currentApp._id === appId) {
          return appId;
        }
        throw new Error(`Active consultation in progress for ${currentApp.patientId?.name || 'current patient'}. Please finish it first.`);
      }

      // Trigger Voice Call announcement on Reception desk (Doctor speakers stay muted)
      if (app) {
        const callPayload = {
          tokenNumber: app.tokenNumber,
          tokenNo: app.tokenNumber,
          patientName: app.patientId?.name || app.patientName || 'Patient',
          doctorName: app.doctorId?.name || app.doctorName || user?.name || 'Doctor',
          roomNumber: app.doctorId?.roomNo || app.doctorId?.doctorProfile?.roomNo || app.doctorId?.doctorProfile?.roomNumber || app.roomNumber || 'Consultation Room',
          roomNo: app.doctorId?.roomNo || app.doctorId?.doctorProfile?.roomNo || app.doctorId?.doctorProfile?.roomNumber || app.roomNumber || 'Consultation Room',
          type: 'TriggerVoiceCall'
        };
        api.post('/workflow/events/trigger-call', callPayload).catch(err => console.error('Failed to trigger remote call:', err));
        voiceAnnouncement.enqueueAnnouncement({
          ...callPayload,
          patientObj: app,
          broadcastOnly: true
        });
      }

      await api.put(`/operations/appointments/${appId}/queue`, { status: 'In Consultation', queueStatus: 'In-Consultation' });
      return appId;
    },
    onSuccess: (appId) => {
      toast.success('Opening consultation workspace...');
      queryClient.invalidateQueries(['doctorQueue']);
      queryClient.invalidateQueries(['appointments']);
      navigate(`/doctor/consultation/${appId}`);
    },
    onError: (err) => toast.error(err.message || err.response?.data?.message || 'Failed to start consultation')
  });

  const finishConsultationMutation = useMutation({
    mutationFn: async (appId) => {
      const app = dateFilteredQueue.find(a => a._id === appId);
      const hasRx = app?.pharmacyStatus === 'SENT' || app?.pharmacyStatus === 'DISPENSING' || (app?.prescriptions && app.prescriptions.length > 0);
      const targetStatus = hasRx ? 'Sent to Pharmacy' : 'Completed';
      await api.put(`/operations/appointments/${appId}/queue`, { queueStatus: targetStatus, status: targetStatus });
    },
    onSuccess: () => {
      toast.success('Consultation finished!');
      queryClient.invalidateQueries(['doctorQueue']);
      queryClient.invalidateQueries(['appointments']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to finish consultation')
  });

  const skipPatientMutation = useMutation({
    mutationFn: async (appId) => {
      await api.put(`/operations/appointments/${appId}/queue`, { queueStatus: 'Skipped' });
    },
    onSuccess: () => {
      toast('Patient moved to skipped queue.', { icon: '⏭️' });
      queryClient.invalidateQueries(['doctorQueue']);
      queryClient.invalidateQueries(['appointments']);
      refetch();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to skip patient')
  });

  const recallPatientMutation = useMutation({
    mutationFn: async (appId) => {
      await api.put(`/operations/appointments/${appId}/queue`, { queueStatus: 'Waiting', status: 'Admitted' });
    },
    onSuccess: () => {
      toast.success('Patient recalled to waiting queue');
      refetch();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to recall patient')
  });

  const markNoShowMutation = useMutation({
    mutationFn: async (appId) => {
      await api.put(`/operations/appointments/${appId}/queue`, { status: 'Cancelled', queueStatus: 'Skipped' });
    },
    onSuccess: () => {
      toast('Patient marked as No Show', { icon: '🚫' });
      refetch();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update appointment')
  });

  const transferDoctorMutation = useMutation({
    mutationFn: async ({ appId, doctorId }) => {
      await api.put(`/operations/appointments/${appId}/queue`, { doctorId });
    },
    onSuccess: () => {
      toast.success('Patient transferred to selected doctor room');
      setIsTransferOpen(false); setSelectedApp(null); setTransferDoctorId('');
      refetch();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to transfer doctor')
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ appId, date, time }) => {
      await api.put(`/operations/appointments/${appId}/queue`, { date, time });
    },
    onSuccess: () => {
      toast.success('Appointment rescheduled successfully');
      setIsRescheduleOpen(false); setSelectedApp(null); setRescheduleForm({ date: '', time: '' });
      refetch();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reschedule')
  });

  const handleTransferSubmit = (e) => {
    e.preventDefault();
    if (!selectedApp || !transferDoctorId) return;
    transferDoctorMutation.mutate({ appId: selectedApp._id, doctorId: transferDoctorId });
  };

  const handleRescheduleSubmit = (e) => {
    e.preventDefault();
    if (!selectedApp || !rescheduleForm.date || !rescheduleForm.time) return;
    rescheduleMutation.mutate({ 
      appId: selectedApp._id, 
      date: rescheduleForm.date, 
      time: formatTimeTo12Hr(rescheduleForm.time)
    });
  };

  const isTokenOnlyPlan = user?.hospital?.opdOperationMode === 'TOKEN_ONLY' || 
                          user?.opdOperationMode === 'TOKEN_ONLY' || 
                          billingSettings?.opdOperationMode === 'TOKEN_ONLY';

  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

  const handleRecallVoice = (row) => {
    voiceAnnouncement.enqueueAnnouncement({
      tokenNumber: row.tokenNumber,
      patientName: row.patientId?.name || 'Patient',
      doctorName: row.doctorId?.name || row.doctorName || user?.name || 'Doctor',
      roomNumber: row.doctorId?.roomNumber || row.roomNumber || '',
      patientObj: row,
      isRepeat: true,
      broadcastOnly: true
    });
    toast.success(`📢 Re-calling Token #${row.tokenNumber} at Reception`);
  };

  // Full table actions: Primary status actions + 3-dot dropdown with 6 actions
  const tableActions = useMemo(() => [
    // ---------------- PRIMARY STATUS-DRIVEN INLINE BUTTONS ----------------
    // Plan 1: Accept Patient
    {
      label: 'Accept Patient',
      icon: Volume2,
      isPrimary: true,
      disabled: (row) => {
        const isSubscriptionInactive = user?.hospitalStatus === 'inactive' || user?.hospital?.status === 'inactive';
        return isSubscriptionInactive;
      },
      onClick: (row) => {
        const callPayload = {
          tokenNumber: row.tokenNumber,
          patientName: row.patientId?.name || 'Patient',
          doctorName: row.doctorId?.name || row.doctorName || user?.name || 'Doctor',
          roomNumber: row.doctorId?.roomNumber || row.roomNumber || '',
          type: 'TriggerVoiceCall'
        };
        api.post('/workflow/events/trigger-call', callPayload).catch(err => console.error('Failed to trigger remote call:', err));
        voiceAnnouncement.enqueueAnnouncement({
          ...callPayload,
          patientObj: row,
          broadcastOnly: true
        });
        api.put(`/operations/appointments/${row._id}/queue`, { status: 'Completed', queueStatus: 'Completed' })
          .then(() => {
            toast.success(`✓ Token #${row.tokenNumber} Accepted & Completed! Voice call sent to Reception desk.`);
            queryClient.invalidateQueries(['doctorQueue']);
            queryClient.invalidateQueries(['appointments']);
            refetch();
          })
          .catch(() => toast.error('Failed to update queue status'));
      },
      show: (row) => {
        if (!isTokenOnlyPlan) return false;
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        const isCompleted = isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy';
        if (isCompleted) return false;
        return visitSt !== VISIT_STATUSES.IN_CONSULTATION && visitSt !== VISIT_STATUSES.SKIPPED && appSt !== 'cancelled' && visitSt !== VISIT_STATUSES.NO_SHOW;
      }
    },
    // Plan 2: Start Consultation
    {
      label: 'Start Consultation',
      icon: <Play className="w-3.5 h-3.5 fill-current" />,
      isPrimary: true,
      disabled: (row) => {
        const isSubscriptionInactive = user?.hospitalStatus === 'inactive' || user?.hospital?.status === 'inactive';
        return isSubscriptionInactive || startConsultationMutation.isPending;
      },
      onClick: (row) => {
        startConsultationMutation.mutate(row);
      },
      show: (row) => {
        if (isTokenOnlyPlan) return false;
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        const isCompleted = isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy';
        if (isCompleted) return false;
        return visitSt !== VISIT_STATUSES.IN_CONSULTATION && visitSt !== VISIT_STATUSES.SKIPPED && appSt !== 'cancelled' && visitSt !== VISIT_STATUSES.NO_SHOW;
      }
    },
    // Recall Patient (for Skipped patients)
    {
      label: 'Recall Patient',
      icon: RefreshCw,
      isPrimary: true,
      onClick: (row) => recallPatientMutation.mutate(row._id),
      show: (row) => {
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        return visitSt === VISIT_STATUSES.SKIPPED || appSt === 'skipped';
      }
    },
    // Resume Consultation (for In-Consultation, Plan 2)
    {
      label: 'Resume Consultation',
      icon: <Play className="w-3.5 h-3.5 fill-current" />,
      isPrimary: true,
      variant: 'purple',
      onClick: (row) => navigate(`/doctor/consultation/${row._id}`),
      show: (row) => {
        if (isTokenOnlyPlan) return false;
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        const isCompleted = isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy';
        if (isCompleted) return false;
        return visitSt === VISIT_STATUSES.IN_CONSULTATION || appSt === 'in consultation' || appSt === 'in-consultation';
      }
    },
    // Complete Token (for In-Consultation, Plan 1)
    {
      label: 'Complete Token',
      icon: CheckCircle2,
      isPrimary: true,
      onClick: (row) => finishConsultationMutation.mutate(row._id),
      show: (row) => {
        if (!isTokenOnlyPlan) return false;
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        const isCompleted = isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy';
        if (isCompleted) return false;
        return visitSt === VISIT_STATUSES.IN_CONSULTATION || appSt === 'in consultation' || appSt === 'in-consultation';
      }
    },
    // Consultation History (Primary for Completed patients - both Plan 1 and Plan 2)
    {
      label: 'Consultation History',
      icon: HistoryIcon,
      isPrimary: true,
      variant: 'view',
      onClick: (row) => {
        setSelectedConsultationRecordApp(row);
        setIsConsultationRecordOpen(true);
      },
      show: (row) => {
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        return isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy';
      }
    },
    // Re-Call Voice (for In-Consultation only, Plan 1 - NEVER for Completed)
    {
      label: 'Re-Call Voice',
      icon: Volume2,
      isPrimary: true,
      variant: 'view',
      onClick: (row) => handleRecallVoice(row),
      show: (row) => {
        if (!isTokenOnlyPlan) return false;
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        if (isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy') {
          return false;
        }
        return visitSt === VISIT_STATUSES.IN_CONSULTATION || appSt === 'in consultation' || appSt === 'in-consultation';
      }
    },

    // ---------------- 6 DEDICATED 3-DOT DROPDOWN ACTIONS ----------------
    // 1. Skip Patient
    {
      label: 'Skip Patient',
      icon: XCircle,
      onClick: (row) => skipPatientMutation.mutate(row._id),
      show: (row) => {
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        return visitSt === VISIT_STATUSES.WAITING && appSt !== 'skipped' && visitSt !== VISIT_STATUSES.SKIPPED;
      }
    },
    // 3. Reschedule
    {
      label: 'Reschedule',
      icon: Calendar,
      onClick: (row) => {
        setSelectedApp(row);
        const rawDate = row.date || row.createdAt;
        let dateStr = '';
        if (typeof rawDate === 'string') {
          dateStr = rawDate.split('T')[0];
        } else if (rawDate) {
          try {
            dateStr = new Date(rawDate).toISOString().split('T')[0];
          } catch (e) {
            dateStr = '';
          }
        }
        setRescheduleForm({
          date: dateStr,
          time: formatTimeTo24Hr(row.time)
        });
        setIsRescheduleOpen(true);
      },
      show: (row) => {
        const visitSt = getVisitStatus(row);
        return !isCompletedVisit(visitSt) && visitSt !== VISIT_STATUSES.IN_CONSULTATION;
      }
    },
    // 4. Transfer Room
    {
      label: 'Transfer Room',
      icon: RefreshCw,
      onClick: (row) => {
        setSelectedApp(row);
        setTransferDoctorId('');
        setIsTransferOpen(true);
      },
      show: (row) => {
        const visitSt = getVisitStatus(row);
        return !isCompletedVisit(visitSt) && visitSt !== VISIT_STATUSES.IN_CONSULTATION;
      }
    },
    // Transfer to IPD (Only available when IPD module is enabled for this hospital)
    {
      label: 'Transfer to IPD',
      icon: Bed,
      onClick: (row) => setTransferToIpdApp(row),
      show: (row) => {
        if (!isIpdEnabled) return false;
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        return appSt !== 'admitted' && visitSt !== 'Admitted';
      }
    },
    // 5. Patient Info
    {
      label: 'Patient Info',
      icon: Eye,
      onClick: (row) => {
        setSelectedApp(row);
        setIsPatientDetailOpen(true);
      }
    },
    // Visit History (form drawer for completed & all patient records)
    {
      label: 'Visit History',
      icon: HistoryIcon,
      onClick: (row) => {
        const pat = (row.patientId && typeof row.patientId === 'object')
          ? row.patientId
          : (row.patient && typeof row.patient === 'object')
            ? row.patient
            : { _id: row.patientId?._id || row.patientId || row.patient, name: row.patientId?.name || row.patientName };
        setHistoryPatient(pat);
      }
    },
    // 7. View Prescription Pad (for completed Plan 2 consultations)
    {
      label: 'View Prescription Pad',
      icon: FileText,
      onClick: (row) => navigate(`/doctor/consultation/${row._id}`),
      show: (row) => {
        if (isTokenOnlyPlan) return false;
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        return isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy';
      }
    },
    // 8. Consultation History (in 3-dot dropdown for active / non-completed patients)
    {
      label: 'Consultation History',
      icon: HistoryIcon,
      onClick: (row) => {
        setSelectedConsultationRecordApp(row);
        setIsConsultationRecordOpen(true);
      },
      show: (row) => {
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        return !(isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy');
      }
    }
  ], [
    isTokenOnlyPlan,
    isIpdEnabled,
    user,
    billingSettings,
    getAppointmentActions,
    navigate,
    startConsultationMutation,
    finishConsultationMutation,
    skipPatientMutation,
    recallPatientMutation,
    markNoShowMutation,
    queryClient,
    refetch
  ]);

  return (
    <div className="space-y-6 text-left px-4 sm:px-6 py-5 bg-[#F8FAFC] min-h-screen">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2] shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            Today's Patients Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Real-time outpatient queue control, consultation tracking, and visit analytics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 shadow-xs transition-all w-fit cursor-pointer"
        >
          <RotateCw className={`w-3.5 h-3.5 text-[#2F63F2] ${queueLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* 2. FILTER BAR SECTION */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white border border-[#E5E7EB] rounded-[20px] p-4 sm:p-5 shadow-xs"
      >
        <form onSubmit={handleSearchFilter} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 flex-1 w-full">
            {/* From Date & To Date: 1 Row & 2 Columns in Mobile View (grid-cols-2), flex on desktop */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3.5 w-full sm:w-auto sm:flex sm:items-center sm:flex-1">
              <CustomFormattedDateInput
                label="From Date"
                value={fromDate}
                onChange={setFromDate}
              />

              <CustomFormattedDateInput
                label="To Date"
                value={toDate}
                onChange={setToDate}
              />
            </div>

            {isDoctor ? (
              <div className="w-full sm:w-auto flex-1 text-left">
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-[#2F63F2]" />
                  <span>Consulting Doctor</span>
                </label>
                <div className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                    <span className="truncate">
                      {user?.name ? (user.name.startsWith('Dr.') ? user.name : `Dr. ${user.name}`) : 'Doctor'}
                    </span>
                    <span className="text-[10px] text-blue-600 font-bold px-1.5 py-0.5 bg-blue-50 border border-blue-200/60 rounded shrink-0">
                      My Desk
                    </span>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" title="Desk locked to your assigned patients only" />
                </div>
              </div>
            ) : (
              <div className="w-full sm:w-auto flex-1 text-left">
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-[#2F63F2]" />
                  <span>Consulting Doctor</span>
                </label>
                <select
                  value={selectedDoctorFilter}
                  onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                  className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2] focus:bg-white transition-all shadow-2xs cursor-pointer"
                >
                  <option value="">All Consulting Doctors</option>
                  {(doctors || []).map((doc) => {
                    const rawName = doc.name || 'Doctor';
                    const docName = rawName.startsWith('Dr.') ? rawName : `Dr. ${rawName}`;
                    const spec = doc.doctorProfile?.specialization || doc.specialization;
                    return (
                      <option key={doc._id} value={doc._id}>
                        {docName} {spec ? `(${spec})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
            <Button
              type="submit"
              variant="primary"
              className="h-[40px] px-5 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] flex items-center gap-2 rounded-xl flex-1 sm:flex-none justify-center shadow-xs"
              icon={Search}
            >
              Search
            </Button>

            <button
              type="button"
              onClick={handleResetFilter}
              className="h-[40px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs flex-1 sm:flex-none cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset</span>
            </button>
          </div>
        </form>
      </motion.div>

      {/* 3. RESPONSIVE SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricSummaryCard
          title="Total Patients"
          value={dateFilteredQueue.length}
          icon={Users}
          iconColor="text-[#2F63F2]"
          iconBackground="bg-blue-50/80 border-blue-200/80"
        />
        <MetricSummaryCard
          title="Scheduled"
          value={scheduledTodayQueue.length}
          icon={Calendar}
          iconColor="text-sky-600"
          iconBackground="bg-sky-50/80 border-sky-200/80"
        />
        <MetricSummaryCard
          title="Waiting"
          value={activeWaitingQueue.length}
          icon={Clock}
          iconColor="text-amber-600"
          iconBackground="bg-amber-50/80 border-amber-200/80"
        />
        <MetricSummaryCard
          title="In Consultation"
          value={inConsultationQueue.length}
          icon={Stethoscope}
          iconColor="text-indigo-600"
          iconBackground="bg-indigo-50/80 border-indigo-200/80"
        />
        <MetricSummaryCard
          title="Completed"
          value={completedTodayQueue.length}
          icon={CheckCircle2}
          iconColor="text-emerald-600"
          iconBackground="bg-emerald-50/80 border-emerald-200/80"
        />
      </div>

      {/* 4. PATIENT TABLE WORKSPACE (ADAPTIVE SINGLE-DAY VS MULTI-DAY TIMELINE) */}
      <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-4 sm:p-5 shadow-xs space-y-5">
        {/* Queue Filter Tabs & View Indicator */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] pb-3 flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 overflow-x-auto max-w-full">
            {[
              { key: 'all', label: `All (${dateFilteredQueue.length})` },
              { key: 'scheduled', label: `Scheduled / Follow-Up (${scheduledTodayQueue.length})` },
              { key: 'waiting', label: `Waiting (${activeWaitingQueue.length})` },
              { key: 'in_consultation', label: `In Consultation (${inConsultationQueue.length})` },
              { key: 'completed', label: `Completed Today (${completedTodayQueue.length})` }
            ].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === t.key ? 'bg-white shadow-xs text-[#2F63F2]' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isMultiDayView ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
              {isMultiDayView ? 'Grouped Timeline View' : 'Single-Day Queue View'}
            </span>
          </div>
        </div>

        {/* DYNAMIC CONTENT AREA (ANIMATED WITH FRAMER MOTION) */}
        <AnimatePresence mode="wait">
          <motion.div
            key={isMultiDayView ? `grouped_${activeTab}_${appliedFromDate}_${appliedToDate}` : `single_${activeTab}_${appliedFromDate}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
          >
            {/* EMPTY STATE */}
            {currentDisplayList.length === 0 && !queueLoading && (
              <div className="p-12 text-center text-slate-500 font-medium text-xs space-y-2 bg-white border border-[#E5E7EB] rounded-[16px]">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="text-base font-bold text-slate-800">📅 No Patients Found</p>
                <p className="text-slate-500">No patient records were found for the selected date range and filter.</p>
                <p className="text-slate-400 text-[11px]">Try changing the From Date or To Date filters above.</p>
              </div>
            )}

            {/* CASE 1: SINGLE-DAY VIEW (From Date == To Date) */}
            {!isMultiDayView && currentDisplayList.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-[16px] overflow-hidden bg-white shadow-xs">
                <Table
                  headers={tableHeaders}
                  data={currentDisplayList}
                  actions={tableActions}
                  loading={queueLoading}
                />
              </div>
            )}

            {/* CASE 2: MULTI-DAY GROUPED TIMELINE VIEW (From Date != To Date) */}
            {isMultiDayView && currentDisplayList.length > 0 && (
              <div className="space-y-6">
                {groupedTimelineData.map((group) => (
                  <div key={group.dateKey} className="space-y-3">
                    {/* STICKY DATE HEADER */}
                    <div className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-md border border-slate-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2F63F2] shadow-2xs">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-xs font-extrabold text-slate-800 tracking-wide">
                          📅 {group.formattedDate}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 font-mono shadow-2xs">
                          {group.patients.length} {group.patients.length === 1 ? 'Patient' : 'Patients'}
                        </span>
                      </div>
                    </div>

                    {/* GROUP PATIENT TABLE */}
                    <div className="border border-[#E5E7EB] rounded-[16px] overflow-hidden bg-white shadow-xs">
                      <Table
                        headers={tableHeaders}
                        data={group.patients}
                        actions={tableActions}
                        loading={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* MODALS */}
      {/* 1. Patient Profile Summary (Read-Only) */}
      <Modal isOpen={isPatientDetailOpen} onClose={() => { setIsPatientDetailOpen(false); setSelectedApp(null); }} title="Outpatient Summary (Read-Only)">
        {selectedApp && (
          <div className="space-y-4 text-xs text-left">
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between font-bold text-[#2F63F2]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2F63F2]" />
                <span className="text-sm">{selectedApp.patientId?.name || 'Walk-in Patient'}</span>
              </div>
              <span className="font-mono text-xs bg-white px-2.5 py-1 rounded-lg border border-blue-200">
                {selectedApp.patientId?.uhid || 'N/A'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
              <p><strong>Mobile:</strong> <span className="font-mono">{selectedApp.patientId?.mobileNumber || '-'}</span></p>
              <p><strong>Gender / Age:</strong> {selectedApp.patientId?.gender || '-'} / {selectedApp.patientId?.age || '-'} Yrs</p>
              <p><strong>Token Number:</strong> <span className="font-mono font-bold text-[#2F63F2]">#{selectedApp.tokenNumber || '-'}</span></p>
              <p><strong>Appointment Time:</strong> {selectedApp.time || '-'}</p>
              <p><strong>Assigned Doctor:</strong> {(() => {
                const raw = selectedApp.doctorId?.name || selectedApp.doctorName || user?.name || '';
                const clean = String(raw).replace(/^(Dr\.?\s*)+/i, '').trim();
                return clean ? `Dr. ${clean}` : 'Dr. On Duty';
              })()}</p>
              <p><strong>Visit Status:</strong> <span className="font-bold text-slate-800">{getVisitStatus(selectedApp)}</span></p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={() => { setIsPatientDetailOpen(false); setSelectedApp(null); }}
                className="h-[36px] px-4 text-xs font-bold uppercase tracking-wider"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. Transfer Modal */}
      <Modal isOpen={isTransferOpen} onClose={() => { setIsTransferOpen(false); setSelectedApp(null); }} title="Transfer Patient">
        <form onSubmit={handleTransferSubmit} className="space-y-4 text-left">
          <select
            className="enterprise-input w-full h-[40px] text-xs font-medium"
            value={transferDoctorId}
            onChange={(e) => setTransferDoctorId(e.target.value)}
            required
          >
            <option value="">Choose doctor...</option>
            {doctors?.filter(d => d._id !== user?._id).map(d => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
          <Button type="submit" variant="primary" className="w-full h-[40px] text-xs font-bold uppercase tracking-wider">
            Transfer Room
          </Button>
        </form>
      </Modal>

      {/* 3. Reschedule Modal */}
      <Modal isOpen={isRescheduleOpen} onClose={() => { setIsRescheduleOpen(false); setSelectedApp(null); }} title="Reschedule Appointment">
        <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-left">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
              value={rescheduleForm.date}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })}
              required
            />
            <input
              type="time"
              className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
              value={rescheduleForm.time}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, time: e.target.value })}
              required
            />
          </div>
          <Button type="submit" variant="primary" className="w-full h-[40px] text-xs font-bold uppercase tracking-wider">
            Confirm Reschedule
          </Button>
        </form>
      </Modal>

      {/* 4. OPD Token / Prescription Print Modal */}
      <OpdTokenPrintModal
        isOpen={isPrintTokenOpen}
        onClose={() => { setIsPrintTokenOpen(false); setSelectedApp(null); }}
        appointment={selectedApp}
      />

      {/* 5. Transfer to IPD Modal (Strictly gated by isIpdEnabled) */}
      {isIpdEnabled && (
        <TransferToIPDModal
          isOpen={Boolean(transferToIpdApp)}
          onClose={() => setTransferToIpdApp(null)}
          appointment={transferToIpdApp}
        />
      )}

      {/* 6. Consultation Record History Modal */}
      <ConsultationRecordModal
        isOpen={isConsultationRecordOpen}
        onClose={() => {
          setIsConsultationRecordOpen(false);
          setSelectedConsultationRecordApp(null);
        }}
        appointment={selectedConsultationRecordApp}
        consultationId={selectedConsultationRecordApp?._id}
      />

      {/* 7. Patient Visit History Drawer */}
      <PatientHistoryDrawer
        isOpen={!!historyPatient}
        onClose={() => setHistoryPatient(null)}
        patient={historyPatient}
        title={historyPatient?.name ? `VISIT HISTORY - ${historyPatient.name.toUpperCase()}` : 'VISIT HISTORY'}
      />

    </div>
  );
};

export default DoctorTodayQueue;
