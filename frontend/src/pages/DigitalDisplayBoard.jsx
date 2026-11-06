import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { 
  Volume2, Maximize, Sun, Moon, Ticket, DoorOpen, Activity, Pill, ShieldCheck, CheckCircle2, Clock, Globe, ArrowLeft
} from 'lucide-react';

const DigitalDisplayBoard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { queueEngine } = useBillingSettings();
  const [theme, setTheme] = useState('dark'); // 'dark' | 'light'
  const [currentTime, setCurrentTime] = useState(new Date());
  const [voiceLang, setVoiceLang] = useState('en-US');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);

  const handleBackToDashboard = () => {
    // If navigation history exists within the application, go back
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
      return;
    }

    // Role-based dashboard destination
    const role = (user?.role || '').toUpperCase();
    if (role === 'SUPER_ADMIN') {
      navigate('/superadmin/dashboard');
    } else if (role === 'RECEPTIONIST') {
      navigate('/reception/dashboard');
    } else if (role === 'DOCTOR') {
      navigate('/doctor/dashboard');
    } else if (role === 'PHARMACIST') {
      navigate('/pharmacy/dashboard');
    } else {
      navigate('/admin/dashboard');
    }
  };

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync voice settings
  useEffect(() => {
    voiceAnnouncement.updateSettings({
      language: voiceLang,
      speed: voiceSpeed
    });
  }, [voiceLang, voiceSpeed]);

  const todayStr = new Date().toLocaleDateString('en-CA');

  // Fetch today's appointments (Same workflow state engine used by Reception & Doctor)
  const { data: appointments = [], refetch } = useQuery({
    queryKey: ['displayBoardAppointments', todayStr],
    queryFn: async () => {
      const res = await api.get(`/operations/appointments?date=${todayStr}`);
      return res.data?.data || [];
    },
    refetchInterval: 10000 // Fallback 10s refetch
  });

  // Real-Time Event Stream Listener
  useEffect(() => {
    const unsubscribe = workflowRealtime.subscribe((event) => {
      refetch();
      if (!event) return;
      const eventType = event.type || '';
      const qState = (event.queueState || event.queueStatus || event.status || '').toUpperCase();

      const isCallEvent =
        eventType === 'TriggerVoiceCall' ||
        eventType === 'ConsultationStarted' ||
        (eventType === 'PatientCalled' && (qState === 'CALLED' || qState.includes('CONSULTATION'))) ||
        qState === 'IN_CONSULTATION';

      // Note: Voice playback is strictly centralized to the OPD Reception Desk
      // Digital Display Board updates display visuals via refetch() without playing duplicate audio
    });

    return () => unsubscribe();
  }, [refetch]);

  // Seed lastVoiceAnnouncement from active consultation patient or top queue patient on load
  useEffect(() => {
    if (appointments && appointments.length > 0) {
      const activeApp = appointments.find(a => {
        const qState = (a.workflow?.queueState || a.queueStatus || a.status || '').toUpperCase();
        return qState === 'IN_CONSULTATION' || qState === 'IN-CONSULTATION' || qState === 'CALLED';
      }) || appointments[0];

      if (activeApp) {
        voiceAnnouncement.setLastAnnouncementFromPatient(activeApp);
      }
    }
  }, [appointments]);

  // Group by Doctor with Next 5 Ready Patients
  const doctorMap = {};
  const emergencyPatients = appointments.filter(a => {
    const st = (a.workflow?.queueState || a.queueStatus || a.status || '').toUpperCase();
    const isCompleted = st === 'COMPLETED' || st === 'SENT_TO_PHARMACY' || st === 'SENT TO PHARMACY' || a.pharmacyStatus === 'SENT' || a.pharmacyStatus === 'DISPENSING' || a.pharmacyStatus === 'DISPENSED';
    const isEmg = a.isEmergency || a.priorityLevel === 'EMERGENCY' || a.priority === 'EMERGENCY' || (a.consultationType || '').toLowerCase() === 'emergency' || String(a.tokenNumber || '').startsWith('EMG');
    
    // Only show Emergency patients who are BEFORE consultation (WAITING / READY / SCHEDULED / ARRIVED) or IN CONSULTATION
    return isEmg && !isCompleted && (st === 'WAITING' || st === 'READY' || st === 'SCHEDULED' || st === 'ARRIVED' || st === 'IN_CONSULTATION' || st === 'IN-CONSULTATION' || st === 'CALLED');
  });

  appointments.forEach((app) => {
    const docId = app.doctorId?._id || app.doctorId || 'unassigned';
    const docName = app.doctorId?.name || 'Dr. On Duty';
    const roomNo = app.doctorId?.doctorProfile?.roomNumber || `Room ${(Object.keys(doctorMap).length % 6) + 1}`;
    
    if (!doctorMap[docId]) {
      doctorMap[docId] = { 
        id: docId, 
        name: docName, 
        roomNumber: roomNo, 
        nowServing: null, 
        waitingList: [] 
      };
    }

    const qState = (app.workflow?.queueState || app.queueStatus || app.status || 'WAITING').toUpperCase();
    if (qState === 'CALLED' || qState === 'IN_CONSULTATION' || qState === 'IN-CONSULTATION') {
      if (!doctorMap[docId].nowServing) {
        doctorMap[docId].nowServing = app;
      }
    } else if (qState === 'WAITING' || qState === 'READY' || qState === 'SCHEDULED') {
      doctorMap[docId].waitingList.push(app);
    }
  });

  // Take top 5 ready waiting patients per doctor
  Object.values(doctorMap).forEach(doc => {
    doc.nextPatients = doc.waitingList.slice(0, 5);
  });

  // Pharmacy Queue Breakdown
  const pharmacyWaiting = appointments.filter(a => {
    const qState = (a.workflow?.queueState || a.queueStatus || a.status || '').toUpperCase();
    return qState === 'SENT_TO_PHARMACY' || qState === 'SENT TO PHARMACY';
  });

  const pharmacyDispensing = appointments.filter(a => {
    const pState = (a.pharmacyStatus || '').toUpperCase();
    return pState === 'DISPENSING';
  });

  // Completed Today Count
  const completedCount = appointments.filter(a => {
    const qState = (a.workflow?.queueState || a.queueStatus || a.status || '').toUpperCase();
    return qState === 'COMPLETED';
  }).length;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900';
  const cardBgClass = isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  return (
    <div className={`fixed inset-0 z-[9999] w-screen h-screen min-h-screen p-5 sm:p-6 font-sans flex flex-col justify-between overflow-y-auto select-none ${bgClass}`}>
      {/* Top Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          {/* Quick Back Arrow Button */}
          <button
            type="button"
            onClick={handleBackToDashboard}
            title="Back to Dashboard"
            className={`flex items-center justify-center w-11 h-11 rounded-2xl transition-all cursor-pointer shrink-0 border ${
              isDark 
                ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80 shadow-md' 
                : 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 shadow-sm'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="w-12 h-12 rounded-2xl bg-[#3B5BDB] flex items-center justify-center text-white font-extrabold text-xl shadow-lg">
            VZ
          </div>
          <div>
            <h1 className={`text-2xl font-black tracking-tight uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>VillZone HIMS — Digital Display Board</h1>
            <p className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Real-Time OPD Queue & Consultation Waiting Hall Display</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Voice Announcement Language & Controls */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 p-1 rounded-xl text-xs">
            <Globe className="w-3.5 h-3.5 text-blue-400 ml-1.5" />
            <select
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value)}
              className="bg-transparent font-bold text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="en-US" className="bg-slate-900 text-slate-200">English</option>
              <option value="ta-IN" className="bg-slate-900 text-slate-200">Tamil (தமிழ்)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => voiceAnnouncement.repeatLastAnnouncement()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 text-xs font-bold transition-all cursor-pointer"
          >
            <Volume2 className="w-4 h-4" /> Repeat Voice
          </button>

          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
          >
            <Maximize className="w-4 h-4" />
          </button>

          <div className="text-right font-mono border-l border-slate-800 pl-4">
            <div className="text-xl font-bold text-[#3B5BDB]">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">
              {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* Emergency Active Patients Flashing Banner */}
      {emergencyPatients.length > 0 && (
        <div className="bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 text-white p-4 rounded-2xl border-2 border-rose-400 shadow-xl mb-6 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <span className="text-xs font-black uppercase tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full border border-white/30">
                EMERGENCY ALERT
              </span>
              <h2 className="text-lg font-black tracking-tight mt-0.5">
                Token #{emergencyPatients[0].tokenNumber || 'EMG-01'} — {emergencyPatients[0].patientId?.name || 'Unknown Patient'}
              </h2>
              <p className="text-xs text-rose-100 font-bold">
                Patient: {emergencyPatients[0].patientId?.name || 'Unknown Patient'} {emergencyPatients[0].patientId?.age ? `(${emergencyPatients[0].patientId.age}Y` : ''}{emergencyPatients[0].patientId?.gender ? ` / ${emergencyPatients[0].patientId.gender})` : ')'} | Doctor: {emergencyPatients[0].doctorId?.name || 'Dr On Duty'}
              </p>
            </div>
          </div>
          <span className="text-xs font-black uppercase tracking-wider bg-white text-rose-700 px-4 py-2 rounded-xl shadow-md">
            PROCEED IMMEDIATELY
          </span>
        </div>
      )}

      {/* Main Grid — Doctor-wise Now Consulting & Next 5 Patients */}
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 mb-6">
        {Object.values(doctorMap).length === 0 ? (
          <div className={`col-span-full ${cardBgClass} rounded-3xl p-12 text-center text-slate-400 font-bold text-lg flex flex-col items-center justify-center gap-3`}>
            <Ticket className="w-12 h-12 text-slate-600 animate-bounce" />
            No active doctor queues today.
          </div>
        ) : (
          Object.values(doctorMap).map((doc) => {
            const waitingCount = doc.waitingList?.length || 0;
            const statusConfig = 
              waitingCount <= 3 
                ? { dot: '🟢', label: `Low (${waitingCount})`, style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
                : waitingCount <= 6
                ? { dot: '🟡', label: `Moderate (${waitingCount})`, style: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
                : { dot: '🔴', label: `Heavy (${waitingCount})`, style: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };

            return (
              <div key={doc.id} className={`${cardBgClass} rounded-3xl border p-5 flex flex-col justify-between space-y-4 shadow-xl`}>
                {/* Doctor Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div>
                    <span className="text-base font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[#3B5BDB]" /> Dr. {doc.name.replace(/^Dr\.\s*/i, '')}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium block">
                      OPD Consultation Room
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-300 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full">
                      {doc.roomNumber}
                    </span>
                  </div>
                </div>

                {/* NOW CONSULTING Banner */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white text-center shadow-lg relative overflow-hidden">
                  <span className="text-[10px] uppercase tracking-widest font-black opacity-80 block mb-1">
                    NOW CONSULTING
                  </span>
                  {doc.nowServing ? (
                    <>
                      <div className="text-5xl font-black font-mono tracking-tighter my-1 text-yellow-300 drop-shadow-md">
                        #{doc.nowServing.tokenNumber}
                      </div>
                      <div className="text-lg font-extrabold truncate">
                        {doc.nowServing.patientId?.name || 'Patient'}
                      </div>
                    </>
                  ) : (
                    <div className="text-xl font-bold py-3 text-blue-200">
                      Consultation Room Open
                    </div>
                  )}
                </div>

                {/* NEXT PATIENTS (Up to 5 READY Patients) */}
                <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400 uppercase tracking-wider text-[10px] font-extrabold flex items-center gap-1.5">
                      <DoorOpen className="w-3.5 h-3.5 text-blue-400" /> NEXT PATIENTS IN QUEUE:
                    </span>
                    <span className={`text-[10px] font-mono font-bold border px-2.5 py-0.5 rounded-md flex items-center gap-1 ${statusConfig.style}`}>
                      <span>{statusConfig.dot}</span>
                      <span>Waiting: {waitingCount}</span>
                    </span>
                  </div>

                  {doc.nextPatients && doc.nextPatients.length > 0 ? (
                    <div className="space-y-1.5 divide-y divide-slate-800/60">
                      {doc.nextPatients.map((pat, idx) => (
                        <div key={pat._id} className="flex items-center justify-between pt-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-200">{pat.patientId?.name || 'Patient'}</span>
                          </div>
                          <span className="font-mono font-bold text-xs text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                            #{pat.tokenNumber}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic py-2 text-center">
                      No waiting tokens in queue
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Bottom Footer Section — Pharmacy & Announcement Marquee */}
      <footer className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pharmacy Queue Status */}
          <div className={`col-span-2 ${cardBgClass} rounded-2xl border p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <Pill className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black uppercase text-amber-400 tracking-wider">Pharmacy Queue</span>
                <p className="text-[11px] text-slate-400 font-medium">Waiting: {pharmacyWaiting.length} | Dispensing: {pharmacyDispensing.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto max-w-xs scrollbar-none">
              {pharmacyWaiting.length === 0 ? (
                <span className="text-xs text-slate-500 italic">No pending pharmacy tokens</span>
              ) : (
                pharmacyWaiting.slice(0, 4).map(app => (
                  <span key={app._id} className="font-mono font-bold text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                    #{app.tokenNumber}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Completed Stats */}
          <div className={`${cardBgClass} rounded-2xl border p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black uppercase text-emerald-400 tracking-wider">Completed Today</span>
                <p className="text-[11px] text-slate-400 font-medium">Total visits completed</p>
              </div>
            </div>
            <span className="text-3xl font-black font-mono text-emerald-400">
              {completedCount}
            </span>
          </div>
        </div>

        {/* Broadcast Marquee Ticker */}
        <div className="bg-blue-950/80 border border-blue-800/80 text-blue-200 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-3 overflow-hidden">
          <span className="bg-blue-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-md uppercase tracking-wider shrink-0">
            NOTICE
          </span>
          <marquee className="font-medium">
            Please wait for your token number to be announced. Follow staff instructions in the waiting hall. Emergency cases are prioritized by hospital policy.
          </marquee>
        </div>
      </footer>
    </div>
  );
};

export default DigitalDisplayBoard;
