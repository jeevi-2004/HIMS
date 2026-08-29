import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import MobileNumber from '../components/MobileNumber';
import { useMobileValidation } from '../hooks/useMobileValidation';
import toast from 'react-hot-toast';
import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import { 
  Building2, UserCheck, Key, Lock, Phone, Eye, EyeOff, CheckSquare, Square, MapPin, AlertTriangle, RefreshCw, ShieldAlert 
} from 'lucide-react';
import heroImg from '../assets/hospital_hero.png';
import api from '../services/api';
const Login = () => {
  const { login, setSession, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperAdminRoute = location.pathname === '/login/superadmin';

  const [loginType, setLoginType] = useState(isSuperAdminRoute ? 'admin' : 'staff');
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);

  useEffect(() => {
    if (location.pathname === '/login/superadmin') {
      setLoginType('admin');
    } else if (loginType === 'admin') {
      setLoginType('staff');
    }
  }, [location.pathname]);


  const [regForm, setRegForm] = useState({
    name: '',
    code: '',
    contactCountryCode: '+91',
    contactNumber: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    planName: 'Basic',
    planType: 'Monthly',
    subYears: 0,
    subMonths: 1,
    adminCountryCode: '+91',
    adminMobile: '',
    adminPin: ''
  });

  const regContactMobileVal = useMobileValidation('');
  const regAdminMobileVal = useMobileValidation('');

  useEffect(() => {
    regContactMobileVal.setValue(regForm.contactNumber || '');
    regContactMobileVal.setError(
      regForm.contactNumber && regForm.contactNumber.length < 10
        ? 'Mobile number must contain exactly 10 digits.'
        : ''
    );
  }, [regForm.contactNumber]);

  useEffect(() => {
    regAdminMobileVal.setValue(regForm.adminMobile || '');
    regAdminMobileVal.setError(
      regForm.adminMobile && regForm.adminMobile.length < 10
        ? 'Mobile number must contain exactly 10 digits.'
        : ''
    );
  }, [regForm.adminMobile]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Form setups
  const {
    register: registerAdmin,
    handleSubmit: handleSubmitAdmin,
    formState: { errors: adminErrors }
  } = useForm();

  const {
    register: registerStaff,
    handleSubmit: handleSubmitStaff,
    formState: { errors: staffErrors },
    watch: watchStaff,
    setValue: setStaffValue
  } = useForm({
    defaultValues: {
      hospitalCode: '',
      countryCode: '+91',
      mobileNumber: '',
      pin: ''
    }
  });

  useEffect(() => {
    registerStaff('mobileNumber', { 
      required: 'Mobile is required',
      pattern: {
        value: /^[6-9]\d{9}$/,
        message: 'Please enter a valid 10-digit Indian mobile number.'
      }
    });
    registerStaff('countryCode');
    registerStaff('pin', {
      required: 'PIN is required',
      minLength: { value: 4, message: 'Must be 4 digits' }
    });
  }, [registerStaff]);

  // Submit Super Admin Login
  const onSubmitAdmin = async (data) => {
    setApiLoading(true);
    const res = await login({
      username: data.username,
      password: data.password
    });
    setApiLoading(false);

    if (res.success) {
      toast.success('Super Admin Logged In successfully');
      navigate('/dashboard');
    } else {
      toast.error(res.message);
    }
  };

  // Submit Hospital User Login
  const onSubmitStaff = async (data) => {
    if (data.pin.length !== 4) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    setApiLoading(true);

    const res = await login({
      hospitalCode: data.hospitalCode,
      countryCode: data.countryCode || '+91',
      mobileNumber: data.mobileNumber,
      pin: data.pin
    });
    setApiLoading(false);

    if (res.success) {
      toast.success('Staff authenticated successfully');
      navigate('/dashboard');
    } else {
      toast.error(res.message);
    }
  };

  // Submit Hospital Registration Request
  const handleRegisterHospital = async (e) => {
    e.preventDefault();
    if (regForm.adminMobile.length !== 10) {
      toast.error('Admin Mobile Number must be exactly 10 digits');
      return;
    }
    if (regForm.adminPin.length !== 4) {
      toast.error('Security PIN must be exactly 4 digits');
      return;
    }
    setApiLoading(true);
    try {
      const payload = {
        name: regForm.name,
        code: regForm.code,
        contactCountryCode: regForm.contactCountryCode || '+91',
        contactNumber: regForm.contactNumber,
        email: regForm.email,
        street: regForm.street,
        city: regForm.city,
        state: regForm.state,
        zip: regForm.zip,
        planName: regForm.planName,
        planType: regForm.planType,
        subscriptionDuration: {
          years: parseInt(regForm.subYears) || 0,
          months: parseInt(regForm.subMonths) || 0
        },
        adminCountryCode: regForm.adminCountryCode || '+91',
        adminMobile: regForm.adminMobile,
        adminPin: regForm.adminPin
      };

      const response = await api.post('/auth/register-hospital', payload);
      setApiLoading(false);
      if (response.data?.success) {
        toast.success('Registration submitted! Code: ' + response.data.data.code);
        // Reset form and switch tab back to staff
        setRegForm({
          contactCountryCode: '+91',
          contactNumber: '',
          email: '',
          street: '',
          city: '',
          state: '',
          zip: '',
          planName: 'Basic',
          planType: 'Monthly',
          subYears: 0,
          subMonths: 1,
          adminCountryCode: '+91',
          adminMobile: '',
          adminPin: ''
        });
        setLoginType('staff');
      } else {
        toast.error(response.data?.message || 'Registration failed');
      }
    } catch (err) {
      setApiLoading(false);
      toast.error(err.response?.data?.message || 'Server error occurred during signup');
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-10 relative overflow-hidden bg-slate-50 font-sans">
      
      {/* Background gradients */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] glow-primary-subtle opacity-50 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] glow-blue-subtle opacity-40 pointer-events-none" />

      {/* Main Split Layout Container */}
      <div className="w-full max-w-6xl bg-white border border-[#E5E7EB] rounded-3xl overflow-hidden flex flex-col md:flex-row relative z-10 min-h-[600px] shadow-card-soft">
        
        {/* Left Side: Illustration and Branding */}
        <div className="md:w-1/2 bg-slate-900 p-8 md:p-12 flex flex-col justify-between relative border-b md:border-b-0 md:border-r border-slate-800 text-white">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2F63F2] flex items-center justify-center font-bold text-white shadow-lg text-lg">
              V
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider text-slate-100 m-0">VillZone</h1>
              <p className="text-[10px] text-slate-300 font-semibold tracking-widest uppercase m-0 leading-none">HIMS PLATFORM</p>
            </div>
          </div>

          {/* Hero Image */}
          <div className="my-8 flex justify-center items-center flex-1 max-h-[300px]">
            <img 
              src={heroImg} 
              alt="Medical Dashboard Hero" 
              className="max-h-full max-w-xs object-contain drop-shadow-[0_10px_20px_rgba(47,99,242,0.15)]"
            />
          </div>

          {/* Description footer */}
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Unified Medical Tenant Care
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md">
              Securely managing multiple hospitals, branches, and staff rosters. Powering clinical operations, OPD, IPD, reception, and pharmacy inventory under one secure architecture.
            </p>
          </div>
        </div>

        {/* Right Side: Login Card and Form */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto space-y-6">
            
            <div>
              <h3 className="text-2xl font-bold text-slate-800 animate-fadeIn">
                {loginType === 'register' 
                  ? 'Register Hospital' 
                  : loginType === 'admin'
                  ? 'Super Admin Login'
                  : 'Doctor Admin & Staff Login'}
              </h3>
              <p className="text-sm text-slate-500 mt-1 animate-fadeIn">
                {loginType === 'register' 
                  ? 'Submit your plan registration request.' 
                  : loginType === 'admin'
                  ? 'Enter your master administrator credentials.'
                  : 'Enter your code, mobile number, and security PIN.'}
              </p>
            </div>


            {/* Login Forms */}
            <AnimatePresence mode="wait">
              {loginType === 'admin' ? (
                // SUPER ADMIN FORM
                <motion.form
                  key="admin-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleSubmitAdmin(onSubmitAdmin)}
                  className="space-y-4"
                >
                  <Input
                    label="Username"
                    name="username"
                    placeholder="Enter admin username"
                    icon={UserCheck}
                    error={adminErrors.username?.message}
                    required
                    {...registerAdmin('username', { required: 'Username is required' })}
                  />

                  <Input
                    label="Password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    icon={Key}
                    error={adminErrors.password?.message}
                    required
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-slate-600 focus:outline-none flex items-center justify-center"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    }
                    {...registerAdmin('password', { required: 'Password is required' })}
                  />


                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#6B7280] hover:text-[#111827]">
                      <input type="checkbox" className="hidden" onChange={() => setRememberMe(!rememberMe)} />
                      {rememberMe ? <CheckSquare className="w-4 h-4 text-[#2F63F2]" /> : <Square className="w-4 h-4 text-[#E5E7EB]" />}
                      Remember Me
                    </label>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full py-3"
                    loading={apiLoading}
                  >
                    Authenticate Super Admin
                  </Button>
                </motion.form>
              ) : loginType === 'register' ? (
                // NEW HOSPITAL REGISTRATION FORM
                <motion.form
                  key="register-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleRegisterHospital}
                  className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1 text-left"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Hospital Name"
                      placeholder="e.g. Noida City Hospital"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                      required
                    />
                    <Input
                      label="Hospital Code (e.g. VZH)"
                      placeholder="VZH"
                      value={regForm.code}
                      onChange={(e) => setRegForm({ ...regForm, code: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MobileNumber 
                      label="Contact Mobile" 
                      placeholder="9876543210" 
                      countryValue={regForm.contactCountryCode || '+91'}
                      onCountryChange={(cc) => setRegForm({ ...regForm, contactCountryCode: cc })}
                      numberValue={regForm.contactNumber}
                      onNumberChange={(val) => setRegForm({ ...regForm, contactNumber: val })}
                      required 
                      error={regContactMobileVal.error}
                    />
                    <Input
                      label="Email Address"
                      type="email"
                      placeholder="admin@hospital.com"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="border-t border-[#E5E7EB] pt-2 space-y-2">
                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider pl-1 block">Address Details</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="enterprise-input py-2 text-xs" placeholder="Street" value={regForm.street} onChange={(e) => setRegForm({ ...regForm, street: e.target.value })} required />
                      <input className="enterprise-input py-2 text-xs" placeholder="City" value={regForm.city} onChange={(e) => setRegForm({ ...regForm, city: e.target.value })} required />
                      <input className="enterprise-input py-2 text-xs" placeholder="State" value={regForm.state} onChange={(e) => setRegForm({ ...regForm, state: e.target.value })} required />
                      <input className="enterprise-input py-2 text-xs" placeholder="ZIP Code" value={regForm.zip} onChange={(e) => setRegForm({ ...regForm, zip: e.target.value })} required />
                    </div>
                  </div>

                  <div className="border-t border-[#E5E7EB] pt-2 space-y-2">
                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider pl-1 block">Primary Administrator Account</span>
                    <div className="grid grid-cols-2 gap-3">
                      <MobileNumber 
                        label="Admin Mobile Number" 
                        placeholder="Login Mobile" 
                        countryValue={regForm.adminCountryCode || '+91'}
                        onCountryChange={(cc) => setRegForm({ ...regForm, adminCountryCode: cc })}
                        numberValue={regForm.adminMobile}
                        onNumberChange={(val) => setRegForm({ ...regForm, adminMobile: val })}
                        required 
                        error={regAdminMobileVal.error}
                      />
                      <Input
                        label="Login Security PIN (4-Digit)"
                        placeholder="••••"
                        maxLength={4}
                        value={regForm.adminPin}
                        onChange={(e) => setRegForm({ ...regForm, adminPin: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="border-t border-[#E5E7EB] pt-2 space-y-2">
                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider pl-1 block">Select Subscription Plan</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider pl-1">Plan Level</label>
                        <select className="enterprise-input py-2 text-xs" value={regForm.planName} onChange={(e) => setRegForm({ ...regForm, planName: e.target.value })} required>
                          <option value="Basic">Basic Plan</option>
                          <option value="Premium">Premium Plan</option>
                          <option value="Enterprise">Enterprise Plan</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider pl-1">Plan Type</label>
                        <select className="enterprise-input py-2 text-xs" value={regForm.planType} onChange={(e) => setRegForm({ ...regForm, planType: e.target.value })} required>
                          <option value="Monthly">Monthly</option>
                          <option value="Yearly">Yearly</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider pl-1">Duration Years</label>
                        <input type="number" min={0} max={10} className="enterprise-input py-2 text-xs" value={regForm.subYears} onChange={(e) => setRegForm({ ...regForm, subYears: e.target.value })} required />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider pl-1">Duration Months</label>
                        <input type="number" min={0} max={12} className="enterprise-input py-2 text-xs" value={regForm.subMonths} onChange={(e) => setRegForm({ ...regForm, subMonths: e.target.value })} required />
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full py-3"
                    loading={apiLoading}
                    disabled={!regContactMobileVal.isValid || !regAdminMobileVal.isValid}
                  >
                    Submit Hospital Plan Signup
                  </Button>
                </motion.form>
              ) : (
                // HOSPITAL STAFF FORM
                <motion.form
                  key="staff-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleSubmitStaff(onSubmitStaff)}
                  className="space-y-4"
                >
                  <div className="flex flex-col gap-4">
                    <Input
                      label="Hospital Code"
                      name="hospitalCode"
                      placeholder="VZH001"
                      icon={Building2}
                      error={staffErrors.hospitalCode?.message}
                      required
                      {...registerStaff('hospitalCode', { required: 'Code is required' })}
                    />
                    <MobileNumber 
                      label="Mobile Number" 
                      placeholder="10 digit mobile" 
                      countryValue={watchStaff('countryCode') || '+91'}
                      onCountryChange={(cc) => setStaffValue('countryCode', cc)}
                      numberValue={watchStaff('mobileNumber') || ''}
                      onNumberChange={(val) => setStaffValue('mobileNumber', val, { shouldValidate: true })}
                      required 
                      error={staffErrors.mobileNumber?.message}
                    />
                  </div>

                  <Input
                    label="4-Digit Security PIN"
                    name="pin"
                    type={showPin ? 'text' : 'password'}
                    placeholder="••••"
                    maxLength={4}
                    icon={Lock}
                    error={staffErrors.pin?.message}
                    required
                    value={watchStaff('pin') || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setStaffValue('pin', val.slice(0, 4), { shouldValidate: true });
                    }}
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="text-slate-400 hover:text-slate-600 focus:outline-none flex items-center justify-center"
                      >
                        {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    }
                  />


                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#6B7280] hover:text-[#111827]">
                      <input type="checkbox" className="hidden" onChange={() => setRememberMe(!rememberMe)} />
                      {rememberMe ? <CheckSquare className="w-4 h-4 text-[#2F63F2]" /> : <Square className="w-4 h-4 text-[#E5E7EB]" />}
                      Remember Device
                    </label>
                    <a href="#forgot" className="text-xs text-[#2F63F2] hover:underline hover:text-[#2555E6]">
                      Forgot PIN?
                    </a>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full py-3"
                    loading={apiLoading}
                  >
                    Authenticate Session
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Registration/Login Footer Link */}
            {loginType !== 'admin' && (
              <div className="text-center pt-4 border-t border-slate-100 mt-2 animate-fadeIn">
                {loginType === 'register' ? (
                  <p className="text-xs text-[#6B7280]">
                    Already have a registered hospital?{' '}
                    <button 
                      type="button" 
                      onClick={() => setLoginType('staff')}
                      className="text-[#2F63F2] font-semibold hover:underline hover:text-[#2555E6]"
                    >
                      Login here
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-[#6B7280]">
                    Need to register your hospital?{' '}
                    <button 
                      type="button" 
                      onClick={() => setLoginType('register')}
                      className="text-[#2F63F2] font-semibold hover:underline hover:text-[#2555E6]"
                    >
                      Register here
                    </button>
                  </p>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
