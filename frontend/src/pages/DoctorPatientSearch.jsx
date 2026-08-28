import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Card from '../components/Card';
import Table from '../components/Table';
import Modal from '../components/Modal';
import { Search, Eye, AlertTriangle, UserCheck } from 'lucide-react';

const DoctorPatientSearch = () => {
  const [searchParams] = useSearchParams();
  const patientIdFromUrl = searchParams.get('patientId');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Search patients
  const { data: patients, isLoading: searchLoading } = useQuery({
    queryKey: ['doctorPatientsSearch', searchQuery],
    queryFn: async () => {
      const res = await api.get(`/operations/patients/search?query=${searchQuery}`);
      return res.data.data;
    }
  });

  // Fetch patient profile if patientId is in URL
  const { data: urlPatient } = useQuery({
    queryKey: ['patientByUrlId', patientIdFromUrl],
    queryFn: async () => {
      if (!patientIdFromUrl) return null;
      // Search for the specific patient ID or fetch patient search
      const res = await api.get(`/operations/patients/search?query=${patientIdFromUrl}`);
      const found = res.data.data?.find(p => p._id === patientIdFromUrl || p.uhid === patientIdFromUrl) || res.data.data?.[0];
      return found || { _id: patientIdFromUrl, name: 'Patient Profile', uhid: patientIdFromUrl };
    },
    enabled: !!patientIdFromUrl
  });

  useEffect(() => {
    if (urlPatient) {
      setSelectedPatient(urlPatient);
      setIsHistoryOpen(true);
    }
  }, [urlPatient]);

  // Fetch medical history for selected patient
  const { data: patientHistoryData, isLoading: historyLoading } = useQuery({
    queryKey: ['doctorPatientHistory', selectedPatient?._id],
    queryFn: async () => {
      if (!selectedPatient?._id) return null;
      const res = await api.get(`/operations/patients/${selectedPatient._id}/history`);
      return res.data.data;
    },
    enabled: !!selectedPatient?._id
  });

  // Process history snapshots, consultations, and prescriptions into a unified timeline
  const historyList = useMemo(() => {
    if (!patientHistoryData) return [];
    if (Array.isArray(patientHistoryData)) return patientHistoryData;

    const snapshots = patientHistoryData.snapshots || [];
    const activeConsultations = patientHistoryData.consultations || [];
    const combined = [...snapshots, ...activeConsultations];

    // Deduplicate by _id if needed
    const uniqueMap = new Map();
    combined.forEach(item => {
      if (item._id) uniqueMap.set(item._id, item);
    });

    const list = Array.from(uniqueMap.values());
    list.sort((a, b) => new Date(b.createdAt || Date.now()) - new Date(a.createdAt || Date.now()));
    return list;
  }, [patientHistoryData]);

  const prescriptionsList = useMemo(() => {
    if (!patientHistoryData || Array.isArray(patientHistoryData)) return [];
    return patientHistoryData.prescriptions || [];
  }, [patientHistoryData]);

  return (
    <div className="space-y-5 text-left px-4 sm:px-5 md:px-6 py-4 sm:py-5 bg-[#F8FAFC] min-h-screen">
      
      {/* Page Heading Outside Content Card */}
      <div className="pb-2 border-b border-[#E5E7EB]">
        <h1 className="text-xl font-bold text-[#111827] flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2]">
            <Search className="w-5 h-5" />
          </div>
          Patient Medical History
        </h1>
        <p className="text-xs text-[#6B7280] mt-1 font-medium">
          View clinical case sheet records, diagnoses, and past consultation history.
        </p>
      </div>

      {/* Main Content Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-4 sm:p-5 shadow-card-soft space-y-4">
        
        {/* Search Field directly above table inside card */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search patient Name, Phone, Patient ID, or Aadhaar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="enterprise-input w-full h-[40px] text-xs font-medium"
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>

        {/* Table Container */}
        <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
          <Table
            headers={[
              { key: 'uhid', label: 'Patient ID', render: (row) => <span className="font-bold text-[#2F63F2] font-mono">{row.uhid}</span> },
              { key: 'name', label: 'Patient Name', sortable: true, render: (row) => <span className="font-bold text-[#111827]">{row.name}</span> },
              { key: 'mobileNumber', label: 'Mobile No.', render: (row) => <span className="font-mono text-slate-600">{row.countryCode} {row.mobileNumber}</span> },
              { key: 'age', label: 'Age / Gender', render: (row) => <span className="text-slate-600 font-medium">{row.age} Yrs / {row.gender}</span> },
              { key: 'bloodGroup', label: 'Blood Group', render: (row) => <span className="font-mono text-slate-700">{row.bloodGroup || 'N/A'}</span> },
              { key: 'medicalAlerts', label: 'Alerts', render: (row) => row.medicalAlerts ? <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-lg">{row.medicalAlerts}</span> : <span className="text-slate-400">-</span> }
            ]}
            data={patients || []}
            actions={[
              {
                label: 'View Case Sheet History',
                icon: Eye,
                onClick: (row) => {
                  setSelectedPatient(row);
                  setIsHistoryOpen(true);
                }
              }
            ]}
            loading={searchLoading}
          />
        </div>

      </div>

      {/* Case Sheet History Modal */}
      <Modal isOpen={isHistoryOpen} onClose={() => { setIsHistoryOpen(false); setSelectedPatient(null); }} title="Outpatient Case Sheet History">
        {selectedPatient && (
          <div className="space-y-4 text-left">
            
            {/* Patient Header Block */}
            <div className="p-3.5 bg-slate-50 border border-[#E5E7EB] rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Patient Name</span>
                <strong className="text-[#111827] text-xs block mt-0.5 font-sans">{selectedPatient.name}</strong>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">UHID Number</span>
                <strong className="text-[#2F63F2] text-xs block mt-0.5">{selectedPatient.uhid}</strong>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Age / Gender</span>
                <strong className="text-slate-700 text-xs block mt-0.5">{selectedPatient.age ? `${selectedPatient.age} Yrs` : 'N/A'} / {selectedPatient.gender || 'N/A'}</strong>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Blood Type</span>
                <strong className="text-slate-700 text-xs block mt-0.5">{selectedPatient.bloodGroup || 'N/A'}</strong>
              </div>
            </div>

            {/* Past Visits Timeline list */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Visit History Records</h3>
              
              {historyLoading ? (
                <div className="text-center py-6 text-slate-400 text-xs font-bold font-mono">Retrieving medical timeline logs...</div>
              ) : historyList && historyList.length > 0 ? (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {historyList.map((visit, idx) => (
                    <div key={visit._id || idx} className="p-4 bg-white border border-[#E5E7EB] rounded-2xl text-left space-y-2.5 shadow-xs hover:border-[#2F63F2] transition-colors">
                      
                      {/* Visit Date and Doctor Room */}
                      <div className="flex justify-between items-center border-b pb-2 border-[#E5E7EB]">
                        <span className="text-[10px] font-bold text-[#2F63F2] font-mono bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-lg">
                          Date: {new Date(visit.createdAt).toLocaleDateString()} {new Date(visit.createdAt).toLocaleTimeString()}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 font-mono">
                          Clinician: {visit.doctorId?.name || 'Assigned doctor'}
                        </span>
                      </div>

                      {/* Vitals Summary */}
                      {visit.appointmentId?.vitals && (
                        <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl grid grid-cols-3 gap-2 text-[10px] font-mono text-indigo-700">
                          <div>BP: <strong>{visit.appointmentId.vitals.bpSystolic}/{visit.appointmentId.vitals.bpDiastolic} mmHg</strong></div>
                          <div>Pulse: <strong>{visit.appointmentId.vitals.pulse} bpm</strong></div>
                          <div>Sugar: <strong>{visit.appointmentId.vitals.bloodSugar || '-'} mg/dL</strong></div>
                        </div>
                      )}

                      {/* Diagnosis & Clinical Notes */}
                      <div className="space-y-1 text-xs">
                        <p className="text-[#111827]"><strong>Diagnosis:</strong> {visit.diagnosis}</p>
                        {visit.notes && <p className="text-slate-600"><strong>Case Notes:</strong> {visit.notes}</p>}
                        {visit.advice && <p className="text-slate-600"><strong>Advice/Tips:</strong> {visit.advice}</p>}
                      </div>

                      {/* Prescribed Medications */}
                      {visit.prescriptions && visit.prescriptions.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-dashed border-[#E5E7EB]">
                          <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Medications Prescribed</span>
                          <div className="space-y-1 text-[11px] font-mono text-slate-700">
                            {visit.prescriptions.map((med, medIdx) => (
                              <div key={medIdx} className="flex justify-between p-1.5 bg-slate-50 border border-[#E5E7EB] rounded-lg">
                                <span>💊 {med.medicineName || med.medicineId?.name}</span>
                                <span>{med.dosage} ({med.frequency}) - {med.duration} [{med.instructions}]</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-[#E5E7EB] text-center font-mono text-xs text-[#6B7280]">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                  No clinical consultation files found for this patient profile.
                </div>
              )}
            </div>

            {/* Prescriptions Section if separate */}
            {prescriptionsList && prescriptionsList.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-[#E5E7EB]">
                <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Prescription History</h3>
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {prescriptionsList.map((rx, idx) => (
                    <div key={rx._id || idx} className="p-3 bg-slate-50 border border-[#E5E7EB] rounded-xl text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between text-[10px] text-slate-500 font-bold border-b pb-1 border-slate-200">
                        <span>Date: {new Date(rx.createdAt).toLocaleDateString()}</span>
                        <span>Doctor: {rx.doctorId?.name || 'N/A'}</span>
                      </div>
                      {rx.items?.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex justify-between bg-white p-1.5 rounded border border-slate-200 text-[11px]">
                          <span className="font-bold text-slate-800">💊 {item.medicineName}</span>
                          <span className="text-slate-600">{item.dosage} | {item.duration} | {item.instructions}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </Modal>

    </div>
  );
};

export default DoctorPatientSearch;
