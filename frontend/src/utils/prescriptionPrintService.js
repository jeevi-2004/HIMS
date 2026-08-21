export const generatePrescriptionPrintHTML = (consultation = {}, doctor = {}, templateConfig = {}) => {
  const template = templateConfig.template || templateConfig.printConfiguration || {};
  const mode = template.mode || templateConfig.printMode || templateConfig.mode || 'STANDARD';

  const rawPatient = consultation.patientId || consultation.patient || {};
  const patient = typeof rawPatient === 'object' ? rawPatient : {};
  const rxList = consultation.prescription || consultation.prescriptions || [];
  const diagnosisList = consultation.diagnosis || [];
  const adviceList = consultation.advice || [];
  const investigationList = consultation.investigations || [];
  const doctorProfile = doctor.doctorProfile || {};

  const paperSize = template.paperSize || 'A4';
  const orientation = template.orientation || 'Portrait';
  const calibration = template.calibration || { topOffset: 0, leftOffset: 0, scale: 100 };

  const isSample = Boolean(templateConfig.isSample || template.isSample || consultation.isSample);
  const isPlaceholder = Boolean(templateConfig.isPlaceholder || template.isPlaceholder || consultation.isPlaceholder);
  
  const rawHospital = consultation.hospital || doctor.hospitalId || {};
  const hospital = typeof rawHospital === 'object' ? rawHospital : {};
  const std = template.standardConfig || template || {};
  const hospitalNameVal = hospital.name || (typeof hospital.address === 'string' ? hospital.address : '') ? hospital.name : (std.hospitalName || std.headerTitle || '');

  if (mode === 'PRE_PRINTED') {
    const backgroundFile = template.backgroundFile || '';
    const fieldMappings = template.fieldMappings || [];
    const medTable = template.medicineTableConfig || {};

    const dataValueMap = {
      hospitalName: isPlaceholder ? '{{Hospital Name}}' : (hospital.name || hospitalNameVal || (isSample ? 'Sample Hospital' : 'VillZone HIMS Hospital')),
      hospitalLogo: hospital.logo || std.hospitalLogo || '',
      hospitalAddress: isPlaceholder ? '{{Hospital Address}}' : (typeof hospital.address === 'string' ? hospital.address : (hospital.address?.street ? `${hospital.address.street}, ${hospital.address.city || ''}` : (std.clinicAddress || (isSample ? '124 Healthcare Boulevard, Medical District' : '')))),
      hospitalRegNo: isPlaceholder ? '{{Registration No.}}' : (hospital.registrationNumber || std.registrationNumber || (isSample ? 'REG-HOSP-2026/098' : '')),
      hospitalPhone: isPlaceholder ? '{{Hospital Phone}}' : (hospital.phone || hospital.contactNumber || hospital.mobileNumber || std.contactNumber || (isSample ? '+91 98765 43210' : '')),
      hospitalEmail: isPlaceholder ? '{{Hospital Email}}' : (hospital.email || std.email || (isSample ? 'contact@samplehospital.com' : '')),
      branchName: isPlaceholder ? '{{Branch Name}}' : (consultation.branch?.name || (isSample ? 'City Center Main Branch' : '')),
      branchAddress: isPlaceholder ? '{{Branch Address}}' : (consultation.branch?.address || (isSample ? 'Plot 45, North Wing, City Center' : '')),
      branchPhone: isPlaceholder ? '{{Branch Phone}}' : (consultation.branch?.phone || (isSample ? '+91 98765 43211' : '')),
      patientName: isPlaceholder ? '{{Patient Name}}' : (patient.name || (isSample ? 'Sample Patient Name' : 'Patient Name Not Available')),
      uhid: isPlaceholder ? '{{UHID}}' : (patient.uhid || patient.patientId || (isSample ? 'UHID000001' : 'N/A')),
      patientId: isPlaceholder ? '{{UHID}}' : (patient.uhid || patient.patientId || (isSample ? 'UHID000001' : 'N/A')),
      age: isPlaceholder ? '{{Patient Age}}' : (patient.age ? `${patient.age} Yrs` : (isSample ? '35 Yrs' : '')),
      gender: isPlaceholder ? '{{Patient Gender}}' : (patient.gender || (isSample ? 'Female' : '')),
      mobile: isPlaceholder ? '{{Mobile Number}}' : (patient.contactNumber || patient.mobileNumber || patient.mobile || (isSample ? '+91 98765 43210' : '')),
      bloodGroup: isPlaceholder ? '{{Blood Group}}' : (patient.bloodGroup || (isSample ? 'O+ Positive' : '')),
      place: isPlaceholder ? '{{Place / Village}}' : (patient.village || patient.place || patient.address?.street || (isSample ? 'City Center' : '')),
      date: isPlaceholder ? '{{Consultation Date}}' : (consultation.date ? (isNaN(new Date(consultation.date).getTime()) ? consultation.date : new Date(consultation.date).toLocaleDateString('en-GB')) : new Date().toLocaleDateString('en-GB')),
      token: isPlaceholder ? '{{Token Number}}' : (consultation.tokenNo || consultation.tokenNumber || (isSample ? 'OP-01' : 'N/A')),
      visitType: isPlaceholder ? '{{Visit Type}}' : (consultation.visitType || consultation.consultationType || 'General OPD'),
      appointmentTime: isPlaceholder ? '{{Appointment Time}}' : (consultation.appointmentTime || consultation.time || '10:30 AM'),
      chiefComplaint: isPlaceholder ? '{{Chief Complaint}}' : (consultation.chiefComplaint || (isSample ? 'Fever, Cough, Bodyache for 2 days' : '')),
      diagnosis: isPlaceholder ? '{{Diagnosis}}' : (Array.isArray(diagnosisList) && diagnosisList.length > 0 ? diagnosisList.join(', ') : (typeof diagnosisList === 'string' && diagnosisList ? diagnosisList : (isSample ? 'Viral Upper Respiratory Infection' : ''))),
      clinicalNotes: isPlaceholder ? '{{Clinical Notes}}' : (consultation.clinicalNotes || (isSample ? 'Mild throat congestion observed upon examination.' : '')),
      allergies: isPlaceholder ? '{{Known Allergies}}' : (consultation.allergies || (isSample ? 'No known drug allergies' : 'None')),
      advice: isPlaceholder ? '{{Advice & Guidelines}}' : (Array.isArray(adviceList) && adviceList.length > 0 ? adviceList.map(a => typeof a === 'object' ? a.name : a).join(', ') : (typeof adviceList === 'string' && adviceList ? adviceList : (isSample ? 'Drink plenty of warm fluids, Bed rest for 3 days' : ''))),
      followupDate: isPlaceholder ? '{{Next Follow-up Date}}' : (consultation.followupDate || consultation.followUpDate ? (isNaN(new Date(consultation.followupDate || consultation.followUpDate).getTime()) ? (consultation.followupDate || consultation.followUpDate) : new Date(consultation.followupDate || consultation.followUpDate).toLocaleDateString('en-GB')) : (isSample ? new Date(Date.now() + 5 * 86400000).toLocaleDateString('en-GB') : '')),
      doctorName: isPlaceholder ? '{{Doctor Name}}' : (doctor.name ? (doctor.name.startsWith('Dr.') ? doctor.name : `Dr. ${doctor.name}`) : (isSample ? 'Dr. Sample Physician' : 'Doctor Name Not Available')),
      qualification: isPlaceholder ? '{{Doctor Qualification}}' : (doctorProfile.qualification || (isSample ? 'MBBS, MD (General Medicine)' : '')),
      regNo: isPlaceholder ? '{{Registration No.}}' : (doctorProfile.registrationNumber || (isSample ? 'REG-TNMC/2026/45879' : '')),
      department: isPlaceholder ? '{{Doctor Department}}' : (doctorProfile.department || doctorProfile.specialization || (isSample ? 'Internal Medicine' : '')),
      doctorSignature: isPlaceholder 
        ? '[Doctor Signature]' 
        : (doctorProfile.signatureUrl 
          ? `<img src="${doctorProfile.signatureUrl}" style="height:36px; object-fit:contain;" />` 
          : (doctor.name ? `Dr. ${doctor.name}` : (isSample ? 'Dr. Sample Physician' : '')))
    };

    const renderedFieldsHTML = fieldMappings
      .filter(f => f.visible !== false)
      .map(f => {
        const val = dataValueMap[f.fieldKey] || f.fieldName || '';
        return `
          <div style="
            position: absolute;
            left: ${f.x || 20}mm;
            top: ${f.y || 20}mm;
            width: ${f.width ? f.width + 'mm' : 'auto'};
            font-family: ${f.fontFamily || 'Segoe UI'}, sans-serif;
            font-size: ${f.fontSize || 12}pt;
            font-weight: ${f.fontWeight || 'normal'};
            font-style: ${f.fontStyle || 'normal'};
            text-decoration: ${f.textDecoration || 'none'};
            text-align: ${f.alignment || 'left'};
            color: ${f.color || '#0f172a'};
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            z-index: 10;
          ">
            ${val}
          </div>
        `;
      }).join('');

    const cols = medTable.columns || {
      medicineName: { visible: true, label: 'Medicine Name', width: 35 },
      dosage: { visible: true, label: 'Dosage', width: 15 },
      frequency: { visible: true, label: 'Frequency', width: 15 },
      duration: { visible: true, label: 'Duration', width: 15 },
      foodTiming: { visible: true, label: 'Food Timing', width: 20 }
    };

    const sampleRxList = rxList.length > 0 ? rxList : (
      isPlaceholder ? [
        { medicineName: '{{Medicine Name}}', dosage: '{{Dosage}}', frequency: '{{Frequency}}', duration: '{{Duration}}', food: '{{Food Timing}}', instructions: '{{Instructions}}' }
      ] : (isSample ? [
        { medicineName: 'Sample Medication 500mg', dosage: '500mg', frequency: '1-0-1', duration: '5 Days', food: 'After Food', instructions: 'Take with warm water' },
        { medicineName: 'Sample Medication 10mg', dosage: '10mg', frequency: '0-0-1', duration: '5 Days', food: 'After Food', instructions: 'At bedtime' }
      ] : [])
    );

    const medicineTableHTML = `
      <div style="
        position: absolute;
        left: ${medTable.x || 20}mm;
        top: ${medTable.y || 120}mm;
        width: ${medTable.width || 170}mm;
        font-family: 'Segoe UI', sans-serif;
        font-size: ${medTable.fontSize || 11}pt;
        z-index: 10;
      ">
        <table style="width:100%; border-collapse:collapse; text-align:left;">
          ${medTable.showHeader !== false ? `
            <thead>
              <tr style="${medTable.showLines !== false ? 'border-bottom:1.5px solid #0f172a;' : ''}">
                ${cols.medicineName?.visible !== false ? `<th style="padding:4px 6px; width:${cols.medicineName?.width || 35}%;">Medicine</th>` : ''}
                ${cols.dosage?.visible ? `<th style="padding:4px 6px; width:${cols.dosage?.width || 15}%;">Dosage</th>` : ''}
                ${cols.frequency?.visible !== false ? `<th style="padding:4px 6px; width:${cols.frequency?.width || 15}%;">Frequency</th>` : ''}
                ${cols.duration?.visible !== false ? `<th style="padding:4px 6px; width:${cols.duration?.width || 15}%;">Duration</th>` : ''}
                ${cols.foodTiming?.visible !== false ? `<th style="padding:4px 6px; width:${cols.foodTiming?.width || 20}%;">Food</th>` : ''}
                ${cols.instructions?.visible ? `<th style="padding:4px 6px; width:${cols.instructions?.width || 20}%;">Instructions</th>` : ''}
              </tr>
            </thead>
          ` : ''}
          <tbody>
            ${sampleRxList.slice(0, medTable.maxRows || 10).map(med => `
              <tr style="${medTable.showLines !== false ? 'border-bottom:1px solid #e2e8f0;' : ''} height:${medTable.rowHeight || 24}px;">
                ${cols.medicineName?.visible !== false ? `<td style="padding:4px 6px; font-weight:700;">${med.medicineName || med.name}</td>` : ''}
                ${cols.dosage?.visible ? `<td style="padding:4px 6px;">${med.dosage || '-'}</td>` : ''}
                ${cols.frequency?.visible !== false ? `<td style="padding:4px 6px;">${med.frequency || med.dosage || '-'}</td>` : ''}
                ${cols.duration?.visible !== false ? `<td style="padding:4px 6px;">${med.duration || '-'}</td>` : ''}
                ${cols.foodTiming?.visible !== false ? `<td style="padding:4px 6px;">${med.food || med.instructions || 'After Food'}</td>` : ''}
                ${cols.instructions?.visible ? `<td style="padding:4px 6px;">${med.instructions || '-'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const isPdf = backgroundFile && (backgroundFile.startsWith('data:application/pdf') || template.backgroundFileType?.includes('pdf') || backgroundFile.endsWith('.pdf'));

    const backgroundHTML = backgroundFile 
      ? (isPdf 
        ? `<object data="${backgroundFile}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="bg-image" style="width:100%; height:100%; border:none;"></object>`
        : `<img src="${backgroundFile}" class="bg-image" />`)
      : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Prescription Print</title>
          <style>
            @page { size: ${paperSize} ${orientation.toLowerCase()}; margin: 0; }
            body { margin: 0; padding: 0; position: relative; width: 210mm; height: 297mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bg-image { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 1; pointer-events: none; border: none; }
            @media print {
              .bg-image { display: block !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${backgroundHTML}
          ${renderedFieldsHTML}
          ${medTable.visible !== false ? medicineTableHTML : ''}
        </body>
      </html>
    `;
  }

  const resolvedHospitalName = isPlaceholder ? '{{Hospital Name}}' : (hospital.name || hospitalNameVal || std.hospitalName || std.headerTitle || (isSample ? 'Sample Hospital' : 'VillZone Multispeciality Hospital'));
  const resolvedAddress = isPlaceholder ? '{{Hospital Address}}' : (typeof hospital.address === 'string' ? hospital.address : (hospital.address?.street ? `${hospital.address.street}, ${hospital.address.city || ''}` : (std.clinicAddress || (isSample ? '124 Healthcare Boulevard, Medical District' : 'Main Hospital Road'))));
  const resolvedRegNo = isPlaceholder ? '{{Registration No.}}' : (hospital.registrationNumber || std.registrationNumber || (isSample ? 'REG-SAMPLE-001' : ''));
  const resolvedPhone = isPlaceholder ? '{{Hospital Phone}}' : (hospital.phone || hospital.contactNumber || hospital.mobileNumber || std.contactNumber || (isSample ? '+91 98765 43210' : ''));
  const resolvedEmail = isPlaceholder ? '{{Hospital Email}}' : (hospital.email || std.email || (isSample ? 'contact@samplehospital.com' : ''));

  const config = {
    hospitalLogo: hospital.logo || std.hospitalLogo || '',
    hospitalName: resolvedHospitalName,
    registrationNumber: resolvedRegNo,
    clinicAddress: resolvedAddress,
    contactNumber: resolvedPhone,
    email: resolvedEmail,
    website: std.website || '',
    headerTitle: resolvedHospitalName,
    headerSubtitle: std.headerSubtitle || 'Excellence in Enterprise Healthcare',
    headerAlignment: std.headerAlignment || 'Left',
    footerText: std.footerText || 'Thank you for choosing our hospital. Please follow doctor instructions.',
    footerAlignment: std.footerAlignment || 'Center',
    watermarkEnabled: std.watermarkEnabled !== false,
    watermarkText: std.watermarkText || 'VILLZONE HIMS',
    watermarkOpacity: std.watermarkOpacity || '0.15',
    paperSize: template.paperSize || std.paperSize || 'A4',
    orientation: template.orientation || std.orientation || 'Portrait',
    margins: template.margins || std.margins || 'Medium',
    sections: {
      patientInfo: std.sections?.patientInfo !== false,
      doctorInfo: std.sections?.doctorInfo !== false,
      diagnosis: std.sections?.diagnosis !== false,
      medicines: std.sections?.medicines !== false,
      investigations: std.sections?.investigations !== false,
      advice: std.sections?.advice !== false,
      followUp: std.sections?.followUp !== false,
      notes: std.sections?.notes !== false,
      vitals: std.sections?.vitals !== false,
      hospitalHeader: std.sections?.hospitalHeader !== false,
      hospitalFooter: std.sections?.hospitalFooter !== false
    }
  };

  const marginMap = { None: '0mm', Small: '8mm', Medium: '15mm', Large: '25mm' };
  const marginVal = marginMap[config.margins] || '15mm';

  const displayPatientName = isPlaceholder ? '{{Patient Name}}' : (patient.name || (isSample ? 'Sample Patient' : 'Patient Name Not Available'));
  const displayUHID = isPlaceholder ? '{{UHID}}' : (patient.uhid || patient.patientId || (isSample ? 'SAMPLE-001' : 'N/A'));
  const displayDoctorName = isPlaceholder ? '{{Doctor Name}}' : (doctor.name ? (doctor.name.startsWith('Dr.') ? doctor.name : `Dr. ${doctor.name}`) : (isSample ? 'Dr. Sample Doctor' : 'Doctor Name Not Available'));
  const displayQualification = isPlaceholder ? '{{Doctor Qualification}}' : (doctorProfile.qualification || (isSample ? 'MBBS, MD' : ''));

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Prescription — ${displayPatientName}</title>
        <style>
          @page { size: ${config.paperSize} ${config.orientation.toLowerCase()}; margin: ${marginVal}; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; position: relative; background: #ffffff; }
          .watermark { position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 56px; font-weight: 900; color: rgba(148, 163, 184, ${config.watermarkOpacity}); pointer-events: none; text-transform: uppercase; z-index: -1; white-space: nowrap; }
          .header-container { border-bottom: 2px solid #2f63f2; padding-bottom: 12px; margin-bottom: 16px; text-align: ${config.headerAlignment.toLowerCase()}; }
          .hospital-title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
          .hospital-subtitle { font-size: 12px; font-weight: 600; color: #2f63f2; margin-top: 2px; }
          .hospital-meta { font-size: 10px; color: #64748b; margin-top: 4px; }
          .patient-doctor-bar { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; }
          .info-group { margin-bottom: 4px; }
          .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .value { font-size: 12px; font-weight: 700; color: #0f172a; }
          .section { margin-bottom: 16px; }
          .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #2f63f2; margin-bottom: 6px; letter-spacing: 0.5px; }
          .rx-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          .rx-table th { background: #f1f5f9; padding: 8px; text-align: left; font-size: 11px; font-weight: 700; color: #334155; border-bottom: 2px solid #cbd5e1; }
          .rx-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 600; color: #0f172a; }
          .footer-container { border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 24px; text-align: ${config.footerAlignment.toLowerCase()}; font-size: 10px; color: #64748b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${config.watermarkEnabled ? `<div class="watermark">${config.watermarkText}</div>` : ''}
        ${config.sections.hospitalHeader ? `
          <div class="header-container">
            <h1 class="hospital-title">${config.headerTitle}</h1>
            <div class="hospital-subtitle">${config.headerSubtitle}</div>
            <div class="hospital-meta">Reg No: ${config.registrationNumber} | ${config.clinicAddress} | Ph: ${config.contactNumber}</div>
          </div>
        ` : ''}
        <div class="patient-doctor-bar">
          ${config.sections.patientInfo ? `
            <div>
              <div class="info-group">
                <span class="label">Patient Name:</span>
                <span class="value">${displayPatientName}</span>
                <span style="font-size:11px; color:#64748b; margin-left:8px;">(${patient.age || 'N/A'} Yrs / ${patient.gender || 'N/A'})</span>
              </div>
              <div class="info-group">
                <span class="label">UHID:</span>
                <span class="value" style="color:#2f63f2;">${displayUHID}</span>
                <span class="label" style="margin-left:12px;">Date:</span>
                <span class="value">${consultation.date ? new Date(consultation.date).toLocaleDateString() : new Date().toLocaleDateString()}</span>
              </div>
            </div>
          ` : '<div></div>'}
          ${config.sections.doctorInfo ? `
            <div style="text-align:right;">
              <div class="info-group">
                <span class="label">Doctor:</span>
                <span class="value">${displayDoctorName}</span>
              </div>
              <div class="info-group">
                <span class="value" style="font-size:11px; font-weight:600; color:#475569;">${displayQualification}</span>
              </div>
            </div>
          ` : ''}
        </div>
        ${config.sections.diagnosis && diagnosisList.length > 0 ? `
          <div class="section">
            <div class="section-title">Clinical Diagnosis</div>
            <div style="font-size:13px; font-weight:700; color:#0f172a;">${Array.isArray(diagnosisList) ? diagnosisList.join(', ') : diagnosisList}</div>
          </div>
        ` : ''}
        ${config.sections.medicines && rxList.length > 0 ? `
          <div class="section">
            <div class="section-title">Rx — Prescribed Medications</div>
            <table class="rx-table">
              <thead>
                <tr>
                  <th style="width:40%;">Medicine Name</th>
                  <th style="width:20%;">Dosage / Frequency</th>
                  <th style="width:20%;">Duration</th>
                  <th style="width:20%;">Food Timing</th>
                </tr>
              </thead>
              <tbody>
                ${rxList.map(m => `
                  <tr>
                    <td style="font-weight:700;">${m.medicineName || m.name || 'Medication'}</td>
                    <td>${m.dosage || m.frequency || '-'}</td>
                    <td>${m.duration || '-'}</td>
                    <td>${m.food || m.foodTiming || m.instructions || 'After Food'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </body>
    </html>
  `;
};

export const generateCalibrationHTML = (paperSize = 'A4', orientation = 'Portrait') => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>VillZone HIMS — Print Calibration Grid</title>
        <style>
          @page { size: ${paperSize} ${orientation.toLowerCase()}; margin: 0; }
          body { margin: 0; padding: 0; width: 100vw; height: 100vh; font-family: monospace; position: relative; background: #ffffff; }
          .grid-line-x { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #cbd5e1; font-size: 9px; color: #64748b; padding-left: 2px; }
          .grid-line-y { position: absolute; left: 0; right: 0; border-top: 1px dashed #cbd5e1; font-size: 9px; color: #64748b; padding-top: 2px; }
          .target-box { position: absolute; width: 30mm; height: 20mm; border: 2px solid #2f63f2; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; color: #2f63f2; }
        </style>
      </head>
      <body>
        ${[20, 40, 60, 80, 100, 120, 140, 160, 180].map(x => `<div class="grid-line-x" style="left:${x}mm;">${x}mm</div>`).join('')}
        ${[20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260].map(y => `<div class="grid-line-y" style="top:${y}mm;">${y}mm</div>`).join('')}
        <div class="target-box" style="left:20mm; top:20mm;">(20, 20) TOP LEFT</div>
        <div class="target-box" style="right:20mm; top:20mm;">TOP RIGHT</div>
        <div class="target-box" style="left:20mm; bottom:20mm;">BOTTOM LEFT</div>
        <div class="target-box" style="left:80mm; top:120mm; width:50mm; height:30mm;">CENTER TARGET</div>
      </body>
    </html>
  `;
};

export const printPrescriptionWindow = (consultation, doctor, templateConfig) => {
  const html = generatePrescriptionPrintHTML(consultation, doctor, templateConfig);
  const win = window.open('', '_blank', 'width=850,height=950');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 500);
  }
};
