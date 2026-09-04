import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import toast from 'react-hot-toast';
import api from '../services/api';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import PinInput from '../components/PinInput';
import { 
  Lock, Eye, EyeOff, LogOut, FileBarChart2, Settings, Printer, 
  CreditCard, GitBranch, ClipboardList, UserRound, HeartPulse, ChevronRight,
  Building2, History
} from 'lucide-react';

const Profile = () => {
  const { user, logout } = useAuth();
  const { setWorkspaceMode } = useWorkspace();
  const navigate = useNavigate();
  
  const [pinForm, setPinForm] = useState({ oldPin: '', newPin: '', confirmPin: '' });
  const [pinErrors, setPinErrors] = useState({});
  const [showOldPin, setShowOldPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePinChange = async (e) => {
    e.preventDefault();
    const errs = {};

    if (!pinForm.oldPin || pinForm.oldPin.length !== 6) {
      errs.oldPin = 'Please enter your current 6-digit PIN.';
    }
    if (!pinForm.newPin || pinForm.newPin.length !== 6 || isNaN(pinForm.newPin)) {
      errs.newPin = 'New PIN must be exactly 6 numeric digits.';
    }
    if (!pinForm.confirmPin) {
      errs.confirmPin = 'Please confirm your new PIN.';
    } else if (pinForm.newPin !== pinForm.confirmPin) {
      errs.confirmPin = 'Confirm PIN does not match New PIN.';
    }

    if (Object.keys(errs).length > 0) {
      setPinErrors(errs);
      return;
    }
    setPinErrors({});

    setLoading(true);
    try {
      const res = await api.post('/auth/change-pin', {
        oldPin: pinForm.oldPin,
        newPin: pinForm.newPin
      });
      if (res.data.success) {
        toast.success('Security PIN changed successfully');
        setPinForm({ oldPin: '', newPin: '', confirmPin: '' });
        setPinErrors({});
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to change PIN';
      if (msg.toLowerCase().includes('old pin')) {
        setPinErrors({ oldPin: msg });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
      
      {/* Left Profile Details */}
      <Card className="md:col-span-1 text-center" title="User Profile">
        <div className="flex flex-col items-center py-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center font-bold text-white shadow-xl text-3xl border-2 border-white/20 mb-4">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <h3 className="text-xl font-bold text-slate-800">{user?.name}</h3>
          <p className="text-xs text-slate-500 font-semibold tracking-widest uppercase mt-2 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 inline-block">
            {user?.role?.replace('_', ' ')}
          </p>
          
          <div className="w-full mt-6 pt-6 border-t border-slate-100 space-y-3 text-left text-xs font-semibold">
            <div className="flex justify-between">
              <span className="text-slate-400">Employee Code</span>
              <span className="font-mono text-slate-700 font-bold">{user?.employeeCode}</span>
            </div>
            {user?.hospitalCode && (
              <div className="flex justify-between">
                <span className="text-slate-400">Hospital Code</span>
                <span className="font-mono text-slate-700 font-bold">{user?.hospitalCode}</span>
              </div>
            )}
            {user?.mobileNumber && (
              <div className="flex justify-between">
                <span className="text-slate-400">Registered Mobile</span>
                <span className="font-mono text-slate-700">{user?.mobileNumber}</span>
              </div>
            )}
          </div>

          {/* Operational Links for Receptionists */}
          {user?.role === 'RECEPTIONIST' && (
            <div className="w-full mt-6 pt-4 border-t border-slate-100 space-y-2 text-left">
              <Link
                to="/reception/reports"
                className="w-full flex items-center justify-between p-3 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/80 rounded-xl text-xs font-bold text-[#3563F6] transition-all group"
              >
                <div className="flex items-center gap-2">
                  <FileBarChart2 className="w-4 h-4 text-[#3563F6]" />
                  <span>View Reports & Analytics</span>
                </div>
                <span>&rarr;</span>
              </Link>
            </div>
          )}
        </div>
      </Card>

      {/* Right Column */}
      <div className="md:col-span-2 space-y-6">
        {/* Security PIN Card */}
        {user?.role !== 'SUPER_ADMIN' && (
          <Card title="Change Security PIN" subtitle="Update your 6-digit security PIN regularly to maintain account safety.">
            <form onSubmit={handlePinChange} className="space-y-4">
              
              <PinInput
                length={6}
                label="Old PIN"
                value={pinForm.oldPin}
                onChange={(val) => {
                  setPinForm({ ...pinForm, oldPin: val });
                  if (pinErrors.oldPin) setPinErrors(prev => ({ ...prev, oldPin: undefined }));
                }}
                error={pinErrors.oldPin}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PinInput
                  length={6}
                  label="New PIN"
                  value={pinForm.newPin}
                  onChange={(val) => {
                    setPinForm({ ...pinForm, newPin: val });
                    if (pinErrors.newPin) setPinErrors(prev => ({ ...prev, newPin: undefined }));
                  }}
                  error={pinErrors.newPin}
                />

                <PinInput
                  length={6}
                  label="Confirm New PIN"
                  value={pinForm.confirmPin}
                  onChange={(val) => {
                    setPinForm({ ...pinForm, confirmPin: val });
                    if (pinErrors.confirmPin) setPinErrors(prev => ({ ...prev, confirmPin: undefined }));
                  }}
                  error={pinErrors.confirmPin}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={Lock}
                className="mt-2 text-xs font-bold uppercase tracking-wider"
              >
                Update PIN
              </Button>
            </form>
          </Card>
        )}

        {/* Doctor Clinical Management Modules Section */}
        {(user?.role === 'DOCTOR' || user?.role === 'DOCTOR_ADMIN') && (
          <Card title="Clinical Consultation Modules" subtitle="Fast 1-tap shortcuts for clinical masters, consultation reports, and visit history">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {/* Switch to Hospital Admin (for DOCTOR_ADMIN) */}
              {user?.role === 'DOCTOR_ADMIN' && (
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMode('hospital_management');
                    navigate('/admin/dashboard');
                  }}
                  className="flex items-center justify-between p-3.5 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 rounded-2xl transition-all group cursor-pointer col-span-1 sm:col-span-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                      <Building2 className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-blue-600">Switch to Hospital Admin</h4>
                      <p className="text-[10px] text-slate-500 font-medium">Manage hospital operations, staff & settings</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                </button>
              )}

              <Link
                to="/doctor/completed-visits"
                className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 rounded-2xl transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                    <History className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-blue-600">Completed Visits</h4>
                    <p className="text-[10px] text-slate-500 font-medium">View past consultation history</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </Link>

              <Link
                to="/doctor/clinical-masters"
                className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-purple-50/80 border border-slate-200 hover:border-purple-300 rounded-2xl transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shadow-xs">
                    <ClipboardList className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-purple-600">Clinical Masters</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Manage diagnosis, medicines & templates</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
              </Link>
            </div>

            {/* Logout Action */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={async () => await logout()}
                className="w-full flex items-center justify-center gap-2 p-3.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-2xl font-bold text-xs transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout from VillZone HIMS</span>
              </button>
            </div>
          </Card>
        )}



        {user?.role === 'SUPER_ADMIN' && (
          <Card title="Super Admin configurations" subtitle="Logged in as master administrator.">
            <p className="text-slate-500 text-sm leading-relaxed font-sans">
              Super Admins utilize master username and password configurations. To change passwords or modify tenant structures, please consult your server environment setups.
            </p>
          </Card>
        )}
      </div>

    </div>
  );
};

export default Profile;
