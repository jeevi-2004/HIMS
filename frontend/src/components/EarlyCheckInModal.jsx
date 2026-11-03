import React from 'react';
import Modal from './Modal';
import Button from './Button';
import {
  Calendar, Clock, User, Stethoscope, AlertTriangle,
  UserCheck, ArrowRight, CheckCircle2, MapPin
} from 'lucide-react';

const EarlyCheckInModal = ({
  isOpen,
  onClose,
  appointment,
  onConfirm,
  isLoading = false
}) => {
  if (!isOpen || !appointment) return null;

  const patient = appointment.patientId || {};
  const doctor = appointment.doctorId || {};

  const patientName = patient.name || appointment.patientName || 'Patient';
  const uhid = patient.uhid || appointment.uhid || 'N/A';
  const age = patient.age || appointment.age || '—';
  const gender = patient.gender || appointment.gender || '—';
  const mobile = patient.mobileNumber || appointment.mobileNumber || '—';

  const rawDoctorName = doctor.name || appointment.doctorName || 'Assigned Doctor';
  const cleanDoctorName = String(rawDoctorName).replace(/^(Dr\.?\s*)+/i, '').trim();
  const doctorDept = doctor.departmentId?.name || doctor.department || appointment.department || 'General Medicine';

  // Format Scheduled Date nicely (e.g., "Sunday, 25 Oct 2026")
  let formattedScheduledDate = 'Scheduled Date';
  if (appointment.date) {
    try {
      const d = new Date(appointment.date);
      if (!isNaN(d.getTime())) {
        formattedScheduledDate = d.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }
    } catch (_) {}
  }

  // Format Today's Date nicely
  const today = new Date();
  const formattedTodayDate = today.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const scheduledTime = appointment.time || appointment.appointmentSlot?.startTime || 'As Scheduled';
  const daysEarly = appointment.daysEarly || 1;
  const visitType = appointment.consultationType || 'Follow-up Checkup';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CONFIRM EARLY ARRIVAL CHECK-IN"
      size="lg"
      closeOnOverlayClick={!isLoading}
    >
      <div className="space-y-4 text-left font-sans">
        {/* Early Arrival Alert Card */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300 text-amber-950 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-200/80 text-amber-800 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h4 className="font-extrabold text-sm text-amber-950">
                  Patient Arrived Before Scheduled Date
                </h4>
                <p className="text-xs text-amber-800/90 font-medium">
                  Physically present at Reception ahead of scheduled day
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300 shrink-0">
              {daysEarly} {daysEarly === 1 ? 'Day' : 'Days'} Early
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-amber-200/80 text-xs">
            <div className="flex items-center gap-2 text-amber-900">
              <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
              <span><strong>Scheduled Date:</strong> {formattedScheduledDate}</span>
            </div>
            <div className="flex items-center gap-2 text-amber-900">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span><strong>Slot Time:</strong> {scheduledTime}</span>
            </div>
          </div>
        </div>

        {/* Patient & Doctor Two-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Patient Details Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <User className="w-4 h-4 text-[#2F63F2]" />
              <span>Patient Information</span>
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-sm">{patientName}</div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">UHID: {uhid}</div>
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1 text-xs text-slate-600 border-t border-slate-200/60">
              <div><span className="text-slate-400">Age/Gender:</span> <strong className="text-slate-700">{age}Y / {gender}</strong></div>
              <div><span className="text-slate-400">Mobile:</span> <strong className="text-slate-700 font-mono">{mobile}</strong></div>
            </div>
            <div className="text-[11px] text-slate-500 bg-white p-2 rounded-xl border border-slate-200/60">
              <span className="font-semibold text-slate-600">Type:</span> {visitType}
            </div>
          </div>

          {/* Assigned Doctor Card */}
          <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-800 uppercase tracking-wider">
              <Stethoscope className="w-4 h-4 text-blue-600" />
              <span>Assigned Consulting Doctor</span>
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-sm">Dr. {cleanDoctorName}</div>
              <div className="text-xs text-blue-700 font-medium mt-0.5">{doctorDept}</div>
            </div>
            <div className="p-2 bg-white/80 rounded-xl border border-blue-100 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 text-blue-900 font-bold mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Doctor Desk Live Routing</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Checking in will immediately route this patient to <strong>Dr. {cleanDoctorName}</strong>'s waiting queue today.
              </p>
            </div>
          </div>
        </div>

        {/* Workflow Confirmation Details Box */}
        <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl text-xs space-y-1.5">
          <div className="font-bold text-emerald-900 flex items-center gap-1.5">
            <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Actions upon Confirmation:</span>
          </div>
          <ul className="text-slate-700 space-y-1 pl-5 list-disc text-[11px]">
            <li>Update appointment date to <strong>Today ({formattedTodayDate})</strong>.</li>
            <li>Assign an OPD Token Number for today.</li>
            <li>Set patient status to <strong>Waiting</strong> and trigger normal OPD consultation flow.</li>
          </ul>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            className="text-xs px-5 h-[42px] cursor-pointer"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            loading={isLoading}
            disabled={isLoading}
            className="text-xs px-6 h-[42px] bg-[#2F63F2] hover:bg-[#1E4FD9] font-bold shadow-md cursor-pointer flex items-center gap-2"
          >
            <UserCheck className="w-4 h-4" />
            <span>Confirm Check-In Today</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default EarlyCheckInModal;
