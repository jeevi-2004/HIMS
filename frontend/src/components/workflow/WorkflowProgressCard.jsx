import React from 'react';
import WorkflowStatusBadge from './WorkflowStatusBadge';
import QueuePositionIndicator from './QueuePositionIndicator';
import { User, Clock, Calendar, Ticket } from 'lucide-react';

const WorkflowProgressCard = ({ appointment, allAppointments = [], className = '' }) => {
  if (!appointment) return null;

  const patientName = appointment.patientId?.name || 'Unknown Patient';
  const doctorName = appointment.doctorId?.name || 'Unassigned Doctor';
  const tokenNumber = appointment.tokenNumber || 'N/A';
  const billingStatus = appointment.billingStatus || 'Unpaid';

  return (
    <div className={`bg-white border border-[#E5E7EB] rounded-2xl p-4 space-y-3 shadow-xs font-sans ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-slate-800 text-sm truncate">{patientName}</span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-bold">
            UHID: {appointment.patientId?.uhid || 'N/A'}
          </span>
        </div>
        <span className="font-mono font-bold text-xs text-[#2F63F2] bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
          <Ticket className="w-3 h-3" /> #{tokenNumber}
        </span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{doctorName}</span>
        </div>
        <WorkflowStatusBadge appointment={appointment} />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500">
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono">{appointment.date ? new Date(appointment.date).toLocaleDateString() : 'Today'} {appointment.time}</span>
        </div>
        <QueuePositionIndicator appointment={appointment} allAppointments={allAppointments} />
      </div>
    </div>
  );
};

export default WorkflowProgressCard;
