import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import { Building2, Stethoscope, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const WorkspaceSwitcher = () => {
  const { workspaceMode, setWorkspaceMode, allowedWorkspaces, showSwitcher } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!showSwitcher) return null;

  const currentWorkspace = allowedWorkspaces.find(w => w.id === workspaceMode) || allowedWorkspaces[0];

  const handleSelect = (workspaceId) => {
    setWorkspaceMode(workspaceId);
    setIsOpen(false);
    
    // Dynamically route on workspace selection
    if (workspaceId === 'hospital_management') {
      navigate('/admin/dashboard');
    } else {
      navigate('/doctor/dashboard');
    }
  };

  const renderIcon = (iconName, className) => {
    switch (iconName) {
      case 'Building2':
        return <Building2 className={className} />;
      case 'Stethoscope':
        return <Stethoscope className={className} />;
      default:
        return null;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Active Selection Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-[125px] sm:w-[200px] h-[32px] sm:h-[42px] px-2 sm:px-3 bg-white border border-[#DCE3F1] rounded-[8px] sm:rounded-[10px] flex items-center justify-between text-left cursor-pointer transition-all hover:bg-slate-50 focus:outline-none"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-hidden">
          {renderIcon(currentWorkspace?.icon, "w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2F63F2] flex-shrink-0")}
          <span className="text-[10px] sm:text-[11px] font-bold text-[#1E293B] uppercase tracking-wider truncate">
            {currentWorkspace?.label}
          </span>
        </div>
        <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-250 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Options */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-[48px] left-0 w-[240px] bg-white border border-[#DCE3F1] rounded-[12px] shadow-lg py-1.5 z-[1000] overflow-hidden"
          >
            {allowedWorkspaces.map((ws) => {
              const isSelected = ws.id === workspaceMode;
              return (
                <button
                  key={ws.id}
                  onClick={() => handleSelect(ws.id)}
                  className={`w-full px-4 py-2.5 flex items-center justify-between text-left cursor-pointer transition-colors border-l-[3px] focus:outline-none ${
                    isSelected
                      ? 'bg-[#EDF4FF] border-[#2F63F2]'
                      : 'border-transparent hover:bg-[#EDF4FF]/50'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    {renderIcon(ws.icon, `w-4 h-4 ${isSelected ? 'text-[#2F63F2]' : 'text-slate-400'}`)}
                    <div className="flex flex-col overflow-hidden text-left">
                      <span className={`text-[11px] font-bold uppercase tracking-wider leading-tight ${isSelected ? 'text-[#2F63F2]' : 'text-[#1E293B]'}`}>
                        {ws.label}
                      </span>
                      <span className="text-[9px] text-slate-400 leading-normal truncate">
                        {ws.desc}
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#2F63F2] flex-shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkspaceSwitcher;
