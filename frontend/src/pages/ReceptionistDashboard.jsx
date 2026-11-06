import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Card from '../components/Card';
import Button from '../components/Button';
import AppointmentBookingModal from '../components/AppointmentBookingModal';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { 
  Calendar, Clock, HeartPulse, ShieldCheck, Plus, Users, Pill, AlertTriangle,
  CheckCircle2, ChevronRight, Activity, Search
} from 'lucide-react';

const ReceptionistDashboard = () => {
  const queryClient = useQueryClient();
  const [isBookOpen, setIsBookOpen] = useState(false);

  // Fetch today's appointments for current hospital/tenant
  const { data: appointments, isLoading: appLoading, refetch: appointmentsRefetch } = useQuery({
    queryKey: ['appointments', 'todayDashboardSummary'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/operations/appointments?date=${today}`);
      return res.data?.data || [];
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });

  useEffect(() => {
    const unsubscribe = workflowRealtime.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      if (!event) return;
      const eventType = event.type || '';
      const qState = (event.queueState || event.queueStatus || event.status || '').toUpperCase();

      const isCallEvent =
        eventType === 'TriggerVoiceCall' ||
        (eventType === 'PatientCalled' && qState === 'CALLED');

      if (isCallEvent && (event.tokenNumber || event.token || event.patientName || event.patientId || event.appointmentId || event._id)) {
        const myHospId = String(user?.hospitalId || user?.hospital?._id || user?.hospital || '');
        const evtHospId = String(event.hospitalId || '');
        if (myHospId && evtHospId && myHospId !== evtHospId) {
          return;
        }

        const pathname = typeof window !== 'undefined' ? (window.location.pathname || '').toLowerCase() : '';
        if (!pathname.includes('/doctor')) {
          voiceAnnouncement.announceCall({
            tokenNumber: event.tokenNumber || event.token || event.tokenNo || '',
            tokenNo: event.tokenNumber || event.token || event.tokenNo || '',
            patientName: event.patientName || (typeof event.patientId === 'object' ? event.patientId?.name : '') || 'Patient',
            doctorName: event.doctorName || (typeof event.doctorId === 'object' ? event.doctorId?.name : '') || 'Doctor',
            roomNo: event.roomNo || event.roomNumber || (typeof event.doctorId === 'object' ? (event.doctorId?.roomNo || event.doctorId?.doctorProfile?.roomNo) : 'Consultation Room'),
            roomNumber: event.roomNo || event.roomNumber || 'Consultation Room'
          });
        }
      }
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Fetch doctors list (including DOCTOR and DOCTOR_ADMIN)
  const { data: doctors } = useQuery({
    queryKey: ['doctors', 'dashboardList'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data?.data || [];
    }
  });

  const todayApps = appointments || [];

  // 1. Operational KPI Counters
  const totalAppointments = todayApps.length;
  const waitingCount = todayApps.filter(a => ['Waiting', 'Scheduled', 'Admitted'].includes(a.status || a.queueStatus)).length;
  const inConsultationCount = todayApps.filter(a => ['In Consultation', 'In-Consultation', 'Called'].includes(a.status || a.queueStatus)).length;
  const sentToPharmacyCount = todayApps.filter(a => ['Sent to Pharmacy', 'Sent To Pharmacy', 'Dispensing'].includes(a.status || a.queueStatus) || a.pharmacyStatus === 'SENT' || a.pharmacyStatus === 'DISPENSING').length;
  const completedCount = todayApps.filter(a => (a.status === 'Completed' || a.queueStatus === 'Completed')).length;

  // 2. Doctor Workload Queue Data
  const doctorQueueList = useMemo(() => {
    if (!doctors || doctors.length === 0) return [];
    return doctors.map(doc => {
      const docApps = todayApps.filter(a => {
        const aDocId = a.doctorId?._id ? String(a.doctorId._id) : a.doctorId ? String(a.doctorId) : '';
        return aDocId && aDocId === String(doc._id);
      });
      const waiting = docApps.filter(a => ['Waiting', 'Scheduled', 'Admitted'].includes(a.status || a.queueStatus)).length;
      const consulting = docApps.filter(a => ['In Consultation', 'In-Consultation', 'Called'].includes(a.status || a.queueStatus)).length;
      const completed = docApps.filter(a => a.status === 'Completed' || a.queueStatus === 'Completed').length;
      const total = docApps.length;

      const activeCount = waiting + consulting;
      const loadPercent = Math.min(100, Math.round((activeCount / 8) * 100));

      return {
        id: doc._id,
        name: doc.name?.startsWith('Dr.') ? doc.name : `Dr. ${doc.name}`,
        department: doc.departmentId?.name || doc.doctorProfile?.specialization || 'General OPD',
        waiting,
        consulting,
        completed,
        total,
        loadPercent
      };
    });
  }, [doctors, todayApps]);

  // 3. Hourly OPD Activity Calculation
  const hourlyData = useMemo(() => {
    const hours = [
      { label: '09 AM', hour: 9 },
      { label: '10 AM', hour: 10 },
      { label: '11 AM', hour: 11 },
      { label: '12 PM', hour: 12 },
      { label: '01 PM', hour: 13 },
      { label: '02 PM', hour: 14 },
      { label: '03 PM', hour: 15 },
      { label: '04 PM', hour: 16 },
      { label: '05 PM', hour: 17 }
    ];

    const currentHour = new Date().getHours();

    const counts = hours.map(h => {
      const count = todayApps.filter(app => {
        let appHour = -1;
        if (app.createdAt) {
          appHour = new Date(app.createdAt).getHours();
        } else if (app.time) {
          const timeStr = app.time.toLowerCase();
          if (timeStr.includes('am') || timeStr.includes('pm')) {
            const match = timeStr.match(/(\d+):(\d+)\s*(am|pm)/);
            if (match) {
              let hr = parseInt(match[1], 10);
              const ampm = match[3];
              if (ampm === 'pm' && hr < 12) hr += 12;
              if (ampm === 'am' && hr === 12) hr = 0;
              appHour = hr;
            }
          } else {
            const parts = timeStr.split(':');
            if (parts.length > 0) appHour = parseInt(parts[0], 10);
          }
        }
        return appHour === h.hour;
      }).length;

      return {
        ...h,
        count,
        isCurrent: currentHour === h.hour
      };
    });

    const maxCount = Math.max(...counts.map(c => c.count), 1);
    const peakHour = counts.reduce((max, h) => h.count > max.count ? h : max, counts[0]);

    return { counts, maxCount, peakHour };
  }, [todayApps]);

  // 4. Latest 5 Recent Activities
  const recentActivities = useMemo(() => {
    const sorted = [...todayApps].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || a.date).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || b.date).getTime();
      return timeB - timeA;
    });

    return sorted.slice(0, 5).map(app => {
      const status = app.status || app.queueStatus || 'Waiting';
      let activityText = 'Waiting in queue';
      if (status === 'Completed') activityText = 'Consultation completed';
      else if (status === 'In Consultation' || status === 'In-Consultation') activityText = 'Consultation in progress';
      else if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy') activityText = 'Sent to Pharmacy';
      else if (app.billingStatus === 'Paid') activityText = 'Payment completed';
      else if (status === 'Called') activityText = 'Called to doctor room';
      else if (status === 'Skipped') activityText = 'Skipped in queue';

      let timeStr = 'Today';
      if (app.updatedAt || app.createdAt) {
        timeStr = new Date(app.updatedAt || app.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (app.time) {
        timeStr = app.time;
      }

      return {
        id: app._id,
        tokenNumber: app.tokenNumber || 'OP000',
        patientName: app.patientId?.name || 'Unknown Patient',
        doctorName: app.doctorId?.name ? (app.doctorId.name.startsWith('Dr.') ? app.doctorId.name : `Dr. ${app.doctorId.name}`) : 'Unassigned',
        status,
        activityText,
        timeStr
      };
    });
  }, [todayApps]);

  // 5. Reception Dynamic Alert Calculations
  const longWaitingApps = useMemo(() => {
    const now = new Date();
    return todayApps.filter(a => {
      if (!['Waiting', 'Scheduled', 'Admitted'].includes(a.status || a.queueStatus)) return false;
      const created = new Date(a.createdAt || a.date);
      const diffMins = (now - created) / (1000 * 60);
      return diffMins > 15;
    });
  }, [todayApps]);

  const pendingPaymentApps = useMemo(() => {
    return todayApps.filter(a => a.billingStatus !== 'Paid' && a.billingStatus !== 'Exempt');
  }, [todayApps]);

  const emergencyWaitingApps = useMemo(() => {
    return todayApps.filter(a => 
      (a.isEmergency || a.priorityLevel === 'EMERGENCY' || a.priority === 'EMERGENCY' || (a.consultationType || '').toLowerCase() === 'emergency' || String(a.tokenNumber || '').startsWith('EMG')) &&
      ['Waiting', 'Scheduled', 'Admitted'].includes(a.status || a.queueStatus)
    );
  }, [todayApps]);

  const formattedTodayDate = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <div className="space-y-6 text-left font-sans">
      {/* 1. Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reception Overview</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Today's OPD activity at a glance
          </p>
        </div>

        <div className="flex items-center gap-3 justify-start sm:justify-end">
          <div className="text-left sm:text-right">
            <div className="text-xs font-bold text-slate-800 font-sans">
              {formattedTodayDate}
            </div>
            <div className="text-[10px] font-semibold text-emerald-600 flex items-center justify-start sm:justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live OPD Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Compact Operational KPI Overview (5 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* TOTAL VISITS */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-28 hover:shadow-md transition-all text-left">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">TOTAL VISITS</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3563F6] flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 font-mono">{totalAppointments}</span>
            <span className="text-[10px] font-bold text-slate-400">Today</span>
          </div>
        </div>

        {/* WAITING */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-28 hover:shadow-md transition-all text-left">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">WAITING</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-blue-600 font-mono">{waitingCount}</span>
            <span className="text-[10px] font-bold text-blue-600">Patients</span>
          </div>
        </div>

        {/* CONSULTING */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-28 hover:shadow-md transition-all text-left">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700">CONSULTING</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <HeartPulse className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-purple-700 font-mono">{inConsultationCount}</span>
            <span className="text-[10px] font-bold text-purple-600">Now</span>
          </div>
        </div>

        {/* PHARMACY */}
        <div className="bg-[#FFF3CD]/40 border border-[#F59E0B]/30 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-28 hover:shadow-md transition-all text-left">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#B45309]">PHARMACY</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-[#B45309] flex items-center justify-center">
              <Pill className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-[#B45309] font-mono">{sentToPharmacyCount}</span>
            <span className="text-[10px] font-bold text-[#B45309]">Sent today</span>
          </div>
        </div>

        {/* COMPLETED */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-28 hover:shadow-md transition-all text-left col-span-2 lg:col-span-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">COMPLETED</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-600 font-mono">{completedCount}</span>
            <span className="text-[10px] font-bold text-emerald-600">Completed</span>
          </div>
        </div>
      </div>

      {/* 3. Middle Grid: OPD Activity Chart (Left) + Doctor Workload Queue (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* TODAY'S OPD ACTIVITY (Hourly Flow Trend) */}
        <div className="lg:col-span-7">
          <Card
            title="TODAY'S OPD ACTIVITY"
            subtitle="Patient flow throughout the day"
          >
            <div className="pt-2 space-y-4">
              {/* Hour-by-hour bar chart visual */}
              <div className="flex items-end justify-between gap-1 sm:gap-2 h-44 pt-6 pb-2 px-1">
                {hourlyData.counts.map((h, i) => {
                  const heightPercent = Math.max(12, Math.round((h.count / hourlyData.maxCount) * 100));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {/* Tooltip */}
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-mono font-bold py-0.5 px-2 rounded pointer-events-none whitespace-nowrap z-10 shadow-md">
                        {h.count} patients ({h.label})
                      </div>

                      {/* Bar Value Header */}
                      <span className={`text-[10px] font-mono font-bold transition-colors ${
                        h.count > 0 ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        {h.count > 0 ? h.count : ''}
                      </span>

                      {/* Bar Graphic */}
                      <div className="w-full max-w-[28px] bg-slate-100 rounded-t-lg h-28 flex items-end overflow-hidden p-0.5">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t transition-all duration-500 ${
                            h.isCurrent
                              ? 'bg-[#3563F6] shadow-md ring-2 ring-[#3563F6]/30'
                              : h.count === hourlyData.peakHour.count && h.count > 0
                              ? 'bg-purple-600'
                              : h.count > 0
                              ? 'bg-blue-400 hover:bg-[#3563F6]'
                              : 'bg-slate-200/60'
                          }`}
                        />
                      </div>

                      {/* Hour Label */}
                      <span className={`text-[9px] font-extrabold uppercase font-mono tracking-tighter ${
                        h.isCurrent ? 'text-[#3563F6] font-black' : 'text-slate-400'
                      }`}>
                        {h.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Chart Legend & Summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#3563F6]" />
                    <span className="font-medium text-slate-700">Current Hour</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-purple-600" />
                    <span className="font-medium text-slate-700">Peak Volume</span>
                  </span>
                </div>

                <div className="font-mono text-[11px] font-semibold text-slate-600">
                  Peak: <strong className="text-slate-900 font-bold">{hourlyData.peakHour.label}</strong> ({hourlyData.peakHour.count} visits)
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* DOCTOR QUEUE (Live Workload by Doctor - Read-Only) */}
        <div className="lg:col-span-5">
          <Card
            title="DOCTOR QUEUE"
            subtitle="Live workload by doctor"
            action={
              <Link
                to="/reception/queue"
                className="text-xs font-bold text-[#3563F6] hover:underline flex items-center gap-1"
              >
                <span>View Live Queue</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            }
          >
            <div className="space-y-3 pt-1 max-h-[290px] overflow-y-auto pr-0.5">
              {doctorQueueList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-xl border border-slate-100">
                  No doctor profiles available.
                </div>
              ) : (
                doctorQueueList.map(doc => (
                  <div key={doc.id} className="p-3 bg-white border border-slate-200/80 rounded-xl space-y-2 hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{doc.name}</h4>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{doc.department}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                          {doc.waiting} Waiting
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-100">
                          {doc.consulting} Consulting
                        </span>
                      </div>
                    </div>

                    {/* Queue Load Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-semibold text-slate-400">
                        <span>Queue Workload</span>
                        <span className="font-mono">{doc.waiting + doc.consulting} Active Patients</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${doc.loadPercent}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            doc.waiting > 4 ? 'bg-amber-500' : doc.waiting > 8 ? 'bg-rose-500' : 'bg-[#3563F6]'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 4. Bottom Grid: Recent Activity (Left) + Attention Required & Quick Actions (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* RECENT ACTIVITY (Top 5 patient activity updates) */}
        <div className="lg:col-span-7">
          <Card
            title="RECENT ACTIVITY"
            subtitle="Latest patient activity"
            action={
              <Link
                to="/reception/appointments"
                className="text-xs font-bold text-[#3563F6] hover:underline flex items-center gap-1"
              >
                <span>View all activity</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            }
          >
            <div className="divide-y divide-slate-100">
              {recentActivities.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                  No recent patient activity registered today.
                </div>
              ) : (
                recentActivities.map((act) => (
                  <div key={act.id} className="py-3 px-1 flex items-center justify-between gap-3 text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono font-bold text-xs text-[#3563F6] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg shrink-0">
                        {act.tokenNumber}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">{act.patientName}</span>
                          <span className="text-[10px] font-semibold text-slate-500 truncate">• {act.activityText}</span>
                        </div>
                        <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                          Assigned to <strong className="text-slate-700 font-semibold">{act.doctorName}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono font-semibold text-slate-400 block">{act.timeStr}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${
                        act.status === 'Completed' ? 'text-emerald-600' : act.status === 'Waiting' ? 'text-blue-600' : 'text-purple-600'
                      }`}>
                        {act.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* ATTENTION REQUIRED & QUICK ACTIONS */}
        <div className="lg:col-span-5 space-y-6">
          {/* ATTENTION REQUIRED */}
          <Card
            title="ATTENTION REQUIRED"
            subtitle="Items requiring receptionist action"
          >
            <div className="space-y-2.5 pt-1 text-xs">
              {longWaitingApps.length === 0 && pendingPaymentApps.length === 0 && emergencyWaitingApps.length === 0 ? (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-emerald-900 text-xs">✓ Everything looks good</h4>
                    <p className="text-[11px] text-emerald-700 font-medium mt-0.5">No pending reception actions or waiting alerts at this moment.</p>
                  </div>
                </div>
              ) : (
                <>
                  {emergencyWaitingApps.length > 0 && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span className="font-bold text-xs">⚠ {emergencyWaitingApps.length} emergency patient(s) waiting</span>
                      </div>
                      <Link to="/reception/appointments" className="text-[10px] font-extrabold uppercase text-rose-700 underline shrink-0">
                        Prioritize →
                      </Link>
                    </div>
                  )}

                  {longWaitingApps.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="font-semibold text-xs">⚠ {longWaitingApps.length} patient(s) waiting &gt; 15 mins</span>
                      </div>
                      <Link to="/reception/appointments" className="text-[10px] font-extrabold uppercase text-amber-800 underline shrink-0">
                        View Desk →
                      </Link>
                    </div>
                  )}

                  {pendingPaymentApps.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="font-semibold text-xs">⚠ {pendingPaymentApps.length} consultation payment(s) pending</span>
                      </div>
                      <Link to="/reception/appointments" className="text-[10px] font-extrabold uppercase text-amber-800 underline shrink-0">
                        Collect →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* QUICK ACTIONS */}
          <Card
            title="QUICK ACTIONS"
            subtitle="Frequently used receptionist workflows"
          >
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <Button
                onClick={() => setIsBookOpen(true)}
                variant="primary"
                icon={Plus}
                className="text-xs font-bold h-[40px] bg-[#3563F6] hover:bg-blue-700 shadow-2xs justify-start px-3 cursor-pointer"
              >
                Generate Token
              </Button>

              <Link
                to="/reception/appointments"
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all border border-slate-200/80 justify-start"
              >
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <span>Search Patient</span>
              </Link>

              <Link
                to="/reception/book-appointments"
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all border border-slate-200/80 justify-start"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Book Appointment</span>
              </Link>

              <Link
                to="/reception/queue"
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all border border-slate-200/80 justify-start"
              >
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>Open Live Queue</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Appointment Generation Modal */}
      <AppointmentBookingModal
        isOpen={isBookOpen}
        onClose={() => setIsBookOpen(false)}
        onSuccess={() => appointmentsRefetch()}
      />
    </div>
  );
};

export default ReceptionistDashboard;
