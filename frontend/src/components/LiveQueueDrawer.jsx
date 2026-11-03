import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../services/api';
import { 
  X, Activity, Users, RefreshCw, Search, Eye, ShieldCheck
} from 'lucide-react';

const LiveQueueDrawer = ({ isOpen, onClose, onViewAppointment }) => {
  const [selectedDoctorId, setSelectedDoctorId] = useState('ALL');
  const [queueTab, setQueueTab] = useState('ALL'); // 'ALL' | 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'SKIPPED'
  const [drawerSearch, setDrawerSearch] = useState('');

  // Get today string YYYY-MM-DD
  const todayStr = new Date().toLocaleDateString('en-CA');

  // 1. Fetch Doctors On Duty
  const { data: doctors = [] } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data.data;
    },
    enabled: isOpen
  });

  // 2. Fetch Today's Queue Appointments
  const { data: appointments = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['appointments', 'live_queue_drawer', todayStr],
    queryFn: async () => {
      const res = await api.get(`/operations/appointments?date=${todayStr}`);
      return res.data.data;
    },
    enabled: isOpen,
    refetchInterval: 8000 // auto refresh every 8 seconds
  });

  if (!isOpen) return null;

  const todayApps = appointments || [];

  // Doctors on duty statistics mapping
  const doctorStatsMap = doctors.map((doc) => {
    const docApps = todayApps.filter((a) => (a.doctorId?._id || a.doctorId) === doc._id);
    const waiting = docApps.filter((a) => a.queueStatus === 'Waiting').length;
    const consulting = docApps.filter((a) => ['In Consultation', 'In-Consultation', 'Called'].includes(a.queueStatus)).length;
    const done = docApps.filter((a) => ['Sent To Pharmacy', 'Dispensing', 'Dispensed', 'Completed'].includes(a.queueStatus)).length;
    return {
      ...doc,
      waiting,
      consulting,
      done,
      total: docApps.length
    };
  });

  // Base list for active doctor
  const doctorApps = todayApps.filter((app) => {
    if (selectedDoctorId !== 'ALL') {
      const docId = app.doctorId?._id || app.doctorId;
      return docId === selectedDoctorId;
    }
    return true;
  });

  // Calculate tab counts
  const waitingCount = doctorApps.filter((a) => a.queueStatus === 'Waiting').length;
  const consultingCount = doctorApps.filter((a) => ['In Consultation', 'In-Consultation', 'Called'].includes(a.queueStatus)).length;
  const completedCount = doctorApps.filter((a) => ['Sent To Pharmacy', 'Dispensing', 'Dispensed', 'Completed'].includes(a.queueStatus)).length;
  const skippedCount = doctorApps.filter((a) => a.queueStatus === 'Skipped').length;
  const totalCount = doctorApps.length;

  // Filtered queue items based on active tab
  let filteredQueue = doctorApps.filter((app) => {
    if (queueTab === 'WAITING') {
      return app.queueStatus === 'Waiting' || app.queueStatus === 'Skipped';
    }
    if (queueTab === 'IN_CONSULTATION') {
      return ['In Consultation', 'In-Consultation', 'Called'].includes(app.queueStatus);
    }
    if (queueTab === 'COMPLETED') {
      return ['Sent To Pharmacy', 'Dispensing', 'Dispensed', 'Completed'].includes(app.queueStatus);
    }
    if (queueTab === 'SKIPPED') {
      return app.queueStatus === 'Skipped';
    }
    return true;
  });

  // Search filter
  if (drawerSearch.trim()) {
    const q = drawerSearch.trim().toLowerCase();
    filteredQueue = filteredQueue.filter((a) => {
      const pName = (a.patientId?.name || '').toLowerCase();
      const pUhid = (a.patientId?.uhid || '').toLowerCase();
      const token = (a.tokenNumber || '').toLowerCase();
      return pName.includes(q) || pUhid.includes(q) || token.includes(q);
    });
  }

  // Skipped patients ALWAYS move to the LAST position of the waiting queue
  filteredQueue.sort((a, b) => {
    const isSkippedA = a.queueStatus === 'Skipped' || a.status === 'Skipped';
    const isSkippedB = b.queueStatus === 'Skipped' || b.status === 'Skipped';
    if (isSkippedA && !isSkippedB) return 1;
    if (!isSkippedA && isSkippedB) return -1;
    return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
  });

  // Active doctor details
  const activeDoctor = doctors.find((d) => d._id === selectedDoctorId);

  const modalMarkup = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] overflow-hidden font-sans">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
        />

        {/* Slide-over Drawer Panel */}
        <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="w-screen max-w-2xl bg-slate-50 shadow-2xl flex flex-col border-l border-slate-200"
          >
            {/* Drawer Top Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600/30 border border-blue-400/30 rounded-xl text-blue-400">
                  <Activity className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold tracking-wider uppercase text-white">Live Doctor Queue</h2>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      LIVE SSE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Real-time OPD queue monitoring workspace</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isRefetching}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  title="Refresh Queue"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* SECTION 1: DOCTORS ON DUTY SELECTOR */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#3563F6]" />
                    Doctors on Duty ({doctors.length})
                  </span>
                  <span className="text-[11px] text-slate-500">Select doctor to view queue</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedDoctorId('ALL')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      selectedDoctorId === 'ALL'
                        ? 'bg-[#3563F6] text-white border-[#3563F6] shadow-md ring-2 ring-blue-500/20'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-blue-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-extrabold ${selectedDoctorId === 'ALL' ? 'text-white' : 'text-slate-900'}`}>
                        All Active Doctors
                      </span>
                      <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                        selectedDoctorId === 'ALL' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {todayApps.length} Tokens
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold">
                      <span className={selectedDoctorId === 'ALL' ? 'text-blue-100' : 'text-blue-600'}>
                        Waiting: {todayApps.filter((a) => a.queueStatus === 'Waiting').length}
                      </span>
                      <span className={selectedDoctorId === 'ALL' ? 'text-purple-100' : 'text-purple-600'}>
                        Consulting: {todayApps.filter((a) => ['In Consultation', 'In-Consultation', 'Called'].includes(a.queueStatus)).length}
                      </span>
                    </div>
                  </button>

                  {doctorStatsMap.map((doc) => {
                    const isSelected = selectedDoctorId === doc._id;
                    return (
                      <button
                        key={doc._id}
                        type="button"
                        onClick={() => setSelectedDoctorId(doc._id)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-[#3563F6] text-white border-[#3563F6] shadow-md ring-2 ring-blue-500/20'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-blue-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            Dr. {doc.name?.replace(/^Dr\.\s*/i, '')}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
                            isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            Room 1
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] font-bold mt-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md ${isSelected ? 'bg-blue-700 text-blue-100' : 'bg-blue-50 text-blue-700'}`}>
                            Waiting: {doc.waiting}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md ${isSelected ? 'bg-purple-700 text-purple-100' : 'bg-purple-50 text-purple-700'}`}>
                            Consulting: {doc.consulting}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md ${isSelected ? 'bg-emerald-700 text-emerald-100' : 'bg-emerald-50 text-emerald-700'}`}>
                            Completed: {doc.done}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: QUEUE TABS & SEARCH BAR (MATCHING IMAGE 2) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Filter Tabs with Live Count Badges */}
                  <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl overflow-x-auto no-scrollbar">
                    {[
                      { key: 'WAITING', label: `Waiting (${waitingCount})` },
                      { key: 'IN_CONSULTATION', label: `In Consultation (${consultingCount})` },
                      { key: 'COMPLETED', label: `Completed (${completedCount})` },
                      { key: 'SKIPPED', label: `Skipped (${skippedCount})` },
                      { key: 'ALL', label: `All (${totalCount})` }
                    ].map((tab) => {
                      const active = queueTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setQueueTab(tab.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
                            active
                              ? 'bg-white text-[#3563F6] font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 font-semibold'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Drawer Search Input */}
                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search Token / Patient..."
                      value={drawerSearch}
                      onChange={(e) => setDrawerSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: QUEUE TABLE (MATCHING IMAGE 2 EXACTLY) */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                {isLoading ? (
                  <div className="p-8 text-center text-xs font-semibold text-slate-500">
                    Loading live doctor queue...
                  </div>
                ) : filteredQueue.length === 0 ? (
                  <div className="p-8 text-center text-xs font-semibold text-slate-400 italic">
                    No patient tokens match current queue filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                        <tr>
                          <th className="py-3 px-3">TOKEN</th>
                          <th className="py-3 px-3">PATIENT</th>
                          <th className="py-3 px-3">TIME</th>
                          <th className="py-3 px-3">PAYMENT</th>
                          <th className="py-3 px-3">STATUS</th>
                          <th className="py-3 px-3 text-center">VIEW</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {filteredQueue.map((app) => {
                          const isConsulting = ['In Consultation', 'In-Consultation', 'Called'].includes(app.queueStatus);
                          const isWaiting = app.queueStatus === 'Waiting';
                          const isDone = ['Sent To Pharmacy', 'Dispensing', 'Dispensed', 'Completed'].includes(app.queueStatus);

                          return (
                            <tr key={app._id} className="hover:bg-slate-50/70 transition-colors">
                              {/* TOKEN */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span className="font-mono text-xs font-bold text-[#3563F6] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl">
                                  #{app.tokenNumber || 'OP000'}
                                </span>
                              </td>

                              {/* PATIENT */}
                              <td className="py-3 px-3">
                                <div className="font-bold text-slate-900 text-xs">
                                  {app.patientId?.name || 'Unknown'}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  UHID: {app.patientId?.uhid || 'PAT000000'}
                                </div>
                              </td>

                              {/* TIME */}
                              <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono font-medium text-xs">
                                {app.time || '10:00 AM'}
                              </td>

                              {/* PAYMENT */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                                  app.billingStatus === 'Paid'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {app.billingStatus === 'Paid' ? 'Paid' : 'Unpaid'}
                                </span>
                              </td>

                              {/* STATUS */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                                  isConsulting
                                    ? 'bg-purple-100 text-purple-700 border-purple-200 animate-pulse'
                                    : isWaiting
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : isDone
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : app.queueStatus === 'Skipped'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 font-bold'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                  {app.queueStatus}
                                </span>
                              </td>

                              {/* VIEW ACTION */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onViewAppointment) onViewAppointment(app);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-[#3563F6] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* READ-ONLY QUEUE MONITOR NOTICE (MATCHING IMAGE 2) */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl text-center text-xs text-amber-900 font-medium flex items-center justify-center gap-1.5">
                <span className="text-amber-600 text-sm">💡</span>
                <span>Reception Queue Monitor is read-only. Consultation calling is controlled automatically by Doctor on duty.</span>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Live operational view synced with Doctor Workspaces
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modalMarkup, document.body);
};

export default LiveQueueDrawer;
