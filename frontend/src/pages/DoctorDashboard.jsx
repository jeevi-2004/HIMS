import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import Button from '../components/Button';
import Modal from '../components/Modal';
import OpdTokenPrintModal from '../components/OpdTokenPrintModal';
import { initClinicalMasters } from '../utils/clinicalMasters';
import { 
  Clock, ShieldCheck, Play, Eye, 
  History as HistoryIcon, RefreshCw, XCircle, Printer, Calendar,
  AlertTriangle, UserX, FileText, CheckCircle2, Volume2, Bed
} from 'lucide-react';
import { ROUTES } from '../constants/routes';
import TransferToIPDModal from '../components/ipd/TransferToIPDModal';
import PatientHistoryDrawer from '../components/PatientHistoryDrawer';
import { isIpdAvailable } from '../utils/featureUtils';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { formatTimeTo12Hr, formatTimeTo24Hr } from '../utils/timeFormat';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { 
  getVisitStatus, 
  getVisitStatusBadgeConfig, 
  VISIT_STATUSES, 
  isCompletedVisit 
} from '../utils/visitStatus';

// Priority sorter for the Waiting Queue
// Order: Emergency (1) → VIP (2) → Appointment (3) → Follow-Up (4) → Walk-In (5)
const getPriorityScore = (app) => {
  if (app.consultationType === 'Emergency') return 1;
  if (app.isVIP) return 2;
  if (app.consultationType === 'Appointment') return 3;
  if (app.consultationType === 'Follow-Up') return 4;
  return 5;
};

const getDoctorSettings = (doctorId) => {
  const defaults = {
    queuePriority: 'Standard'
  };
  if (!doctorId) return defaults;
  try {
    const saved = localStorage.getItem(`doctor_settings_${doctorId}`);
    if (saved) return { ...defaults, ...JSON.parse(saved) };
  } catch {
    // ignore
  }
  return defaults;
};

const DoctorDashboard = () => {
  const { user } = useAuth();
  const { workflow, getAppointmentActions, billingSettings } = useBillingSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isTokenOnlyPlan = user?.hospital?.opdOperationMode === 'TOKEN_ONLY' || 
                          user?.opdOperationMode === 'TOKEN_ONLY' || 
                          billingSettings?.opdOperationMode === 'TOKEN_ONLY';

  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

  useEffect(() => { initClinicalMasters(); }, []);

  const [activeQueueTab, setActiveQueueTab] = useState('waiting');
  const [selectedApp, setSelectedApp] = useState(null);
  const [isPatientDetailOpen, setIsPatientDetailOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isPrintTokenOpen, setIsPrintTokenOpen] = useState(false);
  const [isNoShowConfirmOpen, setIsNoShowConfirmOpen] = useState(false);
  const [transferToIpdApp, setTransferToIpdApp] = useState(null);
  const [historyPatient, setHistoryPatient] = useState(null);

  const [transferDoctorId, setTransferDoctorId] = useState('');
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' });

  const doctorSettings = useMemo(() => getDoctorSettings(user?._id), [user?._id]);

  // Doctor Online Presence State (In-Memory)
  const [isOnline, setIsOnline] = useState(true);
  const [isPresenceLoading, setIsPresenceLoading] = useState(false);

  useEffect(() => {
    if (!user?._id) return;
    const docId = String(user._id);
    api.get('/operations/doctors/presence')
      .then(res => {
        const map = res.data?.data || {};
        if (map[docId] !== undefined) {
          setIsOnline(Boolean(map[docId]));
        } else {
          api.post('/operations/doctors/presence', { doctorId: docId, isOnline: true })
            .then(() => {
              setIsOnline(true);
              workflowRealtime.broadcastLocalEvent('DOCTOR_PRESENCE_UPDATED', { doctorId: docId, isOnline: true });
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    const unsubscribe = workflowRealtime.subscribe(evt => {
      if (evt?.type === 'DOCTOR_PRESENCE_UPDATED' && String(evt.doctorId) === docId) {
        setIsOnline(Boolean(evt.isOnline));
      }
    });

    return () => unsubscribe();
  }, [user?._id]);

  const handleTogglePresence = async () => {
    if (!user?._id || isPresenceLoading) return;
    const docId = String(user._id);
    const nextState = !isOnline;
    setIsPresenceLoading(true);
    setIsOnline(nextState);
    workflowRealtime.broadcastLocalEvent('DOCTOR_PRESENCE_UPDATED', { doctorId: docId, isOnline: nextState });

    try {
      await api.post('/operations/doctors/presence', { doctorId: docId, isOnline: nextState });
      toast.success(`Doctor status set to ${nextState ? 'ONLINE 🟢' : 'OFFLINE ⚪'}`);
    } catch {
      setIsOnline(!nextState);
      workflowRealtime.broadcastLocalEvent('DOCTOR_PRESENCE_UPDATED', { doctorId: docId, isOnline: !nextState });
      toast.error('Failed to update presence status');
    } finally {
      setIsPresenceLoading(false);
    }
  };

  // Fetch doctors (for transfer option)
  const { data: doctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data.data;
    }
  });

  // ── Fetch today's queue with auto-refresh every 15s (Strictly OPD patients queue) ──
  const { data: queue, isLoading: queueLoading, refetch } = useQuery({
    queryKey: ['doctorQueue', user?._id],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA');
      const appRes = await api.get(`/operations/appointments?date=${today}&doctorId=${user?._id}`).catch(() => ({ data: { data: [] } }));
      const appList = appRes.data?.data || [];
      // Strictly pure OPD appointments: exclude any IPD admissions or IPD-related patients
      return appList.filter(app => !app.isIpd && !app.isIPDAdmission && !app.ipdAdmissionId && (app.consultationType || '').toUpperCase() !== 'IPD');
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });

  const todayQueue = useMemo(() => {
    const list = (queue || []).filter(a => !a.isIpd && !a.isIPDAdmission && !a.ipdAdmissionId && (a.consultationType || '').toUpperCase() !== 'IPD');
    if (!user?._id) return list;
    return list.filter(a => {
      const docId = a.doctorId?._id || a.doctorId;
      return !docId || String(docId) === String(user._id);
    });
  }, [queue, user?._id]);

  // ── Single Source of Truth: Group appointments by Visit Status ──
  const currentApp = useMemo(() => {
    return todayQueue.find(a => getVisitStatus(a) === VISIT_STATUSES.IN_CONSULTATION);
  }, [todayQueue]);

  const waitingQueue = useMemo(() => {
    return todayQueue.filter(a => {
      const st = getVisitStatus(a);
      return st === VISIT_STATUSES.WAITING || st === VISIT_STATUSES.SKIPPED || st === VISIT_STATUSES.SCHEDULED;
    });
  }, [todayQueue]);

  const inConsultationQueue = useMemo(() => {
    return todayQueue.filter(a => getVisitStatus(a) === VISIT_STATUSES.IN_CONSULTATION);
  }, [todayQueue]);

  const completedTodayQueue = useMemo(() => {
    return todayQueue.filter(a => isCompletedVisit(getVisitStatus(a)));
  }, [todayQueue]);

  const noShowQueue = useMemo(() => {
    return todayQueue.filter(a => getVisitStatus(a) === VISIT_STATUSES.NO_SHOW);
  }, [todayQueue]);

  // Counts
  const waitingCount = waitingQueue.filter(a => getVisitStatus(a) !== VISIT_STATUSES.SCHEDULED).length;
  const inConsultationCount = inConsultationQueue.length;
  const completedCount = completedTodayQueue.length;
  const noShowCount = noShowQueue.length;

  // ── Active medical alerts ──
  const recentAlerts = todayQueue
    .filter(a => a.patientId?.medicalAlerts)
    .map(a => ({
      patientName: a.patientId?.name,
      uhid: a.patientId?.uhid,
      alert: a.patientId?.medicalAlerts
    }));

  // ── Smart Priority Sort for Active Waiting Queue ──
  const sortedWaitingQueue = useMemo(() => {
    const arrivedOnly = waitingQueue.filter(a => getVisitStatus(a) !== VISIT_STATUSES.SCHEDULED);
    return [...arrivedOnly].sort((a, b) => {
      const isSkippedA = getVisitStatus(a) === VISIT_STATUSES.SKIPPED;
      const isSkippedB = getVisitStatus(b) === VISIT_STATUSES.SKIPPED;
      
      if (isSkippedA && !isSkippedB) return 1;
      if (!isSkippedA && isSkippedB) return -1;

      const scoreA = getPriorityScore(a);
      const scoreB = getPriorityScore(b);
      if (scoreA !== scoreB) return scoreA - scoreB;
      const timeA = formatTimeTo24Hr(a.time) || a.time || '';
      const timeB = formatTimeTo24Hr(b.time) || b.time || '';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
    });
  }, [waitingQueue]);

  const nextApp = sortedWaitingQueue.length > 0 ? sortedWaitingQueue[0] : null;

  // ─────────────────────────────────────────────────────
  // MUTATIONS
  // ─────────────────────────────────────────────────────

  // Start Consultation
  const startConsultationMutation = useMutation({
    mutationFn: async (appOrId) => {
      const appId = typeof appOrId === 'object' ? appOrId._id : appOrId;
      const app = typeof appOrId === 'object' ? appOrId : (todayApps || []).find(a => a._id === appId);

      if (currentApp) {
        if (currentApp._id === appId) {
          return appId;
        }
        throw new Error(`Active consultation in progress for ${currentApp.patientId?.name || 'current patient'}. Please finish it first or click Continue Consultation.`);
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
          hospitalId: user?.hospitalId || user?.hospital?._id || user?.hospital,
          type: 'TriggerVoiceCall'
        };
        api.post('/workflow/events/trigger-call', callPayload).catch(err => console.error('Failed to trigger remote call:', err));
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

  // Finish Consultation
  const finishConsultationMutation = useMutation({
    mutationFn: async (appId) => {
      const app = (todayApps || []).find(a => a._id === appId);
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

  // Skip Patient
  const skipPatientMutation = useMutation({
    mutationFn: async (appId) => {
      await api.put(`/operations/appointments/${appId}/queue`, { queueStatus: 'Skipped' });
    },
    onSuccess: () => {
      toast('Patient moved to skipped queue.', { icon: '⏭️' });
      queryClient.invalidateQueries(['doctorQueue']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to skip patient')
  });

  // Recall Patient
  const recallPatientMutation = useMutation({
    mutationFn: async (appId) => {
      await api.put(`/operations/appointments/${appId}/queue`, { queueStatus: 'Waiting', status: 'Admitted' });
    },
    onSuccess: () => {
      toast.success('Patient recalled to waiting queue');
      queryClient.invalidateQueries(['doctorQueue']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to recall patient')
  });

  // Mark No Show
  const markNoShowMutation = useMutation({
    mutationFn: async (appId) => {
      await api.put(`/operations/appointments/${appId}/queue`, { status: 'Cancelled', queueStatus: 'Skipped' });
    },
    onSuccess: () => {
      toast('Patient marked as No Show. Appointment closed.', { icon: '🚫' });
      queryClient.invalidateQueries(['doctorQueue']);
      setIsNoShowConfirmOpen(false);
      setSelectedApp(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to mark no show')
  });

  // Transfer Doctor
  const transferDoctorMutation = useMutation({
    mutationFn: async ({ appId, doctorId }) => {
      await api.put(`/operations/appointments/${appId}/queue`, { doctorId });
    },
    onSuccess: () => {
      toast.success('Patient transferred to selected doctor room');
      setIsTransferOpen(false); setSelectedApp(null); setTransferDoctorId('');
      queryClient.invalidateQueries(['doctorQueue']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to transfer doctor')
  });

  // Reschedule
  const rescheduleMutation = useMutation({
    mutationFn: async ({ appId, date, time }) => {
      await api.put(`/operations/appointments/${appId}/queue`, { date, time });
    },
    onSuccess: () => {
      toast.success('Appointment rescheduled successfully');
      setIsRescheduleOpen(false); setSelectedApp(null); setRescheduleForm({ date: '', time: '' });
      queryClient.invalidateQueries(['doctorQueue']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reschedule')
  });

  // ─────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────

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

  const handleCallNextPatient = () => {
    if (currentApp) {
      toast.error('Please finish or skip the current consultation before calling the next patient.');
      return;
    }
    if (!nextApp) {
      toast.error('No waiting patients in the arrived queue.');
      return;
    }
    startConsultationMutation.mutate(nextApp);
  };

  const handleAcceptPatientPlan1 = (app) => {
    const target = app || nextApp;
    if (!target) {
      toast.error('No waiting patients in the arrived queue.');
      return;
    }
    const evalResult = getAppointmentActions(target, 'Doctor');
    const isSubscriptionInactive = user?.hospitalStatus === 'inactive' || user?.hospital?.status === 'inactive';
    const canStart = evalResult.actions.canStartConsultation && !isSubscriptionInactive;
    if (!canStart) {
      toast.error(evalResult.reasons.startConsultation || 'Payment required before consultation.');
      return;
    }
    console.log("[PLAN1][DOCTOR] ACCEPT_PATIENT clicked");
    console.log("[PLAN1][DOCTOR] RECEPTION_VOICE_CALL SENT");
    const callPayload = {
      tokenNumber: target.tokenNumber,
      patientName: target.patientId?.name || 'Patient',
      doctorName: target.doctorId?.name || target.doctorName || user?.name || 'Doctor',
      roomNumber: target.doctorId?.roomNumber || target.roomNumber || '',
      hospitalId: user?.hospitalId || user?.hospital?._id || user?.hospital,
      type: 'TriggerVoiceCall'
    };
    api.post('/workflow/events/trigger-call', callPayload).catch(err => console.error('Failed to trigger remote call:', err));
    
    api.put(`/operations/appointments/${target._id}/queue`, { status: 'Completed', queueStatus: 'Completed' })
      .then(() => {
        toast.success(`✓ Token #${target.tokenNumber} Accepted & Completed! Voice call sent to Reception desk.`);
        queryClient.invalidateQueries(['doctorQueue']);
        queryClient.invalidateQueries(['appointments']);
      })
      .catch(err => toast.error('Failed to update queue status'));
  };

  const handleRecallVoicePlan1 = (app) => {
    if (!app) return;
    const callPayload = {
      tokenNumber: app.tokenNumber,
      patientName: app.patientId?.name || 'Patient',
      doctorName: app.doctorId?.name || app.doctorName || user?.name || 'Doctor',
      roomNumber: app.doctorId?.roomNumber || app.roomNumber || '',
      hospitalId: user?.hospitalId || user?.hospital?._id || user?.hospital,
      patientObj: app,
      isRepeat: true
    };
    api.post('/workflow/events/trigger-call', { ...callPayload, type: 'TriggerVoiceCall' }).catch(() => {});
    toast.success(`📢 Re-calling Token #${app.tokenNumber} at Reception`);
  };

  const handleNoShowConfirm = (app) => {
    setSelectedApp(app);
    setIsNoShowConfirmOpen(true);
  };

  // ─────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────

  const consultationTypeColors = {
    'Emergency': 'bg-rose-50 text-rose-700 border-rose-200/90 shadow-2xs',
    'Walk-In': 'bg-slate-100 text-slate-700 border-slate-300/90 shadow-2xs',
    'Appointment': 'bg-blue-50 text-blue-700 border-blue-200/90 shadow-2xs',
    'Follow-Up': 'bg-amber-50 text-amber-800 border-amber-200/90 shadow-2xs'
  };

  const queueTableHeaders = [
    { key: 'tokenNumber', label: 'Token', render: (row) => (
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[#2F63F2] font-mono text-sm">#{row.tokenNumber || '—'}</span>
        </div>
      </div>
    )},
    { key: 'patientId.name', label: 'Patient', render: (row) => (
      <div>
        <p className="font-bold text-slate-800 text-xs">{row.patientId?.name || row.patientName}</p>
        <p className="text-[10px] text-slate-400 font-mono">{row.patientId?.uhid || '—'}</p>
      </div>
    )},
    { key: 'patientId.age', label: 'Age / Gender', render: (row) => {
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
    }},
    { key: 'time', label: 'Slot', render: (row) => (
      <span className="font-mono text-xs text-slate-600 whitespace-nowrap">{row.time || '—'}</span>
    )},
    { key: 'consultationType', label: 'Type', render: (row) => {
      const type = row.consultationType || 'Walk-In';
      return (
        <span className={`inline-flex items-center justify-center whitespace-nowrap text-[10px] font-bold border px-2.5 py-1 rounded-md uppercase tracking-wider ${consultationTypeColors[type] || 'bg-slate-100 text-slate-700 border-slate-300 shadow-2xs'}`}>
          {type}
        </span>
      );
    }},
    { key: 'visitStatus', label: 'Visit Status', render: (row) => {
      const status = getVisitStatus(row);
      const badge = getVisitStatusBadgeConfig(status);
      return (
        <span className={`inline-flex items-center justify-center whitespace-nowrap text-[9px] font-bold border px-2.5 py-1 rounded-xl uppercase tracking-wider ${badge.style}`}>
          {badge.label}
        </span>
      );
    }}
  ];

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Today's Patients</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Single workspace for Doctor OPD. All queue actions are driven strictly by Visit Status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTogglePresence}
            disabled={isPresenceLoading}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all shadow-xs cursor-pointer ${
              isOnline 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100/80' 
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200/80'
            }`}
            title="Toggle Doctor Online / Offline Presence"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{isOnline ? 'Online (Available)' : 'Offline'}</span>
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-[#2F63F2] transition-colors px-3 py-2 rounded-xl border border-slate-200 hover:border-[#2F63F2]/30 bg-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* 1. Stats Row (2x2 Grid on Mobile, 4-Cols on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* In Consultation */}
        <div className={`rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between border shadow-xs ${currentApp ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-[#E5E7EB]'}`}>
          <div className="flex justify-between items-center gap-1">
            <span className={`text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider truncate ${currentApp ? 'text-indigo-200' : 'text-slate-400'}`}>
              In Consult ({inConsultationCount})
            </span>
            <span className="text-sm sm:text-base shrink-0">🩺</span>
          </div>
          <div className="mt-2">
            <p className={`text-xs sm:text-sm font-bold truncate ${currentApp ? 'text-white' : 'text-slate-800'}`}>
              {currentApp?.patientId?.name || 'Room Available'}
            </p>
            {currentApp && (
              <p className="text-[10px] text-indigo-200 font-mono">Token #{currentApp.tokenNumber}</p>
            )}
          </div>
        </div>

        {/* Waiting */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex justify-between items-center gap-1">
            <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">Waiting Queue</span>
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />
          </div>
          <div className="mt-2">
            <span className="text-xl sm:text-2xl font-extrabold font-mono text-amber-600">{waitingCount}</span>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">patients in lobby</p>
          </div>
        </div>

        {/* Completed Today */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex justify-between items-center gap-1">
            <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">Completed Today</span>
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="mt-2">
            <span className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-600">{completedCount}</span>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">consultations done</p>
          </div>
        </div>

        {/* No Show */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex justify-between items-center gap-1">
            <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">No Show</span>
            <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0" />
          </div>
          <div className="mt-2">
            <span className="text-xl sm:text-2xl font-extrabold font-mono text-rose-600">{noShowCount}</span>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">cancelled / absent</p>
          </div>
        </div>
      </div>

      {/* 2. Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Console + Today's Patients Tabs */}
        <div className="lg:col-span-2 space-y-5">

          {/* ── Room Console ── */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {isTokenOnlyPlan ? '📢 OPD Token Queue Console' : '📢 OPD Consultation Room Console'}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {isTokenOnlyPlan 
                    ? 'Automated Queue Engine flow. Accept token and trigger voice call at Reception.' 
                    : 'Automated Queue Engine flow. Start consultation for the next ready patient.'}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {isTokenOnlyPlan ? (
                  <Button
                    onClick={() => handleAcceptPatientPlan1(nextApp)}
                    variant="primary"
                    disabled={!nextApp || !getAppointmentActions(nextApp, 'Doctor').actions.canStartConsultation}
                    className="text-xs font-bold uppercase tracking-wider py-2 bg-[#2F63F2] hover:bg-blue-700 text-white"
                  >
                    <Volume2 className="w-4 h-4 mr-1 inline" /> Accept Next Patient
                  </Button>
                ) : (
                  <Button
                    onClick={handleCallNextPatient}
                    variant="primary"
                    disabled={!nextApp || startConsultationMutation.isPending || !!currentApp || !getAppointmentActions(nextApp, 'Doctor').actions.canStartConsultation}
                    className="text-xs font-bold uppercase tracking-wider py-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    ▶ Start Consultation
                  </Button>
                )}
              </div>
            </div>

            {/* Current Patient Banner */}
            {currentApp ? (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="space-y-1.5">
                    <span className="bg-indigo-600 text-white font-bold text-[9px] px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
                      {isTokenOnlyPlan ? '🎟️ Active Patient' : '🩺 In Consultation'}
                    </span>
                    <h4 className="text-sm font-bold text-slate-800 mt-1">
                      {currentApp.patientId?.name}
                      <span className="text-slate-400 font-mono text-xs ml-2">(Token #{currentApp.tokenNumber})</span>
                    </h4>
                    <p className="text-xs text-slate-600 font-medium">
                      UHID: {currentApp.patientId?.uhid} &nbsp;|&nbsp; Age: {currentApp.patientId?.age} Yrs &nbsp;|&nbsp; {currentApp.patientId?.gender}
                    </p>
                    <p className="text-[10px] text-indigo-700 font-mono font-bold">
                      Started: {currentApp.updatedAt ? new Date(currentApp.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </p>
                    {!isTokenOnlyPlan && currentApp.patientId?.medicalAlerts && (
                      <div className="flex items-center gap-1.5 text-rose-600 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        ALERT: {currentApp.patientId.medicalAlerts}
                      </div>
                    )}
                    {currentApp.vitals?.bpSystolic && (
                      <p className="text-[10px] text-slate-500 font-mono">
                        BP: {currentApp.vitals.bpSystolic}/{currentApp.vitals.bpDiastolic} &nbsp;|&nbsp; Pulse: {currentApp.vitals.pulse} bpm &nbsp;|&nbsp; Temp: {currentApp.vitals.temperature}°F
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 w-full sm:w-auto sm:items-end">
                    {isTokenOnlyPlan ? (
                      <>
                        <button
                          onClick={() => finishConsultationMutation.mutate(currentApp._id)}
                          disabled={finishConsultationMutation.isPending}
                          className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold px-4 py-2 rounded-xl text-xs transition-all disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete Token</span>
                        </button>
                        <button
                          onClick={() => handleRecallVoicePlan1(currentApp)}
                          className="bg-blue-50 text-[#2F63F2] hover:bg-blue-100 border border-blue-200 font-bold px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Re-Call Voice</span>
                        </button>
                        <button
                          onClick={() => skipPatientMutation.mutate(currentApp._id)}
                          disabled={skipPatientMutation.isPending}
                          className="bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 font-bold px-4 py-2 rounded-xl text-xs transition-all disabled:opacity-60 cursor-pointer"
                        >
                          ⏭️ Skip Patient
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => navigate(`/doctor/consultation/${currentApp._id}`)}
                          className="bg-[#2F63F2] text-white hover:bg-blue-700 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer"
                        >
                          🖊️ Continue Consultation
                        </button>
                        <button
                          onClick={() => finishConsultationMutation.mutate(currentApp._id)}
                          disabled={finishConsultationMutation.isPending}
                          className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold px-4 py-2 rounded-xl text-xs transition-all disabled:opacity-60 cursor-pointer"
                        >
                          ✓ Finish Consultation
                        </button>
                        <button
                          onClick={() => skipPatientMutation.mutate(currentApp._id)}
                          disabled={skipPatientMutation.isPending}
                          className="bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 font-bold px-4 py-2 rounded-xl text-xs transition-all disabled:opacity-60 cursor-pointer"
                        >
                          ⏭️ Skip Patient
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs font-semibold space-y-2">
                <p>
                  {isTokenOnlyPlan 
                    ? <span>💤 No active patient in room. Click <strong>"Accept Next Patient"</strong> to call next token from lobby.</span>
                    : <span>💤 No active consultation. Click <strong>"Start Consultation"</strong> to begin.</span>}
                </p>
                {nextApp && (
                  <p className="text-[10px] text-[#2F63F2] font-bold">
                    Next up: {nextApp.patientId?.name} — Token #{nextApp.tokenNumber} ({nextApp.consultationType})
                  </p>
                )}
                {nextApp && getAppointmentActions(nextApp, 'Doctor').reasons.startConsultation && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-bold flex items-center justify-center gap-2 mt-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{getAppointmentActions(nextApp, 'Doctor').reasons.startConsultation}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Unified "Today's Patients" Tabs ── */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">📋 Today's Patients Workspace</h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Single view for all patient statuses today. Actions are strictly driven by Visit Status.
                </p>
              </div>
              {/* Tab Selector */}
              <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-xl gap-1 self-start flex-wrap">
                {[
                  { key: 'waiting',         label: `Waiting (${waitingCount})`,         color: 'text-amber-600' },
                  { key: 'in_consultation', label: `In Consultation (${inConsultationCount})`, color: 'text-indigo-600' },
                  { key: 'completed',       label: `Completed Today (${completedCount})`, color: 'text-emerald-600' },
                  { key: 'noshow',          label: `No Show (${noShowCount})`,           color: 'text-rose-600' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveQueueTab(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeQueueTab === tab.key
                        ? `bg-white shadow-sm ${tab.color}`
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-[#E5E7EB] rounded-xl bg-white">
              <Table
                headers={queueTableHeaders}
                data={
                  activeQueueTab === 'completed'       ? completedTodayQueue
                  : activeQueueTab === 'in_consultation' ? inConsultationQueue
                  : activeQueueTab === 'noshow'          ? noShowQueue
                  : sortedWaitingQueue
                }
                actions={[
                  // 1. Actions for WAITING TAB ONLY
                  ...(isTokenOnlyPlan ? [
                    {
                      label: (row) => {
                        const canStart = getAppointmentActions(row, 'Doctor').actions.canStartConsultation;
                        if (!canStart) return 'Payment Pending';
                        return 'Accept Patient';
                      },
                      icon: Volume2,
                      isPrimary: true,
                      disabled: (row) => !getAppointmentActions(row, 'Doctor').actions.canStartConsultation,
                      onClick: (row) => handleAcceptPatientPlan1(row),
                      show: (row) => activeQueueTab === 'waiting' && getVisitStatus(row) !== VISIT_STATUSES.SCHEDULED && !isCompletedVisit(getVisitStatus(row)) && getVisitStatus(row) !== VISIT_STATUSES.SKIPPED
                    }
                  ] : [
                    {
                      label: (row) => {
                        if (currentApp) return 'Consultation In Progress';
                        if (row._id === nextApp?._id) return 'Start Consultation';
                        return 'Waiting for Previous Patient';
                      },
                      icon: Play,
                      isPrimary: true,
                      disabled: (row) => !!currentApp || (row._id !== nextApp?._id),
                      onClick: (row) => {
                        if (currentApp) {
                          toast.error('Please finish current consultation before starting another.');
                          return;
                        }
                        startConsultationMutation.mutate(row);
                      },
                      show: (row) => activeQueueTab === 'waiting' && getVisitStatus(row) !== VISIT_STATUSES.SCHEDULED && !isCompletedVisit(getVisitStatus(row)) && getVisitStatus(row) !== VISIT_STATUSES.SKIPPED
                    }
                  ]),
                  {
                    label: 'Skip Patient',
                    icon: XCircle,
                    onClick: (row) => skipPatientMutation.mutate(row._id),
                    show: (row) => activeQueueTab === 'waiting' && getVisitStatus(row) === VISIT_STATUSES.WAITING
                  },
                  {
                    label: 'Recall Patient',
                    icon: RefreshCw,
                    isPrimary: true,
                    onClick: (row) => recallPatientMutation.mutate(row._id),
                    show: (row) => activeQueueTab === 'waiting' && getVisitStatus(row) === VISIT_STATUSES.SKIPPED
                  },
                  {
                    label: 'Mark No Show',
                    icon: UserX,
                    onClick: (row) => handleNoShowConfirm(row),
                    show: () => activeQueueTab === 'waiting'
                  },
                  {
                    label: 'Reschedule',
                    icon: Calendar,
                    onClick: (row) => {
                      setSelectedApp(row);
                      setRescheduleForm({ date: row.date?.split('T')[0] || '', time: formatTimeTo24Hr(row.time) });
                      setIsRescheduleOpen(true);
                    },
                    show: () => activeQueueTab === 'waiting'
                  },
                  {
                    label: 'Transfer Room',
                    icon: RefreshCw,
                    onClick: (row) => { setSelectedApp(row); setTransferDoctorId(''); setIsTransferOpen(true); },
                    show: () => activeQueueTab === 'waiting'
                  },
                  {
                    label: 'Transfer to IPD',
                    icon: Bed,
                    onClick: (row) => setTransferToIpdApp(row),
                    show: (row) => {
                      if (!isIpdEnabled) return false;
                      const appSt = (row.status || row.queueStatus || '').toLowerCase();
                      return appSt !== 'admitted';
                    }
                  },

                  // 2. Actions for IN CONSULTATION TAB ONLY
                  ...(isTokenOnlyPlan ? [
                    {
                      label: 'Complete Token',
                      icon: CheckCircle2,
                      isPrimary: true,
                      onClick: (row) => finishConsultationMutation.mutate(row._id),
                      show: () => activeQueueTab === 'in_consultation'
                    },
                    {
                      label: 'Re-Call Voice',
                      icon: Volume2,
                      onClick: (row) => handleRecallVoicePlan1(row),
                      show: () => activeQueueTab === 'in_consultation'
                    }
                  ] : [
                    {
                      label: 'Continue Consultation',
                      icon: Play,
                      isPrimary: true,
                      onClick: (row) => navigate(`/doctor/consultation/${row._id}`),
                      show: () => activeQueueTab === 'in_consultation'
                    },
                    {
                      label: 'Finish Consultation',
                      icon: CheckCircle2,
                      onClick: (row) => finishConsultationMutation.mutate(row._id),
                      show: () => activeQueueTab === 'in_consultation'
                    }
                  ]),

                  // 3. Actions for COMPLETED TODAY TAB ONLY
                  ...(isTokenOnlyPlan ? [] : [
                    {
                      label: 'View Consultation',
                      icon: Eye,
                      isPrimary: true,
                      onClick: (row) => navigate(`/doctor/consultation/${row._id}?mode=view`),
                      show: () => activeQueueTab === 'completed'
                    },
                    {
                      label: 'View Prescription',
                      icon: FileText,
                      onClick: (row) => navigate(`/doctor/consultation/${row._id}?mode=view`),
                      show: () => activeQueueTab === 'completed'
                    }
                  ]),

                  // Shared info / history for all tabs
                  {
                    label: 'Patient Info',
                    icon: Eye,
                    onClick: (row) => { setSelectedApp(row); setIsPatientDetailOpen(true); }
                  },
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
                  }
                ]}
                loading={queueLoading}
              />
            </div>

            {(() => {
              const activeList = activeQueueTab === 'completed' ? completedTodayQueue
                : activeQueueTab === 'in_consultation' ? inConsultationQueue
                : activeQueueTab === 'noshow' ? noShowQueue
                : sortedWaitingQueue;
              return activeList.length === 0 && !queueLoading && (
                <div className="py-8 text-center text-slate-400">
                  <ShieldCheck className="w-9 h-9 text-emerald-400 mx-auto mb-2 opacity-70" />
                  <p className="text-xs font-bold text-slate-700">No patients found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">No patients in this tab.</p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Right: Medical Alerts & Follow-ups */}
        <div className="lg:col-span-1 space-y-5">

          {!isTokenOnlyPlan && (
            <>
              {/* Medical Alerts */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-rose-600 flex items-center gap-1.5">
                    🚨 Medical Alerts
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Flagged allergy & condition warnings for today's patients.</p>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {recentAlerts.length > 0 ? recentAlerts.map((item, idx) => (
                    <div key={idx} className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700">
                      <p className="font-bold flex justify-between items-center text-xs">
                        <span>{item.patientName}</span>
                        <span className="text-[10px] text-rose-400 font-mono">{item.uhid}</span>
                      </p>
                      <p className="text-[11px] mt-1 font-medium text-rose-800">⚠ {item.alert}</p>
                    </div>
                  )) : (
                    <p className="text-center text-slate-400 text-xs font-medium py-4">No alerts flagged today.</p>
                  )}
                </div>
              </div>

              {/* Follow-ups */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">📅 Follow-up Appointments</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Patients scheduled for follow-up review today.</p>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {todayQueue.filter(a => a.consultationType === 'Follow-Up').map((item, idx) => {
                    const visitSt = getVisitStatus(item);
                    const badge = getVisitStatusBadgeConfig(visitSt);
                    return (
                      <div key={idx} className="p-3 bg-slate-50 border border-[#E5E7EB] rounded-xl flex justify-between items-center">
                        <div>
                          <h5 className="font-bold text-slate-800 text-xs">{item.patientId?.name}</h5>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {item.time} | Token #{item.tokenNumber}
                          </p>
                        </div>
                        <span className={`text-[9px] font-bold border px-2 py-0.5 rounded-lg uppercase tracking-wider ${badge.style}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                  {todayQueue.filter(a => a.consultationType === 'Follow-Up').length === 0 && (
                    <p className="text-center text-slate-400 text-xs font-medium py-4">No follow-ups booked today.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {isTokenOnlyPlan && (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#2F63F2] flex items-center gap-1.5">
                  📢 Token Queue Overview
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Physical Paper Prescription Mode (Plan 1)</p>
              </div>
              <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-xl space-y-3">
                <p className="text-xs font-medium text-slate-700 leading-relaxed">
                  Prescriptions are written manually on physical paper letterheads. Accept patients to broadcast automated token voice announcements at Reception.
                </p>
                <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs font-bold text-blue-950">
                  <span>Total Patients in Queue:</span>
                  <span className="font-mono text-sm">{waitingCount + inConsultationCount + completedCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────
          MODALS
      ───────────────────────────────────────────────────── */}

      {/* 1. Patient Detail */}
      <Modal isOpen={isPatientDetailOpen} onClose={() => { setIsPatientDetailOpen(false); setSelectedApp(null); }} title="Outpatient Profile Summary">
        {selectedApp && (
          <div className="space-y-3.5 text-xs text-left">
            <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl flex justify-between font-bold text-[#2F63F2]">
              <span>{selectedApp.patientId?.name}</span>
              <span className="font-mono">{selectedApp.patientId?.uhid}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-slate-700">
              <p><strong>Mobile:</strong> <span className="font-mono">{selectedApp.patientId?.mobileNumber}</span></p>
              {selectedApp.patientId?.alternativeMobile && <p><strong>Alt Mobile:</strong> <span className="font-mono">{selectedApp.patientId.alternativeMobile}</span></p>}
              <p><strong>Gender / Age:</strong> {selectedApp.patientId?.gender} / {selectedApp.patientId?.age} Yrs</p>
              <p><strong>Blood Group:</strong> {selectedApp.patientId?.bloodGroup || 'N/A'}</p>
            </div>
            {selectedApp.patientId?.medicalAlerts && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                ALERT: {selectedApp.patientId.medicalAlerts}
              </div>
            )}
            {selectedApp.vitals?.bpSystolic && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 font-mono text-[10px]">
                <p className="font-bold text-slate-700 text-xs mb-1">Vitals</p>
                <div className="grid grid-cols-2 gap-1.5 text-slate-600">
                  <span>BP: {selectedApp.vitals.bpSystolic}/{selectedApp.vitals.bpDiastolic} mmHg</span>
                  <span>Pulse: {selectedApp.vitals.pulse} bpm</span>
                  <span>Temp: {selectedApp.vitals.temperature}°F</span>
                  <span>SpO₂: {selectedApp.vitals.spo2}%</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 2. Transfer Doctor */}
      <Modal isOpen={isTransferOpen} onClose={() => { setIsTransferOpen(false); setSelectedApp(null); }} title="Transfer Patient — Consulting Room">
        <form onSubmit={handleTransferSubmit} className="space-y-4 text-left">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Target Doctor Room <span className="text-rose-500">*</span></label>
            <select
              className="enterprise-input w-full h-[40px] text-xs font-medium"
              value={transferDoctorId}
              onChange={(e) => setTransferDoctorId(e.target.value)}
              required
            >
              <option value="">Choose doctor room...</option>
              {doctors?.filter(d => d._id !== user?._id).map(d => (
                <option key={d._id} value={d._id}>{d.name} ({d.departmentId?.name || 'OPD'})</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" className="w-full h-[40px] text-xs font-bold uppercase tracking-wider" loading={transferDoctorMutation.isPending}>
            Transfer Room
          </Button>
        </form>
      </Modal>

      {/* 3. Reschedule */}
      <Modal isOpen={isRescheduleOpen} onClose={() => { setIsRescheduleOpen(false); setSelectedApp(null); }} title="Reschedule OPD Consultation Slot">
        <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-left">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">New Date <span className="text-rose-500">*</span></label>
              <input
                type="date"
                className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
                value={rescheduleForm.date}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">New Slot Time <span className="text-rose-500">*</span></label>
              <input
                type="time"
                className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
                value={rescheduleForm.time}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, time: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" variant="primary" className="w-full h-[40px] text-xs font-bold uppercase tracking-wider" loading={rescheduleMutation.isPending}>
            Confirm Reschedule
          </Button>
        </form>
      </Modal>

      {/* 4. Print Token */}
      <OpdTokenPrintModal
        isOpen={isPrintTokenOpen}
        onClose={() => { setIsPrintTokenOpen(false); setSelectedApp(null); }}
        appointment={selectedApp}
      />

      {/* 5. No Show Confirmation */}
      <Modal isOpen={isNoShowConfirmOpen} onClose={() => { setIsNoShowConfirmOpen(false); setSelectedApp(null); }} title="Confirm: Mark as No Show">
        <div className="space-y-4 text-left">
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex gap-3">
            <UserX className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-700">
                Mark {selectedApp?.patientId?.name} as No Show?
              </p>
              <p className="text-xs text-rose-600 mt-1">
                This will permanently close the appointment (Token #{selectedApp?.tokenNumber}) without recording a consultation.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <Button
              onClick={() => markNoShowMutation.mutate(selectedApp?._id)}
              loading={markNoShowMutation.isPending}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider h-[40px] rounded-xl transition-all"
            >
              Yes, Mark No Show
            </Button>
            <Button
              onClick={() => { setIsNoShowConfirmOpen(false); setSelectedApp(null); }}
              variant="secondary"
              className="flex-1 text-xs font-bold uppercase tracking-wider h-[40px]"
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Transfer to IPD Modal (Strictly gated by isIpdEnabled) */}
      {isIpdEnabled && (
        <TransferToIPDModal
          isOpen={Boolean(transferToIpdApp)}
          onClose={() => setTransferToIpdApp(null)}
          appointment={transferToIpdApp}
        />
      )}

      {/* Patient Visit History Drawer */}
      <PatientHistoryDrawer
        isOpen={!!historyPatient}
        onClose={() => setHistoryPatient(null)}
        patient={historyPatient}
        title={historyPatient?.name ? `VISIT HISTORY - ${historyPatient.name.toUpperCase()}` : 'VISIT HISTORY'}
      />

    </div>
  );
};

export default DoctorDashboard;
