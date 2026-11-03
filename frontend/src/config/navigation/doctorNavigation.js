import { 
  LayoutDashboard, Users, CalendarCheck, Stethoscope, 
  History, FileCode2, Bed
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
  // IPD Department — automatically hidden by navigationHelpers when IPD is not enabled for this hospital
  {
    id: 'doctor.ipd',
    title: 'IPD Department',
    icon: Bed,
    route: ROUTES.DOCTOR.IPD_DEPARTMENT || '/doctor/ipd',
    matchPaths: ['/doctor/ipd'],
    permission: PERMISSIONS.PATIENT_VIEW,
    featureFlag: 'IPD',
    workspace: 'doctor',
    group: 'ipd',
    order: 9,
    submenu: [
      {
        id: 'doctor.ipd.inpatients',
        title: 'Inpatients',
        route: ROUTES.DOCTOR.IPD_INPATIENTS,
        matchPaths: [ROUTES.DOCTOR.IPD_INPATIENTS]
      },
      {
        id: 'doctor.ipd.wards',
        title: 'Wards & Beds',
        route: ROUTES.DOCTOR.IPD_WARDS,
        matchPaths: [ROUTES.DOCTOR.IPD_WARDS]
      },
      {
        id: 'doctor.ipd.discharge',
        title: 'Discharge History',
        route: ROUTES.DOCTOR.IPD_DISCHARGE,
        matchPaths: [ROUTES.DOCTOR.IPD_DISCHARGE]
      },
      {
        id: 'doctor.ipd.reports',
        title: 'IPD Reports',
        route: ROUTES.DOCTOR.IPD_REPORTS,
        matchPaths: [ROUTES.DOCTOR.IPD_REPORTS]
      }
    ]
  }
];

export default doctorNavigation;
