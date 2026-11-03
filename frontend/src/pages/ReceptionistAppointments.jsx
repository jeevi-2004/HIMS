import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
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
import ConsultationRecordModal from '../components/ConsultationRecordModal';
import PrescriptionDetailsModal from '../components/PrescriptionDetailsModal';
import BillingSummaryModal from '../components/BillingSummaryModal';
import LiveQueueLeftPanel from '../components/LiveQueueLeftPanel';
import EmergencyIntakeDrawer from '../components/EmergencyIntakeDrawer';
import ConvertUnknownPatientModal from '../components/ConvertUnknownPatientModal';
import PatientHistoryDrawer from '../components/PatientHistoryDrawer';
import {
  Plus, AlertTriangle, Calendar, Clock, User, ChevronDown, ChevronUp,
  Play, CheckCircle2, RotateCcw, SkipForward, Eye, Edit, Trash2, XCircle,
  FileText, Pill, Receipt, MoreVertical, Activity, UserCheck, Ticket,
  X, Phone, ShieldAlert, Edit3, Heart, Megaphone, DoorOpen, DollarSign,
  CreditCard, Wallet, Camera, ShieldCheck, Search, Stethoscope, HelpCircle,
  Filter, ChevronRight, RefreshCw, Printer, ArrowRight, Sparkles, Check,
  Layers, Lock, Siren, AlertCircle, Languages, MapPin, Bed
} from 'lucide-react';
import { formatTimeTo12Hr } from '../utils/timeFormat';
import { useAuth } from '../context/AuthContext';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { triggerPrint } from '../modules/prescription-print/printUtils';
import { DEFAULT_PRINT_CONFIG } from '../modules/prescription-print/prescriptionPrint.types';
import { enrichInvestigationsList, categorizeInvestigations } from '../utils/investigationUtils';
import { ipdService } from '../services/ipd/ipdService';
import { ROUTES } from '../constants/routes';
import TransferToIPDModal from '../components/ipd/TransferToIPDModal';
import { isIpdAvailable, isFeatureModuleEnabled } from '../utils/featureUtils';
import EarlyCheckInModal from '../components/EarlyCheckInModal';

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

// Helper to sanitize decimal amounts and disallow invalid characters while enabling standard manual typing
const sanitizeDecimalInput = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).replace(/[^0-9.]/g, '');
  const parts = str.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }
  return str;
};

// Payment Collection Modal Component
const PaymentCollectionModal = ({ appointment, isOpen, onClose, onSuccess }) => {
  if (!isOpen || !appointment) return null;

  const [consultationFee, setConsultationFee] = useState(appointment?.consultationFee ?? appointment?.doctorId?.consultationFee ?? 500);
  const [additionalCharges, setAdditionalCharges] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [submitting, setSubmitting] = useState(false);

  // UPI payment fields
  const [upiMethod, setUpiMethod] = useState('');
  const [upiOtherMethod, setUpiOtherMethod] = useState('');
  const [upiTransactionId, setUpiTransactionId] = useState('');

  // Card payment fields
  const [cardType, setCardType] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [cardTransactionId, setCardTransactionId] = useState('');

  // Specific additional charge picker states
  const [showSpecificChargePicker, setShowSpecificChargePicker] = useState(false);
  const [selectedSpecificCharges, setSelectedSpecificCharges] = useState([]);
  const [customChargeName, setCustomChargeName] = useState('');
  const [customChargeAmount, setCustomChargeAmount] = useState('');

  const standardAdditionalCharges = useMemo(() => [
    { id: 'reg_card', name: 'Registration / Patient Card Fee', amount: 50, icon: '📋', desc: 'OPD registration card issuance' },
    { id: 'emergency_priority', name: 'Emergency / Priority Care Fee', amount: 200, icon: '🚨', desc: 'Urgent priority handling surcharge' },
    { id: 'nursing_triage', name: 'Nursing Care & Triage Assessment', amount: 50, icon: '🩺', desc: 'Vitals check and preliminary nursing' },
    { id: 'wound_dressing', name: 'Wound Dressing & Minor Procedure', amount: 150, icon: '🩹', desc: 'Antiseptic dressing or bandage' },
    { id: 'nebulization', name: 'Nebulization Treatment Charge', amount: 150, icon: '💨', desc: 'Respiratory nebulizer therapy' },
    { id: 'med_cert', name: 'Medical Certificate / Fitness Record', amount: 100, icon: '📄', desc: 'Official signed doctor certificate' },
    { id: 'ppe_consumable', name: 'PPE & Sterile Consumables', amount: 50, icon: '🧤', desc: 'Disposable gloves, syringe, kit' },
    { id: 'injection_admin', name: 'Injection Administration Fee', amount: 40, icon: '💉', desc: 'IM/IV injection clinical charge' }
  ], []);

  const { data: hospitalServices = [] } = useQuery({
    queryKey: ['hospitalServicesBillingModal', appointment?.hospitalId || appointment?.patientId?.hospitalId],
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

  const catalogAdditionalCharges = useMemo(() => {
    return (hospitalServices || [])
      .filter(s => s && s.name && s.category !== 'Laboratory' && s.category !== 'Radiology')
      .map(s => ({
        id: `svc_${s._id || s.code}`,
        name: s.name,
        amount: Number(s.price || 100),
        icon: '🏥',
        desc: s.category || 'Hospital Service'
      }));
  }, [hospitalServices]);

  useEffect(() => {
    if (appointment) {
      setConsultationFee(appointment.consultationFee ?? appointment.doctorId?.consultationFee ?? 500);
      setAdditionalCharges(appointment.additionalCharges || 0);
      if (Array.isArray(appointment.additionalChargeItems) && appointment.additionalChargeItems.length > 0) {
        setSelectedSpecificCharges(appointment.additionalChargeItems);
      } else {
        setSelectedSpecificCharges([]);
      }
    }
  }, [appointment]);

  const handleToggleSpecificCharge = (charge) => {
    setSelectedSpecificCharges(prev => {
      const exists = prev.some(c => c.name === charge.name);
      let updated;
      if (exists) {
        updated = prev.filter(c => c.name !== charge.name);
      } else {
        updated = [...prev, { name: charge.name, amount: Number(charge.amount), icon: charge.icon }];
      }
      const sum = updated.reduce((s, c) => s + Number(c.amount || 0), 0);
      setAdditionalCharges(sum);
      return updated;
    });
  };

  const handleAddCustomCharge = () => {
    if (!customChargeName.trim() || Number(customChargeAmount) <= 0) return;
    const newCharge = {
      name: customChargeName.trim(),
      amount: Number(customChargeAmount),
      icon: '🏷️'
    };
    setSelectedSpecificCharges(prev => {
      const updated = [...prev, newCharge];
      const sum = updated.reduce((s, c) => s + Number(c.amount || 0), 0);
      setAdditionalCharges(sum);
      return updated;
    });
    setCustomChargeName('');
    setCustomChargeAmount('');
  };

  const handleRemoveSpecificCharge = (chargeName) => {
    setSelectedSpecificCharges(prev => {
      const updated = prev.filter(c => c.name !== chargeName);
      const sum = updated.reduce((s, c) => s + Number(c.amount || 0), 0);
      setAdditionalCharges(sum);
      return updated;
    });
  };

  const handleManualAdditionalChargesChange = (val) => {
    const clean = sanitizeDecimalInput(val);
    setAdditionalCharges(clean);
    if (!clean || Number(clean) === 0) {
      setSelectedSpecificCharges([]);
    }
  };

  // Extract and categorize doctor-ordered investigations with auto-pricing from hospital services catalog
  const investigations = useMemo(() => {
    const rawList = Array.isArray(appointment?.investigations) ? appointment.investigations : [];
    return enrichInvestigationsList(rawList, hospitalServices);
  }, [appointment, hospitalServices]);

  const {
    labInvestigations,
    radInvestigations,
    otherInvestigations,
    labTotal,
    radTotal,
    otherTotal: otherInvTotal,
    totalAmount: investigationsTotal
  } = useMemo(() => {
    return categorizeInvestigations(investigations);
  }, [investigations]);

  const totalAmount = useMemo(() => {
    const base = (Number(consultationFee) || 0) + (Number(additionalCharges) || 0) + investigationsTotal;
    const disc = Number(discount) || 0;
    return Math.max(0, base - disc);
  }, [consultationFee, additionalCharges, discount, investigationsTotal]);

  const handleConfirmPayment = async (e) => {
    e.preventDefault();

    if (paymentMethod === 'UPI' && !upiMethod) {
      toast.error('Please select a UPI method');
      return;
    }

    if (paymentMethod === 'Card' && !cardType) {
      toast.error('Please select a card type (Debit Card or Credit Card)');
      return;
    }

    setSubmitting(true);

    const activeTransactionId = paymentMethod === 'UPI' ? upiTransactionId.trim()
      : paymentMethod === 'Card' ? cardTransactionId.trim()
      : '';

    const effectiveUpi = paymentMethod === 'UPI'
      ? (upiMethod === 'other' ? (upiOtherMethod.trim() || 'Other') : upiMethod)
      : undefined;

    const effectiveCardType = paymentMethod === 'Card' ? cardType : undefined;
    const effectiveCardNo = paymentMethod === 'Card' ? cardNo.trim() : undefined;

    try {
      await api.put(`/operations/appointments/${appointment._id}/queue`, {
        billingStatus: 'Paid',
        consultationFee: Number(consultationFee),
        additionalCharges: Number(additionalCharges),
        additionalChargeItems: selectedSpecificCharges,
        discount: Number(discount),
        paymentMethod,
        transactionId: activeTransactionId || undefined,
        paymentDetails: {
          paymentMethod,
          upiMethod: effectiveUpi,
          transactionId: activeTransactionId || undefined,
          cardType: effectiveCardType,
          cardNo: effectiveCardNo
        },
        totalAmount,
        investigations
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
      maxWidth="max-w-[540px]"
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

        {/* Doctor-prescribed investigations breakdown */}
        {investigations.length > 0 && (
          <div className="space-y-2 border border-slate-200/80 rounded-xl p-3 bg-slate-50/60">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                🔬 Prescribed Investigations ({investigations.length})
              </span>
              <span className="font-mono font-bold text-xs text-[#2F63F2] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                Subtotal: ₹{investigationsTotal}
              </span>
            </div>

            {/* Laboratory Category */}
            {labInvestigations.length > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded">
                  <span>🧪 Laboratory ({labInvestigations.length})</span>
                  <span className="font-mono">₹{labTotal}</span>
                </div>
                <div className="space-y-1 pl-1">
                  {labInvestigations.map((inv, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] text-slate-700 bg-white px-2 py-1 rounded border border-slate-200/60">
                      <span className="truncate pr-2">
                        <span className="text-[10px] text-indigo-500 font-medium mr-1.5">[{inv.category || 'Lab'}]</span>
                        {inv.name}
                      </span>
                      <span className="font-mono font-bold text-slate-800 shrink-0">₹{inv.price || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Radiology Category */}
            {radInvestigations.length > 0 && (
              <div className="space-y-1 mt-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold text-cyan-800 bg-cyan-50/80 px-2 py-0.5 rounded">
                  <span>🩻 Radiology & Imaging ({radInvestigations.length})</span>
                  <span className="font-mono">₹{radTotal}</span>
                </div>
                <div className="space-y-1 pl-1">
                  {radInvestigations.map((inv, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] text-slate-700 bg-white px-2 py-1 rounded border border-slate-200/60">
                      <span className="truncate pr-2">
                        <span className="text-[10px] text-cyan-600 font-medium mr-1.5">[{inv.category || 'Radiology'}]</span>
                        {inv.name}
                      </span>
                      <span className="font-mono font-bold text-slate-800 shrink-0">₹{inv.price || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other investigations if any */}
            {otherInvestigations.length > 0 && (
              <div className="space-y-1 mt-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold text-amber-800 bg-amber-50/80 px-2 py-0.5 rounded">
                  <span>📋 Other Investigations ({otherInvestigations.length})</span>
                  <span className="font-mono">₹{otherInvTotal}</span>
                </div>
                <div className="space-y-1 pl-1">
                  {otherInvestigations.map((inv, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] text-slate-700 bg-white px-2 py-1 rounded border border-slate-200/60">
                      <span className="truncate pr-2">{inv.name}</span>
                      <span className="font-mono font-bold text-slate-800 shrink-0">₹{inv.price || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <Input
            label="Consultation Fee (₹)"
            type="text"
            inputMode="decimal"
            value={consultationFee}
            onChange={(e) => setConsultationFee(sanitizeDecimalInput(e.target.value))}
            onWheel={(e) => e.target.blur()}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            {/* Additional Charges Field with + (Add) Button in Header */}
            <div className="flex flex-col gap-1.5 w-full">
              <div className="flex items-center justify-between pl-1">
                <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider flex items-center gap-1.5">
                  <span>Additional Charges (₹)</span>
                  {selectedSpecificCharges.length > 0 && (
                    <span className="text-[9px] font-mono font-bold bg-blue-100 text-[#2F63F2] px-1.5 py-0.2 rounded-full">
                      {selectedSpecificCharges.length}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setShowSpecificChargePicker(!showSpecificChargePicker)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer shadow-xs ${
                    showSpecificChargePicker || selectedSpecificCharges.length > 0
                      ? 'bg-[#2F63F2] text-white border-[#2F63F2] hover:bg-blue-700'
                      : 'bg-blue-50 text-[#2F63F2] border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                  }`}
                  title="Click to view and choose specific charges to collect"
                >
                  <Plus className="w-3 h-3 stroke-[2.5]" />
                  <span>{showSpecificChargePicker ? 'Close' : 'Add'}</span>
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={additionalCharges}
                onChange={(e) => handleManualAdditionalChargesChange(e.target.value)}
                onWheel={(e) => e.target.blur()}
                placeholder="0"
                className="enterprise-input w-full"
              />
            </div>

            <Input
              label="Discount (₹)"
              type="text"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(sanitizeDecimalInput(e.target.value))}
              onWheel={(e) => e.target.blur()}
            />
          </div>

          {/* Selected Specific Charges Breakdown Chips */}
          {selectedSpecificCharges.length > 0 && (
            <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                <span>Selected Specific Charges ({selectedSpecificCharges.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSpecificCharges([]);
                    setAdditionalCharges(0);
                  }}
                  className="text-rose-600 hover:underline cursor-pointer lowercase font-medium"
                >
                  clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedSpecificCharges.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-blue-200 text-slate-800 text-[11px] shadow-xs"
                  >
                    <span>{item.icon || '🏷️'}</span>
                    <span className="font-semibold">{item.name}:</span>
                    <span className="font-mono font-bold text-[#2F63F2]">₹{item.amount}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecificCharge(item.name)}
                      className="text-slate-400 hover:text-rose-600 ml-0.5 cursor-pointer p-0.5 rounded hover:bg-slate-100"
                      title="Remove charge"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Specific Charges Selection Picker Panel */}
          <AnimatePresence>
            {showSpecificChargePicker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-3.5 bg-gradient-to-br from-slate-50 to-blue-50/40 border border-blue-200 rounded-xl space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-blue-200/70 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Sparkles className="w-4 h-4 text-[#2F63F2]" />
                      <span>Select Specific Additional Charge to Collect</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSpecificChargePicker(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200/60 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Standard Hospital Charges Grid */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Standard Hospital OPD Charges
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[170px] overflow-y-auto pr-1">
                      {standardAdditionalCharges.map((charge) => {
                        const isSelected = selectedSpecificCharges.some(c => c.name === charge.name);
                        return (
                          <button
                            key={charge.id}
                            type="button"
                            onClick={() => handleToggleSpecificCharge(charge)}
                            className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-100/80 border-[#2F63F2] text-blue-900 shadow-xs ring-1 ring-[#2F63F2]/30'
                                : 'bg-white hover:bg-blue-50/50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1 truncate">
                              <span className="text-sm shrink-0">{charge.icon}</span>
                              <div className="truncate">
                                <div className="font-semibold truncate text-[11px] leading-tight">{charge.name}</div>
                                <div className="text-[9px] text-slate-400 truncate">{charge.desc}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <span className="font-mono font-bold text-[11px] text-slate-900">₹{charge.amount}</span>
                              {isSelected ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                              ) : (
                                <Plus className="w-3 h-3 text-slate-400 shrink-0" />
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {catalogAdditionalCharges.map((charge) => {
                        const isSelected = selectedSpecificCharges.some(c => c.name === charge.name);
                        return (
                          <button
                            key={charge.id}
                            type="button"
                            onClick={() => handleToggleSpecificCharge(charge)}
                            className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-100/80 border-[#2F63F2] text-blue-900 shadow-xs ring-1 ring-[#2F63F2]/30'
                                : 'bg-white hover:bg-blue-50/50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1 truncate">
                              <span className="text-sm shrink-0">{charge.icon}</span>
                              <div className="truncate">
                                <div className="font-semibold truncate text-[11px] leading-tight">{charge.name}</div>
                                <div className="text-[9px] text-slate-400 truncate">{charge.desc}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <span className="font-mono font-bold text-[11px] text-slate-900">₹{charge.amount}</span>
                              {isSelected ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#2F63F2] shrink-0" />
                              ) : (
                                <Plus className="w-3 h-3 text-slate-400 shrink-0" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Charge Row */}
                  <div className="pt-2 border-t border-blue-200/60">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Or Add Specific Custom Charge
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Charge description (e.g. Suture Removal, ECG Strip)"
                        value={customChargeName}
                        onChange={(e) => setCustomChargeName(e.target.value)}
                        className="enterprise-input flex-1 h-[34px] text-xs px-2.5"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomCharge();
                          }
                        }}
                      />
                      <div className="relative w-24">
                        <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-mono">₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={customChargeAmount}
                          onChange={(e) => setCustomChargeAmount(sanitizeDecimalInput(e.target.value))}
                          onWheel={(e) => e.target.blur()}
                          className="enterprise-input w-full h-[34px] text-xs pl-6 pr-2"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomCharge();
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCustomCharge}
                        disabled={!customChargeName.trim() || Number(customChargeAmount) <= 0}
                        className="h-[34px] px-3.5 bg-[#2F63F2] hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-4 bg-slate-900 text-white rounded-xl space-y-1.5 shadow-inner">
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Consultation: <strong className="text-slate-200 font-mono">₹{consultationFee || 0}</strong></span>
            {investigationsTotal > 0 && <span>Tests: <strong className="text-slate-200 font-mono">₹{investigationsTotal}</strong></span>}
            {Number(additionalCharges) > 0 && (
              <span>
                Add.: <strong className="text-slate-200 font-mono">₹{additionalCharges}</strong>
                {selectedSpecificCharges.length > 0 && (
                  <span className="text-[10px] text-blue-300 ml-1">
                    ({selectedSpecificCharges.map(c => `${c.name}: ₹${c.amount}`).join(', ')})
                  </span>
                )}
              </span>
            )}
            {Number(discount) > 0 && <span>Disc.: <strong className="text-rose-400 font-mono">-₹{discount}</strong></span>}
          </div>
          <div className="flex justify-between items-center border-t border-slate-800 pt-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Total Payable Amount</span>
            <span className="text-2xl font-extrabold font-mono text-emerald-400">₹{totalAmount}</span>
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Method <span className="text-rose-500">*</span></label>
          <div className="grid grid-cols-3 gap-2">
            {['Cash', 'UPI', 'Card'].map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${paymentMethod === method
                  ? 'bg-[#2F63F2] text-white border-[#2F63F2] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                {method}
              </button>
            ))}
          </div>

          {/* UPI Payment Extra Fields */}
          {paymentMethod === 'UPI' && (
            <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2.5 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    UPI Method <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={upiMethod}
                    onChange={(e) => setUpiMethod(e.target.value)}
                    className="enterprise-input w-full h-[36px] text-xs bg-white cursor-pointer"
                    required={paymentMethod === 'UPI'}
                  >
                    <option value="">Select a UPI</option>
                    <option value="phonepe">PhonePe</option>
                    <option value="gpay">GPay</option>
                    <option value="paytm">Paytm</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Transaction ID
                  </label>
                  <input
                    type="text"
                    value={upiTransactionId}
                    onChange={(e) => setUpiTransactionId(e.target.value)}
                    placeholder="Enter Transaction ID"
                    className="enterprise-input w-full h-[36px] text-xs bg-white font-mono"
                  />
                </div>
              </div>

              {/* Manual Entry field: ONLY displayed when 'other' is selected */}
              {upiMethod === 'other' && (
                <div className="flex flex-col gap-1 pt-0.5">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Enter Other UPI Method <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={upiOtherMethod}
                    onChange={(e) => setUpiOtherMethod(e.target.value)}
                    placeholder="Enter UPI app or method (e.g. BHIM, Amazon Pay)"
                    className="enterprise-input w-full h-[36px] text-xs bg-white"
                    required={upiMethod === 'other'}
                  />
                </div>
              )}
            </div>
          )}

          {/* Card Payment Extra Fields */}
          {paymentMethod === 'Card' && (
            <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2.5 animate-in fade-in duration-150">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  Select Card Type <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 hover:text-slate-900">
                    <input
                      type="radio"
                      name="collectPaymentCardType"
                      value="debit card"
                      checked={cardType === 'debit card'}
                      onChange={(e) => setCardType(e.target.value)}
                      className="w-4 h-4 text-[#2F63F2] focus:ring-[#2F63F2] border-slate-300 cursor-pointer accent-[#2F63F2]"
                    />
                    <span>Debit Card</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 hover:text-slate-900">
                    <input
                      type="radio"
                      name="collectPaymentCardType"
                      value="credit card"
                      checked={cardType === 'credit card'}
                      onChange={(e) => setCardType(e.target.value)}
                      className="w-4 h-4 text-[#2F63F2] focus:ring-[#2F63F2] border-slate-300 cursor-pointer accent-[#2F63F2]"
                    />
                    <span>Credit Card</span>
                  </label>
                </div>
              </div>

              {/* Display Card No and Transaction ID only when Debit Card or Credit Card is selected */}
              {(cardType === 'debit card' || cardType === 'credit card') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Card No
                    </label>
                    <input
                      type="text"
                      value={cardNo}
                      onChange={(e) => setCardNo(e.target.value)}
                      placeholder="Enter Card No"
                      className="enterprise-input w-full h-[36px] text-xs bg-white font-mono"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Transaction ID
                    </label>
                    <input
                      type="text"
                      value={cardTransactionId}
                      onChange={(e) => setCardTransactionId(e.target.value)}
                      placeholder="Enter Transaction ID"
                      className="enterprise-input w-full h-[36px] text-xs bg-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button onClick={onClose} type="button" variant="secondary" className="text-xs px-5 h-[40px]">
            Close
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="text-xs px-6 h-[40px] bg-emerald-600 hover:bg-emerald-700">
            Confirm & Mark Paid
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const parseDateRobust = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const isoMatch = trimmed.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// Robust Local Date (YYYY-MM-DD) helper resilient to timezone offsets
export const getAppDateString = (app) => {
  if (!app) return '9999-99-99';
  const rawDate = app.date || app.appointmentDate;
  if (!rawDate) return '9999-99-99';
  const d = parseDateRobust(rawDate);
  if (!d) return '9999-99-99';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to convert time string (e.g., "10:30 AM", "09:00", "14:15") to minutes for chronological sorting
export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const str = String(timeStr).trim().toUpperCase();
  const isPM = str.includes('PM');
  const isAM = str.includes('AM');
  const cleanStr = str.replace(/(AM|PM)/g, '').trim();
  const parts = cleanStr.split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

// Calculates authoritative appointment status dynamically
export const getAppointmentStatus = (app) => {
  if (!app) return 'Waiting';
  if (app.status === 'Cancelled' || app.queueStatus === 'Cancelled') return 'Cancelled';

  // 1. Completed status takes top priority
  const isCompleted =
    app.status === 'Completed' ||
    app.queueStatus === 'Completed' ||
    app.workflow?.queueState === 'COMPLETED' ||
    app.workflow?.consultationState === 'COMPLETED' ||
    app.workflow?.pharmacyState === 'DISPENSED' ||
    app.pharmacyStatus === 'DISPENSED' ||
    Boolean(app.workflow?.timestamps?.completedAt) ||
    Boolean(app.workflow?.timestamps?.pharmacyCompletedAt);

  if (isCompleted) {
    return 'Completed';
  }

  // 2. Strictly future booking date (appDateStr > currentTodayStr) belongs in 'Scheduled'.
  // Future appointments cannot be in active consultation today unless emergency started today.
  const now = new Date();
  const currY = now.getFullYear();
  const currM = String(now.getMonth() + 1).padStart(2, '0');
  const currD = String(now.getDate()).padStart(2, '0');
  const currentTodayStr = `${currY}-${currM}-${currD}`;

  const appDateStr = getAppDateString(app);
  const isFuture = Boolean(appDateStr && appDateStr > currentTodayStr);
  if (isFuture && app.status !== 'Admitted') {
    return 'Scheduled';
  }

  // 3. Active in Consultation Room (today's active appointments)
  if (
    app.status === 'In Consultation' ||
    app.status === 'In-Consultation' ||
    app.queueStatus === 'In-Consultation' ||
    app.queueStatus === 'In Consultation' ||
    app.workflow?.queueState === 'IN_CONSULTATION' ||
    app.workflow?.consultationState === 'STARTED'
  ) {
    return 'In Consultation';
  }

  // 4. Sent to Pharmacy
  const isPharmacy =
    app.status === 'Sent to Pharmacy' ||
    app.status === 'Sent To Pharmacy' ||
    app.queueStatus === 'Sent to Pharmacy' ||
    app.queueStatus === 'Sent To Pharmacy' ||
    app.workflow?.queueState === 'SENT_TO_PHARMACY' ||
    app.workflow?.pharmacyState === 'SENT' ||
    app.workflow?.pharmacyState === 'DISPENSING' ||
    app.pharmacyStatus === 'SENT' ||
    app.pharmacyStatus === 'DISPENSING';

  if (isPharmacy) {
    return 'Sent to Pharmacy';
  }

  if (app.status === 'Called' || app.queueStatus === 'Called' || app.workflow?.queueState === 'CALLED') {
    return 'Called';
  }

  if (app.status === 'Skipped' || app.queueStatus === 'Skipped' || app.workflow?.queueState === 'SKIPPED') {
    return 'Skipped';
  }

  // When booked date arrives (date <= today), patient redirects to Active Queue ('Waiting')
  return 'Waiting';
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
  onEditProfile,
  onCheckIn
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

  const status = getAppointmentStatus(row);
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
            {row.patientId?.age ? `${row.patientId.age} Years` : 'Age N/A'} / {row.patientId?.gender || 'N/A'}
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

  const targetPatientId = patient?._id || (typeof patient === 'string' ? patient : null);

  // Fresh query to fetch latest full patient demographics, contacts & medical alerts
  const { data: freshPatientData, isLoading: isLoadingPatient } = useQuery({
    queryKey: ['patientInfoDrawerDetail', targetPatientId],
    queryFn: async () => {
      if (!targetPatientId) return null;
      const res = await api.get(`/operations/patients/${targetPatientId}`);
      return res.data?.data || res.data || null;
    },
    enabled: Boolean(isOpen && targetPatientId),
    staleTime: 0
  });

  const effectivePatient = freshPatientData || (typeof patient === 'object' ? patient : {});
  const isComplete = isPatientProfileComplete(effectivePatient);

  // Body scroll lock while modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const placeDisplay = effectivePatient.address 
    || effectivePatient.place 
    || (Array.isArray(effectivePatient.addresses) && (effectivePatient.addresses[0]?.city || effectivePatient.addresses[0]?.street))
    || 'N/A';

  const emergencyName = effectivePatient.emergencyContact?.name 
    || (Array.isArray(effectivePatient.contacts) && effectivePatient.contacts[0]?.name)
    || effectivePatient.guardianName 
    || 'N/A';

  const emergencyPhone = effectivePatient.emergencyContact?.phone 
    || (Array.isArray(effectivePatient.contacts) && effectivePatient.contacts[0]?.phone)
    || effectivePatient.alternativeMobile 
    || 'N/A';

  const medicalConditions = typeof effectivePatient.medicalAlerts === 'string'
    ? (effectivePatient.medicalAlerts.trim() || 'No recorded chronic conditions')
    : (Array.isArray(effectivePatient.medicalAlerts) && effectivePatient.medicalAlerts.length > 0
      ? effectivePatient.medicalAlerts.join(', ')
      : 'No recorded chronic conditions');

  const allergiesDisplay = Array.isArray(effectivePatient.allergies)
    ? (effectivePatient.allergies.length > 0 ? effectivePatient.allergies.join(', ') : 'No known drug/food allergies')
    : (typeof effectivePatient.allergies === 'string' && effectivePatient.allergies.trim()
      ? effectivePatient.allergies
      : 'No known drug/food allergies');

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 overflow-hidden">
      {/* Full-Screen Dark Overlay covering sidebar, navbar, and workspace */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[500px] max-h-[88vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden font-sans text-left z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#2F63F2] text-white flex items-center justify-center font-extrabold text-lg shadow-md border-2 border-white/20">
              {effectivePatient.name ? effectivePatient.name.substring(0, 2).toUpperCase() : 'PT'}
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight">{effectivePatient.name || 'Unknown Patient'}</h3>
              <div className="flex items-center gap-2 mt-0.5 font-mono text-xs text-blue-200">
                <span>UHID: {effectivePatient.uhid || 'N/A'}</span>
                <span className="text-white/30">•</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                  isComplete 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' 
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                }`}>
                  {isComplete ? 'Full Profile ✓' : 'Quick Registered'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          {isLoadingPatient && !freshPatientData && (
            <div className="py-2 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2F63F2]" />
              <span>Fetching latest patient details...</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Mobile Number</span>
              <span className="font-bold text-slate-800 font-mono text-sm">{effectivePatient.mobileNumber || 'N/A'}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Age & Gender</span>
              <span className="font-bold text-slate-800 text-sm">
                {effectivePatient.age ? `${effectivePatient.age} Yrs` : 'N/A'}, {effectivePatient.gender || 'N/A'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Blood Group</span>
              <span className="font-bold text-slate-800 text-sm">{effectivePatient.bloodGroup || 'N/A'}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Place / Village</span>
              <span className="font-bold text-slate-800 text-xs truncate block" title={placeDisplay}>{placeDisplay}</span>
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
                <span className="font-semibold text-slate-800">{emergencyName}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Emergency Phone</span>
                <span className="font-mono font-semibold text-slate-800">{emergencyPhone}</span>
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
                  {medicalConditions}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] font-semibold block uppercase">Allergies</span>
                <span className="font-medium text-amber-800">
                  {allergiesDisplay}
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
              Last OPD Intake: <strong className="text-slate-900 font-mono">{effectivePatient.lastVisitDate ? new Date(effectivePatient.lastVisitDate).toLocaleDateString() : 'Today'}</strong>
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex gap-3">
          <Button
            onClick={() => {
              onClose();
              onOpenCompleteProfile(effectivePatient);
            }}
            variant="primary"
            className="w-full text-xs font-bold uppercase tracking-wider h-[42px] bg-[#2F63F2] cursor-pointer"
          >
            {isComplete ? '✏️ Edit Profile' : '📝 Complete Profile'}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
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
            Close
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="text-xs px-6 h-[40px] bg-[#2F63F2]">
            Save Profile
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// PATIENT VISIT HISTORY MODAL - Uses the rich enterprise Patient History Drawer UI
const PatientHistoryModal = ({ patient, isOpen, onClose }) => {
  if (!isOpen || !patient) return null;

  return (
    <PatientHistoryDrawer
      isOpen={isOpen}
      onClose={onClose}
      patient={patient}
      title={patient?.name ? `VISIT HISTORY - ${patient.name.toUpperCase()}` : 'VISIT HISTORY'}
    />
  );
};


const ReceptionistAppointments = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { billingSettings, workflow, getAppointmentActions, getQueueEvaluation } = useBillingSettings();

  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

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
    place: '',
    allergies: ''
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
    const isGeofenceEnabled = billingSettings?.geofenceSettings?.enabled === true || user?.hospital?.geofenceSettings?.enabled === true;
    if (!isGeofenceEnabled) {
      setInlineGpsLocation({ lat: null, lng: null, loading: false, error: null, disabled: true });
      return;
    }

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setInlineGpsLocation({ lat: null, lng: null, loading: false, error: 'Geolocation not supported', disabled: false });
      return;
    }
    setInlineGpsLocation(prev => ({ ...prev, loading: true, error: null, disabled: false }));

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
        setInlineGpsLocation({ lat: coords.latitude, lng: coords.longitude, loading: false, error: null, disabled: false });
      })
      .catch((err) => {
        setInlineGpsLocation({ lat: null, lng: null, loading: false, error: 'Location permission required', disabled: false });
      });
  }, [billingSettings, user]);

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
  const [selectedConsultationRecordApp, setSelectedConsultationRecordApp] = useState(null);
  const [selectedPrescriptionApp, setSelectedPrescriptionApp] = useState(null);
  const [selectedBillingApp, setSelectedBillingApp] = useState(null);
  const [tokenPrintModalApp, setTokenPrintModalApp] = useState(null);
  const [transferToIpdApp, setTransferToIpdApp] = useState(null);
  const [earlyCheckInApp, setEarlyCheckInApp] = useState(null);

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

  const fetchDoctorPresence = useCallback(async () => {
    try {
      const res = await api.get('/operations/doctors/presence');
      if (res.data?.data) {
        setDoctorPresenceMap(res.data.data);
      }
    } catch (err) {
      console.error('[PRESENCE] Failed to fetch doctor presence:', err);
    }
  }, []);

  useEffect(() => {
    fetchDoctorPresence();

    const interval = setInterval(fetchDoctorPresence, 8000);
    const handleFocus = () => fetchDoctorPresence();
    window.addEventListener('focus', handleFocus);

    const unsubscribe = workflowRealtime.subscribe(evt => {
      if (evt?.type === 'DOCTOR_PRESENCE_UPDATED' && (evt.doctorId || evt.appointmentId)) {
        const docId = String(evt.doctorId || evt.appointmentId);
        setDoctorPresenceMap(prev => ({
          ...prev,
          [docId]: Boolean(evt.isOnline)
        }));
      }
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      unsubscribe();
    };
  }, [fetchDoctorPresence]);

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
      // 1. Process & Deduplicate Allergies entered in Generate Token Form
      const rawAllergies = tokenPatientForm.allergies
        ? (typeof tokenPatientForm.allergies === 'string'
            ? tokenPatientForm.allergies.split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean)
            : Array.isArray(tokenPatientForm.allergies)
              ? tokenPatientForm.allergies.map(s => String(s).trim()).filter(Boolean)
              : [])
        : [];
      const seenAllergies = new Set();
      const uniqueAllergies = [];
      for (const a of rawAllergies) {
        const k = a.toLowerCase();
        if (!seenAllergies.has(k) && k !== 'none' && k !== 'null' && k !== 'undefined' && k !== 'nil') {
          seenAllergies.add(k);
          uniqueAllergies.push(a);
        }
      }

      // Preserve existing patient allergies if none newly entered
      if (uniqueAllergies.length === 0 && selectedTokenPatient?.allergies) {
        const existingAllergies = Array.isArray(selectedTokenPatient.allergies)
          ? selectedTokenPatient.allergies
          : String(selectedTokenPatient.allergies).split(/[,;\n/]+/);
        for (const a of existingAllergies) {
          const clean = String(a).trim();
          if (clean && !seenAllergies.has(clean.toLowerCase()) && clean.toLowerCase() !== 'none') {
            seenAllergies.add(clean.toLowerCase());
            uniqueAllergies.push(clean);
          }
        }
      }

      // If "Allergy" chip was selected and still no specific allergy entered, tag it
      if (uniqueAllergies.length === 0 && tokenSelectedComplaints.includes('Allergy')) {
        uniqueAllergies.push('Allergy Reported');
      }

      // 2. Create Patient Profile if New Patient
      if (!targetPatientId) {
        const patientPayload = {
          name: tokenPatientForm.name.trim(),
          mobileNumber: tokenPatientForm.mobileNumber,
          gender: tokenPatientForm.gender,
          bloodGroup: tokenPatientForm.bloodGroup || 'O+',
          age: Number(tokenPatientForm.age) || 0,
          address: tokenPatientForm.place?.trim() || undefined,
          allergies: uniqueAllergies
        };

        const regRes = await api.post('/operations/patients', patientPayload);
        targetPatientObj = regRes.data.data;
        targetPatientId = targetPatientObj._id;
        if (regRes.data.isExisting) {
          toast.success(`Using existing patient profile: ${targetPatientObj.name} (${targetPatientObj.uhid})`);
          if (uniqueAllergies.length > 0) {
            try {
              await api.put(`/operations/patients/${targetPatientId}`, { allergies: uniqueAllergies });
            } catch (_) {}
          }
        } else {
          toast.success(`Registered patient: ${targetPatientObj.uhid}`);
        }
      } else if (targetPatientId && uniqueAllergies.length > 0) {
        // Update existing patient's allergies if entered/edited
        try {
          await api.put(`/operations/patients/${targetPatientId}`, { allergies: uniqueAllergies });
        } catch (_) {}
      }

      // 3. Format Chief Complaints Text
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

      // 4. Attach GPS Location for Geofence validation ONLY if Geofence Enforcement is enabled
      let submitLat = inlineGpsLocation.lat;
      let submitLng = inlineGpsLocation.lng;

      const isGeofenceEnabled = billingSettings?.geofenceSettings?.enabled === true || user?.hospital?.geofenceSettings?.enabled === true;
      if (isGeofenceEnabled && (submitLat == null || submitLng == null)) {
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
        allergies: uniqueAllergies,
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
        place: '',
        allergies: ''
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
      if (!event) return;
      const eventType = event.type || '';
      const qState = (event.queueState || event.queueStatus || event.status || '').toUpperCase();

      const isCallEvent =
        eventType === 'TriggerVoiceCall' ||
        eventType === 'ConsultationStarted' ||
        (eventType === 'PatientCalled' && (qState === 'CALLED' || qState.includes('CONSULTATION')));

      if (isCallEvent && (event.tokenNumber || event.token || event.patientName || event.patientId || event.appointmentId || event._id)) {
        const tNo = event.tokenNumber || event.token || event.tokenNo || '';
        const pName = event.patientName || (typeof event.patientId === 'object' ? event.patientId?.name : '') || 'Patient';
        toast.success(`📢 Calling Token #${tNo || 'OPD'} (${pName})`, { duration: 4000 });
        voiceAnnouncement.announceCall({
          tokenNumber: tNo,
          tokenNo: tNo,
          patientName: pName,
          doctorName: event.doctorName || (typeof event.doctorId === 'object' ? event.doctorId?.name : ''),
          roomNo: event.roomNo || event.roomNumber || (typeof event.doctorId === 'object' ? (event.doctorId?.roomNo || event.doctorId?.doctorProfile?.roomNo) : 'Consultation Room'),
          roomNumber: event.roomNo || event.roomNumber || 'Consultation Room'
        });
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
        const st = app.status || app.queueStatus || 'Waiting';
        const isScheduled = st === 'Scheduled' || qState === 'SCHEDULED' || (!app.tokenNumber && st !== 'Completed' && st !== 'In Consultation' && st !== 'Sent to Pharmacy' && st !== 'Cancelled' && st !== 'Admitted');
        
        if (isScheduled) return false;
        return qState === 'WAITING' || qState === 'READY';
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
      queryClient.invalidateQueries(['doctorQueue']);
      setEarlyCheckInApp(null);
      refetch();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Check-in failed. Please try again.');
    }
  });

  const handleCheckIn = (app) => {
    if (!app || !app._id) return;

    // Determine the scheduled date of the appointment
    let appDateStr = '';
    const rawDate = app.date || app.appointmentDate;
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          appDateStr = `${y}-${m}-${day}`;
        }
      } catch (_) {}
    }

    const now = new Date();
    const currY = now.getFullYear();
    const currM = String(now.getMonth() + 1).padStart(2, '0');
    const currD = String(now.getDate()).padStart(2, '0');
    const currentTodayStr = `${currY}-${currM}-${currD}`;

    // If appointment is in the future compared to today -> Early arrival
    if (appDateStr && appDateStr > currentTodayStr) {
      const [y1, m1, d1] = appDateStr.split('-').map(Number);
      const [y2, m2, d2] = currentTodayStr.split('-').map(Number);
      const appDateObj = new Date(y1, m1 - 1, d1);
      const todayDateObj = new Date(y2, m2 - 1, d2);
      const diffMs = appDateObj.getTime() - todayDateObj.getTime();
      const daysEarly = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

      setEarlyCheckInApp({
        ...app,
        daysEarly,
        appDateStr,
        currentTodayStr
      });
      return;
    }

    // Direct check-in on scheduled day or earlier
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

      const st = getAppointmentStatus(app);
      const isInConsultationOrCalled = st === 'In Consultation' || st === 'Called';
      const isWaiting = st === 'Waiting';

      if (isInConsultationOrCalled) {
        map[docId].activeApp = app;
      } else if (isWaiting) {
        map[docId].waitingApps.push(app);
      }
    });

    return map;
  }, [appointments]);

  // Set of patient IDs that have already been consulted / completed today
  const consultedOrCompletedPatientIds = useMemo(() => {
    const ids = new Set();
    appointments.forEach((a) => {
      const st = getAppointmentStatus(a);
      if (st === 'Completed' || st === 'In Consultation' || st === 'Sent to Pharmacy') {
        const pId = String(a.patientId?._id || a.patientId || '');
        if (pId) ids.add(pId);
      }
    });
    return ids;
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
      const st = getAppointmentStatus(app);
      const isEmg = app.isEmergency || app.priorityLevel === 'EMERGENCY' || app.priority === 'EMERGENCY' || (app.consultationType || '').toLowerCase() === 'emergency';
      const isScheduled = st === 'Scheduled';

      if (isEmg && st !== 'Completed' && st !== 'In Consultation' && st !== 'Cancelled' && st !== 'Sent to Pharmacy') {
        emergency++;
      }
      if (isScheduled) {
        const pId = String(app.patientId?._id || app.patientId || '');
        if (!consultedOrCompletedPatientIds.has(pId)) {
          scheduled++;
        }
      }
      else if (st === 'In Consultation') inConsultation++;
      else if (st === 'Called') called++;
      else if (st === 'Completed') completed++;
      else if (st === 'Sent to Pharmacy') sentToPharmacy++;
      else if (st === 'Waiting') waiting++;
    });

    return { scheduled, waiting, called, inConsultation, sentToPharmacy, completed, emergency };
  }, [appointments, consultedOrCompletedPatientIds]);

  // Filtered Appointments List by Status & Search Query
  const filteredAppointments = useMemo(() => {
    const matched = appointments.filter((app) => {
      const st = getAppointmentStatus(app);
      const isScheduled = st === 'Scheduled';

      // Workspace Segmented Tab Filter
      if (workspaceTab === 'SCHEDULED') {
        if (!isScheduled) return false;
        const pId = String(app.patientId?._id || app.patientId || '');
        if (consultedOrCompletedPatientIds.has(pId)) return false;
      } else if (workspaceTab === 'ACTIVE_QUEUE') {
        if (isScheduled) return false;
        if (st === 'Completed' || st === 'Cancelled') return false;
      } else if (workspaceTab === 'IN_CONSULTATION') {
        if (st !== 'In Consultation') return false;
      } else if (workspaceTab === 'PHARMACY') {
        if (st !== 'Sent to Pharmacy') return false;
      } else if (workspaceTab === 'COMPLETED') {
        if (st !== 'Completed') return false;
      }

      // Status Chip Filter (if set)
      let statusMatch = true;
      if (statusFilter === 'EMERGENCY') statusMatch = app.isEmergency || app.priorityLevel === 'EMERGENCY' || app.priority === 'EMERGENCY' || (app.consultationType || '').toLowerCase() === 'emergency';
      else if (statusFilter === 'SCHEDULED') statusMatch = isScheduled;
      else if (statusFilter === 'WAITING') statusMatch = st === 'Waiting';
      else if (statusFilter === 'CALLED') statusMatch = st === 'Called';
      else if (statusFilter === 'IN_CONSULTATION') statusMatch = st === 'In Consultation';
      else if (statusFilter === 'SENT_TO_PHARMACY') statusMatch = st === 'Sent to Pharmacy';
      else if (statusFilter === 'COMPLETED') statusMatch = st === 'Completed';
      else if (statusFilter === 'SKIPPED') statusMatch = st === 'Skipped';

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

    // Deduplicate appointments in SCHEDULED tab by patient and date
    if (workspaceTab === 'SCHEDULED') {
      const seen = new Set();
      return matched.filter(a => {
        const pId = String(a.patientId?._id || a.patientId || '');
        const d = getAppDateString(a);
        const key = `${pId}_${d}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return matched;
  }, [appointments, workspaceTab, statusFilter, searchQuery, consultedOrCompletedPatientIds]);

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
      const dateStr = getAppDateString(app);
      let displayLabel = 'Unknown Date';
      if (dateStr && dateStr !== '9999-99-99') {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dObj = new Date(y, m - 1, d);
        displayLabel = dObj.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: '2-digit',
          year: 'numeric'
        });
      }

      if (!groups[dateStr]) {
        groups[dateStr] = {
          dateStr,
          label: displayLabel,
          items: []
        };
      }
      groups[dateStr].items.push(app);
    });

    // In each group, sort patients chronologically by slot time
    Object.values(groups).forEach(g => {
      g.items.sort((a, b) => {
        const timeDiff = parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
        if (timeDiff !== 0) return timeDiff;
        return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
      });
    });

    // If viewing scheduled/follow-ups, sort dates ascending (earliest scheduled date first)
    if (workspaceTab === 'SCHEDULED' || statusFilter === 'SCHEDULED') {
      return Object.values(groups).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    }

    // Otherwise sort dates descending (newest dates first)
    return Object.values(groups).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [filteredAppointments, groupByDate, workspaceTab, statusFilter]);

  // Segmented Workspace Filtered Data
  const workspaceFilteredAppointments = useMemo(() => {
    const list = filteredAppointments.filter((app) => {
      const st = getAppointmentStatus(app);

      if (workspaceTab === 'SCHEDULED') {
        return st === 'Scheduled';
      } else if (workspaceTab === 'ACTIVE_QUEUE') {
        return st === 'Waiting' || st === 'Called' || st === 'Skipped';
      } else if (workspaceTab === 'IN_CONSULTATION') {
        return st === 'In Consultation';
      } else if (workspaceTab === 'PHARMACY') {
        return st === 'Sent to Pharmacy';
      } else if (workspaceTab === 'COMPLETED') {
        return st === 'Completed';
      }
      return true; // 'ALL'
    });

    // In Scheduled tab (or when filtering by Scheduled), sort in chronological order based on consultation date and slot time
    if (workspaceTab === 'SCHEDULED' || statusFilter === 'SCHEDULED') {
      return [...list].sort((a, b) => {
        const dateA = getAppDateString(a);
        const dateB = getAppDateString(b);
        const dateDiff = dateA.localeCompare(dateB);
        if (dateDiff !== 0) return dateDiff;
        const timeDiff = parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
        if (timeDiff !== 0) return timeDiff;
        return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
      });
    }

    // In Active Queue, move skipped patients to the LAST of the queue
    if (workspaceTab === 'ACTIVE_QUEUE') {
      return [...list].sort((a, b) => {
        const isSkippedA = (a.status === 'Skipped' || a.queueStatus === 'Skipped' || getAppointmentStatus(a) === 'Skipped');
        const isSkippedB = (b.status === 'Skipped' || b.queueStatus === 'Skipped' || getAppointmentStatus(b) === 'Skipped');
        if (isSkippedA && !isSkippedB) return 1;
        if (!isSkippedA && isSkippedB) return -1;
        return 0;
      });
    }

    return list;
  }, [filteredAppointments, workspaceTab, statusFilter]);

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
    setSelectedConsultationRecordApp(app);
  };

  const handleViewPrescription = (app) => {
    setSelectedPrescriptionApp(app);
  };

  const handleViewBill = (app) => {
    setSelectedBillingApp(app);
  };

  const handlePrintToken = (app) => {
    setTokenPrintModalApp(app);
  };

  const handleTransferToIPD = (app) => {
    if (!app) return;
    setTransferToIpdApp(app);
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
              const activeCall = (appointments || []).find(a => ['Called', 'In Consultation'].includes(getAppointmentStatus(a)))
                || (appointments || []).find(a => getAppointmentStatus(a) === 'Waiting');
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
              const activeCall = (appointments || []).find(a => ['Called', 'In Consultation'].includes(getAppointmentStatus(a)))
                || (appointments || []).find(a => getAppointmentStatus(a) === 'Waiting');
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
              {(() => {
                const isGeofenceEnabled = billingSettings?.geofenceSettings?.enabled === true || user?.hospital?.geofenceSettings?.enabled === true;
                if (!isGeofenceEnabled) {
                  return null;
                }
                return (
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
                );
              })()}

              {/* 1. SEARCH PATIENT SECTION */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  Search Patient
                </label>

                {selectedTokenPatient ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
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
                          setTokenPatientForm(prev => ({ ...prev, allergies: '' }));
                        }}
                        className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search Mobile / UHID / Patient Name"
                      value={tokenSearchQuery}
                      onChange={(e) => {
                        let val = e.target.value;
                        val = val.replace(/\b\w/g, char => char.toUpperCase());
                        setTokenSearchQuery(val);
                      }}
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
                              const patAllergies = Array.isArray(p.allergies) ? p.allergies.join(', ') : (p.allergies || '');
                              setTokenPatientForm(prev => ({
                                ...prev,
                                name: p.name || '',
                                mobileNumber: p.mobileNumber || '',
                                age: p.age ? String(p.age) : '',
                                gender: p.gender || '',
                                bloodGroup: p.bloodGroup || '',
                                place: p.address || p.place || '',
                                allergies: patAllergies
                              }));
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
                  {/* Row 1: Mobile Number, Patient Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <MobileNumber
                      id="panel-patient-mobile"
                      label="Mobile Number"
                      value={tokenPatientForm.mobileNumber}
                      onChange={(val) => {
                        const clean = String(val).replace(/[^0-9]/g, '').slice(0, 10);
                        setTokenPatientForm({ ...tokenPatientForm, mobileNumber: clean });
                      }}
                    />

                    <Input
                      id="panel-patient-name"
                      label="Patient Name"
                      placeholder="Full Name"
                      value={tokenPatientForm.name}
                      onChange={(e) => {
                        let val = e?.target ? e.target.value : e;
                        val = val.replace(/[^a-zA-Z\s]/g, '');
                        val = val.replace(/\b\w/g, char => char.toUpperCase());
                        setTokenPatientForm({ ...tokenPatientForm, name: val });
                      }}
                    />
                  </div>

                  {/* Row 2: Age & Gender (1 row & 2 columns) */}
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      id="panel-patient-age"
                      label="Age"
                      type="text"
                      placeholder="Years"
                      value={tokenPatientForm.age}
                      onChange={(e) => {
                        const raw = e?.target ? e.target.value : e;
                        const clean = String(raw).replace(/[^0-9]/g, '').slice(0, 2);
                        setTokenPatientForm({ ...tokenPatientForm, age: clean });
                      }}
                    />

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1.5">Gender <span className="text-rose-500">*</span></label>
                      <select
                        value={tokenPatientForm.gender}
                        onChange={(e) => setTokenPatientForm({ ...tokenPatientForm, gender: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] h-[42px]"
                      >
                        <option value="" disabled>-- Select Gender --</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Place, Blood Group */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      id="panel-patient-place"
                      label="Place / Village"
                      placeholder="City / Village"
                      value={tokenPatientForm.place}
                      onChange={(e) => {
                        let val = e?.target ? e.target.value : e;
                        val = val.replace(/[^a-zA-Z\s]/g, '');
                        val = val.replace(/\b\w/g, char => char.toUpperCase());
                        setTokenPatientForm({ ...tokenPatientForm, place: val });
                      }}
                    />

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1.5">Blood Group (Optional)</label>
                      <select
                        value={tokenPatientForm.bloodGroup}
                        onChange={(e) => setTokenPatientForm({ ...tokenPatientForm, bloodGroup: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6] h-[42px]"
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

                {tokenSelectedComplaints.includes('Allergy') && (
                  <div className="pt-2">
                    <Input
                      id="panel-complaint-allergy-name"
                      label="Allergy Details / Allergens *"
                      placeholder="e.g. Dust, Penicillin, Peanuts, Sulfa"
                      value={tokenPatientForm.allergies}
                      onChange={(e) => {
                        const val = e?.target ? e.target.value : e;
                        setTokenPatientForm({ ...tokenPatientForm, allergies: val });
                      }}
                    />
                  </div>
                )}

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
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-[#3563F6] rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-[#3563F6]/15 h-[46px] transition-all shadow-xs cursor-pointer"
                  >
                    <option value="">-- Select Consulting Doctor --</option>
                    {sortedDoctorsWithQueueCount?.map((d) => {
                      const docId = String(d._id || d.id);
                      const isOnline = Boolean(doctorPresenceMap[docId] ?? doctorPresenceMap[d._id]);
                      return (
                        <option key={docId} value={docId} className="font-semibold py-1">
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
                <span className="truncate">📅 Scheduled / Follow-Up</span>
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
                                const displayToken = row.tokenNumber || (row.orderNumber ? `OP${String(row.orderNumber).padStart(3, '0')}` : '—');
                                const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (displayToken || '').startsWith('EMG') || (row.patientId?.name || '').toLowerCase().includes('unknown');
                                const st = getAppointmentStatus(row);
                                const isScheduled = st === 'Scheduled';

                                return (
                                  <span className={`font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border ${
                                    isEmg
                                      ? 'text-rose-700 bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 font-extrabold'
                                      : isScheduled
                                        ? 'text-amber-800 bg-amber-50 border-amber-200 font-extrabold'
                                        : 'text-[#2F63F2] bg-[#2F63F2]/10 border-[#2F63F2]/20'
                                  }`}>
                                    {displayToken}
                                  </span>
                                );
                              }
                            },
                            {
                              key: 'date',
                              label: 'Consultation Date',
                              render: (row) => {
                                const dateObj = parseDateRobust(row.date) || new Date();
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
                                const status = getAppointmentStatus(row);

                                if (isEmg && (status === 'Scheduled' || status === 'Waiting' || status === 'Arrived')) {
                                  return (
                                    <span className="text-[9px] font-extrabold border border-rose-300 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping shrink-0" />
                                      PRIORITY WAITING
                                    </span>
                                  );
                                }

                                const colors = {
                                  'Scheduled': 'bg-amber-50 text-amber-700 border-amber-200 font-bold',
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
                                if (isReceptionFeeCollector) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => setPaymentModalApp(row)}
                                      className="px-3 py-1.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border bg-[#2F63F2] text-white border-[#2F63F2] hover:bg-blue-700 shadow-xs whitespace-nowrap"
                                    >
                                      Collect Payment
                                    </button>
                                  );
                                }
                                return (
                                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                    Unpaid
                                  </span>
                                );
                              }
                            }
                          ]}
                          data={group.items}
                          actions={[
                            {
                              label: 'Check In',
                              icon: UserCheck,
                              isPrimary: true,
                              className: 'bg-[#2F63F2] text-white hover:bg-[#1E4FD9] font-bold shadow-xs',
                              show: (row) => {
                                const status = getAppointmentStatus(row);
                                return status === 'Scheduled';
                              },
                              onClick: (row) => handleCheckIn(row)
                            },
                            {
                              label: (row) => {
                                const status = getAppointmentStatus(row);

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
                                const status = getAppointmentStatus(row);

                                if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                                  return Ticket;
                                }
                                if (status === 'Called') return DoorOpen;
                                if (status === 'In Consultation' || status === 'In-Consultation') return Stethoscope;
                                if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return Eye;

                                return null;
                              },
                              isPrimary: true,
                              show: (row) => {
                                const status = getAppointmentStatus(row);
                                return status !== 'Skipped' && status !== 'Scheduled';
                              },
                              disabled: (row) => {
                                const status = getAppointmentStatus(row);

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
                                const status = getAppointmentStatus(row);

                                if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
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
                                const status = getAppointmentStatus(row);
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
                              label: 'Transfer to IPD',
                              icon: Bed,
                              isPrimary: false,
                              show: (row) => isIpdEnabled && row.status !== 'Admitted' && row.queueStatus !== 'Admitted',
                              onClick: (row) => handleTransferToIPD(row)
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
                              show: () => true,
                              onClick: (row) => {
                                const pat = (row.patientId && typeof row.patientId === 'object')
                                  ? row.patientId
                                  : (row.patient && typeof row.patient === 'object')
                                    ? row.patient
                                    : { _id: row.patientId || row.patient, name: row.patientName };
                                setHistoryPatient(pat);
                              }
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
                              show: (row) => {
                                const st = getAppointmentStatus(row);
                                return st === 'Sent to Pharmacy' || st === 'Completed';
                              },
                              onClick: (row) => handleViewPrescription(row)
                            },
                            {
                              label: 'View Bill',
                              icon: Receipt,
                              isPrimary: false,
                              show: (row) => {
                                const isBillingOn = isFeatureModuleEnabled(user?.hospital || user, 'Billing');
                                if (!isBillingOn) return false;
                                const st = getAppointmentStatus(row);
                                return st === 'Sent to Pharmacy' || st === 'Completed';
                              },
                              onClick: (row) => handleViewBill(row)
                            },
                            {
                              label: 'Print Prescription',
                              icon: Printer,
                              isPrimary: false,
                              show: (row) => {
                                const st = getAppointmentStatus(row);
                                return st === 'Sent to Pharmacy' || st === 'Completed';
                              },
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
                               label: 'Edit Appointment',
                              icon: Calendar,
                              isPrimary: false,
                              show: (row) => {
                                const st = getAppointmentStatus(row);
                                return st === 'Waiting' || st === 'Scheduled' || st === 'Called' || st === 'Skipped';
                              },
                              onClick: (row) => setIsBookOpen(true)
                            },
                            {
                              label: 'Recall Patient',
                              icon: RotateCcw,
                              isPrimary: true,
                              className: 'bg-[#2F63F2] text-white hover:bg-[#1E4FD9] font-bold shadow-xs',
                              show: (row) => getAppointmentStatus(row) === 'Skipped',
                              onClick: (row) => handleRecallPatient(row)
                            },
                            {
                              label: 'Recall Patient',
                              icon: RotateCcw,
                              isPrimary: false,
                              show: (row) => {
                                const st = getAppointmentStatus(row);
                                return st === 'Called' || st === 'Waiting' || st === 'Scheduled';
                              },
                              onClick: (row) => handleRecallPatient(row)
                            },
                            {
                              label: 'Cancel Appointment',
                              icon: XCircle,
                              isPrimary: false,
                              className: 'text-rose-600 hover:bg-rose-50',
                              show: (row) => {
                                const st = getAppointmentStatus(row);
                                return st === 'Waiting' || st === 'Scheduled' || st === 'Called';
                              },
                              onClick: (row) => handleCancelAppointment(row)
                            },
                            {
                              label: 'Print Token',
                              icon: Ticket,
                              isPrimary: false,
                              show: (row) => {
                                const st = getAppointmentStatus(row);
                                return st === 'Waiting' || st === 'Scheduled' || st === 'Called';
                              },
                              onClick: (row) => handlePrintToken(row)
                            }
                          ]}
                          renderMobileCard={(row) => {
                            const docId = row.doctorId?._id || row.doctorId || 'unassigned';
                            const docState = doctorQueueState[docId];
                            const appStatus = getAppointmentStatus(row);
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
                      const displayToken = row.tokenNumber || (row.orderNumber ? `OP${String(row.orderNumber).padStart(3, '0')}` : '—');
                      const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (displayToken || '').startsWith('EMG') || (row.patientId?.name || '').toLowerCase().includes('unknown');
                      const st = getAppointmentStatus(row);
                      const isScheduled = st === 'Scheduled';

                      return (
                        <span className={`font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border ${
                          isEmg
                            ? 'text-rose-700 bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 font-extrabold'
                            : isScheduled
                              ? 'text-amber-800 bg-amber-50 border-amber-200 font-extrabold'
                              : 'text-[#2F63F2] bg-[#2F63F2]/10 border-[#2F63F2]/20'
                        }`}>
                          {displayToken}
                        </span>
                      );
                    }
                  },
                  {
                    key: 'date',
                    label: 'Consultation Date',
                    render: (row) => {
                      const dateObj = parseDateRobust(row.date) || new Date();
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
                      const status = getAppointmentStatus(row);

                      if (isEmg && (status === 'Scheduled' || status === 'Waiting' || status === 'Arrived')) {
                        return (
                          <span className="text-[9px] font-extrabold border border-rose-300 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping shrink-0" />
                            PRIORITY WAITING
                          </span>
                        );
                      }

                      const colors = {
                        'Scheduled': 'bg-amber-50 text-amber-700 border-amber-200 font-bold',
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
                      if (isReceptionFeeCollector) {
                        return (
                          <button
                            type="button"
                            onClick={() => setPaymentModalApp(row)}
                            className="px-3 py-1.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border bg-[#2F63F2] text-white border-[#2F63F2] hover:bg-blue-700 shadow-xs whitespace-nowrap"
                          >
                            Collect Payment
                          </button>
                        );
                      }
                      return (
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                          Unpaid
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
                    show: (row) => {
                      const status = getAppointmentStatus(row);
                      return status === 'Scheduled';
                    },
                    onClick: (row) => handleCheckIn(row)
                  },
                  {
                    label: (row) => {
                      const status = getAppointmentStatus(row);

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
                      const status = getAppointmentStatus(row);

                      if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                        return Ticket;
                      }
                      if (status === 'Called') return DoorOpen;
                      if (status === 'In Consultation' || status === 'In-Consultation') return Stethoscope;
                      if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return Eye;

                      return null;
                    },
                    isPrimary: true,
                    show: (row) => {
                                const status = getAppointmentStatus(row);
                                return status !== 'Skipped' && status !== 'Scheduled';
                              },
                    disabled: (row) => {
                      const status = getAppointmentStatus(row);

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
                      const status = getAppointmentStatus(row);

                      if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
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
                      const status = getAppointmentStatus(row);
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
                    label: 'Transfer to IPD',
                    icon: Bed,
                    isPrimary: false,
                    show: (row) => isIpdEnabled && row.status !== 'Admitted' && row.queueStatus !== 'Admitted',
                    onClick: (row) => handleTransferToIPD(row)
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
                    show: () => true,
                    onClick: (row) => {
                      const pat = (row.patientId && typeof row.patientId === 'object')
                        ? row.patientId
                        : (row.patient && typeof row.patient === 'object')
                          ? row.patient
                          : { _id: row.patientId || row.patient, name: row.patientName };
                      setHistoryPatient(pat);
                    }
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
                    show: (row) => {
                                const st = getAppointmentStatus(row);
                                return st === 'Sent to Pharmacy' || st === 'Completed';
                              },
                    onClick: (row) => handleViewPrescription(row)
                  },
                  {
                    label: 'View Bill',
                    icon: Receipt,
                    isPrimary: false,
                    show: (row) => {
                      const isBillingOn = isFeatureModuleEnabled(user?.hospital || user, 'Billing');
                      if (!isBillingOn) return false;
                      const st = getAppointmentStatus(row);
                      return st === 'Sent to Pharmacy' || st === 'Completed';
                    },
                    onClick: (row) => handleViewBill(row)
                  },
                  {
                    label: 'Edit Appointment',
                    icon: Calendar,
                    isPrimary: false,
                    show: (row) => {
                      const st = getAppointmentStatus(row);
                      return st === 'Waiting' || st === 'Scheduled' || st === 'Called' || st === 'Skipped';
                    },
                    onClick: (row) => setIsBookOpen(true)
                  },
                  {
                    label: 'Recall Patient',
                    icon: RotateCcw,
                    isPrimary: true,
                    className: 'bg-[#2F63F2] text-white hover:bg-[#1E4FD9] font-bold shadow-xs',
                    show: (row) => getAppointmentStatus(row) === 'Skipped',
                    onClick: (row) => handleRecallPatient(row)
                  },
                  {
                    label: 'Recall Patient',
                    icon: RotateCcw,
                    isPrimary: false,
                    show: (row) => {
                      const st = getAppointmentStatus(row);
                      return st === 'Called' || st === 'Waiting' || st === 'Scheduled';
                    },
                    onClick: (row) => handleRecallPatient(row)
                  },
                  {
                    label: 'Cancel Appointment',
                    icon: XCircle,
                    isPrimary: false,
                    className: 'text-rose-600 hover:bg-rose-50',
                    show: (row) => {
                      const st = getAppointmentStatus(row);
                      return st === 'Waiting' || st === 'Scheduled' || st === 'Called';
                    },
                    onClick: (row) => handleCancelAppointment(row)
                  },
                  {
                    label: 'Print Token',
                    icon: Ticket,
                    isPrimary: false,
                    show: (row) => {
                      const st = getAppointmentStatus(row);
                      return st === 'Waiting' || st === 'Scheduled' || st === 'Called';
                    },
                    onClick: (row) => handlePrintToken(row)
                  }
                ]}
                renderMobileCard={(row) => {
                  const docId = row.doctorId?._id || row.doctorId || 'unassigned';
                  const docState = doctorQueueState[docId];
                  const appStatus = getAppointmentStatus(row);
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

      {/* EXACT PATIENT CONSULTATION RECORD MODAL */}
      <ConsultationRecordModal
        isOpen={!!selectedConsultationRecordApp}
        onClose={() => setSelectedConsultationRecordApp(null)}
        appointment={selectedConsultationRecordApp}
      />

      {/* EXACT DOCTOR PRESCRIPTION DETAILS MODAL */}
      <PrescriptionDetailsModal
        isOpen={!!selectedPrescriptionApp}
        onClose={() => setSelectedPrescriptionApp(null)}
        appointment={selectedPrescriptionApp}
      />

      {/* EXACT PATIENT BILLING SUMMARY MODAL */}
      <BillingSummaryModal
        isOpen={!!selectedBillingApp}
        onClose={() => setSelectedBillingApp(null)}
        appointment={selectedBillingApp}
      />

      {/* VIEW CONSULTATION / PRESCRIPTION / BILL / TOKEN MODAL */}
      {viewDetailModalData && (() => {
        const modalApp = viewDetailModalData.row || viewDetailModalData;
        const modalTitle = viewDetailModalData.title || 'APPOINTMENT DETAILS';
        if (modalTitle === 'PRESCRIPTION DETAILS') {
          return (
            <PrescriptionDetailsModal
              isOpen={true}
              onClose={() => setViewDetailModalData(null)}
              appointment={modalApp}
            />
          );
        }
        if (modalTitle === 'PATIENT BILLING SUMMARY') {
          return (
            <BillingSummaryModal
              isOpen={true}
              onClose={() => setViewDetailModalData(null)}
              appointment={modalApp}
            />
          );
        }
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

      {/* WARD & BED ALLOCATION TRANSFER TO IPD MODAL (Strictly gated by isIpdEnabled) */}
      {isIpdEnabled && (
        <TransferToIPDModal
          isOpen={Boolean(transferToIpdApp)}
          onClose={() => setTransferToIpdApp(null)}
          appointment={transferToIpdApp}
        />
      )}

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

                {isIpdEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const app = activeBottomSheetApp;
                      setActiveBottomSheetApp(null);
                      handleTransferToIPD(app);
                    }}
                    className="w-full min-h-[48px] px-4 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/60 text-indigo-700 text-xs font-bold transition-all text-left cursor-pointer"
                  >
                    <Bed className="w-4 h-4 text-indigo-600" />
                    <span>Transfer to IPD</span>
                  </button>
                )}

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

      {/* Early Arrival Check-In Confirmation Modal */}
      <EarlyCheckInModal
        isOpen={Boolean(earlyCheckInApp)}
        onClose={() => setEarlyCheckInApp(null)}
        appointment={earlyCheckInApp}
        onConfirm={() => earlyCheckInApp && checkInMutation.mutate(earlyCheckInApp._id)}
        isLoading={checkInMutation.isPending}
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
