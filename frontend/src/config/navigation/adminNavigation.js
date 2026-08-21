import { 
  LayoutDashboard, Settings, GitBranch, ClipboardList, CreditCard, 
  UserRound, Users, Printer, HeartPulse, FileBarChart2 
} from 'lucide-react';
import { ROUTES } from '../../constants/routes';
import { PERMISSIONS } from '../../constants/permissions';

export const adminNavigation = [
  {
    id: 'admin.dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    route: ROUTES.ADMIN.DASHBOARD,
    matchPaths: [ROUTES.ADMIN.DASHBOARD],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 1
  },
  {
    id: 'admin.settings',
    title: 'Settings',
    icon: Settings,
    route: ROUTES.ADMIN.SETTINGS,
    matchPaths: [ROUTES.ADMIN.SETTINGS, '/admin/billing-settings', '/hospital-profile'],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 2
  },
  {
    id: 'admin.prescription_print',
    title: 'Prescription Print Setup',
    icon: Printer,
    route: ROUTES.ADMIN.PRESCRIPTION_PRINT,
    matchPaths: [ROUTES.ADMIN.PRESCRIPTION_PRINT],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 3
  },
  {
    id: 'admin.billing_transactions',
    title: 'Billing Transactions',
    icon: CreditCard,
    route: '/admin/billing/transactions',
    matchPaths: ['/admin/billing/transactions'],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 3.5
  },
  {
    id: 'admin.branches',
    title: 'Branches & Departments',
    icon: GitBranch,
    route: ROUTES.ADMIN.DEPARTMENTS,
    matchPaths: [ROUTES.ADMIN.DEPARTMENTS, '/branches'],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 4
  },
  {
    id: 'admin.services',
    title: 'Services Catalog',
    icon: ClipboardList,
    route: ROUTES.ADMIN.SERVICES,
    matchPaths: [ROUTES.ADMIN.SERVICES],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 5
  },
  {
    id: 'admin.workforce',
    title: 'Staff Management',
    icon: Users,
    route: ROUTES.ADMIN.WORKFORCE,
    matchPaths: [ROUTES.ADMIN.WORKFORCE, ROUTES.ADMIN.DOCTORS, ROUTES.ADMIN.USERS, '/staff'],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 6
  },
  {
    id: 'admin.patients',
    title: 'Patients Registry',
    icon: UserRound,
    route: ROUTES.ADMIN.PATIENTS,
    matchPaths: [ROUTES.ADMIN.PATIENTS],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 7
  },
  {
    id: 'admin.live_operations',
    title: 'Live TV Display Board',
    icon: HeartPulse,
    route: '/display-board',
    matchPaths: ['/display-board', '/admin/live-operations'],
    permission: PERMISSIONS.BILLING_SETTINGS,
    workspace: 'admin',
    group: 'admin',
    order: 8
  },
  {
    id: 'admin.reports',
    title: 'Hospital Analytics & Reports',
    icon: FileBarChart2,
    route: ROUTES.ADMIN.REPORTS,
    matchPaths: [ROUTES.ADMIN.REPORTS],
    permission: PERMISSIONS.REPORTS_VIEW,
    workspace: 'admin',
    group: 'reports',
    order: 9
  }
];

export default adminNavigation;
