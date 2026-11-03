import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { triggerPrint } from '../modules/prescription-print/printUtils';
import { DEFAULT_PRINT_CONFIG } from '../modules/prescription-print/prescriptionPrint.types';
import toast from 'react-hot-toast';
import { 
  Printer, Search, Calendar, User, FileText, CheckCircle2, 
  RefreshCw, Stethoscope, Filter, Clock, Eye, Sparkles
} from 'lucide-react';
import DatePicker from '../components/DatePicker';

const ReceptionistPrintQueue = () => {
  const { user } = useAuth();
  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [dateRangeChip, setDateRangeChip] = useState('TODAY'); // 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM'
  const [filterFromDate, setFilterFromDate] = useState(todayStr);
  const [filterToDate, setFilterToDate] = useState(todayStr);
  const [printingId, setPrintingId] = useState(null);

  // Fetch doctors list for filtering
  const { data: doctors = [] } = useQuery({
    queryKey: ['receptionPrintQueueDoctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data?.data || [];
    }
  });

  // Fetch appointments for target date range
  const { data: appointments = [], refetch, isLoading } = useQuery({
    queryKey: ['receptionPrintQueueAppointments', filterFromDate, filterToDate, filterDoctor],
    queryFn: async () => {
      let url = `/operations/appointments?fromDate=${filterFromDate}&toDate=${filterToDate}`;
      if (filterDoctor) url += `&doctorId=${filterDoctor}`;
      const res = await api.get(url);
      return res.data?.data || [];
    },
    refetchInterval: 10000 // 10s polling fallback
  });

  // Subscribe to real-time workflow events
  useEffect(() => {
    const unsubscribe = workflowRealtime.subscribe(() => {
      refetch();
    });
    return () => unsubscribe();
  }, [refetch]);

  // Filter completed / prescription-ready visits
  const completedPrescriptions = useMemo(() => {
    return appointments.filter((app) => {
      const status = (app.status || app.queueStatus || '').toUpperCase();
      const qState = (app.workflow?.queueState || '').toUpperCase();
      
      const isCompleted = status === 'COMPLETED' || status === 'SENT TO PHARMACY' || status === 'SENT_TO_PHARMACY' || qState === 'COMPLETED' || qState === 'CONSULTATION_COMPLETED';
      
      if (!isCompleted) return false;

      // Apply Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pName = (app.patientId?.name || '').toLowerCase();
        const uhid = (app.patientId?.uhid || app.patientId?.patientId || '').toLowerCase();
        const mobile = (app.patientId?.contactNumber || app.patientId?.mobileNumber || app.patientId?.mobile || '').toLowerCase();
        const token = String(app.tokenNumber || app.tokenNo || '').toLowerCase();
        const docName = (app.doctorId?.name || '').toLowerCase();

        return pName.includes(q) || uhid.includes(q) || mobile.includes(q) || token.includes(q) || docName.includes(q);
      }

      return true;
    });
  }, [appointments, searchQuery]);

  // KPI Summary Metrics
  const metrics = useMemo(() => {
    return {
      totalCompleted: completedPrescriptions.length,
      todayCompleted: completedPrescriptions.filter(a => (a.date || '').split('T')[0] === todayStr).length
    };
  }, [completedPrescriptions, todayStr]);

  // Handle direct Prescription Print execution
  const handlePrintPrescription = async (app) => {
    setPrintingId(app._id);
    try {
      const hospitalIdToUse = user?.hospitalId?._id || user?.hospitalId || user?.hospital?._id || user?.hospital || app.hospitalId?._id || app.hospitalId;
      
      let activeConfig = DEFAULT_PRINT_CONFIG;
      if (hospitalIdToUse) {
        try {
          const activeRes = await api.get(`/admin/hospitals/${hospitalIdToUse}/print-template/active`);
          const activeT = activeRes.data?.data;
          if (activeT) {
            activeConfig = {
              printMode: activeT.mode || 'STANDARD',
              mode: activeT.mode || 'STANDARD',
              paper: {
                size: activeT.paperSize || 'A4',
                orientation: (activeT.orientation || 'Portrait').toUpperCase(),
                margin: activeT.margins || 'Medium',
                scale: activeT.scale || 100
              },
              calibration: activeT.calibration || { topOffset: 0, leftOffset: 0, scale: 100 },
              template: activeT
            };
          }
        } catch (err) {
          console.log('Using default print config', err);
        }
      }

      // Fetch full consultation snapshot / details
      let consultationData = app;
      try {
        const cRes = await api.get(`/operations/consultations/${app._id}/snapshot`);
        if (cRes.data?.data) {
          consultationData = cRes.data.data;
        }
      } catch (err) {
        // Fallback to appointment record
      }

      const patientObj = (consultationData.patientId && typeof consultationData.patientId === 'object')
        ? consultationData.patientId
        : (typeof app.patientId === 'object' && app.patientId ? app.patientId : { name: 'Patient' });

      const consultationPayload = {
        isSample: false,
        hospital: app.hospitalId || user?.hospital || {},
        branch: app.branchId || user?.branchId || {},
        patientId: patientObj,
        patient: patientObj,
        date: consultationData.date || app.date || new Date().toISOString(),
        tokenNo: app.tokenNumber || app.tokenNo || 'OP-01',
        visitType: app.appointmentType || 'General OPD',
        chiefComplaint: consultationData.chiefComplaint || 'Consultation Visit',
        clinicalNotes: consultationData.clinicalNotes || '',
        diagnosis: consultationData.diagnosis || [],
        prescription: consultationData.prescription || consultationData.prescriptions || [],
        prescriptions: consultationData.prescriptions || consultationData.prescription || [],
        advice: consultationData.advice || [],
        followupDate: consultationData.followupDate || null
      };

      const doctorPayload = {
        name: consultationData.doctorId?.name || app.doctorId?.name || 'Attending Doctor',
        doctorProfile: consultationData.doctorId?.doctorProfile || app.doctorId?.doctorProfile || {}
      };

      triggerPrint(consultationPayload, doctorPayload, activeConfig);
      toast.success(`Printing Prescription for ${patientObj.name || 'Patient'}...`);
    } catch (err) {
      toast.error('Could not generate prescription print layout.');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className="space-y-6 text-left font-sans">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Printer className="w-6 h-6 text-[#3563F6]" /> Prescription Print Queue
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Print completed patient prescriptions using your hospital's active print setup
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl shadow-2xs transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#3563F6] ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-1">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate" title="Prescriptions Ready to Print">
            Prescriptions Ready to Print
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span>{metrics.totalCompleted}</span>
            <span className="text-[10px] sm:text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded-md border border-emerald-200">
              Completed
            </span>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-1">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate" title="Today's Total Completed">
            Today's Total Completed
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#3563F6] font-mono">
            {metrics.todayCompleted}
          </div>
        </div>
      </div>

      {/* Main Filter & Table Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
        {/* Date Chips & Search Controls */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 w-full">
            <div className="w-full md:w-auto flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Date Range:</label>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full">
                {[
                  { key: 'TODAY', label: 'Today' },
                  { key: 'YESTERDAY', label: 'Yesterday' },
                  { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
                  { key: 'THIS_MONTH', label: 'This Month' },
                  { key: 'CUSTOM', label: 'Custom Range' }
                ].map((chip) => {
                  const active = dateRangeChip === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => {
                        setDateRangeChip(chip.key);
                        if (chip.key === 'TODAY') {
                          setFilterFromDate(todayStr);
                          setFilterToDate(todayStr);
                        } else if (chip.key === 'YESTERDAY') {
                          const y = new Date();
                          y.setDate(y.getDate() - 1);
                          const yStr = y.toLocaleDateString('en-CA');
                          setFilterFromDate(yStr);
                          setFilterToDate(yStr);
                        } else if (chip.key === 'LAST_7_DAYS') {
                          const d7 = new Date();
                          d7.setDate(d7.getDate() - 6);
                          setFilterFromDate(d7.toLocaleDateString('en-CA'));
                          setFilterToDate(todayStr);
                        } else if (chip.key === 'THIS_MONTH') {
                          const now = new Date();
                          const start = new Date(now.getFullYear(), now.getMonth(), 1);
                          setFilterFromDate(start.toLocaleDateString('en-CA'));
                          setFilterToDate(todayStr);
                        }
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer min-h-[38px] whitespace-nowrap ${active
                        ? 'bg-[#3563F6] text-white border-[#3563F6] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full md:w-auto min-w-[240px] md:self-end">
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] h-[40px]"
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
              >
                <option value="">All Consulting Doctors</option>
                {doctors?.map(d => (
                  <option key={d._id} value={d._id}>{d.name} ({d.departmentId?.name || 'OPD'})</option>
                ))}
              </select>
            </div>
          </div>

          {dateRangeChip === 'CUSTOM' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <DatePicker
                id="filter-from-date"
                label="From Date"
                value={filterFromDate}
                onChange={(val) => setFilterFromDate(val)}
              />
              <DatePicker
                id="filter-to-date"
                label="To Date"
                value={filterToDate}
                onChange={(val) => setFilterToDate(val)}
              />
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Patient Name, UHID, Mobile Number, or Doctor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] transition-all min-h-[42px]"
          />
        </div>

        {/* Prescription Queue Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Token #</th>
                <th className="p-3">Patient Details</th>
                <th className="p-3">Doctor</th>
                <th className="p-3">Consult Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {completedPrescriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-semibold">
                    <Printer className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    No completed prescriptions found for selected filters.
                  </td>
                </tr>
              ) : (
                completedPrescriptions.map((row) => (
                  <tr key={row._id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-[#3563F6]">
                      #{row.tokenNumber || row.tokenNo || 'OP'}
                    </td>
                    <td className="p-3">
                      <div className="font-extrabold text-slate-900">{row.patientId?.name || 'Patient'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {row.patientId?.uhid || row.patientId?.patientId || 'N/A'} • {row.patientId?.contactNumber || row.patientId?.mobileNumber || ''}
                      </div>
                    </td>
                    <td className="p-3 font-bold text-slate-700">
                      Dr. {row.doctorId?.name?.replace(/^Dr\.\s*/i, '') || 'Doctor'}
                    </td>
                    <td className="p-3 text-slate-600">
                      {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="p-3">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ✓ Prescription Ready
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handlePrintPrescription(row)}
                        disabled={printingId === row._id}
                        className="px-3.5 py-1.5 bg-[#3563F6] hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 ml-auto cursor-pointer active:scale-98"
                      >
                        <Printer className={`w-3.5 h-3.5 ${printingId === row._id ? 'animate-spin' : ''}`} />
                        <span>{printingId === row._id ? 'Opening...' : 'Print Prescription'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReceptionistPrintQueue;
