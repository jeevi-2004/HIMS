import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bed,
  User,
  LogOut,
  Users,
  UserPlus,
  Calendar,
  Wrench,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  RotateCw,
  FileSearch,
  CreditCard,
  LayoutGrid,
  Stethoscope,
  CheckCircle2,
  FileText,
  Clock,
  Eye,
  MoreVertical,
  ClipboardList
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ipdService } from '../../services/ipd/ipdService';
import workflowRealtimeService from '../../services/workflowRealtimeService';
import { ROUTES } from '../../constants/routes';

/**
 * IPD Department Dashboard Component
 * Faithfully reproduces the enterprise IPD Department Dashboard reference design.
 * Adapts seamlessly between Doctor Desk (4 metric cards + 3 stacked status cards)
 * and Reception Desk (6 metric cards + queue live table with view actions + quick actions).
 */
const IPDDepartmentDashboard = ({
  onViewAllAdmissions,
  onSelectAdmission,
  onOpenDischarge,
  onOpenConsultation,
  onOpenDailyConsultation,
  onViewHistory,
  onFilterAdmitted,
  onFilterPending,
  onRegisterAdmission,
  onSearchPatient,
  onManageBeds,
  isDoctorDesk = false,
  user = null
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Selected date filter (defaults to today in YYYY-MM-DD format)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Live time ticker for clock header (e.g. "Saturday, 04:22 PM")
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  // Three-dot action dropdown state (rendered via createPortal to prevent overflow clipping)
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState(null);
  const dropdownMenuRef = useRef(null);

  const handleToggleRowDropdown = (rowId, e) => {
    e.stopPropagation();
    if (activeDropdownId === rowId) {
      setActiveDropdownId(null);
      setDropdownPos(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const menuWidth = 208; // 52 * 4 = 208px
      const menuHeight = 250; // approximate menu height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldFlipUp = spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow;

      const rawRight = window.innerWidth - rect.right;
      const clampedRight = Math.max(12, Math.min(rawRight, window.innerWidth - menuWidth - 12));

      setDropdownPos({
        top: shouldFlipUp ? undefined : Math.max(8, rect.bottom + 4),
        bottom: shouldFlipUp ? Math.max(8, window.innerHeight - rect.top + 4) : undefined,
        right: clampedRight
      });
      setActiveDropdownId(rowId);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownMenuRef.current && !dropdownMenuRef.current.contains(event.target)) {
        setActiveDropdownId(null);
        setDropdownPos(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveDropdownId(null);
        setDropdownPos(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Handle outside scroll & window resize to keep portal menu perfectly synced
  useEffect(() => {
    if (!activeDropdownId) return;

    const handleScroll = (e) => {
      if (dropdownMenuRef.current && dropdownMenuRef.current.contains(e.target)) return;
      setActiveDropdownId(null);
      setDropdownPos(null);
    };

    const handleResize = () => {
      setActiveDropdownId(null);
      setDropdownPos(null);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeDropdownId]);

  // Format date for header card: e.g. "16 Oct, 2026"
  const formattedDisplayDate = (() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch (e) {}
    return selectedDate;
  })();

  // Format day of week and current live time: e.g. "Saturday, 04:22 PM"
  const formattedDayTime = (() => {
    try {
      const dayName = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
      const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${dayName}, ${timeStr}`;
    } catch (e) {
      return '';
    }
  })();

  // Doctor context identification
  const currentDoctorId = isDoctorDesk ? (user?._id || user?.id || null) : null;
  const currentDoctorName = (user?.name || user?.firstName || '').trim().toLowerCase();

  // 1. Fetch live IPD dashboard statistics (Only refresh when user clicks refresh symbol)
  const {
    data: dashboardData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: [
      'ipd',
      'departmentDashboard',
      selectedDate,
      isDoctorDesk ? `doctor_${currentDoctorId || 'current'}` : 'reception_all'
    ],
    queryFn: async () => {
      const params = {
        date: selectedDate,
        ...(isDoctorDesk
          ? { scope: 'my_desk', doctorId: currentDoctorId || undefined }
          : { scope: 'all', all: 'true' })
      };
      const res = await ipdService.getDashboardLiveStatus(params);
      return res;
    },
    refetchInterval: false, // Do NOT auto-refresh on interval
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false, // Do NOT auto-refresh on window focus
    refetchOnReconnect: false,
    staleTime: Infinity // Keep data stable until manual refresh
  });

  const handleManualRefresh = async () => {
    try {
      await refetch();
      toast.success('IPD Dashboard refreshed', { id: 'ipd-dash-refresh' });
    } catch (e) {
      toast.error('Failed to refresh IPD Dashboard');
    }
  };

  const handleNavigateDischarge = () => {
    const targetRoute = isDoctorDesk
      ? ROUTES.DOCTOR?.IPD_DISCHARGE || '/doctor/ipd/discharge'
      : ROUTES.RECEPTION?.IPD_DISCHARGE || '/reception/ipd/discharge';
    navigate(targetRoute);
  };

  const handleNavigateWards = () => {
    if (onManageBeds) {
      onManageBeds();
      return;
    }
    const targetRoute = isDoctorDesk
      ? ROUTES.DOCTOR?.IPD_WARDS || '/doctor/ipd/wards'
      : ROUTES.RECEPTION?.IPD_WARDS || '/reception/ipd/wards';
    navigate(targetRoute);
  };

  // Extract metrics from live data (strictly exact numeric counts, never loading dots)
  const totalAdmissions = Number(dashboardData?.totalAdmissions ?? 0) || 0;
  const currentlyAdmitted = Number(dashboardData?.currentlyAdmitted ?? 0) || 0;
  const dischargesToday = Number(dashboardData?.dischargesToday ?? 0) || 0;
  const occupiedBeds = Number(dashboardData?.bedStats?.occupiedBeds ?? 0) || 0;
  const bedOccupancyRate = Number(dashboardData?.bedStats?.occupancyRate ?? 0) || 0;
  const availableBeds = Number(dashboardData?.bedStats?.availableBeds ?? 0) || 0;

  const pendingAdmissions = Number(dashboardData?.pendingAdmissions ?? 0) || 0;
  const upcomingDischarges = Number(dashboardData?.upcomingDischarges ?? 0) || 0;
  const pendingDischarges = Number(dashboardData?.pendingDischarges ?? 0) || 0;
  const bedMaintenance = Number(dashboardData?.bedMaintenance ?? 0) || 0;
  const pendingPayments = Number(dashboardData?.pendingPayments ?? 0) || 0;


  const rawQueueRecords = dashboardData?.todayQueue || [];

  // Filter queue records strictly for active inpatients and the active doctor on Doctor Desk, or show all for Receptionist Desk
  const queueRecords = useMemo(() => {
    // Strictly filter out any Discharged or Cancelled admissions - this is the "Active IPD Patients" queue
    const activeOnly = rawQueueRecords.filter((item) => {
      const st = String(item.status || item.raw?.status || '').toLowerCase();
      return st !== 'discharged' && st !== 'cancelled';
    });

    if (!isDoctorDesk) return activeOnly;

    const docIdStr = currentDoctorId ? String(currentDoctorId) : '';
    const docNameClean = currentDoctorName ? currentDoctorName.replace(/^dr\.?\s*/i, '') : '';

    return activeOnly.filter((item) => {
      // 1. Check attendingDoctorId directly or object
      const attId = item.attendingDoctorId?._id || item.attendingDoctorId;
      if (attId && docIdStr && String(attId) === docIdStr) return true;

      // 2. Check visitedDoctorIds
      if (Array.isArray(item.visitedDoctorIds) && docIdStr) {
        if (item.visitedDoctorIds.some((v) => String(v?._id || v) === docIdStr)) return true;
      }

      // 3. Match doctorName string if available
      if (docNameClean && item.doctorName) {
        const itemDocClean = item.doctorName.toLowerCase().replace(/^dr\.?\s*/i, '');
        if (itemDocClean.includes(docNameClean) || docNameClean.includes(itemDocClean)) {
          return true;
        }
      }

      // 4. Also check raw admission doc if present
      if (item.raw) {
        const rawAttId = item.raw.attendingDoctorId?._id || item.raw.attendingDoctorId;
        if (rawAttId && docIdStr && String(rawAttId) === docIdStr) return true;

        if (Array.isArray(item.raw.visitedDoctorIds) && docIdStr) {
          if (item.raw.visitedDoctorIds.some((v) => String(v?._id || v) === docIdStr)) return true;
        }
      }

      return false;
    });
  }, [rawQueueRecords, isDoctorDesk, currentDoctorId, currentDoctorName]);


  // Client-side pagination for Queue Table (5 items per page, dynamically calculated from actual queue data)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(queueRecords.length / pageSize));

  // Reset pagination if page exceeds totalPages (e.g. after filter change)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedRecords = queueRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const displayQueueRecords = paginatedRecords.length > 0 ? paginatedRecords : queueRecords;

  // Helper for Status badge styles
  const getStatusBadge = (status, queueStatus, row) => {
    // 1. Reception Desk: Doctor finalized & sent to reception -> "Pending Discharge"
    const isPendingDischarge = !isDoctorDesk && (
      row?.dischargeSummaryStatus === 'Sent to Reception' ||
      row?.raw?.dischargeSummaryStatus === 'Sent to Reception' ||
      row?.clinicalDischargeSummary?.status === 'Sent to Reception' ||
      row?.raw?.clinicalDischargeSummary?.status === 'Sent to Reception'
    );
    if (isPendingDischarge && (row?.status !== 'Discharged' && row?.raw?.status !== 'Discharged')) {
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200 shadow-2xs',
        dot: 'bg-amber-500 animate-pulse',
        text: 'Pending Discharge'
      };
    }

    // 2. Doctor Desk: Doctor clinical discharge summary finalized & sent to reception -> "Completed"
    const isCompleted = isDoctorDesk && (
      row?.dischargeSummaryStatus === 'Completed' ||
      row?.raw?.dischargeSummaryStatus === 'Completed' ||
      row?.dischargeSummaryStatus === 'Sent to Reception' ||
      row?.raw?.dischargeSummaryStatus === 'Sent to Reception' ||
      row?.clinicalDischargeSummary?.status === 'Sent to Reception' ||
      row?.raw?.clinicalDischargeSummary?.status === 'Sent to Reception'
    );

    if (isCompleted) {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        text: 'Completed'
      };
    }

    const s = (status || queueStatus || '').toLowerCase();
    if (s === 'admitted') {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        text: 'Admitted'
      };
    }
    if (s === 'discharged') {
      return {
        bg: 'bg-purple-50 text-purple-700 border-purple-200',
        dot: 'bg-purple-500',
        text: 'Discharged'
      };
    }
    if (s === 'waiting') {
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
        text: 'Waiting'
      };
    }
    if (s.includes('bed') || s.includes('allot')) {
      return {
        bg: 'bg-sky-50 text-sky-700 border-sky-200',
        dot: 'bg-sky-500',
        text: 'Bed Allotted'
      };
    }
    if (s === 'pending') {
      return {
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
        text: 'Pending'
      };
    }
    return {
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500',
      text: status || 'Active'
    };
  };

  return (
    <div className="space-y-6 text-left">
      {/* =========================================================
          1. TOP HEADER SECTION (TITLE + LIVE CONTROLS)
          ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight">
            {isDoctorDesk ? "Today's IPD patients" : "IPD Reception Overview"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
            {isDoctorDesk
              ? 'Overview of inpatient activities, admissions and patient status.'
              : 'Overview of inpatient admissions, bed availability and related activities.'}
          </p>
        </div>

        {/* Date / Time Card & Live Status & Refresh Button */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 self-start md:self-auto">
          {/* Interactive Date & Time Card */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="bg-white border border-[#E5E7EB] hover:border-slate-300 rounded-2xl px-3 sm:px-4 py-2 flex items-center gap-2.5 sm:gap-3 shadow-xs transition-all cursor-pointer text-left"
              title="Change date filter"
            >
              <Calendar className="w-4 h-4 text-[#2F63F2] shrink-0" />
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold text-slate-800">
                  {formattedDisplayDate}
                </span>
                <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                  {formattedDayTime}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isDatePickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Date Picker Popover */}
            {isDatePickerOpen && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3.5 w-64 space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800">Select Date</span>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setSelectedDate(today);
                      setIsDatePickerOpen(false);
                    }}
                    className="text-[11px] font-bold text-[#2F63F2] hover:underline cursor-pointer"
                  >
                    Today
                  </button>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setIsDatePickerOpen(false);
                    }
                  }}
                  className="w-full text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20"
                />
              </div>
            )}
          </div>

          {/* Live Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#ECFDF5] border border-emerald-200 text-emerald-700 text-xs font-bold shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* =========================================================
          2. TOP METRIC CARDS
          Doctor Desk: 4 horizontal cards (Total Admissions, Currently Admitted, Discharges Today, Bed Occupancy)
          Reception Desk: 6 horizontal cards (Admissions Today, Currently Admitted, Available Beds, Pending Admissions, Discharges Today, Beds in Maintenance)
          ========================================================= */}
      {isDoctorDesk ? (
        /* Doctor Desk Layout: 4 Static Cards (Content aligned straight with title) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Total Admissions */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-4.5 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] cursor-default select-none transition-all h-full">
            <div className="flex items-start gap-3 sm:gap-3.5 w-full">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#EFF6FF] border border-blue-100/80 flex items-center justify-center text-[#2F63F2] shrink-0 shadow-xs mt-0.5">
                <Bed className="w-5 h-5 stroke-[2]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                  Total Admissions
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight mt-1.5 sm:mt-2">
                  {totalAdmissions}
                </div>
                <span className="text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                  Patients admitted today
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Currently Admitted */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-4.5 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] cursor-default select-none transition-all h-full">
            <div className="flex items-start gap-3 sm:gap-3.5 w-full">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#ECFDF5] border border-emerald-100/80 flex items-center justify-center text-[#10B981] shrink-0 shadow-xs mt-0.5">
                <User className="w-5 h-5 stroke-[2]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                  Currently Admitted
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight mt-1.5 sm:mt-2">
                  {currentlyAdmitted}
                </div>
                <span className="text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                  Patients in hospital
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Discharges Today */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-4.5 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] cursor-default select-none transition-all h-full">
            <div className="flex items-start gap-3 sm:gap-3.5 w-full">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#FAF5FF] border border-purple-100/80 flex items-center justify-center text-[#A855F7] shrink-0 shadow-xs mt-0.5">
                <LogOut className="w-5 h-5 stroke-[2] ml-0.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                  Discharges Today
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight mt-1.5 sm:mt-2">
                  {dischargesToday}
                </div>
                <span className="text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                  Patients discharged today
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Bed Occupancy */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-4.5 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] cursor-default select-none transition-all h-full">
            <div className="flex items-start gap-3 sm:gap-3.5 w-full">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#FFF1F2] border border-rose-100/80 flex items-center justify-center text-[#F43F5E] shrink-0 shadow-xs mt-0.5">
                <Bed className="w-5 h-5 stroke-[2]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                  Bed Occupancy
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight mt-1.5 sm:mt-2">
                  {occupiedBeds}
                </div>
                <span className="text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                  Total beds occupied
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Reception Desk Layout: 5 Static Metric Cards Across (3 rows & 2 columns on mobile, 5 cols on desktop) */
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-4 xl:gap-4.5 items-stretch">
          {/* Card 1: Admissions Today */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-start cursor-default select-none transition-all h-full">
            <div className="flex items-start justify-between gap-2 w-full">
              <span className="text-[11px] sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                Admissions Today
              </span>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#EFF6FF] border border-blue-100/80 text-[#2F63F2] flex items-center justify-center shrink-0 shadow-xs">
                <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2]" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-2 w-full">
              <div className="text-xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight">
                {totalAdmissions}
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                Registered today
              </span>
            </div>
          </div>

          {/* Card 2: Currently Admitted */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-start cursor-default select-none transition-all h-full">
            <div className="flex items-start justify-between gap-2 w-full">
              <span className="text-[11px] sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                Currently Admitted
              </span>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#ECFDF5] border border-emerald-100/80 text-[#10B981] flex items-center justify-center shrink-0 shadow-xs">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2]" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-2 w-full">
              <div className="text-xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight">
                {currentlyAdmitted}
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                Patients in hospital
              </span>
            </div>
          </div>

          {/* Card 3: Available Beds */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-start cursor-default select-none transition-all h-full">
            <div className="flex items-start justify-between gap-2 w-full">
              <span className="text-[11px] sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                Available Beds
              </span>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#FFFBEB] border border-amber-100/80 text-[#D97706] flex items-center justify-center shrink-0 shadow-xs">
                <Bed className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2]" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-2 w-full">
              <div className="text-xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight">
                {availableBeds}
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                Ready for admission
              </span>
            </div>
          </div>

          {/* Card 4: Discharges Today */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-start cursor-default select-none transition-all h-full">
            <div className="flex items-start justify-between gap-2 w-full">
              <span className="text-[11px] sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                Discharges Today
              </span>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#FFF1F2] border border-rose-100/80 text-[#F43F5E] flex items-center justify-center shrink-0 shadow-xs">
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2] ml-0.5" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-2 w-full">
              <div className="text-xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight">
                {dischargesToday}
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                Discharged today
              </span>
            </div>
          </div>

          {/* Card 5: Pending Payments */}
          <div className="bg-white border border-slate-200/90 rounded-[22px] p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-start cursor-default select-none transition-all h-full col-span-2 md:col-span-1">
            <div className="flex items-start justify-between gap-2 w-full">
              <span className="text-[11px] sm:text-[13px] font-semibold text-slate-700 block tracking-tight leading-snug">
                Pending Payments
              </span>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#FAF5FF] border border-purple-100/80 text-[#9333EA] flex items-center justify-center shrink-0 shadow-xs">
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2]" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-2 w-full">
              <div className="text-xl sm:text-3xl font-extrabold text-slate-900 leading-tight font-mono tracking-tight">
                {pendingPayments}
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block mt-0.5 leading-tight">
                Outstanding dues
              </span>
            </div>
          </div>
        </div>
      )}



      {/* =========================================================
          3. MAIN CONTENT: QUEUE LIVE TABLE (LEFT) & RIGHT SECTION
          Doctor Desk: Full-width queue live table
          Reception Desk: Left (8-column table with Actions + Pagination) + Right (Quick Actions)
          ========================================================= */}
      <div className={isDoctorDesk ? 'w-full' : 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'}>
        {/* Left Column (Table) */}
        <div className={`${isDoctorDesk ? 'w-full' : 'lg:col-span-8'} bg-white border border-[#E5E7EB] rounded-[22px] p-5 sm:p-6 shadow-xs space-y-4`}>
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#EFF6FF] text-[#2F63F2] flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-[#2F63F2] stroke-[2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {isDoctorDesk ? "Active IPD Patients" : "Today's IPD Admission Queue"}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {isDoctorDesk ? 'Live' : 'Live Queue'}
                  </span>
                  {!isDoctorDesk && pendingDischarges > 0 && (
                    <span 
                      onClick={() => navigate(`${ROUTES.RECEPTION?.IPD_INPATIENTS || '/reception/ipd/inpatients'}?status=Pending Discharge`)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold cursor-pointer hover:bg-amber-100 transition-colors shadow-2xs"
                      title="Click to view admissions awaiting discharge settlement"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      {pendingDischarges} Pending Discharge
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-normal mt-0.5">
                  {isDoctorDesk
                    ? 'Live count of patients added to IPD department from all entry points.'
                    : 'Patient registration and admission status for today.'}
                </p>
              </div>
            </div>

            {/* View All > Button */}
            <button
              type="button"
              onClick={onViewAllAdmissions}
              className="bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto shrink-0"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          {/* Table Container */}
          <div className="border border-slate-100 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-3.5 whitespace-nowrap">IPD NO & UHID</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">PATIENT NAME</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">AGE / GENDER</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">WARD & BED NO</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">ADMISSION DATE</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">STATUS</th>
                  <th className="py-3 px-3.5 whitespace-nowrap text-right">
                    {isDoctorDesk ? 'ACTION' : 'ACTIONS'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RotateCw className="w-6 h-6 text-[#2F63F2] animate-spin" />
                        <span className="text-xs font-medium text-slate-400">Loading IPD Queue...</span>
                      </div>
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="text-sm font-medium text-rose-500">
                          {error?.response?.data?.message || 'Failed to load IPD Queue'}
                        </span>
                        <button
                          type="button"
                          onClick={handleManualRefresh}
                          className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 cursor-pointer"
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : queueRecords.length === 0 ? (
                  /* Empty state matching the reference image illustration */
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-[#EFF6FF] border border-blue-100 flex items-center justify-center mb-3 text-[#2F63F2]">
                          <FileSearch className="w-8 h-8 text-[#2F63F2] stroke-[1.6]" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">
                          {isDoctorDesk
                            ? 'No patients currently assigned to you in the IPD queue.'
                            : 'No records matching the search query.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayQueueRecords.map((row, rowIdx) => {
                    const badge = getStatusBadge(row.status, row.queueStatus, row.raw || row);

                    return (
                      <tr
                        key={row._id}
                        onClick={() => {
                          if (onSelectAdmission && row.raw) {
                            onSelectAdmission(row.raw);
                          } else if (onViewAllAdmissions) {
                            onViewAllAdmissions();
                          }
                        }}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                      >
                        {/* IPD NO & UHID */}
                        <td className="py-2 sm:py-2.5 px-3.5 whitespace-nowrap font-mono">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900">
                              {row.ipdNo}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                              {row.uhid ? (String(row.uhid).toUpperCase().startsWith('UHID') ? row.uhid : `UHID: ${row.uhid}`) : '—'}
                            </span>
                          </div>
                        </td>

                        {/* PATIENT NAME */}
                        <td className="py-2 sm:py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800 group-hover:text-[#2F63F2] transition-colors">
                              {row.patientName}
                            </span>
                            {row.doctorName && row.doctorName !== 'Unassigned' && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]" title={row.doctorName}>
                                  {row.doctorName}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* AGE / GENDER */}
                        <td className="py-2 sm:py-2.5 px-3.5 whitespace-nowrap">
                          {(() => {
                            const p = row.raw?.patientId || row.raw || {};
                            const age = row.age || p.age;
                            const gender = row.gender || p.gender;
                            const bloodGroup = row.bloodGroup || p.bloodGroup || row.raw?.bloodGroup;
                            const genderLetter = gender ? (gender.length === 1 ? gender.toUpperCase() : gender.charAt(0).toUpperCase()) : '';
                            const ageGenderText = age ? `${String(age).replace(/[^0-9]/g, '') || age} yrs / ${genderLetter || gender}` : (genderLetter || '—');
                            return (
                              <div className="flex flex-col items-start leading-tight">
                                <span className="text-slate-800 font-semibold text-xs">
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
                          })()}
                        </td>

                        {/* WARD & BED NO (Top & Down) */}
                        <td className="py-2 sm:py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800">
                              {row.ward}
                            </span>
                            <div className="mt-0.5">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-[11px] font-bold text-slate-700">
                                {row.bedNo}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* ADMISSION DATE */}
                        <td className="py-2 sm:py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800">
                              {row.admissionDate
                                ? new Date(row.admissionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                : (row.raw?.admissionDate
                                    ? new Date(row.raw.admissionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : '—')}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{row.admissionTime || '—'}</span>
                            </span>
                          </div>
                        </td>

                        {/* STATUS */}
                        <td className="py-2 sm:py-2.5 px-3.5 whitespace-nowrap">
                          {badge.text === 'Pending Discharge' ? (
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl border ${badge.bg}`}
                              title="Doctor has submitted clinical discharge summary. Ready for billing settlement & discharge."
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} shrink-0`} />
                              <span className="flex flex-col text-left leading-tight">
                                <span className="font-bold text-[10.5px]">Pending</span>
                                <span className="font-semibold text-[9.5px]">Discharge</span>
                              </span>
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badge.bg}`}
                              title={badge.text === 'Pending Discharge' ? 'Doctor has submitted clinical discharge summary. Ready for billing settlement & discharge.' : undefined}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              {badge.text}
                            </span>
                          )}
                        </td>

                        {/* ACTIONS: Consultation / Discharge button + Eye icon + Three-dot dropdown */}
                        <td className="py-2 sm:py-2.5 px-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2 relative">
                            {/* Consultation Button: Only available on Doctor Desk */}
                            {isDoctorDesk && row.status !== 'Discharged' && (
                              (() => {
                                const isFinalized = row.dischargeSummaryStatus === 'Sent to Reception' ||
                                                    row.dischargeSummaryStatus === 'Completed' ||
                                                    row.raw?.dischargeSummaryStatus === 'Sent to Reception' ||
                                                    row.raw?.dischargeSummaryStatus === 'Completed' ||
                                                    row.clinicalDischargeSummary?.status === 'Sent to Reception' ||
                                                    row.raw?.clinicalDischargeSummary?.status === 'Sent to Reception';
                                if (isFinalized) {
                                  // Status column already clearly shows "Completed"; do not render duplicate badge in action column
                                  return null;
                                }
                                return (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const adm = row.raw || row;
                                      const admId = adm?._id || adm?.id || adm?.admissionId;
                                      try {
                                        if (admId) {
                                          await ipdService.updateAdmissionStatus(admId, { queueStatus: 'In Progress' });
                                          queryClient.invalidateQueries({ queryKey: ['ipd'] });
                                        }
                                      } catch (err) {
                                        console.warn('Could not update queue status:', err);
                                      }
                                      if (onOpenConsultation && adm) {
                                        onOpenConsultation(adm);
                                      } else if (admId) {
                                        navigate(`/doctor/consultation/${admId}?type=ipd&mode=consultation`);
                                      } else if (onSelectAdmission && adm) {
                                        onSelectAdmission(adm);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer shrink-0"
                                    title="Open clinical consultation & prescription workspace"
                                  >
                                    <Stethoscope className="w-3.5 h-3.5 stroke-[2.2]" />
                                    <span>Consultation</span>
                                  </button>
                                );
                              })()
                            )}

                            {/* Discharge Button: Primary action on Reception Desk */}
                            {!isDoctorDesk && row.status !== 'Discharged' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onOpenDischarge && (row.raw || row)) {
                                    onOpenDischarge(row.raw || row);
                                  } else if (onSelectAdmission && (row.raw || row)) {
                                    onSelectAdmission(row.raw || row);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer shrink-0"
                                title="Discharge patient and release bed"
                              >
                                <LogOut className="w-3.5 h-3.5 stroke-[2.2]" />
                                <span>Discharge</span>
                              </button>
                            )}

                            {/* Eye Icon Button: IPD Daily Consultation & Prescription Details */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const targetAdm = row.raw ? { ...row.raw, ...row, raw: row.raw } : row;
                                if (onOpenDailyConsultation && targetAdm) {
                                  onOpenDailyConsultation(targetAdm);
                                } else if (onSelectAdmission && targetAdm) {
                                  onSelectAdmission(targetAdm);
                                }
                              }}
                              className="p-1.5 rounded-xl text-[#2F63F2] hover:bg-blue-50 border border-blue-200/60 shadow-2xs hover:shadow-xs transition-all cursor-pointer group shrink-0"
                              title="IPD Daily Consultation & Prescription Details"
                            >
                              <Eye className="w-4 h-4 stroke-[2.2] group-hover:scale-110 transition-transform text-[#2F63F2]" />
                            </button>

                            {/* Three Dot Menu Button */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleRowDropdown(row._id, e)}
                              className={`p-1.5 rounded-xl transition-all cursor-pointer border ${
                                activeDropdownId === row._id
                                  ? "bg-blue-50 text-[#2F63F2] border-blue-200 shadow-xs"
                                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-slate-200/60 shadow-2xs"
                              }`}
                              title="More options"
                            >
                              <MoreVertical className="w-4 h-4 stroke-[2]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Portal Dropdown Menu for IPD Queue Actions */}
          {activeDropdownId && dropdownPos && (() => {
            const row = displayQueueRecords.find(r => r._id === activeDropdownId);
            if (!row) return null;

            return createPortal(
              <>
                <div
                  className="fixed inset-0 z-[9998] cursor-default bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdownId(null);
                    setDropdownPos(null);
                  }}
                />
                <div
                  ref={dropdownMenuRef}
                  className="fixed z-[9999] w-52 bg-white rounded-xl shadow-2xl border border-slate-200/90 py-1.5 text-left font-sans animate-in fade-in zoom-in-95 duration-100"
                  style={{
                    ...(dropdownPos.top !== undefined ? { top: `${dropdownPos.top}px` } : {}),
                    ...(dropdownPos.bottom !== undefined ? { bottom: `${dropdownPos.bottom}px` } : {}),
                    right: `${dropdownPos.right}px`,
                    maxHeight: 'calc(100vh - 24px)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="py-0.5">
                    {/* 1. Discharge Summary (Doctor Desk only in 3-dot dropdown) */}
                    {isDoctorDesk && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDropdownId(null);
                          setDropdownPos(null);
                          if (onOpenDischarge && (row.raw || row)) {
                            onOpenDischarge(row.raw || row);
                          } else if (onSelectAdmission && (row.raw || row)) {
                            onSelectAdmission(row.raw || row);
                          }
                        }}
                        className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                      >
                        <ClipboardList className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                        <span>Discharge Summary</span>
                      </button>
                    )}

                    {/* Consultation Report (For Reception Desk of IPD Dashboard page) */}
                    {!isDoctorDesk && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDropdownId(null);
                          setDropdownPos(null);
                          const targetAdm = row.raw ? { ...row.raw, ...row, raw: row.raw } : row;
                          if (onOpenDailyConsultation && targetAdm) {
                            onOpenDailyConsultation(targetAdm);
                          }
                        }}
                        className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                      >
                        <Stethoscope className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                        <span>Consultation Report</span>
                      </button>
                    )}

                    {/* 2. Visit History */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setDropdownPos(null);
                        const targetAdm = row.raw ? { ...row.raw, ...row, raw: row.raw } : row;
                        if (onViewHistory && targetAdm) {
                          onViewHistory(targetAdm);
                        } else if (onOpenConsultation && targetAdm) {
                          onOpenConsultation(targetAdm);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                      <span>Visit History</span>
                    </button>

                    {/* 3. Admission Details */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setDropdownPos(null);
                        if (onSelectAdmission && (row.raw || row)) {
                          onSelectAdmission(row.raw || row);
                        } else if (onViewAllAdmissions) {
                          onViewAllAdmissions();
                        }
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                      <span>Admission Details</span>
                    </button>

                    {/* 4. Ward & Bed Allocation */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setDropdownPos(null);
                        handleNavigateWards();
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                    >
                      <Bed className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                      <span>Ward & Bed Allocation</span>
                    </button>

                    {/* 5. View All Inpatients */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDropdownId(null);
                        setDropdownPos(null);
                        if (onViewAllAdmissions) onViewAllAdmissions();
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] hover:bg-blue-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                    >
                      <Users className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                      <span>View All Inpatients</span>
                    </button>
                  </div>
                </div>
              </>,
              document.body
            );
          })()}

          {/* Pagination (when records exceed 1 page) */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
              <span className="text-xs font-semibold text-slate-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                {/* Previous Button (<) */}
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                  title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Single Small Box displaying current page */}
                <div className="w-7 h-7 rounded-lg text-xs font-bold bg-[#2F63F2] text-white flex items-center justify-center shadow-xs select-none">
                  {currentPage}
                </div>

                {/* Next Button (>) */}
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                  title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Quick Actions (Reception Desk only) */}
        {!isDoctorDesk && (
          <div className="lg:col-span-4">
            {/* Reception Desk: Quick Actions Card Container */}
            <div className="bg-white border border-[#E5E7EB] rounded-[22px] p-5 sm:p-6 shadow-xs space-y-4">
              {/* Header */}
              <div className="pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">
                  Quick Actions
                </h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">
                  Frequently used reception tasks and workflows.
                </p>
              </div>

              {/* Action List */}
              <div className="flex flex-col gap-3">
                {/* 1. Register Admission */}
                <button
                  type="button"
                  onClick={onRegisterAdmission}
                  className="w-full bg-[#F8FAFC] hover:bg-[#EEF4FF] border border-slate-200/80 hover:border-blue-200 rounded-2xl p-3.5 flex items-center justify-between transition-all group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-blue-100/80 text-[#1E3A8A] flex items-center justify-center shrink-0 shadow-xs">
                      <UserPlus className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-[#1E3A8A] transition-colors">
                        Register Admission
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        Register new IPD admission
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#1E3A8A] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>

                {/* 2. View Inpatients */}
                <button
                  type="button"
                  onClick={onViewAllAdmissions}
                  className="w-full bg-[#F8FAFC] hover:bg-[#EEF4FF] border border-slate-200/80 hover:border-blue-200 rounded-2xl p-3.5 flex items-center justify-between transition-all group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-blue-100/80 text-[#1E3A8A] flex items-center justify-center shrink-0 shadow-xs">
                      <Bed className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-[#1E3A8A] transition-colors">
                        View Inpatients
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        View currently admitted patients
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#1E3A8A] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>

                {/* 4. Manage Beds */}
                <button
                  type="button"
                  onClick={handleNavigateWards}
                  className="w-full bg-[#F8FAFC] hover:bg-[#EEF4FF] border border-slate-200/80 hover:border-blue-200 rounded-2xl p-3.5 flex items-center justify-between transition-all group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-blue-100/80 text-[#1E3A8A] flex items-center justify-center shrink-0 shadow-xs">
                      <LayoutGrid className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-[#1E3A8A] transition-colors">
                        Manage Beds
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        Check bed availability & allocation
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#1E3A8A] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IPDDepartmentDashboard;
