import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { 
  Users, Clock, Activity, Search, Printer, Eye, 
  Stethoscope, CheckCircle2, RefreshCw, UserCheck, Check,
  CreditCard, ChevronRight, User
} from 'lucide-react';

const ReceptionistLiveQueue = () => {
  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [filterTab, setFilterTab] = useState('WAITING'); // 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'SKIPPED' | 'ALL'
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch doctors list
  const { data: doctors = [] } = useQuery({
    queryKey: ['liveQueueDoctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data?.data || [];
    }
  });

  // Fetch today's appointments (Single Shared Queue Engine Source)
  const { data: appointments = [], refetch, isLoading } = useQuery({
    queryKey: ['liveQueueAppointments', todayStr],
    queryFn: async () => {
      const res = await api.get(`/operations/appointments?date=${todayStr}`);
      return res.data?.data || [];
    },
    refetchInterval: 10000 // Fallback 10s auto refresh
  });

  // Subscribe to real-time SSE stream for instant queue synchronization & voice calling
  useEffect(() => {
    const unsubscribe = workflowRealtime.subscribe((event) => {
      refetch();
      if (event && event.type === 'PatientCalled') {
        const qState = (event.queueState || event.status || '').toUpperCase();
        if (qState === 'CALLED' || qState.includes('CONSULTATION')) {
          voiceAnnouncement.announceCall(event);
        }
      }
    });
    return () => unsubscribe();
  }, [refetch]);

  // Aggregate doctor-wise queue statistics map
  const doctorQueueMap = useMemo(() => {
    const map = {};

    // Initialize map for all active doctors
    doctors.forEach((doc) => {
      const docId = String(doc._id || doc.id);
      const spec = typeof doc.specialization === 'string' ? doc.specialization : (doc.department?.name || 'General OPD');
      map[docId] = {
        id: docId,
        doctor: doc,
        name: doc.name || 'Dr. On Duty',
        specialization: spec,
        roomNumber: doc.doctorProfile?.roomNumber || 'Room 1',
        waiting: [],
        inConsultation: [],
        completed: [],
        skipped: [],
        all: []
      };
    });

    // Populate appointment queues
    appointments.forEach((app) => {
      const docId = String(app.doctorId?._id || app.doctorId || 'unassigned');
      
      if (!map[docId]) {
        const docName = app.doctorId?.name || 'Doctor On Duty';
        map[docId] = {
          id: docId,
          doctor: app.doctorId,
          name: docName,
          specialization: 'General OPD',
          roomNumber: 'Room 1',
          waiting: [],
          inConsultation: [],
          completed: [],
          skipped: [],
          all: []
        };
      }

      map[docId].all.push(app);

      const qState = (app.workflow?.queueState || app.queueStatus || app.status || 'WAITING').toUpperCase();

      if (qState === 'CALLED' || qState === 'IN_CONSULTATION' || qState === 'IN-CONSULTATION') {
        map[docId].inConsultation.push(app);
      } else if (qState === 'COMPLETED' || qState === 'CONSULTATION_COMPLETED') {
        map[docId].completed.push(app);
      } else if (qState === 'SKIPPED') {
        map[docId].skipped.push(app);
      } else if (qState !== 'CANCELLED') {
        map[docId].waiting.push(app);
      }
    });

    return map;
  }, [doctors, appointments]);

  const doctorList = useMemo(() => Object.values(doctorQueueMap), [doctorQueueMap]);

  // Auto-select the first doctor on load
  useEffect(() => {
    if (!selectedDoctorId && doctorList.length > 0) {
      setSelectedDoctorId(doctorList[0].id);
    }
  }, [doctorList, selectedDoctorId]);

  // Active selected doctor queue object
  const selectedDocQueue = useMemo(() => {
    if (!selectedDoctorId) return doctorList[0] || null;
    return doctorQueueMap[selectedDoctorId] || doctorList[0] || null;
  }, [selectedDoctorId, doctorQueueMap, doctorList]);

  // Filtered patients for the Right Panel detailed list
  const filteredPatients = useMemo(() => {
    if (!selectedDocQueue) return [];
    let list = selectedDocQueue.all || [];

    if (filterTab === 'WAITING') {
      list = selectedDocQueue.waiting;
    } else if (filterTab === 'IN_CONSULTATION') {
      list = selectedDocQueue.inConsultation;
    } else if (filterTab === 'COMPLETED') {
      list = selectedDocQueue.completed;
    } else if (filterTab === 'SKIPPED') {
      list = selectedDocQueue.skipped;
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(app => {
        const pName = (app.patientId?.name || '').toLowerCase();
        const pUhid = (app.patientId?.uhid || '').toLowerCase();
        const token = (app.tokenNumber || '').toLowerCase();
        return pName.includes(q) || pUhid.includes(q) || token.includes(q);
      });
    }

    return list;
  }, [selectedDocQueue, filterTab, searchQuery]);

  return (
    <div className="space-y-5 text-left px-4 sm:px-6 py-6 bg-[#F8FAFC] min-h-screen flex flex-col">
      {/* Top Header */}
      <div className="pb-4 border-b border-[#E5E7EB] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#3B5BDB]/10 border border-[#3B5BDB]/20 flex items-center justify-center text-[#3B5BDB] shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            Live Doctor Queue
          </h1>
          <p className="text-xs text-[#6B7280] mt-1 font-medium">
            Real-time OPD queue monitoring workspace. Read-only live operational view.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live SSE Synced
          </span>
          <button
            onClick={() => refetch()}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 shadow-xs transition-all cursor-pointer"
            title="Refresh Live Queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* PERMANENT SPLIT LAYOUT (Left ~35% / Right ~65%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        
        {/* ================= LEFT PANEL (Doctor Queue Overview ~35%) ================= */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-blue-600" /> Doctors On Duty ({doctorList.length})
            </h2>
            <span className="text-[11px] font-semibold text-slate-400">Select to view</span>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {doctorList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 font-medium text-xs">
                No active doctors recorded for today.
              </div>
            ) : (
              doctorList.map((docQueue) => {
                const isSelected = selectedDoctorId === docQueue.id;
                const waitingCount = docQueue.waiting.length;
                const inConsultCount = docQueue.inConsultation.length;
                const completedCount = docQueue.completed.length;

                return (
                  <div
                    key={docQueue.id}
                    onClick={() => setSelectedDoctorId(docQueue.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      isSelected
                        ? 'bg-blue-50/60 border-[#3B5BDB] shadow-md ring-2 ring-[#3B5BDB]/20 translate-x-0.5'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 shadow-xs'
                    }`}
                  >
                    {/* Doctor Info */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center shadow-xs ${
                          isSelected ? 'bg-[#3B5BDB] text-white' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {docQueue.name.replace(/^Dr\.\s*/i, '').charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            {isSelected && <Check className="w-4 h-4 text-[#3B5BDB] stroke-[3]" />}
                            <h3 className={`font-bold text-sm leading-snug ${isSelected ? 'text-[#3B5BDB]' : 'text-slate-900'}`}>
                              Dr. {docQueue.name.replace(/^Dr\.\s*/i, '')}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 font-medium truncate max-w-[150px]">
                            {docQueue.specialization}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                        {docQueue.roomNumber}
                      </span>
                    </div>

                    {/* Stats Strip */}
                    <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-100">
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-1.5">
                        <span className="text-[9px] font-extrabold uppercase text-blue-600 block">Waiting</span>
                        <span className="text-base font-black text-blue-700 font-mono">{waitingCount}</span>
                      </div>
                      <div className="bg-purple-50 border border-purple-100 rounded-lg p-1.5">
                        <span className="text-[9px] font-extrabold uppercase text-purple-600 block">Consulting</span>
                        <span className="text-base font-black text-purple-700 font-mono">{inConsultCount}</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-1.5">
                        <span className="text-[9px] font-extrabold uppercase text-emerald-600 block">Done</span>
                        <span className="text-base font-black text-emerald-700 font-mono">{completedCount}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================= RIGHT PANEL (Live Queue Details ~65%) ================= */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6 flex flex-col min-h-[calc(100vh-180px)]">
          
          {selectedDocQueue ? (
            <>
              {/* Doctor Details Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3B5BDB] to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md">
                    {selectedDocQueue.name.replace(/^Dr\.\s*/i, '').charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      Dr. {selectedDocQueue.name.replace(/^Dr\.\s*/i, '')}
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                        {selectedDocQueue.roomNumber}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold flex items-center gap-2 mt-0.5">
                      <span>{selectedDocQueue.specialization}</span>
                    </p>
                  </div>
                </div>

                {/* Queue Summary Counter Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-center">
                    <span className="text-[10px] font-extrabold uppercase text-blue-600 block">Waiting</span>
                    <span className="text-sm font-black text-blue-700 font-mono">{selectedDocQueue.waiting.length}</span>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-xl text-center">
                    <span className="text-[10px] font-extrabold uppercase text-purple-600 block">Consulting</span>
                    <span className="text-sm font-black text-purple-700 font-mono">{selectedDocQueue.inConsultation.length}</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-center">
                    <span className="text-[10px] font-extrabold uppercase text-emerald-600 block">Completed</span>
                    <span className="text-sm font-black text-emerald-700 font-mono">{selectedDocQueue.completed.length}</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl text-center">
                    <span className="text-[10px] font-extrabold uppercase text-amber-600 block">Skipped</span>
                    <span className="text-sm font-black text-amber-700 font-mono">{selectedDocQueue.skipped.length}</span>
                  </div>
                </div>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Filter Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200 w-full sm:w-auto flex-wrap">
                  {[
                    { key: 'WAITING', label: `Waiting (${selectedDocQueue.waiting.length})` },
                    { key: 'IN_CONSULTATION', label: `In Consultation (${selectedDocQueue.inConsultation.length})` },
                    { key: 'COMPLETED', label: `Completed (${selectedDocQueue.completed.length})` },
                    { key: 'SKIPPED', label: `Skipped (${selectedDocQueue.skipped.length})` },
                    { key: 'ALL', label: `All (${selectedDocQueue.all.length})` }
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setFilterTab(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        filterTab === t.key
                          ? 'bg-white shadow-xs text-blue-700 border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Search Box */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search Token / Patient"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/20 focus:border-[#3B5BDB]"
                  />
                </div>
              </div>

              {/* Live Patients Queue Table */}
              <div className="flex-1 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Token</th>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Slot / Type</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-800">
                    {filteredPatients.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-400 font-semibold italic">
                          No patient tokens match current queue filter.
                        </td>
                      </tr>
                    ) : (
                      filteredPatients.map((app) => {
                        const qState = (app.workflow?.queueState || app.queueStatus || app.status || 'WAITING').toUpperCase();
                        const isConsulting = qState === 'IN_CONSULTATION' || qState === 'CALLED';
                        const isDone = qState === 'COMPLETED';

                        return (
                          <tr 
                            key={app._id} 
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isConsulting ? 'bg-purple-50/40' : ''
                            }`}
                          >
                            <td className="py-3 px-4">
                              <span className={`font-mono font-extrabold text-xs px-2.5 py-1 rounded-md border ${
                                isConsulting
                                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                                  : 'bg-blue-50 text-[#3B5BDB] border-blue-200'
                              }`}>
                                #{app.tokenNumber || 'N/A'}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">
                                {app.patientId?.name || 'Patient'}
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium">
                                UHID: {app.patientId?.uhid || 'N/A'}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                                app.consultationType === 'Appointment' || app.isFutureBooking
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {app.consultationType === 'Appointment' || app.isFutureBooking ? `Slot ${app.time || ''}` : 'Walk-In'}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-slate-600">
                              {app.time || '10:00 AM'}
                            </td>

                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                app.billingStatus === 'Paid' || app.paymentStatus === 'Paid'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {app.billingStatus || app.paymentStatus || 'Pending'}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider border ${
                                isConsulting
                                  ? 'bg-purple-100 text-purple-800 border-purple-300 animate-pulse'
                                  : isDone
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {qState.replace(/_/g, ' ')}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <button
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer inline-flex items-center justify-center"
                                title="View Patient Details"
                              >
                                <Eye className="w-4 h-4 text-slate-600" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Read-Only Scope Footer Disclaimer */}
              <div className="pt-3 text-[11px] text-slate-400 font-semibold text-center border-t border-slate-100">
                💡 Reception Queue Monitor is read-only. Consultation calling is controlled automatically by Doctor on duty.
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 font-bold space-y-2 text-center">
              <Users className="w-12 h-12 text-slate-300" />
              <p>Select a doctor from the Left Panel to monitor live queue details.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ReceptionistLiveQueue;
