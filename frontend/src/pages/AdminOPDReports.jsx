import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { 
  FileText, Download, Printer, Calendar, Users, Activity, Pill, ShieldCheck, Clock, Filter 
} from 'lucide-react';
import toast from 'react-hot-toast';

const AdminOPDReports = () => {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'doctor' | 'reception' | 'pharmacy' | 'performance' | 'daily'
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'yesterday' | 'custom'
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [doctorId, setDoctorId] = useState('ALL');

  // Fetch Report Data
  const { data: reportData = {}, isLoading, refetch } = useQuery({
    queryKey: ['adminOpdReport', dateFilter, startDate, endDate, doctorId],
    queryFn: async () => {
      const res = await api.get('/operations/reports/opd', {
        params: { startDate, endDate, doctorId }
      });
      return res.data?.data || {};
    }
  });

  const exportCSV = (dataArray, filename = 'OPD_Report.csv') => {
    if (!dataArray || dataArray.length === 0) {
      toast.error('No report data available to export.');
      return;
    }
    const headers = Object.keys(dataArray[0]).join(',');
    const rows = dataArray.map(obj => Object.values(obj).join(',')).join('\n');
    const csvContent = 'data:text/csv;charset=utf-8,' + headers + '\n' + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported to CSV successfully!');
  };

  const handlePrint = () => {
    window.print();
  };

  const summary = reportData.summary || {};
  const doctorWise = reportData.doctorWise || [];
  const reception = reportData.receptionActivity || {};
  const pharmacy = reportData.pharmacyActivity || {};
  const queuePerf = reportData.queuePerformance || {};

  return (
    <div className="space-y-6 font-sans p-6 bg-slate-50 min-h-screen print:bg-white print:p-0">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#2F63F2]" />
            Doctor Admin — OPD Operational Reports & Intelligence
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Operational summary, doctor throughput, staff activity, and queue performance analytics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold transition-all border border-slate-200"
          >
            <Printer className="w-4 h-4 text-slate-500" /> Print
          </button>
          <button
            onClick={() => exportCSV(doctorWise, 'Doctor_Throughput_Report.csv')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2F63F2] text-white hover:bg-blue-700 text-xs font-bold transition-all shadow-xs"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs print:hidden">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-700">Filter Range:</span>
          {['today', 'yesterday', 'custom'].map((mode) => (
            <button
              key={mode}
              onClick={() => setDateFilter(mode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                dateFilter === mode 
                  ? 'bg-blue-50 text-[#2F63F2] border border-blue-200 shadow-2xs' 
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 text-xs font-medium">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-1.5 border border-slate-200 rounded-xl bg-slate-50"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-1.5 border border-slate-200 rounded-xl bg-slate-50"
            />
          </div>
        )}
      </div>

      {/* Report Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 scrollbar-none print:hidden">
        {[
          { id: 'summary', label: 'OPD Summary' },
          { id: 'doctor', label: 'Doctor-wise Throughput' },
          { id: 'reception', label: 'Reception Activity' },
          { id: 'pharmacy', label: 'Pharmacy Activity' },
          { id: 'performance', label: 'Queue Performance' },
          { id: 'daily', label: 'Daily EOD Summary' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-all border-b-2 ${
              activeTab === tab.id 
                ? 'border-[#2F63F2] text-[#2F63F2] bg-blue-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report Content View */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs space-y-6">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">Loading report data...</div>
        ) : activeTab === 'summary' ? (
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Activity className="w-4 h-4 text-[#2F63F2]" /> Executive OPD Summary Report
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total OPD Patients</span>
                <div className="text-2xl font-black font-mono text-slate-800 mt-1">{summary.totalPatients || 0}</div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                <span className="text-[10px] font-bold text-blue-700 uppercase">Completed Consultations</span>
                <div className="text-2xl font-black font-mono text-[#2F63F2] mt-1">{summary.completedCount || 0}</div>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <span className="text-[10px] font-bold text-amber-700 uppercase">Sent To Pharmacy</span>
                <div className="text-2xl font-black font-mono text-amber-600 mt-1">{summary.pharmacyCount || 0}</div>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <span className="text-[10px] font-bold text-emerald-700 uppercase">Avg Waiting Duration</span>
                <div className="text-2xl font-black font-mono text-emerald-600 mt-1">{summary.avgWaitingTimeMinutes || 0} min</div>
              </div>
            </div>
          </div>
        ) : activeTab === 'doctor' ? (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Users className="w-4 h-4 text-[#2F63F2]" /> Doctor-wise Patient Throughput Report
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Doctor</th>
                  <th className="py-2.5 px-3">Total Registered</th>
                  <th className="py-2.5 px-3">Completed</th>
                  <th className="py-2.5 px-3">Waiting</th>
                  <th className="py-2.5 px-3">Avg Consult Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {doctorWise.map((doc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-800">{doc.doctorName}</td>
                    <td className="py-2.5 px-3">{doc.total}</td>
                    <td className="py-2.5 px-3 text-emerald-600 font-bold">{doc.completed}</td>
                    <td className="py-2.5 px-3 text-blue-600 font-bold">{doc.waiting}</td>
                    <td className="py-2.5 px-3 font-mono">{doc.avgConsultMin || 0} mins</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-[#2F63F2]" /> OPD Operational Performance Metrics
            </h3>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
              <p><strong>Patients Per Hour:</strong> {queuePerf.patientsPerHour || 0}</p>
              <p><strong>Peak Hour:</strong> {queuePerf.peakHour || 'N/A'}</p>
              <p><strong>Max Waiting Duration:</strong> {queuePerf.maxWaitingTimeMinutes || 0} mins</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOPDReports;
