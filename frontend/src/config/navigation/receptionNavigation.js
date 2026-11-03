import { 
  LayoutDashboard, Calendar, Users, Printer, FileBarChart2, Bed
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
    title: 'OPD Desk & Walk-In Tokens',
    icon: Calendar,
    route: ROUTES.RECEPTION.APPOINTMENTS,
    matchPaths: [ROUTES.RECEPTION.APPOINTMENTS, '/reception/patient-registration', '/reception/register'],
    permission: PERMISSIONS.PATIENT_CREATE,
    workspace: 'reception',
    group: 'reception',
    order: 2
  },
  {
    id: 'reception.bookAppointments',
    title: 'Book Future Appointments',
    icon: Calendar,
    route: ROUTES.RECEPTION.BOOK_APPOINTMENTS,
    matchPaths: [ROUTES.RECEPTION.BOOK_APPOINTMENTS],
    permission: PERMISSIONS.PATIENT_CREATE,
    workspace: 'reception',
    group: 'reception',
    order: 3
  },
  {
    id: 'reception.queue',
    title: 'Live Doctor Queue',
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
  },
  // IPD Department — automatically hidden by navigationHelpers when IPD is not enabled for this hospital
  {
    id: 'reception.ipd',
    title: 'IPD Department',
    icon: Bed,
    route: ROUTES.RECEPTION.IPD_DEPARTMENT || '/reception/ipd',
    matchPaths: ['/reception/ipd'],
    permission: PERMISSIONS.PATIENT_CREATE,
    featureFlag: 'IPD',
    workspace: 'reception',
    group: 'ipd',
    order: 6,
    submenu: [
      {
        id: 'reception.ipd.inpatients',
        title: 'Inpatients',
        route: ROUTES.RECEPTION.IPD_INPATIENTS,
        matchPaths: [ROUTES.RECEPTION.IPD_INPATIENTS, ROUTES.RECEPTION.IPD_DISCHARGE]
      },
      {
        id: 'reception.ipd.wards',
        title: 'Wards & Beds',
        route: ROUTES.RECEPTION.IPD_WARDS,
        matchPaths: [ROUTES.RECEPTION.IPD_WARDS]
      },
      {
        id: 'reception.ipd.reports',
        title: 'IPD Reports',
        route: ROUTES.RECEPTION.IPD_REPORTS,
        matchPaths: [ROUTES.RECEPTION.IPD_REPORTS]
      }
    ]
  }
];

export default receptionNavigation;
