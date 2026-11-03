import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowLeft, 
  User, 
  Calendar, 
  Phone, 
  FileText, 
  Bed, 
  Info, 
  Save, 
  Send, 
  X,
  ChevronDown,
  Building,
  Loader2,
  Printer,
  CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import ipdService from '../../services/ipd/ipdService';
import workflowRealtimeService from '../../services/workflowRealtimeService';
import { printDischargeSummary } from '../../utils/ipdPrintUtils';

/**
 * IPD Doctor Discharge Summary Form & Modal
 * Dedicated clinical discharge summary workspace for Doctors.
 * Matches exact UI reference specifications:
 * - Patient Header Card (UHID, IPD No, Age, Gender, Phone, Diagnosis, Bed, Doctor)
 * - Clinical Discharge Summary Form:
 *   * Final Diagnosis & Condition at Discharge
 *   * Discharge Type & Discharge Date/Time
 *   * Treatment Given / Clinical Progress
 *   * Discharge Instructions & Next Review Date
 *   * Discharge Medicines Pad & Follow-up Advice
 *   * Referral / Transfer Details
 *   * Informational Notice: "This will only send the discharge summary to reception. The patient will not be discharged yet."
 *   * Action Buttons: [Cancel], [Save Draft], [Send to Reception]
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

const IPDDoctorDischargeSummaryModal = ({
  isOpen,
  onClose,
  admission,
  onAdmissionUpdated,
  user
}) => {
  if (!isOpen || !admission) return null;

  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fullAdmission, setFullAdmission] = useState(admission);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Keep fullAdmission in sync when admission prop updates
  useEffect(() => {
    if (admission) {
      setFullAdmission(admission);
    }
  }, [admission]);

  // Fetch complete fresh admission record from backend when modal opens
  useEffect(() => {
    let isMounted = true;
    const fetchAdmission = async () => {
      const targetId = admission?._id || admission?.id || admission?.raw?._id;
      if (!targetId) return;
      try {
        setIsLoadingDetails(true);
        const res = await ipdService.getAdmissionById(targetId);
        const data = res?.data || res;
        if (data && isMounted) {
          setFullAdmission(data);
        }
      } catch (err) {
        console.warn('Could not fetch full admission record:', err);
      } finally {
        if (isMounted) setIsLoadingDetails(false);
      }
    };

    fetchAdmission();
    return () => { isMounted = false; };
  }, [admission?._id, admission?.id, admission?.raw?._id]);

  const currentAdm = fullAdmission || admission || {};

  // Check if patient consultation is already completed or patient is discharged
  const isStatusCompletedOrDischarged = (val) => {
    if (!val || typeof val !== 'string') return false;
    const lower = val.trim().toLowerCase();
    return (
      lower === 'completed' ||
      lower === 'discharged' ||
      lower === 'sent to reception' ||
      lower === 'finalized' ||
      lower === 'pending discharge'
    );
  };

  const isAlreadyFinalized = Boolean(
    // 1. Check current full admission
    isStatusCompletedOrDischarged(currentAdm.dischargeSummaryStatus) ||
    isStatusCompletedOrDischarged(currentAdm.queueStatus) ||
    isStatusCompletedOrDischarged(currentAdm.consultationStatus) ||
    isStatusCompletedOrDischarged(currentAdm.status) ||
    isStatusCompletedOrDischarged(currentAdm.admissionStatus) ||
    isStatusCompletedOrDischarged(currentAdm.clinicalDischargeSummary?.status) ||
    currentAdm.consultationFinished === true ||
    currentAdm.isDischarged === true ||

    // 2. Check current raw admission if present
    isStatusCompletedOrDischarged(currentAdm.raw?.dischargeSummaryStatus) ||
    isStatusCompletedOrDischarged(currentAdm.raw?.queueStatus) ||
    isStatusCompletedOrDischarged(currentAdm.raw?.consultationStatus) ||
    isStatusCompletedOrDischarged(currentAdm.raw?.status) ||
    isStatusCompletedOrDischarged(currentAdm.raw?.admissionStatus) ||
    isStatusCompletedOrDischarged(currentAdm.raw?.clinicalDischargeSummary?.status) ||
    currentAdm.raw?.consultationFinished === true ||
    currentAdm.raw?.isDischarged === true ||

    // 3. Check admission prop
    isStatusCompletedOrDischarged(admission?.dischargeSummaryStatus) ||
    isStatusCompletedOrDischarged(admission?.queueStatus) ||
    isStatusCompletedOrDischarged(admission?.consultationStatus) ||
    isStatusCompletedOrDischarged(admission?.status) ||
    isStatusCompletedOrDischarged(admission?.admissionStatus) ||
    isStatusCompletedOrDischarged(admission?.clinicalDischargeSummary?.status) ||
    admission?.consultationFinished === true ||
    admission?.isDischarged === true ||
    isStatusCompletedOrDischarged(admission?.raw?.dischargeSummaryStatus) ||
    isStatusCompletedOrDischarged(admission?.raw?.queueStatus) ||
    isStatusCompletedOrDischarged(admission?.raw?.consultationStatus) ||
    isStatusCompletedOrDischarged(admission?.raw?.status) ||
    admission?.raw?.consultationFinished === true ||
    admission?.raw?.isDischarged === true ||

    // 4. Check fullAdmission state
    isStatusCompletedOrDischarged(fullAdmission?.dischargeSummaryStatus) ||
    isStatusCompletedOrDischarged(fullAdmission?.queueStatus) ||
    isStatusCompletedOrDischarged(fullAdmission?.consultationStatus) ||
    isStatusCompletedOrDischarged(fullAdmission?.status) ||
    isStatusCompletedOrDischarged(fullAdmission?.admissionStatus) ||
    isStatusCompletedOrDischarged(fullAdmission?.clinicalDischargeSummary?.status) ||
    fullAdmission?.consultationFinished === true ||
    fullAdmission?.isDischarged === true
  );

  // Extract Patient Info safely
  const patient = (typeof currentAdm.patientId === 'object' && currentAdm.patientId !== null)
    ? currentAdm.patientId
    : (currentAdm.patient || {});
  const p = patient;
  const patientName = patient.name || currentAdm.patientName || 'Patient';
  const uhid = patient.uhid || currentAdm.uhid || 'PAT-—';
  const admissionId = currentAdm.admissionId || currentAdm.admissionNumber || currentAdm.ipdNo || 'IPD-—';
  const rawAge = patient.age || currentAdm.age || '';
  const age = typeof rawAge === 'string' ? rawAge.replace(/[^0-9]/g, '') || rawAge : rawAge || '—';
  const gender = patient.gender || currentAdm.gender || '—';
  const phone = patient.phone || patient.mobileNumber || currentAdm.phone || '—';
  const bloodGroup = patient.bloodGroup || currentAdm.bloodGroup || '';
  const wardName = currentAdm.bedId?.wardId?.name || currentAdm.wardName || currentAdm.ward || 'General Ward';
  const bedNumber = currentAdm.bedId?.bedNumber || currentAdm.bedNumber || currentAdm.bedNo || 'B-12';
  const doctorName = currentAdm.attendingDoctorId?.name ? `Dr. ${currentAdm.attendingDoctorId.name.replace(/^Dr\.\s*/i, '')}` : (user?.name ? `Dr. ${user.name.replace(/^Dr\.\s*/i, '')}` : 'Dr. Vedha');
  
  // Format Admission Date & Time
  const admissionDateRaw = currentAdm.admissionDate || currentAdm.createdAt || new Date();
  const formattedAdmDate = new Date(admissionDateRaw).toISOString().split('T')[0];
  const formattedAdmTime = currentAdm.admissionTime || new Date(admissionDateRaw).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ----------------------------------------------------
  // Form State Initialization
  // ----------------------------------------------------
  const [formData, setFormData] = useState({
    finalDiagnosis: '',
    dischargeCondition: 'Improved',
    dischargeType: 'Routine Discharge',
    dischargeDate: '',
    dischargeTime: '',
    treatmentSummary: '',
    dischargeInstructions: '',
    nextReviewDate: '',
    followupAdvice: '',
    referralDetails: '',
    dischargeMedicines: []
  });

  useEffect(() => {
    if (!currentAdm) return;

    // Today's date and 10 days review date default
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const defaultTimeStr = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const reviewDate = new Date(today);
    reviewDate.setDate(reviewDate.getDate() + 10);
    const reviewDateStr = reviewDate.toISOString().split('T')[0];

    const savedClinical = currentAdm.clinicalDischargeSummary || {};

    const initialFinalDiagnosis = 
      savedClinical.finalDiagnosis || 
      currentAdm.finalDiagnosis || 
      currentAdm.diagnosis || 
      currentAdm.primaryDiagnosis || 
      currentAdm.provisionalDiagnosis || 
      currentAdm.admittingDiagnosis || 
      (Array.isArray(currentAdm.dailyReviews) && currentAdm.dailyReviews.length > 0 ? (currentAdm.dailyReviews[currentAdm.dailyReviews.length - 1].diagnosis || currentAdm.dailyReviews[currentAdm.dailyReviews.length - 1].chiefComplaints) : '') || 
      '';

    setFormData({
      finalDiagnosis: initialFinalDiagnosis,
      dischargeCondition: savedClinical.dischargeCondition || currentAdm.dischargeCondition || 'Improved',
      dischargeType: savedClinical.dischargeType || currentAdm.dischargeType || 'Routine Discharge',
      dischargeDate: savedClinical.dischargeDate ? new Date(savedClinical.dischargeDate).toISOString().split('T')[0] : (currentAdm.dischargeDate ? new Date(currentAdm.dischargeDate).toISOString().split('T')[0] : todayStr),
      dischargeTime: formatTimeOnlyNumbers(savedClinical.dischargeTime || currentAdm.dischargeTime || defaultTimeStr),
      treatmentSummary: savedClinical.treatmentSummary || currentAdm.treatmentSummary || currentAdm.dischargeSummary || 'Patient responded well to treatment. Fever subsided. Vitals stable.',
      dischargeInstructions: savedClinical.dischargeInstructions || currentAdm.dischargeInstructions || 'Continue medicines as advised. Maintain hydration. Follow up if symptoms persist or worsen.',
      nextReviewDate: savedClinical.nextReviewDate ? new Date(savedClinical.nextReviewDate).toISOString().split('T')[0] : (currentAdm.nextReviewDate ? new Date(currentAdm.nextReviewDate).toISOString().split('T')[0] : reviewDateStr),
      followupAdvice: savedClinical.followupAdvice || currentAdm.followupAdvice || 'Review after 10 days. Maintain proper diet and rest.',
      referralDetails: savedClinical.referralDetails || currentAdm.referralDetails || '',
      dischargeMedicines: []
    });
  }, [currentAdm]);

  // ----------------------------------------------------
  // Print Clinical Discharge Summary Handler
  // ----------------------------------------------------
  const handlePrint = () => {
    try {
      printDischargeSummary({
        hospital: {
          name: user?.hospital?.name || user?.hospitalName || 'VILLZONE MULTISPECIALITY HOSPITAL',
          address: user?.hospital?.address || '124 Healthcare Boulevard, City Center',
          phone: user?.hospital?.phone || user?.hospital?.mobileNumber || '+91 98765 43210',
          email: user?.hospital?.email || 'doctor@villzonehospital.com'
        },
        patient: {
          name: patientName,
          uhid,
          ipdNo: admissionId,
          age,
          gender,
          phone,
          bloodGroup: bloodGroup || patient?.bloodGroup || '—'
        },
        admission: {
          wardName,
          bedNumber,
          doctorName,
          department: 'In-Patient Department (IPD)',
          admissionDate: formattedAdmDate,
          admissionTime: formattedAdmTime,
          dischargeDate: formData.dischargeDate || new Date().toISOString().split('T')[0],
          dischargeTime: formatTimeOnlyNumbers(formData.dischargeTime) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        },
        clinical: {
          finalDiagnosis: formData.finalDiagnosis || currentAdm.clinicalDischargeSummary?.finalDiagnosis || currentAdm.finalDiagnosis || '',
          dischargeCondition: formData.dischargeCondition,
          dischargeType: formData.dischargeType,
          treatmentSummary: formData.treatmentSummary || currentAdm.clinicalDischargeSummary?.treatmentSummary || '',
          dischargeInstructions: formData.dischargeInstructions || currentAdm.clinicalDischargeSummary?.dischargeInstructions || '',
          followupAdvice: formData.followupAdvice || currentAdm.clinicalDischargeSummary?.followupAdvice || '',
          nextReviewDate: formData.nextReviewDate || currentAdm.clinicalDischargeSummary?.nextReviewDate || '',
          dischargeMedicines: Array.isArray(formData.dischargeMedicines) ? formData.dischargeMedicines : (
            typeof formData.dischargeMedicines === 'string' ? formData.dischargeMedicines : []
          )
        }
      });
      toast.success('Print document prepared successfully.');
    } catch (err) {
      console.error('Error generating print summary:', err);
      toast.error('Failed to open print preview');
    }
  };

  // ----------------------------------------------------
  // Submit Handler: Save Draft or Send to Reception
  // ----------------------------------------------------
  const handleSubmit = async (submitStatus = 'Sent to Reception') => {
    if (isAlreadyFinalized) {
      toast('Discharge summary has already been finalized and sent to reception.', { icon: 'ℹ️' });
      return;
    }

    const isSending = submitStatus === 'Sent to Reception';

    if (isSending) {
      if (!formData.finalDiagnosis.trim()) {
        return toast.error('Please enter the Final Diagnosis');
      }
      if (!formData.dischargeDate) {
        return toast.error('Please specify the proposed Discharge Date');
      }
      if (!formData.treatmentSummary.trim()) {
        return toast.error('Please enter the Treatment Given / Clinical Progress');
      }
      if (!formData.dischargeInstructions.trim()) {
        return toast.error('Please enter the Discharge Instructions');
      }
    }

    try {
      setIsSubmitting(true);

      const payload = {
        ...formData,
        status: submitStatus,
        doctorId: user?._id,
        doctorName: user?.name,
        queueStatus: isSending ? 'Completed' : undefined,
        consultationStatus: isSending ? 'Completed' : undefined,
        consultationFinished: isSending ? true : undefined
      };

      const targetAdmissionId = currentAdm._id || admission._id || admission.id;
      const res = await ipdService.saveClinicalDischargeSummary(targetAdmissionId, payload);

      // Realtime notification
      workflowRealtimeService.broadcastLocalEvent('IPD_DISCHARGE_SUMMARY_SAVED', {
        admissionId: targetAdmissionId,
        patientName,
        status: submitStatus,
        queueStatus: isSending ? 'Completed' : undefined
      });

      if (isSending) {
        toast.success('Discharge summary sent to reception successfully! Patient consultation is completed.');
      } else {
        toast.success('Discharge summary draft saved successfully.');
      }

      if (onAdmissionUpdated) {
        onAdmissionUpdated(res?.data || { ...currentAdm, ...payload });
      }

      queryClient.invalidateQueries({ queryKey: ['ipd'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-admissions-discharge'] });
      queryClient.invalidateQueries({ queryKey: ['ipd-dashboardLiveStatus'] });
      queryClient.invalidateQueries({ queryKey: ['doctorCompletedVisitsHistory'] });
      queryClient.invalidateQueries({ queryKey: ['doctorQueue'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });

      onClose();
    } catch (err) {
      console.error('Error saving clinical discharge summary:', err);
      toast.error(err.response?.data?.message || 'Failed to save discharge summary');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalMarkup = (
    <div 
      className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fade-in font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-[#F8FAFC] w-full max-w-4xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto relative z-10"
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
                {isLoadingDetails && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Fetching latest data...
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {isAlreadyFinalized 
                  ? 'Clinical discharge summary is finalized. View or print details below.'
                  : 'Provide clinical discharge details for the patient'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ==================================================
            2. SCROLLABLE CONTENT BODY
            ================================================== */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-3.5">
          
          {/* ==================================================
              A. PATIENT HEADER CARD (3-ROW COMPACT 10PX GRID)
              ================================================== */}
          <div className="bg-[#F4F8FE] border border-[#D7E6FD] rounded-2xl p-[10px] sm:p-3 shadow-2xs space-y-[10px]">
            {/* Row 1: Person Icon opposite Patient Name, IPD Patient, and Completed Badges in One Row */}
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <div className="w-8 h-8 rounded-full bg-[#DCEBFE] text-[#2F63F2] flex items-center justify-center shrink-0 shadow-2xs">
                <User className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">{patientName}</h3>
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-[#E6F0FD] text-[#2F63F2] border border-[#BFDBFE] whitespace-nowrap">
                  IPD Patient
                </span>
                {isAlreadyFinalized && (
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                    Completed
                  </span>
                )}
              </div>
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
                  {bloodGroup && bloodGroup !== 'Unknown' && bloodGroup !== 'N/A' && bloodGroup !== '—' && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#fef2f2] border border-[#fecdd3] text-[#e11d48] leading-none shadow-2xs">
                      {bloodGroup}
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
              B. CLINICAL DISCHARGE SUMMARY FORM CARD
              ================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-xs space-y-3.5">
            
            {/* Header with Icon */}
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <FileText className="w-4 h-4 text-[#2F63F2]" />
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Clinical Discharge Summary
              </h3>
            </div>

            {/* Form Inputs Grid with 10px spacing */}
            <div className="space-y-[10px] sm:space-y-3">
              
              {/* Row 1: Discharge Date & Next Review Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px] sm:gap-3">
                {/* Discharge Date & Time */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Discharge Date <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="date"
                        disabled={isAlreadyFinalized}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs cursor-pointer disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                        value={formData.dischargeDate}
                        onChange={(e) => setFormData({ ...formData, dischargeDate: e.target.value })}
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        disabled={isAlreadyFinalized}
                        placeholder="11:30"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                        value={formData.dischargeTime}
                        onChange={(e) => setFormData({ ...formData, dischargeTime: formatTimeOnlyNumbers(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                {/* Next Review Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Next Review Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs cursor-pointer disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      value={formData.nextReviewDate}
                      onChange={(e) => setFormData({ ...formData, nextReviewDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Final Diagnosis, Condition at Discharge, Discharge Type */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-[10px] sm:gap-3">
                {/* Final Diagnosis */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Final Diagnosis <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-3.5 pr-14 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs placeholder:text-slate-400 placeholder:font-normal disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      placeholder="e.g. Acute Viral Fever, Enteric Fever"
                      value={formData.finalDiagnosis}
                      maxLength={500}
                      onChange={(e) => setFormData({ ...formData, finalDiagnosis: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                    {formData.finalDiagnosis?.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-medium absolute right-3 pointer-events-none select-none">
                        {formData.finalDiagnosis.length}/500
                      </span>
                    )}
                  </div>
                </div>

                {/* Condition at Discharge */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Condition at Discharge <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs appearance-none cursor-pointer disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      value={formData.dischargeCondition}
                      onChange={(e) => setFormData({ ...formData, dischargeCondition: e.target.value })}
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

                {/* Discharge Type */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Discharge Type <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs appearance-none cursor-pointer disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      value={formData.dischargeType}
                      onChange={(e) => setFormData({ ...formData, dischargeType: e.target.value })}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px] sm:gap-3">
                {/* Treatment Given / Clinical Progress */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Treatment Given / Clinical Progress <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <textarea
                      rows={3}
                      maxLength={1000}
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs placeholder:text-slate-400 resize-y disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      placeholder="Describe patient condition, clinical course in hospital, treatment response, investigations summary..."
                      value={formData.treatmentSummary}
                      onChange={(e) => setFormData({ ...formData, treatmentSummary: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                    <span className="text-[10px] text-slate-400 font-medium absolute right-3 bottom-2 pointer-events-none">
                      {formData.treatmentSummary.length}/1000
                    </span>
                  </div>
                </div>

                {/* Discharge Instructions */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Discharge Instructions <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <textarea
                      rows={3}
                      maxLength={1000}
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs placeholder:text-slate-400 resize-y disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      placeholder="Continue medicines as advised. Maintain hydration. Follow up if symptoms persist or worsen."
                      value={formData.dischargeInstructions}
                      onChange={(e) => setFormData({ ...formData, dischargeInstructions: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                    <span className="text-[10px] text-slate-400 font-medium absolute right-3 bottom-2 pointer-events-none">
                      {formData.dischargeInstructions.length}/1000
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 4: Follow-up Advice & Referral / Transfer Details (if applicable) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px] sm:gap-3">
                {/* Follow-up Advice */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Follow-up Advice
                  </label>
                  <div className="relative">
                    <textarea
                      rows={3}
                      maxLength={500}
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs placeholder:text-slate-400 resize-y disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      placeholder="Review after 10 days. Maintain proper diet and rest."
                      value={formData.followupAdvice}
                      onChange={(e) => setFormData({ ...formData, followupAdvice: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                    <span className="text-[10px] text-slate-400 font-medium absolute right-3 bottom-2 pointer-events-none">
                      {formData.followupAdvice.length}/500
                    </span>
                  </div>
                </div>

                {/* Referral / Transfer Details (if applicable) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-[#2F63F2]" />
                    <span>Referral / Transfer Details (if applicable)</span>
                  </label>
                  <div className="relative">
                    <textarea
                      rows={3}
                      maxLength={500}
                      disabled={isAlreadyFinalized}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F63F2] focus:ring-1 focus:ring-[#2F63F2] shadow-2xs placeholder:text-slate-400 resize-y disabled:bg-slate-100/70 disabled:text-slate-800 disabled:cursor-not-allowed"
                      placeholder="Enter referral or transfer details..."
                      value={formData.referralDetails}
                      onChange={(e) => setFormData({ ...formData, referralDetails: formatCapitalizeWordsNoNumbers(e.target.value) })}
                    />
                    <span className="text-[10px] text-slate-400 font-medium absolute right-3 bottom-2 pointer-events-none">
                      {formData.referralDetails.length}/500
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Informational Box (Matching Reference Alert) */}
          {isAlreadyFinalized ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-emerald-800 font-semibold shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Clinical discharge summary has already been finalized and sent to reception. (Patient consultation completed)</span>
            </div>
          ) : (
            <div className="bg-[#EBF3FE] border border-[#CDE1FE] rounded-xl p-3 flex items-center gap-2.5 text-xs text-[#1E40AF] font-medium">
              <Info className="w-4 h-4 text-[#2F63F2] shrink-0" />
              <span>This will only send the discharge summary to reception. The patient will not be discharged yet.</span>
            </div>
          )}

        </div>

        {/* ==================================================
            3. BOTTOM ACTION BAR (Matching Reference Buttons)
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
              title="Print Clinical Discharge Summary"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isAlreadyFinalized) return;
                handleSubmit('Sent to Reception');
              }}
              disabled={isSubmitting || isAlreadyFinalized}
              className={`px-5 py-2 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 ${
                isAlreadyFinalized
                  ? 'bg-slate-200 text-slate-400 border border-slate-300 shadow-none cursor-not-allowed opacity-60 pointer-events-none'
                  : 'bg-[#2F63F2] hover:bg-blue-700 text-white cursor-pointer active:scale-95'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              title={
                isAlreadyFinalized
                  ? 'Discharge summary has already been finalized and sent to reception. (Patient consultation completed)'
                  : 'Finalize and send to reception'
              }
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Finalizing...' : 'Finalize & Send to Reception'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalMarkup, document.body);
};

export default IPDDoctorDischargeSummaryModal;

