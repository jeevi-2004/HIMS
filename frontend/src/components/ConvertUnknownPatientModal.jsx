import React, { useState } from 'react';
import { UserCheck, X, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const ConvertUnknownPatientModal = ({ isOpen, onClose, patient, onSuccess }) => {
  if (!isOpen || !patient) return null;

  const [form, setForm] = useState({
    name: '',
    mobileNumber: '',
    gender: patient.gender || 'Male',
    age: patient.age || '35',
    address: '',
    aadhaarNumber: ''
  });

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Please enter patient real name');
      return;
    }
    if (!form.mobileNumber.trim() || form.mobileNumber.length < 10) {
      toast.error('Please enter valid 10-digit mobile number');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        mobileNumber: form.mobileNumber.trim(),
        gender: form.gender,
        age: parseInt(form.age, 10) || 30,
        address: form.address.trim(),
        aadhaarNumber: form.aadhaarNumber.trim(),
        isUnknownPatient: false
      };

      await api.put(`/operations/patients/${patient._id}`, payload);
      toast.success(`Converted ${patient.name} to permanent record: ${form.name}!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to convert unknown patient');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 font-sans select-none">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs cursor-pointer" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 border border-slate-200 z-10 text-left space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Convert Unknown Emergency Patient</h3>
              <p className="text-xs text-slate-500 mt-0.5">Merge temporary record into permanent profile</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Temporary Record Info */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 flex justify-between items-center">
          <div>
            <span>Temporary Name: <strong>{patient.name}</strong></span>
            <div className="text-[10px] font-mono text-amber-700 mt-0.5">ID: {patient.tempId || patient.uhid || 'EMG-TEMP'}</div>
          </div>
          <span className="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">
            UNKNOWN PATIENT
          </span>
        </div>

        {/* Permanent Profile Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
              Real Patient Full Name *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Ramesh Kumar"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
                Mobile Number *
              </label>
              <input
                type="tel"
                maxLength={10}
                required
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                placeholder="10-digit mobile"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
                Confirmed Age
              </label>
              <input
                type="number"
                min="1"
                max="120"
                onWheel={(e) => e.target.blur()}
                onKeyDown={(e) => { if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') e.preventDefault(); }}
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value.replace(/[^0-9]/g, '') })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
              Residential Address
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="House, Street, City"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20 focus:border-[#3563F6]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? 'Converting...' : 'Convert to Permanent Patient'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConvertUnknownPatientModal;
