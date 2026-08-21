import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../services/api';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import { Lock, Eye, EyeOff, LogOut, FileBarChart2 } from 'lucide-react';

const Profile = () => {
  const { user, logout } = useAuth();
  
  const [pinForm, setPinForm] = useState({ oldPin: '', newPin: '', confirmPin: '' });
  const [pinErrors, setPinErrors] = useState({});
  const [showOldPin, setShowOldPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePinChange = async (e) => {
    e.preventDefault();
    const errs = {};

    if (!pinForm.oldPin || pinForm.oldPin.length !== 4) {
      errs.oldPin = 'Please enter your current 4-digit PIN.';
    }
    if (!pinForm.newPin || pinForm.newPin.length !== 4 || isNaN(pinForm.newPin)) {
      errs.newPin = 'New PIN must be exactly 4 numeric digits.';
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
          <Card title="Change Security PIN" subtitle="Update your 4-digit security PIN regularly to maintain account safety.">
            <form onSubmit={handlePinChange} className="space-y-4">
              
              <Input
                label="Old PIN"
                placeholder="••••"
                type={showOldPin ? 'text' : 'password'}
                maxLength={4}
                value={pinForm.oldPin}
                onChange={(e) => {
                  setPinForm({ ...pinForm, oldPin: e.target.value });
                  if (pinErrors.oldPin) setPinErrors(prev => ({ ...prev, oldPin: undefined }));
                }}
                required
                error={pinErrors.oldPin}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowOldPin(!showOldPin)}
                    className="text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  >
                    {showOldPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="New PIN"
                  placeholder="••••"
                  type={showNewPin ? 'text' : 'password'}
                  maxLength={4}
                  value={pinForm.newPin}
                  onChange={(e) => {
                    setPinForm({ ...pinForm, newPin: e.target.value });
                    if (pinErrors.newPin) setPinErrors(prev => ({ ...prev, newPin: undefined }));
                  }}
                  required
                  error={pinErrors.newPin}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      className="text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    >
                      {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                <Input
                  label="Confirm New PIN"
                  placeholder="••••"
                  type={showConfirmPin ? 'text' : 'password'}
                  maxLength={4}
                  value={pinForm.confirmPin}
                  onChange={(e) => {
                    setPinForm({ ...pinForm, confirmPin: e.target.value });
                    if (pinErrors.confirmPin) setPinErrors(prev => ({ ...prev, confirmPin: undefined }));
                  }}
                  required
                  error={pinErrors.confirmPin}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPin(!showConfirmPin)}
                      className="text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    >
                      {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
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
