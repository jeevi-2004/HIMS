import React from 'react';
import { useBillingSettings } from '../../context/BillingSettingsContext';
import { 
  User, Edit, FileText, Pill, Receipt, Calendar, RotateCcw, Printer, XCircle 
} from 'lucide-react';

const WorkflowSecondaryActionsMenu = ({ 
  appointment, 
  role = 'Reception', 
  onActionSelect 
}) => {
  const { getAppointmentActions } = useBillingSettings();

  if (!appointment) return [];

  const evaluated = getAppointmentActions(appointment, role);
  const actions = evaluated.actions;
  const status = appointment.status || appointment.queueStatus || 'Waiting';

  const menuItems = [
    {
      id: 'view_info',
      label: 'View Patient Info',
      icon: User,
      show: () => actions.canViewPatient !== false
    },
    {
      id: 'edit_profile',
      label: 'Edit Profile',
      icon: Edit,
      show: () => status !== 'In Consultation' && status !== 'Admitted'
    },
    {
      id: 'visit_history',
      label: 'Visit History',
      icon: FileText,
      show: () => true
    },
    {
      id: 'view_consultation',
      label: 'View Consultation',
      icon: FileText,
      show: () => status === 'In Consultation' || status === 'Sent to Pharmacy' || status === 'Completed'
    },
    {
      id: 'view_prescription',
      label: 'View Prescription',
      icon: Pill,
      show: () => status === 'Sent to Pharmacy' || status === 'Completed'
    },
    {
      id: 'view_bill',
      label: 'View Bill',
      icon: Receipt,
      show: () => status === 'Sent to Pharmacy' || status === 'Completed'
    },
    {
      id: 'print_token',
      label: 'Print OPD Token',
      icon: Printer,
      show: () => actions.canPrintToken !== false
    },
    {
      id: 'recall_patient',
      label: 'Recall Patient',
      icon: RotateCcw,
      show: () => actions.canRecallPatient
    },
    {
      id: 'skip_token',
      label: 'Skip Patient',
      icon: XCircle,
      show: () => actions.canSkipPatient
    }
  ];

  return menuItems.filter(item => item.show());
};

export default WorkflowSecondaryActionsMenu;
