import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Printer,
  User,
  Bed,
  CreditCard,
  AlertCircle,
  History,
  FileText
} from 'lucide-react';
import Modal from '../Modal';
import api from '../../services/api';

/**
 * Helper to format doctor display name
 */
const formatDoctor = (doc) => {
  if (!doc) return 'Not Assigned';
  let name = doc.name;
  if (!name && doc.firstName) {
    name = `${doc.firstName} ${doc.lastName || ''}`.trim();
  }
  if (!name) return 'Not Assigned';
  name = name.replace(/^Dr\.?\s*/i, '');
  const prefix = `Dr. ${name}`;
  const qualification = doc.doctorProfile?.qualification ? `, ${doc.doctorProfile.qualification}` : '';
  return `${prefix}${qualification}`;
};

/**
 * Helper to format admission date and time
 */
const formatAdmissionDateTime = (dateVal, timeVal) => {
  if (!dateVal) return { date: '—', time: null };
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return { date: '—', time: null };

  const dateStr = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  let timeStr = null;
  if (timeVal && typeof timeVal === 'string' && timeVal.trim()) {
    const trimmed = timeVal.trim();
    if (/am|pm/i.test(trimmed)) {
      timeStr = trimmed.toUpperCase();
    } else if (trimmed.includes(':')) {
      const [hh, mm] = trimmed.split(':');
      const h = parseInt(hh, 10);
      const m = parseInt(mm, 10);
      if (!isNaN(h) && !isNaN(m)) {
        const period = h >= 12 ? 'PM' : 'AM';
        const formattedH = h % 12 || 12;
        timeStr = `${String(formattedH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
      }
    }
  }

  if (!timeStr) {
    const hours = d.getHours();
    const minutes = d.getMinutes();
    if (hours !== 0 || minutes !== 0) {
      const period = hours >= 12 ? 'PM' : 'AM';
      const formattedH = hours % 12 || 12;
      timeStr = `${String(formattedH).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
    }
  }

  return { date: dateStr, time: timeStr };
};

/**
 * Unified Inpatient Details Modal
 * Rendered identically for all "Admission Details" dropdown triggers across IPD department.
 */
const InpatientDetailsModal = ({
  isOpen,
  onClose,
  admission,
  isDoctorDesk = false,
  onOpenDoctorRound,
  onOpenVisitHistory,
  onOpenConsultation,
  onOpenDischarge
}) => {
  const rawAdmission = admission?.raw || admission;
  const admissionId = rawAdmission?._id || (typeof rawAdmission === 'string' ? rawAdmission : null);

  // Fetch full admission record by ID from backend if admissionId is available
  const { data: fetchedAdmission, isLoading, isError } = useQuery({
    queryKey: ['ipd-admission-detail-full', admissionId],
    queryFn: async () => {
      if (!admissionId) return null;
      const res = await api.get(`/ipd/admissions/${admissionId}`);
      return res.data?.data || res.data || null;
    },
    enabled: Boolean(isOpen && admissionId),
    initialData: (typeof rawAdmission === 'object' && rawAdmission?._id) ? rawAdmission : undefined,
    staleTime: 10000
  });

  const activeAdmission = fetchedAdmission || (typeof rawAdmission === 'object' ? rawAdmission : null);

  if (!isOpen) return null;

  const patient = (typeof activeAdmission?.patientId === 'object' && activeAdmission.patientId !== null)
    ? activeAdmission.patientId
    : {};

  const patientName = patient.name || activeAdmission?.patientName || 'Patient';
  const bloodGroup = patient.bloodGroup || activeAdmission?.bloodGroup || null;
  const status = activeAdmission?.status || 'Admitted';
  const isDischarged = status === 'Discharged';
  const ipdNumber = activeAdmission?.admissionId || activeAdmission?.ipdNo || '—';
  const uhid = patient.uhid || activeAdmission?.uhid || '—';
  const age = patient.age || activeAdmission?.age || '—';
  const gender = patient.gender || activeAdmission?.gender || '—';
  const mobileNumber = patient.mobileNumber || activeAdmission?.mobileNumber || '—';

  const allergiesText = Array.isArray(patient.allergies) && patient.allergies.length > 0
    ? patient.allergies.join(', ')
    : (typeof patient.allergies === 'string' && patient.allergies.trim() ? patient.allergies : 'No known allergies');

  const diagnosisText = patient.diagnosis || activeAdmission?.finalDiagnosis || activeAdmission?.reasonForAdmission || 'None';

  const wardBedText = isDischarged || !activeAdmission?.bedId
    ? 'No Active Bed (Released)'
    : (typeof activeAdmission?.bedId === 'object' && activeAdmission.bedId !== null
      ? `${activeAdmission.bedId?.wardId?.name || 'Ward'} - Bed ${activeAdmission.bedId?.bedNumber || '—'}`
      : (activeAdmission?.ward ? `${activeAdmission.ward} - ${activeAdmission.bedNo || 'Bed'}` : 'Assigned Bed'));

  const doctorText = formatDoctor(activeAdmission?.attendingDoctorId) || activeAdmission?.doctorName || 'Not Assigned';

  const expectedDischargeText = activeAdmission?.expectedDischargeDate
    ? new Date(activeAdmission.expectedDischargeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Standard care pathway';

  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onClose={onClose}
      title={`Inpatient Details — ${ipdNumber}`}
      size="xl"
    >
      {isLoading && !activeAdmission ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#2F63F2] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Fetching admission details...</p>
        </div>
      ) : !activeAdmission && isError ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-800">Failed to load admission details.</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-blue-50 active:bg-blue-100 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Patient Header Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-slate-900">
                  {patientName}
                </h3>
                {bloodGroup && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 border border-rose-200 text-rose-500">
                    {bloodGroup}
                  </span>
                )}
                {isDischarged ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    <Check className="w-3 h-3 text-slate-500" /> Discharged
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Admitted
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>UHID: <strong>{uhid}</strong></span>
                <span>IPD: <strong>{ipdNumber}</strong></span>
                <span>Age / Gender: <strong>{age} yrs / {gender}</strong></span>
                <span>Mobile: <strong>{mobileNumber}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isDoctorDesk && onOpenDischarge && (
                <button
                  type="button"
                  onClick={() => {
                    const adm = activeAdmission;
                    onClose();
                    onOpenDischarge(adm);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                  title="Open Clinical Discharge Summary"
                >
                  <FileText className="w-3.5 h-3.5 text-white" />
                  <span>Discharge Summary</span>
                </button>
              )}
              {(onOpenDoctorRound || onOpenVisitHistory) && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenVisitHistory) onOpenVisitHistory(activeAdmission);
                    else if (onOpenDoctorRound) onOpenDoctorRound(activeAdmission);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-white" />
                  <span>Visit History</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>Print Summary</span>
              </button>
            </div>
          </div>

          {/* ==================================================
              SECTION 1: PATIENT INFORMATION
              ================================================== */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">
              <User className="w-4 h-4 text-[#2F63F2]" />
              <span>Patient Information</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Patient Name</span>
                <span className="font-bold text-slate-800 text-sm">{patientName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">UHID</span>
                <span className="font-semibold text-slate-800">{uhid}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">IPD Number</span>
                <span className="font-semibold text-[#2F63F2]">{ipdNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Age & Gender</span>
                <span className="font-medium text-slate-800">{age} yrs / {gender}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Mobile Number</span>
                <span className="font-medium text-slate-800">{mobileNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Blood Group</span>
                <span className="font-semibold text-rose-600">{bloodGroup || 'Not recorded'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Known Allergies</span>
                <span className="font-medium text-slate-800">
                  {allergiesText}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Recorded Diagnosis</span>
                <span className="font-medium text-slate-800">
                  {diagnosisText}
                </span>
              </div>
            </div>
          </div>

          {/* ==================================================
              SECTION 2: ADMISSION DETAILS
              ================================================== */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">
              <Bed className="w-4 h-4 text-[#2F63F2]" />
              <span>Admission Details</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Admission Date & Time</span>
                <span className="font-bold text-slate-800">
                  {formatAdmissionDateTime(activeAdmission?.admissionDate, activeAdmission?.admissionTime).date}
                  {formatAdmissionDateTime(activeAdmission?.admissionDate, activeAdmission?.admissionTime).time && (
                    <span className="font-normal text-slate-500 block text-[11px]">
                      at {formatAdmissionDateTime(activeAdmission?.admissionDate, activeAdmission?.admissionTime).time}
                    </span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Admission Type</span>
                <span className="font-semibold text-slate-800">{activeAdmission?.admissionType || 'Routine Admission'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Ward & Assigned Bed</span>
                <span className="font-bold text-slate-800">
                  {wardBedText}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Primary Attending Doctor</span>
                <span className="font-semibold text-slate-800">{doctorText}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Admission Status</span>
                <span className="font-semibold text-slate-800">{status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Expected Discharge</span>
                <span className="font-medium text-slate-800">
                  {expectedDischargeText}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">Reason for Admission</span>
                <span className="font-medium text-slate-800">{activeAdmission?.reasonForAdmission || 'Clinical observation and treatment'}</span>
              </div>
            </div>

            {activeAdmission?.admissionNotes && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 block text-[11px] mb-0.5">Intake Notes & Observations</span>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {activeAdmission.admissionNotes}
                </p>
              </div>
            )}

            {isDischarged && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1 mt-2">
                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                  <span>Discharge Record</span>
                </div>
                <div className="text-xs text-emerald-950 font-semibold">
                  Final Diagnosis: {activeAdmission?.finalDiagnosis || '—'}
                </div>
                {activeAdmission?.treatmentSummary && (
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    Treatment Summary: {activeAdmission.treatmentSummary}
                  </p>
                )}
                {activeAdmission?.dischargeInstructions && (
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    Instructions: {activeAdmission.dischargeInstructions}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ==================================================
              SECTION 3: PAYMENT & BILLING DETAILS
              ================================================== */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">
              <CreditCard className="w-4 h-4 text-[#2F63F2]" />
              <span>Payment Details</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Payment Status</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                  activeAdmission?.paymentStatus === 'Paid' || (Number(activeAdmission?.billingDetails?.totalBill || 0) > 0 && Number(activeAdmission?.amountPaid || 0) >= Number(activeAdmission?.billingDetails?.totalBill || 0))
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : Number(activeAdmission?.amountPaid || 0) > 0
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                  {activeAdmission?.paymentStatus === 'Paid' || (Number(activeAdmission?.billingDetails?.totalBill || 0) > 0 && Number(activeAdmission?.amountPaid || 0) >= Number(activeAdmission?.billingDetails?.totalBill || 0))
                    ? 'Paid'
                    : Number(activeAdmission?.amountPaid || 0) > 0
                      ? 'Advance Deposited'
                      : 'Pending Initial Deposit'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Advance Amount Paid</span>
                <span className="font-bold text-slate-900 text-sm">
                  ₹{Number(activeAdmission?.amountPaid || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Payment Mode</span>
                <span className="font-semibold text-slate-800">{activeAdmission?.amountMode || 'Cash'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Account Status</span>
                <span className="font-medium text-slate-800">
                  {isDischarged ? 'Settled & Released' : 'Active IPD Billing'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-blue-50 active:bg-blue-100 font-bold rounded-xl text-sm transition-all cursor-pointer shadow-2xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default InpatientDetailsModal;
