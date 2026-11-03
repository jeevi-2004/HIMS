import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBillingSettings } from '../../context/BillingSettingsContext';
import { isIpdAvailable, isFeatureModuleEnabled } from '../../utils/featureUtils';
import { 
  User, Edit, FileText, Pill, Receipt, Calendar, RotateCcw, Printer, XCircle, Bed 
} from 'lucide-react';

const WorkflowSecondaryActionsMenu = ({ 
  appointment, 
  role = 'Reception', 
  onActionSelect 
}) => {
  const { user } = useAuth();
  const { getAppointmentActions } = useBillingSettings();
  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));
  const isBillingEnabled = Boolean(isFeatureModuleEnabled(user?.hospital || user, 'Billing'));

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
      id: 'transfer_to_ipd',
      label: 'Transfer to IPD',
      icon: Bed,
      show: () => isIpdEnabled && status !== 'Admitted'
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
      show: () => isBillingEnabled && (status === 'Sent to Pharmacy' || status === 'Completed')
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
