/**
 * IPD Discharge Summary & Billing Print Generator
 * Produces clean, professional hospital-grade printable HTML for Inpatient Discharge Summaries and Final Bills.
 */

export const generateDischargeSummaryHTML = (data = {}) => {
  const {
    hospital = {},
    patient = {},
    admission = {},
    clinical = {},
    billing = null
  } = data;

  const hospitalName = hospital.name || 'VILLZONE MULTISPECIALITY HOSPITAL';
  const hospitalAddress = hospital.address || '124 Healthcare Boulevard, City Center';
  const hospitalPhone = hospital.phone || '+91 98765 43210';
  const hospitalEmail = hospital.email || 'info@villzonehospital.com';

  const patientName = patient.name || 'Patient';
  const uhid = patient.uhid || '—';
  const ipdNo = patient.ipdNo || admission.ipdNo || '—';
  const age = patient.age || '—';
  const gender = patient.gender || '—';
  const phone = patient.phone || '—';
  const bloodGroup = patient.bloodGroup || '—';

  const ward = admission.wardName || 'General Ward';
  const bed = admission.bedNumber || '—';
  const doctor = admission.doctorName || 'Dr. Vedha';
  const department = admission.department || 'In-Patient Department (IPD)';
  const admDate = admission.admissionDate ? new Date(admission.admissionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const admTime = admission.admissionTime || '—';
  const disDate = admission.dischargeDate ? new Date(admission.dischargeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const disTime = admission.dischargeTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const condition = clinical.dischargeCondition || 'Improved';
  const dischargeType = clinical.dischargeType || 'Routine Discharge';

  // Parse medicines if passed as array or newline string
  let medicinesList = [];
  if (Array.isArray(clinical.dischargeMedicines)) {
    medicinesList = clinical.dischargeMedicines;
  } else if (typeof clinical.dischargeMedicines === 'string' && clinical.dischargeMedicines.trim()) {
    const lines = clinical.dischargeMedicines.split('\n').map(l => l.trim()).filter(Boolean);
    medicinesList = lines.map(line => ({ medicineName: line, dosage: 'As prescribed', foodTiming: 'After food', duration: '—', instructions: '' }));
  }

  const hasBilling = billing && Array.isArray(billing.charges) && billing.charges.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>IPD Discharge Summary - ${patientName} (${ipdNo})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #fff;
      font-size: 11.5px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-container {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      padding: 10px 0;
    }
    
    /* Header */
    .header {
      border-bottom: 2px solid #1e3a8a;
      padding-bottom: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .hospital-title {
      font-size: 18px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .hospital-meta {
      font-size: 10px;
      color: #475569;
      margin-top: 2px;
      line-height: 1.4;
    }
    .doc-badge {
      text-align: right;
    }
    .doc-badge-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 4px 10px;
      border-radius: 6px;
      display: inline-block;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-badge-date {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 4px;
    }

    /* Section Boxes */
    .section {
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1e3a8a;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 3px;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Patient Details Grid */
    .patient-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .patient-table td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      font-size: 11px;
    }
    .label {
      color: #64748b;
      font-weight: 600;
      width: 18%;
      font-size: 10px;
      text-transform: uppercase;
    }
    .val {
      color: #0f172a;
      font-weight: 700;
      width: 32%;
    }

    /* Info Field Block */
    .info-block {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 7px 10px;
      margin-bottom: 8px;
    }
    .info-block-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 2px;
    }
    .info-block-value {
      font-size: 11.5px;
      font-weight: 600;
      color: #0f172a;
      white-space: pre-line;
    }

    /* Table styles (medicines, billing) */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 11px;
    }
    .data-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      font-size: 10px;
      text-transform: uppercase;
    }
    .data-table td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .data-table tr:nth-child(even) td {
      background: #f8fafc;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .bold {
      font-weight: 700;
    }

    /* Billing Summary Cards */
    .billing-summary-grid {
      display: flex;
      justify-content: flex-end;
      margin-top: 6px;
    }
    .billing-summary-box {
      width: 260px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      overflow: hidden;
    }
    .billing-summary-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 10px;
      font-size: 11px;
      border-bottom: 1px solid #e2e8f0;
    }
    .billing-summary-row.total {
      background: #eff6ff;
      font-weight: 800;
      color: #1e3a8a;
      font-size: 12px;
      border-bottom: none;
    }

    /* Footer / Signatures */
    .signatures {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      page-break-inside: avoid;
      padding-top: 15px;
    }
    .sig-box {
      text-align: center;
      width: 200px;
      border-top: 1px dashed #94a3b8;
      padding-top: 5px;
      font-size: 10.5px;
      color: #334155;
      font-weight: 600;
    }

    .footer-note {
      margin-top: 20px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      font-size: 9px;
      color: #64748b;
      text-align: center;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="print-container">
    <!-- Header -->
    <div class="header">
      <div>
        <div class="hospital-title">${hospitalName}</div>
        <div class="hospital-meta">
          ${hospitalAddress}<br>
          Tel: ${hospitalPhone} | Email: ${hospitalEmail}
        </div>
      </div>
      <div class="doc-badge">
        <div class="doc-badge-title">IPD Discharge Summary${hasBilling ? ' & Bill' : ''}</div>
        <div class="doc-badge-date">Printed: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>

    <!-- Patient & Admission Summary -->
    <div class="section">
      <div class="section-title">Patient & Admission Details</div>
      <table class="patient-table">
        <tr>
          <td class="label">Patient Name:</td>
          <td class="val">${patientName}</td>
          <td class="label">IPD Number:</td>
          <td class="val">${ipdNo}</td>
        </tr>
        <tr>
          <td class="label">Age / Gender:</td>
          <td class="val">${age} / ${gender}</td>
          <td class="label">UHID:</td>
          <td class="val">${uhid}</td>
        </tr>
        <tr>
          <td class="label">Ward & Bed:</td>
          <td class="val">${ward} (${bed})</td>
          <td class="label">Phone:</td>
          <td class="val">${phone}</td>
        </tr>
        <tr>
          <td class="label">Primary Doctor:</td>
          <td class="val">${doctor}</td>
          <td class="label">Department:</td>
          <td class="val">${department}</td>
        </tr>
        <tr>
          <td class="label">Admission Date:</td>
          <td class="val">${admDate} ${admTime !== '—' ? `at ${admTime}` : ''}</td>
          <td class="label">Discharge Date:</td>
          <td class="val">${disDate} at ${disTime}</td>
        </tr>
        <tr>
          <td class="label">Discharge Type:</td>
          <td class="val">${dischargeType}</td>
          <td class="label">Condition:</td>
          <td class="val">${condition}</td>
        </tr>
      </table>
    </div>

    <!-- Clinical Details -->
    <div class="section">
      <div class="section-title">Clinical Findings & Course in Hospital</div>
      
      <div class="info-block">
        <div class="info-block-label">Final Diagnosis:</div>
        <div class="info-block-value" style="color: #1e3a8a; font-weight: 800;">${clinical.finalDiagnosis || 'Acute Gastritis / Clinical observation'}</div>
      </div>

      ${clinical.treatmentSummary ? `
      <div class="info-block">
        <div class="info-block-label">Treatment Given & Clinical Progress:</div>
        <div class="info-block-value">${clinical.treatmentSummary}</div>
      </div>` : ''}

      ${clinical.dischargeInstructions ? `
      <div class="info-block">
        <div class="info-block-label">Discharge Instructions & Dietary Guidelines:</div>
        <div class="info-block-value">${clinical.dischargeInstructions}</div>
      </div>` : ''}

      ${clinical.followupAdvice || clinical.nextReviewDate ? `
      <div class="info-block">
        <div class="info-block-label">Follow-up Advice & Next Review:</div>
        <div class="info-block-value">
          ${clinical.followupAdvice ? `${clinical.followupAdvice}<br>` : ''}
          ${clinical.nextReviewDate ? `<strong>Review Date:</strong> ${new Date(clinical.nextReviewDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
        </div>
      </div>` : ''}
    </div>

    <!-- Discharge Medications -->
    ${medicinesList.length > 0 ? `
    <div class="section">
      <div class="section-title">Discharge Medications / Prescription</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 5%;">#</th>
            <th style="width: 35%;">Medicine Name</th>
            <th style="width: 15%;">Dosage</th>
            <th style="width: 15%;">Food / Timing</th>
            <th style="width: 12%;">Duration</th>
            <th style="width: 18%;">Instructions</th>
          </tr>
        </thead>
        <tbody>
          ${medicinesList.map((med, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="bold">${med.medicineName || med.name || '—'}</td>
              <td>${med.dosage || med.dose || med.frequency || '1-0-1'}</td>
              <td>${med.foodTiming || med.food || med.timing || 'After food'}</td>
              <td>${med.duration || '3 Days'}</td>
              <td>${med.instructions || med.remarks || med.notes || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- IPD Charges Breakdown & Payment (If available) -->
    ${hasBilling ? `
    <div class="section">
      <div class="section-title">IPD Charges Breakdown & Settlement Summary</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 5%;">#</th>
            <th style="width: 25%;">Category / Service</th>
            <th style="width: 35%;">Details / Description</th>
            <th style="width: 12%;" class="text-center">Qty / Days</th>
            <th style="width: 11%;" class="text-right">Rate (₹)</th>
            <th style="width: 12%;" class="text-right">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${billing.charges.map((ch, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="bold">${ch.category || 'Service'}</td>
              <td>${ch.details || ch.description || '—'}</td>
              <td class="text-center">${ch.qty || ch.duration || 1}</td>
              <td class="text-right">₹${Number(ch.rate || 0).toLocaleString('en-IN')}</td>
              <td class="text-right bold">₹${Number(ch.amount || 0).toLocaleString('en-IN')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="billing-summary-grid">
        <div class="billing-summary-box">
          <div class="billing-summary-row">
            <span>Total IPD Charges:</span>
            <span class="bold">₹${Number(billing.totalAmount || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="billing-summary-row">
            <span>Amount Received (${billing.paymentMethod || 'Cash'}):</span>
            <span class="bold" style="color: #15803d;">₹${Number(billing.amountReceived || billing.totalAmount || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="billing-summary-row total">
            <span>Balance Dues:</span>
            <span>₹${Number(billing.remainingAmount || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    </div>` : ''}

    ${billing?.notes ? `
    <div class="section">
      <div class="section-title">Remarks / Administrative Notes</div>
      <div class="info-block">
        <div class="info-block-value">${billing.notes}</div>
      </div>
    </div>` : ''}

    <!-- Signatures -->
    <div class="signatures">
      <div class="sig-box">
        Patient / Attendant Signature
      </div>
      ${hasBilling ? `
      <div class="sig-box">
        Authorized Billing Signatory
      </div>` : ''}
      <div class="sig-box">
        Treating Doctor: ${doctor}
      </div>
    </div>

    <!-- Footer Note -->
    <div class="footer-note">
      This is a computer-generated Inpatient Discharge Summary. Please bring this document on all subsequent follow-up visits.
      <br>For medical emergencies, please call the hospital round-the-clock helpline: ${hospitalPhone}.
    </div>
  </div>
</body>
</html>`;
};

/**
 * Triggers the browser print dialog for an IPD discharge summary.
 */
export const printDischargeSummary = (summaryData) => {
  const html = generateDischargeSummaryHTML(summaryData);
  const printWindow = window.open('', '_blank', 'width=950,height=950');

  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 350);
  } else {
    // Fallback using invisible iframe if popup was blocked
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (_) {}
      }, 2000);
    }, 350);
  }
};

