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
  getMasterList, initClinicalMasters, checkAllergyConflict
} from '../utils/clinicalMasters';
import {
  Pill, ShieldCheck, Check, Trash2, Plus, ArrowLeft, Volume2,
  FileText, Printer, Star, History as HistoryIcon, Copy, Stethoscope,
  Sun, Moon, ChevronDown, ChevronUp, X, Edit3, Save, Send, Users
} from 'lucide-react';
import { getVisitStatus, isCompletedVisit, VISIT_STATUSES } from '../utils/visitStatus';
import DoctorConsultationSidebar from '../components/DoctorConsultationSidebar';
import PatientHistoryDrawer from '../components/PatientHistoryDrawer';
import { triggerPrint } from '../modules/prescription-print/printUtils';
import { DEFAULT_PRINT_CONFIG } from '../modules/prescription-print/prescriptionPrint.types';

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
    if (consultationId) {
      localStorage.removeItem(`consult_draft_${consultationId}`);
    }
    queryClient.invalidateQueries(['doctorQueue']);
    queryClient.invalidateQueries(['appointments']);
    navigate('/doctor/dashboard', { replace: true });
  };

  // Auto-register Doctor Online Presence state on mount
  useEffect(() => {
    initClinicalMasters();
    if (user?._id) {
      api.post('/operations/doctors/presence', { isOnline: true }).catch(() => {});
    }
  }, [user?._id]);

  const dlist = useMemo(() => getMasterList('dlist'), []); // Diagnosis templates
  const mlist = useMemo(() => getMasterList('mlist'), []); // Medicines Catalog
  const dosages = useMemo(() => getMasterList('dosages'), []); // e.g. ['0','½','1','2','SOS']
  const frequencies = useMemo(() => getMasterList('frequencies'), []);
  const durations = useMemo(() => getMasterList('durations'), []);
  const foodInstructions = useMemo(() => getMasterList('foodInstructions'), []);
  const adviceList = useMemo(() => getMasterList('adviceList'), []);
  const followups = useMemo(() => getMasterList('followups'), []);
  const investigationsList = useMemo(() => getMasterList('investigations'), []);

  // Modals & History Drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOldPrescriptionsOpen, setIsOldPrescriptionsOpen] = useState(false);
  const [isOldInvestigationsOpen, setIsOldInvestigationsOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isEditVitalsModalOpen, setIsEditVitalsModalOpen] = useState(false);
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

  // Fetch appointment details
  const { data: appointment, isLoading: appLoading } = useQuery({
    queryKey: ['appointmentConsultationWorkspace', consultationId],
    queryFn: async () => {
      if (!consultationId) return null;
      const res = await api.get(`/operations/appointments`);
      const matched = res.data.data.find(a => a._id === consultationId);
      return matched;
    },
    enabled: !!consultationId
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

  const isReadOnly = Boolean(
    appointment && (
      isCompletedVisit(getVisitStatus(appointment)) || 
      appointment.status === 'Completed' || 
      appointment.queueStatus === 'Completed' ||
      appointment.status === 'Sent to Pharmacy' ||
      appointment.status === 'Sent To Pharmacy'
    )
  );

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
    enabled: !!consultationId && isReadOnly,
    retry: false
  });

  // Sync state from snapshot when snapshot data is available
  useEffect(() => {
    if (snapshotData) {
      if (snapshotData.diagnoses && snapshotData.diagnoses.length > 0) {
        setDiagnoses(snapshotData.diagnoses);
      } else if (snapshotData.diagnosis) {
        setDiagnoses([snapshotData.diagnosis]);
      }
      if (snapshotData.primaryDiagnosis) setPrimaryDiagnosis(snapshotData.primaryDiagnosis);
      if (snapshotData.clinicalNotes) setClinicalNotes(snapshotData.clinicalNotes);
      if (snapshotData.vitals) setVitals(snapshotData.vitals);
      if (snapshotData.doctorAdvice) setCustomAdvice(snapshotData.doctorAdvice);
      if (snapshotData.followupRequired !== undefined) setFollowupRequired(snapshotData.followupRequired);
      if (snapshotData.followupDate) setFollowupDate(new Date(snapshotData.followupDate).toISOString().split('T')[0]);
      if (snapshotData.followupReason) setFollowupReason(snapshotData.followupReason);
      if (snapshotData.prescriptions && snapshotData.prescriptions.length > 0) {
        setPrescriptionsList(snapshotData.prescriptions.map(p => {
          const rawDose = p.dose || p.dosage || p.frequency || '1-0-1';
          const parts = rawDose.includes('-') ? rawDose.split('-') : ['1', '0', '1'];
          return {
            id: p._id || String(Date.now() + Math.random()),
            medicineId: p.medicineId || '',
            medicineName: p.medicineName || p.name || '',
            morning: parts[0] || '1',
            afternoon: parts[1] || '0',
            night: parts[2] || '1',
            food: p.timing || p.foodInstruction || p.food || p.instructions || 'After Food',
            duration: p.duration || '5 Days',
            quantity: p.quantity || 10,
            remarks: p.remarks || p.notes || ''
          };
        }));
      }
      if (snapshotData.investigations && snapshotData.investigations.length > 0) {
        setCheckedInvestigations(snapshotData.investigations.map(inv => inv.investigationName));
      }
    }
  }, [snapshotData]);

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
          const freqPattern = `${m.morning || '1'}-${m.afternoon || '0'}-${m.night || '1'}`;
          const doseStr = m.dosage || (m.morning || m.afternoon || m.night ? freqPattern : '1 Tablet');
          return {
            medicineName: medName,
            name: medName,
            dosage: doseStr,
            frequency: m.frequency || freqPattern,
            duration: m.duration || '5 Days',
            food: m.food || m.foodInstruction || 'After Food',
            instructions: m.food || m.remarks || m.foodInstruction || 'After Food'
          };
        });

      const patientObj = (snapshotData?.patientId && typeof snapshotData.patientId === 'object')
        ? snapshotData.patientId
        : (typeof appointment?.patientId === 'object' && appointment?.patientId ? appointment.patientId : { name: 'Patient' });

      const consultationPayload = {
        isSample: false,
        hospital: targetHospital,
        branch: snapshotData?.branch || appointment?.branchId || user?.branchId || {},
        patientId: patientObj,
        patient: patientObj,
        date: snapshotData?.date || snapshotData?.consultationDate || appointment?.date || new Date().toISOString(),
        tokenNo: snapshotData?.tokenNo || appointment?.tokenNumber || appointment?.tokenNo || 'OP-01',
        visitType: snapshotData?.visitType || consultationType || appointment?.appointmentType || 'General OPD',
        chiefComplaint: snapshotData?.chiefComplaint || appointment?.chiefComplaint || 'Consultation Visit',
        clinicalNotes: snapshotData?.clinicalNotes || clinicalNotes || 'General consultation notes.',
        diagnosis: (snapshotData?.diagnosis && snapshotData.diagnosis.length > 0) 
          ? snapshotData.diagnosis 
          : (diagnoses.length > 0 ? diagnoses : (primaryDiagnosis ? [primaryDiagnosis] : [])),
        prescription: validMedicines,
        advice: (snapshotData?.advice && snapshotData.advice.length > 0) ? snapshotData.advice : checkedAdvice,
        followupDate: snapshotData?.followupDate || (followupRequired ? followupDate : null)
      };

      const doctorPayload = {
        name: snapshotData?.doctorId?.name || user?.name || appointment?.doctorId?.name || 'Attending Doctor',
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
      const res = await api.post('/operations/consultations', payload);
      return res.data.data;
    },
    onSuccess: async (data, variables) => {
      localStorage.removeItem(`consult_draft_${consultationId}`);
      
      const delivery = variables?.deliveryMethod || 'internal_pharmacy';
      if (delivery === 'print_only' || delivery === 'external_print' || delivery === 'external') {
        toast.success('Consultation completed. Prescription generated successfully.');
        setTimeout(() => {
          handleEnginePrint();
        }, 300);
      } else {
        toast.success('Consultation completed. Prescription sent to Pharmacy.');
      }

      queryClient.invalidateQueries(['doctorQueue']);
      queryClient.invalidateQueries(['doctorQueueSidebar']);
      queryClient.invalidateQueries(['doctorQueueCheckWorkspace']);
      queryClient.invalidateQueries(['appointments']);
      queryClient.invalidateQueries(['pharmacyQueue']);
      queryClient.invalidateQueries(['prescriptions']);
      queryClient.invalidateQueries(['consultationSnapshotWorkspace']);

      // Auto-select Next Waiting / Emergency Patient in Queue
      try {
        const today = new Date().toLocaleDateString('en-CA');
        const res = await api.get(`/operations/appointments?date=${today}&doctorId=${user?._id}`);
        const freshQueue = res.data?.data || [];
        const nextWaiting = freshQueue.find(a => {
          const st = getVisitStatus(a);
          return (st === 'Waiting' || st === 'Scheduled' || a.queueStatus === 'Waiting') && a._id !== consultationId;
        });

        if (nextWaiting) {
          toast.success(`Loading next patient: ${nextWaiting.patientId?.name || nextWaiting.tokenNumber}`);
          navigate(`/doctor/consultation/${nextWaiting._id}`, { replace: true });
        } else {
          navigate('/clinical/today-patients', { replace: true });
        }
      } catch (err) {
        navigate('/clinical/today-patients', { replace: true });
      }
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
    if (appointment?.vitals) {
      setVitals({
        bpSystolic: appointment.vitals.bpSystolic || '',
        bpDiastolic: appointment.vitals.bpDiastolic || '',
        pulse: appointment.vitals.pulse || '',
        temperature: appointment.vitals.temperature || '',
        RR: appointment.vitals.RR || '',
        weight: appointment.vitals.weight || '',
        height: appointment.vitals.height || '',
        spo2: appointment.vitals.spo2 || '',
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

    // Load existing draft
    const savedDraft = localStorage.getItem(`consult_draft_${consultationId}`);
    if (savedDraft) {
      try {
        const d = JSON.parse(savedDraft);
        if (d.clinicalNotes) setClinicalNotes(d.clinicalNotes);
        if (d.diagnoses && Array.isArray(d.diagnoses)) {
          setDiagnoses(d.diagnoses);
        } else if (d.primaryDiagnosis) {
          setDiagnoses([d.primaryDiagnosis]);
        }
        if (d.primaryDiagnosis) setPrimaryDiagnosis(d.primaryDiagnosis);
        if (d.diagnosisStatus) setDiagnosisStatus(d.diagnosisStatus);
        if (d.prescriptionsList) setPrescriptionsList(d.prescriptionsList);
        if (d.checkedAdvice) setCheckedAdvice(d.checkedAdvice);
        if (d.customAdvice) setCustomAdvice(d.customAdvice);
        if (d.followupRequired) setFollowupRequired(d.followupRequired);
        if (d.followupDate) setFollowupDate(d.followupDate);
        if (d.followupReason) setFollowupReason(d.followupReason);
        if (d.checkedInvestigations) setCheckedInvestigations(d.checkedInvestigations);
        if (d.customInvestigation) setCustomInvestigation(d.customInvestigation);
        if (d.vitals) setVitals(d.vitals);

        hasRestored.current = true;
        toast.success('Restored unsaved consultation draft!');
      } catch (e) {
        console.error('Failed to restore draft', e);
      }
    }
  }, [consultationId]);

  useEffect(() => {
    if (!consultationId || isReadOnly) return;

    const interval = setInterval(() => {
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
      localStorage.setItem(`consult_draft_${consultationId}`, JSON.stringify(draftObj));
      setDraftSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 30000);

    return () => clearInterval(interval);
  }, [
    consultationId, clinicalNotes, primaryDiagnosis, diagnoses, diagnosisStatus, prescriptionsList,
    checkedAdvice, customAdvice, followupRequired, followupDate, followupReason,
    checkedInvestigations, customInvestigation, vitals
  ]);

  // Filter diagnoses templates based on input
  useEffect(() => {
    if (diagSearch.trim()) {
      const filtered = dlist.filter(d => d.name.toLowerCase().includes(diagSearch.toLowerCase()) && d.status === 'Active');
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
    const days = parseInt(dur) || 1;
    return Math.ceil((morning + afternoon + night) * days) || 10;
  };

  // Add a new blank editable row
  const handleAddNewBlankRow = () => {
    const lastRow = prescriptionsList[prescriptionsList.length - 1];
    if (lastRow && !lastRow.medicineName.trim()) {
      return; // Prevent duplicate empty rows
    }
    const newRow = {
      id: String(Date.now() + Math.random()),
      medicineId: '',
      medicineName: '',
      morning: '1',
      afternoon: '0',
      night: '1',
      food: 'After Food',
      duration: '5 Days',
      quantity: 10,
      remarks: ''
    };
    setPrescriptionsList([...prescriptionsList, newRow]);
    setFocusedRowId(newRow.id);
  };

  // Add a diagnosis chip and handle Clinical Diagnosis Master creation inline
  const handleAddDiagnosis = async (name) => {
    if (!name || !name.trim() || isAddingDiagnosis) return;
    const cleanName = name.trim();

    // 1. Add chip locally immediately for instant feedback
    setDiagnoses(prev => {
      if (prev.some(d => d.toLowerCase() === cleanName.toLowerCase())) {
        return prev;
      }
      return [...prev, cleanName];
    });
    setDiagSearch('');
    setDiagSearchResults([]);
    setDiagSuggestions([]);

    // 2. Persist to Clinical Diagnosis Master API asynchronously
    try {
      setIsAddingDiagnosis(true);
      const res = await api.post('/operations/clinical-diagnoses', { name: cleanName });
      if (res.data?.created) {
        setSubtleAddedToast(true);
        setTimeout(() => setSubtleAddedToast(false), 2500);
        refetchFrequentDiagnoses();
      }
    } catch (err) {
      console.error('Error persisting diagnosis master:', err);
    } finally {
      setIsAddingDiagnosis(false);
    }

    // 3. Merge template medicines if matching protocol template exists in DB or dlist
    try {
      const dbMatchRes = await api.get(`/operations/clinical-diagnoses/search?q=${encodeURIComponent(cleanName)}`);
      const dbMatches = dbMatchRes.data?.data || [];
      const dbMatch = dbMatches.find(d => d.name.toLowerCase() === cleanName.toLowerCase());

      if (dbMatch && dbMatch.template) {
        const tpl = dbMatch.template;
        const hasMedicines = prescriptionsList.some(med => med.medicineName && med.medicineName.trim() !== '');
        const mode = hasMedicines ? 'append' : 'replace';

        const convertedTpl = {
          name: dbMatch.name,
          medicines: (tpl.medicines || []).map(m => m.name || m),
          advice: tpl.advice || [],
          followup: tpl.followupDuration || '7 Days',
          investigations: tpl.investigations || []
        };
        applyTemplateNow(convertedTpl, mode);
      } else {
        const matchingTpl = dlist.find(d => d.name.toLowerCase() === cleanName.toLowerCase() && d.status === 'Active');
        if (matchingTpl) {
          const hasMedicines = prescriptionsList.some(med => med.medicineName && med.medicineName.trim() !== '');
          const mode = hasMedicines ? 'append' : 'replace';
          applyTemplateNow(matchingTpl, mode);
        }
      }
    } catch (_) {
      const matchingTpl = dlist.find(d => d.name.toLowerCase() === cleanName.toLowerCase() && d.status === 'Active');
      if (matchingTpl) {
        const hasMedicines = prescriptionsList.some(med => med.medicineName && med.medicineName.trim() !== '');
        const mode = hasMedicines ? 'append' : 'replace';
        applyTemplateNow(matchingTpl, mode);
      }
    }
  };

  // Remove a diagnosis chip (preserves existing medicines in prescription pad)
  const handleRemoveDiagnosis = (nameToRemove) => {
    setDiagnoses(prev => prev.filter(d => d.toLowerCase() !== nameToRemove.toLowerCase()));
  };

  // Toggle Diagnosis Preset button
  const handleToggleDiagnosisPreset = (tpl) => {
    const isSelected = diagnoses.some(d => d.toLowerCase() === tpl.name.trim().toLowerCase());
    if (isSelected) {
      handleRemoveDiagnosis(tpl.name);
    } else {
      handleApplyDiagnosisTemplate(tpl);
    }
  };

  // Set diagnosis manually without immediately applying medicines
  const handleSelectDiagnosisOnly = (tpl) => {
    handleAddDiagnosis(tpl.name);
  };

  // Perform actual template application (Replace or Append)
  const applyTemplateNow = (tpl, mode) => {
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
        const catalogMed = (mlist || []).find(m => 
          m.name === medName || 
          m.name?.toLowerCase() === medName.toLowerCase() ||
          m.name?.toLowerCase().includes(medName.toLowerCase()) || 
          medName.toLowerCase().includes(m.name?.toLowerCase())
        );

        const m = catalogMed?.morning || medItem?.morning || '1';
        const a = catalogMed?.afternoon || medItem?.afternoon || '0';
        const n = catalogMed?.night || medItem?.night || '1';
        const dur = catalogMed?.duration || medItem?.duration || '5 Days';
        const qty = calculateQuantity(m, a, n, dur);

        return {
          id: String(Date.now() + Math.random()),
          medicineId: catalogMed?.id || String(Date.now() + Math.random()),
          medicineName: catalogMed?.name || medName,
          morning: m,
          afternoon: a,
          night: n,
          food: catalogMed?.food || medItem?.food || 'After Food',
          duration: dur,
          quantity: qty,
          remarks: catalogMed?.remarks || medItem?.remarks || ''
        };
      });
    }

    if (mode === 'replace') {
      // Replace Primary Diagnosis & Diagnoses list with template diagnosis
      if (tpl?.name) {
        setDiagnoses([tpl.name]);
        setDiagSearch('');
        setDiagSuggestions([]);
      }
      // Clear medicines and load new ones
      setPrescriptionsList(newMeds);
    } else if (mode === 'append') {
      // Append template diagnosis to diagnoses array if not already present
      if (tpl?.name) {
        setDiagnoses(prev => {
          if (prev.some(d => d.toLowerCase() === tpl.name.toLowerCase())) {
            return prev;
          }
          return [...prev, tpl.name];
        });
        setDiagSearch('');
        setDiagSuggestions([]);
      }

      // Append only missing medicines, ignoring duplicates by name
      setPrescriptionsList(prevList => {
        const existingNames = new Set(
          prevList
            .map(m => m.medicineName?.trim().toLowerCase())
            .filter(Boolean)
        );

        const filteredNewMeds = newMeds.filter(
          m => !existingNames.has(m.medicineName?.trim().toLowerCase())
        );

        const nonBlankPrev = prevList.filter(p => p.medicineName && p.medicineName.trim() !== '');
        return [...nonBlankPrev, ...filteredNewMeds];
      });
    }

    // Auto-populate Advice Checkbox ticks (always append missing ones)
    if (tpl.advice && tpl.advice.length > 0) {
      setCheckedAdvice(prev => {
        const merged = new Set([...prev, ...tpl.advice]);
        return Array.from(merged);
      });
      setIsAdviceExpanded(true);
    }

    // Auto-populate Investigations Checkbox ticks (always append missing ones)
    if (tpl.investigations && tpl.investigations.length > 0) {
      setCheckedInvestigations(prev => {
        const merged = new Set([...prev, ...tpl.investigations]);
        return Array.from(merged);
      });
      setIsInvestigationExpanded(true);
    }

    // Auto-populate Follow-up date (if template has custom followup duration, update date pre-fill without forcing toggle ON)
    if (tpl.followup) {
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
    if (!tpl) return;
    const hasMedicines = prescriptionsList.some(med => med.medicineName && med.medicineName.trim() !== '');
    const mode = hasMedicines ? 'append' : 'replace';
    applyTemplateNow(tpl, mode);
  };


  // Add Frequently Used Medicines instantly as a new row
  const handleAddFrequentMed = (name) => {
    const catalogMed = mlist.find(m => m.name.toLowerCase().includes(name.toLowerCase()));
    const m = catalogMed?.morning || '1';
    const a = catalogMed?.afternoon || '0';
    const n = catalogMed?.night || '1';
    const dur = catalogMed?.duration || '5 Days';
    const food = catalogMed?.food || 'After Food';
    const qty = calculateQuantity(m, a, n, dur);

    const newRow = {
      id: String(Date.now() + Math.random()),
      medicineId: catalogMed?.id || String(Date.now()),
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
    setPrescriptionsList(prev => prev.map(row => {
      if (row.id === rowId) {
        const updatedRow = { ...row, [field]: value };
        if (['morning', 'afternoon', 'night', 'duration'].includes(field)) {
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
    const qty = calculateQuantity(med.morning || '1', med.afternoon || '0', med.night || '1', med.duration || '5 Days');
    setPrescriptionsList(prev => prev.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          medicineId: med.id,
          medicineName: med.name,
          morning: med.morning || '1',
          afternoon: med.afternoon || '0',
          night: med.night || '1',
          food: med.food || 'After Food',
          duration: med.duration || '5 Days',
          quantity: qty
        };
      }
      return row;
    }));
    setActiveSuggestionRowId(null);
  };

  // Duplicate a prescription row for fast adjustments
  const handleDuplicateRow = (row) => {
    const duplicated = {
      ...row,
      id: String(Date.now() + Math.random()),
      medicineName: `${row.medicineName} (Copy)`
    };
    setPrescriptionsList([...prescriptionsList, duplicated]);
    setFocusedRowId(duplicated.id);
    toast.success('Row duplicated');
  };

  const handleRemoveMedicine = (idx) => {
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
    if (checkedAdvice.includes(adv)) {
      setCheckedAdvice(checkedAdvice.filter(x => x !== adv));
    } else {
      setCheckedAdvice([...checkedAdvice, adv]);
    }
  };

  const toggleInvestigation = (inv) => {
    if (checkedInvestigations.includes(inv)) {
      setCheckedInvestigations(checkedInvestigations.filter(x => x !== inv));
    } else {
      setCheckedInvestigations([...checkedInvestigations, inv]);
    }
  };

  const handleApplyPresetFollowup = (days) => {
    setFollowupRequired(true);
    const fDate = new Date();
    fDate.setDate(fDate.getDate() + days);
    setFollowupDate(fDate.toISOString().split('T')[0]);
  };

  const executeConsultationSubmit = (deliveryMethod) => {
    const activeDiagnoses = diagnoses.length > 0 ? diagnoses : (primaryDiagnosis ? [primaryDiagnosis] : []);
    const activeMeds = prescriptionsList.filter(p => p.medicineName.trim());

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
      const rx = {
        medicineName: p.medicineName.trim(),
        dosage: gridPattern,
        frequency: freqMap[gridPattern] || p.frequency || 'BD',
        duration: p.duration,
        route: 'Oral',
        quantity: p.quantity,
        instructions: p.food,
        foodTiming: p.food,
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

    const payload = {
      appointmentId: appointment._id,
      patientId: appointment.patientId?._id,
      consultationFee: customConsultationFee !== '' ? Number(customConsultationFee) : (appointment?.consultationFee || 500),
      consultationType: consultationType || appointment?.consultationType || 'New Consultation',
      diagnosis: activeDiagnoses.join(', '),
      diagnoses: activeDiagnoses,
      primaryDiagnosis: activeDiagnoses[0],
      clinicalNotes: clinicalNotes,
      advice: [checkedAdvice.join(', '), customAdvice].filter(Boolean).join(' | '),
      followupDate: followupRequired ? followupDate : undefined,
      chiefComplaint: activeDiagnoses.join(', '),
      historyOfPresentIllness: clinicalNotes,
      symptoms: '',
      vitals,
      icd10Code: '',
      diagnosisStatus,
      followupRequired,
      followupReason,
      documents: uploadedDocs,
      investigations: checkedInvestigations,
      prescriptions: payloadPrescriptions,
      deliveryMethod
    };

    completeConsultationMutation.mutate(payload);
  };

  const handleSubmitConsultation = () => {
    if (!appointment) return;
    const activeDiagnoses = diagnoses.length > 0 ? diagnoses : (primaryDiagnosis ? [primaryDiagnosis] : []);
    if (activeDiagnoses.length === 0) {
      toast.error('Please select at least one diagnosis.');
      return;
    }

    // Filter out completely blank rows
    const activeMeds = prescriptionsList.filter(p => p.medicineName.trim());

    // Check validation rules
    for (const med of activeMeds) {
      if (!med.medicineName.trim()) {
        toast.error('Medicine name is mandatory for all entered rows');
        return;
      }
      if (!med.duration) {
        toast.error(`Please select a duration for ${med.medicineName}`);
        return;
      }
      if (med.quantity <= 0) {
        toast.error(`Quantity must be greater than zero for ${med.medicineName}`);
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

  if (!activeVisitId || !appointment || !canViewWorkspace) {
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

        {/* 0. WORKSPACE TOP ACTION TOOLBAR (OUTSIDE PATIENT INFO CARD) */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap print:hidden bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsQueueDrawerOpen(!isQueueDrawerOpen)}
              className="px-4 py-2 rounded-xl bg-[#3563F6] hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer hover:shadow-lg active:scale-95"
            >
              <Users className="w-4 h-4 text-white" />
              <span>{isQueueDrawerOpen ? 'Collapse Queue' : 'Today\'s Queue'}</span>
              <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live OPD
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {draftSavedTime ? (
              <span className="text-xs text-emerald-700 font-mono font-extrabold bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Draft saved at {draftSavedTime}
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

        {/* 1. PATIENT SUMMARY HEADER — Clean Enterprise Layout (Compact Mobile 2-Line Structure) */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs print:hidden font-sans overflow-hidden">
          {/* Desktop & Tablet Layout (md:flex) - Unchanged */}
          <div className="hidden md:flex px-5 py-4 items-start justify-between gap-4">
            {/* Left: Patient Identity */}
            <div className="space-y-2 min-w-0 flex-1">
              {/* Patient Name — Primary Visual Element */}
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-full bg-[#3563F6]/10 text-[#3563F6] flex items-center justify-center text-base shrink-0">👤</span>
                <span className="truncate">{appointment.patientId?.name}</span>
              </h2>

              {/* Secondary Line: Age • Gender • Token • Consult Date */}
              <div className="flex items-center gap-2.5 text-sm sm:text-base text-slate-600 font-semibold pl-[46px] flex-wrap">
                <span className="text-slate-800 font-bold">{appointment.patientId?.age ? `${appointment.patientId.age} Years` : 'N/A'}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-800 font-bold">{appointment.patientId?.gender || 'N/A'}</span>
                <span className="text-slate-300">•</span>
                <span className="font-mono font-extrabold text-[#3563F6] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">Token #{appointment.tokenNumber}</span>
                {appointment.date && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono font-bold text-xs text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                      📅 Consult Date: {new Date(appointment.date).toLocaleDateString('en-GB')}
                    </span>
                  </>
                )}
              </div>

              {/* Badges Row: Payment + Allergy */}
              <div className="flex items-center gap-2.5 pl-[42px] flex-wrap">
                <span className={`text-[10px] font-extrabold border px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                  appointment.billingStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${appointment.billingStatus === 'Paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {appointment.billingStatus === 'Paid' ? 'Paid' : 'Unpaid'}
                </span>

                <span className="text-[10px] font-extrabold border px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 bg-slate-50 text-slate-600 border-slate-200">
                  ⚠ Allergies: {appointment.patientId?.allergies?.join(', ') || 'None'}
                </span>
              </div>
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
                <span className="w-5 h-5 rounded-full bg-[#3563F6]/10 text-[#3563F6] flex items-center justify-center text-[10px] shrink-0">👤</span>
                <h2 className="font-black text-slate-900 truncate shrink-0 max-w-[85px] sm:max-w-[120px] text-xs">
                  {appointment.patientId?.name}
                </h2>
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

            {/* Line 2 — Single Horizontal Line Metadata: tara • 18Y • Female • #OP008 • 19/08/2026 */}
            <div className="flex items-center gap-1 text-[11px] text-slate-600 font-semibold truncate leading-none">
              <span className="text-slate-800 font-bold shrink-0">{appointment.patientId?.age ? `${appointment.patientId.age}Y` : 'N/A'}</span>
              <span className="text-slate-300 shrink-0">•</span>
              <span className="text-slate-800 font-bold shrink-0">{appointment.patientId?.gender || 'N/A'}</span>
              <span className="text-slate-300 shrink-0">•</span>
              <span className="font-mono font-extrabold text-[#3563F6] bg-blue-50 px-1 py-0.2 rounded border border-blue-200/60 text-[10px] shrink-0">
                #OP{String(appointment.tokenNumber).padStart(3, '0')}
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

            {/* Line 3 — Compact Status Badges Row */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className={`text-[9px] font-extrabold border px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                appointment.billingStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${appointment.billingStatus === 'Paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {appointment.billingStatus === 'Paid' ? '✓ PAID' : 'UNPAID'}
              </span>

              <span className="text-[9px] font-extrabold border px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 bg-slate-50 text-slate-600 border-slate-200">
                ⚠ ALLERGIES: {appointment.patientId?.allergies?.join(', ') || 'NONE'}
              </span>
            </div>
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-2.5 sm:gap-y-3 text-xs">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">UHID</span>
                        <span className="font-semibold text-slate-800 font-mono">{appointment.patientId?.uhid || 'PAT000005'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Blood Group</span>
                        <span className="font-extrabold text-rose-700">{appointment.patientId?.bloodGroup || 'O+'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Department</span>
                        <span className="font-semibold text-slate-800">General OPD</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Visit Started</span>
                        <span className="font-semibold text-slate-800 font-mono">10:07 AM</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Duration</span>
                        <span className="font-semibold text-slate-800 font-mono">35 min</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Created By</span>
                        <span className="font-semibold text-slate-800">Reception</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Last Saved</span>
                        <span className="font-semibold text-emerald-700 font-mono">{draftSavedTime || '10:42 AM'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Attending Doctor</span>
                        <span className="font-bold text-[#3563F6]">Dr. {appointment.doctorId?.name || user?.name || 'On Duty'}</span>
                      </div>
                    </div>
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
            🔒 <strong>Read-Only Record:</strong> This consultation was completed on {new Date(appointment?.date || Date.now()).toLocaleDateString('en-GB')}. Modifications are disabled.
          </span>
          <span className="text-[10px] font-extrabold uppercase bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-md text-amber-900">
            Finalized
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

          <button
            type="button"
            onClick={() => setIsEditVitalsModalOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-[#3563F6]/10 hover:bg-[#3563F6]/20 text-[#3563F6] border border-[#3563F6]/30 font-black text-[10px] uppercase flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit Vitals</span>
          </button>
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
                {vitals.bpSystolic || '120'}/{vitals.bpDiastolic || '80'}
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
                {vitals.pulse || '72'} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">bpm</span>
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
                {vitals.temperature || '36.8'} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">°C</span>
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
                {vitals.spo2 || '98'} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">%</span>
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
                {vitals.height || '145'} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">cm</span>
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
                {vitals.weight || '42'} <span className="text-[8px] font-normal text-slate-500 hidden xl:inline">kg</span>
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
                {vitals.bmi || '20.0'}
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
                BP {vitals.bpSystolic || '120'}/{vitals.bpDiastolic || '80'} • Pulse {vitals.pulse || '72'} • Temp {vitals.temperature || '36.8'}°C
              </span>
            </div>

            {isMobileVitalsExpanded && (
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
                      {vitals.bpSystolic || '120'}/{vitals.bpDiastolic || '80'}
                    </span>
                  </div>

                  {/* Pulse */}
                  <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-2 text-center">
                    <span className="text-[9px] font-black text-slate-500 block uppercase">Pulse</span>
                    <span className="text-xs font-black text-slate-900 font-mono block">
                      {vitals.pulse || '72'}
                    </span>
                  </div>

                  {/* Temp */}
                  <div className="bg-cyan-50/70 border border-cyan-200/80 rounded-xl p-2 text-center">
                    <span className="text-[9px] font-black text-slate-500 block uppercase">Temp</span>
                    <span className="text-xs font-black text-slate-900 font-mono block">
                      {vitals.temperature || '36.8'}°C
                    </span>
                  </div>

                  {/* SpO2 */}
                  <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-2 text-center">
                    <span className="text-[9px] font-black text-slate-500 block uppercase">SpO₂</span>
                    <span className="text-xs font-black text-slate-900 font-mono block">
                      {vitals.spo2 || '98'}%
                    </span>
                  </div>

                  {/* Height */}
                  <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-2 text-center">
                    <span className="text-[9px] font-black text-slate-500 block uppercase">Height</span>
                    <span className="text-xs font-black text-slate-900 font-mono block">
                      {vitals.height || '145'}cm
                    </span>
                  </div>

                  {/* Weight */}
                  <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-2 text-center">
                    <span className="text-[9px] font-black text-slate-500 block uppercase">Weight</span>
                    <span className="text-xs font-black text-slate-900 font-mono block">
                      {vitals.weight || '42'}kg
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                  <span className="text-xs font-black text-emerald-700 font-mono">
                    BMI {vitals.bmi || '20.0'}
                  </span>

                  <button
                    type="button"
                    onClick={() => setIsEditVitalsModalOpen(true)}
                    className="px-2.5 py-1 rounded bg-[#3563F6] text-white font-black text-[10px] uppercase shadow-2xs"
                  >
                    EDIT VITALS
                  </button>
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
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 block mb-1">Diagnoses <span className="text-rose-500">*</span></label>

                {/* Removable Diagnosis Chips */}
                {diagnoses.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2 mb-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {diagnoses.map((diag, idx) => (
                      <span
                        key={`${diag}-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-[#2F63F2]/10 text-[#2F63F2] border border-[#2F63F2]/20 shadow-2xs"
                      >
                        <span>{diag}</span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDiagnosis(diag)}
                            className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#2F63F2]/20 text-[#2F63F2] transition-colors cursor-pointer print:hidden"
                            title={`Remove ${diag}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    disabled={isReadOnly}
                    className={`w-full border-b-2 border-slate-200 focus:border-[#2F63F2] px-1 py-2 text-sm font-bold text-slate-800 focus:outline-none transition-colors ${
                      isReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-300' : 'bg-white'
                    }`}
                    placeholder={isReadOnly ? "Read-Only Case Record" : "Search or type diagnosis (e.g. Acute Gastritis) and press Enter..."}
                    value={diagSearch}
                    onChange={(e) => setDiagSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (!isReadOnly && e.key === 'Enter' && diagSearch.trim()) {
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
                            const isSelected = diagnoses.some(item => item.toLowerCase() === d.name.toLowerCase());
                            return (
                              <button
                                key={d._id || d.name}
                                type="button"
                                onClick={() => handleAddDiagnosis(d.name)}
                                className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
                                  isSelected ? 'bg-blue-50/60 text-[#2F63F2] font-bold' : 'hover:bg-slate-50 text-slate-800 font-semibold'
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
            <div className="bg-slate-50/80 border border-slate-200 p-4 rounded-2xl print:hidden flex flex-col justify-center">
              <div className="flex flex-wrap gap-2.5">
                {/* Dynamically fetched Frequently Used Diagnoses */}
                {(frequentDiagnosesData && frequentDiagnosesData.length > 0
                  ? frequentDiagnosesData
                  : dlist.filter(d => d.status === 'Active')
                ).map((item) => {
                  const name = item.name || item.val || '';
                  const isSelected = diagnoses.some(d => d.toLowerCase() === name.trim().toLowerCase());
                  const isFav = item.favorites && item.favorites.length > 0;
                  const itemKey = item._id || item.id || name;

                  return (
                    <div
                      key={itemKey}
                      className={`inline-flex items-center rounded-xl text-xs font-semibold transition-all border shadow-2xs ${
                        isSelected
                          ? 'bg-[#2F63F2] border-[#2F63F2] text-white shadow-xs'
                          : 'bg-white text-slate-700 hover:text-primary border-slate-200 hover:border-primary/30 hover:bg-[#2F63F2]/5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const tplMatch = dlist.find(d => d.name.toLowerCase() === name.trim().toLowerCase());
                          if (tplMatch) {
                            handleToggleDiagnosisPreset(tplMatch);
                          } else if (isSelected) {
                            handleRemoveDiagnosis(name);
                          } else {
                            handleAddDiagnosis(name);
                          }
                        }}
                        className="px-3 py-2 flex items-center gap-1.5 cursor-pointer font-bold"
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
                            toggleFavoriteMutation.mutate(item._id);
                          }}
                          className={`pr-2 py-2 hover:opacity-80 transition-opacity cursor-pointer ${
                            isSelected ? 'text-white' : 'text-slate-400'
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
                disabled={isReadOnly}
                readOnly={isReadOnly}
                className={`w-full border border-slate-200 focus:border-primary rounded-xl p-3 text-xs font-mono text-slate-700 focus:outline-none transition-colors h-24 resize-none ${
                  isReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-300' : 'bg-slate-50'
                }`}
                placeholder={isReadOnly ? "No clinical notes recorded." : "Enter patient complaints, clinical findings, history, doctor observations, symptoms, etc."}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Section B: 2. 💊 Prescription Pad Builder */}
          <div className="space-y-6 pt-6 border-t border-slate-100">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#3563F6] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  2
                </div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#3563F6]">PRESCRIPTION PAD</h3>
              </div>
              {!isReadOnly && (
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

            {!isReadOnly && (
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
                    No medications added to pad. Click "+ ADD MEDICINE" to start.
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
                                const filtered = mlist.filter(m =>
                                  m.name.toLowerCase().includes(row.medicineName.toLowerCase()) ||
                                  m.generic.toLowerCase().includes(row.medicineName.toLowerCase())
                                );
                                return (
                                  <>
                                    <input
                                      type="text"
                                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-extrabold text-slate-900 focus:outline-none focus:border-[#3563F6] text-xs"
                                      placeholder="Type medicine..."
                                      value={row.medicineName}
                                      onChange={(e) => {
                                        handleUpdatePrescriptionRow(row.id, 'medicineName', e.target.value);
                                        setActiveSuggestionRowId(row.id);
                                        updateCoords(e.target);
                                      }}
                                      onFocus={(e) => {
                                        setFocusedRowId(row.id);
                                        setActiveSuggestionRowId(row.id);
                                        setHighlightedIdx(0);
                                        updateCoords(e.target);
                                      }}
                                      onBlur={() => setActiveSuggestionRowId(null)}
                                    />
                                    {activeSuggestionRowId === row.id && row.medicineName.trim() && dropdownCoords && createPortal(
                                      <div
                                        style={{
                                          position: 'absolute',
                                          top: `${dropdownCoords.top}px`,
                                          left: `${dropdownCoords.left}px`,
                                          width: `${dropdownCoords.width}px`,
                                        }}
                                        className="bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] divide-y text-xs max-h-40 overflow-y-auto font-sans"
                                      >
                                        {filtered.map((m) => (
                                          <button
                                            key={m.id}
                                            type="button"
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              handleAutofillPrescriptionRow(row.id, m);
                                            }}
                                            className="w-full text-left px-3 py-1.5 flex justify-between font-semibold hover:bg-slate-50 cursor-pointer"
                                          >
                                            <span>{m.name}</span>
                                            <span className="text-[10px] text-slate-400">({m.category})</span>
                                          </button>
                                        ))}
                                      </div>,
                                      document.body
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 print:hidden">
                              <button type="button" onClick={() => handleDuplicateRow(row)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer" title="Duplicate">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => handleRemoveMedicine(idx)} className="text-rose-400 hover:text-rose-600 p-1 rounded-lg bg-rose-50/60 border border-rose-100 hover:bg-rose-100 cursor-pointer" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Dose Timing pills */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase w-10 shrink-0">Dose</span>
                            <div className="flex items-center gap-1 flex-1">
                              <div className="bg-white border border-slate-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shadow-2xs">
                                <Sun className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                <select className="bg-transparent text-[10px] font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none text-center" value={row.morning} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'morning', e.target.value)}>
                                  {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shadow-2xs">
                                <Sun className="w-2.5 h-2.5 text-orange-500 shrink-0" />
                                <select className="bg-transparent text-[10px] font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none text-center" value={row.afternoon} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'afternoon', e.target.value)}>
                                  {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shadow-2xs">
                                <Moon className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                <select className="bg-transparent text-[10px] font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none text-center" value={row.night} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'night', e.target.value)}>
                                  {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Row 3: Duration, Qty, Food */}
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Duration</span>
                              <div className="relative">
                                <select className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pr-5 text-[10px] font-semibold text-slate-800 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs" value={row.duration} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'duration', e.target.value)}>
                                  {durations.map(dur => <option key={dur} value={dur}>{dur}</option>)}
                                </select>
                                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Qty</span>
                              <input type="number" className="w-full bg-white border border-slate-200 rounded-lg py-1 text-center text-[10px] font-black text-slate-800 focus:outline-none focus:border-[#3563F6] shadow-2xs" value={row.quantity} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'quantity', parseInt(e.target.value) || 0)} />
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Food</span>
                              <div className="relative">
                                <select className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pr-5 text-[10px] font-semibold text-slate-800 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs" value={row.food} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'food', e.target.value)}>
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
                              const filtered = mlist.filter(m =>
                                m.name.toLowerCase().includes(row.medicineName.toLowerCase()) ||
                                m.generic.toLowerCase().includes(row.medicineName.toLowerCase())
                              );
                              return (
                                <>
                                  <input
                                    type="text"
                                    disabled={isReadOnly}
                                    className={`w-full border-none font-extrabold text-slate-900 focus:outline-none text-xs ${
                                      isReadOnly ? 'bg-transparent cursor-not-allowed text-slate-700' : 'bg-transparent'
                                    }`}
                                    placeholder={isReadOnly ? "Medicine" : "Type medicine..."}
                                    value={row.medicineName}
                                    onChange={(e) => {
                                      if (!isReadOnly) {
                                        handleUpdatePrescriptionRow(row.id, 'medicineName', e.target.value);
                                        setActiveSuggestionRowId(row.id);
                                        updateCoords(e.target);
                                      }
                                    }}
                                    onFocus={(e) => {
                                      if (!isReadOnly) {
                                        setFocusedRowId(row.id);
                                        setActiveSuggestionRowId(row.id);
                                        setHighlightedIdx(0);
                                        updateCoords(e.target);
                                      }
                                    }}
                                    onBlur={() => {
                                      setActiveSuggestionRowId(null);
                                    }}
                                  />
                                  {!isReadOnly && activeSuggestionRowId === row.id && row.medicineName.trim() && dropdownCoords && createPortal(
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: `${dropdownCoords.top}px`,
                                        left: `${dropdownCoords.left}px`,
                                        width: `${dropdownCoords.width}px`,
                                      }}
                                      className="bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] divide-y text-xs max-h-40 overflow-y-auto font-sans"
                                    >
                                      {filtered.map((m) => (
                                        <button
                                          key={m.id}
                                          type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleAutofillPrescriptionRow(row.id, m);
                                          }}
                                          className="w-full text-left px-3 py-1.5 flex justify-between font-semibold hover:bg-slate-50 cursor-pointer"
                                        >
                                          <span>{m.name}</span>
                                          <span className="text-[10px] text-slate-400">({m.category})</span>
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
                              <div className="bg-white border border-slate-200 rounded-full px-2 py-0.5 flex items-center justify-center gap-1 shadow-2xs shrink-0">
                                <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                                <select disabled={isReadOnly} className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none text-center pr-0.5" value={row.morning} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'morning', e.target.value)}>
                                  {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-full px-2 py-0.5 flex items-center justify-center gap-1 shadow-2xs shrink-0">
                                <Sun className="w-3 h-3 text-orange-500 shrink-0" />
                                <select disabled={isReadOnly} className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none text-center pr-0.5" value={row.afternoon} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'afternoon', e.target.value)}>
                                  {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-full px-2 py-0.5 flex items-center justify-center gap-1 shadow-2xs shrink-0">
                                <Moon className="w-3 h-3 text-indigo-500 shrink-0" />
                                <select disabled={isReadOnly} className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none text-center pr-0.5" value={row.night} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'night', e.target.value)}>
                                  {dosages.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                            </div>
                          </td>

                          {/* Duration Cell */}
                          <td className="py-3 px-2">
                            <div className="relative inline-block w-full min-w-[110px]">
                              <select disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-full py-1.5 px-3.5 pr-7 text-xs font-semibold text-slate-800 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs" value={row.duration} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'duration', e.target.value)}>
                                {durations.map(dur => <option key={dur} value={dur}>{dur}</option>)}
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </td>

                          {/* Qty Cell */}
                          <td className="py-3 px-2 text-center">
                            <input disabled={isReadOnly} type="number" className="w-14 bg-white border border-slate-200 rounded-full py-1.5 text-center text-xs font-black text-slate-800 focus:outline-none focus:border-[#3563F6] shadow-2xs mx-auto" value={row.quantity} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'quantity', parseInt(e.target.value) || 0)} />
                          </td>

                          {/* Food Cell */}
                          <td className="py-3 px-2">
                            <div className="relative inline-block w-full min-w-[120px]">
                              <select disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-full py-1.5 px-3.5 pr-7 text-xs font-semibold text-slate-800 cursor-pointer focus:outline-none focus:border-[#3563F6] appearance-none shadow-2xs" value={row.food} onChange={(e) => handleUpdatePrescriptionRow(row.id, 'food', e.target.value)}>
                                {foodInstructions.map(food => <option key={food} value={food}>{food}</option>)}
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </td>

                          {/* Action Buttons Cell */}
                          <td className="py-3 px-3 text-right print:hidden">
                            {!isReadOnly && (
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
                          No medications added to pad. Click "+ ADD MEDICINE" to start.
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
                  <span>Total medicines: {prescriptionsList.filter(p => p.medicineName && p.medicineName.trim()).length}</span>
                </div>
                <div className="text-emerald-900 font-extrabold">
                  Total quantity: {prescriptionsList.reduce((acc, p) => acc + (parseInt(p.quantity) || 0), 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 & Step 4 Two-Column UI Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
            {/* Step 3: Follow-up */}
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#2F63F2] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                    3
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#2F63F2]">FOLLOW-UP</h3>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-700 select-none">Schedule Follow-up</span>
                  <button
                    type="button"
                    role="switch"
                    disabled={isReadOnly}
                    aria-checked={followupRequired}
                    onClick={() => {
                      if (isReadOnly) return;
                      const nextState = !followupRequired;
                      setFollowupRequired(nextState);
                      if (!nextState) {
                        setFollowupDate('');
                        setFollowupReason('');
                      } else if (!followupDate) {
                        handleApplyPresetFollowup(7);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      followupRequired ? 'bg-[#2563EB]' : 'bg-slate-200'
                    } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      followupRequired ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              {followupRequired && (
                <div className="space-y-4 items-start pt-1">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 block">Next Visit Date</label>
                    <input
                      type="date"
                      disabled={isReadOnly}
                      className="w-full bg-white border border-slate-200 focus:border-[#2F63F2] rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed"
                      value={followupDate}
                      onChange={(e) => setFollowupDate(e.target.value)}
                    />
                    {!isReadOnly && (
                      <div className="flex gap-1.5 flex-wrap pt-1">
                        {[3, 7, 15, 30].map(days => (
                          <button 
                            key={days} 
                            type="button" 
                            onClick={() => handleApplyPresetFollowup(days)} 
                            className="px-3 py-1 rounded-lg text-[10px] font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer"
                          >
                            +{days} Days
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 block">Follow-up Note (Optional)</label>
                    <textarea
                      disabled={isReadOnly}
                      readOnly={isReadOnly}
                      className="w-full bg-white border border-slate-200 focus:border-[#2F63F2] rounded-xl p-3 text-xs text-slate-800 focus:outline-none h-24 resize-none font-normal shadow-2xs disabled:bg-slate-100 disabled:cursor-not-allowed"
                      placeholder={isReadOnly ? "No follow-up note." : "e.g. Review after 5 days with reports"}
                      value={followupReason}
                      onChange={(e) => setFollowupReason(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Step 4: Advanced Options */}
            <div className="space-y-3 font-sans">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#2F63F2] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  4
                </div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#2F63F2]">ADVANCED OPTIONS</h3>
              </div>

              <div className="space-y-3">
                {/* Card 1: Laboratory & Diagnostic Investigations */}
                <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
                  <button 
                    type="button"
                    onClick={() => setIsInvestigationExpanded(!isInvestigationExpanded)}
                    className="w-full px-5 py-3.5 flex items-center justify-between font-bold text-slate-800 bg-slate-50/70 hover:bg-slate-50 transition-colors text-xs border-none focus:outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span>🔬 Laboratory & Diagnostic Investigations</span>
                      {(checkedInvestigations.length > 0 || customInvestigation) && (
                        <span className="bg-[#2F63F2]/10 text-[#2F63F2] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          {checkedInvestigations.length + (customInvestigation ? 1 : 0)} Selected
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">{isInvestigationExpanded ? 'Collapse' : 'Expand'}</span>
                  </button>

                  {isInvestigationExpanded && (
                    <div className="p-5 border-t border-slate-100 space-y-4">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Recommended Tests & Scans</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl max-h-[140px] overflow-y-auto">
                        {investigationsList.map((inv, idx) => {
                          const isChecked = checkedInvestigations.includes(inv);
                          return (
                            <label key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                              <input disabled={isReadOnly} type="checkbox" checked={isChecked} onChange={() => !isReadOnly && toggleInvestigation(inv)} className="rounded border-slate-300 text-[#2F63F2] disabled:cursor-not-allowed" />
                              <span className="truncate">{inv}</span>
                            </label>
                          );
                        })}
                      </div>
                      <textarea
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-[#2F63F2] rounded-xl p-3 text-xs text-slate-700 focus:outline-none transition-colors h-16 resize-none font-normal disabled:bg-slate-100 disabled:cursor-not-allowed"
                        placeholder={isReadOnly ? "No custom tests requested." : "Enter custom laboratory tests or scans requests here..."}
                        value={customInvestigation}
                        onChange={(e) => setCustomInvestigation(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Card 2: Advice Guidelines */}
                <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
                  <button 
                    type="button"
                    onClick={() => setIsAdviceExpanded(!isAdviceExpanded)}
                    className="w-full px-5 py-3.5 flex items-center justify-between font-bold text-slate-800 bg-slate-50/70 hover:bg-slate-50 transition-colors text-xs border-none focus:outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span>💡 Advice Guidelines & Instructions</span>
                      {(checkedAdvice.length > 0 || customAdvice) && (
                        <span className="bg-[#2F63F2]/10 text-[#2F63F2] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          {checkedAdvice.length + (customAdvice ? 1 : 0)} Selected
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">{isAdviceExpanded ? 'Collapse' : 'Expand'}</span>
                  </button>

                  {isAdviceExpanded && (
                    <div className="p-5 border-t border-slate-100 space-y-4">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Advice Guidelines</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl max-h-[140px] overflow-y-auto">
                        {adviceList.map((adv, idx) => {
                          const isChecked = checkedAdvice.includes(adv);
                          return (
                            <label key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                              <input disabled={isReadOnly} type="checkbox" checked={isChecked} onChange={() => !isReadOnly && toggleAdvice(adv)} className="rounded border-slate-300 text-[#2F63F2] disabled:cursor-not-allowed" />
                              <span className="truncate">{adv}</span>
                            </label>
                          );
                        })}
                      </div>
                      <textarea
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-[#2F63F2] rounded-xl p-3 text-xs text-slate-700 focus:outline-none transition-colors h-20 resize-none font-normal disabled:bg-slate-100 disabled:cursor-not-allowed"
                        placeholder={isReadOnly ? "No custom advice." : "Write custom advice guidelines for patient here..."}
                        value={customAdvice}
                        onChange={(e) => setCustomAdvice(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Consultation Type & Final Completion Toolbar (Bottom of Workspace) */}
          <div className="p-3 sm:p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pt-4 print:hidden">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3563F6] animate-pulse" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">Consultation Type</h4>
              </div>

              {/* Consultation Type Selector Enum */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl">
                {['New Consultation', 'Follow-up', 'Emergency', 'Teleconsultation'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setConsultationType(type)}
                    className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition-all ${
                      consultationType === type
                        ? 'bg-[#2F63F2] text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Manual Fee Entry Input */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                <span className="text-[11px] font-bold text-slate-600">Fee (₹):</span>
                <input
                  type="number"
                  placeholder="500"
                  value={customConsultationFee}
                  onChange={(e) => setCustomConsultationFee(e.target.value)}
                  disabled={!isFeeEditable}
                  className={`w-20 h-7 px-2 border rounded-lg text-xs font-bold text-slate-900 focus:outline-none ${
                    !isFeeEditable
                      ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                      : 'bg-white border-slate-200 focus:ring-1 focus:ring-[#2F63F2]'
                  }`}
                />
                {!isFeeEditable && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap">
                    🔒 {appointment?.billingStatus === 'Paid' || appointment?.paymentStatus === 'Paid' ? 'Paid' : 'Read Only'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0 w-full sm:w-auto">
              {!isReadOnly && (
                <Button
                  onClick={() => {
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
                    localStorage.setItem(`consult_draft_${consultationId}`, JSON.stringify(draftObj));
                    setDraftSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                    toast.success('Consultation draft saved successfully!');
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
                  Back to Dashboard
                </Button>
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
              <input type="text" className="enterprise-input" value={vitals.bpSystolic} onChange={(e) => setVitals({ ...vitals, bpSystolic: e.target.value })} placeholder="120" />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="font-extrabold text-[10px] uppercase text-slate-500">BP Diastolic (mmHg)</label>
              <input type="text" className="enterprise-input" value={vitals.bpDiastolic} onChange={(e) => setVitals({ ...vitals, bpDiastolic: e.target.value })} placeholder="80" />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="font-extrabold text-[10px] uppercase text-slate-500">Pulse (bpm)</label>
              <input type="text" className="enterprise-input" value={vitals.pulse} onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })} placeholder="72" />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="font-extrabold text-[10px] uppercase text-slate-500">Temperature (°F)</label>
              <input type="text" className="enterprise-input" value={vitals.temperature} onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })} placeholder="98.6" />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="font-extrabold text-[10px] uppercase text-slate-500">SpO₂ (%)</label>
              <input type="text" className="enterprise-input" value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} placeholder="98" />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="font-extrabold text-[10px] uppercase text-slate-500">Height (cm)</label>
              <input type="text" className="enterprise-input" value={vitals.height} onChange={(e) => setVitals({ ...vitals, height: e.target.value })} placeholder="145" />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="font-extrabold text-[10px] uppercase text-slate-500">Weight (kg)</label>
              <input type="text" className="enterprise-input" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} placeholder="42" />
            </div>
            <div className="space-y-1 min-w-0 col-span-2 sm:col-span-1">
              <label className="font-extrabold text-[10px] uppercase text-slate-500">Calculated BMI</label>
              <div className="h-10 border border-slate-200 rounded-xl px-3 bg-slate-50 flex items-center font-extrabold font-mono text-[#3563F6]">
                {vitals.bmi || '20.0'} kg/m²
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setVitals({
                  bpSystolic: appointment?.vitals?.bpSystolic || '',
                  bpDiastolic: appointment?.vitals?.bpDiastolic || '',
                  pulse: appointment?.vitals?.pulse || '',
                  temperature: appointment?.vitals?.temperature || '',
                  RR: appointment?.vitals?.RR || '',
                  weight: appointment?.vitals?.weight || '',
                  height: appointment?.vitals?.height || '',
                  spo2: appointment?.vitals?.spo2 || '',
                  bmi: ''
                });
                toast.success('Reset vitals to initial values');
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
            >
              Reset Vitals
            </button>

            <Button
              onClick={async () => {
                if (!appointment?._id) return;
                try {
                  await api.put(`/operations/appointments/${appointment._id}/vitals`, { vitals });
                  toast.success('Vitals updated successfully!');
                  queryClient.invalidateQueries(['appointmentConsultationWorkspace', consultationId]);
                  setIsEditVitalsModalOpen(false);
                } catch (err) {
                  toast.error('Failed to save vitals');
                }
              }}
              variant="primary"
              className="text-xs font-bold uppercase tracking-wider bg-[#3563F6] hover:bg-blue-700 text-white"
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
        patientHistory={patientHistory}
        onCopyPrescription={(rxItems) => {
          const formattedMeds = rxItems.map(item => ({
            id: String(Date.now() + Math.random()),
            medicineName: item.medicineName,
            morning: item.morning || '1',
            afternoon: item.afternoon || '0',
            night: item.night || '1',
            duration: item.duration || '5 Days',
            food: item.instructions || 'After Food',
            quantity: item.quantity || 10,
            remarks: item.notes || ''
          }));
          setPrescriptionsList(prev => [...prev.filter(p => p.medicineName.trim()), ...formattedMeds]);
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
                <span>Doctor: {visit.doctorId?.name || 'N/A'}</span>
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
                <span>Doctor: {rx.doctorId?.name || 'N/A'}</span>
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
              Cancel
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
                className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${
                  selectedDeliveryMethod === 'internal_pharmacy'
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
                className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${
                  selectedDeliveryMethod === 'external_print'
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
                Cancel
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

      {/* Patient History Modal Drawer */}
      <PatientHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        patient={appointment?.patientId}
        patientHistory={patientHistory}
        onCopyPrescription={(rxItems) => {
          if (!rxItems || rxItems.length === 0) return;
          const formatted = rxItems.map(p => ({
            id: String(Date.now() + Math.random()),
            medicineId: p.medicineId || '',
            medicineName: p.medicineName,
            morning: p.morning || '1',
            afternoon: p.afternoon || '0',
            night: p.night || '1',
            food: p.instructions || p.foodTiming || 'After Food',
            duration: p.duration || '5 Days',
            quantity: p.quantity || 10,
            remarks: p.notes || p.remarks || ''
          }));
        }}
      />

        </div>
      </div>
    </div>
  );
};

export default DoctorConsultation;
