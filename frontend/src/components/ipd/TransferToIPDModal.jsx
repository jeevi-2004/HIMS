import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bed,
  User,
  Clock,
  Calendar,
  AlertCircle,
  Check,
  Stethoscope,
  Building2,
  Phone,
  FileText,
  RotateCw,
  Hash,
  ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import api from '../../services/api';
import ipdService from '../../services/ipd/ipdService';
import { useAuth } from '../../context/AuthContext';
import { isIpdAvailable } from '../../utils/featureUtils';
import { ROUTES } from '../../constants/routes';

/**
 * TransferToIPDModal
 * Interactive Ward & Bed collection modal for transferring OPD patients to IPD.
 * Guarantees that patients are assigned a vacant ward & bed BEFORE redirecting to IPD.
 */
const TransferToIPDModal = ({
  isOpen,
  onClose,
  appointment,
  onSuccess
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

  // Form State
  const [selectedWardId, setSelectedWardId] = useState('all');
  const [selectedBedId, setSelectedBedId] = useState('');
  const [attendingDoctorId, setAttendingDoctorId] = useState('');
  const [admissionDate, setAdmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [admissionTime, setAdmissionTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [reasonForAdmission, setReasonForAdmission] = useState('');
  const [admissionNotes, setAdmissionNotes] = useState('');
  const [admissionType, setAdmissionType] = useState('OPD Transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Fetch Hospital Wards
  const { data: wards = [], isLoading: isLoadingWards } = useQuery({
    queryKey: ['ipd-wards'],
    queryFn: async () => {
      const res = await api.get('/ipd/wards');
      return res.data || [];
    },
    enabled: Boolean(isOpen && isIpdEnabled)
  });

  // Fetch Available Beds
  const { data: allBeds = [], isLoading: isLoadingBeds } = useQuery({
    queryKey: ['ipd-beds'],
    queryFn: async () => {
      const res = await api.get('/ipd/beds');
      return res.data || [];
    },
    enabled: Boolean(isOpen && isIpdEnabled)
  });

  // Filter beds that are strictly Available
  const availableBeds = useMemo(() => {
    return allBeds.filter(b => b.status === 'Available');
  }, [allBeds]);

  // Filter available beds by the currently selected ward (if not 'all')
  const filteredBeds = useMemo(() => {
    if (!selectedWardId || selectedWardId === 'all') {
      return availableBeds;
    }
    return availableBeds.filter(b => {
      const wId = b.wardId?._id || b.wardId;
      return String(wId) === String(selectedWardId);
    });
  }, [availableBeds, selectedWardId]);

  // Calculate available bed count per ward
  const wardBedCounts = useMemo(() => {
    const counts = {};
    for (const b of availableBeds) {
      const wId = String(b.wardId?._id || b.wardId || 'other');
      counts[wId] = (counts[wId] || 0) + 1;
    }
    return counts;
  }, [availableBeds]);

  // Fetch Doctors for Attending Doctor assignment
  const { data: doctors = [] } = useQuery({
    queryKey: ['ipd-doctors'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR,DOCTOR_ADMIN');
      return res.data?.data || res.data || [];
    },
    enabled: isOpen
  });

  // Pre-fill form when appointment changes or modal opens
  useEffect(() => {
    if (appointment && isOpen) {
      const docId = appointment.doctorId?._id ||
        (typeof appointment.doctorId === 'string' ? appointment.doctorId : null) ||
        user?._id ||
        '';

      const rawDoc = (typeof appointment.doctorId === 'object' && appointment.doctorId?.name)
        ? appointment.doctorId.name
        : (appointment.doctorName || user?.name || 'Attending Doctor');
      const cleanDoc = rawDoc.toLowerCase().startsWith('dr.') ? rawDoc : `Dr. ${rawDoc}`;

      const complaint = appointment.chiefComplaint || appointment.reason || appointment.symptoms || '';
      const existingDocNotes = appointment.clinicalNotes || appointment.notes || appointment.consultationId?.clinicalNotes || '';
      const tokenStr = appointment.tokenNumber || appointment.tokenNo || '-';
      const transferAudit = `Transferred from OPD Token #${tokenStr} (${cleanDoc}) on ${new Date().toLocaleDateString('en-GB')}`;
      const initialAdmissionNotes = existingDocNotes ? `${existingDocNotes} · ${transferAudit}` : transferAudit;

      setSelectedWardId('all');
      setSelectedBedId('');
      setAttendingDoctorId(docId);
      setAdmissionDate(new Date().toISOString().slice(0, 10));
      setAdmissionTime(new Date().toTimeString().slice(0, 5));
      setReasonForAdmission(complaint || 'Transferred from OPD Queue to IPD');
      setAdmissionNotes(initialAdmissionNotes);
      setAdmissionType('OPD Transfer');
      setFormErrors({});
    }
  }, [appointment, isOpen, user]);

  // Auto-select vacant bed if exactly one bed is available in the current selection
  useEffect(() => {
    if (isOpen && !selectedBedId && filteredBeds.length === 1) {
      setSelectedBedId(filteredBeds[0]._id);
    }
  }, [isOpen, filteredBeds, selectedBedId]);

  if (!isOpen || !appointment || !isIpdEnabled) return null;

  // Extract patient details with resilient fallbacks for all data schemas
  const patient = (appointment.patientId && typeof appointment.patientId === 'object')
    ? appointment.patientId
    : (appointment.patient && typeof appointment.patient === 'object')
    ? appointment.patient
    : {};
  const patientName = patient.name || appointment.patientName || appointment.name || 'Patient';
  const uhid = patient.uhid || appointment.uhid || '—';
  const age = patient.age || appointment.age;
  const gender = patient.gender || appointment.gender;
  const mobile = patient.mobileNumber || appointment.mobileNumber || appointment.mobile;
  const tokenNumber = appointment.tokenNumber || appointment.tokenNo || '—';
  const patientId = 
    (patient._id ? String(patient._id) : null) ||
    (patient.id ? String(patient.id) : null) ||
    (appointment.patientId ? (typeof appointment.patientId === 'object' && appointment.patientId._id ? String(appointment.patientId._id) : String(appointment.patientId)) : null) ||
    (appointment.patient?._id ? String(appointment.patient._id) : null) ||
    (appointment.patient?.id ? String(appointment.patient.id) : null);

  const handleConfirmTransfer = async (e) => {
    e?.preventDefault();

    const errors = {};
    if (availableBeds.length === 0) {
      toast.error('No vacant beds are currently available in the hospital. Please add or free a bed first.');
      return;
    }
    if (!selectedBedId) {
      errors.bedId = 'Please select a vacant bed to assign the patient.';
    }
    if (!attendingDoctorId) {
      errors.attendingDoctorId = 'Please select an attending doctor.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (errors.bedId) toast.error('Please assign an available bed for the patient');
      else if (errors.attendingDoctorId) toast.error('Please select an attending doctor');
      return;
    }

    if (!patientId) {
      toast.error('Patient record is missing. Cannot transfer to IPD.');
      return;
    }

    setIsSubmitting(true);
    try {
      const admissionPayload = {
        patientId,
        bedId: selectedBedId,
        attendingDoctorId: attendingDoctorId || undefined,
        reasonForAdmission: reasonForAdmission.trim(),
        admissionNotes: admissionNotes.trim(),
        admissionType,
        queueStatus: 'Waiting',
        status: 'Admitted',
        admissionDate,
        admissionTime
      };

      const res = await ipdService.admitPatient(admissionPayload);

      // Transition OPD appointment queue status to 'Admitted'
      const apptId = appointment._id || appointment.id;
      if (apptId) {
        try {
          await api.put(`/operations/appointments/${apptId}/queue`, {
            status: 'Admitted',
            queueStatus: 'Admitted'
          });
        } catch (e) {
          console.warn('OPD appointment status transition info:', e);
        }
      }

      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['ipd'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });
      queryClient.invalidateQueries({ queryKey: ['ipd', 'departmentDashboard'] });

      const chosenBed = availableBeds.find(b => b._id === selectedBedId);
      const bedLabel = chosenBed
        ? `${chosenBed.wardId?.name || 'Ward'} - Bed ${chosenBed.bedNumber}`
        : 'Bed';

      toast.success(`${patientName} assigned to ${bedLabel} and transferred to IPD!`);

      onClose();
      if (onSuccess) onSuccess(res);

      // Desk-aware redirection
      const userRole = (user?.roleId?.name || user?.role || '').toUpperCase();
      const isDoctorDesk = location.pathname.startsWith('/doctor') ||
        (['DOCTOR', 'DOCTOR_ADMIN'].includes(userRole) && !location.pathname.startsWith('/reception'));

      const targetRoute = isDoctorDesk
        ? (ROUTES.DOCTOR?.IPD_DEPARTMENT || '/doctor/ipd')
        : (ROUTES.RECEPTION?.IPD_DEPARTMENT || '/reception/ipd');

      navigate(targetRoute);
    } catch (err) {
      console.error('Transfer to IPD error:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Failed to transfer patient to IPD';
      if (errorMsg.includes('already actively admitted')) {
        toast.info(`${patientName} is already admitted in IPD. Opening IPD Department...`);
        onClose();
        const userRole = (user?.roleId?.name || user?.role || '').toUpperCase();
        const isDoctorDesk = location.pathname.startsWith('/doctor') ||
          (['DOCTOR', 'DOCTOR_ADMIN'].includes(userRole) && !location.pathname.startsWith('/reception'));
        navigate(isDoctorDesk ? (ROUTES.DOCTOR?.IPD_DEPARTMENT || '/doctor/ipd') : (ROUTES.RECEPTION?.IPD_DEPARTMENT || '/reception/ipd'));
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      title="Transfer Patient to IPD"
      size="lg"
      className="!max-w-[580px] overflow-hidden"
    >
      <form onSubmit={handleConfirmTransfer} className="space-y-4">
        {/* ==================================================
            1. PATIENT SUMMARY BANNER
            ================================================== */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-50/80 to-indigo-50/50 border border-blue-200/80 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#2F63F2] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0 mt-0.5">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {patientName}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-blue-100/80 text-[#2F63F2] font-mono shrink-0">
                    UHID: {uhid}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 mt-1 text-xs text-slate-600 flex-wrap">
                  {age && (
                    <span className="font-medium text-slate-700">
                      {age} Y / {gender || '—'}
                    </span>
                  )}
                  {mobile && (
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[11px]">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {mobile}
                    </span>
                  )}
                  <span className="text-indigo-700 font-semibold bg-indigo-100/70 px-1.5 py-0.2 rounded text-[10px]">
                    Token #{tokenNumber}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================
            2. WARD & BED ASSIGNMENT (PRIMARY WORKFLOW STEP)
            ================================================== */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-800">
              <Bed className="w-4 h-4 text-[#2F63F2]" />
              <span>Ward & Bed Allocation</span>
              <span className="text-rose-500 leading-none">*</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              {availableBeds.length} Vacant Bed{availableBeds.length !== 1 ? 's' : ''} in Hospital
            </span>
          </div>

          {/* Ward Filter / Selection */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Select Ward <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedWardId}
                onChange={(e) => {
                  setSelectedWardId(e.target.value);
                  setSelectedBedId(''); // Reset bed choice when ward changes
                  if (formErrors.bedId) setFormErrors({ ...formErrors, bedId: null });
                }}
                disabled={isLoadingWards}
                className="w-full h-9.5 px-3 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer appearance-none pr-8"
              >
                <option value="all">
                  All Wards ({availableBeds.length} vacant beds available)
                </option>
                {wards.map((ward) => {
                  const count = wardBedCounts[String(ward._id)] || 0;
                  return (
                    <option key={ward._id} value={ward._id}>
                      {ward.name} ({ward.type || 'General'}) — {count} bed{count !== 1 ? 's' : ''} vacant
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Bed Allocation Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Assign Vacant Bed <span className="text-rose-500">*</span>
              </label>
              {selectedBedId && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  Bed Selected
                </span>
              )}
            </div>

            {isLoadingBeds ? (
              <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-center gap-2 text-xs text-slate-500">
                <RotateCw className="w-4 h-4 text-[#2F63F2] animate-spin" />
                <span>Loading available beds...</span>
              </div>
            ) : filteredBeds.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">No vacant beds available</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    {selectedWardId !== 'all'
                      ? 'There are no vacant beds in this ward. Please select another ward or "All Wards".'
                      : 'All beds in the hospital are currently occupied or in maintenance.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedBedId}
                  onChange={(e) => {
                    setSelectedBedId(e.target.value);
                    if (formErrors.bedId) setFormErrors({ ...formErrors, bedId: null });
                  }}
                  required
                  className={`w-full h-9.5 px-3 rounded-xl border bg-white text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 cursor-pointer appearance-none pr-8 ${
                    formErrors.bedId
                      ? 'border-rose-400 text-rose-900 focus:border-rose-500'
                      : selectedBedId
                      ? 'border-[#2F63F2] text-[#2F63F2] bg-blue-50/20'
                      : 'border-slate-200 text-slate-800 focus:border-[#2F63F2]'
                  }`}
                >
                  <option value="">-- Click to Select Bed --</option>
                  {filteredBeds.map((bed) => {
                    const wardName = bed.wardId?.name || 'General Ward';
                    const wardType = bed.wardId?.type || 'Standard';
                    const rateStr = bed.dailyRate ? ` (₹${Number(bed.dailyRate).toLocaleString('en-IN')}/day)` : '';
                    return (
                      <option key={bed._id} value={bed._id}>
                        {wardName} — Bed {bed.bedNumber} [{wardType}]{rateStr}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {formErrors.bedId && (
              <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {formErrors.bedId}
              </p>
            )}
          </div>
        </div>

        {/* ==================================================
            3. ATTENDING DOCTOR & ADMISSION TIME
            ================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Attending Doctor */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Attending Doctor <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={attendingDoctorId}
                onChange={(e) => {
                  setAttendingDoctorId(e.target.value);
                  if (formErrors.attendingDoctorId) setFormErrors({ ...formErrors, attendingDoctorId: null });
                }}
                required
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer appearance-none pr-8"
              >
                <option value="">-- Select Doctor --</option>
                {doctors.map((doc) => {
                  const docName = doc.name || `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
                  const qual = doc.doctorProfile?.qualification ? ` (${doc.doctorProfile.qualification})` : '';
                  return (
                    <option key={doc._id} value={doc._id}>
                      {docName.startsWith('Dr.') ? docName : `Dr. ${docName}`}{qual}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {formErrors.attendingDoctorId && (
              <p className="text-[11px] text-rose-600 font-medium mt-0.5">{formErrors.attendingDoctorId}</p>
            )}
          </div>

          {/* Admission Type */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Admission Type
            </label>
            <div className="relative">
              <select
                value={admissionType}
                onChange={(e) => setAdmissionType(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer appearance-none pr-8"
              >
                <option value="OPD Transfer">OPD Transfer</option>
                <option value="Emergency Admission">Emergency Admission</option>
                <option value="Routine Admission">Routine Admission</option>
                <option value="Surgical Admission">Surgical Admission</option>
                <option value="Observation">Observation</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Date & Time Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Admission Date
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Admission Time
            </label>
            <div className="relative">
              <input
                type="time"
                required
                value={admissionTime}
                onChange={(e) => setAdmissionTime(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
              />
            </div>
          </div>
        </div>

        {/* ==================================================
            4. CLINICAL DETAILS & REASON FOR ADMISSION
            ================================================== */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
            Reason for Admission / Diagnosis
          </label>
          <input
            type="text"
            placeholder="e.g. Acute exacerbation, Pre-operative evaluation, Observation..."
            value={reasonForAdmission}
            onChange={(e) => {
              setReasonForAdmission(e.target.value);
              if (formErrors.reasonForAdmission) setFormErrors({ ...formErrors, reasonForAdmission: null });
            }}
            className={`w-full h-9 px-3 rounded-xl border bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 ${
              formErrors.reasonForAdmission
                ? 'border-rose-400 text-rose-900 focus:border-rose-500'
                : 'border-slate-200 text-slate-800 focus:border-[#2F63F2]'
            }`}
          />
          {formErrors.reasonForAdmission && (
            <p className="text-[11px] text-rose-600 font-medium mt-0.5">{formErrors.reasonForAdmission}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
            Admission Notes (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="Add any specific clinical instructions or transfer notes..."
            value={admissionNotes}
            onChange={(e) => setAdmissionNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] resize-none"
          />
        </div>

        {/* ==================================================
            5. MODAL FOOTER BUTTONS
            ================================================== */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#2F63F2] bg-white hover:bg-blue-50 active:bg-blue-100 text-[#2F63F2] text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="submit"
            onClick={handleConfirmTransfer}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
          >
            {isSubmitting ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin text-white" />
                <span>Assigning Bed & Transferring...</span>
              </>
            ) : (
              <>
                <Bed className="w-4 h-4 text-white" />
                <span>Assign Bed & Transfer to IPD</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TransferToIPDModal;
