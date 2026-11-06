import React from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Printer,
  FileText,
  User,
  Calendar,
  Activity,
  ClipboardList,
  Pill,
  FlaskConical,
  IndianRupee,
  CheckCircle2,
  Loader2,
  Phone,
  Volume2
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBillingSettings } from '../context/BillingSettingsContext';

/**
 * ConsultationRecordModal
 * Exact recreation of VillZone HIMS Consultation Record modal.
 * Adapts dynamically between Plan 1 (Token Only / Paper Rx) and Plan 2 (Complete Digital OPD).
 * Under Plan 1: Displays ONLY details collected from patient at reception intake/queue,
 * omitting empty digital EMR fields (empty vitals, empty Rx table, empty Labs table).
 */
const ConsultationRecordModal = ({ isOpen, onClose, appointment, consultationId }) => {
  const { user } = useAuth();
  const { billingSettings } = useBillingSettings();

  const targetId = appointment?._id || consultationId;

  // Fetch visit-specific consultation snapshot
  const { data, isLoading, error } = useQuery({
    queryKey: ['consultationRecordSnapshot', targetId],
    queryFn: async () => {
      if (!targetId) return null;
      const res = await api.get(`/operations/consultations/${targetId}/snapshot`);
      return res.data?.data || null;
    },
    enabled: !!isOpen && !!targetId,
    staleTime: 0,
    gcTime: 0
  });

  if (!isOpen) return null;

  // Detect Follow-Up visit (follow-up patients are never treated as Plan 1 paper-token flow)
  const isFollowUp = Boolean(
    data?.isFollowUp === true ||
    appointment?.isFollowUp === true ||
    data?.isFollowup === true ||
    appointment?.isFollowup === true ||
    String(data?.consultationType || '').toLowerCase().includes('follow') ||
    String(appointment?.consultationType || '').toLowerCase().includes('follow') ||
    String(data?.appointmentType || '').toLowerCase().includes('follow') ||
    String(appointment?.appointmentType || '').toLowerCase().includes('follow') ||
    String(data?.type || '').toLowerCase().includes('follow') ||
    String(appointment?.type || '').toLowerCase().includes('follow') ||
    String(appointment?.bookingType || '').toLowerCase().includes('follow')
  );

  // Detect Plan 1 (TOKEN_ONLY / Paper Rx) - Follow-up patients are strictly excluded
  const isPlan1 = !isFollowUp && Boolean(
    data?.hospitalMode === 'TOKEN_ONLY' ||
    user?.hospital?.opdOperationMode === 'TOKEN_ONLY' ||
    user?.opdOperationMode === 'TOKEN_ONLY' ||
    billingSettings?.opdOperationMode === 'TOKEN_ONLY' ||
    user?.hospital?.planName?.includes('Plan 1') ||
    user?.hospital?.subscriptionPlan?.includes('Plan 1') ||
    appointment?.hospitalId?.opdOperationMode === 'TOKEN_ONLY' ||
    appointment?.opdOperationMode === 'TOKEN_ONLY'
  );

  // Helper date formatter: YYYY-MM-DD
  const formatDate = (val) => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toISOString().split('T')[0];
    } catch {
      return String(val);
    }
  };

  // Helper date formatter for follow-up (DD-MM-YYYY or YYYY-MM-DD)
  const formatFollowupDate = (val) => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return String(val);
    }
  };

  // Extract patient info
  const patientName = data?.patientName || appointment?.patientId?.name || '—';
  const uhid = data?.uhid || appointment?.patientId?.uhid || '—';
  const age = data?.age ?? appointment?.patientId?.age ?? null;
  const gender = data?.gender || appointment?.patientId?.gender || null;
  const ageGenderStr = age && gender ? `${age} Years / ${gender}` : age ? `${age} Years` : gender || '—';

  // Extract contact & demographic details
  const mobile = data?.mobile || appointment?.patientId?.mobileNumber || appointment?.patientId?.phone || appointment?.mobileNumber || null;
  const bloodGroup = data?.bloodGroup || appointment?.patientId?.bloodGroup || null;
  const consultationType = data?.consultationType || appointment?.consultationType || 'Walk-In';
  const addressRaw = data?.address || appointment?.patientId?.address;
  let addressStr = '';
  if (typeof addressRaw === 'string') {
    addressStr = addressRaw;
  } else if (addressRaw && typeof addressRaw === 'object') {
    addressStr = [addressRaw.city, addressRaw.state].filter(Boolean).join(', ');
  }

  // Extract token number
  const rawToken = data?.tokenNumber || appointment?.tokenNumber || '—';
  const tokenStr = rawToken !== '—' && !String(rawToken).startsWith('#') ? `#${rawToken}` : rawToken;

  // Extract consultation date
  const consultDate = formatDate(data?.consultationDate || appointment?.date || data?.createdAt);

  // Extract doctor & department
  const doctorName = data?.doctorName || appointment?.doctorId?.name || '—';
  const cleanDoc = doctorName !== '—' ? String(doctorName).replace(/^(Dr\.?\s*)+/i, '').trim() : '';
  const formattedDoctorName = cleanDoc ? `Dr. ${cleanDoc}` : doctorName;
  const departmentName = data?.department || data?.doctorId?.departmentName || appointment?.doctorId?.departmentName || appointment?.doctorId?.doctorProfile?.specialization || 'General Medicine';

  // Extract status
  const statusRaw = data?.consultationStatus || appointment?.status || 'Completed';
  const isCompleted = ['completed', 'past', 'dispensed', 'sent to pharmacy', 'sent_to_pharmacy'].includes(String(statusRaw).toLowerCase());

  // Extract vitals (Plan 2 only)
  const vitals = data?.vitals || appointment?.vitals || {};
  const bpSystolic = vitals.bpSystolic || null;
  const bpDiastolic = vitals.bpDiastolic || null;
  let bpStr = '—';
  if (bpSystolic && bpDiastolic) {
    bpStr = `${bpSystolic}/${bpDiastolic} mmHg`;
  } else if (bpSystolic) {
    bpStr = `${bpSystolic} mmHg`;
  }
  const pulseStr = vitals.pulse ? `${vitals.pulse} bpm` : '—';
  const tempStr = vitals.temperature ? `${vitals.temperature} °F` : '—';
  const spo2Str = vitals.spo2 ? `${vitals.spo2}%` : '—';
  const weightStr = vitals.weight ? `${vitals.weight} kg` : '—';
  const heightStr = vitals.height ? `${vitals.height} cm` : '—';

  // Extract consultation details
  const chiefComplaint = data?.chiefComplaint || appointment?.chiefComplaint || '—';
  const diagnosis = data?.diagnosis || '—';
  const medicalAdvice = data?.advice || data?.clinicalNotes || '—';
  const followupDateStr = formatFollowupDate(data?.followupDate);

  // Extract prescribed medicines (Plan 2 only)
  const prescriptions = Array.isArray(data?.prescriptions) ? data.prescriptions : [];

  // Extract investigations (Plan 2 only) thoroughly
  const rawInvestigations = (Array.isArray(data?.investigations) && data.investigations.length > 0)
    ? data.investigations
    : (Array.isArray(appointment?.investigations) && appointment.investigations.length > 0)
      ? appointment.investigations
      : (Array.isArray(appointment?.appointmentId?.investigations) && appointment.appointmentId.investigations.length > 0)
        ? appointment.appointmentId.investigations
        : (Array.isArray(data?.appointmentId?.investigations) && data.appointmentId.investigations.length > 0)
          ? data.appointmentId.investigations
          : [];

  const investigations = rawInvestigations.map(inv => {
    if (typeof inv === 'string') {
      return { serviceType: 'Laboratory', name: inv, code: '—', price: 0 };
    }
    return {
      _id: inv._id,
      serviceType: inv.serviceType || inv.category || 'Laboratory',
      name: inv.name || inv.investigationName || inv.serviceName || '—',
      code: inv.code || inv.serviceCode || '—',
      price: inv.price !== undefined && inv.price !== null ? Number(inv.price) || 0 : 0
    };
  });

  // Extract billing
  const billing = data?.billing || {};
  const feeNum = billing.consultationFee !== undefined && billing.consultationFee !== null && !isNaN(Number(billing.consultationFee))
    ? Number(billing.consultationFee)
    : (appointment?.consultationFee !== undefined && !isNaN(Number(appointment.consultationFee)) ? Number(appointment.consultationFee) : 500);
  const consultationFee = `₹${feeNum.toLocaleString('en-IN')}`;

  const invChargesNum = billing.investigationCharges !== undefined && billing.investigationCharges !== null && !isNaN(Number(billing.investigationCharges))
    ? Number(billing.investigationCharges)
    : (investigations.length > 0 ? investigations.reduce((sum, inv) => sum + (Number(inv.price) || 0), 0) : 0);
  const investigationCharges = `₹${invChargesNum.toLocaleString('en-IN')}`;

  const discountNum = billing.discount !== undefined && billing.discount !== null && !isNaN(Number(billing.discount))
    ? Number(billing.discount)
    : 0;
  const discount = `₹${discountNum.toLocaleString('en-IN')}`;

  const additionalChargesNum = billing.additionalCharges !== undefined && billing.additionalCharges !== null && !isNaN(Number(billing.additionalCharges))
    ? Number(billing.additionalCharges)
    : (appointment?.additionalCharges !== undefined && !isNaN(Number(appointment.additionalCharges)) ? Number(appointment.additionalCharges) : 0);
  const additionalChargesStr = `₹${additionalChargesNum.toLocaleString('en-IN')}`;

  // Enforce mathematical truth on Consultation Record: Total Payable = Fee + Investigations + Additional Charges - Discount
  const computedTotal = Math.max(0, feeNum + invChargesNum + additionalChargesNum - discountNum);
  const totalPayable = `₹${computedTotal.toLocaleString('en-IN')}`;

  const rawPaymentStatus = billing.paymentStatus || appointment?.billingStatus || 'Unpaid';
  const isPaid = String(rawPaymentStatus).toLowerCase() === 'paid' ||
                 String(appointment?.billingStatus).toLowerCase() === 'paid' ||
                 appointment?.workflow?.paymentState === 'PAID';
  const paymentStatus = isPaid ? 'Paid' : (rawPaymentStatus || 'Unpaid');
  const paymentDateStr = formatDate(billing.paymentDate || (isPaid ? (appointment?.workflow?.timestamps?.paymentCompletedAt || appointment?.updatedAt || appointment?.date) : null));

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div id="consultation-record-modal-portal" className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs font-sans">
      {/* Print-specific style isolation */}
      <style>{`
        @media print {
          body > *:not(#consultation-record-modal-portal) {
            display: none !important;
          }
          #consultation-record-modal-portal {
            position: absolute !important;
            inset: 0 !important;
            padding: 0 !important;
            background: white !important;
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
          #consultation-record-printable {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
          .consultation-record-patient-section {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 16px !important;
            flex-wrap: nowrap !important;
          }
          .consultation-record-patient-details-row {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 8px !important;
            flex-wrap: nowrap !important;
          }
          .consultation-details-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
          }
          .billing-payment-row {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 16px !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      {/* Main Modal Card */}
      <div
        id="consultation-record-printable"
        className="bg-white rounded-2xl md:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left"
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
              <FileText className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <h2 className="text-base md:text-lg font-black text-[#2563EB] tracking-wider uppercase">
              CONSULTATION RECORD
            </h2>
          </div>
          <button
            onClick={onClose}
            className="no-print text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-white">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
              <p className="text-xs font-semibold text-slate-500">Loading visit consultation record...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-rose-500 font-semibold text-xs bg-rose-50 rounded-2xl border border-rose-200">
              Failed to load consultation record for this visit. Please try again.
            </div>
          ) : (
            <>
              {/* SECTION 1: Patient & Consultation Information */}
              <div className="consultation-record-patient-section border border-slate-200/90 rounded-2xl p-4 bg-white flex flex-row items-center justify-between gap-4 flex-wrap sm:flex-nowrap shadow-2xs">
                {/* Patient Profile info */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100/70 text-[#2563EB] flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                      {patientName}
                    </h3>
                    <div className="consultation-record-patient-details-row flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5 flex-wrap">
                      <span>UHID: <strong className="text-slate-700 font-mono">{uhid}</strong></span>
                      <span>•</span>
                      <span>Age/Sex: <strong className="text-slate-700">{ageGenderStr}</strong></span>
                      {mobile && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-slate-600">{mobile}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Token No. */}
                <div>
                  <span className="text-xs text-slate-500 font-medium block">Token No.</span>
                  <span className="text-base font-black text-[#2563EB] font-mono mt-0.5 block">
                    {tokenStr}
                  </span>
                </div>

                {/* Consultation Date */}
                <div>
                  <span className="text-xs text-slate-500 font-medium block">Consultation Date</span>
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                    <span>{consultDate}</span>
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>

                {/* Doctor */}
                <div>
                  <span className="text-xs text-slate-500 font-medium block">Doctor</span>
                  <span className="text-sm font-bold text-slate-900 block mt-0.5 leading-tight">
                    {formattedDoctorName}
                  </span>
                  <span className="text-xs text-slate-500 font-medium block">
                    {departmentName}
                  </span>
                </div>

                {/* Status Badge */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 shrink-0">
                  {isPlan1 && !isFollowUp && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      Plan 1
                    </span>
                  )}
                  {isCompleted ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100" />
                      Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {statusRaw}
                    </span>
                  )}
                </div>
              </div>

              {/* SECTION 2: Patient Vitals (Plan 2 Digital EMR Only) */}
              {!isPlan1 && (
                <div>
                  <div className="bg-[#F0F5FF] border border-[#DCE7F9] rounded-t-xl px-4 py-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#2563EB] stroke-[2.5]" />
                    <span className="text-xs font-bold text-slate-800 tracking-wide">Vitals</span>
                  </div>
                  <div className="border-x border-b border-[#DCE7F9] rounded-b-xl bg-white p-3.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-left">
                    <div className="px-3 py-1">
                      <span className="text-[11px] text-slate-500 font-medium block">Blood Pressure</span>
                      <span className="text-xs md:text-sm font-bold text-slate-900 mt-0.5 block">{bpStr}</span>
                    </div>
                    <div className="px-3 py-1">
                      <span className="text-[11px] text-slate-500 font-medium block">Pulse Rate</span>
                      <span className="text-xs md:text-sm font-bold text-slate-900 mt-0.5 block">{pulseStr}</span>
                    </div>
                    <div className="px-3 py-1">
                      <span className="text-[11px] text-slate-500 font-medium block">Temperature</span>
                      <span className="text-xs md:text-sm font-bold text-slate-900 mt-0.5 block">{tempStr}</span>
                    </div>
                    <div className="px-3 py-1">
                      <span className="text-[11px] text-slate-500 font-medium block">SpO₂</span>
                      <span className="text-xs md:text-sm font-bold text-slate-900 mt-0.5 block">{spo2Str}</span>
                    </div>
                    <div className="px-3 py-1">
                      <span className="text-[11px] text-slate-500 font-medium block">Weight</span>
                      <span className="text-xs md:text-sm font-bold text-slate-900 mt-0.5 block">{weightStr}</span>
                    </div>
                    <div className="px-3 py-1">
                      <span className="text-[11px] text-slate-500 font-medium block">Height</span>
                      <span className="text-xs md:text-sm font-bold text-slate-900 mt-0.5 block">{heightStr}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: Consultation Details / Patient Intake (Aligned in 2 Rows x 2 Columns) */}
              {isPlan1 && !isFollowUp ? (
                <div>
                  <div className="bg-[#F0F5FF] border border-[#DCE7F9] rounded-t-xl px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-[#2563EB] stroke-[2.2]" />
                      <span className="text-xs font-bold text-slate-800 tracking-wide">
                        Patient Intake & Symptoms (Collected at Reception)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-blue-100/70 px-2 py-0.5 rounded-md">
                      Reception Admission
                    </span>
                  </div>
                  <div className="border-x border-b border-[#DCE7F9] rounded-b-xl bg-white p-4">
                    <div className="consultation-details-grid grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      {/* Row 1, Col 1 */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Chief Complaint / Symptoms Recorded</span>
                        <p className="text-sm font-bold text-slate-900 mt-1 leading-relaxed">
                          {chiefComplaint}
                        </p>
                      </div>
                      {/* Row 1, Col 2 */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Consultation Type</span>
                        <p className="text-sm font-semibold text-slate-800 mt-1">
                          {consultationType}
                        </p>
                        <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                          Department: <strong className="text-slate-700">{departmentName}</strong>
                        </span>
                      </div>
                      {/* Row 2, Col 1 */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Contact Information</span>
                        <p className="text-sm font-semibold text-slate-800 mt-1">
                          {mobile ? mobile : '—'}
                        </p>
                        {addressStr && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{addressStr}</p>
                        )}
                        {bloodGroup && (
                          <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                            Blood Group: <strong className="text-rose-600">{bloodGroup}</strong>
                          </p>
                        )}
                      </div>
                      {/* Row 2, Col 2 */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Follow-up Date</span>
                        <p className="text-xs md:text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{followupDateStr}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="bg-[#F0F5FF] border border-[#DCE7F9] rounded-t-xl px-4 py-2 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[#2563EB] stroke-[2.2]" />
                    <span className="text-xs font-bold text-slate-800 tracking-wide">Consultation Details</span>
                  </div>
                  <div className="border-x border-b border-[#DCE7F9] rounded-b-xl bg-white p-4">
                    <div className="consultation-details-grid grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      {/* Row 1, Col 1: Chief Complaint */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Chief Complaint</span>
                        <p className="text-xs md:text-sm font-semibold text-slate-800 mt-1 leading-relaxed">
                          {chiefComplaint}
                        </p>
                      </div>

                      {/* Row 1, Col 2: Diagnosis */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Diagnosis</span>
                        <p className="text-xs md:text-sm font-semibold text-slate-800 mt-1 leading-relaxed">
                          {diagnosis}
                        </p>
                      </div>

                      {/* Row 2, Col 1: Medical Advice */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Medical Advice</span>
                        <p className="text-xs md:text-sm font-semibold text-slate-800 mt-1 leading-relaxed">
                          {medicalAdvice}
                        </p>
                      </div>

                      {/* Row 2, Col 2: Follow-up Date */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Follow-up Date</span>
                        <p className="text-xs md:text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{followupDateStr}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4 & 5: Prescriptions / Manual Paper Rx Notice */}
              {isPlan1 && !isFollowUp ? (
                <div className="border border-blue-200/90 rounded-2xl p-4.5 bg-gradient-to-r from-blue-50/60 via-slate-50/40 to-white shadow-2xs">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-xs">
                      <FileText className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900">
                          Physical Paper Prescription (Plan 1 Active)
                        </h4>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Manual Prescription Flow
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        In Plan 1, patient admission occurs at Reception and is queued to the Doctor Desk. 
                        The attending doctor ({formattedDoctorName}) calls the patient via AI Voice Call. 
                        Clinical diagnoses, medicines, and medical advice are handwritten directly onto the physical hospital prescription letterhead provided to the patient.
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-blue-200/60 flex items-center gap-3 text-xs font-medium text-slate-600 flex-wrap">
                        <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          AI Voice Call Completed
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                          <Volume2 className="w-3.5 h-3.5 text-[#2563EB]" />
                          Called by {formattedDoctorName}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600">Physical Prescription Handed to Patient</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Prescribed Medicines (Plan 2) */}
                  <div>
                    <div className="bg-[#F0F5FF] border border-[#DCE7F9] rounded-t-xl px-4 py-2 flex items-center gap-2">
                      <Pill className="w-4 h-4 text-[#2563EB] stroke-[2.2]" />
                      <span className="text-xs font-bold text-slate-800 tracking-wide">Prescribed Medicines</span>
                    </div>
                    <div className="border-x border-b border-[#DCE7F9] rounded-b-xl overflow-hidden bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">Medicine</th>
                            <th className="py-2.5 px-4 font-semibold">Dosage</th>
                            <th className="py-2.5 px-4 font-semibold">Frequency</th>
                            <th className="py-2.5 px-4 font-semibold">Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                          {prescriptions.length > 0 ? (
                            prescriptions.map((p, idx) => (
                              <tr key={p._id || idx} className="hover:bg-slate-50/50">
                                <td className="py-3 px-4 font-medium text-slate-900">
                                  {p.medicineName || '—'}
                                </td>
                                <td className="py-3 px-4 font-normal text-slate-700">
                                  {p.dosage || p.dose || '—'}
                                </td>
                                <td className="py-3 px-4 font-normal text-slate-700">
                                  {p.frequency || '—'}
                                </td>
                                <td className="py-3 px-4 font-normal text-slate-700">
                                  {p.duration || '—'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="py-5 text-center text-xs text-slate-400 italic">
                                No prescribed medicines recorded for this visit.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Investigations (Plan 2) - Render ONLY if patient has investigations */}
                  {investigations.length > 0 && (
                    <div>
                      <div className="bg-[#F0F5FF] border border-[#DCE7F9] rounded-t-xl px-4 py-2 flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-[#2563EB] stroke-[2.2]" />
                        <span className="text-xs font-bold text-slate-800 tracking-wide">Investigations</span>
                      </div>
                      <div className="border-x border-b border-[#DCE7F9] rounded-b-xl overflow-hidden bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">Type</th>
                              <th className="py-2.5 px-4 font-semibold">Service Name</th>
                              <th className="py-2.5 px-4 font-semibold">Service Code</th>
                              <th className="py-2.5 px-4 font-semibold">Price</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {investigations.map((inv, idx) => (
                              <tr key={inv._id || idx} className="hover:bg-slate-50/50">
                                <td className="py-3 px-4 font-medium text-slate-800">
                                  {inv.serviceType || 'Laboratory'}
                                </td>
                                <td className="py-3 px-4 font-medium text-slate-900">
                                  {inv.name || '—'}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-600">
                                  {inv.code || '—'}
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-900">
                                  {inv.price !== undefined && inv.price !== null
                                    ? `₹${Number(inv.price).toLocaleString('en-IN')}`
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* SECTION 6: Billing Summary */}
              <div>
                <div className="bg-[#F0F5FF] border border-[#DCE7F9] rounded-t-xl px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                      <IndianRupee className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 tracking-wide">
                      {isPlan1 && !isFollowUp ? 'Reception Fee & Payment Summary' : 'Billing Summary'}
                    </span>
                  </div>
                  {isPlan1 && !isFollowUp && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      Admission Counter Collection
                    </span>
                  )}
                </div>
                <div className="border-x border-b border-[#DCE7F9] rounded-b-xl bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left columns - Center lines removed */}
                  {isPlan1 && !isFollowUp ? (
                    <div className="grid grid-cols-2 gap-4 flex-1">
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block">OPD Consultation Fee</span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">{consultationFee}</span>
                      </div>
                      {discountNum > 0 ? (
                        <div>
                          <span className="text-[11px] text-slate-500 font-medium block">Discount</span>
                          <span className="text-sm font-bold text-slate-900 mt-0.5 block">{discount}</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[11px] text-slate-500 font-medium block">Service Category</span>
                          <span className="text-sm font-semibold text-slate-700 mt-0.5 block">General OPD Token</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`grid ${additionalChargesNum > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-4 flex-1`}>
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block">Consultation Fee</span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">{consultationFee}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block">Investigation Charges</span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">{investigationCharges}</span>
                      </div>
                      {additionalChargesNum > 0 && (
                        <div>
                          <span className="text-[11px] text-slate-500 font-medium block">Additional Charges</span>
                          <span className="text-sm font-bold text-blue-600 mt-0.5 block">{additionalChargesStr}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block">Discount</span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">{discount}</span>
                      </div>
                    </div>
                  )}

                  {/* Center highlighted Total Payable box */}
                  <div className="bg-[#EFF6FF] border border-blue-100 rounded-xl px-7 py-2.5 text-center shrink-0">
                    <span className="text-[11px] font-bold text-[#2563EB] block">
                      {isPlan1 && !isFollowUp ? 'Total Amount Paid' : 'Total Payable'}
                    </span>
                    <span className="text-xl md:text-2xl font-black text-[#2563EB] tracking-tight mt-0.5 block">
                      {isPlan1 && !isFollowUp ? consultationFee : totalPayable}
                    </span>
                  </div>

                  {/* Right columns: Payment Status & Payment Date in SAME ROW */}
                  <div className="billing-payment-row flex items-center gap-4 shrink-0 flex-wrap sm:flex-nowrap border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-medium">Payment Status:</span>
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 fill-emerald-100" />
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {paymentStatus}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-medium">Payment Date:</span>
                      <span className="text-xs font-semibold text-slate-800">{paymentDateStr}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer with Print and Close buttons */}
        <div className="no-print px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={handlePrint}
            className="bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            title="Print consultation record"
          >
            <Printer className="w-4 h-4 stroke-[2.2]" />
            <span>Print</span>
          </button>
          <button
            onClick={onClose}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-5 py-2.5 rounded-xl border border-slate-300 shadow-2xs transition-all cursor-pointer active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ConsultationRecordModal;
