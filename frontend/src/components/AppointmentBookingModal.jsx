import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from './Modal';
import Button from './Button';
import OpdTokenPrintModal from './OpdTokenPrintModal';
import MobileNumber from './MobileNumber';
import Input from './Input';
import {
  Search, CheckCircle2, Printer, ArrowRight, UserCheck,
  Clock, RefreshCw, Ticket, AlertTriangle, ShieldAlert,
  CreditCard, DollarSign, Lock, AlertCircle, ShieldCheck, FileText
} from 'lucide-react';
import { formatTimeTo12Hr } from '../utils/timeFormat';
import { useAuth } from '../context/AuthContext';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { useNavigate } from 'react-router-dom';
import { workflowRealtime } from '../services/workflowRealtimeService';

const COMPLAINT_CHIPS = [
  'Fever', 'Cough', 'Cold', 'Headache',
  'Stomach Pain', 'Vomiting', 'Body Pain', 'Allergy',
  'Injury'
];

const AppointmentBookingModal = ({ isOpen, onClose, initialPatient = null, onSuccess }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  const getLocalDateString = (d = new Date()) => d.toLocaleDateString('en-CA');
  const todayStr = getLocalDateString();

  // Dialog Steps: 'form' | 'success'
  const [step, setStep] = useState('form');

  // Search & Patient selection
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Quick Patient Reg Form
  const [quickPatient, setQuickPatient] = useState({
    name: '',
    mobileNumber: '',
    age: '',
    gender: '',
    bloodGroup: '',
    place: ''
  });

  const { billingSettings } = useBillingSettings();

  // Chief Complaint Chips & Additional Notes
  const [selectedComplaints, setSelectedComplaints] = useState([]);
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Consulting Doctor
  const [doctorId, setDoctorId] = useState('');

  // Workflow Payment States
  const [paymentStatus, setPaymentStatus] = useState('Pending'); // 'Pending' | 'Paid' | 'Exempt'
  const [paymentMethod, setPaymentMethod] = useState('Cash'); // 'Cash' | 'UPI' | 'Card' | 'Credit'
  const [customFee, setCustomFee] = useState(500);

  const [currentLocalTimeStr, setCurrentLocalTimeStr] = useState(
    new Date().toTimeString().split(' ')[0].substring(0, 5)
  );

  // Print & Success Data
  const [activePrintModal, setActivePrintModal] = useState(null);
  const [completedBooking, setCompletedBooking] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Validation Errors State
  const [formErrors, setFormErrors] = useState({});

  // Doctor Online Presence Map
  const [doctorPresenceMap, setDoctorPresenceMap] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setFormErrors({});
    api.get('/operations/doctors/presence')
      .then(res => setDoctorPresenceMap(res.data?.data || {}))
      .catch(() => {});

    const unsubscribe = workflowRealtime.subscribe(evt => {
      if (evt.type === 'DOCTOR_PRESENCE_UPDATED' && evt.doctorId) {
        setDoctorPresenceMap(prev => ({
          ...prev,
          [evt.doctorId]: evt.isOnline
        }));
      }
    });

    return () => unsubscribe();
  }, [isOpen]);

  // Sync initial patient & reset payment state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentStatus('Pending');
      setPaymentMethod('Cash');
      if (initialPatient) {
        setSelectedPatient(initialPatient);
      }
    }
  }, [isOpen, initialPatient]);

  // Keep current time updated
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLocalTimeStr(new Date().toTimeString().split(' ')[0].substring(0, 5));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch doctors
  const { data: doctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data.data;
    },
    enabled: isOpen
  });

  // Sync doctor fee
  useEffect(() => {
    if (doctorId && doctors) {
      const doc = doctors.find(d => d._id === doctorId);
      if (doc?.doctorProfile?.consultationFee) {
        setCustomFee(doc.doctorProfile.consultationFee);
      }
    }
  }, [doctorId, doctors]);

  // Live Patient Search Query
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['patients', 'search_modal', patientSearchQuery],
    queryFn: async () => {
      if (!patientSearchQuery || patientSearchQuery.trim().length < 1) return [];
      const res = await api.get(`/operations/patients/search?query=${encodeURIComponent(patientSearchQuery)}`);
      return res.data.data;
    },
    enabled: isOpen && patientSearchQuery.trim().length >= 1
  });

  // Fetch today's appointments for Queue Position estimation
  const { data: bookingDayAppointments } = useQuery({
    queryKey: ['appointments', 'booking-day-modal', doctorId, todayStr],
    queryFn: async () => {
      if (!doctorId) return [];
      const res = await api.get(`/operations/appointments?doctorId=${doctorId}&date=${todayStr}`);
      return res.data.data;
    },
    enabled: isOpen && !!doctorId
  });

  // Fetch patient medical history for Follow-up detection
  const { data: patientHistory } = useQuery({
    queryKey: ['patientHistoryModal', selectedPatient?._id],
    queryFn: async () => {
      if (!selectedPatient?._id) return null;
      const res = await api.get(`/operations/patients/${selectedPatient._id}/history`);
      return res.data.data;
    },
    enabled: isOpen && !!selectedPatient?._id
  });

  const selectedDoctor = useMemo(() => {
    return doctors?.find(d => d._id === doctorId);
  }, [doctors, doctorId]);

  // Automatic Follow-up & Consultation Fee Calculation
  const consultationDetails = useMemo(() => {
    if (!selectedDoctor) return null;

    const profile = selectedDoctor.doctorProfile || {};
    const fees = profile.consultationFees || {};

    let isFollowup = false;
    if (patientHistory && patientHistory.appointments && patientHistory.appointments.length > 0) {
      const lastApp = patientHistory.appointments[0];
      const lastDate = new Date(lastApp.date || lastApp.createdAt);
      const daysDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
      const validity = fees.validityDays || 7;
      if (daysDiff <= validity) {
        isFollowup = true;
      }
    }

    const type = isFollowup ? 'Follow-up Consultation' : 'General Consultation';
    const amount = isFollowup ? (fees.followup || 300) : (fees.general || profile.consultationFee || 500);

    return {
      type,
      amount,
      validityDays: fees.validityDays || 7,
      isFollowup
    };
  }, [selectedDoctor, patientHistory]);

  const queueEstimate = useMemo(() => {
    if (!bookingDayAppointments) return { queuePosition: 1, estimatedTime: formatTimeTo12Hr(currentLocalTimeStr) };
    const activeApps = bookingDayAppointments.filter(a => a.status !== 'Cancelled');
    return {
      queuePosition: activeApps.length + 1,
      estimatedTime: formatTimeTo12Hr(currentLocalTimeStr)
    };
  }, [bookingDayAppointments, currentLocalTimeStr]);

  const handleToggleComplaint = (chip) => {
    if (chip === 'Other') {
      if (selectedComplaints.includes('Other')) {
        setSelectedComplaints(prev => prev.filter(c => c !== 'Other'));
        setAdditionalNotes('');
      } else {
        setSelectedComplaints(prev => [...prev, 'Other']);
      }
    } else {
      if (selectedComplaints.includes(chip)) {
        setSelectedComplaints(prev => prev.filter(c => c !== chip));
      } else {
        setSelectedComplaints(prev => [...prev, chip]);
      }
    }
  };

  const isOtherSelected = selectedComplaints.includes('Other');

  const handleResetModal = () => {
    setStep('form');
    setSelectedPatient(null);
    setPatientSearchQuery('');
    setQuickPatient({
      name: '',
      mobileNumber: '',
      age: '',
      gender: 'Male',
      bloodGroup: 'O+',
      place: ''
    });
    setSelectedComplaints([]);
    setAdditionalNotes('');
    setDoctorId('');
    setPaymentStatus('Pending');
    setPaymentMethod('Cash');
    setCompletedBooking(null);
    setActivePrintModal(null);
  };

  const handleClose = () => {
    handleResetModal();
    onClose();
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setPatientSearchQuery('');
    setIsSearchFocused(false);
  };

  const handleGenerateToken = async (mode = 'generate') => {
    // mode: 'generate' | 'emergency' | 'save_only'
    const isEmergency = mode === 'emergency';
    const isSaveOnly = mode === 'save_only';

    let targetPatientId = selectedPatient?._id;
    let targetPatientObj = selectedPatient;

    const newErrors = {};

    if (!targetPatientId) {
      if (!quickPatient.name || !quickPatient.name.trim()) {
        newErrors.quickName = 'Patient Name is required.';
      }
      if (!quickPatient.mobileNumber || !/^[6-9]\d{9}$/.test(quickPatient.mobileNumber.replace(/[\s\-\(\)]/g, ''))) {
        newErrors.quickMobile = 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).';
      }
      const ageNum = Number(quickPatient.age);
      if (!quickPatient.age) {
        newErrors.quickAge = 'Patient Age is required.';
      } else if (isNaN(ageNum) || ageNum <= 0 || ageNum > 120) {
        newErrors.quickAge = 'Age must be a positive number (1-120).';
      }
      if (!quickPatient.gender) {
        newErrors.quickGender = 'Please select Gender.';
      }
    }

    if (!doctorId) {
      newErrors.doctorId = 'Please select a Consulting Doctor.';
    }

    if (isOtherSelected && (!additionalNotes || !additionalNotes.trim())) {
      newErrors.additionalNotes = 'Please describe the complaint in Additional Notes.';
    }

    if (Object.keys(newErrors).length > 0) {
      setFormErrors(newErrors);
      return;
    }
    setFormErrors({});

    // Payment validation check if Reception collects payment before consultation
    const isReceptionBefore = billingSettings.feeCollectionRole === 'Reception' && billingSettings.paymentTiming === 'Before Consultation';
    if (isReceptionBefore && !isSaveOnly && paymentStatus === 'Pending') {
      toast.error('Payment is Pending. Please collect payment or click "Save Registration".');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create Patient Profile if Quick Reg
      if (!targetPatientId) {
        const patientPayload = {
          name: quickPatient.name.trim(),
          mobileNumber: quickPatient.mobileNumber,
          gender: quickPatient.gender,
          bloodGroup: quickPatient.bloodGroup || 'O+',
          age: Number(quickPatient.age) || 0,
          address: quickPatient.place?.trim() || undefined
        };

        const regRes = await api.post('/operations/patients', patientPayload);
        targetPatientObj = regRes.data.data;
        targetPatientId = targetPatientObj._id;
        if (regRes.data.isExisting) {
          toast.success(`Using existing patient profile: ${targetPatientObj.name} (${targetPatientObj.uhid})`);
        } else {
          toast.success(`Patient profile registered: ${targetPatientObj.uhid}`);
        }
      }

      // 2. Format Chief Complaints Text
      const complaintsList = selectedComplaints.filter(c => c !== 'Other');
      if (isOtherSelected && additionalNotes.trim()) {
        complaintsList.push(`Other: ${additionalNotes.trim()}`);
      }
      const complaintSummary = complaintsList.join(', ');

      const finalConsultType = isEmergency 
        ? 'Emergency Consultation' 
        : (consultationDetails?.type || 'General Consultation');

      const isPaid = paymentStatus === 'Paid' || paymentStatus === 'Exempt';
      const billingStatus = isPaid ? (paymentStatus === 'Exempt' ? 'Exempt' : 'Paid') : (isReceptionBefore ? 'Unpaid' : 'Pending');

      // 3. Generate Token via Appointment API
      const appPayload = {
        patientId: targetPatientId,
        doctorId: doctorId,
        date: todayStr,
        time: formatTimeTo12Hr(currentLocalTimeStr),
        consultationType: isEmergency ? 'Emergency' : (consultationDetails?.isFollowup ? 'Follow-Up' : 'Walk-In'),
        chiefComplaint: complaintSummary || undefined,
        isEmergency: !!isEmergency,
        consultationFee: Number(customFee) || consultationDetails?.amount || 500,
        billingStatus: billingStatus,
        paymentMethod: paymentMethod,
        workflow: {
          queueState: (isReceptionBefore && billingStatus === 'Unpaid') ? 'WAITING_PAYMENT' : 'READY',
          paymentState: (billingStatus === 'Paid') ? 'PAID' : (billingStatus === 'Exempt' ? 'EXEMPT' : 'UNPAID')
        }
      };

      // 3. Acquire GPS Location for Geofence validation
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        try {
          const getPos = (options) => new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              (err) => reject(err),
              options
            );
          });

          let coords = null;
          try {
            coords = await getPos({ enableHighAccuracy: true, timeout: 6000, maximumAge: 0 });
          } catch (e1) {
            try {
              coords = await getPos({ enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
            } catch (e2) {}
          }

          if (coords?.latitude != null && coords?.longitude != null) {
            appPayload.latitude = coords.latitude;
            appPayload.longitude = coords.longitude;
          }
        } catch (e) {
          console.warn('Location capture notice:', e);
        }
      }

      const appRes = await api.post('/operations/appointments', appPayload);
      const createdApp = appRes.data.data;

      // Invalidate queries
      queryClient.invalidateQueries(['appointments']);
      queryClient.invalidateQueries(['patients']);

      toast.success(isEmergency ? `Emergency Token Assigned: ${createdApp.tokenNumber}` : `Token Assigned: ${createdApp.tokenNumber}`);

      const doctorObj = doctors?.find(d => d._id === doctorId);

      setCompletedBooking({
        appointment: createdApp,
        patient: targetPatientObj,
        doctor: doctorObj,
        queuePosition: queueEstimate.queuePosition,
        estimatedTime: queueEstimate.estimatedTime,
        isEmergency
      });

      setStep('success');

      if (onSuccess) {
        onSuccess(createdApp);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate OPD Token');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !activePrintModal}
        onClose={handleClose}
        size="booking"
        title={step === 'form' ? 'GENERATE OPD TOKEN' : 'TOKEN GENERATED SUCCESSFULLY'}
      >
        {step === 'form' ? (
          <div className="space-y-4 text-left font-sans">

            {/* SECTION 1: SEARCH EXISTING PATIENT */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-[#2F63F2]" />
                  SEARCH PATIENT
                </span>
                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                  Search by Mobile, UHID, Patient ID, or Name
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by Mobile Number, UHID, Patient ID or Patient Name..."
                  value={patientSearchQuery}
                  onChange={(e) => {
                    setPatientSearchQuery(e.target.value);
                    setIsSearchFocused(true);
                  }}
                  onFocus={() => setIsSearchFocused(true)}
                  className="enterprise-input w-full h-[46px] text-xs font-medium bg-white border border-slate-300 focus:border-[#2F63F2] focus:ring-2 focus:ring-[#2F63F2]/10 transition-all rounded-xl pl-3.5 pr-9"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-3 text-slate-400 animate-spin">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                )}

                {/* Live Search Results Dropdown */}
                {isSearchFocused && patientSearchQuery.trim().length >= 1 && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsSearchFocused(false)} />
                    <div className="absolute top-[52px] left-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-[220px] overflow-y-auto divide-y divide-slate-100 font-sans">
                      {searchResults && searchResults.length > 0 ? (
                        searchResults.map((p) => (
                          <button
                            key={p._id}
                            type="button"
                            onClick={() => handleSelectPatient(p)}
                            className="w-full text-left p-3 hover:bg-blue-50/60 transition-colors flex items-center justify-between group"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-900 group-hover:text-[#2F63F2]">{p.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                UHID: <strong>{p.uhid}</strong> | Mobile: {p.mobileNumber} | {p.gender}, {p.age} Yrs
                              </p>
                            </div>
                            <span className="text-[10px] font-bold text-[#2F63F2] bg-[#2F63F2]/10 px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                              Select Patient ✓
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-xs text-amber-600 bg-amber-50/50 font-medium">
                          No existing patient found. Receptionist can fill Quick Registration details below.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* SECTION 2: PATIENT DETAILS */}
            {selectedPatient ? (
              /* Selected Existing Patient Banner */
              <div className="flex items-center justify-between p-3 bg-blue-50/80 border border-blue-200 rounded-xl font-sans">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider">
                    Existing Patient Auto-Filled ✓
                  </span>
                  <span className="font-bold text-slate-900 text-sm">{selectedPatient.name}</span>
                  <span className="text-slate-500 font-mono text-xs">UHID: {selectedPatient.uhid}</span>
                  <span className="text-slate-500">| Mobile: {selectedPatient.mobileNumber}</span>
                  <span className="text-slate-500">| {selectedPatient.age} Yrs, {selectedPatient.gender}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs font-bold text-[#2F63F2] hover:underline flex-shrink-0"
                >
                  Change
                </button>
              </div>
            ) : (
              /* New Patient Details - 2 Row 3-Column Grid */
              <div className="space-y-3 pt-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 pl-0.5">
                  Patient Details
                </h4>

                {/* Row 1: Mobile Number, Patient Name / Number, Age */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MobileNumber
                    label="Mobile Number"
                    numberValue={quickPatient.mobileNumber}
                    onNumberChange={(val) => {
                      let cleanVal = val.replace(/[^0-9]/g, '');
                      if (cleanVal.length > 10) cleanVal = cleanVal.slice(0, 10);
                      setQuickPatient({ ...quickPatient, mobileNumber: cleanVal });
                      if (formErrors.quickMobile) setFormErrors(prev => ({ ...prev, quickMobile: undefined }));
                    }}
                    required
                    error={formErrors.quickMobile}
                  />

                  <Input
                    label="Patient Name / Number"
                    placeholder="Enter full name or number"
                    value={quickPatient.name}
                    onChange={(e) => {
                      setQuickPatient({ ...quickPatient, name: e.target.value });
                      if (formErrors.quickName) setFormErrors(prev => ({ ...prev, quickName: undefined }));
                    }}
                    required
                    error={formErrors.quickName}
                  />

                  <Input
                    label="Age"
                    type="number"
                    min={1}
                    max={120}
                    placeholder="e.g. 32"
                    value={quickPatient.age}
                    onChange={(e) => {
                      const cleanVal = e.target.value.replace(/[^0-9]/g, '');
                      setQuickPatient({ ...quickPatient, age: cleanVal });
                      if (formErrors.quickAge) setFormErrors(prev => ({ ...prev, quickAge: undefined }));
                    }}
                    required
                    error={formErrors.quickAge}
                  />
                </div>

                {/* Row 2: Gender, Place / Village, Blood Group */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">Gender <span className="text-[#EF4444]">*</span></label>
                    <select
                      className={`enterprise-input h-[44px] ${formErrors.quickGender ? 'border-[#EF4444] focus:ring-[#EF4444]/10 focus:border-[#EF4444]' : ''}`}
                      value={quickPatient.gender}
                      onChange={(e) => {
                        setQuickPatient({ ...quickPatient, gender: e.target.value });
                        if (formErrors.quickGender) setFormErrors(prev => ({ ...prev, quickGender: undefined }));
                      }}
                      required
                    >
                      <option value="" disabled>-- Select Gender --</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                    {formErrors.quickGender && <span className="text-xs text-[#EF4444] pl-1 mt-0.5">{formErrors.quickGender}</span>}
                  </div>

                  <Input
                    label="Place / Village (Optional)"
                    placeholder="Enter city or village"
                    value={quickPatient.place}
                    onChange={(e) => setQuickPatient({ ...quickPatient, place: e.target.value })}
                  />

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">Blood Group (Optional)</label>
                    <select
                      className="enterprise-input h-[44px]"
                      value={quickPatient.bloodGroup}
                      onChange={(e) => setQuickPatient({ ...quickPatient, bloodGroup: e.target.value })}
                    >
                      <option value="">-- Select Blood Group --</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* CHIEF COMPLAINT CHIPS SECTION */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Reason for Visit (Optional)
              </label>

              <div className="flex flex-wrap gap-2">
                {COMPLAINT_CHIPS.map((chip) => {
                  const isSelected = selectedComplaints.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleToggleComplaint(chip)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-[#2F63F2] text-white border-[#2F63F2] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}

                {/* + Other Chip */}
                <button
                  type="button"
                  onClick={() => handleToggleComplaint('Other')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                    isOtherSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  + Other
                </button>
              </div>

              {/* Smoothly Expanded Additional Notes Textarea if "Other" is selected */}
              {isOtherSelected && (
                <div className="pt-2 transition-all duration-300 ease-in-out">
                  <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Additional Notes *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Describe the patient's complaint..."
                    value={additionalNotes}
                    onChange={(e) => {
                      setAdditionalNotes(e.target.value);
                      if (formErrors.additionalNotes) setFormErrors(prev => ({ ...prev, additionalNotes: undefined }));
                    }}
                    required={isOtherSelected}
                    className={`enterprise-input w-full p-2.5 text-xs border rounded-xl focus:ring-2 ${
                      formErrors.additionalNotes ? 'border-[#EF4444] focus:ring-[#EF4444]/10 focus:border-[#EF4444]' : 'border-slate-300 focus:border-[#2F63F2] focus:ring-[#2F63F2]/10'
                    }`}
                  />
                  {formErrors.additionalNotes && <span className="text-xs text-[#EF4444] pl-1 mt-0.5 block">{formErrors.additionalNotes}</span>}
                </div>
              )}
            </div>

            {/* CONSULTING DOCTOR SECTION */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Consulting Doctor *
                </label>
                <select
                  className={`enterprise-input h-[46px] ${
                    formErrors.doctorId ? 'border-[#EF4444] focus:ring-[#EF4444]/10 focus:border-[#EF4444]' : ''
                  }`}
                  value={doctorId}
                  onChange={(e) => {
                    setDoctorId(e.target.value);
                    if (formErrors.doctorId) setFormErrors(prev => ({ ...prev, doctorId: undefined }));
                  }}
                  required
                >
                  <option value="">-- Select Consulting Doctor --</option>
                  {doctors?.map(d => {
                    const isOnline = Boolean(doctorPresenceMap[d._id]);
                    return (
                      <option key={d._id} value={d._id}>
                        {isOnline ? '🟢' : '⚪'} {d.name} ({d.departmentId?.name || 'OPD'}) — {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </option>
                    );
                  })}
                </select>
                {formErrors.doctorId && <span className="text-xs text-[#EF4444] pl-1 mt-0.5 block">{formErrors.doctorId}</span>}
              </div>

              {/* Live Token Queue Position Estimate Banner & Consultation Info Card */}
              {doctorId && (
                <div className="mt-3 space-y-3">
                  <div className="p-2.5 bg-[#2F63F2]/5 border border-[#2F63F2]/15 rounded-xl flex items-center justify-between text-xs font-sans">
                    <div className="flex items-center gap-3">
                      <Ticket className="w-4 h-4 text-[#2F63F2]" />
                      <span className="text-slate-600 font-medium">Est. Next Token:</span>
                      <strong className="text-[#2F63F2] font-mono font-bold text-sm">OP{String(queueEstimate.queuePosition).padStart(3, '0')}</strong>
                    </div>
                    <span className="text-slate-500 font-mono text-[11px]">
                      Queue Pos: <strong>#{queueEstimate.queuePosition}</strong>
                    </span>
                  </div>

                  {/* 2. WORKFLOW-DRIVEN PAYMENT SECTION */}
                  {billingSettings.feeCollectionRole === 'Reception' ? (
                    <div className="p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl text-xs space-y-3 font-sans">
                      <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-[#2F63F2]" />
                          Consultation Fee Collection (Receptionist — {billingSettings.paymentTiming})
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          paymentStatus === 'Paid' 
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                            : paymentStatus === 'Exempt' 
                            ? 'bg-blue-100 text-blue-800 border-blue-300' 
                            : billingSettings.paymentTiming === 'After Consultation'
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          {paymentStatus === 'Paid' ? '✓ Paid' : (billingSettings.paymentTiming === 'After Consultation' && paymentStatus === 'Pending' ? 'Pay After Consult' : paymentStatus)}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 font-semibold text-xs">Consultation Fee:</span>
                          <div className="relative flex items-center">
                            <span className="absolute left-2.5 text-xs font-bold text-[#2F63F2]">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={customFee}
                              onChange={(e) => setCustomFee(Math.max(0, Number(e.target.value) || 0))}
                              className="w-20 pl-6 pr-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono text-[#2F63F2] focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20"
                            />
                          </div>
                        </div>

                        {billingSettings.paymentTiming === 'Before Consultation' ? (
                          paymentStatus === 'Pending' ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="p-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white"
                              >
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Card">Card</option>
                                <option value="Credit">Credit</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentStatus('Paid');
                                  toast.success(`Payment ₹${consultationDetails?.amount || 500} collected via ${paymentMethod}`);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 transition-all shadow-xs flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Collect Payment
                              </button>
                            </div>
                          ) : (
                            <div className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              <span>Payment Completed ({paymentMethod})</span>
                            </div>
                          )
                        ) : (
                          <div className="text-slate-600 font-medium text-[11px] flex items-center gap-1 bg-purple-50 p-2 rounded-lg border border-purple-100">
                            <Clock className="w-3.5 h-3.5 text-purple-600" />
                            <span><strong>After Consultation Policy:</strong> Patient will consult doctor first. Receptionist will collect fee after consultation.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : billingSettings.feeCollectionRole === 'Doctor' ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-amber-600" />
                      <span><strong>Doctor Fee Collection Policy:</strong> Doctor will collect consultation fee directly in clinical workspace.</span>
                    </div>
                  ) : billingSettings.feeCollectionRole === 'Pharmacy' ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <span><strong>Pharmacy Fee Collection Policy:</strong> Consultation fee will be collected by Pharmacy with medicine bill.</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* ENHANCED WORKFLOW-AWARE FOOTER */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-sans">
                {consultationDetails && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Fee:</span>
                    <strong className="text-slate-900 font-mono">₹{consultationDetails.amount}</strong>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">Status:</span>
                    <span className={`font-bold ${paymentStatus === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {paymentStatus === 'Paid' ? '✓ Paid' : paymentStatus}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleGenerateToken('save_only')}
                  disabled={submitting}
                  className="px-3.5 h-[42px] text-xs font-bold uppercase tracking-wider rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all border border-slate-300 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <span>Save Registration</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateToken('generate')}
                  disabled={submitting}
                  className="px-5 h-[42px] text-xs font-bold uppercase tracking-wider rounded-xl bg-[#2F63F2] text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Ticket className="w-4 h-4" />
                  <span>Generate Token</span>
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* SUCCESS STEP */
          <div className="space-y-6 text-center font-sans py-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {completedBooking?.isEmergency ? 'Emergency Token Assigned' : 'OPD Token Generated Successfully'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Patient placed in doctor's waiting queue.</p>
            </div>

            {/* Summary Grid */}
            {completedBooking && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-lg mx-auto text-left font-sans text-xs space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Token Number</span>
                  <span className="text-2xl font-black text-[#2F63F2] font-mono">{completedBooking.appointment?.tokenNumber}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Patient Name</span>
                    <span className="font-bold text-slate-800">{completedBooking.patient?.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">UHID / Patient ID</span>
                    <span className="font-bold text-slate-800 font-mono">{completedBooking.patient?.uhid}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Consulting Doctor</span>
                    <span className="font-bold text-slate-800">{completedBooking.doctor?.name || 'OPD Consultant'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Visit Type</span>
                    <span className="font-bold text-slate-800">{completedBooking.appointment?.consultationType}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                type="button"
                onClick={() => setActivePrintModal('token')}
                variant="secondary"
                icon={Printer}
                className="text-xs font-bold uppercase tracking-wider px-4 h-[42px]"
              >
                Print Token
              </Button>

              <Button
                type="button"
                onClick={handleResetModal}
                variant="secondary"
                icon={RefreshCw}
                className="text-xs font-bold uppercase tracking-wider px-4 h-[42px]"
              >
                Generate Another
              </Button>

              <Button
                type="button"
                onClick={() => {
                  handleClose();
                  navigate('/reception/appointments');
                }}
                variant="primary"
                icon={ArrowRight}
                className="text-xs font-bold uppercase tracking-wider px-5 h-[42px] bg-[#2F63F2]"
              >
                Go to Queue
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* PRINT TOKEN SLIP MODAL */}
      <OpdTokenPrintModal
        isOpen={activePrintModal === 'token' && !!completedBooking}
        onClose={() => setActivePrintModal(null)}
        appointment={{
          tokenNumber: completedBooking?.appointment?.tokenNumber,
          patientId: { name: completedBooking?.patient?.name },
          doctorId: { name: completedBooking?.doctor?.name || 'OPD Consultant' },
          date: completedBooking?.appointment?.date || new Date(),
          slotTime: completedBooking?.appointment?.slotTime || completedBooking?.appointment?.time
        }}
      />
    </>
  );
};

export default AppointmentBookingModal;
