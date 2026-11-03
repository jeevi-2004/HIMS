/**
 * Centralized Prescription Printing Utilities
 */

import { generatePrescriptionPrintHTML } from '../../utils/prescriptionPrintService';
import { DEFAULT_PRINT_CONFIG } from './prescriptionPrint.types';

/**
 * Normalizes diverse raw application data into a standardized internal print data structure.
 */
export const normalizePrescriptionData = (rawConsultation = {}, rawDoctor = {}, rawHospital = {}, isSample = false) => {
  const patient = rawConsultation.patientId || {};
  const rawDiag = rawConsultation.diagnoses || rawConsultation.diagnosis || [];
  const diagnosisList = Array.isArray(rawDiag)
    ? rawDiag
    : (typeof rawDiag === 'string' && rawDiag.includes(',') ? rawDiag.split(',').map(s => s.trim()).filter(Boolean) : (rawDiag ? [rawDiag] : []));
  const adviceList = rawConsultation.advice || [];
  const doctorProfile = rawDoctor.doctorProfile || {};

  const sampleFallback = isSample;

  return {
    patient: {
      name: patient.name || (sampleFallback ? 'Sample Patient' : 'N/A'),
      uhid: patient.uhid || patient.patientId || (sampleFallback ? 'SAMPLE-001' : 'N/A'),
      age: patient.age ? `${patient.age} Yrs` : (sampleFallback ? '30 Yrs' : ''),
      gender: patient.gender || (sampleFallback ? 'Male' : ''),
      mobile: patient.contactNumber || patient.mobileNumber || patient.mobile || (sampleFallback ? '+91 99999 00000' : ''),
      bloodGroup: patient.bloodGroup || (sampleFallback ? 'O+' : ''),
      place: patient.village || patient.place || patient.address?.street || (sampleFallback ? 'City Center' : ''),
      allergies: (() => {
        const consultAllergies = rawConsultation.allergies && (Array.isArray(rawConsultation.allergies) ? rawConsultation.allergies.length > 0 : String(rawConsultation.allergies).trim())
          ? rawConsultation.allergies
          : null;
        const patientAllergies = patient.allergies && (Array.isArray(patient.allergies) ? patient.allergies.length > 0 : String(patient.allergies).trim())
          ? patient.allergies
          : null;
        const raw = consultAllergies || patientAllergies;
        if (Array.isArray(raw)) {
          const list = raw.map(x => String(x || '').trim()).filter(Boolean);
          return list.length ? list.join(', ') : (sampleFallback ? 'No known drug allergies' : 'None');
        }
        if (typeof raw === 'string' && raw.trim()) {
          return raw.trim();
        }
        return sampleFallback ? 'No known drug allergies' : 'None';
      })()
    },
    visit: {
      date: rawConsultation.date ? new Date(rawConsultation.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
      tokenNumber: rawConsultation.tokenNo || rawConsultation.tokenNumber || (sampleFallback ? 'OP-01' : 'N/A'),
      appointmentType: rawConsultation.visitType || rawConsultation.consultationType || 'General OPD',
      appointmentTime: rawConsultation.appointmentTime || rawConsultation.time || (sampleFallback ? '10:30 AM' : '')
    },
    doctor: {
      name: rawDoctor.name ? (rawDoctor.name.startsWith('Dr.') ? rawDoctor.name : `Dr. ${rawDoctor.name}`) : (sampleFallback ? 'Dr. Sample Doctor' : 'N/A'),
      qualification: doctorProfile.qualification || (sampleFallback ? 'MBBS, MD' : ''),
      registrationNumber: doctorProfile.registrationNumber || (sampleFallback ? 'REG-SAMPLE-123' : ''),
      specialization: doctorProfile.department || doctorProfile.specialization || (sampleFallback ? 'General Medicine' : ''),
      signatureUrl: doctorProfile.signatureUrl || ''
    },
    hospital: {
      name: rawHospital.name || (sampleFallback ? 'Sample Hospital' : 'N/A'),
      logo: rawHospital.logo || '',
      registrationNumber: rawHospital.registrationNumber || (sampleFallback ? 'REG-SAMPLE-001' : ''),
      address: rawHospital.address || (sampleFallback ? '123 Health Ave' : ''),
      phone: rawHospital.phone || rawHospital.mobileNumber || (sampleFallback ? '+91 99999 88888' : '')
    },
    clinical: {
      chiefComplaint: rawConsultation.chiefComplaint || (sampleFallback ? 'Sample Chief Complaint' : ''),
      notes: rawConsultation.clinicalNotes || (sampleFallback ? 'Sample clinical observation.' : ''),
      vitals: rawConsultation.vitals || {},
      diagnoses: Array.isArray(diagnosisList) && diagnosisList.length > 0 ? diagnosisList : (diagnosisList ? [diagnosisList] : (sampleFallback ? ['Sample Clinical Diagnosis'] : [])),
      advice: Array.isArray(adviceList) && adviceList.length > 0 ? adviceList.map(a => typeof a === 'object' ? a.name : a) : (adviceList ? [adviceList] : (sampleFallback ? ['Sample Advice & Instructions'] : [])),
      followUpDate: rawConsultation.followupDate || rawConsultation.followUpDate ? new Date(rawConsultation.followupDate || rawConsultation.followUpDate).toLocaleDateString('en-GB') : (sampleFallback ? new Date(Date.now() + 5 * 86400000).toLocaleDateString('en-GB') : '')
    },
    medicines: rxList.length > 0 ? rxList.map(item => ({
      medicineName: item.medicineName || item.name || 'Medicine',
      dosage: item.dosage || '',
      frequency: item.frequency || '',
      duration: item.duration || '',
      foodTiming: item.food || item.foodTiming || 'After Food',
      instructions: item.instructions || item.remarks || ''
    })) : (sampleFallback ? [
      { medicineName: 'Sample Medication 500mg', dosage: '500mg', frequency: '1-0-1', duration: '5 Days', foodTiming: 'After Food', instructions: 'Take with warm water' }
    ] : [])
  };
};

/**
 * Triggers the browser print workflow for the given normalized data and configuration.
 */
export const triggerPrint = (rawConsultation = {}, rawDoctor = {}, printConfig = DEFAULT_PRINT_CONFIG) => {
  const configToPass = printConfig.template ? printConfig : { template: printConfig };
  const html = generatePrescriptionPrintHTML(rawConsultation, rawDoctor, configToPass);
  const printWindow = window.open('', '_blank', 'width=900,height=950');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
};
