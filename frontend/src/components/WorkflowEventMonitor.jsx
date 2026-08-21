import React, { useState, useEffect } from 'react';
import { workflowRealtime } from '../services/workflowRealtimeService';
import { Activity, Clock, User, CheckCircle2 } from 'lucide-react';

const WorkflowEventMonitor = ({ className = '' }) => {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const unsubscribe = workflowRealtime.subscribe((evt) => {
      setEvents(prev => [evt, ...prev].slice(0, 50));
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className={`bg-white border border-[#E5E7EB] rounded-2xl p-4 space-y-3 font-sans ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-[#2F63F2] animate-pulse" />
          Real-Time Workflow Event Monitor ({events.length})
        </h4>
        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          ● Live Stream
        </span>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center text-slate-400 text-xs font-medium">
            Waiting for live workflow events...
          </div>
        ) : (
          events.map((evt, idx) => (
            <div key={evt.eventId || idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between text-xs gap-2 hover:bg-slate-100/80 transition-all">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{evt.type}</span>
                  {evt.tokenNumber && (
                    <span className="font-mono text-[10px] font-bold text-[#2F63F2] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                      #{evt.tokenNumber}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {evt.patientName ? `Patient: ${evt.patientName}` : ''} {evt.doctorName ? `| Doctor: ${evt.doctorName}` : ''}
                </p>
                {evt.performedBy && (
                  <p className="text-[10px] text-slate-400 font-medium">By: {evt.performedBy}</p>
                )}
              </div>
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3" />
                {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default WorkflowEventMonitor;
