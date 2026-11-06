import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Check,
  Stethoscope,
  HeartPulse,
  Activity,
  Calendar,
  Clock,
  Pill,
  Printer,
  ChevronDown,
  ChevronUp,
  X,
  FileCheck2,
  ClipboardList
} from 'lucide-react';
import toast from 'react-hot-toast';
import ipdService from '../../services/ipd/ipdService';

export const normalizeFoodTiming = (val) => {
  if (!val) return 'After Food';
  const str = String(val).trim().toLowerCase();
  if (str.includes('before') || str === 'bf' || str.startsWith('bf') || str === 'ac' || str.includes('empty') || str.includes('fasting')) {
    return 'Before Food';
  }
  if (str.includes('with') || str === 'wf' || str.startsWith('wf') || str === 'cc' || str.includes('during')) {
    return 'With Food';
  }
  if (str.includes('after') || str === 'af' || str.startsWith('af') || str === 'pc') {
    return 'After Food';
  }
  return 'After Food';
};

export const formatFoodTimingDisplay = (val) => {
  const norm = normalizeFoodTiming(val);
  if (norm === 'Before Food') return 'BF - Before Food';
  if (norm === 'With Food') return 'WF - With Food';
  return 'AF - After Food';
};

export const deduplicateReviews = (rawList) => {
  if (!Array.isArray(rawList)) return [];
  const sorted = [...rawList].sort((a, b) => {
    const da = new Date(a.reviewDate || a.createdAt || 0);
    const db = new Date(b.reviewDate || b.createdAt || 0);
    return da - db;
  });

  const seenIds = new Set();
  const seenConsultationIds = new Set();
  const seenSignatures = new Set();
  const reviews = [];

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const idKey = r._id ? String(r._id) : null;
    if (idKey && seenIds.has(idKey)) continue;

    if (r.consultationId) {
      const cId = String(r.consultationId);
      if (seenConsultationIds.has(cId)) continue;
      seenConsultationIds.add(cId);
    }

    // Clinical content signature to deduplicate identical consultation rounds
    const diagNorm = (r.diagnosis || '').trim().toLowerCase();
    const rxNorm = Array.isArray(r.prescriptions)
      ? r.prescriptions
          .map(p => `${(p.medicineName || '').trim().toLowerCase()}_${(p.dose || p.dosage || '').trim().toLowerCase()}_${p.quantity || ''}`)
          .sort()
          .join('|')
      : '';
    const vitalsNorm = `${r.vitals?.bp || ''}_${r.vitals?.pulse || ''}_${r.vitals?.temperature || ''}`;
    const contentSig = diagNorm || rxNorm ? `${diagNorm}:::${rxNorm}:::${vitalsNorm}` : null;

    if (contentSig && seenSignatures.has(contentSig)) continue;

    if (idKey) seenIds.add(idKey);
    if (contentSig) seenSignatures.add(contentSig);

    reviews.push({
      ...r,
      dayNumber: reviews.length + 1,
      roundNumber: r.roundNumber || r.dayNumber || (reviews.length + 1)
    });
  }

  return reviews;
};

/**
 * IPD Daily Consultation & Prescription Modal (Read-Only)
 * - Reduced compact width (max-w-4xl)
 * - Pure read-only view of doctor consulted clinical reviews & prescriptions
 * - Automatic day population from doctor consultations (No manual "+ Add Daily Review" button)
 * - Chronological Day tabs to inspect Day 1, Day 2, etc.
 * - Print Prescription & Close actions
 */
const IPDDailyConsultationModal = ({
  isOpen,
  onClose,
  admission,
  onSuccess,
  onOpenOpdHistory,
  user
}) => {
  if (!isOpen || !admission) return null;

  const effectiveAdm = admission?.raw ? { ...admission.raw, ...admission } : (admission || {});
  const patient = (typeof effectiveAdm.patientId === 'object' && effectiveAdm.patientId !== null)
    ? effectiveAdm.patientId
    : {
        name: effectiveAdm.patientName || effectiveAdm.name || '',
        uhid: effectiveAdm.uhid || '',
        age: effectiveAdm.age || '',
        gender: effectiveAdm.gender || ''
      };
  const bedInfo = (typeof effectiveAdm.bedId === 'object' && effectiveAdm.bedId !== null) ? effectiveAdm.bedId : {};
  const wardInfo = (typeof bedInfo.wardId === 'object' && bedInfo.wardId !== null)
    ? bedInfo.wardId
    : ((typeof effectiveAdm.wardId === 'object' && effectiveAdm.wardId !== null) ? effectiveAdm.wardId : {});

  // ----------------------------------------------------
  // Calculated Stay & Patient Metadata
  // ----------------------------------------------------
  const admissionDateObj = useMemo(() => {
    return effectiveAdm.admissionDate ? new Date(effectiveAdm.admissionDate) : new Date();
  }, [effectiveAdm.admissionDate]);

  const formattedAdmissionDate = useMemo(() => {
    return admissionDateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }, [admissionDateObj]);

  const calculatedStayDays = useMemo(() => {
    const start = new Date(admissionDateObj);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffTime = Math.max(0, now - start);
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, days);
  }, [admissionDateObj]);

  const wardBedDisplay = useMemo(() => {
    const wardName =
      (typeof wardInfo === 'object' ? wardInfo.name : null) ||
      (typeof effectiveAdm.wardId === 'object' ? effectiveAdm.wardId?.name : null) ||
      effectiveAdm.wardName ||
      effectiveAdm.ward ||
      'General Ward';
    const rawBedNo =
      (typeof bedInfo === 'object' ? bedInfo.bedNumber : null) ||
      (typeof effectiveAdm.bedId === 'object' ? effectiveAdm.bedId?.bedNumber : null) ||
      effectiveAdm.bedNumber ||
      effectiveAdm.bedNo ||
      effectiveAdm.bed ||
      '—';
    const bedNo = String(rawBedNo).toLowerCase().includes('bed') ? rawBedNo : `Bed ${rawBedNo}`;
    return `${wardName} / ${bedNo}`;
  }, [wardInfo, bedInfo, effectiveAdm]);

  const assignedDoctorName = useMemo(() => {
    const doc = effectiveAdm.attendingDoctorId || effectiveAdm.doctorId;
    if (doc?.name) {
      return doc.name.startsWith('Dr.') ? doc.name : `Dr. ${doc.name}`;
    }
    if (effectiveAdm.doctorName) {
      return effectiveAdm.doctorName.startsWith('Dr.') ? effectiveAdm.doctorName : `Dr. ${effectiveAdm.doctorName}`;
    }
    if (typeof doc === 'string' && doc.trim()) {
      return doc.startsWith('Dr.') ? doc : `Dr. ${doc}`;
    }
    if (user?.name) {
      return user.name.startsWith('Dr.') ? user.name : `Dr. ${user.name}`;
    }
    return 'Attending Doctor';
  }, [effectiveAdm.attendingDoctorId, effectiveAdm.doctorId, effectiveAdm.doctorName, user]);

  const ipdNoDisplay = useMemo(() => {
    return effectiveAdm.admissionId || effectiveAdm.ipdNo || effectiveAdm.admissionNumber || 'IPD-';
  }, [effectiveAdm]);

  const cleanUhid = useMemo(() => {
    const raw = patient.uhid || patient.patientId || patient.id || effectiveAdm.uhid || '—';
    return String(raw).replace(/^UHID:\s*/i, '').trim();
  }, [patient, effectiveAdm.uhid]);

  const ageGenderDisplay = useMemo(() => {
    const rawAge = patient.age || effectiveAdm.age || effectiveAdm.patientId?.age;
    const age = rawAge ? `${String(rawAge).replace(/[^0-9]/g, '') || rawAge} yrs` : '—';
    const rawGender = patient.gender || effectiveAdm.gender || effectiveAdm.patientId?.gender || '';
    const genderLetter = rawGender ? (rawGender.length === 1 ? rawGender.toUpperCase() : rawGender.charAt(0).toUpperCase()) : '—';
    return `${age} / ${genderLetter}`;
  }, [patient, effectiveAdm]);

  const bloodGroupDisplay = useMemo(() => {
    const rawBg = patient.bloodGroup || effectiveAdm.bloodGroup || effectiveAdm.patientId?.bloodGroup;
    if (!rawBg || rawBg === 'Unknown' || rawBg === 'N/A' || rawBg === '—') return null;
    return rawBg;
  }, [patient, effectiveAdm]);

  const stayDaysDisplay = useMemo(() => {
    return `Day ${calculatedStayDays} of Stay`;
  }, [calculatedStayDays]);

  const doctorDepartment = useMemo(() => {
    return effectiveAdm.attendingDoctorId?.department || effectiveAdm.attendingDoctorId?.specialization || 'General Medicine';
  }, [effectiveAdm.attendingDoctorId]);

  // ----------------------------------------------------
  // Daily Reviews Timeline & Active Day State
  // ----------------------------------------------------
  const [dailyReviewsList, setDailyReviewsList] = useState([]);
  const [selectedDayNumber, setSelectedDayNumber] = useState(1);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);

  // Active Review State
  const [reviewDate, setReviewDate] = useState('');
  const [reviewTime, setReviewTime] = useState('');
  const [selectedDoctorName, setSelectedDoctorName] = useState(assignedDoctorName);
  const [chiefComplaints, setChiefComplaints] = useState('');
  const [vitals, setVitals] = useState({ bp: '', pulse: '', temperature: '', spo2: '' });
  const [clinicalFindings, setClinicalFindings] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [assessment, setAssessment] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [prescriptions, setPrescriptions] = useState([]);

  const doctorDisplay = useMemo(() => {
    return selectedDoctorName || assignedDoctorName || 'Vedha';
  }, [selectedDoctorName, assignedDoctorName]);

  // Populate form helper
  const populateFormWithReview = (rev, dayNum = null) => {
    if (!rev) {
      if (dayNum) {
        const dayDate = new Date(admissionDateObj);
        dayDate.setDate(dayDate.getDate() + (dayNum - 1));
        setReviewDate(dayDate.toISOString().split('T')[0]);
      } else {
        setReviewDate('');
      }
      setReviewTime('');
      setSelectedDoctorName(assignedDoctorName);
      setChiefComplaints('Transferred from OPD Queue to IPD');
      setVitals({ bp: '', pulse: '', temperature: '', spo2: '' });

      // Fetch doctor consulted or selected clinical finding / examination from admission or consultation
      const admConditionTokens = [];
      if (effectiveAdm.generalCondition && !String(effectiveAdm.generalCondition).toLowerCase().includes('select')) {
        admConditionTokens.push(`Condition: ${effectiveAdm.generalCondition}`);
      }
      if (effectiveAdm.consciousnessLevel && !String(effectiveAdm.consciousnessLevel).toLowerCase().includes('select')) {
        admConditionTokens.push(`Consciousness: ${effectiveAdm.consciousnessLevel}`);
      }
      if (effectiveAdm.painScore !== undefined && effectiveAdm.painScore !== null && effectiveAdm.painScore !== '' && !String(effectiveAdm.painScore).toLowerCase().includes('select')) {
        admConditionTokens.push(`Pain: ${effectiveAdm.painScore}`);
      }
      const admSelected = admConditionTokens.join(' | ');

      const admExam = (effectiveAdm.examinationFindings || effectiveAdm.admissionExamination || effectiveAdm.initialAssessment?.examinationFindings || '').trim();
      const admClinical = (effectiveAdm.clinicalFindings || effectiveAdm.initialAssessment?.clinicalFindings || '').trim();
      const admNotes = (effectiveAdm.clinicalNotes || effectiveAdm.reasonForAdmission || '').trim();

      let admConsulted = '';
      if (admExam && admClinical && admExam !== admClinical) {
        admConsulted = `${admExam} | ${admClinical}`;
      } else {
        admConsulted = admExam || admClinical || admNotes;
      }

      let admFinalFindings = '';
      if (admConsulted && admSelected && !admConsulted.includes(admSelected)) {
        admFinalFindings = `${admConsulted} | ${admSelected}`;
      } else {
        admFinalFindings = admConsulted || admSelected;
      }

      if (!admFinalFindings && Array.isArray(effectiveAdm.dailyReviews)) {
        for (const r of effectiveAdm.dailyReviews) {
          if (r.clinicalFindings || r.examinationFindings) {
            admFinalFindings = r.clinicalFindings || r.examinationFindings;
            break;
          }
        }
      }

      setClinicalFindings(admFinalFindings || 'No specific clinical findings recorded.');
      setDiagnosis(effectiveAdm.finalDiagnosis || effectiveAdm.diagnosis || '—');
      setAssessment('Inpatient care in progress.');
      setTreatmentPlan('Continue supportive inpatient care.');
      setPrescriptions([]);
      return;
    }

    if (rev.reviewDate) {
      setReviewDate(new Date(rev.reviewDate).toISOString().split('T')[0]);
    } else {
      setReviewDate('');
    }
    setReviewTime(rev.reviewTime || '');
    setSelectedDoctorName(rev.doctorName || assignedDoctorName);
    setChiefComplaints(rev.chiefComplaints || rev.diagnosis || '');
    if (rev.vitals) {
      setVitals({
        bp: rev.vitals.bp || '',
        pulse: rev.vitals.pulse || '',
        temperature: rev.vitals.temperature || '',
        spo2: rev.vitals.spo2 || ''
      });
    } else {
      setVitals({ bp: '', pulse: '', temperature: '', spo2: '' });
    }
    // 1. Clinical Findings (fetch doctor consulted or selected clinical findings / examination)
    const conditionTokens = [];
    if (rev.generalCondition && !String(rev.generalCondition).toLowerCase().includes('select')) {
      conditionTokens.push(`Condition: ${rev.generalCondition}`);
    }
    if (rev.consciousnessLevel && !String(rev.consciousnessLevel).toLowerCase().includes('select')) {
      conditionTokens.push(`Consciousness: ${rev.consciousnessLevel}`);
    }
    if (rev.painScore !== undefined && rev.painScore !== null && rev.painScore !== '' && !String(rev.painScore).toLowerCase().includes('select')) {
      conditionTokens.push(`Pain: ${rev.painScore}`);
    }
    const selectedFindings = conditionTokens.join(' | ');

    const consultExam = (rev.examinationFindings || '').trim();
    const consultClinical = (rev.clinicalFindings || '').trim();
    const consultNotes = (rev.clinicalNotes || '').trim();

    // Check if consultClinical already starts with or includes condition tokens
    const clinicalHasConditions = consultClinical && (
      consultClinical.includes('Condition:') ||
      consultClinical.includes('Consciousness:') ||
      consultClinical.includes('Pain:')
    );

    let consultedFindings = '';
    if (consultExam && consultClinical && consultExam !== consultClinical) {
      if (clinicalHasConditions) {
        consultedFindings = consultExam;
      } else {
        consultedFindings = `${consultExam} | ${consultClinical}`;
      }
    } else if (consultExam) {
      consultedFindings = consultExam;
    } else if (consultClinical && !clinicalHasConditions) {
      consultedFindings = consultClinical;
    } else if (consultNotes && consultNotes !== rev.assessment && consultNotes !== rev.assessmentPlan) {
      consultedFindings = consultNotes;
    }

    let finalFindings = '';
    if (consultedFindings && selectedFindings) {
      if (!consultedFindings.includes(selectedFindings)) {
        finalFindings = `${consultedFindings} | ${selectedFindings}`;
      } else {
        finalFindings = consultedFindings;
      }
    } else if (consultedFindings) {
      finalFindings = consultedFindings;
    } else if (consultClinical) {
      finalFindings = consultClinical;
    } else if (selectedFindings) {
      finalFindings = selectedFindings;
    } else if (consultNotes) {
      finalFindings = consultNotes;
    } else {
      // Fallback to admission level clinical findings / examination
      finalFindings = effectiveAdm.examinationFindings ||
        effectiveAdm.clinicalFindings ||
        effectiveAdm.admissionExamination ||
        effectiveAdm.clinicalNotes ||
        effectiveAdm.initialAssessment?.examinationFindings ||
        effectiveAdm.initialAssessment?.clinicalFindings ||
        '';
    }

    if (!finalFindings && Array.isArray(effectiveAdm.dailyReviews)) {
      for (const r of effectiveAdm.dailyReviews) {
        if (r.clinicalFindings || r.examinationFindings) {
          finalFindings = r.clinicalFindings || r.examinationFindings;
          break;
        }
      }
    }

    setClinicalFindings(finalFindings || 'No specific clinical findings recorded.');

    // 2. Diagnosis (fetch doctor's original clinical diagnosis, fallback to Round 1 / earliest review)
    let originalDiag = rev.diagnosis;
    if (!originalDiag && Array.isArray(effectiveAdm.dailyReviews)) {
      const sorted = [...effectiveAdm.dailyReviews].sort((a, b) => (Number(a.dayNumber) || 0) - (Number(b.dayNumber) || 0));
      for (const r of sorted) {
        if (r.diagnosis && !/inpatient\s*(clinical\s*)?care|routine\s*admission|under\s*observation|clinical\s*inpatient\s*review/i.test(r.diagnosis)) {
          originalDiag = r.diagnosis;
          break;
        }
      }
    }
    setDiagnosis(originalDiag || effectiveAdm.finalDiagnosis || effectiveAdm.diagnosis || '—');

    // 3. Assessment & Progress (prioritize doctor's actual assessmentPlan notes)
    const rawAssessmentPlan = (rev.assessmentPlan || '').trim();
    const rawAssessment = (rev.assessment || '').trim();
    const effectiveAssessment = (rawAssessmentPlan && rawAssessmentPlan !== 'Doctor consultation completed.')
      ? rawAssessmentPlan
      : (rawAssessment && rawAssessment !== 'Doctor consultation completed.')
        ? rawAssessment
        : (rawAssessmentPlan || rawAssessment || rev.clinicalNotes || '');
    setAssessment(effectiveAssessment || 'Patient stable under ongoing inpatient management.');

    // 4. Doctor Guidelines & Instructions (fetch doctor's advice & instructions)
    const rawTreatmentPlan = (rev.treatmentPlan || '').trim();
    const rawInstructions = (rev.instructions || '').trim();
    const rawAdvice = (rev.advice || rev.doctorGuidelines || rev.customAdvice || '').trim();
    const effectiveGuidelines = rawTreatmentPlan || rawInstructions || rawAdvice || '';
    setTreatmentPlan(effectiveGuidelines || 'Continue prescribed medications and supportive inpatient care.');

    setPrescriptions(Array.isArray(rev.prescriptions) ? rev.prescriptions : []);
  };

  // Load Daily Reviews from Backend
  const loadDailyReviews = async () => {
    const admId = effectiveAdm._id || effectiveAdm.id || effectiveAdm.admissionId || admission._id || admission.id || admission.admissionId;
    if (!admId) return;
    setIsLoadingReviews(true);
    try {
      const res = await ipdService.getDailyReviews(admId);
      const rawReviews = res.dailyReviews || effectiveAdm.dailyReviews || admission.dailyReviews || [];
      const reviews = deduplicateReviews(rawReviews);

      setDailyReviewsList(reviews);

      if (reviews.length > 0) {
        setSelectedDayNumber(reviews.length);
        populateFormWithReview(reviews[reviews.length - 1]);
      } else {
        setSelectedDayNumber(0);
        populateFormWithReview(null);
      }
    } catch {
      const rawReviews = effectiveAdm.dailyReviews || admission.dailyReviews || [];
      const reviews = deduplicateReviews(rawReviews);
      setDailyReviewsList(reviews);
      if (reviews.length > 0) {
        setSelectedDayNumber(reviews.length);
        populateFormWithReview(reviews[reviews.length - 1]);
      } else {
        setSelectedDayNumber(0);
        populateFormWithReview(null);
      }
    } finally {
      setIsLoadingReviews(false);
    }
  };

  useEffect(() => {
    loadDailyReviews();
  }, [effectiveAdm._id, effectiveAdm.id, effectiveAdm.admissionId, admission._id, admission.id, admission.admissionId]);

  // Total completed consultation rounds count strictly reflects finished/recorded doctor reviews
  const totalRoundsCount = useMemo(() => {
    return Array.isArray(dailyReviewsList) ? dailyReviewsList.length : 0;
  }, [dailyReviewsList]);

  const allDaysList = useMemo(() => {
    const list = [];
    for (let i = 1; i <= totalRoundsCount; i++) {
      list.push(i);
    }
    return list;
  }, [totalRoundsCount]);

  const availableDays = allDaysList;

  const firstRowDays = useMemo(() => {
    return allDaysList.slice(0, 5);
  }, [allDaysList]);

  const remainingDays = useMemo(() => {
    return allDaysList.slice(5);
  }, [allDaysList]);

  const handleSelectDay = (dayNum) => {
    setSelectedDayNumber(dayNum);
    const existing = dailyReviewsList[dayNum - 1];
    if (existing) {
      populateFormWithReview(existing);
    } else {
      populateFormWithReview(null, dayNum);
    }
  };

  const renderDayButton = (dayNum) => {
    const isSelected = selectedDayNumber === dayNum;
    const savedReview = dailyReviewsList[dayNum - 1];
    const hasSavedReview = Boolean(savedReview && (savedReview.reviewDate || savedReview.doctorName || savedReview.diagnosis));

    let cardDateStr = '';
    let isToday = false;
    if (savedReview?.reviewDate || savedReview?.createdAt) {
      const d = new Date(savedReview.reviewDate || savedReview.createdAt);
      if (!isNaN(d.getTime())) {
        cardDateStr = d.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        isToday = d.toDateString() === new Date().toDateString();
      }
    }
    if (!cardDateStr) {
      const dayDate = new Date(admissionDateObj);
      dayDate.setDate(dayDate.getDate() + (dayNum - 1));
      cardDateStr = dayDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      isToday = dayDate.toDateString() === new Date().toDateString();
    }

    return (
      <button
        key={dayNum}
        type="button"
        onClick={() => handleSelectDay(dayNum)}
        className={`flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl border transition-all cursor-pointer min-w-[170px] text-left shrink-0 ${
          isSelected
            ? 'bg-blue-50/60 border-[#2F63F2] ring-2 ring-[#2F63F2]/15 shadow-xs'
            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isSelected ? (
            <div className="w-7 h-7 rounded-lg bg-[#2F63F2]/10 text-[#2F63F2] flex items-center justify-center shrink-0">
              <Stethoscope className="w-4 h-4 text-[#2F63F2]" />
            </div>
          ) : hasSavedReview ? (
            <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-semibold shrink-0">
              {dayNum}
            </div>
          )}
          <div>
            <div className={`text-xs font-bold ${isSelected ? 'text-[#2F63F2]' : 'text-slate-800'}`}>
              Day {dayNum}
            </div>
            <div className="text-[11px] text-slate-500 font-normal">
              {cardDateStr} {isToday ? '(Today)' : ''}
            </div>
          </div>
        </div>

        {isSelected ? (
          <div className="w-2.5 h-2.5 rounded-full bg-[#2F63F2] ring-4 ring-[#2F63F2]/20"></div>
        ) : hasSavedReview ? (
          <div className="w-4 h-4 rounded-full border border-emerald-300 text-emerald-600 flex items-center justify-center text-[9px]">
            ✓
          </div>
        ) : null}
      </button>
    );
  };

  const currentReview = useMemo(() => {
    if (!dailyReviewsList || dailyReviewsList.length === 0) return null;
    return dailyReviewsList[selectedDayNumber - 1] || dailyReviewsList[dailyReviewsList.length - 1];
  }, [dailyReviewsList, selectedDayNumber]);

  const formattedReviewDate = useMemo(() => {
    if (!reviewDate) return '—';
    const d = new Date(reviewDate);
    if (isNaN(d.getTime())) return reviewDate;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }, [reviewDate]);

  // ----------------------------------------------------
  // Prescription Print Handler
  // ----------------------------------------------------
  const handlePrintPrescription = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      toast.error('Please allow popups to print prescription');
      return;
    }

    const rxRowsHtml = prescriptions.map((p, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 10px; font-weight: 600; color: #0f172a;">${idx + 1}. ${p.medicineName}</td>
        <td style="padding: 8px 10px; color: #334155;">${p.dose || '—'}</td>
        <td style="padding: 8px 10px; color: #334155;">${p.route || 'Oral'}</td>
        <td style="padding: 8px 10px; color: #334155;">${p.frequency || 'Once daily'}</td>
        <td style="padding: 8px 10px; color: #334155;">${p.duration || '3 days'}</td>
        <td style="padding: 8px 10px; color: #334155;">${p.instructions || 'After food'}</td>
        <td style="padding: 8px 10px; text-align: center; font-weight: 600;">${p.quantity || 1}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>IPD Prescription - ${admission.admissionId} - Day ${selectedDayNumber}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 20px 30px; font-size: 13px; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2F63F2; padding-bottom: 12px; margin-bottom: 16px; }
            .hospital-name { font-size: 20px; font-weight: 800; color: #2F63F2; letter-spacing: -0.5px; }
            .hospital-sub { font-size: 11px; color: #64748b; }
            .banner { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
            .banner-item { font-size: 11px; }
            .banner-item span { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; }
            .banner-item strong { font-size: 12px; color: #0f172a; }
            .vitals-box { display: flex; gap: 12px; margin-bottom: 16px; }
            .vital-pill { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; text-align: center; }
            .vital-pill span { display: block; font-size: 10px; color: #64748b; text-transform: uppercase; }
            .vital-pill strong { font-size: 13px; color: #0f172a; }
            .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #2F63F2; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }
            .footer-sig { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
            .sig-line { border-top: 1px solid #94a3b8; width: 200px; text-align: center; padding-top: 6px; font-size: 11px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="hospital-name">VillZone HIMS</div>
              <div class="hospital-sub">Inpatient Department (IPD) Daily Consultation & Prescription</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 700; font-size: 13px; color: #0f172a;">IPD Daily Review — Day ${selectedDayNumber}</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${formattedReviewDate} • Time: ${reviewTime || '—'}</div>
            </div>
          </div>

          <div class="banner">
            <div class="banner-item">
              <span>Patient Name</span>
              <strong>${patient.name || 'Patient'}</strong>
            </div>
            <div class="banner-item">
              <span>IPD Number</span>
              <strong>${admission.admissionId || 'IPD-2026-0042'}</strong>
            </div>
            <div class="banner-item">
              <span>UHID</span>
              <strong>${patient.uhid || 'PAT00086'}</strong>
            </div>
            <div class="banner-item">
              <span>Age / Gender</span>
              <strong>${patient.age || '—'} Yrs | ${patient.gender || '—'}</strong>
            </div>
            <div class="banner-item">
              <span>Ward / Bed</span>
              <strong>${wardBedDisplay}</strong>
            </div>
            <div class="banner-item">
              <span>Admission Date</span>
              <strong>${formattedAdmissionDate}</strong>
            </div>
            <div class="banner-item">
              <span>Length of Stay</span>
              <strong>Day ${calculatedStayDays} of Stay</strong>
            </div>
            <div class="banner-item">
              <span>Assigned Doctor</span>
              <strong>${selectedDoctorName}</strong>
            </div>
          </div>

          <div class="section-title">Clinical Review Summary</div>
          <div style="margin-bottom: 12px; font-size: 12px;">
            <p><strong>Chief Complaints:</strong> ${chiefComplaints || 'None reported'}</p>
            <p><strong>Diagnosis:</strong> ${diagnosis || 'Under observation'}</p>
            <p><strong>Clinical Findings:</strong> ${clinicalFindings || 'None'}</p>
            <p><strong>Assessment / Progress:</strong> ${assessment || 'Patient evaluated'}</p>
            <p><strong>Doctor Guidelines & Instructions:</strong> ${treatmentPlan || 'Medical management'}</p>
          </div>

          <div class="section-title">Vitals</div>
          <div class="vitals-box">
            <div class="vital-pill"><span>BP (mmHg)</span><strong>${vitals.bp || '—'}</strong></div>
            <div class="vital-pill"><span>Pulse (bpm)</span><strong>${vitals.pulse || '—'}</strong></div>
            <div class="vital-pill"><span>Temp (°C)</span><strong>${vitals.temperature || '—'}</strong></div>
            <div class="vital-pill"><span>SpO₂ (%)</span><strong>${vitals.spo2 || '—'}</strong></div>
          </div>

          <div class="section-title">Prescribed Medications</div>
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Dose</th>
                <th>Route</th>
                <th>Frequency</th>
                <th>Duration</th>
                <th>Timing</th>
                <th style="text-align: center;">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${rxRowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 12px; color: #94a3b8;">No medications prescribed</td></tr>'}
            </tbody>
          </table>

          <div class="footer-sig">
            <div>
              <div style="font-size: 11px; color: #64748b;">Printed on: ${new Date().toLocaleString('en-GB')}</div>
            </div>
            <div class="sig-line">
              <strong>${selectedDoctorName}</strong><br/>
              Doctor Signature
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
        />

        {/* Modal Container: Reduced Width (max-w-4xl), Centered, Comfortable proportions */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
          className="relative w-full max-w-4xl h-[92vh] max-h-[92vh] bg-white border border-slate-200/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 mx-auto"
        >
          {/* ==================================================
              1. TOP PATIENT BANNER (STICKY / FIXED AT TOP)
              ================================================== */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-col gap-2.5 shrink-0">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Back Arrow + Avatar + Patient Name + ADMITTED Badge */}
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Close and return"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Avatar Initial Circle */}
                <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 text-[#2F63F2] flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                  {patient.name ? patient.name.charAt(0).toUpperCase() : 'P'}
                </div>

                {/* Patient Name & Status Pill */}
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate tracking-tight">
                    {patient.name || 'Patient'}
                  </h2>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 tracking-wide uppercase shrink-0 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    ADMITTED
                  </span>
                </div>
              </div>

              {/* Right: View Visit History + Close button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenOpdHistory) {
                      onOpenOpdHistory();
                    } else {
                      toast('Opening patient clinical visit history...');
                    }
                  }}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/70 hover:bg-blue-100/80 active:bg-blue-200/60 text-[#2F63F2] border border-blue-200 text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer"
                  title="View past consultation records & visit history"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-[#2F63F2]" />
                  <span>View Visit History</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close Workspace"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Bottom Row of Patient Banner: Clean Structured Key-Value Details */}
            <div className="pt-2.5 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-tight">IPD No:</span>
                  <span className="font-bold text-slate-900 font-mono text-xs">{ipdNoDisplay}</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-tight">UHID:</span>
                  <span className="font-bold text-slate-900 font-mono text-xs">{cleanUhid}</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Age / Gender:</span>
                  <div className="flex items-center gap-1 font-bold text-slate-900 text-xs">
                    <span>{ageGenderDisplay}</span>
                    {bloodGroupDisplay && (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-none shadow-2xs">
                        {bloodGroupDisplay}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Ward / Bed:</span>
                  <span className="font-bold text-slate-900 text-xs truncate" title={wardBedDisplay}>{wardBedDisplay}</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Admission Date:</span>
                  <span className="font-bold text-slate-900 text-xs">{formattedAdmissionDate}</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Length of Stay:</span>
                  <span className="font-bold text-slate-900 text-xs">{stayDaysDisplay}</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5 col-span-2 sm:col-span-1">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Assigned Doctor:</span>
                  <span className="font-bold text-slate-900 text-xs">{doctorDisplay}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ==================================================
              2. SCROLLABLE WORKSPACE CONTENT AREA (READ-ONLY)
              ================================================== */}
          <div className="flex-1 overflow-y-auto bg-[#f8fafc] px-3 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
            {/* Title Header */}
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                IPD Daily Consultation & Prescription Details
              </h3>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Automatically synchronized with attending doctor consultations and prescriptions
              </p>
            </div>

            {/* Day Stepper Cards Section (Up to 5 days on top with View All button opposite to Day 1) */}
            {allDaysList.length > 0 && (
              <div className="space-y-2.5">
                {/* Top Row: First 5 days on left, View All button on right opposite to Day 1 */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin flex-1">
                    {firstRowDays.map(dayNum => renderDayButton(dayNum))}
                  </div>

                  {totalRoundsCount > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDays(prev => !prev)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-[#2F63F2] text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 self-center"
                      title={showAllDays ? "Show first 5 days" : "View all remaining staying days"}
                    >
                      {showAllDays ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5 stroke-[2.2]" />
                          <span>Show Less</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5 stroke-[2.2]" />
                          <span>View All ({remainingDays.length} More)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Remaining Days in Down (Revealed when View All is clicked) */}
                {showAllDays && remainingDays.length > 0 && (
                  <div className="p-3 bg-slate-50/90 border border-slate-200/90 rounded-2xl space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Remaining Consultation Rounds ({remainingDays.length} Rounds)
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                      {remainingDays.map(dayNum => renderDayButton(dayNum))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty State when no consultations have occurred yet */}
            {availableDays.length === 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-3 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-[#2F63F2] flex items-center justify-center mx-auto border border-blue-200 shadow-2xs">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm sm:text-base font-bold text-slate-800">
                    No Doctor Consultations Recorded Yet
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Once the attending doctor conducts an IPD consultation and prescribes medications for this patient, the daily review and prescription details will appear here automatically.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Main Card: Read-Only Clinical Review — Day X */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-4">
                  {/* Card Title Header */}
                  <div className="pb-2.5 border-b border-slate-100 space-y-1">
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <div className="w-5.5 h-5.5 sm:w-7 sm:h-7 rounded-lg bg-blue-50 text-[#2F63F2] flex items-center justify-center shrink-0">
                          <Stethoscope className="w-3 h-3 sm:w-4 sm:h-4 text-[#2F63F2]" />
                        </div>
                        <h4 className="text-[11.5px] sm:text-base font-bold text-slate-900 tracking-tight whitespace-nowrap shrink-0">
                          Clinical Review — Day {selectedDayNumber}
                        </h4>
                      </div>
                      <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs shrink-0 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <span>{currentReview?.statusBadge || 'Doctor Consulted'}</span>
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-normal pl-7 sm:pl-9">
                      Consulted notes & doctor's inpatient review
                    </p>
                  </div>

                  {/* Row 1: Review Date & Time | Chief Complaints / Symptoms (No duplicate Doctor field) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
                    {/* Review Date & Time (5 cols) */}
                    <div className="md:col-span-5 space-y-1">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Review Date & Time
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 h-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{formattedReviewDate}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 h-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{reviewTime || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Chief Complaints / Symptoms (7 cols) */}
                    <div className="md:col-span-7 space-y-1">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Chief Complaints / Symptoms
                      </span>
                      <div className="flex items-center px-3 h-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 truncate" title={chiefComplaints}>
                        {chiefComplaints || 'None reported'}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Vitals Card */}
                  <div className="bg-slate-50/70 rounded-xl border border-slate-200/80 p-3 sm:p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <HeartPulse className="w-4 h-4 text-[#2F63F2]" />
                      <span>Vitals Recorded at Review</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">BP (mmHg)</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-800">{vitals.bp || '—'}</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Pulse (bpm)</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-800">{vitals.pulse || '—'}</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Temperature (°C)</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-800">{vitals.temperature || '—'}</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">SpO₂ (%)</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-800">{vitals.spo2 ? `${vitals.spo2}%` : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Clinical Findings & Diagnosis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {/* Clinical Findings */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                        <span>Clinical Findings</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 min-h-[46px] leading-relaxed">
                        {clinicalFindings || 'No specific clinical findings recorded.'}
                      </div>
                    </div>

                    {/* Diagnosis */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <Activity className="w-3.5 h-3.5 text-slate-400" />
                        <span>Diagnosis</span>
                      </div>
                      <div className="p-2.5 bg-blue-50/50 border border-blue-200 rounded-lg text-xs font-bold text-[#2F63F2] min-h-[46px] flex items-center">
                        {diagnosis || 'Under observation / Clinical management'}
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Assessment & Progress | Treatment Plan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {/* Assessment & Progress */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <FileCheck2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Assessment & Progress</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 min-h-[46px] leading-relaxed">
                        {assessment || 'Patient stable under ongoing inpatient management.'}
                      </div>
                    </div>

                    {/* Doctor Guidelines & Instructions */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
                        <span>Doctor Guidelines & Instructions</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 min-h-[46px] leading-relaxed">
                        {treatmentPlan || 'Continue prescribed medications and supportive inpatient care.'}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ==================================================
              3. FIXED BOTTOM ACTION BAR
              ================================================== */}
          <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shrink-0 shadow-xs">
            <div>
              {availableDays.length > 0 && (
                <button
                  type="button"
                  onClick={handlePrintPrescription}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Prescription</span>
                </button>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 border border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-blue-50 active:bg-blue-100 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default IPDDailyConsultationModal;
