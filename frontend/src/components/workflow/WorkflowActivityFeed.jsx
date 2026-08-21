import React from 'react';
import { History, User, Clock, CheckCircle2 } from 'lucide-react';

const WorkflowActivityFeed = ({ appointment, className = '' }) => {
  const history = appointment?.workflowHistory || [];

  if (!history || history.length === 0) {
    return (
      <div className={`p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-400 text-xs font-medium font-sans ${className}`}>
        <History className="w-5 h-5 mx-auto mb-1 opacity-50" />
        No workflow activity history recorded yet.
      </div>
    );
  }

  return (
    <div className={`bg-white border border-[#E5E7EB] rounded-2xl p-4 space-y-3 font-sans ${className}`}>
      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
        <History className="w-4 h-4 text-[#2F63F2]" />
        Workflow Audit Trail ({history.length})
      </h4>

      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
        {history.map((entry, idx) => (
          <div key={idx} className="flex items-start gap-2.5 text-xs">
            <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2F63F2] shrink-0 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-slate-800 truncate">
                  {entry.fromState && entry.fromState !== 'NONE' ? `${entry.fromState} → ` : ''}{entry.toState}
                </span>
                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{entry.note || `Transitioned ${entry.stateType}`}</p>
              {entry.changedByName && (
                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium mt-0.5">
                  <User className="w-3 h-3" />
                  <span>{entry.changedByName} ({entry.changedByRole || 'USER'})</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkflowActivityFeed;
