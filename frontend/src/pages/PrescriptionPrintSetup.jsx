import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { generatePrescriptionPrintHTML, generateCalibrationHTML } from '../utils/prescriptionPrintService';
import Button from '../components/Button';
import api from '../services/api';
import { 
  Printer, ShieldCheck, CheckCircle2, Image as ImageIcon, FileText, Layout, Eye, Save, 
  Sparkles, Sliders, Type, Upload, Trash2, Copy, Plus, AlertCircle, RotateCcw,
  Move, ZoomIn, ZoomOut, Maximize2, Settings, History, Check, Layers, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';

const AVAILABLE_FIELDS = [
  { section: 'HOSPITAL', fieldKey: 'hospitalName', fieldName: 'Hospital Name', defaultWidth: 80, defaultHeight: 10 },
  { section: 'HOSPITAL', fieldKey: 'hospitalLogo', fieldName: 'Hospital Logo', defaultWidth: 40, defaultHeight: 15 },
  { section: 'HOSPITAL', fieldKey: 'hospitalAddress', fieldName: 'Hospital Address', defaultWidth: 90, defaultHeight: 10 },
  { section: 'HOSPITAL', fieldKey: 'hospitalRegNo', fieldName: 'Hospital Registration No', defaultWidth: 50, defaultHeight: 8 },
  { section: 'HOSPITAL', fieldKey: 'hospitalPhone', fieldName: 'Hospital Phone', defaultWidth: 45, defaultHeight: 8 },
  { section: 'HOSPITAL', fieldKey: 'hospitalEmail', fieldName: 'Hospital Email', defaultWidth: 50, defaultHeight: 8 },

  { section: 'BRANCH', fieldKey: 'branchName', fieldName: 'Branch Name', defaultWidth: 60, defaultHeight: 8 },
  { section: 'BRANCH', fieldKey: 'branchAddress', fieldName: 'Branch Address', defaultWidth: 80, defaultHeight: 8 },
  { section: 'BRANCH', fieldKey: 'branchPhone', fieldName: 'Branch Phone', defaultWidth: 40, defaultHeight: 8 },

  { section: 'PATIENT', fieldKey: 'patientName', fieldName: 'Patient Name', defaultWidth: 70, defaultHeight: 8 },
  { section: 'PATIENT', fieldKey: 'uhid', fieldName: 'UHID / Patient ID', defaultWidth: 40, defaultHeight: 8 },
  { section: 'PATIENT', fieldKey: 'age', fieldName: 'Patient Age', defaultWidth: 25, defaultHeight: 8 },
  { section: 'PATIENT', fieldKey: 'gender', fieldName: 'Patient Gender', defaultWidth: 25, defaultHeight: 8 },
  { section: 'PATIENT', fieldKey: 'mobile', fieldName: 'Mobile Number', defaultWidth: 45, defaultHeight: 8 },
  { section: 'PATIENT', fieldKey: 'bloodGroup', fieldName: 'Blood Group', defaultWidth: 25, defaultHeight: 8 },
  { section: 'PATIENT', fieldKey: 'place', fieldName: 'Place / Village', defaultWidth: 50, defaultHeight: 8 },
  
  { section: 'VISIT', fieldKey: 'date', fieldName: 'Consultation Date', defaultWidth: 40, defaultHeight: 8 },
  { section: 'VISIT', fieldKey: 'token', fieldName: 'Token Number', defaultWidth: 30, defaultHeight: 8 },
  { section: 'VISIT', fieldKey: 'visitType', fieldName: 'Visit Type (OPD/Emergency)', defaultWidth: 40, defaultHeight: 8 },
  { section: 'VISIT', fieldKey: 'appointmentTime', fieldName: 'Appointment Time', defaultWidth: 35, defaultHeight: 8 },
  { section: 'VISIT', fieldKey: 'chiefComplaint', fieldName: 'Chief Complaint', defaultWidth: 80, defaultHeight: 12 },

  { section: 'CLINICAL', fieldKey: 'diagnosis', fieldName: 'Clinical Diagnosis', defaultWidth: 90, defaultHeight: 14 },
  { section: 'CLINICAL', fieldKey: 'clinicalNotes', fieldName: 'Clinical Notes', defaultWidth: 100, defaultHeight: 16 },
  { section: 'CLINICAL', fieldKey: 'allergies', fieldName: 'Known Allergies', defaultWidth: 60, defaultHeight: 8 },
  { section: 'CLINICAL', fieldKey: 'advice', fieldName: 'Advice & Guidelines', defaultWidth: 100, defaultHeight: 16 },
  { section: 'CLINICAL', fieldKey: 'followupDate', fieldName: 'Next Follow-up Date', defaultWidth: 45, defaultHeight: 8 },

  { section: 'DOCTOR', fieldKey: 'doctorName', fieldName: 'Doctor Name', defaultWidth: 60, defaultHeight: 8 },
  { section: 'DOCTOR', fieldKey: 'qualification', fieldName: 'Doctor Qualification', defaultWidth: 50, defaultHeight: 8 },
  { section: 'DOCTOR', fieldKey: 'regNo', fieldName: 'Doctor Registration No', defaultWidth: 50, defaultHeight: 8 },
  { section: 'DOCTOR', fieldKey: 'department', fieldName: 'Doctor Department', defaultWidth: 45, defaultHeight: 8 },
  { section: 'DOCTOR', fieldKey: 'doctorSignature', fieldName: 'Doctor Signature', defaultWidth: 50, defaultHeight: 15 },

  { section: 'PRESCRIPTION', fieldKey: 'medicineTable', fieldName: 'Rx — Prescribed Medicines Table', defaultWidth: 170, defaultHeight: 60 }
];

const PrescriptionPrintSetup = () => {
  const { billingSettings } = useBillingSettings();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved ✓'); // 'Unsaved Changes' | 'Saving...' | 'Saved ✓' | 'Error'
  const [hospitalId, setHospitalId] = useState(null);

  // Template Management state
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Form State for Active Template
  const [activeTemplate, setActiveTemplate] = useState({
    name: 'General OPD Prescription',
    description: 'Default OPD Prescription Layout',
    mode: 'STANDARD', // 'STANDARD' | 'PRE_PRINTED'
    backgroundFile: '',
    backgroundFileType: '',
    backgroundFileName: '',
    backgroundFileSize: 0,
    uploadedAt: null,
    paperSize: 'A4',
    orientation: 'Portrait',
    margins: 'Medium',
    scale: 100,
    customWidth: 210,
    customHeight: 297,
    fieldMappings: [
      { fieldKey: 'patientName', fieldName: 'Patient Name', section: 'PATIENT', x: 25, y: 35, width: 70, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
      { fieldKey: 'uhid', fieldName: 'UHID', section: 'PATIENT', x: 120, y: 35, width: 40, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#2f63f2', visible: true },
      { fieldKey: 'date', fieldName: 'Consult Date', section: 'VISIT', x: 165, y: 35, width: 35, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true },
      { fieldKey: 'diagnosis', fieldName: 'Diagnosis', section: 'CLINICAL', x: 25, y: 55, width: 150, height: 12, fontSize: 12, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
      { fieldKey: 'doctorName', fieldName: 'Doctor Name', section: 'DOCTOR', x: 130, y: 240, width: 60, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true }
    ],
    medicineTableConfig: {
      x: 25,
      y: 80,
      width: 160,
      height: 100,
      columns: {
        medicineName: { visible: true, label: 'Medicine Name', width: 35 },
        dosage: { visible: true, label: 'Dosage', width: 15 },
        frequency: { visible: true, label: 'Frequency', width: 15 },
        duration: { visible: true, label: 'Duration', width: 15 },
        foodTiming: { visible: true, label: 'Food Timing', width: 20 },
        instructions: { visible: false, label: 'Instructions', width: 20 }
      },
      fontSize: 11,
      rowHeight: 24,
      showHeader: true,
      maxRows: 10,
      showLines: true
    },
    standardConfig: {
      hospitalLogo: '',
      hospitalName: 'VillZone Multispeciality Hospital',
      registrationNumber: 'REG-TNMC/2026/45879',
      clinicAddress: '124 Healthcare Boulevard, City Center, Main District',
      contactNumber: '+91 98765 43210',
      email: 'contact@villzonehospital.com',
      website: 'www.villzonehospital.com',
      headerTitle: 'VillZone Multispeciality Hospital',
      headerSubtitle: 'Excellence in Enterprise Healthcare',
      headerAlignment: 'Left',
      footerText: 'Thank you for choosing VillZone Hospital. Please follow doctor instructions.',
      footerAlignment: 'Center',
      watermarkEnabled: true,
      watermarkText: 'VILLZONE HIMS',
      watermarkOpacity: '0.15',
      sections: {
        patientInfo: true,
        doctorInfo: true,
        diagnosis: true,
        medicines: true,
        investigations: true,
        advice: true,
        followUp: true,
        notes: true,
        vitals: true,
        hospitalHeader: true,
        hospitalFooter: true
      }
    },
    calibration: {
      topOffset: 0,
      leftOffset: 0,
      scale: 100
    },
    version: 1,
    status: 'ACTIVE',
    isDefault: true
  });

  const [selectedFieldKey, setSelectedFieldKey] = useState(null);
  const fileInputRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);

  // Fetch Hospital & Templates
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const hRes = await api.get('/admin/hospitals');
        const list = hRes.data?.data || [];
        if (list.length > 0) {
          const h = list[0];
          setHospitalId(h._id);

          // Fetch Active Default Template for hospital
          try {
            const activeRes = await api.get(`/admin/hospitals/${h._id}/print-template/active`);
            if (activeRes.data?.data) {
              const activeT = activeRes.data.data;
              setSelectedTemplateId(activeT._id);
              setActiveTemplate(activeT);
            }
            const tRes = await api.get(`/admin/hospitals/${h._id}/print-templates`);
            const tList = tRes.data?.data || [];
            if (tList.length > 0) {
              setTemplates(tList);
              if (!activeRes.data?.data) {
                const defT = tList.find(t => t.isDefault) || tList[0];
                setSelectedTemplateId(defT._id);
                setActiveTemplate(defT);
              }
            }
          } catch (err) {
            console.log('Error loading active template, using local default state.', err);
          }
        }
      } catch (err) {
        console.error('Failed to load hospital profile', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const markUnsaved = () => {
    setSaveStatus('Unsaved Changes');
  };

  const handleUpdateTemplate = (updater) => {
    setActiveTemplate(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      return next;
    });
    markUnsaved();
  };

  const handleSaveConfiguration = async () => {
    if (!hospitalId) {
      toast.error('Hospital ID not found.');
      return;
    }

    // Validate Template Configuration (Phase 4 Validation Rules)
    if (!activeTemplate.mode) {
      toast.error('Template Validation Error: Printing Mode is required.');
      return;
    }

    setSaving(true);
    setSaveStatus('Saving...');
    try {
      const defaultFields = [
        { fieldKey: 'patientName', fieldName: 'Patient Name', section: 'PATIENT', x: 25, y: 35, width: 70, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
        { fieldKey: 'uhid', fieldName: 'UHID', section: 'PATIENT', x: 120, y: 35, width: 40, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#2f63f2', visible: true },
        { fieldKey: 'date', fieldName: 'Consult Date', section: 'VISIT', x: 165, y: 35, width: 35, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true },
        { fieldKey: 'diagnosis', fieldName: 'Diagnosis', section: 'CLINICAL', x: 25, y: 55, width: 150, height: 12, fontSize: 12, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
        { fieldKey: 'doctorName', fieldName: 'Doctor Name', section: 'DOCTOR', x: 130, y: 240, width: 60, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true }
      ];

      const payload = {
        ...activeTemplate,
        fieldMappings: activeTemplate.mode === 'PRE_PRINTED' && (!activeTemplate.fieldMappings || activeTemplate.fieldMappings.length === 0)
          ? defaultFields
          : activeTemplate.fieldMappings,
        isDefault: true,
        status: 'ACTIVE'
      };
      let savedData = null;
      if (selectedTemplateId) {
        const res = await api.put(`/admin/print-templates/${selectedTemplateId}`, payload);
        savedData = res.data?.data;
      } else {
        const res = await api.post(`/admin/hospitals/${hospitalId}/print-templates`, payload);
        savedData = res.data?.data;
        if (savedData?._id) {
          setSelectedTemplateId(savedData._id);
        }
      }
      if (savedData) {
        setActiveTemplate(savedData);
      }
      setSaveStatus('Saved ✓');
      toast.success('Prescription Print Setup Configuration Saved Successfully!');
    } catch (err) {
      setSaveStatus('Error');
      toast.error(err.response?.data?.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  // Upload Stationery File Validation & Handler
  const handleFileUpload = (file) => {
    if (!file) return;

    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error('Unsupported file type. Please upload a PDF, PNG, JPG, or JPEG file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds maximum limit of 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      handleUpdateTemplate({
        backgroundFile: e.target.result,
        backgroundFileType: file.type,
        backgroundFileName: file.name,
        backgroundFileSize: file.size,
        uploadedAt: new Date()
      });
      toast.success(`Uploaded prescription pad background: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  // Field Library Controls
  const handleAddFieldToCanvas = (fieldDef) => {
    if (fieldDef.fieldKey === 'medicineTable') {
      const currentVisible = activeTemplate?.medicineTableConfig?.visible !== false;
      const newVisible = !currentVisible;
      handleUpdateTemplate(prev => ({
        ...prev,
        medicineTableConfig: { ...(prev.medicineTableConfig || {}), visible: newVisible }
      }));
      setSelectedFieldKey(null);
      toast.success(newVisible ? 'Enabled Rx Medicine Table on Canvas' : 'Disabled Rx Medicine Table on Canvas');
      return;
    }

    const mappings = activeTemplate?.fieldMappings || [];
    const existing = mappings.find(f => f.fieldKey === fieldDef.fieldKey);
    if (existing) {
      // Toggle visibility if already added
      const newVisible = existing.visible === false;
      handleUpdateTemplate(prev => ({
        ...prev,
        fieldMappings: (prev.fieldMappings || []).map(f => f.fieldKey === fieldDef.fieldKey ? { ...f, visible: newVisible } : f)
      }));
      setSelectedFieldKey(fieldDef.fieldKey);
      toast.success(newVisible ? `Enabled ${fieldDef.fieldName}` : `Disabled ${fieldDef.fieldName}`);
      return;
    }

    const newField = {
      fieldKey: fieldDef.fieldKey,
      fieldName: fieldDef.fieldName,
      section: fieldDef.section,
      x: 20 + (mappings.length * 5) % 80,
      y: 30 + (mappings.length * 10) % 150,
      width: fieldDef.defaultWidth,
      height: fieldDef.defaultHeight,
      fontFamily: 'Segoe UI',
      fontSize: 12,
      fontWeight: 'normal',
      alignment: 'left',
      color: '#0f172a',
      visible: true
    };

    handleUpdateTemplate(prev => ({
      ...prev,
      fieldMappings: [...(prev.fieldMappings || []), newField]
    }));
    setSelectedFieldKey(fieldDef.fieldKey);
    toast.success(`Added ${fieldDef.fieldName} to Prescription Canvas`);
  };

  const handleRemoveField = (key) => {
    handleUpdateTemplate(prev => ({
      ...prev,
      fieldMappings: (prev.fieldMappings || []).filter(f => f.fieldKey !== key)
    }));
    if (selectedFieldKey === key) setSelectedFieldKey(null);
    toast.success('Field removed from canvas.');
  };

  const selectedField = activeTemplate?.fieldMappings?.find(f => f.fieldKey === selectedFieldKey);

  const handleUpdateSelectedField = (prop, val) => {
    if (!selectedFieldKey || !activeTemplate?.fieldMappings) return;
    handleUpdateTemplate(prev => ({
      ...prev,
      fieldMappings: (prev.fieldMappings || []).map(f => f.fieldKey === selectedFieldKey ? { ...f, [prop]: val } : f)
    }));
  };

  // Test Print Function (Uses current unsaved form values & Phase 1 engine contract)
  const handleTestPrint = () => {
    const sampleConsultation = {
      isSample: true,
      hospital: { name: 'Sample Hospital', address: '123 Health Ave', registrationNumber: 'REG-SAMPLE-001', phone: '+91 99999 88888' },
      branch: { name: 'Main Branch' },
      patientId: { name: 'Sample Patient', uhid: 'SAMPLE-001', age: 30, gender: 'Male', contactNumber: '+91 99999 00000' },
      date: new Date().toISOString(),
      tokenNo: 'OP-01',
      visitType: 'General OPD',
      diagnosis: ['Sample Clinical Diagnosis'],
      prescription: [
        { medicineName: 'Sample Medication 500mg', dosage: '500mg', frequency: '1-0-1', duration: '5 Days', food: 'After Food' }
      ],
      advice: ['Sample Advice & Instructions'],
      followupDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      clinicalNotes: 'Sample clinical observation.'
    };

    const sampleDoctor = {
      name: 'Dr. Sample Doctor',
      doctorProfile: { qualification: 'MBBS, MD', registrationNumber: 'REG-SAMPLE-123', department: 'General Medicine' }
    };

    const normalizedConfig = {
      printMode: activeTemplate.mode || 'STANDARD',
      paper: {
        size: activeTemplate.paperSize || 'A4',
        orientation: (activeTemplate.orientation || 'Portrait').toUpperCase(),
        margin: activeTemplate.margins || 'Medium',
        scale: activeTemplate.scale || 100
      },
      calibration: activeTemplate.calibration || { topOffset: 0, leftOffset: 0, scale: 100 },
      template: activeTemplate
    };

    const html = generatePrescriptionPrintHTML(sampleConsultation, sampleDoctor, normalizedConfig);
    const win = window.open('', '_blank', 'width=900,height=950');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 400);
    }
  };

  // Test Calibration Page Function
  const handlePrintCalibrationPage = () => {
    const html = generateCalibrationHTML(activeTemplate.paperSize, activeTemplate.orientation);
    const win = window.open('', '_blank', 'width=900,height=950');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 400);
    }
  };

  // Live Canvas Preview HTML (Uses normalized Phase 1 print configuration contract)
  const dummyConsult = useMemo(() => ({
    isPlaceholder: true,
    isSample: true,
    hospital: {
      name: 'Sample Multispeciality Hospital',
      address: '124 Healthcare Boulevard, Medical District',
      registrationNumber: 'REG-HOSP-2026/098',
      phone: '+91 98765 43210',
      email: 'contact@samplehospital.com'
    },
    branch: {
      name: 'City Center Main Branch',
      address: 'Plot 45, North Wing, City Center',
      phone: '+91 98765 43211'
    },
    patientId: { 
      name: 'Sample Patient Name', 
      uhid: 'UHID000001', 
      age: '35', 
      gender: 'Female', 
      contactNumber: '+91 98765 43210',
      bloodGroup: 'O+ Positive',
      place: 'City Center'
    },
    date: new Date().toLocaleDateString('en-GB'),
    tokenNo: 'OP-01',
    visitType: 'General OPD',
    appointmentTime: '10:30 AM',
    chiefComplaint: 'Fever, Cough, Bodyache for 2 days',
    diagnosis: ['Viral Upper Respiratory Infection'],
    clinicalNotes: 'Mild throat congestion observed upon examination.',
    allergies: 'No known drug allergies',
    prescription: [
      { 
        medicineName: 'Paracetamol 500mg Tablet', 
        dosage: '500mg', 
        frequency: '1-0-1', 
        duration: '5 Days', 
        food: 'After Food',
        quantity: '10 Tablets',
        instructions: 'Take after meals with warm water' 
      },
      { 
        medicineName: 'Cetirizine 10mg Tablet', 
        dosage: '10mg', 
        frequency: '0-0-1', 
        duration: '5 Days', 
        food: 'After Food',
        quantity: '5 Tablets',
        instructions: 'Take at bedtime' 
      }
    ],
    advice: ['Drink plenty of warm fluids', 'Bed rest for 3 days'],
    followupDate: new Date(Date.now() + 5 * 86400000).toLocaleDateString('en-GB')
  }), []);

  const dummyDoctor = useMemo(() => ({
    name: 'Dr. Sample Physician',
    doctorProfile: { 
      qualification: 'MBBS, MD (General Medicine)', 
      registrationNumber: 'REG-TNMC/2026/45879',
      department: 'Internal Medicine'
    }
  }), []);
  
  const livePreviewHTML = useMemo(() => {
    const liveNormalizedConfig = {
      isPlaceholder: true,
      printMode: activeTemplate.mode || 'STANDARD',
      paper: {
        size: activeTemplate.paperSize || 'A4',
        orientation: (activeTemplate.orientation || 'Portrait').toUpperCase(),
        margin: activeTemplate.margins || 'Medium',
        scale: activeTemplate.scale || 100
      },
      calibration: activeTemplate.calibration || { topOffset: 0, leftOffset: 0, scale: 100 },
      template: {
        ...activeTemplate,
        isPlaceholder: true
      }
    };
    return generatePrescriptionPrintHTML(dummyConsult, dummyDoctor, liveNormalizedConfig);
  }, [activeTemplate, dummyConsult, dummyDoctor]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3 font-sans text-slate-500">
        <div className="w-8 h-8 border-3 border-[#3563F6] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-extrabold tracking-wider uppercase text-slate-600">Loading Prescription Print Setup...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-[1600px] mx-auto pb-16 font-sans">
      
      {/* ========================================== */}
      {/* 1. PAGE HEADER */}
      {/* ========================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#3563F6] uppercase tracking-wider mb-1">
            <Printer className="w-4 h-4" />
            Hospital Administration & Settings
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Prescription Print Setup</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Configure how prescriptions are generated and printed for your hospital. Supports pre-printed pads & VillZone standard.
          </p>

        </div>

        <div className="flex items-center gap-3">
          {/* Save Status Indicator */}
          <span className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${
            saveStatus === 'Saved ✓' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            saveStatus === 'Saving...' ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
            saveStatus === 'Unsaved Changes' ? 'bg-amber-50 text-amber-800 border-amber-300' :
            'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            {saveStatus}
          </span>

          <Button
            onClick={handleSaveConfiguration}
            variant="primary"
            loading={saving}
            className="bg-[#3563F6] hover:bg-blue-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </Button>
        </div>
      </div>

      {/* Template Switcher & Version Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-[#3563F6]" />
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block">Active Template</label>
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="text"
                value={activeTemplate.name || ''}
                onChange={e => handleUpdateTemplate({ name: e.target.value })}
                className="font-extrabold text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#3563F6]"
              />
              <span className="text-[10px] font-extrabold bg-blue-100 text-[#3563F6] px-2 py-0.5 rounded-md border border-blue-200">
                Version {activeTemplate.version || 1} ● Active
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestPrint}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#3563F6]" /> Test Print
          </button>
          <button
            type="button"
            onClick={() => setShowEditorModal(true)}
            className="bg-[#3563F6] hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Open Template Editor
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* 2. PRINTING MODE SELECTOR */}
      {/* ========================================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 font-sans">
        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-[#3563F6]">PRINTING MODE</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Choose between standard digital prescription generation or your hospital's stationery pad.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: VillZone Standard */}
          <div
            onClick={() => handleUpdateTemplate({ mode: 'STANDARD' })}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              activeTemplate.mode === 'STANDARD' 
                ? 'border-[#3563F6] bg-blue-50/40 shadow-xs' 
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3563F6]" /> VillZone Standard Prescription
              </span>
              <input 
                type="radio" 
                name="printMode" 
                checked={activeTemplate.mode === 'STANDARD'} 
                onChange={() => handleUpdateTemplate({ mode: 'STANDARD' })} 
                className="w-4 h-4 text-[#3563F6]" 
              />
            </div>
            <p className="text-xs text-slate-600 font-normal mt-2 leading-relaxed">
              VillZone generates the complete prescription layout including hospital branding, patient information, clinical information, medicines and doctor details.
            </p>
          </div>

          {/* Option 2: Hospital Pre-Printed Pad */}
          <div
            onClick={() => {
              handleUpdateTemplate(prev => ({
                ...prev,
                mode: 'PRE_PRINTED',
                fieldMappings: prev.fieldMappings && prev.fieldMappings.length > 0 ? prev.fieldMappings : [
                  { fieldKey: 'patientName', fieldName: 'Patient Name', section: 'PATIENT', x: 25, y: 35, width: 70, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
                  { fieldKey: 'uhid', fieldName: 'UHID', section: 'PATIENT', x: 120, y: 35, width: 40, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#2f63f2', visible: true },
                  { fieldKey: 'date', fieldName: 'Consult Date', section: 'VISIT', x: 165, y: 35, width: 35, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true },
                  { fieldKey: 'diagnosis', fieldName: 'Diagnosis', section: 'CLINICAL', x: 25, y: 55, width: 150, height: 12, fontSize: 12, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
                  { fieldKey: 'doctorName', fieldName: 'Doctor Name', section: 'DOCTOR', x: 130, y: 240, width: 60, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true }
                ],
                medicineTableConfig: prev.medicineTableConfig?.x ? prev.medicineTableConfig : {
                  x: 25, y: 80, width: 160, height: 100,
                  columns: {
                    medicineName: { visible: true, label: 'Medicine Name', width: 35 },
                    dosage: { visible: true, label: 'Dosage', width: 15 },
                    frequency: { visible: true, label: 'Frequency', width: 15 },
                    duration: { visible: true, label: 'Duration', width: 15 },
                    foodTiming: { visible: true, label: 'Food Timing', width: 20 },
                    instructions: { visible: false, label: 'Instructions', width: 20 }
                  },
                  fontSize: 11, rowHeight: 24, showHeader: true, maxRows: 10, showLines: true
                }
              }));
            }}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              activeTemplate.mode === 'PRE_PRINTED' 
                ? 'border-[#3563F6] bg-blue-50/40 shadow-xs' 
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#3563F6]" /> Hospital Pre-Printed Pad
              </span>
              <input 
                type="radio" 
                name="printMode" 
                checked={activeTemplate.mode === 'PRE_PRINTED'} 
                onChange={() => {
                  handleUpdateTemplate(prev => ({
                    ...prev,
                    mode: 'PRE_PRINTED',
                    fieldMappings: prev.fieldMappings && prev.fieldMappings.length > 0 ? prev.fieldMappings : [
                      { fieldKey: 'patientName', fieldName: 'Patient Name', section: 'PATIENT', x: 25, y: 35, width: 70, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
                      { fieldKey: 'uhid', fieldName: 'UHID', section: 'PATIENT', x: 120, y: 35, width: 40, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'left', color: '#2f63f2', visible: true },
                      { fieldKey: 'date', fieldName: 'Consult Date', section: 'VISIT', x: 165, y: 35, width: 35, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true },
                      { fieldKey: 'diagnosis', fieldName: 'Diagnosis', section: 'CLINICAL', x: 25, y: 55, width: 150, height: 12, fontSize: 12, fontWeight: 'bold', alignment: 'left', color: '#0f172a', visible: true },
                      { fieldKey: 'doctorName', fieldName: 'Doctor Name', section: 'DOCTOR', x: 130, y: 240, width: 60, height: 8, fontSize: 11, fontWeight: 'bold', alignment: 'right', color: '#0f172a', visible: true }
                    ],
                    medicineTableConfig: prev.medicineTableConfig?.x ? prev.medicineTableConfig : {
                      x: 25, y: 80, width: 160, height: 100,
                      columns: {
                        medicineName: { visible: true, label: 'Medicine Name', width: 35 },
                        dosage: { visible: true, label: 'Dosage', width: 15 },
                        frequency: { visible: true, label: 'Frequency', width: 15 },
                        duration: { visible: true, label: 'Duration', width: 15 },
                        foodTiming: { visible: true, label: 'Food Timing', width: 20 },
                        instructions: { visible: false, label: 'Instructions', width: 20 }
                      },
                      fontSize: 11, rowHeight: 24, showHeader: true, maxRows: 10, showLines: true
                    }
                  }));
                }} 
                className="w-4 h-4 text-[#3563F6]" 
              />
            </div>
            <p className="text-xs text-slate-600 font-normal mt-2 leading-relaxed">
              Use the hospital's existing prescription stationery as the background and overlay digital patient, diagnosis, medicine and doctor information.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 3. HOSPITAL PRE-PRINTED PAD UPLOAD (Mode === PRE_PRINTED) */}
      {/* ========================================== */}
      {activeTemplate.mode === 'PRE_PRINTED' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#3563F6]" /> Hospital Prescription Pad Background
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Upload the prescription stationery already used by your hospital. VillZone will use it as the print background.
            </p>
          </div>

          {!activeTemplate.backgroundFile ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
              }}
              className="border-2 border-dashed border-slate-300 hover:border-[#3563F6] rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/30 transition-all space-y-2"
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="font-extrabold text-sm text-slate-800">Upload Prescription Pad</div>
              <div className="text-xs text-slate-500">Drag & drop or Browse file (High-resolution PNG or JPG recommended for best print alignment)</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">PNG, JPG, JPEG, PDF • Maximum 10 MB</div>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf" 
                className="hidden" 
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} 
              />
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-14 bg-white border border-slate-300 rounded-lg flex items-center justify-center font-bold text-[10px] text-[#3563F6] shadow-2xs overflow-hidden">
                  {activeTemplate.backgroundFileType?.includes('pdf') ? 'PDF' : <img src={activeTemplate.backgroundFile} className="w-full h-full object-cover" alt="Pad" />}
                </div>
                <div className="text-xs">
                  <div className="font-extrabold text-slate-900">{activeTemplate.backgroundFileName || 'PrescriptionPad_Background'}</div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                    Size: {(activeTemplate.backgroundFileSize / (1024 * 1024)).toFixed(2)} MB • Dimensions: {activeTemplate.paperSize || 'A4'} ({activeTemplate.orientation || 'Portrait'})
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white border border-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateTemplate({ backgroundFile: '', backgroundFileName: '', backgroundFileSize: 0 })}
                  className="bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Remove
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* 4. PAPER SETTINGS & PRINT CALIBRATION */}
      {/* ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Paper & Dimensions (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-[#3563F6]" /> Paper & Print Settings
          </h3>

          <div className="grid grid-cols-2 gap-4 text-xs font-medium">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Paper Size</label>
              <select 
                value={activeTemplate.paperSize || 'A4'} 
                onChange={e => handleUpdateTemplate({ paperSize: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl mt-1 font-bold bg-white"
              >
                <option value="A4">A4 (210 x 297 mm)</option>
                <option value="A5">A5 (148 x 210 mm)</option>
                <option value="Letter">Letter (216 x 279 mm)</option>
                <option value="Custom">Custom Dimensions</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Orientation</label>
              <select 
                value={activeTemplate.orientation || 'Portrait'} 
                onChange={e => handleUpdateTemplate({ orientation: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl mt-1 font-bold bg-white"
              >
                <option value="Portrait">Portrait</option>
                <option value="Landscape">Landscape</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Margins</label>
              <select 
                value={activeTemplate.margins || 'Medium'} 
                onChange={e => handleUpdateTemplate({ margins: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl mt-1 font-bold bg-white"
              >
                <option value="None">None (0 mm)</option>
                <option value="Small">Small (8 mm)</option>
                <option value="Medium">Medium (15 mm)</option>
                <option value="Large">Large (25 mm)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Scale %</label>
              <input 
                type="number" 
                value={activeTemplate.scale ?? 100} 
                onChange={e => handleUpdateTemplate({ scale: parseInt(e.target.value) || 100 })}
                className="w-full p-2 border border-slate-200 rounded-xl mt-1 font-bold"
              />
            </div>
          </div>
        </div>

        {/* Print Calibration (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#3563F6]" /> Print Hardware Calibration
            </h3>
            <button
              type="button"
              onClick={handlePrintCalibrationPage}
              className="text-[11px] font-extrabold text-[#3563F6] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Print Calibration Page
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Top Offset (mm)</label>
              <div className="flex items-center gap-1 mt-1">
                <button type="button" onClick={() => handleUpdateTemplate(prev => ({ calibration: { ...prev.calibration, topOffset: prev.calibration.topOffset - 1 } }))} className="w-7 h-7 bg-slate-100 rounded-lg font-bold text-slate-700 cursor-pointer">-</button>
                <input type="number" value={activeTemplate.calibration.topOffset} onChange={e => handleUpdateTemplate(prev => ({ calibration: { ...prev.calibration, topOffset: parseInt(e.target.value) || 0 } }))} className="w-full p-1 text-center font-extrabold border border-slate-200 rounded-lg" />
                <button type="button" onClick={() => handleUpdateTemplate(prev => ({ calibration: { ...prev.calibration, topOffset: prev.calibration.topOffset + 1 } }))} className="w-7 h-7 bg-slate-100 rounded-lg font-bold text-slate-700 cursor-pointer">+</button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Left Offset (mm)</label>
              <div className="flex items-center gap-1 mt-1">
                <button type="button" onClick={() => handleUpdateTemplate(prev => ({ calibration: { ...prev.calibration, leftOffset: prev.calibration.leftOffset - 1 } }))} className="w-7 h-7 bg-slate-100 rounded-lg font-bold text-slate-700 cursor-pointer">-</button>
                <input type="number" value={activeTemplate.calibration.leftOffset} onChange={e => handleUpdateTemplate(prev => ({ calibration: { ...prev.calibration, leftOffset: parseInt(e.target.value) || 0 } }))} className="w-full p-1 text-center font-extrabold border border-slate-200 rounded-lg" />
                <button type="button" onClick={() => handleUpdateTemplate(prev => ({ calibration: { ...prev.calibration, leftOffset: prev.calibration.leftOffset + 1 } }))} className="w-7 h-7 bg-slate-100 rounded-lg font-bold text-slate-700 cursor-pointer">+</button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Hardware Scale %</label>
              <div className="flex items-center gap-1 mt-1">
                <input type="number" value={activeTemplate.calibration.scale} onChange={e => handleUpdateTemplate(prev => ({ calibration: { ...prev.calibration, scale: parseInt(e.target.value) || 100 } }))} className="w-full p-1 text-center font-extrabold border border-slate-200 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 5. 3-COLUMN DESKTOP TEMPLATE EDITOR / LIVE PREVIEW */}
      {/* ========================================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 font-sans">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-[#3563F6]" />
            <h3 className="text-sm font-extrabold text-slate-900">Template Editor & Live Document Preview</h3>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>Canvas Zoom:</span>
            <button type="button" onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))} className="p-1 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="font-mono">{zoomLevel}%</span>
            <button type="button" onClick={() => setZoomLevel(prev => Math.min(150, prev + 10))} className="p-1 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => setZoomLevel(100)} className="text-[10px] bg-blue-50 text-[#3563F6] px-2 py-0.5 rounded-md font-bold cursor-pointer">Fit</button>
          </div>
        </div>

        {/* 3-Column Desktop Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: FIELD LIBRARY (3 cols) */}
          <div className="lg:col-span-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3 max-h-[620px] overflow-y-auto">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest block">FIELD LIBRARY</span>
            <p className="text-[11px] text-slate-500 font-medium">Click to add/overlay dynamic clinical fields onto your prescription pad.</p>

            {['HOSPITAL', ...(billingSettings?.featureModules?.Branches ? ['BRANCH'] : []), 'PATIENT', 'VISIT', 'CLINICAL', 'DOCTOR', 'PRESCRIPTION'].map(sec => (
              <div key={sec} className="space-y-1.5 pt-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">{sec} FIELDS</span>
                <div className="space-y-1">
                  {AVAILABLE_FIELDS.filter(f => f.section === sec).map(f => {
                    const isAdded = f.fieldKey === 'medicineTable' 
                      ? (activeTemplate?.medicineTableConfig?.visible !== false)
                      : (activeTemplate?.fieldMappings || []).some(m => m.fieldKey === f.fieldKey && m.visible !== false);
                    return (
                      <button
                        key={f.fieldKey}
                        type="button"
                        onClick={() => {
                          handleAddFieldToCanvas(f);
                          if (f.fieldKey !== 'medicineTable') {
                            setSelectedFieldKey(f.fieldKey);
                          }
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all cursor-pointer ${
                          isAdded 
                            ? 'bg-blue-50 border-blue-200 text-[#3563F6]' 
                            : 'bg-white border-slate-200 text-slate-700 hover:border-[#3563F6]/50'
                        }`}
                      >
                        <span className="truncate">{f.fieldName}</span>
                        {isAdded ? <Check className="w-3.5 h-3.5 text-[#3563F6] shrink-0" /> : <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* CENTER: PRESCRIPTION CANVAS (6 cols) */}
          <div className="lg:col-span-6 border border-slate-200 rounded-xl bg-slate-100 overflow-auto max-h-[620px] relative flex flex-col items-center p-3 shadow-inner">
            <div className="sticky top-2 left-2 self-start z-20 bg-indigo-600/90 text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-md flex items-center gap-1.5 backdrop-blur-xs pointer-events-none mb-2">
              <Sparkles className="w-3 h-3" /> DYNAMIC PREVIEW — DESIGN MODE
            </div>
            <div 
              className="w-full bg-white shadow-xl relative overflow-hidden transition-all origin-top-left rounded-sm border border-slate-300 min-h-[842px]"
              style={{ transform: `scale(${zoomLevel / 100})`, width: '100%', minHeight: '842px' }}
            >
              <iframe
                key={JSON.stringify(activeTemplate)}
                title="Interactive Canvas Live Preview"
                srcDoc={livePreviewHTML}
                className="w-full h-[842px] border-none"
              />
            </div>
          </div>

          {/* RIGHT: FIELD PROPERTIES INSPECTOR (3 cols) */}
          <div className="lg:col-span-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-4 max-h-[620px] overflow-y-auto font-sans">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest block">FIELD PROPERTIES</span>

            {selectedField ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2 bg-[#3563F6]/5 border border-[#3563F6]/20 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-800">Field Enabled on Canvas</span>
                  <input
                    type="checkbox"
                    checked={selectedField.visible !== false}
                    onChange={e => handleUpdateSelectedField('visible', e.target.checked)}
                    className="w-4 h-4 text-[#3563F6] rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Field Name</label>
                  <input type="text" value={selectedField.fieldName} readOnly className="w-full p-2 border border-slate-200 rounded-xl bg-slate-100 font-extrabold text-slate-800" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Position X (mm)</label>
                    <input type="number" value={selectedField.x} onChange={e => handleUpdateSelectedField('x', parseInt(e.target.value) || 0)} className="w-full p-1.5 border border-slate-200 rounded-xl font-bold bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Position Y (mm)</label>
                    <input type="number" value={selectedField.y} onChange={e => handleUpdateSelectedField('y', parseInt(e.target.value) || 0)} className="w-full p-1.5 border border-slate-200 rounded-xl font-bold bg-white" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Width (mm)</label>
                    <input type="number" value={selectedField.width} onChange={e => handleUpdateSelectedField('width', parseInt(e.target.value) || 0)} className="w-full p-1.5 border border-slate-200 rounded-xl font-bold bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Font Size (pt)</label>
                    <input type="number" value={selectedField.fontSize} onChange={e => handleUpdateSelectedField('fontSize', parseInt(e.target.value) || 12)} className="w-full p-1.5 border border-slate-200 rounded-xl font-bold bg-white" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Font Weight</label>
                    <select value={selectedField.fontWeight} onChange={e => handleUpdateSelectedField('fontWeight', e.target.value)} className="w-full p-1.5 border border-slate-200 rounded-xl font-bold bg-white">
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                      <option value="600">Semi Bold</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Alignment</label>
                    <select value={selectedField.alignment} onChange={e => handleUpdateSelectedField('alignment', e.target.value)} className="w-full p-1.5 border border-slate-200 rounded-xl font-bold bg-white">
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveField(selectedField.fieldKey)}
                  className="w-full mt-2 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs py-2 rounded-xl hover:bg-rose-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove Field
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-[#3563F6]/5 border border-[#3563F6]/20 rounded-xl space-y-3 text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-[#3563F6]/10">
                    <span className="text-[11px] font-bold text-slate-800">Field Enabled on Canvas</span>
                    <input
                      type="checkbox"
                      checked={activeTemplate?.medicineTableConfig?.visible !== false}
                      onChange={e => handleUpdateTemplate(prev => ({
                        ...prev,
                        medicineTableConfig: { ...(prev.medicineTableConfig || {}), visible: e.target.checked }
                      }))}
                      className="w-4 h-4 text-[#3563F6] rounded cursor-pointer"
                    />
                  </div>

                  <span className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wider block">Rx Medicine Table Alignment</span>
                  <p className="text-[11px] text-indigo-700">Adjust where the prescribed medications table starts on your pre-printed pad.</p>
                  
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-indigo-800 uppercase">Table Top Y (mm)</label>
                      <input 
                        type="number" 
                        value={activeTemplate?.medicineTableConfig?.y || 120} 
                        onChange={e => handleUpdateTemplate(prev => ({
                          ...prev,
                          medicineTableConfig: { ...(prev.medicineTableConfig || {}), y: parseInt(e.target.value) || 120 }
                        }))} 
                        className="w-full p-1.5 border border-indigo-200 rounded-lg font-bold bg-white text-slate-800" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-indigo-800 uppercase">Table Left X (mm)</label>
                      <input 
                        type="number" 
                        value={activeTemplate?.medicineTableConfig?.x || 20} 
                        onChange={e => handleUpdateTemplate(prev => ({
                          ...prev,
                          medicineTableConfig: { ...(prev.medicineTableConfig || {}), x: parseInt(e.target.value) || 20 }
                        }))} 
                        className="w-full p-1.5 border border-indigo-200 rounded-lg font-bold bg-white text-slate-800" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-indigo-800 uppercase">Table Width (mm)</label>
                    <input 
                      type="number" 
                      value={activeTemplate?.medicineTableConfig?.width || 170} 
                      onChange={e => handleUpdateTemplate(prev => ({
                        ...prev,
                        medicineTableConfig: { ...(prev.medicineTableConfig || {}), width: parseInt(e.target.value) || 170 }
                      }))} 
                      className="w-full p-1.5 border border-indigo-200 rounded-lg font-bold bg-white text-slate-800" 
                    />
                  </div>
                </div>

                <div className="text-center text-slate-400 py-2 text-xs font-medium">
                  Select any field from the Library on the left to fine-tune its position X, Y, font size, and alignment.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionPrintSetup;
