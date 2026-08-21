import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarCheck, Search, Clock, Stethoscope, 
  ChevronRight, ChevronDown, Calendar, AlertCircle, CheckCircle2, Phone, 
  FileText, Activity, RefreshCw, UserCheck, Filter, Download,
  MoreVertical, History, X, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../services/api';
import Card from '../components/Card';
import Button from '../components/Button';
import Table from '../components/Table';
import DatePicker from '../components/DatePicker';
import Modal from '../components/Modal';
import { formatTimeTo12Hr } from '../utils/timeFormat';
import { ROUTES } from '../constants/routes';

const DoctorFollowUps = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Tab & Filters state
  const [activeTab, setActiveTab] = useState('TODAY'); // 'TODAY' | 'UPCOMING' | 'ALL'
  const [searchQuery, setSearchQuery] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('MY_PATIENTS'); // 'MY_PATIENTS' | 'ALL' | doctorId
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Scheduled' | 'Completed' | 'Missed' | 'Cancelled'
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [groupByMode, setGroupByMode] = useState('NONE'); // 'NONE' | 'DAY' | 'WEEK' | 'MONTH'
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Modals
  const [selectedPatientForNotes, setSelectedPatientForNotes] = useState(null);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  // Fetch Consultations / Appointments with Follow-up schedules
  const { data: rawFollowUpsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['doctorFollowUps', activeTab, dateFilter, customStartDate, customEndDate],
    queryFn: async () => {
      try {
        const res = await api.get('/operations/consultations', {
          params: { followup: true, limit: 200 }
        });
        return res.data?.data || res.data || [];
      } catch (err) {
        // Fallback fetch appointments if consultations endpoint defaults
        const res = await api.get('/operations/appointments', {
          params: { type: 'Follow-up', limit: 200 }
        });
        return res.data?.data || res.data || [];
      }
    }
  });

  // Extract unique list of doctors for filter dropdown
  const doctorList = useMemo(() => {
    const list = Array.isArray(rawFollowUpsData) ? rawFollowUpsData : [];
    const map = new Map();
    list.forEach(item => {
      const doc = item.doctorId;
      if (doc && (doc._id || doc.id)) {
        const id = doc._id || doc.id;
        if (!map.has(id)) {
          map.set(id, doc.name || 'Unknown Doctor');
        }
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rawFollowUpsData]);

  // Master Filter & Processed Data
  const processedFollowUps = useMemo(() => {
    const list = Array.isArray(rawFollowUpsData) ? rawFollowUpsData : [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const monthEnd = new Date(today);
    monthEnd.setDate(monthEnd.getDate() + 30);
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    return list.filter(item => {
      const patient = item.patientId || {};
      const patientName = patient.name || item.patientName || '';
      const uhid = patient.uhid || item.uhid || '';
      const mobile = patient.mobileNumber || item.mobileNumber || '';

      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = patientName.toLowerCase().includes(q) || 
                        uhid.toLowerCase().includes(q) || 
                        mobile.includes(q);
        if (!matches) return false;
      }

      // 2. Doctor Filter
      if (doctorFilter !== 'ALL' && doctorFilter !== 'MY_PATIENTS') {
        const docId = item.doctorId?._id || item.doctorId?.id || item.doctorId;
        if (docId !== doctorFilter) return false;
      }

      // 3. Status Filter
      const computedStatus = item.status || (item.completedAt ? 'Completed' : 'Scheduled');
      if (statusFilter !== 'ALL') {
        if (computedStatus.toLowerCase() !== statusFilter.toLowerCase()) return false;
      }

      // 4. Primary Tabs (Today / Upcoming / All)
      const itemDateStr = item.followupDate 
        ? new Date(item.followupDate).toISOString().split('T')[0] 
        : item.date 
        ? new Date(item.date).toISOString().split('T')[0] 
        : todayStr;

      if (activeTab === 'TODAY') {
        if (itemDateStr !== todayStr) return false;
      } else if (activeTab === 'UPCOMING') {
        if (itemDateStr <= todayStr) return false;
      }

      // 5. Secondary Date Filter (Dropdown)
      if (dateFilter === 'TODAY') {
        if (itemDateStr !== todayStr) return false;
      } else if (dateFilter === 'TOMORROW') {
        if (itemDateStr !== tomorrowStr) return false;
      } else if (dateFilter === 'THIS_WEEK') {
        if (itemDateStr < todayStr || itemDateStr > weekEndStr) return false;
      } else if (dateFilter === 'THIS_MONTH') {
        if (itemDateStr < todayStr || itemDateStr > monthEndStr) return false;
      } else if (dateFilter === 'CUSTOM') {
        if (customStartDate && itemDateStr < customStartDate) return false;
        if (customEndDate && itemDateStr > customEndDate) return false;
      }

      return true;
    });
  }, [rawFollowUpsData, activeTab, searchQuery, doctorFilter, statusFilter, dateFilter, customStartDate, customEndDate]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const list = Array.isArray(rawFollowUpsData) ? rawFollowUpsData : [];
    const todayStr = new Date().toISOString().split('T')[0];

    let todayCount = 0;
    let upcomingCount = 0;

    list.forEach(item => {
      const d = item.followupDate 
        ? new Date(item.followupDate).toISOString().split('T')[0] 
        : item.date 
        ? new Date(item.date).toISOString().split('T')[0] 
        : todayStr;

      if (d === todayStr) todayCount++;
      else if (d > todayStr) upcomingCount++;
    });

    return { today: todayCount, upcoming: upcomingCount, all: list.length };
  }, [rawFollowUpsData]);

  // KPI Summary Counts (for processed data or today)
  const kpiStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayItems = (Array.isArray(rawFollowUpsData) ? rawFollowUpsData : []).filter(item => {
      const d = item.followupDate 
        ? new Date(item.followupDate).toISOString().split('T')[0] 
        : item.date 
        ? new Date(item.date).toISOString().split('T')[0] 
        : todayStr;
      return d === todayStr;
    });

    let completed = 0;
    let pending = 0;

    todayItems.forEach(item => {
      const st = (item.status || '').toLowerCase();
      if (st === 'completed') completed++;
      else pending++;
    });

    return {
      todayTotal: todayItems.length,
      completed,
      pending
    };
  }, [rawFollowUpsData]);

  // Helper to convert time string (e.g., "10:30 AM", "09:00", "14:15") to minutes for sorting
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const str = String(timeStr).trim().toUpperCase();
    const isPM = str.includes('PM');
    const isAM = str.includes('AM');
    const cleanStr = str.replace(/(AM|PM)/g, '').trim();
    const parts = cleanStr.split(':');
    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  // Grouped Records (if Group By is enabled: DATE / WEEK / MONTH)
  const groupedFollowUps = useMemo(() => {
    if (groupByMode === 'NONE') {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTime = yesterday.getTime();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTime = tomorrow.getTime();

    const groupsMap = {};

    processedFollowUps.forEach(item => {
      const dateObj = item.followupDate ? new Date(item.followupDate) : (item.date ? new Date(item.date) : new Date());
      const itemDateOnly = new Date(dateObj);
      itemDateOnly.setHours(0, 0, 0, 0);
      const itemDateTime = itemDateOnly.getTime();

      let groupKey = 'OTHER';
      let sortOrderKey = itemDateTime;

      if (groupByMode === 'DATE' || groupByMode === 'DAY') {
        if (itemDateTime === todayTime) {
          groupKey = 'Today';
        } else if (itemDateTime === tomorrowTime) {
          groupKey = 'Tomorrow';
        } else if (itemDateTime === yesterdayTime) {
          groupKey = 'Yesterday';
        } else {
          groupKey = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
        }
      } else if (groupByMode === 'WEEK') {
        const diffDays = Math.round((itemDateTime - todayTime) / 86400000);
        if (diffDays >= 0 && diffDays <= 7) {
          groupKey = 'This Week';
          sortOrderKey = 1;
        } else if (diffDays > 7 && diffDays <= 14) {
          groupKey = 'Next Week';
          sortOrderKey = 2;
        } else if (diffDays < 0) {
          groupKey = 'Past Weeks';
          sortOrderKey = 0;
        } else {
          groupKey = 'Future Weeks';
          sortOrderKey = 3;
        }
      } else if (groupByMode === 'MONTH') {
        groupKey = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        sortOrderKey = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getTime();
      }

      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = {
          key: groupKey,
          sortOrderKey,
          items: []
        };
      }
      groupsMap[groupKey].items.push(item);
    });

    // Convert map to sorted array of groups and sort patients inside each group by Follow-up Time Ascending
    const resultGroups = Object.values(groupsMap).map(g => {
      // Sort patients inside group by time ascending (e.g. 08:30 AM -> 09:00 AM -> 10:00 AM)
      const sortedItems = [...g.items].sort((a, b) => {
        const timeA = a.time || a.slotTime || '09:00 AM';
        const timeB = b.time || b.slotTime || '09:00 AM';
        return parseTimeToMinutes(timeA) - parseTimeToMinutes(timeB);
      });

      return {
        ...g,
        items: sortedItems
      };
    });

    // Sort groups chronological
    return resultGroups.sort((a, b) => a.sortOrderKey - b.sortOrderKey);
  }, [processedFollowUps, groupByMode]);

  // Handlers
  const handleStartConsultation = (record) => {
    const visitId = record._id || record.appointmentId || record.consultationId;
    navigate(`/doctor/consultation/${visitId}`);
  };

  const handleViewNotes = (record) => {
    setSelectedPatientForNotes(record);
    setIsNotesModalOpen(true);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setDoctorFilter('MY_PATIENTS');
    setStatusFilter('ALL');
    setDateFilter('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
    setGroupByMode('NONE');
  };

  const toggleGroupCollapse = (key) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Status Badge Renderer
  const renderStatusBadge = (status) => {
    const st = (status || 'Scheduled').toUpperCase();
    let style = 'bg-emerald-50 text-emerald-700 border-emerald-200';

    if (st === 'COMPLETED') {
      style = 'bg-blue-50 text-[#3563F6] border-blue-200';
    } else if (st === 'MISSED') {
      style = 'bg-rose-50 text-rose-700 border-rose-200';
    } else if (st === 'CANCELLED') {
      style = 'bg-slate-100 text-slate-600 border-slate-200';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style}`}>
        {st}
      </span>
    );
  };

  // Enterprise Table Column Definitions
  const tableHeaders = [
    {
      key: 'patient',
      label: 'Patient',
      render: (row) => {
        const patient = row.patientId || {};
        const name = patient.name || row.patientName || 'Unknown Patient';
        const gender = patient.gender || row.gender || 'N/A';
        const age = patient.age || row.age || 'N/A';
        const initials = name.substring(0, 2).toUpperCase();

        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-[#3563F6] font-extrabold text-xs flex items-center justify-center border border-blue-100 shrink-0">
              {initials}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-xs">{name}</div>
              <div className="text-[10px] text-slate-500 font-medium">{gender} • {age} Yrs</div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'uhid',
      label: 'UHID',
      render: (row) => (
        <span className="font-mono font-bold text-xs text-slate-700">
          {row.patientId?.uhid || row.uhid || 'N/A'}
        </span>
      )
    },
    {
      key: 'doctor',
      label: 'Doctor',
      render: (row) => (
        <div className="text-xs font-semibold text-slate-800">
          {row.doctorId?.name || 'Dr. Assigned'}
        </div>
      )
    },
    {
      key: 'followupDate',
      label: 'Follow-up Date',
      render: (row) => {
        const dateVal = row.followupDate || row.date;
        if (!dateVal) return <span className="font-mono text-xs text-slate-400">N/A</span>;
        
        let dStr = 'N/A';
        try {
          const dateObj = new Date(dateVal);
          if (!isNaN(dateObj.getTime())) {
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            dStr = `${day}/${month}/${year}`;
          } else {
            dStr = String(dateVal).split('T')[0];
          }
        } catch {
          dStr = String(dateVal);
        }
        return <span className="font-mono text-xs text-slate-800 font-bold">{dStr}</span>;
      }
    },
    {
      key: 'followupTime',
      label: 'Follow-up Time',
      render: (row) => {
        const t = row.time || row.slotTime || '10:00 AM';
        return <span className="font-mono text-xs text-slate-600">{t}</span>;
      }
    },
    {
      key: 'recommendation',
      label: 'Recommendation',
      render: (row) => {
        const rec = row.followupReason || row.clinicalNotes || row.diagnosis || 'Post-consultation follow-up review';
        return (
          <div className="text-xs text-slate-700 max-w-[220px] truncate" title={rec}>
            {rec}
          </div>
        );
      }
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => renderStatusBadge(row.status || (row.completedAt ? 'Completed' : 'Scheduled'))
    }
  ];

  // Table Action Buttons Configuration
  const tableActions = [
    {
      label: 'View Notes',
      icon: FileText,
      onClick: (row) => handleViewNotes(row)
    },
    {
      label: 'Consult',
      icon: Stethoscope,
      onClick: (row) => handleStartConsultation(row)
    }
  ];

  // Render Mobile Card Item Component
  const renderMobileCard = (item) => {
    const patient = item.patientId || {};
    const patientName = patient.name || item.patientName || 'Unknown Patient';
    const uhid = patient.uhid || item.uhid || 'N/A';
    const age = patient.age || item.age || 'N/A';
    const gender = patient.gender || item.gender || 'N/A';
    const followDate = item.followupDate ? new Date(item.followupDate).toLocaleDateString() : (item.date || 'Today');
    const doctorName = item.doctorId?.name || 'Dr. Assigned';
    const recommendation = item.followupReason || item.clinicalNotes || item.diagnosis || 'Post-consultation follow-up review';
    const status = item.status || (item.completedAt ? 'Completed' : 'Scheduled');

    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 text-left font-sans">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-50 text-[#3563F6] flex items-center justify-center font-extrabold text-xs border border-blue-100 shrink-0">
              {patientName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-xs leading-tight">{patientName}</h4>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">UHID: {uhid} • {gender} / {age} Yrs</p>
            </div>
          </div>
          {renderStatusBadge(status)}
        </div>

        <div className="space-y-1.5 text-xs text-slate-700">
          <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-100">
            <span className="font-medium text-slate-500">Doctor:</span>
            <span className="font-bold text-slate-800">{doctorName}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-100">
            <span className="font-medium text-slate-500">Date:</span>
            <span className="font-bold font-mono text-slate-800">{followDate}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50/40 border border-blue-100/60 text-[11px] space-y-0.5">
            <span className="font-bold text-[#3563F6] uppercase text-[9px] block">Recommendation</span>
            <p className="font-medium text-slate-700 line-clamp-2">{recommendation}</p>
          </div>
        </div>

        <div className="pt-2 flex items-center gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={() => handleViewNotes(item)} className="flex-1 text-xs py-1.5 h-[36px] border-slate-200">
            View Notes
          </Button>
          <Button variant="primary" icon={Stethoscope} onClick={() => handleStartConsultation(item)} className="flex-1 text-xs py-1.5 h-[36px] bg-[#3563F6]">
            Consult
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-left font-sans max-w-7xl mx-auto pb-16">
      {/* --------------------------------------------------- */}
      {/* PAGE HEADER */}
      {/* --------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#3563F6] uppercase tracking-wider mb-1">
            <CalendarCheck className="w-4 h-4" />
            Doctor Workspace
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            Follow-up Patients Schedule
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitor, review, and consult scheduled follow-up visits and post-treatment patient progress.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button 
            variant="secondary" 
            icon={RefreshCw} 
            onClick={() => refetch()}
            className="text-xs font-bold uppercase tracking-wider h-[42px] px-4"
          >
            Refresh
          </Button>
          <Button 
            variant="primary" 
            icon={Stethoscope} 
            onClick={() => navigate(ROUTES.DOCTOR.CONSULTATION)}
            className="text-xs font-bold uppercase tracking-wider h-[42px] px-5 bg-[#3563F6]"
          >
            Open Consultation
          </Button>
        </div>
      </div>

      {/* --------------------------------------------------- */}
      {/* COMPACT KPI SUMMARY CARDS */}
      {/* --------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs border-l-4 border-l-blue-500 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Today's Follow-ups</span>
            <span className="text-2xl font-black font-mono text-slate-900 mt-0.5 block">{kpiStats.todayTotal}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3563F6] flex items-center justify-center font-bold">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs border-l-4 border-l-emerald-500 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Completed</span>
            <span className="text-2xl font-black font-mono text-emerald-600 mt-0.5 block">{kpiStats.completed}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs border-l-4 border-l-amber-500 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Pending</span>
            <span className="text-2xl font-black font-mono text-amber-600 mt-0.5 block">{kpiStats.pending}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- */}
      {/* TOP FILTER TOOLBAR */}
      {/* --------------------------------------------------- */}
      <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs space-y-4">
        
        {/* Row 1: Primary Tabs & Export */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'TODAY', label: "Today's Follow-ups", count: tabCounts.today, color: 'text-[#3563F6] bg-blue-50/80 border-[#3563F6]' },
              { id: 'UPCOMING', label: 'Upcoming', count: tabCounts.upcoming, color: 'text-emerald-700 bg-emerald-50/80 border-emerald-300' },
              { id: 'ALL', label: 'All Records', count: tabCounts.all, color: 'text-slate-700 bg-slate-100 border-slate-300' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                  activeTab === tab.id
                    ? `${tab.color} shadow-2xs`
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black ${
                  activeTab === tab.id ? 'bg-white/90' : 'bg-slate-100 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            icon={Download}
            onClick={() => toast('Export feature ready for backend integration')}
            className="text-xs font-bold uppercase tracking-wider h-9 px-3.5 self-end sm:self-auto"
          >
            Export
          </Button>
        </div>

        {/* Row 2: Search & Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-center">
          
          {/* 1. Realtime Search */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Name, UHID, Mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] font-medium"
            />
          </div>

          {/* 2. Doctor Filter */}
          <div>
            <select
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#3563F6] cursor-pointer"
            >
              <option value="MY_PATIENTS">My Patients</option>
              <option value="ALL">All Doctors</option>
              {doctorList.map(doc => (
                <option key={doc.id} value={doc.id}>{doc.name}</option>
              ))}
            </select>
          </div>

          {/* 3. Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#3563F6] cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Missed">Missed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* 4. Date Filter Dropdown */}
          <div>
            <select
              value={dateFilter}
              onChange={(e) => {
                const val = e.target.value;
                setDateFilter(val);
                if (val === 'CUSTOM') {
                  setGroupByMode('DATE');
                }
              }}
              className="w-full py-2 px-3 text-xs border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#3563F6] cursor-pointer"
            >
              <option value="ALL">All Dates</option>
              <option value="TODAY">Today</option>
              <option value="TOMORROW">Tomorrow</option>
              <option value="THIS_WEEK">This Week</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="CUSTOM">Custom Range</option>
            </select>
          </div>

          {/* 5. Group By Filter */}
          <div>
            <select
              value={groupByMode}
              onChange={(e) => setGroupByMode(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#3563F6] cursor-pointer"
            >
              <option value="NONE">Group By: None</option>
              <option value="DATE">Group By: Date</option>
              <option value="WEEK">Group By: Week</option>
              <option value="MONTH">Group By: Month</option>
            </select>
          </div>

        </div>

        {/* Optional Custom Date Range Inputs */}
        {dateFilter === 'CUSTOM' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <div className="w-48">
              <DatePicker 
                value={customStartDate} 
                onChange={(val) => {
                  setCustomStartDate(val);
                  if (val) setGroupByMode('DATE');
                }} 
                placeholder="Start Date" 
              />
            </div>
            <span className="text-xs text-slate-400 font-bold">to</span>
            <div className="w-48">
              <DatePicker value={customEndDate} onChange={setCustomEndDate} placeholder="End Date" />
            </div>
          </div>
        )}

      </div>

      {/* --------------------------------------------------- */}
      {/* WORKLIST DISPLAY (TABLE / GROUPED TABLE / MOBILE CARDS) */}
      {/* --------------------------------------------------- */}
      {isLoading ? (
        <Card className="p-12 text-center text-slate-400 font-medium">
          Loading follow-up worklist records...
        </Card>
      ) : isError ? (
        <Card className="p-8 text-center space-y-3 bg-rose-50/50 border-rose-200">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-rose-900">Failed to load follow-up records</h3>
          <Button variant="secondary" onClick={() => refetch()} className="text-xs px-4">
            Retry
          </Button>
        </Card>
      ) : processedFollowUps.length === 0 ? (
        <Card className="p-12 text-center space-y-3 bg-slate-50/50 border-dashed border-2 border-slate-200 rounded-2xl">
          <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">No Follow-up Records Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {activeTab === 'TODAY' 
              ? 'No follow-ups scheduled today.' 
              : 'No records match your selected filters.'}
          </p>
          <div className="pt-2">
            <Button variant="secondary" onClick={handleClearFilters} className="text-xs px-4">
              Clear Filters
            </Button>
          </div>
        </Card>
      ) : groupedFollowUps ? (
        /* GROUP BY COLLAPSIBLE TIMELINE TABLES */
        <div className="space-y-6">
          {groupedFollowUps.map((group) => {
            const groupKey = group.key;
            const groupItems = group.items;
            const isCollapsed = collapsedGroups[groupKey];

            return (
              <div key={groupKey} className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
                {/* Sticky Section Header */}
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse(groupKey)}
                  className="sticky top-0 z-10 w-full px-5 py-3.5 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between font-extrabold text-xs text-slate-900 tracking-wide cursor-pointer hover:bg-slate-100/90 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <ChevronDown className={`w-4 h-4 text-[#3563F6] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                    <Calendar className="w-4 h-4 text-[#3563F6]" />
                    <span className="text-sm font-extrabold text-slate-900">{groupKey}</span>
                  </div>
                  <span className="bg-blue-50 text-[#3563F6] border border-blue-200/60 px-3 py-0.5 rounded-full text-[11px] font-mono font-extrabold">
                    {groupItems.length} {groupItems.length === 1 ? 'Patient' : 'Patients'}
                  </span>
                </button>

                {!isCollapsed && (
                  <Table
                    headers={tableHeaders}
                    data={groupItems}
                    actions={tableActions}
                    inlineActions={true}
                    itemsPerPage={10}
                    renderMobileCard={renderMobileCard}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* STANDARD UNGROUPED TABLE VIEW */
        <Table
          headers={tableHeaders}
          data={processedFollowUps}
          actions={tableActions}
          inlineActions={true}
          itemsPerPage={10}
          renderMobileCard={renderMobileCard}
        />
      )}

      {/* --------------------------------------------------- */}
      {/* VIEW NOTES MODAL */}
      {/* --------------------------------------------------- */}
      <Modal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        title="CLINICAL FOLLOW-UP DETAILS"
        maxWidth="max-w-[550px]"
      >
        {selectedPatientForNotes && (
          <div className="space-y-4 text-left font-sans text-xs">
            <div className="p-4 bg-slate-900 text-white rounded-xl space-y-1">
              <h3 className="font-extrabold text-sm text-white">
                {selectedPatientForNotes.patientId?.name || selectedPatientForNotes.patientName || 'Patient'}
              </h3>
              <p className="text-xs text-slate-300 font-mono">
                UHID: {selectedPatientForNotes.patientId?.uhid || selectedPatientForNotes.uhid || 'N/A'} • Mobile: {selectedPatientForNotes.patientId?.mobileNumber || selectedPatientForNotes.mobileNumber || 'N/A'}
              </p>
            </div>

            <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Primary Diagnosis</span>
                <span className="font-extrabold text-slate-800 text-sm">
                  {selectedPatientForNotes.primaryDiagnosis || selectedPatientForNotes.diagnosis || 'General Clinical Follow-up'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Follow-up Reason & Notes</span>
                <p className="text-slate-700 leading-relaxed font-medium bg-white p-3 rounded-lg border border-slate-200">
                  {selectedPatientForNotes.followupReason || selectedPatientForNotes.clinicalNotes || 'Regular progress evaluation and medicine dosage review.'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <Button variant="secondary" onClick={() => setIsNotesModalOpen(false)} className="text-xs px-5">
                Close
              </Button>
              <Button 
                variant="primary" 
                icon={Stethoscope} 
                onClick={() => {
                  setIsNotesModalOpen(false);
                  handleStartConsultation(selectedPatientForNotes);
                }} 
                className="text-xs px-6 bg-[#3563F6]"
              >
                Start Consultation
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DoctorFollowUps;
