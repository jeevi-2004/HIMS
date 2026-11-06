import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBillingSettings } from '../context/BillingSettingsContext';
import Table from '../components/Table';
import Modal from '../components/Modal';
import PatientHistoryDrawer from '../components/PatientHistoryDrawer';
import { History as HistoryIconLucide } from 'lucide-react';
import Button from '../components/Button';
import TransferToIPDModal from '../components/ipd/TransferToIPDModal';
import { isIpdAvailable } from '../utils/featureUtils';
import { 
  Eye, Printer, CheckCircle2, Stethoscope, Pill, FileText, 
  Activity, Calendar, Clock, User, HeartPulse, ChevronRight, 
  AlertCircle, History, Sparkles, Phone, Droplet, Thermometer, Hash,
  Bed
} from 'lucide-react';

const formatSafeDate = (d, locale = 'en-GB') => {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString(locale);
  } catch {
    return '—';
  }
};

const formatDoctorName = (docName) => {
  if (!docName) return 'Doctor';
  const nameStr = typeof docName === 'string' 
    ? docName 
    : (typeof docName === 'object' && docName?.name ? docName.name : 'Doctor');
  return String(nameStr || 'Doctor').replace(/^Dr\.?\s*/i, '');
};

const getVisitConsultDate = (row) => {
  if (!row) return null;
  const nowMs = Date.now();
  const rowDate = row.date ? new Date(row.date) : null;
  const isFutureDate = rowDate && !isNaN(rowDate.getTime()) && rowDate.getTime() > nowMs + 86400000;

  return (
    row.consultationDate ||
    row.consultation?.createdAt ||
    row.consultation?.consultationDate ||
    row.workflow?.timestamps?.consultationCompletedAt ||
    row.workflow?.timestamps?.completedAt ||
    row.sentToPharmacyAt ||
    row.completedAt ||
    (!isFutureDate ? row.date : null) ||
    row.createdAt ||
    row.date
  );
};

const DoctorCompletedVisits = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { billingSettings } = useBillingSettings();
  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

  const isPlan1Hospital = 
    user?.hospital?.opdOperationMode === 'TOKEN_ONLY' || 
    user?.opdOperationMode === 'TOKEN_ONLY' || 
    billingSettings?.opdOperationMode === 'TOKEN_ONLY' ||
    user?.hospital?.planName?.includes('Plan 1') ||
    user?.hospital?.subscriptionPlan?.includes('Plan 1');

  const [selectedVisit, setSelectedVisit] = useState(null);
  const [activeVisitId, setActiveVisitId] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [transferToIpdApp, setTransferToIpdApp] = useState(null);
  const [historyPatient, setHistoryPatient] = useState(null);

  // Fetch completed appointments for this doctor (Strictly OPD completed visits)
  const { data: visits, isLoading: visitsLoading } = useQuery({
    queryKey: ['doctorCompletedVisitsHistory', user?._id],
    queryFn: async () => {
      const appRes = await api.get(`/operations/appointments?doctorId=${user?._id}&status=Completed`).catch(() => ({ data: { data: [] } }));
      const rawOpd = appRes.data?.data || [];
      const opdList = (!user?._id) ? rawOpd : rawOpd.filter(a => {
        if (!a) return false;
        const docId = a.doctorId?._id || a.doctorId;
        return !docId || String(docId) === String(user._id);
      });
      const filtered = opdList
        .filter(app => !app.isIpd && !app.isIPDAdmission && !app.ipdAdmissionId && (app.consultationType || '').toUpperCase() !== 'IPD')
        .sort((a, b) => {
          const dateA = new Date(getVisitConsultDate(a) || 0).getTime();
          const dateB = new Date(getVisitConsultDate(b) || 0).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
        });

      // Safety check: ensure each visit on each consult date has an original unique token (validating male & female counts)
      const seenTokensByDate = new Map();
      return filtered.map(app => {
        const cDate = getVisitConsultDate(app);
        const dKey = cDate ? new Date(cDate).toISOString().split('T')[0] : 'general';
        if (!seenTokensByDate.has(dKey)) seenTokensByDate.set(dKey, new Set());
        const dateSet = seenTokensByDate.get(dKey);
        let token = String(app.tokenNumber || '').trim();
        if (!token || token === 'N/A' || dateSet.has(token)) {
          let num = 1;
          const isEmg = Boolean(app.isEmergency) || String(token).startsWith('EMG');
          const prefix = isEmg ? 'EMG' : 'OP';
          let candidate = `${prefix}${String(num).padStart(3, '0')}`;
          while (dateSet.has(candidate)) {
            num++;
            candidate = `${prefix}${String(num).padStart(3, '0')}`;
          }
          token = candidate;
        }
        dateSet.add(token);
        return {
          ...app,
          tokenNumber: token
        };
      });
    },
    enabled: !!user?._id
  });

  const currentVisitId = activeVisitId || selectedVisit?._id;
  const targetPatientId = selectedVisit?.patientId?._id || selectedVisit?.patientId;

  // 1. Fetch visit consultation snapshot (returns rich snapshot for this appointment or consultation)
  const { data: visitSnapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: ['completedVisitSnapshot', currentVisitId],
    queryFn: async () => {
      if (!currentVisitId) return null;
      try {
        const res = await api.get(`/operations/consultations/${currentVisitId}/snapshot`);
        return res.data?.data || null;
      } catch (e) {
        console.warn('Failed to fetch consultation snapshot:', e);
        return null;
      }
    },
    enabled: !!isDetailOpen && !!currentVisitId
  });

  // 2. Fetch full patient history (returns all past and active consultations, visits, prescriptions for the patient)
  const { data: patientHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['patientHistoryForCompletedDetail', targetPatientId],
    queryFn: async () => {
      if (!targetPatientId) return null;
      try {
        const res = await api.get(`/operations/patients/${targetPatientId}/history`);
        return res.data?.data || null;
      } catch (e) {
        console.warn('Failed to fetch patient history:', e);
        return null;
      }
    },
    enabled: !!isDetailOpen && !!targetPatientId
  });

  // Consolidate all patient visits for timeline and past-visit inspection
  const allPatientVisits = useMemo(() => {
    if (!patientHistory) return [];
    const list = Array.isArray(patientHistory)
      ? patientHistory
      : Array.isArray(patientHistory?.snapshots)
        ? patientHistory.snapshots
        : Array.isArray(patientHistory?.consultations)
          ? patientHistory.consultations
          : Array.isArray(patientHistory?.history)
            ? patientHistory.history
            : [];
    
    const seen = new Set();
    const result = [];
    for (const v of list) {
      if (!v) continue;
      const vId = String(v.appointmentId?._id || v.appointmentId || v._id || '');
      if (vId && !seen.has(vId)) {
        seen.add(vId);
        result.push(v);
      }
    }
    return result.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
  }, [patientHistory]);

  // Find matching visit from history if current view is switched
  const activeHistoryVisit = useMemo(() => {
    if (!currentVisitId || allPatientVisits.length === 0) return null;
    return allPatientVisits.find(v => {
      if (!v) return false;
      const vId = v._id ? String(v._id) : null;
      const apptId = v.appointmentId ? String(v.appointmentId._id || v.appointmentId) : null;
      return (vId && vId === String(currentVisitId)) || (apptId && apptId === String(currentVisitId));
    }) || null;
  }, [currentVisitId, allPatientVisits]);

  // Unified active case data merged across snapshot, history, and selected appointment
  const activeCaseData = useMemo(() => {
    const snap = (visitSnapshot && typeof visitSnapshot === 'object') ? visitSnapshot : {};
    const hist = (activeHistoryVisit && typeof activeHistoryVisit === 'object') ? activeHistoryVisit : {};
    const base = (selectedVisit && currentVisitId && String(selectedVisit._id) === String(currentVisitId)) 
      ? (selectedVisit || {}) 
      : {};

    // Patient info
    const patientObj = (snap.patientId && typeof snap.patientId === 'object')
      ? snap.patientId
      : (hist.patientId && typeof hist.patientId === 'object')
        ? hist.patientId
        : (selectedVisit?.patientId && typeof selectedVisit.patientId === 'object')
          ? selectedVisit.patientId
          : {};
    const patientName = snap.patientName || patientObj.name || (typeof selectedVisit?.patientId === 'string' ? 'Patient' : 'Patient');
    const uhid = snap.uhid || patientObj.uhid || 'N/A';
    const age = snap.age ?? patientObj.age ?? null;
    const gender = snap.gender || patientObj.gender || null;
    const mobile = patientObj.mobileNumber || patientObj.phone || null;

    // Doctor info
    const doctorObj = (snap.doctorId && typeof snap.doctorId === 'object')
      ? snap.doctorId
      : (hist.doctorId && typeof hist.doctorId === 'object')
        ? hist.doctorId
        : (selectedVisit?.doctorId && typeof selectedVisit.doctorId === 'object')
          ? selectedVisit.doctorId
          : {};
    const doctorName = snap.doctorName || doctorObj.name || (typeof selectedVisit?.doctorId === 'string' ? selectedVisit.doctorId : '') || user?.name || 'Attending Doctor';
    const departmentName = snap.department || doctorObj.departmentName || doctorObj.doctorProfile?.specialization || 'General OPD';

    // Visit date & token
    const visitDate = snap.consultationDate || getVisitConsultDate(base) || hist.date || hist.createdAt || new Date();
    const tokenNumber = snap.tokenNumber || hist.tokenNumber || base.tokenNumber || 'N/A';
    const visitStatus = snap.consultationStatus || hist.status || base.status || 'Completed';

    // Chief Complaints
    const chiefComplaint = base.isIpd
      ? (base.chiefComplaint || base.diagnosis || 'IPD Clinical Care')
      : (snap.chiefComplaint || hist.chiefComplaint || hist.symptoms || base.chiefComplaint || base.diagnosis || base.consultation?.chiefComplaint || base.consultation?.diagnosis || base.symptoms || snap.diagnosis || hist.diagnosis || (Array.isArray(snap.diagnoses) && snap.diagnoses.filter(Boolean).join(', ')) || (Array.isArray(base.diagnoses) && base.diagnoses.filter(Boolean).join(', ')) || '');
    const hpi = snap.historyOfPresentIllness || hist.historyOfPresentIllness || '';
    const examinationFindings = snap.examinationFindings || hist.examinationFindings || '';

    // Diagnosis
    const diagnosis = base.isIpd
      ? (base.diagnosis || base.chiefComplaint || 'Inpatient Clinical Care')
      : (snap.diagnosis || hist.diagnosis || hist.primaryDiagnosis || base.diagnosis || base.consultation?.diagnosis || base.consultation?.primaryDiagnosis || (Array.isArray(snap.diagnoses) && snap.diagnoses.filter(Boolean).join(', ')) || (Array.isArray(base.diagnoses) && base.diagnoses.filter(Boolean).join(', ')) || (chiefComplaint ? `OPD: ${chiefComplaint}` : 'Clinical Consultation'));
    const clinicalNotes = base.isIpd
      ? (base.treatmentSummary || base.clinicalNotes || '')
      : (snap.clinicalNotes || hist.clinicalNotes || hist.notes || base.notes || '');

    // Doctor Advice
    const advice = base.isIpd
      ? (base.dischargeInstructions || base.advice || '')
      : (snap.advice || hist.advice || hist.clinicalNotes || snap.clinicalNotes || base.advice || '');
    const generalInstructions = snap.generalInstructions || hist.generalInstructions || '';
    const dietAdvice = snap.dietAdvice || hist.dietAdvice || '';
    const restrictions = snap.restrictions || hist.restrictions || '';
    const followupDate = snap.followupDate || hist.followupDate || null;

    // Prescriptions (normalize medicines array)
    const rawPrescriptions = (Array.isArray(snap.prescriptions) && snap.prescriptions.length > 0)
      ? snap.prescriptions
      : (Array.isArray(hist.prescriptions) && hist.prescriptions.length > 0)
        ? hist.prescriptions
        : (Array.isArray(hist.items) && hist.items.length > 0)
          ? hist.items
          : (Array.isArray(base.prescriptions) && base.prescriptions.length > 0)
            ? base.prescriptions
            : (Array.isArray(base.items) && base.items.length > 0)
              ? base.items
              : [];

    const prescriptions = rawPrescriptions.map(p => {
      if (!p) return null;
      if (typeof p === 'string') {
        return {
          name: p,
          dose: 'As Directed',
          freq: '',
          duration: '—',
          instructions: '—',
          remarks: '',
          quantity: 1
        };
      }
      const name = p.medicineName || p.name || (typeof p.medicineId === 'object' ? p.medicineId?.name : '') || 'Medication';
      const dose = p.dosage || p.dose || (p.morning || p.afternoon || p.night ? `${p.morning || '0'}-${p.afternoon || '0'}-${p.night || '0'}` : 'As Directed');
      const freq = p.frequency || '';
      const duration = p.duration || '—';
      const instructions = p.instructions || p.timing || p.foodTiming || p.food || '—';
      const remarks = p.remarks || p.notes || '';
      return {
        name,
        dose,
        freq,
        duration,
        instructions,
        remarks,
        quantity: p.quantity
      };
    }).filter(Boolean);

    // Vitals
    const vitals = (snap.vitals && typeof snap.vitals === 'object') 
      ? snap.vitals 
      : (hist.vitals && typeof hist.vitals === 'object') 
        ? hist.vitals 
        : (base.vitals && typeof base.vitals === 'object') 
          ? base.vitals 
          : {};

    // Investigations
    const investigations = Array.isArray(snap.investigations)
      ? snap.investigations
      : Array.isArray(hist.investigations)
        ? hist.investigations
        : Array.isArray(base.investigations)
          ? base.investigations
          : [];

    return {
      patientName,
      uhid,
      age,
      gender,
      mobile,
      doctorName,
      departmentName,
      visitDate,
      tokenNumber,
      visitStatus,
      chiefComplaint,
      hpi,
      examinationFindings,
      diagnosis,
      clinicalNotes,
      advice,
      generalInstructions,
      dietAdvice,
      restrictions,
      followupDate,
      prescriptions,
      vitals,
      investigations
    };
  }, [visitSnapshot, activeHistoryVisit, selectedVisit, currentVisitId, user]);

  return (
    <div className="space-y-5 text-left px-4 sm:px-5 md:px-6 py-4 sm:py-5 bg-[#F8FAFC] min-h-screen">
      
      {/* Page Heading Outside Content Card */}
      <div className="pb-2 border-b border-[#E5E7EB]">
        <h1 className="text-xl font-bold text-[#111827] flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          Completed Visits
        </h1>
        <p className="text-xs text-[#6B7280] mt-1 font-medium">
          Monitor finalized case file summaries, chief complaints, prescriptions, and historical consultations.
        </p>
      </div>

      {/* Main Content Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-4 sm:p-5 shadow-card-soft space-y-4">
        
        {/* Table Container */}
        <div className="hidden sm:block border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
          <Table
            headers={[
              { 
                key: 'date', 
                label: 'Consult Date', 
                render: (row) => <span className="font-mono text-xs text-slate-700">{formatSafeDate(getVisitConsultDate(row))}</span> 
              },
              { 
                key: 'tokenNumber', 
                label: 'Token / IPD No', 
                render: (row) => (
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#2F63F2] font-mono">#{row?.tokenNumber || row?.admissionId || 'N/A'}</span>
                    {row?.isIpd && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                        IPD
                      </span>
                    )}
                  </div>
                ) 
              },
              { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold font-mono text-[#111827]">{row?.patientId?.uhid || '—'}</span> },
              { key: 'patientId.name', label: 'Patient Name', render: (row) => <span className="font-bold text-[#111827]">{row?.patientId?.name || (typeof row?.patientId === 'string' ? 'Patient' : '—')}</span> },
              { 
                key: 'patientId.age', 
                label: 'Age / Gender', 
                render: (row) => {
                  const p = (row?.patientId && typeof row.patientId === 'object') ? row.patientId : {};
                  const age = p.age || row.age;
                  const gender = p.gender || row.gender;
                  const bloodGroup = p.bloodGroup || row.bloodGroup || row.patientBloodGroup;
                  const genderLetter = gender ? (gender.length === 1 ? gender.toUpperCase() : gender.charAt(0).toUpperCase()) : '';
                  const ageGenderText = age ? `${age} yrs / ${genderLetter || gender}` : (genderLetter || '—');
                  return (
                    <div className="flex flex-col items-start gap-0.5 whitespace-nowrap">
                      <span className="text-slate-700 font-semibold text-xs">
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
                }
              },
              { 
                key: 'chiefComplaint', 
                label: 'Chief Complaint / Diagnosis', 
                render: (row) => {
                  const resolvedComplaint = 
                    row?.chiefComplaint || 
                    row?.diagnosis || 
                    (Array.isArray(row?.diagnoses) && row.diagnoses.filter(Boolean).join(', ')) || 
                    row?.primaryDiagnosis ||
                    row?.consultation?.chiefComplaint || 
                    row?.consultation?.diagnosis || 
                    (Array.isArray(row?.consultation?.diagnoses) && row.consultation.diagnoses.filter(Boolean).join(', ')) ||
                    row?.consultation?.primaryDiagnosis ||
                    row?.symptoms ||
                    row?.consultation?.symptoms ||
                    row?.reason;

                  return resolvedComplaint ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${row?.isIpd ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                      {row?.isIpd ? <Bed className="w-3 h-3 text-purple-600" /> : <Activity className="w-3 h-3" />}
                      {String(resolvedComplaint)}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs italic">{row?.isIpd ? 'IPD Inpatient Care' : 'OPD Consultation'}</span>
                  );
                }
              },
              { 
                key: 'vitals', 
                label: 'BP / Pulse', 
                render: (row) => {
                  const v = (row?.vitals && typeof row.vitals === 'object') ? row.vitals : null;
                  return v && v.bpSystolic ? (
                    <span className="font-mono text-xs text-slate-700">{v.bpSystolic}/{v.bpDiastolic || '-'} ({v.pulse || '-'})</span>
                  ) : (
                    <span className="text-[#6B7280] font-mono text-xs">No Vitals</span>
                  );
                }
              }
            ]}
            data={visits || []}
            actions={[
              {
                label: 'View Case Detail',
                icon: Eye,
                onClick: (row) => {
                  setSelectedVisit(row);
                  setActiveVisitId(row?._id);
                  setIsDetailOpen(true);
                }
              },
              {
                label: 'Visit History',
                icon: HistoryIconLucide,
                onClick: (row) => {
                  const pat = (row.patientId && typeof row.patientId === 'object')
                    ? row.patientId
                    : (row.patient && typeof row.patient === 'object')
                      ? row.patient
                      : { _id: row.patientId?._id || row.patientId || row.patient, name: row.patientId?.name || row.patientName };
                  setHistoryPatient(pat);
                }
              },
              {
                label: 'Transfer to IPD',
                icon: Bed,
                show: (row) => isIpdEnabled && !row?.isIpd && row?.status !== 'Admitted' && row?.queueStatus !== 'Admitted',
                onClick: (row) => setTransferToIpdApp(row)
              }
            ]}
            loading={visitsLoading}
          />
        </div>

        {/* Mobile Stacked Card View */}
        <div className="block sm:hidden space-y-3 mt-2">
          {visitsLoading ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">Loading completed visits...</div>
          ) : !visits || visits.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">No completed visits found.</div>
          ) : (
            visits.map((visit) => {
              if (!visit) return null;
              const v = (visit.vitals && typeof visit.vitals === 'object') ? visit.vitals : null;
              const hasVitals = v && v.bpSystolic;
              const p = (visit.patientId && typeof visit.patientId === 'object') ? visit.patientId : {};
              const pName = p.name || (typeof visit.patientId === 'string' ? 'Patient' : 'Unknown Patient');

              return (
                <div key={visit._id} className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3 shadow-xs text-left">
                  {/* Header: Patient Name & Token */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-left">
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">{pName}</h4>
                      <p className="text-slate-500 text-xs mt-1">
                        {p.uhid ? `UHID: ${p.uhid} | ` : ''}
                        {p.age ? `${p.age} Yrs` : ''} 
                        {p.gender ? ` / ${p.gender}` : ''}
                      </p>
                    </div>
                    <span className="font-bold text-[#2F63F2] font-mono text-xs bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shrink-0">
                      #{visit.tokenNumber || 'N/A'}
                    </span>
                  </div>

                  {/* Chief Complaint / Diagnosis if present */}
                  {(() => {
                    const resolvedComplaint = 
                      visit.chiefComplaint || 
                      visit.diagnosis || 
                      (Array.isArray(visit.diagnoses) && visit.diagnoses.filter(Boolean).join(', ')) || 
                      visit.primaryDiagnosis ||
                      visit.consultation?.chiefComplaint || 
                      visit.consultation?.diagnosis || 
                      (Array.isArray(visit.consultation?.diagnoses) && visit.consultation.diagnoses.filter(Boolean).join(', ')) ||
                      visit.consultation?.primaryDiagnosis ||
                      visit.symptoms ||
                      visit.consultation?.symptoms ||
                      visit.reason;

                    return resolvedComplaint ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                        <Activity className="w-3.5 h-3.5 text-amber-600" />
                        <span>{String(resolvedComplaint)}</span>
                      </div>
                    ) : null;
                  })()}

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 border-t border-slate-100 pt-3 text-xs text-slate-600 text-left">
                    <div className="text-left">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Consult Date</span>
                      <span className="font-mono text-slate-700">{formatSafeDate(getVisitConsultDate(visit))}</span>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">BP / Pulse</span>
                      <span className="font-mono text-slate-700">
                        {hasVitals ? `${v.bpSystolic}/${v.bpDiastolic || '-'} (${v.pulse || '-'})` : 'No Vitals'}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="border-t border-slate-100 pt-3 text-left space-y-2">
                    <button
                      onClick={() => {
                        setSelectedVisit(visit);
                        setActiveVisitId(visit._id);
                        setIsDetailOpen(true);
                      }}
                      className="w-full py-2 border border-[#2F63F2] text-[#2F63F2] hover:bg-[#2F63F2]/5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all duration-150 active:scale-95 text-center flex items-center justify-center gap-1.5 focus:outline-none cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Case Detail
                    </button>
                    <button
                      onClick={() => {
                        const pat = (visit.patientId && typeof visit.patientId === 'object')
                          ? visit.patientId
                          : (visit.patient && typeof visit.patient === 'object')
                            ? visit.patient
                            : { _id: visit.patientId || visit.patient, name: pName };
                        setHistoryPatient(pat);
                      }}
                      className="w-full py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all duration-150 active:scale-95 text-center flex items-center justify-center gap-1.5 focus:outline-none cursor-pointer"
                    >
                      <HistoryIconLucide className="w-3.5 h-3.5 text-slate-500" />
                      Visit History
                    </button>
                    {isIpdEnabled && !visit?.isIpd && visit?.status !== 'Admitted' && visit?.queueStatus !== 'Admitted' && (
                      <button
                        onClick={() => setTransferToIpdApp(visit)}
                        className="w-full py-2 bg-[#2F63F2] text-white hover:bg-blue-700 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all duration-150 active:scale-95 text-center flex items-center justify-center gap-1.5 focus:outline-none cursor-pointer shadow-xs"
                      >
                        <Bed className="w-3.5 h-3.5" />
                        Transfer to IPD
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Comprehensive Patient Consultation Case Details Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => { 
          setIsDetailOpen(false); 
          setSelectedVisit(null); 
          setActiveVisitId(null); 
        }} 
        title="Patient Consultation Case Details" 
        size="xl"
      >
        {selectedVisit && (
          <div className="space-y-5 text-left">
            
            {/* 1. Patient Profile Header Card */}
            <div className="p-4 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 border border-[#E5E7EB] rounded-2xl shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#2F63F2] text-white font-extrabold flex items-center justify-center text-lg shadow-sm">
                    {activeCaseData.patientName ? activeCaseData.patientName.charAt(0).toUpperCase() : 'P'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#111827]">{activeCaseData.patientName}</h3>
                      <span className="px-2.5 py-0.5 bg-blue-100/70 text-[#2F63F2] font-mono font-bold text-xs rounded-full border border-blue-200">
                        {activeCaseData.uhid}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {activeCaseData.age ? `${activeCaseData.age} Yrs` : ''} 
                      {activeCaseData.gender ? ` • ${activeCaseData.gender}` : ''}
                      {activeCaseData.mobile ? ` • Phone: ${activeCaseData.mobile}` : ''}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-3 py-1 bg-white border border-slate-200 rounded-xl text-slate-700 shadow-2xs font-semibold flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#2F63F2]" />
                    {formatSafeDate(activeCaseData.visitDate)}
                  </span>
                  <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {activeCaseData.visitStatus}
                  </span>
                </div>
              </div>

              {/* Sub-bar: Attending Doctor & Token */}
              <div className="pt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attending Clinician:</span>
                  <strong className="text-slate-800 font-medium">{activeCaseData.doctorName}</strong>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500">{activeCaseData.departmentName}</span>
                </div>
                <div className="font-mono text-xs text-[#2F63F2] font-bold">
                  Token: #{activeCaseData.tokenNumber}
                </div>
              </div>
            </div>

            {/* 2. Patient Visit Switcher (If patient already visited previously) */}
            {allPatientVisits.length > 1 && (
              <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-amber-700" />
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Patient Consultation History ({allPatientVisits.length} Visits on File)
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-medium">Click any visit to view complete case record</span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar">
                  {allPatientVisits.map((v, idx) => {
                    if (!v) return null;
                    const vId = String(v._id || idx);
                    const isSelected = String(currentVisitId) === vId || String(v.appointmentId?._id || v.appointmentId) === String(currentVisitId);
                    const dateStr = formatSafeDate(v.createdAt || v.date);
                    const isCompleted = ['Completed', 'COMPLETED', 'past', 'Dispensed'].includes(v.status);
                    return (
                      <button
                        key={vId}
                        type="button"
                        onClick={() => setActiveVisitId(vId)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-[#2F63F2] text-white shadow-xs font-bold scale-[1.02]'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : isCompleted ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                        <span>{dateStr}</span>
                        {v.tokenNumber && <span>(#{v.tokenNumber})</span>}
                        {isSelected && <span className="text-[10px] opacity-90 font-sans uppercase">Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Clinical Case Form Details */}
            {snapshotLoading && historyLoading ? (
              <div className="text-center py-10 space-y-2">
                <div className="w-6 h-6 border-2 border-[#2F63F2] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs font-mono text-slate-500 font-medium">Retrieving detailed clinical consultation records...</p>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* Row A: Chief Complaints & Clinical Diagnosis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Chief Complaints Card */}
                  <div className="p-4 bg-white border border-amber-200/90 rounded-2xl shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-2 pb-2 border-b border-amber-100">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Chief Complaints & Presentation</h4>
                        <p className="text-[10px] text-slate-400">Patient reported symptoms and reasons for visit</p>
                      </div>
                    </div>

                    <div className="pt-1">
                      {activeCaseData.chiefComplaint ? (
                        <div className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl">
                          <p className="text-sm font-bold text-amber-950 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                            {activeCaseData.chiefComplaint}
                          </p>
                          {activeCaseData.hpi && (
                            <p className="text-xs text-slate-600 mt-2 font-mono">
                              <strong>History:</strong> {activeCaseData.hpi}
                            </p>
                          )}
                          {activeCaseData.examinationFindings && (
                            <p className="text-xs text-slate-600 mt-1 font-mono">
                              <strong>Findings:</strong> {activeCaseData.examinationFindings}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">
                          Routine consultation • No specific chief complaint documented.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Diagnosis & Clinical Notes Card */}
                  <div className="p-4 bg-white border border-blue-200/90 rounded-2xl shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#2F63F2] flex items-center justify-center">
                        <Stethoscope className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Diagnosis & Assessment</h4>
                        <p className="text-[10px] text-slate-400">Clinical assessment and diagnostic impression</p>
                      </div>
                    </div>

                    <div className="pt-1 space-y-2">
                      <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-xl">
                        <div className="text-[10px] font-bold text-[#2F63F2] uppercase tracking-wider">Primary Diagnosis</div>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{activeCaseData.diagnosis}</p>
                      </div>
                      
                      {activeCaseData.clinicalNotes && (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                          <strong className="text-slate-900 block text-[10px] uppercase tracking-wider mb-0.5">Clinical Case Notes:</strong>
                          <p className="leading-relaxed">{activeCaseData.clinicalNotes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Row B: Prescribed Medicines (Rx) - Plan 2 only */}
                {!isPlan1Hospital && (
                  <div className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                          <Pill className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            Prescribed Medicines (Rx)
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-mono font-bold rounded-full border border-emerald-200">
                              {activeCaseData.prescriptions.length} items
                            </span>
                          </h4>
                          <p className="text-[10px] text-slate-400">Dosage, frequency, duration, and administration instructions</p>
                        </div>
                      </div>
                    </div>

                    {activeCaseData.prescriptions.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {activeCaseData.prescriptions.map((med, idx) => (
                          <div key={idx} className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span className="text-emerald-600 font-bold">💊</span>
                                <span className="text-sm">{med.name}</span>
                              </div>
                              <span className="px-2 py-0.5 bg-white border border-slate-200 text-[#2F63F2] font-mono font-bold text-[10px] rounded-lg shrink-0">
                                {med.dose}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-mono pt-1">
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase">Duration</span>
                                <strong className="text-slate-800">{med.duration}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase">Timing / Food</span>
                                <strong className="text-slate-800">{med.instructions}</strong>
                              </div>
                            </div>

                            {med.remarks && (
                              <p className="text-[10px] text-slate-500 italic border-t border-slate-200/60 pt-1 mt-1">
                                Note: {med.remarks}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400 font-mono">
                        No prescription medicines issued for this consultation visit.
                      </div>
                    )}
                  </div>
                )}

                {/* Row C: Doctor Advice & Clinical Vitals - Plan 2 only */}
                {!isPlan1Hospital && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Doctor Advice Card */}
                    <div className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs space-y-2.5">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Doctor Advice & Patient Education</h4>
                          <p className="text-[10px] text-slate-400">Diet, physical care, precautions, and instructions</p>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1 text-xs">
                        {activeCaseData.advice ? (
                          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-indigo-950 font-medium leading-relaxed">
                            {activeCaseData.advice}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">
                            General wellness advice and clinical monitoring.
                          </p>
                        )}

                        {activeCaseData.generalInstructions && (
                          <p className="text-slate-600 text-xs font-mono">
                            <strong>Instructions:</strong> {activeCaseData.generalInstructions}
                          </p>
                        )}
                        
                        {activeCaseData.dietAdvice && (
                          <p className="text-slate-600 text-xs font-mono">
                            <strong>Diet:</strong> {activeCaseData.dietAdvice}
                          </p>
                        )}

                        {activeCaseData.followupDate && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-mono">
                            <span className="font-bold">Next Follow-Up Date:</span>
                            <strong className="text-emerald-700 font-bold">
                              📅 {formatSafeDate(activeCaseData.followupDate)}
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Clinical Vitals Card */}
                    <div className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs space-y-2.5">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <div className="w-7 h-7 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center">
                          <HeartPulse className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Clinical Vitals</h4>
                          <p className="text-[10px] text-slate-400">Biometric and physiological measurements recorded</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">BP Systolic/Dia</span>
                          <strong className="text-slate-800 font-mono mt-0.5 block">
                            {activeCaseData.vitals.bpSystolic ? `${activeCaseData.vitals.bpSystolic}/${activeCaseData.vitals.bpDiastolic || '-'}` : '—'}
                          </strong>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Pulse Rate</span>
                          <strong className="text-slate-800 font-mono mt-0.5 block">
                            {activeCaseData.vitals.pulse ? `${activeCaseData.vitals.pulse} bpm` : '—'}
                          </strong>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Temperature</span>
                          <strong className="text-slate-800 font-mono mt-0.5 block">
                            {activeCaseData.vitals.temperature ? `${activeCaseData.vitals.temperature} °F` : '—'}
                          </strong>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">SpO2 Oxygen</span>
                          <strong className="text-slate-800 font-mono mt-0.5 block">
                            {activeCaseData.vitals.spo2 ? `${activeCaseData.vitals.spo2}%` : '—'}
                          </strong>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Blood Sugar</span>
                          <strong className="text-slate-800 font-mono mt-0.5 block">
                            {activeCaseData.vitals.bloodSugar ? `${activeCaseData.vitals.bloodSugar} mg/dL` : '—'}
                          </strong>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Weight / Ht</span>
                          <strong className="text-slate-800 font-mono mt-0.5 block">
                            {activeCaseData.vitals.weight ? `${activeCaseData.vitals.weight}kg` : '—'} 
                            {activeCaseData.vitals.height ? ` / ${activeCaseData.vitals.height}cm` : ''}
                          </strong>
                        </div>
                      </div>
                    </div>

                  </div>
                )}

                {/* Row D: Ordered Investigations (if any) */}
                {activeCaseData.investigations && activeCaseData.investigations.length > 0 && (
                  <div className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs space-y-2">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      Diagnostic Investigations Ordered ({activeCaseData.investigations.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {activeCaseData.investigations.map((inv, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                          <div>
                            <strong className="text-slate-900">{inv.name || 'Investigation'}</strong>
                            <span className="text-[10px] text-slate-400 block font-mono">{inv.serviceType || 'Laboratory'}</span>
                          </div>
                          {inv.price ? <span className="font-mono text-slate-700">₹{inv.price}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Modal Bottom Action Controls */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <Button 
                onClick={() => { 
                  setIsDetailOpen(false); 
                  setSelectedVisit(null); 
                  setActiveVisitId(null); 
                }} 
                variant="secondary" 
                className="text-xs font-bold uppercase tracking-wider h-[38px] px-6"
              >
                Close
              </Button>
              {isIpdEnabled && selectedVisit?.status !== 'Admitted' && selectedVisit?.queueStatus !== 'Admitted' && (
                <Button
                  onClick={() => {
                    const appToTransfer = selectedVisit;
                    setIsDetailOpen(false);
                    setTransferToIpdApp(appToTransfer);
                  }}
                  variant="primary"
                  icon={Bed}
                  className="text-xs font-bold uppercase tracking-wider h-[38px] px-5 bg-[#2F63F2]"
                >
                  Transfer to IPD
                </Button>
              )}
            </div>

          </div>
        )}
      </Modal>

      {/* Transfer to IPD Modal */}
      {isIpdEnabled && (
        <TransferToIPDModal
          isOpen={Boolean(transferToIpdApp)}
          onClose={() => setTransferToIpdApp(null)}
          appointment={transferToIpdApp}
          onSuccess={() => {
            queryClient.invalidateQueries(['doctorCompletedVisitsHistory']);
          }}
        />
      )}

      {/* Patient Visit History Drawer */}
      <PatientHistoryDrawer
        isOpen={!!historyPatient}
        onClose={() => setHistoryPatient(null)}
        patient={historyPatient}
        title={historyPatient?.name ? `VISIT HISTORY - ${historyPatient.name.toUpperCase()}` : 'VISIT HISTORY'}
      />

    </div>
  );
};

export default DoctorCompletedVisits;
