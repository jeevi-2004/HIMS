import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../services/api';
import Card from '../components/Card';
import Button from '../components/Button';
import Table from '../components/Table';
import Input from '../components/Input';
import Modal from '../components/Modal';
import { 
  Pill, Printer, ClipboardList, FileText, Eye, 
  AlertTriangle, ArrowLeft, Clock, Search, Filter, 
  RotateCcw, PackageCheck, Archive, Plus, Building2,
  FileBarChart2, Settings, ShoppingCart
} from 'lucide-react';

const PharmacyDashboard = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isPharmacist = user?.role === 'PHARMACIST' || user?.role === 'SUPER_ADMIN' || user?.role === 'DOCTOR_ADMIN';

  const { prescriptionId: routePrescriptionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryTab = searchParams.get('tab');
  // Determine active tab from URL query param OR route pathname
  const activeTab = useMemo(() => {
    if (queryTab) return queryTab;
    const path = location.pathname;
    if (path.includes('/pharmacy/dispense/history')) return 'history';
    if (path.includes('/pharmacy/dispense/queue') || path === '/pharmacy/dispense') return 'queue';
    if (path.includes('/pharmacy/medicine-master')) return 'medicines';
    if (path.includes('/pharmacy/stock')) return 'stock';
    if (path.includes('/pharmacy/purchase')) return 'purchase';
    if (path.includes('/pharmacy/suppliers')) return 'suppliers';
    if (path.includes('/pharmacy/reports')) return 'reports';
    if (path.includes('/pharmacy/settings')) return 'settings';
    if (path === '/pharmacy/dashboard' || path === '/pharmacy') return 'dashboard';
    return 'dashboard';
  }, [location.pathname, queryTab]);

  const queryPrescriptionId = searchParams.get('prescriptionId');
  const detailsAction = searchParams.get('action') || 'dispense';

  const prescriptionId = routePrescriptionId || queryPrescriptionId;

  // Dispensing workflow status check
  const isDispensingModule = activeTab === 'queue' || activeTab === 'history';

  const [loadingPrescriptionId, setLoadingPrescriptionId] = useState(null);

  // Filter State
  const [searchPatient, setSearchPatient] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // State for Dispensing Workspace
  const [dispenseState, setDispenseState] = useState({});
  const [generalRemarks, setGeneralRemarks] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [counselingChecklist, setCounselingChecklist] = useState({
    dosageExplained: false,
    foodTimingExplained: false,
    durationExplained: false
  });

  // Medicine Master Add Modal State
  const [isMedModalOpen, setIsMedModalOpen] = useState(false);
  const [medForm, setMedForm] = useState({ name: '', category: 'Analgesics', unitPrice: '', rackNo: '' });

  // 1. Fetch Prescriptions Queue / History
  const { data: prescriptions, isLoading: prescriptionsLoading } = useQuery({
    queryKey: ['prescriptions', activeTab],
    queryFn: async () => {
      const filterParam = activeTab === 'history' ? 'history' : 'queue';
      const res = await api.get(`/operations/pharmacy/queue?filter=${filterParam}`);
      return res.data.data;
    },
    enabled: activeTab === 'queue' || activeTab === 'history' || activeTab === 'dashboard'
  });

  // 2. Fetch Single Prescription Details (When in Dispensing Workspace)
  const { data: prescriptionDetail, isLoading: prescriptionDetailLoading } = useQuery({
    queryKey: ['prescriptionDetail', prescriptionId],
    queryFn: async () => {
      if (!prescriptionId) return null;
      const res = await api.get(`/operations/pharmacy/prescriptions/${prescriptionId}`);
      return res.data.data;
    },
    enabled: !!prescriptionId
  });

  // 3. Fetch Medicines Master Catalog
  const { data: medicines, isLoading: medicinesLoading, refetch: refetchMedicines } = useQuery({
    queryKey: ['medicinesCatalog'],
    queryFn: async () => {
      const res = await api.get('/operations/pharmacy/medicines');
      return res.data.data;
    },
    enabled: activeTab === 'medicines' || activeTab === 'stock' || activeTab === 'queue' || activeTab === 'history'
  });

  // 4. Fetch Doctors List for Filter Dropdown
  const { data: doctors } = useQuery({
    queryKey: ['doctorsList'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DOCTOR');
      return res.data.data;
    }
  });

  // Populate local dispensing workspace state when prescription details load
  useEffect(() => {
    if (prescriptionDetail) {
      setGeneralRemarks(prescriptionDetail.generalRemarks || '');
      setDeliveredBy(prescriptionDetail.deliveredBy || user?.name || '');
      if (prescriptionDetail.counselingChecklist) {
        setCounselingChecklist(prescriptionDetail.counselingChecklist);
      }
      if (prescriptionDetail.items) {
        const initialState = {};
        prescriptionDetail.items.forEach(item => {
          initialState[item._id] = {
            dispensingStatus: item.dispensingStatus || 'Dispensed',
            pharmacistNotes: item.pharmacistNotes || '',
            substituteMedicine: item.substituteMedicine || '',
            quantity: item.quantity !== undefined ? item.quantity : 1,
            morning: item.morning !== undefined ? item.morning : '0',
            afternoon: item.afternoon !== undefined ? item.afternoon : '0',
            night: item.night !== undefined ? item.night : '0',
            foodTiming: item.foodTiming || item.instructions || 'After Food',
            duration: item.duration || 'N/A'
          };
        });
        setDispenseState(initialState);
      }
    }
  }, [prescriptionDetail, user]);

  // Dispense / Update Prescription Mutation
  const dispenseMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/operations/pharmacy/dispense', payload);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['prescriptions']);
      if (variables.status === 'Dispensed') {
        toast.success('Medicines dispensed successfully! Moved to Dispensed History.');
        if (routePrescriptionId) {
          navigate('/pharmacy/dispense/history');
        } else {
          setSearchParams({ tab: 'history' });
        }
      } else {
        toast.success('Dispensing draft saved successfully.');
        if (routePrescriptionId) {
          navigate('/pharmacy/dispense/queue');
        } else {
          setSearchParams({ tab: 'queue' });
        }
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update prescription');
    }
  });

  // Add Medicine Mutation
  const addMedicineMutation = useMutation({
    mutationFn: async (newMed) => {
      const res = await api.post('/operations/pharmacy/medicines', newMed);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Medicine added to catalog successfully!');
      setIsMedModalOpen(false);
      setMedForm({ name: '', category: 'Analgesics', unitPrice: '', rackNo: '' });
      refetchMedicines();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to add medicine');
    }
  });

  const handleStartDispensing = async (id) => {
    setLoadingPrescriptionId(id);
    try {
      await api.post('/operations/pharmacy/dispense', {
        prescriptionId: id,
        status: 'Dispensing'
      });
      navigate(`/pharmacy/dispense/${id}`);
    } catch (err) {
      toast.error('Failed to start dispensing');
    } finally {
      setLoadingPrescriptionId(null);
    }
  };

  const updateItemState = (itemId, field, value) => {
    setDispenseState(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchPatient('');
    setSelectedDoctor('');
    setSelectedStatus('ALL');
    setDateFrom('');
    setDateTo('');
  };

  // Compact Summary Stat Calculations
  const summaryCounts = useMemo(() => {
    const pList = prescriptions || [];
    const mList = medicines || [];
    const pending = pList.filter(p => (p.status || 'Pending') === 'Pending').length;
    const dispensing = pList.filter(p => p.status === 'Dispensing').length;
    const dispensedToday = pList.filter(p => p.status === 'Dispensed').length;
    const lowStock = mList.filter(m => (m.stock || 0) < 50).length;
    return { pending, dispensing, dispensedToday, lowStock, totalPrescriptions: pList.length };
  }, [prescriptions, medicines]);

  // Client-Side Filtered Prescriptions
  const filteredPrescriptions = useMemo(() => {
    if (!prescriptions) return [];
    return prescriptions.filter(item => {
      // Patient Search
      if (searchPatient.trim()) {
        const q = searchPatient.toLowerCase().trim();
        const nameMatch = item.patientId?.name?.toLowerCase().includes(q);
        const uhidMatch = item.patientId?.uhid?.toLowerCase().includes(q);
        const mobileMatch = item.patientId?.mobileNumber?.includes(q);
        if (!nameMatch && !uhidMatch && !mobileMatch) return false;
      }
      // Doctor Filter
      if (selectedDoctor) {
        if (item.doctorId?._id !== selectedDoctor && item.doctorId?.name !== selectedDoctor) return false;
      }
      // Status Filter
      if (selectedStatus && selectedStatus !== 'ALL') {
        if ((item.status || 'Pending').toUpperCase() !== selectedStatus.toUpperCase()) return false;
      }
      // Date From
      if (dateFrom) {
        const itemDate = new Date(item.createdAt || item.dispensedAt).setHours(0,0,0,0);
        const fromDate = new Date(dateFrom).setHours(0,0,0,0);
        if (itemDate < fromDate) return false;
      }
      // Date To
      if (dateTo) {
        const itemDate = new Date(item.createdAt || item.dispensedAt).setHours(0,0,0,0);
        const toDate = new Date(dateTo).setHours(23,59,59,999);
        if (itemDate > toDate) return false;
      }
      return true;
    });
  }, [prescriptions, searchPatient, selectedDoctor, selectedStatus, dateFrom, dateTo]);

  // Client-Side Filtered Medicines
  const filteredMedicines = useMemo(() => {
    if (!medicines) return [];
    return medicines.filter(item => {
      if (searchPatient.trim()) {
        const q = searchPatient.toLowerCase().trim();
        const nameMatch = item.name?.toLowerCase().includes(q);
        const categoryMatch = item.category?.toLowerCase().includes(q);
        if (!nameMatch && !categoryMatch) return false;
      }
      return true;
    });
  }, [medicines, searchPatient]);

  // Status Badge Helper
  const renderBadge = (status) => {
    const st = (status || 'Pending').trim();
    let badgeStyle = 'bg-amber-50 text-amber-600 border-amber-200'; // Pending -> Orange
    
    if (st === 'Dispensing') {
      badgeStyle = 'bg-blue-50 text-blue-600 border-blue-200 animate-pulse'; // Dispensing -> Blue
    } else if (st === 'Dispensed' || st === 'In Stock') {
      badgeStyle = 'bg-emerald-50 text-emerald-600 border-emerald-200'; // Dispensed -> Green
    } else if (st === 'Cancelled' || st === 'Out of Stock') {
      badgeStyle = 'bg-rose-50 text-rose-600 border-rose-200'; // Cancelled -> Red
    } else if (st === 'Waiting Payment' || st === 'Pending Payment') {
      badgeStyle = 'bg-purple-50 text-purple-600 border-purple-200'; // Waiting Payment -> Purple
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${badgeStyle}`}>
        {st}
      </span>
    );
  };

  // Print Prescription Invoice
  const handlePrintPrescription = (rxObj) => {
    const rx = rxObj || prescriptionDetail;
    if (!rx) return;

    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Pop-up blocker is preventing print layout.');
      return;
    }

    const html = `
      <html>
        <head>
          <title>Prescription Print - OPD Pharmacy</title>
          <style>
            body { font-family: 'Poppins', Arial, sans-serif; margin: 30px; font-size: 12px; color: #333; line-height: 1.5; }
            .header { text-align: center; border-bottom: 2px solid #2F63F2; padding-bottom: 15px; margin-bottom: 20px; }
            .h-title { font-size: 20px; font-weight: bold; color: #2F63F2; text-transform: uppercase; }
            .h-sub { font-size: 11px; color: #666; }
            .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .table th { background: #f1f5f9; border-bottom: 2px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
            .table td { border-bottom: 1px solid #e2e8f0; padding: 8px; font-size: 11px; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 15px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="h-title">VILLZONE CLINIC PHARMACY</div>
            <div class="h-sub">Outpatient Medicine Dispensing Slip</div>
          </div>

          <div class="meta-grid">
            <div>
              <strong>PATIENT INFORMATION</strong><br/>
              UHID: <strong>${rx.patientId?.uhid || 'N/A'}</strong><br/>
              Name: <strong>${rx.patientId?.name || 'N/A'}</strong><br/>
              Age/Gender: ${rx.patientId?.age || 'N/A'} Yrs / ${rx.patientId?.gender || 'N/A'}<br/>
              Mobile: ${rx.patientId?.mobileNumber || 'N/A'}
            </div>
            <div style="text-align: right;">
              <strong>DISPENSING METADATA</strong><br/>
              Prescribed By: <strong>Dr. ${rx.doctorId?.name || 'N/A'}</strong><br/>
              Dispensed By: <strong>${rx.dispensedBy?.name || rx.deliveredBy || 'Pharmacist'}</strong><br/>
              Dispensed Date: <strong>${rx.dispensedAt ? new Date(rx.dispensedAt).toLocaleString() : new Date(rx.updatedAt).toLocaleString()}</strong>
            </div>
          </div>

          <div style="font-weight: bold; margin-bottom: 5px; text-transform: uppercase; font-size: 11px;">Prescribed & Dispensed Medications</div>
          <table class="table">
            <thead>
              <tr>
                <th>Medicine Name</th>
                <th style="text-align: center;">Morn</th>
                <th style="text-align: center;">Aft</th>
                <th style="text-align: center;">Night</th>
                <th>Food Timing</th>
                <th>Duration</th>
                <th style="text-align: center;">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${(rx.items || []).map(item => `
                <tr>
                  <td>
                    <strong>${item.substituteMedicine || item.medicineName}</strong>
                    ${item.substituteMedicine ? `<br/><small style="color: #666;">(Substituted for: ${item.medicineName})</small>` : ''}
                  </td>
                  <td style="text-align: center;">${item.morning || '0'}</td>
                  <td style="text-align: center;">${item.afternoon || '0'}</td>
                  <td style="text-align: center;">${item.night || '0'}</td>
                  <td>${item.foodTiming || item.instructions || 'After Food'}</td>
                  <td>${item.duration || 'N/A'}</td>
                  <td style="text-align: center;"><strong>${item.quantity || 1}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <span>Verified & Dispensed by Clinic Pharmacy</span>
            <span>Thank you for visiting. Get well soon!</span>
          </div>
        </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
      win.close();
    }, 500);
  };

  // Print Medicine Dose Labels
  const handlePrintLabel = (rxObj) => {
    const rx = rxObj || prescriptionDetail;
    if (!rx) return;

    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Pop-up blocker is preventing print layout.');
      return;
    }

    const html = `
      <html>
        <head>
          <title>Medicine Dose Label Printing</title>
          <style>
            body { font-family: 'Poppins', Arial, sans-serif; margin: 10px; width: 220px; font-size: 10px; color: #000; }
            .label-card { border: 1px solid #000; padding: 8px; border-radius: 4px; page-break-after: always; margin-bottom: 10px; }
            .title { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; }
            .med-name { font-size: 12px; font-weight: bold; margin: 4px 0; }
            .checkboxes { display: flex; gap: 8px; font-weight: bold; margin-top: 4px; font-size: 9px; }
            .footer { font-size: 8px; color: #444; border-top: 1px dotted #888; padding-top: 4px; margin-top: 6px; }
          </style>
        </head>
        <body>
          ${rx?.items?.map(item => {
            const food = item.foodTiming || item.instructions || 'After Food';
            const dur = item.duration || 'N/A';
            const substituteName = item.substituteMedicine || item.medicineName;

            return `
              <div class="label-card">
                <div class="title">VILLZONE CLINIC PHARMACY</div>
                <div>Patient: <strong>${rx?.patientId?.name || 'N/A'}</strong></div>
                <div class="med-name">${substituteName}</div>
                <div>Instructions: <strong>${food}</strong></div>
                <div>Duration: <strong>${dur}</strong></div>
                <div class="checkboxes">
                  <span>Morn: ${item.morning || '0'}</span>
                  <span>Aft: ${item.afternoon || '0'}</span>
                  <span>Night: ${item.night || '0'}</span>
                </div>
                <div class="footer">Keep out of reach of children.</div>
              </div>
            `;
          }).join('')}
        </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
      win.close();
    }, 500);
  };

  // Switch Tab / Route Helper
  const handleTabSwitch = (targetTab) => {
    if (targetTab === 'medicines') {
      navigate('/pharmacy/medicine-master');
    } else if (targetTab === 'stock') {
      navigate('/pharmacy/stock');
    } else if (targetTab === 'purchase') {
      navigate('/pharmacy/purchase');
    } else if (targetTab === 'suppliers') {
      navigate('/pharmacy/suppliers');
    } else if (targetTab === 'reports') {
      navigate('/pharmacy/reports');
    } else if (targetTab === 'settings') {
      navigate('/pharmacy/settings');
    } else {
      setSearchParams({ tab: targetTab });
    }
  };

  // Standalone Header Details based on active Route
  const getHeaderDetails = () => {
    switch (activeTab) {
      case 'history':
        return {
          title: '📜 Dispensed History',
          subtitle: 'Audit log of completed OPD medicine dispensations.'
        };
      case 'medicines':
        return {
          title: '💊 Medicine Master Catalog',
          subtitle: 'Manage medicine catalog, unit rates, categories, and rack locations.'
        };
      case 'stock':
        return {
          title: '📦 Stock Inventory',
          subtitle: 'Real-time stock balance tracking and alert levels.'
        };
      case 'purchase':
        return {
          title: '📥 Purchase Entry & History',
          subtitle: 'Record new stock purchases, batch numbers, and supplier invoice logs.'
        };
      case 'suppliers':
        return {
          title: '🏬 Vendor & Supplier Directory',
          subtitle: 'Manage pharmaceutical suppliers, contact records, and agreements.'
        };
      case 'reports':
        return {
          title: '📊 Pharmacy Analytics & Reports',
          subtitle: 'Dispensing logs, financial metrics, and stock valuation summaries.'
        };
      case 'settings':
        return {
          title: '⚙️ Pharmacy Settings',
          subtitle: 'Configure pharmacy preferences, print label templates, and notifications.'
        };
      case 'dashboard':
        return {
          title: '🏥 Pharmacy Overview & Operations Dashboard',
          subtitle: 'Real-time overview of prescription queues, dispensing metrics, and inventory alerts.'
        };
      case 'queue':
        return {
          title: '💊 Digital Prescription Queue',
          subtitle: "Review doctor's digital prescriptions waiting for dispensing."
        };
      default:
        return {
          title: '🏥 Pharmacy Operations',
          subtitle: 'Pharmacy management workspace.'
        };
    }
  };

  const { title: cardTitle, subtitle: cardSubtitle } = getHeaderDetails();

  // =========================================================================================
  // RENDER: DISPENSING SCREEN (STEP 2 DETAIL MODE)
  // =========================================================================================
  const renderPrescriptionDetails = () => {
    if (prescriptionDetailLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Clock className="w-12 h-12 text-[#2F63F2] animate-spin" />
          <p className="text-sm font-bold text-[#6B7280]">Loading prescription details...</p>
        </div>
      );
    }

    if (!prescriptionDetail) {
      return (
        <Card title="Prescription Details" subtitle="Error loading prescription">
          <div className="p-8 text-center text-[#6B7280] font-bold">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <p>Prescription record not found or could not be retrieved.</p>
            <Button onClick={() => handleTabSwitch('queue')} variant="secondary" className="mt-4 h-[40px]">
              Back to Queue
            </Button>
          </div>
        </Card>
      );
    }

    const { patientId: patient, doctorId: doctor, consultationId: consultation } = prescriptionDetail;

    const handleDispenseAction = (actionType) => {
      if (!isPharmacist) {
        toast.error("Access Denied: Only pharmacists or administrators can edit and dispense prescriptions.");
        return;
      }

      const itemsPayload = prescriptionDetail.items.map(item => {
        const state = dispenseState[item._id] || {};
        return {
          _id: item._id,
          dispensingStatus: state.dispensingStatus || 'Dispensed',
          pharmacistNotes: state.pharmacistNotes || '',
          substituteMedicine: state.substituteMedicine || item.substituteMedicine || '',
          quantity: parseInt(state.quantity !== undefined ? state.quantity : item.quantity || 1),
          morning: state.morning !== undefined ? state.morning : item.morning || '0',
          afternoon: state.afternoon !== undefined ? state.afternoon : item.afternoon || '0',
          night: state.night !== undefined ? state.night : item.night || '0',
          foodTiming: state.foodTiming || item.foodTiming || item.instructions || 'After Food',
          duration: state.duration || item.duration || 'N/A'
        };
      });

      if (actionType === 'draft') {
        dispenseMutation.mutate({
          prescriptionId: prescriptionDetail._id,
          patientId: patient?._id,
          status: 'Dispensing',
          items: itemsPayload,
          generalRemarks,
          deliveredBy,
          counselingChecklist
        });
        return;
      }

      dispenseMutation.mutate({
        prescriptionId: prescriptionDetail._id,
        patientId: patient?._id,
        status: 'Dispensed',
        items: itemsPayload,
        generalRemarks,
        deliveredBy,
        counselingChecklist
      });
    };

    const isDispenseMode = detailsAction === 'dispense' && prescriptionDetail.status !== 'Dispensed';

    return (
      <div className="space-y-4 sm:space-y-5 text-left max-w-6xl mx-auto pb-10 px-4 sm:px-5 md:px-6 lg:px-7 py-4 sm:py-5 md:py-6">
        {/* Back and Title Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleTabSwitch('queue')}
              className="p-2 rounded-xl hover:bg-slate-100 border border-[#E5E7EB] transition-colors text-[#6B7280] hover:text-[#111827]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-[#111827] flex items-center gap-2">
                {isDispenseMode ? '💊 Pharmacy Dispensing Desk' : '👁️ View Prescription Details'}
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5 font-medium">Medicine verification and dispensing for OPD clinics.</p>
            </div>
          </div>
          {renderBadge(prescriptionDetail.status)}
        </div>

        {/* 1. Patient & Doctor Details Card */}
        <Card title="👤 Patient Demographics & Doctor Info" subtitle="Patient and clinical metadata verification.">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3.5 p-1 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Patient ID</span>
              <span className="font-bold font-mono text-[#2F63F2]">{patient?.uhid || 'N/A'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Patient Name</span>
              <span className="font-bold text-[#111827]">{patient?.name || 'N/A'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Age / Gender</span>
              <span className="font-bold text-slate-700">{patient?.age ? `${patient.age} Yrs` : 'N/A'} / {patient?.gender || 'N/A'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Mobile Number</span>
              <span className="font-bold font-mono text-slate-700">{patient?.mobileNumber || 'N/A'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Token Number</span>
              <span className="font-bold text-[#2F63F2] text-xs font-mono bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-0.5 w-max">
                #{consultation?.appointmentId?.tokenNumber || 'N/A'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Doctor Name</span>
              <span className="font-bold text-[#111827]">Dr. {doctor?.name || 'N/A'}</span>
            </div>
            <div className="flex flex-col gap-0.5 md:col-span-2">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Diagnosis & Clinical Notes</span>
              <span className="font-bold text-[#111827] bg-slate-50 border border-[#E5E7EB] rounded-xl px-3 py-1 text-xs block">
                {consultation?.diagnosis || 'General OPD Consultation'}
              </span>
            </div>
          </div>
        </Card>

        {/* 2. Prescribed Medications Table */}
        <Card title="🩺 Prescribed Medications Workspace" subtitle="Verify dosage, quantities, and specify substitute medicines if required.">
          <div className="overflow-x-auto border border-[#E5E7EB] rounded-[14px] bg-white shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-[#E5E7EB] text-[#6B7280] text-[10px] font-bold uppercase tracking-wider">
                  <th className="p-3.5">Medicine Name</th>
                  <th className="p-3.5 text-center">Morning</th>
                  <th className="p-3.5 text-center">Afternoon</th>
                  <th className="p-3.5 text-center">Night</th>
                  <th className="p-3.5">Food Timing</th>
                  <th className="p-3.5">Duration</th>
                  <th className="p-3.5 w-32">Quantity</th>
                  <th className="p-3.5">Substitute Medicine</th>
                  <th className="p-3.5 w-52">Pharmacist Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs text-[#111827] font-medium">
                {prescriptionDetail.items?.map((item) => {
                  const itemState = dispenseState[item._id] || { 
                    dispensingStatus: 'Dispensed', 
                    pharmacistNotes: '', 
                    substituteMedicine: '', 
                    quantity: item.quantity,
                    morning: item.morning || '0',
                    afternoon: item.afternoon || '0',
                    night: item.night || '0',
                    foodTiming: item.foodTiming || item.instructions || 'After Food',
                    duration: item.duration || 'N/A'
                  };

                  return (
                    <tr key={item._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 align-top">
                        <span className="font-bold text-[#111827] block">{item.medicineName}</span>
                      </td>

                      {/* Dosage inputs */}
                      <td className="p-3.5 text-center align-top">
                        {isDispenseMode ? (
                          <input
                            type="text"
                            className="enterprise-input text-center py-1 px-1 text-xs w-12 h-[36px]"
                            value={itemState.morning}
                            onChange={(e) => updateItemState(item._id, 'morning', e.target.value)}
                          />
                        ) : (
                          <span>{itemState.morning}</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center align-top">
                        {isDispenseMode ? (
                          <input
                            type="text"
                            className="enterprise-input text-center py-1 px-1 text-xs w-12 h-[36px]"
                            value={itemState.afternoon}
                            onChange={(e) => updateItemState(item._id, 'afternoon', e.target.value)}
                          />
                        ) : (
                          <span>{itemState.afternoon}</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center align-top">
                        {isDispenseMode ? (
                          <input
                            type="text"
                            className="enterprise-input text-center py-1 px-1 text-xs w-12 h-[36px]"
                            value={itemState.night}
                            onChange={(e) => updateItemState(item._id, 'night', e.target.value)}
                          />
                        ) : (
                          <span>{itemState.night}</span>
                        )}
                      </td>

                      <td className="p-3.5 align-top">
                        {isDispenseMode ? (
                          <select
                            className="enterprise-input py-1 px-2 text-xs h-[36px]"
                            value={itemState.foodTiming}
                            onChange={(e) => updateItemState(item._id, 'foodTiming', e.target.value)}
                          >
                            <option value="After Food">After Food</option>
                            <option value="Before Food">Before Food</option>
                            <option value="With Food">With Food</option>
                          </select>
                        ) : (
                          <span>{itemState.foodTiming}</span>
                        )}
                      </td>

                      <td className="p-3.5 align-top">
                        {isDispenseMode ? (
                          <input
                            type="text"
                            className="enterprise-input py-1 px-2 text-xs w-20 h-[36px]"
                            value={itemState.duration}
                            onChange={(e) => updateItemState(item._id, 'duration', e.target.value)}
                          />
                        ) : (
                          <span>{itemState.duration}</span>
                        )}
                      </td>

                      {/* Quantity input */}
                      <td className="p-3.5 align-top">
                        {isDispenseMode ? (
                          <input
                            type="number"
                            min="1"
                            className="enterprise-input py-1 px-2 text-xs w-20 h-[36px] font-mono font-bold"
                            value={itemState.quantity}
                            onChange={(e) => updateItemState(item._id, 'quantity', e.target.value)}
                          />
                        ) : (
                          <span className="font-bold text-[#111827]">{itemState.quantity}</span>
                        )}
                      </td>

                      {/* Substitute Medicine */}
                      <td className="p-3.5 align-top">
                        {isDispenseMode ? (
                          <input
                            type="text"
                            placeholder="Add substitute..."
                            className="enterprise-input py-1 px-2 text-xs w-full h-[36px]"
                            value={itemState.substituteMedicine}
                            onChange={(e) => updateItemState(item._id, 'substituteMedicine', e.target.value)}
                          />
                        ) : (
                          <span>{itemState.substituteMedicine || '-'}</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="p-3.5 align-top">
                        {isDispenseMode ? (
                          <input
                            type="text"
                            placeholder="Pharmacist notes..."
                            className="enterprise-input py-1 px-2 text-xs w-full h-[36px]"
                            value={itemState.pharmacistNotes}
                            onChange={(e) => updateItemState(item._id, 'pharmacistNotes', e.target.value)}
                          />
                        ) : (
                          <span className="text-[#6B7280] italic">{itemState.pharmacistNotes || '-'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 3. Remarks & Counseling Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card title="📝 General Remarks & Delivered By" subtitle="Audit log fields.">
            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#6B7280] uppercase text-[10px] tracking-wider">General Remarks</label>
                <textarea
                  className="enterprise-input w-full p-2.5 h-20 text-xs"
                  placeholder="Enter notes on general prescription observations, substitutes selected, etc."
                  value={generalRemarks}
                  onChange={(e) => setGeneralRemarks(e.target.value)}
                  disabled={!isDispenseMode}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#6B7280] uppercase text-[10px] tracking-wider">Delivered By</label>
                <input
                  type="text"
                  className="enterprise-input w-full text-xs h-[40px]"
                  placeholder="Enter pharmacist name"
                  value={deliveredBy}
                  onChange={(e) => setDeliveredBy(e.target.value)}
                  disabled={!isDispenseMode}
                />
              </div>
            </div>
          </Card>

          <Card title="📋 Patient Counseling Checklist" subtitle="OPD clinic checkoff.">
            <div className="space-y-3.5 py-1">
              <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Confirm explaining instructions to patient:</p>
              <div className="space-y-3 text-xs text-slate-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 border border-[#E5E7EB] rounded focus:ring-[#2F63F2] text-[#2F63F2]"
                    checked={counselingChecklist.dosageExplained}
                    onChange={(e) => setCounselingChecklist(prev => ({ ...prev, dosageExplained: e.target.checked }))}
                    disabled={!isDispenseMode}
                  />
                  <span className="font-semibold text-[#111827]">Dosage schedule explained clearly</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 border border-[#E5E7EB] rounded focus:ring-[#2F63F2] text-[#2F63F2]"
                    checked={counselingChecklist.foodTimingExplained}
                    onChange={(e) => setCounselingChecklist(prev => ({ ...prev, foodTimingExplained: e.target.checked }))}
                    disabled={!isDispenseMode}
                  />
                  <span className="font-semibold text-[#111827]">Food timing instructions explained (Before/After Food)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 border border-[#E5E7EB] rounded focus:ring-[#2F63F2] text-[#2F63F2]"
                    checked={counselingChecklist.durationExplained}
                    onChange={(e) => setCounselingChecklist(prev => ({ ...prev, durationExplained: e.target.checked }))}
                    disabled={!isDispenseMode}
                  />
                  <span className="font-semibold text-[#111827]">Duration of therapy explained</span>
                </label>
              </div>
            </div>
          </Card>
        </div>

        {/* 4. Action Buttons Footer */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 p-4 border border-[#E5E7EB] bg-white rounded-[20px] shadow-card-soft">
          <div>
            <Button
              type="button"
              onClick={() => handleTabSwitch('queue')}
              variant="secondary"
              className="text-xs font-bold uppercase tracking-wider px-5 h-[40px]"
            >
              Back
            </Button>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            {isDispenseMode && (
              <>
                <Button
                  type="button"
                  onClick={() => handleDispenseAction('draft')}
                  variant="secondary"
                  className="text-xs font-bold uppercase tracking-wider px-5 h-[40px] border-[#E5E7EB] text-[#111827]"
                  loading={dispenseMutation.isPending}
                >
                  Save Draft
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDispenseAction('complete')}
                  variant="primary"
                  className="text-xs font-bold uppercase tracking-wider px-6 h-[40px] bg-[#2F63F2] hover:bg-blue-700 text-white shadow-sm"
                  loading={dispenseMutation.isPending}
                >
                  Dispense Medicines
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (prescriptionId) {
    return renderPrescriptionDetails();
  }

  // =========================================================================================
  // MAIN PHARMACY MODULE RENDER
  // =========================================================================================
  return (
    <div className="space-y-4 sm:space-y-5 text-left px-4 sm:px-5 md:px-6 lg:px-7 py-4 sm:py-5 md:py-6 bg-[#F8FAFC] min-h-screen">
      
      {/* 1. Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-xl font-bold text-[#111827] flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2]">
              {isDispensingModule && <Pill className="w-4.5 h-4.5 sm:w-5 sm:h-5" />}
              {activeTab === 'medicines' && <Pill className="w-4.5 h-4.5 sm:w-5 sm:h-5" />}
              {activeTab === 'stock' && <Archive className="w-4.5 h-4.5 sm:w-5 sm:h-5" />}
              {activeTab === 'purchase' && <ShoppingCart className="w-4.5 h-4.5 sm:w-5 sm:h-5" />}
              {activeTab === 'suppliers' && <Building2 className="w-4.5 h-4.5 sm:w-5 sm:h-5" />}
              {activeTab === 'reports' && <FileBarChart2 className="w-4.5 h-4.5 sm:w-5 sm:h-5" />}
              {activeTab === 'settings' && <Settings className="w-4.5 h-4.5 sm:w-5 sm:h-5" />}
            </div>
            {isDispensingModule ? 'OPD Pharmacy & Dispensing' : cardTitle}
          </h1>
          <p className="text-xs text-[#6B7280] mt-0.5 font-medium">
            {isDispensingModule ? 'Manage digital prescription queue and medicine dispensing history.' : cardSubtitle}
          </p>
        </div>

        {/* CONDITIONALLY RENDER TAB NAVIGATION ONLY FOR DISPENSING WORKFLOW */}
        {isDispensingModule && (
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-[#E5E7EB] self-start lg:self-auto">
            <button
              onClick={() => handleTabSwitch('queue')}
              className={`flex items-center gap-2 px-4.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                activeTab === 'queue' 
                  ? 'bg-white text-[#2F63F2] shadow-sm border border-[#E5E7EB]' 
                  : 'text-[#6B7280] hover:text-[#111827] hover:bg-slate-200/60'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Prescription Queue
            </button>
            <button
              onClick={() => handleTabSwitch('history')}
              className={`flex items-center gap-2 px-4.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                activeTab === 'history' 
                  ? 'bg-white text-[#2F63F2] shadow-sm border border-[#E5E7EB]' 
                  : 'text-[#6B7280] hover:text-[#111827] hover:bg-slate-200/60'
              }`}
            >
              <FileText className="w-4 h-4" />
              Dispensed History
            </button>
          </div>
        )}
      </div>

      {/* 2. Compact Statistics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="bg-white border border-[#E5E7EB] rounded-[16px] px-4 py-3 shadow-card-soft hover:shadow-md transition-all duration-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Pending Prescriptions</p>
            <h3 className="text-xl font-bold text-[#111827] mt-0.5">{summaryCounts.pending}</h3>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Clock className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-[16px] px-4 py-3 shadow-card-soft hover:shadow-md transition-all duration-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Dispensing</p>
            <h3 className="text-xl font-bold text-[#111827] mt-0.5">{summaryCounts.dispensing}</h3>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2F63F2]">
            <Pill className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-[16px] px-4 py-3 shadow-card-soft hover:shadow-md transition-all duration-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Dispensed Today</p>
            <h3 className="text-xl font-bold text-[#111827] mt-0.5">{summaryCounts.dispensedToday}</h3>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <PackageCheck className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-[16px] px-4 py-3 shadow-card-soft hover:shadow-md transition-all duration-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Low Stock Medicines</p>
            <h3 className="text-xl font-bold text-[#111827] mt-0.5">{summaryCounts.lowStock}</h3>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>

      {/* 3. Section Title & Subtitle (Shown inside dispensing module for Queue/History) */}
      {isDispensingModule && (
        <div className="pt-1 pb-0.5">
          <h2 className="text-base sm:text-lg font-bold text-[#111827] flex items-center gap-2">
            {cardTitle}
          </h2>
          <p className="text-xs text-[#6B7280] font-medium mt-0.5">
            {cardSubtitle}
          </p>
        </div>
      )}

      {/* 4. Dedicated Page Content Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-4 sm:p-[18px] shadow-card-soft space-y-4">
        {/* ========================================================================= */}
        {/* ROUTE 0: MAIN PHARMACY OVERVIEW DASHBOARD */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            {/* Quick Actions Shortcuts Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => navigate(ROUTES.PHARMACY.DISPENSE)}
                className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl hover:bg-blue-100/70 transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-[#2F63F2] text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <Pill className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-[#111827]">Dispense Desk</h4>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">Serve pending prescriptions</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/pharmacy/medicine-master')}
                className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl hover:bg-emerald-100/70 transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <Archive className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-[#111827]">Medicine Catalog</h4>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">Manage rates & stock levels</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/pharmacy/purchase')}
                className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl hover:bg-amber-100/70 transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-[#111827]">Stock Purchase Entry</h4>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">Record incoming stock</p>
              </button>

              <button
                type="button"
                onClick={() => navigate(ROUTES.PHARMACY.REPORTS)}
                className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl hover:bg-purple-100/70 transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <FileBarChart2 className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-[#111827]">Pharmacy Reports</h4>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">Sales & dispensing audit</p>
              </button>
            </div>

            {/* Live Queue Overview Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#111827]">⏳ Active Prescription Queue Summary</h3>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.PHARMACY.DISPENSE)}
                  className="text-xs font-extrabold text-[#2F63F2] hover:underline"
                >
                  View Full Dispense Desk →
                </button>
              </div>

              <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
                <Table
                  headers={[
                    { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold text-[#2F63F2] font-mono">{row.patientId?.uhid || 'N/A'}</span> },
                    { key: 'patientId.name', label: 'Patient Name', render: (row) => <span className="font-bold text-[#111827]">{row.patientId?.name || 'N/A'}</span> },
                    { key: 'doctorId.name', label: 'Doctor', render: (row) => <span className="font-semibold text-slate-700">Dr. {row.doctorId?.name || 'N/A'}</span> },
                    { key: 'createdAt', label: 'Consultation Time', render: (row) => <span className="font-mono text-slate-600">{new Date(row.createdAt).toLocaleString()}</span> },
                    { key: 'status', label: 'Status', render: (row) => renderBadge(row.status || 'Pending') },
                    {
                      key: 'actionButton',
                      label: 'Action',
                      render: (row) => (
                        <button
                          type="button"
                          onClick={() => navigate(`${ROUTES.PHARMACY.DISPENSE}/${row._id}`)}
                          className="h-[34px] px-3 rounded-lg text-xs font-bold bg-[#2F63F2] text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Pill className="w-3.5 h-3.5" />
                          Serve
                        </button>
                      )
                    }
                  ]}
                  data={prescriptions?.slice(0, 5) || []}
                  loading={prescriptionsLoading}
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 1: PRESCRIPTION QUEUE PAGE */}
        {/* ========================================================================= */}
        {activeTab === 'queue' && (
          <>
            {/* Queue Filters */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Search Patient</label>
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none z-10" />
                    <input
                      type="text"
                      placeholder="Patient Name, UHID, Mobile..."
                      className="enterprise-input w-full h-[40px] text-xs font-medium"
                      style={{ paddingLeft: '2.5rem' }}
                      value={searchPatient}
                      onChange={(e) => setSearchPatient(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Doctor</label>
                  <select
                    className="enterprise-input w-full h-[40px] text-xs font-medium cursor-pointer"
                    value={selectedDoctor}
                    onChange={(e) => setSelectedDoctor(e.target.value)}
                  >
                    <option value="">All Doctors</option>
                    {doctors?.map(doc => (
                      <option key={doc._id} value={doc._id}>Dr. {doc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Status</label>
                  <select
                    className="enterprise-input w-full h-[40px] text-xs font-medium cursor-pointer"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Dispensing">Dispensing</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Date From</label>
                    <input
                      type="date"
                      className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Date To</label>
                    <input
                      type="date"
                      className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="h-[38px] px-4 rounded-xl border border-[#E5E7EB] bg-slate-100 hover:bg-slate-200 text-[#111827] text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  type="button"
                  className="h-[38px] px-5 rounded-xl bg-[#2F63F2] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter
                </button>
              </div>
            </div>

            {/* Queue Table */}
            <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
              <Table
                headers={[
                  { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold text-[#2F63F2] font-mono">{row.patientId?.uhid || 'N/A'}</span> },
                  { key: 'patientId.name', label: 'Patient Name', sortable: true, render: (row) => <span className="font-bold text-[#111827]">{row.patientId?.name || 'N/A'}</span> },
                  { key: 'doctorId.name', label: 'Doctor', render: (row) => <span className="font-semibold text-slate-700">Dr. {row.doctorId?.name || 'N/A'}</span> },
                  { key: 'createdAt', label: 'Consultation Time', render: (row) => <span className="font-mono text-slate-600">{new Date(row.createdAt).toLocaleString()}</span> },
                  { key: 'status', label: 'Status', render: (row) => renderBadge(row.status || 'Pending') },
                  {
                    key: 'actionButton',
                    label: 'Action',
                    render: (row) => {
                      const stage = row.status || 'Pending';
                      const isPending = stage === 'Pending';
                      
                      return (
                        <button
                          onClick={() => handleStartDispensing(row._id)}
                          disabled={loadingPrescriptionId === row._id}
                          className="inline-flex items-center gap-2 px-3.5 h-[36px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#2F63F2] hover:bg-blue-700 text-white disabled:opacity-50 transition-all shadow-sm focus:outline-none"
                        >
                          {loadingPrescriptionId === row._id ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>▶ {isPending ? 'Start Dispensing' : 'Resume Dispensing'}</span>
                          )}
                        </button>
                      );
                    }
                  }
                ]}
                data={filteredPrescriptions}
                loading={prescriptionsLoading}
              />
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 2: DISPENSED HISTORY PAGE */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <>
            {/* History Filters */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Search Patient</label>
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none z-10" />
                    <input
                      type="text"
                      placeholder="Patient Name, UHID, Mobile..."
                      className="enterprise-input w-full h-[40px] text-xs font-medium"
                      style={{ paddingLeft: '2.5rem' }}
                      value={searchPatient}
                      onChange={(e) => setSearchPatient(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Doctor</label>
                  <select
                    className="enterprise-input w-full h-[40px] text-xs font-medium cursor-pointer"
                    value={selectedDoctor}
                    onChange={(e) => setSelectedDoctor(e.target.value)}
                  >
                    <option value="">All Doctors</option>
                    {doctors?.map(doc => (
                      <option key={doc._id} value={doc._id}>Dr. {doc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Status</label>
                  <select
                    className="enterprise-input w-full h-[40px] text-xs font-medium cursor-pointer"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Dispensed">Dispensed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Date From</label>
                    <input
                      type="date"
                      className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Date To</label>
                    <input
                      type="date"
                      className="enterprise-input w-full h-[40px] text-xs font-medium px-2"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="h-[38px] px-4 rounded-xl border border-[#E5E7EB] bg-slate-100 hover:bg-slate-200 text-[#111827] text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  type="button"
                  className="h-[38px] px-5 rounded-xl bg-[#2F63F2] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter
                </button>
              </div>
            </div>

            {/* History Table */}
            <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
              <Table
                headers={[
                  { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold text-[#2F63F2] font-mono">{row.patientId?.uhid || 'N/A'}</span> },
                  { key: 'patientId.name', label: 'Patient Name', sortable: true, render: (row) => <span className="font-bold text-[#111827]">{row.patientId?.name || 'N/A'}</span> },
                  { key: 'doctorId.name', label: 'Doctor', render: (row) => <span className="font-semibold text-slate-700">Dr. {row.doctorId?.name || 'N/A'}</span> },
                  { 
                    key: 'dispensedBy', 
                    label: 'Dispensed By', 
                    render: (row) => <span className="font-bold text-[#111827]">{row.dispensedBy?.name || row.deliveredBy || 'Pharmacist'}</span> 
                  },
                  { 
                    key: 'dispensedAt', 
                    label: 'Dispensed Date', 
                    render: (row) => <span className="font-mono text-slate-600">{row.dispensedAt ? new Date(row.dispensedAt).toLocaleString() : new Date(row.updatedAt).toLocaleString()}</span> 
                  },
                  { 
                    key: 'status', 
                    label: 'Status', 
                    render: (row) => renderBadge(row.status || 'Dispensed')
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    render: (row) => (
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => setSearchParams({ tab: 'history', prescriptionId: row._id, action: 'view' })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-[#111827] transition-all border border-[#E5E7EB]"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#2F63F2]" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => handlePrintPrescription(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-[#2F63F2] transition-all border border-blue-200"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Invoice</span>
                        </button>
                        <button
                          onClick={() => handlePrintLabel(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-all border border-indigo-200"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Label</span>
                        </button>
                      </div>
                    )
                  }
                ]}
                data={filteredPrescriptions}
                loading={prescriptionsLoading}
              />
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 3: MEDICINE MASTER PAGE (STANDALONE) */}
        {/* ========================================================================= */}
        {(activeTab === 'medicines' || activeTab === 'medicine-master') && (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="relative flex items-center w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search Medicine Name or Category..."
                  className="enterprise-input w-full h-[40px] text-xs font-medium"
                  style={{ paddingLeft: '2.5rem' }}
                  value={searchPatient}
                  onChange={(e) => setSearchPatient(e.target.value)}
                />
              </div>
              <Button 
                onClick={() => setIsMedModalOpen(true)} 
                variant="primary" 
                icon={Plus} 
                className="text-xs font-bold h-[40px] w-full sm:w-auto px-5 bg-[#2F63F2] hover:bg-blue-700 text-white shadow-sm"
              >
                Add Medicine
              </Button>
            </div>

            <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
              <Table
                headers={[
                  { key: 'name', label: 'Medicine Name', sortable: true, render: (row) => <span className="font-bold text-[#111827]">{row.name}</span> },
                  { key: 'category', label: 'Category', render: (row) => <span className="font-medium text-slate-600">{row.category}</span> },
                  { key: 'unitPrice', label: 'Unit Rate (₹)', render: (row) => <span className="font-mono font-bold text-slate-800">₹{(row.unitPrice || 0).toFixed(2)}</span> },
                  { key: 'stock', label: 'Available Stock', render: (row) => (
                    <span className={`font-mono font-bold ${row.stock < 50 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {row.stock} pcs
                    </span>
                  )},
                  { key: 'rackNo', label: 'Rack Location', render: (row) => <span className="font-mono text-slate-600">{row.rackNo || 'N/A'}</span> }
                ]}
                data={filteredMedicines}
                loading={medicinesLoading}
              />
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 4: STOCK INVENTORY PAGE (STANDALONE) */}
        {/* ========================================================================= */}
        {activeTab === 'stock' && (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="relative flex items-center w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Filter stock by Medicine Name..."
                  className="enterprise-input w-full h-[40px] text-xs font-medium"
                  style={{ paddingLeft: '2.5rem' }}
                  value={searchPatient}
                  onChange={(e) => setSearchPatient(e.target.value)}
                />
              </div>
              <span className="text-xs text-[#6B7280] font-medium">
                Total Catalog Items: <strong className="text-[#111827]">{medicines?.length || 0}</strong>
              </span>
            </div>

            <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white">
              <Table
                headers={[
                  { key: 'name', label: 'Medicine Name', render: (row) => <span className="font-bold text-[#111827]">{row.name}</span> },
                  { key: 'category', label: 'Category', render: (row) => <span className="font-medium text-slate-600">{row.category}</span> },
                  { key: 'stock', label: 'Current Stock', render: (row) => (
                    <span className={`font-mono font-bold ${row.stock < 50 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {row.stock} pcs
                    </span>
                  )},
                  { key: 'status', label: 'Stock Status', render: (row) => {
                    const stockStatus = row.stock === 0 ? 'Out of Stock' : row.stock < 50 ? 'Low Stock' : 'In Stock';
                    return renderBadge(stockStatus);
                  }}
                ]}
                data={filteredMedicines}
                loading={medicinesLoading}
              />
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 5: PURCHASE ENTRY PAGE (STANDALONE) */}
        {/* ========================================================================= */}
        {activeTab === 'purchase' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-[#E5E7EB] rounded-xl text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-[#111827]">New Stock Purchase Invoice Entry</h4>
                <p className="text-[#6B7280] mt-0.5">Record received batch supplies from licensed pharmaceutical vendors.</p>
              </div>
              <Button variant="primary" icon={Plus} className="text-xs font-bold h-[38px] bg-[#2F63F2]">
                New Purchase Invoice
              </Button>
            </div>
            
            <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white p-8 text-center text-[#6B7280]">
              <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-xs text-[#111827]">Purchase Entry Log</p>
              <p className="text-[11px] text-[#6B7280] mt-1">No pending purchase entry batches for the selected billing period.</p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 6: SUPPLIERS PAGE (STANDALONE) */}
        {/* ========================================================================= */}
        {activeTab === 'suppliers' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="relative flex items-center w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search Supplier or Vendor Name..."
                  className="enterprise-input w-full h-[40px] text-xs font-medium"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
              <Button variant="primary" icon={Plus} className="text-xs font-bold h-[38px] bg-[#2F63F2]">
                Add Supplier
              </Button>
            </div>

            <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white p-8 text-center text-[#6B7280]">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-xs text-[#111827]">Pharmaceutical Vendors Directory</p>
              <p className="text-[11px] text-[#6B7280] mt-1">Active vendor registrations and drug license contacts listed here.</p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 7: REPORTS PAGE (STANDALONE) */}
        {/* ========================================================================= */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="border border-[#E5E7EB] rounded-[14px] overflow-hidden bg-white p-8 text-center text-[#6B7280]">
              <FileBarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-xs text-[#111827]">Pharmacy Operational Analytics</p>
              <p className="text-[11px] text-[#6B7280] mt-1">Export daily dispensing summaries, medicine sales reports, and stock valuation audits.</p>
            </div>
          </div>
        )}



      </div>

      {/* Modal: Add Medicine */}
      <Modal isOpen={isMedModalOpen} onClose={() => setIsMedModalOpen(false)} title="Add Medicine to Catalog">
        <form onSubmit={(e) => {
          e.preventDefault();
          addMedicineMutation.mutate({
            ...medForm,
            unitPrice: parseFloat(medForm.unitPrice) || 0
          });
        }} className="space-y-4">
          <Input
            label="Medicine Name"
            value={medForm.name}
            onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
            required
          />
          <Input
            label="Category"
            value={medForm.category}
            onChange={(e) => setMedForm({ ...medForm, category: e.target.value })}
          />
          <Input
            label="Unit Rate (₹)"
            type="number"
            value={medForm.unitPrice}
            onChange={(e) => setMedForm({ ...medForm, unitPrice: e.target.value })}
            required
          />
          <Input
            label="Rack / Shelf Location"
            value={medForm.rackNo}
            onChange={(e) => setMedForm({ ...medForm, rackNo: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-4 border-t border-[#E5E7EB]">
            <Button type="button" variant="secondary" onClick={() => setIsMedModalOpen(false)} className="h-[40px]">Cancel</Button>
            <Button type="submit" variant="primary" loading={addMedicineMutation.isPending} className="h-[40px] bg-[#2F63F2]">Add Medicine</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PharmacyDashboard;
