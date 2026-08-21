import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import Card from '../components/Card';
import Table from '../components/Table';
import Button from '../components/Button';
import Modal from '../components/Modal';
import AppointmentBookingModal from '../components/AppointmentBookingModal';
import OpdTokenPrintModal from '../components/OpdTokenPrintModal';
import { 
  Calendar, Clock, CreditCard, UserPlus, HeartPulse, ShieldCheck, UserCheck, Plus,
  Ticket, SkipForward, RotateCcw, Eye, DoorOpen, Activity, CheckCircle2
} from 'lucide-react';
import { useBillingSettings } from '../context/BillingSettingsContext';

// Payment Collection Modal Component
const PaymentCollectionModal = ({ appointment, isOpen, onClose, onSuccess }) => {
  if (!isOpen || !appointment) return null;

  const [consultationFee, setConsultationFee] = useState(appointment.consultationFee ?? appointment.doctorId?.consultationFee ?? 500);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (appointment) {
      setConsultationFee(appointment.consultationFee ?? appointment.doctorId?.consultationFee ?? 500);
    }
  }, [appointment]);

  const handleConfirmPayment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put(`/operations/appointments/${appointment._id}/queue`, {
        billingStatus: 'Paid',
        paymentMethod,
        consultationFee: Number(consultationFee) || 500
      });
      toast.success(`Payment of ₹${consultationFee} collected successfully (${paymentMethod})!`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to collect payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="COLLECT PAYMENT"
      maxWidth="max-w-[450px]"
    >
      <form onSubmit={handleConfirmPayment} className="space-y-4 text-left">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Patient:</span>
            <strong className="text-slate-900">{appointment.patientId?.name}</strong>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Token Number:</span>
            <strong className="text-[#3563F6] font-mono">#{appointment.tokenNumber}</strong>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Doctor:</span>
            <span className="text-slate-800 font-semibold">{appointment.doctorId?.name}</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">Consultation Fee (₹)</label>
          <input
            type="number"
            value={consultationFee}
            onChange={(e) => setConsultationFee(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-[#3563F6] font-mono focus:outline-none focus:ring-2 focus:ring-[#3563F6]/20"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">Payment Method</label>
          <div className="grid grid-cols-4 gap-2">
            {['Cash', 'UPI', 'Card', 'Credit'].map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                  paymentMethod === method
                    ? 'bg-[#3563F6] text-white border-[#3563F6]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirm Payment</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

const ReceptionistDashboard = () => {
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [paymentModalApp, setPaymentModalApp] = useState(null);
  const [tokenPrintModalApp, setTokenPrintModalApp] = useState(null);

  const { billingSettings } = useBillingSettings();
  const isReceptionFeeCollector = (billingSettings?.feeCollectionRole || 'Reception') === 'Reception';

  // Fetch today's appointments
  const { data: appointments, isLoading: appLoading, refetch: appointmentsRefetch } = useQuery({
    queryKey: ['appointments', 'todayDashboardSummary'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/operations/appointments?date=${today}`);
      return res.data.data;
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });



  // Fetch doctors
  const { data: doctors } = useQuery({
    queryKey: ['doctors', 'dashboardList'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR');
      return res.data.data;
    }
  });

  const todayApps = appointments || [];
  const totalAppointments = todayApps.length;
  const waitingCount = todayApps.filter(a => (a.status === 'Waiting' || a.queueStatus === 'Waiting' || a.status === 'Admitted')).length;
  const inConsultationCount = todayApps.filter(a => (a.status === 'In Consultation' || a.queueStatus === 'In-Consultation')).length;
  const sentToPharmacyCount = todayApps.filter(a => (a.status === 'Sent to Pharmacy' || a.status === 'Sent To Pharmacy' || a.queueStatus === 'Sent to Pharmacy' || a.queueStatus === 'Sent To Pharmacy' || a.pharmacyStatus === 'SENT' || a.pharmacyStatus === 'DISPENSING')).length;
  const completedCount = todayApps.filter(a => a.status === 'Completed' || a.queueStatus === 'Completed').length;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, queueStatus }) => {
      const res = await api.put(`/operations/appointments/${id}/queue`, { status, queueStatus });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Patient status updated to Arrived!');
      appointmentsRefetch();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  });

  return (
    <div className="space-y-8 text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Receptionist Dashboard</h1>
          <p className="text-xs text-slate-500 font-medium mt-2">
            Welcome back! Manage patient profiles, generate OPD tokens, and monitor consulting rooms.
          </p>
        </div>
        <Button
          onClick={() => setIsBookOpen(true)}
          variant="primary"
          icon={Plus}
          className="text-xs font-bold uppercase tracking-wider h-[42px] px-5 bg-[#2F63F2]"
        >
          Generate Token
        </Button>
      </div>
      
      {/* 1. Quick Stats Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl flex flex-col justify-between shadow-sm text-left h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Total Visits</span>
            <Calendar className="w-4 h-4 text-[#2F63F2]" />
          </div>
          <span className="text-2xl font-extrabold text-slate-800 font-mono">{totalAppointments}</span>
        </div>

        <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl flex flex-col justify-between shadow-sm text-left h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Waiting</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-2xl font-extrabold text-slate-800 font-mono">{waitingCount}</span>
        </div>

        <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl flex flex-col justify-between shadow-sm text-left h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-purple-600">Consulting</span>
            <HeartPulse className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-2xl font-extrabold text-purple-700 font-mono">{inConsultationCount}</span>
        </div>

        <div className="bg-[#FFF3CD]/40 border border-[#F59E0B]/30 p-5 rounded-2xl flex flex-col justify-between shadow-sm text-left h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#B45309]">Sent to Pharmacy</span>
            <Clock className="w-4 h-4 text-[#B45309]" />
          </div>
          <span className="text-2xl font-extrabold text-[#B45309] font-mono">{sentToPharmacyCount}</span>
        </div>

        <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl flex flex-col justify-between shadow-sm text-left h-28 hover:shadow-md transition-all">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Completed</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-2xl font-extrabold text-slate-800 font-mono text-emerald-600">{completedCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Table summary of active queue */}
        <div className="lg:col-span-2">
          <Card title="🛎️ Active Intake Desk Queue" subtitle="Recently registered patient queue logs.">
            <Table
              headers={[
                {
                  key: 'tokenNumber',
                  label: 'Token',
                  render: (row) => {
                    const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (row.tokenNumber || '').startsWith('EMG') || (row.patientId?.name || '').toLowerCase().includes('unknown');
                    return (
                      <span className={`font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border ${
                        isEmg ? 'text-rose-700 bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 font-extrabold' : 'text-[#2F63F2] bg-[#2F63F2]/10 border-[#2F63F2]/20'
                      }`}>
                        {row.tokenNumber || 'N/A'}
                      </span>
                    );
                  }
                },
                {
                  key: 'patientId.name',
                  label: 'Patient Name',
                  render: (row) => (
                    <span className="font-bold text-slate-900 text-sm">{row.patientId?.name || 'Unknown'}</span>
                  )
                },
                {
                  key: 'doctorId.name',
                  label: 'Doctor',
                  render: (row) => <span className="font-semibold text-slate-700">{row.doctorId?.name || 'Unassigned'}</span>
                },
                {
                  key: 'patientStatus',
                  label: 'Patient Status',
                  render: (row) => {
                    const isEmg = row.isEmergency || row.priorityLevel === 'EMERGENCY' || row.priority === 'EMERGENCY' || (row.consultationType || '').toLowerCase() === 'emergency' || (row.patientId?.name || '').toLowerCase().includes('unknown');
                    const status = row.status || row.queueStatus || 'Waiting';

                    if (isEmg && (status === 'Scheduled' || status === 'Waiting' || status === 'Arrived')) {
                      return (
                        <span className="text-[9px] font-extrabold border border-rose-300 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping shrink-0" />
                          PRIORITY WAITING
                        </span>
                      );
                    }

                    const colors = {
                      'Waiting': 'bg-blue-50 text-blue-600 border-blue-100',
                      'Called': 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold',
                      'In Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
                      'In-Consultation': 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
                      'Sent to Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                      'Sent To Pharmacy': 'bg-[#FFF3CD] text-[#B45309] border-[#F59E0B] font-bold',
                      'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-100',
                      'Skipped': 'bg-amber-50 text-amber-600 border-amber-100',
                      'Cancelled': 'bg-rose-50 text-rose-600 border-rose-100',
                      'Emergency': 'bg-red-100 text-red-700 border-red-200 font-extrabold'
                    };

                    return (
                      <span className={`text-[9px] font-bold border px-2.5 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap inline-block ${colors[status] || 'bg-slate-50'}`}>
                        {status}
                      </span>
                    );
                  }
                },
                {
                  key: 'paymentStatus',
                  label: 'Payment Status',
                  render: (row) => {
                    const billingStatus = row.billingStatus || 'Unpaid';

                    if (billingStatus === 'Paid') {
                      return (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 w-fit whitespace-nowrap">
                          🟢 Paid
                        </span>
                      );
                    }
                    if (billingStatus === 'Exempt') {
                      return (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                          🔵 Exempt
                        </span>
                      );
                    }
                    if (billingStatus === 'Refunded') {
                      return (
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                          ⚪ Refunded
                        </span>
                      );
                    }

                    if (isReceptionFeeCollector) {
                      return (
                        <button
                          type="button"
                          onClick={() => setPaymentModalApp(row)}
                          className="text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer"
                        >
                          Collect Payment
                        </button>
                      );
                    }

                    return (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                        Pending
                      </span>
                    );
                  }
                }
              ]}
              data={todayApps}
              loading={appLoading}
              inlineActions={false}
              actions={[
                /* 1. Engine-Approved Action */
                {
                  label: (row) => {
                    const billingStatus = row.billingStatus || 'Unpaid';
                    const status = row.status || row.queueStatus || 'Waiting';

                    if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                      return 'Collect Payment';
                    }
                    if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                      return 'Print Token';
                    }
                    if (status === 'Called') return 'Sent to Doctor';
                    if (status === 'In Consultation' || status === 'In-Consultation') return 'In Consultation';
                    if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return 'View';
                    if (status === 'Skipped') return 'Skipped';

                    return status;
                  },
                  icon: (row) => {
                    const billingStatus = row.billingStatus || 'Unpaid';
                    const status = row.status || row.queueStatus || 'Waiting';

                    if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                      return null;
                    }
                    if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                      return Ticket;
                    }
                    if (status === 'Called') return DoorOpen;
                    if (status === 'In Consultation' || status === 'In-Consultation') return Activity;
                    if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') return Eye;

                    return null;
                  },
                  isPrimary: true,
                  disabled: (row) => {
                    const billingStatus = row.billingStatus || 'Unpaid';
                    const status = row.status || row.queueStatus || 'Waiting';

                    if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                      return false;
                    }
                    if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                      return false;
                    }
                    if (status === 'Sent to Pharmacy' || status === 'Sent To Pharmacy' || status === 'Completed') {
                      return false;
                    }
                    return true;
                  },
                  onClick: (row) => {
                    const billingStatus = row.billingStatus || 'Unpaid';
                    const status = row.status || row.queueStatus || 'Waiting';

                    if (billingStatus !== 'Paid' && billingStatus !== 'Exempt' && isReceptionFeeCollector) {
                      setPaymentModalApp(row);
                    } else if (status === 'Waiting' || status === 'Scheduled' || status === 'Admitted') {
                      setTokenPrintModalApp(row);
                    }
                  }
                },

                /* 2. Skip Action */
                {
                  label: 'Skip',
                  icon: SkipForward,
                  isPrimary: true,
                  variant: 'amber',
                  show: (row) => {
                    const status = row.status || row.queueStatus || 'Waiting';
                    return status === 'Waiting' || status === 'Scheduled' || status === 'Called';
                  },
                  onClick: (row) => {
                    updateStatusMutation.mutate({ id: row._id, queueStatus: 'Skipped', status: 'Skipped' });
                  }
                },

                /* 3. Re-Queue Action */
                {
                  label: 'Re-Queue',
                  icon: RotateCcw,
                  isPrimary: true,
                  variant: 'blue',
                  show: (row) => {
                    const status = row.status || row.queueStatus || 'Waiting';
                    return status === 'Skipped';
                  },
                  onClick: (row) => {
                    updateStatusMutation.mutate({ id: row._id, queueStatus: 'Waiting', status: 'Admitted' });
                  }
                }
              ]}
            />
            <div className="pt-2 text-right">
              <Link to="/reception/appointments" className="text-xs font-bold text-[#2F63F2] hover:underline uppercase tracking-wider">
                View Full Patient List &rarr;
              </Link>
            </div>
          </Card>
        </div>

        {/* Real-time Room schedules */}
        <div className="lg:col-span-1">
          <Card title="🩺 Consulting Room Load" subtitle="Doctor schedules & wait counts.">
            <div className="space-y-4 pt-1 max-h-[300px] overflow-y-auto">
              {doctors?.map(d => {
                const docWaitingList = todayApps.filter(a => a.doctorId?._id === d._id && a.queueStatus === 'Waiting');
                const waitingCount = docWaitingList.length;

                return (
                  <div key={d._id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-left">
                      <h4 className="text-xs font-bold text-slate-800">{d.name}</h4>
                      <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">{d.departmentId?.name || 'General OPD'}</span>
                    </div>
                    <span className={`text-[9px] font-bold px-2.5 py-1 rounded-xl uppercase tracking-wider ${waitingCount > 3 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                      {waitingCount} Waiting
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

      </div>

      <AppointmentBookingModal
        isOpen={isBookOpen}
        onClose={() => setIsBookOpen(false)}
        onSuccess={() => appointmentsRefetch()}
      />

      <PaymentCollectionModal
        appointment={paymentModalApp}
        isOpen={!!paymentModalApp}
        onClose={() => setPaymentModalApp(null)}
        onSuccess={() => appointmentsRefetch()}
      />

      <OpdTokenPrintModal
        isOpen={!!tokenPrintModalApp}
        onClose={() => setTokenPrintModalApp(null)}
        appointment={tokenPrintModalApp}
      />

    </div>
  );
};

export default ReceptionistDashboard;
