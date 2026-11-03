import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useBillingSettings } from '../context/BillingSettingsContext';
import toast from 'react-hot-toast';
import { getNavigationByRole } from '../config/navigation';
import { USER_ROLES } from '../constants/roles';
import { 
  LayoutDashboard, GitBranch, ClipboardList, CreditCard, UserRound, Users,
  FileBarChart2, Building2, Clock, Settings, LogOut, X, Calendar,
  Stethoscope, History, Pill, UserPlus, Ticket, HeartPulse, Receipt,
  Package, Database, ShoppingBag, FileCode2, Key, ToggleLeft, Printer,
  ChevronRight, ChevronDown
} from 'lucide-react';

const SharedSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { workspaceMode, setWorkspaceMode, allowedWorkspaces, showSwitcher } = useWorkspace();
  const { billingSettings } = useBillingSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [expandedMenus, setExpandedMenus] = React.useState({});

  const toggleSubmenu = (menuTitle) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuTitle]: !prev[menuTitle]
    }));
  };

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
  const hospitalMode = user?.hospital?.opdOperationMode || user?.opdOperationMode || billingSettings?.opdOperationMode || 'TOKEN_ONLY';
  const rawConfigNav = getNavigationByRole(user?.role, workspaceMode, hospitalMode, user);
  
  const currentNav = [
    ...rawConfigNav.map((item) => ({
      id: item.id,
      title: item.title,
      icon: item.icon,
      path: item.route,
      route: item.route,
      matchPaths: item.matchPaths,
      submenu: item.submenu
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

      {/* Mobile Drawer Workspace Switcher Block */}
      {showSwitcher && (
        <div className="p-3 bg-slate-50 border-b border-[#E5E7EB] md:hidden text-left space-y-1.5 shrink-0">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold px-1">Active Workspace</span>
          <div className="grid grid-cols-2 gap-1.5">
            {allowedWorkspaces.map((ws) => {
              const isSelected = ws.id === workspaceMode;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    setWorkspaceMode(ws.id);
                    setSidebarOpen(false);
                    if (ws.id === 'hospital_management') {
                      navigate('/admin/dashboard');
                    } else {
                      navigate('/doctor/dashboard');
                    }
                  }}
                  className={`p-2 rounded-xl border text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate ${
                    isSelected
                      ? 'bg-white border-[#2F63F2] text-[#2F63F2] shadow-xs'
                      : 'bg-transparent border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  {ws.id === 'hospital_management' ? <Building2 className="w-3.5 h-3.5 shrink-0" /> : <Stethoscope className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{ws.id === 'hospital_management' ? 'Admin' : 'Doctor Desk'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation List Section */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {currentNav.map((item, idx) => {
          if (item.check && !item.check()) return null;

          const Icon = item.icon;
          const currentQueryTab = searchParams.get('tab');
          const isIPDConsultation = (location.pathname.includes('/consultation') || location.pathname.includes('/prescription')) && 
            (searchParams.get('type') === 'ipd' || location.search.includes('type=ipd'));

          let isActive = false;
          if (!item.isAction) {
            // Prevent Consultation Workspace from stealing active highlight during IPD consultation
            if (isIPDConsultation && (item.title === 'Consultation Workspace' || item.id === 'doctor.consultation' || (item.path && item.path.includes('/consultation')))) {
              isActive = false;
            } else if (item.queryTab) {
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

          if (item.submenu && item.submenu.length > 0) {
            const isIPDMenu = item.title === 'IPD Department' || item.id === 'doctor.ipd' || 
              (item.route && item.route.includes('/ipd')) || (item.path && item.path.includes('/ipd'));
            
            const isParentActive = (item.path && location.pathname === item.path) ||
              (item.route && location.pathname === item.route) ||
              (item.matchPaths && item.matchPaths.some(p => location.pathname === p));
            
            const hasActiveChild = item.submenu.some(sub => 
              (isIPDConsultation && isIPDMenu && (sub.title === 'Inpatients' || sub.id === 'doctor.ipd.inpatients' || (sub.route && sub.route.includes('/inpatients')))) ||
              location.pathname === sub.route || 
              (sub.matchPaths && sub.matchPaths.some(p => location.pathname === p || location.pathname.startsWith(p)))
            );
            const isSubmenuActive = isParentActive || hasActiveChild;
            const isExpanded = expandedMenus[item.title] !== undefined 
              ? expandedMenus[item.title] 
              : isSubmenuActive;

            return (
              <div key={idx} className="flex flex-col gap-1">
                <button
                  title={item.title}
                  onClick={() => {
                    if (item.path || item.route) {
                      if (location.pathname !== (item.path || item.route)) {
                        navigate(item.path || item.route);
                        setExpandedMenus(prev => ({ ...prev, [item.title]: true }));
                      } else {
                        toggleSubmenu(item.title);
                      }
                    } else {
                      toggleSubmenu(item.title);
                    }
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-150 group text-left ${
                    isParentActive
                      ? 'bg-[#EEF4FF] text-[#2F63F2] border-l-[3px] border-l-[#2F63F2]'
                      : hasActiveChild
                      ? 'text-[#2F63F2] hover:bg-[#F3F4F6] border-l-[3px] border-l-transparent'
                      : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] border-l-[3px] border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {React.isValidElement(Icon) ? Icon : <Icon className={`w-4 h-4 flex-shrink-0 group-hover:translate-x-[2px] transition-transform duration-150 ${
                      (isParentActive || hasActiveChild) ? 'text-[#2F63F2]' : 'text-[#6B7280]'
                    }`} />}
                    <span className="truncate">{item.title}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className={`w-4 h-4 ${isParentActive ? 'text-[#2F63F2]' : 'text-[#9CA3AF]'}`} />
                  ) : (
                    <ChevronRight className={`w-4 h-4 ${isParentActive ? 'text-[#2F63F2]' : 'text-[#9CA3AF]'}`} />
                  )}
                </button>
                {isExpanded && (
                  <div className="flex flex-col gap-1 pl-4 mt-1">
                    {item.submenu.map((subItem, subIdx) => {
                      const isSubActive = (isIPDConsultation && isIPDMenu && (subItem.title === 'Inpatients' || subItem.id === 'doctor.ipd.inpatients' || (subItem.route && subItem.route.includes('/inpatients')))) ||
                        location.pathname === subItem.route || 
                        (subItem.matchPaths && subItem.matchPaths.some(p => location.pathname.includes(p)));
                      
                      return (
                        <Link
                          key={subIdx}
                          to={subItem.route}
                          title={subItem.title}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-150 ${
                            isSubActive
                              ? 'text-[#2F63F2] bg-[#EEF4FF]/50 font-semibold'
                              : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isSubActive ? 'bg-[#2F63F2]' : 'bg-slate-300'}`} />
                          <span className="truncate">{subItem.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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
