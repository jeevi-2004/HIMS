import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBillingSettings } from '../context/BillingSettingsContext';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import {
  getMasterList, initClinicalMasters, checkAllergyConflict, normalizeFoodTiming, getDefaultFoodTimingForMedicine, syncMedicineToMaster
} from '../utils/clinicalMasters';
import {
  Pill, ShieldCheck, Check, CheckCircle2, Trash2, Plus, ArrowLeft, Volume2,
  FileText, Printer, Star, History as HistoryIcon, Copy, Stethoscope,
  Sun, Moon, ChevronDown, ChevronUp, X, Edit3, Save, Send, Users, Zap, Bed, Clock,
  Building2, Eye, ArrowRight, Lightbulb, Calendar
} from 'lucide-react';
import ipdService from '../services/ipd/ipdService';
import { getVisitStatus, isCompletedVisit, VISIT_STATUSES } from '../utils/visitStatus';
import DoctorConsultationSidebar from '../components/DoctorConsultationSidebar';
import DoctorIPDConsultationSidebar from '../components/ipd/DoctorIPDConsultationSidebar';
import PatientHistoryDrawer from '../components/PatientHistoryDrawer';
import { triggerPrint } from '../modules/prescription-print/printUtils';
import { DEFAULT_PRINT_CONFIG } from '../modules/prescription-print/prescriptionPrint.types';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { isFeatureModuleEnabled } from '../utils/featureUtils';
import { resolveHospitalService, isLikelyRadiology } from '../utils/investigationUtils';

// Clean doctor name to prevent duplicate "Dr." prefixes (e.g. "Dr. Dr. Vedha" -> "Dr. Vedha")
const formatDoctorDisplayName = (name, fallback = 'On Duty') => {
  if (!name) return `Dr. ${fallback}`;
  const clean = String(name).replace(/^(Dr\.?\s*)+/i, '').trim();
  if (!clean) return `Dr. ${fallback}`;
  return `Dr. ${clean}`;
};

// Normalize and deduplicate allergies accurately
export const normalizeAllergies = (allergiesSource) => {
  if (!allergiesSource) return [];
  let rawList = [];

  try {
    if (Array.isArray(allergiesSource)) {
      rawList = allergiesSource.flatMap(item => {
        if (!item) return [];
        if (typeof item === 'string') return item.split(/[,;\n/]+/);
        if (typeof item === 'object') {
          const val = item.name || item.allergy || item.allergyName || item.val || item.title || '';
          const str = typeof val === 'string' ? val : (val && typeof val === 'object' ? (val.name || val.title || '') : String(val || ''));
          return str.split(/[,;\n/]+/);
        }
        return String(item || '').split(/[,;\n/]+/);
      });
    } else if (typeof allergiesSource === 'string') {
      rawList = allergiesSource.split(/[,;\n/]+/);
    } else if (typeof allergiesSource === 'object') {
      const val = allergiesSource.name || allergiesSource.allergy || allergiesSource.allergyName || allergiesSource.val || allergiesSource.title || '';
      const str = typeof val === 'string' ? val : (val && typeof val === 'object' ? (val.name || val.title || '') : String(val || ''));
      rawList = str.split(/[,;\n/]+/);
    }
  } catch (err) {
    console.warn('Error normalizing allergies:', err);
    return [];
  }

  const cleaned = rawList
    .map(item => String(item || '').trim())
    .filter(item => {
      if (!item) return false;
      const lower = item.toLowerCase();
      return lower !== 'none' && lower !== 'null' && lower !== 'undefined' && lower !== 'no' && lower !== 'n/a' && lower !== 'no known allergies' && lower !== 'nil';
    });

  const seen = new Set();
  const deduped = [];
  for (const item of cleaned) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
};

// Robust helper to extract allergies from appointment or patient, avoiding JS empty-array truthiness bug
export const getPatientAllergiesList = (patientOrApp) => {
  if (!patientOrApp || typeof patientOrApp !== 'object') return [];

  try {
    // 1. Check direct allergies on appointment/record (ensure it's not an empty array)
    if (patientOrApp.allergies && (Array.isArray(patientOrApp.allergies) ? patientOrApp.allergies.length > 0 : String(patientOrApp.allergies).trim())) {
      const fromDirect = normalizeAllergies(patientOrApp.allergies);
      if (fromDirect.length > 0) return fromDirect;
    }

    // 2. Check populated patientId or patient object
    const patientObj = (patientOrApp.patientId && typeof patientOrApp.patientId === 'object') ? patientOrApp.patientId : (patientOrApp.patient && typeof patientOrApp.patient === 'object' ? patientOrApp.patient : null);
    if (patientObj?.allergies && (Array.isArray(patientObj.allergies) ? patientObj.allergies.length > 0 : String(patientObj.allergies).trim())) {
      const fromPatient = normalizeAllergies(patientObj.allergies);
      if (fromPatient.length > 0) return fromPatient;
    }

    // 3. Fallback: check chief complaint (e.g. if entered as "Allergy: Penicillin", "Peanut Allergy", or simply "Allergy")
    const rawComplaint = patientOrApp.chiefComplaint || patientOrApp.appointmentId?.chiefComplaint || patientObj?.chiefComplaint || '';
    const complaint = typeof rawComplaint === 'string' ? rawComplaint : (rawComplaint?.text || String(rawComplaint || ''));
    if (complaint && /allerg/i.test(complaint)) {
      const match = complaint.match(/allerg(?:y|ies)?(?:\s*[:\-\(]\s*|\s+to\s+)([^,;\)\.]+)/i);
      if (match && match[1] && String(match[1]).trim().toLowerCase() !== 'other') {
        const parsed = normalizeAllergies(match[1]);
        if (parsed.length > 0) return parsed;
      } else {
        const items = complaint.split(/[,;\n/]+/).map(s => String(s || '').trim());
        const allergyItem = items.find(c => /allerg/i.test(c));
        if (allergyItem) {
          const cleaned = allergyItem.replace(/allerg(?:y|ies)?/i, '').replace(/[:\-\(\)]/g, '').trim();
          if (cleaned) {
            const parsed = normalizeAllergies(cleaned);
            if (parsed.length > 0) return parsed;
          } else {
            return ['Allergy Reported'];
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error extracting patient allergies:', err);
    return [];
  }

  return [];
};

// Format allergies for presentation in UI and print contracts
export const formatAllergiesDisplay = (patientOrApp, fallback = 'NONE') => {
  const list = getPatientAllergiesList(patientOrApp);
  return list.length > 0 ? list.join(', ') : fallback;
};

// Safe diagnosis name extractor guaranteeing primitive string return
export const getDiagName = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  if (typeof d === 'object') {
    return d.name || d.diagnosis || d.val || d.title || String(d.text || '');
  }
  return String(d);
};

// Safe renderer helper for values that might be primitives, objects, or arrays
export const formatDisplayContent = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val.map(item => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      return item.name || item.investigationName || item.title || item.complaint || item.text || item.diagnosis || JSON.stringify(item);
    }).filter(Boolean).join(', ');
  }
  if (typeof val === 'object') {
    return val.name || val.text || val.title || val.complaint || val.diagnosis || JSON.stringify(val);
  }
  return String(val);
};

// Automatically capitalize the first letter of each word while allowing numbers
export const formatCapitalizeWordsWithNumbers = (val) => {
  if (!val) return '';
  return val.replace(/(^|[^\w']|\s)([a-z])/g, (_, pre, letter) => `${pre}${letter.toUpperCase()}`);
};

// Automatically capitalize the first letter of each word and disallow numbers (0-9)
export const formatCapitalizeWordsNoNumbers = (val) => {
  if (!val) return '';
  const noNums = val.replace(/[0-9]/g, '');
  return noNums.replace(/(^|[^\w']|\s)([a-z])/g, (_, pre, letter) => `${pre}${letter.toUpperCase()}`);
};

// Extract and carry forward original doctor-selected diagnoses from Round 1 and prior rounds for IPD consultations
export const getIpdDefaultDiagnoses = (reviewsList) => {
  if (!Array.isArray(reviewsList) || reviewsList.length === 0) return [];
  const sorted = [...reviewsList].sort((a, b) => (Number(a.dayNumber) || 0) - (Number(b.dayNumber) || 0));

  const allDiagnoses = [];
  const seen = new Set();

  sorted.forEach(rev => {
    let diags = [];
    if (typeof rev.diagnosis === 'string' && rev.diagnosis.trim()) {
      diags = rev.diagnosis.split(',').map(s => s.trim()).filter(Boolean);
    } else if (Array.isArray(rev.diagnoses)) {
      diags = rev.diagnoses.map(d => (typeof d === 'string' ? d : d?.name || '')).filter(Boolean);
    }
    diags.forEach(d => {
      const clean = d.trim();
      // Only include original clinical diagnoses selected by doctors (filter out placeholders/dummy strings)
      if (clean && !/inpatient\s*(clinical\s*)?care|routine\s*admission|under\s*observation/i.test(clean)) {
        const lower = clean.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          allDiagnoses.push(clean);
        }
      }
    });
  });

  return allDiagnoses;
};

const DoctorConsultation = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const activeVisitId = params.visitId || params.consultationId || searchParams.get('visitId') || searchParams.get('consultationId') || searchParams.get('appointmentId');
  const consultationId = activeVisitId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { billingSettings, workflow } = useBillingSettings();
  const queryClient = useQueryClient();

  const handleBackToDashboard = (e) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    // Retain consultation draft for auto-restore when returning to this consultation
    queryClient.invalidateQueries(['doctorQueue']);
    queryClient.invalidateQueries(['appointments']);
    queryClient.invalidateQueries(['ipd']);
    if (appointment?.isIpd || searchParams.get('type') === 'ipd') {
      navigate('/doctor/ipd/inpatients', { replace: true });
    } else {
      navigate('/doctor/dashboard', { replace: true });
    }
  };

  // Auto-register Doctor Online Presence state on mount
  useEffect(() => {
    initClinicalMasters();
    if (user?._id) {
      const docId = String(user._id);
      api.post('/operations/doctors/presence', { doctorId: docId, isOnline: true }).catch(() => { });
      workflowRealtime.broadcastLocalEvent('DOCTOR_PRESENCE_UPDATED', { doctorId: docId, isOnline: true });
    }
  }, [user?._id]);

  const dlist = useMemo(() => {
    const list = getMasterList('dlist');
    return Array.isArray(list) ? list : [];
  }, []); // Diagnosis templates
  const mlist = useMemo(() => {
    const list = getMasterList('mlist');
    return Array.isArray(list) ? list : [];
  }, []); // Medicines Catalog
  const dosages = useMemo(() => {
    const list = getMasterList('dosages');
    return Array.isArray(list) && list.length > 0 ? list : ['0', '½', '1', '2', 'SOS'];
  }, []); // e.g. ['0','½','1','2','SOS']
  const frequencies = useMemo(() => {
    const list = getMasterList('frequencies');
    return Array.isArray(list) && list.length > 0 ? list : ['OD', 'BD', 'TDS', 'SOS'];
  }, []);
  const rawDurations = useMemo(() => {
    const list = getMasterList('durations');
    return Array.isArray(list) ? list : [];
  }, []);
  const durations = useMemo(() => {
    const list = Array.isArray(rawDurations) && rawDurations.length > 0 ? [...rawDurations] : ['1 Day', '3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '15 Days', '30 Days', 'Other...'];
    if (!list.includes('1 Day')) list.unshift('1 Day');
    if (!list.includes('Other...')) list.push('Other...');
    return list;
  }, [rawDurations]);
  const foodInstructions = useMemo(() => {
    const list = getMasterList('foodInstructions');
    return Array.isArray(list) && list.length > 0 ? list : ['Before Food', 'After Food', 'With Food'];
  }, []);
  const adviceList = useMemo(() => {
    const list = getMasterList('adviceList');
    return Array.isArray(list) && list.length > 0 ? list : ['Drink Water', 'Take Rest', 'Avoid Cold Drinks'];
  }, []);
  const followups = useMemo(() => {
    const list = getMasterList('followups');
    return Array.isArray(list) && list.length > 0 ? list : ['3 Days', '7 Days', '15 Days'];
  }, []);
  // Consultation Mode State (OPD Starter | Full HIMS)
  const [consultationMode, setConsultationMode] = useState(() => {
    try {
      return localStorage.getItem('doctor_consultation_mode') || 'opd_starter';
    } catch {
      return 'opd_starter';
    }
  });

  const handleSwitchMode = (mode) => {
    setConsultationMode(mode);
    try {
      localStorage.setItem('doctor_consultation_mode', mode);
    } catch { }
  };

  // Modals & History Drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOldPrescriptionsOpen, setIsOldPrescriptionsOpen] = useState(false);
  const [isOldInvestigationsOpen, setIsOldInvestigationsOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isEditVitalsModalOpen, setIsEditVitalsModalOpen] = useState(false);
  const [isSavingVitals, setIsSavingVitals] = useState(false);
  const [isPatientDetailsExpanded, setIsPatientDetailsExpanded] = useState(false);
  const [isMobileVitalsExpanded, setIsMobileVitalsExpanded] = useState(false);
  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [selectedDeliveryMethod, setSelectedDeliveryMethod] = useState('internal_pharmacy');

  // Search filter & Real-time Diagnosis Master Autocomplete
  const [diagSearch, setDiagSearch] = useState('');
  const [isDiagSearching, setIsDiagSearching] = useState(false);
  const [diagSearchResults, setDiagSearchResults] = useState([]);
  const [diagExactMatch, setDiagExactMatch] = useState(false);
  const [diagSuggestions, setDiagSuggestions] = useState([]);
  const [isAddingDiagnosis, setIsAddingDiagnosis] = useState(false);
  const [subtleAddedToast, setSubtleAddedToast] = useState(false);

  // Query Real-time Diagnosis Master API
  useEffect(() => {
    const term = diagSearch.trim();
    if (!term) {
      setDiagSearchResults([]);
      setDiagExactMatch(false);
      setDiagSuggestions([]);
      setIsDiagSearching(false);
      return;
    }

    setIsDiagSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/operations/clinical-diagnoses/search?q=${encodeURIComponent(term)}`);
        if (res.data?.success) {
          setDiagSearchResults(res.data.data || []);
          setDiagExactMatch(!!res.data.exactMatch);
          setDiagSuggestions(res.data.suggestions || []);
        }
      } catch (err) {
        console.error('Diagnosis Master search error:', err);
      } finally {
        setIsDiagSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [diagSearch]);

  // Dynamic Frequently Used Diagnoses Hook
  const { data: frequentDiagnosesData, refetch: refetchFrequentDiagnoses } = useQuery({
    queryKey: ['frequentDiagnoses'],
    queryFn: async () => {
      const res = await api.get('/operations/clinical-diagnoses/frequent');
      return res.data?.data || [];
    },
    staleTime: 60000
  });

  // Toggle favorite diagnosis mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/operations/clinical-diagnoses/${id}/favorite`);
      return res.data;
    },
    onSuccess: () => {
      refetchFrequentDiagnoses();
    }
  });

  // States for Continuous consultation Workspace
  const [clinicalNotes, setClinicalNotes] = useState('');

  // Helper to format or map pain scores to descriptive ranges
  const formatPainScore = (val) => {
    if (!val || val === '') return '';
    const str = String(val).trim();
    if (['0 – No Pain', '1–3 – Mild', '4–6 – Moderate', '7–10 – Severe'].includes(str)) return str;
    const num = parseInt(str, 10);
    if (!isNaN(num)) {
      if (num === 0) return '0 – No Pain';
      if (num >= 1 && num <= 3) return '1–3 – Mild';
      if (num >= 4 && num <= 6) return '4–6 – Moderate';
      if (num >= 7) return '7–10 – Severe';
    }
    return str;
  };

  // IPD Clinical Assessment & Progress Notes State (Strictly for IPD Patients - starts empty for new rounds)
  const [ipdChiefComplaints, setIpdChiefComplaints] = useState('');
  const [ipdGeneralCondition, setIpdGeneralCondition] = useState('');
  const [ipdConsciousness, setIpdConsciousness] = useState('');
  const [ipdPainScore, setIpdPainScore] = useState('');
  const [ipdExaminationFindings, setIpdExaminationFindings] = useState('');
  const [ipdAssessmentPlan, setIpdAssessmentPlan] = useState('');
  const [isSavingClinicalNotes, setIsSavingClinicalNotes] = useState(false);

  // Vitals State
  const [vitals, setVitals] = useState({
    bpSystolic: '',
    bpDiastolic: '',
    pulse: '',
    temperature: '',
    RR: '',
    weight: '',
    height: '',
    spo2: '',
    bmi: ''
  });

  // Multiple Diagnoses State (backward compatible with primaryDiagnosis)
  const [diagnoses, setDiagnoses] = useState([]);
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState('');
  const [diagnosisStatus, setDiagnosisStatus] = useState('Provisional');

  // Keep primaryDiagnosis automatically synchronized with diagnoses[0]
  useEffect(() => {
    if (diagnoses.length > 0) {
      if (primaryDiagnosis !== diagnoses[0]) {
        setPrimaryDiagnosis(diagnoses[0]);
      }
    } else if (primaryDiagnosis) {
      setPrimaryDiagnosis('');
    }
  }, [diagnoses, primaryDiagnosis]);

  // Prescriptions Grid State
  const [prescriptionsList, setPrescriptionsList] = useState([]);

  // Template Confirmation States
  const [rememberChoice, setRememberChoice] = useState(false);
  const [savedChoice, setSavedChoice] = useState(null); // 'replace' | 'append'
  const [isTemplateConfirmOpen, setIsTemplateConfirmOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [selectedApplyOption, setSelectedApplyOption] = useState('replace');
  const [localRemember, setLocalRemember] = useState(false);


  // Autocomplete row states
  const [activeSuggestionRowId, setActiveSuggestionRowId] = useState(null);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dropdownCoords, setDropdownCoords] = useState(null);

  // Advice State (Checklist + custom notes)
  const [checkedAdvice, setCheckedAdvice] = useState([]);
  const [customAdvice, setCustomAdvice] = useState('');

  // Follow-up State
  const [followupRequired, setFollowupRequired] = useState(false);
  const [followupDate, setFollowupDate] = useState('');
  const [followupReason, setFollowupReason] = useState('Follow-up Checkup');

  // Investigation checklist state
  const [checkedInvestigations, setCheckedInvestigations] = useState([]);
  const [customInvestigation, setCustomInvestigation] = useState('');

  // Fetch active services configured in hospital's service catalog
  const { data: hospitalServices = [] } = useQuery({
    queryKey: ['hospitalServicesConsultation', user?.hospitalId || user?.hospital?._id],
    queryFn: async () => {
      try {
        const res = await api.get('/admin/services');
        return Array.isArray(res.data?.data) ? res.data.data : [];
      } catch (err) {
        return [];
      }
    },
    staleTime: 60 * 1000
  });

  const isLabEnabled = isFeatureModuleEnabled(user?.hospital || user, 'Laboratory');
  const isRadEnabled = isFeatureModuleEnabled(user?.hospital || user, 'Radiology');

  // Active laboratory and radiology services from hospital catalog
  const activeLabServices = useMemo(() => {
    if (!isLabEnabled) return [];
    return hospitalServices.filter(s =>
      s && s.status === 'active' &&
      (s.serviceType || '').toLowerCase() === 'laboratory'
    );
  }, [hospitalServices, isLabEnabled]);

  const activeRadServices = useMemo(() => {
    if (!isRadEnabled) return [];
    return hospitalServices.filter(s =>
      s && s.status === 'active' &&
      (s.serviceType || '').toLowerCase() === 'radiology'
    );
  }, [hospitalServices, isRadEnabled]);

  // Documents State
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState('Lab Reports');
  const [newDocData, setNewDocData] = useState('');

  // Collapsible section expansion states
  const [isAdviceExpanded, setIsAdviceExpanded] = useState(false);
  const [_isFollowupExpanded, setIsFollowupExpanded] = useState(false);
  const [isInvestigationExpanded, setIsInvestigationExpanded] = useState(false);
  const [isDocumentsExpanded, setIsDocumentsExpanded] = useState(false);

  // Consultation Type Enum & Custom Fee States
  const [consultationType, setConsultationType] = useState('New Consultation');
  const [customConsultationFee, setCustomConsultationFee] = useState('');

  // Auto-save tracking state
  const [draftSavedTime, setDraftSavedTime] = useState(null);

  // Fetch appointment or IPD admission details
  const { data: appointment, isLoading: appLoading } = useQuery({
    queryKey: ['appointmentConsultationWorkspace', consultationId],
    queryFn: async () => {
      if (!consultationId) return null;
      const isExplicitIpd = searchParams.get('type') === 'ipd';

      // If explicitly marked as IPD, check IPD admission FIRST
      if (isExplicitIpd) {
        try {
          const ipdRes = await api.get(`/ipd/admissions/${consultationId}`);
          const adm = ipdRes.data?.data || ipdRes.data;
          if (adm && (adm._id || adm.patientId)) {
            let dailyReviewsList = Array.isArray(adm.dailyReviews) ? [...adm.dailyReviews] : [];
            try {
              const reviewsRes = await api.get(`/ipd/admissions/${consultationId}/daily-reviews`);
              if (Array.isArray(reviewsRes.data?.dailyReviews) && reviewsRes.data.dailyReviews.length > 0) {
                dailyReviewsList = reviewsRes.data.dailyReviews;
              }
            } catch (_) { }

            const isCompletedIpd = adm.dischargeSummaryStatus === 'Sent to Reception' ||
                                   adm.dischargeSummaryStatus === 'Completed' ||
                                   adm.clinicalDischargeSummary?.status === 'Sent to Reception' ||
                                   adm.status === 'Discharged';

            return {
              _id: adm._id,
              isIpd: true,
              admissionId: adm.admissionId,
              ipdNo: adm.admissionId,
              tokenNumber: adm.admissionId || 'IPD-01',
              tokenNo: adm.admissionId || 'IPD-01',
              patientId: adm.patientId,
              doctorId: adm.attendingDoctorId || user,
              attendingDoctorId: adm.attendingDoctorId || user,
              date: adm.admissionDate,
              admissionDate: adm.admissionDate,
              admissionTime: adm.admissionTime,
              admissionType: adm.admissionType || 'Inpatient Admission',
              reasonForAdmission: adm.reasonForAdmission || 'Inpatient Clinical Care',
              admissionStatus: isCompletedIpd ? (adm.status === 'Discharged' ? 'Discharged' : 'Completed') : (adm.status || 'Admitted'),
              status: isCompletedIpd ? (adm.status === 'Discharged' ? 'Discharged' : 'Completed') : (adm.status || 'Admitted'),
              queueStatus: isCompletedIpd ? 'Completed' : (adm.queueStatus || 'In Progress'),
              dischargeSummaryStatus: adm.dischargeSummaryStatus,
              consultationStatus: isCompletedIpd ? 'Completed' : (adm.consultationStatus || 'In Progress'),
              consultationFinished: isCompletedIpd,
              consultationDate: new Date().toISOString(),
              appointmentType: 'Inpatient (IPD)',
              consultationType: 'Inpatient Round',
              chiefComplaint: adm.reasonForAdmission || 'Inpatient Clinical Care',
              billingStatus: 'Paid',
              paymentStatus: 'Paid',
              vitals: adm.patientId?.vitals || (dailyReviewsList.length > 0 ? dailyReviewsList[dailyReviewsList.length - 1].vitals : {}),
              ward: adm.bedId?.wardId?.name,
              bedNumber: adm.bedId?.bedNumber,
              roomNumber: adm.bedId?.roomNumber,
              rawAdmission: { ...adm, dailyReviews: dailyReviewsList },
              dailyReviews: dailyReviewsList,
              dischargeMedicines: adm.dischargeMedicines || adm.clinicalDischargeSummary?.dischargeMedicines || [],
              treatmentSummary: adm.treatmentSummary || adm.clinicalDischargeSummary?.treatmentSummary || '',
              dischargeInstructions: adm.dischargeInstructions || adm.clinicalDischargeSummary?.dischargeInstructions || '',
              finalDiagnosis: adm.finalDiagnosis || adm.clinicalDischargeSummary?.finalDiagnosis || ''
            };
          }
        } catch (_) { }
      }

      try {
        const directRes = await api.get(`/operations/appointments/${consultationId}`);
        if (directRes.data?.data) return directRes.data.data;
      } catch (_) { }

      // Check if this is an IPD admission (if not already checked)
      if (!isExplicitIpd) {
        try {
          const ipdRes = await api.get(`/ipd/admissions/${consultationId}`);
          const adm = ipdRes.data?.data || ipdRes.data;
          if (adm && (adm._id || adm.patientId)) {
            const isCompletedIpd = adm.dischargeSummaryStatus === 'Sent to Reception' ||
                                   adm.dischargeSummaryStatus === 'Completed' ||
                                   adm.clinicalDischargeSummary?.status === 'Sent to Reception' ||
                                   adm.status === 'Discharged';

            return {
              _id: adm._id,
              isIpd: true,
              admissionId: adm.admissionId,
              ipdNo: adm.admissionId,
              tokenNumber: adm.admissionId || 'IPD-01',
              tokenNo: adm.admissionId || 'IPD-01',
              patientId: adm.patientId,
              doctorId: adm.attendingDoctorId || user,
              attendingDoctorId: adm.attendingDoctorId || user,
              date: adm.admissionDate,
              admissionDate: adm.admissionDate,
              admissionTime: adm.admissionTime,
              admissionType: adm.admissionType || 'Inpatient Admission',
              reasonForAdmission: adm.reasonForAdmission || 'Inpatient Clinical Care',
              admissionStatus: isCompletedIpd ? (adm.status === 'Discharged' ? 'Discharged' : 'Completed') : (adm.status || 'Admitted'),
              status: isCompletedIpd ? (adm.status === 'Discharged' ? 'Discharged' : 'Completed') : (adm.status || 'Admitted'),
              queueStatus: isCompletedIpd ? 'Completed' : (adm.queueStatus || 'In Progress'),
              dischargeSummaryStatus: adm.dischargeSummaryStatus,
              consultationStatus: isCompletedIpd ? 'Completed' : (adm.consultationStatus || 'In Progress'),
              consultationFinished: isCompletedIpd,
              consultationDate: new Date().toISOString(),
              appointmentType: 'Inpatient (IPD)',
              consultationType: 'Inpatient Round',
              chiefComplaint: adm.reasonForAdmission || 'Inpatient Clinical Care',
              billingStatus: 'Paid',
              paymentStatus: 'Paid',
              vitals: adm.patientId?.vitals || (adm.dailyReviews?.length > 0 ? adm.dailyReviews[adm.dailyReviews.length - 1].vitals : {}),
              ward: adm.bedId?.wardId?.name,
              bedNumber: adm.bedId?.bedNumber,
              roomNumber: adm.bedId?.roomNumber,
              rawAdmission: adm,
              dailyReviews: adm.dailyReviews || [],
              dischargeMedicines: adm.dischargeMedicines || adm.clinicalDischargeSummary?.dischargeMedicines || [],
              treatmentSummary: adm.treatmentSummary || adm.clinicalDischargeSummary?.treatmentSummary || '',
              dischargeInstructions: adm.dischargeInstructions || adm.clinicalDischargeSummary?.dischargeInstructions || '',
              finalDiagnosis: adm.finalDiagnosis || adm.clinicalDischargeSummary?.finalDiagnosis || ''
            };
          }
        } catch (_) { }
      }

      try {
        const res = await api.get(`/operations/appointments`);
        const matched = res.data?.data?.find(a => a._id === consultationId);
        if (matched) return matched;
      } catch (_) { }

      // Fallback check IPD admissions list
      try {
        const allAdmRes = await api.get(`/ipd/admissions`);
        const list = allAdmRes.data?.data || allAdmRes.data || [];
        const found = Array.isArray(list) ? list.find(a => a._id === consultationId) : null;
        if (found) {
          const isCompletedIpd = found.dischargeSummaryStatus === 'Sent to Reception' ||
                                 found.dischargeSummaryStatus === 'Completed' ||
                                 found.clinicalDischargeSummary?.status === 'Sent to Reception' ||
                                 found.status === 'Discharged';

          return {
            _id: found._id,
            isIpd: true,
            admissionId: found.admissionId,
            ipdNo: found.admissionId,
            tokenNumber: found.admissionId || 'IPD-01',
            tokenNo: found.admissionId || 'IPD-01',
            patientId: found.patientId,
            doctorId: found.attendingDoctorId || user,
            attendingDoctorId: found.attendingDoctorId || user,
            date: found.admissionDate,
            admissionDate: found.admissionDate,
            admissionTime: found.admissionTime,
            admissionType: found.admissionType || 'Inpatient Admission',
            reasonForAdmission: found.reasonForAdmission || 'Inpatient Clinical Care',
            admissionStatus: isCompletedIpd ? (found.status === 'Discharged' ? 'Discharged' : 'Completed') : (found.status || 'Admitted'),
            status: isCompletedIpd ? (found.status === 'Discharged' ? 'Discharged' : 'Completed') : (found.status || 'Admitted'),
            queueStatus: isCompletedIpd ? 'Completed' : (found.queueStatus || 'In Progress'),
            dischargeSummaryStatus: found.dischargeSummaryStatus,
            consultationStatus: isCompletedIpd ? 'Completed' : (found.consultationStatus || 'In Progress'),
            consultationFinished: isCompletedIpd,
            consultationDate: new Date().toISOString(),
            appointmentType: 'Inpatient (IPD)',
            consultationType: 'Inpatient Round',
            chiefComplaint: found.reasonForAdmission || 'Inpatient Clinical Care',
            billingStatus: 'Paid',
            paymentStatus: 'Paid',
            vitals: found.patientId?.vitals || (found.dailyReviews?.length > 0 ? found.dailyReviews[found.dailyReviews.length - 1].vitals : {}),
            ward: found.bedId?.wardId?.name,
            bedNumber: found.bedId?.bedNumber,
            rawAdmission: found,
            dailyReviews: found.dailyReviews || [],
            dischargeMedicines: found.dischargeMedicines || found.clinicalDischargeSummary?.dischargeMedicines || [],
            treatmentSummary: found.treatmentSummary || found.clinicalDischargeSummary?.treatmentSummary || '',
            dischargeInstructions: found.dischargeInstructions || found.clinicalDischargeSummary?.dischargeInstructions || '',
            finalDiagnosis: found.finalDiagnosis || found.clinicalDischargeSummary?.finalDiagnosis || ''
          };
        }
      } catch (_) { }

      // Fallback check consultation endpoint
      try {
        const cRes = await api.get(`/operations/consultations/${consultationId}`);
        const cData = cRes.data?.data || cRes.data;
        if (cData) {
          if (cData.appointmentId && typeof cData.appointmentId === 'object' && cData.appointmentId._id) {
            return cData.appointmentId;
          }
          if (cData.appointmentId && typeof cData.appointmentId === 'string') {
            const aRes = await api.get(`/operations/appointments/${cData.appointmentId}`);
            if (aRes.data?.data) return aRes.data.data;
          }
          return {
            _id: cData._id,
            patientId: cData.patientId,
            doctorId: cData.doctorId || user,
            date: cData.consultationDate || cData.date,
            tokenNumber: cData.tokenNumber || '01',
            chiefComplaint: cData.chiefComplaint || cData.clinicalNotes || '',
            vitals: cData.vitals || {},
            prescriptions: cData.prescriptions || [],
            status: cData.status || 'Completed',
            queueStatus: cData.queueStatus || 'Completed',
            billingStatus: 'Paid'
          };
        }
      } catch (_) { }

      return null;
    },
    enabled: !!consultationId,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  // Fetch today's appointments if no visitId is specified to redirect seamlessly
  const { data: queueForCheck } = useQuery({
    queryKey: ['doctorQueueCheckWorkspace', user?._id],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/operations/appointments?date=${today}&doctorId=${user?._id}`);
      return res.data.data;
    },
    enabled: !activeVisitId && !!user?._id
  });

  useEffect(() => {
    if (!activeVisitId && queueForCheck) {
      const activeApp = queueForCheck.find(a => getVisitStatus(a) === 'In Consultation' || a.queueStatus === 'In-Consultation');
      if (activeApp) {
        navigate(`/doctor/consultation/${activeApp._id}`, { replace: true });
      }
    }
  }, [activeVisitId, queueForCheck, navigate]);

  const isIpdConsultation = Boolean(appointment?.isIpd || searchParams.get('type') === 'ipd');

  const isFollowupConsultation = Boolean(
    searchParams.get('type') === 'followup' ||
    searchParams.get('fresh') === 'true' ||
    appointment?.consultationType === 'Follow-Up' ||
    appointment?.isFollowup ||
    appointment?.isFollowUp
  );

  const isConsultationCompleted = Boolean(
    appointment && (
      isIpdConsultation
        ? (
            appointment.status === 'Discharged' ||
            appointment.admissionStatus === 'Discharged' ||
            appointment.dischargeSummaryStatus === 'Sent to Reception' ||
            appointment.dischargeSummaryStatus === 'Completed' ||
            appointment.clinicalDischargeSummary?.status === 'Sent to Reception'
          )
        : (
            isCompletedVisit(getVisitStatus(appointment)) ||
            appointment.status === 'Completed' ||
            appointment.queueStatus === 'Completed' ||
            appointment.status === 'Sent to Pharmacy' ||
            appointment.status === 'Sent To Pharmacy' ||
            appointment.queueStatus === 'Sent to Pharmacy' ||
            appointment.queueStatus === 'Sent To Pharmacy' ||
            appointment.consultationStatus === 'Completed' ||
            appointment.consultationFinished === true ||
            appointment.followupCompleted === true ||
            appointment.workflow?.consultationState === 'COMPLETED' ||
            appointment.workflow?.queueState === 'COMPLETED' ||
            appointment.workflow?.queueState === 'SENT_TO_PHARMACY'
          )
    )
  );

  const isReadOnly = Boolean(
    searchParams.get('mode') === 'view' ||
    (isConsultationCompleted && searchParams.get('fresh') !== 'true')
  );

  // Clinical Review Rounds Management State
  const [roundsDataMap, setRoundsDataMap] = useState({});
  const [activeRoundNumber, setActiveRoundNumber] = useState(1);
  const [availableRoundNumbers, setAvailableRoundNumbers] = useState([1]);

  // IPD Daily Consultation Round Tracking
  // Strictly count original completed doctor consultation reviews from patient admission history (no phantom rounds)
  const ipdCompletedReviews = useMemo(() => {
    if (!isIpdConsultation) return 0;
    if (Array.isArray(appointment?.dailyReviews) && appointment.dailyReviews.length > 0) {
      return appointment.dailyReviews.length;
    }
    if (Array.isArray(appointment?.rawAdmission?.dailyReviews)) {
      return appointment.rawAdmission.dailyReviews.length;
    }
    return 0;
  }, [isIpdConsultation, appointment?.dailyReviews, appointment?.rawAdmission]);

  const currentRoundNumber = activeRoundNumber || (ipdCompletedReviews === 0 ? 1 : ipdCompletedReviews + 1);

  // Check if active round is an already consulted / recorded round (Read-Only)
  const isPastRoundReadOnly = Boolean(
    isIpdConsultation && (
      isReadOnly ||
      roundsDataMap[activeRoundNumber]?.isSaved === true ||
      activeRoundNumber <= ipdCompletedReviews
    )
  );

  // Effective read-only status (either visit is completed or active round is a past clinical review round)
  const isEffectiveReadOnly = Boolean(isReadOnly || isPastRoundReadOnly);

  // Target round number for current/in-progress consultation to switch to
  const currentConsultationRoundNumber = useMemo(() => {
    if (!isIpdConsultation) return 1;
    return (ipdCompletedReviews || 0) + 1;
  }, [isIpdConsultation, ipdCompletedReviews]);

  // Comprehensive IPD Department Details helper strictly for IPD patients
  const ipdDetails = useMemo(() => {
    if (!isIpdConsultation) return null;
    const adm = appointment?.rawAdmission || appointment || {};
    const patient = appointment?.patientId || adm.patientId || {};

    const admDateRaw = adm.admissionDate || appointment?.date;
    const admDateObj = admDateRaw ? new Date(admDateRaw) : null;
    const admissionDateFormatted = admDateObj && !isNaN(admDateObj.getTime())
      ? admDateObj.toLocaleDateString('en-GB')
      : 'N/A';

    let stayDays = 1;
    if (admDateObj && !isNaN(admDateObj.getTime())) {
      const today = new Date();
      const start = new Date(admDateObj.getFullYear(), admDateObj.getMonth(), admDateObj.getDate());
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const diffMs = end - start;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
      stayDays = diffDays > 0 ? diffDays : 1;
    }

    const wardName = adm.bedId?.wardId?.name || appointment?.ward || 'General Ward';
    const bedNum = adm.bedId?.bedNumber || appointment?.bedNumber || 'N/A';
    const wardBedDisplay = `${wardName} / Bed ${bedNum}`;
    const docName = formatDoctorDisplayName(adm.attendingDoctorId?.name || appointment?.doctorId?.name || user?.name);

    return {
      admissionId: adm.admissionId || appointment?.admissionId || appointment?.tokenNumber || 'IPD-N/A',
      uhid: patient.uhid || 'PAT-N/A',
      patientName: patient.name || 'Unknown Patient',
      bloodGroup: patient.bloodGroup || 'N/A',
      age: patient.age ? `${patient.age} Years` : 'N/A',
      gender: patient.gender || 'N/A',
      status: adm.status || appointment?.admissionStatus || 'Admitted',
      admissionType: adm.admissionType || 'Routine Admission',
      admissionDateFormatted,
      admissionTime: adm.admissionTime || (admDateObj && !isNaN(admDateObj.getTime()) ? admDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'),
      stayDays,
      wardName,
      bedNumber: bedNum,
      wardBedDisplay,
      doctorName: docName,
      reasonForAdmission: adm.reasonForAdmission || appointment?.chiefComplaint || 'Inpatient Clinical Care',
      allergiesDisplay: formatAllergiesDisplay(appointment, 'None'),
      totalRoundsCompleted: ipdCompletedReviews,
      currentRound: currentRoundNumber
    };
  }, [isIpdConsultation, appointment, user?.name, ipdCompletedReviews, currentRoundNumber]);

  // Helper to snapshot active form state into an object for round caching
  const getCurrentRoundSnapshot = () => ({
    chiefComplaints: ipdChiefComplaints,
    generalCondition: ipdGeneralCondition,
    consciousnessLevel: ipdConsciousness,
    painScore: ipdPainScore,
    examinationFindings: ipdExaminationFindings,
    assessmentPlan: ipdAssessmentPlan,
    diagnoses: Array.isArray(diagnoses) ? [...diagnoses] : [],
    primaryDiagnosis,
    diagnosisStatus,
    clinicalNotes: ipdAssessmentPlan || ipdExaminationFindings || clinicalNotes,
    prescriptionsList: Array.isArray(prescriptionsList) ? [...prescriptionsList] : [],
    checkedAdvice: Array.isArray(checkedAdvice) ? [...checkedAdvice] : [],
    customAdvice,
    followupRequired,
    followupDate,
    followupReason,
    checkedInvestigations: Array.isArray(checkedInvestigations) ? [...checkedInvestigations] : [],
    customInvestigation,
    vitals: (vitals && typeof vitals === 'object') ? { ...vitals } : {},
    uploadedDocs: Array.isArray(uploadedDocs) ? [...uploadedDocs] : []
  });

  // Switch between Clinical Review Rounds
  const handleSwitchRound = (targetRoundNum) => {
    if (targetRoundNum === activeRoundNumber) return;

    // 1. Save current round's in-progress state to roundsDataMap ONLY IF current round is editable (not a saved/consulted past round)
    let updatedMap = { ...roundsDataMap };
    const isCurrentActivePastRound = Boolean(
      isIpdConsultation && (
        roundsDataMap[activeRoundNumber]?.isSaved === true ||
        activeRoundNumber <= ipdCompletedReviews
      )
    );

    if (!isReadOnly && !isCurrentActivePastRound) {
      const currentSnapshot = getCurrentRoundSnapshot();
      updatedMap = {
        ...roundsDataMap,
        [activeRoundNumber]: {
          ...(roundsDataMap[activeRoundNumber] || {}),
          ...currentSnapshot,
          roundNumber: activeRoundNumber
        }
      };
    }

    // 2. Fetch target round data
    const targetData = updatedMap[targetRoundNum] || {};

    const isTargetNewRound = Boolean(
      isIpdConsultation &&
      (targetRoundNum > ipdCompletedReviews) &&
      !targetData.isSaved &&
      !targetData.isExplicitDraft
    );

    if (isTargetNewRound) {
      // For a NEW round: ONLY carry forward the doctor's original diagnosis from 1st round / prior rounds!
      // Do NOT fetch remaining cards or sections (medicines, clinical assessment, vitals, tests, advice) - keep them clean!
      const currentReviews = (Array.isArray(appointment?.dailyReviews) && appointment.dailyReviews.length > 0)
        ? appointment.dailyReviews
        : (Array.isArray(appointment?.rawAdmission?.dailyReviews) ? appointment.rawAdmission.dailyReviews : []);
      const defaultDiags = targetData.diagnoses && targetData.diagnoses.length > 0
        ? targetData.diagnoses
        : getIpdDefaultDiagnoses(currentReviews);

      setDiagnoses(defaultDiags);
      setPrimaryDiagnosis(defaultDiags[0] || '');
      setDiagnosisStatus(defaultDiags.length > 0 ? 'Confirmed' : 'Provisional');
      setClinicalNotes('');
      setPrescriptionsList([]);
      setCheckedAdvice([]);
      setCustomAdvice('');
      setFollowupRequired(false);
      setFollowupDate('');
      setFollowupReason('Follow-up Checkup');
      setCheckedInvestigations([]);
      setCustomInvestigation('');
      setIpdChiefComplaints('');
      setIpdGeneralCondition('');
      setIpdConsciousness('');
      setIpdPainScore('');
      setIpdExaminationFindings('');
      setIpdAssessmentPlan('');
      setVitals({});
      setUploadedDocs([]);
    } else {
      // 3. Load target round data into active form state
      setDiagnoses(targetData.diagnoses || []);
      setPrimaryDiagnosis(targetData.primaryDiagnosis || targetData.diagnoses?.[0] || '');
      setDiagnosisStatus(targetData.diagnosisStatus || 'Confirmed');
      setClinicalNotes(targetData.clinicalNotes || '');
      setPrescriptionsList(targetData.prescriptionsList || []);
      setCheckedAdvice(targetData.checkedAdvice || []);
      setCustomAdvice(targetData.customAdvice || '');
      setFollowupRequired(Boolean(targetData.followupRequired));
      setFollowupDate(targetData.followupDate || '');
      setFollowupReason(targetData.followupReason || 'Follow-up Checkup');
      setCheckedInvestigations(targetData.checkedInvestigations || []);
      setCustomInvestigation(targetData.customInvestigation || '');
      if (targetData.vitals) {
        setVitals(targetData.vitals);
      }
      if (targetData.uploadedDocs) {
        setUploadedDocs(targetData.uploadedDocs);
      }

      // Load IPD clinical assessment & progress notes fields
      setIpdChiefComplaints(targetData.chiefComplaints || '');
      setIpdGeneralCondition(targetData.generalCondition || '');
      setIpdConsciousness(targetData.consciousnessLevel || '');
      setIpdPainScore(targetData.painScore !== undefined && targetData.painScore !== null ? String(targetData.painScore) : '');
      setIpdExaminationFindings(targetData.examinationFindings || targetData.clinicalFindings || '');
      setIpdAssessmentPlan(targetData.assessmentPlan || targetData.assessment || '');
    }

    setRoundsDataMap(updatedMap);
    setActiveRoundNumber(targetRoundNum);

    // Save rounds state to localStorage
    try {
      localStorage.setItem(`consult_rounds_${consultationId}`, JSON.stringify({
        activeRoundNumber: targetRoundNum,
        availableRoundNumbers,
        roundsDataMap: updatedMap
      }));
    } catch (_) { }

    const isTargetPastRound = Boolean(
      isIpdConsultation && (
        targetData.isSaved === true ||
        targetRoundNum <= ipdCompletedReviews
      )
    );

    if (isTargetPastRound) {
      toast(`Viewing Round ${targetRoundNum} (Recorded Consultation • Read-Only)`, { icon: 'ℹ️' });
    } else {
      toast.success(`Switched to Round ${targetRoundNum} (Current Consultation)`);
    }
  };

  // Formatted date and time for IPD Clinical Assessment Card header
  const formattedRoundDateTime = useMemo(() => {
    const rData = roundsDataMap?.[activeRoundNumber];
    const dStr = rData?.reviewDate || appointment?.date;
    const d = dStr ? new Date(dStr) : new Date();
    const dateFormatted = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeFormatted = rData?.reviewTime || (!isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    return `${dateFormatted} • ${timeFormatted}`;
  }, [roundsDataMap, activeRoundNumber, appointment?.date]);

  // Comprehensive helper strictly for IPD doctor prescription to track whether doctor added lab or tests in this round
  const activeRoundInvestigations = useMemo(() => {
    if (!isIpdConsultation) return [];
    const rData = roundsDataMap?.[activeRoundNumber];
    const list = [];
    const seen = new Set();

    // 1. In recorded/saved rounds, prioritize rData.investigations
    if (Array.isArray(rData?.investigations) && rData.investigations.length > 0) {
      for (const inv of rData.investigations) {
        const name = typeof inv === 'string' ? inv.trim() : String(inv.name || inv.serviceName || inv.testName || '').trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          const sType = typeof inv === 'object' ? (inv.serviceType || inv.category) : '';
          list.push({
            name,
            serviceType: sType || (isLikelyRadiology(name) ? 'Radiology' : 'Laboratory'),
            price: typeof inv === 'object' ? inv.price : undefined
          });
        }
      }
    }

    // 2. Also check checkedInvestigations in current active state
    if (Array.isArray(checkedInvestigations)) {
      for (const invItem of checkedInvestigations) {
        const name = typeof invItem === 'string' ? invItem.trim() : String(invItem?.name || invItem?.serviceName || '').trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          const matched = resolveHospitalService(name, hospitalServices);
          list.push({
            name,
            serviceType: matched?.serviceType || (isLikelyRadiology(name) ? 'Radiology' : 'Laboratory'),
            price: matched?.price
          });
        }
      }
    }

    // 3. Custom investigations entered
    if (customInvestigation && customInvestigation.trim()) {
      const parts = customInvestigation.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!seen.has(p.toLowerCase())) {
          seen.add(p.toLowerCase());
          list.push({
            name: p,
            serviceType: isLikelyRadiology(p) ? 'Radiology' : 'Laboratory (Custom)'
          });
        }
      }
    }

    return list;
  }, [isIpdConsultation, roundsDataMap, activeRoundNumber, checkedInvestigations, customInvestigation, hospitalServices]);

  // Save IPD Clinical Assessment & Progress Notes for this round
  const handleSaveClinicalNotes = async () => {
    if (isEffectiveReadOnly) return;
    setIsSavingClinicalNotes(true);
    try {
      const currentSnapshot = getCurrentRoundSnapshot();
      const updatedMap = {
        ...roundsDataMap,
        [activeRoundNumber]: {
          ...(roundsDataMap[activeRoundNumber] || {}),
          ...currentSnapshot,
          roundNumber: activeRoundNumber
        }
      };
      setRoundsDataMap(updatedMap);

      // Save to localStorage draft
      try {
        localStorage.setItem(`consult_rounds_${consultationId}`, JSON.stringify({
          activeRoundNumber,
          availableRoundNumbers,
          roundsDataMap: updatedMap
        }));
      } catch (_) { }

      // Direct sync with IPD daily review
      const ipdAdmId = appointment?.rawAdmission?._id || appointment?.admissionId || appointment?._id || consultationId;
      if (ipdAdmId) {
        const conditionParts = [];
        if (ipdGeneralCondition) conditionParts.push(`Condition: ${ipdGeneralCondition}`);
        if (ipdConsciousness) conditionParts.push(`Consciousness: ${ipdConsciousness}`);
        if (ipdPainScore) conditionParts.push(`Pain: ${formatPainScore(ipdPainScore)}`);
        const autoFindings = conditionParts.join(' | ');

        await ipdService.saveDailyReview(ipdAdmId, {
          dayNumber: activeRoundNumber,
          reviewDate: new Date(),
          reviewTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          doctorId: user?._id,
          doctorName: user?.name || 'Doctor',
          chiefComplaints: ipdChiefComplaints,
          generalCondition: ipdGeneralCondition,
          consciousnessLevel: ipdConsciousness,
          painScore: ipdPainScore,
          clinicalFindings: ipdExaminationFindings || autoFindings,
          examinationFindings: ipdExaminationFindings,
          assessment: ipdAssessmentPlan,
          assessmentPlan: ipdAssessmentPlan,
          treatmentPlan: [checkedAdvice.join(', '), customAdvice].filter(Boolean).join(' | ') || customAdvice || ipdAssessmentPlan,
          vitals: vitals
        });
      }

      toast.success('Clinical assessment & progress notes saved successfully!');
    } catch (err) {
      toast.success('Clinical notes saved to active consultation round!');
    } finally {
      setIsSavingClinicalNotes(false);
    }
  };

  // Reset IPD Clinical Assessment & Progress Notes to round's stored state
  const handleResetClinicalNotes = () => {
    const roundData = roundsDataMap[activeRoundNumber] || {};
    setIpdChiefComplaints(roundData.chiefComplaints || '');
    setIpdGeneralCondition(roundData.generalCondition || '');
    setIpdConsciousness(roundData.consciousnessLevel || '');
    setIpdPainScore(roundData.painScore !== undefined && roundData.painScore !== null ? String(roundData.painScore) : '');
    setIpdExaminationFindings(roundData.examinationFindings || roundData.clinicalFindings || '');
    setIpdAssessmentPlan(roundData.assessmentPlan || roundData.assessment || '');
    toast('Clinical notes reset for this round', { icon: 'ℹ️' });
  };

  // Initialize and synchronize Clinical Review Rounds strictly from IPD Daily Reviews and current round
  useEffect(() => {
    if (!appointment) return;

    const rawReviews = (Array.isArray(appointment.dailyReviews) && appointment.dailyReviews.length > 0)
      ? appointment.dailyReviews
      : (Array.isArray(appointment.rawAdmission?.dailyReviews) ? appointment.rawAdmission.dailyReviews : []);

    // Sort chronologically by dayNumber
    const sortedReviews = [...rawReviews].sort((a, b) => {
      const numA = Number(a.dayNumber) || 0;
      const numB = Number(b.dayNumber) || 0;
      return numA - numB;
    });

    const completedCount = sortedReviews.length;
    const currentRoundNum = completedCount + 1;

    // Strictly enforce available rounds:
    // - All completed rounds: 1 .. completedCount (Before rounds)
    // - Plus the single active round: completedCount + 1 (Current round, if !isReadOnly)
    const expectedRoundNumbers = [];
    if (completedCount > 0) {
      for (let i = 1; i <= completedCount; i++) {
        expectedRoundNumbers.push(i);
      }
      if (!isReadOnly) {
        expectedRoundNumbers.push(currentRoundNum);
      }
    } else {
      expectedRoundNumbers.push(1);
    }

    // Check if there is saved rounds state in localStorage
    const savedRoundsState = localStorage.getItem(`consult_rounds_${consultationId}`);
    let restoredRounds = null;
    if (savedRoundsState) {
      try {
        restoredRounds = JSON.parse(savedRoundsState);
      } catch (_) { }
    }

    // Build the master rounds map:
    const map = {};

    // 1. Load recorded past rounds from database sortedReviews
    sortedReviews.forEach((rev, idx) => {
      const roundNum = Number(rev.dayNumber) || (idx + 1);
      const parsedMeds = (rev.prescriptions || []).map((p, pIdx) => {
        const rawDose = String(p.dose || p.dosage || p.frequency || '').trim();
        let morning = p.morning !== undefined && p.morning !== null ? String(p.morning) : '';
        let afternoon = p.afternoon !== undefined && p.afternoon !== null ? String(p.afternoon) : '';
        let night = p.night !== undefined && p.night !== null ? String(p.night) : '';

        if (rawDose.includes('-')) {
          const parts = rawDose.split('-');
          morning = parts[0] !== undefined ? parts[0] : morning;
          afternoon = parts[1] !== undefined ? parts[1] : afternoon;
          night = parts[2] !== undefined ? parts[2] : night;
        } else if (!morning && !afternoon && !night && rawDose) {
          if (/once|od/i.test(rawDose)) { morning = '1'; afternoon = '0'; night = '0'; }
          else if (/twice|bd|bid/i.test(rawDose)) { morning = '1'; afternoon = '0'; night = '1'; }
          else if (/tds|tid|thrice/i.test(rawDose)) { morning = '1'; afternoon = '1'; night = '1'; }
          else { morning = '1'; afternoon = '0'; night = '0'; }
        } else if (!morning && !afternoon && !night) {
          morning = '1'; afternoon = '0'; night = '1';
        }

        return {
          id: p._id || String(Date.now() + pIdx + Math.random()),
          medicineId: p.medicineId || '',
          medicineName: p.medicineName || p.name || '',
          morning: morning || '1',
          afternoon: afternoon || '0',
          night: night || '0',
          food: normalizeFoodTiming(p.timing || p.foodInstruction || p.food || p.instructions || p.foodTiming),
          duration: p.duration || '3 days',
          quantity: p.quantity !== undefined && p.quantity !== null ? p.quantity : 1,
          remarks: p.notes || p.remarks || ''
        };
      });

      const [sys, dia] = (rev.vitals?.bp || '').includes('/') ? rev.vitals.bp.split('/') : ['', ''];
      const parsedVitals = {
        bpSystolic: sys || rev.vitals?.bpSystolic || '',
        bpDiastolic: dia || rev.vitals?.bpDiastolic || '',
        pulse: rev.vitals?.pulse || '',
        temperature: rev.vitals?.temperature || '',
        RR: rev.vitals?.RR || '',
        weight: rev.vitals?.weight || '',
        height: rev.vitals?.height || '',
        spo2: rev.vitals?.spo2 || '',
        bmi: ''
      };

      const diagArr = rev.diagnosis
        ? rev.diagnosis.split(',').map(s => s.trim()).filter(Boolean)
        : (Array.isArray(rev.diagnoses) ? rev.diagnoses : []);

      // Parse investigations (Lab tests & Radiology scans)
      const rawInvs = Array.isArray(rev.investigations) ? rev.investigations : [];
      const invNames = rawInvs.map(inv => {
        if (typeof inv === 'string') return inv.trim();
        return String(inv.name || inv.serviceName || inv.testName || '').trim();
      }).filter(Boolean);

      const customInvs = rawInvs
        .filter(inv => {
          if (typeof inv === 'string') return false;
          return inv.category === 'Custom Request' || inv.isCustom;
        })
        .map(inv => inv.name || inv.serviceName)
        .filter(Boolean)
        .join(', ');

      const effectiveAssessmentPlan = rev.assessmentPlan || rev.treatmentPlan || (rev.assessment && rev.assessment !== 'Doctor consultation completed.' ? rev.assessment : '') || (rev.assessment === 'Doctor consultation completed.' ? (rev.assessmentPlan || rev.treatmentPlan || rev.clinicalFindings || 'Doctor consultation completed.') : '');
      const effectiveClinicalNotes = rev.clinicalFindings || rev.clinicalNotes || effectiveAssessmentPlan || '';
      const effectiveChiefComplaints = rev.chiefComplaints || rev.chiefComplaint || (appointment?.chiefComplaint || '');

      // Only extract genuine advice/guidelines; do NOT duplicately fetch treatmentPlan into advice guidelines (Section 5)
      const effectiveAdvice = rev.customAdvice || (rev.advice && rev.advice !== rev.treatmentPlan ? rev.advice : '');
      const checkedAdviceList = Array.isArray(rev.checkedAdvice)
        ? rev.checkedAdvice
        : (rev.advice && rev.advice !== rev.treatmentPlan ? rev.advice.split(/[,|]/).map(s => s.trim()).filter(Boolean) : []);

      map[roundNum] = {
        roundNumber: roundNum,
        isSaved: true,
        reviewDate: rev.reviewDate || rev.createdAt,
        reviewTime: rev.reviewTime || '',
        doctorName: rev.doctorName || 'Doctor',
        chiefComplaints: effectiveChiefComplaints,
        generalCondition: rev.generalCondition || 'Stable',
        consciousnessLevel: rev.consciousnessLevel || 'Alert',
        painScore: rev.painScore !== undefined && rev.painScore !== null ? String(rev.painScore) : '2',
        examinationFindings: rev.examinationFindings || rev.clinicalFindings || '',
        assessmentPlan: effectiveAssessmentPlan,
        diagnoses: diagArr,
        primaryDiagnosis: diagArr[0] || rev.diagnosis || '',
        diagnosisStatus: 'Confirmed',
        clinicalNotes: effectiveClinicalNotes,
        prescriptionsList: parsedMeds,
        customAdvice: effectiveAdvice,
        checkedAdvice: checkedAdviceList,
        checkedInvestigations: invNames,
        customInvestigation: customInvs,
        investigations: rawInvs,
        vitals: parsedVitals,
        followupRequired: Boolean(rev.followupRequired || rev.followupDate),
        followupDate: rev.followupDate || '',
        followupReason: rev.followupReason || 'Follow-up Checkup'
      };
    });

    // 2. Setup the single Current round (if not read-only)
    const targetCurrentRound = completedCount === 0 ? 1 : currentRoundNum;
    if (completedCount === 0 && isReadOnly) {
      const dischargeMeds = (appointment.dischargeMedicines || appointment.rawAdmission?.dischargeMedicines || []).map((p, pIdx) => {
        const rawDose = p.dose || p.dosage || p.frequency || '';
        const parts = rawDose.includes('-') ? rawDose.split('-') : ['', '', ''];
        return {
          id: p._id || String(Date.now() + pIdx),
          medicineId: p.medicineId || '',
          medicineName: p.medicineName || p.name || '',
          morning: parts[0] || (p.morning || ''),
          afternoon: parts[1] || (p.afternoon || ''),
          night: parts[2] || (p.night || ''),
          food: normalizeFoodTiming(p.timing || p.foodInstruction || p.food),
          duration: p.duration || '3 days',
          quantity: p.quantity || 1,
          remarks: p.notes || p.remarks || ''
        };
      });

      map[1] = {
        roundNumber: 1,
        isSaved: true,
        reviewDate: appointment.admissionDate || new Date().toISOString(),
        reviewTime: appointment.admissionTime || '',
        doctorName: appointment.attendingDoctorId?.name || user?.name || 'Doctor',
        chiefComplaints: appointment.reasonForAdmission || appointment.chiefComplaint || '',
        generalCondition: 'Stable',
        consciousnessLevel: 'Alert',
        painScore: '0',
        examinationFindings: '',
        assessmentPlan: appointment.treatmentSummary || appointment.dischargeInstructions || '',
        diagnoses: [appointment.finalDiagnosis].filter(Boolean),
        primaryDiagnosis: appointment.finalDiagnosis || '',
        diagnosisStatus: appointment.finalDiagnosis ? 'Confirmed' : 'Provisional',
        clinicalNotes: appointment.treatmentSummary || '',
        prescriptionsList: dischargeMeds,
        customAdvice: appointment.dischargeInstructions || '',
        checkedAdvice: [],
        checkedInvestigations: [],
        customInvestigation: '',
        investigations: [],
        vitals: appointment.vitals || {},
        followupRequired: false,
        followupDate: '',
        followupReason: 'Follow-up Checkup'
      };
    } else if (!isReadOnly) {
      const restoredCurrentDraft = restoredRounds?.roundsDataMap?.[targetCurrentRound];

      if (restoredCurrentDraft && !restoredCurrentDraft.isSaved && restoredCurrentDraft.isExplicitDraft === true) {
        // Use explicitly saved draft for current round
        map[targetCurrentRound] = {
          ...restoredCurrentDraft,
          roundNumber: targetCurrentRound,
          isSaved: false
        };
      } else {
        // Fresh start for new current round:
        // Carry forward ONLY the original doctor diagnosis from Round 1 / prior rounds!
        // Keep all remaining cards & sections clean (no prescriptions, notes, vitals, tests, advice).
        const defaultDiags = targetCurrentRound > 1 ? getIpdDefaultDiagnoses(sortedReviews) : [];

        map[targetCurrentRound] = {
          roundNumber: targetCurrentRound,
          isSaved: false,
          reviewDate: new Date().toISOString(),
          reviewTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          doctorName: user?.name || 'Doctor',
          chiefComplaints: '', // Clean for new round - no past round carry-over!
          generalCondition: '', // Clean for new round!
          consciousnessLevel: '', // Clean for new round!
          painScore: '', // Clean for new round!
          examinationFindings: '', // Clean for new round!
          assessmentPlan: '', // Clean for new round!
          diagnoses: defaultDiags, // Default 1st round / prior diagnosis!
          primaryDiagnosis: defaultDiags[0] || '',
          diagnosisStatus: defaultDiags.length > 0 ? 'Confirmed' : 'Provisional',
          clinicalNotes: '', // Clean for new round!
          prescriptionsList: [], // Fresh round: DO NOT duplicate previous round's prescriptions!
          customAdvice: '',
          checkedAdvice: [],
          checkedInvestigations: [], // Fresh round: do not duplicate previous round's tests!
          customInvestigation: '',
          investigations: [],
          vitals: appointment?.vitals || {},
          followupRequired: false,
          followupDate: '',
          followupReason: 'Follow-up Checkup'
        };
      }
    }

    // Determine initial active round:
    const explicitRoundParam = searchParams.get('round');
    const isExplicitConsultationMode = searchParams.get('mode') === 'consultation' || searchParams.get('mode') === 'current';

    // When clicking consultation button (or active in-progress consultation), strictly open the CURRENT consultation round
    let initialActive = !isReadOnly ? targetCurrentRound : (completedCount > 0 ? completedCount : 1);
    if (explicitRoundParam && expectedRoundNumbers.includes(Number(explicitRoundParam))) {
      initialActive = Number(explicitRoundParam);
    } else if (isExplicitConsultationMode || !isReadOnly) {
      initialActive = targetCurrentRound;
    } else if (restoredRounds?.activeRoundNumber && expectedRoundNumbers.includes(restoredRounds.activeRoundNumber)) {
      initialActive = restoredRounds.activeRoundNumber;
    }

    setAvailableRoundNumbers(expectedRoundNumbers);
    setRoundsDataMap(map);
    setActiveRoundNumber(initialActive);

    // Synchronize form state to initialActive round
    const initialData = map[initialActive];
    if (initialData) {
      const isInitialNewRound = Boolean(isIpdConsultation && initialActive > completedCount && !initialData.isSaved && !initialData.isExplicitDraft);
      if (isInitialNewRound) {
        // Clean slate for new round consultation, but default 1st round / prior diagnosis!
        const defaultDiags = initialData.diagnoses && initialData.diagnoses.length > 0
          ? initialData.diagnoses
          : getIpdDefaultDiagnoses(sortedReviews);

        setDiagnoses(defaultDiags);
        setPrimaryDiagnosis(defaultDiags[0] || '');
        setDiagnosisStatus(defaultDiags.length > 0 ? 'Confirmed' : 'Provisional');
        setClinicalNotes('');
        setPrescriptionsList([]);
        setCheckedAdvice([]);
        setCustomAdvice('');
        setFollowupRequired(false);
        setFollowupDate('');
        setFollowupReason('Follow-up Checkup');
        setCheckedInvestigations([]);
        setCustomInvestigation('');
        setIpdChiefComplaints('');
        setIpdGeneralCondition('');
        setIpdConsciousness('');
        setIpdPainScore('');
        setIpdExaminationFindings('');
        setIpdAssessmentPlan('');
        setVitals({});
      } else {
        setDiagnoses(initialData.diagnoses || []);
        setPrimaryDiagnosis(initialData.primaryDiagnosis || '');
        setDiagnosisStatus(initialData.diagnosisStatus || 'Confirmed');
        setClinicalNotes(initialData.clinicalNotes || '');
        setPrescriptionsList(initialData.prescriptionsList || []);
        setCustomAdvice(initialData.customAdvice || '');
        setVitals(initialData.vitals && Object.keys(initialData.vitals).length > 0 ? initialData.vitals : {});
        setCheckedAdvice(initialData.checkedAdvice || []);
        setCheckedInvestigations(initialData.checkedInvestigations || []);
        setCustomInvestigation(initialData.customInvestigation || '');
        setIpdChiefComplaints(initialData.chiefComplaints || '');
        setIpdGeneralCondition(initialData.generalCondition || '');
        setIpdConsciousness(initialData.consciousnessLevel || '');
        setIpdPainScore(initialData.painScore !== undefined && initialData.painScore !== null ? String(initialData.painScore) : '');
        setIpdExaminationFindings(initialData.examinationFindings || '');
        setIpdAssessmentPlan(initialData.assessmentPlan || '');
        setFollowupRequired(Boolean(initialData.followupRequired));
        setFollowupDate(initialData.followupDate || '');
      }
    }

    // Clean up stale localStorage entries (removes any phantom round numbers > targetCurrentRound)
    try {
      localStorage.setItem(`consult_rounds_${consultationId}`, JSON.stringify({
        activeRoundNumber: initialActive,
        availableRoundNumbers: expectedRoundNumbers,
        roundsDataMap: map
      }));
    } catch (_) { }
  }, [
    appointment?._id,
    appointment?.dailyReviews,
    appointment?.rawAdmission?.dailyReviews,
    isReadOnly,
    consultationId
  ]);

  // Auto-sync appointment consultation fee & evaluate editability based on hospital workflow rules
  useEffect(() => {
    if (appointment) {
      if (appointment.consultationType) setConsultationType(appointment.consultationType);
      const feeVal = appointment.consultationFee ?? appointment.doctorId?.consultationFee ?? 500;
      setCustomConsultationFee(feeVal);
    }
  }, [appointment]);

  const isFeeEditable = useMemo(() => {
    if (isReadOnly) return false;
    if (workflow?.canDoctorEditFee) {
      return workflow.canDoctorEditFee(appointment);
    }
    const isPredefinedBeforeReception = (billingSettings?.consultationFeeType || 'Predefined') === 'Predefined' &&
      billingSettings?.feeCollectionRole === 'Reception' &&
      billingSettings?.paymentTiming === 'Before Consultation';
    const isPaid = appointment?.billingStatus === 'Paid' || appointment?.paymentStatus === 'Paid';
    return !isPaid && !isPredefinedBeforeReception;
  }, [isReadOnly, workflow, appointment, billingSettings]);

  // Fetch patient medical history
  const { data: patientHistory } = useQuery({
    queryKey: ['patientHistoryConsultationWorkspace', appointment?.patientId?._id],
    queryFn: async () => {
      if (!appointment?.patientId?._id) return null;
      const res = await api.get(`/operations/patients/${appointment.patientId._id}/history`);
      return res.data.data;
    },
    enabled: !!appointment?.patientId?._id
  });

  // Synthesize IPD daily reviews and encounters into effectivePatientHistory for PatientHistoryDrawer
  const effectivePatientHistory = useMemo(() => {
    if (!isIpdConsultation || !patientHistory) return patientHistory;

    const rawHistory = patientHistory || {};
    const existingConsultations = Array.isArray(rawHistory.consultations) ? [...rawHistory.consultations] : [];

    // Synthesize dailyReviews into consultation cards
    const reviews = Array.isArray(appointment?.dailyReviews) && appointment.dailyReviews.length > 0
      ? appointment.dailyReviews
      : (Array.isArray(appointment?.rawAdmission?.dailyReviews) ? appointment.rawAdmission.dailyReviews : []);

    const dailyConsultationCards = reviews.map((rev, idx) => {
      const dayNum = rev.dayNumber || (idx + 1);
      const rawDateObj = rev.reviewDate ? new Date(rev.reviewDate) : new Date(appointment?.date || Date.now());
      const safeRevDate = (rawDateObj && !isNaN(rawDateObj.getTime())) ? rawDateObj : new Date();
      const revDateIso = safeRevDate.toISOString();
      return {
        _id: rev._id || `daily-review-${appointment?._id}-${dayNum}`,
        consultationType: `IPD Round ${dayNum}`,
        appointmentType: 'Inpatient (IPD)',
        chiefComplaint: rev.chiefComplaints || appointment?.chiefComplaint || 'Inpatient Daily Round',
        diagnosis: rev.diagnosis || appointment?.finalDiagnosis || '',
        primaryDiagnosis: rev.diagnosis || appointment?.finalDiagnosis || '',
        diagnoses: rev.diagnosis ? rev.diagnosis.split(',').map(s => s.trim()).filter(Boolean) : (appointment?.finalDiagnosis ? [appointment.finalDiagnosis] : []),
        clinicalNotes: rev.clinicalFindings || rev.assessment || '',
        assessment: rev.assessment || '',
        treatmentPlan: rev.treatmentPlan || '',
        advice: rev.advice || rev.instructions || '',
        vitals: rev.vitals || {},
        prescriptions: (rev.prescriptions || []).map(p => ({
          medicineName: p.medicineName,
          dosage: p.dose || p.dosage || '1-0-1',
          frequency: p.frequency || 'BD',
          duration: p.duration || '3 Days',
          instructions: p.instructions || p.foodTiming || 'After Food',
          quantity: p.quantity || 1,
          remarks: p.notes || ''
        })),
        doctorId: rev.doctorId ? { name: rev.doctorName || 'Doctor' } : appointment?.doctorId,
        doctor: rev.doctorName || 'Doctor',
        createdAt: revDateIso,
        date: revDateIso,
        isIpd: true,
        roundNumber: dayNum
      };
    });

    const existingRoundKeys = new Set(
      existingConsultations
        .filter(c => c.isIPDDailyReview || (c.isIpd && (c.roundNumber || c.dayNumber)))
        .map(c => `round_${c.admissionId || appointment?.admissionId || ''}_${c.dayNumber || c.roundNumber || 1}`)
    );
    const existingIds = new Set(existingConsultations.map(c => String(c._id)));
    const newDailyCards = dailyConsultationCards.filter(c => 
      !existingRoundKeys.has(`round_${c.admissionId || appointment?.admissionId || ''}_${c.roundNumber || 1}`) &&
      !existingIds.has(String(c._id))
    );
    const combinedList = [...newDailyCards, ...existingConsultations];
    combinedList.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    return {
      ...rawHistory,
      consultations: combinedList,
      snapshots: combinedList
    };
  }, [isIpdConsultation, patientHistory, appointment]);

  // Auto-activate consultation for waiting/scheduled appointments so doctor prescription pad opens immediately
  useEffect(() => {
    if (appointment && !isReadOnly && appointment.status !== 'In Consultation' && appointment.queueStatus !== 'In-Consultation' && appointment.status !== 'Cancelled') {
      if (appointment.isIpd) {
        api.put(`/ipd/admissions/${appointment._id}/queue`, {
          queueStatus: 'In Progress'
        }).catch(() => { });
      } else {
        api.put(`/operations/appointments/${appointment._id}/queue`, {
          status: 'In Consultation',
          queueStatus: 'In-Consultation'
        }).then(() => {
          queryClient.invalidateQueries(['appointmentConsultationWorkspace']);
          queryClient.invalidateQueries(['doctorQueue']);
          queryClient.invalidateQueries(['appointments']);
        }).catch(err => console.warn('Auto-activate In Consultation:', err));
      }
    }
  }, [appointment?._id, isReadOnly, appointment?.status, appointment?.queueStatus, appointment?.isIpd]);

  // Fetch Finalized Consultation Snapshot if visit is completed
  const { data: snapshotData } = useQuery({
    queryKey: ['consultationSnapshotWorkspace', consultationId],
    queryFn: async () => {
      if (!consultationId) return null;
      try {
        const res = await api.get(`/operations/consultations/${consultationId}/snapshot`);
        return res.data?.data || null;
      } catch (err) {
        return null;
      }
    },
    enabled: !!consultationId && Boolean(isReadOnly || searchParams.get('mode') === 'view' || isConsultationCompleted),
    retry: false
  });

  // Sync state from snapshot when snapshot data is available
  useEffect(() => {
    if (snapshotData && (isReadOnly || searchParams.get('fresh') !== 'true')) {
      if (snapshotData.diagnoses && Array.isArray(snapshotData.diagnoses) && snapshotData.diagnoses.length > 0) {
        const cleanDiags = snapshotData.diagnoses
          .map(d => (typeof d === 'string' ? d : (d?.name || d?.diagnosis || '')))
          .filter(Boolean);
        if (cleanDiags.length > 0) {
          setDiagnoses(cleanDiags);
        }
      } else if (snapshotData.primaryDiagnosis) {
        setDiagnoses([String(snapshotData.primaryDiagnosis)]);
      } else if (snapshotData.diagnosis) {
        const splitDiags = String(snapshotData.diagnosis).split(',').map(s => s.trim()).filter(Boolean);
        setDiagnoses(splitDiags.length > 0 ? splitDiags : [String(snapshotData.diagnosis)]);
      }

      if (snapshotData.primaryDiagnosis) {
        setPrimaryDiagnosis(String(snapshotData.primaryDiagnosis));
      } else if (snapshotData.diagnosis) {
        setPrimaryDiagnosis(String(snapshotData.diagnosis));
      }

      if (snapshotData.clinicalNotes) {
        setClinicalNotes(snapshotData.clinicalNotes);
      }

      if (snapshotData.vitals && typeof snapshotData.vitals === 'object') {
        const snapVitals = snapshotData.vitals;
        setVitals(prev => ({
          ...prev,
          bpSystolic: snapVitals.bpSystolic !== undefined && snapVitals.bpSystolic !== null ? String(snapVitals.bpSystolic) : prev.bpSystolic,
          bpDiastolic: snapVitals.bpDiastolic !== undefined && snapVitals.bpDiastolic !== null ? String(snapVitals.bpDiastolic) : prev.bpDiastolic,
          pulse: snapVitals.pulse !== undefined && snapVitals.pulse !== null ? String(snapVitals.pulse) : prev.pulse,
          temperature: snapVitals.temperature !== undefined && snapVitals.temperature !== null ? String(snapVitals.temperature) : prev.temperature,
          spo2: snapVitals.spo2 !== undefined && snapVitals.spo2 !== null ? String(snapVitals.spo2) : prev.spo2,
          weight: snapVitals.weight !== undefined && snapVitals.weight !== null ? String(snapVitals.weight) : prev.weight,
          height: snapVitals.height !== undefined && snapVitals.height !== null ? String(snapVitals.height) : prev.height,
          bmi: snapVitals.bmi !== undefined && snapVitals.bmi !== null ? String(snapVitals.bmi) : prev.bmi,
          bloodSugar: snapVitals.bloodSugar !== undefined && snapVitals.bloodSugar !== null ? String(snapVitals.bloodSugar) : prev.bloodSugar
        }));
      }

      const resolvedAdvice = snapshotData.advice || snapshotData.doctorAdvice || snapshotData.generalInstructions || '';
      if (resolvedAdvice) {
        setCustomAdvice(resolvedAdvice);
        setIsAdviceExpanded(true);
      }

      if (snapshotData.followupRequired !== undefined) {
        setFollowupRequired(Boolean(snapshotData.followupRequired));
      }
      if (snapshotData.followupDate) {
        try {
          const dStr = new Date(snapshotData.followupDate).toISOString().split('T')[0];
          setFollowupDate(dStr);
        } catch (_) {}
      }
      if (snapshotData.followupReason) {
        setFollowupReason(snapshotData.followupReason);
      }

      if (snapshotData.prescriptions && Array.isArray(snapshotData.prescriptions) && snapshotData.prescriptions.length > 0) {
        setPrescriptionsList(snapshotData.prescriptions.map(p => {
          const rawDose = p.dose || p.dosage || p.frequency || '';
          const parts = rawDose.includes('-') ? rawDose.split('-') : ['', '', ''];
          return {
            id: p._id || String(Date.now() + Math.random()),
            medicineId: p.medicineId || '',
            medicineName: p.medicineName || p.name || '',
            morning: p.morning !== undefined && p.morning !== '' ? String(p.morning) : (parts[0] || ''),
            afternoon: p.afternoon !== undefined && p.afternoon !== '' ? String(p.afternoon) : (parts[1] || ''),
            night: p.night !== undefined && p.night !== '' ? String(p.night) : (parts[2] || ''),
            food: p.food || p.foodTiming || p.timing || p.foodInstruction || p.instructions || '',
            duration: p.duration || '',
            quantity: p.quantity || '',
            remarks: p.remarks || p.notes || ''
          };
        }));
      }

      if (snapshotData.investigations && Array.isArray(snapshotData.investigations) && snapshotData.investigations.length > 0) {
        const invNames = snapshotData.investigations.map(inv => inv.name || inv.investigationName || (typeof inv === 'string' ? inv : '')).filter(Boolean);
        setCheckedInvestigations(invNames);
        if (invNames.length > 0) {
          setIsInvestigationExpanded(true);
        }
      }
    }
  }, [snapshotData, isReadOnly]);

  // Helper function to trigger centralized PrescriptionPrintEngine
  const handleEnginePrint = async () => {
    try {
      let activeConfig = DEFAULT_PRINT_CONFIG;
      let targetHospital = user?.hospital || user?.hospitalId || appointment?.hospitalId || {};

      try {
        const hospitalIdToUse = user?.hospitalId?._id || user?.hospitalId || user?.hospital?._id || user?.hospital || appointment?.hospitalId?._id || appointment?.hospitalId;
        if (hospitalIdToUse) {
          const activeRes = await api.get(`/admin/hospitals/${hospitalIdToUse}/print-template/active`);
          const activeT = activeRes.data?.data;
          if (activeT) {
            activeConfig = {
              printMode: activeT.mode || 'STANDARD',
              mode: activeT.mode || 'STANDARD',
              paper: {
                size: activeT.paperSize || 'A4',
                orientation: (activeT.orientation || 'Portrait').toUpperCase(),
                margin: activeT.margins || 'Medium',
                scale: activeT.scale || 100
              },
              calibration: activeT.calibration || { topOffset: 0, leftOffset: 0, scale: 100 },
              template: {
                ...activeT,
                mode: activeT.mode || 'STANDARD'
              }
            };
          }
        } else {
          const hRes = await api.get('/admin/hospitals');
          const list = hRes.data?.data || [];
          if (list.length > 0) {
            const hObj = list[0];
            targetHospital = hObj;
            const activeRes = await api.get(`/admin/hospitals/${hObj._id}/print-template/active`);
            const activeT = activeRes.data?.data;
            if (activeT) {
              activeConfig = {
                printMode: activeT.mode || 'STANDARD',
                mode: activeT.mode || 'STANDARD',
                paper: {
                  size: activeT.paperSize || 'A4',
                  orientation: (activeT.orientation || 'Portrait').toUpperCase(),
                  margin: activeT.margins || 'Medium',
                  scale: activeT.scale || 100
                },
                calibration: activeT.calibration || { topOffset: 0, leftOffset: 0, scale: 100 },
                template: {
                  ...activeT,
                  mode: activeT.mode || 'STANDARD'
                }
              };
            }
          }
        }
      } catch (e) {
        console.log('Using safe default print configuration contract', e);
      }

      const validMedicines = prescriptionsList
        .filter(m => (m.medicineName && m.medicineName.trim()) || (m.name && m.name.trim()))
        .map(m => {
          const medName = (m.medicineName || m.name || '').trim();
          const freqPattern = (m.morning || m.afternoon || m.night) ? `${m.morning || '0'}-${m.afternoon || '0'}-${m.night || '0'}` : '';
          const doseStr = m.dosage || freqPattern;
          return {
            medicineName: medName,
            name: medName,
            dosage: doseStr,
            frequency: m.frequency || freqPattern,
            duration: m.duration || '',
            food: m.food || m.foodInstruction || '',
            instructions: m.food || m.remarks || m.foodInstruction || ''
          };
        });

      const rawPat = (snapshotData?.patientId && typeof snapshotData.patientId === 'object')
        ? snapshotData.patientId
        : (typeof appointment?.patientId === 'object' && appointment?.patientId ? appointment.patientId : { name: 'Patient' });
      const patientAllergiesStr = formatAllergiesDisplay(snapshotData || appointment, 'None');
      const patientObj = {
        ...rawPat,
        allergies: patientAllergiesStr
      };

      const consultationPayload = {
        isSample: false,
        hospital: targetHospital,
        branch: snapshotData?.branch || appointment?.branchId || user?.branchId || {},
        patientId: patientObj,
        patient: patientObj,
        allergies: patientAllergiesStr,
        date: snapshotData?.date || snapshotData?.consultationDate || appointment?.date || new Date().toISOString(),
        tokenNo: snapshotData?.tokenNo || appointment?.tokenNumber || appointment?.tokenNo || 'OP-01',
        visitType: snapshotData?.visitType || consultationType || appointment?.appointmentType || 'General OPD',
        chiefComplaint: snapshotData?.chiefComplaint || appointment?.chiefComplaint || 'Consultation Visit',
        clinicalNotes: snapshotData?.clinicalNotes || clinicalNotes || 'General consultation notes.',
        vitals: snapshotData?.vitals || (vitals && Object.values(vitals).some(Boolean) ? vitals : appointment?.vitals) || {},
        diagnosis: (snapshotData?.diagnosis && snapshotData.diagnosis.length > 0)
          ? snapshotData.diagnosis
          : (diagnoses.length > 0 ? diagnoses : (primaryDiagnosis ? [primaryDiagnosis] : [])),
        prescription: validMedicines,
        advice: (snapshotData?.advice && snapshotData.advice.length > 0) ? snapshotData.advice : checkedAdvice,
        followupDate: snapshotData?.followupDate || (followupRequired ? followupDate : null)
      };

      const doctorPayload = {
        name: formatDoctorDisplayName(snapshotData?.doctorId?.name || user?.name || appointment?.doctorId?.name, 'Attending Doctor'),
        doctorProfile: snapshotData?.doctorId?.doctorProfile || user?.doctorProfile || appointment?.doctorId?.doctorProfile || {}
      };

      triggerPrint(consultationPayload, doctorPayload, activeConfig);
    } catch (err) {
      toast.error('Could not generate print preview. Consultation remains complete.');
    }
  };

  // Complete Consultation Mutation
  const completeConsultationMutation = useMutation({
    mutationFn: async (payload) => {
      // Direct sync with IPD daily review if inpatient
      const ipdAdmId = appointment?.rawAdmission?._id || appointment?.admissionId || appointment?._id;
      if (appointment?.isIpd || searchParams.get('type') === 'ipd' || appointment?.rawAdmission) {
        try {
          const conditionParts = [];
          if (ipdGeneralCondition) conditionParts.push(`Condition: ${ipdGeneralCondition}`);
          if (ipdConsciousness) conditionParts.push(`Consciousness: ${ipdConsciousness}`);
          if (ipdPainScore) conditionParts.push(`Pain: ${formatPainScore(ipdPainScore)}`);
          const autoFindings = conditionParts.join(' | ');

          await ipdService.saveDailyReview(ipdAdmId, {
            dayNumber: payload.roundNumber || payload.dayNumber || activeRoundNumber,
            reviewDate: new Date(),
            reviewTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            doctorId: user?._id,
            doctorName: user?.name || 'Doctor',
            chiefComplaints: ipdChiefComplaints || payload.chiefComplaint || payload.diagnosis || '',
            generalCondition: ipdGeneralCondition,
            consciousnessLevel: ipdConsciousness,
            painScore: ipdPainScore,
            clinicalFindings: ipdExaminationFindings || autoFindings || payload.clinicalNotes || '',
            examinationFindings: ipdExaminationFindings || '',
            diagnosis: payload.diagnosis || '',
            assessment: ipdAssessmentPlan || payload.clinicalNotes || 'Doctor consultation completed.',
            assessmentPlan: ipdAssessmentPlan || payload.clinicalNotes || '',
            treatmentPlan: [checkedAdvice.join(', '), customAdvice].filter(Boolean).join(' | ') || payload.advice || '',
            vitals: payload.vitals,
            prescriptions: (payload.prescriptions || []).map(p => ({
              medicineName: p.medicineName,
              dose: p.dosage,
              route: p.route || 'Oral',
              frequency: p.frequency || 'Once daily',
              duration: p.duration || '3 days',
              instructions: normalizeFoodTiming(p.instructions || p.foodTiming || p.food || getDefaultFoodTimingForMedicine(p.medicineName)),
              foodTiming: normalizeFoodTiming(p.foodTiming || p.instructions || p.food || getDefaultFoodTimingForMedicine(p.medicineName)),
              quantity: p.quantity || 1,
              pharmacyStatus: payload.deliveryMethod === 'internal_pharmacy' ? 'Sent to Pharmacy' : 'Pending'
            })),
            investigations: payload.investigations || payloadInvestigations || [],
            sendToPharmacy: payload.deliveryMethod === 'internal_pharmacy'
          });
        } catch (ipdErr) {
          console.warn('Direct IPD daily-reviews sync note:', ipdErr);
        }
      }
      const res = await api.post('/operations/consultations', payload);
      return res.data.data;
    },
    onSuccess: async (data, variables) => {
      localStorage.removeItem(`consult_draft_${consultationId}`);
      localStorage.removeItem(`consult_rounds_${consultationId}`);

      const delivery = variables?.deliveryMethod || 'internal_pharmacy';
      if (delivery === 'print_only' || delivery === 'external_print' || delivery === 'external') {
        toast.success(isIpdConsultation
          ? `Round ${activeRoundNumber} completed. Prescription generated successfully.`
          : 'Consultation completed. Prescription generated successfully.'
        );
        setTimeout(() => {
          handleEnginePrint();
        }, 300);
      } else {
        toast.success(isIpdConsultation
          ? `Round ${activeRoundNumber} completed. Prescription sent to Pharmacy.`
          : 'Consultation completed. Prescription sent to Pharmacy.'
        );
      }

      queryClient.invalidateQueries({ queryKey: ['doctorQueue'] });
      queryClient.invalidateQueries({ queryKey: ['doctorQueueSidebar'] });
      queryClient.invalidateQueries({ queryKey: ['doctorQueueCheckWorkspace'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctorFollowUps'] });
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyQueue'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['consultationSnapshotWorkspace'] });
      queryClient.invalidateQueries({ queryKey: ['dailyReviews'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
      queryClient.invalidateQueries({ queryKey: ['ipdAdmissions'] });
      queryClient.invalidateQueries({ queryKey: ['ipd'] });
      queryClient.invalidateQueries({ queryKey: ['inpatientConsultationHistory'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admission-detail-full'] });
      queryClient.invalidateQueries({ queryKey: ['appointmentConsultationWorkspace'] });
      queryClient.invalidateQueries({ queryKey: ['appointmentConsultationWorkspace', consultationId] });

      // Return to IPD department if this was an IPD consultation
      if (appointment?.isIpd || searchParams.get('type') === 'ipd') {
        navigate('/doctor/ipd/inpatients', { replace: true });
        return;
      }

      // Cleanly return to Doctor Today's Queue.
      // Do NOT automatically open or place the next patient's prescription.
      // The next patient's consultation prescription opens ONLY when the doctor explicitly clicks "Start Consultation" or calls the patient.
      navigate('/doctor/queue', { replace: true });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Unable to finalize consultation. Please try again.');
    }
  });

  // Calculate BMI automatically on height/weight change
  useEffect(() => {
    if (vitals.height && vitals.weight) {
      const hMeters = parseFloat(vitals.height) / 100;
      if (hMeters > 0) {
        const bmiVal = (parseFloat(vitals.weight) / (hMeters * hMeters)).toFixed(1);
        if (vitals.bmi !== bmiVal) {
          setVitals(v => ({ ...v, bmi: bmiVal }));
        }
      }
    }
  }, [vitals.height, vitals.weight, vitals.bmi]);

  // Seed vitals from receptionist log on start
  useEffect(() => {
    if (!appointment) return;
    const vSource = (appointment?.vitals && Object.values(appointment.vitals).some(v => v !== null && v !== undefined && v !== ''))
      ? appointment.vitals
      : null;
    if (vSource) {
      setVitals({
        bpSystolic: vSource.bpSystolic ? String(vSource.bpSystolic) : '',
        bpDiastolic: vSource.bpDiastolic ? String(vSource.bpDiastolic) : '',
        pulse: vSource.pulse ? String(vSource.pulse) : '',
        temperature: vSource.temperature ? String(vSource.temperature) : '',
        RR: vSource.RR ? String(vSource.RR) : '',
        weight: vSource.weight ? String(vSource.weight) : '',
        height: vSource.height ? String(vSource.height) : '',
        spo2: vSource.spo2 ? String(vSource.spo2) : '',
        bmi: vSource.bmi ? String(vSource.bmi) : ''
      });
    } else {
      // Cleanly reset vitals so values from previous consultation do NOT persist or duplicate!
      setVitals({
        bpSystolic: '',
        bpDiastolic: '',
        pulse: '',
        temperature: '',
        RR: '',
        weight: '',
        height: '',
        spo2: '',
        bmi: ''
      });
    }
  }, [appointment?._id, appointment?.vitals]);

  // Restore & 30-Second Auto-save draft interval hook
  const hasRestored = useRef(false);
  const lastConsultationId = useRef(null);

  useEffect(() => {
    if (!consultationId) return;

    if (lastConsultationId.current !== consultationId) {
      lastConsultationId.current = consultationId;
      hasRestored.current = false;

      // Clear previous patient data from form state
      setClinicalNotes('');
      setDiagnoses([]);
      setPrimaryDiagnosis('');
      setDiagSearch('');
      setDiagSuggestions([]);
      setDiagnosisStatus('Provisional');
      setPrescriptionsList([]);
      setCheckedAdvice([]);
      setCustomAdvice('');
      setFollowupRequired(false);
      setFollowupDate('');
      setFollowupReason('Follow-up Checkup');
      setCheckedInvestigations([]);
      setCustomInvestigation('');
      setUploadedDocs([]);
      setVitals({
        bpSystolic: '',
        bpDiastolic: '',
        pulse: '',
        temperature: '',
        RR: '',
        weight: '',
        height: '',
        spo2: '',
        bmi: ''
      });
    }

    if (hasRestored.current) return;

    // For read-only completed consultations, do not restore drafts over authentic saved records
    if (isReadOnly) {
      hasRestored.current = true;
      return;
    }

    // For fresh follow-up visits, do not restore previous draft or old prescriptions
    if (searchParams.get('fresh') === 'true') {
      try {
        localStorage.removeItem(`consult_draft_${consultationId}`);
      } catch (_) {}
      hasRestored.current = true;
      setPrescriptionsList([]);
      return;
    }

    // Load existing draft
    const savedDraft = localStorage.getItem(`consult_draft_${consultationId}`);
    if (savedDraft) {
      try {
        const d = JSON.parse(savedDraft);
        if (d.clinicalNotes) setClinicalNotes(d.clinicalNotes);
        if (d.diagnoses && Array.isArray(d.diagnoses)) {
          const cleanDiags = d.diagnoses
            .map(diag => (typeof diag === 'string' ? diag : diag?.name || ''))
            .filter(Boolean);
          setDiagnoses(cleanDiags);
        } else if (d.primaryDiagnosis) {
          setDiagnoses([String(d.primaryDiagnosis)]);
        }
        if (d.primaryDiagnosis) setPrimaryDiagnosis(String(d.primaryDiagnosis));
        if (d.diagnosisStatus) setDiagnosisStatus(d.diagnosisStatus);
        if (d.prescriptionsList && Array.isArray(d.prescriptionsList)) {
          const cleanMeds = d.prescriptionsList
            .filter(Boolean)
            .map(row => ({
              ...row,
              id: row.id || String(Date.now() + Math.random()),
              medicineName: String(row.medicineName || row.name || ''),
              morning: String(row.morning ?? ''),
              afternoon: String(row.afternoon ?? ''),
              night: String(row.night ?? ''),
              duration: String(row.duration ?? ''),
              food: String(row.food ?? ''),
              quantity: String(row.quantity ?? ''),
              remarks: String(row.remarks ?? '')
            }));
          setPrescriptionsList(cleanMeds);
        }
        if (d.checkedAdvice && Array.isArray(d.checkedAdvice)) setCheckedAdvice(d.checkedAdvice);
        if (d.customAdvice) setCustomAdvice(d.customAdvice);
        if (d.followupRequired !== undefined) setFollowupRequired(Boolean(d.followupRequired));
        if (d.followupDate) setFollowupDate(d.followupDate);
        if (d.followupReason) setFollowupReason(d.followupReason);
        if (d.checkedInvestigations && Array.isArray(d.checkedInvestigations)) setCheckedInvestigations(d.checkedInvestigations);
        if (d.customInvestigation) setCustomInvestigation(d.customInvestigation);
        if (d.vitals && typeof d.vitals === 'object') {
          const hasDraftVitals = Object.values(d.vitals).some(v => v !== null && v !== undefined && String(v).trim() !== '');
          if (hasDraftVitals) {
            setVitals(d.vitals);
          }
        }

        hasRestored.current = true;
        toast.success('Restored unsaved consultation draft!');
      } catch (e) {
        console.error('Failed to restore draft', e);
      }
    }
  }, [consultationId]);

  useEffect(() => {
    if (!consultationId || isReadOnly || isPastRoundReadOnly) return;

    const timer = setTimeout(() => {
      const draftObj = {
        clinicalNotes,
        primaryDiagnosis: diagnoses[0] || primaryDiagnosis,
        diagnoses,
        diagnosisStatus,
        prescriptionsList,
        checkedAdvice,
        customAdvice,
        followupRequired,
        followupDate,
        followupReason,
        checkedInvestigations,
        customInvestigation,
        vitals
      };
      try {
        localStorage.setItem(`consult_draft_${consultationId}`, JSON.stringify(draftObj));
        setDraftSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (e) {
        console.error('Failed to auto-save consultation draft', e);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    consultationId, isReadOnly, isPastRoundReadOnly, clinicalNotes, primaryDiagnosis, diagnoses, diagnosisStatus, prescriptionsList,
    checkedAdvice, customAdvice, followupRequired, followupDate, followupReason,
    checkedInvestigations, customInvestigation, vitals
  ]);

  // Filter diagnoses templates based on input
  useEffect(() => {
    if (diagSearch.trim()) {
      const search = diagSearch.trim().toLowerCase();
      const filtered = (Array.isArray(dlist) ? dlist : []).filter(d => {
        if (!d) return false;
        const name = String(d.name || d.val || '').toLowerCase();
        const isActive = d.status === 'Active' || !d.status;
        return name.includes(search) && isActive;
      });
      setDiagSuggestions(filtered);
    } else {
      setDiagSuggestions(prev => (prev.length > 0 ? [] : prev));
    }
  }, [diagSearch, dlist]);

  // Quantity automatic calculator helper
  const calculateQuantity = (m, a, n, dur) => {
    const morning = m === 'SOS' ? 0 : parseFloat(m === '½' ? 0.5 : m) || 0;
    const afternoon = a === 'SOS' ? 0 : parseFloat(a === '½' ? 0.5 : a) || 0;
    const night = n === 'SOS' ? 0 : parseFloat(n === '½' ? 0.5 : n) || 0;
    const days = parseInt(dur) || 0;
    const totalDoses = morning + afternoon + night;
    if (totalDoses === 0 || days === 0) return '';
    return Math.ceil(totalDoses * days);
  };

  // Add a new blank editable row
  const handleAddNewBlankRow = () => {
    if (isEffectiveReadOnly) return;
    const lastRow = prescriptionsList[prescriptionsList.length - 1];
    if (lastRow && !String(lastRow.medicineName || '').trim()) {
      return; // Prevent duplicate empty rows
    }
    const newRow = {
      id: String(Date.now() + Math.random()),
      medicineId: '',
      medicineName: '',
      morning: '',
      afternoon: '',
      night: '',
      food: 'After Food',
      duration: '',
      quantity: '',
      remarks: ''
    };
    setPrescriptionsList([...prescriptionsList, newRow]);
    setFocusedRowId(newRow.id);
  };

  // Add diagnosis chip(s) and handle Clinical Diagnosis Master creation inline
  const handleAddDiagnosis = async (rawInput) => {
    if (isEffectiveReadOnly || !rawInput || isAddingDiagnosis) return;

    // Split on commas, semicolons, or newlines to allow adding multiple diagnoses simultaneously
    const items = String(rawInput)
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (items.length === 0) return;

    // 1. Add chips locally immediately for instant feedback
    setDiagnoses(prev => {
      const updated = [...(Array.isArray(prev) ? prev : [])];
      items.forEach(cleanName => {
        const cleanLower = cleanName.toLowerCase();
        if (!updated.some(d => String(typeof d === 'string' ? d : (d?.name || '')).trim().toLowerCase() === cleanLower)) {
          updated.push(cleanName);
        }
      });
      return updated;
    });
    setDiagSearch('');
    setDiagSearchResults([]);
    setDiagSuggestions([]);

    // 2. Persist to Clinical Diagnosis Master API asynchronously
    try {
      setIsAddingDiagnosis(true);
      let anyCreated = false;
      for (const cleanName of items) {
        try {
          const res = await api.post('/operations/clinical-diagnoses', { name: cleanName });
          if (res.data?.created) anyCreated = true;
        } catch (err) {
          console.error('Error persisting diagnosis master:', err);
        }
      }
      if (anyCreated) {
        setSubtleAddedToast(true);
        setTimeout(() => setSubtleAddedToast(false), 2500);
        refetchFrequentDiagnoses();
      }
    } catch (err) {
      console.error('Error persisting diagnosis master:', err);
    } finally {
      setIsAddingDiagnosis(false);
    }

    // 3. Merge template medicines if matching protocol template exists in DB or dlist (always in append mode)
    for (const cleanName of items) {
      try {
        const dbMatchRes = await api.get(`/operations/clinical-diagnoses/search?q=${encodeURIComponent(cleanName)}`);
        const dbMatches = dbMatchRes.data?.data || [];
        const cleanLower = cleanName.toLowerCase();
        const dbMatch = (Array.isArray(dbMatches) ? dbMatches : []).find(d => d && String(d.name || '').toLowerCase() === cleanLower);

        if (dbMatch && dbMatch.template) {
          const tpl = dbMatch.template;
          const convertedTpl = {
            name: dbMatch.name,
            medicines: (tpl.medicines || []).map(m => (typeof m === 'string' ? m : (m?.name || m?.medicineName || ''))),
            advice: tpl.advice || [],
            followup: tpl.followupDuration || '7 Days',
            investigations: tpl.investigations || []
          };
          applyTemplateNow(convertedTpl, 'append');
        } else {
          const matchingTpl = (Array.isArray(dlist) ? dlist : []).find(d => d && String(d.name || '').toLowerCase() === cleanLower && (d.status === 'Active' || !d.status));
          if (matchingTpl) {
            applyTemplateNow(matchingTpl, 'append');
          }
        }
      } catch (_) {
        const cleanLower = cleanName.toLowerCase();
        const matchingTpl = (Array.isArray(dlist) ? dlist : []).find(d => d && String(d.name || '').toLowerCase() === cleanLower && (d.status === 'Active' || !d.status));
        if (matchingTpl) {
          applyTemplateNow(matchingTpl, 'append');
        }
      }
    }
  };

  // Remove a diagnosis chip (preserves existing medicines in prescription pad)
  const handleRemoveDiagnosis = (nameToRemove) => {
    if (isEffectiveReadOnly) return;
    const target = String(nameToRemove || '').trim().toLowerCase();
    setDiagnoses(prev => (Array.isArray(prev) ? prev : []).filter(d => String(typeof d === 'string' ? d : (d?.name || '')).trim().toLowerCase() !== target));
  };

  // Toggle Diagnosis Preset button
  const handleToggleDiagnosisPreset = (tpl) => {
    if (isEffectiveReadOnly || !tpl) return;
    const tplName = String(tpl.name || '').trim();
    if (!tplName) return;
    const isSelected = (Array.isArray(diagnoses) ? diagnoses : []).some(d => String(typeof d === 'string' ? d : (d?.name || '')).trim().toLowerCase() === tplName.toLowerCase());
    if (isSelected) {
      handleRemoveDiagnosis(tplName);
    } else {
      handleApplyDiagnosisTemplate(tpl);
    }
  };

  // Set diagnosis manually without immediately applying medicines
  const handleSelectDiagnosisOnly = (tpl) => {
    if (tpl?.name) {
      handleAddDiagnosis(tpl.name);
    }
  };

  // Perform actual template application (Replace or Append)
  const applyTemplateNow = (tpl, mode) => {
    if (!tpl) return;
    // 1. Audit trail log
    console.log({
      event: 'Prescription Template Applied',
      templateName: tpl.name,
      appliedBy: user?.name || 'Doctor',
      timestamp: new Date().toISOString(),
      action: mode === 'replace' ? 'Replace' : 'Append'
    });

    // 2. Map medicines from template to prescription row format
    let newMeds = [];
    if (tpl.medicines && tpl.medicines.length > 0) {
      newMeds = tpl.medicines.map(medItem => {
        const medName = typeof medItem === 'string' ? medItem : (medItem?.name || medItem?.medicineName || '');
        const medNameLower = String(medName).trim().toLowerCase();
        const catalogMed = (Array.isArray(mlist) ? mlist : []).find(m => {
          if (!m) return false;
          const mName = String(m.name || '').trim().toLowerCase();
          const mGen = String(m.generic || m.genericName || '').trim().toLowerCase();
          return mName === medNameLower ||
            (mName && medNameLower && (mName.includes(medNameLower) || medNameLower.includes(mName))) ||
            (mGen && medNameLower && (mGen.includes(medNameLower) || medNameLower.includes(mGen)));
        });

        const m = catalogMed?.morning || medItem?.morning || '1';
        const a = catalogMed?.afternoon || medItem?.afternoon || '0';
        const n = catalogMed?.night || medItem?.night || '1';
        const dur = catalogMed?.duration || medItem?.duration || '5 Days';
        const qty = calculateQuantity(m, a, n, dur);

        return {
          id: String(Date.now() + Math.random()),
          medicineId: catalogMed?.id || catalogMed?._id || String(Date.now() + Math.random()),
          medicineName: catalogMed?.name || medName,
          morning: m,
          afternoon: a,
          night: n,
          food: normalizeFoodTiming(catalogMed?.food || medItem?.food || getDefaultFoodTimingForMedicine(catalogMed?.name || medItem?.name || medName)),
          duration: dur,
          quantity: qty,
          remarks: catalogMed?.remarks || medItem?.remarks || ''
        };
      });
    }

    // Always append template diagnosis to diagnoses array if not already present
    if (tpl?.name) {
      const tplName = String(tpl.name).trim();
      setDiagnoses(prev => {
        const arr = Array.isArray(prev) ? prev : [];
        if (arr.some(d => String(typeof d === 'string' ? d : (d?.name || '')).trim().toLowerCase() === tplName.toLowerCase())) {
          return arr;
        }
        return [...arr, tplName];
      });
      setDiagSearch('');
      setDiagSuggestions([]);
    }

    if (mode === 'replace') {
      // Clear medicines and load new ones
      setPrescriptionsList(newMeds);
    } else if (mode === 'append') {
      // Append only missing medicines, ignoring duplicates by name
      setPrescriptionsList(prevList => {
        const currentList = Array.isArray(prevList) ? prevList : [];
        const existingNames = new Set(
          currentList
            .map(m => String(m?.medicineName || '').trim().toLowerCase())
            .filter(Boolean)
        );

        const filteredNewMeds = newMeds.filter(
          m => !existingNames.has(String(m?.medicineName || '').trim().toLowerCase())
        );

        const nonBlankPrev = currentList.filter(p => p && String(p.medicineName || '').trim() !== '');
        return [...nonBlankPrev, ...filteredNewMeds];
      });
    }

    // Auto-populate Advice Checkbox ticks (always append missing ones)
    if (tpl.advice && tpl.advice.length > 0) {
      setCheckedAdvice(prev => {
        const merged = new Set([...(Array.isArray(prev) ? prev : []), ...tpl.advice]);
        return Array.from(merged);
      });
      setIsAdviceExpanded(true);
    }

    // Auto-populate Investigations Checkbox ticks (always append missing ones)
    if (tpl.investigations && tpl.investigations.length > 0) {
      setCheckedInvestigations(prev => {
        const merged = new Set([...(Array.isArray(prev) ? prev : []), ...tpl.investigations]);
        return Array.from(merged);
      });
      setIsInvestigationExpanded(true);
    }

    // Auto-populate Follow-up date only if doctor explicitly has follow-up enabled
    if (!isIpdConsultation && followupRequired && tpl.followup) {
      const days = parseInt(tpl.followup);
      if (!isNaN(days)) {
        const fDate = new Date();
        fDate.setDate(fDate.getDate() + days);
        setFollowupDate(fDate.toISOString().split('T')[0]);
      }
    }

    toast.success(`Template applied for ${tpl.name}`);
  };

  // Entry point for applying diagnosis/prescription template
  const handleApplyDiagnosisTemplate = (tpl) => {
    if (isEffectiveReadOnly || !tpl) return;
    // Always use append mode for diagnosis presets so existing diagnoses and medicines are preserved
    applyTemplateNow(tpl, 'append');
  };


  // Add Frequently Used Medicines instantly as a new row
  const handleAddFrequentMed = (name) => {
    if (isEffectiveReadOnly) return;
    const searchTarget = String(name || '').trim().toLowerCase();
    const catalogMed = (Array.isArray(mlist) ? mlist : []).find(m => {
      if (!m) return false;
      const mName = String(m.name || '').trim().toLowerCase();
      const mGen = String(m.generic || m.genericName || '').trim().toLowerCase();
      return (mName && mName.includes(searchTarget)) || (mGen && mGen.includes(searchTarget));
    });
    const m = catalogMed?.morning || '';
    const a = catalogMed?.afternoon || '';
    const n = catalogMed?.night || '';
    const dur = catalogMed?.duration || '';
    const defaultFood = getDefaultFoodTimingForMedicine(name);
    const food = catalogMed?.food ? normalizeFoodTiming(catalogMed.food) : defaultFood;
    const qty = calculateQuantity(m, a, n, dur);

    const newRow = {
      id: String(Date.now() + Math.random()),
      medicineId: catalogMed?.id || catalogMed?._id || String(Date.now()),
      medicineName: catalogMed?.name || name,
      morning: m,
      afternoon: a,
      night: n,
      food: food,
      duration: dur,
      quantity: qty,
      remarks: ''
    };
    setPrescriptionsList([...prescriptionsList, newRow]);
    setFocusedRowId(newRow.id);
    toast.success(`${name} added to pad`);
  };

  // Inline edit handler for prescription grid fields
  const handleUpdatePrescriptionRow = (rowId, field, value) => {
    if (isEffectiveReadOnly) return;
    setPrescriptionsList(prev => prev.map(row => {
      if (row.id === rowId) {
        let updatedRow = { ...row, [field]: value };
        if (field === 'duration' && value === 'Other...') {
          updatedRow.isCustomDuration = true;
          updatedRow.customDurationDays = '';
          updatedRow.duration = '';
          updatedRow.quantity = '';
        } else if (field === 'isCustomDuration' && value === false) {
          updatedRow.isCustomDuration = false;
          updatedRow.customDurationDays = '';
          updatedRow.duration = '';
          updatedRow.quantity = '';
        } else if (field === 'customDurationDays') {
          const rawNum = parseInt(value);
          const daysNum = isNaN(rawNum) ? 0 : Math.max(0, rawNum);
          updatedRow.customDurationDays = value === '' ? '' : String(daysNum);
          updatedRow.duration = daysNum > 0 ? `${daysNum} Days` : '';
          updatedRow.quantity = calculateQuantity(updatedRow.morning, updatedRow.afternoon, updatedRow.night, updatedRow.duration);
        } else if (field === 'quantity') {
          if (value === '' || value === null) {
            updatedRow.quantity = '';
          } else {
            const rawQty = parseInt(value);
            updatedRow.quantity = isNaN(rawQty) ? '' : Math.max(0, rawQty);
          }
        } else if (['morning', 'afternoon', 'night', 'duration'].includes(field)) {
          updatedRow.quantity = calculateQuantity(updatedRow.morning, updatedRow.afternoon, updatedRow.night, updatedRow.duration);
        }
        return updatedRow;
      }
      return row;
    }));
  };

  const updateCoords = (target) => {
    const rect = target.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 185;
    setDropdownCoords({
      top: openUpward ? rect.top + window.scrollY - 165 : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
      openUpward
    });
  };

  // Autocomplete select for row input cell
  const handleAutofillPrescriptionRow = (rowId, med) => {
    if (isEffectiveReadOnly || !med) return;
    const patientAllergies = getPatientAllergiesList(appointment);
    const allergyConflict = checkAllergyConflict(med.name || med.generic || med.genericName || '', patientAllergies);
    if (allergyConflict) {
      toast.error(allergyConflict, { duration: 6000 });
    }

    const qty = calculateQuantity(med.morning || '', med.afternoon || '', med.night || '', med.duration || '');
    setPrescriptionsList(prev => (Array.isArray(prev) ? prev : []).map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          medicineId: med.id || med._id || String(Date.now()),
          medicineName: med.name || '',
          morning: med.morning || '',
          afternoon: med.afternoon || '',
          night: med.night || '',
          food: med.food ? normalizeFoodTiming(med.food) : getDefaultFoodTimingForMedicine(med.name),
          duration: med.duration || '',
          quantity: qty
        };
      }
      return row;
    }));
    setActiveSuggestionRowId(null);
  };

  // Duplicate a prescription row for fast adjustments
  const handleDuplicateRow = (row) => {
    if (isEffectiveReadOnly || !row) return;
    const duplicated = {
      ...row,
      id: String(Date.now() + Math.random()),
      medicineName: `${row?.medicineName || 'Medicine'} (Copy)`
    };
    setPrescriptionsList([...(Array.isArray(prescriptionsList) ? prescriptionsList : []), duplicated]);
    setFocusedRowId(duplicated.id);
    toast.success('Row duplicated');
  };

  const handleRemoveMedicine = (idx) => {
    if (isEffectiveReadOnly) return;
    setPrescriptionsList(prescriptionsList.filter((_, i) => i !== idx));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewDocData(reader.result);
      if (!newDocName) setNewDocName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleAddDocument = (e) => {
    e.preventDefault();
    if (!newDocName || !newDocData) {
      toast.error('Choose a file and write a title');
      return;
    }
    setUploadedDocs([
      ...uploadedDocs,
      {
        name: newDocName,
        fileType: newDocType,
        data: newDocData,
        createdAt: new Date().toISOString()
      }
    ]);
    setNewDocName('');
    setNewDocData('');
    toast.success('Document attached');
  };

  const toggleAdvice = (adv) => {
    if (isEffectiveReadOnly) return;
    if (checkedAdvice.includes(adv)) {
      setCheckedAdvice(checkedAdvice.filter(x => x !== adv));
    } else {
      setCheckedAdvice([...checkedAdvice, adv]);
    }
  };

  const toggleInvestigation = (inv) => {
    if (isEffectiveReadOnly) return;
    if (checkedInvestigations.includes(inv)) {
      setCheckedInvestigations(checkedInvestigations.filter(x => x !== inv));
    } else {
      setCheckedInvestigations([...checkedInvestigations, inv]);
    }
  };

  const handleApplyPresetFollowup = (days) => {
    if (isEffectiveReadOnly) return;
    setFollowupRequired(true);
    const fDate = new Date();
    fDate.setDate(fDate.getDate() + days);
    setFollowupDate(fDate.toISOString().split('T')[0]);
  };

  const executeConsultationSubmit = (deliveryMethod) => {
    if (isEffectiveReadOnly) {
      toast.error('This round has already been consulted and recorded. You cannot modify a past round.');
      return;
    }
    const activeDiagnoses = (diagnoses.length > 0 ? diagnoses : (primaryDiagnosis ? [primaryDiagnosis] : []))
      .map(d => String(typeof d === 'string' ? d : (d?.name || '')).trim())
      .filter(Boolean);
    const activeMeds = (Array.isArray(prescriptionsList) ? prescriptionsList : []).filter(p => p && String(p.medicineName || '').trim());

    const freqMap = {
      '1-0-0': 'OD',
      '1-0-1': 'BD',
      '1-1-1': 'TDS',
      '0-0-1': 'HS',
      '0-1-0': 'OM',
      '1-1-0': 'TD_NO_NIGHT',
      '0-1-1': 'TD_NO_MORN',
      '½-0-½': 'BID_HALF'
    };

    const payloadPrescriptions = activeMeds.map(p => {
      const gridPattern = `${p.morning}-${p.afternoon}-${p.night}`;
      const medNameClean = String(p.medicineName || '').trim();
      const defaultFood = getDefaultFoodTimingForMedicine(medNameClean);
      const resolvedFood = normalizeFoodTiming(p.food || defaultFood);
      const rx = {
        medicineName: medNameClean,
        dosage: gridPattern,
        frequency: freqMap[gridPattern] || p.frequency || 'BD',
        duration: p.duration,
        route: 'Oral',
        quantity: p.quantity,
        instructions: resolvedFood,
        foodTiming: resolvedFood,
        morning: p.morning,
        afternoon: p.afternoon,
        night: p.night,
        notes: p.remarks || ''
      };

      const isValidObjectId = p.medicineId && /^[0-9a-fA-F]{24}$/.test(p.medicineId);
      if (isValidObjectId) {
        rx.medicineId = p.medicineId;
      }
      return rx;
    });

    const payloadInvestigations = checkedInvestigations.map(item => {
      const nameToMatch = typeof item === 'object' ? (item.name || item.investigationName) : item;
      const matchedSrv = resolveHospitalService(nameToMatch, hospitalServices);
      if (matchedSrv) {
        const resolvedType = matchedSrv.serviceType || (isLikelyRadiology(matchedSrv.name) ? 'Radiology' : 'Laboratory');
        return {
          serviceId: matchedSrv._id,
          name: matchedSrv.name,
          code: matchedSrv.code || '',
          serviceType: resolvedType,
          category: matchedSrv.category || matchedSrv.serviceType || 'General',
          price: Number(matchedSrv.price) || 0,
          notes: ''
        };
      }
      return {
        name: nameToMatch,
        serviceType: isLikelyRadiology(nameToMatch) ? 'Radiology' : 'Laboratory',
        category: 'Other Tests',
        price: 0,
        notes: ''
      };
    });

    if (customInvestigation && customInvestigation.trim()) {
      const customItems = customInvestigation
        .split(/[,;\n]+/)
        .map(s => s.trim())
        .filter(Boolean);

      const itemsToProcess = customItems.length > 0 ? customItems : [customInvestigation.trim()];

      for (const customName of itemsToProcess) {
        const isAlreadyAdded = payloadInvestigations.some(
          inv => (inv?.name || '').toLowerCase() === String(customName || '').trim().toLowerCase()
        );
        if (isAlreadyAdded) continue;

        const matchedSrv = resolveHospitalService(customName, hospitalServices);
        if (matchedSrv) {
          const resolvedType = matchedSrv.serviceType || (isLikelyRadiology(matchedSrv.name) ? 'Radiology' : 'Laboratory');
          payloadInvestigations.push({
            serviceId: matchedSrv._id,
            name: matchedSrv.name,
            code: matchedSrv.code || '',
            serviceType: resolvedType,
            category: matchedSrv.category || matchedSrv.serviceType || 'General',
            price: Number(matchedSrv.price) || 0,
            notes: ''
          });
        } else {
          payloadInvestigations.push({
            name: customName,
            serviceType: 'Other',
            category: 'Custom Request',
            price: 0,
            notes: customName
          });
        }
      }
    }

    const payload = {
      appointmentId: appointment._id,
      patientId: appointment.patientId?._id || appointment.patientId || patient?._id || patient,
      consultationFee: customConsultationFee !== '' ? Number(customConsultationFee) : (appointment?.consultationFee || 500),
      consultationType: isIpdConsultation ? `Round ${activeRoundNumber}` : (consultationType || appointment?.consultationType || 'New Consultation'),
      roundNumber: activeRoundNumber,
      dayNumber: activeRoundNumber,
      diagnosis: activeDiagnoses.join(', '),
      diagnoses: activeDiagnoses,
      primaryDiagnosis: activeDiagnoses[0],
      clinicalNotes: isIpdConsultation ? (ipdAssessmentPlan || clinicalNotes) : clinicalNotes,
      advice: [checkedAdvice.join(', '), customAdvice].filter(Boolean).join(' | '),
      followupDate: (followupRequired && Boolean(followupDate)) ? followupDate : undefined,
      chiefComplaint: (isIpdConsultation && ipdChiefComplaints) ? ipdChiefComplaints : (appointment?.chiefComplaint || activeDiagnoses.join(', ')),
      allergies: getPatientAllergiesList(appointment),
      historyOfPresentIllness: isIpdConsultation ? (ipdAssessmentPlan || clinicalNotes) : clinicalNotes,
      symptoms: '',
      vitals,
      icd10Code: '',
      diagnosisStatus,
      followupRequired: Boolean(followupRequired && followupDate),
      followupReason,
      documents: uploadedDocs,
      investigations: payloadInvestigations,
      prescriptions: payloadPrescriptions,
      deliveryMethod,
      isIpd: Boolean(isIpdConsultation),
      consultationDate: (isFollowupConsultation || searchParams.get('fresh') === 'true') ? new Date().toISOString() : undefined,
      date: (isFollowupConsultation || searchParams.get('fresh') === 'true') ? new Date().toISOString() : undefined
    };

    // Auto-sync any doctor added medicines into Medicine Master if missing
    (activeMeds || []).forEach(med => {
      try {
        syncMedicineToMaster(med);
      } catch (_) {}
    });

    completeConsultationMutation.mutate(payload);
  };

  const handleSubmitConsultation = () => {
    if (!appointment) return;
    if (isEffectiveReadOnly) {
      toast.error('This round has already been consulted and recorded. Switch to the current round to prescribe.');
      return;
    }
    const activeDiagnoses = diagnoses.length > 0 ? diagnoses : (primaryDiagnosis ? [primaryDiagnosis] : []);
    if (activeDiagnoses.length === 0) {
      toast.error('Please select at least one diagnosis.');
      return;
    }

    // Filter out completely blank rows
    const activeMeds = (Array.isArray(prescriptionsList) ? prescriptionsList : []).filter(p => p && String(p.medicineName || '').trim());

    // Check validation rules
    for (const med of activeMeds) {
      const medNameClean = String(med.medicineName || '').trim();
      if (!medNameClean) {
        toast.error('Medicine name is mandatory for all entered rows');
        return;
      }
      if (!med.duration) {
        toast.error(`Please select a duration for ${medNameClean}`);
        return;
      }
      if (Number(med.quantity) <= 0) {
        toast.error(`Quantity must be greater than zero for ${medNameClean}`);
        return;
      }
    }

    const prescriptionDeliverySetting = billingSettings?.prescriptionDelivery || 'internal_pharmacy';

    if (prescriptionDeliverySetting === 'internal_external') {
      setSelectedDeliveryMethod('internal_pharmacy');
      setIsDeliveryModalOpen(true);
    } else if (prescriptionDeliverySetting === 'print_only') {
      executeConsultationSubmit('print_only');
    } else {
      executeConsultationSubmit('internal_pharmacy');
    }
  };

  if (appLoading) {
    return <div className="text-center py-20 text-slate-400 font-bold">Loading Digital Prescription Pad...</div>;
  }

  const isInActiveConsultation = appointment && (
    appointment.status === 'In Consultation' ||
    appointment.queueStatus === 'In-Consultation' ||
    appointment.status === 'In-Consultation' ||
    getVisitStatus(appointment) === VISIT_STATUSES.IN_CONSULTATION
  );

  const canViewWorkspace = appointment && (
    isInActiveConsultation ||
    isReadOnly ||
    appointment.status === 'Completed' ||
    appointment.queueStatus === 'Completed' ||
    appointment.status === 'Sent to Pharmacy' ||
    appointment.status === 'Sent To Pharmacy' ||
    isCompletedVisit(getVisitStatus(appointment))
  );

  const isTokenOnlyPlan = user?.hospital?.opdOperationMode === 'TOKEN_ONLY' || user?.opdOperationMode === 'TOKEN_ONLY';

  if (isTokenOnlyPlan) {
    return (
      <div className="p-4 sm:p-6 bg-[#F8FAFC] min-h-screen font-sans">
        <div className="mb-6 text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827] flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2]">
              <Stethoscope className="w-5 h-5" />
            </div>
            OPD Token & Queue Workspace
          </h1>
          <p className="text-xs text-[#6B7280] mt-1 font-medium">
            Plan 1 Enabled: Token Generation & Audio Voice Calling Mode.
          </p>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-10 sm:p-14 text-center shadow-card-soft max-w-xl mx-auto my-6 space-y-4 font-sans">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-[#2F63F2] flex items-center justify-center mx-auto shadow-xs">
            <Volume2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[#111827]">
            Physical Paper Prescription Mode Active
          </h3>
          <p className="text-xs text-[#6B7280] font-medium leading-relaxed max-w-md mx-auto">
            Your hospital operates under <strong>Plan 1 (Token Generation & Queue Plan)</strong>. Prescriptions are written by hand on your hospital's physical paper letterheads.
          </p>
          <div className="pt-2">
            <Button
              onClick={() => navigate('/doctor/queue')}
              variant="primary"
              icon={Users}
              className="h-[42px] px-6 text-xs font-bold uppercase tracking-wider bg-[#2F63F2] hover:bg-blue-700 text-white shadow-sm cursor-pointer"
            >
              Open Today's Queue & Voice Caller
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeVisitId || !appointment) {
    return (
      <div className="p-4 sm:p-6 bg-[#F8FAFC] min-h-screen font-sans">
        {/* Header Title */}
        <div className="mb-6 text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827] flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2]">
              <Stethoscope className="w-5 h-5" />
            </div>
            Doctor Consultation Workspace
          </h1>
          <p className="text-xs text-[#6B7280] mt-1 font-medium">
            Clinical workspace for active patient consultation.
          </p>
        </div>

        {/* Empty State / Gatekeeper Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-10 sm:p-16 text-center shadow-card-soft max-w-xl mx-auto my-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
            <Stethoscope className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[#111827]">
            {!appointment ? 'No consultation selected' : 'Patient not in active consultation'}
          </h3>
          <p className="text-xs text-[#6B7280] font-medium mt-1.5 max-w-sm mx-auto">
            {!appointment
              ? 'Select a patient from Today\'s Queue to begin or view a consultation.'
              : 'This patient is not currently in consultation. Please start or resume the consultation from Today\'s Queue.'}
          </p>
          <div className="mt-6 font-sans flex items-center justify-center gap-3 flex-wrap">
            <Button
              onClick={() => navigate('/doctor/queue')}
              variant="primary"
              icon={Users}
              className="h-[42px] px-6 text-xs font-bold uppercase tracking-wider bg-[#2F63F2] hover:bg-blue-700 text-white shadow-sm cursor-pointer"
            >
              Open Today's Queue
            </Button>
            <Button
              onClick={handleBackToDashboard}
              variant="secondary"
              icon={ArrowLeft}
              className="h-[42px] px-5 text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 shadow-sm cursor-pointer"
            >
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-1.5 sm:p-4 md:p-6 bg-slate-50 min-h-screen print:bg-white print:p-0 font-sans">
      <div className="w-full max-w-[1920px] mx-auto space-y-2 sm:space-y-4 text-left pb-28 sm:pb-10 print:pb-0 font-sans">

        {/* 0. WORKSPACE TOP ACTION TOOLBAR & MODE SEGMENTED CONTROL */}
        <div className="flex items-center justify-between gap-2.5 sm:gap-3 flex-wrap print:hidden bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-xs">
          <div className="flex items-center gap-2">
            {isIpdConsultation ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQueueDrawerOpen(!isQueueDrawerOpen)}
                  className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-extrabold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer hover:shadow-lg active:scale-95"
                  title={isQueueDrawerOpen ? "Collapse IPD Queue" : "Open Today's IPD Queue"}
                >
                  <Bed className="w-4 h-4 text-white shrink-0" />
                  <span className="font-extrabold tracking-wide">
                    {isQueueDrawerOpen ? 'Collapse IPD Queue' : 'Consulting IPD Patient'}
                  </span>
                  <span className="bg-white/20 text-white px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black flex items-center gap-1 border border-white/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Round {currentRoundNumber}
                  </span>
                  <span className="hidden sm:inline bg-indigo-500/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/20">
                    Live IPD
                  </span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsQueueDrawerOpen(!isQueueDrawerOpen)}
                className="px-3 sm:px-4 py-2 rounded-xl bg-[#3563F6] hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer hover:shadow-lg active:scale-95"
              >
                <Users className="w-4 h-4 text-white" />
                <span className="hidden sm:inline">{isQueueDrawerOpen ? 'Collapse Queue' : 'Today\'s Queue'}</span>
                <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live OPD
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {draftSavedTime ? (
              <span className="text-xs text-emerald-700 font-mono font-extrabold bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Saved at {draftSavedTime}
              </span>
            ) : (
              <span className="text-xs text-slate-400 font-mono font-bold bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
                Auto-save active
              </span>
            )}
          </div>
        </div>

        {/* SPLIT / FULL WORKSPACE FLEX CONTAINER WITH INLINE FRAMER-MOTION EXPANDING SIDE PANEL */}
        <div className="flex flex-col lg:flex-row gap-5 items-start">

          {/* INLINE FRAMER-MOTION EXPANDING TODAY'S QUEUE PANEL (COMPACT 270px WIDTH) */}
          <AnimatePresence>
            {isQueueDrawerOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 270, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1.0] }}
                className="overflow-hidden flex-shrink-0 w-[270px] print:hidden"
              >
                {isIpdConsultation ? (
                  <DoctorIPDConsultationSidebar
                    currentAdmissionId={appointment?.admissionId || appointment?._id || appointment?.rawAdmission?._id}
                    doctorId={user?._id}
                    onClose={() => setIsQueueDrawerOpen(false)}
                    onSelectAdmission={(selectedAdm) => {
                      const admId = selectedAdm._id || selectedAdm.id || selectedAdm.admissionId;
                      if (admId) {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        navigate(`/doctor/consultation/${admId}?type=ipd&mode=consultation`);
                      }
                    }}
                  />
                ) : (
                  <DoctorConsultationSidebar
                    currentAppId={appointment?._id}
                    doctorId={user?._id}
                    isDrawer={true}
                    onClose={() => setIsQueueDrawerOpen(false)}
                    onSelectPatient={(selectedApp) => {
                      if (selectedApp?._id && selectedApp._id !== appointment?._id) {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        navigate(`/doctor/consultation/${selectedApp._id}`);
                      }
                    }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* MAIN CONSULTATION WORKSPACE CONTENT AREA WITH ANIMATED PATIENT SWITCHING */}
          <div className="flex-1 min-w-0 w-full font-sans">
            <AnimatePresence mode="wait">
              <motion.div
                key={appointment?._id || consultationId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="space-y-4 text-left"
              >

                {/* Read Only Warning Banner if consultation is completed (Hidden in print) */}
                {isReadOnly && (
                  <div className="pt-1 print:hidden">
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                        <div>
                          <h4 className="text-sm font-bold text-emerald-800">Consultation Completed & Sent to Pharmacy</h4>
                          <p className="text-xs text-emerald-600 mt-0.5">This visit has been finalized. This record is displayed in read-only view to prevent duplicate consultations.</p>
                        </div>
                      </div>
                      <Button onClick={handleBackToDashboard} variant="primary" className="text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap cursor-pointer">
                        Back to Dashboard
                      </Button>
                    </div>
                  </div>
                )}

                {/* Read-Only Before Clinical Review Round Banner for IPD patients (Hidden in print) */}
                {!isReadOnly && isPastRoundReadOnly && (
                  <div className="pt-1 print:hidden">
                    <div className="p-3.5 sm:p-4 bg-amber-50/90 border border-amber-200/90 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
                          <Eye className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black text-amber-950">
                              Viewing Round {activeRoundNumber} (Recorded Consultation • Read-Only)
                            </h4>
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-200/70 text-amber-900">
                              Before Clinical Review Round
                            </span>
                          </div>
                          <p className="text-xs text-amber-800/90 mt-0.5">
                            This round was already completed and saved to the patient's record. You can view its original consultation and prescription, but cannot edit it. Switch to the current round to add prescriptions.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSwitchRound(currentConsultationRoundNumber)}
                        className="px-4 py-2 bg-[#2F63F2] hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap active:scale-95"
                      >
                        <span>Switch to Round {currentConsultationRoundNumber} to Prescribe</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 1. PATIENT SUMMARY HEADER — Clean Enterprise Layout (Compact Mobile 2-Line Structure) */}
                <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs print:hidden font-sans overflow-hidden">
                  {/* Desktop & Tablet Layout (md:flex) */}
                  <div className="hidden md:flex px-5 py-4 items-start justify-between gap-4">
                    {/* Left: Patient Identity */}
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Patient Name — Primary Visual Element */}
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">
                        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${isIpdConsultation ? 'bg-indigo-50 text-indigo-600' : 'bg-[#3563F6]/10 text-[#3563F6]'
                          }`}>
                          {isIpdConsultation ? '🏥' : '👤'}
                        </span>
                        <span className="truncate">{appointment.patientId?.name}</span>
                        {isIpdConsultation ? (
                          <>
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                              {ipdDetails?.status || 'Admitted'}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Inpatient (IPD)
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#3563F6] border border-blue-200">
                            General OPD
                          </span>
                        )}
                      </h2>

                      {/* Secondary Line: IPD vs OPD details */}
                      {isIpdConsultation ? (
                        /* IPD Secondary Line: Streamlined without IPD number, UHID, or ward/bed */
                        <div className="flex items-center gap-2.5 text-sm sm:text-base text-slate-600 font-semibold pl-[46px] flex-wrap">
                          <span className="text-slate-800 font-bold">{ipdDetails?.age}</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-slate-800 font-bold">{ipdDetails?.gender}</span>
                          {ipdDetails?.admissionDateFormatted && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="font-mono font-bold text-xs text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                                📅 Admitted: {ipdDetails.admissionDateFormatted} (Day {ipdDetails?.stayDays})
                              </span>
                            </>
                          )}
                          <span className="text-slate-300">•</span>
                          <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200/80 flex items-center gap-1.5 shadow-2xs">
                            <Stethoscope className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            Round {currentRoundNumber}
                          </span>
                        </div>
                      ) : (
                        /* OPD Secondary Line */
                        <div className="flex items-center gap-2.5 text-sm sm:text-base text-slate-600 font-semibold pl-[46px] flex-wrap">
                          <span className="text-slate-800 font-bold">{appointment.patientId?.age ? `${appointment.patientId.age} yrs` : 'N/A'}</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-slate-800 font-bold">{appointment.patientId?.gender ? (appointment.patientId.gender.length === 1 ? appointment.patientId.gender.toUpperCase() : appointment.patientId.gender.charAt(0).toUpperCase()) : 'N/A'}</span>
                          {appointment.patientId?.bloodGroup && appointment.patientId.bloodGroup !== 'Unknown' && appointment.patientId.bloodGroup !== 'N/A' && (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs">
                              {appointment.patientId.bloodGroup}
                            </span>
                          )}
                          <span className="text-slate-300">•</span>
                          <span className="font-mono font-extrabold text-[#3563F6] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                            Token #{appointment?.tokenNumber || appointment?.tokenNo || '01'}
                          </span>
                          {appointment.patientId?.uhid && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="font-mono font-bold text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                UHID: {appointment.patientId?.uhid}
                              </span>
                            </>
                          )}
                          {appointment.date && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="font-mono font-bold text-xs text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                                📅 Consult Date: {(isFollowupConsultation || searchParams.get('fresh') === 'true' || searchParams.get('type') === 'followup') ? new Date().toLocaleDateString('en-GB') : new Date(appointment.date).toLocaleDateString('en-GB')}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Badges Row: Payment + Allergy (Paid/Unpaid and ALLERGIES: NONE removed for IPD patients) */}
                      {(!isIpdConsultation || (formatAllergiesDisplay(appointment, 'NONE') !== 'NONE')) && (
                        <div className="flex items-center gap-2.5 pl-[42px] flex-wrap">
                          {!isIpdConsultation && (
                            <span className={`text-[10px] font-extrabold border px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${appointment.billingStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${appointment.billingStatus === 'Paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              {appointment.billingStatus === 'Paid' ? 'Paid' : 'Unpaid'}
                            </span>
                          )}

                          {(() => {
                            const allergyStr = formatAllergiesDisplay(appointment, 'NONE');
                            const hasAllergies = allergyStr !== 'NONE';
                            if (isIpdConsultation && !hasAllergies) return null;
                            return (
                              <span className={`text-[10px] font-extrabold border px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${hasAllergies ? 'bg-amber-100/80 text-amber-900 border-amber-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${hasAllergies ? 'bg-amber-600 animate-pulse' : 'bg-slate-400'}`} />
                                ⚠ ALLERGIES: {allergyStr}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {workflow?.canCollectConsultationFee('Doctor', appointment) && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.put(`/operations/appointments/${appointment._id}/queue`, { billingStatus: 'Paid' });
                              toast.success('Consultation Fee collected successfully by Doctor!');
                              queryClient.invalidateQueries(['appointments']);
                              queryClient.invalidateQueries(['doctorQueue']);
                            } catch {
                              toast.error('Failed to update fee status');
                            }
                          }}
                          className="text-[10px] h-8 font-extrabold uppercase bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          💰 Collect Fee
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsHistoryDrawerOpen(true)}
                        className="text-xs h-8 font-extrabold uppercase bg-blue-50 hover:bg-blue-100 text-[#3563F6] border border-blue-200 rounded-xl px-3 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <HistoryIcon className="w-3.5 h-3.5" />
                        <span>Patient History</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleBackToDashboard}
                        className="text-xs h-8 font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl px-3 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    </div>
                  </div>

                  {/* Compact Mobile Layout (block md:hidden) - Strictly Single Line Metadata Structure */}
                  <div className="block md:hidden p-2.5 space-y-1.5">
                    {/* Line 1 — Patient Identity + Actions */}
                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden leading-tight text-xs">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${isIpdConsultation ? 'bg-indigo-50 text-indigo-600' : 'bg-[#3563F6]/10 text-[#3563F6]'
                          }`}>
                          {isIpdConsultation ? '🏥' : '👤'}
                        </span>
                        <h2 className="font-black text-slate-900 truncate shrink-0 max-w-[85px] sm:max-w-[120px] text-xs">
                          {appointment.patientId?.name}
                        </h2>
                        {isIpdConsultation && (
                          <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                            ADMITTED
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {workflow?.canCollectConsultationFee('Doctor', appointment) && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.put(`/operations/appointments/${appointment._id}/queue`, { billingStatus: 'Paid' });
                                toast.success('Consultation Fee collected successfully by Doctor!');
                                queryClient.invalidateQueries(['appointments']);
                                queryClient.invalidateQueries(['doctorQueue']);
                              } catch {
                                toast.error('Failed to update fee status');
                              }
                            }}
                            className="text-[9px] h-6 font-extrabold uppercase bg-emerald-600 hover:bg-emerald-700 text-white rounded px-1.5 flex items-center gap-0.5 cursor-pointer"
                          >
                            💰 Fee
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setIsHistoryDrawerOpen(true)}
                          className="text-[9px] h-6 font-extrabold uppercase bg-blue-50 hover:bg-blue-100 text-[#3563F6] border border-blue-200 rounded px-1.5 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <HistoryIcon className="w-2.5 h-2.5" />
                          <span>HISTORY</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleBackToDashboard}
                          className="text-[9px] h-6 font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded px-1.5 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <ArrowLeft className="w-2.5 h-2.5" />
                          <span>BACK</span>
                        </button>
                      </div>
                    </div>

                    {/* Line 2 — Single Horizontal Line Metadata: IPD vs OPD */}
                    {isIpdConsultation ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-semibold truncate leading-none">
                        <span className="text-slate-800 font-bold shrink-0">{ipdDetails?.age ? `${ipdDetails.age}`.replace(' Years', ' yrs') : 'N/A'}</span>
                        <span className="text-slate-300 shrink-0">/</span>
                        <span className="text-slate-800 font-bold shrink-0">{ipdDetails?.gender ? (ipdDetails.gender.length === 1 ? ipdDetails.gender.toUpperCase() : ipdDetails.gender.charAt(0).toUpperCase()) : 'N/A'}</span>
                        {ipdDetails?.bloodGroup && ipdDetails.bloodGroup !== 'Unknown' && ipdDetails.bloodGroup !== 'N/A' && (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs shrink-0">
                            {ipdDetails.bloodGroup}
                          </span>
                        )}

                        <span className="text-slate-300 shrink-0">•</span>
                        <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200/80 text-[10px] shrink-0">
                          Round {currentRoundNumber}
                        </span>
                        <span className="text-slate-300 shrink-0">•</span>
                        <span className="text-xs font-bold text-slate-700 shrink-0">
                          Day {ipdDetails?.stayDays}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-semibold truncate leading-none">
                        <span className="text-slate-800 font-bold shrink-0">{appointment.patientId?.age ? `${appointment.patientId.age} yrs` : 'N/A'}</span>
                        <span className="text-slate-300 shrink-0">/</span>
                        <span className="text-slate-800 font-bold shrink-0">{appointment.patientId?.gender ? (appointment.patientId.gender.length === 1 ? appointment.patientId.gender.toUpperCase() : appointment.patientId.gender.charAt(0).toUpperCase()) : 'N/A'}</span>
                        {appointment.patientId?.bloodGroup && appointment.patientId.bloodGroup !== 'Unknown' && appointment.patientId.bloodGroup !== 'N/A' && (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs shrink-0">
                            {appointment.patientId.bloodGroup}
                          </span>
                        )}
                        <span className="text-slate-300 shrink-0">•</span>
                        <span className="font-mono font-extrabold text-[#3563F6] bg-blue-50 px-1 py-0.2 rounded border border-blue-200/60 text-[10px] shrink-0">
                          #OP{String(appointment?.tokenNumber || appointment?.tokenNo || '1').padStart(3, '0')}
                        </span>
                        {appointment.date && (
                          <>
                            <span className="text-slate-300 shrink-0">•</span>
                            <span className="font-mono font-bold text-[10px] text-slate-700 shrink-0">
                              {new Date(appointment.date).toLocaleDateString('en-GB')}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Line 3 — Compact Status Badges Row (Paid/Unpaid and ALLERGIES: NONE removed for IPD patients) */}
                    {(!isIpdConsultation || (formatAllergiesDisplay(appointment, 'NONE') !== 'NONE')) && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {!isIpdConsultation && (
                          <span className={`text-[9px] font-extrabold border px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${appointment.billingStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${appointment.billingStatus === 'Paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {appointment.billingStatus === 'Paid' ? '✓ PAID' : 'UNPAID'}
                          </span>
                        )}

                        {(() => {
                          const allergyStr = formatAllergiesDisplay(appointment, 'NONE');
                          const hasAllergies = allergyStr !== 'NONE';
                          if (isIpdConsultation && !hasAllergies) return null;
                          return (
                            <span className={`text-[9px] font-extrabold border px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${hasAllergies ? 'bg-amber-100/80 text-amber-900 border-amber-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${hasAllergies ? 'bg-amber-600 animate-pulse' : 'bg-slate-400'}`} />
                              ⚠ ALLERGIES: {allergyStr}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Patient Details Toggle Bar */}
                  <div className="border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsPatientDetailsExpanded(prev => !prev)}
                      className="w-full px-3 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        {isPatientDetailsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Patient Details
                      </span>
                      <span className="text-[10px] font-medium normal-case tracking-normal text-slate-400">
                        {isPatientDetailsExpanded ? 'Hide' : 'Show'} additional information
                      </span>
                    </button>

                    {/* Expandable Details Panel */}
                    <AnimatePresence initial={false}>
                      {isPatientDetailsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 sm:px-5 pb-3 sm:pb-4 pt-1">
                            {isIpdConsultation ? (
                              /* Strictly IPD Department Details Grid */
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-2.5 sm:gap-y-3 text-xs">
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">IPD Number</span>
                                  <span className="font-extrabold text-[#3563F6] font-mono text-sm">{ipdDetails?.admissionId}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">UHID</span>
                                  <span className="font-semibold text-slate-800 font-mono">{ipdDetails?.uhid}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Department</span>
                                  <span className="font-extrabold text-indigo-700">Inpatient Department (IPD)</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Ward & Bed</span>
                                  <span className="font-bold text-slate-900 flex items-center gap-1">
                                    <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    {ipdDetails?.wardBedDisplay}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Admission Date & Time</span>
                                  <span className="font-semibold text-slate-800 font-mono">
                                    {ipdDetails?.admissionDateFormatted} {ipdDetails?.admissionTime && `• ${ipdDetails.admissionTime}`}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Length of Stay</span>
                                  <span className="font-extrabold text-slate-900 font-mono">
                                    Day {ipdDetails?.stayDays} <span className="text-[10px] font-semibold text-slate-500">({ipdDetails?.stayDays === 1 ? '1 Day' : `${ipdDetails?.stayDays} Days`})</span>
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Admission Type</span>
                                  <span className="font-semibold text-slate-800">{ipdDetails?.admissionType}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Inpatient Status</span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                    {ipdDetails?.status}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Blood Group</span>
                                  <span className="font-extrabold text-rose-700">{ipdDetails?.bloodGroup}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Attending Doctor</span>
                                  <span className="font-bold text-[#3563F6]">{ipdDetails?.doctorName}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Clinical Review Rounds</span>
                                  <span className="font-bold text-indigo-800">
                                    Round {currentRoundNumber} ({ipdDetails?.totalRoundsCompleted} Completed)
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Known Allergies</span>
                                  <span className={`font-bold ${ipdDetails?.allergiesDisplay !== 'None' ? 'text-amber-800 font-extrabold' : 'text-slate-700'}`}>
                                    {ipdDetails?.allergiesDisplay}
                                  </span>
                                </div>
                                <div className="col-span-2 sm:col-span-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Reason for Admission</span>
                                  <span className="font-medium text-slate-800">{ipdDetails?.reasonForAdmission}</span>
                                </div>
                              </div>
                            ) : (
                              /* Outpatient (OPD) Details Grid */
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-2.5 sm:gap-y-3 text-xs">
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Token Number</span>
                                  <span className="font-extrabold text-[#3563F6] font-mono text-sm">Token #{appointment?.tokenNumber || appointment?.tokenNo || '01'}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">UHID</span>
                                  <span className="font-semibold text-slate-800 font-mono">{appointment.patientId?.uhid || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Blood Group</span>
                                  <span className="font-extrabold text-rose-700">{appointment.patientId?.bloodGroup || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Department</span>
                                  <span className="font-semibold text-slate-800">General OPD</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Consult Date</span>
                                  <span className="font-semibold text-slate-800 font-mono">
                                    {(isFollowupConsultation || searchParams.get('fresh') === 'true' || searchParams.get('type') === 'followup') ? new Date().toLocaleDateString('en-GB') : (appointment.date ? new Date(appointment.date).toLocaleDateString('en-GB') : 'Today')}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Visit Time</span>
                                  <span className="font-semibold text-slate-800 font-mono">{appointment.time || 'General OPD Hours'}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Created By</span>
                                  <span className="font-semibold text-slate-800">Reception Desk</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Last Saved</span>
                                  <span className="font-semibold text-emerald-700 font-mono">{draftSavedTime || 'Auto-saved'}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Attending Doctor</span>
                                  <span className="font-bold text-[#3563F6]">{formatDoctorDisplayName(appointment?.doctorId?.name || user?.name)}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Known Allergies</span>
                                  <span className={`font-bold ${formatAllergiesDisplay(appointment, 'None') !== 'None' ? 'text-amber-800 font-extrabold' : 'text-slate-700'}`}>
                                    {formatAllergiesDisplay(appointment, 'None')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Read-Only Past Consultation Banner */}
                {isReadOnly && (
                  <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center justify-between text-amber-800 text-xs font-bold font-sans print:hidden">
                    <span className="flex items-center gap-2">
                      🔒 <strong>Read-Only Record:</strong> {isIpdConsultation 
                        ? 'IPD Clinical Consultation & Discharge Summary finalized. You are viewing the read-only prescription records for all daily rounds.'
                        : `This consultation was completed on ${new Date(appointment?.date || Date.now()).toLocaleDateString('en-GB')}. Modifications are disabled.`}
                    </span>
                    <span className="text-[10px] font-extrabold uppercase bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-md text-amber-900">
                      {appointment?.status === 'Discharged' || appointment?.admissionStatus === 'Discharged' ? 'Discharged' : 'Completed Consultation'}
                    </span>
                  </div>
                )}

                {/* 2. PATIENT VITALS VISUAL METRIC CARDS BAR (Desktop Full Row / Mobile Collapsible) */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs space-y-2 print:hidden font-sans overflow-hidden">
                  {/* Desktop Header */}
                  <div className="hidden md:flex items-center justify-between px-1">
                    <span className="text-sm sm:text-base font-normal tracking-wide text-[#3563F6] flex items-center gap-1.5">
                      🩺 Patient Vitals & Physical Metrics
                    </span>

                    {!isEffectiveReadOnly && (
                      <button
                        type="button"
                        onClick={() => setIsEditVitalsModalOpen(true)}
                        className="px-2.5 py-1 rounded-lg bg-[#3563F6]/10 hover:bg-[#3563F6]/20 text-[#3563F6] border border-[#3563F6]/30 font-black text-[10px] uppercase flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Vitals</span>
                      </button>
                    )}
                  </div>

                  {/* Desktop 7 KPI Cards Row */}
                  <div className="hidden md:grid grid-cols-7 gap-2 w-full">
                    {/* BP Card */}
                    <div className="flex items-center gap-2 bg-rose-50/70 border border-rose-200/80 rounded-xl p-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0">
                        ❤️
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-600 block uppercase tracking-wider">BP</span>
                        <span className="text-xs font-black text-slate-900 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                          {vitals.bpSystolic ? `${vitals.bpSystolic}/${vitals.bpDiastolic || '--'}` : '--'}
                        </span>
                      </div>
                    </div>

                    {/* Pulse Card */}
                    <div className="flex items-center gap-2 bg-purple-50/70 border border-purple-200/80 rounded-xl p-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs shrink-0">
                        ✨
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-600 block uppercase tracking-wider">Pulse</span>
                        <span className="text-xs font-black text-slate-900 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                          {vitals.pulse ? (
                            <>
                              {vitals.pulse} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">bpm</span>
                            </>
                          ) : '--'}
                        </span>
                      </div>
                    </div>

                    {/* Temp Card */}
                    <div className="flex items-center gap-2 bg-cyan-50/70 border border-cyan-200/80 rounded-xl p-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center font-bold text-xs shrink-0">
                        🌡️
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-600 block uppercase tracking-wider">Temp</span>
                        <span className="text-xs font-black text-slate-900 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                          {vitals.temperature ? (
                            <>
                              {vitals.temperature} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">°F</span>
                            </>
                          ) : '--'}
                        </span>
                      </div>
                    </div>

                    {/* SpO2 Card */}
                    <div className="flex items-center gap-2 bg-blue-50/70 border border-blue-200/80 rounded-xl p-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                        💧
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-600 block uppercase tracking-wider">SpO₂</span>
                        <span className="text-xs font-black text-slate-900 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                          {vitals.spo2 ? (
                            <>
                              {vitals.spo2} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">%</span>
                            </>
                          ) : '--'}
                        </span>
                      </div>
                    </div>

                    {/* Height Card */}
                    <div className="flex items-center gap-2 bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                        📏
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-600 block uppercase tracking-wider">Height</span>
                        <span className="text-xs font-black text-slate-900 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                          {vitals.height ? (
                            <>
                              {vitals.height} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">cm</span>
                            </>
                          ) : '--'}
                        </span>
                      </div>
                    </div>

                    {/* Weight Card */}
                    <div className="flex items-center gap-2 bg-slate-50/90 border border-slate-200/80 rounded-xl p-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-200/80 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                        ⚖️
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-600 block uppercase tracking-wider">Weight</span>
                        <span className="text-xs font-black text-slate-900 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                          {vitals.weight ? (
                            <>
                              {vitals.weight} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">kg</span>
                            </>
                          ) : '--'}
                        </span>
                      </div>
                    </div>

                    {/* BMI Card */}
                    <div className="flex items-center gap-2 bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                        📈
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-600 block uppercase tracking-wider">BMI</span>
                        <span className="text-xs font-black text-emerald-700 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                          {vitals.bmi || '--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Collapsible Vitals Container (block md:hidden) */}
                  <div className="block md:hidden">
                    {/* Tappable Collapsed Header Container */}
                    <div
                      onClick={() => setIsMobileVitalsExpanded(prev => !prev)}
                      className="w-full flex items-center justify-between text-left py-1 px-1 cursor-pointer select-none"
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-bold text-[#3563F6] flex items-center gap-1.5">
                          🩺 Patient Vitals & Physical Metrics
                          <span className="text-slate-400 font-bold text-xs">
                            {isMobileVitalsExpanded ? '⌃' : '⌄'}
                          </span>
                        </span>
                        <span className="text-[11px] font-semibold text-slate-700 font-mono tracking-tight mt-0.5">
                          BP {vitals.bpSystolic ? `${vitals.bpSystolic}/${vitals.bpDiastolic || '--'}` : '--'} • Pulse {vitals.pulse ? `${vitals.pulse} bpm` : '--'} • Temp {vitals.temperature ? `${vitals.temperature}°F` : '--'}
                        </span>
                      </div>

                      {isMobileVitalsExpanded && !isEffectiveReadOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEditVitalsModalOpen(true);
                          }}
                          className="px-2 py-0.5 rounded bg-[#3563F6]/10 text-[#3563F6] border border-[#3563F6]/30 font-black text-[9px] uppercase shrink-0"
                        >
                          EDIT VITALS
                        </button>
                      )}
                    </div>

                    {/* Smooth Animated Expanded Vitals Grid */}
                    <AnimatePresence initial={false}>
                      {isMobileVitalsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden pt-2 border-t border-slate-100 mt-1.5"
                        >
                          <div className="grid grid-cols-3 gap-2 w-full">
                            {/* BP */}
                            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-2 text-center">
                              <span className="text-[9px] font-black text-slate-500 block uppercase">BP</span>
                              <span className="text-xs font-black text-slate-900 font-mono block">
                                {vitals.bpSystolic ? `${vitals.bpSystolic}/${vitals.bpDiastolic || '--'}` : '--'}
                              </span>
                            </div>

                            {/* Pulse */}
                            <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-2 text-center">
                              <span className="text-[9px] font-black text-slate-500 block uppercase">Pulse</span>
                              <span className="text-xs font-black text-slate-900 font-mono block">
                                {vitals.pulse ? `${vitals.pulse} bpm` : '--'}
                              </span>
                            </div>

                            {/* Temp */}
                            <div className="bg-cyan-50/70 border border-cyan-200/80 rounded-xl p-2 text-center">
                              <span className="text-[9px] font-black text-slate-500 block uppercase">Temp</span>
                              <span className="text-xs font-black text-slate-900 font-mono block">
                                {vitals.temperature ? `${vitals.temperature}°F` : '--'}
                              </span>
                            </div>

                            {/* SpO2 */}
                            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-2 text-center">
                              <span className="text-[9px] font-black text-slate-500 block uppercase">SpO₂</span>
                              <span className="text-xs font-black text-slate-900 font-mono block">
                                {vitals.spo2 ? `${vitals.spo2}%` : '--'}
                              </span>
                            </div>

                            {/* Height */}
                            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-2 text-center">
                              <span className="text-[9px] font-black text-slate-500 block uppercase">Height</span>
                              <span className="text-xs font-black text-slate-900 font-mono block">
                                {vitals.height ? `${vitals.height}cm` : '--'}
                              </span>
                            </div>

                            {/* Weight */}
                            <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-2 text-center">
                              <span className="text-[9px] font-black text-slate-500 block uppercase">Weight</span>
                              <span className="text-xs font-black text-slate-900 font-mono block">
                                {vitals.weight ? `${vitals.weight}kg` : '--'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                            <span className="text-xs font-black text-emerald-700 font-mono">
                              BMI {vitals.bmi || '--'}
                            </span>

                            {!isEffectiveReadOnly && (
                              <button
                                type="button"
                                onClick={() => setIsEditVitalsModalOpen(true)}
                                className="px-2.5 py-1 rounded bg-[#3563F6] text-white font-black text-[10px] uppercase shadow-2xs"
                              >
                                EDIT VITALS
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* 3. EXPANDED FULL-WIDTH CLINICAL WORKSPACE FORM (100% CONTAINER WIDTH) */}
                <div className="w-full bg-white border border-slate-200/90 rounded-2xl sm:rounded-3xl shadow-sm p-3 sm:p-6 md:p-8 space-y-6 sm:space-y-8 text-left font-sans overflow-hidden">

                  {/* Section A: 1. 🩺 Diagnosis Panel */}
                  <div className="space-y-4">
                    {/* Header Row: Left Title & Right Title aligned straight */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-[#2F63F2] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          1
                        </div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-[#2F63F2]">DIAGNOSIS</h3>
                      </div>
                      <span className="text-[10px] font-bold text-[#2F63F2] uppercase tracking-widest">Frequently Used Diagnoses</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                      {/* Left Column: Multi-Diagnosis Chips & Search Input */}
                      <div className="space-y-2 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 block">
                              Diagnoses {diagnoses.length > 0 && <span className="text-[#2F63F2] font-black">({diagnoses.length})</span>} <span className="text-rose-500">*</span>
                            </label>
                            {diagnoses.length > 0 && !isEffectiveReadOnly && (
                              <button
                                type="button"
                                onClick={() => setDiagnoses([])}
                                className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              >
                                Clear All
                              </button>
                            )}
                          </div>

                          {/* Removable Diagnosis Chips */}
                          {diagnoses.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 p-2 mb-2 bg-slate-50 border border-slate-200 rounded-xl max-h-48 overflow-y-auto">
                              {diagnoses.map((diag, idx) => {
                                const diagStr = String(typeof diag === 'string' ? diag : (diag?.name || '')).trim();
                                if (!diagStr) return null;
                                return (
                                  <span
                                    key={`${diagStr}-${idx}`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-[#2F63F2]/10 text-[#2F63F2] border border-[#2F63F2]/20 shadow-2xs"
                                  >
                                    <span>{diagStr}</span>
                                    {!isEffectiveReadOnly && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveDiagnosis(diagStr)}
                                        className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#2F63F2]/20 text-[#2F63F2] transition-colors cursor-pointer print:hidden"
                                        title={`Remove ${diagStr}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <div className="relative">
                            <input
                              type="text"
                              disabled={isEffectiveReadOnly}
                              className={`w-full border-b-2 border-slate-200 focus:border-[#2F63F2] px-1 py-2 text-sm font-bold text-slate-700 focus:outline-none transition-colors ${isEffectiveReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-300' : 'bg-transparent'
                                }`}
                              placeholder={isEffectiveReadOnly ? "Read-Only Case Record" : "Search or type diagnosis (e.g. Acute Gastritis, Fever...) and press Enter..."}
                              value={diagSearch}
                              onChange={(e) => setDiagSearch(e.target.value)}
                              onKeyDown={(e) => {
                                if (!isEffectiveReadOnly && e.key === 'Enter' && diagSearch.trim()) {
                                  e.preventDefault();
                                  handleAddDiagnosis(diagSearch);
                                }
                              }}
                            />

                            {subtleAddedToast && (
                              <span className="absolute right-2 top-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 animate-fade-in">
                                ✓ Added to Clinical Master
                              </span>
                            )}

                            {/* REAL-TIME DIAGNOSIS MASTER AUTOCOMPLETE DROPDOWN */}
                            {diagSearch.trim() && (
                              <div className="absolute top-[42px] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden divide-y text-xs font-sans max-h-72 overflow-y-auto">
                                <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                  <span>DIAGNOSIS MASTER</span>
                                  {isDiagSearching && <span className="text-blue-600 font-bold animate-pulse">🔍 Searching...</span>}
                                </div>

                                {/* Matching Results */}
                                {diagSearchResults.length > 0 && (
                                  <div>
                                    {diagSearchResults.map((d) => {
                                      const isSelected = (Array.isArray(diagnoses) ? diagnoses : []).some(item => {
                                        const itemStr = String(typeof item === 'string' ? item : (item?.name || '')).trim().toLowerCase();
                                        return itemStr === String(d?.name || '').trim().toLowerCase();
                                      });
                                      return (
                                        <button
                                          key={d._id || d.name}
                                          type="button"
                                          onClick={() => handleAddDiagnosis(d.name)}
                                          className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60 text-[#2F63F2] font-bold' : 'hover:bg-slate-50 text-slate-800 font-semibold'
                                            }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm">🩺</span>
                                            <div>
                                              <div className="font-extrabold text-slate-900">{d.name}</div>
                                              <div className="text-[10px] text-slate-400 font-medium">
                                                Clinical Master {d.icd10Code ? `• ICD-10: ${d.icd10Code}` : ''} {d.source === 'DOCTOR_ADDED' ? '• ✨ Recently Added' : ''}
                                              </div>
                                            </div>
                                          </div>
                                          {isSelected ? (
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-md">Selected</span>
                                          ) : (
                                            <span className="text-[10px] font-bold text-[#2F63F2] hover:underline">+ Select</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Exact Match Not Found -> Add New Option */}
                                {!diagExactMatch && diagSearch.trim() && (
                                  <div className="p-2 bg-slate-50/50">
                                    <button
                                      type="button"
                                      disabled={isAddingDiagnosis}
                                      onClick={() => handleAddDiagnosis(diagSearch)}
                                      className="w-full text-left px-3 py-2 bg-white border border-[#2F63F2]/30 hover:border-[#2F63F2] rounded-lg transition-all flex items-center justify-between cursor-pointer group shadow-2xs"
                                    >
                                      <div>
                                        <span className="font-extrabold text-[#2F63F2] group-hover:underline text-xs block">
                                          + Add "{diagSearch.trim()}"
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium block">
                                          New diagnosis master
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-extrabold bg-blue-50 text-[#2F63F2] px-2 py-1 rounded-md">
                                        {isAddingDiagnosis ? 'Adding...' : 'Add New'}
                                      </span>
                                    </button>
                                  </div>
                                )}

                                {/* Typo / "Did you mean?" suggestions */}
                                {!diagExactMatch && diagSuggestions.length > 0 && (
                                  <div className="p-2.5 bg-amber-50/40 border-t border-amber-100/80 space-y-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                      Did you mean?
                                    </div>
                                    {diagSuggestions.map((sug) => (
                                      <button
                                        key={sug._id || sug.name}
                                        type="button"
                                        onClick={() => handleAddDiagnosis(sug.name)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-amber-100/60 text-xs font-bold text-amber-900 flex items-center justify-between cursor-pointer"
                                      >
                                        <span>● {sug.name}</span>
                                        <span className="text-[10px] text-amber-700 font-mono">Clinical Master</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Dynamic Frequently Used Diagnoses & Protocol Templates Box */}
                      <div className="bg-slate-50/80 border border-slate-200 p-4 rounded-2xl print:hidden flex flex-col justify-start">
                        <div className="flex flex-wrap gap-2.5 max-h-60 overflow-y-auto pr-1">
                          {/* Dynamically fetched Frequently Used Diagnoses */}
                          {(frequentDiagnosesData && frequentDiagnosesData.length > 0
                            ? frequentDiagnosesData
                            : (Array.isArray(dlist) ? dlist : []).filter(d => d && (d.status === 'Active' || !d.status))
                          ).map((item) => {
                            if (!item) return null;
                            const name = String(item.name || item.val || '').trim();
                            if (!name) return null;
                            const isSelected = (Array.isArray(diagnoses) ? diagnoses : []).some(d => {
                              const dStr = String(typeof d === 'string' ? d : (d?.name || '')).trim().toLowerCase();
                              return dStr === name.toLowerCase();
                            });
                            const isFav = item.favorites && item.favorites.length > 0;
                            const itemKey = item._id || item.id || name;

                            return (
                              <div
                                key={itemKey}
                                className={`inline-flex items-center rounded-xl text-xs font-semibold transition-all border shadow-2xs ${isSelected
                                  ? 'bg-[#2F63F2] border-[#2F63F2] text-white shadow-xs'
                                  : 'bg-white text-slate-700 hover:text-primary border-slate-200 hover:border-primary/30 hover:bg-[#2F63F2]/5'
                                  }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEffectiveReadOnly) return;
                                    const target = name.toLowerCase();
                                    const tplMatch = (Array.isArray(dlist) ? dlist : []).find(d => d && String(d.name || '').trim().toLowerCase() === target);
                                    if (tplMatch) {
                                      handleToggleDiagnosisPreset(tplMatch);
                                    } else if (isSelected) {
                                      handleRemoveDiagnosis(name);
                                    } else {
                                      handleAddDiagnosis(name);
                                    }
                                  }}
                                  className={`px-3 py-2 flex items-center gap-1.5 font-bold ${isEffectiveReadOnly ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                                    }`}
                                >
                                  {isSelected ? (
                                    <Check className="w-3.5 h-3.5 text-white" />
                                  ) : (
                                    <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-500 fill-amber-400' : 'text-slate-300'}`} />
                                  )}
                                  <span>{name}</span>
                                </button>

                                {item._id && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isEffectiveReadOnly) return;
                                      toggleFavoriteMutation.mutate(item._id);
                                    }}
                                    className={`pr-2 py-2 hover:opacity-80 transition-opacity ${isEffectiveReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                                      } ${isSelected ? 'text-white' : 'text-slate-400'
                                      }`}
                                    title={isFav ? 'Remove favorite' : 'Add to doctor favorites'}
                                  >
                                    <Star className={`w-3 h-3 ${isFav ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 📝 Clinical Notes */}
                    <div className="pt-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 block mb-1">📝 Clinical Notes</label>
                      <textarea
                        disabled={isEffectiveReadOnly}
                        readOnly={isEffectiveReadOnly}
                        className={`w-full border border-slate-200 focus:border-primary rounded-xl p-3 text-xs font-mono text-slate-700 focus:outline-none transition-colors h-24 resize-none ${isEffectiveReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-300' : 'bg-slate-50'
                          }`}
                        placeholder={isEffectiveReadOnly ? "No clinical notes recorded." : "Enter patient complaints, clinical findings, history, doctor observations, symptoms, etc."}
                        value={clinicalNotes}
                        onChange={(e) => setClinicalNotes(formatCapitalizeWordsNoNumbers(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Section 2 (Only IPD): 2. 🩺 Clinical Assessment & Progress Notes */}
                  {isIpdConsultation && (
                    <div className="space-y-5 pt-6 border-t border-slate-100">
                      {/* Header Row matching 1, 2, etc layout */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-[#2F63F2] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                            2
                          </div>
                          <h3 className="text-xs font-bold uppercase tracking-widest text-[#2F63F2]">
                            CLINICAL ASSESSMENT & PROGRESS NOTES
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black text-[#2F63F2] bg-blue-50 border border-blue-200/80 shadow-2xs">
                            Round {activeRoundNumber}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200/80 flex items-center gap-1.5 shadow-2xs">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formattedRoundDateTime}</span>
                          </span>
                        </div>
                      </div>

                      {/* 1. Clinical Findings / Examination */}
                      <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Stethoscope className="w-4 h-4 text-[#2F63F2]" />
                            <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                              1. Clinical Findings / Examination
                            </h4>
                          </div>
                          <span className="text-[10px] sm:text-[11px] font-semibold text-[#2F63F2] bg-blue-50 border border-blue-100/90 px-3 py-0.5 rounded-full">
                            Optional
                          </span>
                        </div>

                        {/* 3 Grid Dropdowns */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-600 block pl-0.5">General Condition</label>
                            <div className="relative">
                              <select
                                disabled={isEffectiveReadOnly}
                                value={ipdGeneralCondition}
                                onChange={(e) => setIpdGeneralCondition(e.target.value)}
                                className={`w-full appearance-none border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold ${!ipdGeneralCondition ? 'text-slate-500 font-medium' : 'text-slate-700'} bg-slate-50 hover:bg-slate-100/70 focus:outline-none focus:border-[#2F63F2] cursor-pointer pr-8 ${isEffectiveReadOnly ? 'bg-slate-100 cursor-not-allowed' : ''
                                  }`}
                              >
                                <option value="" className="bg-white text-slate-500 font-medium">Select General Condition</option>
                                <option value="Stable" className="bg-white text-slate-700 font-semibold">Stable</option>
                                <option value="Improving" className="bg-white text-slate-700 font-semibold">Improving</option>
                                <option value="Fair" className="bg-white text-slate-700 font-semibold">Fair</option>
                                <option value="Serious" className="bg-white text-slate-700 font-semibold">Serious</option>
                                <option value="Worsening" className="bg-white text-slate-700 font-semibold">Worsening</option>
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-600 block pl-0.5">Consciousness</label>
                            <div className="relative">
                              <select
                                disabled={isEffectiveReadOnly}
                                value={ipdConsciousness}
                                onChange={(e) => setIpdConsciousness(e.target.value)}
                                className={`w-full appearance-none border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold ${!ipdConsciousness ? 'text-slate-500 font-medium' : 'text-slate-700'} bg-slate-50 hover:bg-slate-100/70 focus:outline-none focus:border-[#2F63F2] cursor-pointer pr-8 ${isEffectiveReadOnly ? 'bg-slate-100 cursor-not-allowed' : ''
                                  }`}
                              >
                                <option value="" className="bg-white text-slate-500 font-medium">Select Consciousness</option>
                                <option value="Alert" className="bg-white text-slate-700 font-semibold">Alert</option>
                                <option value="Drowsy" className="bg-white text-slate-700 font-semibold">Drowsy</option>
                                <option value="Confused" className="bg-white text-slate-700 font-semibold">Confused</option>
                                <option value="Unconscious" className="bg-white text-slate-700 font-semibold">Unconscious</option>
                                <option value="Sedated" className="bg-white text-slate-700 font-semibold">Sedated</option>
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-600 block pl-0.5">Pain Score</label>
                            <div className="relative">
                              <select
                                disabled={isEffectiveReadOnly}
                                value={formatPainScore(ipdPainScore)}
                                onChange={(e) => setIpdPainScore(e.target.value)}
                                className={`w-full appearance-none border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold ${!formatPainScore(ipdPainScore) ? 'text-slate-500 font-medium' : 'text-slate-700'} bg-slate-50 hover:bg-slate-100/70 focus:outline-none focus:border-[#2F63F2] cursor-pointer pr-8 ${isEffectiveReadOnly ? 'bg-slate-100 cursor-not-allowed' : ''
                                  }`}
                              >
                                <option value="" className="bg-white text-slate-500 font-medium">Select Pain Score</option>
                                <option value="0 – No Pain" className="bg-white text-slate-700 font-semibold">0 – No Pain</option>
                                <option value="1–3 – Mild" className="bg-white text-slate-700 font-semibold">1–3 – Mild</option>
                                <option value="4–6 – Moderate" className="bg-white text-slate-700 font-semibold">4–6 – Moderate</option>
                                <option value="7–10 – Severe" className="bg-white text-slate-700 font-semibold">7–10 – Severe</option>
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* 2. Assessment & Plan */}
                      <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-[#2F63F2]" />
                            <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                              2. Assessment & Plan
                            </h4>
                          </div>
                          <span className="text-[10px] sm:text-[11px] font-bold text-[#2F63F2] bg-blue-50 border border-blue-100/90 px-3 py-0.5 rounded-full shadow-2xs">
                            Required
                          </span>
                        </div>
                        <div className="relative">
                          <textarea
                            disabled={isEffectiveReadOnly}
                            readOnly={isEffectiveReadOnly}
                            rows={3}
                            maxLength={500}
                            value={ipdAssessmentPlan}
                            onChange={(e) => setIpdAssessmentPlan(formatCapitalizeWordsNoNumbers(e.target.value.slice(0, 500)))}
                            placeholder={isEffectiveReadOnly ? "No assessment & plan recorded for this round." : "Enter clinical assessment, treatment plan, progress notes..."}
                            className={`w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-700 focus:outline-none focus:border-[#2F63F2] transition-colors resize-none pb-6 ${isEffectiveReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:bg-slate-50/90'
                              }`}
                          />
                          <div className="absolute bottom-2 right-3 text-[10px] font-bold text-slate-400 pointer-events-none">
                            {ipdAssessmentPlan.length}/500
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* IPD Laboratory & Diagnostic Test Order Notice Banner */}
                  {isIpdConsultation && (
                    <div className="pt-2 font-sans">
                      {activeRoundInvestigations.length > 0 ? (
                        <div className="p-4 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-slate-50 border border-blue-200/90 rounded-2xl shadow-xs space-y-2.5">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-[#2F63F2] text-white flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                                🔬
                              </div>
                              <div>
                                <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                                  <span>Lab & Diagnostic Tests Ordered for Round {activeRoundNumber}</span>
                                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-[#2F63F2] border border-blue-300 whitespace-nowrap shadow-2xs">
                                    {activeRoundInvestigations.length} {activeRoundInvestigations.length === 1 ? 'Test' : 'Tests'}
                                  </span>
                                </h4>
                                <p className="text-[11px] text-slate-600 font-medium">
                                  {isPastRoundReadOnly
                                    ? `Doctor requested the following investigations in this completed round.`
                                    : `Active laboratory / diagnostic investigations ordered for this inpatient round.`}
                                </p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md border flex items-center gap-1 shadow-2xs ${
                              isPastRoundReadOnly
                                ? 'bg-blue-50 text-[#2F63F2] border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {isPastRoundReadOnly ? (
                                <>✓ Recorded in Round {activeRoundNumber}</>
                              ) : (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Ordered in Active Prescription
                                </>
                              )}
                            </span>
                          </div>

                          {/* Chips of ordered tests */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {activeRoundInvestigations.map((inv, idx) => (
                              <div
                                key={idx}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-slate-800 text-xs font-bold shadow-2xs"
                              >
                                <span className="text-[#2F63F2] font-black">●</span>
                                <span className="text-slate-900">{inv.name}</span>
                                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-[#2F63F2] border border-blue-200">
                                  {inv.serviceType}
                                </span>
                                {inv.price !== undefined && inv.price > 0 && (
                                  <span className="text-[10px] font-mono text-slate-400 font-semibold">
                                    ₹{inv.price}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : isPastRoundReadOnly ? (
                        <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between text-slate-600 text-xs font-semibold">
                          <span className="flex items-center gap-2">
                            <span>🔬</span>
                            <span>No Laboratory or Diagnostic Tests were requested for Round {activeRoundNumber}.</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">0 Tests</span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Section B: Prescription Pad Builder (Step 3 in IPD / Step 2 in OPD) */}
                  <div className="space-y-6 pt-6 border-t border-slate-100">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-[#3563F6] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {isIpdConsultation ? 3 : 2}
                        </div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-[#3563F6]">PRESCRIPTION PAD</h3>
                      </div>
                      {!isEffectiveReadOnly && (
                        <button
                          type="button"
                          onClick={handleAddNewBlankRow}
                          className="border-2 border-[#3563F6] text-[#3563F6] hover:bg-[#3563F6]/5 bg-white font-extrabold text-xs px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer uppercase tracking-wider print:hidden shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Medicine</span>
                        </button>
                      )}
                    </div>

                    {!isEffectiveReadOnly && (
                      <div className="flex flex-wrap items-center gap-3 text-xs text-left print:hidden pt-1">
                        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                          FREQUENTLY USED:
                        </span>
                        {['Paracetamol', 'ORS', 'Cetirizine', 'Vitamin C', 'Pantoprazole', 'Azithromycin'].map(name => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => handleAddFrequentMed(name)}
                            className="bg-white border border-slate-200 text-xs px-4 py-2 rounded-xl font-bold text-slate-700 hover:text-[#3563F6] hover:border-[#3563F6]/60 hover:shadow-xs transition-all cursor-pointer"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Prescription Medicines Pad Table matching exact Reference UI */}
                    <div className="w-full border border-slate-200/90 rounded-2xl shadow-xs bg-white overflow-hidden">

                      {/* === MOBILE CARD LAYOUT (visible below sm) === */}
                      <div className="sm:hidden">
                        {prescriptionsList.length === 0 ? (
                          <div className="text-center text-slate-400 py-8 bg-slate-50/40 font-medium text-xs">
                            {isEffectiveReadOnly ? "No medications were prescribed in this round." : "No medications added to pad. Click \"+ ADD MEDICINE\" to start."}
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {prescriptionsList.map((row, idx) => {
                              const isActive = focusedRowId === row.id;
                              return (
                                <div
                                  key={row.id}
                                  className={`p-3 space-y-2.5 transition-colors ${isActive ? 'bg-[#3563F6]/5' : ''}`}
                                  onClick={() => setFocusedRowId(row.id)}
                                >
                                  {/* Row 1: Medicine Name + Delete */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0 relative">
                                      {(() => {
                                        const rowMedName = String(row?.medicineName || '').trim().toLowerCase();
                                        const filtered = (Array.isArray(mlist) ? mlist : []).filter(m => {
                                          if (!m) return false;
                                          const mName = String(m.name || '').trim().toLowerCase();
                                          const mGen = String(m.generic || m.genericName || '').trim().toLowerCase();
                                          return (mName && mName.includes(rowMedName)) || (mGen && mGen.includes(rowMedName));
                                        });
                                        return (
                                          <>
                                            <input
                                              type="text"
                                              disabled={isEffectiveReadOnly}
                                              className={`w-full ${isEffectiveReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-300' : 'bg-slate-50 text-slate-700'} border border-slate-200 rounded-lg px-2.5 py-1.5 font-extrabold focus:outline-none focus:border-[#3563F6] text-xs`}
                                              placeholder={isEffectiveReadOnly ? "Medicine" : "Type medicine..."}
                                              value={row?.medicineName || ''}
                                              onChange={(e) => {
                                                if (!isEffectiveReadOnly) {
                                                  handleUpdatePrescriptionRow(row.id, 'medicineName', e.target.value);
                                                  setActiveSuggestionRowId(row.id);
                                                  updateCoords(e.target);
                                                }
                                              }}
                                              onFocus={(e) => {
                                                if (!isEffectiveReadOnly) {
                                                  setFocusedRowId(row.id);
                                                  setActiveSuggestionRowId(row.id);
                                                  setHighlightedIdx(0);
                                                  updateCoords(e.target);
                                                }
                                              }}
                                              onBlur={() => {
                                                setActiveSuggestionRowId(null);
                                                if (row?.medicineName && String(row.medicineName).trim().length >= 2) {
                                                  try { syncMedicineToMaster(row); } catch (_) {}
                                                }
                                              }}
                                            />
                                            {!isEffectiveReadOnly && activeSuggestionRowId === row.id && String(row?.medicineName || '').trim() && dropdownCoords && createPortal(
                                              <div
                                                style={{
                                                  position: 'absolute',
                                                  top: `${dropdownCoords.top}px`,
                                                  left: `${dropdownCoords.left}px`,
                                                  width: `${dropdownCoords.width}px`,
                                                }}
                                                className="bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] divide-y text-xs max-h-40 overflow-y-auto font-sans"
                                              >
                                                {filtered.map((m, mIdx) => (
                                                  <button
                                                    key={m.id || m._id || m.name || mIdx}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      handleAutofillPrescriptionRow(row.id, m);
                                                    }}
                                                    className="w-full text-left px-3 py-1.5 flex justify-between font-semibold hover:bg-slate-50 cursor-pointer"
                                                  >
                                                    <span>{m.name || 'Unnamed Medicine'}</span>
                                                    <span className="text-[10px] text-slate-400">({m.category || m.generic || m.genericName || 'Medicine'})</span>
                                                  </button>
                                                ))}
                                              </div>,
                                              document.body
                                            )}
                                          </>
                                        );
                                      })()}
                                    </div>
                                    {!isEffectiveReadOnly && (
                                      <div className="flex items-center gap-1 shrink-0 print:hidden">
                                        <button type="button" onClick={() => handleDuplicateRow(row)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer" title="Duplicate">
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button type="button" onClick={() => handleRemoveMedicine(idx)} className="text-rose-400 hover:text-rose-600 p-1 rounded-lg bg-rose-50/60 border border-rose-100 hover:bg-rose-100 cursor-pointer" title="Delete">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Row 2: Dose Timing pills */}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase w-10 shrink-0">Dose</span>
                                    <div className="flex items-center gap-1 flex-1">
                                      <div className="bg-slate-50 border border-slate-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shadow-2xs">
                                        <Sun className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                        <select disabled={isEffectiveReadOnly} className="bg-transparent text-[10px] font-extrabold text-slate-700 focus:outline-none cursor-pointer appearance-none text-center disabled:cursor-not-allowed" value={row.morning} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'morning', e.target.value)}>
                                          <option value="">-</option>
                                          {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                      </div>
                                      <div className="bg-slate-50 border border-slate-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shadow-2xs">
                                        <Sun className="w-2.5 h-2.5 text-orange-500 shrink-0" />
                                        <select disabled={isEffectiveReadOnly} className="bg-transparent text-[10px] font-extrabold text-slate-700 focus:outline-none cursor-pointer appearance-none text-center disabled:cursor-not-allowed" value={row.afternoon} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'afternoon', e.target.value)}>
                                          <option value="">-</option>
                                          {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                      </div>
                                      <div className="bg-slate-50 border border-slate-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shadow-2xs">
                                        <Moon className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                        <select disabled={isEffectiveReadOnly} className="bg-transparent text-[10px] font-extrabold text-slate-700 focus:outline-none cursor-pointer appearance-none text-center disabled:cursor-not-allowed" value={row.night} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'night', e.target.value)}>
                                          <option value="">-</option>
                                          {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Row 3: Duration, Qty, Food */}
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Duration</span>
                                      {(() => {
                                        const isCustom = row.isCustomDuration || (row.duration && !durations.includes(row.duration));
                                        if (isCustom) {
                                          return (
                                            <div className="flex items-center gap-1">
                                              <input
                                                disabled={isEffectiveReadOnly}
                                                type="number"
                                                min="0"
                                                placeholder="Days"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-1.5 text-center text-[10px] font-bold text-slate-700 focus:outline-none focus:border-[#3563F6] shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                value={row.customDurationDays !== undefined ? row.customDurationDays : (parseInt(row.duration) || '')}
                                                onWheel={(e) => e.target.blur()}
                                                onKeyDown={(e) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                                onChange={(e) => handleUpdatePrescriptionRow(row.id, 'customDurationDays', e.target.value)}
                                              />
                                              {!isEffectiveReadOnly && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdatePrescriptionRow(row.id, 'isCustomDuration', false)}
                                                  className="text-slate-400 hover:text-slate-600 text-[10px] font-bold px-0.5 shrink-0"
                                                  title="Switch to list"
                                                >
                                                  ✕
                                                </button>
                                              )}
                                            </div>
                                          );
                                        }
                                        return (
                                          <div className="relative">
                                            <select disabled={isEffectiveReadOnly} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 pr-5 text-[10px] font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed" value={durations.includes(row.duration) ? row.duration : (row.duration ? 'Other...' : '')} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'duration', e.target.value)}>
                                              <option value="">Select Duration</option>
                                              {durations.map(dur => <option key={dur} value={dur}>{dur}</option>)}
                                            </select>
                                            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    <div>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Qty</span>
                                      <input
                                        disabled={isEffectiveReadOnly}
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 text-center text-[10px] font-black text-slate-700 focus:outline-none focus:border-[#3563F6] shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed"
                                        value={row.quantity || ''}
                                        onWheel={(e) => e.target.blur()}
                                        onKeyDown={(e) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                        onChange={(e) => handleUpdatePrescriptionRow(row.id, 'quantity', e.target.value)}
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Food</span>
                                      <div className="relative">
                                        <select disabled={isEffectiveReadOnly} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 pr-5 text-[10px] font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed" value={row.food} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'food', e.target.value)}>
                                          <option value="">Select Food</option>
                                          {foodInstructions.map(food => <option key={food} value={food}>{food}</option>)}
                                        </select>
                                        <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* === DESKTOP TABLE LAYOUT (visible at sm+) === */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs font-sans min-w-[700px]">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-700 font-extrabold text-xs">
                              <th className="py-3.5 px-4 text-left w-[32%]">Medicine</th>
                              <th className="py-3.5 px-2 text-center w-[24%]">Dose & Timing</th>
                              <th className="py-3.5 px-2 text-left w-[16%]">Duration</th>
                              <th className="py-3.5 px-2 text-center w-[10%]">Qty</th>
                              <th className="py-3.5 px-2 text-left w-[12%]">Food</th>
                              <th className="py-3.5 px-3 text-right w-[6%] print:hidden">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prescriptionsList.map((row, idx) => {
                              const isActive = focusedRowId === row.id;
                              return (
                                <tr
                                  key={row.id}
                                  className={`border-b border-slate-100 transition-colors ${isActive ? 'bg-[#3563F6]/5' : 'hover:bg-slate-50/60'}`}
                                  onClick={() => setFocusedRowId(row.id)}
                                >
                                  {/* Medicine Name Cell */}
                                  <td className="py-3 px-4 relative">
                                    {(() => {
                                      const rowMedName = String(row?.medicineName || '').trim().toLowerCase();
                                      const filtered = (Array.isArray(mlist) ? mlist : []).filter(m => {
                                        if (!m) return false;
                                        const mName = String(m.name || '').trim().toLowerCase();
                                        const mGen = String(m.generic || m.genericName || '').trim().toLowerCase();
                                        return (mName && mName.includes(rowMedName)) || (mGen && mGen.includes(rowMedName));
                                      });
                                      return (
                                        <>
                                          <input
                                            type="text"
                                            disabled={isEffectiveReadOnly}
                                            className={`w-full border-none font-extrabold text-slate-900 focus:outline-none text-xs ${isEffectiveReadOnly ? 'bg-transparent cursor-not-allowed text-slate-700' : 'bg-transparent'
                                              }`}
                                            placeholder={isEffectiveReadOnly ? "Medicine" : "Type medicine..."}
                                            value={row?.medicineName || ''}
                                            onChange={(e) => {
                                              if (!isEffectiveReadOnly) {
                                                handleUpdatePrescriptionRow(row.id, 'medicineName', e.target.value);
                                                setActiveSuggestionRowId(row.id);
                                                updateCoords(e.target);
                                              }
                                            }}
                                            onFocus={(e) => {
                                              if (!isEffectiveReadOnly) {
                                                setFocusedRowId(row.id);
                                                setActiveSuggestionRowId(row.id);
                                                setHighlightedIdx(0);
                                                updateCoords(e.target);
                                              }
                                            }}
                                            onBlur={() => {
                                              setActiveSuggestionRowId(null);
                                              if (row?.medicineName && String(row.medicineName).trim().length >= 2) {
                                                try { syncMedicineToMaster(row); } catch (_) {}
                                              }
                                            }}
                                          />
                                          {!isEffectiveReadOnly && activeSuggestionRowId === row.id && String(row?.medicineName || '').trim() && dropdownCoords && createPortal(
                                            <div
                                              style={{
                                                position: 'absolute',
                                                top: `${dropdownCoords.top}px`,
                                                left: `${dropdownCoords.left}px`,
                                                width: `${dropdownCoords.width}px`,
                                              }}
                                              className="bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] divide-y text-xs max-h-40 overflow-y-auto font-sans"
                                            >
                                              {filtered.map((m, mIdx) => (
                                                <button
                                                  key={m.id || m._id || m.name || mIdx}
                                                  type="button"
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    handleAutofillPrescriptionRow(row.id, m);
                                                  }}
                                                  className="w-full text-left px-3 py-1.5 flex justify-between font-semibold hover:bg-slate-50 cursor-pointer"
                                                >
                                                  <span>{m.name || 'Unnamed Medicine'}</span>
                                                  <span className="text-[10px] text-slate-400">({m.category || m.generic || m.genericName || 'Medicine'})</span>
                                                </button>
                                              ))}
                                            </div>,
                                            document.body
                                          )}
                                        </>
                                      );
                                    })()}
                                  </td>

                                  {/* Dose & Timing Cell */}
                                  <td className="py-3 px-2">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <div className="bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 flex items-center justify-center gap-1 shadow-2xs shrink-0">
                                        <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                                        <select disabled={isEffectiveReadOnly} className="bg-transparent text-xs font-extrabold text-slate-700 focus:outline-none cursor-pointer appearance-none text-center pr-0.5 disabled:cursor-not-allowed" value={row.morning} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'morning', e.target.value)}>
                                          <option value="">-</option>
                                          {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                      </div>
                                      <div className="bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 flex items-center justify-center gap-1 shadow-2xs shrink-0">
                                        <Sun className="w-3 h-3 text-orange-500 shrink-0" />
                                        <select disabled={isEffectiveReadOnly} className="bg-transparent text-xs font-extrabold text-slate-700 focus:outline-none cursor-pointer appearance-none text-center pr-0.5 disabled:cursor-not-allowed" value={row.afternoon} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'afternoon', e.target.value)}>
                                          <option value="">-</option>
                                          {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                      </div>
                                      <div className="bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 flex items-center justify-center gap-1 shadow-2xs shrink-0">
                                        <Moon className="w-3 h-3 text-indigo-500 shrink-0" />
                                        <select disabled={isEffectiveReadOnly} className="bg-transparent text-xs font-extrabold text-slate-700 focus:outline-none cursor-pointer appearance-none text-center pr-0.5 disabled:cursor-not-allowed" value={row.night} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'night', e.target.value)}>
                                          <option value="">-</option>
                                          {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Duration Cell */}
                                  <td className="py-3 px-2">
                                    {(() => {
                                      const isCustom = row.isCustomDuration || (row.duration && !durations.includes(row.duration));
                                      if (isCustom) {
                                        return (
                                          <div className="flex items-center gap-1">
                                            <input
                                              disabled={isEffectiveReadOnly}
                                              type="number"
                                              min="0"
                                              placeholder="Days"
                                              className="w-16 bg-slate-50 border border-slate-200 rounded-full py-1.5 px-2 text-center text-xs font-bold text-slate-700 focus:outline-none focus:border-[#3563F6] shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed"
                                              value={row.customDurationDays !== undefined ? row.customDurationDays : (parseInt(row.duration) || '')}
                                              onWheel={(e) => e.target.blur()}
                                              onKeyDown={(e) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                              onChange={(e) => handleUpdatePrescriptionRow(row.id, 'customDurationDays', e.target.value)}
                                            />
                                            <span className="text-[10px] font-bold text-slate-500">Days</span>
                                            {!isEffectiveReadOnly && (
                                              <button
                                                type="button"
                                                onClick={() => handleUpdatePrescriptionRow(row.id, 'isCustomDuration', false)}
                                                className="text-slate-400 hover:text-slate-600 text-[10px] font-bold px-1 cursor-pointer"
                                                title="Switch to list"
                                              >
                                                ✕
                                              </button>
                                            )}
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="relative inline-block w-full min-w-[110px]">
                                          <select disabled={isEffectiveReadOnly} className="w-full bg-slate-50 border border-slate-200 rounded-full py-1.5 px-3.5 pr-7 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed" value={durations.includes(row.duration) ? row.duration : (row.duration ? 'Other...' : '')} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'duration', e.target.value)}>
                                            <option value="">Select Duration</option>
                                            {durations.map(dur => <option key={dur} value={dur}>{dur}</option>)}
                                          </select>
                                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        </div>
                                      );
                                    })()}
                                  </td>

                                  {/* Qty Cell */}
                                  <td className="py-3 px-2 text-center">
                                    <input
                                      disabled={isEffectiveReadOnly}
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-14 bg-slate-50 border border-slate-200 rounded-full py-1.5 text-center text-xs font-black text-slate-700 focus:outline-none focus:border-[#3563F6] shadow-2xs mx-auto disabled:bg-slate-100 disabled:cursor-not-allowed"
                                      value={row.quantity || ''}
                                      onWheel={(e) => e.target.blur()}
                                      onKeyDown={(e) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                      onChange={(e) => handleUpdatePrescriptionRow(row.id, 'quantity', e.target.value)}
                                    />
                                  </td>

                                  {/* Food Cell */}
                                  <td className="py-3 px-2">
                                    <div className="relative inline-block w-full min-w-[120px]">
                                      <select disabled={isEffectiveReadOnly} className="w-full bg-slate-50 border border-slate-200 rounded-full py-1.5 px-3.5 pr-7 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed" value={row.food} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'food', e.target.value)}>
                                        <option value="">Select Food</option>
                                        {foodInstructions.map(food => <option key={food} value={food}>{food}</option>)}
                                      </select>
                                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                  </td>

                                  {/* Action Buttons Cell */}
                                  <td className="py-3 px-3 text-right print:hidden">
                                    {!isEffectiveReadOnly && (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button type="button" onClick={() => handleDuplicateRow(row)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" title="Duplicate Medicine">
                                          <Copy className="w-4 h-4" />
                                        </button>
                                        <button type="button" onClick={() => handleRemoveMedicine(idx)} className="text-rose-400 hover:text-rose-600 p-1.5 rounded-lg bg-rose-50/60 border border-rose-100 hover:bg-rose-100 transition-colors cursor-pointer" title="Delete Row">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}

                            {prescriptionsList.length === 0 && (
                              <tr>
                                <td colSpan="6" className="text-center text-slate-400 py-8 bg-slate-50/40 font-medium">
                                  {isEffectiveReadOnly
                                    ? "No medications were prescribed in this round."
                                    : "No medications added to pad. Click \"+ ADD MEDICINE\" to start."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Table Footer Summary Bar */}
                      <div className="bg-[#E6F4EA] border-t border-emerald-200/80 px-3 sm:px-5 py-2.5 sm:py-3 rounded-b-2xl flex items-center justify-between font-extrabold text-emerald-900 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-2xs">
                            ✓
                          </div>
                          <span>Total medicines: {(Array.isArray(prescriptionsList) ? prescriptionsList : []).filter(p => p && String(p.medicineName || '').trim()).length}</span>
                        </div>
                        <div className="text-emerald-900 font-extrabold">
                          Total quantity: {(Array.isArray(prescriptionsList) ? prescriptionsList : []).reduce((acc, p) => acc + (parseInt(p?.quantity) || 0), 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 (or 4 for IPD) & Step 4 (or 5 for IPD) Two-Column UI Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                    {/* Step 4 for IPD / Step 3 for OPD: Next Clinical Review / Follow-up */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-[#2F63F2] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {isIpdConsultation ? 4 : 3}
                          </div>
                          <h3 className="text-xs font-bold uppercase tracking-widest text-[#2F63F2]">
                            {isIpdConsultation ? 'NEXT CLINICAL REVIEW' : 'FOLLOW-UP'}
                          </h3>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-slate-700 select-none">
                            {isIpdConsultation ? 'Schedule Next Review' : 'Schedule Follow-up'}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            disabled={isEffectiveReadOnly}
                            aria-checked={followupRequired}
                            onClick={() => {
                              if (isEffectiveReadOnly) return;
                              const nextState = !followupRequired;
                              setFollowupRequired(nextState);
                              if (!nextState) {
                                setFollowupDate('');
                                setFollowupReason('');
                              } else if (isIpdConsultation) {
                                setFollowupDate('');
                              }
                            }}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${followupRequired ? 'bg-[#2563EB]' : 'bg-slate-200'
                              } ${isEffectiveReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${followupRequired ? 'translate-x-5' : 'translate-x-0'
                              }`} />
                          </button>
                        </div>
                      </div>

                      {followupRequired && (
                        <div className="space-y-4 items-start pt-1">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-600 block">
                              {isIpdConsultation ? 'Next Review Date' : 'Next Visit Date'}
                            </label>
                            <input
                              type="date"
                              disabled={isEffectiveReadOnly}
                              className="w-full bg-slate-50 border border-slate-200 focus:border-[#2F63F2] rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed"
                              value={followupDate}
                              onChange={(e) => setFollowupDate(e.target.value)}
                            />
                            {!isEffectiveReadOnly && (
                              <div className="flex gap-1.5 flex-wrap pt-1">
                                {(isIpdConsultation ? [3, 6, 9, 12, 16] : [3, 7, 15, 30]).map(days => {
                                  const targetDateStr = (() => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + days);
                                    return d.toISOString().split('T')[0];
                                  })();
                                  const isSelected = Boolean(followupDate) && followupDate === targetDateStr;
                                  return (
                                    <button
                                      key={days}
                                      type="button"
                                      onClick={() => {
                                        if (isEffectiveReadOnly) return;
                                        if (followupDate === targetDateStr) {
                                          setFollowupDate('');
                                        } else {
                                          handleApplyPresetFollowup(days);
                                        }
                                      }}
                                      className={`px-3 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-[#2F63F2] text-white border-[#2F63F2] shadow-xs'
                                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {isIpdConsultation ? `${days} Days` : `+${days} Days`}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-600 block">
                              {isIpdConsultation ? 'Review Note (Optional)' : 'Follow-up Note (Optional)'}
                            </label>
                            <textarea
                              disabled={isEffectiveReadOnly}
                              readOnly={isEffectiveReadOnly}
                              className="w-full bg-slate-50 border border-slate-200 focus:border-[#2F63F2] rounded-xl p-3 text-xs text-slate-700 focus:outline-none h-24 resize-none font-normal shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed"
                              placeholder={
                                isEffectiveReadOnly
                                  ? (isIpdConsultation ? "No review note." : "No follow-up note.")
                                  : (isIpdConsultation ? "e.g. Daily inpatient review, check vitals & labs" : "e.g. Review after 5 days with reports")
                              }
                              value={followupReason}
                              onChange={(e) => setFollowupReason(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 5 for IPD / Step 4 for OPD: Advanced Options */}
                    <div className="space-y-3 font-sans">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-[#2F63F2] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {isIpdConsultation ? 5 : 4}
                        </div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-[#2F63F2]">ADVANCED OPTIONS</h3>
                      </div>

                      <div className="space-y-3">
                        {/* Card 1: Laboratory & Diagnostic Investigations */}
                        <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
                          <button
                            type="button"
                            onClick={() => setIsInvestigationExpanded(!isInvestigationExpanded)}
                            className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 font-bold text-slate-800 bg-slate-50/70 hover:bg-slate-50 transition-colors text-xs border-none focus:outline-none cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="truncate">🔬 Laboratory & Diagnostic Investigations</span>
                              {(checkedInvestigations.length > 0 || customInvestigation || activeRoundInvestigations.length > 0) && (
                                <span className="bg-blue-50 text-[#2F63F2] border border-blue-200 text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0 shadow-2xs">
                                  {(() => {
                                    const testCount = activeRoundInvestigations.length > 0
                                      ? activeRoundInvestigations.length
                                      : (checkedInvestigations.length + (customInvestigation ? 1 : 0));
                                    return `${testCount} ${testCount === 1 ? 'Test' : 'Tests'}`;
                                  })()}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold shrink-0 ml-auto pl-2">
                              {isInvestigationExpanded ? 'Collapse' : 'Expand'}
                            </span>
                          </button>

                          {isInvestigationExpanded && (
                            <div className="p-5 border-t border-slate-100 space-y-4">
                              {!isLabEnabled && !isRadEnabled ? (
                                <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400 font-medium">
                                  No diagnostic modules (Laboratory / Radiology) are enabled for this hospital.
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {/* Laboratory Section */}
                                  {isLabEnabled && (
                                    <div className="space-y-2">
                                      <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                          Laboratory Investigations {activeLabServices.length > 0 && `(${activeLabServices.length})`}
                                        </span>
                                      </span>

                                      {activeLabServices.length > 0 ? (
                                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 p-3.5 bg-purple-50/30 border border-purple-100 rounded-xl max-h-[180px] overflow-y-auto">
                                          {activeLabServices.map((srv) => {
                                            const isChecked = checkedInvestigations.includes(srv.name);
                                            return (
                                              <label key={srv._id} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none hover:text-purple-700 transition-colors">
                                                <input
                                                  disabled={isEffectiveReadOnly}
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={() => !isEffectiveReadOnly && toggleInvestigation(srv.name)}
                                                  className="rounded border-slate-300 text-[#2F63F2] shrink-0 disabled:cursor-not-allowed"
                                                />
                                                <span className="whitespace-normal leading-snug" title={srv.name}>
                                                  {srv.name} {srv.price ? <span className="text-[10px] text-slate-400 font-mono font-semibold ml-0.5">₹{srv.price}</span> : null}
                                                </span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <p className="text-[11px] text-slate-400 italic pl-1">No active laboratory investigations configured.</p>
                                      )}
                                    </div>
                                  )}

                                  {/* Radiology Section */}
                                  {isRadEnabled && (
                                    <div className="space-y-2 pt-2 border-t border-slate-100">
                                      <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                          Radiology & Imaging {activeRadServices.length > 0 && `(${activeRadServices.length})`}
                                        </span>
                                      </span>

                                      {activeRadServices.length > 0 ? (
                                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 p-3.5 bg-amber-50/30 border border-amber-100 rounded-xl max-h-[180px] overflow-y-auto">
                                          {activeRadServices.map((srv) => {
                                            const isChecked = checkedInvestigations.includes(srv.name);
                                            return (
                                              <label key={srv._id} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none hover:text-amber-700 transition-colors">
                                                <input
                                                  disabled={isEffectiveReadOnly}
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={() => !isEffectiveReadOnly && toggleInvestigation(srv.name)}
                                                  className="rounded border-slate-300 text-[#2F63F2] shrink-0 disabled:cursor-not-allowed"
                                                />
                                                <span className="whitespace-normal leading-snug" title={srv.name}>
                                                  {srv.name} {srv.price ? <span className="text-[10px] text-slate-400 font-mono font-semibold ml-0.5">₹{srv.price}</span> : null}
                                                </span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <p className="text-[11px] text-slate-400 italic pl-1">No active radiology services configured.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              <textarea
                                disabled={isEffectiveReadOnly}
                                readOnly={isEffectiveReadOnly}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2F63F2] rounded-xl p-3 text-xs text-slate-700 focus:outline-none transition-colors h-16 resize-none font-normal disabled:bg-slate-100 disabled:cursor-not-allowed"
                                placeholder={isEffectiveReadOnly ? "No custom tests requested." : "Enter custom laboratory tests or scans requests here (e.g. MRI Scan, CT Brain)..."}
                                value={customInvestigation}
                                onChange={(e) => setCustomInvestigation(e.target.value)}
                              />
                              {/* Live service match preview */}
                              {customInvestigation.trim() && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {customInvestigation.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).map((customName, idx) => {
                                    const matched = resolveHospitalService(customName, hospitalServices);
                                    if (matched) {
                                      const sType = matched.serviceType || (isLikelyRadiology(matched.name) ? 'Radiology' : 'Laboratory');
                                      return (
                                        <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                          ✓ Available: <strong>{matched.name}</strong> ({sType}) — <strong className="font-mono">₹{matched.price}</strong>
                                        </span>
                                      );
                                    }
                                    return (
                                      <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                        📋 Other Order: <strong>{customName}</strong> (₹0)
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Card 2: Advice Guidelines */}
                        <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
                          <button
                            type="button"
                            onClick={() => setIsAdviceExpanded(!isAdviceExpanded)}
                            className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 font-bold text-slate-800 bg-slate-50/70 hover:bg-slate-50 transition-colors text-xs border-none focus:outline-none cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="truncate">💡 Advice Guidelines & Instructions</span>
                              {checkedAdvice.length > 0 ? (
                                <span className="bg-blue-50 text-[#2F63F2] border border-blue-200 text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0 shadow-2xs">
                                  {checkedAdvice.length} Selected
                                </span>
                              ) : (customAdvice && customAdvice.trim()) ? (
                                <span className="bg-blue-50 text-[#2F63F2] border border-blue-200 text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0 shadow-2xs">
                                  Custom Note
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold shrink-0 ml-auto pl-2">{isAdviceExpanded ? 'Collapse' : 'Expand'}</span>
                          </button>

                          {isAdviceExpanded && (
                            <div className="p-5 border-t border-slate-100 space-y-4">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Advice Guidelines</span>
                              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 p-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl max-h-[180px] overflow-y-auto">
                                {adviceList.map((adv, idx) => {
                                  const isChecked = checkedAdvice.includes(adv);
                                  return (
                                    <label key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
                                      <input disabled={isEffectiveReadOnly} type="checkbox" checked={isChecked} onChange={() => !isEffectiveReadOnly && toggleAdvice(adv)} className="rounded border-slate-300 text-[#2F63F2] shrink-0 disabled:cursor-not-allowed" />
                                      <span className="whitespace-normal leading-snug">{adv}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <textarea
                                disabled={isEffectiveReadOnly}
                                readOnly={isEffectiveReadOnly}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2F63F2] rounded-xl p-3 text-xs text-slate-700 focus:outline-none transition-colors h-20 resize-none font-normal disabled:bg-slate-100 disabled:cursor-not-allowed"
                                placeholder={isEffectiveReadOnly ? "No custom advice." : "Write custom advice guidelines for patient here..."}
                                value={customAdvice}
                                onChange={(e) => setCustomAdvice(e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 5: Clinical Review Rounds & Final Completion Toolbar (Bottom of Workspace for IPD) */}
                  <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3.5 print:hidden flex-wrap">
                    {isIpdConsultation ? (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-3 w-full xl:w-auto flex-wrap">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#3563F6] animate-pulse" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                            <Stethoscope className="w-3.5 h-3.5 text-[#3563F6]" />
                            Clinical Review Rounds
                          </h4>
                        </div>

                        {/* Completed Rounds Counter Badge */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200/80 text-[11px] font-black text-indigo-800 shrink-0 shadow-2xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>
                            {ipdCompletedReviews === 0
                              ? 'Round 1 • First Review (0 Completed)'
                              : `${ipdCompletedReviews} Completed ${ipdCompletedReviews === 1 ? 'Round' : 'Rounds'}`}
                          </span>
                        </div>

                        {/* Clinical Review Rounds Switcher (Before Rounds & Current Round) */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl w-full sm:w-auto shrink-0 shadow-2xs overflow-x-auto">
                          {(Array.isArray(availableRoundNumbers) && availableRoundNumbers.length > 0 ? availableRoundNumbers : [1]).map((roundNum) => {
                            const isActive = activeRoundNumber === roundNum;
                            const roundData = (roundsDataMap || {})[roundNum];
                            const isRoundPastOrSaved = Boolean(
                              isIpdConsultation && (
                                roundNum <= ipdCompletedReviews ||
                                roundData?.isSaved === true
                              )
                            );
                            const isCurrentActiveRound = roundNum === currentConsultationRoundNumber;
                            return (
                              <button
                                key={roundNum}
                                type="button"
                                onClick={() => handleSwitchRound(roundNum)}
                                className={`px-3 py-1.5 text-center text-[11px] font-black rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${isActive
                                  ? 'bg-[#2F63F2] text-white shadow-2xs'
                                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                  }`}
                              >
                                <span>Round {roundNum}</span>
                                {isRoundPastOrSaved ? (
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isActive
                                      ? 'bg-white/20 text-white'
                                      : 'bg-emerald-100 text-emerald-700'
                                      }`}
                                    title="Before Clinical Review Round (Recorded • Read-Only)"
                                  >
                                    Recorded
                                  </span>
                                ) : isCurrentActiveRound ? (
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isActive
                                      ? 'bg-amber-400 text-amber-950'
                                      : 'bg-amber-100 text-amber-800'
                                      }`}
                                    title="Current Active Clinical Review Round"
                                  >
                                    Current
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>

                        {/* Active Round Status Pill */}
                        <div className="flex items-center gap-2 sm:pl-3 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto shrink-0 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Round <strong className="text-slate-900">{activeRoundNumber}</strong>
                          </span>
                          {isPastRoundReadOnly ? (
                            <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap shadow-2xs">
                              <Eye className="w-3 h-3 text-indigo-600" />
                              Recorded Consultation (Read-Only)
                            </span>
                          ) : (
                            <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap shadow-2xs">
                              ✍️ Current Active Consultation
                            </span>
                          )}
                          {roundsDataMap && roundsDataMap[activeRoundNumber]?.reviewDate && (
                            <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80 whitespace-nowrap">
                              {new Date(roundsDataMap[activeRoundNumber].reviewDate).toLocaleDateString('en-GB')}
                            </span>
                          )}
                          {activeRoundInvestigations.length > 0 && (
                            <span className="text-[10px] font-extrabold text-[#2F63F2] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap shadow-2xs">
                              🔬 {activeRoundInvestigations.length} {activeRoundInvestigations.length === 1 ? 'Test' : 'Tests'}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Outpatient (OPD) Consultation Status Banner */
                      <div className="flex items-center gap-2.5 w-full xl:w-auto flex-wrap">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                            <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                            Outpatient Consultation (OPD)
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200/80 text-[11px] font-bold text-[#3563F6] shrink-0">
                          <span>Token #{appointment?.tokenNumber || appointment?.tokenNo || '01'}</span>
                          <span className="text-slate-300">•</span>
                          <span>General OPD</span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                          Single visit consultation. Complete consultation below to record diagnosis and prescription.
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-start xl:justify-end gap-2 sm:gap-2.5 shrink-0 w-full xl:w-auto flex-wrap pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-200/70">
                      {!isEffectiveReadOnly && (
                        <Button
                          onClick={() => {
                            const currentSnapshot = getCurrentRoundSnapshot();
                            const updatedMap = {
                              ...roundsDataMap,
                              [activeRoundNumber]: {
                                ...(roundsDataMap[activeRoundNumber] || {}),
                                ...currentSnapshot,
                                roundNumber: activeRoundNumber,
                                isExplicitDraft: true
                              }
                            };
                            setRoundsDataMap(updatedMap);

                            const draftObj = {
                              ...currentSnapshot,
                              activeRoundNumber,
                              availableRoundNumbers,
                              roundsDataMap: updatedMap
                            };
                            localStorage.setItem(`consult_draft_${consultationId}`, JSON.stringify(draftObj));
                            try {
                              localStorage.setItem(`consult_rounds_${consultationId}`, JSON.stringify({
                                activeRoundNumber,
                                availableRoundNumbers,
                                roundsDataMap: updatedMap
                              }));
                            } catch (_) { }
                            setDraftSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                            toast.success(isIpdConsultation
                              ? `Round ${activeRoundNumber} draft saved successfully!`
                              : 'Consultation draft saved successfully!'
                            );
                          }}
                          variant="outline"
                          icon={Save}
                          className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider h-8 sm:h-9 border-slate-300 text-slate-700 hover:bg-white cursor-pointer px-2.5 sm:px-3.5"
                        >
                          <span className="hidden sm:inline">Save Draft</span>
                          <span className="sm:hidden">Draft</span>
                        </Button>
                      )}

                      <Button
                        onClick={handleEnginePrint}
                        variant="outline"
                        icon={Printer}
                        className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider h-8 sm:h-9 border-slate-300 text-slate-700 hover:bg-white cursor-pointer px-2.5 sm:px-3.5"
                      >
                        <span className="hidden sm:inline">Print Prescription</span>
                        <span className="sm:hidden">Print</span>
                      </Button>

                      {isReadOnly ? (
                        <Button
                          onClick={handleBackToDashboard}
                          variant="primary"
                          className="text-xs font-extrabold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white h-9 shadow-xs cursor-pointer px-4"
                        >
                          {isIpdConsultation ? 'Back to Inpatients' : 'Back to Dashboard'}
                        </Button>
                      ) : isPastRoundReadOnly ? (
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleSwitchRound(currentConsultationRoundNumber)}
                            variant="primary"
                            icon={ArrowRight}
                            className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-[#3563F6] hover:bg-blue-700 text-white h-8 sm:h-9 shadow-md cursor-pointer px-3 sm:px-4 flex-1 sm:flex-none"
                          >
                            <span>Switch to Current Round ({currentConsultationRoundNumber}) to Prescribe</span>
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={handleSubmitConsultation}
                          variant="primary"
                          icon={Send}
                          className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-[#3563F6] hover:bg-blue-700 text-white h-8 sm:h-9 shadow-md cursor-pointer disabled:opacity-50 px-3 sm:px-4 flex-1 sm:flex-none"
                          loading={completeConsultationMutation.isPending}
                          disabled={completeConsultationMutation.isPending}
                        >
                          <span className="hidden sm:inline">Complete Consultation</span>
                          <span className="sm:hidden">Complete</span>
                        </Button>
                      )}
                    </div>
                  </div>

                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* EDIT VITALS MODAL */}
          <Modal
            isOpen={isEditVitalsModalOpen}
            onClose={() => setIsEditVitalsModalOpen(false)}
            title="Edit Patient Vitals & Physical Examination"
          >
            <div className="space-y-4 text-left font-sans text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-1 min-w-0">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">BP Systolic (mmHg)</label>
                  <input type="text" className="enterprise-input" value={vitals.bpSystolic} onChange={(e) => setVitals({ ...vitals, bpSystolic: e.target.value })} placeholder="e.g. 120" />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">BP Diastolic (mmHg)</label>
                  <input type="text" className="enterprise-input" value={vitals.bpDiastolic} onChange={(e) => setVitals({ ...vitals, bpDiastolic: e.target.value })} placeholder="e.g. 80" />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">Pulse (bpm)</label>
                  <input type="text" className="enterprise-input" value={vitals.pulse} onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })} placeholder="e.g. 72" />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">Temperature (°F)</label>
                  <input type="text" className="enterprise-input" value={vitals.temperature} onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })} placeholder="e.g. 98.6" />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">SpO₂ (%)</label>
                  <input type="text" className="enterprise-input" value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} placeholder="e.g. 98" />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">Height (cm)</label>
                  <input type="text" className="enterprise-input" value={vitals.height} onChange={(e) => setVitals({ ...vitals, height: e.target.value })} placeholder="e.g. 165" />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">Weight (kg)</label>
                  <input type="text" className="enterprise-input" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} placeholder="e.g. 60" />
                </div>
                <div className="space-y-1 min-w-0 col-span-2 sm:col-span-1">
                  <label className="font-extrabold text-[10px] uppercase text-slate-500">Calculated BMI</label>
                  <div className="h-10 border border-slate-200 rounded-xl px-3 bg-slate-50 flex items-center font-extrabold font-mono text-[#3563F6]">
                    {vitals.bmi ? `${vitals.bmi} kg/m²` : '--'}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const initV = (appointment?.vitals && Object.values(appointment.vitals).some(Boolean)) ? appointment.vitals : {};
                    setVitals({
                      bpSystolic: initV.bpSystolic ? String(initV.bpSystolic) : '',
                      bpDiastolic: initV.bpDiastolic ? String(initV.bpDiastolic) : '',
                      pulse: initV.pulse ? String(initV.pulse) : '',
                      temperature: initV.temperature ? String(initV.temperature) : '',
                      RR: initV.RR ? String(initV.RR) : '',
                      weight: initV.weight ? String(initV.weight) : '',
                      height: initV.height ? String(initV.height) : '',
                      spo2: initV.spo2 ? String(initV.spo2) : '',
                      bmi: initV.bmi ? String(initV.bmi) : ''
                    });
                    toast.success('Reset vitals to token intake values');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Reset Vitals
                </button>

                <Button
                  onClick={async () => {
                    const targetId = appointment?._id || consultationId;
                    if (!targetId) return;
                    setIsSavingVitals(true);
                    try {
                      await api.put(`/operations/appointments/${targetId}/vitals`, { vitals });

                      // Synchronize with active round map and consultation state
                      setRoundsDataMap(prev => ({
                        ...prev,
                        [activeRoundNumber]: {
                          ...(prev[activeRoundNumber] || {}),
                          vitals: { ...vitals }
                        }
                      }));

                      // Update localStorage rounds draft
                      try {
                        const savedRounds = JSON.parse(localStorage.getItem(`consult_rounds_${consultationId}`) || '{}');
                        if (savedRounds?.roundsDataMap) {
                          savedRounds.roundsDataMap[activeRoundNumber] = {
                            ...(savedRounds.roundsDataMap[activeRoundNumber] || {}),
                            vitals: { ...vitals }
                          };
                          localStorage.setItem(`consult_rounds_${consultationId}`, JSON.stringify(savedRounds));
                        }
                      } catch (_) { }

                      toast.success('Vitals updated successfully!');
                      queryClient.invalidateQueries(['appointmentConsultationWorkspace', consultationId]);
                      queryClient.invalidateQueries(['ipd-admissions']);
                      queryClient.invalidateQueries(['ipdAdmissions']);
                      setIsEditVitalsModalOpen(false);
                    } catch (err) {
                      // Fallback: If network had an issue, keep the vitals in consultation state
                      setRoundsDataMap(prev => ({
                        ...prev,
                        [activeRoundNumber]: {
                          ...(prev[activeRoundNumber] || {}),
                          vitals: { ...vitals }
                        }
                      }));
                      toast.success('Vitals saved to consultation workspace!');
                      setIsEditVitalsModalOpen(false);
                    } finally {
                      setIsSavingVitals(false);
                    }
                  }}
                  loading={isSavingVitals}
                  variant="primary"
                  className="text-xs font-bold uppercase tracking-wider bg-[#3563F6] hover:bg-blue-700 text-white cursor-pointer"
                >
                  Save Vitals
                </Button>
              </div>
            </div>
          </Modal>

          {/* Patient History Slide-Over Right Drawer */}
          <PatientHistoryDrawer
            isOpen={isHistoryDrawerOpen}
            onClose={() => setIsHistoryDrawerOpen(false)}
            patient={appointment?.patientId}
            patientHistory={effectivePatientHistory || patientHistory}
            onCopyPrescription={(rxItems) => {
              const safeItems = Array.isArray(rxItems) ? rxItems : [];
              const formattedMeds = safeItems.map(item => ({
                id: String(Date.now() + Math.random()),
                medicineName: String(item?.medicineName || item?.name || ''),
                morning: item?.morning || '1',
                afternoon: item?.afternoon || '0',
                night: item?.night || '1',
                duration: item?.duration || '5 Days',
                food: normalizeFoodTiming(item?.instructions || item?.foodTiming || item?.food || getDefaultFoodTimingForMedicine(item?.medicineName || item?.name)),
                quantity: item?.quantity || 10,
                remarks: item?.notes || ''
              }));
              setPrescriptionsList(prev => [...(Array.isArray(prev) ? prev : []).filter(p => p && String(p.medicineName || '').trim()), ...formattedMeds]);
              toast.success(`${formattedMeds.length} medicines copied to prescription pad!`);
              setIsHistoryDrawerOpen(false);
            }}
          />

          {/* Modals */}
          {/* 5a. Medical History Modal */}
          <Modal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} title="📋 Patient Historical Consultation Timeline">
            <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 text-left">
              {patientHistory?.consultations?.map((visit, idx) => (
                <div key={idx} className="p-4 bg-slate-50 border rounded-2xl space-y-2 text-xs font-mono">
                  <div className="flex justify-between font-bold text-slate-500 border-b pb-1.5">
                    <span>Date: {new Date(visit.createdAt).toLocaleDateString()}</span>
                    <span>Doctor: {formatDoctorDisplayName(visit.doctorId?.name, 'N/A')}</span>
                  </div>
                  <p><strong>Diagnosis:</strong> <span className="text-primary font-bold">{visit.diagnosis}</span></p>
                  {visit.chiefComplaint && <p><strong>Chief Complaint:</strong> {visit.chiefComplaint}</p>}
                  {visit.clinicalNotes && <p><strong>Notes:</strong> {visit.clinicalNotes}</p>}
                  {visit.advice && <p><strong>Advice:</strong> {visit.advice}</p>}
                </div>
              ))}
              {(!patientHistory?.consultations || patientHistory.consultations.length === 0) && (
                <p className="text-center py-6 text-slate-400 font-mono text-xs">No historical visit files registered for this outpatient.</p>
              )}
            </div>
          </Modal>

          {/* 5b. Old Prescriptions Modal */}
          <Modal isOpen={isOldPrescriptionsOpen} onClose={() => setIsOldPrescriptionsOpen(false)} title="💊 Historical Prescription records">
            <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 text-left">
              {patientHistory?.prescriptions?.map((rx, idx) => (
                <div key={idx} className="p-4 bg-slate-50 border rounded-2xl space-y-2 text-xs font-mono">
                  <div className="flex justify-between font-bold text-slate-500 border-b pb-1.5">
                    <span>Date: {new Date(rx.createdAt).toLocaleDateString()}</span>
                    <span>Doctor: {formatDoctorDisplayName(rx.doctorId?.name, 'N/A')}</span>
                  </div>
                  <div className="space-y-1">
                    {rx.items?.map((item, itemIdx) => (
                      <div key={itemIdx} className="bg-white p-2 border rounded-xl flex justify-between">
                        <span className="font-bold text-slate-800">{item.medicineName}</span>
                        <span className="text-slate-500">{item.dosage} | {item.duration} | {item.instructions}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!patientHistory?.prescriptions || patientHistory.prescriptions.length === 0) && (
                <p className="text-center py-6 text-slate-400 font-mono text-xs">No historical medications found.</p>
              )}
            </div>
          </Modal>

          {/* 5c. Old Investigations Modal */}
          <Modal isOpen={isOldInvestigationsOpen} onClose={() => setIsOldInvestigationsOpen(false)} title="🔬 Patient Historical Investigations List">
            <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 text-left">
              {patientHistory?.consultations?.map((visit, idx) => (
                visit.investigations && (
                  <div key={idx} className="p-4 bg-slate-50 border rounded-2xl space-y-2 text-xs font-mono">
                    <div className="flex justify-between font-bold text-slate-500 border-b pb-1.5">
                      <span>Visit Date: {new Date(visit.createdAt).toLocaleDateString()}</span>
                      <span>Diagnosis: {visit.diagnosis}</span>
                    </div>
                    <p><strong>Investigations Requested:</strong> {visit.investigations}</p>
                  </div>
                )
              ))}
              {(!patientHistory?.consultations || patientHistory.consultations.length === 0) && (
                <p className="text-center py-6 text-slate-400 font-mono text-xs">No historical investigations requested.</p>
              )}
            </div>
          </Modal>

          {/* 5d. Template Action Selection Modal */}
          <Modal
            isOpen={isTemplateConfirmOpen}
            onClose={() => {
              setIsTemplateConfirmOpen(false);
              setPendingTemplate(null);
            }}
            title="Prescription Template"
            size="md"
          >
            <div className="space-y-5 text-left">
              <p className="text-sm text-slate-600 font-medium">
                This consultation already contains prescription medicines. Choose how you want to apply the selected template.
              </p>

              <div className="space-y-3">
                {/* Replace Option */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="apply-option"
                    value="replace"
                    checked={selectedApplyOption === 'replace'}
                    onChange={() => setSelectedApplyOption('replace')}
                    className="mt-1 w-4 h-4 text-primary focus:ring-primary border-slate-300"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Replace Current Prescription</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">Remove all current medicines and load the selected template.</span>
                  </div>
                </label>

                {/* Append Option */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="apply-option"
                    value="append"
                    checked={selectedApplyOption === 'append'}
                    onChange={() => setSelectedApplyOption('append')}
                    className="mt-1 w-4 h-4 text-primary focus:ring-primary border-slate-300"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Append Missing Medicines</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">Add only medicines that are not already in the prescription.</span>
                  </div>
                </label>

                {/* Cancel Option */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="apply-option"
                    value="cancel"
                    checked={selectedApplyOption === 'cancel'}
                    onChange={() => setSelectedApplyOption('cancel')}
                    className="mt-1 w-4 h-4 text-primary focus:ring-primary border-slate-300"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Cancel</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">Keep the current prescription unchanged.</span>
                  </div>
                </label>
              </div>

              {/* Remember Choice Checkbox */}
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember-choice-chk"
                  checked={localRemember}
                  onChange={(e) => setLocalRemember(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2F63F2] focus:ring-[#2F63F2] border-slate-300"
                />
                <label htmlFor="remember-choice-chk" className="text-xs text-slate-500 font-bold select-none cursor-pointer">
                  Remember my choice for this consultation
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsTemplateConfirmOpen(false);
                    setPendingTemplate(null);
                  }}
                  className="text-xs font-bold uppercase tracking-wider px-5 h-10"
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (selectedApplyOption === 'cancel') {
                      setIsTemplateConfirmOpen(false);
                      setPendingTemplate(null);
                      return;
                    }

                    // If remember check is checked, save the choice for this consultation session
                    if (localRemember) {
                      setRememberChoice(true);
                      setSavedChoice(selectedApplyOption);
                    }

                    if (pendingTemplate) {
                      applyTemplateNow(pendingTemplate, selectedApplyOption);
                    }

                    setIsTemplateConfirmOpen(false);
                    setPendingTemplate(null);
                  }}
                  className="text-xs font-bold uppercase tracking-wider px-5 h-10 bg-[#2F63F2] hover:bg-[#2F63F2]/95 text-white"
                >
                  Apply Template
                </Button>
              </div>
            </div>
          </Modal>

          {/* Prescription Delivery Modal for Internal + External option */}
          {isDeliveryModalOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 text-left border border-slate-100"
              >
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Pill className="w-5 h-5 text-[#3563F6]" />
                    Prescription Delivery
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    Choose delivery method
                  </p>
                </div>

                <div className="space-y-3">
                  <label
                    onClick={() => setSelectedDeliveryMethod('internal_pharmacy')}
                    className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${selectedDeliveryMethod === 'internal_pharmacy'
                      ? 'bg-blue-50/60 border-[#3563F6] ring-1 ring-[#3563F6]/20'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <input
                      type="radio"
                      name="modalDeliveryMethod"
                      value="internal_pharmacy"
                      checked={selectedDeliveryMethod === 'internal_pharmacy'}
                      onChange={() => setSelectedDeliveryMethod('internal_pharmacy')}
                      className="mt-0.5 w-4 h-4 text-[#3563F6] focus:ring-[#3563F6] border-slate-300"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 block">Internal Pharmacy</span>
                      <span className="text-[11px] font-medium text-slate-500 block">
                        Automatically send prescription to the hospital pharmacy for dispensing.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setSelectedDeliveryMethod('external_print')}
                    className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${selectedDeliveryMethod === 'external_print'
                      ? 'bg-blue-50/60 border-[#3563F6] ring-1 ring-[#3563F6]/20'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <input
                      type="radio"
                      name="modalDeliveryMethod"
                      value="external_print"
                      checked={selectedDeliveryMethod === 'external_print'}
                      onChange={() => setSelectedDeliveryMethod('external_print')}
                      className="mt-0.5 w-4 h-4 text-[#3563F6] focus:ring-[#3563F6] border-slate-300"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 block">External / Print Prescription</span>
                      <span className="text-[11px] font-medium text-slate-500 block">
                        Generate printable prescription for external medicine purchase.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => setIsDeliveryModalOpen(false)}
                    variant="outline"
                    className="text-xs font-bold px-5 h-10 border-slate-200 text-slate-700"
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsDeliveryModalOpen(false);
                      executeConsultationSubmit(selectedDeliveryMethod);
                    }}
                    variant="primary"
                    loading={completeConsultationMutation.isPending}
                    className="text-xs font-bold px-6 h-10 bg-[#3563F6]"
                  >
                    Complete
                  </Button>
                </div>
              </motion.div>
            </div>
          )}


        </div>
      </div>
    </div>
  );
};

export default DoctorConsultation;
