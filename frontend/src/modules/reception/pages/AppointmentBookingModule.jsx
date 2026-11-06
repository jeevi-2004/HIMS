import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar as CalendarIcon, Clock, User, CheckCircle2, Search, 
  Stethoscope, Ticket, Check, RefreshCw, X, ChevronDown,
  DollarSign, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import OpdTokenPrintModal from '../../../components/OpdTokenPrintModal';

// Convert 24-hr HH:mm string to 12-hr hh:mm AM/PM format for UI display
const format24To12Hr = (time24) => {
  if (!time24) return '';
  const s = time24.trim();
  if (s.toLowerCase().includes('am') || s.toLowerCase().includes('pm')) return s;
  const parts = s.split(':');
  if (parts.length < 2) return s;
  let h = parseInt(parts[0], 10);
  const m = parts[1].substring(0, 2);
  if (isNaN(h)) return s;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
};

// Normalize any time string (12h or 24h) to internal 24-hr HH:mm format
const normalizeTimeTo24Hr = (tStr) => {
  if (!tStr) return '';
  const s = tStr.trim();
  if (s.toLowerCase().includes('am') || s.toLowerCase().includes('pm')) {
    const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return s;
    let [_, hStr, mStr, ampm] = match;
    let h = parseInt(hStr, 10);
    if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${mStr}`;
  }
  const parts = s.split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parts[1].substring(0, 2);
    if (!isNaN(h)) return `${h.toString().padStart(2, '0')}:${m}`;
  }
  return s;
};

// Helper to capitalize first letter of each word
const capitalizeWords = (str) => {
  if (!str) return '';
  return str.replace(/(^|[\s,.\-/])([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase());
};

// Helper to get local date string YYYY-MM-DD
const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Format date into human-readable string: e.g. "26 Aug 2026"
const formatHumanDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Format scheduled date and time: e.g. "2026-11-05 at 02:30 PM"
const formatScheduledDateTime = (dateVal, timeVal) => {
  if (!dateVal) return '';
  let cleanDate = '';
  if (typeof dateVal === 'string') {
    cleanDate = dateVal.split('T')[0];
  } else if (dateVal instanceof Date) {
    cleanDate = getLocalDateStr(dateVal);
  } else {
    cleanDate = String(dateVal).split('T')[0];
  }
  const cleanTime = timeVal ? format24To12Hr(timeVal) : '';
  if (cleanDate && cleanTime) {
    return `${cleanDate} at ${cleanTime}`;
  }
  return cleanDate || cleanTime || '';
};

// Snap targeted H12:M AM/PM to closest valid available appointment slot
const snapToNearestSlot = (targetH12, targetM, targetAmPm, slots) => {
  if (!slots || slots.length === 0) return '';
  let h24 = targetH12 % 12;
  if (targetAmPm === 'PM') h24 += 12;
  if (targetAmPm === 'AM' && targetH12 === 12) h24 = 0;
  const targetMins = h24 * 60 + targetM;

  let closest = slots[0];
  let minDiff = Infinity;

  for (const slot of slots) {
    const [h, m] = slot.value.split(':').map(Number);
    const slotMins = h * 60 + m;
    const diff = Math.abs(slotMins - targetMins);
    if (diff < minDiff) {
      minDiff = diff;
      closest = slot;
    }
  }

  return closest ? closest.value : '';
};

// Generate OPD appointment time slots respecting doctor OPD schedule, sessions, break times, and slot duration
const generateSlotsForDoctor = (doc) => {
  const slotDuration = parseInt(doc?.opdSchedule?.slotDuration, 10) || 15; // minutes (5, 10, 15, 20, 30)
  const slots = [];

  let sessions = doc?.opdSchedule?.sessions || doc?.opdSchedule?.workingHours || [];

  if (!Array.isArray(sessions) || sessions.length === 0) {
    if (doc?.opdSchedule?.morningStart && doc?.opdSchedule?.morningEnd) {
      sessions = [
        { startTime: doc.opdSchedule.morningStart, endTime: doc.opdSchedule.morningEnd },
        { startTime: doc.opdSchedule.eveningStart || '16:00', endTime: doc.opdSchedule.eveningEnd || '21:30' }
      ];
    } else {
      sessions = [
        { startTime: '10:00', endTime: '21:30' }
      ];
    }
  }

  sessions.forEach((sess) => {
    if (!sess.startTime || !sess.endTime) return;
    const [startH, startM] = sess.startTime.split(':').map(Number);
    const [endH, endM] = sess.endTime.split(':').map(Number);

    let currMins = startH * 60 + (startM || 0);
    const endMins = endH * 60 + (endM || 0);

    while (currMins <= endMins) {
      const h = Math.floor(currMins / 60);
      const m = currMins % 60;
      const value24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const label12 = format24To12Hr(value24);

      if (!slots.some(s => s.value === value24)) {
        slots.push({ value: value24, label: label12 });
      }
      currMins += slotDuration;
    }
  });

  return slots.sort((a, b) => a.value.localeCompare(b.value));
};

const VISIT_TYPES = ['General OPD', 'Follow-up', 'Specialty Consultation', 'Emergency'];
const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Credit'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

export default function AppointmentBookingModule() {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Session Filter State: 'ALL', 'MORNING', 'AFTERNOON', 'EVENING'
  const [sessionFilter, setSessionFilter] = useState('ALL');

  // Analog Clock Time Picker Popover State
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [clockStage, setClockStage] = useState('HOURS'); // 'HOURS' or 'MINUTES'
  const dropdownRef = useRef(null);

  // Patient Mode: 'EXISTING' or 'NEW'
  const [patientMode, setPatientMode] = useState('EXISTING');

  // Patient Search State
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);

  // New Patient Form
  const [patientForm, setPatientForm] = useState({
    name: '',
    mobileNumber: '',
    age: '',
    gender: 'Male',
    place: '',
    bloodGroup: ''
  });

  // Appointment Details State
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [bookingDate, setBookingDate] = useState(() => getLocalDateStr(new Date()));
  const [selectedSlot, setSelectedSlot] = useState('');
  const [bookedAppointments, setBookedAppointments] = useState([]);

  // Visit & Payment State
  const [visitType, setVisitType] = useState('General OPD');
  const [consultationFee, setConsultationFee] = useState(500);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentStatus, setPaymentStatus] = useState('Paid'); // 'Paid', 'Unpaid'

  // Confirmation Modal State
  const [completedBooking, setCompletedBooking] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [activePrintModal, setActivePrintModal] = useState(null);

  // Close clock dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsTimeDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsTimeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Fetch Doctors on mount
  useEffect(() => {
    fetchDoctors();
  }, []);

  // Fetch Booked Appointments when Doctor or Date changes
  useEffect(() => {
    fetchBookedAppointments();
  }, [selectedDoctor, bookingDate]);

  // Sync Doctor Consultation Fee when Doctor changes
  const activeDoctorObj = useMemo(() => {
    return doctors.find(d => d._id === selectedDoctor);
  }, [doctors, selectedDoctor]);

  useEffect(() => {
    if (activeDoctorObj?.doctorProfile?.consultationFee) {
      setConsultationFee(activeDoctorObj.doctorProfile.consultationFee);
    } else {
      setConsultationFee(500);
    }
  }, [activeDoctorObj]);

  const fetchDoctors = async () => {
    try {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      if (res.data?.success) {
        const docList = res.data.data || [];
        setDoctors(docList);
        if (docList.length > 0 && !selectedDoctor) {
          setSelectedDoctor(docList[0]._id);
        }
      }
    } catch (err) {
      console.error('Error fetching doctors:', err);
    }
  };

  const fetchBookedAppointments = async () => {
    if (!bookingDate) return;
    try {
      let url = `/operations/appointments?date=${bookingDate}`;
      if (selectedDoctor) url += `&doctorId=${selectedDoctor}`;
      const res = await api.get(url);
      if (res.data?.success) {
        setBookedAppointments(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching booked slots:', err);
    }
  };

  // Generate & Filter Time Slots
  const availableSlotsData = useMemo(() => {
    if (!selectedDoctor) return { slots: [], allSlots: [], availableCount: 0 };

    const doc = doctors.find(d => d._id === selectedDoctor);
    const allSlots = generateSlotsForDoctor(doc);

    // Filter active bookings and map both 12hr and 24hr slot representations
    const activeBookings = (bookedAppointments || []).filter(a => {
      const isCancelled = a.status === 'Cancelled' || a.workflow?.queueState === 'CANCELLED';
      return !isCancelled;
    });

    const bookedTimes = [];
    activeBookings.forEach(a => {
      if (a.time) bookedTimes.push(normalizeTimeTo24Hr(a.time));
      if (a.appointmentSlot?.startTime) bookedTimes.push(normalizeTimeTo24Hr(a.appointmentSlot.startTime));
      if (a.appointmentSlot?.slotId) bookedTimes.push(normalizeTimeTo24Hr(a.appointmentSlot.slotId));
      if (typeof a.appointmentSlot === 'string') bookedTimes.push(normalizeTimeTo24Hr(a.appointmentSlot));
    });
    const bookedSet = new Set(bookedTimes.filter(Boolean));

    const now = new Date();
    const todayStr = getLocalDateStr(now);
    const isToday = bookingDate === todayStr;
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const slotsWithStatus = allSlots.map(s => {
      const [h, m] = s.value.split(':').map(Number);
      const slotMins = h * 60 + m;
      const isBooked = bookedSet.has(s.value);
      const isPast = isToday && slotMins <= currentMins;

      // Filter by session time range: Morning (<13:00), Afternoon (13:00-16:00), Evening (>=16:00)
      let inSession = true;
      if (sessionFilter === 'MORNING') inSession = slotMins < 13 * 60;
      else if (sessionFilter === 'AFTERNOON') inSession = slotMins >= 13 * 60 && slotMins < 16 * 60;
      else if (sessionFilter === 'EVENING') inSession = slotMins >= 16 * 60;

      return {
        ...s,
        isBooked,
        isPast,
        isAvailable: !isBooked && !isPast,
        inSession
      };
    });

    const sessionFilteredSlots = slotsWithStatus.filter(s => s.inSession);

    // Priority Sort: Available slots first (chronological), followed by Unavailable/Past slots (chronological)
    const sortedSessionSlots = [...sessionFilteredSlots].sort((a, b) => {
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      return a.value.localeCompare(b.value);
    });

    return {
      slots: sortedSessionSlots,
      allSlots: slotsWithStatus,
      availableCount: sessionFilteredSlots.filter(s => s.isAvailable).length
    };
  }, [selectedDoctor, bookingDate, doctors, bookedAppointments, sessionFilter]);

  const allAvailableSlots = useMemo(() => {
    return (availableSlotsData.allSlots || []).filter(s => s.isAvailable);
  }, [availableSlotsData]);

  // Reset selected slot if it becomes unavailable
  useEffect(() => {
    const availableValues = allAvailableSlots.map(s => s.value);
    if (selectedSlot && !availableValues.includes(selectedSlot)) {
      setSelectedSlot('');
    }
  }, [allAvailableSlots, selectedSlot]);

  // Dissect selected slot into Analog Clock components
  const activeClockParts = useMemo(() => {
    const target = selectedSlot || (allAvailableSlots.length > 0 ? allAvailableSlots[0].value : '10:00');
    const label12 = format24To12Hr(target);
    const parts = label12.split(' ');
    const [h, m] = parts[0].split(':');
    const ampm = parts[1] || 'AM';
    return {
      h12: parseInt(h, 10),
      m: parseInt(m, 10),
      ampm,
      label: label12,
      raw24: target
    };
  }, [selectedSlot, allAvailableSlots]);

  // Handle Hour Selection on Analog Dial
  const handleSelectHour = (hour12) => {
    const newSlot = snapToNearestSlot(hour12, activeClockParts.m, activeClockParts.ampm, allAvailableSlots);
    if (newSlot) {
      setSelectedSlot(newSlot);
    }
    setClockStage('MINUTES');
  };

  // Handle Minute Selection on Analog Dial
  const handleSelectMinute = (minute) => {
    const newSlot = snapToNearestSlot(activeClockParts.h12, minute, activeClockParts.ampm, allAvailableSlots);
    if (newSlot) {
      setSelectedSlot(newSlot);
    }
  };

  // Handle AM/PM Toggle
  const handleToggleAmPm = (newAmPm) => {
    const newSlot = snapToNearestSlot(activeClockParts.h12, activeClockParts.m, newAmPm, allAvailableSlots);
    if (newSlot) {
      setSelectedSlot(newSlot);
    }
  };

  // Hand angle calculation
  const handAngleDeg = clockStage === 'HOURS'
    ? ((activeClockParts.h12 % 12) * 30 - 90)
    : (activeClockParts.m * 6 - 90);

  // Search Patients
  const handlePatientSearchChange = async (query) => {
    setPatientSearch(query);
    if (!query || query.trim().length < 2) {
      setPatientSearchResults([]);
      return;
    }
    setIsSearchingPatients(true);
    try {
      const res = await api.get(`/operations/patients/search?query=${encodeURIComponent(query)}`);
      if (res.data?.success) {
        setPatientSearchResults(res.data.data || []);
      }
    } catch (err) {
      console.error('Error searching patients:', err);
    } finally {
      setIsSearchingPatients(false);
    }
  };

  const handleSelectPatient = (p) => {
    setSelectedPatient(p);
    setPatientSearch('');
    setPatientSearchResults([]);
  };

  // Submit & Confirm Appointment
  const handleConfirmAppointment = async (e) => {
    e.preventDefault();

    // 1. Validate Patient
    let patientIdToUse = selectedPatient?._id;

    if (patientMode === 'NEW') {
      if (!patientForm.name || !patientForm.mobileNumber || !patientForm.age) {
        toast.error('Please enter patient Name, Mobile Number, and Age');
        return;
      }
      try {
        setSubmitting(true);
        const pRes = await api.post('/operations/patients', {
          name: patientForm.name,
          mobileNumber: patientForm.mobileNumber,
          age: patientForm.age,
          gender: patientForm.gender || 'Male',
          bloodGroup: patientForm.bloodGroup,
          place: patientForm.place
        });
        if (pRes.data?.success && pRes.data?.data) {
          patientIdToUse = pRes.data.data._id;
          setSelectedPatient(pRes.data.data);
        } else {
          toast.error(pRes.data?.message || 'Could not register patient profile');
          setSubmitting(false);
          return;
        }
      } catch (err) {
        console.error('Patient registration error:', err);
        toast.error(err.response?.data?.message || err.message || 'Patient registration failed');
        setSubmitting(false);
        return;
      }
    } else if (!patientIdToUse) {
      toast.error('Please select an existing patient or register a new patient');
      return;
    }

    // 2. Validate Doctor
    if (!selectedDoctor) {
      toast.error('Please select a consulting doctor');
      return;
    }

    // 3. Validate Date
    if (!bookingDate) {
      toast.error('Please select an appointment date');
      return;
    }

    // 4. Validate Time Slot
    if (!selectedSlot) {
      toast.error('Please select an available time slot');
      return;
    }

    // 5. Submit Appointment
    try {
      setSubmitting(true);
      const slotTimeLabel = format24To12Hr(selectedSlot);

      const payload = {
        patientId: patientIdToUse,
        doctorId: selectedDoctor,
        date: bookingDate,
        time: slotTimeLabel,
        consultationType: 'Appointment',
        chiefComplaint: 'General Consultation',
        consultationFee: Number(consultationFee) || 500,
        billingStatus: paymentStatus === 'Paid' ? 'Paid' : 'Unpaid',
        paymentMethod: paymentMethod || 'Cash',
        appointmentSlot: {
          startTime: selectedSlot,
          endTime: selectedSlot,
          slotId: selectedSlot
        },
        bookingSource: 'RECEPTION'
      };

      // Acquire GPS Location for Geofence validation ONLY if enabled
      const isGeofenceEnabled = user?.hospital?.geofenceSettings?.enabled === true;
      if (isGeofenceEnabled && typeof window !== 'undefined' && 'geolocation' in navigator) {
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
            payload.latitude = coords.latitude;
            payload.longitude = coords.longitude;
          }
        } catch (e) {
          console.warn('Location capture notice:', e);
        }
      }

      const res = await api.post('/operations/appointments', payload);

      if (res.data?.success) {
        toast.success('Doctor appointment booked successfully!');
        setCompletedBooking(res.data.data);
        setShowSuccessModal(true);
        fetchBookedAppointments();
      } else {
        toast.error(res.data?.message || 'Failed to book appointment');
      }
    } catch (err) {
      console.error('Error booking appointment slot:', err);
      toast.error(err.response?.data?.message || err.message || 'Error booking appointment slot');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setPatientForm({ name: '', mobileNumber: '', age: '', gender: 'Male', place: '', bloodGroup: '' });
    setSelectedSlot('');
    setShowSuccessModal(false);
    setCompletedBooking(null);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8">
      {/* HEADER TITLE */}
      <div className="flex items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-[#3563F6] shrink-0" />
            <span className="leading-tight sm:leading-normal">Book Doctor Appointment</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 sm:mt-1">
            Single-page appointment booking form
          </p>
        </div>
        <button
          type="button"
          onClick={fetchBookedAppointments}
          className="p-2 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <form onSubmit={handleConfirmAppointment}>
        {/* 2-COLUMN DASHBOARD GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* LEFT PANEL: PATIENT, DOCTOR & TIME SLOTS (8 Cols) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            
            {/* CONSOLIDATED CARD: PATIENT & APPOINTMENT SETUP */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-[#3563F6]" />
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    1. Patient & Appointment Setup
                  </h2>
                </div>
                {/* Patient Mode Toggle */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setPatientMode('EXISTING')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      patientMode === 'EXISTING'
                        ? 'bg-white text-[#3563F6] shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Search Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPatientMode('NEW');
                      setSelectedPatient(null);
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      patientMode === 'NEW'
                        ? 'bg-white text-[#3563F6] shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    + Register New
                  </button>
                </div>
              </div>

              {patientMode === 'EXISTING' ? (
                <div className="space-y-2">
                  {selectedPatient ? (
                    <div className="flex items-center justify-between p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-xs">{selectedPatient.name}</span>
                          <span className="bg-blue-100 text-[#3563F6] text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full">
                            {selectedPatient.uhid || 'UHID'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-medium flex items-center gap-3">
                          <span>Age: <strong>{selectedPatient.age || 'N/A'}</strong></span>
                          <span>Gender: <strong>{selectedPatient.gender || 'N/A'}</strong></span>
                          <span>Mobile: <strong>{selectedPatient.mobileNumber || 'N/A'}</strong></span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedPatient(null)}
                        className="px-2.5 py-1 bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search patient by Name, UHID, or Mobile Number..."
                          value={patientSearch}
                          onChange={(e) => {
                            const noNums = e.target.value.replace(/[0-9]/g, '');
                            const formatted = capitalizeWords(noNums);
                            handlePatientSearchChange(formatted);
                          }}
                          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3563F6] focus:bg-white transition-all"
                        />
                      </div>

                      {patientSearchResults.length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                          {patientSearchResults.map((p) => (
                            <button
                              key={p._id}
                              type="button"
                              onClick={() => handleSelectPatient(p)}
                              className="w-full px-3 py-2 text-left hover:bg-blue-50/60 transition-colors flex items-center justify-between cursor-pointer"
                            >
                              <div>
                                <div className="font-bold text-xs text-slate-900">{p.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  {p.uhid} • {p.mobileNumber} • {p.gender}, {p.age} yrs
                                </div>
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 -rotate-90" />
                            </button>
                          ))}
                        </div>
                      )}

                      {isSearchingPatients && (
                        <div className="text-[11px] text-slate-400 font-medium pt-1">Searching patients...</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-2.5 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5 truncate" title="Patient Name">
                      Patient Name *
                    </label>
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={patientForm.name}
                      onChange={(e) => {
                        const noNums = e.target.value.replace(/[0-9]/g, '');
                        const formatted = capitalizeWords(noNums);
                        setPatientForm({ ...patientForm, name: formatted });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5 truncate" title="Mobile Number">
                      Mobile Number *
                    </label>
                    <input
                      type="text"
                      placeholder="10-digit Mobile"
                      maxLength={10}
                      inputMode="numeric"
                      value={patientForm.mobileNumber}
                      onChange={(e) => {
                        const onlyNums = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPatientForm({ ...patientForm, mobileNumber: onlyNums });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5 truncate" title="Age">
                      Age *
                    </label>
                    <input
                      type="text"
                      placeholder="Years"
                      maxLength={2}
                      inputMode="numeric"
                      value={patientForm.age}
                      onChange={(e) => {
                        const onlyNums = e.target.value.replace(/\D/g, '').slice(0, 2);
                        setPatientForm({ ...patientForm, age: onlyNums });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5 truncate" title="Gender">
                      Gender *
                    </label>
                    <select
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white cursor-pointer"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5 truncate" title="Blood Group">
                      Blood Group
                    </label>
                    <select
                      value={patientForm.bloodGroup}
                      onChange={(e) => setPatientForm({ ...patientForm, bloodGroup: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white cursor-pointer"
                    >
                      <option value="">Select Blood Group</option>
                      {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5 truncate" title="Place / City">
                      Place / City
                    </label>
                    <input
                      type="text"
                      placeholder="City/Town"
                      value={patientForm.place}
                      onChange={(e) => {
                        const formatted = capitalizeWords(e.target.value);
                        setPatientForm({ ...patientForm, place: formatted });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white"
                    />
                  </div>
                </div>
              )}

              {/* DIVIDER & DOCTOR/DATE SETUP */}
              <div className="pt-2 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 truncate" title="Consulting Doctor">
                      Consulting Doctor *
                    </label>
                    <select
                      value={selectedDoctor}
                      onChange={(e) => setSelectedDoctor(e.target.value)}
                      className="w-full px-2.5 sm:px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white cursor-pointer truncate"
                    >
                      {doctors.map((doc) => (
                        <option key={doc._id} value={doc._id}>
                          {doc.name} ({doc.doctorProfile?.department || 'General OPD'}) - ₹{doc.doctorProfile?.consultationFee || 500}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 truncate" title="Appointment Date">
                      Appointment Date *
                    </label>
                    <input
                      type="date"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      min={getLocalDateStr(new Date())}
                      className="w-full px-2.5 sm:px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: AVAILABLE TIME SLOTS (WITH SESSION FILTER & MAX HEIGHT SCROLL) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#3563F6]" />
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    2. Available Time Slots
                  </h2>
                </div>

                {/* Session Filter Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/60 shrink-0">
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'MORNING', label: 'Morning' },
                    { id: 'AFTERNOON', label: 'Afternoon' },
                    { id: 'EVENING', label: 'Evening' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSessionFilter(tab.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        sessionFilter === tab.id
                          ? 'bg-white text-[#3563F6] shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Analog Clock Trigger Button */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  disabled={availableSlotsData.availableCount === 0}
                  onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border text-left ${
                    selectedSlot
                      ? 'border-[#3563F6] text-[#3563F6] bg-blue-50/50 ring-2 ring-[#3563F6]/20 shadow-2xs'
                      : availableSlotsData.availableCount === 0
                      ? 'border-rose-200 bg-rose-50/50 text-rose-500 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-[#3563F6] focus:outline-none focus:border-[#3563F6]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${selectedSlot ? 'text-[#3563F6]' : 'text-slate-400'}`} />
                    <span>
                      {selectedSlot
                        ? `Selected Slot: ${format24To12Hr(selectedSlot)}`
                        : availableSlotsData.availableCount === 0
                        ? 'No available slots'
                        : 'Select appointment time (Analog Clock Picker)'}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isTimeDropdownOpen ? 'rotate-180 text-[#3563F6]' : 'text-slate-400'}`} />
                </button>

                {/* Analog Clock Modal Overlay */}
                {isTimeDropdownOpen && availableSlotsData.availableCount > 0 && (
                  <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 font-sans animate-in fade-in duration-150">
                    <div
                      ref={dropdownRef}
                      className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-[420px] p-5 space-y-4 font-sans text-left animate-in zoom-in-95 duration-150"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-[#3563F6]" />
                          <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Select Appointment Time</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsTimeDropdownOpen(false)}
                          className="text-slate-400 hover:text-slate-900 cursor-pointer p-1 rounded-xl hover:bg-slate-100 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between shadow-2xs">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setClockStage('HOURS')}
                            className={`px-3.5 py-1.5 rounded-xl text-xl font-black transition-all cursor-pointer border ${
                              clockStage === 'HOURS'
                                ? 'bg-[#3563F6] border-[#3563F6] text-white shadow-xs scale-102 ring-2 ring-[#3563F6]/20'
                                : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300'
                            }`}
                          >
                            {String(activeClockParts.h12).padStart(2, '0')}
                          </button>
                          <span className="text-xl font-black text-slate-400 animate-pulse">:</span>
                          <button
                            type="button"
                            onClick={() => setClockStage('MINUTES')}
                            className={`px-3.5 py-1.5 rounded-xl text-xl font-black transition-all cursor-pointer border ${
                              clockStage === 'MINUTES'
                                ? 'bg-[#3563F6] border-[#3563F6] text-white shadow-xs scale-102 ring-2 ring-[#3563F6]/20'
                                : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300'
                            }`}
                          >
                            {String(activeClockParts.m).padStart(2, '0')}
                          </button>

                          <div className="flex flex-col gap-1 ml-2">
                            {['AM', 'PM'].map((ampm) => (
                              <button
                                key={ampm}
                                type="button"
                                onClick={() => handleToggleAmPm(ampm)}
                                className={`px-2.5 py-0.5 rounded-md text-[10px] font-black transition-all cursor-pointer border ${
                                  activeClockParts.ampm === ampm
                                    ? 'bg-[#3563F6] border-[#3563F6] text-white shadow-2xs'
                                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                                }`}
                              >
                                {ampm}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-[10px] font-black tracking-widest text-[#3563F6] uppercase bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                          SELECT {clockStage}
                        </div>
                      </div>

                      {/* Analog Dial Face (220px diameter, radius 110px) */}
                      <div className="relative w-[220px] h-[220px] mx-auto bg-slate-50/80 border-2 border-slate-200/90 rounded-full flex items-center justify-center shadow-inner select-none shrink-0">
                        {/* SVG Clock Hand */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 220 220">
                          <line
                            x1={110}
                            y1={110}
                            x2={110 + 56 * Math.cos((handAngleDeg * Math.PI) / 180)}
                            y2={110 + 56 * Math.sin((handAngleDeg * Math.PI) / 180)}
                            stroke="#3563F6"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                          />
                          <circle cx={110} cy={110} r="5" fill="#3563F6" />
                        </svg>

                        {/* Clock Dial Numbers */}
                        {clockStage === 'HOURS' ? (
                          [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
                            const deg = (h % 12) * 30 - 90;
                            const rad = (deg * Math.PI) / 180;
                            const x = 110 + 78 * Math.cos(rad);
                            const y = 110 + 78 * Math.sin(rad);
                            const isSelected = activeClockParts.h12 === h;

                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => handleSelectHour(h)}
                                style={{ left: `${x}px`, top: `${y}px` }}
                                className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer z-20 ${
                                  isSelected
                                    ? 'bg-[#3563F6] text-white shadow-md scale-110'
                                    : 'text-slate-800 hover:bg-blue-50 hover:text-[#3563F6]'
                                }`}
                              >
                                {h}
                              </button>
                            );
                          })
                        ) : (
                          [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                            const deg = m * 6 - 90;
                            const rad = (deg * Math.PI) / 180;
                            const x = 110 + 78 * Math.cos(rad);
                            const y = 110 + 78 * Math.sin(rad);
                            const isSelected = activeClockParts.m === m;

                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => handleSelectMinute(m)}
                                style={{ left: `${x}px`, top: `${y}px` }}
                                className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer z-20 ${
                                  isSelected
                                    ? 'bg-[#3563F6] text-white shadow-md scale-110'
                                    : 'text-slate-800 hover:bg-blue-50 hover:text-[#3563F6]'
                                }`}
                              >
                                {String(m).padStart(2, '0')}
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Modal Footer Actions */}
                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setIsTimeDropdownOpen(false)}
                          className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                        >
                          CLOSE
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsTimeDropdownOpen(false)}
                          className="px-5 py-2 bg-[#3563F6] hover:bg-[#2552E0] text-white text-xs font-extrabold rounded-xl shadow-xs transition-all cursor-pointer uppercase tracking-wider"
                        >
                          APPLY TIME
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* COMPACT MAX-HEIGHT SCROLLABLE TIME SLOT GRID */}
              <div className="max-h-[210px] overflow-y-auto pr-1">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {availableSlotsData.slots.map((s) => {
                    const isSelected = selectedSlot === s.value;
                    const isDisabled = !s.isAvailable;

                    return (
                      <button
                        key={s.value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setSelectedSlot(s.value)}
                        className={`py-2 px-1.5 rounded-xl text-xs transition-all border text-center flex items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-[#3563F6] border-[#3563F6] text-white shadow-xs font-black scale-102 ring-2 ring-[#3563F6]/20 cursor-pointer'
                            : s.isBooked
                            ? 'bg-blue-100/80 border-blue-200 text-blue-900 font-extrabold cursor-not-allowed opacity-90'
                            : s.isPast
                            ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed line-through font-normal'
                            : 'bg-white border-slate-200 text-slate-800 font-bold hover:border-[#3563F6] hover:text-[#3563F6] cursor-pointer'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                        <span>{s.label}</span>
                        {s.isBooked && <span className="text-[9px] font-black text-blue-700 ml-0.5">(Booked)</span>}
                      </button>
                    );
                  })}
                </div>

                {availableSlotsData.slots.length === 0 && (
                  <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-slate-200/60">
                    No time slots available for selected doctor, date & session filter.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: STICKY SIDEBAR FOR VISIT, PAYMENT & LIVE SUMMARY (4-5 Cols) */}
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-4 space-y-4">
            
            {/* CARD 3: VISIT & PAYMENT INFORMATION */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3.5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <DollarSign className="w-4 h-4 text-[#3563F6]" />
                <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  3. Visit & Payment Information
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Visit Type</label>
                  <select
                    value={visitType}
                    onChange={(e) => setVisitType(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white"
                  >
                    {VISIT_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Fee (₹)</label>
                  <input
                    type="number"
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3563F6] focus:bg-white"
                  >
                    {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Payment Status</label>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    {['Paid', 'Unpaid'].map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setPaymentStatus(st)}
                        className={`flex-1 py-1 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
                          paymentStatus === st
                            ? st === 'Paid'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-amber-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 4: LIVE APPOINTMENT SUMMARY & STICKY CONFIRM CTA */}
            <div className="bg-[#F8FAFC] p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-[#3563F6]" />
                <span>Appointment Summary</span>
              </h2>

              <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs space-y-2.5">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-400 font-bold">Patient:</span>
                  <span className="font-extrabold text-slate-900">
                    {selectedPatient ? selectedPatient.name : (patientForm.name || 'Not selected')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-400 font-bold">Doctor:</span>
                  <span className="font-extrabold text-slate-900">
                    {activeDoctorObj ? activeDoctorObj.name : 'Not selected'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-400 font-bold">Date & Time:</span>
                  <span className="font-extrabold text-[#3563F6]">
                    {bookingDate ? formatHumanDate(bookingDate) : '—'} @ {selectedSlot ? format24To12Hr(selectedSlot) : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold">Fee & Payment:</span>
                  <span className={`font-extrabold ${paymentStatus === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    ₹{consultationFee} ({paymentMethod} - {paymentStatus})
                  </span>
                </div>
              </div>

              {/* STICKY PRIMARY CONFIRM ACTION BUTTON */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 bg-[#3563F6] hover:bg-[#2552E0] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Booking...' : 'Confirm Appointment'}</span>
              </button>
            </div>

          </div>
        </div>
      </form>

      {/* CONFIRMATION SUCCESS MODAL */}
      {showSuccessModal && completedBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Appointment Booked!</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Appointment status set to <strong className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Scheduled</strong>
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Appointment ID:</span>
                <span className="font-mono font-extrabold text-slate-900">{completedBooking._id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Patient:</span>
                <span className="font-extrabold text-slate-900">{selectedPatient?.name || patientForm.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Doctor:</span>
                <span className="font-extrabold text-slate-900">{activeDoctorObj?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Scheduled Time:</span>
                <span className="font-extrabold text-[#3563F6]">
                  {formatScheduledDateTime(completedBooking.date, completedBooking.time)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Token:</span>
                <span className="font-mono font-bold text-slate-400">— (Issued upon check-in)</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActivePrintModal(completedBooking)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Slip</span>
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="flex-1 py-2.5 bg-[#3563F6] hover:bg-[#2552E0] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPD TOKEN PRINT MODAL */}
      {activePrintModal && (
        <OpdTokenPrintModal
          appointment={activePrintModal}
          onClose={() => setActivePrintModal(null)}
        />
      )}
    </div>
  );
}
