import React from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Pill, X, Printer, Calendar, User, FileText, 
  CheckCircle2, Clock, Activity, ClipboardList, 
  AlertCircle, Loader2, Stethoscope, Sparkles
} from 'lucide-react';
import api from '../services/api';

const PrescriptionDetailsModal = ({ isOpen, onClose, appointment, consultationId }) => {
  const targetId = appointment?._id || consultationId;

  // Fetch visit-specific prescription & consultation snapshot
  const { data, isLoading, error } = useQuery({
    queryKey: ['prescriptionDetailsSnapshot', targetId],
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

  // Formatting helpers
  const formatDate = (val) => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return String(val);
    }
  };

  // Extract patient info
  const patientName = data?.patientName || appointment?.patientId?.name || appointment?.patientName || '—';
  const uhid = data?.uhid || appointment?.patientId?.uhid || appointment?.uhid || '—';
  const age = data?.age ?? appointment?.patientId?.age ?? null;
  const gender = data?.gender || appointment?.patientId?.gender || null;
  const ageGenderStr = age && gender ? `${age} Yrs, ${gender}` : age ? `${age} Yrs` : gender || '—';
  const mobile = data?.mobile || appointment?.patientId?.mobileNumber || appointment?.patientId?.phone || appointment?.mobileNumber || null;

  // Extract token & doctor details
  const rawToken = data?.tokenNumber || appointment?.tokenNumber || 'OP001';
  const tokenStr = rawToken !== '—' && !String(rawToken).startsWith('#') ? `#${rawToken}` : rawToken;
  const consultDate = formatDate(data?.consultationDate || appointment?.date || data?.createdAt);
  const doctorName = data?.doctorName || appointment?.doctorId?.name || 'Dr. Vedha';
  const cleanDoc = doctorName !== '—' ? String(doctorName).replace(/^(Dr\.?\s*)+/i, '').trim() : '';
  const formattedDoctorName = cleanDoc ? `Dr. ${cleanDoc}` : doctorName;
  const departmentName = data?.department || data?.doctorId?.departmentName || appointment?.doctorId?.departmentName || 'General Medicine';

  // Extract clinical diagnosis & notes
  const chiefComplaint = data?.chiefComplaint || appointment?.chiefComplaint || '—';
  const diagnosis = data?.diagnosis || '—';
  const advice = data?.advice || data?.clinicalNotes || '—';
  const followupDate = data?.followupDate ? formatDate(data.followupDate) : null;

  // Extract prescriptions array
  const prescriptions = Array.isArray(data?.prescriptions) ? data.prescriptions : [];
  const investigations = Array.isArray(data?.investigations) ? data.investigations : [];

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div id="prescription-details-modal-portal" className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs font-sans">
      <style>{`
        @media print {
          body > *:not(#prescription-details-modal-portal) {
            display: none !important;
          }
          #prescription-details-modal-portal {
            position: absolute !important;
            inset: 0 !important;
            padding: 0 !important;
            background: white !important;
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
          #prescription-details-printable {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
        }
      `}</style>

      {/* Main Modal Card */}
      <div
        id="prescription-details-printable"
        className="bg-white rounded-2xl md:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left"
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
              <Pill className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black text-[#2563EB] tracking-wider uppercase">
                PRESCRIPTION DETAILS
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Official Doctor Prescription & Clinical Recommendations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="no-print text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-white">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
              <p className="text-xs font-semibold text-slate-500">Fetching exact doctor prescription...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-rose-500 font-semibold text-xs bg-rose-50 rounded-2xl border border-rose-200">
              Failed to load prescription details. Please try again.
            </div>
          ) : (
            <>
              {/* SECTION 1: Patient & Doctor Info Card (Matching User Screenshot Layout) */}
              <div className="border border-slate-200/90 rounded-2xl p-4 bg-white shadow-2xs space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0 font-bold text-sm">
                      <User className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                        {patientName}
                      </h3>
                      <div className="text-xs text-slate-500 font-medium mt-0.5 space-x-1.5">
                        <span>UHID: <strong className="text-slate-700 font-mono">{uhid}</strong></span>
                        <span>•</span>
                        <span>{ageGenderStr}</span>
                        {mobile && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-600">{mobile}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-sm text-[#2563EB] block">
                      Token {tokenStr}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Completed
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Prescribed By Doctor</span>
                    <span className="text-xs font-bold text-slate-900 mt-0.5 block">{formattedDoctorName}</span>
                    <span className="text-[10px] text-slate-500 font-medium">{departmentName}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Consultation Date</span>
                    <span className="text-xs font-bold text-slate-800 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {consultDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Follow-up Review</span>
                    <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                      {followupDate || 'As needed / SOS'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Clinical Impression & Diagnoses */}
              <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
                <div className="bg-[#F0F5FF] border-b border-[#DCE7F9] px-4 py-2 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-[#2563EB] stroke-[2.2]" />
                  <span className="text-xs font-bold text-slate-800 tracking-wide">
                    Clinical Impression & Diagnosis
                  </span>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Chief Complaint</span>
                    <p className="font-semibold text-slate-900 mt-1 leading-relaxed">
                      {chiefComplaint}
                    </p>
                  </div>
                  <div className="pt-2 md:pt-0 md:pl-4">
                    <span className="text-[11px] text-slate-500 font-medium block">Clinical Diagnosis</span>
                    <p className="font-semibold text-slate-900 mt-1 leading-relaxed">
                      {diagnosis}
                    </p>
                  </div>
                  <div className="pt-2 md:pt-0 md:pl-4">
                    <span className="text-[11px] text-slate-500 font-medium block">Medical Advice / Instructions</span>
                    <p className="font-semibold text-slate-900 mt-1 leading-relaxed">
                      {advice}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Exact Prescribed Medicines Table */}
              <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
                <div className="bg-[#F0F5FF] border-b border-[#DCE7F9] px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-[#2563EB] stroke-[2.2]" />
                    <span className="text-xs font-bold text-slate-800 tracking-wide">
                      Prescribed Medicines ({prescriptions.length})
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded-full">
                    Rx Digital Record
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4 w-10 font-bold">#</th>
                        <th className="py-2.5 px-4 font-bold">Medicine Name</th>
                        <th className="py-2.5 px-4 font-bold">Dosage</th>
                        <th className="py-2.5 px-4 font-bold">Frequency</th>
                        <th className="py-2.5 px-4 font-bold">Duration</th>
                        <th className="py-2.5 px-4 font-bold">Timing / Instructions</th>
                        <th className="py-2.5 px-4 font-bold text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {prescriptions.length > 0 ? (
                        prescriptions.map((p, idx) => (
                          <tr key={p._id || idx} className="hover:bg-blue-50/20 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-400 text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {p.medicineName || p.name || '—'}
                              {p.remarks && (
                                <span className="block text-[10px] font-normal text-slate-500 mt-0.5 italic">
                                  Note: {p.remarks}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-[11px] font-mono">
                                {p.dosage || p.dose || '1 Tab'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-blue-700">
                              {p.frequency || '1-0-1'}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              {p.duration || '5 Days'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {p.timing || p.instructions || p.foodTiming || 'After Food'}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-right text-slate-900">
                              {p.quantity || 1}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-slate-400 italic">
                            No prescribed medicines recorded for this visit.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 4: Investigations Ordered (if any) */}
              {investigations.length > 0 && (
                <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
                  <div className="bg-[#F0F5FF] border-b border-[#DCE7F9] px-4 py-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#2563EB] stroke-[2.2]" />
                    <span className="text-xs font-bold text-slate-800 tracking-wide">
                      Diagnostic Investigations Ordered ({investigations.length})
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {investigations.map((inv, idx) => (
                        <div key={inv._id || idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900 block">{inv.name || 'Investigation'}</span>
                            <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{inv.serviceType || 'Laboratory'} • {inv.code || '—'}</span>
                          </div>
                          {inv.price > 0 && (
                            <span className="font-mono font-bold text-slate-800 text-xs">
                              ₹{Number(inv.price).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer with Action Buttons */}
        <div className="no-print px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={handlePrint}
            className="bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            title="Print doctor prescription"
          >
            <Printer className="w-4 h-4 stroke-[2.2]" />
            <span>Print Prescription</span>
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

export default PrescriptionDetailsModal;

