import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Search, Clock, RefreshCw, History, Check, X, ArrowLeft
} from 'lucide-react';
import api from '../services/api';
import { getVisitStatus, isCompletedVisit, VISIT_STATUSES } from '../utils/visitStatus';
import PatientHistoryDrawer from './PatientHistoryDrawer';

const getInitials = (name) => {
  if (!name) return 'PT';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const DoctorConsultationSidebar = ({ currentAppId, doctorId, onSelectPatient, onClose, isDrawer = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'waiting' | 'consulting' | 'completed'
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [historyPatient, setHistoryPatient] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const todayStr = new Date().toLocaleDateString('en-CA');

  // Fetch today's appointments for active doctor
  const { data: queue = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['doctorQueueSidebar', doctorId, todayStr],
    queryFn: async () => {
      if (!doctorId) return [];
      const res = await api.get(`/operations/appointments?date=${todayStr}&doctorId=${doctorId}`);
      return res.data?.data || [];
    },
    enabled: !!doctorId,
    refetchInterval: 8000 // Real-time auto refresh every 8 seconds
  });

  // Categorize appointments strictly into 3 queues
  const { waitingQueue, consultingQueue, completedQueue } = useMemo(() => {
    const waiting = [];
    const consulting = [];
    const completed = [];

    (queue || []).forEach((app) => {
      const st = getVisitStatus(app);
      const appSt = app.status || app.queueStatus || '';
      
      if (isCompletedVisit(st) || ['Completed', 'Sent to Pharmacy', 'Sent To Pharmacy'].includes(appSt) || ['SENT', 'DISPENSING', 'DISPENSED', 'SENT_TO_PHARMACY'].includes(app.pharmacyStatus)) {
        completed.push(app);
      } else if (st === VISIT_STATUSES.IN_CONSULTATION || appSt === 'In-Consultation' || appSt === 'In Consultation') {
        consulting.push(app);
      } else {
        waiting.push(app);
      }
    });

    // Sort waiting: Emergency first, then token order
    waiting.sort((a, b) => {
      const aIsEmg = a.isEmergency || a.priorityLevel === 'EMERGENCY' || a.priority === 'EMERGENCY' || (a.consultationType || '').toLowerCase() === 'emergency' || String(a.tokenNumber || '').startsWith('EMG');
      const bIsEmg = b.isEmergency || b.priorityLevel === 'EMERGENCY' || b.priority === 'EMERGENCY' || (b.consultationType || '').toLowerCase() === 'emergency' || String(b.tokenNumber || '').startsWith('EMG');
      if (aIsEmg && !bIsEmg) return -1;
      if (!aIsEmg && bIsEmg) return 1;
      return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
    });

    return { waitingQueue: waiting, consultingQueue: consulting, completedQueue: completed };
  }, [queue]);

  // Counts
  const counts = {
    waiting: waitingQueue.length,
    consulting: consultingQueue.length,
    completed: completedQueue.length
  };

  // Search Filter Helper
  const filterList = (list) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(a => {
      const name = (a.patientId?.name || '').toLowerCase();
      const token = (a.tokenNumber || '').toLowerCase();
      const uhid = (a.patientId?.uhid || '').toLowerCase();
      const mobile = (a.patientId?.phone || a.patientId?.mobileNumber || '').toLowerCase();
      return name.includes(q) || token.includes(q) || uhid.includes(q) || mobile.includes(q);
    });
  };

  const filteredConsulting = filterList(consultingQueue);
  const filteredWaiting = filterList(waitingQueue);
  const filteredCompleted = filterList(completedQueue);

  // Fetch patient medical history for drawer
  const { data: historyData } = useQuery({
    queryKey: ['patientHistorySidebarDrawer', historyPatient?._id],
    queryFn: async () => {
      if (!historyPatient?._id) return null;
      const res = await api.get(`/operations/patients/${historyPatient._id}/history`);
      return res.data.data;
    },
    enabled: !!historyPatient?._id
  });

  const getWaitingTime = (app) => {
    if (!app.createdAt) return 'Waiting';
    const created = new Date(app.createdAt);
    const now = new Date();
    const diffMins = Math.max(1, Math.floor((now - created) / (1000 * 60)));
    return `${diffMins} mins`;
  };

  const formatCompletionTime = (dateStr) => {
    if (!dateStr) return '10:15 AM';
    const dt = new Date(dateStr);
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSelect = (app) => {
    if (onSelectPatient) onSelectPatient(app);
  };

  // Render Helpers for Queue Sections
  const renderConsultingSection = () => (
    <div className="space-y-2">
      <h3 className="text-[10px] font-extrabold uppercase text-purple-700 tracking-wider flex items-center justify-between px-0.5">
        <span>CONSULTING ({counts.consulting})</span>
      </h3>
      {filteredConsulting.length === 0 ? (
        <div className="p-3 text-center text-[11px] text-slate-400 italic bg-slate-50 rounded-xl border border-slate-100">
          No patient currently consulting.
        </div>
      ) : (
        filteredConsulting.map((app) => {
          const isCurrent = app._id === currentAppId;
          const initials = getInitials(app.patientId?.name);

          return (
            <motion.div
              key={app._id}
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.15 }}
              onClick={() => handleSelect(app)}
              className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
                isCurrent
                  ? 'bg-blue-50/90 border-[#3563F6] border-l-4 border-l-[#3563F6] shadow-sm ring-1 ring-[#3563F6]/20'
                  : 'bg-purple-50/40 border-purple-200/90 hover:border-purple-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-extrabold text-[10px] flex items-center justify-center border border-purple-200 shrink-0">
                    {initials}
                  </div>
                  <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md text-purple-800 bg-purple-100/90 border border-purple-200">
                    #{app.tokenNumber || 'OP000'}
                  </span>
                </div>
                <span className="text-[9px] font-black text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                  Consulting
                </span>
              </div>

              <div>
                <h4 className="text-xs font-black text-slate-900 truncate">
                  {app.patientId?.name || 'Unknown Patient'}
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="text-[11px] font-semibold text-slate-600">
                    {app.patientId?.age ? `${app.patientId.age} yrs` : '—'} / {app.patientId?.gender ? (app.patientId.gender.length === 1 ? app.patientId.gender.toUpperCase() : app.patientId.gender.charAt(0).toUpperCase()) : '—'}
                  </span>
                  {app.patientId?.bloodGroup && app.patientId.bloodGroup !== 'Unknown' && app.patientId.bloodGroup !== 'N/A' && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs">
                      {app.patientId.bloodGroup}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-purple-100/80">
                <span className="text-slate-500 flex items-center gap-1 font-semibold">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {getWaitingTime(app)}
                </span>
                <span className={`px-2 py-0.5 rounded-md font-extrabold text-[9px] border ${
                  app.billingStatus === 'Paid'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {app.billingStatus === 'Paid' ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );

  const renderWaitingSection = () => (
    <div className="space-y-2">
      <h3 className="text-[10px] font-extrabold uppercase text-[#3563F6] tracking-wider flex items-center justify-between px-0.5">
        <span>WAITING ({counts.waiting})</span>
      </h3>
      {filteredWaiting.length === 0 ? (
        <div className="p-3 text-center text-[11px] text-slate-400 italic bg-slate-50 rounded-xl border border-slate-100">
          No patients waiting in queue.
        </div>
      ) : (
        filteredWaiting.map((app) => {
          const isCurrent = app._id === currentAppId;
          const isEmg = app.isEmergency || app.priorityLevel === 'EMERGENCY' || app.priority === 'EMERGENCY' || (app.consultationType || '').toLowerCase() === 'emergency' || String(app.tokenNumber || '').startsWith('EMG');
          const initials = getInitials(app.patientId?.name);

          return (
            <motion.div
              key={app._id}
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.15 }}
              onClick={() => handleSelect(app)}
              className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
                isCurrent
                  ? 'bg-blue-50/90 border-[#3563F6] border-l-4 border-l-[#3563F6] shadow-sm ring-1 ring-[#3563F6]/20'
                  : isEmg
                  ? 'bg-rose-50/70 border-rose-300 ring-1 ring-rose-500/20'
                  : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full font-extrabold text-[10px] flex items-center justify-center border shrink-0 ${
                    isEmg ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-blue-50 text-[#3563F6] border-blue-200'
                  }`}>
                    {initials}
                  </div>
                  <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-md border ${
                    isEmg ? 'text-rose-700 bg-rose-100 border-rose-200' : 'text-[#3563F6] bg-blue-50 border-blue-200'
                  }`}>
                    #{app.tokenNumber || 'OP000'}
                  </span>
                </div>
                {isEmg && (
                  <span className="text-[9px] font-black text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                    🚨 Emergency
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {app.patientId?.name || 'Unknown Patient'}
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="text-[11px] font-semibold text-slate-600">
                    {app.patientId?.age ? `${app.patientId.age} yrs` : '—'} / {app.patientId?.gender ? (app.patientId.gender.length === 1 ? app.patientId.gender.toUpperCase() : app.patientId.gender.charAt(0).toUpperCase()) : '—'}
                  </span>
                  {app.patientId?.bloodGroup && app.patientId.bloodGroup !== 'Unknown' && app.patientId.bloodGroup !== 'N/A' && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs">
                      {app.patientId.bloodGroup}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100">
                <span className="text-slate-500 flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {getWaitingTime(app)}
                </span>
                <span className={`px-2 py-0.5 rounded-md font-extrabold text-[9px] border ${
                  app.billingStatus === 'Paid'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {app.billingStatus === 'Paid' ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );

  const renderCompletedSection = () => (
    <div className="space-y-2">
      <h3 className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider flex items-center justify-between px-0.5">
        <span>COMPLETED TODAY ({counts.completed})</span>
        {activeFilter === 'completed' && counts.completed > 0 && (
          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">Showing All</span>
        )}
      </h3>
      {filteredCompleted.length === 0 ? (
        <div className="p-3 text-center text-[11px] text-slate-400 italic bg-slate-50 rounded-xl border border-slate-100">
          No completed consultations today.
        </div>
      ) : (
        <>
          {(showAllCompleted || activeFilter === 'completed' ? filteredCompleted : filteredCompleted.slice(0, 3)).map((app) => {
            const isCurrent = app._id === currentAppId;
            const initials = getInitials(app.patientId?.name);

            return (
              <motion.div
                key={app._id}
                whileHover={{ scale: 1.01 }}
                transition={{ duration: 0.15 }}
                onClick={() => handleSelect(app)}
                className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
                  isCurrent
                    ? 'bg-blue-50/90 border-[#3563F6] border-l-4 border-l-[#3563F6] shadow-sm'
                    : 'bg-white border-slate-200/90 hover:border-emerald-300 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-[10px] flex items-center justify-center border border-emerald-200 shrink-0">
                      {initials}
                    </div>
                    <span className="font-mono text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Check className="w-3 h-3" /> #{app.tokenNumber || 'OP000'}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md font-extrabold text-[9px] border ${
                    app.billingStatus === 'Paid'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                    {app.billingStatus === 'Paid' ? 'Paid' : 'Unpaid'}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {app.patientId?.name || 'Unknown Patient'}
                  </h4>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {app.patientId?.age ? `${app.patientId.age} yrs` : '—'} / {app.patientId?.gender ? (app.patientId.gender.length === 1 ? app.patientId.gender.toUpperCase() : app.patientId.gender.charAt(0).toUpperCase()) : '—'}
                    </span>
                    {app.patientId?.bloodGroup && app.patientId.bloodGroup !== 'Unknown' && app.patientId.bloodGroup !== 'N/A' && (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs">
                        {app.patientId.bloodGroup}
                      </span>
                    )}
                  </div>
                  {(app.primaryDiagnosis || app.diagnosis) && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-md inline-block mt-1 truncate max-w-full">
                      🩺 {app.primaryDiagnosis || (Array.isArray(app.diagnosis) ? app.diagnosis.join(', ') : app.diagnosis)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[10px]">
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Completed {formatCompletionTime(app.updatedAt || app.sentToPharmacyAt)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryPatient(app.patientId);
                      setIsHistoryDrawerOpen(true);
                    }}
                    className="text-[#3563F6] hover:underline font-extrabold"
                  >
                    History
                  </button>
                </div>
              </motion.div>
            );
          })}

          {activeFilter !== 'completed' && !showAllCompleted && filteredCompleted.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllCompleted(true)}
              className="w-full py-2 text-xs font-extrabold text-[#3563F6] bg-blue-50/80 hover:bg-blue-100 border border-blue-200/90 rounded-xl transition-colors cursor-pointer text-center"
            >
              View All Completed ({filteredCompleted.length})
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <aside className="w-[270px] shrink-0 bg-white border border-slate-200/90 rounded-2xl p-3 shadow-sm space-y-3 font-sans print:hidden text-left max-h-[calc(100vh-140px)] overflow-y-auto">
      
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#3563F6]/10 text-[#3563F6] flex items-center justify-center font-bold text-xs">
            <Users className="w-4 h-4 text-[#3563F6]" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 tracking-tight">Today's Queue</h2>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Live OPD Patient Workspace</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
              title="Collapse Queue"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Queue Statistics / Filter Buttons */}
      <div className="grid grid-cols-3 gap-1.5 text-center font-sans">
        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'waiting' ? 'all' : 'waiting')}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            activeFilter === 'waiting'
              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400/30'
              : 'bg-amber-50/80 border-amber-200/80 hover:bg-amber-100/60'
          }`}
          title="Click to view Waiting queue"
        >
          <span className="text-[9px] font-black uppercase text-amber-700 block tracking-wider">WAITING</span>
          <span className="text-base font-black text-amber-800 font-mono">{counts.waiting}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'consulting' ? 'all' : 'consulting')}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            activeFilter === 'consulting'
              ? 'bg-purple-100 border-purple-400 ring-2 ring-purple-400/30'
              : 'bg-purple-50/80 border-purple-200/80 hover:bg-purple-100/60'
          }`}
          title="Click to view Consulting queue"
        >
          <span className="text-[9px] font-black uppercase text-purple-700 block tracking-wider">CONSULTING</span>
          <span className="text-base font-black text-purple-800 font-mono">{counts.consulting}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'completed' ? 'all' : 'completed')}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            activeFilter === 'completed'
              ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-400/30 shadow-xs'
              : 'bg-emerald-50/80 border-emerald-200/80 hover:bg-emerald-100/60'
          }`}
          title="Click to view Completed Today patients in first view"
        >
          <span className="text-[9px] font-black uppercase text-emerald-700 block tracking-wider">COMPLETED</span>
          <span className="text-base font-black text-emerald-800 font-mono">{counts.completed}</span>
        </button>
      </div>

      {/* Quick View Filter Tabs */}
      <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl text-[10px] font-extrabold font-sans border border-slate-200/60">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-white text-slate-900 shadow-2xs font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('consulting')}
          className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
            activeFilter === 'consulting'
              ? 'bg-purple-600 text-white shadow-2xs font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Consulting
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('waiting')}
          className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
            activeFilter === 'waiting'
              ? 'bg-[#3563F6] text-white shadow-2xs font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Waiting
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('completed')}
          className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
            activeFilter === 'completed'
              ? 'bg-emerald-600 text-white shadow-2xs font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Completed
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search patient name, token, UHID or mobile..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] placeholder:text-slate-400 transition-all"
        />
      </div>

      {/* Stacked Queue Sections with Dynamic Ordering */}
      <div className="space-y-4 pr-0.5">
        {isLoading ? (
          <div className="p-6 text-center text-xs font-semibold text-slate-400">
            Loading active patient queue...
          </div>
        ) : (
          <>
            {activeFilter === 'completed' && (
              <>
                {renderCompletedSection()}
                {renderConsultingSection()}
                {renderWaitingSection()}
              </>
            )}

            {activeFilter === 'waiting' && (
              <>
                {renderWaitingSection()}
                {renderConsultingSection()}
                {renderCompletedSection()}
              </>
            )}

            {activeFilter === 'consulting' && (
              <>
                {renderConsultingSection()}
                {renderWaitingSection()}
                {renderCompletedSection()}
              </>
            )}

            {activeFilter === 'all' && (
              <>
                {renderConsultingSection()}
                {renderWaitingSection()}
                {renderCompletedSection()}
              </>
            )}
          </>
        )}
      </div>

      {/* Patient History Drawer */}
      <PatientHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        patient={historyPatient}
        patientHistory={historyData}
      />

    </aside>
  );
};

export default DoctorConsultationSidebar;
