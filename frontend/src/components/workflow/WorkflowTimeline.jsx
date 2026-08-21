import React from 'react';
import { 
  UserCheck, CreditCard, Clock, DoorOpen, Activity, Pill, ShieldCheck 
} from 'lucide-react';

const STAGES = [
  { key: 'registration', label: 'Registration', icon: UserCheck },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'ready', label: 'Queue Ready', icon: Clock },
  { key: 'called', label: 'Called', icon: DoorOpen },
  { key: 'consultation', label: 'Consultation', icon: Activity },
  { key: 'pharmacy', label: 'Pharmacy', icon: Pill },
  { key: 'completed', label: 'Completed', icon: ShieldCheck }
];

const getActiveStageIndex = (patient) => {
  if (!patient) return 0;
  const qState = (patient.workflow?.queueState || patient.queueStatus || patient.status || 'WAITING').toUpperCase();
  const pState = patient.billingStatus || patient.paymentStatus || patient.workflow?.paymentState;
  const isPaid = pState === 'Paid' || pState === 'Exempt' || pState === 'PAID' || pState === 'EXEMPT';

  if (qState === 'COMPLETED') return 6;
  if (qState === 'SENT_TO_PHARMACY' || qState === 'SENT TO PHARMACY' || patient.pharmacyStatus === 'SENT' || patient.pharmacyStatus === 'DISPENSED') return 5;
  if (qState === 'IN_CONSULTATION' || qState === 'IN-CONSULTATION' || qState === 'IN CONSULTATION') return 4;
  if (qState === 'CALLED') return 3;
  if (isPaid) return 2;
  if (patient) return 1;
  return 0;
};

const WorkflowTimeline = ({ patient, className = '' }) => {
  const activeIndex = getActiveStageIndex(patient);
  const timestamps = patient?.workflow?.timestamps || {};

  return (
    <div className={`w-full py-3 font-sans ${className}`}>
      <div className="flex items-center justify-between overflow-x-auto gap-2 pb-2 scrollbar-none">
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < activeIndex;
          const isCurrent = idx === activeIndex;
          const IconComponent = stage.icon;

          return (
            <div key={stage.key} className="flex items-center gap-2 flex-shrink-0">
              <div className="flex flex-col items-center min-w-[70px] text-center">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                    isCompleted 
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
                      : isCurrent 
                        ? 'bg-[#2F63F2] border-[#2F63F2] text-white shadow-sm ring-4 ring-blue-100 animate-pulse' 
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <IconComponent className="w-4 h-4 shrink-0" />
                </div>
                <span className={`text-[10px] font-bold mt-1.5 whitespace-nowrap ${
                  isCurrent ? 'text-[#2F63F2]' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  {stage.label}
                </span>
                {isCompleted && timestamps[`${stage.key}At`] && (
                  <span className="text-[8px] text-slate-400 font-mono mt-0.5">
                    {new Date(timestamps[`${stage.key}At`]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              {idx < STAGES.length - 1 && (
                <div className={`h-0.5 w-6 sm:w-10 rounded-full transition-all ${
                  idx < activeIndex ? 'bg-emerald-400' : 'bg-slate-200'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowTimeline;
