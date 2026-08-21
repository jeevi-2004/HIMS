import { 
  LayoutDashboard, Users, Calendar, CalendarCheck, Stethoscope, FileText, 
  History, UserRound, FileCode2, FileBarChart2 
} from 'lucide-react';
import { ROUTES } from '../../constants/routes';
import { PERMISSIONS } from '../../constants/permissions';

export const doctorNavigation = [
  {
    id: 'doctor.dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    route: ROUTES.DOCTOR.DASHBOARD,
    matchPaths: [ROUTES.DOCTOR.DASHBOARD],
    permission: PERMISSIONS.PATIENT_VIEW,
    workspace: 'doctor',
    group: 'clinical',
    order: 1
  },
  {
    id: 'doctor.queue',
    title: "Today's Queue",
    icon: Users,
    route: ROUTES.DOCTOR.QUEUE,
    matchPaths: [ROUTES.DOCTOR.QUEUE, '/clinical/today-patients', '/today-patients'],
    permission: PERMISSIONS.CONSULTATION_VIEW,
    workspace: 'doctor',
    group: 'clinical',
    order: 2
  },
  {
    id: 'doctor.consultation',
    title: 'Consultation Workspace',
    icon: Stethoscope,
    route: ROUTES.DOCTOR.CONSULTATION,
    matchPaths: [ROUTES.DOCTOR.CONSULTATION, '/clinical/consultation'],
    permission: PERMISSIONS.CONSULTATION_START,
    workspace: 'doctor',
    group: 'clinical',
    order: 3
  },

  {
    id: 'doctor.completed',
    title: 'Completed Visits',
    icon: History,
    route: ROUTES.DOCTOR.COMPLETED_VISITS,
    matchPaths: [ROUTES.DOCTOR.COMPLETED_VISITS, '/clinical/completed-visits'],
    permission: PERMISSIONS.PATIENT_VIEW,
    workspace: 'doctor',
    group: 'clinical',
    order: 5
  },
  {
    id: 'doctor.followup',
    title: 'Follow-up Schedule',
    icon: CalendarCheck,
    route: ROUTES.DOCTOR.FOLLOW_UPS,
    matchPaths: [ROUTES.DOCTOR.FOLLOW_UPS, '/clinical/follow-ups'],
    permission: PERMISSIONS.CONSULTATION_VIEW,
    workspace: 'doctor',
    group: 'clinical',
    order: 6
  },

  {
    id: 'doctor.masters',
    title: 'Clinical Masters Library',
    icon: FileCode2,
    route: ROUTES.DOCTOR.CLINICAL_MASTERS,
    matchPaths: [ROUTES.DOCTOR.CLINICAL_MASTERS, '/clinical-masters'],
    permission: PERMISSIONS.MASTERS_MANAGE,
    workspace: 'doctor',
    group: 'masters',
    order: 8
  },
  {
    id: 'doctor.reports',
    title: 'Clinical Reports',
    icon: FileBarChart2,
    route: ROUTES.DOCTOR.REPORTS,
    matchPaths: [ROUTES.DOCTOR.REPORTS],
    permission: PERMISSIONS.REPORTS_VIEW,
    workspace: 'doctor',
    group: 'reports',
    order: 9
  }
];

export default doctorNavigation;
