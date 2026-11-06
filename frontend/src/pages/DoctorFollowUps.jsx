import React, { useState, useMemo, useCallback } from 'react';
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
import ConsultationRecordModal from '../components/ConsultationRecordModal';
import { formatTimeTo12Hr } from '../utils/timeFormat';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../context/AuthContext';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';

// Robust Local Date (YYYY-MM-DD) helper resilient to timezone offsets
const getLocalDateString = (val) => {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.includes('T00:00:00')) {
      return trimmed.split('T')[0];
    }
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Resolves the patient's intended follow-up date or scheduled appointment date
const getItemDateString = (item) => {
  if (!item) return '';
  if (item.followupDate) return getLocalDateString(item.followupDate);
  if (item.appointmentDate) return getLocalDateString(item.appointmentDate);
  if (item.date) return getLocalDateString(item.date);
  if (item.appointmentId?.date) return getLocalDateString(item.appointmentId.date);
  return '';
};

const DoctorFollowUps = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Tab & Filters state
  const [activeTab, setActiveTab] = useState('TODAY'); // 'TODAY' | 'UPCOMING' | 'ALL'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Scheduled' | 'Completed' | 'Missed' | 'Cancelled'
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [groupByMode, setGroupByMode] = useState('NONE'); // 'NONE' | 'DAY' | 'WEEK' | 'MONTH'
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Modals
  const [selectedPatientForNotes, setSelectedPatientForNotes] = useState(null);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [selectedConsultationRecord, setSelectedConsultationRecord] = useState(null);
  const [isConsultationRecordOpen, setIsConsultationRecordOpen] = useState(false);
  const [advanceAlertRecord, setAdvanceAlertRecord] = useState(null);
  const [isStartingConsultation, setIsStartingConsultation] = useState(false);

  // Fetch Consultations / Appointments with Follow-up schedules
  const { data: rawFollowUpsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['doctorFollowUps', user?._id, activeTab, dateFilter, customStartDate, customEndDate],
    queryFn: async () => {
      try {
        const [consultRes, appRes] = await Promise.all([
          api.get('/operations/consultations', {
            params: { followup: true, limit: 200, doctorId: user?._id }
          }).catch(() => ({ data: { data: [] } })),
          api.get('/operations/appointments', {
            params: { doctorId: user?._id, limit: 200 }
          }).catch(() => ({ data: { data: [] } }))
        ]);

        const consultList = consultRes.data?.data || consultRes.data || [];
        const appList = appRes.data?.data || appRes.data || [];

        // Build quick lookup for appointments by patient and scheduled date
        const appMap = new Map();
        appList.forEach(app => {
          const pId = String(app.patientId?._id || app.patientId || '');
          const dStr = getItemDateString(app);
          if (pId && dStr) {
            appMap.set(`${pId}_${dStr}`, app);
          }
        });

        const seenKeys = new Set();
        const merged = [];

        consultList.forEach(item => {
          const pId = String(item.patientId?._id || item.patientId || '');
          const dStr = getItemDateString(item);
          const key = `${pId}_${dStr}`;
          seenKeys.add(key);
          if (item._id) seenKeys.add(String(item._id));
          if (item.appointmentId?._id) seenKeys.add(String(item.appointmentId._id));

          // Link matched scheduled appointment on that target follow-up date if one exists
          const matchedApp = appMap.get(key);
          merged.push({
            ...item,
            scheduledAppointment: matchedApp || null,
            tokenNumber: matchedApp?.tokenNumber || item.tokenNumber || '',
            appointmentSlot: matchedApp?.appointmentSlot || matchedApp?.slotTime || item.appointmentSlot || item.followupTime || ''
          });
        });

        const todayStr = getLocalDateString(new Date());

        appList.forEach(app => {
          // Strictly only include genuine follow-up or scheduled appointments
          const cType = String(app.consultationType || '').toLowerCase();
          const isFollowupType = cType === 'follow-up' || cType === 'followup' || app.isFollowup || app.isFollowUp || Boolean(app.followupDate) || Boolean(app.followUpAppointmentId);
          const isScheduledType = cType === 'appointment' || (app.bookingSource === 'DOCTOR' && isFollowupType) || String(app.status || '').toLowerCase() === 'scheduled' || String(app.queueStatus || '').toLowerCase() === 'scheduled' || String(app.workflow?.queueState || '').toUpperCase() === 'SCHEDULED';

          // Exclude regular walk-in OPD tokens (Walk-In, General Consultation, Emergency) that are not genuine scheduled follow-ups
          if (cType === 'walk-in' || cType === 'emergency' || (!isFollowupType && !isScheduledType)) {
            return;
          }

          const pId = String(app.patientId?._id || app.patientId || '');
          const dStr = getItemDateString(app);
          const key = `${pId}_${dStr}`;
          const appId = String(app._id);

          if (!seenKeys.has(key) && !seenKeys.has(appId)) {
            seenKeys.add(key);
            seenKeys.add(appId);
            merged.push({
              _id: app._id,
              appointmentId: app,
              patientId: app.patientId,
              doctorId: app.doctorId,
              followupDate: app.date,
              date: app.date,
              followupTime: app.time || app.slotTime || '10:00 AM',
              time: app.time || app.slotTime || '10:00 AM',
              slotTime: app.time || app.slotTime || '10:00 AM',
              tokenNumber: app.tokenNumber || '',
              status: app.status,
              queueStatus: app.queueStatus,
              followupStatus: app.status,
              consultationType: app.consultationType || 'Appointment',
              bookingSource: app.bookingSource || 'RECEPTION',
              workflow: app.workflow,
              createdAt: app.createdAt
            });
          }
        });

        return merged;
      } catch (err) {
        return [];
      }
    }
  });

  // Robust Follow-up Status Evaluator:
  // Strictly distinguishes between past completed consultations, active in-consultation, and scheduled follow-ups.
  const getFollowUpStatus = useCallback((item) => {
    if (!item) return 'Scheduled';
    const todayStr = getLocalDateString(new Date());
    const itemDateStr = getItemDateString(item) || todayStr;

    // Check if the linked appointment is for the target date or if it's the previous visit
    const isLinkedApptForTargetDate = item.scheduledAppointment 
      ? true 
      : Boolean(item.appointmentId?.date && getItemDateString(item.appointmentId) === itemDateStr);

    const targetAppt = item.scheduledAppointment || (isLinkedApptForTargetDate ? item.appointmentId : null);

    const rawStatus = (
      item.followupStatus || 
      item.status || 
      targetAppt?.status || 
      targetAppt?.queueStatus || 
      ''
    ).toLowerCase();

    const wfQueueState = (targetAppt?.workflow?.queueState || (!item.followupDate ? item.workflow?.queueState : '') || '').toUpperCase();
    const wfConsultState = (targetAppt?.workflow?.consultationState || (!item.followupDate ? item.workflow?.consultationState : '') || '').toUpperCase();
    const pharmacyStatus = (targetAppt?.pharmacyStatus || (!item.followupDate ? item.pharmacyStatus : '') || '').toUpperCase();

    // Priority 1: Future follow-up or future scheduled appointments (date > today)
    if (itemDateStr > todayStr) {
      if (item.followupCompleted === true || (item.followupStatus && item.followupStatus.toLowerCase() === 'completed')) {
        return 'Completed';
      }
      return 'Scheduled';
    }

    // Priority 2: If consulted / completed / prescription sent to pharmacy today or in the past
    const isCompleted =
      rawStatus === 'completed' || 
      rawStatus === 'consulted' || 
      rawStatus === 'sent to pharmacy' || 
      rawStatus === 'sent_to_pharmacy' ||
      item.followupCompleted || 
      item.isCompletedToday || 
      item.followupStatus === 'Completed' ||
      wfConsultState === 'COMPLETED' || 
      wfQueueState === 'COMPLETED' ||
      wfQueueState === 'SENT_TO_PHARMACY' ||
      pharmacyStatus === 'SENT' ||
      pharmacyStatus === 'DISPENSED' ||
      Boolean(targetAppt?.sentToPharmacyAt) ||
      Boolean(targetAppt?.completedByDoctorId);

    if (isCompleted) {
      return 'Completed';
    }

    // Priority 3: In Consultation (Active in consultation right now)
    const isInConsultation =
      item.isInConsultation ||
      rawStatus === 'in consultation' ||
      rawStatus === 'in-consultation' ||
      rawStatus === 'in progress' ||
      wfQueueState === 'IN_CONSULTATION' ||
      wfConsultState === 'STARTED';

    if (isInConsultation) {
      return 'In Consultation';
    }
    if (rawStatus === 'cancelled' || wfQueueState === 'CANCELLED') return 'Cancelled';

    // Priority 4: Follow-up scheduled for today:
    if (itemDateStr === todayStr) {
      return 'Scheduled';
    }

    // Priority 5: Past date without consultation:
    return 'Missed';
  }, []);

  // Master Filter & Processed Data
  const processedFollowUps = useMemo(() => {
    let list = Array.isArray(rawFollowUpsData) ? rawFollowUpsData : [];
    if (user?._id) {
      list = list.filter(item => {
        const docId = item.doctorId?._id || item.doctorId;
        return Boolean(docId && String(docId) === String(user._id));
      });
    }
    const today = new Date();
    const todayStr = getLocalDateString(today);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = getLocalDateString(weekEnd);

    const monthEnd = new Date(today);
    monthEnd.setDate(monthEnd.getDate() + 30);
    const monthEndStr = getLocalDateString(monthEnd);

    const filtered = list.filter(item => {
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

      // 2. Status Filter
      const computedStatus = getFollowUpStatus(item);
      const isStatusInConsult = computedStatus.toLowerCase() === 'in consultation';

      if (statusFilter !== 'ALL') {
        if (computedStatus.toLowerCase() !== statusFilter.toLowerCase()) return false;
      }

      // 3. Primary Tabs (Today / Upcoming / All)
      const itemDateStr = getItemDateString(item);

      if (activeTab === 'TODAY') {
        // Place ONLY if the follow-up or scheduled patient's date is TODAY
        if (!itemDateStr || itemDateStr !== todayStr) return false;
      } else if (activeTab === 'UPCOMING') {
        // Patients currently in consultation must NEVER appear in Upcoming!
        if (isStatusInConsult) return false;
        // Must be in the future, and if already completed, do NOT show in Upcoming!
        if (!itemDateStr || itemDateStr <= todayStr) return false;
        if (computedStatus.toLowerCase() === 'completed') return false;
      }
      // 'ALL' tab shows all records (Completed, Scheduled, In Consultation, Missed, etc.)

      // 4. Secondary Date Filter (Dropdown)
      if (dateFilter === 'TODAY') {
        if (!itemDateStr || itemDateStr !== todayStr) return false;
      } else if (dateFilter === 'TOMORROW') {
        if (!itemDateStr || itemDateStr !== tomorrowStr) return false;
      } else if (dateFilter === 'THIS_WEEK') {
        if (!itemDateStr || itemDateStr < todayStr || itemDateStr > weekEndStr) return false;
      } else if (dateFilter === 'THIS_MONTH') {
        if (!itemDateStr || itemDateStr < todayStr || itemDateStr > monthEndStr) return false;
      } else if (dateFilter === 'CUSTOM') {
        if (customStartDate && (!itemDateStr || itemDateStr < customStartDate)) return false;
        if (customEndDate && (!itemDateStr || itemDateStr > customEndDate)) return false;
      }

      return true;
    });

    // Deduplicate: If multiple records exist for the same patient and follow-up date, prefer Completed or latest record
    const patientDateMap = new Map();
    filtered.forEach(item => {
      const pId = String(item.patientId?._id || item.patientId?.uhid || item.patientId || item.uhid || item.patientName || '');
      const dStr = getItemDateString(item) || 'date';
      const key = `${pId}_${dStr}`;
      const existing = patientDateMap.get(key);
      if (!existing) {
        patientDateMap.set(key, item);
      } else {
        const existSt = getFollowUpStatus(existing).toLowerCase();
        const itemSt = getFollowUpStatus(item).toLowerCase();
        if (existSt !== 'completed' && itemSt === 'completed') {
          patientDateMap.set(key, item);
        } else if (existSt !== 'in consultation' && itemSt === 'in consultation') {
          patientDateMap.set(key, item);
        }
      }
    });

    const deduplicated = Array.from(patientDateMap.values());

    // Sort: in consultation first, then upcoming (nearest date first), then today, then past (newest first)
    deduplicated.sort((a, b) => {
      const aDateStr = getItemDateString(a) || '9999-12-31';
      const bDateStr = getItemDateString(b) || '9999-12-31';
      const aStatus = getFollowUpStatus(a).toLowerCase();
      const bStatus = getFollowUpStatus(b).toLowerCase();

      // Priority: In Consultation (-1) > Scheduled/Pending (0) > Missed (1) > Completed (2) > Cancelled (3)
      const statusPriority = { 'in consultation': -1, scheduled: 0, missed: 1, completed: 2, cancelled: 3 };
      const aPri = statusPriority[aStatus] ?? 1;
      const bPri = statusPriority[bStatus] ?? 1;
      if (aPri !== bPri) return aPri - bPri;

      // Within same priority: upcoming dates ascending (soonest first),
      // past dates descending (most recent first)
      const aIsUpcoming = aDateStr >= todayStr;
      const bIsUpcoming = bDateStr >= todayStr;
      if (aIsUpcoming && bIsUpcoming) return aDateStr.localeCompare(bDateStr); // nearest upcoming first
      if (!aIsUpcoming && !bIsUpcoming) return bDateStr.localeCompare(aDateStr); // newest past first
      if (aIsUpcoming) return -1; // upcoming before past
      return 1;
    });

    return deduplicated;
  }, [rawFollowUpsData, user?._id, activeTab, searchQuery, statusFilter, dateFilter, customStartDate, customEndDate, getFollowUpStatus]);

  // Tab counts
  const tabCounts = useMemo(() => {
    let list = Array.isArray(rawFollowUpsData) ? rawFollowUpsData : [];
    if (user?._id) {
      list = list.filter(item => {
        const docId = item.doctorId?._id || item.doctorId;
        return Boolean(docId && String(docId) === String(user._id));
      });
    }

    const patientDateMap = new Map();
    list.forEach(item => {
      const pId = String(item.patientId?._id || item.patientId?.uhid || item.patientId || item.uhid || item.patientName || '');
      const dStr = getItemDateString(item) || 'date';
      const key = `${pId}_${dStr}`;
      const existing = patientDateMap.get(key);
      if (!existing) {
        patientDateMap.set(key, item);
      } else {
        const existSt = getFollowUpStatus(existing).toLowerCase();
        const itemSt = getFollowUpStatus(item).toLowerCase();
        if (existSt !== 'completed' && itemSt === 'completed') {
          patientDateMap.set(key, item);
        } else if (existSt !== 'in consultation' && itemSt === 'in consultation') {
          patientDateMap.set(key, item);
        }
      }
    });
    const uniqueList = Array.from(patientDateMap.values());

    const todayStr = getLocalDateString(new Date());

    let todayCount = 0;
    let upcomingCount = 0;

    uniqueList.forEach(item => {
      const d = getItemDateString(item);
      const st = getFollowUpStatus(item);

      if (d === todayStr) {
        todayCount++;
      } else if (d > todayStr && st.toLowerCase() !== 'completed' && st.toLowerCase() !== 'cancelled') {
        upcomingCount++;
      }
    });

    return { today: todayCount, upcoming: upcomingCount, all: uniqueList.length };
  }, [rawFollowUpsData, user?._id, getFollowUpStatus]);

  // KPI Summary Counts (for processed data or today)
  const kpiStats = useMemo(() => {
    let list = Array.isArray(rawFollowUpsData) ? rawFollowUpsData : [];
    if (user?._id) {
      list = list.filter(item => {
        const docId = item.doctorId?._id || item.doctorId;
        return Boolean(docId && String(docId) === String(user._id));
      });
    }
    const todayStr = getLocalDateString(new Date());
    const todayItems = list.filter(item => {
      const d = getItemDateString(item);
      return d === todayStr;
    });

    let completed = 0;
    let pending = 0;

    todayItems.forEach(item => {
      const st = getFollowUpStatus(item).toLowerCase();
      if (st === 'completed') completed++;
      else pending++;
    });

    return {
      todayTotal: todayItems.length,
      completed,
      pending
    };
  }, [rawFollowUpsData, user?._id, getFollowUpStatus]);

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

  // Robust Date formatter for follow-up patients (e.g., "25 Oct 2026")
  const formatFollowupDate = (dateVal) => {
    if (!dateVal) return 'N/A';
    try {
      const dateStr = getLocalDateString(dateVal);
      if (dateStr) {
        const [y, m, d] = dateStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = parseInt(m, 10) - 1;
        return `${d} ${monthNames[mIdx] || m} ${y}`;
      }
    } catch (err) {}
    return String(dateVal);
  };

  // Robust Time formatter for follow-up patients (fetches exact time e.g. "10:00 AM")
  const formatFollowupTime = (timeVal, item) => {
    const rawTime = timeVal || 
                    item?.followupTime || 
                    item?.time || 
                    item?.slotTime || 
                    item?.appointmentId?.time || 
                    item?.appointmentId?.slotTime;

    if (rawTime && typeof rawTime === 'string' && rawTime.trim()) {
      return formatTimeTo12Hr(rawTime.trim());
    }

    // Check if date or followupDate contains a specific non-midnight time
    const dateVal = item?.date || item?.followupDate;
    if (dateVal) {
      try {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          const h = d.getHours();
          const m = d.getMinutes();
          if (h !== 0 || m !== 0) {
            return formatTimeTo12Hr(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
          }
        }
      } catch {}
    }

    return '10:00 AM';
  };

  // Grouped Records (if Group By is enabled: DATE / WEEK / MONTH)
  const groupedFollowUps = useMemo(() => {
    if (groupByMode === 'NONE') {
      return null;
    }

    const today = new Date();
    const todayStr = getLocalDateString(today);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    const groupsMap = {};

    processedFollowUps.forEach(item => {
      const itemDateStr = getItemDateString(item) || todayStr;
      const dateParts = itemDateStr.split('-');
      const dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
      const itemDateTime = dateObj.getTime();

      let groupKey = 'OTHER';
      let sortOrderKey = itemDateTime;

      if (groupByMode === 'DATE' || groupByMode === 'DAY') {
        if (itemDateStr === todayStr) {
          groupKey = 'Today';
        } else if (itemDateStr === tomorrowStr) {
          groupKey = 'Tomorrow';
        } else if (itemDateStr === yesterdayStr) {
          groupKey = 'Yesterday';
        } else {
          groupKey = formatFollowupDate(itemDateStr);
        }
      } else if (groupByMode === 'WEEK') {
        const todayDateObj = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const diffDays = Math.round((itemDateTime - todayDateObj.getTime()) / 86400000);
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
        const timeA = formatFollowupTime('', a);
        const timeB = formatFollowupTime('', b);
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
  const handleStartConsultation = async (record) => {
    if (!record) return;
    const currentStatus = getFollowUpStatus(record);

    // If patient is already in consultation, directly continue into consultation workspace
    if (currentStatus === 'In Consultation') {
      const targetAppId = record.activeAppointmentId || record.followUpAppointmentId?._id || record.followUpAppointmentId || record.appointmentId?._id || record.appointmentId || record._id;
      navigate(`/doctor/consultation/${targetAppId}?type=followup`);
      return;
    }

    const followDateStr = getItemDateString(record) || getLocalDateString(record.followupDate || record.date);
    const todayStr = getLocalDateString(new Date());
    const isFuture = Boolean(followDateStr && followDateStr > todayStr);

    // If follow-up date is in the future, display alert confirmation popup first
    if (isFuture) {
      setAdvanceAlertRecord(record);
      return;
    }

    await proceedStartConsultation(record);
  };

  const proceedStartConsultation = async (record) => {
    if (!record) return;
    setIsStartingConsultation(true);
    try {
      const patId = record.patientId?._id || record.patientId;
      const consultId = record._id;

      // Call backend start-followup endpoint to activate appointment for today with current date
      const res = await api.post('/operations/consultations/start-followup', {
        consultationId: consultId,
        patientId: patId,
        isEmergency: true
      });

      const targetAppId = res.data?.appointmentId || record.followUpAppointmentId?._id || record.followUpAppointmentId || record.appointmentId?._id || record.appointmentId || record._id;

      // Voice calling announcement on Reception desk (Doctor speakers stay muted)
      const tokenNumber = res.data?.appointment?.tokenNumber || record.tokenNumber || '';
      const patientName = record.patientId?.name || record.patientName || 'Patient';
      const doctorName = record.doctorId?.name || record.doctorName || user?.name || 'Doctor';
      const roomNumber = record.doctorId?.roomNo || record.doctorId?.doctorProfile?.roomNo || 'Consultation Room';
      const callPayload = {
        tokenNumber,
        tokenNo: tokenNumber,
        patientName,
        doctorName,
        roomNumber,
        roomNo: roomNumber,
        hospitalId: user?.hospitalId || user?.hospital?._id || user?.hospital,
        type: 'TriggerVoiceCall'
      };
      api.post('/workflow/events/trigger-call', callPayload).catch(() => {});

      queryClient.invalidateQueries(['doctorQueue']);
      queryClient.invalidateQueries(['appointments']);
      queryClient.invalidateQueries(['doctorFollowUps']);

      setAdvanceAlertRecord(null);
      navigate(`/doctor/consultation/${targetAppId}?type=followup&fresh=true`);
    } catch (err) {
      // Fallback: directly update queue and navigate
      const rawAppId = record.followUpAppointmentId?._id || record.followUpAppointmentId || record.appointmentId?._id || record.appointmentId || record._id;
      const visitId = String(rawAppId);
      try {
        await api.put(`/operations/appointments/${visitId}/queue`, { 
          status: 'In Consultation', 
          queueStatus: 'In-Consultation',
          date: new Date().toISOString()
        });
        const callPayload = {
          tokenNumber: record.tokenNumber || '',
          tokenNo: record.tokenNumber || '',
          patientName: record.patientId?.name || record.patientName || 'Patient',
          doctorName: record.doctorId?.name || record.doctorName || user?.name || 'Doctor',
          roomNumber: record.doctorId?.roomNo || record.doctorId?.doctorProfile?.roomNo || 'Consultation Room',
          roomNo: record.doctorId?.roomNo || record.doctorId?.doctorProfile?.roomNo || 'Consultation Room',
          hospitalId: user?.hospitalId || user?.hospital?._id || user?.hospital,
          type: 'TriggerVoiceCall'
        };
        api.post('/workflow/events/trigger-call', callPayload).catch(() => {});
        queryClient.invalidateQueries(['doctorQueue']);
        queryClient.invalidateQueries(['appointments']);
        queryClient.invalidateQueries(['doctorFollowUps']);
      } catch (_) {}
      setAdvanceAlertRecord(null);
      navigate(`/doctor/consultation/${visitId}?type=followup&fresh=true`);
    } finally {
      setIsStartingConsultation(false);
    }
  };

  const handleConsultationHistory = (record) => {
    setSelectedConsultationRecord(record);
    setIsConsultationRecordOpen(true);
  };

  const handleViewNotes = (record) => {
    setSelectedPatientForNotes(record);
    setIsNotesModalOpen(true);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
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
    } else if (st === 'IN CONSULTATION' || st === 'IN-CONSULTATION' || st === 'IN PROGRESS') {
      style = 'bg-purple-50 text-purple-700 border-purple-200';
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
        const uhid = patient.uhid || row.uhid || '';
        const gender = patient.gender || row.gender || 'N/A';
        const age = patient.age || row.age || 'N/A';
        const initials = name.substring(0, 2).toUpperCase();

        return (
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-[#3563F6] font-extrabold text-xs flex items-center justify-center border border-blue-100 shrink-0">
              {initials}
            </div>
            <div className="flex flex-col">
              {/* Row 1: Patient Name and UHID No in same row */}
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-bold text-slate-900 text-xs">{name}</span>
                {uhid && uhid !== '—' && (
                  <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                    {uhid}
                  </span>
                )}
              </div>
              {/* Row 2: Gender and Age in same row */}
              <div className="text-[10px] text-slate-500 font-medium whitespace-nowrap mt-0.5">
                {gender} / {age}{age !== 'N/A' && !String(age).toLowerCase().includes('yr') ? ' Yrs' : ''}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'doctor',
      label: 'Doctor',
      render: (row) => (
        <div className="text-xs font-semibold text-slate-800 whitespace-nowrap">
          {row.doctorId?.name || 'Dr. Assigned'}
        </div>
      )
    },
    {
      key: 'followupDate',
      label: 'Follow-up Date',
      render: (row) => {
        const dateVal = getItemDateString(row) || row.followupDate || row.date;
        return <span className="font-mono text-xs text-slate-800 font-bold whitespace-nowrap">{formatFollowupDate(dateVal)}</span>;
      }
    },
    {
      key: 'followupTime',
      label: 'Follow-up Time',
      render: (row) => {
        const timeVal = formatFollowupTime(row.followupTime || row.time, row);
        return <span className="font-mono text-xs text-slate-800 font-bold whitespace-nowrap">{timeVal}</span>;
      }
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => renderStatusBadge(getFollowUpStatus(row))
    }
  ];

  // Table Action Buttons Configuration
  const tableActions = [
    {
      label: 'View Notes',
      icon: FileText,
      variant: 'secondary',
      onClick: (row) => handleViewNotes(row)
    },
    {
      label: 'Consultation History',
      icon: History,
      variant: 'view',
      onClick: (row) => handleConsultationHistory(row),
      show: (row) => getFollowUpStatus(row) === 'Completed'
    },
    {
      label: (row) => getFollowUpStatus(row) === 'In Consultation' ? 'Continue Consultation' : 'Start Consultation',
      icon: Stethoscope,
      variant: (row) => getFollowUpStatus(row) === 'In Consultation' ? 'purple' : 'primary',
      isPrimary: (row) => getFollowUpStatus(row) !== 'In Consultation',
      onClick: (row) => handleStartConsultation(row),
      show: (row) => getFollowUpStatus(row) !== 'Completed' && getFollowUpStatus(row) !== 'Cancelled'
    }
  ];

  // Render Mobile Card Item Component
  const renderMobileCard = (item) => {
    const patient = item.patientId || {};
    const patientName = patient.name || item.patientName || 'Unknown Patient';
    const uhid = patient.uhid || item.uhid || 'N/A';
    const age = patient.age || item.age || 'N/A';
    const gender = patient.gender || item.gender || 'N/A';
    const followDate = formatFollowupDate(getItemDateString(item) || item.followupDate || item.date);
    const followTime = formatFollowupTime(item.followupTime || item.time, item);
    const doctorName = item.doctorId?.name || 'Dr. Assigned';
    const recommendation = item.followupReason || item.clinicalNotes || item.diagnosis || 'Post-consultation follow-up review';
    const status = getFollowUpStatus(item);

    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 text-left font-sans">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-50 text-[#3563F6] flex items-center justify-center font-extrabold text-xs border border-blue-100 shrink-0">
              {patientName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-xs leading-tight flex items-center gap-1.5">
                <span>{patientName}</span>
                {uhid && uhid !== 'N/A' && (
                  <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/80">{uhid}</span>
                )}
              </h4>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">{gender} / {age} Yrs</p>
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
          <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-100">
            <span className="font-medium text-slate-500">Time:</span>
            <span className="font-bold font-mono text-slate-800">{followTime}</span>
          </div>
        </div>

        <div className="pt-2 flex items-center gap-2 border-t border-slate-100">
          <Button variant="secondary" onClick={() => handleViewNotes(item)} className="flex-1 text-xs py-1.5 h-[36px] border-slate-200">
            View Notes
          </Button>
          {status === 'Completed' ? (
            <Button 
              variant="secondary" 
              icon={History} 
              onClick={() => handleConsultationHistory(item)} 
              className="flex-1 text-xs py-1.5 h-[36px] border-[#3563F6] text-[#3563F6] hover:bg-blue-50 font-bold"
            >
              Consultation History
            </Button>
          ) : status !== 'Cancelled' ? (
            <Button 
              variant="primary" 
              icon={Stethoscope} 
              onClick={() => handleStartConsultation(item)} 
              className={`flex-1 text-xs py-1.5 h-[36px] font-bold ${status === 'In Consultation' ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' : 'bg-[#2F63F2] text-white border-[#2F63F2]'}`}
            >
              {status === 'In Consultation' ? 'Continue Consultation' : 'Start Consultation'}
            </Button>
          ) : null}
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
      {/* COMPACT KPI SUMMARY CARDS (1 Row & 3 Columns on Mobile, 3 Cols on Desktop) */}
      {/* --------------------------------------------------- */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="p-2 sm:p-4 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl shadow-2xs border-l-[3px] sm:border-l-4 border-l-blue-500 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-[8px] sm:text-[10px] font-extrabold uppercase tracking-tight sm:tracking-wider text-slate-400 block leading-tight truncate sm:whitespace-normal" title="Today's Follow-ups">Today's Follow-ups</span>
            <span className="text-base sm:text-2xl font-black font-mono text-slate-900 mt-0.5 block">{kpiStats.todayTotal}</span>
          </div>
          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-50 text-[#3563F6] flex items-center justify-center font-bold shrink-0">
            <CalendarCheck className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="p-2 sm:p-4 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl shadow-2xs border-l-[3px] sm:border-l-4 border-l-emerald-500 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-[8px] sm:text-[10px] font-extrabold uppercase tracking-tight sm:tracking-wider text-slate-400 block leading-tight truncate sm:whitespace-normal" title="Completed">Completed</span>
            <span className="text-base sm:text-2xl font-black font-mono text-emerald-600 mt-0.5 block">{kpiStats.completed}</span>
          </div>
          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="p-2 sm:p-4 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl shadow-2xs border-l-[3px] sm:border-l-4 border-l-amber-500 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-[8px] sm:text-[10px] font-extrabold uppercase tracking-tight sm:tracking-wider text-slate-400 block leading-tight truncate sm:whitespace-normal" title="Pending">Pending</span>
            <span className="text-base sm:text-2xl font-black font-mono text-amber-600 mt-0.5 block">{kpiStats.pending}</span>
          </div>
          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
            <Clock className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- */}
      {/* TOP FILTER TOOLBAR */}
      {/* --------------------------------------------------- */}
      <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs space-y-4">
        
        {/* Row 1: Primary Tabs & Export */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-1.5 w-full sm:w-auto">
            {/* Top row on mobile: Today's Follow-ups & Upcoming */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              {[
                { id: 'TODAY', label: "Today's Follow-ups", count: tabCounts.today, color: 'text-[#3563F6] bg-blue-50/80 border-[#3563F6]' },
                { id: 'UPCOMING', label: 'Upcoming', count: tabCounts.upcoming, color: 'text-emerald-700 bg-emerald-50/80 border-emerald-300' }
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

            {/* Second row on mobile: All Records on left & Export on right */}
            <div className="flex items-center justify-between sm:justify-start gap-1.5 w-full sm:w-auto">
              {(() => {
                const tab = { id: 'ALL', label: 'All Records', count: tabCounts.all, color: 'text-slate-700 bg-slate-100 border-slate-300' };
                return (
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
                );
              })()}

              {/* Mobile-only Export Button (in the same row as All Records) */}
              <div className="sm:hidden">
                <Button
                  variant="secondary"
                  icon={Download}
                  onClick={() => toast('Export feature ready for backend integration')}
                  className="text-xs font-bold uppercase tracking-wider h-[34px] px-3.5"
                >
                  Export
                </Button>
              </div>
            </div>
          </div>

          {/* Desktop-only Export Button (sits on the right end of the toolbar) */}
          <div className="hidden sm:block">
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => toast('Export feature ready for backend integration')}
              className="text-xs font-bold uppercase tracking-wider h-9 px-3.5"
            >
              Export
            </Button>
          </div>
        </div>        {/* Row 2: Search & Filter Controls Grid */}
        <div className="flex flex-col md:grid md:grid-cols-4 gap-2.5 sm:gap-3 items-stretch md:items-center">
          
          {/* 1. Realtime Search (Full width on mobile, 2 cols on desktop) */}
          <div className="relative w-full md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Name, UHID, Mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] font-medium"
            />
          </div>

          {/* 2 Filters: 2 columns on mobile (grid-cols-2), 2 columns on desktop (md:col-span-2 md:grid md:grid-cols-2) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full md:col-span-2 md:grid md:grid-cols-2 md:gap-3">
            {/* 1. Status Filter */}
            <div className="min-w-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full py-2 px-2.5 sm:px-3 text-xs border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#3563F6] cursor-pointer truncate"
              >
                <option value="ALL">All Statuses</option>
                <option value="In Consultation">In Consultation</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Missed">Missed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* 2. Date Filter Dropdown */}
            <div className="min-w-0">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full py-2 px-2.5 sm:px-3 text-xs border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#3563F6] cursor-pointer truncate"
              >
                <option value="ALL">All Dates</option>
                <option value="TODAY">Today</option>
                <option value="TOMORROW">Tomorrow</option>
                <option value="THIS_WEEK">This Week</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="CUSTOM">Custom Range</option>
              </select>
            </div>
          </div>

        </div>

        {/* Optional Custom Date Range Inputs */}
        {dateFilter === 'CUSTOM' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <div className="w-48">
              <DatePicker 
                value={customStartDate} 
                onChange={(val) => setCustomStartDate(val)} 
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Diagnoses</span>
                <span className="font-extrabold text-slate-800 text-sm">
                  {Array.isArray(selectedPatientForNotes.diagnoses) && selectedPatientForNotes.diagnoses.length > 0
                    ? selectedPatientForNotes.diagnoses.join(', ')
                    : (selectedPatientForNotes.primaryDiagnosis || selectedPatientForNotes.diagnosis || 'General Clinical Follow-up')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Follow-up Date</span>
                  <span className="font-bold font-mono text-slate-800">
                    {formatFollowupDate(getItemDateString(selectedPatientForNotes) || selectedPatientForNotes.followupDate || selectedPatientForNotes.date)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Follow-up Time</span>
                  <span className="font-bold font-mono text-[#3563F6]">
                    {formatFollowupTime(selectedPatientForNotes.followupTime || selectedPatientForNotes.time, selectedPatientForNotes)}
                  </span>
                </div>
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
              {getFollowUpStatus(selectedPatientForNotes) === 'Completed' ? (
                <Button 
                  variant="secondary" 
                  icon={History} 
                  onClick={() => {
                    setIsNotesModalOpen(false);
                    handleConsultationHistory(selectedPatientForNotes);
                  }} 
                  className="text-xs px-6 border-[#3563F6] text-[#3563F6] hover:bg-blue-50 font-bold"
                >
                  Consultation History
                </Button>
              ) : getFollowUpStatus(selectedPatientForNotes) !== 'Cancelled' ? (
                <Button 
                  variant="primary" 
                  icon={Stethoscope} 
                  onClick={() => {
                    setIsNotesModalOpen(false);
                    handleStartConsultation(selectedPatientForNotes);
                  }} 
                  className="text-xs px-6 bg-[#2F63F2] text-white font-bold"
                >
                  Start Consultation
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      {/* ADVANCE CONSULTATION ALERT POPUP */}
      <Modal
        isOpen={Boolean(advanceAlertRecord)}
        onClose={() => !isStartingConsultation && setAdvanceAlertRecord(null)}
        title="Advance Consultation Alert"
        maxWidth="max-w-md"
      >
        {advanceAlertRecord && (
          <div className="space-y-4 font-sans text-left">
            <div className="flex items-start gap-3.5 p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-amber-900 text-sm">
                  Scheduled Follow-up Date Ahead
                </p>
                <p className="text-amber-800 font-medium mt-1 leading-relaxed">
                  Patient <strong className="text-slate-900">{advanceAlertRecord.patientId?.name || advanceAlertRecord.patientName || 'Patient'}</strong> is scheduled for follow-up on <strong className="font-mono text-slate-900">{formatFollowupDate(getItemDateString(advanceAlertRecord) || advanceAlertRecord.followupDate || advanceAlertRecord.date)}</strong>.
                </p>
                <p className="text-amber-700 mt-1.5 leading-relaxed">
                  Starting consultation now will conduct an advance / emergency consultation for <strong>Today ({formatFollowupDate(getLocalDateString(new Date()))})</strong> with a clean, fresh prescription pad.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Patient Name:</span>
                <span className="font-bold text-slate-900">{advanceAlertRecord.patientId?.name || advanceAlertRecord.patientName}</span>
              </div>
              {advanceAlertRecord.patientId?.uhid && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">UHID:</span>
                  <span className="font-mono font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">{advanceAlertRecord.patientId.uhid}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Scheduled Date:</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatFollowupDate(getItemDateString(advanceAlertRecord) || advanceAlertRecord.followupDate || advanceAlertRecord.date)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Consultation Date:</span>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Today ({formatFollowupDate(getLocalDateString(new Date()))})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                onClick={() => setAdvanceAlertRecord(null)}
                disabled={isStartingConsultation}
                className="text-xs px-4"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={Stethoscope}
                onClick={() => proceedStartConsultation(advanceAlertRecord)}
                loading={isStartingConsultation}
                className="text-xs px-5 bg-[#2F63F2] text-white font-bold shadow-sm"
              >
                Start Consultation
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* CONSULTATION RECORD MODAL */}
      <ConsultationRecordModal
        isOpen={isConsultationRecordOpen}
        onClose={() => {
          setIsConsultationRecordOpen(false);
          setSelectedConsultationRecord(null);
        }}
        appointment={selectedConsultationRecord?.appointmentId && typeof selectedConsultationRecord.appointmentId === 'object' ? selectedConsultationRecord.appointmentId : selectedConsultationRecord}
        consultationId={selectedConsultationRecord?._id || selectedConsultationRecord?.consultationId || (typeof selectedConsultationRecord?.appointmentId === 'string' ? selectedConsultationRecord.appointmentId : selectedConsultationRecord?.appointmentId?._id)}
      />
    </div>
  );
};

export default DoctorFollowUps;
