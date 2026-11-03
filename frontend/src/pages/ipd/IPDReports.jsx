import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isIpdAvailable } from '../../utils/featureUtils';
import api from '../../services/api';
import Card from '../../components/Card';
import Table from '../../components/Table';
import DatePicker from '../../components/DatePicker';
import InpatientDetailsModal from '../../components/ipd/InpatientDetailsModal';
import { 
  Calendar, Users, UserCheck, Stethoscope, DollarSign, Filter, 
  Download, Printer, RefreshCw, FileText, PieChart, Activity,
  ChevronDown, ChevronUp, Search, ShieldCheck, Clock, CheckCircle2,
  Eye, ArrowRight, TrendingUp, BarChart3, Layers, X, CreditCard, 
  RotateCcw, Bed, Building2, User, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

const IPDReports = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const location = useLocation();

  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));
  // Scoping logic: Doctor Desk shows doctor's assigned/visited patients; Receptionist Desk shows all
  const isDoctorDesk = location.pathname.startsWith('/doctor') || (user?.roleId?.name === 'DOCTOR' && !location.pathname.startsWith('/reception'));

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');
  
  // Default to Last 30 Days (MONTH) preset to match screenshot
  const past30 = new Date(today);
  past30.setDate(today.getDate() - 29);
  const past30Str = past30.toLocaleDateString('en-CA');

  // Reporting Period State
  const [dateRangePreset, setDateRangePreset] = useState('MONTH'); // 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
  const [fromDate, setFromDate] = useState(past30Str);
  const [toDate, setToDate] = useState(todayStr);

  // Additional Filter States
  const [filterDoctor, setFilterDoctor] = useState('ALL');
  const [filterWard, setFilterWard] = useState('ALL');
  const [filterGender, setFilterGender] = useState('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('ALL');
  const [filterAdmissionStatus, setFilterAdmissionStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState(null);

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
    setDateRangePreset('MONTH');
    setFromDate(past30Str);
    setToDate(todayStr);
    setFilterDoctor('ALL');
    setFilterWard('ALL');
    setFilterGender('ALL');
    setFilterPaymentStatus('ALL');
    setFilterAdmissionStatus('ALL');
    setSearchQuery('');
  };

  // 1. Fetch Doctors for filter dropdown
  const { data: doctors = [] } = useQuery({
    queryKey: ['doctors', 'ipd_reports'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data?.data || [];
    }
  });

  // 2. Fetch IPD Wards
  const { data: wards = [], refetch: refetchWards } = useQuery({
    queryKey: ['ipd-wards-reports'],
    queryFn: async () => {
      const res = await api.get('/ipd/wards');
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // 3. Fetch IPD Beds Inventory
  const { data: beds = [], refetch: refetchBeds } = useQuery({
    queryKey: ['ipd-beds-reports'],
    queryFn: async () => {
      const res = await api.get('/ipd/beds');
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // 4. Fetch IPD Admissions (scoped by doctor if Doctor Desk)
  const { 
    data: rawAdmissions = [], 
    isLoading, 
    isRefetching, 
    refetch: refetchAdmissions 
  } = useQuery({
    queryKey: ['ipd-admissions-reports', isDoctorDesk ? (user?._id || 'doctor') : 'all'],
    queryFn: async () => {
      const url = isDoctorDesk && user?._id
        ? `/ipd/admissions?doctorId=${user._id}`
        : '/ipd/admissions';
      const res = await api.get(url);
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // Global Refresh Handler
  const handleRefresh = async () => {
    try {
      await Promise.all([
        refetchAdmissions(),
        refetchBeds(),
        refetchWards(),
        queryClient.invalidateQueries(['ipd-wards']),
        queryClient.invalidateQueries(['ipd-beds']),
        queryClient.invalidateQueries(['ipd-admissions'])
      ]);
      toast.success('IPD analytics & reports refreshed');
    } catch {
      toast.error('Failed to refresh IPD analytics');
    }
  };

  // Filter admissions according to scope, reporting period, and filter criteria
  const filteredAdmissions = useMemo(() => {
    if (!Array.isArray(rawAdmissions)) return [];

    return rawAdmissions.filter((adm) => {
      // Doctor desk scoping (if doctor desk)
      if (isDoctorDesk && user?._id) {
        const myDocId = String(user._id);
        const itemDocId = adm.attendingDoctorId?._id
          ? String(adm.attendingDoctorId._id)
          : String(adm.attendingDoctorId || '');
        const hasVisited = (Array.isArray(adm.visitedDoctorIds) && adm.visitedDoctorIds.some(v => {
          const vDocId = v?._id ? String(v._id) : String(v || '');
          return vDocId === myDocId;
        })) || (Array.isArray(adm.doctorVisits) && adm.doctorVisits.some(v => {
          const vDocId = v.doctorId?._id ? String(v.doctorId._id) : String(v.doctorId || '');
          return vDocId === myDocId;
        }));
        if (itemDocId !== myDocId && !hasVisited) return false;
      }

      // Date Range Filter (based on admissionDate)
      const admDate = adm.admissionDate ? new Date(adm.admissionDate) : null;
      if (admDate && !isNaN(admDate.getTime())) {
        const admDateStr = admDate.toLocaleDateString('en-CA');
        if (fromDate && admDateStr < fromDate) return false;
        if (toDate && admDateStr > toDate) return false;
      }

      // Doctor Filter
      if (filterDoctor !== 'ALL') {
        const docId = adm.attendingDoctorId?._id || adm.attendingDoctorId;
        if (String(docId) !== String(filterDoctor)) return false;
      }

      // Ward Filter
      if (filterWard !== 'ALL') {
        const wId = adm.bedId?.wardId?._id || adm.bedId?.wardId;
        if (String(wId) !== String(filterWard)) return false;
      }

      // Gender Filter
      if (filterGender !== 'ALL') {
        const g = (adm.patientId?.gender || adm.gender || 'Other').toLowerCase();
        if (g !== filterGender.toLowerCase()) return false;
      }

      // Payment Status Filter
      if (filterPaymentStatus !== 'ALL') {
        const pStatus = adm.paymentStatus || 'Unpaid';
        if (filterPaymentStatus === 'Paid' && pStatus !== 'Paid') return false;
        if (filterPaymentStatus === 'Partially Paid' && pStatus !== 'Partially Paid') return false;
        if (filterPaymentStatus === 'Pending' && pStatus !== 'Pending' && pStatus !== 'Unpaid') return false;
      }

      // Admission Status Filter
      if (filterAdmissionStatus !== 'ALL') {
        const aStatus = adm.status || 'Admitted';
        if (aStatus !== filterAdmissionStatus) return false;
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const pName = (adm.patientId?.name || '').toLowerCase();
        const pUhid = (adm.patientId?.uhid || '').toLowerCase();
        const admId = (adm.admissionId || '').toLowerCase();
        const mobile = (adm.patientId?.mobileNumber || '').toLowerCase();
        const docName = (adm.attendingDoctorId?.name || '').toLowerCase();
        const wardName = (adm.bedId?.wardId?.name || '').toLowerCase();
        const bedNo = (adm.bedId?.bedNumber || '').toLowerCase();
        return pName.includes(q) || pUhid.includes(q) || admId.includes(q) || 
               mobile.includes(q) || docName.includes(q) || wardName.includes(q) || bedNo.includes(q);
      }

      return true;
    });
  }, [rawAdmissions, isDoctorDesk, user?._id, fromDate, toDate, filterDoctor, filterWard, filterGender, filterPaymentStatus, filterAdmissionStatus, searchQuery]);

  // Bed Occupancy & Inventory Metrics
  const { 
    occupancyPercent, 
    occupiedBeds, 
    availableBeds,
    cleaningBeds,
    maintenanceBeds,
    totalActiveBeds 
  } = useMemo(() => {
    const activeBeds = beds.filter(b => b.isActive !== false);
    const total = activeBeds.length;
    const occupied = activeBeds.filter(b => b.status === 'Occupied').length;
    const available = activeBeds.filter(b => b.status === 'Available').length;
    const cleaning = activeBeds.filter(b => b.status === 'Cleaning').length;
    const maintenance = activeBeds.filter(b => b.status === 'Maintenance' || b.status === 'Blocked').length;
    const percent = total > 0 ? Math.round((occupied / total) * 100) : 0;

    return { 
      occupancyPercent: percent, 
      occupiedBeds: occupied, 
      availableBeds: available,
      cleaningBeds: cleaning,
      maintenanceBeds: maintenance,
      totalActiveBeds: total 
    };
  }, [beds]);

  // Analytics Computation (Derived strictly from filteredAdmissions)
  const metrics = useMemo(() => {
    const totalAdmissions = filteredAdmissions.length;
    
    let admitted = 0;
    let discharged = 0;
    let transferred = 0;
    let deceased = 0;
    let cancelled = 0;

    let routine = 0;
    let emergency = 0;
    let transferType = 0;
    let dayCare = 0;

    let paidBills = 0;
    let pendingPayments = 0;
    let partiallyPaid = 0;
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

    filteredAdmissions.forEach(adm => {
      // 1. Admission Status
      const status = adm.status || 'Admitted';
      if (status === 'Admitted') admitted++;
      else if (status === 'Discharged') discharged++;
      else if (status === 'Transferred') transferred++;
      else if (status === 'Deceased') deceased++;
      else if (status === 'Cancelled') cancelled++;

      // 2. Admission Type
      const typeStr = (adm.admissionType || adm.reasonForAdmission || '').toLowerCase();
      if (typeStr.includes('routine') || typeStr.includes('elective') || typeStr.includes('planned')) {
        routine++;
      } else if (typeStr.includes('transfer')) {
        transferType++;
      } else if (typeStr.includes('day care') || typeStr.includes('daycare')) {
        dayCare++;
      } else {
        emergency++;
      }

      // 3. Financials & Billing
      const bDetails = adm.billingDetails || {};
      const calculatedTotal = Number(bDetails.totalBill) || 
        (Number(bDetails.bedCharges || 0) + 
         Number(bDetails.consultationCharges || 0) + 
         Number(bDetails.nursingCharges || 0) + 
         Number(bDetails.procedureCharges || 0) + 
         Number(bDetails.labCharges || 0) + 
         Number(bDetails.medicationCharges || 0) + 
         Number(bDetails.otherCharges || 0) - 
         Number(bDetails.discount || 0) + 
         Number(bDetails.tax || 0));

      const billAmount = calculatedTotal > 0 ? calculatedTotal : (Number(adm.amountPaid) || 5000);
      const isSettled = adm.paymentStatus === 'Paid' || 
                        (billAmount > 0 && Number(adm.amountPaid || 0) >= billAmount) ||
                        adm.billingDetails?.settlementException?.reason?.toLowerCase().includes('fully settled') ||
                        adm.status === 'Discharged';
      const paidAmt = isSettled ? billAmount : (Number(adm.amountPaid) || 0);
      const remainingAmt = isSettled ? 0 : Math.max(0, billAmount - paidAmt);

      const pStatus = isSettled ? 'Paid' : (adm.paymentStatus === 'Partially Paid' || (paidAmt > 0 && paidAmt < billAmount) ? 'Partially Paid' : 'Pending');

      totalRevenue += billAmount;
      paidRevenue += paidAmt;
      pendingRevenue += remainingAmt;

      if (pStatus === 'Paid') {
        paidBills++;
      } else if (pStatus === 'Partially Paid') {
        partiallyPaid++;
        pendingPayments++;
      } else {
        pendingPayments++;
      }

      // 4. Gender
      const g = (adm.patientId?.gender || adm.gender || 'Other').toLowerCase();
      if (g === 'female') femaleCount++;
      else if (g === 'male') maleCount++;
      else otherGenderCount++;

      // 5. Age
      const age = Number(adm.patientId?.age || adm.age || 0);
      if (age <= 18) ageGroup0_18++;
      else if (age <= 30) ageGroup19_30++;
      else if (age <= 45) ageGroup31_45++;
      else if (age <= 60) ageGroup46_60++;
      else ageGroup60Plus++;

      // 6. Doctor Stats
      const docId = adm.attendingDoctorId?._id || adm.attendingDoctorId || 'unassigned';
      const docName = adm.attendingDoctorId?.name 
        ? (adm.attendingDoctorId.name.startsWith('Dr.') ? adm.attendingDoctorId.name : `Dr. ${adm.attendingDoctorId.name}`) 
        : 'Unassigned';

      if (!doctorStatsMap[docId]) {
        doctorStatsMap[docId] = { id: docId, name: docName, admissions: 0, admitted: 0, discharged: 0 };
      }
      doctorStatsMap[docId].admissions++;
      if (status === 'Admitted') doctorStatsMap[docId].admitted++;
      if (status === 'Discharged') doctorStatsMap[docId].discharged++;

      // 7. Daily trend mapping
      const dateObj = new Date(adm.admissionDate || adm.createdAt);
      const dateKey = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : 'Today';
      dayVolumeMap[dateKey] = (dayVolumeMap[dateKey] || 0) + 1;
      dayRevenueMap[dateKey] = (dayRevenueMap[dateKey] || 0) + paidAmt;
    });

    const doctorPerformanceList = Object.values(doctorStatsMap).map(d => ({
      ...d,
      dischargeRate: d.admissions > 0 ? Math.round((d.discharged / d.admissions) * 100) : 0
    })).sort((a, b) => b.admissions - a.admissions);

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
    const avgDailyVisits = sortedDates.length > 0 ? Math.round(totalAdmissions / sortedDates.length) : totalAdmissions;

    return {
      totalAdmissions,
      admitted,
      discharged,
      transferred,
      deceased,
      cancelled,
      routine,
      emergency,
      transferType,
      dayCare,
      paidBills,
      pendingPayments,
      partiallyPaid,
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
  }, [filteredAdmissions]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredAdmissions.length === 0) {
      toast.error('No matching IPD admission records available to export.');
      return;
    }

    const headers = [
      'Admission Date', 
      'IPD Number', 
      'Patient Name', 
      'UHID', 
      'Gender', 
      'Age', 
      'Ward', 
      'Bed No.', 
      'Doctor', 
      'Admission Type', 
      'Status', 
      'Payment Status', 
      'Total Bill (Rs)', 
      'Paid Amount (Rs)'
    ];

    const rows = filteredAdmissions.map((adm) => {
      const bDetails = adm.billingDetails || {};
      const calculatedTotal = Number(bDetails.totalBill) || (Number(adm.amountPaid) || 5000);
      const paidAmt = Number(adm.amountPaid) || (adm.paymentStatus === 'Paid' ? calculatedTotal : 0);

      return [
        adm.admissionDate ? new Date(adm.admissionDate).toLocaleDateString('en-GB') : 'N/A',
        adm.admissionId || 'N/A',
        `"${adm.patientId?.name || 'Unknown'}"`,
        adm.patientId?.uhid || 'N/A',
        adm.patientId?.gender || adm.gender || 'N/A',
        adm.patientId?.age || adm.age || 'N/A',
        `"${adm.bedId?.wardId?.name || 'General Ward'}"`,
        adm.bedId?.bedNumber || 'N/A',
        `"${adm.attendingDoctorId?.name ? (adm.attendingDoctorId.name.startsWith('Dr.') ? adm.attendingDoctorId.name : `Dr. ${adm.attendingDoctorId.name}`) : 'Unassigned'}"`,
        adm.admissionType || 'Routine Admission',
        adm.status || 'Admitted',
        adm.paymentStatus || 'Paid',
        calculatedTotal,
        paidAmt
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VillZone_HIMS_IPD_Report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredAdmissions.length} IPD records to CSV!`);
  };

  // Print Report Handler
  const handlePrint = () => {
    window.print();
  };

  if (!isIpdEnabled) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-4 border border-amber-200">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">In-Patient Department (IPD) Disabled</h2>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          The In-Patient Department feature is not enabled for your assigned hospital. Please contact your hospital administrator.
        </p>
      </div>
    );
  }

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
        <h2 className="text-sm font-bold text-slate-700">In-Patient Department (IPD) Analytics & Reports</h2>
        <div className="grid grid-cols-2 text-xs text-slate-600 mt-2 font-mono">
          <div>Report Period: <strong>{fromDate}</strong> to <strong>{toDate}</strong></div>
          <div>Generated Date: <strong>{new Date().toLocaleString()}</strong></div>
          <div>Doctor Filter: <strong>{filterDoctor === 'ALL' ? 'All Doctors' : filterDoctor}</strong></div>
          <div>Ward Filter: <strong>{filterWard === 'ALL' ? 'All Wards' : filterWard}</strong></div>
        </div>
      </div>
      
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-start sm:items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#3563F6] shrink-0 mt-1 sm:mt-0" />
            <span className="leading-tight sm:leading-normal">IPD Analytics & Reports</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Analyze IPD inpatient volume, bed occupancy, ward workload, and admission revenue.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
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
              Showing {filteredAdmissions.length} matching records
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {/* Doctor Selector */}
            <div className="flex flex-col gap-1 text-left min-w-0">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5 truncate">Doctor</label>
              <select
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
                className="w-full h-[40px] px-2.5 sm:px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer truncate"
              >
                <option value="ALL">All Doctors</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>{d.name?.startsWith('Dr.') ? d.name : `Dr. ${d.name}`}</option>
                ))}
              </select>
            </div>

            {/* Ward Selector */}
            <div className="flex flex-col gap-1 text-left min-w-0">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5 truncate">Ward</label>
              <select
                value={filterWard}
                onChange={(e) => setFilterWard(e.target.value)}
                className="w-full h-[40px] px-2.5 sm:px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer truncate"
              >
                <option value="ALL">All Wards</option>
                {wards.map((w) => (
                  <option key={w._id} value={w._id}>{w.name || w.code}</option>
                ))}
              </select>
            </div>

            {/* Gender Selector */}
            <div className="flex flex-col gap-1 text-left min-w-0">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5 truncate">Gender</label>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
                className="w-full h-[40px] px-2.5 sm:px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer truncate"
              >
                <option value="ALL">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Payment Status Selector */}
            <div className="flex flex-col gap-1 text-left min-w-0">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5 truncate">Payment Status</label>
              <select
                value={filterPaymentStatus}
                onChange={(e) => setFilterPaymentStatus(e.target.value)}
                className="w-full h-[40px] px-2.5 sm:px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer truncate"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Pending">Pending / Unpaid</option>
              </select>
            </div>

            {/* Inpatient Admission Status Selector */}
            <div className="flex flex-col gap-1 text-left min-w-0">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-0.5 truncate">Patient Status</label>
              <select
                value={filterAdmissionStatus}
                onChange={(e) => setFilterAdmissionStatus(e.target.value)}
                className="w-full h-[40px] px-2.5 sm:px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer truncate"
              >
                <option value="ALL">All Statuses</option>
                <option value="Admitted">Admitted</option>
                <option value="Discharged">Discharged</option>
                <option value="Transferred">Transferred</option>
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
        {/* TOTAL ADMISSIONS */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">TOTAL ADMISSIONS</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">{metrics.totalAdmissions}</span>
            <span className="text-[10px] font-bold text-slate-400">Admissions</span>
          </div>
        </div>

        {/* CURRENTLY ADMITTED */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">CURRENTLY ADMITTED</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 font-mono">{metrics.admitted}</span>
            <span className="text-[10px] font-bold text-emerald-700">Inpatients</span>
          </div>
        </div>

        {/* BED OCCUPANCY RATE */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs flex flex-col justify-between h-24 hover:shadow-md transition-all text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">BED OCCUPANCY RATE</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-600 font-mono">{occupancyPercent}%</span>
            <span className="text-[10px] font-bold text-blue-600">Occupied</span>
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

      {/* 5. Inpatient Volume Trend & IPD Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* INPATIENT ADMISSION TREND (7 cols) */}
        <div className="lg:col-span-7">
          <Card
            title="PATIENT VOLUME TREND"
            subtitle="Inpatient admissions during selected period"
          >
            <div className="pt-2 space-y-4">
              {metrics.dailyTrend.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-xl">
                  No admission volume records for the selected period.
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
                            {d.count} admissions ({d.label})
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
                    <div>Average Daily Admissions: <strong className="text-slate-900 font-bold">{metrics.avgDailyVisits}</strong></div>
                    <div>Peak Day: <strong className="text-purple-700 font-bold">{metrics.peakDayLabel}</strong> ({metrics.peakDayCount} admissions)</div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* IPD STATUS DISTRIBUTION (5 cols) */}
        <div className="lg:col-span-5">
          <Card
            title="IPD STATUS DISTRIBUTION"
            subtitle="Inpatient workflow and admission category breakdown"
          >
            <div className="space-y-3.5 pt-2">
              {[
                { label: 'Admitted (Active)', count: metrics.admitted, color: 'bg-emerald-500', textColor: 'text-emerald-700' },
                { label: 'Discharged', count: metrics.discharged, color: 'bg-blue-500', textColor: 'text-blue-700' },
                { label: 'Transferred', count: metrics.transferred, color: 'bg-purple-500', textColor: 'text-purple-700' },
                { label: 'Emergency / Trauma', count: metrics.emergency, color: 'bg-rose-500', textColor: 'text-rose-700' },
                { label: 'Routine Admission', count: metrics.routine, color: 'bg-indigo-500', textColor: 'text-indigo-700' },
                { label: 'Day Care Admission', count: metrics.dayCare, color: 'bg-amber-500', textColor: 'text-amber-700' }
              ].map((item) => {
                const pct = metrics.totalAdmissions > 0 ? Math.round((item.count / metrics.totalAdmissions) * 100) : 0;
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

      {/* 6. Doctor Workload & Revenue Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* DOCTOR WORKLOAD (7 cols) */}
        <div className="lg:col-span-7">
          <Card
            title="DOCTOR WORKLOAD"
            subtitle="Inpatient admissions and discharge volume by attending doctor"
          >
            <div className="overflow-x-auto pt-1">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                    <th className="py-2.5 px-3">Doctor</th>
                    <th className="py-2.5 px-3 text-center">Admissions</th>
                    <th className="py-2.5 px-3 text-center">Active Admitted</th>
                    <th className="py-2.5 px-3 text-center">Discharged</th>
                    <th className="py-2.5 px-3 text-right">Discharge Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.doctorPerformanceList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                        No doctor inpatient workload records found.
                      </td>
                    </tr>
                  ) : (
                    metrics.doctorPerformanceList.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-900">{doc.name}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-800">{doc.admissions}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-emerald-600">{doc.admitted}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-blue-600">{doc.discharged}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#3563F6]">
                          {doc.dischargeRate}%
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
            subtitle="IPD billing, bed charges & settlement collection"
          >
            <div className="space-y-4 pt-1">
              <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total IPD Invoiced Revenue</span>
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bed Inventory Status</span>
                <div className="flex justify-between items-center pt-1 font-semibold text-slate-700">
                  <span>Occupied Beds:</span>
                  <span className="font-mono font-bold text-slate-900">{occupiedBeds} / {totalActiveBeds} ({occupancyPercent}%)</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* 7. Patient Demographics */}
      <Card
        title="PATIENT DEMOGRAPHICS"
        subtitle="Gender and age group distribution of IPD inpatients"
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
                const pct = metrics.totalAdmissions > 0 ? Math.round((g.count / metrics.totalAdmissions) * 100) : 0;
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
                const pct = metrics.totalAdmissions > 0 ? Math.round((age.count / metrics.totalAdmissions) * 100) : 0;
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

      {/* 8. Detailed IPD Records Table */}
      <Card
        title="DETAILED IPD RECORDS"
        subtitle="Inpatient-level admission records matching the selected report filters."
      >
        {/* Search Input Bar */}
        <div className="pt-1 pb-3 no-print">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search patient, UHID, IPD number, doctor, or ward..."
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
              render: (row) => (
                <span className="font-mono text-xs font-medium text-slate-700">
                  {row.admissionDate ? new Date(row.admissionDate).toLocaleDateString('en-GB') : 'N/A'}
                </span>
              )
            },
            {
              key: 'admissionId',
              label: 'IPD NUMBER',
              render: (row) => (
                <button
                  type="button"
                  onClick={() => setSelectedAdmission(row)}
                  className="font-bold text-[#3563F6] font-mono text-xs bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                  title="View Admission Details"
                >
                  #{row.admissionId || 'IPD-0000'}
                </button>
              )
            },
            {
              key: 'patientId.name',
              label: 'PATIENT',
              render: (row) => (
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedAdmission(row)}
                    className="font-bold text-slate-900 text-xs hover:text-[#3563F6] cursor-pointer text-left block"
                  >
                    {row.patientId?.name || 'Unknown'}
                  </button>
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
              key: 'wardBed',
              label: 'WARD & BED',
              render: (row) => {
                const wardName = row.bedId?.wardId?.name || 'General Ward';
                const bedNo = row.bedId?.bedNumber ? `Bed ${row.bedId.bedNumber}` : null;
                return (
                  <span className="text-xs font-semibold text-slate-800">
                    {bedNo ? `${wardName} (${bedNo})` : wardName}
                  </span>
                );
              }
            },
            {
              key: 'doctorId.name',
              label: 'DOCTOR',
              render: (row) => (
                <span className="font-semibold text-slate-700 text-xs">
                  {row.attendingDoctorId?.name 
                    ? (row.attendingDoctorId.name.startsWith('Dr.') ? row.attendingDoctorId.name : `Dr. ${row.attendingDoctorId.name}`) 
                    : 'Unassigned'}
                </span>
              )
            },
            {
              key: 'status',
              label: 'STAGE STATUS',
              render: (row) => {
                const colors = {
                  'Admitted': 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold',
                  'Discharged': 'bg-slate-100 text-slate-700 border-slate-200 font-bold',
                  'Transferred': 'bg-blue-50 text-blue-700 border-blue-200 font-bold',
                  'Deceased': 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
                  'Cancelled': 'bg-amber-50 text-amber-700 border-amber-200 font-bold'
                };
                const status = row.status || 'Admitted';

                return (
                  <span className={`text-[9px] font-bold border px-2 py-0.5 rounded-lg uppercase tracking-wider ${colors[status] || 'bg-slate-50'}`}>
                    {status}
                  </span>
                );
              }
            },
            {
              key: 'fee',
              label: 'TOTAL BILL',
              render: (row) => {
                const bDetails = row.billingDetails || {};
                const calculatedTotal = Number(bDetails.totalBill) || (Number(row.amountPaid) || 5000);
                return (
                  <span className="font-mono font-bold text-xs text-slate-900">
                    ₹{calculatedTotal.toLocaleString()}
                  </span>
                );
              }
            },
            {
              key: 'billingStatus',
              label: 'PAYMENT',
              render: (row) => {
                const bDetails = row.billingDetails || {};
                const calculatedTotal = Number(bDetails.totalBill) || (Number(row.amountPaid) || 5000);
                const paidAmt = Number(row.amountPaid) || (row.paymentStatus === 'Paid' ? calculatedTotal : 0);
                const isSettled = row.paymentStatus === 'Paid' || 
                                  (calculatedTotal > 0 && paidAmt >= calculatedTotal) || 
                                  bDetails.settlementException?.reason?.toLowerCase().includes('fully settled') ||
                                  row.status === 'Discharged';
                const status = isSettled ? 'Paid' : (row.paymentStatus || 'Paid');
                return (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                    status === 'Paid'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'Partially Paid'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {status}
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
                  onClick={() => setSelectedAdmission(row)}
                  className="text-xs font-bold text-[#3563F6] hover:text-blue-700 flex items-center gap-0.5 cursor-pointer no-print"
                >
                  <span>View Details</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )
            }
          ]}
          data={filteredAdmissions}
          loading={isLoading}
        />
      </Card>

      {/* Inpatient Full Details Modal */}
      {selectedAdmission && (
        <InpatientDetailsModal
          isOpen={Boolean(selectedAdmission)}
          onClose={() => setSelectedAdmission(null)}
          admission={selectedAdmission}
          isDoctorDesk={isDoctorDesk}
        />
      )}
    </div>
  );
};

export default IPDReports;
