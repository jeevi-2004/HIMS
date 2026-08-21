import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import api from '../services/api';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { Menu, Search, Bell, LogOut, User, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { USER_ROLES } from '../constants/roles';

const SharedHeader = ({ setSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { workspaceMode } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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

  const isRootLandingPage = ['/doctor/dashboard', '/reception/dashboard', '/pharmacy/dashboard', '/dashboard'].includes(location.pathname);

  const getWorkspaceBadgeColor = () => {
    if (user?.role === USER_ROLES.SUPER_ADMIN) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (user?.role === USER_ROLES.RECEPTIONIST) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (user?.role === USER_ROLES.PHARMACIST) return 'bg-teal-100 text-teal-800 border-teal-200';
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
    if (path.includes('today-patients')) return "Today's Queue";
    if (path.includes('completed-visits')) return 'Follow-ups';
    if (path.includes('clinical-masters')) return 'Clinical Masters';
    if (path.includes('vitals')) return 'Vitals Intake';
    if (path.includes('patient-registration') || path.includes('register')) return 'Patient Profile Management';
    if (path.includes('queue')) return 'Queue';
    if (path.includes('inventory')) return 'Inventory';
    if (path.includes('billing')) return 'Billing';
    if (path.includes('reports')) return 'Reports';
    if (path.includes('profile')) return 'Profile';
    return 'VillZone HIMS';
  };

  return (
    <header className="h-12 sm:h-16 flex items-center justify-between px-2 sm:px-6 border-b border-[#E5E7EB] bg-white sticky top-0 z-30 shadow-xs">
      {/* Left: Mobile Sidebar Toggle, Back Button & Title */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <button 
          className="md:hidden text-[#6B7280] hover:text-[#111827] p-1 hover:bg-slate-100 rounded-lg transition-colors"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open Sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {!isRootLandingPage && (
          <button
            onClick={() => navigate(-1)}
            className="md:hidden flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <h2 className="md:hidden text-xs sm:text-sm font-bold text-slate-900 truncate max-w-[110px] sm:max-w-[200px]">
          {getPageTitle()}
        </h2>
      </div>

      {/* Right: Search, Badges, Workspace Switcher, Notifications, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3.5">
        {/* Global Quick Search */}
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

        {/* Workspace Switcher */}
        <WorkspaceSwitcher />

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
  );
};

export default SharedHeader;
