import React from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Receipt, X, Printer, Calendar, User, FileText, 
  CheckCircle2, IndianRupee, CreditCard, ShieldCheck, 
  Loader2, Tag, Percent
} from 'lucide-react';
import api from '../services/api';

const BillingSummaryModal = ({ isOpen, onClose, appointment, consultationId }) => {
  const targetId = appointment?._id || consultationId;

  // Fetch visit-specific billing snapshot
  const { data, isLoading, error } = useQuery({
    queryKey: ['billingSummarySnapshot', targetId],
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

  // Extract billing info
  const billing = data?.billing || {};
  const feeNum = billing.consultationFee !== undefined && billing.consultationFee !== null && !isNaN(Number(billing.consultationFee))
    ? Number(billing.consultationFee)
    : (appointment?.consultationFee !== undefined && !isNaN(Number(appointment.consultationFee)) ? Number(appointment.consultationFee) : 500);

  const investigationChargesNum = Number(billing.investigationCharges) || 0;
  const additionalChargesNum = Number(billing.additionalCharges) || 0;
  const discountNum = Number(billing.discount) || 0;
  const taxNum = Number(billing.tax) || 0;
  const totalPayableNum = Number(billing.totalPayable) || Math.max(0, feeNum + investigationChargesNum + additionalChargesNum - discountNum);

  const rawPaymentStatus = billing.paymentStatus || appointment?.billingStatus || 'Paid';
  const isPaid = String(rawPaymentStatus).toLowerCase() === 'paid' ||
                 String(appointment?.billingStatus).toLowerCase() === 'paid' ||
                 appointment?.workflow?.paymentState === 'PAID';
  const paymentStatus = isPaid ? 'Paid' : (rawPaymentStatus || 'Unpaid');
  const paymentDateStr = formatDate(billing.paymentDate || (isPaid ? (appointment?.workflow?.timestamps?.paymentCompletedAt || appointment?.updatedAt || appointment?.date) : null));
  const paymentMode = billing.paymentMode || appointment?.paymentMethod || 'Cash';
  const invoiceNo = billing.invoiceNo || (appointment?._id ? `INV-${String(appointment._id).slice(-8).toUpperCase()}` : 'INV-20261029-0001');

  // Build complete line items list
  const investigations = Array.isArray(data?.investigations) ? data.investigations : [];
  const additionalChargeItems = Array.isArray(billing.additionalChargeItems) ? billing.additionalChargeItems : [];
  const rawInvoiceItems = Array.isArray(billing.items) && billing.items.length > 0 ? billing.items : null;

  let lineItems = [];
  if (rawInvoiceItems) {
    lineItems = rawInvoiceItems.map((it, idx) => ({
      sno: idx + 1,
      name: it.name || 'Service',
      category: /consultation/i.test(it.name) ? 'Consultation' : (/lab|blood|scan|xray|test/i.test(it.name) ? 'Investigation' : 'Clinical Service'),
      quantity: it.quantity || 1,
      unitPrice: it.unitPrice || it.amount || 0,
      amount: it.amount || (it.quantity * it.unitPrice) || 0
    }));
  } else {
    // Synthesize structured items accurately
    let counter = 1;
    // 1. Consultation Fee
    lineItems.push({
      sno: counter++,
      name: `Doctor Consultation & Clinical Review (${departmentName})`,
      category: 'OPD Consultation',
      quantity: 1,
      unitPrice: feeNum,
      amount: feeNum
    });

    // 2. Investigations
    investigations.forEach((inv) => {
      const pr = Number(inv.price) || 0;
      if (pr > 0 || inv.name) {
        lineItems.push({
          sno: counter++,
          name: inv.name || 'Diagnostic Investigation',
          category: inv.serviceType || 'Laboratory',
          quantity: 1,
          unitPrice: pr,
          amount: pr
        });
      }
    });

    // 3. Additional Charges
    if (additionalChargeItems.length > 0) {
      additionalChargeItems.forEach((add) => {
        const pr = Number(add.amount) || 0;
        lineItems.push({
          sno: counter++,
          name: add.name || 'Additional Clinical Charge',
          category: 'Service',
          quantity: 1,
          unitPrice: pr,
          amount: pr
        });
      });
    } else if (additionalChargesNum > 0) {
      lineItems.push({
        sno: counter++,
        name: 'Additional Clinical & Nursing Charges',
        category: 'Service',
        quantity: 1,
        unitPrice: additionalChargesNum,
        amount: additionalChargesNum
      });
    }
  }

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div id="billing-summary-modal-portal" className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs font-sans">
      <style>{`
        @media print {
          body > *:not(#billing-summary-modal-portal) {
            display: none !important;
          }
          #billing-summary-modal-portal {
            position: absolute !important;
            inset: 0 !important;
            padding: 0 !important;
            background: white !important;
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
          #billing-summary-printable {
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
        id="billing-summary-printable"
        className="bg-white rounded-2xl md:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left"
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Receipt className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black text-slate-900 tracking-wider uppercase">
                PATIENT BILLING SUMMARY
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Official OPD Billing Receipt & Payment Breakdown
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
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs font-semibold text-slate-500">Fetching exact patient billing breakdown...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-rose-500 font-semibold text-xs bg-rose-50 rounded-2xl border border-rose-200">
              Failed to load billing summary. Please try again.
            </div>
          ) : (
            <>
              {/* SECTION 1: Patient & Invoice Header Card (Matching User Screenshot Layout) */}
              <div className="border border-slate-200/90 rounded-2xl p-4 bg-white shadow-2xs space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-sm">
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
                    <span className="font-mono text-[11px] font-semibold text-slate-500 block mt-0.5">
                      {invoiceNo}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Consulting Doctor</span>
                    <span className="text-xs font-bold text-slate-900 mt-0.5 block">{formattedDoctorName}</span>
                    <span className="text-[10px] text-slate-500 font-medium">{departmentName}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Billing Date</span>
                    <span className="text-xs font-bold text-slate-800 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {consultDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Payment Method</span>
                    <span className="text-xs font-bold text-slate-800 mt-0.5 flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-slate-400" />
                      {paymentMode}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Payment Status</span>
                    {isPaid ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 mt-0.5">
                        {paymentStatus}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 2: Exact Itemized Line Items Table */}
              <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
                <div className="bg-[#F0FDF4] border-b border-[#DCFCE7] px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-700 stroke-[2.2]" />
                    <span className="text-xs font-bold text-slate-800 tracking-wide">
                      Itemized Services Breakdown ({lineItems.length})
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                    Tax Invoice
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4 w-10 font-bold">#</th>
                        <th className="py-2.5 px-4 font-bold">Service / Description</th>
                        <th className="py-2.5 px-4 font-bold">Category</th>
                        <th className="py-2.5 px-4 font-bold text-center">Qty</th>
                        <th className="py-2.5 px-4 font-bold text-right">Rate (₹)</th>
                        <th className="py-2.5 px-4 font-bold text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {lineItems.map((item) => (
                        <tr key={item.sno} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-400 text-[11px]">
                            {item.sno}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {item.name}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-500">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-[10px]">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-center text-slate-700">
                            {item.quantity}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-right text-slate-700">
                            ₹{Number(item.unitPrice).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-right text-slate-900">
                            ₹{Number(item.amount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 3: Summary Totals & Settlement Calculation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* Left Card: Payment Settlement Details */}
                <div className="border border-slate-200/90 rounded-2xl p-4 bg-slate-50/60 flex flex-col justify-between space-y-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800 tracking-wide block mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Payment & Settlement Information
                    </span>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Payment Status:</span>
                        <strong className="text-emerald-700 font-bold">{paymentStatus}</strong>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Payment Method:</span>
                        <span className="font-semibold text-slate-800">{paymentMode}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Settlement Date:</span>
                        <span className="font-semibold text-slate-800">{paymentDateStr}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Tax Invoice Ref:</span>
                        <span className="font-mono text-slate-700 font-semibold">{invoiceNo}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11px] text-slate-500">
                    All payment collections are logged in hospital records under reception counter.
                  </div>
                </div>

                {/* Right Card: Financial Calculation */}
                <div className="border border-slate-200/90 rounded-2xl p-4 bg-white space-y-2.5 shadow-2xs">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>OPD Consultation Fee:</span>
                    <span className="font-mono font-semibold text-slate-900">₹{feeNum.toLocaleString('en-IN')}</span>
                  </div>

                  {investigationChargesNum > 0 && (
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Investigation / Lab Charges:</span>
                      <span className="font-mono font-semibold text-slate-900">₹{investigationChargesNum.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  {additionalChargesNum > 0 && (
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Additional Clinical Charges:</span>
                      <span className="font-mono font-semibold text-blue-600">₹{additionalChargesNum.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  {discountNum > 0 && (
                    <div className="flex justify-between text-xs text-emerald-700 font-medium">
                      <span>Concession / Discount:</span>
                      <span className="font-mono font-bold">- ₹{discountNum.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Total Amount Paid
                      </span>
                      <span className="text-[10px] text-slate-400">Net payable after discounts</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xl md:text-2xl font-black text-emerald-700 font-mono tracking-tight block">
                        ₹{totalPayableNum.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer with Action Buttons */}
        <div className="no-print px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            title="Print billing summary"
          >
            <Printer className="w-4 h-4 stroke-[2.2]" />
            <span>Print Bill</span>
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

export default BillingSummaryModal;

