import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bed, Search, Clock, RefreshCw, Check, X, 
  ArrowRight, Stethoscope, AlertCircle, Calendar
} from 'lucide-react';
import api from '../../services/api';
import PatientHistoryDrawer from '../PatientHistoryDrawer';

const getInitials = (name) => {
  if (!name) return 'IP';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const DoctorIPDConsultationSidebar = ({ 
  currentAdmissionId, 
  doctorId, 
  onSelectAdmission, 
  onClose 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'admitted' | 'waiting' | 'completed'
  const [historyPatient, setHistoryPatient] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Fetch all IPD admissions for the department with 8-second auto refresh
  const { 
    data: rawAdmissions = [], 
    isLoading, 
    refetch, 
    isRefetching 
  } = useQuery({
    queryKey: ['doctorIPDQueueSidebar', doctorId],
    queryFn: async () => {
      try {
        const res = await api.get('/ipd/admissions');
        return Array.isArray(res.data) ? res.data : (res.data?.data || []);
      } catch (err) {
        console.warn('Failed to fetch IPD admissions for sidebar queue:', err);
        return [];
      }
    },
    refetchInterval: 8000
  });

  // Deduplicate and filter strictly active admitted patients
  const admittedAdmissions = useMemo(() => {
    if (!Array.isArray(rawAdmissions)) return [];
    const seen = new Set();
    return rawAdmissions.filter(adm => {
      if (!adm) return false;
      const key = adm._id ? String(adm._id) : (adm.admissionId || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return adm.status === 'Admitted';
    });
  }, [rawAdmissions]);

  // Helper: Determine if an admitted patient has completed their daily care round today
  const isRoundCompletedToday = (adm) => {
    if (!adm) return false;
    const reviews = Array.isArray(adm.dailyReviews) ? adm.dailyReviews : [];
    const hasTodayReview = reviews.some(r => {
      const d = r.reviewDate || r.createdAt;
      if (!d) return false;
      try {
        return new Date(d).toISOString().split('T')[0] === todayStr;
      } catch {
        return false;
      }
    });
    if (hasTodayReview) return true;
    if (adm.consultationStatus === 'Completed' || adm.queueStatus === 'Completed') return true;
    if (adm.dischargeSummaryStatus === 'Sent to Reception' || adm.dischargeSummaryStatus === 'Completed') return true;
    return false;
  };

  // Categorize admissions strictly into 3 queues per user requirements:
  // 1. admitted: All patients currently admitted in IPD department
  // 2. waiting: Patients whose daily care rounds are not completed today
  // 3. completed: Patients who completed their daily care round today
  const { admittedQueue, waitingQueue, completedQueue } = useMemo(() => {
    const admitted = [...admittedAdmissions];
    const waiting = [];
    const completed = [];

    admittedAdmissions.forEach(adm => {
      if (isRoundCompletedToday(adm)) {
        completed.push(adm);
      } else {
        waiting.push(adm);
      }
    });

    return { 
      admittedQueue: admitted, 
      waitingQueue: waiting, 
      completedQueue: completed 
    };
  }, [admittedAdmissions, todayStr]);

  // Exact counts
  const counts = {
    admitted: admittedQueue.length,
    waiting: waitingQueue.length,
    completed: completedQueue.length
  };

  // Search Filter Helper
  const filterList = (list) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(adm => {
      const p = adm.patientId || {};
      const name = (p.name || '').toLowerCase();
      const ipdNo = (adm.admissionId || '').toLowerCase();
      const uhid = (p.uhid || '').toLowerCase();
      const mobile = (p.phone || p.mobileNumber || '').toLowerCase();
      const bedObj = adm.bedId;
      const bedNum = String(bedObj?.bedNumber || '').toLowerCase();
      const wardName = String(bedObj?.wardId?.name || '').toLowerCase();
      const diag = (adm.finalDiagnosis || adm.reasonForAdmission || '').toLowerCase();

      return name.includes(q) || 
             ipdNo.includes(q) || 
             uhid.includes(q) || 
             mobile.includes(q) || 
             bedNum.includes(q) || 
             wardName.includes(q) ||
             diag.includes(q);
    });
  };

  const currentDisplayList = useMemo(() => {
    if (activeFilter === 'waiting') {
      return filterList(waitingQueue);
    }
    if (activeFilter === 'completed') {
      return filterList(completedQueue);
    }
    return filterList(admittedQueue);
  }, [activeFilter, waitingQueue, completedQueue, admittedQueue, searchQuery]);

  const handleSelect = (adm) => {
    if (onSelectAdmission) {
      onSelectAdmission(adm);
    }
  };

  // Helper to test if admission is currently open
  const isCurrentAdmission = (adm) => {
    if (!currentAdmissionId || !adm) return false;
    const cur = String(currentAdmissionId);
    return cur === String(adm._id) || 
           cur === String(adm.id) || 
           cur === String(adm.admissionId);
  };

  return (
    <aside className="w-[270px] shrink-0 bg-white border border-slate-200/90 rounded-2xl p-3 shadow-sm space-y-3 font-sans print:hidden text-left max-h-[calc(100vh-140px)] overflow-y-auto">
      
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#2F63F2] flex items-center justify-center font-bold text-xs border border-blue-200/80 shadow-2xs">
            <Bed className="w-4 h-4 text-[#2F63F2]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-black text-slate-900 tracking-tight">Today's IPD Queue</h2>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Inpatient Daily Rounds</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh IPD Queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
              title="Collapse Queue"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Queue Statistics / Filter Buttons (ADMITTED, WAITING, COMPLETED) */}
      <div className="grid grid-cols-3 gap-1.5 text-center font-sans">
        {/* 1. ADMITTED CARD */}
        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'admitted' ? 'all' : 'admitted')}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            activeFilter === 'admitted' || activeFilter === 'all'
              ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-400/30 shadow-xs'
              : 'bg-blue-50/80 border-blue-200/80 hover:bg-blue-100/60'
          }`}
          title="Total Patients Admitted in IPD"
        >
          <span className="text-[9px] font-black uppercase text-blue-700 block tracking-wider">ADMITTED</span>
          <span className="text-base font-black text-blue-900 font-mono">{counts.admitted}</span>
        </button>

        {/* 2. WAITING CARD */}
        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'waiting' ? 'all' : 'waiting')}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            activeFilter === 'waiting'
              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400/30 shadow-xs'
              : 'bg-amber-50/80 border-amber-200/80 hover:bg-amber-100/60'
          }`}
          title="Admitted patients with daily care round pending today"
        >
          <span className="text-[9px] font-black uppercase text-amber-700 block tracking-wider">WAITING</span>
          <span className="text-base font-black text-amber-800 font-mono">{counts.waiting}</span>
        </button>

        {/* 3. COMPLETED CARD */}
        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'completed' ? 'all' : 'completed')}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            activeFilter === 'completed'
              ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-400/30 shadow-xs'
              : 'bg-emerald-50/80 border-emerald-200/80 hover:bg-emerald-100/60'
          }`}
          title="Admitted patients whose daily care round is completed today"
        >
          <span className="text-[9px] font-black uppercase text-emerald-700 block tracking-wider">COMPLETED</span>
          <span className="text-base font-black text-emerald-800 font-mono">{counts.completed}</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search patient, bed, UHID..."
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#2F63F2] focus:bg-white text-slate-800 font-medium placeholder:text-slate-400 shadow-2xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Patient List */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-0.5 text-[10px] font-extrabold uppercase tracking-wider">
          <span className={
            activeFilter === 'waiting' 
              ? 'text-amber-700' 
              : activeFilter === 'completed' 
                ? 'text-emerald-700' 
                : 'text-blue-700'
          }>
            {activeFilter === 'waiting'
              ? `ROUNDS PENDING (${currentDisplayList.length})`
              : activeFilter === 'completed'
                ? `ROUNDS COMPLETED (${currentDisplayList.length})`
                : `ALL ADMITTED PATIENTS (${currentDisplayList.length})`}
          </span>
          {activeFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="text-[#2F63F2] hover:underline normal-case text-[10px] font-bold"
            >
              Reset Filter
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 text-center text-xs text-slate-400 space-y-2">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[#2F63F2]" />
            <span>Loading IPD queue...</span>
          </div>
        ) : currentDisplayList.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <AlertCircle className="w-4 h-4 text-slate-300 mx-auto" />
            <p>
              {searchQuery 
                ? 'No matching admitted patients found.' 
                : activeFilter === 'waiting'
                  ? 'All admitted patients have completed daily care rounds!'
                  : activeFilter === 'completed'
                    ? 'No daily care rounds completed yet today.'
                    : 'No admitted patients in IPD.'}
            </p>
          </div>
        ) : (
          currentDisplayList.map((adm) => {
            const p = adm.patientId || {};
            const isCurrent = isCurrentAdmission(adm);
            const isCompleted = isRoundCompletedToday(adm);
            const initials = getInitials(p.name);

            // Ward & Bed
            const bedObj = adm.bedId;
            const wardName = bedObj?.wardId?.name || (typeof bedObj?.wardId === 'string' ? bedObj.wardId : '') || adm.wardName || '';
            const bedNumber = bedObj?.bedNumber || adm.bedNumber || '';
            const wardBedText = wardName && bedNumber ? `${wardName} • Bed ${bedNumber}` : (bedNumber ? `Bed ${bedNumber}` : (wardName || 'IPD Ward'));

            // Age / Gender & Blood Group formatting
            const rawAge = p.age || adm.age;
            const ageText = rawAge ? `${String(rawAge).replace(/[^0-9]/g, '') || rawAge} yrs` : '—';
            const rawGender = p.gender || adm.gender || '';
            const genderLetter = rawGender ? (rawGender.length === 1 ? rawGender.toUpperCase() : rawGender.charAt(0).toUpperCase()) : '—';
            const ageGenderText = `${ageText} / ${genderLetter}`;
            const bloodGroup = p.bloodGroup || adm.bloodGroup;

            // Length of Stay & Completed Rounds
            const stayDays = (() => {
              if (!adm.admissionDate) return 1;
              const admDate = new Date(adm.admissionDate);
              const today = new Date();
              const diffTime = Math.abs(today - admDate);
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
              return diffDays > 0 ? diffDays : 1;
            })();

            const completedRoundsCount = Array.isArray(adm.dailyReviews) ? adm.dailyReviews.length : 0;
            const targetRoundNumber = completedRoundsCount + (isCompleted ? 0 : 1);

            return (
              <motion.div
                key={adm._id || adm.admissionId}
                whileHover={{ scale: 1.01 }}
                transition={{ duration: 0.15 }}
                onClick={() => handleSelect(adm)}
                className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
                  isCurrent
                    ? 'bg-blue-50/90 border-[#3563F6] border-l-4 border-l-[#3563F6] shadow-sm ring-1 ring-[#3563F6]/20'
                    : isCompleted
                      ? 'bg-white border-slate-200/90 hover:border-emerald-300 hover:shadow-xs'
                      : 'bg-white border-slate-200/90 hover:border-amber-300 hover:shadow-xs'
                }`}
              >
                {/* Top Row: Initials + IPD No + Status Badge */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-full font-extrabold text-[10px] flex items-center justify-center border shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 text-white border-blue-700'
                        : isCompleted
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {initials}
                    </div>
                    <span className="font-mono text-[11px] font-black px-1.5 py-0.5 rounded-md text-slate-800 bg-slate-100 border border-slate-200 truncate">
                      {adm.admissionId || 'IPD-N/A'}
                    </span>
                  </div>

                  {/* Status Badge: Round Completed or Round Pending */}
                  {isCompleted ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                      <span>Round Done</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5 stroke-[2.5]" />
                      <span>Round Pending</span>
                    </span>
                  )}
                </div>

                {/* Patient Name & Two-Line Age / Gender & Blood Group */}
                <div>
                  <h4 className="text-xs font-black text-slate-900 truncate">
                    {p.name || 'Unknown Patient'}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {ageGenderText}
                    </span>
                    {bloodGroup && bloodGroup !== 'Unknown' && bloodGroup !== 'N/A' && bloodGroup !== '—' && (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight">
                        {bloodGroup}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ward & Bed and Day of Stay */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-100">
                  <span className="text-slate-700 font-semibold truncate max-w-[150px]" title={wardBedText}>
                    🛏️ {wardBedText}
                  </span>
                  <span className="font-mono text-slate-500 font-bold shrink-0">
                    Day {stayDays}
                  </span>
                </div>

                {/* Bottom Bar: Action / History */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                  <span className="text-slate-500 font-semibold flex items-center gap-1">
                    <Stethoscope className="w-3 h-3 text-[#2F63F2]" />
                    {isCompleted ? `Round ${completedRoundsCount} consulted` : `Round ${targetRoundNumber} ready`}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryPatient(p);
                      setIsHistoryDrawerOpen(true);
                    }}
                    className="text-[#3563F6] hover:underline font-extrabold cursor-pointer"
                  >
                    History
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Patient History Modal Drawer */}
      {isHistoryDrawerOpen && historyPatient && (
        <PatientHistoryDrawer
          isOpen={isHistoryDrawerOpen}
          onClose={() => {
            setIsHistoryDrawerOpen(false);
            setHistoryPatient(null);
          }}
          patient={historyPatient}
        />
      )}
    </aside>
  );
};

export default DoctorIPDConsultationSidebar;

