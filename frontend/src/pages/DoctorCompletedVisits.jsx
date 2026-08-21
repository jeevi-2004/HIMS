import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { Eye, Printer, CheckCircle2 } from 'lucide-react';

const DoctorCompletedVisits = () => {
  const { user } = useAuth();
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [_activePresc, _setActivePresc] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Fetch completed appointments for this doctor
  const { data: visits, isLoading: visitsLoading } = useQuery({
    queryKey: ['doctorCompletedVisitsHistory', user?._id],
    queryFn: async () => {
      const res = await api.get(`/operations/appointments?doctorId=${user?._id}&status=Completed`);
      return res.data.data;
    }
  });

  // Fetch patient history to get the consultation details on demand
  const { data: patientHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['patientHistoryForCompletedDetail', selectedVisit?.patientId?._id],
    queryFn: async () => {
      if (!selectedVisit?.patientId?._id) return null;
      const res = await api.get(`/operations/patients/${selectedVisit.patientId._id}/history`);
      return res.data.data;
    },
    enabled: !!selectedVisit?.patientId?._id
  });

  // When patient history loads, find the matching snapshot or consultation detail
  const [matchedConsultation, setMatchedConsultation] = useState(null);
  React.useEffect(() => {
    if (patientHistory && selectedVisit) {
      const snapshots = patientHistory?.snapshots || [];
      const consultations = Array.isArray(patientHistory) 
        ? patientHistory 
        : (patientHistory?.consultations || []);
      
      const matchedSnapshot = snapshots.find(s => String(s.appointmentId?._id || s.appointmentId) === String(selectedVisit._id));
      if (matchedSnapshot) {
        setMatchedConsultation({
          ...matchedSnapshot,
          diagnosis: matchedSnapshot.diagnosis || matchedSnapshot.primaryDiagnosis,
          advice: matchedSnapshot.doctorAdvice,
          prescriptions: (matchedSnapshot.prescriptions || []).map(p => ({
            medicineName: p.medicineName,
            dosage: p.dose || `${p.morning || '1'}-${p.afternoon || '0'}-${p.night || '1'}`,
            duration: p.duration,
            instructions: p.timing || p.foodInstruction,
            notes: p.remarks
          }))
        });
      } else {
        const matched = consultations.find(h => String(h.appointmentId?._id || h.appointmentId) === String(selectedVisit._id));
        if (matchedConsultation?._id !== matched?._id) {
          setMatchedConsultation(matched);
        }
      }
    }
  }, [patientHistory, selectedVisit, matchedConsultation?._id]);

  return (
    <div className="space-y-5 text-left px-4 sm:px-5 md:px-6 py-4 sm:py-5 bg-[#F8FAFC] min-h-screen">
      
      {/* Page Heading Outside Content Card */}
      <div className="pb-2 border-b border-[#E5E7EB]">
        <h1 className="text-xl font-bold text-[#111827] flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          Completed Visits
        </h1>
        <p className="text-xs text-[#6B7280] mt-1 font-medium">
          Monitor finalized case file summaries and consultation records.
        </p>
      </div>

      {/* Main Content Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-4 sm:p-5 shadow-card-soft space-y-4">
        
        {/* Table Container */}
        <div className="hidden sm:block border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
          <Table
            headers={[
              { key: 'date', label: 'Consult Date', render: (row) => <span className="font-mono text-xs text-slate-700">{new Date(row.date).toLocaleDateString()}</span> },
              { key: 'tokenNumber', label: 'Token', render: (row) => <span className="font-bold text-[#2F63F2] font-mono">#{row.tokenNumber || 'N/A'}</span> },
              { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold font-mono text-[#111827]">{row.patientId?.uhid}</span> },
              { key: 'patientId.name', label: 'Patient Name', render: (row) => <span className="font-bold text-[#111827]">{row.patientId?.name}</span> },
              { key: 'patientId.age', label: 'Age / Gender', render: (row) => <span className="text-slate-600 font-medium">{row.patientId?.age} Yrs / {row.patientId?.gender}</span> },
              { 
                key: 'vitals', 
                label: 'BP / Pulse', 
                render: (row) => row.vitals && row.vitals.bpSystolic ? (
                  <span className="font-mono text-xs text-slate-700">{row.vitals.bpSystolic}/{row.vitals.bpDiastolic} ({row.vitals.pulse})</span>
                ) : (
                  <span className="text-[#6B7280] font-mono text-xs">No Vitals</span>
                )
              }
            ]}
            data={visits || []}
            actions={[
              {
                label: 'View Case Detail',
                icon: Eye,
                onClick: (row) => {
                  setSelectedVisit(row);
                  setIsDetailOpen(true);
                }
              }
            ]}
            loading={visitsLoading}
          />
        </div>

        {/* Mobile Stacked Card View */}
        <div className="block sm:hidden space-y-3 mt-2">
          {visitsLoading ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">Loading completed visits...</div>
          ) : !visits || visits.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">No completed visits found.</div>
          ) : (
            visits.map((visit) => {
              const hasVitals = visit.vitals && visit.vitals.bpSystolic;
              return (
                <div key={visit._id} className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3 shadow-xs text-left">
                  {/* Header: Patient Name & Token */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-left">
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">{visit.patientId?.name || 'Unknown Patient'}</h4>
                      <p className="text-slate-500 text-xs mt-1">
                        {visit.patientId?.uhid ? `UHID: ${visit.patientId.uhid} | ` : ''}
                        {visit.patientId?.age ? `${visit.patientId.age} Yrs` : ''} 
                        {visit.patientId?.gender ? ` / ${visit.patientId.gender}` : ''}
                      </p>
                    </div>
                    <span className="font-bold text-[#2F63F2] font-mono text-xs bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shrink-0">
                      #{visit.tokenNumber || 'N/A'}
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 border-t border-slate-100 pt-3 text-xs text-slate-600 text-left">
                    <div className="text-left">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Consult Date</span>
                      <span className="font-mono text-slate-700">{new Date(visit.date).toLocaleDateString()}</span>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">BP / Pulse</span>
                      <span className="font-mono text-slate-700">
                        {hasVitals ? `${visit.vitals.bpSystolic}/${visit.vitals.bpDiastolic} (${visit.vitals.pulse})` : 'No Vitals'}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="border-t border-slate-100 pt-3 text-left">
                    <button
                      onClick={() => {
                        setSelectedVisit(visit);
                        setIsDetailOpen(true);
                      }}
                      className="w-full py-2 border border-[#2F63F2] text-[#2F63F2] hover:bg-[#2F63F2]/5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all duration-150 active:scale-95 text-center flex items-center justify-center gap-1.5 focus:outline-none"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Case Detail
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Case Details Modal */}
      <Modal isOpen={isDetailOpen} onClose={() => { setIsDetailOpen(false); setSelectedVisit(null); setMatchedConsultation(null); }} title="Patient Consultation Case Details">
        {selectedVisit && (
          <div className="space-y-4 text-left">
            
            {/* Patient Header Block */}
            <div className="p-3.5 bg-slate-50 border border-[#E5E7EB] rounded-2xl grid grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Patient Name</span>
                <strong className="text-[#111827] text-xs block mt-0.5 font-sans">{selectedVisit.patientId?.name}</strong>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Patient ID (UHID)</span>
                <strong className="text-[#2F63F2] text-xs block mt-0.5">{selectedVisit.patientId?.uhid}</strong>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Consult Date</span>
                <strong className="text-slate-800 text-xs block mt-0.5 font-mono">📅 {new Date(selectedVisit.date).toLocaleDateString('en-GB')}</strong>
              </div>
            </div>

            {/* Consultation Details */}
            {historyLoading ? (
              <div className="text-center py-6 text-slate-400 text-xs font-bold font-mono">Retrieving consultation details...</div>
            ) : matchedConsultation ? (
              <div className="space-y-3 text-left text-xs">
                
                {/* Vitals Summary */}
                {selectedVisit.vitals && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl grid grid-cols-3 gap-2 font-mono text-indigo-700 text-[11px]">
                    <div>BP: <strong>{selectedVisit.vitals.bpSystolic}/{selectedVisit.vitals.bpDiastolic} mmHg</strong></div>
                    <div>Pulse: <strong>{selectedVisit.vitals.pulse} bpm</strong></div>
                    <div>Sugar: <strong>{selectedVisit.vitals.bloodSugar || '-'} mg/dL</strong></div>
                  </div>
                )}

                <div className="space-y-2 bg-slate-50 border border-[#E5E7EB] rounded-2xl p-4">
                  <p className="text-[#111827]"><strong>Diagnosis:</strong> {matchedConsultation.diagnosis}</p>
                  {matchedConsultation.notes && <p className="text-slate-600"><strong>Case Notes:</strong> {matchedConsultation.notes}</p>}
                  {matchedConsultation.advice && <p className="text-slate-600"><strong>Advice:</strong> {matchedConsultation.advice}</p>}
                  {matchedConsultation.followupDate && <p className="text-slate-600 font-mono"><strong>Follow-Up:</strong> {new Date(matchedConsultation.followupDate).toLocaleDateString()}</p>}
                </div>

                {/* Prescription list */}
                {matchedConsultation.prescriptions && matchedConsultation.prescriptions.length > 0 && (
                  <div className="space-y-2">
                    <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Prescribed Medicines</span>
                    <div className="space-y-1 text-[11px] font-mono text-slate-700">
                      {matchedConsultation.prescriptions.map((med, medIdx) => (
                        <div key={medIdx} className="flex justify-between p-2 bg-white border border-[#E5E7EB] rounded-xl">
                          <span>💊 {med.medicineName || med.medicineId?.name}</span>
                          <span>{med.dosage} ({med.frequency}) - {med.duration} [{med.instructions}]</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <p className="text-[10px] text-[#6B7280] italic text-center">No consultation case sheet found.</p>
            )}

            <div className="flex gap-2.5 justify-center pt-2">
              <Button onClick={() => window.print()} variant="primary" icon={Printer} className="text-xs font-bold uppercase tracking-wider h-[38px] bg-[#2F63F2]">
                Print Case Details
              </Button>
              <Button onClick={() => { setIsDetailOpen(false); setSelectedVisit(null); setMatchedConsultation(null); }} variant="secondary" className="text-xs font-bold uppercase tracking-wider h-[38px]">
                Close
              </Button>
            </div>

          </div>
        )}
      </Modal>

    </div>
  );
};

export default DoctorCompletedVisits;
