import { 
  LayoutDashboard, Pill, History, Package, ShoppingBag, 
  Users, FileBarChart2, Settings, Bed 
} from 'lucide-react';
import { ROUTES } from '../../constants/routes';
import { PERMISSIONS } from '../../constants/permissions';

export const pharmacyNavigation = [
  {
    id: 'pharmacy.dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    route: ROUTES.PHARMACY.DASHBOARD,
    matchPaths: [ROUTES.PHARMACY.DASHBOARD],
    permission: PERMISSIONS.PHARMACY_DISPENSE,
    workspace: 'pharmacy',
    group: 'pharmacy',
    order: 1
  },
  {
    id: 'pharmacy.dispense',
    title: 'OPD Dispense Desk',
    icon: Pill,
    route: ROUTES.PHARMACY.DISPENSE,
    matchPaths: [ROUTES.PHARMACY.DISPENSE, '/pharmacy/dispense/queue', '/pharmacy/billing'],
    permission: PERMISSIONS.PHARMACY_DISPENSE,
    workspace: 'pharmacy',
    group: 'pharmacy',
    order: 2
  },
  {
    id: 'pharmacy.ipd-dispense',
    title: 'IPD Dispense Desk',
    icon: Bed,
    route: ROUTES.PHARMACY.IPD_DISPENSE,
    matchPaths: [ROUTES.PHARMACY.IPD_DISPENSE],
    permission: PERMISSIONS.PHARMACY_DISPENSE,
    featureFlag: 'IPD',
    workspace: 'pharmacy',
    group: 'pharmacy',
    order: 3
  },
  {
    id: 'pharmacy.reports',
    title: 'Pharmacy Reports',
    icon: FileBarChart2,
    route: ROUTES.PHARMACY.REPORTS,
    matchPaths: [ROUTES.PHARMACY.REPORTS],
    permission: PERMISSIONS.REPORTS_VIEW,
    workspace: 'pharmacy',
    group: 'reports',
    order: 4
  },
];

export default pharmacyNavigation;
