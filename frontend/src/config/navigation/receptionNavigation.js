import { 
  LayoutDashboard, Calendar, Users, Printer, FileBarChart2 
} from 'lucide-react';
import { ROUTES } from '../../constants/routes';
import { PERMISSIONS } from '../../constants/permissions';

export const receptionNavigation = [
  {
    id: 'reception.dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    route: ROUTES.RECEPTION.DASHBOARD,
    matchPaths: [ROUTES.RECEPTION.DASHBOARD],
    permission: PERMISSIONS.PATIENT_VIEW,
    workspace: 'reception',
    group: 'reception',
    order: 1
  },
  {
    id: 'reception.appointments',
    title: 'OPD Desk & Appointments',
    icon: Calendar,
    route: ROUTES.RECEPTION.APPOINTMENTS,
    matchPaths: [ROUTES.RECEPTION.APPOINTMENTS, '/reception/patient-registration', '/reception/register'],
    permission: PERMISSIONS.PATIENT_CREATE,
    workspace: 'reception',
    group: 'reception',
    order: 2
  },
  {
    id: 'reception.queue',
    title: 'Token & Live Queue',
    icon: Users,
    route: ROUTES.RECEPTION.QUEUE,
    matchPaths: [ROUTES.RECEPTION.QUEUE, '/reception/token-queue'],
    permission: PERMISSIONS.PATIENT_VIEW,
    workspace: 'reception',
    group: 'reception',
    order: 3
  },
  {
    id: 'reception.printQueue',
    title: 'Prescription Print Queue',
    icon: Printer,
    route: ROUTES.RECEPTION.PRINT_QUEUE,
    matchPaths: [ROUTES.RECEPTION.PRINT_QUEUE],
    permission: PERMISSIONS.PATIENT_VIEW,
    workspace: 'reception',
    group: 'reception',
    order: 4
  },
  {
    id: 'reception.reports',
    title: 'Reception Reports',
    icon: FileBarChart2,
    route: ROUTES.RECEPTION.REPORTS,
    matchPaths: [ROUTES.RECEPTION.REPORTS],
    permission: PERMISSIONS.REPORTS_VIEW,
    workspace: 'reception',
    group: 'reports',
    order: 5
  }
];

export default receptionNavigation;
