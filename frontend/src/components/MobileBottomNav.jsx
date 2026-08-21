import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { 
  LayoutGrid, Calendar, Users, User, Plus, Zap, Search, 
  Activity, ShieldAlert, CreditCard, FileBarChart2, X, 
  ChevronRight, Clock, Building2, Stethoscope, Pill, PackageCheck,
  ClipboardList, Home, CalendarCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MobileBottomNav = () => {
  const { user } = useAuth();
  const { workspaceMode } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  const [quickSheetOpen, setQuickSheetOpen] = useState(false);

  if (!user) return null;

  const currentPath = location.pathname;
  const isDoctor = user.role === 'DOCTOR' || (user.role === 'DOCTOR_ADMIN' && workspaceMode !== 'hospital_management');

  // Determine Role-based navigation tabs
  // For Doctors: 5-tab layout → Home | Queue | (Consult FAB) | Follow-up | Profile
  // For Others: 5-tab layout → Tab1 | Tab2 | (Center FAB) | Tab3 | Tab4
  let navItems = [];

  if (user.role === 'RECEPTIONIST' || user.role === 'STAFF') {
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, path: '/reception/dashboard' },
      { key: 'appointments', label: 'OPD Desk', icon: Calendar, path: '/reception/appointments' },
      { key: 'queue', label: 'Queue', icon: Users, path: '/reception/queue' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  } else if (user.role === 'PHARMACIST' || user.role === 'PHARMACY') {
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, path: '/pharmacy/dashboard' },
      { key: 'dispense', label: 'Dispense', icon: Pill, path: '/pharmacy/dispense' },
      // Center FAB (Prescription Queue) handled separately
      { key: 'reports', label: 'Reports', icon: FileBarChart2, path: '/pharmacy/reports' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  } else if (isDoctor) {
    // Doctor 5-tab layout: positions 1,2 are left of FAB; positions 4,5 are right of FAB
    navItems = [
      { key: 'home', label: 'Home', icon: Home, path: '/doctor/dashboard' },
      { key: 'queue', label: 'Queue', icon: Users, path: '/doctor/queue' },
      // Center FAB (Consult) is handled separately
      { key: 'followup', label: 'Follow-up', icon: CalendarCheck, path: '/doctor/follow-ups' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  } else {
    // Admin / Super Admin
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, path: '/dashboard' },
      { key: 'hospitals', label: 'Hospitals', icon: Building2, path: '/hospitals' },
      { key: 'users', label: 'Users', icon: Users, path: '/users' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  }

  // Active state matching helper
  const isNavActive = (itemPath) => {
    if (!itemPath || itemPath === '#') return false;
    if (itemPath === currentPath) return true;
    if (itemPath !== '/' && currentPath.startsWith(itemPath)) return true;
    return false;
  };

  // Check if currently in a consultation
  const isConsultActive = currentPath.startsWith('/doctor/consultation');

  const handleTabClick = (path) => {
    if (path && path !== '#') {
      navigate(path);
    }
  };

  // Quick Action Handler for Bottom Sheet Cards
  const handleQuickAction = (actionKey) => {
    setQuickSheetOpen(false);
    if (actionKey === 'GENERATE_TOKEN') {
      if (currentPath !== '/reception/appointments') {
        navigate('/reception/appointments?action=generate');
      }
      window.dispatchEvent(new Event('open-generate-token'));
    } else if (actionKey === 'SEARCH_PATIENT') {
      navigate('/reception/appointments?search=true');
    } else if (actionKey === 'LIVE_QUEUE') {
      navigate('/reception/appointments?drawer=queue');
    } else if (actionKey === 'EMERGENCY_TOKEN') {
      if (currentPath !== '/reception/appointments') {
        navigate('/reception/appointments?action=emergency');
      }
      window.dispatchEvent(new Event('open-emergency-token'));
    } else if (actionKey === 'COLLECT_PAYMENT') {
      navigate('/reception/appointments?tab=payment');
    } else if (actionKey === 'REPORTS') {
      navigate('/reception/reports');
    }
    // Doctor-specific quick actions
    else if (actionKey === 'DOCTOR_QUEUE') {
      navigate('/doctor/queue');
    } else if (actionKey === 'DOCTOR_SEARCH') {
      navigate('/doctor/dashboard');
    } else if (actionKey === 'DOCTOR_MASTERS') {
      navigate('/doctor/clinical-masters');
    } else if (actionKey === 'DOCTOR_REPORTS') {
      navigate('/doctor/reports');
    }
  };

  // Render individual navigation tab button
  const renderTab = (item) => {
    if (!item) return <div key="empty" />;
    const Icon = item.icon;
    const active = isNavActive(item.path);

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => handleTabClick(item.path)}
        className="relative flex flex-col items-center justify-center h-[54px] w-full px-0.5 rounded-2xl transition-all cursor-pointer active:scale-95 touch-manipulation text-center"
      >
        {/* Modern Animated Active Pill Indicator */}
        {active && (
          <motion.div
            layoutId="mobileNavActivePill"
            transition={{ type: 'spring', duration: 0.25, bounce: 0.15 }}
            className="absolute inset-x-0.5 inset-y-1 bg-[#3563F6]/10 border border-[#3563F6]/20 rounded-2xl z-0"
          />
        )}

        <Icon className={`w-5 h-5 z-10 transition-colors ${active ? 'text-[#3563F6]' : 'text-slate-400'}`} />
        <span className={`text-[10px] leading-tight mt-0.5 z-10 transition-colors truncate max-w-full px-0.5 ${
          active ? 'font-bold text-[#3563F6]' : 'font-medium text-slate-500'
        }`}>
          {item.label}
        </span>
      </button>
    );
  };

  // Determine center FAB config based on role
  const getCenterFab = () => {
    if (user.role === 'PHARMACIST' || user.role === 'PHARMACY') {
      const isQueueActive = currentPath === '/pharmacy/queue' || currentPath === '/pharmacy/dashboard?tab=queue' || currentPath.includes('/pharmacy/dispense');
      return {
        icon: ClipboardList,
        label: 'Queue',
        active: isQueueActive,
        onClick: () => {
          navigate('/pharmacy/dashboard?tab=queue');
        },
        gradient: 'from-[#3563F6] to-[#4F75FF]',
        shadow: 'shadow-blue-500/35'
      };
    }
    if (isDoctor) {
      return {
        icon: Stethoscope,
        label: 'Consult',
        active: isConsultActive,
        onClick: () => {
          // Navigate to queue so doctor can pick a patient to consult
          navigate('/doctor/queue');
        },
        gradient: 'from-[#3563F6] to-[#4F75FF]',
        shadow: 'shadow-blue-500/35'
      };
    }
    // Default: receptionist quick actions FAB
    return {
      icon: Plus,
      label: 'TOKEN',
      active: false,
      onClick: () => setQuickSheetOpen(true),
      gradient: 'from-[#3563F6] to-[#4F75FF]',
      shadow: 'shadow-blue-500/35'
    };
  };

  const centerFab = getCenterFab();
  const CenterIcon = centerFab.icon;

  return (
    <>
      {/* --------------------------------------------------- */}
      {/* RESPONSIVE FLOATING MOBILE BOTTOM NAV (MOBILE ONLY) */}
      {/* --------------------------------------------------- */}
      <div className="sm:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 max-w-md mx-auto font-sans select-none">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-[24px] shadow-xl shadow-slate-900/10 h-[74px] px-1.5 grid grid-cols-5 items-center relative">
          
          {/* TAB 1 */}
          {renderTab(navItems[0])}

          {/* TAB 2 */}
          {renderTab(navItems[1])}

          {/* CENTER FAB SLOT (COL 3) */}
          <div className="flex items-center justify-center h-full relative z-20">
            <button
              type="button"
              onClick={centerFab.onClick}
              className={`w-[54px] h-[54px] -mt-6 rounded-full bg-gradient-to-tr ${centerFab.gradient} text-white flex flex-col items-center justify-center shadow-lg ${centerFab.shadow} border-4 ${centerFab.active ? 'border-[#3563F6]/30' : 'border-white'} transition-all active:scale-90 hover:scale-105 cursor-pointer touch-manipulation`}
              title={centerFab.label}
            >
              <CenterIcon className="w-5 h-5 text-white" />
              <span className="text-[7.5px] font-extrabold uppercase tracking-tighter text-blue-100 -mt-0.5">{centerFab.label}</span>
            </button>
          </div>

          {/* TAB 4 */}
          {renderTab(navItems[2])}

          {/* TAB 5 */}
          {renderTab(navItems[3])}

        </div>
      </div>

      {/* --------------------------------------------------- */}
      {/* QUICK ACTIONS BOTTOM SHEET MODAL */}
      {/* --------------------------------------------------- */}
      <AnimatePresence>
        {quickSheetOpen && (
          <>
            {/* Backdrop Blur Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickSheetOpen(false)}
              className="sm:hidden fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs"
            />

            {/* Bottom Sheet Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] border-t border-slate-200 p-5 shadow-2xl pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] text-left font-sans max-w-lg mx-auto"
            >
              {/* Top Drag Handle */}
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

              {/* Sheet Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#3563F6]" />
                    <span>{isDoctor ? 'Quick Doctor Actions' : 'Quick Reception Actions'}</span>
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                    {isDoctor ? 'Fast shortcuts for clinical workflow' : 'Fast single-tap shortcuts for intake desk'}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setQuickSheetOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Touch-Friendly Action Cards Grid */}
              <div className="grid grid-cols-1 gap-2.5">

                {!isDoctor ? (
                  <>
                    {/* RECEPTIONIST QUICK ACTIONS */}
                    {/* 1. Generate OPD Token */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('GENERATE_TOKEN')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#3563F6] text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-[#3563F6]">Generate Token</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Quick patient registration & OPD token</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#3563F6] transition-colors" />
                    </button>

                    {/* 2. Emergency Token */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('EMERGENCY_TOKEN')}
                      className="w-full flex items-center justify-between p-3.5 bg-rose-50/60 hover:bg-rose-100/70 border border-rose-200 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-rose-900">Emergency Walk-in Token</h4>
                          <p className="text-[10px] text-rose-700 font-medium">Priority immediate emergency OPD token</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-rose-400 transition-colors" />
                    </button>

                    {/* 3. Search Patient */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('SEARCH_PATIENT')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <Search className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600">Search Patient</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Lookup patient by Name, Mobile, or UHID</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </button>

                    {/* 4. Live Doctor Queue */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('LIVE_QUEUE')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-purple-50/70 border border-slate-200 hover:border-purple-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <Activity className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-purple-600">Live Doctor Queue</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Monitor consulting rooms & queue status</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
                    </button>

                    {/* 5. Reports & Analytics */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('REPORTS')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <FileBarChart2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-emerald-600">Reports & Analytics</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Intake volume, doctor load & revenue</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                    </button>
                  </>
                ) : (
                  <>
                    {/* DOCTOR QUICK ACTIONS */}
                    {/* 1. Start Consultation (go to queue) */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('DOCTOR_QUEUE')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#3563F6] text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <Stethoscope className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-[#3563F6]">Start Consultation</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Pick next patient from today's queue</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#3563F6] transition-colors" />
                    </button>

                    {/* 2. Search Patient / Medical History */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('DOCTOR_SEARCH')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <Search className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600">Patient History</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Search patient records & medical history</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </button>

                    {/* 3. Clinical Masters */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('DOCTOR_MASTERS')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-purple-50/70 border border-slate-200 hover:border-purple-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <ClipboardList className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-purple-600">Clinical Masters</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Manage diagnosis, medicines & templates</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
                    </button>

                    {/* 4. Reports */}
                    <button
                      type="button"
                      onClick={() => handleQuickAction('DOCTOR_REPORTS')}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <FileBarChart2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-emerald-600">Reports & Analytics</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Consultation stats, patient volume & trends</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                    </button>
                  </>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default MobileBottomNav;

