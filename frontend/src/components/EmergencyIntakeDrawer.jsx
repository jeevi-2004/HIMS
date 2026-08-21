import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  AlertTriangle, X, Search, UserPlus, CheckCircle2, FileText, 
  Heart, ChevronDown, ChevronUp, Siren, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../services/api';

const COMPLAINT_CHIPS = [
  'Chest Pain', 'Road Traffic Accident', 'Stroke', 'Head Injury', 
  'Fracture', 'Burn', 'Poisoning', 'Snake Bite', 'Animal Bite', 
  'Breathing Difficulty', 'Severe Bleeding', 'Unconscious', 'Seizure', 'Other'
];

const EmergencyIntakeDrawer = ({ isOpen, onClose, doctors = [], onSuccess }) => {
  const [currentLocalTime, setCurrentLocalTime] = useState(
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  // Live timer for clean header
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLocalTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Hospital Billing Settings for Emergency Token Prefix
  const { data: billingSettings } = useQuery({
    queryKey: ['billingSettings'],
    queryFn: async () => {
      const res = await api.get('/admin/billing-settings');
      return res.data.data;
    },
    enabled: isOpen
  });

  // Card 1: Mode - 'UNKNOWN' vs 'KNOWN'
  const [identityMode, setIdentityMode] = useState('UNKNOWN');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Left Panel: Unknown Patient
  const [unknownForm, setUnknownForm] = useState({
    gender: 'Male',
    ageGroup: 'Adult',
    estimatedAge: '35',
    approxName: 'Unknown Male',
    relativeMobile: ''
  });

  // Card 2: Emergency Assessment
  const [selectedComplaintChip, setSelectedComplaintChip] = useState('Chest Pain');
  const [otherComplaintText, setOtherComplaintText] = useState('');

  // Doctor Routing & Essential Vitals
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [arrivalMode, setArrivalMode] = useState('Ambulance');
  const [consultationFee, setConsultationFee] = useState(500);

  const [vitals, setVitals] = useState({
    conscious: 'Yes',
    breathing: 'Difficulty',
    pulse: '110',
    bp: '140/90',
    // Collapsed Advanced Vitals
    spO2: '94',
    temperature: '98.6',
    bloodSugar: '130',
    respRate: '20',
    weight: '',
    height: '',
    painScale: '7/10',
    locationFound: 'Roadside / Public Place',
    broughtByName: 'Ambulance Crew'
  });

  // Collapsed Advanced Vitals Toggle
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-select first available doctor
  useEffect(() => {
    if (doctors && doctors.length > 0 && !selectedDoctorId) {
      setSelectedDoctorId(doctors[0]._id);
      if (doctors[0].doctorProfile?.consultationFee) {
        setConsultationFee(doctors[0].doctorProfile.consultationFee);
      }
    }
  }, [doctors, selectedDoctorId]);

  // Update name for Unknown Patient
  useEffect(() => {
    if (identityMode === 'UNKNOWN') {
      setUnknownForm(prev => ({
        ...prev,
        approxName: `Unknown ${prev.gender} (${prev.ageGroup})`
      }));
    }
  }, [unknownForm.gender, unknownForm.ageGroup, identityMode]);

  // Search Known Patient
  const handleSearchPatient = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await api.get(`/operations/patients?search=${encodeURIComponent(searchQuery.trim())}`);
      const list = res.data?.data || [];
      setSearchResults(list);
      if (list.length === 0) {
        toast.error('No matching patient found');
      }
    } catch {
      toast.error('Failed to search patient');
    } finally {
      setSearching(false);
    }
  };

  const getSelectedDoctorObj = () => {
    return doctors.find(d => d._id === selectedDoctorId) || doctors[0];
  };

  // Submit Emergency Intake & Generate Token
  const handleSubmitEmergencyIntake = async () => {
    if (!selectedDoctorId) {
      toast.error('Please assign a consulting doctor');
      return;
    }

    setSubmitting(true);
    try {
      let patientIdToUse = selectedPatient?._id;

      // Register Unknown Patient
      if (identityMode === 'UNKNOWN') {
        const tempIdCode = `EMG-TEMP-${Math.floor(100 + Math.random() * 900)}`;
        const generatedMobile = unknownForm.relativeMobile && unknownForm.relativeMobile.trim().length >= 10
          ? unknownForm.relativeMobile.trim()
          : `9${Math.floor(100000000 + Math.random() * 900000000)}`;

        const createPatientPayload = {
          name: unknownForm.approxName || `Unknown ${unknownForm.gender}`,
          gender: unknownForm.gender,
          age: parseInt(unknownForm.estimatedAge, 10) || 35,
          mobileNumber: generatedMobile,
          isUnknownPatient: true,
          tempId: tempIdCode,
          locationFound: vitals.locationFound,
          broughtBy: {
            name: vitals.broughtByName,
            phone: generatedMobile,
            relation: 'Bystander'
          }
        };

        const patientRes = await api.post('/operations/patients', createPatientPayload);
        patientIdToUse = patientRes.data?.data?._id;
      }

      if (!patientIdToUse) {
        toast.error('Please select or register a patient');
        setSubmitting(false);
        return;
      }

      const finalComplaint = selectedComplaintChip === 'Other'
        ? otherComplaintText || 'Emergency Condition'
        : selectedComplaintChip;

      const todayStr = new Date().toLocaleDateString('en-CA');
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const emgPrefix = billingSettings?.emergencyTokenPrefix || 'EMG';

      const emergencyAppPayload = {
        patientId: patientIdToUse,
        doctorId: selectedDoctorId,
        date: todayStr,
        time: timeStr,
        consultationType: 'Emergency',
        chiefComplaint: finalComplaint,
        isEmergency: true,
        priorityLevel: 'EMERGENCY', // Always Emergency Priority Override #1
        tokenPrefix: emgPrefix,
        status: 'Arrived',
        queueStatus: 'Waiting',
        arrivalMode: arrivalMode,
        consultationFee: consultationFee || 500,
        billingStatus: 'Unpaid',
        vitals: vitals,
        workflow: {
          queueState: 'WAITING',
          paymentState: 'UNPAID'
        }
      };

      const appRes = await api.post('/operations/appointments', emergencyAppPayload);
      const createdApp = appRes.data?.data;

      toast.success(`🚨 Emergency Token Generated: #${createdApp?.tokenNumber || 'EMG-01'}`);
      
      if (onSuccess) onSuccess(createdApp);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate emergency token');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const docObj = getSelectedDoctorObj();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 font-sans select-none">
        {/* Subtle Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
        />

        {/* Centered Modal Workspace (1100px width max, 90vh height max) */}
        <motion.div
          initial={{ scale: 0.98, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.98, opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-[1100px] max-h-[90vh] bg-[#F8FAFC] rounded-2xl shadow-xl border border-[#E5E7EB] flex flex-col z-10 overflow-hidden text-left"
        >
          {/* CLEAN PAGE HEADER (NO DARK BACKGROUND, NO BANNER) */}
          <div className="bg-white p-5 px-6 border-b border-[#E5E7EB] shrink-0 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
                <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">
                  Emergency Intake
                </h1>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Immediate registration for emergency patients.
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right font-mono">
                <span className="text-slate-400 text-[10px] uppercase font-semibold block">Current Time</span>
                <span className="font-bold text-slate-800 text-sm">{currentLocalTime}</span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* MAIN SCROLLABLE BODY (EXACTLY TWO PRIMARY CARDS) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* CARD 1: ① PATIENT IDENTIFICATION */}
            <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-2xs space-y-4">
              <h2 className="text-[20px] font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center border border-slate-200">
                  1
                </span>
                <span>Patient Identification</span>
              </h2>

              {/* SPLIT INTO TWO EQUAL PANELS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* LEFT PANEL: UNKNOWN PATIENT (ONE CLICK) */}
                <div
                  onClick={() => {
                    setIdentityMode('UNKNOWN');
                    setSelectedPatient(null);
                  }}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                    identityMode === 'UNKNOWN'
                      ? 'bg-rose-50/30 border-rose-500 ring-1 ring-rose-500/20'
                      : 'bg-white border-[#E5E7EB] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <input 
                        type="radio" 
                        name="identityMode" 
                        checked={identityMode === 'UNKNOWN'} 
                        onChange={() => setIdentityMode('UNKNOWN')}
                        className="w-4 h-4 text-rose-600 cursor-pointer"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Unknown Patient</h3>
                        <p className="text-xs text-slate-500">One-click emergency registration</p>
                      </div>
                    </div>
                  </div>

                  {identityMode === 'UNKNOWN' && (
                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <div>
                        <label className="text-[14px] font-medium text-slate-600 block mb-1">Gender <span className="text-rose-500">*</span></label>
                        <select
                          value={unknownForm.gender}
                          onChange={(e) => setUnknownForm({ ...unknownForm, gender: e.target.value })}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[14px] font-medium text-slate-600 block mb-1">Estimated Age <span className="text-rose-500">*</span></label>
                          <input
                            type="number"
                            min="1"
                            max="120"
                            onWheel={(e) => e.target.blur()}
                            onKeyDown={(e) => { if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') e.preventDefault(); }}
                            value={unknownForm.estimatedAge}
                            onChange={(e) => setUnknownForm({ ...unknownForm, estimatedAge: e.target.value.replace(/[^0-9]/g, '') })}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                            placeholder="35"
                          />
                        </div>

                        <div>
                          <label className="text-[14px] font-medium text-slate-600 block mb-1">Relative Mobile</label>
                          <input
                            type="tel"
                            maxLength={10}
                            value={unknownForm.relativeMobile}
                            onChange={(e) => setUnknownForm({ ...unknownForm, relativeMobile: e.target.value })}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                            placeholder="Optional"
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-slate-100/80 border border-[#E5E7EB] rounded-xl text-xs text-slate-700 flex justify-between items-center font-medium">
                        <span>Auto Name: <strong>{unknownForm.approxName}</strong></span>
                        <span className="font-mono text-xs text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-[#E5E7EB] font-bold">
                          EMG-TEMP-001
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT PANEL: EXISTING PATIENT */}
                <div
                  onClick={() => setIdentityMode('KNOWN')}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                    identityMode === 'KNOWN'
                      ? 'bg-blue-50/30 border-[#3563F6] ring-1 ring-[#3563F6]/20'
                      : 'bg-white border-[#E5E7EB] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <input 
                        type="radio" 
                        name="identityMode" 
                        checked={identityMode === 'KNOWN'} 
                        onChange={() => setIdentityMode('KNOWN')}
                        className="w-4 h-4 text-[#3563F6] cursor-pointer"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Existing Patient</h3>
                        <p className="text-xs text-slate-500">Search UHID, Mobile Number, or Name</p>
                      </div>
                    </div>
                  </div>

                  {identityMode === 'KNOWN' && (
                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <form onSubmit={handleSearchPatient} className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Search UHID / Mobile / Patient Name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20"
                        />
                        <button
                          type="submit"
                          disabled={searching}
                          className="px-4 py-2.5 bg-[#3563F6] hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer min-h-[44px]"
                        >
                          {searching ? '...' : 'Search'}
                        </button>
                      </form>

                      {searchResults.length > 0 && (
                        <div className="max-h-36 overflow-y-auto space-y-1.5 border border-[#E5E7EB] rounded-xl p-1.5 bg-white">
                          {searchResults.map((p) => (
                            <div
                              key={p._id}
                              onClick={() => setSelectedPatient(p)}
                              className={`p-2.5 rounded-lg text-xs cursor-pointer flex items-center justify-between ${
                                selectedPatient?._id === p._id ? 'bg-blue-50 text-[#3563F6] font-bold' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div>
                                <span className="font-bold text-slate-900">{p.name}</span>
                                <span className="text-[11px] text-slate-500 ml-2">({p.gender}, {p.age} yrs)</span>
                              </div>
                              <span className="font-mono text-xs text-slate-600">{p.uhid}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedPatient && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                          <div className="flex items-center justify-between font-bold text-sm">
                            <span>{selectedPatient.name}</span>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[11px] text-emerald-800">
                            <span>UHID: <strong>{selectedPatient.uhid}</strong></span>
                            <span>Mobile: <strong>{selectedPatient.mobileNumber}</strong></span>
                            <span>Gender / Age: <strong>{selectedPatient.gender}, {selectedPatient.age} yrs</strong></span>
                            <span>Blood Group: <strong>{selectedPatient.bloodGroup || 'O+'}</strong></span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* CARD 2: ② EMERGENCY ASSESSMENT (THREE SECTIONS WITH SUBTLE DIVIDERS) */}
            <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-2xs space-y-6">
              <h2 className="text-[20px] font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center border border-slate-200">
                  2
                </span>
                <span>Emergency Assessment</span>
              </h2>

              {/* SECTION A: CHIEF COMPLAINT */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Section A — Chief Complaint
                </h3>

                <div className="flex flex-wrap gap-2">
                  {COMPLAINT_CHIPS.map((chip) => {
                    const active = selectedComplaintChip === chip;
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setSelectedComplaintChip(chip)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-[#E5E7EB] hover:bg-slate-100'
                        }`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>

                {selectedComplaintChip === 'Other' && (
                  <textarea
                    rows={2}
                    value={otherComplaintText}
                    onChange={(e) => setOtherComplaintText(e.target.value)}
                    placeholder="Describe emergency complaint..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 mt-2"
                  />
                )}
              </div>

              <hr className="border-[#E5E7EB]" />

              {/* SECTION B: INITIAL ASSESSMENT */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Section B — Initial Assessment
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[14px] font-medium text-slate-600 block mb-1">Conscious</label>
                    <select
                      value={vitals.conscious}
                      onChange={(e) => setVitals({ ...vitals, conscious: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800"
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No (Unconscious)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[14px] font-medium text-slate-600 block mb-1">Breathing</label>
                    <select
                      value={vitals.breathing}
                      onChange={(e) => setVitals({ ...vitals, breathing: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Difficulty">Difficulty</option>
                      <option value="Not Breathing">Not Breathing</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[14px] font-medium text-slate-600 block mb-1">Pulse (bpm)</label>
                    <input
                      type="text"
                      value={vitals.pulse}
                      onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800"
                      placeholder="110"
                    />
                  </div>

                  <div>
                    <label className="text-[14px] font-medium text-slate-600 block mb-1">Blood Pressure</label>
                    <input
                      type="text"
                      value={vitals.bp}
                      onChange={(e) => setVitals({ ...vitals, bp: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800"
                      placeholder="140/90"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-[#E5E7EB]" />

              {/* SECTION C: DOCTOR ROUTING & COLLAPSED ADVANCED VITALS */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Section C — Doctor Routing
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[14px] font-medium text-slate-600 block mb-1">Assign Doctor <span className="text-rose-500">*</span></label>
                    <select
                      value={selectedDoctorId}
                      onChange={(e) => setSelectedDoctorId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800 h-[44px]"
                    >
                      {doctors.map((d) => (
                        <option key={d._id} value={d._id}>
                          Dr. {d.name?.replace(/^Dr\.\s*/i, '')} ({d.departmentId?.name || 'Emergency OPD'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[14px] font-medium text-slate-600 block mb-1">Arrival Mode</label>
                    <select
                      value={arrivalMode}
                      onChange={(e) => setArrivalMode(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold text-slate-800 h-[44px]"
                    >
                      <option value="Ambulance">Ambulance</option>
                      <option value="Walk In">Walk In</option>
                      <option value="Police">Police Escort</option>
                      <option value="Referral Hospital">Referral Hospital</option>
                      <option value="Relative">Relative / Car</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* SMALL EXPANDABLE SECTION: ▼ ADVANCED VITALS */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                    className="text-xs font-semibold text-[#3563F6] hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    {showAdvancedDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <span>{showAdvancedDetails ? 'Hide Advanced Vitals' : '▼ Advanced Vitals'}</span>
                  </button>

                  {showAdvancedDetails && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 mt-2">
                      <div>
                        <label className="text-[14px] font-medium text-slate-500 block mb-1">Temperature (°F)</label>
                        <input
                          type="text"
                          value={vitals.temperature}
                          onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[14px] font-medium text-slate-500 block mb-1">SpO₂ (%)</label>
                        <input
                          type="text"
                          value={vitals.spO2}
                          onChange={(e) => setVitals({ ...vitals, spO2: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[14px] font-medium text-slate-500 block mb-1">Blood Sugar</label>
                        <input
                          type="text"
                          value={vitals.bloodSugar}
                          onChange={(e) => setVitals({ ...vitals, bloodSugar: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[14px] font-medium text-slate-500 block mb-1">Respiratory Rate</label>
                        <input
                          type="text"
                          value={vitals.respRate}
                          onChange={(e) => setVitals({ ...vitals, respRate: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-[#E5E7EB] rounded-xl text-[16px] font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ACTION BAR & SUBMIT BUTTONS AT END OF FORM (NON-STICKY) */}
            <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Emergency Priority</span>
                  <span className="font-extrabold text-rose-600 text-sm flex items-center gap-1">
                    🚨 Emergency <span className="text-[10px] font-mono text-slate-500">(#1 Override)</span>
                  </span>
                </div>

                <div className="border-l border-[#E5E7EB] pl-5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Doctor</span>
                  <span className="font-bold text-slate-900 text-sm">
                    Dr. {docObj?.name?.replace(/^Dr\.\s*/i, '') || 'On Duty'}
                  </span>
                </div>

                <div className="border-l border-[#E5E7EB] pl-5 hidden md:block">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Estimated Wait</span>
                  <span className="font-extrabold text-emerald-600 text-sm">Immediate</span>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitEmergencyIntake}
                  className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
                >
                  <span>{submitting ? 'Generating...' : 'Generate Emergency Token'}</span>
                </button>
              </div>
            </div>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default EmergencyIntakeDrawer;
