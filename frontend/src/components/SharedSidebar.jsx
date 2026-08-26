import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import toast from 'react-hot-toast';
import { getNavigationByRole } from '../config/navigation';
import { USER_ROLES } from '../constants/roles';
import { 
  LayoutDashboard, GitBranch, ClipboardList, CreditCard, UserRound, Users,
  FileBarChart2, Building2, Clock, Settings, LogOut, X, Calendar,
  Stethoscope, History, Pill, UserPlus, Ticket, HeartPulse, Receipt,
  Package, Database, ShoppingBag, FileCode2, Key, ToggleLeft, Printer
} from 'lucide-react';

const SharedSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { workspaceMode } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  // Determine active role mode
  const isSuperAdmin = user?.role === USER_ROLES.SUPER_ADMIN;
  const isReceptionist = user?.role === USER_ROLES.RECEPTIONIST;
  const isPharmacist = user?.role === USER_ROLES.PHARMACIST;
  const isDoctorMode = (!isReceptionist && !isPharmacist && !isSuperAdmin && workspaceMode === 'clinical_consultation') || (user?.role === USER_ROLES.DOCTOR && workspaceMode !== 'hospital_management');

  // Role title for sidebar top header
  const getSidebarHeaderTitle = () => {
    if (isSuperAdmin) return 'Platform Admin';
    if (isReceptionist) return 'Reception Desk';
    if (isPharmacist) return 'Pharmacy Dept';
    if (isDoctorMode) return 'Doctor Desk';
    return 'Hospital Admin';
  };

  // Configuration-driven Navigation Layer
  const hospitalMode = user?.hospital?.opdOperationMode || user?.opdOperationMode || 'FULL_DIGITAL';
  const rawConfigNav = getNavigationByRole(user?.role, workspaceMode, hospitalMode);
  
  const currentNav = [
    ...rawConfigNav.map((item) => ({
      title: item.title,
      icon: item.icon,
      path: item.route,
      matchPaths: item.matchPaths
    })),
    { title: 'Profile', icon: UserRound, path: '/profile' },
    { title: 'Logout', icon: LogOut, path: null, isAction: true, onClick: handleLogout }
  ];

  return (
    <aside 
      className={`fixed top-0 bottom-0 left-0 z-40 h-screen w-[270px] bg-white border-r border-[#E5E7EB] flex flex-col shrink-0 transition-transform duration-300 md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Top Header Section */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-[#E5E7EB] shrink-0">
        <Link to={currentNav[0]?.path || '/'} className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
          <div className="w-8 h-8 rounded-lg bg-[#2F63F2] flex items-center justify-center font-extrabold text-white text-sm shadow-sm">
            V
          </div>
          <div className="flex flex-col text-left">
            <span className="font-bold text-sm tracking-tight text-[#111827] leading-none">
              VillZone HIMS
            </span>
            <span className="text-[10px] text-[#6B7280] font-medium tracking-wide mt-1">
              {getSidebarHeaderTitle()}
            </span>
          </div>
        </Link>
        <button className="md:hidden text-[#6B7280] hover:text-[#111827]" onClick={() => setSidebarOpen(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation List Section */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {currentNav.map((item, idx) => {
          if (item.check && !item.check()) return null;

          const Icon = item.icon;
          const currentQueryTab = searchParams.get('tab');

          let isActive = false;
          if (!item.isAction) {
            if (item.queryTab) {
              isActive = location.pathname.includes('/pharmacy/dispense') && 
                (currentQueryTab === item.queryTab || (item.queryTab === 'queue' && !currentQueryTab));
            } else if (item.path) {
              const cleanPath = item.path.split('?')[0];
              isActive = location.pathname === cleanPath || 
                (item.matchPaths && item.matchPaths.some(p => location.pathname.includes(p)));
            }
          }

          if (item.isAction) {
            return (
              <button
                key={idx}
                title={item.title}
                onClick={() => {
                  setSidebarOpen(false);
                  if (item.onClick) item.onClick();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold text-rose-600 hover:bg-rose-50 transition-all duration-150 group text-left border-l-[3px] border-l-transparent"
              >
                {React.isValidElement(Icon) ? Icon : <Icon className="w-4 h-4 text-rose-500 group-hover:translate-x-[2px] transition-transform duration-150 flex-shrink-0" />}
                <span className="truncate">{item.title}</span>
              </button>
            );
          }

          return (
            <Link
              key={idx}
              to={item.path}
              title={item.title}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-150 group text-left ${
                isActive
                  ? 'bg-[#EEF4FF] text-[#2F63F2] border-l-[3px] border-l-[#2F63F2]'
                  : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] border-l-[3px] border-l-transparent'
              }`}
            >
              {React.isValidElement(Icon) ? Icon : <Icon className={`w-4 h-4 flex-shrink-0 group-hover:translate-x-[2px] transition-transform duration-150 ${
                isActive ? 'text-[#2F63F2]' : 'text-[#6B7280]'
              }`} />}
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default SharedSidebar;
