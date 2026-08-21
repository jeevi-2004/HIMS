import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import Table from '../components/Table';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import { HeartPulse } from 'lucide-react';

const ReceptionistVitalsIntake = () => {
  const [selectedApp, setSelectedApp] = useState(null);
  const [isVitalsOpen, setIsVitalsOpen] = useState(false);

  const [vitalsForm, setVitalsForm] = useState({
    weight: '',
    height: '',
    bpSystolic: '',
    bpDiastolic: '',
    pulse: '',
    temperature: '',
    spo2: '',
    bloodSugar: '',
    remarks: ''
  });

  // Fetch today's appointments
  const { data: appointments, isLoading: appLoading, refetch } = useQuery({
    queryKey: ['appointments', 'vitalsIntakeList'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/operations/appointments?date=${today}`);
      return res.data.data;
    }
  });

  // Filter only patients pending vitals
  const pendingVitalsApps = appointments?.filter(a => !a.vitals || (!a.vitals.bpSystolic && !a.vitals.pulse)) || [];

  // Log Vitals Mutation
  const logVitalsMutation = useMutation({
    mutationFn: async ({ id, vitals }) => {
      const res = await api.put(`/operations/appointments/${id}/vitals`, { vitals });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Patient vitals logged successfully!');
      setIsVitalsOpen(false);
      setSelectedApp(null);
      setVitalsForm({ weight: '', height: '', bpSystolic: '', bpDiastolic: '', pulse: '', temperature: '', spo2: '', bloodSugar: '', remarks: '' });
      refetch();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to record vitals');
    }
  });

  const [vitalsErrors, setVitalsErrors] = useState({});

  const handleVitalsSubmit = (e) => {
    e.preventDefault();
    if (!selectedApp) return;

    const errs = {};
    const sys = Number(vitalsForm.bpSystolic);
    const dia = Number(vitalsForm.bpDiastolic);
    const pls = Number(vitalsForm.pulse);

    if (!vitalsForm.bpSystolic || isNaN(sys) || sys < 50 || sys > 250) {
      errs.bpSystolic = 'Valid Systolic BP (50-250) required.';
    }
    if (!vitalsForm.bpDiastolic || isNaN(dia) || dia < 30 || dia > 180) {
      errs.bpDiastolic = 'Valid Diastolic BP (30-180) required.';
    }
    if (!vitalsForm.pulse || isNaN(pls) || pls < 30 || pls > 220) {
      errs.pulse = 'Valid Pulse Rate (30-220 bpm) required.';
    }

    if (Object.keys(errs).length > 0) {
      setVitalsErrors(errs);
      return;
    }
    setVitalsErrors({});

    // Calculate BMI if height and weight exist
    let bmi = undefined;
    if (vitalsForm.weight && vitalsForm.height) {
      const heightInMeters = parseFloat(vitalsForm.height) / 100;
      bmi = parseFloat((parseFloat(vitalsForm.weight) / (heightInMeters * heightInMeters)).toFixed(2));
    }

    logVitalsMutation.mutate({
      id: selectedApp._id,
      vitals: {
        ...vitalsForm,
        bmi
      }
    });
  };

  return (
    <div className="space-y-8 text-left">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vitals Intake</h1>
        <p className="text-xs text-slate-500 font-medium mt-2">
          Record physical metrics and check-in complaints for active patients.
        </p>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
        <Table
          headers={[
            { key: 'tokenNumber', label: 'Token', render: (row) => <span className="font-extrabold text-[#2F63F2] font-mono">{row.tokenNumber || 'N/A'}</span> },
            { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold font-mono text-slate-700">{row.patientId?.uhid}</span> },
            { key: 'patientId.name', label: 'Patient Name', render: (row) => <span className="font-bold text-slate-800">{row.patientId?.name}</span> },
            { key: 'doctorId.name', label: 'Assigned Room', render: (row) => <span className="font-semibold text-slate-600">{row.doctorId?.name || 'N/A'}</span> },
            { key: 'consultationType', label: 'Intake Mode' },
            { 
              key: 'vitalsStatus', 
              label: 'Vitals Triage', 
              render: () => (
                <span className="text-[9px] font-bold border border-rose-100 bg-rose-50 text-rose-600 px-2.5 py-1 rounded-xl uppercase tracking-wider">
                  Pending Vitals
                </span>
              )
            }
          ]}
          data={pendingVitalsApps}
          actions={[
            {
              label: 'Record Vitals',
              icon: HeartPulse,
              onClick: (row) => {
                setSelectedApp(row);
                setIsVitalsOpen(true);
              }
            }
          ]}
          loading={appLoading}
        />
      </div>

      {/* Log Vitals Modal */}
      <Modal isOpen={isVitalsOpen} onClose={() => { setIsVitalsOpen(false); setSelectedApp(null); }} title="🩺 Log Patient Intake Vitals">
        <form onSubmit={handleVitalsSubmit} className="space-y-4 text-left">
          {selectedApp && (
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs flex justify-between font-bold text-indigo-700">
              <span>Patient: {selectedApp.patientId?.name}</span>
              <span>ID: {selectedApp.patientId?.uhid}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Blood Pressure - Systolic (mmHg)" 
              placeholder="e.g. 120" 
              value={vitalsForm.bpSystolic} 
              onChange={(e) => {
                setVitalsForm({ ...vitalsForm, bpSystolic: e.target.value });
                if (vitalsErrors.bpSystolic) setVitalsErrors(prev => ({ ...prev, bpSystolic: undefined }));
              }} 
              required
              error={vitalsErrors.bpSystolic}
            />
            <Input 
              label="Blood Pressure - Diastolic (mmHg)" 
              placeholder="e.g. 80" 
              value={vitalsForm.bpDiastolic} 
              onChange={(e) => {
                setVitalsForm({ ...vitalsForm, bpDiastolic: e.target.value });
                if (vitalsErrors.bpDiastolic) setVitalsErrors(prev => ({ ...prev, bpDiastolic: undefined }));
              }} 
              required
              error={vitalsErrors.bpDiastolic}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input 
              label="Pulse Rate (bpm)" 
              placeholder="e.g. 72" 
              value={vitalsForm.pulse} 
              onChange={(e) => {
                setVitalsForm({ ...vitalsForm, pulse: e.target.value });
                if (vitalsErrors.pulse) setVitalsErrors(prev => ({ ...prev, pulse: undefined }));
              }} 
              required
              error={vitalsErrors.pulse}
            />
            <Input 
              label="Weight (kg)" 
              placeholder="e.g. 70" 
              value={vitalsForm.weight} 
              onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })} 
              required
            />
            <Input 
              label="Height (cm)" 
              placeholder="e.g. 175" 
              value={vitalsForm.height} 
              onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })} 
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input 
              label="Body Temp (°C)" 
              placeholder="e.g. 36.8" 
              value={vitalsForm.temperature} 
              onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })} 
            />
            <Input 
              label="Oxygen SpO2 (%)" 
              placeholder="e.g. 98" 
              value={vitalsForm.spo2} 
              onChange={(e) => setVitalsForm({ ...vitalsForm, spo2: e.target.value })} 
            />
            <Input 
              label="Blood Sugar (mg/dL)" 
              placeholder="e.g. 90" 
              value={vitalsForm.bloodSugar} 
              onChange={(e) => setVitalsForm({ ...vitalsForm, bloodSugar: e.target.value })} 
            />
          </div>

          <Input 
            label="Remarks / Intake Complaints" 
            placeholder="e.g. Cough for 3 days, mild headache..." 
            value={vitalsForm.remarks} 
            onChange={(e) => setVitalsForm({ ...vitalsForm, remarks: e.target.value })} 
          />

          <Button type="submit" variant="primary" className="w-full py-2.5 font-bold uppercase tracking-wider" loading={logVitalsMutation.isPending}>
            Record Vitals & Triage Status
          </Button>
        </form>
      </Modal>

    </div>
  );
};

export default ReceptionistVitalsIntake;
