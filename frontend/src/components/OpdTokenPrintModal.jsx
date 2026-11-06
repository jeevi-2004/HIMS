import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Printer, User, Stethoscope, Calendar, Clock, LayoutTemplate, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Button from './Button';

const OpdTokenPrintModal = ({ isOpen, onClose, appointment, hospitalInfo }) => {
  const { user } = useAuth();
  // State for layout: default 'vertical' as requested ('vertical' | 'horizontal')
  const [layout, setLayout] = useState('vertical');
  const isHorizontal = layout === 'horizontal';

  // Inject B5 @page style into document.head while modal is open for Ctrl+P support
  useEffect(() => {
    if (!isOpen) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'opd-token-b5-page-style';
    styleEl.innerHTML = `
      @page {
        size: B5 ${isHorizontal ? 'landscape' : 'portrait'} !important;
        size: ${isHorizontal ? '250mm 176mm' : '176mm 250mm'} !important;
        margin: 0 !important;
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      const el = document.getElementById('opd-token-b5-page-style');
      if (el) el.remove();
    };
  }, [isOpen, isHorizontal]);

  // Fetch official hospital details to guarantee real data
  const { data: hospitalRecord } = useQuery({
    queryKey: ['myHospitalProfile', user?.hospitalId || user?.hospital?._id],
    queryFn: async () => {
      const res = await api.get('/admin/hospitals').catch(() => ({ data: { data: [] } }));
      const list = res.data?.data || [];
      return list[0] || null;
    },
    enabled: Boolean(isOpen && (user?.hospitalId || user?.hospital))
  });

  if (!isOpen || !appointment) return null;

  const hospital = hospitalRecord || user?.hospital || {};

  // 1. Resolve Hospital Name cleanly (no dummy duplicates)
  const hospitalName = (
    hospital?.prescriptionSettings?.hospitalName ||
    hospital?.name ||
    user?.hospital?.name ||
    user?.hospitalName ||
    hospitalInfo?.name ||
    appointment?.hospitalName ||
    'HOSPITAL'
  ).trim();

  // 2. Resolve Hospital Address cleanly
  let hospitalAddress = '';
  if (hospital?.prescriptionSettings?.clinicAddress) {
    hospitalAddress = hospital.prescriptionSettings.clinicAddress.trim();
  } else if (hospital?.address) {
    if (typeof hospital.address === 'string') {
      hospitalAddress = hospital.address.trim();
    } else if (typeof hospital.address === 'object') {
      const { street, city, state, postalCode } = hospital.address;
      hospitalAddress = [street, city, state, postalCode].filter(Boolean).join(', ');
    }
  }
  if (!hospitalAddress) {
    hospitalAddress = hospitalInfo?.address || user?.hospitalAddress || appointment?.hospitalAddress || '';
  }

  // 3. Resolve Hospital Manager / Owner Phone Number cleanly
  const hospitalPhone = (
    hospital?.ownerMobile ||
    hospital?.contactNumber ||
    hospital?.prescriptionSettings?.contactNumber ||
    hospitalInfo?.phone ||
    user?.hospital?.ownerMobile ||
    user?.hospital?.contactNumber ||
    user?.hospitalPhone ||
    appointment?.hospitalPhone ||
    ''
  ).trim();

  // 4. Resolve Token Number
  const rawToken = appointment.tokenNumber || appointment.token || appointment.queueNo || 'OP001';
  let tokenStr = String(rawToken).trim();
  if (!tokenStr.startsWith('#')) {
    tokenStr = `#${tokenStr}`;
  }

  // 5. Resolve Patient Name
  const patientName = appointment.patientId?.name || appointment.patient?.name || appointment.patientName || 'Patient';

  // 6. Resolve Doctor Name (prevent accidental "Dr. Dr." duplicate prefixes)
  const rawDoctorName = appointment.doctorId?.name || appointment.doctor?.name || appointment.doctorName || '';
  const cleanDoc = String(rawDoctorName).replace(/^(Dr\.?\s*)+/i, '').trim();
  const doctorName = cleanDoc ? `Dr. ${cleanDoc}` : 'Consulting Doctor';

  // 7. Resolve Date (e.g., "07 Nov 2026")
  const dateObj = appointment.date ? new Date(appointment.date) : new Date();
  const dateStr = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

  // 8. Resolve Time (e.g., "10:00 AM")
  let timeStr = appointment.slotTime || appointment.time || appointment.appointmentTime;
  if (!timeStr && !isNaN(dateObj.getTime())) {
    timeStr = dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
  if (!timeStr) timeStr = '10:00 AM';

  const generateB5PrintHTML = () => {
    const paperWidth = isHorizontal ? '250mm' : '176mm';
    const paperHeight = isHorizontal ? '176mm' : '250mm';
    const cardWidth = isHorizontal ? '230mm' : '156mm';
    const cardHeight = isHorizontal ? '156mm' : '230mm';
    const pageOrientation = isHorizontal ? 'landscape' : 'portrait';

    const printerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2F63F2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`;
    const userSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const stethoscopeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>`;
    const calendarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`;
    const clockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>OPD Token - ${tokenStr}</title>
          <style>
            @page {
              size: B5 ${pageOrientation};
              size: ${paperWidth} ${paperHeight};
              margin: 0;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: ${paperWidth};
              height: ${paperHeight};
              background: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .token-card {
              width: ${cardWidth};
              height: ${cardHeight};
              border: 2.5px solid #2F63F2;
              border-radius: 18px;
              padding: ${isHorizontal ? '14px 22px' : '20px 22px'};
              background: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
            }
            .hospital-header {
              display: flex;
              align-items: ${isHorizontal ? 'center' : 'flex-start'};
              gap: 12px;
            }
            .icon-box {
              width: 40px;
              height: 40px;
              border-radius: 10px;
              background: #EFF6FF;
              border: 1px solid #DBEAFE;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .hospital-title {
              font-size: ${isHorizontal ? '16px' : '17px'};
              font-weight: 900;
              color: #1E293B;
              text-transform: uppercase;
              line-height: 1.2;
              margin: 0;
            }
            .hospital-sub {
              font-size: 11px;
              font-weight: 500;
              color: #64748B;
              line-height: 1.3;
              margin: 2px 0 0 0;
            }
            .dashed-line {
              border-bottom: 1.5px dashed #94A3B8;
              margin: ${isHorizontal ? '10px 0' : '14px 0'};
              width: 100%;
            }
            .token-center {
              text-align: center;
            }
            .token-lbl {
              font-size: ${isHorizontal ? '11px' : '12px'};
              font-weight: 700;
              color: #1E293B;
              letter-spacing: 0.15em;
              text-transform: uppercase;
              margin: 0;
            }
            .token-num {
              font-size: ${isHorizontal ? '30px' : '36px'};
              font-weight: 900;
              color: #2F63F2;
              letter-spacing: -0.02em;
              margin: 3px 0 0 0;
              line-height: 1;
            }
            .info-stack {
              display: flex;
              flex-direction: column;
              gap: 12px;
              padding: 4px 6px;
            }
            .info-row {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .circle-icon {
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: #2F63F2;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .field-label {
              font-size: 10px;
              font-weight: 700;
              color: #64748B;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              display: block;
              line-height: 1;
            }
            .field-value {
              font-size: 14px;
              font-weight: 800;
              color: #0F172A;
              display: block;
              margin-top: 3px;
              line-height: 1.2;
            }
            .info-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              padding: 4px 0;
            }
            .grid-col {
              text-align: center;
              padding: 0 6px;
              border-right: 1px solid #E2E8F0;
            }
            .grid-col:last-child {
              border-right: none;
            }
            .grid-col .circle-icon {
              margin: 0 auto 6px auto;
            }
            .footer-box {
              background: #EBF3FF;
              border: 1px solid #DBEAFE;
              border-radius: 12px;
              padding: ${isHorizontal ? '8px 12px' : '10px 14px'};
              text-align: center;
              margin-top: ${isHorizontal ? '10px' : '14px'};
            }
            .footer-sub {
              font-size: 11px;
              font-weight: 500;
              color: #475569;
              margin: 0;
              line-height: 1.2;
            }
            .footer-bold {
              font-size: 15px;
              font-weight: 900;
              color: #2F63F2;
              margin: 2px 0 0 0;
              line-height: 1.2;
            }
          </style>
        </head>
        <body>
          <div class="token-card">
            <div>
              <div class="hospital-header">
                <div class="icon-box">${printerSvg}</div>
                <div>
                  <h1 class="hospital-title">${hospitalName}</h1>
                  ${isHorizontal ? `
                    <p class="hospital-sub">
                      ${hospitalAddress}${hospitalPhone ? ` | Ph: ${hospitalPhone}` : ''}
                    </p>
                  ` : `
                    ${hospitalAddress ? `<p class="hospital-sub">${hospitalAddress}</p>` : ''}
                    ${hospitalPhone ? `<p class="hospital-sub">Ph: ${hospitalPhone}</p>` : ''}
                  `}
                </div>
              </div>

              <div class="dashed-line"></div>

              <div class="token-center">
                <p class="token-lbl">OPD TOKEN</p>
                <h2 class="token-num">TOKEN NO. ${tokenStr}</h2>
              </div>

              <div class="dashed-line"></div>

              ${!isHorizontal ? `
                <div class="info-stack">
                  <div class="info-row">
                    <div class="circle-icon">${userSvg}</div>
                    <div>
                      <span class="field-label">PATIENT NAME</span>
                      <span class="field-value">${patientName}</span>
                    </div>
                  </div>
                  <div class="info-row">
                    <div class="circle-icon">${stethoscopeSvg}</div>
                    <div>
                      <span class="field-label">DOCTOR</span>
                      <span class="field-value">${doctorName}</span>
                    </div>
                  </div>
                  <div class="info-row">
                    <div class="circle-icon">${calendarSvg}</div>
                    <div>
                      <span class="field-label">DATE</span>
                      <span class="field-value">${dateStr}</span>
                    </div>
                  </div>
                  <div class="info-row">
                    <div class="circle-icon">${clockSvg}</div>
                    <div>
                      <span class="field-label">TIME</span>
                      <span class="field-value">${timeStr}</span>
                    </div>
                  </div>
                </div>
              ` : `
                <div class="info-grid">
                  <div class="grid-col">
                    <div class="circle-icon">${userSvg}</div>
                    <span class="field-label">PATIENT NAME</span>
                    <span class="field-value">${patientName}</span>
                  </div>
                  <div class="grid-col">
                    <div class="circle-icon">${stethoscopeSvg}</div>
                    <span class="field-label">DOCTOR</span>
                    <span class="field-value">${doctorName}</span>
                  </div>
                  <div class="grid-col">
                    <div class="circle-icon">${calendarSvg}</div>
                    <span class="field-label">DATE</span>
                    <span class="field-value">${dateStr}</span>
                  </div>
                  <div class="grid-col">
                    <div class="circle-icon">${clockSvg}</div>
                    <span class="field-label">TIME</span>
                    <span class="field-value">${timeStr}</span>
                  </div>
                </div>
              `}
            </div>

            <div class="footer-box">
              <p class="footer-sub">Please wait until your token number is called.</p>
              <p class="footer-bold">Thank You</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    // Print directly using an isolated iframe for B5 sheet size precision
    const existingIframe = document.getElementById('opd-token-print-iframe');
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'opd-token-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const htmlContent = generateB5PrintHTML();
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow.print();
      } catch (err) {
        window.print();
      }
    }, 250);
  };

  const modalMarkup = (
    <div id="opd-token-print-portal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
      {/* Print-specific style override for ISO B5 Paper (176 x 250 mm) */}
      <style>{`
        @media print {
          body > *:not(#opd-token-print-portal) {
            display: none !important;
          }
          .no-print {
            display: none !important;
          }
          
          #opd-token-print-portal {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            z-index: 999999 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
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
            align-items: center !important;
          }

          #opd-token-print-slip {
            display: flex !important;
            visibility: visible !important;
            box-shadow: none !important;
            border: 2px solid #2F63F2 !important;
            border-radius: 16px !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: auto !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          .b5-slip-vertical {
            width: 156mm !important;
            height: 230mm !important;
            max-height: 230mm !important;
            padding: 8mm 10mm !important;
            box-sizing: border-box !important;
          }

          .b5-slip-horizontal {
            width: 230mm !important;
            height: 156mm !important;
            max-height: 156mm !important;
            padding: 6mm 10mm !important;
            box-sizing: border-box !important;
          }

          @page {
            size: B5 ${isHorizontal ? 'landscape' : 'portrait'} !important;
            size: ${isHorizontal ? '250mm 176mm' : '176mm 250mm'} !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Modal Container (adaptive width based on selected vertical / horizontal form) */}
      <div className={`opd-token-modal-card bg-slate-100 rounded-2xl shadow-2xl w-full transition-all duration-300 overflow-hidden border border-slate-200 flex flex-col max-h-[92vh] ${
        isHorizontal ? 'max-w-[760px]' : 'max-w-[480px]'
      }`}>
        {/* Modal Header */}
        <div className="no-print flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#2F63F2]" />
            <h2 className="text-base font-bold text-slate-900">
              Print OPD Token <span className="text-xs font-semibold text-slate-400">({isHorizontal ? 'Horizontal' : 'Vertical'})</span>
            </h2>
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
        <div className="opd-token-paper-wrapper p-4 sm:p-6 overflow-y-auto flex flex-col items-center bg-slate-100 flex-1 min-h-0">
          {/* Sheet Format Indicator Pill (Reference Image Styled) */}
          <div className="no-print mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2F63F2] text-white text-[11px] font-bold shadow-xs">
            {isHorizontal ? 'Horizontal – B5 Sheet (250 × 176 mm)' : 'Vertical – B5 Sheet (176 × 250 mm)'}
          </div>

          {/* ---------------------------------------------------- */}
          {/* VERTICAL FORM (DEFAULT)                              */}
          {/* ---------------------------------------------------- */}
          {!isHorizontal ? (
            <div
              id="opd-token-print-slip"
              className="b5-slip-vertical w-[340px] sm:w-[380px] bg-white rounded-2xl border-2 border-[#2F63F2] shadow-xl p-5 sm:p-6 flex flex-col justify-between text-left font-sans transition-all shrink-0 box-border"
            >
              <div>
                {/* Hospital Header */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2F63F2] shrink-0">
                    <Printer className="w-6 h-6 text-[#2F63F2]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-base sm:text-lg font-black text-[#1E293B] tracking-tight uppercase leading-snug">
                      {hospitalName}
                    </h1>
                    {hospitalAddress && (
                      <p className="text-[11px] sm:text-xs text-slate-500 font-medium leading-tight mt-0.5">
                        {hospitalAddress}
                      </p>
                    )}
                    {hospitalPhone && (
                      <p className="text-[11px] sm:text-xs text-slate-500 font-medium leading-tight mt-0.5">
                        Ph: {hospitalPhone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Dotted Divider */}
                <div className="border-b border-dashed border-[#94A3B8]/60 my-3 sm:my-3.5" />

                {/* OPD Token Header & Large Token Number */}
                <div className="text-center">
                  <p className="text-xs sm:text-sm font-bold text-[#1E293B] tracking-widest uppercase">
                    OPD TOKEN
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-black text-[#2F63F2] tracking-tight mt-1">
                    TOKEN NO. {tokenStr}
                  </h2>
                </div>

                {/* Dotted Divider */}
                <div className="border-b border-dashed border-[#94A3B8]/60 my-3 sm:my-3.5" />

                {/* Patient & Doctor Appointment Information (Vertical Stack) */}
                <div className="space-y-3 px-1 py-1">
                  {/* Patient Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white shrink-0 shadow-xs">
                      <User className="w-4 h-4 fill-white text-white" />
                    </div>
                    <div>
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        PATIENT NAME
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-[#0F172A] block leading-tight">
                        {patientName}
                      </span>
                    </div>
                  </div>

                  {/* Doctor */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white shrink-0 shadow-xs">
                      <Stethoscope className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        DOCTOR
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-[#0F172A] block leading-tight">
                        {doctorName}
                      </span>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white shrink-0 shadow-xs">
                      <Calendar className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        DATE
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-[#0F172A] block leading-tight">
                        {dateStr}
                      </span>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white shrink-0 shadow-xs">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        TIME
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-[#0F172A] block leading-tight">
                        {timeStr}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Message */}
              <div className="bg-[#EBF3FF] border border-blue-100 rounded-xl py-2.5 sm:py-3 px-4 text-center mt-4">
                <p className="text-[11px] sm:text-xs font-medium text-slate-600 leading-tight">
                  Please wait until your token number is called.
                </p>
                <p className="text-sm sm:text-base font-black text-[#2F63F2] mt-0.5">
                  Thank You
                </p>
              </div>
            </div>
          ) : (
            /* ---------------------------------------------------- */
            /* HORIZONTAL FORM (SWITCHED)                           */
            /* ---------------------------------------------------- */
            <div
              id="opd-token-print-slip"
              className="b5-slip-horizontal w-[540px] sm:w-[680px] bg-white rounded-2xl border-2 border-[#2F63F2] shadow-xl p-4 sm:p-5 flex flex-col justify-between text-left font-sans transition-all shrink-0 box-border"
            >
              <div>
                {/* Hospital Header (Horizontal Single Line Format) */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2F63F2] shrink-0">
                    <Printer className="w-5 h-5 sm:w-6 sm:h-6 text-[#2F63F2]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-base sm:text-lg font-black text-[#1E293B] tracking-tight uppercase leading-snug truncate">
                      {hospitalName}
                    </h1>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium leading-tight mt-0.5 truncate">
                      {hospitalAddress}
                      {hospitalPhone ? ` | Ph: ${hospitalPhone}` : ''}
                    </p>
                  </div>
                </div>

                {/* Dotted Divider */}
                <div className="border-b border-dashed border-[#94A3B8]/60 my-2.5 sm:my-3" />

                {/* OPD Token Header & Large Token Number */}
                <div className="text-center">
                  <p className="text-[11px] sm:text-xs font-bold text-[#1E293B] tracking-widest uppercase">
                    OPD TOKEN
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-black text-[#2F63F2] tracking-tight mt-0.5">
                    TOKEN NO. {tokenStr}
                  </h2>
                </div>

                {/* Dotted Divider */}
                <div className="border-b border-dashed border-[#94A3B8]/60 my-2.5 sm:my-3" />

                {/* Patient & Doctor Appointment Information (4 Columns Horizontal Format) */}
                <div className="grid grid-cols-4 divide-x divide-slate-200/80 px-1 py-0.5">
                  {/* Col 1: Patient Name */}
                  <div className="text-center px-1.5 sm:px-2">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white mx-auto mb-1 shadow-xs">
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white text-white" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      PATIENT NAME
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-[#0F172A] block leading-tight truncate mt-0.5">
                      {patientName}
                    </span>
                  </div>

                  {/* Col 2: Doctor */}
                  <div className="text-center px-1.5 sm:px-2">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white mx-auto mb-1 shadow-xs">
                      <Stethoscope className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      DOCTOR
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-[#0F172A] block leading-tight truncate mt-0.5">
                      {doctorName}
                    </span>
                  </div>

                  {/* Col 3: Date */}
                  <div className="text-center px-1.5 sm:px-2">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white mx-auto mb-1 shadow-xs">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      DATE
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-[#0F172A] block leading-tight truncate mt-0.5">
                      {dateStr}
                    </span>
                  </div>

                  {/* Col 4: Time */}
                  <div className="text-center px-1.5 sm:px-2">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#2F63F2] flex items-center justify-center text-white mx-auto mb-1 shadow-xs">
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      TIME
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-[#0F172A] block leading-tight truncate mt-0.5">
                      {timeStr}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Message (Strictly contained inside the blue border with padding) */}
              <div className="bg-[#EBF3FF] border border-blue-100 rounded-xl py-2 sm:py-2.5 px-4 text-center mt-3 sm:mt-4">
                <p className="text-[11px] sm:text-xs font-medium text-slate-600 leading-tight">
                  Please wait until your token number is called.
                </p>
                <p className="text-sm sm:text-base font-black text-[#2F63F2] mt-0.5">
                  Thank You
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer (Switching button on bottom left side & Actions on right side) */}
        <div className="no-print flex items-center justify-between gap-3 px-6 py-4 bg-white border-t border-slate-200 flex-wrap">
          {/* Bottom Left: Switching button between Vertical & Horizontal forms */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setLayout('vertical')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                layout === 'vertical'
                  ? 'bg-[#2F63F2] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Vertical</span>
            </button>
            <button
              type="button"
              onClick={() => setLayout('horizontal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                layout === 'horizontal'
                  ? 'bg-[#2F63F2] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span>Horizontal</span>
            </button>
          </div>

          {/* Bottom Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="text-xs font-bold px-4 py-2 cursor-pointer"
            >
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handlePrint}
              icon={Printer}
              className="text-xs font-bold px-5 py-2 bg-[#2F63F2] hover:bg-blue-700 text-white cursor-pointer shadow-sm"
            >
              Print Token
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalMarkup, document.body);
};

export default OpdTokenPrintModal;
