import React from 'react';

/**
 * Pre-Printed Letterhead Overlay Template Component
 * Renders dynamic patient, clinical, and medication data overlaid on physical letterhead coordinates.
 */
const PrePrintedPrescriptionTemplate = ({ data, config }) => {
  const { patient, visit, doctor, clinical, medicines } = data;
  const letterheadConfig = config.letterhead || {};
  const calibration = config.calibration || { topOffset: 0, leftOffset: 0 };

  return (
    <div 
      className="relative bg-white text-slate-900 font-sans max-w-4xl mx-auto overflow-hidden print:p-0"
      style={{
        width: '210mm',
        minHeight: '297mm',
        transform: `translate(${calibration.leftOffset || 0}mm, ${calibration.topOffset || 0}mm)`
      }}
    >
      {/* Optional Background Letterhead Preview Image (Hidden during physical print) */}
      {letterheadConfig.backgroundImage && (
        <img 
          src={letterheadConfig.backgroundImage} 
          alt="Letterhead Background" 
          className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none print:hidden" 
        />
      )}

      {/* Dynamic Absolute Positioned Fields */}
      <div className="absolute top-[35mm] left-[25mm] text-xs space-y-1">
        <span className="font-extrabold text-slate-900 block">{patient.name}</span>
        <span className="text-slate-600 block">{patient.age} / {patient.gender}</span>
      </div>

      <div className="absolute top-[35mm] left-[120mm] text-xs space-y-1 font-mono">
        <span className="font-bold text-[#2F63F2] block">{patient.uhid}</span>
        <span className="text-slate-600 block">Date: {visit.date}</span>
      </div>

      <div className="absolute top-[55mm] left-[25mm] text-xs max-w-xl">
        <span className="font-bold text-slate-900 block">Diagnosis: {clinical.diagnoses.join(', ')}</span>
      </div>

      {/* Medication Table Positioned Overlay */}
      <div className="absolute top-[80mm] left-[25mm] w-[160mm] text-xs">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-300 font-bold text-slate-700">
              <th className="py-1">Medicine Name</th>
              <th className="py-1">Dosage</th>
              <th className="py-1">Frequency</th>
              <th className="py-1">Duration</th>
              <th className="py-1">Timing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {medicines.map((med, idx) => (
              <tr key={idx}>
                <td className="py-1.5 font-bold text-slate-900">{med.medicineName}</td>
                <td className="py-1.5 text-slate-700">{med.dosage}</td>
                <td className="py-1.5 font-bold text-blue-700">{med.frequency}</td>
                <td className="py-1.5 text-slate-700">{med.duration}</td>
                <td className="py-1.5 text-slate-600 italic">{med.foodTiming}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Doctor Signature Footer Coordinates */}
      <div className="absolute bottom-[30mm] right-[25mm] text-right text-xs space-y-0.5">
        <span className="font-extrabold text-slate-900 block">{doctor.name}</span>
        <span className="text-slate-500 block">{doctor.qualification}</span>
        <span className="text-slate-400 font-mono block">Reg: {doctor.registrationNumber}</span>
      </div>

    </div>
  );
};

export default PrePrintedPrescriptionTemplate;
