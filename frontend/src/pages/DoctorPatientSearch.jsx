import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Card from '../components/Card';
import Table from '../components/Table';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { Search, Eye, AlertTriangle, UserCheck, ArrowLeft } from 'lucide-react';

const DoctorPatientSearch = () => {
  const navigate = useNavigate();
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
      try {
        const directRes = await api.get(`/operations/patients/${patientIdFromUrl}`);
        if (directRes.data?.data) return directRes.data.data;
      } catch (_) {}
      const res = await api.get(`/operations/patients/search?query=${encodeURIComponent(patientIdFromUrl)}`);
      const found = res.data.data?.find(p => String(p._id) === String(patientIdFromUrl) || String(p.uhid) === String(patientIdFromUrl));
      return found || null;
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
  const targetPatientId = selectedPatient?._id || patientIdFromUrl;
  const { data: patientHistoryData, isLoading: historyLoading } = useQuery({
    queryKey: ['doctorPatientHistory', targetPatientId],
    queryFn: async () => {
      if (!targetPatientId) return null;
      const res = await api.get(`/operations/patients/${targetPatientId}/history`);
      return res.data.data;
    },
    enabled: !!targetPatientId
  });

  // Always synchronize exact original patient details from history endpoint when available
  useEffect(() => {
    if (patientHistoryData?.patient) {
      setSelectedPatient(prev => {
        if (!prev) return patientHistoryData.patient;
        return {
          ...prev,
          ...patientHistoryData.patient,
          name: patientHistoryData.patient.name || prev.name,
          uhid: patientHistoryData.patient.uhid || prev.uhid,
          age: patientHistoryData.patient.age ?? prev.age,
          gender: patientHistoryData.patient.gender || prev.gender,
          bloodGroup: patientHistoryData.patient.bloodGroup || prev.bloodGroup
        };
      });
    }
  }, [patientHistoryData]);

  // Process history snapshots, consultations, and prescriptions into a unified timeline
  const historyList = useMemo(() => {
    if (!patientHistoryData) return [];
    if (Array.isArray(patientHistoryData)) return patientHistoryData;

    const snapshots = patientHistoryData.snapshots || [];
    const activeConsultations = patientHistoryData.consultations || [];
    const history = patientHistoryData.history || [];
    const combined = [...snapshots, ...activeConsultations, ...history];

    // Deduplicate by _id if needed
    const uniqueMap = new Map();
    combined.forEach(item => {
      if (item && item._id) {
        uniqueMap.set(String(item._id), item);
      }
    });

    const list = Array.from(uniqueMap.values());
    list.sort((a, b) => new Date(b.createdAt || b.date || Date.now()) - new Date(a.createdAt || a.date || Date.now()));
    return list;
  }, [patientHistoryData]);

  return (
    <div className="space-y-5 text-left px-4 sm:px-5 md:px-6 py-4 sm:py-5 bg-[#F8FAFC] min-h-screen">
      
      {/* Page Heading Outside Content Card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#E5E7EB]">
        <div>
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

        <Button
          onClick={() => navigate('/admin/patients')}
          variant="primary"
          icon={ArrowLeft}
          className="py-2 px-4 !text-xs font-bold tracking-wider shadow-sm !rounded-full shrink-0 self-start sm:self-auto"
        >
          DASHBOARD
        </Button>
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
              { 
                key: 'age', 
                label: 'Age / Gender', 
                render: (row) => {
                  const genderLetter = row.gender ? (row.gender.length === 1 ? row.gender.toUpperCase() : row.gender.charAt(0).toUpperCase()) : '';
                  const ageGenderText = row.age ? `${row.age} yrs / ${genderLetter || row.gender}` : (genderLetter || '—');
                  return (
                    <div className="flex flex-col items-start gap-0.5 whitespace-nowrap">
                      <span className="text-slate-700 font-semibold text-xs">{ageGenderText}</span>
                      {row.bloodGroup && row.bloodGroup !== 'Unknown' && row.bloodGroup !== 'N/A' && row.bloodGroup !== '—' ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-tight shadow-2xs">
                          {row.bloodGroup}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px] font-medium leading-tight">—</span>
                      )}
                    </div>
                  );
                }
              },
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
            actionsAlign="center"
            loading={searchLoading}
          />
        </div>

      </div>

      {/* Case Sheet History Modal */}
      <Modal 
        isOpen={isHistoryOpen} 
        onClose={() => { setIsHistoryOpen(false); setSelectedPatient(null); }} 
        title="Outpatient Case Sheet History"
        size="lg"
      >
        {(selectedPatient || patientHistoryData?.patient || historyLoading) && (
          <div className="space-y-4 text-left">
            
            {/* Patient Header Block */}
            <div className="p-3.5 sm:p-4 bg-slate-50/90 border border-[#E5E7EB] rounded-2xl grid grid-cols-2 sm:grid-cols-12 gap-3 text-xs">
              <div className="col-span-1 sm:col-span-4 min-w-0">
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Patient Name</span>
                <strong className="text-[#111827] text-xs block mt-1 font-sans font-bold truncate" title={selectedPatient?.name || patientHistoryData?.patient?.name || ''}>
                  {selectedPatient?.name || patientHistoryData?.patient?.name || (historyLoading ? 'Loading...' : '—')}
                </strong>
              </div>
              <div className="col-span-1 sm:col-span-4 min-w-0">
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">UHID Number</span>
                <strong className="text-[#2F63F2] text-xs block mt-1 font-mono font-semibold break-all" title={selectedPatient?.uhid || patientHistoryData?.patient?.uhid || ''}>
                  {selectedPatient?.uhid || patientHistoryData?.patient?.uhid || (historyLoading ? 'Loading...' : '—')}
                </strong>
              </div>
              <div className="col-span-1 sm:col-span-2 min-w-0">
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider whitespace-nowrap">Age / Gender</span>
                <strong className="text-slate-700 text-xs block mt-1 font-sans">
                  {((selectedPatient?.age ?? patientHistoryData?.patient?.age) !== undefined && (selectedPatient?.age ?? patientHistoryData?.patient?.age) !== null)
                    ? `${selectedPatient?.age ?? patientHistoryData?.patient?.age} Yrs` 
                    : 'N/A'} / {(selectedPatient?.gender || patientHistoryData?.patient?.gender || 'N/A')}
                </strong>
              </div>
              <div className="col-span-1 sm:col-span-2 min-w-0">
                <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider whitespace-nowrap">Blood Type</span>
                <strong className="text-slate-700 text-xs block mt-1 font-sans">
                  {selectedPatient?.bloodGroup || patientHistoryData?.patient?.bloodGroup || 'N/A'}
                </strong>
              </div>
            </div>

            {/* Past Visits Timeline list */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Visit History Records</h3>
              
              {historyLoading ? (
                <div className="text-center py-6 text-slate-400 text-xs font-bold font-mono">Retrieving medical timeline logs...</div>
              ) : historyList && historyList.length > 0 ? (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {historyList.map((visit, idx) => {
                    const visitDate = visit.createdAt || visit.date;
                    const vitalsObj = visit.vitals || visit.appointmentId?.vitals || {};
                    const hasRealVal = (v) => v && v !== '-' && v !== '--' && v !== 'N/A' && v !== '-/-';
                    const hasVitals = !!(
                      hasRealVal(vitalsObj.bpSystolic) ||
                      hasRealVal(vitalsObj.pulse) ||
                      hasRealVal(vitalsObj.bloodSugar) ||
                      hasRealVal(vitalsObj.temperature)
                    );
                    const rxItems = (visit.prescriptions && visit.prescriptions.length > 0) ? visit.prescriptions : (visit.items || []);

                    const formatVisitDate = (dateVal) => {
                      if (!dateVal) return 'N/A';
                      const d = new Date(dateVal);
                      if (isNaN(d.getTime())) return 'N/A';
                      const day = d.getDate();
                      const month = d.getMonth() + 1;
                      const year = d.getFullYear();
                      let hours = d.getHours();
                      const minutes = String(d.getMinutes()).padStart(2, '0');
                      const ampm = hours >= 12 ? 'pm' : 'am';
                      hours = hours % 12;
                      hours = hours ? String(hours).padStart(2, '0') : '12';
                      return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
                    };

                    return (
                      <div 
                        key={visit._id || idx} 
                        className={`p-4 bg-white border rounded-2xl text-left space-y-2.5 shadow-xs transition-colors ${
                          idx === 0 ? 'border-[#2F63F2]' : 'border-[#E5E7EB]'
                        }`}
                      >
                        {/* Visit Date, Status, and Clinician */}
                        <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-2 border-[#E5E7EB]">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#2F63F2] font-mono bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-lg">
                              Date: {formatVisitDate(visitDate)}
                            </span>
                            {visit.status && (
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
                                ['Completed', 'COMPLETED'].includes(visit.status)
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>
                                {visit.status}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 font-mono">
                            Clinician: {visit.doctorId?.name || visit.doctorName || 'Assigned doctor'}
                          </span>
                        </div>

                        {/* Vitals Summary (Only rendered when genuine clinical measurements exist) */}
                        {hasVitals && (
                          <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl grid grid-cols-3 gap-2 text-[10px] font-mono text-indigo-700">
                            <div>BP: <strong>{vitalsObj.bpSystolic || '-'}/{vitalsObj.bpDiastolic || '-'} mmHg</strong></div>
                            <div>Pulse: <strong>{vitalsObj.pulse || '-'} bpm</strong></div>
                            <div>Sugar: <strong>{vitalsObj.bloodSugar || '-'} mg/dL</strong></div>
                          </div>
                        )}

                        {/* Diagnosis & Investigations */}
                        <div className="space-y-1 text-xs">
                          <p className="text-[#111827]">
                            <strong>Diagnosis:</strong> {visit.diagnosis || visit.primaryDiagnosis || (Array.isArray(visit.diagnoses) && visit.diagnoses.join(', ')) || 'Clinical Consultation'}
                          </p>
                          {visit.investigations && visit.investigations.length > 0 && (
                            <p className="text-slate-600">
                              <strong>Investigations:</strong> {visit.investigations.map(inv => inv.name || inv.code).join(', ')}
                            </p>
                          )}
                          {(visit.clinicalNotes || visit.notes || visit.assessmentNotes) && (
                            <p className="text-slate-600">
                              <strong>Case Notes:</strong> {visit.clinicalNotes || visit.notes || visit.assessmentNotes}
                            </p>
                          )}
                          {(visit.advice || visit.dietAdvice || visit.generalInstructions) && (
                            <p className="text-slate-600">
                              <strong>Advice/Tips:</strong> {visit.advice || visit.dietAdvice || visit.generalInstructions}
                            </p>
                          )}
                        </div>

                        {/* Prescribed Medications */}
                        {rxItems && rxItems.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-dashed border-[#E5E7EB]">
                            <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Medications Prescribed</span>
                            <div className="space-y-1 text-[11px] font-mono text-slate-700">
                              {rxItems.map((med, medIdx) => (
                                <div key={medIdx} className="flex justify-between items-center p-2 bg-slate-50 border border-[#E5E7EB] rounded-lg">
                                  <span>💊 {med.medicineName || med.medicineId?.name}</span>
                                  <span>{med.dosage} ({med.frequency || 'OD'}) - {med.duration} [{med.instructions || med.foodTiming || 'As directed'}]</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-[#E5E7EB] text-center font-mono text-xs text-[#6B7280]">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                  No clinical consultation files found for this patient.
                </div>
              )}
            </div>

          </div>
        )}
      </Modal>

    </div>
  );
};

export default DoctorPatientSearch;
