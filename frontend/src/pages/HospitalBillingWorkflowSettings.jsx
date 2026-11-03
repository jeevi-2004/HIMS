import React, { useState, useEffect } from 'react';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { CreditCard, Save, Lock, ArrowDown, Check, Pill, Settings, Volume2, Play, RefreshCw, Info, AlertTriangle, Search, MapPin, Navigation, ShieldCheck, ShieldAlert } from 'lucide-react';
import { voiceAnnouncement } from '../utils/voiceAnnouncementService';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Button from '../components/Button';
import useFormDraft from '../hooks/useFormDraft';

const HospitalBillingWorkflowSettings = () => {
  const { billingSettings, updateBillingSettings, loading } = useBillingSettings();

  const [activeTab, setActiveTab] = useState('billing'); // 'billing' | 'delivery' | 'voice' | 'geofence'

  const { user } = useAuth();
  const hospitalId = user?.hospitalId?._id || user?.hospitalId || user?.hospital?._id || user?.hospital;

  // Geofence Settings Form State
  const [geoForm, setGeoForm] = useState({
    enabled: false,
    latitude: '',
    longitude: '',
    radiusMeters: 300,
    enforceRoles: ['RECEPTIONIST', 'BILLING_CLERK']
  });

  const { clearDraft: clearGeoDraft } = useFormDraft(
    `settings_hospital_geofence_${hospitalId || 'default'}`,
    geoForm,
    setGeoForm,
    { enabled: Boolean(hospitalId) }
  );

  const [savingGeo, setSavingGeo] = useState(false);
  const [detectingGeo, setDetectingGeo] = useState(false);

  useEffect(() => {
    const geo = user?.hospital?.geolocationSettings || user?.hospitalId?.geolocationSettings;
    if (geo) {
      setGeoForm({
        enabled: geo.enabled === true,
        latitude: geo.latitude != null ? String(geo.latitude) : '',
        longitude: geo.longitude != null ? String(geo.longitude) : '',
        radiusMeters: geo.radiusMeters || 300,
        enforceRoles: geo.enforceRoles || ['RECEPTIONIST', 'BILLING_CLERK']
      });
    }
  }, [user]);

  const [geoAccuracy, setGeoAccuracy] = useState(null);
  const [geoStatusMsg, setGeoStatusMsg] = useState(null);
  const [geoStatusType, setGeoStatusType] = useState(null);

  const handleDetectLocation = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGeoStatusMsg('⚠ Geolocation is not supported by your browser.');
      setGeoStatusType('error');
      return;
    }
    setDetectingGeo(true);
    setGeoStatusMsg(null);
    setGeoStatusType(null);

    const onPositionSuccess = (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;

      setGeoForm(prev => ({
        ...prev,
        latitude: String(lat),
        longitude: String(lng)
      }));
      setDetectingGeo(false);
      setGeoAccuracy(acc);
      setGeoStatusMsg(`✓ Hospital location captured successfully${acc ? ` • Accuracy ±${acc}m` : ''}`);
      setGeoStatusType('success');
    };

    const onPositionError = (err, isFallback = false) => {
      if (!isFallback && (err.code === 2 || err.code === 3)) {
        // Fallback to standard network/Wi-Fi positioning for PCs without hardware GPS
        navigator.geolocation.getCurrentPosition(
          onPositionSuccess,
          (fallbackErr) => onPositionError(fallbackErr, true),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
        return;
      }

      setDetectingGeo(false);
      setGeoAccuracy(null);
      setGeoStatusType('error');

      if (err.code === 1) { // PERMISSION_DENIED
        setGeoStatusMsg('⚠ Location permission denied. Please allow location access or enter the coordinates manually.');
      } else if (err.code === 2) { // POSITION_UNAVAILABLE
        setGeoStatusMsg('⚠ Unable to determine your current location. Please try again.');
      } else if (err.code === 3) { // TIMEOUT
        setGeoStatusMsg('⚠ Location request timed out. Please try again or enter the coordinates manually.');
      } else {
        setGeoStatusMsg('⚠ Unable to detect your location. Please try again or enter coordinates manually.');
      }
    };

    // First attempt high accuracy (8s timeout), then automatically fallback
    navigator.geolocation.getCurrentPosition(
      onPositionSuccess,
      (err) => onPositionError(err, false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleSaveGeoSettings = async () => {
    const targetHospId = hospitalId;
    if (!targetHospId) {
      alert('Hospital ID not found');
      return;
    }

    if (geoForm.enabled) {
      const latNum = parseFloat(geoForm.latitude);
      const lngNum = parseFloat(geoForm.longitude);
      const radNum = parseInt(geoForm.radiusMeters);

      if (!geoForm.latitude || isNaN(latNum) || latNum < -90 || latNum > 90) {
        alert('Please capture or enter valid hospital location coordinates (-90 to 90) before enabling geofence.');
        return;
      }
      if (!geoForm.longitude || isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        alert('Please capture or enter valid hospital location coordinates (-180 to 180) before enabling geofence.');
        return;
      }
      if (isNaN(radNum) || radNum <= 0) {
        alert('Please enter a valid geofence radius greater than 0 meters.');
        return;
      }
    }

    setSavingGeo(true);
    try {
      const payload = {
        enabled: geoForm.enabled,
        latitude: geoForm.latitude ? parseFloat(geoForm.latitude) : null,
        longitude: geoForm.longitude ? parseFloat(geoForm.longitude) : null,
        radiusMeters: parseInt(geoForm.radiusMeters) || 300,
        enforceRoles: geoForm.enforceRoles
      };
      await api.put(`/admin/hospitals/${targetHospId}/geolocation`, payload);
      clearGeoDraft();
      alert('Receptionist GPS Geofence Settings saved successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save Geofence Settings');
    } finally {
      setSavingGeo(false);
    }
  };

  // Voice Settings State
  const [availableVoices, setAvailableVoices] = useState([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [langFilter, setLangFilter] = useState('All'); // 'All' | 'en' | 'en-IN' | 'ta' | 'ta-IN'
  const [providerStatus, setProviderStatus] = useState({
    azure: { status: 'Checking...' },
    google: { status: 'Checking...' },
    browser: { status: 'Available' }
  });
  const [genderFilter, setGenderFilter] = useState('All'); // 'All' | 'Female' | 'Male'
  const [categoryFilter, setCategoryFilter] = useState('All'); // 'All' | 'Chirp 3 HD' | 'Wavenet' | 'Standard' | 'Neural'

  const [voiceForm, setVoiceForm] = useState({
    provider: 'browser', // 'browser' | 'sarvam' | 'azure' | 'google'
    sarvamVoiceId: 'kavitha',
    azureVoiceId: 'ta-IN-PallaviNeural',
    googleVoiceId: 'ta-IN-Chirp3-HD-Aoede',
    customEnglishVoiceName: '',
    customEnglishVoiceLang: '',
    customTamilVoiceName: '',
    customTamilVoiceLang: '',
    languageMode: 'BOTH', // 'EN_ONLY' | 'TA_ONLY' | 'BOTH'
    profile: 'Professional' // 'Professional' | 'Gentle' | 'Clear OPD'
  });
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Sarvam AI Tamil Voices Catalog (Bulbul v3 Neural)
  const SARVAM_TAMIL_VOICES = [
    { id: 'kavitha', name: 'Kavitha (Female)', gender: 'Female', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Native Tamil Nadu Receptionist' },
    { id: 'kavya', name: 'Kavya (Female)', gender: 'Female', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Clear OPD Call Voice' },
    { id: 'priya', name: 'Priya (Female)', gender: 'Female', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Gentle & Calm Tone' },
    { id: 'shruti', name: 'Shruti (Female)', gender: 'Female', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Clear Announcer Voice' },
    { id: 'suhani', name: 'Suhani (Female)', gender: 'Female', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Soft Tone Female Voice' },
    { id: 'gokul', name: 'Gokul (Male)', gender: 'Male', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Professional Male Voice' },
    { id: 'vijay', name: 'Vijay (Male)', gender: 'Male', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Clear Male Announcer' },
    { id: 'mani', name: 'Mani (Male)', gender: 'Male', quality: 'Bulbul v3 Neural', lang: 'ta-IN', provider: 'sarvam', desc: 'Classic Tamil Announcer' }
  ];

  // Azure Tamil Voices Catalog
  const AZURE_TAMIL_VOICES = [
    { id: 'ta-IN-PallaviNeural', name: 'Pallavi Neural', gender: 'Female', quality: 'Neural', lang: 'ta-IN', provider: 'azure' },
    { id: 'ta-IN-ValluvarNeural', name: 'Valluvar Neural', gender: 'Male', quality: 'Neural', lang: 'ta-IN', provider: 'azure' }
  ];

  // Google Cloud Tamil Voices Catalog
  const GOOGLE_TAMIL_VOICES = [
    // Chirp 3 HD
    { id: 'ta-IN-Chirp3-HD-Achernar', name: 'Achernar', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Aoede', name: 'Aoede', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Autonoe', name: 'Autonoe', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Callirrhoe', name: 'Callirrhoe', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Despina', name: 'Despina', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Erinome', name: 'Erinome', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Gacrux', name: 'Gacrux', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Kore', name: 'Kore', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Laomedeia', name: 'Laomedeia', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Leda', name: 'Leda', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Pulcherrima', name: 'Pulcherrima', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Sulafat', name: 'Sulafat', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Vindemiatrix', name: 'Vindemiatrix', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Chirp3-HD-Zephyr', name: 'Zephyr', gender: 'Female', quality: 'Chirp 3 HD', lang: 'ta-IN', provider: 'google' },
    // Standard & Wavenet
    { id: 'ta-IN-Standard-A', name: 'Standard A', gender: 'Female', quality: 'Standard', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Standard-B', name: 'Standard B', gender: 'Male', quality: 'Standard', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Standard-C', name: 'Standard C', gender: 'Male', quality: 'Standard', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Standard-D', name: 'Standard D', gender: 'Female', quality: 'Standard', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Wavenet-A', name: 'Wavenet A', gender: 'Female', quality: 'Wavenet', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Wavenet-B', name: 'Wavenet B', gender: 'Male', quality: 'Wavenet', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Wavenet-C', name: 'Wavenet C', gender: 'Male', quality: 'Wavenet', lang: 'ta-IN', provider: 'google' },
    { id: 'ta-IN-Wavenet-D', name: 'Wavenet D', gender: 'Female', quality: 'Wavenet', lang: 'ta-IN', provider: 'google' }
  ];

  // Fetch Backend TTS Status
  const fetchProviderStatus = async () => {
    try {
      const res = await fetch('/api/tts/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) setProviderStatus(data.status);
      }
    } catch (e) {
      console.warn('[VOICE SETTINGS] Could not check backend TTS status:', e);
    }
  };

  // Load Available Voices
  const refreshVoices = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const v = voiceAnnouncement.getAvailableVoices();
      setAvailableVoices(v);
    }
  };

  useEffect(() => {
    refreshVoices();
    fetchProviderStatus();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        refreshVoices();
      };
    }
    // Initialize Voice Settings Form from Service
    setVoiceForm({
      provider: voiceAnnouncement.settings.provider || 'browser',
      sarvamVoiceId: voiceAnnouncement.settings.sarvamVoiceId || 'ananya',
      azureVoiceId: voiceAnnouncement.settings.azureVoiceId || 'ta-IN-PallaviNeural',
      googleVoiceId: voiceAnnouncement.settings.googleVoiceId || 'ta-IN-Chirp3-HD-Aoede',
      customEnglishVoiceName: voiceAnnouncement.settings.customEnglishVoiceName || '',
      customEnglishVoiceLang: voiceAnnouncement.settings.customEnglishVoiceLang || '',
      customTamilVoiceName: voiceAnnouncement.settings.customTamilVoiceName || '',
      customTamilVoiceLang: voiceAnnouncement.settings.customTamilVoiceLang || '',
      languageMode: voiceAnnouncement.settings.languageMode || 'BOTH',
      profile: voiceAnnouncement.settings.profile || 'Professional'
    });
  }, []);

  const [form, setForm] = useState({
    consultationFeeType: 'Predefined', // 'Predefined' | 'On Consultation'
    feeCollectionRole: 'Reception',    // 'Reception' | 'Doctor' | 'Pharmacy'
    paymentTiming: 'Before Consultation', // 'Before Consultation' | 'After Consultation'
    prescriptionDelivery: 'internal_pharmacy' // 'internal_pharmacy' | 'print_only' | 'internal_external'
  });

  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    if (billingSettings) {
      const activeFeeType = billingSettings.consultationFeeType || 'Predefined';
      const activeRole = billingSettings.feeCollectionRole || 'Reception';
      let activeTiming = billingSettings.paymentTiming || 'Before Consultation';
      const activeDelivery = billingSettings.prescriptionDelivery || 'internal_pharmacy';

      // Enforce business rules initialization
      if (activeFeeType === 'On Consultation' || activeRole === 'Pharmacy') {
        activeTiming = 'After Consultation';
      }

      setForm({
        consultationFeeType: activeFeeType,
        feeCollectionRole: activeRole,
        paymentTiming: activeTiming,
        prescriptionDelivery: activeDelivery,
        enableEmergencyModule: billingSettings.enableEmergencyModule === true
      });
    }
  }, [billingSettings]);

  // Handle Fee Mode Change
  const handleFeeTypeChange = (mode) => {
    let nextTiming = form.paymentTiming;
    if (mode === 'On Consultation' || form.feeCollectionRole === 'Pharmacy') {
      nextTiming = 'After Consultation';
    }
    setForm(prev => ({
      ...prev,
      consultationFeeType: mode,
      paymentTiming: nextTiming
    }));
  };

  // Handle Fee Collector Change
  const handleCollectorChange = (role) => {
    let nextTiming = form.paymentTiming;
    if (role === 'Pharmacy' || form.consultationFeeType === 'On Consultation') {
      nextTiming = 'After Consultation';
    }
    setForm(prev => ({
      ...prev,
      feeCollectionRole: role,
      paymentTiming: nextTiming
    }));
  };

  // Save Handler
  const handleSave = async () => {
    setSaving(true);
    if (activeTab === 'voice') {
      voiceAnnouncement.saveVoiceSettings(voiceForm);
      setSaving(false);
      setToastMessage('✓ Voice Announcement Settings Saved');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    const payload = {
      consultationFeeType: form.consultationFeeType,
      feeCollectionRole: form.feeCollectionRole,
      paymentTiming: form.paymentTiming,
      prescriptionDelivery: form.prescriptionDelivery,
      enableEmergencyModule: form.enableEmergencyModule === true,
      collectMedicineInPharmacy: true
    };

    const successMsg = activeTab === 'delivery'
      ? '✓ Prescription delivery configuration saved'
      : '✓ Fee & payment configuration saved';

    await updateBillingSettings(payload, successMsg);
    setSaving(false);
    setToastMessage(successMsg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleResetVoiceToAutomatic = () => {
    voiceAnnouncement.resetToAutomatic();
    setVoiceForm({
      customEnglishVoiceName: '',
      customEnglishVoiceLang: '',
      customTamilVoiceName: '',
      customTamilVoiceLang: '',
      languageMode: 'BOTH',
      profile: 'Professional'
    });
    setToastMessage('✓ Reset to Automatic Voice Selection');
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Dynamic Rule Indicators
  const isTimingLocked = form.consultationFeeType === 'On Consultation' || form.feeCollectionRole === 'Pharmacy';
  const isPharmacySelected = form.feeCollectionRole === 'Pharmacy';

  // Filtered Voices for dropdown lists
  const filteredVoices = availableVoices.filter(v => {
    const nameMatch = (v.name || '').toLowerCase().includes(searchFilter.toLowerCase());
    const langMatch = (v.lang || '').toLowerCase().includes(searchFilter.toLowerCase());
    if (!nameMatch && !langMatch) return false;

    if (langFilter === 'All') return true;
    if (langFilter === 'en') return (v.lang || '').toLowerCase().startsWith('en');
    if (langFilter === 'en-IN') return (v.lang || '').toLowerCase().replace('_', '-').startsWith('en-in');
    if (langFilter === 'ta') return (v.lang || '').toLowerCase().startsWith('ta');
    if (langFilter === 'ta-IN') return (v.lang || '').toLowerCase().replace('_', '-').startsWith('ta-in');
    return true;
  });

  const englishVoices = filteredVoices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
  const tamilVoices = filteredVoices.filter(v => {
    const vLang = (v.lang || '').toLowerCase().replace('_', '-');
    const vName = (v.name || '').toLowerCase();
    return vLang.startsWith('ta') || vName.includes('tamil') || vName.includes('தமிழ்');
  });

  const activeDiag = voiceAnnouncement.getVoiceDiagnostics();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-8 text-center text-xs font-semibold text-slate-500 space-y-2">
        <div className="w-6 h-6 border-2 border-[#2F63F2] border-t-transparent rounded-full animate-spin" />
        <p>Loading hospital settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans px-4 sm:px-6 lg:px-7 pt-1 sm:pt-2 pb-6 text-left max-w-6xl mx-auto space-y-5 -mt-2 sm:-mt-4">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#2F63F2] uppercase tracking-wider mb-0.5">
            <CreditCard className="w-3.5 h-3.5" />
            Hospital Settings
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clinical, Billing & Voice Settings</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
              (billingSettings?.opdOperationMode || 'FULL_DIGITAL') === 'TOKEN_ONLY'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>
              {(billingSettings?.opdOperationMode || 'FULL_DIGITAL') === 'TOKEN_ONLY' ? '🎟️ Plan 1: OPD Token & Queue Suite (Paper Rx)' : '🩺 Plan 2: Digital E-Prescription Suite'}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Configure billing workflows, OPD payment rules, prescription delivery routing, and patient call voice announcements.
          </p>
        </div>

        <Button
          onClick={handleSave}
          variant="primary"
          loading={saving}
          icon={Save}
          className="text-xs font-bold uppercase tracking-wider h-9 px-4 bg-[#2F63F2] hover:bg-blue-700 text-white rounded-lg shadow-xs shrink-0"
        >
          Save Configuration
        </Button>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'billing'
              ? 'bg-[#2F63F2] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Fee & Payment Workflow</span>
        </button>

        {/* Temporarily commented out Emergency Intake Module tab
        <button
          type="button"
          onClick={() => setActiveTab('emergency')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'emergency'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Emergency Intake Module</span>
        </button>
        */}

        <button
          type="button"
          onClick={() => setActiveTab('delivery')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'delivery'
              ? 'bg-[#2F63F2] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>Prescription Delivery Routing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('voice')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'voice'
              ? 'bg-[#2F63F2] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          <span>Voice Announcements</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('geofence')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'geofence'
              ? 'bg-[#2F63F2] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Receptionist GPS Geofence</span>
        </button>
      </div>

      {/* Main Two-Column Layout (Left Configuration | Right Current Workflow) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* LEFT COLUMN — CONFIGURATION (Approx 65%) */}
        <div className="lg:col-span-8 space-y-4">
          
          {activeTab === 'voice' ? (
            <div className="space-y-4">
              
              {/* DEVICE FALLBACK WARNING BANNER */}
              {(!activeDiag.isSavedEngAvailable || !activeDiag.isSavedTamAvailable) && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-start gap-2.5 shadow-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">⚠ Selected voice is not available on this device.</p>
                    <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                      Using the best available voice fallback instead. You can pick a new voice available on this computer below.
                    </p>
                  </div>
                </div>
              )}

              {/* SEARCH & FILTER BAR */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search voices (e.g. Zira, Heera, தமிழ்)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#2F63F2] focus:bg-white transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <span className="text-xs font-semibold text-slate-500">Filter Language:</span>
                  <select
                    value={langFilter}
                    onChange={(e) => setLangFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#2F63F2]"
                  >
                    <option value="All">All Languages ({availableVoices.length})</option>
                    <option value="en">English ({availableVoices.filter(v => v.lang.startsWith('en')).length})</option>
                    <option value="en-IN">English (India)</option>
                    <option value="ta">Tamil ({availableVoices.filter(v => v.lang.startsWith('ta')).length})</option>
                    <option value="ta-IN">Tamil (India)</option>
                  </select>
                </div>
              </div>

              {/* ENGLISH VOICE SELECTOR CARD */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <span>English Announcement Voice</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#2F63F2]">Female Preferred</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">
                      Select the female English voice for token call announcements.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const selVoice = availableVoices.find(v => v.name === voiceForm.customEnglishVoiceName) || voiceAnnouncement.getBestEnglishVoice();
                      voiceAnnouncement.testSingleVoice('Token 25, Priya, please proceed to Doctor Arun Consultation Room.', selVoice, selVoice?.lang || 'en-IN');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2F63F2] rounded-lg text-xs font-bold transition-all cursor-pointer border border-blue-200"
                  >
                    <Play className="w-3.5 h-3.5 fill-[#2F63F2]" />
                    <span>▶ Test Voice</span>
                  </button>
                </div>

                <div className="pt-1">
                  <select
                    value={voiceForm.customEnglishVoiceName}
                    onChange={(e) => {
                      const selectedObj = availableVoices.find(v => v.name === e.target.value);
                      setVoiceForm(prev => ({
                        ...prev,
                        customEnglishVoiceName: e.target.value,
                        customEnglishVoiceLang: selectedObj ? selectedObj.lang : ''
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-[#2F63F2] focus:bg-white"
                  >
                    <option value="">-- Automatic Best English Female Voice Selection --</option>
                    {englishVoices.map((v, i) => (
                      <option key={`${v.name}-${i}`} value={v.name}>
                        {v.name} ({v.lang}) {v.localService ? '— Local' : '— Online'} {v.default ? '★ Default' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-4">
                  <span>Language: <strong className="text-slate-700">{voiceForm.customEnglishVoiceLang || (activeDiag.activeEnglish?.lang || 'en-IN')}</strong></span>
                  <span>Type: <strong className="text-slate-700">English Voice</strong></span>
                  <span>Mode: <strong className="text-slate-700">{voiceForm.customEnglishVoiceName ? 'Custom Selected' : 'Auto Prioritized'}</strong></span>
                </div>
              </div>

              {/* TAMIL VOICE SELECTOR CARD — MULTI-PROVIDER ARCHITECTURE */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-4 shadow-xs">
                
                {/* CARD HEADER & PROVIDER STATUS */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <span>Tamil Announcement Voice</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {voiceForm.provider === 'browser' ? `Local Voices: ${voiceAnnouncement.getAllTamilVoices().length}` : voiceForm.provider === 'sarvam' ? '⭐ Sarvam AI Active' : voiceForm.provider === 'azure' ? 'Azure Neural Active' : 'Google Cloud Active'}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">
                      Choose your preferred TTS provider (Sarvam AI Tamil, Local Browser, Microsoft Azure, or Google Cloud).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        refreshVoices();
                        fetchProviderStatus();
                        setToastMessage('✓ Refreshed provider status & voices');
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer border border-slate-200"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Refresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (voiceForm.provider === 'browser') {
                          const selVoice = availableVoices.find(v => v.name === voiceForm.customTamilVoiceName) || voiceAnnouncement.getBestTamilVoice();
                          voiceAnnouncement.testSingleVoice('டோக்கன் எண் 25, பிரியா, டாக்டர் அருண் ஆலோசனை அறைக்கு செல்லவும்.', selVoice, selVoice?.lang || 'ta-IN', 'browser');
                        } else {
                          const vId = voiceForm.provider === 'sarvam' ? voiceForm.sarvamVoiceId : voiceForm.provider === 'azure' ? voiceForm.azureVoiceId : voiceForm.googleVoiceId;
                          voiceAnnouncement.testSingleVoice('டோக்கன் எண் 25, பிரியா, டாக்டர் அருண் ஆலோசனை அறைக்கு செல்லவும்.', null, 'ta-IN', voiceForm.provider, vId);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-all cursor-pointer border border-emerald-200"
                    >
                      <Play className="w-3.5 h-3.5 fill-emerald-700" />
                      <span>▶ Test Voice</span>
                    </button>
                  </div>
                </div>

                {/* PROVIDER SELECTOR BUTTONS */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Voice Provider:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    
                    {/* 1. ⭐ Sarvam AI */}
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceForm(prev => ({ ...prev, provider: 'sarvam' }));
                        voiceAnnouncement.saveVoiceSettings({ provider: 'sarvam' });
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        voiceForm.provider === 'sarvam'
                          ? 'border-[#2F63F2] bg-blue-50/50 ring-1 ring-[#2F63F2]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">⭐ Sarvam AI</span>
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${
                          providerStatus.sarvam?.status === 'Connected' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            providerStatus.sarvam?.status === 'Connected' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`} />
                          {providerStatus.sarvam?.status || 'Check'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                        Native Tamil AI Neural voices
                      </span>
                    </button>

                    {/* 2. Local Browser */}
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceForm(prev => ({ ...prev, provider: 'browser' }));
                        voiceAnnouncement.saveVoiceSettings({ provider: 'browser' });
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        voiceForm.provider === 'browser'
                          ? 'border-[#2F63F2] bg-blue-50/50 ring-1 ring-[#2F63F2]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">Local Browser</span>
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Available
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                        Microsoft Valluvar & OS
                      </span>
                    </button>

                    {/* 3. Microsoft Azure */}
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceForm(prev => ({ ...prev, provider: 'azure' }));
                        voiceAnnouncement.saveVoiceSettings({ provider: 'azure' });
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        voiceForm.provider === 'azure'
                          ? 'border-[#2F63F2] bg-blue-50/50 ring-1 ring-[#2F63F2]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">Microsoft Azure</span>
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${
                          providerStatus.azure?.status === 'Connected' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            providerStatus.azure?.status === 'Connected' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`} />
                          {providerStatus.azure?.status || 'Check'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                        Pallavi Neural voice
                      </span>
                    </button>

                    {/* 4. Google Cloud */}
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceForm(prev => ({ ...prev, provider: 'google' }));
                        voiceAnnouncement.saveVoiceSettings({ provider: 'google' });
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        voiceForm.provider === 'google'
                          ? 'border-[#2F63F2] bg-blue-50/50 ring-1 ring-[#2F63F2]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">Google Cloud</span>
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${
                          providerStatus.google?.status === 'Connected' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            providerStatus.google?.status === 'Connected' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`} />
                          {providerStatus.google?.status || 'Check'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                        Chirp 3 HD & Wavenet
                      </span>
                    </button>

                  </div>
                </div>

                {/* SEARCH & FILTERS FOR CLOUD / LOCAL CATALOG */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                  <div className="sm:col-span-6 relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Search Tamil voices (e.g. Ananya, Pallavi, Chirp)..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#2F63F2] focus:bg-white"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      value={genderFilter}
                      onChange={(e) => setGenderFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#2F63F2]"
                    >
                      <option value="All">All Genders</option>
                      <option value="Female">Female Only</option>
                      <option value="Male">Male Only</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#2F63F2]"
                    >
                      <option value="All">All Quality Models</option>
                      <option value="Bulbul Neural">Bulbul Neural</option>
                      <option value="Chirp 3 HD">Chirp 3 HD</option>
                      <option value="Neural">Neural</option>
                      <option value="Wavenet">Wavenet</option>
                      <option value="Standard">Standard</option>
                    </select>
                  </div>
                </div>

                {/* TAB 1: ⭐ SARVAM AI TAMIL VOICE */}
                {voiceForm.provider === 'sarvam' && (
                  <div className="pt-1 space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Sarvam AI Tamil Neural Voices ({SARVAM_TAMIL_VOICES.length})
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {SARVAM_TAMIL_VOICES
                        .filter(v => {
                          if (genderFilter !== 'All' && v.gender !== genderFilter) return false;
                          if (searchFilter && !v.name.toLowerCase().includes(searchFilter.toLowerCase())) return false;
                          return true;
                        })
                        .map(v => (
                          <label
                            key={v.id}
                            className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                              voiceForm.sarvamVoiceId === v.id
                                ? 'border-[#2F63F2] bg-blue-50/40 ring-1 ring-[#2F63F2]'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="radio"
                                name="sarvamVoiceId"
                                value={v.id}
                                checked={voiceForm.sarvamVoiceId === v.id}
                                onChange={() => {
                                  setVoiceForm(prev => ({ ...prev, sarvamVoiceId: v.id }));
                                  voiceAnnouncement.saveVoiceSettings({ sarvamVoiceId: v.id });
                                }}
                                className="text-[#2F63F2]"
                              />
                              <div>
                                <span className="font-bold text-xs text-slate-900 block">{v.name}</span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {v.desc} • {v.quality}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                voiceAnnouncement.testSingleVoice('டோக்கன் எண் 25, பிரியா, டாக்டர் அருண் ஆலோசனை அறைக்கு செல்லவும்.', null, 'ta-IN', 'sarvam', v.id);
                              }}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200 shrink-0"
                            >
                              ▶ Test
                            </button>
                          </label>
                        ))}
                    </div>
                  </div>
                )}

                {/* TAB 1: LOCAL BROWSER TTS */}
                {voiceForm.provider === 'browser' && (
                  <div className="pt-1 space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Local Browser Voices ({voiceAnnouncement.getAllTamilVoices().length})
                    </label>
                    <select
                      value={voiceForm.customTamilVoiceName}
                      onChange={(e) => {
                        const selectedObj = availableVoices.find(v => v.name === e.target.value);
                        setVoiceForm(prev => ({
                          ...prev,
                          customTamilVoiceName: e.target.value,
                          customTamilVoiceLang: selectedObj ? selectedObj.lang : ''
                        }));
                      }}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-[#2F63F2] focus:bg-white cursor-pointer"
                    >
                      <option value="">⭐ Auto — Best Available (Recommended)</option>
                      {voiceAnnouncement.getAllTamilVoices()
                        .filter(v => {
                          if (!searchFilter) return true;
                          const s = searchFilter.toLowerCase();
                          return (v.name || '').toLowerCase().includes(s) || (v.lang || '').toLowerCase().includes(s);
                        })
                        .map((v, i) => (
                          <option key={`${v.name}-${i}`} value={v.name}>
                            {v.name} • {v.lang} • {v.localService ? 'Local' : 'Online'} {v.default ? '★ Default' : ''}
                          </option>
                        ))}
                    </select>

                    {voiceAnnouncement.getAllTamilVoices().length < 2 && (
                      <div className="p-3 bg-blue-50/60 border border-blue-200 text-slate-700 rounded-xl text-xs space-y-1">
                        <div className="flex items-start gap-2 text-blue-900 font-bold">
                          <Info className="w-4 h-4 text-[#2F63F2] shrink-0 mt-0.5" />
                          <span>🎙 Want more Tamil voices?</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
                          This device currently provides only <strong>{voiceAnnouncement.getAllTamilVoices().length} Tamil speech voice</strong>. Install additional Tamil speech voices in Windows or switch to Azure Neural / Google Cloud TTS above.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: MICROSOFT AZURE */}
                {voiceForm.provider === 'azure' && (
                  <div className="pt-1 space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Azure Tamil Neural Voices
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {AZURE_TAMIL_VOICES
                        .filter(v => {
                          if (genderFilter !== 'All' && v.gender !== genderFilter) return false;
                          if (searchFilter && !v.name.toLowerCase().includes(searchFilter.toLowerCase())) return false;
                          return true;
                        })
                        .map(v => (
                          <label
                            key={v.id}
                            className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                              voiceForm.azureVoiceId === v.id
                                ? 'border-[#2F63F2] bg-blue-50/40 ring-1 ring-[#2F63F2]'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="radio"
                                name="azureVoiceId"
                                value={v.id}
                                checked={voiceForm.azureVoiceId === v.id}
                                onChange={() => setVoiceForm(prev => ({ ...prev, azureVoiceId: v.id }))}
                                className="text-[#2F63F2]"
                              />
                              <div>
                                <span className="font-bold text-xs text-slate-900 block">{v.name}</span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {v.gender} • {v.quality} • {v.lang}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                voiceAnnouncement.testSingleVoice('டோக்கன் எண் 25, பிரியா, டாக்டர் அருண் ஆலோசனை அறைக்கு செல்லவும்.', null, 'ta-IN', 'azure', v.id);
                              }}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200 shrink-0"
                            >
                              ▶ Test
                            </button>
                          </label>
                        ))}
                    </div>
                  </div>
                )}

                {/* TAB 3: GOOGLE CLOUD TTS */}
                {voiceForm.provider === 'google' && (
                  <div className="pt-1 space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Google Cloud Tamil Voices Catalog ({GOOGLE_TAMIL_VOICES.length})
                    </label>

                    <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {GOOGLE_TAMIL_VOICES
                          .filter(v => {
                            if (genderFilter !== 'All' && v.gender !== genderFilter) return false;
                            if (categoryFilter !== 'All' && v.quality !== categoryFilter) return false;
                            if (searchFilter && !v.name.toLowerCase().includes(searchFilter.toLowerCase()) && !v.quality.toLowerCase().includes(searchFilter.toLowerCase())) return false;
                            return true;
                          })
                          .map(v => (
                            <label
                              key={v.id}
                              className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                                voiceForm.googleVoiceId === v.id
                                  ? 'border-[#2F63F2] bg-blue-50/40 ring-1 ring-[#2F63F2]'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="googleVoiceId"
                                  value={v.id}
                                  checked={voiceForm.googleVoiceId === v.id}
                                  onChange={() => setVoiceForm(prev => ({ ...prev, googleVoiceId: v.id }))}
                                  className="text-[#2F63F2]"
                                />
                                <div>
                                  <span className="font-bold text-xs text-slate-900 block">{v.name}</span>
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    {v.gender} • {v.quality}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  voiceAnnouncement.testSingleVoice('டோக்கன் எண் 25, பிரியா, டாக்டர் அருண் ஆலோசனை அறைக்கு செல்லவும்.', null, 'ta-IN', 'google', v.id);
                                }}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200 shrink-0"
                              >
                                ▶ Test
                              </button>
                            </label>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* SUMMARY ROW */}
                <div className="text-[11px] text-slate-500 font-medium flex flex-wrap items-center gap-4 pt-1 border-t border-slate-100">
                  <span>Provider: <strong className="text-slate-900 uppercase">{voiceForm.provider}</strong></span>
                  <span>Active Voice: <strong className="text-emerald-700">{
                    voiceForm.provider === 'sarvam' ? voiceForm.sarvamVoiceId : voiceForm.provider === 'azure' ? voiceForm.azureVoiceId : voiceForm.provider === 'google' ? voiceForm.googleVoiceId : (activeDiag.activeTamil?.name || 'Microsoft Valluvar')
                  }</strong></span>
                  <span>Fallback: <strong className="text-slate-700">Microsoft Valluvar (Local Browser)</strong></span>
                </div>
              </div>

              {/* ANNOUNCEMENT MODE & PROFILE SETTINGS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* ANNOUNCEMENT MODE */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3 shadow-xs">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">Announcement Language Mode</h2>
                  <div className="space-y-2 pt-1">
                    {[
                      { id: 'BOTH', label: 'Tamil + English (Default Sequence)' },
                      { id: 'EN_ONLY', label: 'English Only' },
                      { id: 'TA_ONLY', label: 'Tamil Only' }
                    ].map(m => (
                      <label key={m.id} className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="languageMode"
                          checked={voiceForm.languageMode === m.id}
                          onChange={() => setVoiceForm(prev => ({ ...prev, languageMode: m.id }))}
                          className="w-4 h-4 text-[#2F63F2]"
                        />
                        <span>{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* VOICE PROFILE */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3 shadow-xs">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">Voice Style Profile</h2>
                  <div className="space-y-2 pt-1">
                    {[
                      { id: 'Professional', label: 'Professional (Recommended — 0.88x speed)' },
                      { id: 'Gentle', label: 'Gentle (Calm — 0.84x speed, 1.02 pitch)' },
                      { id: 'Clear OPD', label: 'Clear OPD (Fast OPD — 0.90x speed)' }
                    ].map(p => (
                      <label key={p.id} className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="profile"
                          checked={voiceForm.profile === p.id}
                          onChange={() => setVoiceForm(prev => ({ ...prev, profile: p.id }))}
                          className="w-4 h-4 text-[#2F63F2]"
                        />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

              </div>

              {/* ACTION BAR — TEST FULL ANNOUNCEMENT & RESET */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const engV = availableVoices.find(v => v.name === voiceForm.customEnglishVoiceName) || voiceAnnouncement.getBestEnglishVoice();
                      const tamV = availableVoices.find(v => v.name === voiceForm.customTamilVoiceName) || voiceAnnouncement.getBestTamilVoice();
                      voiceAnnouncement.testFullAnnouncement(engV, tamV);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#2F63F2] hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-all"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>▶ Test Full Announcement</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetVoiceToAutomatic}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset to Automatic</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{showDiagnostics ? 'Hide Voice Diagnostics' : 'Show Voice Diagnostics'}</span>
                </button>
              </div>

              {/* DIAGNOSTICS DRAWER */}
              {showDiagnostics && (
                <div className="bg-slate-900 text-slate-100 rounded-xl p-5 text-xs font-mono space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="font-bold text-blue-400">Voice System Diagnostics</h3>
                    <span>Total Detected Voices: {availableVoices.length}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-slate-400 font-bold mb-1">Active English Voice:</p>
                      <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] overflow-x-auto text-emerald-400">
                        {JSON.stringify(activeDiag.activeEnglish, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold mb-1">Active Tamil Voice:</p>
                      <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] overflow-x-auto text-emerald-400">
                        {JSON.stringify(activeDiag.activeTamil, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* Raw Browser Voices Inspector */}
                  <div className="border-t border-slate-800 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-slate-300 font-bold">Raw Browser Voices List ({availableVoices.length}):</p>
                      <span className="text-[10px] text-slate-500">Exposed by OS & Browser Speech Engine</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                      {availableVoices.map((v, idx) => (
                        <div key={idx} className="border-b border-slate-800/60 pb-1.5 flex items-center justify-between text-[11px]">
                          <div>
                            <span className="font-bold text-slate-200">{idx + 1}. {v.name}</span>
                            <span className="text-slate-500 ml-2">({v.lang})</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>{v.localService ? 'Local' : 'Online'}</span>
                            {v.default && <span className="text-amber-400 font-bold">Default</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          ) : activeTab === 'billing' ? (
            <>
              {/* SECTION 1 — CONSULTATION FEE DETERMINATION */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                1. Consultation Fee Determination
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Choose how the consultation fee is determined.
              </p>
            </div>

            {/* Compact Option Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option 1: Predefined */}
              <label 
                onClick={() => handleFeeTypeChange('Predefined')}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                  form.consultationFeeType === 'Predefined'
                    ? 'border-[#2F63F2] bg-blue-50/40 ring-1 ring-[#2F63F2]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="consultationFeeType"
                  value="Predefined"
                  checked={form.consultationFeeType === 'Predefined'}
                  onChange={() => handleFeeTypeChange('Predefined')}
                  className="mt-0.5 text-[#2F63F2] focus:ring-[#2F63F2] shrink-0"
                />
                <div className="text-left space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block">Predefined Fee Structure</span>
                  <span className="text-[11px] text-slate-500 font-normal leading-normal block">
                    Use the configured consultation fee.
                  </span>
                </div>
              </label>

              {/* Option 2: On Consultation */}
              <label 
                onClick={() => handleFeeTypeChange('On Consultation')}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                  form.consultationFeeType === 'On Consultation'
                    ? 'border-[#2F63F2] bg-blue-50/40 ring-1 ring-[#2F63F2]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="consultationFeeType"
                  value="On Consultation"
                  checked={form.consultationFeeType === 'On Consultation'}
                  onChange={() => handleFeeTypeChange('On Consultation')}
                  className="mt-0.5 text-[#2F63F2] focus:ring-[#2F63F2] shrink-0"
                />
                <div className="text-left space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block">On Consultation — Manual Entry</span>
                  <span className="text-[11px] text-slate-500 font-normal leading-normal block">
                    Enter the fee during consultation.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* SECTION 2 — CONSULTATION FEE COLLECTION */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-4 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                2. Consultation Fee Collection
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Choose who collects the consultation fee.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-0.5">
              
              {/* Left: Collector Dropdown */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-700 block">
                  Collector
                </label>
                <select
                  value={form.feeCollectionRole}
                  onChange={(e) => handleCollectorChange(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#2F63F2] focus:border-[#2F63F2] transition-all cursor-pointer"
                >
                  <option value="Reception">Reception</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Pharmacy">Pharmacy</option>
                </select>
              </div>

              {/* Right: Payment Timing Control */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-700 block">
                  Payment Timing
                </label>

                {isTimingLocked ? (
                  <div className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-500 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-slate-400" />
                      After Consultation
                    </span>
                  </div>
                ) : (
                  <select
                    value={form.paymentTiming}
                    onChange={(e) => setForm({ ...form, paymentTiming: e.target.value })}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#2F63F2] focus:border-[#2F63F2] transition-all cursor-pointer"
                  >
                    <option value="Before Consultation">Before Consultation</option>
                    <option value="After Consultation">After Consultation</option>
                  </select>
                )}
              </div>

            </div>

            {/* Contextual Helper & Status Display */}
            <div className="pt-1 text-xs text-left space-y-1">
              <p className="text-[12px] text-slate-500 font-normal">
                {isTimingLocked ? 'After consultation only' : 'Before or after consultation'}
              </p>

              {isPharmacySelected && (
                <div className="pt-1 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                  <span className="text-[#2F63F2] font-bold">✓</span>
                  <span>Consultation Fee + Pharmacy Bill</span>
                </div>
              )}
            </div>

          </div>
          </>
        ) : activeTab === 'emergency' ? (
          /* TAB 2 — EMERGENCY INTAKE MODULE */
          <div className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-5 shadow-xs text-left">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">
                <AlertTriangle className="w-4 h-4" />
                <span>Emergency Intake Module</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Emergency Patient & Priority Queue Settings
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Configure emergency patient intake workflows, custom priority token prefixes (e.g. EMG001), and OPD Reception Desk visibility.
              </p>
            </div>

            {/* Master Toggle Card */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Enable Emergency Intake Module</h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Master switch to render the Emergency Intake registration drawer and live Emergency KPI metric card at OPD Reception Desk.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enableEmergencyModule || false}
                  onChange={(e) => setForm(prev => ({ ...prev, enableEmergencyModule: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
              </label>
            </div>

            {form.enableEmergencyModule ? (
              <div className="space-y-4">
                <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-2xl text-xs text-rose-950 font-medium space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5 text-rose-800 text-xs uppercase tracking-wider">
                    <span>🚨 Emergency Module Active</span>
                  </p>
                  <p className="text-xs text-rose-700">
                    OPD Reception Desk will render the red <strong>Emergency Intake</strong> registration button and live <strong>Emergency KPI</strong> metric card.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                      Emergency Token Prefix
                    </label>
                    <input
                      type="text"
                      value={form.emergencyTokenPrefix || 'EMG'}
                      onChange={(e) => setForm({ ...form, emergencyTokenPrefix: e.target.value.toUpperCase() })}
                      placeholder="e.g. EMG"
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2]"
                    />
                    <span className="text-[11px] text-slate-500">Prefix assigned to emergency tokens (e.g. EMG001).</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                      Queue Priority Rule
                    </label>
                    <select
                      value={form.emergencyQueuePriority || 'OVERRIDE'}
                      onChange={(e) => setForm({ ...form, emergencyQueuePriority: e.target.value })}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer"
                    >
                      <option value="OVERRIDE">Top Queue Override (Immediate Next Call)</option>
                      <option value="STANDARD">Standard Waiting Queue</option>
                    </select>
                    <span className="text-[11px] text-slate-500">Determines if emergency tokens jump to top of doctor queue.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 font-medium space-y-1">
                <p className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                  🚫 Emergency Intake Disabled (Standard OPD Mode)
                </p>
                <p className="text-xs text-slate-500">
                  Emergency buttons, registration drawer, and metric cards are completely hidden from OPD Reception Desk.
                </p>
              </div>
            )}
          </div>
        ) : activeTab === 'delivery' ? (
          /* TAB 2 — PRESCRIPTION DELIVERY ROUTING */
          <div className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-5 shadow-xs">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#2F63F2] uppercase tracking-wider mb-1">
                <Pill className="w-4 h-4" />
                <span>Delivery Policy</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Prescription Delivery Routing
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Configure how completed prescriptions are delivered when a doctor finishes a consultation.
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="prescriptionDelivery"
                  value="internal_pharmacy"
                  checked={form.prescriptionDelivery === 'internal_pharmacy'}
                  onChange={(e) => setForm({ ...form, prescriptionDelivery: e.target.value })}
                  className="mt-1 w-4 h-4 text-[#2F63F2] focus:ring-[#2F63F2] border-slate-300"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block">Internal Pharmacy Only (Automatic)</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">Automatically send all completed prescriptions directly to the hospital pharmacy queue without prompting the doctor.</span>
                </div>
              </label>

              <label className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="prescriptionDelivery"
                  value="print_only"
                  checked={form.prescriptionDelivery === 'print_only'}
                  onChange={(e) => setForm({ ...form, prescriptionDelivery: e.target.value })}
                  className="mt-1 w-4 h-4 text-[#2F63F2] focus:ring-[#2F63F2] border-slate-300"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block">Print Only (External Purchase)</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">Print paper prescription for patient external purchase without sending to internal pharmacy queue.</span>
                </div>
              </label>

              <label className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="prescriptionDelivery"
                  value="internal_external"
                  checked={form.prescriptionDelivery === 'internal_external'}
                  onChange={(e) => setForm({ ...form, prescriptionDelivery: e.target.value })}
                  className="mt-1 w-4 h-4 text-[#2F63F2] focus:ring-[#2F63F2] border-slate-300"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block">Doctor Prompt (Internal or External Choice)</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">Prompt the doctor on each consultation completion to choose between Internal Pharmacy or External Print.</span>
                </div>
              </label>
            </div>
          </div>
        ) : activeTab === 'geofence' ? (
          /* TAB 4: RECEPTIONIST GPS GEOFENCE SETTINGS */
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6 shadow-xs text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#2F63F2]" />
                  Receptionist GPS Geofence Access Control
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enforce physical location checks during Receptionist and Staff login based on hospital premises latitude and longitude.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleSaveGeoSettings}
                loading={savingGeo}
                variant="primary"
                className="text-xs font-bold uppercase tracking-wider"
              >
                Save Geofence Settings
              </Button>
            </div>

            {/* Master Toggle */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-slate-900 block">Master Geofence Enforcement</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  When enabled, Receptionists logging in outside the configured radius will be blocked with a location alert.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={geoForm.enabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setGeoForm(prev => ({ ...prev, enabled: isChecked }));
                    if (isChecked) {
                      if (!geoForm.latitude || !geoForm.longitude) {
                        handleDetectLocation();
                      }
                    } else {
                      setGeoStatusMsg(null);
                      setGeoStatusType(null);
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2F63F2]"></div>
              </label>
            </div>

            {/* Coordinates Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Hospital Coordinates (Latitude & Longitude)</label>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={detectingGeo}
                  className="text-xs font-semibold text-[#2F63F2] hover:text-blue-800 flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-all cursor-pointer"
                >
                  <Navigation className={`w-3.5 h-3.5 ${detectingGeo ? 'animate-spin' : ''}`} />
                  {detectingGeo ? 'Detecting Location...' : 'Auto-Detect Current GPS Location'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Latitude (Decimal Degrees)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 13.0827"
                    value={geoForm.latitude}
                    onChange={(e) => setGeoForm({ ...geoForm, latitude: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-[#2F63F2] focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Longitude (Decimal Degrees)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 80.2707"
                    value={geoForm.longitude}
                    onChange={(e) => setGeoForm({ ...geoForm, longitude: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-[#2F63F2] focus:bg-white"
                  />
                </div>
              </div>

              {geoStatusMsg && (
                <div className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                  geoStatusType === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  <span>{geoStatusMsg}</span>
                </div>
              )}
            </div>

            {/* Geofence Radius Input */}
            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Allowed Geofence Radius (Meters)</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">Maximum distance from hospital center where Receptionist login is allowed</span>
                </div>
              </div>
              <input
                type="number"
                min="10"
                placeholder="300"
                value={geoForm.radiusMeters}
                onChange={(e) => setGeoForm({ ...geoForm, radiusMeters: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-[#2F63F2]"
              />
            </div>
          </div>
        ) : null}

        </div>

        {/* RIGHT COLUMN — CURRENT WORKFLOW / VOICE SUMMARY (Approx 35%) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-4 shadow-xs sticky top-5 text-left">
            
            {activeTab === 'voice' ? (
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">TTS Provider</span>
                  <span className="font-bold text-slate-900 text-xs block uppercase">
                    {voiceForm.provider === 'sarvam' ? '⭐ Sarvam AI Tamil Speech' : voiceForm.provider === 'azure' ? 'Microsoft Azure Speech' : voiceForm.provider === 'google' ? 'Google Cloud TTS' : 'Local Browser TTS'}
                  </span>
                  <span className="text-[11px] text-[#2F63F2] font-semibold">
                    Status: {voiceForm.provider === 'browser' ? 'Available' : (providerStatus[voiceForm.provider]?.status || 'Configured')}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Active Tamil Voice</span>
                  <span className="font-bold text-emerald-700 text-xs block truncate">
                    {voiceForm.provider === 'sarvam' ? voiceForm.sarvamVoiceId : voiceForm.provider === 'azure' ? voiceForm.azureVoiceId : voiceForm.provider === 'google' ? voiceForm.googleVoiceId : (activeDiag.activeTamil?.name || 'Microsoft Valluvar')}
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    Language: ta-IN
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Fallback Provider</span>
                  <span className="font-bold text-slate-700 text-xs block">
                    Microsoft Valluvar (Local Browser)
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Language Mode</span>
                  <span className="font-bold text-[#2F63F2] text-xs block">
                    {voiceForm.languageMode === 'BOTH' ? 'Tamil + English Sequence' : voiceForm.languageMode === 'EN_ONLY' ? 'English Only' : 'Tamil Only'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Style Profile</span>
                  <span className="font-bold text-slate-700 text-xs block">
                    {voiceForm.profile || 'Professional'} (0.88x speed)
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Architecture Protection</span>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 font-medium space-y-1">
                    <p className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Single FIFO Voice Queue</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Auto Cloud Fallback & Offline Ready</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : activeTab === 'geofence' ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Geofence Status</span>
                  <span className={`font-bold text-xs block ${geoForm.enabled ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {geoForm.enabled ? '🔒 ENFORCED (ACTIVE)' : '🔓 DISABLED'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Target Coordinates</span>
                  <span className="font-bold text-slate-900 text-xs block font-mono">
                    {geoForm.latitude && geoForm.longitude ? `${geoForm.latitude}, ${geoForm.longitude}` : 'Not Set'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Allowed Radius</span>
                  <span className="font-bold text-[#2F63F2] text-xs block font-mono">
                    {geoForm.radiusMeters} Meters
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Enforced Roles</span>
                  <span className="font-bold text-slate-700 text-[11px] block">
                    RECEPTIONIST (Reception Desk Only)
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Fee Mode</span>
                  <span className="font-bold text-slate-800 text-xs">
                    {form.consultationFeeType === 'Predefined' ? 'Predefined Fee Structure' : 'On Consultation — Manual Entry'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Collector</span>
                  <span className="font-bold text-[#2F63F2] text-xs">
                    {form.feeCollectionRole}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Payment</span>
                  <span className="font-bold text-slate-700 text-xs">
                    {form.paymentTiming}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Rx Delivery</span>
                  <span className="font-bold text-slate-700 text-xs">
                    {form.prescriptionDelivery === 'internal_pharmacy' ? 'Internal Pharmacy (Auto)' : form.prescriptionDelivery === 'print_only' ? 'Print Only (External)' : 'Doctor Prompt (Choice)'}
                  </span>
                </div>
              </div>
            )}

            {/* Workflow Sequence */}
            <div className="border-t border-slate-100 pt-3.5 space-y-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Workflow
              </h4>

              <div className="space-y-1 text-[11px] font-medium text-slate-600">
                <div className="px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200/70">
                  Patient Registration
                </div>
                
                {form.feeCollectionRole === 'Reception' && form.paymentTiming === 'Before Consultation' && (
                  <>
                    <div className="flex justify-center py-0.5">
                      <ArrowDown className="w-3 h-3 text-slate-300" />
                    </div>
                    <div className="px-2.5 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-[#2F63F2] font-bold">
                      Collect Consultation Fee
                    </div>
                  </>
                )}

                <div className="flex justify-center py-0.5">
                  <ArrowDown className="w-3 h-3 text-slate-300" />
                </div>
                <div className="px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200/70">
                  Doctor Consultation
                </div>

                <div className="flex justify-center py-0.5">
                  <ArrowDown className="w-3 h-3 text-slate-300" />
                </div>
                <div className="px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200/70">
                  Prescription Sent
                </div>

                <div className="flex justify-center py-0.5">
                  <ArrowDown className="w-3 h-3 text-slate-300" />
                </div>
                <div className="px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200/70">
                  Pharmacy Billing
                </div>

                <div className="flex justify-center py-0.5">
                  <ArrowDown className="w-3 h-3 text-slate-300" />
                </div>
                <div className={`px-2.5 py-1.5 rounded-md border ${
                  isPharmacySelected
                    ? 'bg-blue-50 border-[#2F63F2] text-[#2F63F2] font-bold'
                    : 'bg-slate-50 border-slate-200/70 text-slate-700 font-bold'
                }`}>
                  <span>Collect Payment</span>
                  {isPharmacySelected && (
                    <span className="block text-[10px] text-slate-500 font-normal mt-0.5">
                      Consultation Fee + Pharmacy Bill
                    </span>
                  )}
                </div>

                <div className="flex justify-center py-0.5">
                  <ArrowDown className="w-3 h-3 text-slate-300" />
                </div>
                <div className="px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200/70">
                  Dispense Medicine
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};

export default HospitalBillingWorkflowSettings;
