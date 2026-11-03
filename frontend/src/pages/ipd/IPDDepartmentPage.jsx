import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { isIpdAvailable } from '../../utils/featureUtils';
import IPDDepartmentDashboard from '../../components/ipd/IPDDepartmentDashboard';
import IPDDischargeWorkspaceModal from '../../components/ipd/IPDDischargeWorkspaceModal';
import IPDDoctorDischargeSummaryModal from '../../components/ipd/IPDDoctorDischargeSummaryModal';
import InpatientDetailsModal from '../../components/ipd/InpatientDetailsModal';
import IPDDailyConsultationModal from '../../components/ipd/IPDDailyConsultationModal';
import PatientHistoryDrawer from '../../components/PatientHistoryDrawer';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../../services/api';

/**
 * IPD Department Page
 * Displays the primary IPD Department Dashboard when user clicks the IPD Department menu item.
 */
const IPDDepartmentPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const userRole = (user?.roleId?.name || user?.role || '').toUpperCase();
  const isDoctorDesk = location.pathname.startsWith('/doctor') || 
    (['DOCTOR', 'DOCTOR_ADMIN'].includes(userRole) && !location.pathname.startsWith('/reception'));

  const [selectedAdmission, setSelectedAdmission] = useState(null);
  const [dischargeAdmission, setDischargeAdmission] = useState(null);
  const [consultationAdmission, setConsultationAdmission] = useState(null);
  const [visitHistoryAdmission, setVisitHistoryAdmission] = useState(null);
  const [isOpdHistoryDrawerOpen, setIsOpdHistoryDrawerOpen] = useState(false);

  // Active admission for patient history (either Visit History modal or OPD History drawer)
  const activeHistoryAdmission = visitHistoryAdmission || consultationAdmission;
  const consultationPatientId = activeHistoryAdmission?.patientId?._id 
    || (typeof activeHistoryAdmission?.patientId === 'string' ? activeHistoryAdmission?.patientId : null)
    || activeHistoryAdmission?.raw?.patientId?._id
    || activeHistoryAdmission?.raw?.patientId;

  // Patient Consultation & Visit History Query (Fresh every time)
  const { data: patientConsultationData, isLoading: isLoadingConsultationHistory } = useQuery({
    queryKey: ['ipdDashboardConsultationHistory', consultationPatientId],
    queryFn: async () => {
      if (!consultationPatientId) return null;
      const res = await api.get(`/operations/patients/${consultationPatientId}/history`);
      return res.data?.data || null;
    },
    enabled: Boolean(activeHistoryAdmission && consultationPatientId),
    staleTime: 0
  });

  // Original details of patient for the consultation history header
  const effectivePatient = useMemo(() => {
    if (!activeHistoryAdmission) return null;
    const pFromAdm = typeof activeHistoryAdmission.patientId === 'object' && activeHistoryAdmission.patientId !== null
      ? activeHistoryAdmission.patientId
      : (typeof activeHistoryAdmission.raw?.patientId === 'object' ? activeHistoryAdmission.raw.patientId : null);
    const pFromHistory = patientConsultationData?.patient;
    const row = activeHistoryAdmission;

    const rawAge = pFromAdm?.age || pFromHistory?.age || row.age || '';
    const cleanAge = typeof rawAge === 'string' ? rawAge.replace(/[^0-9]/g, '') : rawAge;

    return {
      _id: pFromAdm?._id || pFromHistory?._id || row.patientId || row._id,
      name: pFromAdm?.name || pFromHistory?.name || row.patientName || 'Patient',
      gender: pFromAdm?.gender || pFromHistory?.gender || row.gender || 'N/A',
      age: cleanAge || 'N/A',
      uhid: pFromAdm?.uhid || pFromHistory?.uhid || row.uhid || 'N/A',
      bloodGroup: pFromAdm?.bloodGroup || pFromHistory?.bloodGroup || row.bloodGroup || ''
    };
  }, [activeHistoryAdmission, patientConsultationData]);

  // Synthesize history with current IPD admission encounter and daily reviews
  const effectivePatientHistory = useMemo(() => {
    if (!activeHistoryAdmission) return null;
    const rawHistory = patientConsultationData || {};
    const existingConsultations = [...(rawHistory.consultations || [])];

    const adm = activeHistoryAdmission.raw || activeHistoryAdmission;

    // 1. Synthesize all Daily Reviews from the admission into consultation cards
    const dailyReviewsList = Array.isArray(adm.dailyReviews) ? adm.dailyReviews : [];
    const dailyConsultationCards = dailyReviewsList.map((review, idx) => {
      const dayNum = review.dayNumber || (idx + 1);
      const reviewDate = review.reviewDate || review.createdAt || adm.admissionDate || new Date();
      const reviewDoctorName = review.doctorName || review.doctorId?.name || adm.attendingDoctorId?.name || (user?.name ? `Dr. ${user.name}` : 'Inpatient Consultant');

      const formattedPrescriptions = (review.prescriptions || []).map(p => ({
        medicineName: p.medicineName || 'Medicine',
        dosage: p.dose || p.dosage || p.frequency || '1-0-1',
        morning: (p.dose && p.dose.split('-')[0]) || '1',
        afternoon: (p.dose && p.dose.split('-')[1]) || '0',
        night: (p.dose && p.dose.split('-')[2]) || '1',
        duration: p.duration || '3 Days',
        foodTiming: p.instructions || p.foodTiming || 'After Food',
        instructions: p.instructions || 'After Food',
        quantity: p.quantity !== undefined ? p.quantity : 1,
        notes: p.remarks || p.notes || p.pharmacyStatus || '—'
      }));

      return {
        _id: review._id || `${adm._id}_review_${dayNum}`,
        isIPDDailyReview: true,
        dayNumber: dayNum,
        createdAt: reviewDate,
        date: reviewDate,
        reviewTime: review.reviewTime,
        doctorId: { name: reviewDoctorName },
        doctorName: reviewDoctorName,
        doctorSpecialization: `IPD Daily Consultation (Round ${dayNum})`,
        hospitalName: 'In-Patient Department',
        wardBed: adm.bedId ? `Bed ${adm.bedId?.bedNumber || ''}` : '',
        diagnosis: review.diagnosis || adm.finalDiagnosis || adm.reasonForAdmission || 'Daily Inpatient Consultation',
        chiefComplaint: review.chiefComplaints || adm.reasonForAdmission || `Round ${dayNum} Inpatient Daily Review`,
        clinicalNotes: review.clinicalFindings || review.assessment || 'Inpatient clinical observation and progress monitored.',
        advice: review.treatmentPlan || review.assessment || '',
        vitals: review.vitals || adm.vitals || {},
        prescriptions: formattedPrescriptions,
        investigations: review.investigations || []
      };
    });

    // 2. Add Inpatient Admission card only if not already present in history
    const hasAdmissionEncounter = existingConsultations.some(c => 
      (c.isIPDAdmission || c.isIPDEncounter || c.isIpd) &&
      (String(c._id) === String(adm._id) || String(c.admissionId) === String(adm.admissionId))
    );

    const admissionEncounterCards = [];
    if (!hasAdmissionEncounter) {
      const wardBed = adm.bedId
        ? `${adm.bedId?.wardId?.name || 'Ward'} - Bed ${adm.bedId?.bedNumber || '—'}`
        : 'Inpatient Bed';

      const doctorName = adm.attendingDoctorId?.name || (user?.name ? `Dr. ${user.name}` : 'Attending Doctor');
      const cleanAdmissionNotes = (adm.admissionNotes || '')
        .replace(/Dr\.\s+Dr\./gi, 'Dr.')
        .trim();

      admissionEncounterCards.push({
        _id: adm._id,
        isIPDEncounter: true,
        isIPDAdmission: true,
        admissionId: adm.admissionId,
        admissionType: adm.admissionType || 'Inpatient Admission',
        wardBed,
        bedLabel: wardBed,
        createdAt: adm.admissionDate || adm.createdAt || new Date(),
        date: adm.admissionDate || adm.createdAt || new Date(),
        doctorId: { name: doctorName },
        doctorName: doctorName,
        doctorSpecialization: 'In-Patient Department',
        hospitalName: 'In-Patient Department',
        diagnosis: adm.finalDiagnosis || adm.reasonForAdmission || 'Inpatient Admission',
        chiefComplaint: adm.reasonForAdmission || 'Inpatient Admission & Care',
        clinicalNotes: cleanAdmissionNotes || (adm.reasonForAdmission ? `Admitted for ${adm.reasonForAdmission}.` : 'Inpatient admission and monitoring.'),
        advice: adm.dischargeInstructions || adm.treatmentSummary || '',
        vitals: adm.patientId?.vitals || adm.vitals || null,
        prescriptions: [],
        investigations: []
      });
    }

    // Merge daily consultation cards with existing consultations (preventing duplicates by round/encounter key)
    const existingRoundKeys = new Set(
      existingConsultations
        .filter(c => c.isIPDDailyReview)
        .map(c => `round_${c.admissionId || adm.admissionId || ''}_${c.dayNumber || c.roundNumber || 1}`)
    );
    const existingIds = new Set(existingConsultations.map(c => String(c._id)));
    const newDailyCards = dailyConsultationCards.filter(c => 
      !existingRoundKeys.has(`round_${c.admissionId || adm.admissionId || ''}_${c.dayNumber || 1}`) && 
      !existingIds.has(String(c._id))
    );

    const combinedList = [...newDailyCards, ...admissionEncounterCards, ...existingConsultations];
    // Sort chronologically newest first
    combinedList.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    return {
      ...rawHistory,
      consultations: combinedList,
      snapshots: combinedList // Crucial: PatientHistoryDrawer prioritizes snapshots
    };
  }, [activeHistoryAdmission, patientConsultationData, user?.name]);

  // Hospital-specific IPD enablement verification
  const isIpdEnabled = isIpdAvailable(user?.hospital);

  if (!isIpdEnabled) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-4 border border-amber-200">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">In-Patient Department (IPD) Disabled</h2>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          The In-Patient Department feature is not enabled for your assigned hospital. Please contact your hospital administrator.
        </p>
      </div>
    );
  }

  const inpatientsRoute = isDoctorDesk 
    ? (ROUTES.DOCTOR?.IPD_INPATIENTS || '/doctor/ipd/inpatients')
    : (ROUTES.RECEPTION?.IPD_INPATIENTS || '/reception/ipd/inpatients');

  const wardsRoute = isDoctorDesk
    ? (ROUTES.DOCTOR?.IPD_WARDS || '/doctor/ipd/wards')
    : (ROUTES.RECEPTION?.IPD_WARDS || '/reception/ipd/wards');

  return (
    <div className="min-h-screen bg-[#f8fafc] px-2.5 sm:px-3 lg:px-4 pt-1 sm:pt-2 pb-6 space-y-6 -mt-2 sm:-mt-4">
      <IPDDepartmentDashboard
        onViewAllAdmissions={() => navigate(`${inpatientsRoute}?status=All`)}
        onFilterAdmitted={() => navigate(`${inpatientsRoute}?status=Admitted`)}
        onFilterPending={() => navigate(`${inpatientsRoute}?status=Waiting`)}
        onRegisterAdmission={() => navigate(`${inpatientsRoute}?admit=true`)}
        onSearchPatient={() => navigate(`${inpatientsRoute}?status=All`)}
        onManageBeds={() => navigate(wardsRoute)}
        onSelectAdmission={(adm) => setSelectedAdmission(adm)}
        onOpenDischarge={(adm) => setDischargeAdmission(adm)}
        onOpenConsultation={(adm) => {
          const admId = adm?._id || adm?.id || adm;
          if (admId) {
            navigate(`/doctor/consultation/${admId}?type=ipd&mode=consultation`);
          }
        }}
        onOpenDailyConsultation={(adm) => setConsultationAdmission(adm)}
        onViewHistory={(adm) => {
          setVisitHistoryAdmission(adm);
        }}
        isDoctorDesk={isDoctorDesk}
        user={user}
      />

      {/* Unified Inpatient Details Modal for Admission Details */}
      {selectedAdmission && (
        <InpatientDetailsModal
          isOpen={Boolean(selectedAdmission)}
          onClose={() => setSelectedAdmission(null)}
          admission={selectedAdmission}
          isDoctorDesk={isDoctorDesk}
          onOpenDoctorRound={(adm) => {
            setSelectedAdmission(null);
            setConsultationAdmission(adm);
          }}
          onOpenConsultation={(adm) => {
            const admId = adm?._id || adm?.id || adm;
            if (admId) {
              navigate(`/doctor/consultation/${admId}?type=ipd&mode=consultation`);
            }
          }}
          onOpenDischarge={(adm) => {
            setSelectedAdmission(null);
            setDischargeAdmission(adm);
          }}
        />
      )}

      {/* Discharge Workspace Modal if triggered from Dashboard (Doctor Desk uses Clinical Summary, Reception uses Billing Settlement) */}
      {dischargeAdmission && (
        isDoctorDesk ? (
          <IPDDoctorDischargeSummaryModal
            isOpen={Boolean(dischargeAdmission)}
            onClose={() => setDischargeAdmission(null)}
            admission={dischargeAdmission}
            user={user}
            onAdmissionUpdated={() => {
              setDischargeAdmission(null);
              queryClient.invalidateQueries({ queryKey: ['ipd'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
            }}
          />
        ) : (
          <IPDDischargeWorkspaceModal
            isOpen={Boolean(dischargeAdmission)}
            onClose={() => setDischargeAdmission(null)}
            admission={dischargeAdmission}
            user={user}
            onAdmissionUpdated={() => {
              setDischargeAdmission(null);
              queryClient.invalidateQueries({ queryKey: ['ipd'] });
              queryClient.invalidateQueries({ queryKey: ['ipd-beds'] });
            }}
          />
        )
      )}

      {/* IPD Daily Consultation & Prescription Details Modal */}
      {consultationAdmission && (
        <IPDDailyConsultationModal
          isOpen={Boolean(consultationAdmission)}
          onClose={() => {
            setConsultationAdmission(null);
            setIsOpdHistoryDrawerOpen(false);
          }}
          admission={consultationAdmission.raw ? { ...consultationAdmission.raw, ...consultationAdmission } : consultationAdmission}
          user={user}
          onOpenOpdHistory={() => setIsOpdHistoryDrawerOpen(true)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['ipd'] });
            queryClient.invalidateQueries({ queryKey: ['ipd-admissions'] });
            queryClient.invalidateQueries({ queryKey: ['ipd', 'dashboardLiveStatus'] });
          }}
        />
      )}

      {/* Patient OPD & IPD Consultation History Drawer */}
      <PatientHistoryDrawer
        isOpen={Boolean(visitHistoryAdmission || (isOpdHistoryDrawerOpen && consultationAdmission))}
        onClose={() => {
          setVisitHistoryAdmission(null);
          setIsOpdHistoryDrawerOpen(false);
        }}
        isLoading={isLoadingConsultationHistory}
        patient={effectivePatient}
        patientHistory={effectivePatientHistory}
      />
    </div>
  );
};

export default IPDDepartmentPage;
