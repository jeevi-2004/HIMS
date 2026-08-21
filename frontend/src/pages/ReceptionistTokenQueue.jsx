import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import Table from '../components/Table';
import { 
  Check, X, UserCheck
} from 'lucide-react';

const ReceptionistTokenQueue = () => {
  const queryClient = useQueryClient();

  // Fetch today's appointments (which represents the daily queue)
  const { data: appointments, isLoading: appLoading, refetch } = useQuery({
    queryKey: ['appointments', 'queueTimeline'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/operations/appointments?date=${today}`);
      return res.data.data;
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });

  // Update status mutation
  const updateQueueStatusMutation = useMutation({
    mutationFn: async ({ id, queueStatus }) => {
      const res = await api.put(`/operations/appointments/${id}/queue`, { queueStatus });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Queue stage updated!');
      refetch();
      queryClient.invalidateQueries(['appointments']);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update queue stage');
    }
  });

  const todayApps = appointments || [];
  const activeToken = todayApps.find(a => a.queueStatus === 'In-Consultation');
  const waitingCount = todayApps.filter(a => a.queueStatus === 'Waiting').length;
  const completedCount = todayApps.filter(a => ['Sent To Pharmacy', 'Dispensing', 'Dispensed', 'Completed'].includes(a.queueStatus)).length;
  const skippedCount = todayApps.filter(a => a.queueStatus === 'Skipped').length;

  return (
    <div className="space-y-8 text-left">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Token Queue</h1>
        <p className="text-xs text-slate-500 font-medium mt-2">
          Monitor serving tokens, waiting lines, and patient queue status logs.
        </p>
      </div>
      
      {/* 1. Large Token Status Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-[#2F63F2] text-white p-6 rounded-2xl flex flex-col justify-between shadow-lg shadow-[#2F63F2]/10 h-32 text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-100">Serving Token</span>
          <span className="text-3xl font-extrabold font-mono mt-2">{activeToken?.tokenNumber || 'NONE'}</span>
          <span className="text-[9px] font-semibold text-blue-100 truncate">{activeToken ? `Patient: ${activeToken.patientId?.name}` : 'No patient in room'}</span>
        </div>
        <div className="bg-white border border-[#E5E7EB] p-6 rounded-2xl flex flex-col justify-between shadow-sm h-32 text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Waiting Line</span>
          <span className="text-3xl font-extrabold font-mono text-slate-800 mt-2">{waitingCount}</span>
          <span className="text-[9px] font-semibold text-slate-500">Patients waiting in lobby</span>
        </div>
        <div className="bg-white border border-[#E5E7EB] p-6 rounded-2xl flex flex-col justify-between shadow-sm h-32 text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Finished Today</span>
          <span className="text-3xl font-extrabold font-mono text-slate-800 mt-2">{completedCount}</span>
          <span className="text-[9px] font-semibold text-slate-500">Visits marked completed today</span>
        </div>
        <div className="bg-white border border-[#E5E7EB] p-6 rounded-2xl flex flex-col justify-between shadow-sm h-32 text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">On-Hold / Skipped</span>
          <span className="text-3xl font-extrabold font-mono text-slate-800 mt-2">{skippedCount}</span>
          <span className="text-[9px] font-semibold text-slate-500">Tokens skipped in round robin</span>
        </div>
      </div>

      {/* 2. Token Timeline Logs */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
        <Table
          headers={[
            { key: 'tokenNumber', label: 'Token', render: (row) => <span className="font-extrabold text-[#2F63F2] font-mono">{row.tokenNumber || 'N/A'}</span> },
            { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold font-mono text-slate-700">{row.patientId?.uhid}</span> },
            { key: 'patientId.name', label: 'Patient Name', render: (row) => <span className="font-bold text-slate-800">{row.patientId?.name}</span> },
            { key: 'doctorId.name', label: 'Doctor Room', render: (row) => <span className="font-semibold text-slate-600">{row.doctorId?.name || 'N/A'} ({row.doctorId?.departmentId?.name || 'OPD'})</span> },
            { 
              key: 'queueStatus', 
              label: 'Stage Status', 
              render: (row) => {
                if (row.status === 'Cancelled') {
                  return <span className="text-[9px] font-bold border px-2.5 py-1 rounded-xl uppercase tracking-wider bg-slate-100 text-slate-500 border-slate-200">No Show</span>;
                }
                const colors = {
                  'Waiting': 'bg-slate-100 text-slate-700 border-slate-300 font-semibold',
                  'Called': 'bg-blue-50 text-blue-700 border-blue-200 font-bold',
                  'In-Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold animate-pulse',
                  'In Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold animate-pulse',
                  'Sent to Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                  'Sent To Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                  'Dispensing': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold animate-pulse',
                  'Dispensed': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                  'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold',
                  'Skipped': 'bg-amber-50 text-amber-600 border-amber-200'
                };
                const status = row.status === 'Scheduled' ? 'Waiting' : (row.queueStatus || 'Waiting');
                return (
                  <span className={`text-[9px] font-bold border px-2.5 py-1 rounded-xl uppercase tracking-wider ${colors[status] || 'bg-slate-50'}`}>
                    {status}
                  </span>
                );
              }
            },
            { key: 'updatedAt', label: 'Last Activity', render: (row) => <span className="font-mono text-slate-400 text-[10px]">{new Date(row.updatedAt).toLocaleTimeString()}</span> }
          ]}
          data={todayApps}
          actions={[
            {
              label: 'Recall / Serve Room',
              icon: UserCheck,
              onClick: (row) => {
                updateQueueStatusMutation.mutate({ id: row._id, queueStatus: 'In-Consultation' });
              }
            },
            {
              label: 'Mark Completed',
              icon: Check,
              onClick: (row) => {
                updateQueueStatusMutation.mutate({ id: row._id, queueStatus: 'Completed' });
              }
            },
            {
              label: 'Mark Skipped',
              icon: X,
              onClick: (row) => {
                updateQueueStatusMutation.mutate({ id: row._id, queueStatus: 'Skipped' });
              }
            }
          ]}
          loading={appLoading}
        />
      </div>

    </div>
  );
};

export default ReceptionistTokenQueue;
