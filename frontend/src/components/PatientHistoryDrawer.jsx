import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { 
  X, Search, Calendar, Clock, Pill, FlaskConical, HeartPulse, AlertCircle
} from 'lucide-react';

const PatientHistoryDrawer = ({ 
  isOpen, 
  onClose, 
  patient, 
  patientHistory, 
  title,
  isLoading: externalLoading,
  onCopyPrescription 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activePopup, setActivePopup] = useState(null); // { visitId: string, type: 'rx' | 'inv' | 'vitals' } | null

  const patientId = patient?._id || (typeof patient === 'string' ? patient : null);

  // Auto-fetch patient history if not passed from parent
  const { data: fetchedHistory, isLoading: isFetchingHistory } = useQuery({
    queryKey: ['patientHistoryDrawerAutoFetch', patientId],
    queryFn: async () => {
      if (!patientId) return null;
      const res = await api.get(`/operations/patients/${patientId}/history`);
      return res.data?.data || null;
    },
    enabled: isOpen && !!patientId && !patientHistory
  });

  const effectiveHistory = patientHistory || fetchedHistory;
  const isLoading = Boolean(externalLoading || (!patientHistory && isFetchingHistory));

  const activePatient = useMemo(() => ({
    ...(typeof patient === 'object' ? patient : {}),
    ...(effectiveHistory?.patient || {})
  }), [patient, effectiveHistory]);

  const visits = useMemo(() => {
    if (!effectiveHistory) return [];

    let rawList = [];
    if (Array.isArray(effectiveHistory)) {
      rawList = effectiveHistory;
    } else if (Array.isArray(effectiveHistory.history) && effectiveHistory.history.length > 0) {
      rawList = effectiveHistory.history;
    } else if (Array.isArray(effectiveHistory.snapshots) && effectiveHistory.snapshots.length > 0) {
      rawList = effectiveHistory.snapshots;
    } else if (Array.isArray(effectiveHistory.consultations) && effectiveHistory.consultations.length > 0) {
      rawList = effectiveHistory.consultations;
    }

    // Deduplicate items cleanly by composite encounter keys
    // Sort rawList first so that items with genuine consultation records / prescriptions take precedence
    const sortedRaw = [...rawList].sort((a, b) => {
      const aRx = (a.prescriptions?.length || a.items?.length || 0);
      const bRx = (b.prescriptions?.length || b.items?.length || 0);
      if (aRx !== bRx) return bRx - aRx;
      const aHasNotes = Boolean(a.clinicalNotes || a.notes || a.advice);
      const bHasNotes = Boolean(b.clinicalNotes || b.notes || b.advice);
      if (aHasNotes !== bHasNotes) return bHasNotes ? 1 : -1;
      return 0;
    });

    const seenKeys = new Set();
    const deduplicated = [];

    sortedRaw.forEach((item, idx) => {
      if (!item) return;
      const recId = String(item._id || `item_${idx}`);
      const isIPDDailyReview = Boolean(item.isIPDDailyReview || (item.isIpd && (item.roundNumber || item.dayNumber)));
      const isIPDAdmission = Boolean(item.isIPDAdmission || item.isIPDEncounter || (item.isIpd && !isIPDDailyReview));
      const roundVal = item.dayNumber || item.roundNumber || item.day || 1;

      const apptId = item.appointmentId 
        ? String(item.appointmentId?._id || item.appointmentId) 
        : (!isIPDDailyReview && !isIPDAdmission && !item.isIpd && !item.consultationId ? recId : null);
      const consultId = item.consultationId 
        ? String(item.consultationId?._id || item.consultationId) 
        : (!isIPDDailyReview && !isIPDAdmission && !item.isIpd && !item.appointmentId ? recId : null);

      // Suppress duplicate admission encounter if daily rounds already represent this admission and admission card has no separate prescriptions
      const hasRoundEncounters = sortedRaw.some(other => 
        Boolean(other?.isIPDDailyReview || (other?.isIpd && (other?.roundNumber || other?.dayNumber))) &&
        (other.admissionId === item.admissionId || other.admissionId === item._id)
      );
      if (isIPDAdmission && hasRoundEncounters && (!item.prescriptions || item.prescriptions.length === 0)) {
        return;
      }

      let key = recId;
      if (isIPDDailyReview) {
        key = `ipd_round_${item.admissionId || ''}_${roundVal}`;
      } else if (isIPDAdmission || item.isIpd) {
        key = `ipd_adm_${item.admissionId || recId}`;
      } else if (apptId) {
        key = `opd_appt_${apptId}`;
      } else if (consultId) {
        key = `opd_consult_${consultId}`;
      }

      if (seenKeys.has(key)) return;
      if (isIPDDailyReview && item.admissionId && seenKeys.has(`ipd_round_${item.admissionId}_${roundVal}`)) return;
      if (isIPDAdmission && item.admissionId && seenKeys.has(`ipd_adm_${item.admissionId}`)) return;
      if (apptId && seenKeys.has(`opd_appt_${apptId}`)) return;
      if (consultId && seenKeys.has(`opd_consult_${consultId}`)) return;
      if (recId && seenKeys.has(recId)) return;

      seenKeys.add(key);
      if (recId) seenKeys.add(recId);
      if (isIPDDailyReview && item.admissionId) seenKeys.add(`ipd_round_${item.admissionId}_${roundVal}`);
      if (isIPDAdmission && item.admissionId) seenKeys.add(`ipd_adm_${item.admissionId}`);
      if (apptId) seenKeys.add(`opd_appt_${apptId}`);
      if (consultId) seenKeys.add(`opd_consult_${consultId}`);

      // Normalize fields
      const dateVal = item.consultationDate || item.completedAt || item.date || item.createdAt;
      const docName = item.doctor?.name || item.doctorName || item.doctorId?.name || (typeof item.doctorId === 'string' ? item.doctorId : null) || 'Doctor';
      const docSpec = item.doctor?.specialization || item.doctorSpecialization || item.doctorId?.specialization || (isIPDDailyReview ? 'IPD Daily Consultation' : (item.isIpd ? 'In-Patient Department (IPD)' : 'General OPD'));
      const tokenNum = item.tokenNumber || item.appointmentId?.tokenNumber || item.token || '';

      const rxList = (item.prescriptions && item.prescriptions.length > 0)
        ? item.prescriptions
        : (item.items && item.items.length > 0)
          ? item.items
          : [];

// Helper to sanitize and extract genuine clinical notes from legacy pipe-delimited dumps
const cleanClinicalNotes = (notes) => {
  if (!notes || typeof notes !== 'string') return '';
  let cleaned = notes.trim();
  // Strip out legacy raw pipe-separated admin metadata if present
  // e.g. "Admission No: IPD-2026-0006 | Type: OPD Transfer | Ward/Bed: Bed 102 | Reason: ... | Clinical Notes: <actual_notes>"
  if (cleaned.includes(' | ') && (cleaned.includes('Admission No:') || cleaned.includes('Clinical Notes:') || cleaned.includes('Ward/Bed:'))) {
    const parts = cleaned.split(' | ');
    const notePart = parts.find(p => p.startsWith('Clinical Notes:'));
    if (notePart) {
      cleaned = notePart.replace(/^Clinical Notes:\s*/, '').trim();
    } else {
      const nonMetaParts = parts.filter(p => !/^(Admission No|Type|Ward\/Bed|Reason):/.test(p));
      cleaned = nonMetaParts.length > 0 ? nonMetaParts.join('\n') : parts[parts.length - 1];
    }
  }
  // Remove accidental double "Dr. Dr."
  cleaned = cleaned.replace(/Dr\.\s+Dr\./gi, 'Dr.').trim();
  return cleaned;
};

// Helper to sanitize doctor advice from administrative placeholder strings
const cleanDoctorAdvice = (advice) => {
  if (!advice || typeof advice !== 'string') return '';
  const trimmed = advice.trim();
  // Suppress artificial administrative placeholder advice
  if (/^Active Inpatient Admission/i.test(trimmed)) {
    return '';
  }
  return trimmed.replace(/Dr\.\s+Dr\./gi, 'Dr.');
};

const extractText = (val, fallback = '') => {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val.map(v => (typeof v === 'string' ? v : v?.name || v?.complaint || v?.diagnosis || v?.text || '')).filter(Boolean).join(', ') || fallback;
  }
  if (typeof val === 'object') {
    return val.name || val.complaint || val.diagnosis || val.text || val.val || fallback;
  }
  return String(val);
};

      deduplicated.push({
        ...item,
        _id: recId,
        date: dateVal,
        createdAt: dateVal,
        doctorName: docName,
        doctorId: { name: docName },
        doctorSpecialization: docSpec,
        tokenNumber: tokenNum,
        wardBed: item.wardBed || item.bedLabel || (item.bedNumber ? `Bed ${item.bedNumber}` : (item.bedId ? `Bed ${item.bedId?.bedNumber || ''}` : '')),
        admissionId: item.admissionId || '',
        admissionType: item.admissionType || '',
        isIpd: !!(item.isIpd || item.isIPDAdmission || item.isIPDDailyReview || item.admissionId),
        isIPDDailyReview: !!(item.isIPDDailyReview || item.roundNumber),
        dayNumber: item.dayNumber || item.roundNumber || null,
        diagnosis: extractText(
          (item.diagnosis !== 'OPD Visit' ? item.diagnosis : null) || 
          (item.primaryDiagnosis !== 'OPD Visit' ? item.primaryDiagnosis : null) || 
          (Array.isArray(item.diagnoses) && item.diagnoses.length > 0 ? item.diagnoses.join(', ') : null) || 
          (item.chiefComplaint !== 'OPD Visit' ? item.chiefComplaint : null),
          'Clinical Consultation'
        ),
        primaryDiagnosis: extractText(
          (item.primaryDiagnosis !== 'OPD Visit' ? item.primaryDiagnosis : null) || 
          (Array.isArray(item.diagnoses) && item.diagnoses.length > 0 ? item.diagnoses[0] : null) || 
          (item.diagnosis !== 'OPD Visit' ? item.diagnosis : null) || 
          (item.chiefComplaint !== 'OPD Visit' ? item.chiefComplaint : null),
          'Clinical Consultation'
        ),
        chiefComplaint: extractText(
          (item.chiefComplaint && item.chiefComplaint !== 'OPD Visit' ? item.chiefComplaint : null) || 
          item.chiefComplaints || 
          item.reasonForAdmission || 
          item.symptoms,
          'General Checkup'
        ),
        clinicalNotes: cleanClinicalNotes(item.clinicalNotes || item.notes || item.assessmentNotes || ''),
        advice: cleanDoctorAdvice(item.doctorAdvice || item.advice || item.generalInstructions || ''),
        vitals: item.vitals || item.appointmentId?.vitals || {},
        prescriptions: rxList.map(p => ({
          medicineName: p.medicineName || p.name || 'Medicine',
          dosage: p.dosage || p.dose || (p.morning !== undefined ? `${p.morning || '1'}-${p.afternoon || '0'}-${p.night || '1'}` : (p.frequency || '1-0-1')),
          morning: p.morning || (p.dose && p.dose.split('-')[0]) || '1',
          afternoon: p.afternoon || (p.dose && p.dose.split('-')[1]) || '0',
          night: p.night || (p.dose && p.dose.split('-')[2]) || '1',
          duration: p.duration || '3 Days',
          instructions: p.instructions || p.timing || p.foodInstruction || p.foodTiming || 'After Food',
          foodTiming: p.foodTiming || p.instructions || p.timing || p.foodInstruction || 'After Food',
          quantity: p.quantity !== undefined ? p.quantity : 1,
          notes: p.notes || p.remarks || '—'
        })),
        investigations: (item.investigations || item.appointmentId?.investigations || []).map(inv => 
          typeof inv === 'string' ? inv : (inv.investigationName || inv.name || inv.code)
        )
      });
    });

    // Smart sort:
    //  - Overall order: newest date first (most recent admission / OPD visit at top)
    //  - Within the SAME IPD admission: IPD Admission card first, then daily rounds in
    //    ascending round order (Round 1 → Round 2 → Round 3 …)
    //  - OPD visits: sorted newest date first among themselves

    // Step 1 — compute a "group anchor date" for each item.
    //   For IPD daily rounds, use the admission's own date so the whole group
    //   sorts together with the admission anchor.
    const admAnchorDate = {};
    deduplicated.forEach(item => {
      if (item.admissionId) {
        const d = new Date(item.date || item.createdAt || 0).getTime();
        if (!admAnchorDate[item.admissionId] || d < admAnchorDate[item.admissionId]) {
          admAnchorDate[item.admissionId] = d; // earliest date of any item in this admission
        }
      }
    });

    deduplicated.sort((a, b) => {
      const aAdmId = a.admissionId || null;
      const bAdmId = b.admissionId || null;

      // ── Same IPD admission group ──────────────────────────────────────
      if (aAdmId && bAdmId && aAdmId === bAdmId) {
        // Admission header card (isIPDAdmission && !isIPDDailyReview) comes first
        const aIsHeader = a.isIPDAdmission && !a.isIPDDailyReview;
        const bIsHeader = b.isIPDAdmission && !b.isIPDDailyReview;
        if (aIsHeader && !bIsHeader) return -1;
        if (!aIsHeader && bIsHeader) return 1;
        // Both are daily rounds → sort ascending by round number
        const aRound = Number(a.dayNumber || a.roundNumber || 0);
        const bRound = Number(b.dayNumber || b.roundNumber || 0);
        return aRound - bRound;
      }

      // ── Different groups — sort by anchor date, newest first ──────────
      const aDate = aAdmId ? (admAnchorDate[aAdmId] || 0) : new Date(a.date || a.createdAt || 0).getTime();
      const bDate = bAdmId ? (admAnchorDate[bAdmId] || 0) : new Date(b.date || b.createdAt || 0).getTime();
      return bDate - aDate;
    });

    return deduplicated;
  }, [effectiveHistory]);

  const consultations = visits;

  // Reset active popup state when a new patient history loads
  React.useEffect(() => {
    setSearchQuery('');
    setActivePopup(null);
  }, [effectiveHistory, patientId]);

  const filteredConsultations = useMemo(() => {
    if (!searchQuery.trim()) return consultations;
    const q = searchQuery.trim().toLowerCase();

    return consultations.filter(c => {
      const docName = String(c.doctorId?.name || c.doctorName || '').toLowerCase();
      const diag = String(c.diagnosis || c.primaryDiagnosis || '').toLowerCase();
      const complaint = String(c.chiefComplaint || '').toLowerCase();
      const notes = String(c.clinicalNotes || '').toLowerCase();
      const token = String(c.tokenNumber || '').toLowerCase();
      const dateStr = new Date(c.createdAt || c.date || Date.now()).toLocaleDateString().toLowerCase();

      const rxMatch = (c.prescriptions || []).some(m => (m.medicineName || '').toLowerCase().includes(q));
      const invMatch = Array.isArray(c.investigations)
        ? c.investigations.some(i => (typeof i === 'string' ? i : i.investigationName || '').toLowerCase().includes(q))
        : (c.investigations || '').toLowerCase().includes(q);

      return docName.includes(q) || diag.includes(q) || complaint.includes(q) || notes.includes(q) || token.includes(q) || dateStr.includes(q) || rxMatch || invMatch;
    });
  }, [consultations, searchQuery]);

  // Helper to get prescriptions for a consultation
  const getPrescriptionsForVisit = (c) => {
    if (c.prescriptions && Array.isArray(c.prescriptions) && c.prescriptions.length > 0) {
      return c.prescriptions;
    }
    if (c.items && Array.isArray(c.items) && c.items.length > 0) {
      return c.items;
    }
    if (c.appointmentId?.prescriptions && Array.isArray(c.appointmentId.prescriptions) && c.appointmentId.prescriptions.length > 0) {
      return c.appointmentId.prescriptions;
    }
    if (c.appointmentId?.items && Array.isArray(c.appointmentId.items) && c.appointmentId.items.length > 0) {
      return c.appointmentId.items;
    }
    // Admission encounter should NEVER fall back to picking up routine daily round prescriptions
    if (c.isIPDAdmission && !c.isIPDDailyReview && !c.roundNumber) {
      return [];
    }
    // Fallback: match prescriptions explicitly belonging to this specific consultation or appointment
    const targetApptId = String(c.appointmentId?._id || c.appointmentId || c._id);
    const matchedRx = (effectiveHistory?.prescriptions || []).find(p => {
      if (p.consultationId && String(p.consultationId?._id || p.consultationId) === String(c._id)) {
        return true;
      }
      if (!c.isIpd && !p.isIpd && !p.admissionId && targetApptId) {
        return String(p.appointmentId?._id || p.appointmentId) === targetApptId;
      }
      return false;
    });
    if (matchedRx?.items && matchedRx.items.length > 0) {
      return matchedRx.items;
    }
    return [];
  };

  // Helper to get vitals for a consultation
  const getVitalsForVisit = (c) => {
    if (!c) return null;

    // Inherit from parent admission if this is an IPD round/review missing baseline vitals (e.g. weight, height, BMI)
    let parentAdmissionVitals = {};
    if (c.admissionId) {
      const parentAdm = visits.find(v => v.admissionId === c.admissionId && !v.isIPDDailyReview);
      if (parentAdm?.vitals && typeof parentAdm.vitals === 'object') {
        parentAdmissionVitals = parentAdm.vitals;
      }
    }

    const apptVitals = (c.appointmentId?.vitals && typeof c.appointmentId.vitals === 'object')
      ? c.appointmentId.vitals
      : (c.appointmentObj?.vitals && typeof c.appointmentObj.vitals === 'object')
        ? c.appointmentObj.vitals
        : {};

    const consultVitals = (c.vitals && typeof c.vitals === 'object') ? c.vitals : {};

    const merged = {
      ...parentAdmissionVitals,
      ...apptVitals,
      ...consultVitals
    };

    // Normalize BP if bp: '120/70' or '120 / 70' is provided without systolic/diastolic
    if (merged.bp && (!merged.bpSystolic || !merged.bpDiastolic)) {
      const parts = String(merged.bp).split('/');
      if (parts.length === 2) {
        if (!merged.bpSystolic) merged.bpSystolic = parts[0].trim();
        if (!merged.bpDiastolic) merged.bpDiastolic = parts[1].trim();
      }
    }
    if (merged.bloodPressure && (!merged.bpSystolic || !merged.bpDiastolic)) {
      const parts = String(merged.bloodPressure).split('/');
      if (parts.length === 2) {
        if (!merged.bpSystolic) merged.bpSystolic = parts[0].trim();
        if (!merged.bpDiastolic) merged.bpDiastolic = parts[1].trim();
      }
    }

    // Auto-calculate BMI if weight and height are present but BMI is not provided
    if (!merged.bmi && merged.weight && merged.height) {
      const w = parseFloat(merged.weight);
      const h = parseFloat(merged.height);
      if (w > 0 && h > 0) {
        const hMeter = h > 3 ? h / 100 : h;
        const calc = (w / (hMeter * hMeter)).toFixed(1);
        if (!isNaN(calc) && isFinite(calc)) {
          merged.bmi = calc;
        }
      }
    }

    if (Object.values(merged).some(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0')) {
      return merged;
    }
    return null;
  };

  // Helper to get investigations for a consultation
  const getInvestigationsForVisit = (c) => {
    if (c.investigations && c.investigations.length > 0) {
      return c.investigations;
    }
    if (c.appointmentId?.investigations && c.appointmentId.investigations.length > 0) {
      return c.appointmentId.investigations;
    }
    return null;
  };

  if (!isOpen) return null;

  const headerTitle = title || (activePatient?.name ? `VISIT HISTORY - ${activePatient.name.toUpperCase()}` : 'VISIT HISTORY');

  const drawerContent = (
    <div className="fixed inset-0 z-[99999] overflow-y-auto font-sans print:hidden flex items-center justify-center p-3 sm:p-6">
      {/* Full Screen Overlay Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Centered Modal Container */}
      <div className="relative w-full max-w-4xl lg:max-w-5xl max-h-[92vh] sm:max-h-[90vh] bg-white shadow-2xl rounded-2xl sm:rounded-3xl border border-slate-200/90 flex flex-col text-left overflow-hidden z-[100000] font-sans my-auto">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black text-[#2F63F2] tracking-tight uppercase">
                {headerTitle}
              </h3>
              {(activePatient?.gender || activePatient?.age) && (
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 font-mono">
                  • {activePatient?.gender || 'N/A'}, {activePatient?.age ? `${activePatient.age}Y` : 'N/A'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5 font-bold">
              <span>UHID: {activePatient?.uhid || 'N/A'}</span>
              {activePatient?.bloodGroup && (
                <span className="bg-red-50 text-red-600 border border-red-200/60 px-1.5 py-0.2 rounded text-[10px] uppercase font-bold">
                  {activePatient.bloodGroup}
                </span>
              )}
            </div>
          </div>
          
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Search Input */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-100 bg-white shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history by diagnosis, token, medicine, test, doctor, date..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-xl sm:rounded-2xl text-xs text-slate-700 font-medium placeholder-slate-400 focus:outline-none focus:border-[#2F63F2] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Timeline Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 text-left">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 font-medium space-y-3">
              <div className="w-8 h-8 border-2 border-[#2F63F2] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono font-bold text-slate-600">Loading visit history records...</p>
            </div>
          ) : filteredConsultations.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-600">No medical history records found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto font-medium">
                {searchQuery ? 'Try clearing your search query' : 'This patient has no recorded consultation history yet.'}
              </p>
            </div>
          ) : (
            filteredConsultations.map((c) => {
              const isRxActive = activePopup?.visitId === c._id && activePopup?.type === 'rx';
              const isInvActive = activePopup?.visitId === c._id && activePopup?.type === 'inv';
              const isVitalsActive = activePopup?.visitId === c._id && activePopup?.type === 'vitals';
              const isAnyPopupActive = activePopup?.visitId === c._id;

              const rxList = getPrescriptionsForVisit(c);
              const vitalsObj = getVitalsForVisit(c);
              const invObj = getInvestigationsForVisit(c);

              const rxCount = rxList.length;
              const invCount = Array.isArray(invObj) ? invObj.length : (invObj ? 1 : 0);
              const vitalsCount = vitalsObj && Object.values(vitalsObj).some(Boolean) ? 1 : 0;

              return (
                <div 
                  key={c._id} 
                  className={`relative bg-white border rounded-2xl sm:rounded-3xl transition-all shadow-2xs ${
                    isAnyPopupActive ? 'border-[#2F63F2]/50 ring-2 ring-[#2F63F2]/20 shadow-md' : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* Card Main Bar */}
                  <div className="p-3 sm:p-5 select-none bg-white space-y-2.5 sm:space-y-3 rounded-2xl sm:rounded-3xl">
                    {/* Top Row: Date Box + Doctor Info + Pill Badges */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Blue Date Box */}
                        {(() => {
                          const rawDateStr = c.consultationDate || c.completedAt || c.date || c.createdAt;
                          const dateVal = new Date(rawDateStr);
                          const dayNum = !isNaN(dateVal.getTime()) ? dateVal.getDate() : '—';
                          const monthYearStr = !isNaN(dateVal.getTime()) ? dateVal.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
                          
                          // Resolve genuine time: check string time first, then non-midnight timestamps
                          let displayTime = c.time || c.appointmentTime || c.consultationTime || c.appointmentId?.time || '';
                          if (!displayTime && rawDateStr && !isNaN(dateVal.getTime())) {
                            const isMidnightUtc = (dateVal.getUTCHours() === 0 && dateVal.getUTCMinutes() === 0 && dateVal.getUTCSeconds() === 0);
                            if (!isMidnightUtc) {
                              displayTime = dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            }
                          }
                          return (
                            <div className="w-[76px] py-2 px-1 rounded-2xl bg-blue-50/70 border border-blue-100/90 flex flex-col items-center justify-center shrink-0 text-center shadow-2xs">
                              <Calendar className="w-3.5 h-3.5 text-[#2F63F2] mb-0.5" />
                              <span className="text-base font-black text-[#2F63F2] leading-none font-sans">
                                {dayNum}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 font-sans leading-tight mt-0.5 whitespace-nowrap">
                                {monthYearStr}
                              </span>
                              {displayTime ? (
                                <span className="flex items-center justify-center gap-0.5 text-[9px] font-semibold text-slate-400 font-sans mt-1 leading-none">
                                  <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span>{displayTime}</span>
                                </span>
                              ) : (
                                <span className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-emerald-600 font-sans mt-1 leading-none">
                                  <span>OPD</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {/* Doctor Name & Specialization */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black text-slate-900 tracking-tight">
                              {(() => {
                                const rawName = c.doctorName || c.doctorId?.name || 'Consultant';
                                return rawName.toLowerCase().startsWith('dr.') ? rawName : `Dr. ${rawName}`;
                              })()}
                            </h4>
                            {c.tokenNumber && !c.isIpd && !c.isIPDDailyReview && (
                              <span className="text-[10px] font-bold text-[#2F63F2] bg-[#2F63F2]/10 border border-[#2F63F2]/20 px-2 py-0.5 rounded-lg font-mono">
                                Token #{c.tokenNumber}
                              </span>
                            )}
                            {c.admissionId && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-lg font-mono">
                                {c.admissionId}
                              </span>
                            )}
                            {c.isIPDDailyReview && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg font-mono whitespace-nowrap">
                                Round {c.dayNumber || c.roundNumber || 1}
                              </span>
                            )}
                            {(() => {
                              if (!c.wardBed) return null;
                              let combinedLabel = c.wardBed;
                              if (c.wardBed.includes(' | ') || c.wardBed.includes(' - ')) {
                                const parts = c.wardBed.split(/ \| | - /);
                                if (parts[0] && parts[1]) {
                                  combinedLabel = `${parts[0].trim()} / ${parts[1].trim()}`;
                                }
                              }
                              return (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200/80 px-2.5 py-0.5 rounded-lg">
                                  {combinedLabel}
                                </span>
                              );
                            })()}
                            {c.admissionType && c.admissionType !== 'Routine Admission' && (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                                {c.admissionType}
                              </span>
                            )}
                            {!c.isIpd && !c.isIPDDailyReview && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg">
                                OPD
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-400 font-sans block mt-0.5 whitespace-nowrap">
                            {c.isIPDDailyReview 
                              ? 'IPD Daily Consultation' 
                              : (c.isIPDAdmission || c.isIpd 
                                  ? 'In-Patient Department (IPD)' 
                                  : (c.doctorSpecialization || 'General OPD'))}
                          </span>
                        </div>
                      </div>

                      {/* Right Section: Badges & Section Buttons */}
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto sm:shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-between sm:justify-end">
                        {/* Status Pill */}
                        <span className={`text-[10px] font-extrabold px-2.5 sm:px-3 py-1 rounded-full uppercase tracking-wider border shrink-0 ${
                          ['Completed', 'COMPLETED', 'Discharged'].includes(c.status)
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-blue-700 bg-blue-50 border-blue-200'
                        }`}>
                          {c.status || 'COMPLETED'}
                        </span>

                        {/* Prescription Pill */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePopup(prev => (prev?.visitId === c._id && prev?.type === 'rx') ? null : { visitId: c._id, type: 'rx' });
                          }}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-2xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 border cursor-pointer shrink-0 ${
                            isRxActive 
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs ring-2 ring-purple-300' 
                              : 'bg-purple-50 text-purple-700 border-purple-200/80 hover:bg-purple-100'
                          }`}
                        >
                          <Pill className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          <span>Rx</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black shrink-0 ${
                            isRxActive ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {rxCount}
                          </span>
                        </button>

                        {/* Investigations Pill */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePopup(prev => (prev?.visitId === c._id && prev?.type === 'inv') ? null : { visitId: c._id, type: 'inv' });
                          }}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-2xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 border cursor-pointer shrink-0 ${
                            isInvActive 
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-300' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100'
                          }`}
                        >
                          <FlaskConical className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          <span>Tests</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black shrink-0 ${
                            isInvActive ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {invCount}
                          </span>
                        </button>

                        {/* Vitals Pill */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePopup(prev => (prev?.visitId === c._id && prev?.type === 'vitals') ? null : { visitId: c._id, type: 'vitals' });
                          }}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-2xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 border cursor-pointer shrink-0 ${
                            isVitalsActive 
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs ring-2 ring-rose-300' 
                              : 'bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-rose-100'
                          }`}
                        >
                          <HeartPulse className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          <span>Vitals</span>
                        </button>
                      </div>
                    </div>

                    {/* Middle Section: Diagnosis & Chief Complaint */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">PRIMARY DIAGNOSIS</span>
                        <span className="font-bold text-[#2F63F2] text-sm block mt-0.5">
                          {c.primaryDiagnosis || (c.diagnosis !== 'OPD Visit' ? c.diagnosis : null) || 'Clinical Consultation'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">CHIEF COMPLAINT</span>
                        <span className="font-bold text-slate-800 text-sm block mt-0.5">
                          {c.chiefComplaint && c.chiefComplaint !== 'OPD Visit' ? c.chiefComplaint : (c.symptoms || 'General Checkup')}
                        </span>
                      </div>
                    </div>

                    {/* Clinical Notes & Doctor Advice (1 row, 2 columns) */}
                    {(c.clinicalNotes || c.advice) && (
                      <div className={`pt-2 text-[11px] ${c.clinicalNotes && c.advice ? 'grid grid-cols-1 sm:grid-cols-2 gap-3.5' : 'space-y-1.5'}`}>
                        {c.clinicalNotes && (
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-slate-700 flex flex-col justify-start">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Clinical Notes</span>
                            <span className="text-slate-800 font-medium block mt-0.5 whitespace-pre-line leading-relaxed">{c.clinicalNotes}</span>
                          </div>
                        )}
                        {c.advice && (
                          <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-slate-700 flex flex-col justify-start">
                            <span className="text-[9px] font-bold text-[#2F63F2] uppercase tracking-wider block">Doctor Advice / General Instructions</span>
                            <span className="text-slate-800 font-medium block mt-0.5 whitespace-pre-line leading-relaxed">{c.advice}</span>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  {/* Small Popup within this particular visit date of card */}
                  {isAnyPopupActive && activePopup && (
                    <>
                      {/* Click-outside backdrop */}
                      <div 
                        className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-[0.5px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopup(null);
                        }}
                      />

                      {/* Small Popup Dialog Anchored to this Visit Card */}
                      <div 
                        className="absolute z-50 top-14 sm:top-16 right-2 sm:right-4 w-[calc(100%-16px)] sm:w-[500px] max-w-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 duration-150 text-left font-sans text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Popup Header */}
                        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            {activePopup.type === 'rx' && (
                              <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
                                <Pill className="w-4 h-4" />
                              </span>
                            )}
                            {activePopup.type === 'inv' && (
                              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                                <FlaskConical className="w-4 h-4" />
                              </span>
                            )}
                            {activePopup.type === 'vitals' && (
                              <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                                <HeartPulse className="w-4 h-4" />
                              </span>
                            )}
                            <div>
                              <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                                {activePopup.type === 'rx' && `Prescriptions (${rxCount})`}
                                {activePopup.type === 'inv' && `Requested Investigations (${invCount})`}
                                {activePopup.type === 'vitals' && 'Recorded Vitals'}
                              </h5>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePopup(null);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Close"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Popup Content: Rx */}
                        {activePopup.type === 'rx' && (
                          <div className="space-y-2">
                            {rxList.length === 0 ? (
                              <div className="py-6 text-center text-slate-400">
                                <Pill className="w-8 h-8 text-slate-300 mx-auto mb-1.5 opacity-60" />
                                <p className="text-xs font-semibold">No medicines prescribed for this visit.</p>
                              </div>
                            ) : (
                              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                <div className="overflow-x-auto max-w-full max-h-[220px]">
                                  <table className="w-full text-left text-xs font-sans min-w-[440px]">
                                    <thead className="bg-slate-100/90 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap sticky top-0 bg-slate-100 z-10">
                                      <tr>
                                        <th className="p-2.5">MEDICINE</th>
                                        <th className="p-2.5">DOSAGE</th>
                                        <th className="p-2.5">DURATION</th>
                                        <th className="p-2.5">TIMING</th>
                                        <th className="p-2.5">QTY</th>
                                        <th className="p-2.5">REMARKS</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-[11px] font-medium text-slate-800">
                                      {rxList.map((m, mIdx) => (
                                        <tr key={mIdx} className="hover:bg-slate-50 transition-colors">
                                          <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">{m.medicineName}</td>
                                          <td className="p-2.5 font-mono text-purple-700 font-bold whitespace-nowrap">
                                            {m.dosage || `${m.morning || '1'}-${m.afternoon || '0'}-${m.night || '1'}`}
                                          </td>
                                          <td className="p-2.5 text-slate-600 whitespace-nowrap">{m.duration || '—'}</td>
                                          <td className="p-2.5 text-slate-600 whitespace-nowrap">{m.instructions || m.foodTiming || 'After Food'}</td>
                                          <td className="p-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">{m.quantity || 1}</td>
                                          <td className="p-2.5 text-slate-500 italic whitespace-nowrap">{m.notes || m.remarks || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Popup Content: Investigations */}
                        {activePopup.type === 'inv' && (
                          <div className="space-y-2">
                            {!invObj || (Array.isArray(invObj) && invObj.length === 0) ? (
                              <div className="py-6 text-center text-slate-400">
                                <FlaskConical className="w-8 h-8 text-slate-300 mx-auto mb-1.5 opacity-60" />
                                <p className="text-xs font-semibold">No investigations requested for this visit.</p>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2 py-1 max-h-[220px] overflow-y-auto">
                                {(Array.isArray(invObj) ? invObj : [invObj]).map((inv, invIdx) => (
                                  <div 
                                    key={invIdx} 
                                    className="bg-emerald-50 border border-emerald-200/90 text-emerald-900 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs"
                                  >
                                    <FlaskConical className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>{typeof inv === 'string' ? inv : (inv.investigationName || inv.name || inv.testName)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Popup Content: Vitals */}
                        {activePopup.type === 'vitals' && (
                          <div className="space-y-2">
                            {!vitalsObj || !Object.values(vitalsObj).some(Boolean) ? (
                              <div className="py-6 text-center text-slate-400">
                                <HeartPulse className="w-8 h-8 text-slate-300 mx-auto mb-1.5 opacity-60" />
                                <p className="text-xs font-semibold">No vitals recorded for this visit.</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">BP</span>
                                  <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                    {(() => {
                                      if (vitalsObj?.bpSystolic && vitalsObj?.bpDiastolic) return `${vitalsObj.bpSystolic}/${vitalsObj.bpDiastolic}`;
                                      if (vitalsObj?.bp && String(vitalsObj.bp).trim()) return String(vitalsObj.bp).trim();
                                      if (vitalsObj?.bloodPressure && String(vitalsObj.bloodPressure).trim()) return String(vitalsObj.bloodPressure).trim();
                                      if (vitalsObj?.bpSystolic) return `${vitalsObj.bpSystolic}/—`;
                                      return 'N/A';
                                    })()}
                                  </strong>
                                </div>

                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">PULSE</span>
                                  <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                    {(() => {
                                      const val = vitalsObj?.pulse || vitalsObj?.heartRate || vitalsObj?.pulseRate;
                                      if (!val || String(val).trim() === '' || String(val).trim() === '0') return 'N/A';
                                      const str = String(val).trim();
                                      return str.toLowerCase().includes('bpm') ? str : `${str} bpm`;
                                    })()}
                                  </strong>
                                </div>

                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">TEMP</span>
                                  <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                    {(() => {
                                      const val = vitalsObj?.temperature || vitalsObj?.temp;
                                      if (!val || String(val).trim() === '' || String(val).trim() === '0') return 'N/A';
                                      const str = String(val).trim();
                                      return (str.includes('°') || str.toLowerCase().includes('f') || str.toLowerCase().includes('c')) ? str : `${str} °F`;
                                    })()}
                                  </strong>
                                </div>

                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">SPO2</span>
                                  <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                    {(() => {
                                      const val = vitalsObj?.spo2 || vitalsObj?.oxygenSaturation;
                                      if (!val || String(val).trim() === '' || String(val).trim() === '0') return 'N/A';
                                      const str = String(val).trim();
                                      return str.includes('%') ? str : `${str}%`;
                                    })()}
                                  </strong>
                                </div>

                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">WEIGHT</span>
                                  <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                    {(() => {
                                      const val = vitalsObj?.weight || vitalsObj?.wt;
                                      if (!val || String(val).trim() === '' || String(val).trim() === '0') return 'N/A';
                                      const str = String(val).trim();
                                      return str.toLowerCase().includes('kg') ? str : `${str} kg`;
                                    })()}
                                  </strong>
                                </div>

                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">HEIGHT</span>
                                  <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                    {(() => {
                                      const val = vitalsObj?.height || vitalsObj?.ht;
                                      if (!val || String(val).trim() === '' || String(val).trim() === '0') return 'N/A';
                                      const str = String(val).trim();
                                      return str.toLowerCase().includes('cm') ? str : `${str} cm`;
                                    })()}
                                  </strong>
                                </div>

                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center col-span-2">
                                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">BMI</span>
                                  <strong className="text-blue-600 font-mono text-xs block mt-0.5">
                                    {(() => {
                                      if (vitalsObj?.bmi && String(vitalsObj.bmi).trim() && String(vitalsObj.bmi).trim() !== 'N/A' && String(vitalsObj.bmi).trim() !== '0') {
                                        const str = String(vitalsObj.bmi).trim();
                                        return str.toLowerCase().includes('kg/m') ? str : `${str} kg/m²`;
                                      }
                                      const w = parseFloat(vitalsObj?.weight || vitalsObj?.wt);
                                      const h = parseFloat(vitalsObj?.height || vitalsObj?.ht);
                                      if (w > 0 && h > 0) {
                                        const hMeter = h > 3 ? h / 100 : h;
                                        const calc = (w / (hMeter * hMeter)).toFixed(1);
                                        if (!isNaN(calc) && isFinite(calc)) return `${calc} kg/m²`;
                                      }
                                      return 'N/A';
                                    })()}
                                  </strong>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                </div>
              );
            })
          )}
        </div>

        {/* Footer with clean CLOSE button matching screenshot */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-white flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-[#2F63F2] hover:bg-blue-50 text-[#2F63F2] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-2xs"
          >
            CLOSE
          </button>
        </div>

      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
};

export default PatientHistoryDrawer;
