import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Card from '../components/Card';
import Table from '../components/Table';
import DatePicker from '../components/DatePicker';
import Modal from '../components/Modal';
import { 
  Calendar, Users, UserCheck, Stethoscope, DollarSign, Filter, 
  Download, Printer, RefreshCw, FileText, PieChart, Activity,
  ChevronDown, ChevronUp, Search, ShieldCheck, Clock, CheckCircle2,
  Eye, ArrowRight, TrendingUp, BarChart3, Layers, X, CreditCard, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';

// Read-Only Record Detail Modal
const RecordDetailsModal = ({ record, isOpen, onClose }) => {
  if (!isOpen || !record) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="OPD RECORD DETAILS"
      maxWidth="max-w-[480px]"
    >
      <div className="space-y-4 text-left font-sans text-xs">
        <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-900 text-sm">{record.patientId?.name || 'Unknown Patient'}</span>
            <span className="font-mono font-bold text-xs text-[#3563F6] bg-white border border-[#3563F6]/30 px-2.5 py-0.5 rounded-lg">
              Token #{record.tokenNumber || 'N/A'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-blue-100">
            <div>UHID: <strong className="text-slate-900 font-mono">{record.patientId?.uhid || 'N/A'}</strong></div>
            <div>Mobile: <strong className="text-slate-900 font-mono">{record.patientId?.mobileNumber || 'N/A'}</strong></div>
            <div>Age / Gender: <strong className="text-slate-900">{record.patientId?.gender || 'N/A'}, {record.patientId?.age || 0} Yrs</strong></div>
            <div>Date: <strong className="text-slate-900 font-mono">{new Date(record.date || record.createdAt).toLocaleDateString()}</strong></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Doctor</span>
            <span className="font-bold text-slate-800 text-xs">
              {record.doctorId?.name ? (record.doctorId.name.startsWith('Dr.') ? record.doctorId.name : `Dr. ${record.doctorId.name}`) : 'Unassigned'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Consultation Fee</span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              ₹{record.consultationFee || 500}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Patient Status</span>
            <span className="font-bold text-blue-700 text-xs">
              {record.queueStatus || record.status || 'Waiting'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Payment Status</span>
            <span className={`font-bold text-xs ${
              record.billingStatus === 'Paid' ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {record.billingStatus || 'Unpaid'}
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ReceptionistReports = () => {
  const todayStr = new Date().toLocaleDateString('en-CA');
  
  // Reporting Period State
  const [dateRangePreset, setDateRangePreset] = useState('TODAY'); // 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);

  // Additional Filter States
  const [filterDoctor, setFilterDoctor] = useState('ALL');
  const [filterGender, setFilterGender] = useState('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('ALL');
  const [filterPatientStatus, setFilterPatientStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Handle Preset Selection
  const handlePresetChange = (preset) => {
    setDateRangePreset(preset);
    const now = new Date();
    const currentToday = now.toLocaleDateString('en-CA');

    if (preset === 'TODAY') {
      setFromDate(currentToday);
      setToDate(currentToday);
    } else if (preset === 'WEEK') {
      const past = new Date(now);
      past.setDate(now.getDate() - 6);
      setFromDate(past.toLocaleDateString('en-CA'));
      setToDate(currentToday);
    } else if (preset === 'MONTH') {
      const past = new Date(now);
      past.setDate(now.getDate() - 29);
      setFromDate(past.toLocaleDateString('en-CA'));
      setToDate(currentToday);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setDateRangePreset('TODAY');
    setFromDate(todayStr);
    setToDate(todayStr);
    setFilterDoctor('ALL');
    setFilterGender('ALL');
    setFilterPaymentStatus('ALL');
    setFilterPatientStatus('ALL');
    setSearchQuery('');
  };

  // Fetch Doctors for filter dropdown
  const { data: doctors = [] } = useQuery({
    queryKey: ['doctors', 'reports'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data?.data || [];
    }
  });

  // Fetch Appointments for selected date range
  const { data: appointments = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['appointments', 'reports_analytics', fromDate, toDate],
    queryFn: async () => {
      const res = await api.get(`/operations/appointments?fromDate=${fromDate}&toDate=${toDate}&startDate=${fromDate}&endDate=${toDate}`);
      return res.data?.data || [];
    }
  });

  // Filtered Appointments Dataset (Controls ALL calculations and visuals)
  const filteredAppointments = useMemo(() => {
    return appointments.filter((app) => {
      // 1. Doctor filter
      if (filterDoctor !== 'ALL') {
        const docId = app.doctorId?._id || app.doctorId;
        if (docId !== filterDoctor) return false;
      }

      // 2. Gender filter
      if (filterGender !== 'ALL') {
        const g = (app.patientId?.gender || app.gender || 'Other').toLowerCase();
        if (g !== filterGender.toLowerCase()) return false;
      }

      // 3. Payment Status filter
      if (filterPaymentStatus !== 'ALL') {
        const pStatus = app.billingStatus || 'Unpaid';
        if (filterPaymentStatus === 'Pending') {
          if (pStatus === 'Paid' || pStatus === 'Exempt') return false;
        } else if (pStatus !== filterPaymentStatus) {
          return false;
        }
      }

      // 4. Patient Status filter
      if (filterPatientStatus !== 'ALL') {
        const status = app.queueStatus || app.status || 'Waiting';
        if (filterPatientStatus === 'Completed' && status !== 'Completed') return false;
        if (filterPatientStatus === 'Waiting' && !['Waiting', 'Scheduled', 'Admitted'].includes(status)) return false;
        if (filterPatientStatus === 'Consulting' && !['In Consultation', 'In-Consultation', 'Called'].includes(status)) return false;
        if (filterPatientStatus === 'Pharmacy' && !['Sent to Pharmacy', 'Sent To Pharmacy', 'Dispensing'].includes(status)) return false;
        if (filterPatientStatus === 'Skipped' && status !== 'Skipped') return false;
        if (filterPatientStatus === 'Cancelled' && status !== 'Cancelled') return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const pName = (app.patientId?.name || '').toLowerCase();
        const pUhid = (app.patientId?.uhid || '').toLowerCase();
        const token = (app.tokenNumber || '').toLowerCase();
        const mobile = (app.patientId?.mobileNumber || '').toLowerCase();
        const docName = (app.doctorId?.name || '').toLowerCase();
        return pName.includes(q) || pUhid.includes(q) || token.includes(q) || mobile.includes(q) || docName.includes(q);
      }

      return true;
    });
  }, [appointments, filterDoctor, filterGender, filterPaymentStatus, filterPatientStatus, searchQuery]);

  // Analytics Computation (Derived strictly from filteredAppointments)
  const metrics = useMemo(() => {
    const totalTokens = filteredAppointments.length;
    
    let completed = 0;
    let waiting = 0;
    let consulting = 0;
    let pharmacy = 0;
    let skipped = 0;
    let cancelled = 0;

    let paidBills = 0;
    let pendingPayments = 0;
    let totalRevenue = 0;
    let paidRevenue = 0;
    let pendingRevenue = 0;

    let femaleCount = 0;
    let maleCount = 0;
    let otherGenderCount = 0;

    let ageGroup0_18 = 0;
    let ageGroup19_30 = 0;
    let ageGroup31_45 = 0;
    let ageGroup46_60 = 0;
    let ageGroup60Plus = 0;

    const doctorStatsMap = {};
    const dayVolumeMap = {};
    const dayRevenueMap = {};

    filteredAppointments.forEach(app => {
      const status = app.queueStatus || app.status || 'Waiting';
      if (status === 'Completed') completed++;
      else if (['Waiting', 'Scheduled', 'Admitted'].includes(status)) waiting++;
      else if (['In Consultation', 'In-Consultation', 'Called'].includes(status)) consulting++;
      else if (['Sent to Pharmacy', 'Sent To Pharmacy', 'Dispensing'].includes(status)) pharmacy++;
      else if (status === 'Skipped') skipped++;
      else if (status === 'Cancelled') cancelled++;

      const fee = Number(app.consultationFee) || 500;
      const bStatus = app.billingStatus || 'Unpaid';

      if (bStatus === 'Paid') {
        paidBills++;
        totalRevenue += fee;
        paidRevenue += fee;
      } else if (bStatus === 'Exempt') {
        paidBills++;
      } else {
        pendingPayments++;
        totalRevenue += fee;
        pendingRevenue += fee;
      }

      // Gender
      const g = (app.patientId?.gender || app.gender || 'Other').toLowerCase();
      if (g === 'female') femaleCount++;
      else if (g === 'male') maleCount++;
      else otherGenderCount++;

      // Age
      const age = Number(app.patientId?.age || app.age || 0);
      if (age <= 18) ageGroup0_18++;
      else if (age <= 30) ageGroup19_30++;
      else if (age <= 45) ageGroup31_45++;
      else if (age <= 60) ageGroup46_60++;
      else ageGroup60Plus++;

      // Doctor Stats
      const docId = app.doctorId?._id || app.doctorId || 'unassigned';
      const docName = app.doctorId?.name ? (app.doctorId.name.startsWith('Dr.') ? app.doctorId.name : `Dr. ${app.doctorId.name}`) : 'Unassigned';
      if (!doctorStatsMap[docId]) {
        doctorStatsMap[docId] = { id: docId, name: docName, visits: 0, completed: 0, waiting: 0 };
      }
      doctorStatsMap[docId].visits++;
      if (status === 'Completed') doctorStatsMap[docId].completed++;
      if (['Waiting', 'Scheduled', 'Admitted'].includes(status)) doctorStatsMap[docId].waiting++;

      // Daily trend mapping
      const dateObj = new Date(app.date || app.createdAt);
      const dateKey = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : 'Today';
      dayVolumeMap[dateKey] = (dayVolumeMap[dateKey] || 0) + 1;
      if (bStatus === 'Paid') {
        dayRevenueMap[dateKey] = (dayRevenueMap[dateKey] || 0) + fee;
      }
    });

    const completionRate = totalTokens > 0 ? Math.round((completed / totalTokens) * 100) : 0;

    const doctorPerformanceList = Object.values(doctorStatsMap).map(d => ({
      ...d,
      completionRate: d.visits > 0 ? Math.round((d.completed / d.visits) * 100) : 0
    })).sort((a, b) => b.visits - a.visits);

    // Daily Trend Arrays
    const sortedDates = Object.keys(dayVolumeMap).sort();
    const dailyTrend = sortedDates.map(dateKey => ({
      date: dateKey,
      label: new Date(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: dayVolumeMap[dateKey],
      revenue: dayRevenueMap[dateKey] || 0
    }));

    const peakDayObj = dailyTrend.reduce((max, d) => d.count > max.count ? d : max, dailyTrend[0] || { label: 'Today', count: 0 });
    const maxVolumeCount = Math.max(...dailyTrend.map(d => d.count), 1);
    const avgDailyVisits = sortedDates.length > 0 ? Math.round(totalTokens / sortedDates.length) : totalTokens;

    return {
      totalTokens,
      completed,
      waiting,
      consulting,
      pharmacy,
      skipped,
      cancelled,
      completionRate,
      paidBills,
      pendingPayments,
      totalRevenue,
      paidRevenue,
      pendingRevenue,
      femaleCount,
      maleCount,
      otherGenderCount,
      ageGroup0_18,
      ageGroup19_30,
      ageGroup31_45,
      ageGroup46_60,
      ageGroup60Plus,
      doctorPerformanceList,
      dailyTrend,
      maxVolumeCount,
      peakDayLabel: peakDayObj.label,
      peakDayCount: peakDayObj.count,
      avgDailyVisits
    };
  }, [filteredAppointments]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredAppointments.length === 0) {
      toast.error('No matching records available to export.');
      return;
    }

    const headers = ['Date', 'Token #', 'Patient Name', 'UHID', 'Gender', 'Age', 'Doctor', 'Patient Status', 'Payment Status', 'Fee (Rs)'];
    const rows = filteredAppointments.map((app) => [
      new Date(app.date || app.createdAt).toLocaleDateString(),
      app.tokenNumber || 'N/A',
      `"${app.patientId?.name || 'Unknown'}"`,
      app.patientId?.uhid || 'N/A',
      app.patientId?.gender || app.gender || 'N/A',
      app.patientId?.age || app.age || 'N/A',
      `"${app.doctorId?.name ? (app.doctorId.name.startsWith('Dr.') ? app.doctorId.name : `Dr. ${app.doctorId.name}`) : 'Unassigned'}"`,
      app.queueStatus || app.status || 'Waiting',
      app.billingStatus || 'Unpaid',
      app.consultationFee || 500
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VillZone_HIMS_OPD_Report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredAppointments.length} records to CSV!`);
  };

  // Print Report Handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-left font-sans pb-8">
      {/* Printable Report Document Styles */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          nav, sidebar, header, .no-print {
            display: none !important;
          }
          .print-container {
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      {/* Printable Document Header (Visible only when printing) */}
      <div className="hidden print:block mb-6 p-4 border-b-2 border-slate-900 text-left">
        <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">VILLZONE HIMS</h1>
        <h2 className="text-sm font-bold text-slate-700">Reception Analytics & OPD Report</h2>
        <div className="grid grid-cols-2 text-xs text-slate-600 mt-2 font-mono">
          <div>Report Period: <strong>{fromDate}</strong> to <strong>{toDate}</strong></div>
          <div>Generated Date: <strong>{new Date().toLocaleString()}</strong></div>
          <div>Doctor Filter: <strong>{filterDoctor === 'ALL' ? 'All Doctors' : filterDoctor}</strong></div>
          <div>Payment Filter: <strong>{filterPaymentStatus}</strong></div>
        </div>
      </div>
      
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#3563F6]" />
            <span>Reception Analytics & Reports</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Analyze OPD volume, doctor workload, revenue and patient activity.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#3563F6] hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* 2. Report Period Selector */}
      <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs space-y-3 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#3563F6]" />
            <span>Reporting Period</span>
          </div>

          {/* Preset Chips */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
            {[
              { key: 'TODAY', label: 'Today' },
              { key: 'WEEK', label: 'Last 7 Days' },
              { key: 'MONTH', label: 'Last 30 Days' },
              { key: 'CUSTOM', label: 'Custom Range' }
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePresetChange(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap cursor-pointer ${
                  dateRangePreset === p.key
                    ? 'bg-white text-[#3563F6] font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-semibold'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Range Date Pickers */}
        {dateRangePreset === 'CUSTOM' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 max-w-md">
            <DatePicker
              label="From Date"
              value={fromDate}
              onChange={(d) => setFromDate(d)}
            />
            <DatePicker
              label="To Date"
              value={toDate}
              onChange={(d) => setToDate(d)}
            />
          </div>
        )}
      </div>

      {/* 3. Report Filters Panel */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden no-print">
        {/* Mobile Accordion Header */}
        <div className="sm:hidden p-4 flex items-center justify-between cursor-pointer border-b border-slate-100" onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-4 h-4 text-[#3563F6]" />
            <span>REPORT FILTERS</span>
          </div>
          {isMobileFilterOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>

        <div className={`p-4 space-y-3 ${isMobileFilterOpen ? 'block' : 'hidden sm:block'}`}>
          <div className="hidden sm:flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#3563F6]" />
              <span>REPORT FILTERS</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400">
              Showing {filteredAppointments.length} matching records
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Doctor Selector */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5">Doctor</label>
              <select
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
                className="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer"
              >
                <option value="ALL">All Doctors</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>{d.name?.startsWith('Dr.') ? d.name : `Dr. ${d.name}`}</option>
                ))}
              </select>
            </div>

            {/* Gender Selector */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5">Gender</label>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
                className="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer"
              >
                <option value="ALL">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Payment Status Selector */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5">Payment Status</label>
              <select
                value={filterPaymentStatus}
                onChange={(e) => setFilterPaymentStatus(e.target.value)}
                className="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending / Unpaid</option>
                <option value="Exempt">Exempt</option>
              </select>
            </div>

            {/* Patient Stage Status Selector */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5">Patient Status</label>
              <select
                value={filterPatientStatus}
                onChange={(e) => setFilterPatientStatus(e.target.value)}
                className="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="Waiting">Waiting</option>
                <option value="Consulting">In Consultation</option>
                <option value="Pharmacy">Sent to Pharmacy</option>
                <option value="Completed">Completed</option>
                <option value="Skipped">Skipped</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Analytics KPI Summary Section (6 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* TOTAL TOKENS */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">TOTAL TOKENS</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">{metrics.totalTokens}</span>
            <span className="text-[10px] font-bold text-slate-400">Tokens</span>
          </div>
        </div>

        {/* COMPLETED */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">COMPLETED</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 font-mono">{metrics.completed}</span>
            <span className="text-[10px] font-bold text-emerald-700">Finished</span>
          </div>
        </div>

        {/* COMPLETION RATE */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">COMPLETION RATE</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-600 font-mono">{metrics.completionRate}%</span>
            <span className="text-[10px] font-bold text-blue-600">Overall</span>
          </div>
        </div>

        {/* TOTAL REVENUE */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">TOTAL REVENUE</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600 font-mono">₹{metrics.totalRevenue.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-amber-700">Selected</span>
          </div>
        </div>

        {/* PAID BILLS */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">PAID BILLS</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 font-mono">{metrics.paidBills}</span>
            <span className="text-[10px] font-bold text-emerald-700">Collected</span>
          </div>
        </div>

        {/* PENDING PAYMENTS */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">PENDING PAYMENTS</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600 font-mono">{metrics.pendingPayments}</span>
            <span className="text-[10px] font-bold text-rose-600">Unpaid</span>
          </div>
        </div>
      </div>

      {/* 5. Patient Volume Trend & OPD Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* PATIENT VOLUME TREND (7 cols) */}
        <div className="lg:col-span-7">
          <Card
            title="PATIENT VOLUME TREND"
            subtitle="Patient visits during selected period"
          >
            <div className="pt-2 space-y-4">
              {metrics.dailyTrend.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-xl">
                  No visit volume records for the selected period.
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-2 h-44 pt-6 pb-2 px-1">
                    {metrics.dailyTrend.map((d, i) => {
                      const heightPercent = Math.max(12, Math.round((d.count / metrics.maxVolumeCount) * 100));
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                          {/* Tooltip */}
                          <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-mono font-bold py-0.5 px-2 rounded pointer-events-none whitespace-nowrap z-10 shadow-md">
                            {d.count} visits ({d.label})
                          </div>

                          <span className="text-[10px] font-mono font-bold text-slate-700">
                            {d.count}
                          </span>

                          <div className="w-full max-w-[32px] bg-slate-100 rounded-t-lg h-28 flex items-end overflow-hidden p-0.5">
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className="w-full bg-[#3563F6] hover:bg-blue-700 rounded-t transition-all duration-300 shadow-2xs"
                            />
                          </div>

                          <span className="text-[9px] font-extrabold uppercase font-mono tracking-tighter text-slate-500 truncate max-w-full">
                            {d.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500 font-medium">
                    <div>Average Daily Visits: <strong className="text-slate-900 font-bold">{metrics.avgDailyVisits}</strong></div>
                    <div>Peak Day: <strong className="text-purple-700 font-bold">{metrics.peakDayLabel}</strong> ({metrics.peakDayCount} visits)</div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* OPD STATUS DISTRIBUTION (5 cols) */}
        <div className="lg:col-span-5">
          <Card
            title="OPD STATUS DISTRIBUTION"
            subtitle="Patient workflow stage breakdown"
          >
            <div className="space-y-3.5 pt-2">
              {[
                { label: 'Completed', count: metrics.completed, color: 'bg-emerald-500', textColor: 'text-emerald-700' },
                { label: 'Waiting', count: metrics.waiting, color: 'bg-blue-500', textColor: 'text-blue-700' },
                { label: 'In Consultation', count: metrics.consulting, color: 'bg-purple-500', textColor: 'text-purple-700' },
                { label: 'Sent to Pharmacy', count: metrics.pharmacy, color: 'bg-amber-500', textColor: 'text-amber-700' },
                { label: 'Skipped', count: metrics.skipped, color: 'bg-amber-600', textColor: 'text-amber-800' },
                { label: 'Cancelled', count: metrics.cancelled, color: 'bg-rose-500', textColor: 'text-rose-700' }
              ].map((item) => {
                const pct = metrics.totalTokens > 0 ? Math.round((item.count / metrics.totalTokens) * 100) : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800">{item.label}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <strong className="text-slate-900">{item.count}</strong>
                        <span className={`text-[10px] font-bold ${item.textColor}`}>({pct}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className={`h-full rounded-full transition-all duration-300 ${item.color}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* 6. Doctor Performance & Revenue Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* DOCTOR PERFORMANCE (7 cols) */}
        <div className="lg:col-span-7">
          <Card
            title="DOCTOR PERFORMANCE"
            subtitle="Consultation volume and completion rates by doctor"
          >
            <div className="overflow-x-auto pt-1">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                    <th className="py-2.5 px-3">Doctor</th>
                    <th className="py-2.5 px-3 text-center">Visits</th>
                    <th className="py-2.5 px-3 text-center">Completed</th>
                    <th className="py-2.5 px-3 text-center">Waiting</th>
                    <th className="py-2.5 px-3 text-right">Completion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.doctorPerformanceList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                        No doctor performance records found.
                      </td>
                    </tr>
                  ) : (
                    metrics.doctorPerformanceList.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-900">{doc.name}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-800">{doc.visits}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-emerald-600">{doc.completed}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-blue-600">{doc.waiting}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#3563F6]">
                          {doc.completionRate}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* REVENUE SUMMARY (5 cols) */}
        <div className="lg:col-span-5">
          <Card
            title="REVENUE SUMMARY"
            subtitle="Consultation revenue & fee collection"
          >
            <div className="space-y-4 pt-1">
              <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total Revenue</span>
                <span className="text-3xl font-black font-mono text-amber-400">₹{metrics.totalRevenue.toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Collected Paid</span>
                  <span className="font-mono font-bold text-base text-emerald-800">₹{metrics.paidRevenue.toLocaleString()}</span>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">Pending Unpaid</span>
                  <span className="font-mono font-bold text-base text-rose-800">₹{metrics.pendingRevenue.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billing Breakdown</span>
                <div className="flex justify-between items-center pt-1 font-semibold text-slate-700">
                  <span>Consultation Fees:</span>
                  <span className="font-mono font-bold text-slate-900">₹{metrics.totalRevenue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* 7. Patient Demographics */}
      <Card
        title="PATIENT DEMOGRAPHICS"
        subtitle="Gender and age group distribution of OPD patients"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
          {/* Gender Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Gender Breakdown</h4>
            <div className="space-y-2.5">
              {[
                { label: 'Female', count: metrics.femaleCount, color: 'bg-purple-500' },
                { label: 'Male', count: metrics.maleCount, color: 'bg-blue-500' },
                { label: 'Other', count: metrics.otherGenderCount, color: 'bg-slate-400' }
              ].map((g) => {
                const pct = metrics.totalTokens > 0 ? Math.round((g.count / metrics.totalTokens) * 100) : 0;
                return (
                  <div key={g.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{g.label}</span>
                      <span className="font-mono font-bold text-slate-900">{pct}% ({g.count})</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div style={{ width: `${pct}%` }} className={`h-full rounded-full ${g.color}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Age Group Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Age Group Breakdown</h4>
            <div className="space-y-2.5">
              {[
                { label: '0–18 Yrs', count: metrics.ageGroup0_18, color: 'bg-emerald-500' },
                { label: '19–30 Yrs', count: metrics.ageGroup19_30, color: 'bg-blue-500' },
                { label: '31–45 Yrs', count: metrics.ageGroup31_45, color: 'bg-[#3563F6]' },
                { label: '46–60 Yrs', count: metrics.ageGroup46_60, color: 'bg-purple-500' },
                { label: '60+ Yrs', count: metrics.ageGroup60Plus, color: 'bg-amber-500' }
              ].map((age) => {
                const pct = metrics.totalTokens > 0 ? Math.round((age.count / metrics.totalTokens) * 100) : 0;
                return (
                  <div key={age.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{age.label}</span>
                      <span className="font-mono font-bold text-slate-900">{pct}% ({age.count})</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div style={{ width: `${pct}%` }} className={`h-full rounded-full ${age.color}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* 8. Detailed OPD Records Table */}
      <Card
        title="DETAILED OPD RECORDS"
        subtitle="Patient-level records matching the selected report filters."
      >
        {/* Search Input Bar */}
        <div className="pt-1 pb-3 no-print">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search patient, UHID, mobile or token..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
            />
          </div>
        </div>

        {/* Read-Only Table */}
        <Table
          flat={true}
          headers={[
            {
              key: 'date',
              label: 'DATE',
              render: (row) => <span className="font-mono text-xs font-medium">{new Date(row.date || row.createdAt).toLocaleDateString()}</span>
            },
            {
              key: 'tokenNumber',
              label: 'TOKEN',
              render: (row) => (
                <span className="font-bold text-[#3563F6] font-mono text-xs bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                  #{row.tokenNumber || 'OP000'}
                </span>
              )
            },
            {
              key: 'patientId.name',
              label: 'PATIENT',
              render: (row) => (
                <div>
                  <div className="font-bold text-slate-900 text-xs">{row.patientId?.name || 'Unknown'}</div>
                  <div className="text-[10px] text-slate-500 font-mono">UHID: {row.patientId?.uhid || 'N/A'}</div>
                </div>
              )
            },
            {
              key: 'genderAge',
              label: 'GENDER / AGE',
              render: (row) => (
                <span className="text-xs font-semibold text-slate-700">
                  {row.patientId?.gender || row.gender || 'N/A'}, {row.patientId?.age || row.age || 0} Yrs
                </span>
              )
            },
            {
              key: 'doctorId.name',
              label: 'DOCTOR',
              render: (row) => <span className="font-semibold text-slate-700 text-xs">{row.doctorId?.name ? (row.doctorId.name.startsWith('Dr.') ? row.doctorId.name : `Dr. ${row.doctorId.name}`) : 'Unassigned'}</span>
            },
            {
              key: 'queueStatus',
              label: 'STAGE STATUS',
              render: (row) => {
                const colors = {
                  'Waiting': 'bg-blue-50 text-blue-600 border-blue-200',
                  'Called': 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold',
                  'In Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
                  'In-Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
                  'Sent to Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                  'Sent To Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                  'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-200',
                  'Skipped': 'bg-amber-50 text-amber-600 border-amber-200'
                };
                const status = row.queueStatus || row.status || 'Waiting';

                return (
                  <span className={`text-[9px] font-bold border px-2 py-0.5 rounded-lg uppercase tracking-wider ${colors[status] || 'bg-slate-50'}`}>
                    {status}
                  </span>
                );
              }
            },
            {
              key: 'consultationFee',
              label: 'FEE',
              render: (row) => <span className="font-mono font-bold text-xs text-slate-900">₹{row.consultationFee || 500}</span>
            },
            {
              key: 'billingStatus',
              label: 'PAYMENT',
              render: (row) => {
                const status = row.billingStatus || 'Unpaid';
                return (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                    status === 'Paid'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'Exempt'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {status === 'Paid' ? 'Paid' : status}
                  </span>
                );
              }
            },
            {
              key: 'action',
              label: 'ACTION',
              render: (row) => (
                <button
                  type="button"
                  onClick={() => setSelectedRecord(row)}
                  className="text-xs font-bold text-[#3563F6] hover:underline flex items-center gap-0.5 cursor-pointer no-print"
                >
                  <span>View</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )
            }
          ]}
          data={filteredAppointments}
          loading={isLoading}
        />
      </Card>

      {/* Record Details Modal */}
      <RecordDetailsModal
        record={selectedRecord}
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
};

export default ReceptionistReports;

