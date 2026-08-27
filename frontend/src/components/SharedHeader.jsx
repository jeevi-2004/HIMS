import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import api from '../services/api';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { Menu, Search, Bell, LogOut, User, ArrowLeft, ChevronDown, Building2, Stethoscope, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { USER_ROLES } from '../constants/roles';

const SharedHeader = ({ setSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { workspaceMode, setWorkspaceMode, allowedWorkspaces, showSwitcher } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileWsModalOpen, setMobileWsModalOpen] = useState(false);
  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [currentBranchInfo, setCurrentBranchInfo] = useState(null);

  useEffect(() => {
    if (user?.role === USER_ROLES.DOCTOR_ADMIN || user?.role === USER_ROLES.RECEPTIONIST) {
      api.get('/admin/hospitals').then(res => {
        if (res.data.success && res.data.data.length > 0) {
          setHospitalInfo(res.data.data[0]);
        }
      }).catch(() => {});

      api.get('/admin/branches').then(res => {
        if (res.data.success && res.data.data.length > 0) {
          const userBranch = res.data.data.find(b => b._id === user.branchId) || res.data.data[0];
          setCurrentBranchInfo(userBranch);
        }
      }).catch(() => {});
    }
  }, [user]);

  const isRootLandingPage = ['/doctor/dashboard', '/reception/dashboard', '/pharmacy/dashboard', '/dashboard', '/admin/dashboard'].includes(location.pathname);

  const getWorkspaceBadgeColor = () => {
    if (user?.role === USER_ROLES.SUPER_ADMIN) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (user?.role === USER_ROLES.RECEPTIONIST) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (user?.role === USER_ROLES.PHARMACIST) return 'bg-[#3563F6]/10 text-[#3563F6] border-[#3563F6]/20';
    if (workspaceMode === 'hospital_management') return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  };

  const getWorkspaceLabel = () => {
    if (user?.role === USER_ROLES.SUPER_ADMIN) return 'SUPER ADMIN';
    if (user?.role === USER_ROLES.RECEPTIONIST) return '🛎️ Receptionist';
    if (user?.role === USER_ROLES.PHARMACIST) return '💊 Pharmacy';
    if (workspaceMode === 'hospital_management') return '🏥 Hospital Admin';
    return '🩺 Doctor Desk';
  };

  // Derive human readable page title for header
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('consultation')) return 'Consultation';
    if (path.includes('appointments')) return 'Appointments';
    if (path.includes('prescriptions')) return 'Prescriptions';
    if (path.includes('today-patients') || path.includes('queue')) return "Queue";
    if (path.includes('completed-visits')) return 'Completed Visits';
    if (path.includes('clinical-masters')) return 'Clinical Masters';
    if (path.includes('vitals')) return 'Vitals Intake';
    if (path.includes('patient-registration') || path.includes('register')) return 'Patient Profile';
    if (path.includes('inventory')) return 'Inventory';
    if (path.includes('billing')) return 'Billing';
    if (path.includes('reports')) return 'Reports';
    if (path.includes('profile')) return 'Profile';
    if (path.includes('/admin/dashboard')) return 'Hospital Admin';
    if (path.includes('/doctor/dashboard')) return 'Doctor Desk';
    return 'VillZone HIMS';
  };

  const handleSelectWorkspace = (wsId) => {
    setWorkspaceMode(wsId);
    setMobileWsModalOpen(false);
    if (wsId === 'hospital_management') {
      navigate('/admin/dashboard');
    } else {
      navigate('/doctor/dashboard');
    }
  };

  return (
    <>
      <header className="h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 border-b border-[#E5E7EB] bg-white sticky top-0 z-30 shadow-xs font-sans">
        {/* Left: Mobile Sidebar Toggle, Back Button & VillZone HIMS Brand Logo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button 
            className="md:hidden text-[#6B7280] hover:text-[#111827] p-1.5 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {!isRootLandingPage && (
            <button
              onClick={() => navigate(-1)}
              className="md:hidden flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          {/* Mobile VillZone HIMS Branding & Page Title Badge */}
          <div className="md:hidden flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#2F63F2] to-[#4F75FF] text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0 font-mono">
              V
            </div>
            <div className="flex flex-col text-left min-w-0">
              <span className="font-extrabold text-slate-900 text-xs tracking-tight truncate">VillZone HIMS</span>
              <span className="text-[9px] text-[#2F63F2] font-extrabold tracking-wider uppercase truncate leading-tight">
                {getPageTitle()}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Mobile Workspace Switcher Pill, Search, Badges, Workspace Switcher, Notifications, Profile */}
        <div className="flex items-center gap-2 sm:gap-3.5">

          {/* MOBILE WORKSPACE SWITCHER PILL BUTTON (< 640px) */}
          {showSwitcher && (
            <button
              type="button"
              onClick={() => setMobileWsModalOpen(true)}
              className="sm:hidden flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-[#2F63F2] font-extrabold text-[10px] tracking-wide uppercase shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0"
              title="Switch Workspace Mode"
            >
              <span>{workspaceMode === 'hospital_management' ? '🏥 Admin' : '🩺 Doctor'}</span>
              <ChevronDown className="w-3 h-3 text-[#2F63F2]" />
            </button>
          )}

          {/* Global Quick Search (Hidden on Mobile) */}
          <div className="relative hidden lg:block w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Quick search records..." 
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-[#E5E7EB] rounded-xl text-xs focus:outline-none focus:border-[#2F63F2] focus:bg-white transition-colors"
            />
          </div>

          {/* Hospital Info & Current Branch Badge */}
          {user?.role === 'DOCTOR_ADMIN' && hospitalInfo && (
            <div className="hidden xl:flex items-center gap-2.5 bg-slate-50 px-3 py-1 rounded-xl border border-[#E5E7EB] text-xs">
              {hospitalInfo.logo && (
                <img src={hospitalInfo.logo} alt="Logo" className="w-5 h-5 object-contain rounded-md" />
              )}
              <div className="flex flex-col text-left">
                <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wide">{hospitalInfo.name}</span>
                {Boolean(user?.featureModules?.Branches) && (
                  <span className="text-[9px] text-[#6B7280] font-mono">Branch: {currentBranchInfo?.name || 'Main'}</span>
                )}
              </div>
            </div>
          )}

          {/* Workspace Switcher (Hidden on Mobile < 640px) */}
          <div className="hidden sm:block">
            <WorkspaceSwitcher />
          </div>

        {/* Notification Bell */}
        <button className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition-colors relative">
          <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          <span className="w-2 h-2 bg-rose-500 rounded-full absolute top-1 sm:top-1.5 right-1 sm:right-1.5 border border-white" />
        </button>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className={`hidden md:inline-flex text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-lg border ${getWorkspaceBadgeColor()}`}>
              {getWorkspaceLabel()}
            </span>
            <button 
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#2F63F2] text-white flex items-center justify-center font-bold text-xs cursor-pointer shadow-xs hover:scale-105 transition-transform font-mono"
            >
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </button>
          </div>

          {/* Profile Dropdown Menu */}
          {profileMenuOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setProfileMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-10 w-56 bg-white border border-[#E5E7EB] rounded-2xl shadow-xl p-4 z-50 space-y-3 text-left font-sans"
              >
                <div className="pb-2 border-b border-[#F1F5F9]">
                  <h4 className="text-xs font-extrabold text-slate-800 tracking-wide truncate">{user?.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-0.5 truncate">{user?.role?.replace('_', ' ')}</p>
                </div>

                {user?.employeeCode && (
                  <div className="text-[10px] text-slate-500 font-mono bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-col gap-0.5">
                    <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Employee Code</span>
                    <span className="font-extrabold text-slate-700">{user.employeeCode}</span>
                  </div>
                )}

                {/* Profile Dropdown Mobile Workspace Switcher Options */}
                {showSwitcher && (
                  <div className="pt-2 border-t border-slate-100 space-y-1">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold px-1">Switch Workspace</span>
                    {allowedWorkspaces.map((ws) => (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          handleSelectWorkspace(ws.id);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-colors ${
                          ws.id === workspaceMode ? 'bg-blue-50 text-[#2F63F2]' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {ws.id === 'hospital_management' ? <Building2 className="w-3.5 h-3.5" /> : <Stethoscope className="w-3.5 h-3.5" />}
                          {ws.label}
                        </span>
                        {ws.id === workspaceMode && <Check className="w-3.5 h-3.5 text-[#2F63F2]" />}
                      </button>
                    ))}
                  </div>
                )}

                <Link
                  to="/profile"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  My Profile
                </Link>

                <button
                  onClick={async () => {
                    setProfileMenuOpen(false);
                    await logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-100 hover:border-rose-200 text-rose-600 rounded-xl text-xs font-bold transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </header>

    {/* Mobile Workspace Selection Bottom Sheet Modal */}
    <AnimatePresence>
      {mobileWsModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileWsModalOpen(false)}
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
                  <Building2 className="w-5 h-5 text-[#2F63F2]" />
                  <span>Select Workspace</span>
                </h3>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  Switch active operational workspace
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileWsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {allowedWorkspaces.map((ws) => {
                const isSelected = ws.id === workspaceMode;
                const WsIcon = ws.id === 'hospital_management' ? Building2 : Stethoscope;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => handleSelectWorkspace(ws.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer active:scale-98 min-h-[58px] ${
                      isSelected
                        ? 'bg-blue-50/80 border-[#2F63F2] shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
                        ws.id === 'hospital_management' ? 'bg-blue-600' : 'bg-emerald-600'
                      }`}>
                        <WsIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className={`text-xs font-extrabold ${isSelected ? 'text-[#2F63F2]' : 'text-slate-900'}`}>
                          {ws.label}
                        </h4>
                        <p className="text-[10px] text-slate-500 font-medium">{ws.desc}</p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-[#2F63F2] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  </>
  );
};

export default SharedHeader;
