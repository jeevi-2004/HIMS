import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Card from '../components/Card';
import Table from '../components/Table';
import DatePicker from '../components/DatePicker';
import { 
  Calendar, Users, UserCheck, Stethoscope, DollarSign, Filter, 
  Download, Printer, RefreshCw, FileText, PieChart, Activity,
  ChevronDown, Search, ShieldCheck, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

const ReceptionistReports = () => {
  const todayStr = new Date().toLocaleDateString('en-CA');
  
  // Date Range State
  const [dateRangePreset, setDateRangePreset] = useState('TODAY'); // 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  
  // Additional Filters
  const [filterDoctor, setFilterDoctor] = useState('ALL');
  const [filterGender, setFilterGender] = useState('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle Preset Changes
  const handlePresetChange = (preset) => {
    setDateRangePreset(preset);
    const now = new Date();
    if (preset === 'TODAY') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'WEEK') {
      const past = new Date(now);
      past.setDate(now.getDate() - 7);
      setFromDate(past.toLocaleDateString('en-CA'));
      setToDate(todayStr);
    } else if (preset === 'MONTH') {
      const past = new Date(now);
      past.setMonth(now.getMonth() - 1);
      setFromDate(past.toLocaleDateString('en-CA'));
      setToDate(todayStr);
    }
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
      const res = await api.get(`/operations/appointments?startDate=${fromDate}&endDate=${toDate}`);
      return res.data?.data || [];
    }
  });

  // Filtered Appointments based on dropdowns & search
  const filteredAppointments = useMemo(() => {
    return appointments.filter((app) => {
      // Doctor filter
      if (filterDoctor !== 'ALL') {
        const docId = app.doctorId?._id || app.doctorId;
        if (docId !== filterDoctor) return false;
      }
      // Gender filter
      if (filterGender !== 'ALL') {
        const gender = app.patientId?.gender || app.gender || 'Other';
        if (gender.toLowerCase() !== filterGender.toLowerCase()) return false;
      }
      // Payment status filter
      if (filterPaymentStatus !== 'ALL') {
        const pStatus = app.billingStatus || 'Unpaid';
        if (pStatus !== filterPaymentStatus) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const pName = (app.patientId?.name || '').toLowerCase();
        const pUhid = (app.patientId?.uhid || '').toLowerCase();
        const token = (app.tokenNumber || '').toLowerCase();
        const mobile = (app.patientId?.mobileNumber || '').toLowerCase();
        return pName.includes(q) || pUhid.includes(q) || token.includes(q) || mobile.includes(q);
      }
      return true;
    });
  }, [appointments, filterDoctor, filterGender, filterPaymentStatus, searchQuery]);

  // Analytics Computation
  const stats = useMemo(() => {
    const total = filteredAppointments.length;
    let maleCount = 0;
    let femaleCount = 0;
    let otherGenderCount = 0;

    let childCount = 0; // < 13
    let adultCount = 0; // 13 - 59
    let seniorCount = 0; // >= 60

    let paidCount = 0;
    let totalRevenue = 0;

    let waitingCount = 0;
    let consultingCount = 0;
    let pharmacyCount = 0;
    let completedCount = 0;
    let skippedCount = 0;

    const doctorMap = {};

    filteredAppointments.forEach((app) => {
      // Gender breakdown
      const g = (app.patientId?.gender || app.gender || 'Other').toLowerCase();
      if (g === 'male') maleCount++;
      else if (g === 'female') femaleCount++;
      else otherGenderCount++;

      // Age breakdown
      const age = Number(app.patientId?.age || app.age || 0);
      if (age < 13) childCount++;
      else if (age >= 60) seniorCount++;
      else adultCount++;

      // Revenue breakdown
      const fee = Number(app.consultationFee) || 500;
      if (app.billingStatus === 'Paid') {
        paidCount++;
        totalRevenue += fee;
      }

      // Stage breakdown
      const status = app.queueStatus || app.status || 'Waiting';
      if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') waitingCount++;
      else if (['In Consultation', 'In-Consultation', 'Called'].includes(status)) consultingCount++;
      else if (['Sent to Pharmacy', 'Sent To Pharmacy', 'Dispensing', 'Dispensed'].includes(status)) pharmacyCount++;
      else if (status === 'Completed') completedCount++;
      else if (status === 'Skipped') skippedCount++;

      // Doctor Breakdown
      const docId = app.doctorId?._id || app.doctorId || 'unassigned';
      const docName = app.doctorId?.name || 'Unassigned';
      if (!doctorMap[docId]) {
        doctorMap[docId] = { name: docName, total: 0, completed: 0, waiting: 0, revenue: 0 };
      }
      doctorMap[docId].total++;
      if (status === 'Completed') doctorMap[docId].completed++;
      if (status === 'Waiting') doctorMap[docId].waiting++;
      if (app.billingStatus === 'Paid') doctorMap[docId].revenue += fee;
    });

    return {
      total,
      maleCount,
      femaleCount,
      otherGenderCount,
      childCount,
      adultCount,
      seniorCount,
      paidCount,
      totalRevenue,
      waitingCount,
      consultingCount,
      pharmacyCount,
      completedCount,
      skippedCount,
      doctorList: Object.values(doctorMap)
    };
  }, [filteredAppointments]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredAppointments.length === 0) {
      toast.error('No data available to export.');
      return;
    }

    const headers = ['Date', 'Token #', 'Patient Name', 'UHID', 'Gender', 'Age', 'Doctor', 'Stage Status', 'Fee (Rs)', 'Payment Status'];
    const rows = filteredAppointments.map((app) => [
      new Date(app.date || app.createdAt).toLocaleDateString(),
      app.tokenNumber || 'N/A',
      `"${app.patientId?.name || 'Unknown'}"`,
      app.patientId?.uhid || 'N/A',
      app.patientId?.gender || app.gender || 'N/A',
      app.patientId?.age || app.age || 'N/A',
      `"${app.doctorId?.name || 'Unassigned'}"`,
      app.queueStatus || app.status || 'Waiting',
      app.consultationFee || 500,
      app.billingStatus || 'Unpaid'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Reception_OPD_Report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV Report exported successfully!');
  };

  // Print Report Handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-left font-sans pb-8">
      
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#3563F6]" />
            <span>Reception Analytics & OPD Reports</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Real-time patient intake volume, doctor loads, gender breakdown, and consultation revenue logs.
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
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#3563F6] hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Toolbar (Responsive Grid) */}
      <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-[#3563F6]" />
            <span>Report Filters</span>
          </div>

          {/* Date Range Presets */}
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
                className={`px-3 py-1 rounded-lg text-xs transition-all whitespace-nowrap ${
                  dateRangePreset === p.key
                    ? 'bg-white text-[#3563F6] font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 font-semibold'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* From Date */}
          <DatePicker
            label="From Date"
            value={fromDate}
            onChange={(d) => {
              setFromDate(d);
              setDateRangePreset('CUSTOM');
            }}
          />

          {/* To Date */}
          <DatePicker
            label="To Date"
            value={toDate}
            onChange={(d) => {
              setToDate(d);
              setDateRangePreset('CUSTOM');
            }}
          />

          {/* Doctor Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5">Doctor</label>
            <select
              value={filterDoctor}
              onChange={(e) => setFilterDoctor(e.target.value)}
              className="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer"
            >
              <option value="ALL">All Doctors</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Gender Selector */}
          <div className="flex flex-col gap-1">
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
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5">Payment Status</label>
            <select
              value={filterPaymentStatus}
              onChange={(e) => setFilterPaymentStatus(e.target.value)}
              className="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Pending / Unpaid</option>
              <option value="Exempt">Exempt</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Summary Metric Cards (Top KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total OPD Tokens */}
        <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-xs flex flex-col justify-between h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Tokens</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#3563F6] flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">{stats.total}</span>
            <span className="text-[10px] font-bold text-slate-400">Tokens Generated</span>
          </div>
        </div>

        {/* Completed Consultations */}
        <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-xs flex flex-col justify-between h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Completed</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 font-mono">{stats.completedCount}</span>
            <span className="text-[10px] font-bold text-emerald-700">
              {stats.total > 0 ? `${Math.round((stats.completedCount / stats.total) * 100)}%` : '0%'} rate
            </span>
          </div>
        </div>

        {/* Consultation Fee Revenue */}
        <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-xs flex flex-col justify-between h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600 font-mono">₹{stats.totalRevenue.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-amber-700">{stats.paidCount} Paid Bills</span>
          </div>
        </div>
      </div>

      {/* 5. Detailed Patient Intake & Payment Logs Table */}
      <Card
        title="📋 Detailed OPD Patient Intake Logs"
        subtitle="Searchable record list matching selected report parameters."
      >
        {/* Table Search Input */}
        <div className="pt-1 pb-3">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Patient Name, UHID, Mobile, or Token #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
            />
          </div>
        </div>

        {/* Responsive OPD Log Table */}
        <Table
          flat={true}
          headers={[
            {
              key: 'date',
              label: 'Date',
              render: (row) => <span className="font-mono text-xs font-medium">{new Date(row.date || row.createdAt).toLocaleDateString()}</span>
            },
            {
              key: 'tokenNumber',
              label: 'Token #',
              render: (row) => (
                <span className="font-bold text-[#3563F6] font-mono text-xs bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                  #{row.tokenNumber || 'OP000'}
                </span>
              )
            },
            {
              key: 'patientId.name',
              label: 'Patient Name',
              render: (row) => (
                <div>
                  <div className="font-bold text-slate-900 text-xs">{row.patientId?.name || 'Unknown'}</div>
                  <div className="text-[10px] text-slate-500 font-mono">UHID: {row.patientId?.uhid || 'N/A'}</div>
                </div>
              )
            },
            {
              key: 'genderAge',
              label: 'Gender / Age',
              render: (row) => (
                <span className="text-xs font-semibold text-slate-700">
                  {row.patientId?.gender || row.gender || 'N/A'}, {row.patientId?.age || row.age || 0} Yrs
                </span>
              )
            },
            {
              key: 'doctorId.name',
              label: 'Doctor',
              render: (row) => <span className="font-semibold text-slate-700 text-xs">{row.doctorId?.name || 'Unassigned'}</span>
            },
            {
              key: 'queueStatus',
              label: 'Stage Status',
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
              label: 'Fee (₹)',
              render: (row) => <span className="font-mono font-bold text-xs text-slate-900">₹{row.consultationFee || 500}</span>
            },
            {
              key: 'billingStatus',
              label: 'Payment Status',
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
            }
          ]}
          data={filteredAppointments}
          loading={isLoading}
        />
      </Card>

    </div>
  );
};

export default ReceptionistReports;
