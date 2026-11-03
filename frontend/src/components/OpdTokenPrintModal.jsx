import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Building2 } from 'lucide-react';
import Button from './Button';

const OpdTokenPrintModal = ({ isOpen, onClose, appointment, hospitalInfo }) => {
  if (!isOpen || !appointment) return null;

  // Extract fields with fallbacks
  const hospitalName = hospitalInfo?.name || appointment?.hospitalName || 'VILLZONE MULTISPECIALITY HOSPITAL';
  const hospitalAddress = hospitalInfo?.address || appointment?.hospitalAddress || '124 Healthcare Boulevard, City Center';
  const hospitalPhone = hospitalInfo?.phone || appointment?.hospitalPhone || '+91 98765 43210';

  // Format Token Number
  const rawToken = appointment.tokenNumber || appointment.token || appointment.queueNo || 'OP001';
  let tokenStr = String(rawToken).trim();
  if (!tokenStr.startsWith('#')) {
    tokenStr = `#${tokenStr}`;
  }

  // Format Patient Name
  const patientName = appointment.patientId?.name || appointment.patient?.name || appointment.patientName || 'George K';

  // Format Doctor Name
  const rawDoctorName = appointment.doctorId?.name || appointment.doctor?.name || appointment.doctorName || 'Nithin';
  const cleanDoc = String(rawDoctorName).replace(/^(Dr\.?\s*)+/i, '').trim();
  const doctorName = cleanDoc ? `Dr. ${cleanDoc}` : 'Dr. Nithin';

  // Format Date (e.g., "31 Jul 2026")
  const dateObj = appointment.date ? new Date(appointment.date) : new Date();
  const dateStr = dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // Format Time (e.g., "10:15 AM")
  let timeStr = appointment.slotTime || appointment.time || appointment.appointmentTime;
  if (!timeStr) {
    timeStr = dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  const handlePrint = () => {
    window.print();
  };

  const modalMarkup = (
    <div id="opd-token-print-portal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
      {/* Print-specific style override */}
      <style>{`
        @media print {
          body > *:not(#opd-token-print-portal) {
            display: none !important;
          }
          .no-print {
            display: none !important;
          }
          
          #opd-token-print-portal {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            z-index: 999999 !important;
            display: block !important;
          }

          .opd-token-modal-card {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            max-height: none !important;
          }

          .opd-token-paper-wrapper {
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            justify-content: center !important;
          }

          #opd-token-print-slip {
            display: block !important;
            visibility: visible !important;
            width: 3in !important;
            min-height: 5in !important;
            margin: 0 auto !important;
            padding: 0.25in !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: 3in 5in;
            margin: 0;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div className="opd-token-modal-card bg-slate-100 rounded-2xl shadow-2xl w-full max-w-[520px] overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="no-print flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#3563F6]" />
            <h2 className="text-base font-bold text-slate-900">Print OPD Token</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Paper Preview Centered */}
        <div className="opd-token-paper-wrapper p-6 overflow-y-auto flex items-center justify-center bg-slate-100">
          {/* Realistic 3x5 Inch Printable Paper Slip */}
          <div
            id="opd-token-print-slip"
            className="w-[300px] min-h-[460px] bg-white rounded-[8px] border border-slate-200 shadow-xl p-6 flex flex-col justify-between text-left font-sans transition-all"
          >
            {/* Top Section: Hospital Header */}
            <div>
              <div className="text-center space-y-1">
                <div className="flex justify-center mb-1.5">
                  <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#3563F6]">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <h1 className="text-[18px] font-bold text-slate-900 leading-tight tracking-tight uppercase">
                  {hospitalName}
                </h1>
                {hospitalAddress && (
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {hospitalAddress}
                  </p>
                )}
                {hospitalPhone && (
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Ph: {hospitalPhone}
                  </p>
                )}
              </div>

              {/* Dashed Line */}
              <div className="border-b border-dashed border-slate-300 my-4" />

              {/* OPD Token Header & Large Token Number */}
              <div className="text-center">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">
                  OPD TOKEN
                </p>
                <h2 className="text-3xl font-extrabold text-[#3563F6] tracking-tight mt-1.5 mb-1">
                  TOKEN NO. {tokenStr}
                </h2>
              </div>

              {/* Dashed Line */}
              <div className="border-b border-dashed border-slate-300 my-4" />

              {/* Patient & Doctor Appointment Information */}
              <div className="space-y-3 px-1">
                <div>
                  <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    Patient Name
                  </span>
                  <span className="block text-sm font-bold text-slate-900 leading-snug">
                    {patientName}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    Doctor
                  </span>
                  <span className="block text-sm font-bold text-slate-900 leading-snug">
                    {doctorName}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      Date
                    </span>
                    <span className="block text-sm font-bold text-slate-900 leading-snug">
                      {dateStr}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      Time
                    </span>
                    <span className="block text-sm font-bold text-slate-900 leading-snug">
                      {timeStr}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dashed Line */}
              <div className="border-b border-dashed border-slate-300 my-4" />
            </div>

            {/* Footer Message */}
            <div className="text-center pt-1 pb-1">
              <p className="text-[11px] text-slate-500 leading-tight">
                Please wait until your token number is called.
              </p>
              <p className="text-xs font-semibold text-slate-600 mt-2">
                Thank You
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="no-print flex items-center justify-end gap-3 px-6 py-4 bg-white border-t border-slate-200">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="text-xs font-bold px-5 py-2 cursor-pointer"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handlePrint}
            icon={Printer}
            className="text-xs font-bold px-6 py-2 bg-[#3563F6] hover:bg-blue-700 text-white cursor-pointer shadow-sm"
          >
            Print Token
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalMarkup, document.body);
};

export default OpdTokenPrintModal;
