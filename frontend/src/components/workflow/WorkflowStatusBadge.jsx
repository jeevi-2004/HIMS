import React from 'react';
import { 
  Clock, ShieldCheck, DoorOpen, Activity, Pill, AlertTriangle, 
  XCircle, UserX, RotateCcw, CheckCircle2, ChevronRight
} from 'lucide-react';

const STATUS_CONFIGS = {
  'WAITING': { label: 'Waiting', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
  'WAITING_PAYMENT': { label: 'Payment Required', color: 'bg-amber-50 text-amber-800 border-amber-300 font-bold', icon: AlertTriangle },
  'READY': { label: 'Ready', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold', icon: CheckCircle2 },
  'CALLED': { label: 'Called / Sent to Doctor', color: 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold', icon: DoorOpen },
  'IN_CONSULTATION': { label: 'In Consultation', color: 'bg-purple-50 text-purple-700 border-purple-200 font-bold', icon: Activity },
  'SENT_TO_PHARMACY': { label: 'Sent to Pharmacy', color: 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold', icon: Pill },
  'DISPENSING': { label: 'Pharmacy Dispensing', color: 'bg-purple-100 text-purple-800 border-purple-300 font-bold', icon: Pill },
  'COMPLETED': { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold', icon: ShieldCheck },
  'SKIPPED': { label: 'Skipped', color: 'bg-amber-50 text-amber-700 border-amber-200 font-medium', icon: RotateCcw },
  'CANCELLED': { label: 'Cancelled', color: 'bg-rose-50 text-rose-700 border-rose-200 font-medium', icon: XCircle },
  'NO_SHOW': { label: 'No Show', color: 'bg-slate-100 text-slate-600 border-slate-200 font-medium', icon: UserX }
};

const WorkflowStatusBadge = ({ status, queueStatus, billingStatus, workflow, className = '' }) => {
  const rawStatus = (workflow?.queueState || queueStatus || status || 'WAITING').toUpperCase();
  
  let key = rawStatus;
  if (rawStatus === 'WAITING' || rawStatus === 'SCHEDULED' || rawStatus === 'ADMITTED') {
    const isUnpaid = billingStatus === 'Unpaid' || workflow?.paymentState === 'PENDING';
    key = isUnpaid ? 'WAITING_PAYMENT' : 'READY';
  } else if (rawStatus === 'IN-CONSULTATION' || rawStatus === 'IN CONSULTATION') {
    key = 'IN_CONSULTATION';
  } else if (rawStatus === 'SENT TO PHARMACY' || rawStatus === 'SENT_TO_PHARMACY') {
    key = 'SENT_TO_PHARMACY';
  } else if (rawStatus === 'NO SHOW' || rawStatus === 'NO_SHOW') {
    key = 'NO_SHOW';
  }

  const config = STATUS_CONFIGS[key] || STATUS_CONFIGS['WAITING'];
  const IconComponent = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] uppercase tracking-wider border font-sans font-semibold transition-all ${config.color} ${className}`}>
      {IconComponent && <IconComponent className="w-3 h-3 shrink-0" />}
      <span>{config.label}</span>
    </span>
  );
};

export default WorkflowStatusBadge;
