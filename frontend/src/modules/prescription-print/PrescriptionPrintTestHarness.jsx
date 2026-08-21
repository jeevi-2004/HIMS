import React from 'react';
import PrescriptionPrintPreview from './PrescriptionPrintPreview';
import { PRINT_MODES } from './prescriptionPrint.types';

/**
 * Test Harness Component for validating Phase 1 Prescription Print Engine
 */
const PrescriptionPrintTestHarness = () => {
  const sampleConsultation = {
    patientId: { 
      name: 'George Kumar', 
      uhid: 'PAT000001', 
      age: 32, 
      gender: 'Male', 
      contactNumber: '+91 98765 43210',
      bloodGroup: 'O+',
      village: 'City Center'
    },
    date: new Date().toISOString(),
    tokenNo: 'OP-01',
    visitType: 'General OPD',
    chiefComplaint: 'Fever, Cough, Bodyache for 2 days',
    clinicalNotes: 'Mild throat congestion observed.',
    diagnosis: ['Viral Fever', 'Upper Respiratory Tract Infection'],
    prescription: [
      { medicineName: 'Paracetamol 500mg', dosage: '500mg', frequency: '1-0-1', duration: '5 Days', food: 'After Food', instructions: 'Take with warm water' },
      { medicineName: 'Cetirizine 10mg', dosage: '10mg', frequency: '0-0-1', duration: '5 Days', food: 'After Food', instructions: 'At bedtime' }
    ],
    advice: ['Drink plenty of warm water', 'Bed rest for 3 days'],
    followupDate: new Date(Date.now() + 5 * 86400000).toISOString()
  };

  const sampleDoctor = {
    name: 'Nithin',
    doctorProfile: { 
      qualification: 'MBBS, MD', 
      registrationNumber: 'REG-TNMC/2026/45879', 
      department: 'Internal Medicine' 
    }
  };

  const sampleHospital = {
    name: 'VillZone Multispeciality Hospital',
    registrationNumber: 'REG-HOSP-2026/098',
    address: '124 Healthcare Boulevard, City Center',
    phone: '+91 98765 43210'
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="text-xl font-bold text-slate-900">Phase 1 Prescription Print Engine Test Harness</h2>
        <p className="text-xs text-slate-500">Standalone test harness for validating Standard & Pre-printed template rendering.</p>
      </div>

      <PrescriptionPrintPreview 
        rawConsultation={sampleConsultation}
        rawDoctor={sampleDoctor}
        rawHospital={sampleHospital}
      />
    </div>
  );
};

export default PrescriptionPrintTestHarness;
