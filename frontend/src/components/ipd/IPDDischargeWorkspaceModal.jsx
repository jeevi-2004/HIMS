import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowLeft, 
  User, 
  Calendar, 
  Phone, 
  FileText, 
  Bed, 
  Stethoscope, 
  FlaskConical, 
  Scan,
  Pill, 
  PlusCircle, 
  Trash2, 
  CreditCard, 
  ChevronUp, 
  ChevronDown, 
  Save, 
  Check, 
  X, 
  Clock, 
  MessageSquare,
  Users,
  RefreshCw,
  Pencil,
  Plus,
  IndianRupee,
  Receipt,
  Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import ipdService from '../../services/ipd/ipdService';
import workflowRealtimeService from '../../services/workflowRealtimeService';
import { printDischargeSummary } from '../../utils/ipdPrintUtils';

/**
 * IPD Discharge Summary Form & Workspace Modal
 * Dedicated for Receptionist Desk.
 * Matches exact UI reference specifications:
 * - Patient Header Card (UHID, IPD No, Age, Gender, Phone, Ward/Bed, Admission Date/Time, Attending Doctor, Length of Stay, Admitted Badge)
 * - Collapsible Sections:
 *   1. Clinical Summary (Final Diagnosis, Condition, Discharge Type, Treatment Given, Discharge Instructions, Discharge Medicines, Next Review Date, Follow-up Advice)
 *   2. IPD Charges Breakdown (Bed Charges, Doctor Consultation, Lab/Diagnostics, Medicines, Other Services with Qty, Rate, Amount, Delete action & Total)
 *   3. Payment / Collection Details (Payment Method, Amount Received, Payment Date, Payment Reference, 3 Stat Summary Boxes)
 *   4. Notes / Remarks (Textarea)
 * - Action Buttons: [Cancel], [Save Draft], [Save & Discharge]
 */
// Automatically capitalize the first letter of each word and disallow numbers (0-9)
const formatCapitalizeWordsNoNumbers = (val) => {
  if (!val) return '';
  const noNums = val.replace(/[0-9]/g, '');
  return noNums.replace(/(^|[^\w']|\s)([a-z])/g, (_, pre, letter) => `${pre}${letter.toUpperCase()}`);
};

// Allow only numbers and colon (:), disallow alphabets and other characters
const formatTimeOnlyNumbers = (val) => {
  if (!val) return '';
  return val.replace(/[^0-9:]/g, '');
};

const IPDDischargeWorkspaceModal = ({
  isOpen,
  onClose,
  admission,
  onAdmissionUpdated,
  user
}) => {
  if (!isOpen || !admission) return null;

  const queryClient = useQueryClient();

  // Fresh live admission data state
  const [liveAdmission, setLiveAdmission] = useState(admission);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  // Collapsible accordion states
  const [openSections, setOpenSections] = useState({
    clinical: false,
    charges: true,
    payment: true,
    notes: true
  });

  const toggleSection = (sectionKey) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Fetch complete fresh admission record from backend when modal opens
  const refreshAdmissionRecord = useCallback(async () => {
    const targetId = admission?._id || admission?.id;
    if (!targetId) return;
    try {
      setIsLoadingLive(true);
      const res = await ipdService.getAdmissionById(targetId);
      const data = res?.data || res;
      if (data && data._id) {
        setLiveAdmission(data);
      }
    } catch (err) {
      console.warn('Could not fetch live admission details:', err);
    } finally {
      setIsLoadingLive(false);
    }
  }, [admission?._id, admission?.id]);

  useEffect(() => {
    refreshAdmissionRecord();
  }, [refreshAdmissionRecord]);

  const currentAdm = liveAdmission || admission || {};
  const isDischarged = currentAdm.status === 'Discharged';
  const patient = currentAdm.patientId || {};
  const bedInfo = currentAdm.bedId || {};
  const wardInfo = bedInfo.wardId || {};

  // Patient Info Fields
  const patientName = patient.name || currentAdm.patientName || 'Patient';
  const uhid = patient.uhid || currentAdm.uhid || 'PAT-—';
  const admissionId = currentAdm.admissionId || currentAdm.admissionNumber || currentAdm.ipdNo || 'IPD-—';
  const rawAge = patient.age || currentAdm.age || '';
  const age = typeof rawAge === 'string' ? rawAge.replace(/[^0-9]/g, '') || rawAge : rawAge || '—';
  const gender = patient.gender || currentAdm.gender || '—';
  const phone = patient.mobileNumber || patient.phone || currentAdm.phone || '—';
  const wardName = wardInfo.name || currentAdm.wardName || currentAdm.ward || 'General Ward';
  const bedNumber = bedInfo.bedNumber || currentAdm.bedNumber || currentAdm.bedNo || 'B-12';
  
  const doctorName = currentAdm.attendingDoctorId?.name 
    ? `Dr. ${currentAdm.attendingDoctorId.name.replace(/^Dr\.\s*/i, '')}` 
    : (user?.name ? `Dr. ${user.name.replace(/^Dr\.\s*/i, '')}` : 'Dr. Vedha');

  // Format Admission Date & Time
  const admissionDateRaw = currentAdm.admissionDate || currentAdm.createdAt || new Date();
  const admDateObj = new Date(admissionDateRaw);
  const formattedAdmDate = !isNaN(admDateObj.getTime()) ? admDateObj.toISOString().split('T')[0] : '—';
  const formattedAdmTime = currentAdm.admissionTime || (!isNaN(admDateObj.getTime()) ? admDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

  // Dynamic Stay Duration & Chargeable Days Calculation
  const stayDays = useMemo(() => {
    if (!currentAdm?.admissionDate) return 4; // default reference
    const start = new Date(currentAdm.admissionDate).getTime();
    const end = isDischarged && currentAdm.dischargeDate ? new Date(currentAdm.dischargeDate).getTime() : Date.now();
    const diffMs = Math.max(0, end - start);
    const diffDaysExact = diffMs / (1000 * 60 * 60 * 24);
    return Math.max(1, Math.ceil(diffDaysExact));
  }, [currentAdm, isDischarged]);

  // Bed Rate Resolution (Exact configured rate or ₹200 / Day standard default)
  const bedRate = useMemo(() => {
    if (currentAdm?.billingDetails?.dailyRate !== undefined && Number(currentAdm.billingDetails.dailyRate) > 0) {
      return Number(currentAdm.billingDetails.dailyRate);
    }
    const bedDaily = Number(bedInfo?.dailyCharge) || 0;
    if (bedDaily > 0) return bedDaily;
    const wardDaily = Number(wardInfo?.dailyBaseRate) || 0;
    if (wardDaily > 0) return wardDaily;
    return 200; // Standard default rate (₹200 / Day)
  }, [currentAdm, bedInfo, wardInfo]);

  // Doctor Consultation Rate (Doctor fee or ₹200 / Day standard default)
  const doctorRate = useMemo(() => {
    const fee = currentAdm?.attendingDoctorId?.consultationFee || currentAdm?.billingDetails?.consultationRate;
    if (fee && Number(fee) > 0) return Number(fee);
    return 200; // Standard default rate (₹200 / Day)
  }, [currentAdm]);

  // Robust check if patient is already finalized and discharged
  const isAlreadyDischarged = useMemo(() => {
    return (
      currentAdm?.status === 'Discharged' ||
      currentAdm?.isDischarged === true ||
      admission?.status === 'Discharged' ||
      admission?.isDischarged === true ||
      liveAdmission?.status === 'Discharged' ||
      liveAdmission?.isDischarged === true
    );
  }, [currentAdm, admission, liveAdmission]);

  // ----------------------------------------------------
  // 1. Clinical Summary Form State
  // ----------------------------------------------------
  const [clinicalForm, setClinicalForm] = useState({
    finalDiagnosis: '',
    dischargeCondition: 'Improved',
    dischargeType: 'Routine Discharge',
    dischargeDate: '',
    dischargeTime: '',
    treatmentSummary: '',
    dischargeInstructions: '',
    dischargeMedicines: '',
    nextReviewDate: '',
    followupAdvice: ''
  });

  useEffect(() => {
    if (!currentAdm) return;
    const cs = currentAdm.clinicalDischargeSummary || {};

    let medsText = '';
    if (Array.isArray(cs.dischargeMedicines) && cs.dischargeMedicines.length > 0) {
      medsText = cs.dischargeMedicines.map(m => 
        `${m.medicineName || m.name || 'Medicine'} - ${m.dosage || m.dose || '1-0-1'} (${m.duration || '3 days'})`
      ).join('\n');
    } else if (typeof cs.dischargeMedicines === 'string' && cs.dischargeMedicines.trim()) {
      medsText = cs.dischargeMedicines;
    } else {
      medsText = 'Paracetamol 500mg - 1-0-1 (3 days)\nVitamin C 500mg - 1-0-1 (3 days)';
    }

    const today = new Date();
    const reviewDate = new Date(today);
    reviewDate.setDate(reviewDate.getDate() + 10);
    const reviewDateStr = reviewDate.toISOString().split('T')[0];

    // Fetch discharge date and time ONLY if doctor has finalized & sent to reception or if already discharged
    const isDoctorFinalized = currentAdm.dischargeSummaryStatus === 'Sent to Reception' || currentAdm.status === 'Discharged';

    let initialDischargeDate = '';
    let initialDischargeTime = '';

    if (isDoctorFinalized) {
      const rawDischargeDate = cs.dischargeDate || currentAdm.dischargeDate;
      if (rawDischargeDate) {
        const parsedDDate = new Date(rawDischargeDate);
        if (!isNaN(parsedDDate.getTime())) {
          initialDischargeDate = parsedDDate.toISOString().split('T')[0];
        }
      }
      initialDischargeTime = formatTimeOnlyNumbers(cs.dischargeTime || currentAdm.dischargeTime || '');
    }

    setClinicalForm({
      finalDiagnosis: cs.finalDiagnosis || currentAdm.finalDiagnosis || currentAdm.diagnosis || currentAdm.primaryDiagnosis || currentAdm.provisionalDiagnosis || currentAdm.admittingDiagnosis || currentAdm.reasonForAdmission || '',
      dischargeCondition: cs.dischargeCondition || currentAdm.dischargeCondition || 'Improved',
      dischargeType: cs.dischargeType || currentAdm.dischargeType || 'Routine Discharge',
      dischargeDate: initialDischargeDate,
      dischargeTime: initialDischargeTime,
      treatmentSummary: cs.treatmentSummary || currentAdm.treatmentSummary || currentAdm.dischargeSummary || 'Patient responded well to treatment. Fever subsided. Vitals stable.',
      dischargeInstructions: cs.dischargeInstructions || currentAdm.dischargeInstructions || 'Continue medicines as advised. Maintain hydration. Follow up if symptoms persist.',
      dischargeMedicines: medsText,
      nextReviewDate: cs.nextReviewDate ? new Date(cs.nextReviewDate).toISOString().split('T')[0] : (currentAdm.nextReviewDate ? new Date(currentAdm.nextReviewDate).toISOString().split('T')[0] : reviewDateStr),
      followupAdvice: cs.followupAdvice || currentAdm.followupAdvice || 'Review after 10 days. Maintain proper diet and rest.'
    });

    if (initialDischargeDate) {
      setPaymentDate(initialDischargeDate);
    }
  }, [currentAdm]);

  // ----------------------------------------------------
  // 2. IPD Charges Breakdown State & Table
  // ----------------------------------------------------
  const [chargesList, setChargesList] = useState([]);
  const [isEditingCharges, setIsEditingCharges] = useState(false);

  useEffect(() => {
    if (!currentAdm) return;
    const bd = currentAdm.billingDetails || {};

    // Exact dynamic calculations based on stay days and configured rates:
    // e.g. 5 days stay * ₹200/day bed charge = ₹1,000
    const calculatedBedAmount = bedRate * stayDays;
    // Doctor consultation fee: flat consultation fee (default ₹200)
    const initialDoctorFee = (bd.isCustomized && bd.consultationCharges !== undefined && Number(bd.consultationCharges) > 0)
      ? Number(bd.consultationCharges)
      : doctorRate;
    const calculatedConsultAmount = initialDoctorFee;

    const rows = [
      {
        id: 'bed',
        category: 'Bed Charges',
        icon: 'bed',
        details: `${wardName} (${bedNumber})`,
        qtyDuration: `${stayDays} Days`,
        rate: bedRate,
        rateText: String(bedRate),
        amount: calculatedBedAmount
      },
      {
        id: 'doctor',
        category: 'Doctor Consultation',
        icon: 'doctor',
        details: 'Daily Doctor Consultation & Rounds',
        qtyDuration: '1 Consultation',
        rate: initialDoctorFee,
        rateText: String(initialDoctorFee),
        amount: calculatedConsultAmount
      }
    ];

    const addedServiceNames = new Set();

    // 1. Append actual investigation & service billing items from database
    if (Array.isArray(bd.billingItems) && bd.billingItems.length > 0) {
      bd.billingItems.forEach(item => {
        const itemQty = Number(item.quantity) || 1;
        const itemRate = Number(item.unitPrice || item.amount || 0);
        const itemAmount = Number(item.amount) || (itemQty * itemRate);
        const sName = item.serviceName || 'Diagnostic Service';
        addedServiceNames.add(sName.trim().toLowerCase());

        const isRad = (item.serviceCategory || '').toLowerCase().includes('radiology') ||
                      (item.serviceCategory || '').toLowerCase().includes('imaging') ||
                      sName.toLowerCase().includes('x-ray') ||
                      sName.toLowerCase().includes('scan') ||
                      sName.toLowerCase().includes('ultrasound') ||
                      sName.toLowerCase().includes('mri') ||
                      sName.toLowerCase().includes('ct');
        const isLab = (item.serviceCategory || '').toLowerCase().includes('lab') ||
                      sName.toLowerCase().includes('test') ||
                      sName.toLowerCase().includes('blood') ||
                      sName.toLowerCase().includes('urine') ||
                      sName.toLowerCase().includes('thyroid') ||
                      sName.toLowerCase().includes('diabetes');

        const categoryName = isRad ? 'Radiology' : (isLab ? 'Laboratory' : (item.serviceCategory || 'Other Services'));
        const iconType = isRad ? 'scan' : (isLab ? 'lab' : 'other');

        rows.push({
          id: item._id || `billing_item_${Math.random()}`,
          category: categoryName,
          icon: iconType,
          details: sName,
          qtyDuration: String(itemQty),
          rate: itemRate,
          rateText: String(itemRate),
          amount: itemAmount,
          isCustom: true
        });
      });
    }

    // 2. Also scan currentAdm.dailyReviews for any investigations ordered in rounds
    if (Array.isArray(currentAdm.dailyReviews)) {
      currentAdm.dailyReviews.forEach(rev => {
        if (Array.isArray(rev.investigations)) {
          rev.investigations.forEach(inv => {
            const invName = inv.name || inv.serviceName;
            if (!invName || addedServiceNames.has(invName.trim().toLowerCase())) return;
            addedServiceNames.add(invName.trim().toLowerCase());

            const invPrice = Number(inv.price || inv.unitPrice || inv.amount || 0);
            const isRad = (inv.serviceType || inv.category || '').toLowerCase().includes('radiology') ||
                          (inv.serviceType || inv.category || '').toLowerCase().includes('imaging') ||
                          invName.toLowerCase().includes('x-ray') ||
                          invName.toLowerCase().includes('scan') ||
                          invName.toLowerCase().includes('ultrasound') ||
                          invName.toLowerCase().includes('mri') ||
                          invName.toLowerCase().includes('ct');

            rows.push({
              id: inv._id || inv.serviceId || `review_inv_${Math.random()}`,
              category: isRad ? 'Radiology' : 'Laboratory',
              icon: isRad ? 'scan' : 'lab',
              details: invName,
              qtyDuration: '1',
              rate: invPrice,
              rateText: String(invPrice),
              amount: invPrice,
              isCustom: true
            });
          });
        }
      });
    }

    // 3. Fallback generic Lab if labCharges are present but no individual test items were added
    const hasDiagnosticItems = rows.some(r => r.category === 'Laboratory' || r.category === 'Radiology' || r.icon === 'lab' || r.icon === 'scan');
    const initialLabAmount = bd.labCharges !== undefined && Number(bd.labCharges) > 0 ? Number(bd.labCharges) : 0;
    if (!hasDiagnosticItems && initialLabAmount > 0) {
      rows.push({
        id: 'lab',
        category: 'Lab / Diagnostics',
        icon: 'lab',
        details: 'Inpatient Investigations',
        qtyDuration: '1',
        rate: initialLabAmount,
        rateText: String(initialLabAmount),
        amount: initialLabAmount
      });
    }

    // 4. Medicines if charges are present or recorded
    const initialMedAmount = bd.medicationCharges !== undefined && Number(bd.medicationCharges) > 0 ? Number(bd.medicationCharges) : 0;
    if (initialMedAmount > 0 && !rows.some(r => r.category === 'Medicines')) {
      rows.push({
        id: 'meds',
        category: 'Medicines',
        icon: 'meds',
        details: 'Dispensed Prescriptions',
        qtyDuration: '1',
        rate: initialMedAmount,
        rateText: String(initialMedAmount),
        amount: initialMedAmount
      });
    }

    setChargesList(rows);
  }, [currentAdm, bedRate, doctorRate, stayDays, wardName, bedNumber]);

  // Remove charge row handler
  const handleRemoveCharge = (id) => {
    setChargesList(prev => prev.filter(row => row.id !== id));
  };

  // Add manual charge or service category (manual text entry)
  const handleAddManualCharge = () => {
    const newId = `manual_${Date.now()}`;
    const newRow = {
      id: newId,
      category: '',
      icon: 'other',
      details: '',
      qtyDuration: '1',
      rate: 0,
      rateText: '0',
      amount: 0,
      isCustom: true
    };
    setChargesList(prev => [...prev, newRow]);
    setIsEditingCharges(true); // Open edit mode so user can type right away
    toast.success('New charge item added! You can now manually enter the category / service name and amount.');
  };

  // Update charge row field (category, details, qty, rate, amount)
  const handleUpdateChargeRow = (id, field, value) => {
    setChargesList(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      if (field === 'rate' || field === 'qtyDuration') {
        const parsedQty = parseFloat(field === 'qtyDuration' ? value : row.qtyDuration) || 1;
        const parsedRate = field === 'rate' 
          ? (value === '' ? '' : (parseFloat(value) || 0)) 
          : (parseFloat(row.rate ?? row.rateText) || 0);
        const numRate = Number(parsedRate) || 0;
        updated.amount = Math.round(parsedQty * numRate);
        if (field === 'rate') {
          updated.rate = parsedRate;
          updated.rateText = String(value);
        }
      } else if (field === 'amount') {
        updated.amount = Number(value) || 0;
      }
      return updated;
    }));
  };

  // Calculate Total Billable Amount
  const totalBillAmount = useMemo(() => {
    return chargesList.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  }, [chargesList]);

  // ----------------------------------------------------
  // 3. Payment / Collection Details State
  // ----------------------------------------------------
  const todayStr = new Date().toISOString().split('T')[0];
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [paymentReference, setPaymentReference] = useState('—');

  useEffect(() => {
    if (isAlreadyDischarged) {
      const settledAmount = Number(currentAdm?.amountPaid) || Number(currentAdm?.billingDetails?.totalBill) || totalBillAmount;
      setAmountReceived(String(settledAmount));
      if (currentAdm?.amountMode) {
        setPaymentMethod(currentAdm.amountMode);
      }
    } else if (totalBillAmount > 0 && amountReceived === '') {
      setAmountReceived(String(totalBillAmount));
    }
  }, [totalBillAmount, isAlreadyDischarged, currentAdm]);

  const numAmountReceived = Number(amountReceived) || 0;
  const remainingAmount = isAlreadyDischarged ? 0 : Math.max(0, totalBillAmount - numAmountReceived);

  // ----------------------------------------------------
  // 4. Notes / Remarks State
  // ----------------------------------------------------
  const [notes, setNotes] = useState(currentAdm.notes || '');

  // Loading States
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ----------------------------------------------------
  // Print Discharge Summary & Final Bill Handler
  // ----------------------------------------------------
  const handlePrint = () => {
    try {
      printDischargeSummary({
        hospital: {
          name: user?.hospital?.name || user?.hospitalName || 'VILLZONE MULTISPECIALITY HOSPITAL',
          address: user?.hospital?.address || '124 Healthcare Boulevard, City Center',
          phone: user?.hospital?.phone || user?.hospital?.mobileNumber || '+91 98765 43210',
          email: user?.hospital?.email || 'reception@villzonehospital.com'
        },
        patient: {
          name: patientName,
          uhid,
          ipdNo: admissionId,
          age,
          gender,
          phone,
          bloodGroup: patient.bloodGroup || '—'
        },
        admission: {
          wardName,
          bedNumber,
          doctorName,
          department: 'In-Patient Department (IPD)',
          admissionDate: formattedAdmDate,
          admissionTime: formattedAdmTime,
          dischargeDate: clinicalForm.dischargeDate || new Date().toISOString().split('T')[0],
          dischargeTime: formatTimeOnlyNumbers(clinicalForm.dischargeTime) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        },
        clinical: {
          finalDiagnosis: clinicalForm.finalDiagnosis || currentAdm.clinicalDischargeSummary?.finalDiagnosis || currentAdm.finalDiagnosis || '',
          dischargeCondition: clinicalForm.dischargeCondition,
          dischargeType: clinicalForm.dischargeType,
          treatmentSummary: clinicalForm.treatmentSummary || currentAdm.clinicalDischargeSummary?.treatmentSummary || '',
          dischargeInstructions: clinicalForm.dischargeInstructions || currentAdm.clinicalDischargeSummary?.dischargeInstructions || '',
          followupAdvice: clinicalForm.followupAdvice || currentAdm.clinicalDischargeSummary?.followupAdvice || '',
          nextReviewDate: clinicalForm.nextReviewDate || currentAdm.clinicalDischargeSummary?.nextReviewDate || '',
          dischargeMedicines: clinicalForm.dischargeMedicines || currentAdm.clinicalDischargeSummary?.dischargeMedicines || []
        },
        billing: {
          charges: chargesList.map(ch => ({
            category: ch.category,
            details: ch.details,
            qty: ch.qtyDuration,
            rate: ch.rate,
            amount: ch.amount
          })),
          totalAmount: totalBillAmount,
          amountReceived: numAmountReceived || totalBillAmount,
          remainingAmount,
          paymentMethod,
          paymentDate,
          paymentReference,
          notes
        }
      });
      toast.success('Print document prepared successfully.');
    } catch (err) {
      console.error('Error generating print summary:', err);
      toast.error('Failed to open print preview');
    }
  };

  // ----------------------------------------------------
  // Save Draft Handler
  // ----------------------------------------------------
  const handleSaveDraft = async () => {
    try {
      setIsSubmitting(true);
      const targetId = currentAdm._id || admission._id || admission.id;

      // Prepare clinical draft payload
      const clinicalPayload = {
        ...clinicalForm,
        status: 'Draft',
        dischargeMedicines: clinicalForm.dischargeMedicines
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const parts = line.split('-');
            return {
              medicineName: parts[0]?.trim() || line,
              dosage: parts[1]?.trim() || '1-0-1',
              duration: '3 days'
            };
          })
      };

      // Prepare billing snapshot payload
      const calculatedLab = chargesList
        .filter(r => r.category === 'Laboratory' || r.category === 'Radiology' || r.category === 'Lab / Diagnostics' || r.icon === 'lab' || r.icon === 'scan')
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      const billingPayload = {
        bedCharges: chargesList.find(r => r.id === 'bed')?.amount || 0,
        consultationCharges: chargesList.find(r => r.id === 'doctor')?.amount || 0,
        labCharges: calculatedLab,
        medicationCharges: chargesList.find(r => r.id === 'meds')?.amount || 0,
        otherCharges: chargesList.filter(r => r.id !== 'bed' && r.id !== 'doctor' && r.id !== 'meds' && r.category !== 'Laboratory' && r.category !== 'Radiology' && r.category !== 'Lab / Diagnostics').reduce((sum, r) => sum + Number(r.amount || 0), 0),
        totalBill: totalBillAmount,
        billingItems: chargesList.filter(r => r.id !== 'bed' && r.id !== 'doctor' && r.id !== 'meds' && r.id !== 'lab').map(r => ({
          serviceCategory: r.category,
          serviceName: r.details,
          quantity: Number(r.qtyDuration) || 1,
          unitPrice: Number(r.rate) || 0,
          amount: Number(r.amount) || 0,
          isManual: Boolean(r.isCustom)
        })),
        notes
      };

      await ipdService.saveClinicalDischargeSummary(targetId, clinicalPayload);
      await ipdService.saveAdmissionBilling(targetId, billingPayload);

      toast.success('Discharge summary draft saved successfully.');
    } catch (err) {
      console.error('Error saving draft:', err);
      toast.error(err.response?.data?.message || 'Failed to save draft');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // Save & Discharge Handler
  // ----------------------------------------------------
  const handleSaveAndDischarge = async () => {
    if (isAlreadyDischarged) {
      return toast.info('This patient has already been discharged and settled.');
    }
    if (!clinicalForm.finalDiagnosis.trim()) {
      return toast.error('Please enter the Final Diagnosis');
    }
    if (!clinicalForm.dischargeDate) {
      return toast.error('Please specify the Date of Discharge');
    }
    if (remainingAmount > 0 || numAmountReceived < totalBillAmount) {
      return toast.error(`Cannot discharge: Total bill of ₹${totalBillAmount.toLocaleString('en-IN')} must be completely collected (Remaining: ₹${remainingAmount.toLocaleString('en-IN')})`);
    }

    try {
      setIsSubmitting(true);
      const targetId = currentAdm._id || admission._id || admission.id;

      // 1. Record payment collection if amount was entered
      if (numAmountReceived > 0) {
        try {
          await api.post(`/ipd/admissions/${targetId}/payment`, {
            amount: numAmountReceived,
            totalBill: totalBillAmount,
            paymentMode: paymentMethod,
            paymentType: remainingAmount === 0 ? 'Final Settlement' : 'Interim Payment',
            referenceNo: paymentReference !== '—' ? paymentReference : '',
            notes: notes || 'Settlement at discharge'
          });
        } catch (payErr) {
          console.warn('Payment recording note:', payErr?.response?.data || payErr);
        }
      }

      // 2. Prepare Final Discharge Payload with direct settlement and payment fields
      const dischargePayload = {
        dischargeDate: clinicalForm.dischargeDate || paymentDate || todayStr,
        dischargeTime: formatTimeOnlyNumbers(clinicalForm.dischargeTime) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        finalDiagnosis: clinicalForm.finalDiagnosis,
        dischargeCondition: clinicalForm.dischargeCondition,
        dischargeType: clinicalForm.dischargeType,
        treatmentSummary: clinicalForm.treatmentSummary,
        dischargeSummary: clinicalForm.treatmentSummary,
        dischargeInstructions: clinicalForm.dischargeInstructions,
        notes,
        amountReceived: numAmountReceived,
        amountPaid: numAmountReceived,
        paymentMethod,
        paymentDate,
        paymentReference,
        paymentDetails: {
          amount: numAmountReceived,
          paymentMode: paymentMethod,
          paymentDate,
          referenceNo: paymentReference,
          notes
        },
        settlementException: {
          allowed: true,
          reason: remainingAmount === 0 ? 'Fully settled at discharge' : 'Approved discharge with pending dues'
        },
        billingDetails: {
          bedCharges: chargesList.find(r => r.id === 'bed')?.amount || 0,
          consultationCharges: chargesList.find(r => r.id === 'doctor')?.amount || 0,
          labCharges: chargesList
            .filter(r => r.category === 'Laboratory' || r.category === 'Radiology' || r.category === 'Lab / Diagnostics' || r.icon === 'lab' || r.icon === 'scan')
            .reduce((sum, r) => sum + Number(r.amount || 0), 0),
          medicationCharges: chargesList.find(r => r.id === 'meds')?.amount || 0,
          otherCharges: chargesList.filter(r => r.id !== 'bed' && r.id !== 'doctor' && r.id !== 'meds' && r.category !== 'Laboratory' && r.category !== 'Radiology' && r.category !== 'Lab / Diagnostics').reduce((sum, r) => sum + Number(r.amount || 0), 0),
          totalBill: totalBillAmount,
          billingItems: chargesList.filter(r => r.id !== 'bed' && r.id !== 'doctor' && r.id !== 'meds' && r.id !== 'lab').map(r => ({
            serviceCategory: r.category,
            serviceName: r.details,
            quantity: Number(r.qtyDuration) || 1,
            unitPrice: Number(r.rate) || 0,
            amount: Number(r.amount) || 0,
            isManual: Boolean(r.isCustom)
          })),
          isCustomized: true
        }
      };

      await api.put(`/ipd/admissions/${targetId}/discharge`, dischargePayload);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['ipd'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });

      // Broadcast realtime event
      workflowRealtimeService.broadcastLocalEvent('IPD_ADMISSION_DISCHARGED', {
        admissionId: targetId,
        patientName,
        totalBill: totalBillAmount
      });

      toast.success('Patient discharged and bed released successfully!');
      if (onAdmissionUpdated) onAdmissionUpdated();
      onClose();
    } catch (err) {
      console.error('Error finalizing discharge:', err);
      toast.error(err.response?.data?.message || 'Error processing discharge');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for category icons
  const renderCategoryIcon = (iconType, category = '') => {
    const catLower = (category || iconType || '').toLowerCase();
    if (iconType === 'bed' || catLower.includes('bed')) {
      return <Bed className="w-4 h-4 text-blue-600" />;
    }
    if (iconType === 'doctor' || catLower.includes('doctor') || catLower.includes('consult')) {
      return <Stethoscope className="w-4 h-4 text-blue-600" />;
    }
    if (iconType === 'scan' || catLower.includes('radiology') || catLower.includes('imaging') || catLower.includes('x-ray') || catLower.includes('scan') || catLower.includes('ultrasound') || catLower.includes('mri') || catLower.includes('ct')) {
      return <Scan className="w-4 h-4 text-amber-600" />;
    }
    if (iconType === 'lab' || catLower.includes('lab') || catLower.includes('blood') || catLower.includes('urine') || catLower.includes('test') || catLower.includes('thyroid') || catLower.includes('diabetes')) {
      return <FlaskConical className="w-4 h-4 text-purple-600" />;
    }
    if (iconType === 'meds' || catLower.includes('med') || catLower.includes('pharm')) {
      return <Pill className="w-4 h-4 text-emerald-600" />;
    }
    return <PlusCircle className="w-4 h-4 text-blue-600" />;
  };

  const modalMarkup = (
    <div 
      className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fade-in font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-[#F8FAFC] w-full max-w-5xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* ==================================================
            1. TOP HEADER BAR
            ================================================== */}
        <div className="bg-white px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Go Back"
              aria-label="Go Back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>IPD Discharge Summary</span>
                {isLoadingLive && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Fetching latest...
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Patient discharge details and clinical summary
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAlreadyDischarged ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                <span>Discharged & Settled</span>
              </span>
            ) : currentAdm.dischargeSummaryStatus === 'Sent to Reception' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Pending Discharge (Doctor Finalized)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Users className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                <span>Admitted</span>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ==================================================
            2. SCROLLABLE CONTENT BODY
            ================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* ==================================================
              A. PATIENT HEADER CARD (3-ROW COMPACT 10PX GRID)
              ================================================== */}
          <div className="bg-[#F4F8FE] border border-[#D7E6FD] rounded-2xl p-[10px] sm:p-3 shadow-2xs space-y-[10px]">
            {/* Row 1: Person Icon opposite Patient Name, IPD Patient, and Stay Duration Badges in One Row */}
            <div className="flex items-center justify-between gap-2.5 min-w-0 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                <div className="w-8 h-8 rounded-full bg-[#DCEBFE] text-[#2F63F2] flex items-center justify-center shrink-0 shadow-2xs">
                  <User className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">{patientName}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-[#E6F0FD] text-[#2F63F2] border border-[#BFDBFE] whitespace-nowrap">
                    IPD Patient
                  </span>
                  {admission?.status === 'Discharged' && (
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap flex items-center gap-1 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                      Completed
                    </span>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#E6F0FD] text-[#2F63F2] border border-[#BFDBFE] shrink-0 whitespace-nowrap">
                <Clock className="w-3 h-3 text-[#2F63F2]" />
                <span>{stayDays} Days</span>
              </span>
            </div>

            {/* Fields Grid (All fields aligned straight & equal in 4 columns, with icons removed) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-[10px] items-center text-xs">
              {/* Row 1, Col 1: UHID */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-semibold text-[11px] shrink-0">UHID:</span>
                <strong className="text-slate-900 font-mono text-xs truncate">{uhid}</strong>
              </div>

              {/* Row 1, Col 2: IPD No */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-semibold text-[11px] shrink-0">IPD No:</span>
                <strong className="text-slate-900 font-mono text-xs truncate">{admissionId}</strong>
              </div>

              {/* Row 1, Col 3: Age / Gender */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-semibold text-[11px] shrink-0">Age/Gen:</span>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <strong className="text-slate-900 text-xs">{age} yrs / {gender ? (gender.length === 1 ? gender.toUpperCase() : gender.charAt(0).toUpperCase()) : '—'}</strong>
                  {patient?.bloodGroup && patient.bloodGroup !== 'Unknown' && patient.bloodGroup !== 'N/A' && patient.bloodGroup !== '—' && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-none shadow-2xs">
                      {patient.bloodGroup}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 1, Col 4: Phone */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-semibold text-[11px] shrink-0">Phone:</span>
                <strong className="text-slate-900 text-xs truncate">{phone}</strong>
              </div>

              {/* Row 2, Col 1: Admission (Directly under UHID, straight & equal) */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-semibold text-[11px] shrink-0">Admission:</span>
                <strong className="text-slate-900 font-bold text-xs truncate">{formattedAdmDate}, {formattedAdmTime}</strong>
              </div>

              {/* Row 2, Col 2: Ward / Bed (Directly under IPD No, straight & equal) */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-semibold text-[11px] shrink-0">Ward / Bed:</span>
                <strong className="text-slate-900 font-bold text-xs truncate">{wardName} - {bedNumber}</strong>
              </div>

              {/* Row 2, Col 3: Doctor (Directly under Age/Gen, straight & equal) */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-semibold text-[11px] shrink-0">Doctor:</span>
                <strong className="text-slate-900 font-bold text-xs truncate">{doctorName}</strong>
              </div>
            </div>
          </div>

          {/* ==================================================
              SECTION 1: CLINICAL SUMMARY (COLLAPSIBLE)
              ================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div 
              onClick={() => toggleSection('clinical')}
              className={`px-5 py-3.5 bg-white ${openSections.clinical ? 'border-b border-slate-100' : ''} flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors select-none`}
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-[#2F63F2]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Clinical Summary
                </h3>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-700 transition-transform">
                {openSections.clinical ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {openSections.clinical && (
              <div className="p-4 sm:p-5 space-y-4 animate-fade-in">
                {/* Row 1: Date of Discharge & Time & Next Review Date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 block">
                        Date of Discharge & Time <span className="text-rose-500">*</span>
                      </label>
                      {currentAdm.dischargeSummaryStatus === 'Sent to Reception' && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Doctor Finalized
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <input
                          type="date"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs cursor-pointer"
                          value={clinicalForm.dischargeDate}
                          onChange={(e) => setClinicalForm({ ...clinicalForm, dischargeDate: e.target.value })}
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="11:30"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs"
                          value={clinicalForm.dischargeTime}
                          onChange={(e) => setClinicalForm({ ...clinicalForm, dischargeTime: formatTimeOnlyNumbers(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Next Review Date
                    </label>
                    <input
                      type="date"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs cursor-pointer"
                      value={clinicalForm.nextReviewDate}
                      onChange={(e) => setClinicalForm({ ...clinicalForm, nextReviewDate: e.target.value })}
                    />
                  </div>
                </div>

                {/* Row 2: Final Diagnosis, Condition at Discharge, Discharge Type */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Final Diagnosis <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs"
                      placeholder="e.g. Acute Appendicitis..."
                      value={clinicalForm.finalDiagnosis}
                      onChange={(e) => setClinicalForm({ ...clinicalForm, finalDiagnosis: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Condition at Discharge <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs appearance-none cursor-pointer"
                        value={clinicalForm.dischargeCondition}
                        onChange={(e) => setClinicalForm({ ...clinicalForm, dischargeCondition: e.target.value })}
                      >
                        <option value="Improved">Improved</option>
                        <option value="Recovered">Recovered</option>
                        <option value="Stable">Stable</option>
                        <option value="Deteriorated">Deteriorated</option>
                        <option value="Critical">Critical</option>
                        <option value="Unchanged">Unchanged</option>
                        <option value="Deceased">Deceased</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Discharge Type <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs appearance-none cursor-pointer"
                        value={clinicalForm.dischargeType}
                        onChange={(e) => setClinicalForm({ ...clinicalForm, dischargeType: e.target.value })}
                      >
                        <option value="Routine Discharge">Routine Discharge</option>
                        <option value="Discharged Against Medical Advice (DAMA)">Discharged Against Medical Advice (DAMA)</option>
                        <option value="Left Against Medical Advice (LAMA)">Left Against Medical Advice (LAMA)</option>
                        <option value="Transferred to Another Facility">Transferred to Another Facility</option>
                        <option value="Absconded">Absconded</option>
                        <option value="Referred">Referred</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 3: Treatment Given / Clinical Progress & Discharge Instructions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Treatment Given / Clinical Progress
                    </label>
                    <textarea
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs resize-y"
                      value={clinicalForm.treatmentSummary}
                      onChange={(e) => setClinicalForm({ ...clinicalForm, treatmentSummary: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Discharge Instructions
                    </label>
                    <textarea
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs resize-y"
                      placeholder="Enter discharge instructions, care precautions, hydration, diet advice..."
                      value={clinicalForm.dischargeInstructions}
                      onChange={(e) => setClinicalForm({ ...clinicalForm, dischargeInstructions: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Row 4: Follow-up Advice & Referral / Transfer Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Follow-up Advice
                    </label>
                    <textarea
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs resize-y"
                      value={clinicalForm.followupAdvice}
                      onChange={(e) => setClinicalForm({ ...clinicalForm, followupAdvice: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Referral / Transfer Details (if applicable)
                    </label>
                    <textarea
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs resize-y"
                      placeholder="Enter referral or transfer details..."
                      value={clinicalForm.referralDetails || ''}
                      onChange={(e) => setClinicalForm({ ...clinicalForm, referralDetails: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* ==================================================
              SECTION 2: IPD CHARGES BREAKDOWN
              ================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-blue-100 text-[#2F63F2] flex items-center justify-center font-bold text-xs">
                  ₹
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  IPD Charges Breakdown
                </h3>
              </div>

              {/* Action Buttons opposite to IPD Charges Breakdown: Edit Button & Add Symbol */}
              {!isAlreadyDischarged && (
                <div className="flex items-center gap-2">
                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={() => setIsEditingCharges(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                      isEditingCharges 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                        : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                    title={isEditingCharges ? "Done editing charges and amounts" : "Edit charges, rates, and amounts"}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{isEditingCharges ? 'Done Editing' : 'Edit Charges'}</span>
                  </button>

                  {/* Add Symbol (+) Button */}
                  <button
                    type="button"
                    onClick={handleAddManualCharge}
                    className="px-3 py-1.5 bg-[#2F63F2] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Add manual charge or category/service"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Add Charge</span>
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto animate-fade-in">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-600">
                    <th className="py-2.5 px-4">Category / Service</th>
                    <th className="py-2.5 px-4">Details</th>
                    <th className="py-2.5 px-4">Qty / Duration</th>
                    <th className="py-2.5 px-4">Rate (₹)</th>
                    <th className="py-2.5 px-4">Amount (₹)</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chargesList.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      {/* Category / Service: Fixed text with icon for existing charges; manual text input for added manual charges */}
                      <td className="py-3 px-4">
                        {row.isCustom && isEditingCharges ? (
                          <input
                            type="text"
                            value={row.category}
                            onChange={(e) => handleUpdateChargeRow(row.id, 'category', e.target.value)}
                            placeholder="Enter category / service name..."
                            className="w-full min-w-[140px] bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#2F63F2]"
                          />
                        ) : (
                          <div className="flex items-center gap-2.5">
                            {renderCategoryIcon(row.icon, row.category)}
                            <span className="font-bold text-slate-800">{row.category || 'Custom Service'}</span>
                          </div>
                        )}
                      </td>

                      {/* Details */}
                      <td className="py-3 px-4">
                        {isEditingCharges ? (
                          <input
                            type="text"
                            value={row.details}
                            onChange={(e) => handleUpdateChargeRow(row.id, 'details', e.target.value)}
                            placeholder="Service details..."
                            className="w-full min-w-[140px] bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-[#2F63F2]"
                          />
                        ) : (
                          <span className="text-slate-700 font-medium whitespace-pre-line leading-relaxed">
                            {row.details}
                          </span>
                        )}
                      </td>

                      {/* Qty / Duration */}
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {isEditingCharges ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.qtyDuration}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d*$/.test(val)) {
                                handleUpdateChargeRow(row.id, 'qtyDuration', val);
                              }
                            }}
                            onWheel={(e) => e.target.blur()}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-[#2F63F2]"
                          />
                        ) : (
                          row.qtyDuration
                        )}
                      </td>

                      {/* Rate */}
                      <td className="py-3 px-4 text-slate-700 font-medium whitespace-pre-line">
                        {row.id === 'doctor' || isEditingCharges ? (
                          <div className="relative inline-flex items-center">
                            <span className="absolute left-2.5 text-slate-400 font-bold text-xs pointer-events-none select-none">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.rate ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  handleUpdateChargeRow(row.id, 'rate', val);
                                }
                              }}
                              onWheel={(e) => e.target.blur()}
                              placeholder="0"
                              className={`w-28 bg-white border rounded-lg pl-6 pr-2.5 py-1 text-xs font-mono font-bold text-slate-800 transition-all ${
                                row.id === 'doctor'
                                  ? 'border-blue-400 ring-2 ring-blue-100 focus:border-[#2F63F2] focus:ring-2 focus:ring-[#2F63F2]/20 shadow-2xs'
                                  : 'border-slate-300 focus:outline-none focus:border-[#2F63F2]'
                              }`}
                              title={row.id === 'doctor' ? "Manually type doctor consultation fee" : "Edit rate"}
                            />
                          </div>
                        ) : (
                          `₹ ${Number(row.rate || 0).toLocaleString('en-IN')}`
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {isEditingCharges ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                handleUpdateChargeRow(row.id, 'amount', val);
                              }
                            }}
                            onWheel={(e) => e.target.blur()}
                            className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold font-mono text-slate-900 focus:outline-none focus:border-[#2F63F2]"
                          />
                        ) : (
                          `₹ ${Number(row.amount || 0).toLocaleString('en-IN')}`
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-center">
                        {!isAlreadyDischarged ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveCharge(row.id)}
                            className="text-rose-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                            title="Remove charge item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50/60 border-t border-slate-200">
                    <td colSpan={4} className="py-3 px-4 text-right font-extrabold text-slate-700 text-xs">
                      Total (₹)
                    </td>
                    <td colSpan={2} className="py-3 px-4 font-extrabold text-sm text-[#2F63F2] font-mono">
                      ₹ {totalBillAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ==================================================
              SECTION 3: PAYMENT / COLLECTION DETAILS (COLLAPSIBLE)
              ================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div 
              onClick={() => toggleSection('payment')}
              className="px-5 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-[#2F63F2]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Payment / Collection Details
                </h3>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-700">
                {openSections.payment ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {openSections.payment && (
              <div className="p-4 sm:p-5 space-y-4 animate-fade-in">
                {/* Row 1: Payment Method, Amount Received, Payment Date (Payment Reference removed) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Payment Method */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Payment Method <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        disabled={isAlreadyDischarged}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs appearance-none cursor-pointer disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI / QR</option>
                        <option value="Card">Card</option>
                        <option value="Net Banking">Net Banking</option>
                        <option value="Insurance">Insurance / TPA</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Amount Received */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Amount Received (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={isAlreadyDischarged}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs font-mono disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                      value={amountReceived}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setAmountReceived(val);
                        }
                      }}
                      onWheel={(e) => e.target.blur()}
                      placeholder="0"
                    />
                  </div>

                  {/* Payment Date */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Payment Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      disabled={isAlreadyDischarged}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs cursor-pointer disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Row 2: Three Summary Boxes (Total Amount, Amount Received, Remaining Amount) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {/* 1. Total Amount */}
                  <div className="bg-[#F8FCF9] border border-[#D5EFE0] rounded-2xl p-4 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#E5F7EC] text-emerald-600 flex items-center justify-center shrink-0">
                      <IndianRupee className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 block">Total Amount (₹)</span>
                      <strong className="text-base font-extrabold text-slate-900 font-mono">
                        {totalBillAmount.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>

                  {/* 2. Amount Received */}
                  <div className="bg-[#F8FCF9] border border-[#D5EFE0] rounded-2xl p-4 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#E5F7EC] text-emerald-600 flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 block">Amount Received (₹)</span>
                      <strong className="text-base font-extrabold text-slate-900 font-mono">
                        {numAmountReceived.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>

                  {/* 3. Remaining Amount */}
                  <div className="bg-[#F8FCF9] border border-[#D5EFE0] rounded-2xl p-4 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#E5F7EC] text-emerald-600 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 block">Remaining Amount (₹)</span>
                      <strong className="text-base font-extrabold text-emerald-700 font-mono">
                        {remainingAmount.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ==================================================
              SECTION 4: NOTES / REMARKS
              ================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div 
              onClick={() => toggleSection('notes')}
              className="px-5 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-[#2F63F2]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Notes / Remarks
                </h3>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-700">
                {openSections.notes ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {openSections.notes && (
              <div className="p-4 sm:p-5 animate-fade-in">
                <textarea
                  rows={2}
                  maxLength={500}
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs placeholder:text-slate-400 resize-y"
                  placeholder="Enter any additional notes or remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </div>

        </div>

        {/* ==================================================
            3. STICKY BOTTOM ACTION BAR (Matching Reference)
            ================================================== */}
        <div className="bg-white px-4 sm:px-6 py-3.5 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-white border border-[#2F63F2] hover:bg-blue-50 active:bg-blue-100 text-[#2F63F2] font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs disabled:opacity-50"
          >
            Close
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isSubmitting}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
              title="Print Discharge Summary & Bill"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAndDischarge}
              disabled={isSubmitting || isAlreadyDischarged || remainingAmount > 0 || numAmountReceived < totalBillAmount}
              title={
                isAlreadyDischarged
                  ? "Patient is already discharged"
                  : remainingAmount > 0
                    ? `Cannot discharge: Remaining balance of ₹${remainingAmount.toLocaleString('en-IN')} must be completed`
                    : "Discharge patient and release bed"
              }
              className={`px-5 py-2 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 ${
                isAlreadyDischarged
                  ? 'bg-slate-200 text-slate-400 border border-slate-300 shadow-none cursor-not-allowed opacity-60 pointer-events-none'
                  : 'bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isSubmitting
                  ? 'Processing...'
                  : isAlreadyDischarged
                    ? 'Discharged'
                    : 'Save & Discharge'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalMarkup, document.body);
};

export default IPDDischargeWorkspaceModal;
