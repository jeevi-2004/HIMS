import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const WorkflowReasonTooltip = ({ reason, children, className = '' }) => {
  const [show, setShow] = useState(false);

  if (!reason) return children;

  return (
    <div 
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-medium rounded-xl shadow-lg whitespace-nowrap z-50 flex items-center gap-1.5 pointer-events-none">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{reason}</span>
        </div>
      )}
    </div>
  );
};

export default WorkflowReasonTooltip;
