import React from 'react';
import { useBillingSettings } from '../../context/BillingSettingsContext';
import { Clock, Megaphone, CheckCircle2 } from 'lucide-react';

const QueuePositionIndicator = ({ appointment, allAppointments = [], className = '' }) => {
  const { getQueueEvaluation } = useBillingSettings();

  if (!appointment) return null;

  const qEval = getQueueEvaluation(appointment, allAppointments);
  const qState = (appointment.workflow?.queueState || appointment.queueStatus || appointment.status || 'WAITING').toUpperCase();

  if (qState === 'CALLED') {
    return (
      <span className={`inline-flex items-center gap-1 text-[9px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-lg ${className}`}>
        <Megaphone className="w-3 h-3" /> Called
      </span>
    );
  }

  if (qState === 'IN_CONSULTATION' || qState === 'IN-CONSULTATION') {
    return (
      <span className={`inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg ${className}`}>
        <CheckCircle2 className="w-3 h-3" /> In Consultation
      </span>
    );
  }

  if (!qEval || qEval.queuePosition === null) {
    return (
      <span className={`inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg ${className}`}>
        <Clock className="w-3 h-3" /> Payment Pending
      </span>
    );
  }

  const isNext = qEval.canCall;

  return (
    <span 
      className={`inline-flex items-center gap-1 text-[9px] font-bold border px-2 py-0.5 rounded-lg ${
        isNext 
          ? 'bg-blue-50 text-[#2F63F2] border-blue-200 font-extrabold shadow-2xs' 
          : 'bg-slate-50 text-slate-500 border-slate-200'
      } ${className}`}
      title={qEval.blockedReason || `Queue position #${qEval.queuePosition}`}
    >
      <Clock className="w-3 h-3 shrink-0" />
      <span>#{qEval.queuePosition} {isNext ? 'Next' : 'Waiting Previous Token'}</span>
    </span>
  );
};

export default QueuePositionIndicator;
