import React from 'react';

/**
 * Standard Digital Prescription Template Component
 * Renders full digital header, patient info, clinical diagnosis, medication table, advice, and doctor signature.
 */
const StandardPrescriptionTemplate = ({ data, config }) => {
  const { patient, visit, doctor, hospital, clinical, medicines } = data;

  return (
    <div className="bg-white text-slate-900 font-sans p-8 max-w-4xl mx-auto space-y-6 border border-slate-200 rounded-xl shadow-xs print:border-none print:shadow-none print:p-0">
      
      {/* 1. Hospital Header */}
      <div className="border-b border-slate-300 pb-4 flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{hospital.name}</h1>
          <p className="text-xs text-slate-500 font-medium">{hospital.address}</p>
          <div className="flex items-center gap-4 text-[11px] text-slate-500 font-mono">
            <span>Reg: {hospital.registrationNumber}</span>
            <span>Ph: {hospital.phone}</span>
          </div>
        </div>
        {hospital.logo && (
          <img src={hospital.logo} alt="Hospital Logo" className="h-12 object-contain" />
        )}
      </div>

      {/* 2. Patient & Visit Demographics Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Patient Name</span>
          <span className="font-extrabold text-slate-900">{patient.name}</span>
          <span className="text-slate-500 text-[11px] block">{patient.age} / {patient.gender}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">UHID / Patient ID</span>
          <span className="font-bold text-[#2F63F2] font-mono">{patient.uhid}</span>
          <span className="text-slate-500 text-[11px] block">Ph: {patient.mobile}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Known Allergies</span>
          <span className={`font-bold text-[11px] block ${patient.allergies && patient.allergies !== 'None' && patient.allergies !== 'No known drug allergies' ? 'text-amber-800 font-extrabold' : 'text-slate-700'}`}>
            {Array.isArray(patient.allergies) ? (patient.allergies.length ? patient.allergies.join(', ') : 'None') : (patient.allergies || 'None')}
          </span>
        </div>
        <div className="text-right sm:text-right">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Date & Token</span>
          <span className="font-bold text-slate-800">{visit.date}</span>
          <span className="text-slate-500 font-mono text-[11px] block">Token: #{visit.tokenNumber}</span>
        </div>
      </div>

      {/* 3. Clinical Summary (Chief Complaint, Vitals & Diagnosis) */}
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="p-3 bg-slate-50/50 rounded-lg border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Chief Complaint</span>
          <p className="font-medium text-slate-800">{clinical.chiefComplaint}</p>
        </div>
        <div className="p-3 bg-slate-50/50 rounded-lg border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Diagnosis</span>
          <p className="font-extrabold text-slate-900">{clinical.diagnoses.join(', ')}</p>
        </div>
      </div>

      {/* Vitals Summary Strip (when authentic measurements are recorded) */}
      {clinical.vitals && (clinical.vitals.bpSystolic || clinical.vitals.pulse || clinical.vitals.temperature || clinical.vitals.spo2 || clinical.vitals.weight || clinical.vitals.height) && (
        <div className="p-2.5 bg-slate-50/70 rounded-lg border border-slate-200/80 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Vitals:</span>
          {clinical.vitals.bpSystolic && (
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">BP:</strong> {clinical.vitals.bpSystolic}/{clinical.vitals.bpDiastolic || '--'} mmHg
            </span>
          )}
          {clinical.vitals.pulse && (
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">Pulse:</strong> {clinical.vitals.pulse} bpm
            </span>
          )}
          {clinical.vitals.temperature && (
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">Temp:</strong> {clinical.vitals.temperature} °F
            </span>
          )}
          {clinical.vitals.spo2 && (
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">SpO₂:</strong> {clinical.vitals.spo2}%
            </span>
          )}
          {clinical.vitals.weight && (
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">Weight:</strong> {clinical.vitals.weight} kg
            </span>
          )}
          {clinical.vitals.height && (
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">Height:</strong> {clinical.vitals.height} cm
            </span>
          )}
          {clinical.vitals.bmi && (
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">BMI:</strong> {clinical.vitals.bmi}
            </span>
          )}
        </div>
      )}

      {/* 4. Rx Medication Table */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5">
          <span className="text-sm font-extrabold text-slate-900 tracking-tight font-serif italic">Rx</span>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prescribed Medicines</span>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Medicine Name</th>
              <th className="py-2 px-3">Dosage</th>
              <th className="py-2 px-3">Frequency</th>
              <th className="py-2 px-3">Duration</th>
              <th className="py-2 px-3">Timing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {medicines.map((med, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                <td className="py-2 px-3 font-bold text-slate-900">{med.medicineName}</td>
                <td className="py-2 px-3 text-slate-700">{med.dosage}</td>
                <td className="py-2 px-3 font-bold text-blue-700">{med.frequency}</td>
                <td className="py-2 px-3 text-slate-700">{med.duration}</td>
                <td className="py-2 px-3 text-slate-600 italic">{med.foodTiming}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5. General Advice & Follow-up */}
      {clinical.advice && clinical.advice.length > 0 && (
        <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-lg text-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#2F63F2] block">Advice & Guidelines</span>
          <ul className="list-disc list-inside text-slate-800 space-y-0.5 font-medium">
            {clinical.advice.map((adv, i) => (
              <li key={i}>{adv}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. Doctor Signature Footer */}
      <div className="pt-8 border-t border-slate-200 flex items-end justify-between text-xs">
        <div>
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Next Follow-up Date</span>
          <span className="font-extrabold text-slate-800 bg-slate-100 px-2.5 py-1 rounded font-mono">
            {clinical.followUpDate || 'As Needed'}
          </span>
        </div>

        <div className="text-right space-y-1">
          {doctor.signatureUrl ? (
            <img src={doctor.signatureUrl} alt="Doctor Signature" className="h-10 ml-auto object-contain mb-1" />
          ) : (
            <div className="h-10 border-b border-dashed border-slate-300 w-40 ml-auto mb-1" />
          )}
          <span className="font-extrabold text-slate-900 block">{doctor.name}</span>
          <span className="text-[11px] text-slate-500 font-medium block">{doctor.qualification}</span>
          <span className="text-[10px] text-slate-400 font-mono block">Reg: {doctor.registrationNumber}</span>
        </div>
      </div>

    </div>
  );
};

export default StandardPrescriptionTemplate;
