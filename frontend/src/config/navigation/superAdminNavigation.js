import { 
  LayoutDashboard, Building2, CreditCard, ToggleLeft, 
  FileBarChart2 
} from 'lucide-react';
import { ROUTES } from '../../constants/routes';

export const superAdminNavigation = [
  {
    id: 'superadmin.dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    route: ROUTES.SUPER_ADMIN.DASHBOARD,
    matchPaths: [ROUTES.SUPER_ADMIN.DASHBOARD],
    workspace: 'superadmin',
    group: 'admin',
    order: 1
  },
  {
    id: 'superadmin.hospitals',
    title: 'Hospitals & Tenants',
    icon: Building2,
    route: ROUTES.SUPER_ADMIN.HOSPITALS,
    matchPaths: [ROUTES.SUPER_ADMIN.HOSPITALS],
    workspace: 'superadmin',
    group: 'admin',
    order: 2
  },
  {
    id: 'superadmin.plans',
    title: 'Subscription Plans',
    icon: CreditCard,
    route: ROUTES.SUPER_ADMIN.PLANS,
    matchPaths: [ROUTES.SUPER_ADMIN.PLANS, '/plans'],
    workspace: 'superadmin',
    group: 'admin',
    order: 3
  },

  {
    id: 'superadmin.features',
    title: 'Feature Flags',
    icon: ToggleLeft,
    route: '/features',
    matchPaths: ['/features'],
    workspace: 'superadmin',
    group: 'admin',
    order: 5
  },
  {
    id: 'superadmin.audit_logs',
    title: 'Platform Audit Logs',
    icon: FileBarChart2,
    route: ROUTES.SUPER_ADMIN.AUDIT_LOGS,
    matchPaths: [ROUTES.SUPER_ADMIN.AUDIT_LOGS],
    workspace: 'superadmin',
    group: 'reports',
    order: 6
  },

];

export default superAdminNavigation;
