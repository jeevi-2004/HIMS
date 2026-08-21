import React from 'react';
import { useBillingSettings } from '../../context/BillingSettingsContext';
import { 
  Megaphone, Clock, AlertTriangle, DoorOpen, Eye, Stethoscope, Pill, CreditCard 
} from 'lucide-react';

const WorkflowPrimaryActionButton = ({ 
  appointment, 
  role = 'Reception', 
  allAppointments = [], 
  onAction, 
  className = '' 
}) => {
  const { getAppointmentActions, getQueueEvaluation } = useBillingSettings();

  if (!appointment) return null;

  const status = appointment.status || appointment.queueStatus || 'Waiting';
  const qState = (appointment.workflow?.queueState || appointment.queueStatus || status || 'WAITING').toUpperCase();
  const isWaiting = qState === 'WAITING' || qState === 'SCHEDULED' || qState === 'ADMITTED';

  const evaluated = getAppointmentActions(appointment, role);
  const qEval = getQueueEvaluation(appointment, allAppointments);

  // Determine button state, icon, and text
  let label = 'View';
  let icon = Eye;
  let disabled = false;
  let variant = 'primary'; // 'primary' | 'secondary' | 'disabled'

  if (qState === 'CALLED') {
    label = 'Sent to Doctor';
    icon = DoorOpen;
    disabled = true;
    variant = 'disabled';
  } else if (qState === 'IN_CONSULTATION' || qState === 'IN-CONSULTATION') {
    if (role === 'Doctor') {
      label = 'Continue Consultation';
      icon = Stethoscope;
      disabled = false;
    } else {
      label = 'In Progress';
      icon = Eye;
      disabled = false;
    }
  } else if (qState === 'SENT_TO_PHARMACY' || qState === 'SENT TO PHARMACY') {
    if (role === 'Pharmacy') {
      label = 'Dispense Medicines';
      icon = Pill;
      disabled = false;
    } else {
      label = 'View';
      icon = Eye;
      disabled = false;
    }
  } else if (qState === 'COMPLETED') {
    label = 'View';
    icon = Eye;
    disabled = false;
  } else if (isWaiting) {
    if (!evaluated.actions.canCallPatient && role === 'Reception') {
      label = 'Payment Required';
      icon = AlertTriangle;
      disabled = true;
      variant = 'disabled';
    } else if (qEval && !qEval.canCall) {
      label = 'Waiting Previous Token';
      icon = Clock;
      disabled = true;
      variant = 'disabled';
    } else if (role === 'Doctor' && !evaluated.actions.canStartConsultation) {
      label = '🔒 Payment Pending';
      icon = AlertTriangle;
      disabled = true;
      variant = 'disabled';
    } else if (role === 'Doctor') {
      label = '▶ Start Consultation';
      icon = Stethoscope;
      disabled = false;
    } else {
      label = '🖨 Print Token';
      icon = Ticket;
      disabled = false;
    }
  }

  const baseStyle = variant === 'disabled' || disabled
    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-80'
    : 'bg-[#2F63F2] text-white hover:bg-blue-700 active:scale-[0.98] shadow-xs cursor-pointer';

  const IconComp = icon;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && onAction) onAction(appointment);
      }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl font-sans transition-all ${baseStyle} ${className}`}
    >
      <IconComp className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
};

export default WorkflowPrimaryActionButton;
