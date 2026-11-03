import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import DatePicker from '../components/DatePicker';
import { Calendar, Filter, Eye, Play } from 'lucide-react';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { 
  getVisitStatus, 
  getVisitStatusBadgeConfig, 
  VISIT_STATUSES, 
  isCompletedVisit 
} from '../utils/visitStatus';

const DoctorAppointments = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const getTodayString = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    return localToday.toISOString().split('T')[0];
  };

  const [fromDate, setFromDate] = useState(getTodayString());
  const [toDate, setToDate] = useState(getTodayString());

  const [filterDate, setFilterDate] = useState(getTodayString());
  const [daysLimit, setDaysLimit] = useState(0);

  // Fetch doctor appointments
  const { data: appointments, isLoading: appLoading } = useQuery({
    queryKey: ['doctorAppointments', user?._id, filterDate, daysLimit],
    queryFn: async () => {
      let url = `/operations/appointments?doctorId=${user?._id}&`;
      if (filterDate) {
        url += `date=${filterDate}&`;
        if (daysLimit) {
          url += `daysLimit=${daysLimit}&`;
        }
      }
      const res = await api.get(url);
      return res.data.data;
    }
  });

  const calculateDaysLimit = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffTime = end.getTime() - start.getTime();
    if (diffTime < 0) return 0;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleApplyFilter = () => {
    if (new Date(toDate) < new Date(fromDate)) {
      setToDate(fromDate);
      setFilterDate(fromDate);
      setDaysLimit(0);
    } else {
      setFilterDate(fromDate);
      const limit = calculateDaysLimit(fromDate, toDate);
      setDaysLimit(limit);
    }
  };

  const handleClearFilter = () => {
    const today = getTodayString();
    setFromDate(today);
    setToDate(today);
    setFilterDate(today);
    setDaysLimit(0);
  };

  const startConsultationMutation = useMutation({
    mutationFn: async (appOrId) => {
      const appId = typeof appOrId === 'object' ? appOrId._id : appOrId;
      const app = typeof appOrId === 'object' ? appOrId : (appointments || []).find(a => a._id === appId);

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

      await api.put(`/operations/appointments/${appId}/queue`, { queueStatus: 'In-Consultation', status: 'In Consultation' });
      return appId;
    },
    onSuccess: (appId) => {
      toast.success('Consultation starting...');
      queryClient.invalidateQueries({ queryKey: ['doctorAppointments', user?._id, filterDate, daysLimit] });
      navigate(`/doctor/consultation/${appId}`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to start consultation');
    }
  });

  const cancelAppointmentMutation = useMutation({
    mutationFn: async (appId) => {
      await api.put(`/operations/appointments/${appId}/queue`, { queueStatus: 'Skipped' });
      await api.put(`/operations/appointments/${appId}`, { status: 'Cancelled' });
    },
    onSuccess: () => {
      toast.success('Appointment cancelled successfully');
      queryClient.invalidateQueries({ queryKey: ['doctorAppointments', user?._id, filterDate, daysLimit] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to cancel appointment');
    }
  });

  const emptyStateElement = (
    <div className="flex flex-col items-center justify-center py-6 text-slate-400">
      <p className="font-bold text-sm text-slate-700">No appointments found</p>
      <p className="text-xs text-slate-400 mt-1">Try selecting another date range.</p>
    </div>
  );

  return (
    <div className="text-left px-4 sm:px-5 md:px-6 py-4 sm:py-5 bg-[#F8FAFC] min-h-screen space-y-4">
      
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2] shrink-0">
          <Calendar className="w-5 h-5" />
        </div>
        <div className="flex flex-col text-left">
          <h1 className="text-lg font-bold text-[#111827] leading-none">Appointments Schedule</h1>
          <p className="text-xs text-[#6B7280] mt-1.5 font-medium">All consultation bookings driven by Visit Status</p>
        </div>
      </div>

      <hr className="border-[#E5E7EB]" />

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-end justify-between gap-4 w-full mt-2">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto md:flex-1">
          <div className="w-full sm:w-60">
            <DatePicker
              label="From Date"
              value={fromDate}
              onChange={setFromDate}
              placeholder="Select Date"
            />
          </div>
          <div className="w-full sm:w-60">
            <DatePicker
              label="To Date"
              value={toDate}
              onChange={setToDate}
              placeholder="Select Date"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end sm:justify-start">
          <button
            onClick={handleApplyFilter}
            className="px-5 h-[38px] rounded-xl bg-[#2F63F2] hover:bg-blue-700 hover:shadow-md text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 hover:scale-[1.02] transform"
          >
            <Filter className="w-3.5 h-3.5" />
            Apply Filter
          </button>
          <button
            onClick={handleClearFilter}
            className="px-4 h-[38px] rounded-xl hover:bg-slate-100 text-[#4B5563] text-xs font-semibold uppercase tracking-wider transition-all duration-200 active:scale-95 focus:outline-none"
          >
            Clear
          </button>
        </div>
      </div>

      <hr className="border-[#E5E7EB]" />

      {/* Desktop Table View */}
      <div className="hidden sm:block appointments-table mt-2">
        <Table
          flat={true}
          headers={[
            { key: 'date', label: 'Schedule Date', render: (row) => <span className="font-mono text-xs text-slate-700">{new Date(row.date).toLocaleDateString()}</span> },
            { key: 'time', label: 'Slot', render: (row) => <span className="font-mono text-xs text-slate-700">{row.time}</span> },
            { key: 'tokenNumber', label: 'Token', render: (row) => <span className="font-bold text-[#2F63F2] font-mono">#{row.tokenNumber || 'N/A'}</span> },
            { key: 'patientId.name', label: 'Patient', render: (row) => <span className="font-bold text-[#111827]">{row.patientId?.name}</span> },
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
            { key: 'consultationType', label: 'Visit Type', render: (row) => <span className="text-slate-700 font-medium">{row.consultationType || 'General OPD'}</span> },
            { 
              key: 'visitStatus', 
              label: 'Visit Status', 
              render: (row) => {
                const visitSt = getVisitStatus(row);
                const badge = getVisitStatusBadgeConfig(visitSt);
                return (
                  <span className={`text-[9px] font-bold border px-2.5 py-1 rounded-lg uppercase tracking-wider ${badge.style}`}>
                    {badge.label}
                  </span>
                );
              } 
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => {
                const visitSt = getVisitStatus(row);
                
                // Completed visits -> View Consultation (NEVER Start)
                if (isCompletedVisit(visitSt)) {
                  return (
                    <button
                      onClick={() => navigate(`/doctor/consultation/${row._id}`)}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> View Consultation
                    </button>
                  );
                }

                // Ongoing Consultation -> Continue Consultation
                if (visitSt === VISIT_STATUSES.IN_CONSULTATION) {
                  return (
                    <button
                      onClick={() => navigate(`/doctor/consultation/${row._id}`)}
                      className="px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" /> Continue
                    </button>
                  );
                }

                // Waiting / Arrived -> Start Consultation
                if (visitSt === VISIT_STATUSES.WAITING || visitSt === VISIT_STATUSES.SKIPPED) {
                  return (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startConsultationMutation.mutate(row)}
                        className="px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all"
                        disabled={startConsultationMutation.isPending}
                      >
                        Start Consultation
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Cancel this appointment slot?')) {
                            cancelAppointmentMutation.mutate(row._id);
                          }
                        }}
                        className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all"
                        disabled={cancelAppointmentMutation.isPending}
                      >
                        Cancel
                      </button>
                    </div>
                  );
                }

                if (visitSt === VISIT_STATUSES.SCHEDULED) {
                  return <span className="text-slate-400 text-xs font-semibold italic">Wait for Patient</span>;
                }

                return <span className="text-slate-400 text-xs font-semibold">Closed</span>;
              }
            }
          ]}
          data={appointments || []}
          loading={appLoading}
          emptyState={emptyStateElement}
        />
      </div>

      {/* Mobile Stacked Card View */}
      <div className="block sm:hidden space-y-3 mt-2">
        {appLoading ? (
          <div className="text-center py-8 text-slate-400 text-xs font-medium">Loading appointments...</div>
        ) : !appointments || appointments.length === 0 ? (
          emptyStateElement
        ) : (
          appointments.map((app) => {
            const visitSt = getVisitStatus(app);
            const badge = getVisitStatusBadgeConfig(visitSt);
            
            return (
              <div key={app._id} className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3 shadow-xs text-left">
                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                  <div className="text-left">
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{app.patientId?.name || 'Unknown Patient'}</h4>
                    <p className="text-slate-500 text-xs mt-1">
                      {app.patientId?.age ? `${app.patientId.age} Yrs` : ''} 
                      {app.patientId?.gender ? ` / ${app.patientId.gender}` : ''}
                    </p>
                  </div>
                  <span className="font-bold text-[#2F63F2] font-mono text-xs bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shrink-0">
                    #{app.tokenNumber || 'N/A'}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 border-t border-slate-100 pt-3 text-xs text-slate-600 text-left">
                  <div className="text-left">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Schedule Date</span>
                    <span className="font-mono text-slate-700">{new Date(app.date).toLocaleDateString()}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Slot</span>
                    <span className="font-mono text-slate-700">{app.time}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Visit Type</span>
                    <span className="text-slate-700 font-medium">{app.consultationType || 'General OPD'}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Visit Status</span>
                    <span className={`inline-block text-[9px] font-bold border px-2.5 py-0.5 rounded-lg uppercase tracking-wider ${badge.style}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 border-t border-slate-100 pt-3">
                  {isCompletedVisit(visitSt) ? (
                    <button
                      onClick={() => navigate(`/doctor/consultation/${app._id}`)}
                      className="w-full py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all text-center"
                    >
                      View Consultation
                    </button>
                  ) : (visitSt === VISIT_STATUSES.WAITING || visitSt === VISIT_STATUSES.SKIPPED) ? (
                    <button
                      onClick={() => startConsultationMutation.mutate(app)}
                      className="w-full py-2 bg-[#2F63F2] hover:bg-blue-700 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all text-center"
                      disabled={startConsultationMutation.isPending}
                    >
                      Start Consultation
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DoctorAppointments;
