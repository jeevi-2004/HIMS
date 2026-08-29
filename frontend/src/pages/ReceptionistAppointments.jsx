import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../services/api';
import Button from '../components/Button';
import Table from '../components/Table';
import Modal from '../components/Modal';
import DatePicker from '../components/DatePicker';
import MobileNumber from '../components/MobileNumber';
import Input from '../components/Input';
import AppointmentBookingModal from '../components/AppointmentBookingModal';
import OpdTokenPrintModal from '../components/OpdTokenPrintModal';
import LiveQueueLeftPanel from '../components/LiveQueueLeftPanel';
import EmergencyIntakeDrawer from '../components/EmergencyIntakeDrawer';
import ConvertUnknownPatientModal from '../components/ConvertUnknownPatientModal';
import {
  Plus, AlertTriangle, Calendar, Clock, User, ChevronDown, ChevronUp,
  Play, CheckCircle2, RotateCcw, SkipForward, Eye, Edit, Trash2, XCircle,
  FileText, Pill, Receipt, MoreVertical, Activity, UserCheck, Ticket,
  X, Phone, ShieldAlert, Edit3, Heart, Megaphone, DoorOpen, DollarSign,
  CreditCard, Wallet, Camera, ShieldCheck, Search, Stethoscope, HelpCircle,
  Filter, ChevronRight, RefreshCw, Printer, ArrowRight, Sparkles, Check,
  Layers, Lock, Siren, AlertCircle, Languages, MapPin
} from 'lucide-react';
import { formatTimeTo12Hr } from '../utils/timeFormat';
import { useAuth } from '../context/AuthContext';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { triggerPrint } from '../modules/prescription-print/printUtils';
import { DEFAULT_PRINT_CONFIG } from '../modules/prescription-print/prescriptionPrint.types';

// Helper to determine if a patient profile is complete
const isPatientProfileComplete = (patient) => {
  if (!patient) return false;
  if (patient.isProfileCompleted === true) return true;
  return !!(
    (patient.address || (patient.addresses && patient.addresses.length > 0)) &&
    (patient.emergencyContact || patient.alternativeMobile || patient.email) &&
    (patient.aadhaarNumber || patient.dob)
  );
};

// Payment Collection Modal Component
const PaymentCollectionModal = ({ appointment, isOpen, onClose, onSuccess }) => {
  if (!isOpen || !appointment) return null;

  const [consultationFee, setConsultationFee] = useState(appointment?.consultationFee ?? appointment?.doctorId?.consultationFee ?? 500);
  const [additionalCharges, setAdditionalCharges] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (appointment) {
      setConsultationFee(appointment.consultationFee ?? appointment.doctorId?.consultationFee ?? 500);
    }
  }, [appointment]);

  const totalAmount = useMemo(() => {
    const base = (Number(consultationFee) || 0) + (Number(additionalCharges) || 0);
    const disc = Number(discount) || 0;
    return Math.max(0, base - disc);
  }, [consultationFee, additionalCharges, discount]);

  const handleConfirmPayment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put(`/operations/appointments/${appointment._id}/queue`, {
        billingStatus: 'Paid',
        consultationFee: Number(consultationFee)
      });
      toast.success(`Payment of ₹${totalAmount} collected successfully (${paymentMethod})!`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to collect payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="COLLECT PAYMENT"
      maxWidth="max-w-[500px]"
    >
      <form onSubmit={handleConfirmPayment} className="space-y-4 text-left font-sans text-xs">
        <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2">
          <div className="flex justify-between items-center border-b border-blue-200/60 pb-2">
            <span className="font-bold text-slate-900 text-sm">{appointment.patientId?.name || 'Patient'}</span>
            <span className="font-mono font-bold text-xs text-[#2F63F2] bg-white border border-[#2F63F2]/30 px-2.5 py-0.5 rounded-lg">
              Token #{appointment.tokenNumber || 'N/A'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
            <div>Doctor: <strong className="text-slate-900">{appointment.doctorId?.name || 'Unassigned'}</strong></div>
            <div>Consult Date: <strong className="text-slate-900 font-mono">{new Date(appointment.date).toLocaleDateString()}</strong></div>
          </div>
        </div>

        {appointment.consultationFee !== undefined && (
          <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-bold flex items-center justify-between">
            <span>💡 Doctor/Consultation Specified Fee:</span>
            <span className="font-mono font-black text-xs text-emerald-900">₹{appointment.consultationFee}</span>
          </div>
        )}

        <div className="space-y-3">
          <Input
            label="Consultation Fee (₹)"
            type="number"
            value={consultationFee}
            onChange={(e) => setConsultationFee(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Additional Charges (₹)"
              type="number"
              value={additionalCharges}
              onChange={(e) => setAdditionalCharges(e.target.value)}
            />
            <Input
              label="Discount (₹)"
              type="number"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
        </div>

        <div className="p-4 bg-slate-900 text-white rounded-xl flex justify-between items-center shadow-inner">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Total Payable Amount</span>
          <span className="text-2xl font-extrabold font-mono text-emerald-400">₹{totalAmount}</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Method <span className="text-rose-500">*</span></label>
          <div className="grid grid-cols-4 gap-2">
            {['Cash', 'UPI', 'Card', 'Credit'].map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${paymentMethod === method
                  ? 'bg-[#2F63F2] text-white border-[#2F63F2] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button onClick={onClose} type="button" variant="secondary" className="text-xs px-5 h-[40px]">
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="text-xs px-6 h-[40px] bg-emerald-600 hover:bg-emerald-700">
            Confirm & Mark Paid
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Compact Mobile Card Renderer (Material Design 3)
const CompactAppointmentCard = ({
  row,
  isFirstEligible,
  onCallNext,
  onCompleteConsultation,
  onOpenPayment,
  onCollectPayment,
  onPrintToken,
  onOpenBottomSheet,
  onViewDetail,
  onEditProfile
}) => {
  const { billingSettings, workflow, getAppointmentActions, getQueueEvaluation } = useBillingSettings();
  const isReceptionFeeCollector = billingSettings?.feeCollectionRole === 'Reception';

  const handlePayment = onCollectPayment || onOpenPayment;
  const handleToken = onPrintToken || onOpenBottomSheet;
  const handleDetail = onViewDetail || onOpenBottomSheet;

  const statusColors = {
    'Waiting': 'bg-blue-50 text-blue-700 border-blue-200 font-bold',
    'Called': 'bg-amber-50 text-amber-700 border-amber-200 font-bold',
    'In Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
    'Sent to Pharmacy': 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold',
    'Sent To Pharmacy': 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold',
    'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold',
    'Skipped': 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
    'Cancelled': 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
    'Emergency': 'bg-red-100 text-red-700 border-red-200 font-extrabold'
  };

  const status = row.status || row.queueStatus || 'Waiting';
  const isWaiting = status === 'Waiting' || status === 'Scheduled';
  const isCalled = status === 'Called';
  const isInConsultation = status === 'In Consultation' || status === 'Admitted' || row.queueStatus === 'In-Consultation';
  const billingStatus = row.billingStatus || 'Unpaid';

  // Dynamic Primary Action Configuration (Reception Engine-Approved Actions)
  const getPrimaryButton = () => {
    if (billingStatus !== 'Paid' && billingStatus !== 'Exempt') {
      if (isReceptionFeeCollector) {
        return {
          label: 'Collect Payment',
          icon: null,
          style: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-xs',
          disabled: false,
          onClick: () => handlePayment?.(row)
        };
      }
      return {
        label: 'Payment Pending',
        icon: AlertTriangle,
        style: 'bg-amber-50 text-amber-700 border-amber-200 font-bold',
        disabled: true,
        onClick: () => { }
      };
    }
    if (isWaiting) {
      return {
        label: 'Print Token',
        icon: null,
        style: 'bg-[#3563F6] hover:bg-blue-700 text-white border-[#3563F6] shadow-xs',
        disabled: false,
        onClick: () => handleToken?.(row)
      };
    }
    if (isCalled) {
      return {
        label: 'Sent To Doctor',
        icon: DoorOpen,
        style: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
        disabled: true,
        onClick: () => { }
      };
    }
    if (isInConsultation) {
      return {
        label: 'In Consultation',
        icon: Activity,
        style: 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
        disabled: true,
        onClick: () => { }
      };
    }
    if (status === 'Completed' || status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy') {
      return {
        label: 'View',
        icon: Eye,
        style: 'border-[#3563F6] text-[#3563F6] bg-white hover:bg-blue-50 font-bold',
        disabled: false,
        onClick: () => handleDetail?.(row)
      };
    }
    if (status === 'Skipped') {
      return {
        label: 'Skipped',
        icon: SkipForward,
        style: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
        disabled: true,
        onClick: () => { }
      };
    }

    return {
      label: status,
      icon: null,
      style: 'bg-slate-100 text-slate-600 border-slate-200',
      disabled: true,
      onClick: () => { }
    };
  };

  const primaryBtn = getPrimaryButton();

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs text-left font-sans space-y-3">
      {/* Patient Name & Token */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-slate-900 text-base leading-snug">
            {row.patientId?.name || 'Unknown Patient'}
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {row.patientId?.age ? `${row.patientId.age} Years` : 'Age N/A'} • {row.patientId?.gender || 'N/A'}
          </p>
        </div>
        <span className="font-mono font-bold text-xs text-[#3563F6] bg-[#3563F6]/10 border border-[#3563F6]/20 px-3 py-1 rounded-xl flex-shrink-0">
          {row.tokenNumber || 'N/A'}
        </span>
      </div>

      {/* Doctor & Slot Time */}
      <div className="flex items-center justify-between text-xs text-slate-600 pt-0.5">
        <div className="flex items-center gap-1.5 font-medium truncate">
          <Stethoscope className="w-4 h-4 text-[#3563F6] flex-shrink-0" />
          <span className="truncate">Dr. {row.doctorId?.name?.replace(/^Dr\.\s*/i, '') || 'Unassigned'}</span>
        </div>
        <div className="flex items-center gap-1 font-mono font-semibold text-slate-600 flex-shrink-0">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.time}</span>
        </div>
      </div>

      {/* Status & Payment Badges */}
      <div className="flex items-center justify-between pt-0.5">
        <span className={`text-[10px] font-bold border px-2.5 py-0.5 rounded-lg uppercase tracking-wider ${statusColors[status] || 'bg-slate-50 text-slate-600'}`}>
          {isInConsultation ? 'In Consultation' : status}
        </span>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${billingStatus === 'Paid' || billingStatus === 'Exempt'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
          {billingStatus === 'Paid' ? '💳 Paid' : billingStatus === 'Exempt' ? '💳 Exempt' : '💳 Unpaid'}
        </span>
      </div>

      {/* Action Footer: 48px Touch Targets */}
      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
        <button
          type="button"
          disabled={primaryBtn.disabled}
          onClick={primaryBtn.onClick}
          className={`flex-1 min-h-[48px] text-xs font-bold rounded-xl border flex items-center justify-center gap-2 transition-all ${primaryBtn.style} ${primaryBtn.disabled ? 'opacity-60 cursor-not-allowed' : 'active:scale-98 cursor-pointer'
            }`}
        >
          {primaryBtn.icon && <primaryBtn.icon className="w-4 h-4" />}
          <span>{primaryBtn.label}</span>
        </button>

        <button
          type="button"
          onClick={() => handleDetail?.(row)}
          className="min-h-[48px] px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all active:scale-98 cursor-pointer"
        >
          <span>More</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// RIGHT-SIDE PATIENT INFO DRAWER COMPONENT
const PatientInfoDrawer = ({ patient, isOpen, onClose, onOpenCompleteProfile }) => {
  if (!isOpen || !patient) return null;

  const isComplete = isPatientProfileComplete(patient);

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-white shadow-2xl z-50 border-l border-slate-200 overflow-y-auto flex flex-col font-sans text-left transition-all duration-300">
        <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#2F63F2] text-white flex items-center justify-center font-extrabold text-lg shadow-md border-2 border-white/20">
              {patient.name ? patient.name.substring(0, 2).toUpperCase() : 'PT'}
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight">{patient.name || 'Unknown Patient'}</h3>
              <div className="flex items-center gap-2 mt-0.5 font-mono text-xs text-blue-200">
                <span>UHID: {patient.uhid || 'N/A'}</span>
                <span className="text-white/30">•</span>
                <span className={`px-2 py-0.2 rounded text-[10px] font-extrabold uppercase ${isComplete ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  }`}>
                  {isComplete ? 'Full Profile ✓' : 'Quick Registered'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Mobile Number</span>
              <span className="font-bold text-slate-800 font-mono text-sm">{patient.mobileNumber || 'N/A'}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Age & Gender</span>
              <span className="font-bold text-slate-800 text-sm">
                {patient.age ? `${patient.age} Yrs` : 'N/A'}, {patient.gender || 'N/A'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Blood Group</span>
              <span className="font-bold text-slate-800 text-sm">{patient.bloodGroup || 'N/A'}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Place / Village</span>
              <span className="font-bold text-slate-800 text-xs truncate block">{patient.address || patient.place || 'N/A'}</span>
            </div>
          </div>

          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#2F63F2]" />
              Emergency Contact Info
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] block">Contact Name</span>
                <span className="font-semibold text-slate-800">{patient.emergencyContact?.name || patient.guardianName || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Emergency Phone</span>
                <span className="font-mono font-semibold text-slate-800">{patient.emergencyContact?.phone || patient.alternativeMobile || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-2xl space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              Medical Alerts & Known Allergies
            </h4>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-500 text-[10px] font-semibold block uppercase">Medical Conditions</span>
                <span className="font-medium text-slate-800">
                  {typeof patient.medicalAlerts === 'string' ? patient.medicalAlerts || 'No recorded chronic conditions' : (Array.isArray(patient.medicalAlerts) ? patient.medicalAlerts.join(', ') : 'No recorded chronic conditions')}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] font-semibold block uppercase">Allergies</span>
                <span className="font-medium text-amber-800">
                  {Array.isArray(patient.allergies) ? (patient.allergies.length ? patient.allergies.join(', ') : 'No known drug/food allergies') : (patient.allergies || 'No known drug/food allergies')}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Last Visit Summary
            </h4>
            <p className="text-slate-700">
              Last OPD Intake: <strong className="text-slate-900 font-mono">{patient.lastVisitDate ? new Date(patient.lastVisitDate).toLocaleDateString() : 'Today'}</strong>
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 sticky bottom-0 flex gap-3">
          <Button
            onClick={() => {
              onClose();
              onOpenCompleteProfile(patient);
            }}
            variant="primary"
            className="w-full text-xs font-bold uppercase tracking-wider h-[42px] bg-[#2F63F2]"
          >
            {isComplete ? '✏️ Edit Profile' : '📝 Complete Profile'}
          </Button>
        </div>
      </div>
    </>
  );
};

// COMPLETE / EDIT PATIENT PROFILE MODAL
const CompleteProfileModal = ({ patient, isOpen, onClose, onSuccess }) => {
  if (!isOpen || !patient) return null;

  const [form, setForm] = useState({
    name: patient.name || '',
    mobileNumber: patient.mobileNumber || '',
    age: patient.age || '',
    gender: patient.gender || 'Male',
    bloodGroup: patient.bloodGroup || 'O+',
    place: patient.address || patient.place || '',
    dob: patient.dob ? new Date(patient.dob).toISOString().split('T')[0] : '',
    aadhaarNumber: patient.aadhaarNumber || '',
    occupation: patient.occupation || '',
    maritalStatus: patient.maritalStatus || 'Single',
    email: patient.email || '',
    emergencyName: patient.emergencyContact?.name || patient.guardianName || '',
    emergencyPhone: patient.emergencyContact?.phone || patient.alternativeMobile || '',
    insuranceProvider: patient.insuranceProvider || '',
    insurancePolicyNo: patient.insurancePolicyNo || '',
    allergies: Array.isArray(patient.allergies) ? patient.allergies.join(', ') : (patient.allergies || ''),
    medicalAlerts: Array.isArray(patient.medicalAlerts) ? patient.medicalAlerts.join(', ') : (patient.medicalAlerts || '')
  });

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updates = {
        name: form.name.trim(),
        mobileNumber: form.mobileNumber,
        age: Number(form.age) || 0,
        gender: form.gender,
        bloodGroup: form.bloodGroup,
        address: form.place.trim(),
        dob: form.dob ? new Date(form.dob) : undefined,
        aadhaarNumber: form.aadhaarNumber.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
        maritalStatus: form.maritalStatus,
        email: form.email.trim() || undefined,
        alternativeMobile: form.emergencyPhone || undefined,
        isProfileCompleted: true,
        allergies: form.allergies ? (Array.isArray(form.allergies) ? form.allergies : form.allergies.split(',').map(s => s.trim()).filter(Boolean)) : [],
        medicalAlerts: typeof form.medicalAlerts === 'string' ? form.medicalAlerts.trim() : (Array.isArray(form.medicalAlerts) ? form.medicalAlerts.join(', ') : '')
      };

      await api.put(`/operations/patients/${patient._id}`, updates);
      toast.success('Patient profile updated successfully!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update patient profile');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={patient.isProfileCompleted ? 'EDIT PATIENT PROFILE' : 'COMPLETE PATIENT PROFILE'}
      maxWidth="max-w-[650px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left font-sans text-xs max-h-[500px] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Patient Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <MobileNumber
            label="Mobile Number"
            numberValue={form.mobileNumber}
            onNumberChange={(val) => setForm({ ...form, mobileNumber: val })}
            required
          />
          <Input
            label="Age (Years)"
            type="number"
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
            required
          />
          <DatePicker
            label="Date of Birth"
            value={form.dob}
            onChange={(val) => setForm({ ...form, dob: val })}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">Gender <span className="text-rose-500">*</span></label>
            <select
              className="enterprise-input h-[42px]"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              required
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">Blood Group</label>
            <select
              className="enterprise-input h-[42px]"
              value={form.bloodGroup}
              onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
            >
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
          <Input
            label="Place / Village / Address"
            placeholder="Enter location"
            value={form.place}
            onChange={(e) => setForm({ ...form, place: e.target.value })}
          />
          <Input
            label="Aadhaar / National ID"
            placeholder="12-digit Aadhaar"
            value={form.aadhaarNumber}
            onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value })}
          />
          <Input
            label="Occupation"
            placeholder="e.g. Teacher, Farmer"
            value={form.occupation}
            onChange={(e) => setForm({ ...form, occupation: e.target.value })}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">Marital Status</label>
            <select
              className="enterprise-input h-[42px]"
              value={form.maritalStatus}
              onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}
            >
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </div>
          <Input
            label="Emergency Contact Name"
            placeholder="Relative/Guardian name"
            value={form.emergencyName}
            onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
          />
          <Input
            label="Emergency Contact Phone"
            placeholder="Mobile number"
            value={form.emergencyPhone}
            onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
          />
          <Input
            label="Insurance Provider"
            placeholder="e.g. Star Health, PMJAY"
            value={form.insuranceProvider}
            onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })}
          />
          <Input
            label="Email Address (Optional)"
            placeholder="patient@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-200">
          <Input
            label="Medical History & Chronic Conditions"
            placeholder="e.g. Hypertension, Diabetes, Cardiac"
            value={form.medicalAlerts}
            onChange={(e) => setForm({ ...form, medicalAlerts: e.target.value })}
          />
          <Input
            label="Known Allergies (Comma separated)"
            placeholder="e.g. Penicillin, Dust, Sulfa"
            value={form.allergies}
            onChange={(e) => setForm({ ...form, allergies: e.target.value })}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button onClick={onClose} type="button" variant="secondary" className="text-xs px-5 h-[40px]">
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="text-xs px-6 h-[40px] bg-[#2F63F2]">
            Save Profile
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// PATIENT VISIT HISTORY MODAL
const PatientHistoryModal = ({ patient, isOpen, onClose }) => {
  if (!isOpen || !patient) return null;

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['patient_history', patient._id],
    queryFn: async () => {
      const res = await api.get(`/operations/patients/${patient._id}/history`);
      return res.data.data;
    },
    enabled: isOpen && !!patient._id
  });

  const historyList = useMemo(() => {
    if (!historyData) return [];
    if (Array.isArray(historyData)) return historyData;
    if (Array.isArray(historyData.consultations)) return historyData.consultations;
    if (Array.isArray(historyData.appointments)) return historyData.appointments;
    if (Array.isArray(historyData.history)) return historyData.history;
    return [];
  }, [historyData]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`VISIT HISTORY - ${patient.name?.toUpperCase()}`}
      maxWidth="max-w-[650px]"
    >
      <div className="space-y-4 text-left font-sans text-xs max-h-[450px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 font-medium">Loading visit history...</div>
        ) : !historyList || historyList.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
            No previous consultation records found for this patient.
          </div>
        ) : (
          historyList.map((item, idx) => (
            <div key={item._id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-bold text-slate-900 font-mono">
                  {new Date(item.createdAt || item.date || Date.now()).toLocaleDateString()}
                </span>
                <span className="text-[10px] font-bold text-[#2F63F2] bg-[#2F63F2]/10 border border-[#2F63F2]/20 px-2 py-0.5 rounded-lg font-mono">
                  {item.appointmentId?.tokenNumber ? `Token #${item.appointmentId.tokenNumber}` : `Record #${idx + 1}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Consulting Doctor:</span>
                  <strong className="text-slate-800">{item.doctorId?.name || item.doctorId || 'Unassigned'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Primary Diagnosis:</span>
                  <strong className="text-slate-800">{item.primaryDiagnosis || item.diagnosis || 'General Consultation'}</strong>
                </div>
              </div>
              {item.clinicalNotes && (
                <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Clinical Notes</span>
                  <span className="text-slate-800">{item.clinicalNotes}</span>
                </div>
              )}
            </div>
          ))
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="secondary" className="text-xs px-5">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};


const ReceptionistAppointments = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { billingSettings, workflow, getAppointmentActions, getQueueEvaluation } = useBillingSettings();

  const isReceptionFeeCollector = billingSettings?.feeCollectionRole === 'Reception';
  const isBeforeConsultationTiming = workflow.isBeforeConsultation;

  const [isBookOpen, setIsBookOpen] = useState(false);
  const [isTokenPanelOpen, setIsTokenPanelOpen] = useState(false);
  const [dateRangeChip, setDateRangeChip] = useState('TODAY');

  // Left Panel Registration & Token Generation State
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [selectedTokenPatient, setSelectedTokenPatient] = useState(null);
  const [tokenPatientForm, setTokenPatientForm] = useState({
    name: '',
    mobileNumber: '',
    age: '',
    gender: '',
    bloodGroup: '',
    place: ''
  });
  const [tokenSelectedComplaints, setTokenSelectedComplaints] = useState([]);
  const [tokenAdditionalNotes, setTokenAdditionalNotes] = useState('');
  const [tokenDoctorId, setTokenDoctorId] = useState('');
  const [tokenConsultationType, setTokenConsultationType] = useState('General Consultation');
  const [tokenSubmitting, setTokenSubmitting] = useState(false);
  const [panelPaymentMethod, setPanelPaymentMethod] = useState('Cash');
  const [panelConsultationFee, setPanelConsultationFee] = useState(500);
  const [panelPaymentStatus, setPanelPaymentStatus] = useState('Pending');

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBottomSheetApp, setActiveBottomSheetApp] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Inline Token Panel GPS Geofence Location State & Acquisition
  const [inlineGpsLocation, setInlineGpsLocation] = useState({ lat: null, lng: null, loading: false, error: null });

  const acquireInlineGps = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setInlineGpsLocation({ lat: null, lng: null, loading: false, error: 'Geolocation not supported' });
      return;
    }
    setInlineGpsLocation(prev => ({ ...prev, loading: true, error: null }));

    const getPos = (options) => new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => reject(err),
        options
      );
    });

    getPos({ enableHighAccuracy: true, timeout: 6000, maximumAge: 0 })
      .catch(() => getPos({ enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }))
      .then((coords) => {
        setInlineGpsLocation({ lat: coords.latitude, lng: coords.longitude, loading: false, error: null });
      })
      .catch((err) => {
        setInlineGpsLocation({ lat: null, lng: null, loading: false, error: 'Location permission required' });
      });
  }, []);

  useEffect(() => {
    if (isTokenPanelOpen) {
      acquireInlineGps();
    }
  }, [isTokenPanelOpen, acquireInlineGps]);

  // Listen for FAB open event or URL action
  useEffect(() => {
    if (searchParams.get('action') === 'generate' || searchParams.get('generateToken') === 'true') {
      setIsTokenPanelOpen(true);
      searchParams.delete('action');
      searchParams.delete('generateToken');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const handleOpenToken = () => setIsTokenPanelOpen(true);
    window.addEventListener('open-generate-token', handleOpenToken);
    return () => window.removeEventListener('open-generate-token', handleOpenToken);
  }, []);

  // Drawer & Modal States
  const [activeDrawerPatient, setActiveDrawerPatient] = useState(null);
  const [editingPatientModal, setEditingPatientModal] = useState(null);
  const [historyPatient, setHistoryPatient] = useState(null);
  const [paymentModalApp, setPaymentModalApp] = useState(null);
  const [viewDetailModalData, setViewDetailModalData] = useState(null);
  const [tokenPrintModalApp, setTokenPrintModalApp] = useState(null);

  const getLocalDateString = (d = new Date()) => {
    return d.toLocaleDateString('en-CA');
  };
  const todayStr = getLocalDateString();

  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterFromDate, setFilterFromDate] = useState(todayStr);
  const [filterToDate, setFilterToDate] = useState(todayStr);
  const [isLiveQueuePanelOpen, setIsLiveQueuePanelOpen] = useState(false);
  const [isTokenBookingModalOpen, setIsTokenBookingModalOpen] = useState(false);
  // Segmented Workspace Tab State: 'ACTIVE_QUEUE' | 'PHARMACY' | 'COMPLETED' | 'ALL'
  const [workspaceTab, setWorkspaceTab] = useState('ACTIVE_QUEUE');

  // Voice Announcement Language State Mode: 'BOTH' | 'EN_ONLY' | 'TA_ONLY'
  const [voiceLangMode, setVoiceLangMode] = useState('BOTH');

  // Emergency Intake Module State
  const [isEmergencyDrawerOpen, setIsEmergencyDrawerOpen] = useState(false);
  const [convertPatientModalData, setConvertPatientModalData] = useState(null);

  useEffect(() => {
    const handleOpenEmergency = () => setIsEmergencyDrawerOpen(true);
    window.addEventListener('open-emergency-token', handleOpenEmergency);
    return () => window.removeEventListener('open-emergency-token', handleOpenEmergency);
  }, []);

  // Fetch doctors
  const { data: doctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data.data;
    }
  });

  // In-Memory Doctor Presence State
  const [doctorPresenceMap, setDoctorPresenceMap] = useState({});

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (tokenDoctorId && doctors) {
      const doc = doctors.find(d => d._id === tokenDoctorId);
      if (doc?.doctorProfile?.consultationFee) {
        setPanelConsultationFee(doc.doctorProfile.consultationFee);
      }
    }
  }, [tokenDoctorId, doctors]);

  // Left Panel Patient Search Query
  const { data: tokenSearchResults } = useQuery({
    queryKey: ['patients', 'left_panel_search', tokenSearchQuery],
    queryFn: async () => {
      if (!tokenSearchQuery || tokenSearchQuery.trim().length < 1) return [];
      const res = await api.get(`/operations/patients/search?query=${encodeURIComponent(tokenSearchQuery)}`);
      return res.data.data;
    },
    enabled: isTokenPanelOpen && tokenSearchQuery.trim().length >= 1
  });

  const handleGenerateTokenFromPanel = async (isEmergency = false, isSaveRegistration = false) => {
    let targetPatientId = selectedTokenPatient?._id;
    let targetPatientObj = selectedTokenPatient;

    if (!targetPatientId) {
      if (!tokenPatientForm.name || !tokenPatientForm.name.trim()) {
        toast.error('Patient Name is required.');
        return;
      }
      if (!tokenPatientForm.mobileNumber || !/^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(tokenPatientForm.mobileNumber)) {
        toast.error('Please enter a valid mobile number.');
        return;
      }
      const ageNum = Number(tokenPatientForm.age);
      if (!tokenPatientForm.age) {
        toast.error('Patient Age is required.');
        return;
      }
      if (isNaN(ageNum) || ageNum <= 0 || ageNum > 120) {
        toast.error('Please enter a valid age (1 to 120).');
        return;
      }
      if (!tokenPatientForm.gender) {
        toast.error('Please select Gender.');
        return;
      }
    }

    if (!tokenDoctorId) {
      toast.error('Please select a Consulting Doctor.');
      return;
    }

    // Validation for Generate Token in Before Consultation mode
    if (!isSaveRegistration && isBeforeConsultationTiming && isReceptionFeeCollector && panelPaymentStatus !== 'Paid') {
      toast.error('Payment is Pending. Please collect payment or click "Save Registration".');
      return;
    }

    setTokenSubmitting(true);

    try {
      // 1. Create Patient Profile if New Patient
      if (!targetPatientId) {
        const patientPayload = {
          name: tokenPatientForm.name.trim(),
          mobileNumber: tokenPatientForm.mobileNumber,
          gender: tokenPatientForm.gender,
          bloodGroup: tokenPatientForm.bloodGroup || 'O+',
          age: Number(tokenPatientForm.age) || 0,
          address: tokenPatientForm.place?.trim() || undefined
        };

        const regRes = await api.post('/operations/patients', patientPayload);
        targetPatientObj = regRes.data.data;
        targetPatientId = targetPatientObj._id;
        if (regRes.data.isExisting) {
          toast.success(`Using existing patient profile: ${targetPatientObj.name} (${targetPatientObj.uhid})`);
        } else {
          toast.success(`Registered patient: ${targetPatientObj.uhid}`);
        }
      }

      // 2. Format Chief Complaints Text
      const complaintsList = tokenSelectedComplaints.filter(c => c !== 'Other');
      if (tokenSelectedComplaints.includes('Other') && tokenAdditionalNotes.trim()) {
        complaintsList.push(`Other: ${tokenAdditionalNotes.trim()}`);
      }
      const complaintSummary = complaintsList.join(', ');

      const isEmergencyConsult = isEmergency || tokenConsultationType === 'Emergency Consultation';
      const finalConsultType = isEmergencyConsult ? 'Emergency Consultation' : tokenConsultationType;
      const currentTimeStr = new Date().toTimeString().split(' ')[0].substring(0, 5);

      // Determine initial billing status based on hospital configuration or Save Registration flag
      let initialBillingStatus = 'Paid';
      if (isSaveRegistration || !isBeforeConsultationTiming || !isReceptionFeeCollector) {
        initialBillingStatus = 'Unpaid';
      } else {
        initialBillingStatus = (panelPaymentStatus === 'Paid') ? 'Paid' : 'Unpaid';
      }

      // 3. Attach GPS Location for Geofence validation
      let submitLat = inlineGpsLocation.lat;
      let submitLng = inlineGpsLocation.lng;

      if (submitLat == null || submitLng == null) {
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
            submitLat = coords.latitude;
            submitLng = coords.longitude;
          }
        } catch (e) {}
      }

      const appPayload = {
        patientId: targetPatientId,
        doctorId: tokenDoctorId,
        date: todayStr,
        time: currentTimeStr,
        appointmentType: finalConsultType,
        chiefComplaint: complaintSummary || undefined,
        isEmergency: isEmergencyConsult,
        billingStatus: initialBillingStatus,
        paymentMethod: (initialBillingStatus === 'Paid') ? panelPaymentMethod : undefined,
        consultationFee: Number(panelConsultationFee) || selectedDoctorObj?.doctorProfile?.consultationFee || 500,
        latitude: submitLat,
        longitude: submitLng
      };

      const bookingRes = await api.post('/operations/appointments', appPayload);
      const newAppointment = bookingRes.data.data;

      if (isSaveRegistration) {
        toast.success(`✓ Registration & Token #${newAppointment.tokenNumber} saved (Payment Pending)`);
      } else if (initialBillingStatus === 'Paid') {
        toast.success(`✓ Token #${newAppointment.tokenNumber} generated & ₹${appPayload.consultationFee} collected via ${panelPaymentMethod}`);
      } else {
        toast.success(`✓ Token #${newAppointment.tokenNumber} generated (Pay After Consultation)`);
      }

      // Reset left panel form state & close panel
      setSelectedTokenPatient(null);
      setTokenSearchQuery('');
      setTokenPatientForm({
        name: '',
        mobileNumber: '',
        age: '',
        gender: 'Male',
        bloodGroup: 'O+',
        place: ''
      });
      setTokenSelectedComplaints([]);
      setTokenAdditionalNotes('');
      setTokenDoctorId('');
      setPanelPaymentStatus('Pending');
      setPanelPaymentMethod('Cash');
      setPanelConsultationFee(500);
      setIsTokenPanelOpen(false);

      // Auto focus on Active Queue and Today view
      setDateRangeChip('TODAY');
      setFilterFromDate(todayStr);
      setFilterToDate(todayStr);
      setWorkspaceTab('ACTIVE_QUEUE');
      setStatusFilter('ALL');

      // Refetch Queue Data across all queries
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate token');
    } finally {
      setTokenSubmitting(false);
    }
  };

  const getDaysLimit = (fromStr, toStr) => {
    if (!fromStr || !toStr) return 0;
    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);
    const diffTime = toDate.getTime() - fromDate.getTime();
    if (diffTime < 0) return 0;
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  };

  const isDateRangeInvalid = filterFromDate && filterToDate && filterFromDate > filterToDate;

  const handleClearFilters = () => {
    setFilterDoctor('');
    setDateRangeChip('TODAY');
    setFilterFromDate(todayStr);
    setFilterToDate(todayStr);
    setStatusFilter('ALL');
    setSearchQuery('');
  };

  // Fetch all appointments
  const { data: rawAppointments, isLoading: appLoading, refetch } = useQuery({
    queryKey: ['appointments', 'all', filterDoctor, filterFromDate, filterToDate],
    queryFn: async () => {
      if (isDateRangeInvalid) return [];
      let url = `/operations/appointments?`;
      if (filterDoctor) url += `doctorId=${filterDoctor}&`;
      if (filterFromDate) {
        url += `date=${filterFromDate}&includeUpcomingScheduled=true&`;
        const daysLimit = getDaysLimit(filterFromDate, filterToDate);
        if (daysLimit > 0) url += `daysLimit=${daysLimit}&`;
      }
      const res = await api.get(url);
      return res.data.data;
    }
  });

  const appointments = rawAppointments || [];

  // Real-Time Voice Announcement Listener in Receptionist Workspace
  useEffect(() => {
    const unsubscribe = workflowRealtime.subscribe((event) => {
      refetch();
      if (event && event.type === 'PatientCalled') {
        const qState = (event.queueState || event.status || '').toUpperCase();
        if (qState === 'CALLED' || qState.includes('CONSULTATION')) {
          voiceAnnouncement.announceCall(event);
        }
      }
    });

    return () => unsubscribe();
  }, [refetch]);

  // Sort doctors by live waiting queue count (lowest queue count first)
  const sortedDoctorsWithQueueCount = useMemo(() => {
    if (!doctors) return [];

    return [...doctors].map(doc => {
      const docId = String(doc._id || doc.id);
      const waitingCount = (appointments || []).filter(app => {
        const appDocId = String(app.doctorId?._id || app.doctorId || '');
        if (appDocId !== docId) return false;
        const qState = (app.workflow?.queueState || app.queueStatus || app.status || 'WAITING').toUpperCase();
        return qState === 'WAITING' || qState === 'READY' || qState === 'SCHEDULED';
      }).length;

      return {
        ...doc,
        waitingCount
      };
    }).sort((a, b) => a.waitingCount - b.waitingCount);
  }, [doctors, appointments]);

  // Update Queue Status Mutation
  const updateQueueStatusMutation = useMutation({
    mutationFn: async ({ id, status, queueStatus, billingStatus }) => {
      const res = await api.put(`/operations/appointments/${id}/queue`, { status, queueStatus, billingStatus });
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success(`Patient status updated: ${data.status || data.queueStatus}`);
      queryClient.invalidateQueries(['appointments']);
      refetch();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update patient status');
    }
  });

  // Check-In Scheduled Patient Mutation
  const checkInMutation = useMutation({
    mutationFn: async (appointmentId) => {
      const res = await api.put(`/operations/appointments/${appointmentId}/check-in`);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Patient checked in successfully!');
      queryClient.invalidateQueries(['appointments']);
      queryClient.invalidateQueries(['todayQueue']);
      queryClient.invalidateQueries(['liveQueueAppointments']);
      refetch();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Check-in failed. Please try again.');
    }
  });

  const handleCheckIn = (app) => {
    if (!app || !app._id) return;
    checkInMutation.mutate(app._id);
  };

  // Calculate Doctor Queue States (Single Active Doctor Consultation)
  const doctorQueueState = useMemo(() => {
    const map = {};

    appointments.forEach((app) => {
      const docId = app.doctorId?._id || app.doctorId || 'unassigned';
      if (!map[docId]) {
        map[docId] = { activeApp: null, waitingApps: [] };
      }

      const st = app.status || app.queueStatus || 'Waiting';
      const isInConsultationOrCalled = st === 'In Consultation' || st === 'Called' || st === 'Admitted';
      const isWaiting = st === 'Waiting' || st === 'Scheduled';

      if (isInConsultationOrCalled) {
        map[docId].activeApp = app;
      } else if (isWaiting) {
        map[docId].waitingApps.push(app);
      }
    });

    return map;
  }, [appointments]);

  // KPI Summary Counts
  const kpiCounts = useMemo(() => {
    let scheduled = 0;
    let waiting = 0;
    let called = 0;
    let inConsultation = 0;
    let sentToPharmacy = 0;
    let completed = 0;
    let emergency = 0;

    appointments.forEach((app) => {
      const st = app.status || app.queueStatus || 'Waiting';
      const qState = (app.workflow?.queueState || '').toUpperCase();
      const isEmg = app.isEmergency || app.priorityLevel === 'EMERGENCY' || app.priority === 'EMERGENCY' || (app.consultationType || '').toLowerCase() === 'emergency';
      const isScheduled = st === 'Scheduled' || qState === 'SCHEDULED' || (!app.tokenNumber && st !== 'Completed' && st !== 'In Consultation' && st !== 'Sent to Pharmacy' && st !== 'Cancelled' && st !== 'Admitted');

      if (isEmg && st !== 'Completed' && st !== 'In Consultation' && st !== 'Cancelled' && st !== 'Sent to Pharmacy') {
        emergency++;
      }
      if (isScheduled) scheduled++;
      else if (st === 'In Consultation' || st === 'Admitted' || qState === 'IN_CONSULTATION') inConsultation++;
      else if (st === 'Called' || qState === 'CALLED') called++;
      else if (st === 'Sent to Pharmacy' || qState === 'SENT_TO_PHARMACY' || app.pharmacyStatus === 'SENT' || app.pharmacyStatus === 'DISPENSING') sentToPharmacy++;
      else if (st === 'Completed' || qState === 'COMPLETED' || app.pharmacyStatus === 'DISPENSED') completed++;
      else if (st === 'Waiting' || qState === 'WAITING' || qState === 'CHECKED_IN') waiting++;
    });

    return { scheduled, waiting, called, inConsultation, sentToPharmacy, completed, emergency };
  }, [appointments]);

  // Filtered Appointments List by Status & Search Query
  const filteredAppointments = useMemo(() => {
    return appointments.filter((app) => {
      const st = app.status || app.queueStatus || 'Waiting';
      const qState = (app.workflow?.queueState || '').toUpperCase();
      const isScheduled = st === 'Scheduled' || qState === 'SCHEDULED' || (!app.tokenNumber && st !== 'Completed' && st !== 'In Consultation' && st !== 'Sent to Pharmacy' && st !== 'Cancelled' && st !== 'Admitted');

      // Workspace Segmented Tab Filter
      if (workspaceTab === 'SCHEDULED') {
        if (!isScheduled) return false;
      } else if (workspaceTab === 'ACTIVE_QUEUE') {
        if (isScheduled) return false;
        if (st === 'Completed' || st === 'Cancelled' || qState === 'COMPLETED' || qState === 'CANCELLED') return false;
      } else if (workspaceTab === 'IN_CONSULTATION') {
        if (st !== 'In Consultation' && st !== 'Admitted' && qState !== 'IN_CONSULTATION') return false;
      } else if (workspaceTab === 'PHARMACY') {
        if (st !== 'Sent to Pharmacy' && qState !== 'SENT_TO_PHARMACY' && app.pharmacyStatus !== 'SENT' && app.pharmacyStatus !== 'DISPENSING') return false;
      } else if (workspaceTab === 'COMPLETED') {
        if (st !== 'Completed' && qState !== 'COMPLETED' && app.pharmacyStatus !== 'DISPENSED') return false;
      }

      // Status Chip Filter (if set)
      let statusMatch = true;
      if (statusFilter === 'EMERGENCY') statusMatch = app.isEmergency || app.priorityLevel === 'EMERGENCY' || app.priority === 'EMERGENCY' || (app.consultationType || '').toLowerCase() === 'emergency';
      else if (statusFilter === 'SCHEDULED') statusMatch = isScheduled;
      else if (statusFilter === 'WAITING') statusMatch = (st === 'Waiting' || qState === 'WAITING' || qState === 'CHECKED_IN') && !isScheduled;
      else if (statusFilter === 'CALLED') statusMatch = st === 'Called' || qState === 'CALLED';
      else if (statusFilter === 'IN_CONSULTATION') statusMatch = st === 'In Consultation' || st === 'Admitted' || qState === 'IN_CONSULTATION';
      else if (statusFilter === 'SENT_TO_PHARMACY') statusMatch = st === 'Sent to Pharmacy' || qState === 'SENT_TO_PHARMACY';
      else if (statusFilter === 'COMPLETED') statusMatch = st === 'Completed' || qState === 'COMPLETED';
      else if (statusFilter === 'SKIPPED') statusMatch = st === 'Skipped' || qState === 'SKIPPED';

      if (!statusMatch) return false;

      // 2. Search Query Filter
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const pName = (app.patientId?.name || '').toLowerCase();
        const pUhid = (app.patientId?.uhid || '').toLowerCase();
        const pMobile = (app.patientId?.mobileNumber || '').toLowerCase();
        const token = (app.tokenNumber || '').toLowerCase();
        const docName = (app.doctorId?.name || '').toLowerCase();

        return pName.includes(q) || pUhid.includes(q) || pMobile.includes(q) || token.includes(q) || docName.includes(q);
      }

      return true;
    });
  }, [appointments, workspaceTab, statusFilter, searchQuery]);

  // Group By Date toggle state
  const [groupByDate, setGroupByDate] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroupCollapse = (key) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Grouped Appointments by Date
  const groupedAppointments = useMemo(() => {
    if (!groupByDate) return null;
    const groups = {};

    filteredAppointments.forEach(app => {
      const dObj = app.date ? new Date(app.date) : new Date();
      const dateStr = dObj.toISOString().split('T')[0];
      const displayLabel = dObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: '2-digit',
        year: 'numeric'
      });

      if (!groups[dateStr]) {
        groups[dateStr] = {
          dateStr,
          label: displayLabel,
          items: []
        };
      }
      groups[dateStr].items.push(app);
    });

    // Sort dates descending (newest dates first)
    return Object.values(groups).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [filteredAppointments, groupByDate]);

  // Segmented Workspace Filtered Data
  const workspaceFilteredAppointments = useMemo(() => {
    return filteredAppointments.filter((app) => {
      const st = app.status || app.queueStatus || 'Waiting';

      if (workspaceTab === 'ACTIVE_QUEUE') {
        return st === 'Waiting' || st === 'Scheduled' || st === 'Called' || st === 'Admitted' || st === 'Skipped';
      } else if (workspaceTab === 'IN_CONSULTATION') {
        return st === 'In Consultation' || st === 'In-Consultation';
      } else if (workspaceTab === 'PHARMACY') {
        return st === 'Sent to Pharmacy' || st === 'Sent To Pharmacy' || app.pharmacyStatus === 'SENT' || app.pharmacyStatus === 'DISPENSING';
      } else if (workspaceTab === 'COMPLETED') {
        return st === 'Completed';
      }
      return true; // 'ALL'
    });
  }, [filteredAppointments, workspaceTab]);

  const handleCallNext = (app) => {
    updateQueueStatusMutation.mutate({
      id: app._id,
      status: 'Called',
      queueStatus: 'Called'
    });
    // Trigger Web Speech API Voice Announcement directly in Receptionist Workspace
    if (app) {
      voiceAnnouncement.announceCall({
        tokenNumber: app.tokenNumber,
        tokenNo: app.tokenNumber,
        patientName: app.patientId?.name || 'Patient',
        doctorName: app.doctorId?.name || 'Doctor',
        roomNo: app.doctorId?.roomNo || app.doctorId?.doctorProfile?.roomNo || 'Consultation Room'
      });
    }
  };

  const handleCompleteConsultation = (app) => {
    updateQueueStatusMutation.mutate({
      id: app._id,
      status: 'Completed',
      queueStatus: 'Completed'
    });
  };

  const handleSkipToken = (app) => {
    updateQueueStatusMutation.mutate({
      id: app._id,
      status: 'Skipped',
      queueStatus: 'Skipped'
    });
  };

  const handleRecallPatient = (app) => {
    updateQueueStatusMutation.mutate({
      id: app._id,
      status: 'Waiting',
      queueStatus: 'Waiting'
    });
  };

  const handleCancelAppointment = (app) => {
    if (window.confirm(`Are you sure you want to cancel appointment for ${app.patientId?.name}?`)) {
      updateQueueStatusMutation.mutate({
        id: app._id,
        status: 'Cancelled',
        queueStatus: 'Cancelled'
      });
    }
  };

  const handleViewConsultation = (app) => {
    setViewDetailModalData({
      title: 'CONSULTATION RECORD',
      row: app,
      content: `Consultation record for ${app.patientId?.name || 'Patient'}. Doctor: ${app.doctorId?.name || 'Unassigned'}. Status: ${app.status}.`
    });
  };

  const handleViewPrescription = (app) => {
    setViewDetailModalData({
      title: 'PRESCRIPTION DETAILS',
      row: app,
      content: `Rx generated for ${app.patientId?.name || 'Patient'}. Prescribed by ${app.doctorId?.name || 'Doctor'}.`
    });
  };

  const handleViewBill = (app) => {
    setViewDetailModalData({
      title: 'PATIENT BILLING SUMMARY',
      row: app,
      content: `Billing breakdown for Token #${app.tokenNumber || 'N/A'}. Consultation & Pharmacy Billed.`
    });
  };

  const handlePrintToken = (app) => {
    setTokenPrintModalApp(app);
  };

  return (
    <div className="space-y-6 text-left font-sans">
      {/* MOBILE QUEUE HEADER & STICKY SEARCH BAR */}
      <div className="md:hidden space-y-3 sticky top-0 bg-white/95 backdrop-blur-xs z-30 pt-2 pb-3 border-b border-slate-100 font-sans">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-extrabold text-slate-900 tracking-tight">OPD Reception Workspace</h1>
            <p className="text-[11px] font-semibold text-[#3563F6] mt-0.5">
              Today's Appointments <span className="text-slate-400 font-normal">({kpiCounts.waiting} waiting)</span>
            </p>
          </div>

          {/* Action Buttons in Mobile View */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsLiveQueuePanelOpen(!isLiveQueuePanelOpen);
                if (!isLiveQueuePanelOpen) setIsTokenPanelOpen(false);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer min-h-[38px] ${isLiveQueuePanelOpen
                ? 'bg-[#3563F6] text-white border-[#3563F6] shadow-xs'
                : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                }`}
            >
              <Activity className={`w-3.5 h-3.5 ${isLiveQueuePanelOpen ? 'text-white' : 'text-[#3563F6]'} animate-pulse`} />
              <span className="whitespace-nowrap">Live Queue</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsTokenPanelOpen(!isTokenPanelOpen);
                if (!isTokenPanelOpen) setIsLiveQueuePanelOpen(false);
              }}
              className="px-3 py-2 bg-[#3563F6] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs hover:bg-blue-700 transition-all cursor-pointer min-h-[38px]"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Token</span>
            </button>

            {billingSettings?.enableEmergencyModule === true && (
              <button
                type="button"
                onClick={() => setIsEmergencyDrawerOpen(true)}
                className="px-3 py-2 bg-gradient-to-r from-rose-600 to-red-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1 shadow-md shadow-rose-600/30 hover:from-rose-700 hover:to-red-800 transition-all cursor-pointer min-h-[38px]"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-white animate-pulse" />
                <span className="whitespace-nowrap">Emergency</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Voice Call & Language Selector Bar */}
        <div className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 min-h-[36px]">
            <Languages className="w-4 h-4 text-[#3563F6] shrink-0" />
            <select
              value={voiceLangMode}
              onChange={(e) => {
                const mode = e.target.value;
                setVoiceLangMode(mode);
                voiceAnnouncement.updateSettings({ languageMode: mode });
                const modeLabels = { BOTH: 'English + Tamil', EN_ONLY: 'English Only', TA_ONLY: 'Tamil Only' };
                toast.success(`Voice Announcement set to ${modeLabels[mode] || mode}`);
              }}
              title="Voice Call Announcement Language"
              className="text-xs font-bold text-slate-800 bg-transparent border-none outline-none cursor-pointer w-full"
            >
              <option value="BOTH">English + Tamil</option>
              <option value="EN_ONLY">English Only</option>
              <option value="TA_ONLY">Tamil Only</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              const activeCall = (appointments || []).find(a => (a.status || a.queueStatus) === 'Called' || (a.status || a.queueStatus) === 'In Consultation');
              if (activeCall) {
                voiceAnnouncement.announceCall({
                  tokenNumber: activeCall.tokenNumber,
                  tokenNo: activeCall.tokenNumber,
                  patientName: activeCall.patientId?.name || 'Patient',
                  doctorName: activeCall.doctorId?.name || 'Doctor',
                  roomNo: activeCall.doctorId?.roomNo || activeCall.doctorId?.doctorProfile?.roomNo || 'Consultation Room'
                });
                toast.success(`Voice Calling Token #${activeCall.tokenNumber}...`);
              } else {
                toast('No active patient call in queue to announce', { icon: '🔊' });
              }
            }}
            title="Replay Voice Announcement"
            className="flex items-center gap-1.5 font-bold text-xs px-3 py-1.5 rounded-lg border border-[#3563F6]/30 bg-[#3563F6]/10 hover:bg-[#3563F6]/20 text-[#3563F6] transition-all active:scale-98 cursor-pointer shrink-0 min-h-[36px]"
          >
            <Megaphone className="w-4 h-4 shrink-0" />
            <span className="font-extrabold">Voice Call</span>
          </button>
        </div>

        {/* Sticky Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Patient, UHID, Token..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] focus:bg-white transition-all min-h-[44px]"
          />
        </div>
      </div>

      {/* Desktop / Tablet Page Header */}
      <div className="hidden md:flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">OPD Reception Workspace</h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Today's Appointments & Live Queue Management
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1 h-[42px] shadow-2xs">
            <Languages className="w-4 h-4 text-slate-500 shrink-0 ml-1" />
            <select
              value={voiceLangMode}
              onChange={(e) => {
                const mode = e.target.value;
                setVoiceLangMode(mode);
                voiceAnnouncement.updateSettings({ languageMode: mode });
                const modeLabels = { BOTH: 'English + Tamil', EN_ONLY: 'English Only', TA_ONLY: 'Tamil Only' };
                toast.success(`Voice Announcement set to ${modeLabels[mode] || mode}`);
              }}
              title="Voice Call Announcement Language"
              className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none cursor-pointer pr-1"
            >
              <option value="BOTH">English + Tamil</option>
              <option value="EN_ONLY">English Only</option>
              <option value="TA_ONLY">Tamil Only</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              const activeCall = (appointments || []).find(a => (a.status || a.queueStatus) === 'Called' || (a.status || a.queueStatus) === 'In Consultation');
              if (activeCall) {
                voiceAnnouncement.announceCall({
                  tokenNumber: activeCall.tokenNumber,
                  tokenNo: activeCall.tokenNumber,
                  patientName: activeCall.patientId?.name || 'Patient',
                  doctorName: activeCall.doctorId?.name || 'Doctor',
                  roomNo: activeCall.doctorId?.roomNo || activeCall.doctorId?.doctorProfile?.roomNo || 'Consultation Room'
                });
                toast.success(`Voice Calling Token #${activeCall.tokenNumber}...`);
              } else {
                toast('No active patient call in queue to announce', { icon: '🔊' });
              }
            }}
            title="Replay Voice Announcement"
            className="flex items-center gap-1.5 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-all active:scale-98 cursor-pointer h-[42px] shrink-0"
          >
            <Megaphone className="w-4 h-4 text-[#3563F6] shrink-0" />
            <span className="hidden lg:inline">Voice Call</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsLiveQueuePanelOpen(!isLiveQueuePanelOpen);
              if (!isLiveQueuePanelOpen) setIsTokenPanelOpen(false);
            }}
            className={`flex items-center gap-2 font-bold text-xs px-4 py-2.5 rounded-xl border shadow-2xs transition-all active:scale-98 cursor-pointer h-[42px] whitespace-nowrap shrink-0 ${isLiveQueuePanelOpen
              ? 'bg-[#3563F6] text-white border-[#3563F6]'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
              }`}
          >
            <Activity className={`w-4 h-4 ${isLiveQueuePanelOpen ? 'text-white' : 'text-[#3563F6]'} animate-pulse shrink-0`} />
            <span className="whitespace-nowrap">Live Doctor Queue</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping ml-0.5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIsTokenPanelOpen(!isTokenPanelOpen);
              if (!isTokenPanelOpen) setIsLiveQueuePanelOpen(false);
            }}
            className={`flex items-center gap-2 font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer h-[42px] whitespace-nowrap shrink-0 ${isTokenPanelOpen
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
              : 'bg-[#3563F6] hover:bg-blue-700 text-white'
              }`}
          >
            {isTokenPanelOpen ? <X className="w-4 h-4 shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
            <span className="whitespace-nowrap">{isTokenPanelOpen ? 'Hide Registration' : 'Generate Token'}</span>
          </button>

          {billingSettings?.enableEmergencyModule === true && (
            <button
              type="button"
              onClick={() => setIsEmergencyDrawerOpen(true)}
              className="flex items-center gap-2 font-extrabold text-xs px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-md shadow-rose-600/30 hover:from-rose-700 hover:to-red-800 transition-all active:scale-98 cursor-pointer h-[42px] whitespace-nowrap shrink-0 border border-rose-500/30"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
              <span className="whitespace-nowrap">Emergency Intake</span>
            </button>
          )}
        </div>
      </div>

      {/* SPLIT LAYOUT WORKSPACE CONTAINER */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* INLINE LIVE DOCTOR QUEUE LEFT SIDE PANEL */}
        <LiveQueueLeftPanel
          isOpen={isLiveQueuePanelOpen}
          onClose={() => setIsLiveQueuePanelOpen(false)}
          onViewAppointment={(app) => setViewDetailModalData(app)}
        />

        {/* LEFT WORKSPACE – INLINE GENERATE OPD TOKEN PANEL (38% WIDTH) */}
        <AnimatePresence>
          {isTokenPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0, x: -20 }}
              animate={{ width: '100%', opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: -20 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="overflow-hidden flex-shrink-0 w-full lg:w-[38%] bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-5 text-left font-sans"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#3563F6]" />
                    <span>Generate OPD Token</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Quick Patient Registration & Token Generation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTokenPanelOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* GPS Geofence Status Indicator */}
              <div className="flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold bg-slate-50 border-slate-200">
                <div className="flex items-center gap-2">
                  <MapPin className={`w-4 h-4 ${inlineGpsLocation.lat ? 'text-emerald-500' : inlineGpsLocation.error ? 'text-amber-500' : 'text-[#3563F6] animate-pulse'}`} />
                  <span className="text-slate-700">
                    {inlineGpsLocation.lat ? (
                      `✓ Location Locked (${inlineGpsLocation.lat.toFixed(4)}, ${inlineGpsLocation.lng.toFixed(4)})`
                    ) : inlineGpsLocation.loading ? (
                      `⏳ Acquiring GPS Location...`
                    ) : (
                      `⚠ GPS Permission Required`
                    )}
                  </span>
                </div>
                {(!inlineGpsLocation.lat || inlineGpsLocation.error) && (
                  <button
                    type="button"
                    onClick={acquireInlineGps}
                    className="text-[11px] font-bold text-[#3563F6] underline hover:text-blue-800"
                  >
                    Retry GPS
                  </button>
                )}
              </div>

              {/* 1. SEARCH PATIENT SECTION */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  Search Patient
                </label>

                {selectedTokenPatient ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-xs">{selectedTokenPatient.name}</span>
                        <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                          {selectedTokenPatient.uhid}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {selectedTokenPatient.mobileNumber} • {selectedTokenPatient.gender || 'N/A'} • {selectedTokenPatient.age ? `${selectedTokenPatient.age} Yrs` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTokenPatient(null);
                        setTokenSearchQuery('');
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search Mobile / UHID / Patient Name"
                      value={tokenSearchQuery}
                      onChange={(e) => setTokenSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] focus:bg-white transition-all min-h-[42px]"
                    />

                    {/* Search Dropdown Results */}
                    {tokenSearchResults && tokenSearchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {tokenSearchResults.map((p) => (
                          <button
                            key={p._id}
                            type="button"
                            onClick={() => {
                              setSelectedTokenPatient(p);
                              setTokenSearchQuery('');
                            }}
                            className="w-full p-2.5 text-left hover:bg-blue-50/60 transition-colors flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold text-slate-900 text-xs block">{p.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{p.mobileNumber}</span>
                            </div>
                            <span className="font-mono text-[10px] font-bold text-[#3563F6] bg-blue-50 px-2 py-0.5 rounded-md">
                              {p.uhid}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. PATIENT DETAILS (IF NEW PATIENT) */}
              {!selectedTokenPatient && (
                <div className="space-y-3 pt-1 border-t border-slate-100">
                  {/* Row 1: Mobile Number, Patient Name, Age */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <MobileNumber
                      id="panel-patient-mobile"
                      label="Mobile Number"
                      value={tokenPatientForm.mobileNumber}
                      onChange={(val) => setTokenPatientForm({ ...tokenPatientForm, mobileNumber: val })}
                    />

                    <Input
                      id="panel-patient-name"
                      label="Patient Name"
                      placeholder="Full Name"
                      value={tokenPatientForm.name}
                      onChange={(e) => setTokenPatientForm({ ...tokenPatientForm, name: e?.target ? e.target.value : e })}
                    />

                    <Input
                      id="panel-patient-age"
                      label="Age"
                      type="number"
                      min={1}
                      max={120}
                      placeholder="Years"
                      value={tokenPatientForm.age}
                      onChange={(e) => {
                        const raw = e?.target ? e.target.value : e;
                        const clean = String(raw).replace(/[^0-9]/g, '');
                        setTokenPatientForm({ ...tokenPatientForm, age: clean });
                      }}
                    />
                  </div>

                  {/* Row 2: Gender, Place, Blood Group */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1.5">Gender <span className="text-rose-500">*</span></label>
                      <select
                        value={tokenPatientForm.gender}
                        onChange={(e) => setTokenPatientForm({ ...tokenPatientForm, gender: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] h-[40px]"
                      >
                        <option value="" disabled>-- Select Gender --</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <Input
                      id="panel-patient-place"
                      label="Place / Village"
                      placeholder="City / Village"
                      value={tokenPatientForm.place}
                      onChange={(e) => setTokenPatientForm({ ...tokenPatientForm, place: e?.target ? e.target.value : e })}
                    />

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1.5">Blood Group (Optional)</label>
                      <select
                        value={tokenPatientForm.bloodGroup}
                        onChange={(e) => setTokenPatientForm({ ...tokenPatientForm, bloodGroup: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] h-[40px]"
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

              {/* 3. CHIEF COMPLAINT SECTION */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block">
                  Chief Complaint / Reason for Visit (Optional)
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {['Fever', 'Cold', 'Cough', 'Headache', 'Vomiting', 'Body Pain', 'Allergy', 'Injury', '+ Other'].map((chip) => {
                    const isOtherChip = chip === '+ Other';
                    const active = isOtherChip
                      ? tokenSelectedComplaints.includes('Other')
                      : tokenSelectedComplaints.includes(chip);

                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          if (isOtherChip) {
                            if (tokenSelectedComplaints.includes('Other')) {
                              setTokenSelectedComplaints(prev => prev.filter(c => c !== 'Other'));
                              setTokenAdditionalNotes('');
                            } else {
                              setTokenSelectedComplaints(prev => [...prev, 'Other']);
                            }
                          } else {
                            if (tokenSelectedComplaints.includes(chip)) {
                              setTokenSelectedComplaints(prev => prev.filter(c => c !== chip));
                            } else {
                              setTokenSelectedComplaints(prev => [...prev, chip]);
                            }
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${active
                          ? 'bg-[#3563F6] text-white border-[#3563F6]'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>

                {tokenSelectedComplaints.includes('Other') && (
                  <div className="pt-2">
                    <textarea
                      rows={2}
                      placeholder="Describe additional complaints or notes..."
                      value={tokenAdditionalNotes}
                      onChange={(e) => setTokenAdditionalNotes(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
                    />
                  </div>
                )}
              </div>

              {/* 4. CONSULTATION SECTION */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Consulting Doctor *
                  </label>
                  <select
                    value={tokenDoctorId}
                    onChange={(e) => setTokenDoctorId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] h-[44px]"
                  >
                    <option value="">-- Select Consulting Doctor --</option>
                    {sortedDoctorsWithQueueCount?.map((d) => {
                      const isOnline = Boolean(doctorPresenceMap[d._id]);
                      return (
                        <option key={d._id} value={d._id}>
                          {isOnline ? '🟢' : '⚪'} Dr. {d.name?.replace(/^Dr\.\s*/i, '')} ({isOnline ? 'ONLINE' : 'OFFLINE'} | Waiting: {d.waitingCount})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* 5. CONSULTATION FEE COLLECTION / POLICY SECTION */}
              {isBeforeConsultationTiming && isReceptionFeeCollector ? (
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90 space-y-3 text-left font-sans">
                  {/* Header Row */}
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/80">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#3563F6]" />
                      <span className="text-xs font-bold text-slate-800">
                        Consultation Fee Collection (Receptionist — Before Consultation)
                      </span>
                    </div>
                    {panelPaymentStatus === 'Paid' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 tracking-wide uppercase">
                        ✓ PAID
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 tracking-wide uppercase">
                        PENDING
                      </span>
                    )}
                  </div>

                  {/* Controls Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">
                        Consultation Fee:
                      </span>
                      <div className="relative flex items-center">
                        <span className="absolute left-2.5 text-xs font-bold text-[#3563F6]">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={panelConsultationFee}
                          onChange={(e) => setPanelConsultationFee(Math.max(0, Number(e.target.value) || 0))}
                          className="w-24 pl-6 pr-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono text-[#3563F6] focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
                          placeholder="Amount"
                        />
                      </div>
                    </div>

                    {panelPaymentStatus === 'Pending' ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={panelPaymentMethod}
                          onChange={(e) => setPanelPaymentMethod(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 cursor-pointer"
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="Card">Card</option>
                          <option value="Credit">Credit</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setPanelPaymentStatus('Paid');
                            toast.success(`Payment ₹${panelConsultationFee} collected via ${panelPaymentMethod}`);
                          }}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Collect Payment</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-emerald-700 font-bold text-xs flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Payment Completed ({panelPaymentMethod})</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-100">
                  <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-xs flex items-center gap-2 text-purple-800 font-medium">
                    <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>
                      <strong>After Consultation Policy:</strong> Patient consults doctor first. Receptionist collects fee after consultation.
                    </span>
                  </div>
                </div>
              )}

              {/* FOOTER BUTTONS & LIVE SUMMARY BAR */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                {isBeforeConsultationTiming && isReceptionFeeCollector && (
                  <div className="flex items-center justify-between text-xs px-1">
                    <div className="text-slate-600 font-medium">
                      Fee: <strong className="font-mono text-slate-900">₹{panelConsultationFee}</strong> • Status:{' '}
                      {panelPaymentStatus === 'Paid' ? (
                        <span className="font-bold text-emerald-600">✓ Paid</span>
                      ) : (
                        <span className="font-bold text-amber-600">Pending</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={tokenSubmitting}
                    onClick={() => handleGenerateTokenFromPanel(false, true)}
                    className="min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 px-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className="truncate">Save Registration</span>
                  </button>

                  <button
                    type="button"
                    disabled={tokenSubmitting}
                    onClick={() => handleGenerateTokenFromPanel(false, false)}
                    className="min-h-[44px] bg-[#3563F6] hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 px-2 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tokenSubmitting ? 'Generating...' : 'Generate Token'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* RIGHT WORKSPACE – LIVE QUEUE DASHBOARD */}
        <div className="flex-1 min-w-0 w-full space-y-6">

          {/* 1. TOP QUEUE KPI SUMMARY CARDS (CLICKABLE) */}
          {billingSettings?.enableEmergencyModule === true && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-sans">
              {/* 🚨 Emergency Stat Card */}
              <button
                type="button"
                onClick={() => {
                  setWorkspaceTab('ACTIVE_QUEUE');
                  setStatusFilter(statusFilter === 'EMERGENCY' ? 'ALL' : 'EMERGENCY');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${statusFilter === 'EMERGENCY'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/20'
                  : 'bg-rose-50/50 text-rose-950 border-rose-200 hover:border-rose-300 hover:bg-rose-100/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider ${statusFilter === 'EMERGENCY' ? 'text-rose-100' : 'text-rose-700'}`}>
                    Emergency
                  </span>
                  <AlertTriangle className={`w-4 h-4 ${statusFilter === 'EMERGENCY' ? 'text-white' : 'text-rose-600'} animate-pulse`} />
                </div>
                <div className="text-xl font-extrabold font-mono mt-1 text-rose-600 flex items-center justify-between">
                  <span>{kpiCounts.emergency}</span>
                </div>
              </button>
            </div>
          )}

          {/* Main Content Card */}
          <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-6 shadow-sm hover:shadow-md transition-all duration-300 space-y-5">

            {/* Filters Section: Doctor & Date Chips */}
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 w-full">
                <div className="w-full md:w-auto flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Date Range:</label>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full">
                    {[
                      { key: 'TODAY', label: 'Today' },
                      { key: 'YESTERDAY', label: 'Yesterday' },
                      { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
                      { key: 'THIS_MONTH', label: 'This Month' },
                      { key: 'CUSTOM', label: 'Custom Range' }
                    ].map((chip) => {
                      const active = dateRangeChip === chip.key;
                      return (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => {
                            setDateRangeChip(chip.key);
                            if (chip.key === 'TODAY') {
                              setFilterFromDate(todayStr);
                              setFilterToDate(todayStr);
                            } else if (chip.key === 'YESTERDAY') {
                              const y = new Date();
                              y.setDate(y.getDate() - 1);
                              const yStr = y.toLocaleDateString('en-CA');
                              setFilterFromDate(yStr);
                              setFilterToDate(yStr);
                            } else if (chip.key === 'LAST_7_DAYS') {
                              const d7 = new Date();
                              d7.setDate(d7.getDate() - 6);
                              setFilterFromDate(d7.toLocaleDateString('en-CA'));
                              setFilterToDate(todayStr);
                            } else if (chip.key === 'THIS_MONTH') {
                              const now = new Date();
                              const start = new Date(now.getFullYear(), now.getMonth(), 1);
                              setFilterFromDate(start.toLocaleDateString('en-CA'));
                              setFilterToDate(todayStr);
                            }
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer min-h-[38px] whitespace-nowrap ${active
                            ? 'bg-[#3563F6] text-white border-[#3563F6] shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full md:w-auto min-w-[240px] md:self-end">
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] h-[40px]"
                    value={filterDoctor}
                    onChange={(e) => setFilterDoctor(e.target.value)}
                  >
                    <option value="">All Consulting Doctors</option>
                    {doctors?.map(d => (
                      <option key={d._id} value={d._id}>{d.name} ({d.departmentId?.name || 'OPD'})</option>
                    ))}
                  </select>
                </div>
              </div>

              {dateRangeChip === 'CUSTOM' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <DatePicker
                    id="filter-from-date"
                    label="From Date"
                    value={filterFromDate}
                    onChange={(val) => setFilterFromDate(val)}
                    error={isDateRangeInvalid ? 'From Date cannot be after To Date' : ''}
                  />
                  <DatePicker
                    id="filter-to-date"
                    label="To Date"
                    value={filterToDate}
                    onChange={(val) => setFilterToDate(val)}
                    error={isDateRangeInvalid ? 'To Date cannot be before From Date' : ''}
                  />
                </div>
              )}
            </div>

            {/* PATIENT LIST SEGMENTED TABS (RESPONSIVE 6-COLUMN GRID) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 w-full">
              <button
                type="button"
                onClick={() => { setWorkspaceTab('SCHEDULED'); setStatusFilter('ALL'); }}
                className={`w-full px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px] ${workspaceTab === 'SCHEDULED'
                  ? 'bg-white text-amber-700 shadow-xs border border-slate-200/60 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <span className="truncate">📅 Scheduled</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0">
                  {kpiCounts.scheduled}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setWorkspaceTab('ACTIVE_QUEUE'); setStatusFilter('ALL'); }}
                className={`w-full px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px] ${workspaceTab === 'ACTIVE_QUEUE'
                  ? 'bg-white text-[#3563F6] shadow-xs border border-slate-200/60 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <span className="truncate">⚡ Active Queue</span>
                <span className="bg-blue-100 text-[#3563F6] text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0">
                  {kpiCounts.waiting + kpiCounts.called}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setWorkspaceTab('IN_CONSULTATION'); setStatusFilter('ALL'); }}
                className={`w-full px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px] ${workspaceTab === 'IN_CONSULTATION'
                  ? 'bg-white text-purple-600 shadow-xs border border-slate-200/60 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <span className="truncate">🩺 In Consultation</span>
                <span className="bg-purple-100 text-purple-700 text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0">
                  {kpiCounts.inConsultation}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setWorkspaceTab('PHARMACY'); setStatusFilter('ALL'); }}
                className={`w-full px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px] ${workspaceTab === 'PHARMACY'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <span className="truncate">💊 Pharmacy</span>
                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0">
                  {kpiCounts.sentToPharmacy}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setWorkspaceTab('COMPLETED'); setStatusFilter('ALL'); }}
                className={`w-full px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px] ${workspaceTab === 'COMPLETED'
                  ? 'bg-white text-emerald-600 shadow-xs border border-slate-200/60 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <span className="truncate">✅ Completed</span>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0">
                  {kpiCounts.completed}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setWorkspaceTab('ALL'); setStatusFilter('ALL'); }}
                className={`w-full px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px] ${workspaceTab === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <span className="truncate">📋 All Records</span>
                <span className="bg-slate-200 text-slate-700 text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0">
                  {appointments.length}
                </span>
              </button>
            </div>

            {/* PROMINENT PATIENT SEARCH & GROUP BY DATE CONTROL */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 pb-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search Patient Name, UHID, Mobile Number, or Token #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] focus:bg-white transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Group By Date Toggle Button */}
                <button
                  type="button"
                  onClick={() => setGroupByDate(prev => !prev)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold transition-all border flex items-center gap-2 cursor-pointer shadow-2xs ${groupByDate
                    ? 'bg-[#3563F6] text-white border-[#3563F6] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>{groupByDate ? 'Grouped Timeline View' : 'Group By Date'}</span>
                </button>

                {searchQuery && (
                  <div className="text-[11px] font-bold text-[#3563F6] bg-blue-50/80 px-3 py-2 rounded-xl border border-blue-100 whitespace-nowrap">
                    Matches: <strong>{filteredAppointments.length}</strong> patient(s)
                  </div>
                )}
              </div>
            </div>

            {/* RECEPTION OPERATIONAL OPD TABLE (GROUPED VS STANDARD VIEW) */}
            {groupedAppointments && groupByDate ? (
              <div className="space-y-4">
                {groupedAppointments.map((group) => {
                  const isCollapsed = collapsedGroups[group.dateStr];
                  return (
                    <div key={group.dateStr} className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.dateStr)}
                        className="w-full px-4 py-3 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between font-extrabold text-xs text-slate-800 tracking-wide uppercase cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <ChevronDown className={`w-4 h-4 text-[#3563F6] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                          <Calendar className="w-4 h-4 text-[#3563F6]" />
                          <span>{group.label}</span>
                        </div>
                        <span className="bg-blue-100 text-[#3563F6] px-2.5 py-0.5 rounded-full text-[11px] font-mono font-black">
                          {group.items.length} {group.items.length === 1 ? 'Patient' : 'Patients'}
                        </span>
                      </button>

                      {!isCollapsed && (
                        <Table
                          flat={true}
                          headers={[
                            {
                              key: 'tokenNumber',
                              label: 'Token',
                              render: (row) => {
                                const isScheduled = row.status === 'Scheduled' || row.queueStatus === 'Scheduled' || row.workflow?.queueState === 'SCHEDULED';
                                if (isScheduled || !row.tokenNumber) {
                                  return (
                                    <span className="font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border text-slate-400 bg-slate-100 border-slate-200">
                                      —
                                    </span>
                                  );
                                }
                                const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (row.tokenNumber || '').startsWith('EMG') || (row.patientId?.name || '').toLowerCase().includes('unknown');
                                return (
                                  <span className={`font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border ${
                                    isEmg ? 'text-rose-700 bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 font-extrabold' : 'text-[#2F63F2] bg-[#2F63F2]/10 border-[#2F63F2]/20'
                                  }`}>
                                    {row.tokenNumber}
                                  </span>
                                );
                              }
                            },
                            {
                              key: 'date',
                              label: 'Consultation Date',
                              render: (row) => {
                                const dateObj = new Date(row.date);
                                const day = String(dateObj.getDate()).padStart(2, '0');
                                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                                const year = dateObj.getFullYear();
                                return <span className="font-mono text-xs font-semibold text-slate-700">{`${day}/${month}/${year}`}</span>;
                              }
                            },
                            {
                              key: 'time',
                              label: 'Slot Time',
                              render: (row) => <span className="font-mono text-xs font-semibold">{row.time}</span>
                            },
                            {
                              key: 'patientId.name',
                              label: 'Patient Name',
                              render: (row) => (
                                <span className="font-bold text-slate-900 text-sm">{row.patientId?.name || 'Unknown'}</span>
                              )
                            },
                            {
                              key: 'doctorId.name',
                              label: 'Doctor',
                              render: (row) => <span className="font-semibold text-slate-700">{row.doctorId?.name || 'Unassigned'}</span>
                            },
                            {
                              key: 'patientStatus',
                              label: 'Patient Status',
                              render: (row) => {
                                const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (row.patientId?.name || '').toLowerCase().includes('unknown');
                                const status = row.status || row.queueStatus || 'Waiting';

                                if (isEmg && (status === 'Scheduled' || status === 'Waiting' || status === 'Arrived')) {
                                  return (
                                    <span className="text-[9px] font-extrabold border border-rose-300 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping shrink-0" />
                                      PRIORITY WAITING
                                    </span>
                                  );
                                }

                                const colors = {
                                  'Waiting': 'bg-blue-50 text-blue-600 border-blue-100',
                                  'Called': 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold',
                                  'In Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
                                  'Sent to Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                                  'Sent To Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                                  'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-100',
                                  'Skipped': 'bg-amber-50 text-amber-600 border-amber-100',
                                  'Cancelled': 'bg-rose-50 text-rose-600 border-rose-100',
                                  'Emergency': 'bg-red-100 text-red-700 border-red-200 font-extrabold'
                                };

                                return (
                                  <span className={`text-[9px] font-bold border px-2.5 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap inline-block ${colors[status] || 'bg-slate-50'}`}>
                                    {status}
                                  </span>
                                );
                              }
                            },
                            {
                              key: 'paymentStatus',
                              label: 'Payment Status',
                              render: (row) => {
                                const billingStatus = row.billingStatus || 'Unpaid';

                                if (billingStatus === 'Paid') {
                                  return (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 w-fit whitespace-nowrap">
                                      Paid
                                    </span>
                                  );
                                }
                                if (billingStatus === 'Exempt') {
                                  return (
                                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                      Exempt
                                    </span>
                                  );
                                }
                                return (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                    Collect Payment
                                  </span>
                                );
                              }
                            }
                          ]}
                          data={group.items}
                          actions={[
                            {
                              label: (row) => {
                                const billingStatus = row.billingStatus || 'Unpaid';
                                const status = row.status || row.queueStatus || 'Waiting';

                                if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                                  return 'Collect Payment';
                                }
                                if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                                  return 'Print Token';
                                }
                                if (status === 'Called') return 'Sent to Doctor';
                                if (status === 'In Consultation' || status === 'In-Consultation') return 'In Consultation';
                                if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return 'View';
                                if (status === 'Skipped') return 'Skipped';
                                if (status === 'Cancelled') return 'Cancelled';

                                return status;
                              },
                              icon: (row) => {
                                const billingStatus = row.billingStatus || 'Unpaid';
                                const status = row.status || row.queueStatus || 'Waiting';

                                if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                                  return null;
                                }
                                if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                                  return Ticket;
                                }
                                if (status === 'Called') return DoorOpen;
                                if (status === 'In Consultation' || status === 'In-Consultation') return Stethoscope;
                                if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return Eye;

                                return null;
                              },
                              isPrimary: true,
                              disabled: (row) => {
                                const billingStatus = row.billingStatus || 'Unpaid';
                                const status = row.status || row.queueStatus || 'Waiting';

                                if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                                  return false;
                                }
                                if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                                  return false;
                                }
                                if (status === 'In Consultation' || status === 'In-Consultation') {
                                  return true;
                                }
                                if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') {
                                  return false;
                                }
                                return true;
                              },
                              onClick: (row) => {
                                const billingStatus = row.billingStatus || 'Unpaid';
                                const status = row.status || row.queueStatus || 'Waiting';

                                if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                                  setPaymentModalApp(row);
                                } else if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                                  handlePrintToken(row);
                                } else if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') {
                                  handleViewConsultation(row);
                                }
                              }
                            },
                            {
                              label: 'Skip',
                              icon: SkipForward,
                              isPrimary: true,
                              variant: 'amber',
                              show: (row) => {
                                const status = row.status || row.queueStatus || 'Waiting';
                                return status === 'Waiting' || status === 'Scheduled' || status === 'Called';
                              },
                              onClick: (row) => handleSkipToken(row)
                            },
                            {
                              label: 'View Patient Info',
                              icon: User,
                              isPrimary: false,
                              show: () => true,
                              onClick: (row) => setActiveDrawerPatient(row.patientId)
                            },
                            {
                              label: 'Complete Profile',
                              icon: Edit,
                              isPrimary: false,
                              show: (row) => !isPatientProfileComplete(row.patientId) && row.status !== 'In Consultation' && row.status !== 'Admitted',
                              onClick: (row) => setEditingPatientModal(row.patientId)
                            },
                            {
                              label: 'Mark Completed',
                              icon: CheckCircle2,
                              isPrimary: false,
                              show: (row) => row.status === 'In Consultation' || row.status === 'In-Consultation' || row.queueStatus === 'In-Consultation',
                              onClick: (row) => handleCompleteConsultation(row)
                            },
                            {
                              label: 'Edit Profile',
                              icon: Edit,
                              isPrimary: false,
                              show: (row) => isPatientProfileComplete(row.patientId) && row.status !== 'In Consultation' && row.status !== 'Admitted',
                              onClick: (row) => setEditingPatientModal(row.patientId)
                            },
                            {
                              label: 'Visit History',
                              icon: FileText,
                              isPrimary: false,
                              show: (row) => row.status !== 'In Consultation' && row.status !== 'Admitted',
                              onClick: (row) => setHistoryPatient(row.patientId)
                            },
                            {
                              label: 'View Consultation',
                              icon: FileText,
                              isPrimary: false,
                              show: (row) => row.status === 'In Consultation' || row.status === 'Admitted' || row.status === 'Sent to Pharmacy' || row.status === 'Completed',
                              onClick: (row) => handleViewConsultation(row)
                            },
                            {
                              label: 'View Prescription',
                              icon: Pill,
                              isPrimary: false,
                              show: (row) => row.status === 'Sent to Pharmacy' || row.status === 'Completed',
                              onClick: (row) => handleViewPrescription(row)
                            },
                            {
                              label: 'View Bill',
                              icon: Receipt,
                              isPrimary: false,
                              show: (row) => row.status === 'Sent to Pharmacy' || row.status === 'Completed',
                              onClick: (row) => handleViewBill(row)
                            },
                            {
                              label: 'Print Prescription',
                              icon: Printer,
                              isPrimary: false,
                              show: (row) => row.status === 'Sent to Pharmacy' || row.status === 'Sent To Pharmacy' || row.status === 'Completed',
                              onClick: async (row) => {
                                try {
                                  const hospitalIdToUse = user?.hospitalId?._id || user?.hospitalId || user?.hospital?._id || user?.hospital || row.hospitalId?._id || row.hospitalId;
                                  let activeConfig = DEFAULT_PRINT_CONFIG;
                                  if (hospitalIdToUse) {
                                    try {
                                      const activeRes = await api.get(`/admin/hospitals/${hospitalIdToUse}/print-template/active`);
                                      if (activeRes.data?.data) {
                                        const activeT = activeRes.data.data;
                                        activeConfig = {
                                          printMode: activeT.mode || 'STANDARD',
                                          mode: activeT.mode || 'STANDARD',
                                          paper: { size: activeT.paperSize || 'A4', orientation: (activeT.orientation || 'Portrait').toUpperCase() },
                                          calibration: activeT.calibration || { topOffset: 0, leftOffset: 0, scale: 100 },
                                          template: activeT
                                        };
                                      }
                                    } catch (e) {}
                                  }
                                  let consultationData = row;
                                  try {
                                    const cRes = await api.get(`/operations/consultations/${row._id}/snapshot`);
                                    if (cRes.data?.data) consultationData = cRes.data.data;
                                  } catch (e) {}
                                  const patientObj = (consultationData.patientId && typeof consultationData.patientId === 'object') ? consultationData.patientId : (typeof row.patientId === 'object' && row.patientId ? row.patientId : { name: 'Patient' });
                                  const consultationPayload = {
                                    isSample: false,
                                    hospital: row.hospitalId || user?.hospital || {},
                                    branch: row.branchId || user?.branchId || {},
                                    patientId: patientObj,
                                    patient: patientObj,
                                    date: consultationData.date || row.date || new Date().toISOString(),
                                    tokenNo: row.tokenNumber || row.tokenNo || 'OP-01',
                                    visitType: row.appointmentType || 'General OPD',
                                    chiefComplaint: consultationData.chiefComplaint || 'Consultation Visit',
                                    clinicalNotes: consultationData.clinicalNotes || '',
                                    diagnosis: consultationData.diagnosis || [],
                                    prescription: consultationData.prescription || consultationData.prescriptions || [],
                                    prescriptions: consultationData.prescriptions || consultationData.prescription || [],
                                    advice: consultationData.advice || [],
                                    followupDate: consultationData.followupDate || null
                                  };
                                  const doctorPayload = {
                                    name: consultationData.doctorId?.name || row.doctorId?.name || 'Attending Doctor',
                                    doctorProfile: consultationData.doctorId?.doctorProfile || row.doctorId?.doctorProfile || {}
                                  };
                                  triggerPrint(consultationPayload, doctorPayload, activeConfig);
                                } catch (err) {
                                  toast.error('Could not generate prescription print.');
                                }
                              }
                            },
                             {
                               label: 'Check In',
                               icon: UserCheck,
                               isPrimary: true,
                               className: 'bg-[#2F63F2] text-white hover:bg-[#1E4FD9] font-bold shadow-xs',
                               show: (row) => row.status === 'Scheduled' || row.queueStatus === 'Scheduled' || row.workflow?.queueState === 'SCHEDULED',
                               onClick: (row) => handleCheckIn(row)
                             },
                             {
                               label: 'Edit Appointment',
                              icon: Calendar,
                              isPrimary: false,
                              show: (row) => row.status === 'Waiting' || row.status === 'Scheduled' || row.status === 'Called' || row.status === 'Skipped',
                              onClick: (row) => setIsBookOpen(true)
                            },
                            {
                              label: 'Recall Patient',
                              icon: RotateCcw,
                              isPrimary: false,
                              show: (row) => row.status === 'Skipped' || row.status === 'Called' || row.status === 'Waiting' || row.status === 'Scheduled',
                              onClick: (row) => handleRecallPatient(row)
                            },
                            {
                              label: 'Skip Token',
                              icon: SkipForward,
                              isPrimary: false,
                              show: (row) => row.status === 'Waiting' || row.status === 'Scheduled' || row.status === 'Called',
                              onClick: (row) => handleSkipToken(row)
                            },
                            {
                              label: 'Cancel Appointment',
                              icon: XCircle,
                              isPrimary: false,
                              className: 'text-rose-600 hover:bg-rose-50',
                              show: (row) => row.status === 'Waiting' || row.status === 'Scheduled' || row.status === 'Called',
                              onClick: (row) => handleCancelAppointment(row)
                            },
                            {
                              label: 'Print Token',
                              icon: Ticket,
                              isPrimary: false,
                              show: (row) => row.status !== 'In Consultation' && row.status !== 'Admitted',
                              onClick: (row) => handlePrintToken(row)
                            }
                          ]}
                          renderMobileCard={(row) => {
                            const docId = row.doctorId?._id || row.doctorId || 'unassigned';
                            const docState = doctorQueueState[docId];
                            const appStatus = row.status || row.queueStatus || 'Waiting';
                            const isWaiting = appStatus === 'Waiting' || appStatus === 'Scheduled';
                            const isFirstEligible = isWaiting && !docState?.activeApp && docState?.waitingApps[0]?._id === row._id;

                            return (
                              <CompactAppointmentCard
                                row={row}
                                isFirstEligible={isFirstEligible}
                                onCallNext={handleCallNext}
                                onCollectPayment={(app) => setPaymentModalApp(app)}
                                onPrintToken={handlePrintToken}
                                onViewDetail={(app) => setViewDetailModalData(app)}
                                onEditProfile={(patient) => setEditingPatientModal(patient)}
                                isReceptionFeeCollector={isReceptionFeeCollector}
                              />
                            );
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Table
                flat={true}
                headers={[
                  {
                    key: 'tokenNumber',
                    label: 'Token',
                    render: (row) => {
                      const isScheduled = row.status === 'Scheduled' || row.queueStatus === 'Scheduled' || row.workflow?.queueState === 'SCHEDULED';
                      if (isScheduled || !row.tokenNumber) {
                        return (
                          <span className="font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border text-slate-400 bg-slate-100 border-slate-200">
                            —
                          </span>
                        );
                      }
                      const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (row.tokenNumber || '').startsWith('EMG') || (row.patientId?.name || '').toLowerCase().includes('unknown');
                      return (
                        <span className={`font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border ${
                          isEmg ? 'text-rose-700 bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 font-extrabold' : 'text-[#2F63F2] bg-[#2F63F2]/10 border-[#2F63F2]/20'
                        }`}>
                          {row.tokenNumber}
                        </span>
                      );
                    }
                  },
                  {
                    key: 'date',
                    label: 'Consultation Date',
                    render: (row) => {
                      const dateObj = new Date(row.date);
                      const day = String(dateObj.getDate()).padStart(2, '0');
                      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                      const year = dateObj.getFullYear();
                      return <span className="font-mono text-xs font-semibold text-slate-700">{`${day}/${month}/${year}`}</span>;
                    }
                  },
                  {
                    key: 'time',
                    label: 'Slot Time',
                    render: (row) => <span className="font-mono text-xs font-semibold">{row.time}</span>
                  },
                  {
                    key: 'patientId.name',
                    label: 'Patient Name',
                    render: (row) => (
                      <span className="font-bold text-slate-900 text-sm">{row.patientId?.name || 'Unknown'}</span>
                    )
                  },
                  {
                    key: 'doctorId.name',
                    label: 'Doctor',
                    render: (row) => <span className="font-semibold text-slate-700">{row.doctorId?.name || 'Unassigned'}</span>
                  },
                  {
                    key: 'patientStatus',
                    label: 'Patient Status',
                    render: (row) => {
                      const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (row.patientId?.name || '').toLowerCase().includes('unknown');
                      const status = row.status || row.queueStatus || 'Waiting';

                      if (isEmg && (status === 'Scheduled' || status === 'Waiting' || status === 'Arrived')) {
                        return (
                          <span className="text-[9px] font-extrabold border border-rose-300 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping shrink-0" />
                            PRIORITY WAITING
                          </span>
                        );
                      }

                      const colors = {
                        'Waiting': 'bg-blue-50 text-blue-600 border-blue-100',
                        'Called': 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold',
                        'In Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
                        'Sent to Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                        'Sent To Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                        'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-100',
                        'Skipped': 'bg-amber-50 text-amber-600 border-amber-100',
                        'Cancelled': 'bg-rose-50 text-rose-600 border-rose-100',
                        'Emergency': 'bg-red-100 text-red-700 border-red-200 font-extrabold'
                      };

                      return (
                        <span className={`text-[9px] font-bold border px-2.5 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap inline-block ${colors[status] || 'bg-slate-50'}`}>
                          {status}
                        </span>
                      );
                    }
                  },
                  {
                    key: 'paymentStatus',
                    label: 'Payment Status',
                    render: (row) => {
                      const billingStatus = row.billingStatus || 'Unpaid';

                      if (billingStatus === 'Paid') {
                        return (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 w-fit whitespace-nowrap">
                            Paid
                          </span>
                        );
                      }
                      if (billingStatus === 'Exempt') {
                        return (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                            Exempt
                          </span>
                        );
                      }
                      return (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                          Collect Payment
                        </span>
                      );
                    }
                  }
                ]}
                data={workspaceFilteredAppointments}
                actions={[
                  {
                    label: 'Check In',
                    icon: UserCheck,
                    isPrimary: true,
                    className: 'bg-[#2F63F2] text-white hover:bg-[#1E4FD9] font-bold shadow-xs',
                    show: (row) => row.status === 'Scheduled' || row.queueStatus === 'Scheduled' || row.workflow?.queueState === 'SCHEDULED',
                    onClick: (row) => handleCheckIn(row)
                  },
                  {
                    label: (row) => {
                      const billingStatus = row.billingStatus || 'Unpaid';
                      const status = row.status || row.queueStatus || 'Waiting';

                      if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                        return 'Collect Payment';
                      }
                      if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                        return 'Print Token';
                      }
                      if (status === 'Called') return 'Sent to Doctor';
                      if (status === 'In Consultation' || status === 'In-Consultation') return 'In Consultation';
                      if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return 'View';
                      if (status === 'Skipped') return 'Skipped';
                      if (status === 'Cancelled') return 'Cancelled';

                      return status;
                    },
                    icon: (row) => {
                      const billingStatus = row.billingStatus || 'Unpaid';
                      const status = row.status || row.queueStatus || 'Waiting';

                      if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                        return null;
                      }
                      if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                        return Ticket;
                      }
                      if (status === 'Called') return DoorOpen;
                      if (status === 'In Consultation' || status === 'In-Consultation') return Stethoscope;
                      if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return Eye;

                      return null;
                    },
                    isPrimary: true,
                    disabled: (row) => {
                      const billingStatus = row.billingStatus || 'Unpaid';
                      const status = row.status || row.queueStatus || 'Waiting';

                      if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                        return false;
                      }
                      if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                        return false;
                      }
                      if (status === 'In Consultation' || status === 'In-Consultation') {
                        return true;
                      }
                      if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') {
                        return false;
                      }
                      return true;
                    },
                    onClick: (row) => {
                      const billingStatus = row.billingStatus || 'Unpaid';
                      const status = row.status || row.queueStatus || 'Waiting';

                      if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                        setPaymentModalApp(row);
                      } else if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                        handlePrintToken(row);
                      } else if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') {
                        handleViewConsultation(row);
                      }
                    }
                  },
                  {
                    label: 'Skip',
                    icon: SkipForward,
                    isPrimary: true,
                    variant: 'amber',
                    show: (row) => {
                      const status = row.status || row.queueStatus || 'Waiting';
                      return status === 'Waiting' || status === 'Scheduled' || status === 'Called';
                    },
                    onClick: (row) => handleSkipToken(row)
                  },
                  {
                    label: 'View Patient Info',
                    icon: User,
                    isPrimary: false,
                    show: () => true,
                    onClick: (row) => setActiveDrawerPatient(row.patientId)
                  },
                  {
                    label: 'Complete Profile',
                    icon: Edit,
                    isPrimary: false,
                    show: (row) => !isPatientProfileComplete(row.patientId) && row.status !== 'In Consultation' && row.status !== 'Admitted',
                    onClick: (row) => setEditingPatientModal(row.patientId)
                  },
                  {
                    label: 'Mark Completed',
                    icon: CheckCircle2,
                    isPrimary: false,
                    show: (row) => row.status === 'In Consultation' || row.status === 'In-Consultation' || row.queueStatus === 'In-Consultation',
                    onClick: (row) => handleCompleteConsultation(row)
                  },
                  {
                    label: 'Edit Profile',
                    icon: Edit,
                    isPrimary: false,
                    show: (row) => isPatientProfileComplete(row.patientId) && row.status !== 'In Consultation' && row.status !== 'Admitted',
                    onClick: (row) => setEditingPatientModal(row.patientId)
                  },
                  {
                    label: 'Visit History',
                    icon: FileText,
                    isPrimary: false,
                    show: (row) => row.status !== 'In Consultation' && row.status !== 'Admitted',
                    onClick: (row) => setHistoryPatient(row.patientId)
                  },
                  {
                    label: 'View Consultation',
                    icon: FileText,
                    isPrimary: false,
                    show: (row) => row.status === 'In Consultation' || row.status === 'Admitted' || row.status === 'Sent to Pharmacy' || row.status === 'Completed',
                    onClick: (row) => handleViewConsultation(row)
                  },
                  {
                    label: 'View Prescription',
                    icon: Pill,
                    isPrimary: false,
                    show: (row) => row.status === 'Sent to Pharmacy' || row.status === 'Completed',
                    onClick: (row) => handleViewPrescription(row)
                  },
                  {
                    label: 'View Bill',
                    icon: Receipt,
                    isPrimary: false,
                    show: (row) => row.status === 'Sent to Pharmacy' || row.status === 'Completed',
                    onClick: (row) => handleViewBill(row)
                  },
                  {
                    label: 'Edit Appointment',
                    icon: Calendar,
                    isPrimary: false,
                    show: (row) => row.status === 'Waiting' || row.status === 'Scheduled' || row.status === 'Called' || row.status === 'Skipped',
                    onClick: (row) => setIsBookOpen(true)
                  },
                  {
                    label: 'Recall Patient',
                    icon: RotateCcw,
                    isPrimary: false,
                    show: (row) => row.status === 'Skipped' || row.status === 'Called' || row.status === 'Waiting' || row.status === 'Scheduled',
                    onClick: (row) => handleRecallPatient(row)
                  },
                  {
                    label: 'Skip Token',
                    icon: SkipForward,
                    isPrimary: false,
                    show: (row) => row.status === 'Waiting' || row.status === 'Scheduled' || row.status === 'Called',
                    onClick: (row) => handleSkipToken(row)
                  },
                  {
                    label: 'Cancel Appointment',
                    icon: XCircle,
                    isPrimary: false,
                    className: 'text-rose-600 hover:bg-rose-50',
                    show: (row) => row.status === 'Waiting' || row.status === 'Scheduled' || row.status === 'Called',
                    onClick: (row) => handleCancelAppointment(row)
                  },
                  {
                    label: 'Print Token',
                    icon: Ticket,
                    isPrimary: false,
                    show: (row) => row.status !== 'In Consultation' && row.status !== 'Admitted',
                    onClick: (row) => handlePrintToken(row)
                  }
                ]}
                renderMobileCard={(row) => {
                  const docId = row.doctorId?._id || row.doctorId || 'unassigned';
                  const docState = doctorQueueState[docId];
                  const appStatus = row.status || row.queueStatus || 'Waiting';
                  const isWaiting = appStatus === 'Waiting' || appStatus === 'Scheduled';
                  const isFirstEligible = isWaiting && !docState?.activeApp && docState?.waitingApps[0]?._id === row._id;

                  return (
                    <CompactAppointmentCard
                      row={row}
                      isFirstEligible={isFirstEligible}
                      onCallNext={handleCallNext}
                      onCollectPayment={(app) => setPaymentModalApp(app)}
                      onPrintToken={handlePrintToken}
                      onViewDetail={(app) => setViewDetailModalData(app)}
                      onEditProfile={(patient) => setEditingPatientModal(patient)}
                      isReceptionFeeCollector={isReceptionFeeCollector}
                    />
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* TOKEN GENERATION MODAL */}
      <AppointmentBookingModal
        isOpen={isBookOpen}
        onClose={() => setIsBookOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* PAYMENT COLLECTION MODAL */}
      <PaymentCollectionModal
        appointment={paymentModalApp}
        isOpen={!!paymentModalApp}
        onClose={() => setPaymentModalApp(null)}
        onSuccess={() => {
          queryClient.invalidateQueries(['appointments']);
          refetch();
        }}
      />

      {/* RIGHT-SIDE PATIENT INFO DRAWER */}
      <PatientInfoDrawer
        patient={activeDrawerPatient}
        isOpen={!!activeDrawerPatient}
        onClose={() => setActiveDrawerPatient(null)}
        onOpenCompleteProfile={(p) => setEditingPatientModal(p)}
      />

      {/* COMPLETE / EDIT PATIENT PROFILE MODAL */}
      <CompleteProfileModal
        patient={editingPatientModal}
        isOpen={!!editingPatientModal}
        onClose={() => setEditingPatientModal(null)}
        onSuccess={() => {
          queryClient.invalidateQueries(['appointments']);
          queryClient.invalidateQueries(['patients']);
          refetch();
        }}
      />

      {/* PATIENT VISIT HISTORY MODAL */}
      <PatientHistoryModal
        patient={historyPatient}
        isOpen={!!historyPatient}
        onClose={() => setHistoryPatient(null)}
      />

      {/* VIEW CONSULTATION / PRESCRIPTION / BILL / TOKEN MODAL */}
      {viewDetailModalData && (() => {
        const modalApp = viewDetailModalData.row || viewDetailModalData;
        const modalTitle = viewDetailModalData.title || 'APPOINTMENT DETAILS';
        const modalContent = viewDetailModalData.content || `Appointment record for ${modalApp.patientId?.name || 'Patient'}. Doctor: Dr. ${modalApp.doctorId?.name || 'Unassigned'}. Time: ${modalApp.time || 'N/A'}. Status: ${modalApp.status || modalApp.queueStatus || 'Scheduled'}.`;

        return (
          <Modal
            isOpen={!!viewDetailModalData}
            onClose={() => setViewDetailModalData(null)}
            title={modalTitle}
            maxWidth="max-w-[550px]"
          >
            <div className="space-y-4 text-left font-sans text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-900 text-sm">{modalApp.patientId?.name || 'N/A'}</span>
                  <span className="font-mono font-bold text-xs text-[#2F63F2]">
                    Token #{modalApp.tokenNumber || 'N/A'}
                  </span>
                </div>
                <p className="text-slate-600 font-mono pt-1">{modalContent}</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => setViewDetailModalData(null)} variant="secondary" className="text-xs px-5">
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* REALISTIC 3x5 INCH OPD TOKEN PRINT SLIP MODAL */}
      <OpdTokenPrintModal
        isOpen={!!tokenPrintModalApp}
        onClose={() => setTokenPrintModalApp(null)}
        appointment={tokenPrintModalApp}
        hospitalInfo={{
          name: user?.hospitalName,
          address: user?.hospitalAddress,
          phone: user?.hospitalPhone
        }}
      />

      {/* MATERIAL DESIGN 3 PATIENT ACTION BOTTOM SHEET */}
      <AnimatePresence>
        {activeBottomSheetApp && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveBottomSheetApp(null)}
              className="md:hidden fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs"
            />

            {/* Bottom Sheet Modal */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[24px] border-t border-slate-200 p-5 shadow-2xl pb-10 max-h-[85vh] overflow-y-auto text-left font-sans"
            >
              {/* Drag Handle */}
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4" />

              {/* Sheet Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                    {activeBottomSheetApp.patientId?.name || 'Patient'}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
                    <span className="font-mono font-bold text-[#3563F6]">Token #{activeBottomSheetApp.tokenNumber || 'N/A'}</span>
                    <span>•</span>
                    <span>Dr. {activeBottomSheetApp.doctorId?.name?.replace(/^Dr\.\s*/i, '') || 'Unassigned'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveBottomSheetApp(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Actions List (Large Touch Targets >=48px) */}
              <div className="py-3 space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    setActiveDrawerPatient(app.patientId);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <User className="w-4 h-4 text-[#3563F6]" />
                  <span>View Patient Info</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    setEditingPatientModal(app.patientId);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-emerald-600" />
                  <span>Complete Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    setHistoryPatient(app.patientId);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Visit History</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    setIsBookOpen(true);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <span>Edit Appointment</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    handleRecallPatient(app);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-cyan-600" />
                  <span>Recall Patient</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    handleSkipToken(app);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <SkipForward className="w-4 h-4 text-amber-600" />
                  <span>Skip Token</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    handleCancelAppointment(app);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100/60 text-rose-700 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Cancel Appointment</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const app = activeBottomSheetApp;
                    setActiveBottomSheetApp(null);
                    handlePrintToken(app);
                  }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all text-left cursor-pointer"
                >
                  <Ticket className="w-4 h-4 text-purple-600" />
                  <span>Print Token</span>
                </button>
              </div>

              {/* Sheet Close Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveBottomSheetApp(null)}
                  className="w-full min-h-[48px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AppointmentBookingModal
        isOpen={isTokenBookingModalOpen}
        onClose={() => setIsTokenBookingModalOpen(false)}
        onSuccess={() => appointmentsRefetch()}
      />

      {/* Emergency Intake Drawer */}
      <EmergencyIntakeDrawer
        isOpen={isEmergencyDrawerOpen}
        onClose={() => setIsEmergencyDrawerOpen(false)}
        doctors={doctors}
        onSuccess={() => appointmentsRefetch()}
      />

      {/* Convert Unknown Patient Modal */}
      <ConvertUnknownPatientModal
        isOpen={!!convertPatientModalData}
        onClose={() => setConvertPatientModalData(null)}
        patient={convertPatientModalData}
        onSuccess={() => appointmentsRefetch()}
      />

    </div>
  );
};

export default ReceptionistAppointments;
