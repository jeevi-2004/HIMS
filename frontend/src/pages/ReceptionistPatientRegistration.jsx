import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

import Input from '../components/Input';
import Button from '../components/Button';
import Table from '../components/Table';
import Modal from '../components/Modal';
import DatePicker from '../components/DatePicker';
import MobileNumber from '../components/MobileNumber';
import AppointmentBookingModal from '../components/AppointmentBookingModal';
import { 
  UserPlus, Search, UserCheck, AlertTriangle, Calendar,
  Eye, Edit2, Printer, FileText, Trash2, ShieldCheck, HeartPulse, User
} from 'lucide-react';

const ReceptionistPatientRegistration = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  
  // Modals state
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [selectedPatientForBooking, setSelectedPatientForBooking] = useState(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingPatient, setViewingPatient] = useState(null);

  const [isPrintRegSlipOpen, setIsPrintRegSlipOpen] = useState(false);
  const [printPatient, setPrintPatient] = useState(null);

  // Edit Patient Form State
  const [profileForm, setProfileForm] = useState({
    name: '',
    dob: '',
    age: '',
    gender: '',
    bloodGroup: '',
    mobileNumber: '',
    alternativeMobile: '',
    email: '',
    aadhaarNumber: '',
    occupation: '',
    maritalStatus: 'Single',
    medicalAlerts: '',
    allergies: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelation: ''
  });

  // Fetch / Search Patients
  const { data: patients, isLoading: patientsLoading, refetch } = useQuery({
    queryKey: ['patients', patientSearchQuery],
    queryFn: async () => {
      const res = await api.get(`/operations/patients/search?query=${encodeURIComponent(patientSearchQuery)}`);
      return res.data.data;
    }
  });

  // Auto age calculation when DOB changes in profile edit
  useEffect(() => {
    if (profileForm.dob) {
      const birthDate = new Date(profileForm.dob);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      setProfileForm(prev => ({ ...prev, age: calculatedAge >= 0 ? calculatedAge : 0 }));
    }
  }, [profileForm.dob]);

  // Populate Edit Form when patient is selected
  const handleOpenEditModal = (patient) => {
    setEditingPatient(patient);
    setProfileForm({
      name: patient.name || '',
      dob: patient.dob ? new Date(patient.dob).toISOString().split('T')[0] : '',
      age: patient.age || '',
      gender: patient.gender || 'Male',
      bloodGroup: patient.bloodGroup || 'O+',
      mobileNumber: patient.mobileNumber || '',
      alternativeMobile: patient.alternativeMobile || '',
      email: patient.email || '',
      aadhaarNumber: patient.aadhaarNumber || '',
      occupation: patient.occupation || '',
      maritalStatus: patient.maritalStatus || 'Single',
      medicalAlerts: patient.medicalAlerts || '',
      allergies: Array.isArray(patient.allergies) ? patient.allergies.join(', ') : (patient.allergies || ''),
      street: patient.addresses?.[0]?.street || '',
      city: patient.addresses?.[0]?.city || '',
      state: patient.addresses?.[0]?.state || '',
      zip: patient.addresses?.[0]?.zip || '',
      emergencyName: patient.contacts?.[0]?.name || '',
      emergencyPhone: patient.contacts?.[0]?.phone || '',
      emergencyRelation: patient.contacts?.[0]?.relationship || ''
    });
    setIsEditModalOpen(true);
  };

  // Update Patient Profile Mutation
  const updatePatientMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.put(`/operations/patients/${id}`, payload);
      return res.data.data;
    },
    onSuccess: (updated) => {
      toast.success(`Patient profile updated for ${updated.name}`);
      queryClient.invalidateQueries(['patients']);
      setIsEditModalOpen(false);
      setEditingPatient(null);
      refetch();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update patient profile');
    }
  });

  const [profileErrors, setProfileErrors] = useState({});

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!editingPatient?._id) return;

    const errs = {};
    if (!profileForm.name || !profileForm.name.trim()) {
      errs.name = 'Full Name is required.';
    }
    if (!profileForm.mobileNumber || !/^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(profileForm.mobileNumber)) {
      errs.mobileNumber = 'Please enter a valid 10-digit mobile number.';
    }
    if (!profileForm.age) {
      errs.age = 'Age is required.';
    }

    if (Object.keys(errs).length > 0) {
      setProfileErrors(errs);
      return;
    }
    setProfileErrors({});

    const payload = {
      name: profileForm.name,
      age: Number(profileForm.age) || 0,
      dob: profileForm.dob ? profileForm.dob : undefined,
      gender: profileForm.gender,
      bloodGroup: profileForm.bloodGroup,
      mobileNumber: profileForm.mobileNumber,
      alternativeMobile: profileForm.alternativeMobile,
      email: profileForm.email,
      aadhaarNumber: profileForm.aadhaarNumber,
      occupation: profileForm.occupation,
      maritalStatus: profileForm.maritalStatus,
      medicalAlerts: profileForm.medicalAlerts,
      allergies: profileForm.allergies ? profileForm.allergies.split(',').map(s => s.trim()) : [],
      addresses: profileForm.street || profileForm.city ? [{
        street: profileForm.street,
        city: profileForm.city,
        state: profileForm.state,
        zip: profileForm.zip,
        country: 'India'
      }] : [],
      contacts: profileForm.emergencyName || profileForm.emergencyPhone ? [{
        name: profileForm.emergencyName,
        phone: profileForm.emergencyPhone,
        relationship: profileForm.emergencyRelation || 'Emergency Contact'
      }] : []
    };

    updatePatientMutation.mutate({ id: editingPatient._id, payload });
  };

  const handleOpenBookModal = (patient = null) => {
    setSelectedPatientForBooking(patient);
    setIsBookModalOpen(true);
  };

  return (
    <div className="space-y-8 text-left font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Patient Profile Management</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Review, edit, and complete detailed patient records, demographics, emergency contacts, and book OPD consultation slots.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => handleOpenBookModal(null)}
            variant="primary"
            icon={Calendar}
            className="text-xs font-bold uppercase tracking-wider h-[42px] px-5 bg-[#2F63F2]"
          >
            Book Slot
          </Button>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-6 shadow-sm hover:shadow-md transition-all duration-300">
        
        {/* Search Bar & Stats */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Patient Mobile, UHID, Name, or Aadhaar..."
              value={patientSearchQuery}
              onChange={(e) => setPatientSearchQuery(e.target.value)}
              className="enterprise-input w-full !pl-10 h-[44px]"
            />
          </div>
          {patientSearchQuery && (
            <Button
              onClick={() => setPatientSearchQuery('')}
              variant="secondary"
              className="text-xs font-bold uppercase tracking-wider h-[44px] px-4"
            >
              Clear Search
            </Button>
          )}
        </div>

        {/* Patients Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest text-left">
              {patientSearchQuery ? `Search Results (${patients?.length || 0})` : `All Patient Profiles (${patients?.length || 0})`}
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">
              Click <strong className="text-primary font-bold">Book Slot</strong> on any row to jump directly to appointment booking.
            </span>
          </div>

          <Table
            headers={[
              { 
                key: 'uhid', 
                label: 'UHID / Patient ID', 
                render: (row) => <span className="font-bold text-primary font-mono">{row.uhid}</span> 
              },
              { 
                key: 'name', 
                label: 'Patient Full Name', 
                sortable: true,
                render: (row) => (
                  <div>
                    <span className="font-bold text-slate-900">{row.name}</span>
                    {row.medicalAlerts && (
                      <span className="ml-2 text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">
                        ALERT
                      </span>
                    )}
                  </div>
                )
              },
              { 
                key: 'mobileNumber', 
                label: 'Mobile No.', 
                render: (row) => <span className="font-mono text-slate-700">{row.countryCode || '+91'} {row.mobileNumber}</span> 
              },
              { 
                key: 'age', 
                label: 'Age / Gender', 
                render: (row) => <span className="font-semibold text-slate-700">{row.age} Yrs / {row.gender}</span> 
              },
              { 
                key: 'bloodGroup', 
                label: 'Blood Group', 
                render: (row) => <span className="font-mono text-slate-600">{row.bloodGroup || 'N/A'}</span> 
              },
              { 
                key: 'createdAt', 
                label: 'Registration Date', 
                render: (row) => <span className="font-mono text-slate-500 text-[10px]">{new Date(row.createdAt).toLocaleDateString()}</span> 
              }
            ]}
            data={patients || []}
            actions={[
              {
                label: 'Book Slot',
                icon: Calendar,
                isPrimary: true,
                tooltip: 'Book appointment slot for this patient',
                ariaLabel: 'Book appointment slot for this patient',
                onClick: (row) => handleOpenBookModal(row)
              },
              {
                label: 'Edit / Complete Profile',
                icon: Edit2,
                tooltip: 'Edit optional demographics & contacts',
                ariaLabel: 'Edit optional demographics & contacts',
                onClick: (row) => handleOpenEditModal(row)
              },
              {
                label: 'View Profile Details',
                icon: Eye,
                tooltip: 'View complete patient profile summary',
                ariaLabel: 'View complete patient profile summary',
                onClick: (row) => {
                  setViewingPatient(row);
                  setIsViewModalOpen(true);
                }
              },
              {
                label: 'Print Registration Slip',
                icon: Printer,
                tooltip: 'Print registration slip',
                ariaLabel: 'Print registration slip',
                onClick: (row) => {
                  setPrintPatient(row);
                  setIsPrintRegSlipOpen(true);
                }
              }
            ]}
            loading={patientsLoading}
            emptyState={
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <User className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">No patient profiles match your query.</p>
                <p className="text-[11px] text-slate-400">Click "Book Slot" at the top to quickly register a new patient directly while booking an appointment.</p>
              </div>
            }
          />
        </div>
      </div>

      {/* 1. UNIFIED APPOINTMENT BOOKING DIALOG */}
      <AppointmentBookingModal
        isOpen={isBookModalOpen}
        onClose={() => { setIsBookModalOpen(false); setSelectedPatientForBooking(null); }}
        initialPatient={selectedPatientForBooking}
        onSuccess={() => refetch()}
      />

      {/* 2. EDIT PATIENT PROFILE MODAL (Post-Visit Profile Completion) */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => { setIsEditModalOpen(false); setEditingPatient(null); }}
        title={`✏️ Edit Patient Profile: ${editingPatient?.name || ''}`}
      >
        <form onSubmit={handleSaveProfile} className="space-y-4 text-left font-sans max-h-[75vh] overflow-y-auto pr-1">
          
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-700 font-medium">
            Complete or edit optional demographics, emergency contact numbers, address, and medical alerts.
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Basic Demographics</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name"
                value={profileForm.name}
                onChange={(e) => {
                  setProfileForm({ ...profileForm, name: e.target.value });
                  if (profileErrors.name) setProfileErrors(prev => ({ ...prev, name: undefined }));
                }}
                required
                error={profileErrors.name}
              />
              <MobileNumber
                label="Primary Mobile"
                value={profileForm.mobileNumber}
                onChange={(val) => {
                  setProfileForm({ ...profileForm, mobileNumber: val });
                  if (profileErrors.mobileNumber) setProfileErrors(prev => ({ ...prev, mobileNumber: undefined }));
                }}
                required
                error={profileErrors.mobileNumber}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <DatePicker
                label="Date of Birth"
                value={profileForm.dob}
                onChange={(val) => setProfileForm({ ...profileForm, dob: val })}
              />
              <Input
                label="Age (Years)"
                type="number"
                min={1}
                max={120}
                value={profileForm.age}
                onChange={(e) => {
                  const cleanVal = e.target.value.replace(/[^0-9]/g, '');
                  setProfileForm({ ...profileForm, age: cleanVal });
                  if (profileErrors.age) setProfileErrors(prev => ({ ...prev, age: undefined }));
                }}
                required
                error={profileErrors.age}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">Gender <span className="text-[#EF4444]">*</span></label>
                <select
                  className="enterprise-input"
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                >
                  <option value="" disabled>-- Select Gender --</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">Blood Group (Optional)</label>
                <select
                  className="enterprise-input"
                  value={profileForm.bloodGroup}
                  onChange={(e) => setProfileForm({ ...profileForm, bloodGroup: e.target.value })}
                >
                  <option value="">-- Select Blood Group --</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
              <Input
                label="Alternative Phone"
                placeholder="Alternative mobile"
                value={profileForm.alternativeMobile}
                onChange={(e) => setProfileForm({ ...profileForm, alternativeMobile: e.target.value })}
              />
              <Input
                label="Email Address"
                type="email"
                placeholder="patient@domain.com"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Identification & Additional Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Aadhaar / ID Number"
                placeholder="12-digit Aadhaar number"
                value={profileForm.aadhaarNumber}
                onChange={(e) => setProfileForm({ ...profileForm, aadhaarNumber: e.target.value })}
              />
              <Input
                label="Occupation"
                placeholder="e.g. Teacher, Engineer"
                value={profileForm.occupation}
                onChange={(e) => setProfileForm({ ...profileForm, occupation: e.target.value })}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider pl-1">Marital Status</label>
                <select
                  className="enterprise-input"
                  value={profileForm.maritalStatus}
                  onChange={(e) => setProfileForm({ ...profileForm, maritalStatus: e.target.value })}
                >
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Emergency Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Emergency Contact Name"
                placeholder="Contact Full Name"
                value={profileForm.emergencyName}
                onChange={(e) => setProfileForm({ ...profileForm, emergencyName: e.target.value })}
              />
              <Input
                label="Emergency Mobile"
                placeholder="10-digit mobile"
                value={profileForm.emergencyPhone}
                onChange={(e) => setProfileForm({ ...profileForm, emergencyPhone: e.target.value })}
              />
              <Input
                label="Relationship"
                placeholder="e.g. Spouse, Parent"
                value={profileForm.emergencyRelation}
                onChange={(e) => setProfileForm({ ...profileForm, emergencyRelation: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Address Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="Street Address"
                  placeholder="House / Street / Apartment"
                  value={profileForm.street}
                  onChange={(e) => setProfileForm({ ...profileForm, street: e.target.value })}
                />
              </div>
              <Input
                label="City"
                placeholder="City"
                value={profileForm.city}
                onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
              />
              <Input
                label="Zip / Pincode"
                placeholder="Pincode"
                value={profileForm.zip}
                onChange={(e) => setProfileForm({ ...profileForm, zip: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Medical Notes & Alerts</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Known Allergies (Comma separated)"
                placeholder="e.g. Penicillin, Dust, Peanuts"
                value={profileForm.allergies}
                onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
              />
              <Input
                label="Medical Alerts / Chronic Conditions"
                placeholder="e.g. Diabetic, High BP, Asthma"
                value={profileForm.medicalAlerts}
                onChange={(e) => setProfileForm({ ...profileForm, medicalAlerts: e.target.value })}
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 font-bold uppercase tracking-wider text-xs h-[44px] mt-4 bg-[#2F63F2]"
            loading={updatePatientMutation.isPending}
          >
            Save Patient Profile Changes
          </Button>
        </form>
      </Modal>

      {/* 3. VIEW FULL PATIENT PROFILE DETAILS MODAL */}
      {isViewModalOpen && viewingPatient && (
        <Modal
          isOpen={true}
          onClose={() => { setIsViewModalOpen(false); setViewingPatient(null); }}
          title={`📋 Patient Profile Overview: ${viewingPatient.name}`}
        >
          <div className="space-y-5 text-left font-sans">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{viewingPatient.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  UHID: <strong className="text-primary">{viewingPatient.uhid}</strong> | Registered: {new Date(viewingPatient.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenBookModal(viewingPatient);
                }}
                variant="primary"
                icon={Calendar}
                className="text-xs font-bold uppercase tracking-wider h-[38px] px-4 bg-[#2F63F2]"
              >
                Book Appointment
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Primary Mobile</span>
                <span className="font-bold text-slate-800 font-mono">{viewingPatient.mobileNumber}</span>
              </div>
              <div className="p-3 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Age / Gender</span>
                <span className="font-bold text-slate-800">{viewingPatient.age} Yrs / {viewingPatient.gender}</span>
              </div>
              <div className="p-3 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Blood Group</span>
                <span className="font-bold text-slate-800 font-mono">{viewingPatient.bloodGroup || 'N/A'}</span>
              </div>
              <div className="p-3 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Aadhaar No.</span>
                <span className="font-bold text-slate-800 font-mono">{viewingPatient.aadhaarNumber || 'Not provided'}</span>
              </div>
              <div className="p-3 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Email Address</span>
                <span className="font-bold text-slate-800">{viewingPatient.email || 'Not provided'}</span>
              </div>
              <div className="p-3 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Emergency Contact</span>
                <span className="font-bold text-slate-800">{viewingPatient.contacts?.[0]?.phone || 'Not provided'}</span>
              </div>
            </div>

            {viewingPatient.medicalAlerts && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span><strong>Medical Alerts:</strong> {viewingPatient.medicalAlerts}</span>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 4. PRINT REGISTRATION SLIP MODAL */}
      {isPrintRegSlipOpen && printPatient && (
        <Modal
          isOpen={true}
          onClose={() => { setIsPrintRegSlipOpen(false); setPrintPatient(null); }}
          title="🖨️ Patient Registration Slip"
        >
          <div className="space-y-6 text-center font-sans">
            <div className="p-6 bg-white border-2 border-dashed border-slate-300 rounded-2xl space-y-4 max-w-md mx-auto text-left shadow-sm">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h2 className="text-base font-black text-slate-900 tracking-tight">VILLZONE HOSPITAL</h2>
                  <p className="text-[10px] text-slate-500 font-medium">Official Registration Slip</p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 border border-slate-200">
                  {printPatient.uhid}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Patient Name</p>
                  <p className="font-bold text-slate-900">{printPatient.name}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Mobile Number</p>
                  <p className="font-bold text-slate-900 font-mono">{printPatient.mobileNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Age / Gender</p>
                  <p className="font-semibold text-slate-800">{printPatient.age} Yrs / {printPatient.gender}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Blood Group</p>
                  <p className="font-semibold text-slate-800">{printPatient.bloodGroup || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Registration Date</p>
                  <p className="font-semibold text-slate-800">{new Date(printPatient.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button onClick={() => window.print()} variant="primary" icon={Printer} className="text-xs font-bold uppercase tracking-wider px-5">
                Print Slip
              </Button>
              <Button onClick={() => { setIsPrintRegSlipOpen(false); setPrintPatient(null); }} variant="secondary" className="text-xs font-bold uppercase tracking-wider px-5">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};

export default ReceptionistPatientRegistration;
