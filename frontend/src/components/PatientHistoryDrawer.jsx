import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Search, Calendar, Clock, Pill, FlaskConical, HeartPulse, ChevronRight, ChevronUp
} from 'lucide-react';

const PatientHistoryDrawer = ({ isOpen, onClose, patient, patientHistory, onCopyPrescription }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedVisitId, setExpandedVisitId] = useState(null);
  const [expandedSectionMap, setExpandedSectionMap] = useState({});

  const visits = useMemo(() => {
    const rawSnapshots = patientHistory?.snapshots || [];
    const rawConsultations = patientHistory?.consultations || [];

    if (rawSnapshots.length > 0) {
      const snapConsultationIds = new Set(rawSnapshots.map(s => String(s.consultationId || s._id)));
      
      const snapshotVisits = rawSnapshots.map(s => ({
        _id: s._id,
        isSnapshot: true,
        consultationId: s.consultationId,
        appointmentId: s.appointmentId,
        createdAt: s.completedAt || s.createdAt,
        date: s.consultationDate || s.createdAt,
        doctorId: { name: s.doctor?.name || 'Doctor' },
        doctorName: s.doctor?.name,
        doctorSpecialization: s.doctor?.specialization,
        hospitalName: s.hospital?.name,
        diagnosis: s.diagnosis || s.primaryDiagnosis,
        chiefComplaint: s.chiefComplaint,
        clinicalNotes: s.clinicalNotes,
        advice: s.doctorAdvice,
        vitals: s.vitals,
        prescriptions: (s.prescriptions || []).map(p => ({
          medicineName: p.medicineName,
          dosage: p.dose || `${p.morning || '1'}-${p.afternoon || '0'}-${p.night || '1'}`,
          morning: p.morning || (p.dose && p.dose.split('-')[0]) || '1',
          afternoon: p.afternoon || (p.dose && p.dose.split('-')[1]) || '0',
          night: p.night || (p.dose && p.dose.split('-')[2]) || '1',
          duration: p.duration,
          instructions: p.timing || p.foodInstruction,
          foodTiming: p.timing || p.foodInstruction,
          quantity: p.quantity,
          notes: p.remarks
        })),
        investigations: (s.investigations || []).map(inv => typeof inv === 'string' ? inv : (inv.investigationName || inv.name)),
        followupDate: s.followupDate,
        followupReason: s.followupReason,
        version: s.snapshotVersion
      }));

      const unSnapshotted = rawConsultations.filter(c => !snapConsultationIds.has(String(c._id)));
      return [...snapshotVisits, ...unSnapshotted];
    }
    return rawConsultations;
  }, [patientHistory]);

  const consultations = visits;

  // Reset drawer expanded visit state when a new patient history loads
  React.useEffect(() => {
    setSearchQuery('');
    setExpandedSectionMap({});
    if (consultations.length > 0) {
      setExpandedVisitId(consultations[0]._id);
    } else {
      setExpandedVisitId(null);
    }
  }, [patientHistory, patient?._id, consultations]);

  const filteredConsultations = useMemo(() => {
    if (!searchQuery.trim()) return consultations;
    const q = searchQuery.trim().toLowerCase();

    return consultations.filter(c => {
      const docName = (c.doctorId?.name || c.doctorName || '').toLowerCase();
      const diag = (c.diagnosis || c.primaryDiagnosis || '').toLowerCase();
      const complaint = (c.chiefComplaint || '').toLowerCase();
      const notes = (c.clinicalNotes || '').toLowerCase();
      const dateStr = new Date(c.createdAt || c.date).toLocaleDateString().toLowerCase();

      const rxMatch = (c.prescriptions || []).some(m => (m.medicineName || '').toLowerCase().includes(q));
      const invMatch = Array.isArray(c.investigations)
        ? c.investigations.some(i => (typeof i === 'string' ? i : i.investigationName || '').toLowerCase().includes(q))
        : (c.investigations || '').toLowerCase().includes(q);

      return docName.includes(q) || diag.includes(q) || complaint.includes(q) || notes.includes(q) || dateStr.includes(q) || rxMatch || invMatch;
    });
  }, [consultations, searchQuery]);

  // Helper to get prescriptions for a consultation
  const getPrescriptionsForVisit = (c) => {
    if (c.prescriptions && c.prescriptions.length > 0) {
      return c.prescriptions;
    }
    const matchedRx = (patientHistory?.prescriptions || []).find(p => 
      String(p.consultationId?._id || p.consultationId) === String(c._id) ||
      String(p.appointmentId?._id || p.appointmentId) === String(c.appointmentId?._id || c.appointmentId)
    );
    if (matchedRx?.items && matchedRx.items.length > 0) {
      return matchedRx.items;
    }
    return [];
  };

  // Helper to get vitals for a consultation
  const getVitalsForVisit = (c) => {
    if (c.vitals && Object.values(c.vitals).some(Boolean)) {
      return c.vitals;
    }
    if (c.appointmentId?.vitals && Object.values(c.appointmentId.vitals).some(Boolean)) {
      return c.appointmentId.vitals;
    }
    return null;
  };

  // Helper to get investigations for a consultation
  const getInvestigationsForVisit = (c) => {
    if (c.investigations) {
      return c.investigations;
    }
    if (c.appointmentId?.investigations) {
      return c.appointmentId.investigations;
    }
    return null;
  };

  if (!isOpen) return null;

  const toggleSection = (visitId, section) => {
    setExpandedSectionMap(prev => ({
      ...prev,
      [visitId]: prev[visitId] === section ? null : section
    }));
  };

  const drawerContent = (
    <div className="fixed inset-0 z-[99999] overflow-y-auto font-sans print:hidden flex items-center justify-center p-3 sm:p-6">
      {/* Full Screen Overlay Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Centered Modal Container */}
      <div className="relative w-full max-w-4xl lg:max-w-5xl max-h-[92vh] sm:max-h-[90vh] bg-white shadow-2xl rounded-2xl sm:rounded-3xl border border-slate-200/90 flex flex-col text-left overflow-hidden z-[100000] font-sans my-auto">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">{patient?.name || 'Patient'}</h3>
              <span className="text-[11px] sm:text-xs font-bold text-slate-500 font-mono">• {patient?.gender || 'N/A'}, {patient?.age ? `${patient.age}Y` : 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5 font-bold">
              <span>UHID: {patient?.uhid || 'N/A'}</span>
              {patient?.bloodGroup && (
                <span className="bg-red-50 text-red-600 border border-red-200/60 px-1.5 py-0.2 rounded text-[10px] uppercase font-bold">
                  {patient.bloodGroup}
                </span>
              )}
            </div>
          </div>
          
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Search Input */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-100 bg-white shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history by diagnosis, medicine, test, doctor, date..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-xl sm:rounded-2xl text-xs text-slate-700 font-medium placeholder-slate-400 focus:outline-none focus:border-[#2F63F2] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Timeline Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 text-left">
          {filteredConsultations.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-600">No medical history records found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto font-medium">
                {searchQuery ? 'Try clearing your search query' : 'This patient has no recorded consultation history yet.'}
              </p>
            </div>
          ) : (
            filteredConsultations.map((c) => {
              const isExpanded = expandedVisitId === c._id;
              const activeSection = expandedSectionMap[c._id] || 'rx';
              const rxList = getPrescriptionsForVisit(c);
              const vitalsObj = getVitalsForVisit(c);
              const invObj = getInvestigationsForVisit(c);

              const rxCount = rxList.length;
              const invCount = Array.isArray(invObj) ? invObj.length : (invObj ? 1 : 0);
              const vitalsCount = vitalsObj && Object.values(vitalsObj).some(Boolean) ? 1 : 0;

              return (
                <div 
                  key={c._id} 
                  className={`bg-white border rounded-2xl sm:rounded-3xl transition-all overflow-hidden ${
                    isExpanded ? 'border-[#2F63F2]/40 shadow-lg ring-1 ring-[#2F63F2]/20' : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* Card Main Bar */}
                  <div 
                    onClick={() => setExpandedVisitId(isExpanded ? null : c._id)}
                    className="p-3 sm:p-5 cursor-pointer select-none bg-white hover:bg-slate-50/60 transition-colors space-y-2.5 sm:space-y-3"
                  >
                    {/* Top Row: Date Box + Doctor Info + Pill Badges */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Blue Date Box */}
                        {(() => {
                          const dateVal = new Date(c.createdAt || c.date);
                          const dayNum = !isNaN(dateVal.getTime()) ? dateVal.getDate() : '—';
                          const monthYearStr = !isNaN(dateVal.getTime()) ? dateVal.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
                          const timeStr = !isNaN(dateVal.getTime()) ? dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                          return (
                            <div className="w-[76px] py-2 px-1 rounded-2xl bg-blue-50/70 border border-blue-100/90 flex flex-col items-center justify-center shrink-0 text-center shadow-2xs">
                              <Calendar className="w-3.5 h-3.5 text-[#2F63F2] mb-0.5" />
                              <span className="text-base font-black text-[#2F63F2] leading-none font-sans">
                                {dayNum}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 font-sans leading-tight mt-0.5 whitespace-nowrap">
                                {monthYearStr}
                              </span>
                              <span className="flex items-center justify-center gap-0.5 text-[9px] font-semibold text-slate-400 font-sans mt-1 leading-none">
                                <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                <span>{timeStr}</span>
                              </span>
                            </div>
                          );
                        })()}

                        {/* Doctor Name & Specialization */}
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-slate-900 tracking-tight">
                            Dr. {c.doctorId?.name || c.doctorName || 'Consultant'}
                          </h4>
                          <span className="text-xs font-semibold text-slate-400 font-sans block mt-0.5">
                            {c.doctorSpecialization || 'General OPD'}
                          </span>
                        </div>
                      </div>

                      {/* Right Section: Badges & Section Buttons */}
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {/* Completed Status Pill */}
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                          COMPLETED
                        </span>

                        {/* Prescription Pill */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedVisitId(c._id);
                            toggleSection(c._id, 'rx');
                          }}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-2xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 border cursor-pointer shrink ${
                            activeSection === 'rx' 
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs' 
                              : 'bg-purple-50 text-purple-700 border-purple-200/80 hover:bg-purple-100'
                          }`}
                        >
                          <Pill className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          <span className="truncate max-w-[70px] sm:max-w-none">Rx</span>
                          <span className="bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black shrink-0">
                            {rxCount}
                          </span>
                        </button>

                        {/* Investigations Pill */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedVisitId(c._id);
                            toggleSection(c._id, 'inv');
                          }}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-2xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 border cursor-pointer shrink ${
                            activeSection === 'inv' 
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100'
                          }`}
                        >
                          <FlaskConical className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          <span className="truncate max-w-[75px] sm:max-w-none">Tests</span>
                          <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black shrink-0">
                            {invCount}
                          </span>
                        </button>

                        {/* Vitals Pill */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedVisitId(c._id);
                            toggleSection(c._id, 'vitals');
                          }}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-2xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 border cursor-pointer shrink ${
                            activeSection === 'vitals' 
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs' 
                              : 'bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-rose-100'
                          }`}
                        >
                          <HeartPulse className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          <span className="truncate max-w-[60px] sm:max-w-none">Vitals</span>
                          <span className="bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black shrink-0">
                            {vitalsCount}
                          </span>
                        </button>

                        {/* Chevron Expand/Collapse Toggle */}
                        <div className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-[#2F63F2]" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {/* Middle Section: Diagnosis & Chief Complaint */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">DIAGNOSIS</span>
                        <span className="font-bold text-[#2F63F2] text-sm block mt-0.5">
                          {c.diagnosis || c.primaryDiagnosis || 'General OPD'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">CHIEF COMPLAINT</span>
                        <span className="font-bold text-slate-800 text-sm block mt-0.5">
                          {c.chiefComplaint || c.diagnosis || 'None specified'}
                        </span>
                      </div>
                    </div>

                  </div>

                  {/* Expanded Detail View */}
                  {isExpanded && activeSection && (
                    <div className="border-t border-slate-100 p-4 sm:p-5 bg-slate-50/50 space-y-4 font-sans text-xs">
                      
                      {/* 1. PRESCRIPTION TAB DETAILS */}
                      {activeSection === 'rx' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                              <Pill className="w-4 h-4 text-purple-600" />
                              PRESCRIBED MEDICATIONS ({rxList.length})
                            </span>
                            {onCopyPrescription && rxList.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onCopyPrescription(rxList)}
                                className="text-xs font-extrabold text-[#2F63F2] hover:underline cursor-pointer flex items-center gap-1"
                              >
                                <span>+ Copy All Medicines to Pad</span>
                              </button>
                            )}
                          </div>

                          {rxList.length === 0 ? (
                            <p className="text-slate-400 italic py-2">No medicines prescribed for this visit.</p>
                          ) : (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                              <div className="overflow-x-auto max-w-full">
                                <table className="w-full text-left text-xs font-sans min-w-[500px]">
                                  <thead className="bg-slate-100/80 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap">
                                    <tr>
                                      <th className="p-2.5">MEDICINE NAME</th>
                                      <th className="p-2.5">DOSAGE / TIMING</th>
                                      <th className="p-2.5">DURATION</th>
                                      <th className="p-2.5">FOOD TIMING</th>
                                      <th className="p-2.5">QTY</th>
                                      <th className="p-2.5">REMARKS</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-[11px] font-medium text-slate-800">
                                    {rxList.map((m, mIdx) => (
                                      <tr key={mIdx} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">{m.medicineName}</td>
                                        <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">{m.dosage || `${m.morning || '1'}-${m.afternoon || '0'}-${m.night || '1'}`}</td>
                                        <td className="p-2.5 text-slate-600 whitespace-nowrap">{m.duration || '—'}</td>
                                        <td className="p-2.5 text-slate-600 whitespace-nowrap">{m.instructions || m.foodTiming || 'After Food'}</td>
                                        <td className="p-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">{m.quantity || 1}</td>
                                        <td className="p-2.5 text-slate-500 italic whitespace-nowrap">{m.notes || m.remarks || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. INVESTIGATIONS TAB DETAILS */}
                      {activeSection === 'inv' && (
                        <div className="space-y-2">
                          <span className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                            <FlaskConical className="w-4 h-4 text-emerald-600" />
                            REQUESTED INVESTIGATIONS
                          </span>
                          {!invObj || (Array.isArray(invObj) && invObj.length === 0) ? (
                            <p className="text-slate-400 italic py-2">No investigations requested for this visit.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(Array.isArray(invObj) ? invObj : [invObj]).map((inv, invIdx) => (
                                <div key={invIdx} className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
                                  <FlaskConical className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>{typeof inv === 'string' ? inv : (inv.investigationName || inv.name)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. VITALS TAB DETAILS */}
                      {activeSection === 'vitals' && (
                        <div className="space-y-2">
                          <span className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                            <HeartPulse className="w-4 h-4 text-rose-500" />
                            RECORDED CONSULTATION VITALS
                          </span>
                          {!vitalsObj || !Object.values(vitalsObj).some(Boolean) ? (
                            <p className="text-slate-400 italic py-2">No vitals recorded for this visit.</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                              <div className="bg-white p-2.5 rounded-2xl border border-slate-200 text-center">
                                <span className="text-[10px] font-semibold text-slate-400 block uppercase">BP</span>
                                <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                  {vitalsObj?.bpSystolic && vitalsObj?.bpDiastolic ? `${vitalsObj.bpSystolic}/${vitalsObj.bpDiastolic}` : (vitalsObj?.bloodPressure || 'N/A')}
                                </strong>
                              </div>

                              <div className="bg-white p-2.5 rounded-2xl border border-slate-200 text-center">
                                <span className="text-[10px] font-semibold text-slate-400 block uppercase">PULSE</span>
                                <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                  {vitalsObj?.pulse ? `${vitalsObj.pulse} bpm` : 'N/A'}
                                </strong>
                              </div>

                              <div className="bg-white p-2.5 rounded-2xl border border-slate-200 text-center">
                                <span className="text-[10px] font-semibold text-slate-400 block uppercase">TEMP</span>
                                <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                  {vitalsObj?.temperature ? `${vitalsObj.temperature} °F` : 'N/A'}
                                </strong>
                              </div>

                              <div className="bg-white p-2.5 rounded-2xl border border-slate-200 text-center">
                                <span className="text-[10px] font-semibold text-slate-400 block uppercase">SPO2</span>
                                <strong className="text-slate-900 font-mono text-xs block mt-0.5">
                                  {vitalsObj?.spo2 ? `${vitalsObj.spo2}%` : 'N/A'}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-white flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close</span>
          </button>
        </div>

      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
};

export default PatientHistoryDrawer;
