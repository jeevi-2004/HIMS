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
import { initClinicalMasters } from '../utils/clinicalMasters';
import { 
  Clock, Play, Eye, 
  History as HistoryIcon, RefreshCw, XCircle, Printer, Volume2,
  UserX, FileText, CheckCircle2, Users, Stethoscope,
  Search, Calendar, Filter, RotateCw
} from 'lucide-react';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { formatTimeTo12Hr } from '../utils/timeFormat';
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
    <div className="w-full sm:w-auto flex-1 text-left">
      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-[#2F63F2]" />
        <span>{label}</span>
        <span className="text-[10px] text-slate-400 font-medium">(DD/MM/YYYY)</span>
      </label>
      
      <div 
        onClick={triggerPicker}
        className="relative w-full h-[40px] px-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl flex items-center justify-between cursor-pointer focus-within:ring-2 focus-within:ring-[#2F63F2] focus-within:bg-white transition-all shadow-2xs"
      >
        <span className="text-xs font-semibold text-slate-800 font-mono tracking-wide">
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

        <Calendar className="w-4 h-4 text-slate-500 shrink-0 pointer-events-none" />
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
      api.post('/operations/doctors/presence', { isOnline: true }).catch(() => {});
    }
  }, [user?._id]);

  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  
  // Date Range Pickers State (Default both to Today)
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [appliedFromDate, setAppliedFromDate] = useState(todayStr);
  const [appliedToDate, setAppliedToDate] = useState(todayStr);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState('');

  const [activeTab, setActiveTab] = useState('waiting');
  const [selectedApp, setSelectedApp] = useState(null);
  const [isPatientDetailOpen, setIsPatientDetailOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isPrintTokenOpen, setIsPrintTokenOpen] = useState(false);

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
    toast.success("Filters reset to today");
  };

  // Fetch doctors list
  const { data: doctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR');
      return res.data.data;
    }
  });

  // Fetch appointments for date range
  const { data: queue, isLoading: queueLoading, refetch } = useQuery({
    queryKey: ['doctorQueue', user?._id, appliedFromDate, appliedToDate, selectedDoctorFilter],
    queryFn: async () => {
      const targetDocId = selectedDoctorFilter !== '' ? selectedDoctorFilter : (user?._id || '');
      const res = await api.get(`/operations/appointments?fromDate=${appliedFromDate}&toDate=${appliedToDate}&date=${appliedFromDate}&doctorId=${targetDocId}`);
      return res.data.data;
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });

  // Filter Queue based on Date Range
  const dateFilteredQueue = useMemo(() => {
    const raw = queue || [];
    return raw.filter(a => {
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
  }, [queue, appliedFromDate, appliedToDate]);

  const currentApp = useMemo(() => {
    return dateFilteredQueue.find(a => getVisitStatus(a) === VISIT_STATUSES.IN_CONSULTATION);
  }, [dateFilteredQueue]);

  const activeWaitingQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => {
      const st = getVisitStatus(a);
      const qState = (a.workflow?.queueState || '').toUpperCase();
      if (a.status === 'Scheduled' || qState === 'SCHEDULED') return false;
      return st === VISIT_STATUSES.WAITING || st === VISIT_STATUSES.SKIPPED;
    });
  }, [dateFilteredQueue]);

  const scheduledTodayQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => {
      const qState = (a.workflow?.queueState || '').toUpperCase();
      return a.status === 'Scheduled' || qState === 'SCHEDULED';
    });
  }, [dateFilteredQueue]);

  const enableEmergency = billingSettings?.enableEmergencyModule !== false;

  const sortedWaitingQueue = useMemo(() => {
    const arrivedOnly = activeWaitingQueue;
    const priorityMode = billingSettings?.emergencyQueuePriority || 'OVERRIDE';

    return [...arrivedOnly].sort((a, b) => {
      // 1. If FIFO mode selected, sort strictly by token sequence
      if (priorityMode === 'FIFO') {
        return (a.tokenNumber || '').localeCompare(b.tokenNumber || '', undefined, { numeric: true });
      }

      // 2. If APPOINTMENT_TIME mode selected, sort by appointment scheduled time
      if (priorityMode === 'APPOINTMENT_TIME') {
        const timeA = a.time || '23:59';
        const timeB = b.time || '23:59';
        if (timeA !== timeB) return timeA.localeCompare(timeB);
      }

      // 3. For OVERRIDE & AFTER_CURRENT modes, prioritize Emergency Patients to Position #1
      if (enableEmergency) {
        const aIsEmg = a.isEmergency || a.priorityLevel === 'EMERGENCY' || a.priority === 'EMERGENCY' || (a.consultationType || '').toLowerCase() === 'emergency' || (a.tokenNumber || '').startsWith('EMG');
        const bIsEmg = b.isEmergency || b.priorityLevel === 'EMERGENCY' || b.priority === 'EMERGENCY' || (b.consultationType || '').toLowerCase() === 'emergency' || (b.tokenNumber || '').startsWith('EMG');
        if (aIsEmg && !bIsEmg) return -1;
        if (!aIsEmg && bIsEmg) return 1;
      }
      return (a.tokenNumber || '').localeCompare(b.tokenNumber || '', undefined, { numeric: true });
    });
  }, [activeWaitingQueue, enableEmergency, billingSettings?.emergencyQueuePriority]);

  const inConsultationQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => getVisitStatus(a) === VISIT_STATUSES.IN_CONSULTATION);
  }, [dateFilteredQueue]);

  const completedTodayQueue = useMemo(() => {
    return dateFilteredQueue.filter(a => {
      const st = getVisitStatus(a);
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
        const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.tokenNumber || '').startsWith('EMG');
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
        const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.tokenNumber || '').startsWith('EMG');
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
      render: (row) => <span className="text-slate-600 font-medium text-xs">{row.patientId?.age || '-'}Y / {row.patientId?.gender || '-'}</span> 
    },
    { 
      key: 'doctor', 
      label: 'Doctor', 
      render: (row) => <span className="text-xs font-semibold text-slate-800">{row.doctorId?.name || row.doctorName || `Dr. ${user?.name || ''}`}</span> 
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
        if (isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy') {
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
        if (visitSt === VISIT_STATUSES.NO_SHOW || appSt === 'skipped' || appSt === 'no show') {
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
    },
    {
      key: 'quickActions',
      label: 'Action',
      render: (row) => {
        const visitSt = getVisitStatus(row);
        const appSt = (row.status || row.queueStatus || '').toLowerCase();
        const evalResult = getAppointmentActions(row, 'Doctor');
        const canStart = evalResult.actions.canStartConsultation;

        const isTokenOnlyPlan = user?.hospital?.opdOperationMode === 'TOKEN_ONLY' || user?.opdOperationMode === 'TOKEN_ONLY';

        // 1. IN CONSULTATION -> Show "Resume Consultation" (Plan 2) or "✓ Complete Token" (Plan 1)
        if (visitSt === VISIT_STATUSES.IN_CONSULTATION || appSt === 'in consultation' || appSt === 'in-consultation') {
          if (isTokenOnlyPlan) {
            return (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => finishConsultationMutation.mutate(row._id)}
                  className="h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Complete Token</span>
                </button>
              </div>
            );
          }
          return (
            <button
              type="button"
              onClick={() => navigate(`/doctor/consultation/${row._id}`)}
              className="h-8 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Consultation</span>
            </button>
          );
        }

        // 2. COMPLETED -> Show "Completed Visit"
        if (isCompletedVisit(visitSt) || appSt === 'completed' || appSt === 'sent to pharmacy' || appSt === 'sent_to_pharmacy') {
          if (isTokenOnlyPlan) {
            return (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Completed
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={() => navigate(`/doctor/consultation/${row._id}`)}
              className="h-8 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>View Prescription</span>
            </button>
          );
        }

        // 3. CANCELLED / NO SHOW -> No action button
        if (appSt === 'cancelled' || visitSt === VISIT_STATUSES.NO_SHOW || appSt === 'no show') {
          return null;
        }

        // 4. WAITING / SCHEDULED -> Show "Start Consultation"
        if (isTokenOnlyPlan) {
          return (
            <button
              type="button"
              disabled={!canStart}
              onClick={() => {
                if (!canStart) {
                  toast.error(evalResult.reasons.startConsultation || 'Payment required before consultation.');
                  return;
                }
                api.put(`/operations/appointments/${row._id}/queue`, { status: 'In Consultation', queueStatus: 'In-Consultation' })
                  .then(() => {
                    toast.success(`Calling Token #${row.tokenNumber} (Voice call sent to Reception desk)`);
                    queryClient.invalidateQueries(['doctorQueue']);
                    queryClient.invalidateQueries(['appointments']);
                  })
                  .catch(err => toast.error('Failed to update queue'));
              }}
              className={`h-8 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                canStart 
                  ? 'bg-[#2F63F2] text-white hover:bg-blue-700 shadow-2xs cursor-pointer' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{canStart ? 'Start Consultation' : 'Pending Payment'}</span>
            </button>
          );
        }

        // Default Plan 2: Start Consultation
        return (
          <button
            type="button"
            disabled={!canStart}
            onClick={() => {
              if (!canStart) {
                toast.error(evalResult.reasons.startConsultation || 'Payment required before consultation.');
                return;
              }
              startConsultationMutation.mutate(row._id);
            }}
            className={`h-8 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              canStart 
                ? 'bg-[#2F63F2] text-white hover:bg-blue-700 shadow-2xs cursor-pointer' 
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
            title={canStart ? "Start Consultation" : "Payment Pending"}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{canStart ? 'Start Consultation' : 'Pending Payment'}</span>
          </button>
        );
      }
    }
  ], [getAppointmentActions, navigate]);

  // Secondary Table Actions (Removed - passing empty array)
  const tableActions = useMemo(() => [], []);

  // Mutations
  const startConsultationMutation = useMutation({
    mutationFn: async (appId) => {
      if (currentApp) {
        if (currentApp._id === appId) {
          return appId;
        }
        throw new Error(`Active consultation in progress for ${currentApp.patientId?.name || 'current patient'}. Please finish it first.`);
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
          <div className="flex flex-col sm:flex-row items-center gap-3.5 flex-1">
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

            {(user?.role === 'SUPER_ADMIN' || user?.role === 'DOCTOR_ADMIN' || user?.role === 'RECEPTIONIST' || user?.roleId?.name === 'DOCTOR_ADMIN' || user?.roleId?.name === 'SUPER_ADMIN') && (
              <div className="w-full sm:w-auto flex-1 text-left">
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-[#2F63F2]" />
                  <span>Consulting Doctor</span>
                </label>
                <select
                  value={selectedDoctorFilter}
                  onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                  className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2] focus:bg-white transition-all shadow-2xs"
                >
                  <option value="">All Consulting Doctors</option>
                  {(doctors || []).map((doc) => (
                    <option key={doc._id} value={doc._id}>
                      {doc.name} {doc.specialization ? `(${doc.specialization})` : ''}
                    </option>
                  ))}
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
        <MetricSummaryCard
          title="No Show"
          value={noShowQueue.length}
          icon={UserX}
          iconColor="text-rose-600"
          iconBackground="bg-rose-50/80 border-rose-200/80"
        />
      </div>

      {/* 4. PATIENT TABLE WORKSPACE (ADAPTIVE SINGLE-DAY VS MULTI-DAY TIMELINE) */}
      <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-4 sm:p-5 shadow-xs space-y-5">
        {/* Queue Filter Tabs & View Indicator */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] pb-3 flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 overflow-x-auto max-w-full">
            {[
              { key: 'all', label: `All (${dateFilteredQueue.length})` },
              { key: 'waiting', label: `Waiting (${activeWaitingQueue.length})` },
              { key: 'in_consultation', label: `In Consultation (${inConsultationQueue.length})` },
              { key: 'completed', label: `Completed Today (${completedTodayQueue.length})` },
              { key: 'noshow', label: `No Show (${noShowQueue.length})` }
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
            <span className="text-xs text-slate-500 font-medium hidden md:inline">
              Showing <strong className="text-slate-800 font-bold">{currentDisplayList.length}</strong> record(s)
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
              <p><strong>Assigned Doctor:</strong> {selectedApp.doctorId?.name || selectedApp.doctorName || `Dr. ${user?.name || ''}`}</p>
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

    </div>
  );
};

export default DoctorTodayQueue;
