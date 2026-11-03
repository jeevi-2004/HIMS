import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { 
  LayoutGrid, Calendar, Users, User, Plus, Zap, Search, 
  Activity, ShieldAlert, CreditCard, FileBarChart2, X, 
  ChevronRight, Clock, Building2, Stethoscope, Pill, PackageCheck,
  ClipboardList, Home, CalendarCheck, MoreHorizontal, Settings, LogOut, CheckCircle2, History, GitBranch
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MobileBottomNav = () => {
  const { user, logout } = useAuth();
  const { workspaceMode, setWorkspaceMode } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  const [quickSheetOpen, setQuickSheetOpen] = useState(false);

  if (!user) return null;

  const currentPath = location.pathname;
  const isDoctor = user.role === 'DOCTOR' || (user.role === 'DOCTOR_ADMIN' && workspaceMode !== 'hospital_management');

  // Determine Role-based navigation tabs
  let navItems = [];

  if (user.role === 'RECEPTIONIST' || user.role === 'STAFF') {
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, path: '/reception/dashboard' },
      { key: 'appointments', label: 'OPD Desk', icon: Calendar, path: '/reception/appointments' },
      { key: 'queue', label: 'Queue', icon: Users, path: '/reception/queue' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  } else if (currentPath.startsWith('/pharmacy') || user.role === 'PHARMACIST' || user.role === 'PHARMACY') {
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, path: '/pharmacy/dashboard' },
      { key: 'dispense', label: 'OPD Dispense', icon: Pill, path: '/pharmacy/dispense' },
      { key: 'reports', label: 'Reports', icon: FileBarChart2, path: '/pharmacy/reports' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  } else if (isDoctor) {
    // Doctor 5-tab layout
    navItems = [
      { key: 'home', label: 'Home', icon: Home, path: '/doctor/dashboard' },
      { key: 'queue', label: 'Queue', icon: Users, path: '/doctor/queue' },
      { key: 'followup', label: 'Follow-ups', icon: CalendarCheck, path: '/doctor/follow-ups' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  } else {
    // Hospital Admin / Super Admin
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, path: '/admin/dashboard' },
      { key: 'hospitals', label: 'Branch', icon: GitBranch, path: '/admin/departments' },
      { key: 'users', label: 'Staff', icon: Users, path: '/admin/workforce' },
      { key: 'profile', label: 'Profile', icon: User, path: '/profile' }
    ];
  }

  const fullPath = currentPath + (location.search || '');
  const isNavActive = (itemPath) => {
    if (!itemPath || itemPath === '#') return false;
    if (itemPath === fullPath) return true;
    if (itemPath === currentPath) return true;
    if (location.search && itemPath.includes(location.search)) return true;
    if ((itemPath.includes('tab=branches') || itemPath.includes('/admin/departments')) && 
        (currentPath.includes('/admin/departments') || location.search.includes('tab=branches') || location.search.includes('tab=departments'))) return true;
    if ((itemPath.includes('tab=staff') || itemPath.includes('/admin/workforce')) && 
        (currentPath.includes('/admin/workforce') || currentPath.includes('/admin/users') || location.search.includes('tab=staff') || location.search.includes('tab=users'))) return true;
    if (itemPath !== '/' && currentPath.startsWith(itemPath)) return true;
    return false;
  };

  // Check if currently in a consultation
  const isIPDConsultation = (currentPath.includes('/consultation') || currentPath.includes('/prescription')) && 
    location.search.includes('type=ipd');
  const isConsultActive = currentPath.startsWith('/doctor/consultation') && !isIPDConsultation;

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
    } else if (actionKey === 'DOCTOR_QUEUE') {
      navigate('/doctor/queue');
    } else if (actionKey === 'DOCTOR_SEARCH') {
      navigate('/doctor/dashboard');
    } else if (actionKey === 'DOCTOR_MASTERS') {
      navigate('/doctor/clinical-masters');
    }
  };

  // Render individual navigation tab button
  const renderTab = (item) => {
    if (!item) return <div key="empty" />;
    const Icon = item.icon;
    const active = item.isMore 
      ? (quickSheetOpen || isNavActive('/doctor/completed-visits') || isNavActive('/doctor/clinical-masters')) 
      : isNavActive(item.path);

    const handleClick = () => {
      if (item.isMore) {
        setQuickSheetOpen(!quickSheetOpen);
      } else {
        handleTabClick(item.path);
      }
    };

    return (
      <button
        key={item.key}
        type="button"
        onClick={handleClick}
        className="relative flex flex-col items-center justify-center h-[54px] w-full px-0.5 rounded-2xl transition-all cursor-pointer active:scale-95 touch-manipulation text-center"
      >
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

  // Determine center FAB config based on role & active workspace
  const getCenterFab = () => {
    if (currentPath.startsWith('/pharmacy') || user.role === 'PHARMACIST' || user.role === 'PHARMACY') {
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
    if (user.role === 'DOCTOR_ADMIN' && workspaceMode === 'hospital_management') {
      return {
        icon: Stethoscope,
        label: 'Doctor',
        active: false,
        onClick: () => {
          setWorkspaceMode('clinical_consultation');
          navigate('/doctor/dashboard');
        },
        gradient: 'from-[#2F63F2] to-[#4F75FF]',
        shadow: 'shadow-blue-500/35'
      };
    }
    if (isDoctor) {
      return {
        icon: Stethoscope,
        label: 'Consult',
        active: isConsultActive,
        onClick: () => {
          navigate('/doctor/consultation');
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
      onClick: () => handleQuickAction('GENERATE_TOKEN'),
      gradient: 'from-[#3563F6] to-[#4F75FF]',
      shadow: 'shadow-blue-500/35'
    };
  };

  const centerFab = getCenterFab();
  const CenterIcon = centerFab.icon;

  return (
    <>
      {/* RESPONSIVE FLOATING MOBILE BOTTOM NAV (MOBILE ONLY) */}
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

          {/* TAB 5 (MORE) */}
          {renderTab(navItems[3])}

        </div>
      </div>

      {/* MORE MENU & QUICK ACTIONS BOTTOM SHEET MODAL */}
      <AnimatePresence>
        {quickSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickSheetOpen(false)}
              className="sm:hidden fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] border-t border-slate-200 p-5 shadow-2xl pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] text-left font-sans max-w-lg mx-auto"
            >
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <MoreHorizontal className="w-5 h-5 text-[#3563F6]" />
                    <span>{isDoctor ? 'More Clinical Modules' : 'Hospital Admin Shortcuts'}</span>
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                    {isDoctor ? 'Secondary modules & settings' : 'Fast single-tap shortcuts'}
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

              <div className="grid grid-cols-1 gap-2">

                {!isDoctor ? (
                  <>
                    {/* HOSPITAL ADMIN MORE MENU ACTIONS */}
                    {user?.role === 'DOCTOR_ADMIN' && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickSheetOpen(false);
                          setWorkspaceMode('clinical_consultation');
                          navigate('/doctor/dashboard');
                        }}
                        className="w-full flex items-center justify-between p-3.5 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[56px]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                            <Stethoscope className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-extrabold text-emerald-950 group-hover:text-emerald-700">Switch to Doctor Desk</h4>
                            <p className="text-[10px] text-emerald-700 font-medium">Open patient consultation workspace & queue</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-emerald-500 transition-colors" />
                      </button>
                    )}
                    
                    {/* RECEPTIONIST QUICK ACTIONS (if applicable) */}
                    {user?.role !== 'DOCTOR_ADMIN' && (
                      <>
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
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* DOCTOR MORE MENU SECONDARY MODULES */}
                    {user?.role === 'DOCTOR_ADMIN' && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickSheetOpen(false);
                          setWorkspaceMode('hospital_management');
                          navigate('/admin/dashboard');
                        }}
                        className="w-full flex items-center justify-between p-3 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[52px]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-[#3563F6]">Switch to Hospital Admin</h4>
                            <p className="text-[10px] text-slate-500 font-medium">Manage hospital operations & settings</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#3563F6] transition-colors" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSheetOpen(false);
                        navigate('/doctor/completed-visits');
                      }}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <History className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-[#3563F6]">Completed Visits</h4>
                          <p className="text-[10px] text-slate-500 font-medium">View past consultation history</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#3563F6] transition-colors" />
                    </button>

                    {/* 2. Clinical Masters */}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSheetOpen(false);
                        navigate('/doctor/clinical-masters');
                      }}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-purple-50/70 border border-slate-200 hover:border-purple-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-purple-600">Clinical Masters</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Manage diagnosis, medicines & templates</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
                    </button>

                    {/* 4. Doctor Profile */}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSheetOpen(false);
                        navigate('/profile');
                      }}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600">Doctor Profile</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Manage clinical details & signature</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </button>

                    {/* 5. Settings */}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSheetOpen(false);
                        navigate('/profile');
                      }}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-amber-50/70 border border-slate-200 hover:border-amber-300 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <Settings className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-amber-600">Settings</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Preferences & configuration</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                    </button>

                    {/* 6. Logout */}
                    <button
                      type="button"
                      onClick={async () => {
                        setQuickSheetOpen(false);
                        await logout();
                      }}
                      className="w-full flex items-center justify-between p-3 bg-rose-50/60 hover:bg-rose-100/70 border border-rose-200 rounded-2xl transition-all text-left group active:scale-98 cursor-pointer min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                          <LogOut className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-rose-900">Logout</h4>
                          <p className="text-[10px] text-rose-700 font-medium">Sign out from VillZone HIMS</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-rose-400 transition-colors" />
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

