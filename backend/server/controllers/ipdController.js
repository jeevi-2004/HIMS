
const normalizeFoodTiming = (val) => {
  if (!val) return 'After Food';
  const str = String(val).trim().toLowerCase();
  if (str.includes('before') || str === 'ac' || str.includes('empty') || str.includes('fasting')) {
    return 'Before Food';
  }
  if (str.includes('with') || str === 'cc' || str.includes('during')) {
    return 'With Food';
  }
  if (str.includes('after') || str === 'pc') {
    return 'After Food';
  }
  return 'After Food';
};

const mongoose = require('mongoose');
const IPDWard = require('../models/IPDWard');
const IPDBed = require('../models/IPDBed');
const IPDAdmission = require('../models/IPDAdmission');
const Medicine = require('../models/Medicine');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const { tenantLocalStorage } = require('../utils/tenantModel');
const { isIpdAvailable } = require('../utils/featureUtils');
const {
  getHospitalTimezone,
  getHospitalDayRange,
  mapToQueueStatus,
  formatDoctorName,
  formatRecentAdmission
} = require('../utils/ipdHelpers');
const WorkflowEventHub = require('../services/WorkflowEventHub');

// -----------------------------------------
// Wards
// -----------------------------------------

exports.getWards = async (req, res) => {
  try {
    const wards = await IPDWard.find({ hospitalId: req.hospitalId, isActive: true });
    wards.sort((a, b) => {
      const nameA = (a.name || a.code || '').trim();
      const nameB = (b.name || b.code || '').trim();
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
    res.json(wards);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wards', error: error.message });
  }
};

exports.createWard = async (req, res) => {
  try {
    if (req.body.code) {
      const existingWardCode = await IPDWard.findOne({
        hospitalId: req.hospitalId,
        code: req.body.code.trim().toUpperCase(),
        isActive: true
      });
      if (existingWardCode) {
        return res.status(400).json({ message: `Ward code "${req.body.code}" already exists in this hospital` });
      }
    }

    const newWard = new IPDWard({
      ...req.body,
      hospitalId: req.hospitalId,
      branchId: req.branchId,
      createdBy: req.user._id
    });
    const savedWard = await newWard.save();
    res.status(201).json(savedWard);
  } catch (error) {
    res.status(500).json({ message: 'Error creating ward', error: error.message });
  }
};

exports.updateWard = async (req, res) => {
  try {

    const updatedWard = await IPDWard.findOneAndUpdate(
      { _id: req.params.id, hospitalId: req.hospitalId },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    if (!updatedWard) return res.status(404).json({ message: 'Ward not found' });
    res.json(updatedWard);
  } catch (error) {
    res.status(500).json({ message: 'Error updating ward', error: error.message });
  }
};

exports.deleteWard = async (req, res) => {
  try {

    // Check if any active beds exist in this ward

    const bedsInWard = await IPDBed.countDocuments({ wardId: req.params.id, isActive: true, hospitalId: req.hospitalId });
    if (bedsInWard > 0) {
      return res.status(400).json({ message: 'Cannot delete ward with active beds' });
    }
    
    const deletedWard = await IPDWard.findOneAndUpdate(
      { _id: req.params.id, hospitalId: req.hospitalId },
      { isActive: false, updatedBy: req.user._id },
      { new: true }
    );
    if (!deletedWard) return res.status(404).json({ message: 'Ward not found' });
    res.json({ message: 'Ward deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting ward', error: error.message });
  }
};

// -----------------------------------------
// Beds
// -----------------------------------------

exports.getBeds = async (req, res) => {
  try {
    const rawBeds = await IPDBed.find({ hospitalId: req.hospitalId, isActive: true })
                                   .populate('wardId', 'name code type building floor baseCharges dailyBaseRate nursingRate')
                                   .populate({
                                      path: 'currentAdmissionId',
                                      select: 'patientId admissionId admissionDate status',
                                      populate: {
                                        path: 'patientId',
                                        select: 'name uhid age gender'
                                      }
                                   });

    const bedsToRelease = [];
    const beds = rawBeds.map(bedDoc => {
      const bed = bedDoc.toObject ? bedDoc.toObject() : { ...bedDoc };
      const currentAdm = bed.currentAdmissionId;

      // Bed is genuinely occupied ONLY if it has an active admission with status === 'Admitted'
      const hasActiveAdmission = currentAdm && currentAdm.status === 'Admitted';

      if (bed.status === 'Occupied' && !hasActiveAdmission) {
        // Discharged, cancelled, or missing admission: release bed and mark Available
        bedsToRelease.push(bed._id);
        bed.status = 'Available';
        bed.currentAdmissionId = null;
      } else if (bed.status !== 'Occupied' && currentAdm && currentAdm.status !== 'Admitted') {
        // Bed is not occupied but retains stale reference to discharged/cancelled admission
        bedsToRelease.push(bed._id);
        bed.currentAdmissionId = null;
      }

      return bed;
    });

    // Asynchronously heal stale bed documents in the database
    if (bedsToRelease.length > 0) {
      IPDBed.updateMany(
        { _id: { $in: bedsToRelease } },
        { 
          $set: { status: 'Available' },
          $unset: { currentAdmissionId: 1 }
        }
      ).catch(err => console.warn('Auto-healing stale beds warning:', err.message));
    }

    beds.sort((a, b) => {
      // First sort by ward name
      const wardA = (a.wardId?.name || a.wardId?.code || '').trim();
      const wardB = (b.wardId?.name || b.wardId?.code || '').trim();
      const wardCmp = wardA.localeCompare(wardB, undefined, { numeric: true, sensitivity: 'base' });
      if (wardCmp !== 0) return wardCmp;

      // Second sort by room number
      const roomA = (a.roomNumber || (a.bedNumber ? `R-${a.bedNumber.split('-')[1] || a.bedNumber}` : '')).trim();
      const roomB = (b.roomNumber || (b.bedNumber ? `R-${b.bedNumber.split('-')[1] || b.bedNumber}` : '')).trim();
      if (roomA && roomB) {
        const roomCmp = roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: 'base' });
        if (roomCmp !== 0) return roomCmp;
      } else if (roomA && !roomB) {
        return -1;
      } else if (!roomA && roomB) {
        return 1;
      }

      // Third sort by bed number
      const bedA = (a.bedNumber || '').trim();
      const bedB = (b.bedNumber || '').trim();
      return bedA.localeCompare(bedB, undefined, { numeric: true, sensitivity: 'base' });
    });

    res.json(beds);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching beds', error: error.message });
  }
};

exports.createBed = async (req, res) => {
  try {

    
    // Check duplicate bed number within ward
    const existingBed = await IPDBed.findOne({ wardId: req.body.wardId, bedNumber: req.body.bedNumber, hospitalId: req.hospitalId, isActive: true });
    if (existingBed) {
      return res.status(400).json({ message: 'Bed number already exists in this ward' });
    }

    const newBed = new IPDBed({
      ...req.body,
      hospitalId: req.hospitalId,
      branchId: req.branchId,
      createdBy: req.user._id
    });
    const savedBed = await newBed.save();
    res.status(201).json(savedBed);
  } catch (error) {
    res.status(500).json({ message: 'Error creating bed', error: error.message });
  }
};

exports.updateBed = async (req, res) => {
  try {

    const updatedBed = await IPDBed.findOneAndUpdate(
      { _id: req.params.id, hospitalId: req.hospitalId },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    if (!updatedBed) return res.status(404).json({ message: 'Bed not found' });
    res.json(updatedBed);
  } catch (error) {
    res.status(500).json({ message: 'Error updating bed', error: error.message });
  }
};

exports.deleteBed = async (req, res) => {
  try {

    const bed = await IPDBed.findOne({ _id: req.params.id, hospitalId: req.hospitalId });
    if (!bed) return res.status(404).json({ message: 'Bed not found' });

    if (bed.status === 'Occupied' || bed.currentAdmissionId) {
      return res.status(400).json({ message: 'Cannot delete an occupied bed' });
    }

    bed.isActive = false;
    bed.updatedBy = req.user._id;
    await bed.save();

    res.json({ message: 'Bed deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting bed', error: error.message });
  }
};

// -----------------------------------------
// Admissions & Discharges
// -----------------------------------------

exports.getAdmissions = async (req, res) => {
  try {
    const { status, startDate, endDate, doctorId, dischargeSummaryStatus, queueStatus, consultationStatus } = req.query;
    let query = { hospitalId: req.hospitalId, isActive: true };

    // Determine doctor-scoped filtering
    // Receptionist and Admin desk see ALL doctors' admissions by default (unless explicitly filtering by doctorId)
    // Doctor desk strictly sees ONLY admissions where this doctor is the attending or visited doctor
    const userRole = (req.user?.roleId?.name || req.user?.role || '').toUpperCase();
    const isPureDoctor = userRole === 'DOCTOR';
    const isDoctorAdmin = userRole === 'DOCTOR_ADMIN';
    const isDoctorWorkspace = req.query.scope === 'my_desk' || 
                              req.headers['x-workspace-mode'] === 'clinical_consultation' || 
                              req.headers['referer']?.includes('/doctor/') ||
                              Boolean(doctorId);
    const isReception = ['RECEPTIONIST', 'RECEPTION'].includes(userRole) || 
                        req.headers['referer']?.includes('/reception/');

    if (status && status !== 'All') {
      if (status === 'Completed') {
        query.status = 'Admitted';
        query.$or = [
          { dischargeSummaryStatus: 'Sent to Reception' },
          { dischargeSummaryStatus: 'Completed' }
        ];
      } else if (status === 'Pending Discharge') {
        query.status = 'Admitted';
        query.$or = [
          { dischargeSummaryStatus: 'Sent to Reception' }
        ];
      } else if (status === 'Admitted') {
        query.status = 'Admitted';
        if (isDoctorWorkspace || isPureDoctor) {
          query.dischargeSummaryStatus = { $nin: ['Sent to Reception', 'Completed'] };
        } else if (isReception) {
          query.dischargeSummaryStatus = { $ne: 'Sent to Reception' };
        }
      } else {
        query.status = status;
      }
    }
    if (dischargeSummaryStatus) query.dischargeSummaryStatus = dischargeSummaryStatus;
    if (queueStatus) query.queueStatus = queueStatus;
    if (consultationStatus) query.consultationStatus = consultationStatus;
    
    if (startDate || endDate) {
      query.admissionDate = {};
      if (startDate) query.admissionDate.$gte = new Date(startDate);
      if (endDate) query.admissionDate.$lte = new Date(endDate);
    }

    let targetDoctorId = null;
    if (!isReception && req.query.all !== 'true') {
      if (doctorId && doctorId !== 'all') {
        targetDoctorId = doctorId;
      } else if (isPureDoctor || (isDoctorAdmin && isDoctorWorkspace)) {
        targetDoctorId = req.user?._id;
      }
    }

    if (targetDoctorId) {
      const mongoose = require('mongoose');
      const docObjId = mongoose.Types.ObjectId.isValid(targetDoctorId)
        ? new mongoose.Types.ObjectId(targetDoctorId)
        : targetDoctorId;

      const docOr = [
        { attendingDoctorId: targetDoctorId },
        { attendingDoctorId: docObjId },
        { visitedDoctorIds: targetDoctorId },
        { visitedDoctorIds: docObjId }
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: docOr }];
        delete query.$or;
      } else {
        query.$or = docOr;
      }
    }

    const admissions = await IPDAdmission.find(query)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode allergies diagnosis medicalAlerts email address')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType dailyCharge wardId equipment status',
        populate: { path: 'wardId', select: 'name type code building floor baseCharges dailyBaseRate nursingRate' }
      })
      .sort({ admissionDate: -1 });

    // Normalize and auto-heal paymentStatus for completed/fully settled/paid admissions
    for (const adm of admissions) {
      const tot = Number(adm.billingDetails?.totalBill) || 0;
      const pd = Number(adm.amountPaid) || 0;
      const isSettled = adm.billingDetails?.settlementException?.reason?.toLowerCase().includes('fully settled') ||
                        adm.dischargeSummaryStatus === 'Completed' ||
                        adm.status === 'Discharged';
      if ((tot > 0 && pd >= tot) || (isSettled && (pd >= tot || tot > 0))) {
        if (adm.paymentStatus !== 'Paid' || (isSettled && pd < tot)) {
          adm.paymentStatus = 'Paid';
          if (pd < tot && tot > 0) {
            adm.amountPaid = tot;
          }
          IPDAdmission.updateOne(
            { _id: adm._id },
            { $set: { paymentStatus: 'Paid', amountPaid: adm.amountPaid } }
          ).exec().catch(() => {});
        }
      }
    }

    res.json(admissions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admissions', error: error.message });
  }
};

exports.getAdmissionById = async (req, res) => {
  try {
    const admission = await IPDAdmission.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId,
      isActive: true
    })
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode allergies diagnosis medicalAlerts email address vitals')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType dailyCharge wardId equipment status',
        populate: { path: 'wardId', select: 'name type code building floor baseCharges dailyBaseRate nursingRate' }
      })
      .populate('billingDetails.paymentTransactions.recordedBy', 'name firstName lastName')
      .populate('billingDetails.billingItems.addedBy', 'name firstName lastName');

    if (!admission) {
      return res.status(404).json({ success: false, message: 'IPD Admission not found' });
    }

    // Auto-sync completed doctor consultations & investigations into dailyReviews
    try {
      const Consultation = req.tenantDb ? req.tenantDb.model('Consultation') : require('../models/Consultation');
      const Prescription = req.tenantDb ? req.tenantDb.model('Prescription') : require('../models/Prescription');

      const patId = admission.patientId?._id || admission.patientId;
      if (patId) {
        const consultFilter = {
          hospitalId: req.hospitalId,
          $or: [
            { appointmentId: admission._id },
            ...(admission.admissionId && mongoose.Types.ObjectId.isValid(admission.admissionId) ? [{ appointmentId: admission.admissionId }] : []),
            { patientId: patId, isIpd: true }
          ]
        };
        if (admission.admissionDate) {
          const startAdm = new Date(admission.admissionDate);
          startAdm.setHours(0, 0, 0, 0);
          consultFilter.createdAt = { $gte: startAdm };
        }

        const consultations = await Consultation.find(consultFilter)
          .populate('doctorId', 'name doctorProfile department specialization')
          .sort({ createdAt: 1 });

        if (consultations && consultations.length > 0) {
          if (!Array.isArray(admission.dailyReviews)) admission.dailyReviews = [];
          let hasNewReviews = false;

          for (const c of consultations) {
            const cTime = new Date(c.createdAt || c.date || Date.now()).getTime();
            const existingReview = admission.dailyReviews.find(r => {
              if (r.consultationId && String(r.consultationId) === String(c._id)) return true;
              const rDiag = (r.diagnosis || '').trim().toLowerCase();
              const cDiag = (c.diagnosis || c.primaryDiagnosis || '').trim().toLowerCase();
              if (rDiag && cDiag && rDiag === cDiag) return true;
              const rTime = new Date(r.reviewDate || r.createdAt || 0).getTime();
              return Math.abs(rTime - cTime) < 12 * 60 * 60 * 1000;
            });

            if (!existingReview) {
              const rxDoc = await Prescription.findOne({ consultationId: c._id });
              const rxItems = (rxDoc?.items || []).map(p => ({
                medicineName: p.medicineName || '',
                dose: p.dosage || p.strength || '',
                route: p.route || 'Oral',
                frequency: p.frequency || 'Once daily',
                duration: p.duration || '3 days',
                instructions: normalizeFoodTiming(p.instructions || p.foodTiming),
                foodTiming: normalizeFoodTiming(p.foodTiming || p.instructions),
                quantity: Number(p.quantity || 1),
                pharmacyStatus: rxDoc?.status === 'Sent to Pharmacy' || rxDoc?.status === 'Dispensed' ? rxDoc.status : 'Pending'
              }));

              const revDate = c.createdAt || new Date();
              const dObj = new Date(revDate);
              let hours = dObj.getHours();
              const minutes = String(dObj.getMinutes()).padStart(2, '0');
              const ampm = hours >= 12 ? 'PM' : 'AM';
              hours = hours % 12 || 12;
              const revTime = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

              const docName = c.doctorId?.name
                ? (c.doctorId.name.startsWith('Dr.') ? c.doctorId.name : `Dr. ${c.doctorId.name}`)
                : 'Attending Doctor';

              const synchedReview = {
                dayNumber: Number(c.dayNumber || c.roundNumber) || (admission.dailyReviews.length + 1),
                reviewDate: revDate,
                reviewTime: revTime,
                doctorId: c.doctorId?._id || c.doctorId,
                doctorName: docName,
                chiefComplaints: c.chiefComplaint || c.diagnosis || '',
                diagnosis: c.diagnosis || c.primaryDiagnosis || '',
                clinicalFindings: c.clinicalNotes || c.examinationFindings || '',
                assessment: c.assessmentNotes || c.clinicalNotes || 'Doctor consultation completed.',
                assessmentPlan: c.assessmentNotes || c.clinicalNotes || '',
                treatmentPlan: c.advice || '',
                vitals: {
                  bp: c.vitals?.bpSystolic && c.vitals?.bpDiastolic ? `${c.vitals.bpSystolic}/${c.vitals.bpDiastolic}` : (c.vitals?.bp || ''),
                  pulse: c.vitals?.pulse || '',
                  temperature: c.vitals?.temperature || '',
                  spo2: c.vitals?.spo2 || ''
                },
                prescriptions: rxItems,
                investigations: Array.isArray(c.investigations) ? c.investigations : [],
                statusBadge: 'Doctor Consulted',
                consultationId: c._id,
                isDraft: false,
                createdAt: revDate,
                updatedAt: new Date()
              };

              admission.dailyReviews.push(synchedReview);
              hasNewReviews = true;
            } else {
              // Ensure notes, findings, investigations and prescriptions are synced onto existingReview if missing
              let revUpdated = false;
              if (!existingReview.clinicalFindings || existingReview.clinicalFindings.trim() === '') {
                const parts = [];
                if (existingReview.generalCondition) parts.push(`Condition: ${existingReview.generalCondition}`);
                if (existingReview.consciousnessLevel) parts.push(`Consciousness: ${existingReview.consciousnessLevel}`);
                if (existingReview.painScore) parts.push(`Pain: ${existingReview.painScore}`);
                existingReview.clinicalFindings = c.clinicalNotes || (parts.length > 0 ? parts.join(' | ') : '');
                revUpdated = true;
              }
              if ((!existingReview.assessment || existingReview.assessment === 'Doctor consultation completed.') && (existingReview.assessmentPlan || c.clinicalNotes)) {
                existingReview.assessment = existingReview.assessmentPlan || c.clinicalNotes;
                revUpdated = true;
              }
              if (!existingReview.treatmentPlan && (c.advice || existingReview.instructions)) {
                existingReview.treatmentPlan = c.advice || existingReview.instructions;
                revUpdated = true;
              }
              if ((!existingReview.investigations || existingReview.investigations.length === 0) && Array.isArray(c.investigations) && c.investigations.length > 0) {
                existingReview.investigations = c.investigations;
                revUpdated = true;
              }
              if ((!existingReview.prescriptions || existingReview.prescriptions.length === 0)) {
                const rxDoc = await Prescription.findOne({ consultationId: c._id });
                if (rxDoc?.items && rxDoc.items.length > 0) {
                  existingReview.prescriptions = rxDoc.items.map(p => ({
                    medicineName: p.medicineName || '',
                    dose: p.dosage || p.strength || '',
                    route: p.route || 'Oral',
                    frequency: p.frequency || 'Once daily',
                    duration: p.duration || '3 days',
                    instructions: normalizeFoodTiming(p.instructions || p.foodTiming),
                    foodTiming: normalizeFoodTiming(p.foodTiming || p.instructions),
                    quantity: Number(p.quantity || 1),
                    pharmacyStatus: rxDoc?.status === 'Sent to Pharmacy' || rxDoc?.status === 'Dispensed' ? rxDoc.status : 'Pending'
                  }));
                  revUpdated = true;
                }
              }
              if (revUpdated) hasNewReviews = true;
            }
          }

          if (hasNewReviews) {
            if (!admission.clinicalWorkload) {
              admission.clinicalWorkload = { doctorRounds: admission.dailyReviews.length, labTests: 0, imagingScans: 0, medsPrescribed: 0 };
            } else {
              admission.clinicalWorkload.doctorRounds = Math.max(admission.clinicalWorkload.doctorRounds || 0, admission.dailyReviews.length);
            }
            await admission.save();
          }
        }
      }
    } catch (syncErr) {
      console.warn('Auto-sync doctor consultations in getAdmissionById note:', syncErr.message);
    }

    // Auto-sync any investigations selected during doctor rounds or consultations into IPD billingItems
    let hasBillingItemsChanged = false;
    if (!admission.billingDetails) admission.billingDetails = {};
    if (!Array.isArray(admission.billingDetails.billingItems)) admission.billingDetails.billingItems = [];

    // 1. Scan dailyReviews for investigations and aggregate quantities across rounds
    const reviewInvCounts = new Map();
    if (Array.isArray(admission.dailyReviews)) {
      for (const rev of admission.dailyReviews) {
        if (Array.isArray(rev.investigations) && rev.investigations.length > 0) {
          for (const inv of rev.investigations) {
            const invName = inv.name || inv.serviceName;
            if (!invName) continue;
            const key = invName.trim().toLowerCase();
            const invPrice = Number(inv.price || inv.unitPrice || inv.amount || 0);
            const isRad = (inv.serviceType || inv.category || '').toLowerCase().includes('radiology') ||
                          (inv.serviceType || inv.category || '').toLowerCase().includes('imaging') ||
                          invName.toLowerCase().includes('x-ray') ||
                          invName.toLowerCase().includes('scan') ||
                          invName.toLowerCase().includes('ultrasound') ||
                          invName.toLowerCase().includes('mri') ||
                          invName.toLowerCase().includes('ct');
            const invCategory = isRad ? 'Radiology' : 'Laboratory';

            if (reviewInvCounts.has(key)) {
              const item = reviewInvCounts.get(key);
              item.count += 1;
              if (invPrice > 0 && (!item.price || item.price === 0)) item.price = invPrice;
              if (rev.dayNumber) item.rounds.push(rev.dayNumber);
            } else {
              reviewInvCounts.set(key, {
                name: invName,
                category: invCategory,
                price: invPrice,
                count: 1,
                rounds: rev.dayNumber ? [rev.dayNumber] : [1],
                dateTime: rev.reviewDate || new Date(),
                doctorId: rev.doctorId || admission.attendingDoctorId
              });
            }
          }
        }
      }
    }

    // Now update or insert into admission.billingDetails.billingItems
    for (const [key, data] of reviewInvCounts.entries()) {
      const existingItem = admission.billingDetails.billingItems.find(
        b => (b.serviceName || '').trim().toLowerCase() === key
      );

      if (existingItem) {
        // If the review count is greater than the current recorded quantity, update quantity and amount!
        if (data.count > (existingItem.quantity || 1)) {
          const oldQty = existingItem.quantity || 1;
          const oldAmount = existingItem.amount || (oldQty * (existingItem.unitPrice || data.price));
          const unitPrice = Number(existingItem.unitPrice || data.price || 0);
          const newQty = data.count;
          const newAmount = newQty * unitPrice;
          const diff = newAmount - oldAmount;

          existingItem.quantity = newQty;
          existingItem.unitPrice = unitPrice;
          existingItem.amount = newAmount;
          existingItem.description = `Ordered across ${newQty} Rounds (${data.rounds.map(r => `Round ${r}`).join(', ')})`;

          admission.billingDetails.labCharges = (admission.billingDetails.labCharges || 0) + diff;
          admission.billingDetails.totalBill = (admission.billingDetails.totalBill || 0) + diff;
          hasBillingItemsChanged = true;
        }
      } else {
        const unitPrice = data.price;
        const totalAmount = data.count * unitPrice;
        admission.billingDetails.billingItems.push({
          serviceCategory: data.category,
          serviceName: data.name,
          description: data.count > 1 
            ? `Ordered across ${data.count} Rounds (${data.rounds.map(r => `Round ${r}`).join(', ')})`
            : `Ordered in Round ${data.rounds[0] || 1}`,
          quantity: data.count,
          unitPrice: unitPrice,
          amount: totalAmount,
          dateTime: data.dateTime,
          status: 'Added to Bill',
          isManual: false,
          addedBy: data.doctorId,
          createdAt: new Date()
        });

        admission.billingDetails.labCharges = (admission.billingDetails.labCharges || 0) + totalAmount;
        admission.billingDetails.totalBill = (admission.billingDetails.totalBill || 0) + totalAmount;
        hasBillingItemsChanged = true;
      }
    }

    // 2. Scan Consultation collection for IPD investigations linked to this admission
    try {
      const Consultation = req.tenantDb ? req.tenantDb.model('Consultation') : require('../models/Consultation');
      const targetPatientId = admission.patientId?._id || admission.patientId;
      const consultOrConditions = [
        { appointmentId: admission._id },
        { admissionId: admission._id },
        { patientId: targetPatientId, isIpd: true }
      ];
      if (admission.admissionId && mongoose.Types.ObjectId.isValid(admission.admissionId)) {
        consultOrConditions.push({ appointmentId: admission.admissionId });
        consultOrConditions.push({ admissionId: admission.admissionId });
      }

      const consultations = await Consultation.find({
        $or: consultOrConditions,
        'investigations.0': { $exists: true }
      }).lean();

      for (const consult of consultations) {
        if (Array.isArray(consult.investigations)) {
          for (const inv of consult.investigations) {
            const invName = inv.name || inv.serviceName;
            if (!invName) continue;
            const alreadyExists = admission.billingDetails.billingItems.some(
              b => (b.serviceName || '').toLowerCase() === invName.toLowerCase()
            );
            if (!alreadyExists) {
              const invPrice = Number(inv.price || inv.unitPrice || inv.amount || 0);
              const isRad = (inv.serviceType || inv.category || '').toLowerCase().includes('radiology') ||
                            (inv.serviceType || inv.category || '').toLowerCase().includes('imaging') ||
                            invName.toLowerCase().includes('x-ray') ||
                            invName.toLowerCase().includes('scan') ||
                            invName.toLowerCase().includes('ultrasound') ||
                            invName.toLowerCase().includes('mri') ||
                            invName.toLowerCase().includes('ct');
              const invCategory = isRad ? 'Radiology' : 'Laboratory';

              admission.billingDetails.billingItems.push({
                serviceCategory: invCategory,
                serviceName: invName,
                description: `Ordered in Doctor Consultation (${consult.consultationType || 'IPD Care'})`,
                quantity: 1,
                unitPrice: invPrice,
                amount: invPrice,
                dateTime: consult.consultationDate || consult.createdAt || new Date(),
                status: 'Added to Bill',
                isManual: false,
                addedBy: consult.doctorId,
                createdAt: new Date()
              });
              admission.billingDetails.labCharges = (admission.billingDetails.labCharges || 0) + invPrice;
              admission.billingDetails.totalBill = (admission.billingDetails.totalBill || 0) + invPrice;
              hasBillingItemsChanged = true;
            }
          }
        }
      }
    } catch (consultErr) {
      console.warn('Consultation investigation check note:', consultErr.message);
    }

    if (hasBillingItemsChanged) {
      await IPDAdmission.updateOne(
        { _id: admission._id },
        {
          $set: {
            'billingDetails.billingItems': admission.billingDetails.billingItems,
            'billingDetails.labCharges': admission.billingDetails.labCharges,
            'billingDetails.totalBill': admission.billingDetails.totalBill
          }
        }
      );
    }

    // Auto-heal paymentStatus and amountPaid if settled or paid in full
    const tot = Number(admission.billingDetails?.totalBill) || 0;
    const pd = Number(admission.amountPaid) || 0;
    const isSettled = admission.billingDetails?.settlementException?.reason?.toLowerCase().includes('fully settled') ||
                      admission.dischargeSummaryStatus === 'Completed' ||
                      admission.status === 'Discharged';
    if ((tot > 0 && pd >= tot) || (isSettled && (pd >= tot || tot > 0))) {
      if (admission.paymentStatus !== 'Paid' || (isSettled && pd < tot)) {
        admission.paymentStatus = 'Paid';
        if (pd < tot && tot > 0) {
          admission.amountPaid = tot;
        }
        await IPDAdmission.updateOne(
          { _id: admission._id },
          { $set: { paymentStatus: 'Paid', amountPaid: admission.amountPaid } }
        );
      }
    }

    (admission.dailyReviews || []).forEach(rev => {
      if (!rev.clinicalFindings || rev.clinicalFindings.trim() === '') {
        const parts = [];
        if (rev.generalCondition) parts.push(`Condition: ${rev.generalCondition}`);
        if (rev.consciousnessLevel) parts.push(`Consciousness: ${rev.consciousnessLevel}`);
        if (rev.painScore) parts.push(`Pain: ${rev.painScore}`);
        if (parts.length > 0) rev.clinicalFindings = parts.join(' | ');
      }
      if ((!rev.assessment || rev.assessment === 'Doctor consultation completed.') && rev.assessmentPlan) {
        rev.assessment = rev.assessmentPlan;
      }
      if (!rev.treatmentPlan && rev.instructions) {
        rev.treatmentPlan = rev.instructions;
      }
    });

    res.json({ success: true, data: admission });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching admission', error: error.message });
  }
};

exports.getIpdDashboardStatus = async (req, res) => {
  try {
    let hospital = req.hospital;
    if (!hospital && req.hospitalId) {
      hospital = await Hospital.findById(req.hospitalId);
    } else if (!hospital && req.user?.hospitalId) {
      hospital = await Hospital.findById(req.user.hospitalId);
    }

    const hospitalId = req.hospitalId || hospital?._id || req.user?.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({ success: false, message: 'Hospital context is required' });
    }

    const isEnabled = isIpdAvailable(hospital);
    const timezone = getHospitalTimezone(hospital);
    const { localDateStr, startUtc, endUtc } = getHospitalDayRange(req.query.date, timezone);

    // If IPD is disabled for this hospital, return enabled: false with empty stats cleanly
    if (!isEnabled) {
      return res.json({
        success: true,
        enabled: false,
        date: localDateStr,
        totalAdmissions: 0,
        waiting: 0,
        inProgress: 0,
        completed: 0,
        recentAdmissions: []
      });
    }

    // Ensure IPD models are registered on the active tenant connection so Mongoose populate never fails
    const store = tenantLocalStorage.getStore();
    const conn = store && store.connection;
    if (conn) {
      if (!conn.models['IPDWard']) conn.model('IPDWard', IPDWard.schema);
      if (!conn.models['IPDBed']) conn.model('IPDBed', IPDBed.schema);
      if (!conn.models['IPDAdmission']) conn.model('IPDAdmission', IPDAdmission.schema);
    }

    const mongoose = require('mongoose');
    const hospitalIdObj = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : null;
    const hospitalIdFilter = hospitalIdObj ? { $in: [hospitalId, hospitalIdObj] } : hospitalId;

    // 1. Total Admissions Today
    const todayMatchQuery = {
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: { $ne: 'Cancelled' },
      admissionDate: { $gte: startUtc, $lte: endUtc }
    };
    const totalAdmissions = await IPDAdmission.countDocuments(todayMatchQuery);

    // 2. Currently Admitted (Active inpatients in hospital)
    const currentlyAdmitted = await IPDAdmission.countDocuments({
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: 'Admitted'
    });

    // 3. Discharges Today (Admissions discharged today)
    const dischargesToday = await IPDAdmission.countDocuments({
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: 'Discharged',
      $or: [
        { dischargeDate: { $gte: startUtc, $lte: endUtc } },
        { updatedAt: { $gte: startUtc, $lte: endUtc } }
      ]
    });

    // 4. Bed Occupancy & Maintenance metrics
    const allBeds = await IPDBed.find({ hospitalId: hospitalIdFilter, isActive: true })
      .populate('wardId', 'name code')
      .lean();
    const totalBeds = allBeds.length;
    const occupiedBeds = allBeds.filter(b => b.status === 'Occupied' || (b.currentAdmissionId && b.status !== 'Available')).length;
    const maintenanceBeds = allBeds.filter(b => ['Maintenance', 'Cleaning', 'Blocked'].includes(b.status)).length;
    const availableBeds = allBeds.filter(b => b.status === 'Available').length;
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // 5. Pending Admissions (waiting for bed allocation or admission process)
    const pendingAdmissions = await IPDAdmission.countDocuments({
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: { $ne: 'Cancelled' },
      $or: [
        { queueStatus: { $in: ['Waiting', 'Pending', 'Scheduled', 'WAITING', 'PENDING'] } },
        { bedId: null },
        { bedId: { $exists: false } }
      ]
    });

    // 6. Upcoming Discharges (scheduled in the next 24 hours)
    const nowTime = new Date();
    const next24h = new Date(nowTime.getTime() + 24 * 60 * 60 * 1000);
    const upcomingDischarges = await IPDAdmission.countDocuments({
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: 'Admitted',
      expectedDischargeDate: { $gte: startUtc, $lte: next24h }
    });

    // 6b. Pending Discharges (Doctor has finalized clinical summary and sent to reception)
    const pendingDischarges = await IPDAdmission.countDocuments({
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: 'Admitted',
      dischargeSummaryStatus: 'Sent to Reception'
    });

    // 7. Pending Payments (inpatient admissions with balance dues or pending payment status, excluding paid)
    const pendingPayments = await IPDAdmission.countDocuments({
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: { $ne: 'Cancelled' },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { paymentStatus: { $in: ['Pending', 'Partially Paid', 'Unpaid', 'PENDING', 'PARTIALLY_PAID', 'UNPAID'] } },
        { $expr: { $gt: ['$billingDetails.totalBill', '$amountPaid'] } }
      ]
    });

    // Determine doctor-scoped filtering
    // Receptionist and Admin desk see ALL doctors' admissions by default (unless explicitly filtering by doctorId)
    // Doctor desk strictly sees ONLY admissions where this doctor is the attending or visited doctor
    const { doctorId, scope, all } = req.query;
    const userRole = (req.user?.roleId?.name || req.user?.role || '').toUpperCase();
    const isPureDoctor = userRole === 'DOCTOR';
    const isDoctorAdmin = userRole === 'DOCTOR_ADMIN';
    const isDoctorWorkspace = scope === 'my_desk' || 
                              req.headers['x-workspace-mode'] === 'clinical_consultation' || 
                              req.headers['referer']?.includes('/doctor/') ||
                              Boolean(doctorId);
    const isReception = ['RECEPTIONIST', 'RECEPTION'].includes(userRole) || 
                        req.headers['referer']?.includes('/reception/');

    let targetDoctorId = null;
    if (!isReception && all !== 'true') {
      if (doctorId && doctorId !== 'all') {
        targetDoctorId = doctorId;
      } else if (isPureDoctor || (isDoctorAdmin && isDoctorWorkspace) || (scope === 'my_desk' && req.user?._id)) {
        targetDoctorId = req.user?._id;
      }
    }

    let doctorFilterCondition = null;
    if (targetDoctorId) {
      const cleanDocId = targetDoctorId?._id ? targetDoctorId._id.toString() : targetDoctorId.toString();
      const docObjId = mongoose.Types.ObjectId.isValid(cleanDocId)
        ? new mongoose.Types.ObjectId(cleanDocId)
        : cleanDocId;

      doctorFilterCondition = {
        $or: [
          { attendingDoctorId: cleanDocId },
          { attendingDoctorId: docObjId },
          { visitedDoctorIds: cleanDocId },
          { visitedDoctorIds: docObjId }
        ]
      };
    }

    const doctorActionQuery = {
      hospitalId: hospitalIdFilter,
      isActive: true,
      ...(doctorFilterCondition ? doctorFilterCondition : {})
    };

    // 8. Doctor's Action Center metrics
    const pendingDoctorReviews = await IPDAdmission.countDocuments({
      ...doctorActionQuery,
      status: { $in: ['Admitted', 'Waiting'] }
    });
    const todayDoctorVisits = await IPDAdmission.countDocuments({
      ...doctorActionQuery,
      status: 'Admitted'
    });
    const dischargeReviewsPending = await IPDAdmission.countDocuments({
      ...doctorActionQuery,
      status: 'Admitted',
      expectedDischargeDate: { $lte: next24h }
    });

    // 9. Today's IPD Queue Live Status records (all entry points for today or currently active inpatients)
    const baseQueueConditions = {
      $or: [
        { admissionDate: { $gte: startUtc, $lte: endUtc }, status: 'Admitted' },
        { status: 'Admitted' },
        { queueStatus: { $in: ['Waiting', 'In Progress'] }, status: { $nin: ['Discharged', 'Cancelled'] } }
      ]
    };

    const queueQuery = {
      hospitalId: hospitalIdFilter,
      isActive: true,
      status: { $nin: ['Discharged', 'Cancelled'] }
    };

    if (doctorFilterCondition) {
      queueQuery.$and = [
        baseQueueConditions,
        doctorFilterCondition
      ];
    } else {
      queueQuery.$or = baseQueueConditions.$or;
    }

    const rawQueueAdmissions = await IPDAdmission.find(queueQuery)
      .sort({ admissionDate: -1, createdAt: -1 })
      .limit(50)
      .lean();

    const patientIds = rawQueueAdmissions.map(a => a.patientId).filter(Boolean);
    const doctorIds = rawQueueAdmissions.map(a => a.attendingDoctorId).filter(Boolean);
    const bedIds = rawQueueAdmissions.map(a => a.bedId).filter(Boolean);

    // Resolve patients (supporting tenant and central DB topologies)
    let patients = await Patient.find({ _id: { $in: patientIds } })
      .select('name uhid age gender mobileNumber bloodGroup countryCode')
      .lean();
    if (patients.length < patientIds.length) {
      await tenantLocalStorage.run({ connection: null }, async () => {
        const centralPatients = await Patient.find({ _id: { $in: patientIds } })
          .select('name uhid age gender mobileNumber bloodGroup countryCode')
          .lean();
        const existingIds = new Set(patients.map(p => p._id.toString()));
        for (const cp of centralPatients) {
          if (!existingIds.has(cp._id.toString())) patients.push(cp);
        }
      });
    }
    const patientMap = new Map(patients.map(p => [p._id.toString(), p]));

    // Resolve doctors (supporting tenant users and platform_users)
    let doctors = await User.find({ _id: { $in: doctorIds } })
      .select('name firstName lastName doctorProfile')
      .lean();
    if (doctors.length < doctorIds.length) {
      await tenantLocalStorage.run({ connection: null }, async () => {
        const centralDoctors = await User.find({ _id: { $in: doctorIds } })
          .select('name firstName lastName doctorProfile')
          .lean();
        const existingDocIds = new Set(doctors.map(d => d._id.toString()));
        for (const cd of centralDoctors) {
          if (!existingDocIds.has(cd._id.toString())) doctors.push(cd);
        }
      });
    }
    const doctorMap = new Map(doctors.map(d => [d._id.toString(), d]));

    // Resolve beds and wards
    let beds = await IPDBed.find({ _id: { $in: bedIds } })
      .populate('wardId', 'name type code')
      .lean();
    if (beds.length < bedIds.length) {
      await tenantLocalStorage.run({ connection: null }, async () => {
        const centralBeds = await IPDBed.find({ _id: { $in: bedIds } })
          .populate('wardId', 'name type code')
          .lean();
        const existingBedIds = new Set(beds.map(b => b._id.toString()));
        for (const cb of centralBeds) {
          if (!existingBedIds.has(cb._id.toString())) beds.push(cb);
        }
      });
    }
    const bedMap = new Map(beds.map(b => [b._id.toString(), b]));

    const todayQueue = rawQueueAdmissions.map((adm) => {
      const p = adm.patientId ? patientMap.get(adm.patientId.toString()) : null;
      const d = adm.attendingDoctorId ? doctorMap.get(adm.attendingDoctorId.toString()) : null;
      const b = adm.bedId ? bedMap.get(adm.bedId.toString()) : null;
      const w = b?.wardId;

      return {
        _id: adm._id,
        ipdNo: adm.admissionId || `IPD-${String(adm._id).slice(-4).toUpperCase()}`,
        patientName: p?.name || 'Unknown Patient',
        uhid: p?.uhid || '-',
        age: p?.age ? `${p.age} Y` : '-',
        gender: p?.gender ? (p.gender.toUpperCase().startsWith('M') ? 'M' : p.gender.toUpperCase().startsWith('F') ? 'F' : p.gender) : '-',
        ward: w?.name || 'General Ward',
        bedNo: b?.bedNumber ? `Bed ${b.bedNumber}` : 'Unassigned',
        admissionTime: adm.admissionTime || (adm.admissionDate ? new Date(adm.admissionDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'),
        admissionDate: adm.admissionDate,
        status: adm.status || 'Admitted',
        queueStatus: mapToQueueStatus(adm),
        doctorName: formatDoctorName(d),
        attendingDoctorId: adm.attendingDoctorId,
        visitedDoctorIds: adm.visitedDoctorIds,
        dischargeSummaryStatus: adm.dischargeSummaryStatus,
        consultationStatus: adm.consultationStatus,
        consultationFinished: adm.consultationFinished,
        clinicalDischargeSummary: adm.clinicalDischargeSummary,
        raw: {
          ...adm,
          patientId: p,
          attendingDoctorId: d,
          bedId: b
        }
      };
    });

    const recentAdmissions = todayQueue.slice(0, 5).map(q => ({
      admissionId: q._id,
      patientName: q.patientName,
      uhid: q.uhid,
      admissionNumber: q.ipdNo,
      ward: q.ward,
      bed: q.bedNo,
      doctorName: q.doctorName,
      status: q.queueStatus,
      rawStatus: q.status,
      admittedAt: q.admissionDate
    }));

    return res.json({
      success: true,
      enabled: true,
      date: localDateStr,
      totalAdmissions,
      currentlyAdmitted,
      dischargesToday,
      bedStats: {
        totalBeds,
        occupiedBeds,
        maintenanceBeds,
        availableBeds,
        occupancyRate
      },
      pendingAdmissions,
      upcomingDischarges,
      pendingDischarges,
      bedMaintenance: maintenanceBeds,
      pendingPayments,
      pendingDoctorReviews: pendingDoctorReviews ?? 0,
      todayDoctorVisits: todayDoctorVisits ?? 0,
      dischargeReviewsPending: dischargeReviewsPending ?? 0,
      actionCenter: {
        pendingDoctorReviews: pendingDoctorReviews ?? 0,
        todayDoctorVisits: todayDoctorVisits ?? 0,
        dischargeReviewsPending: dischargeReviewsPending ?? 0
      },
      waiting: pendingAdmissions,
      inProgress: occupiedBeds,
      completed: dischargesToday,
      todayQueue,
      recentAdmissions
    });
  } catch (error) {
    console.error('Error fetching IPD dashboard status:', error);
    return res.status(500).json({ success: false, message: 'Error fetching IPD dashboard status', error: error.message });
  }
};

exports.admitPatient = async (req, res) => {
  try {
    const {
      patientId,
      bedId,
      attendingDoctorId,
      reasonForAdmission,
      admissionNotes,
      admissionType,
      admissionDate,
      admissionTime,
      amountMode,
      amountPaid,
      clinicalWorkload,
      queueStatus
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: 'Patient ID is required' });
    }

    const finalReason = (reasonForAdmission && reasonForAdmission.trim()) || 'Clinical observation and inpatient care';

    // Verify patient exists
    let patientDoc = await Patient.findById(patientId);
    if (!patientDoc) {
      const { tenantLocalStorage } = require('../utils/tenantModel');
      await tenantLocalStorage.run({ connection: null }, async () => {
        patientDoc = await Patient.findById(patientId);
      });
    }
    if (!patientDoc) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Verify idempotency / check if patient already has an active IPD admission in this hospital
    const existingActiveAdmission = await IPDAdmission.findOne({
      patientId,
      hospitalId: req.hospitalId,
      status: 'Admitted',
      isActive: true
    });
    if (existingActiveAdmission) {
      return res.status(400).json({
        message: `Patient is already actively admitted in IPD under Admission ID ${existingActiveAdmission.admissionId}`,
        admission: existingActiveAdmission
      });
    }

    // Verify bed is available
    if (bedId) {
      let bed = await IPDBed.findOne({ _id: bedId, hospitalId: req.hospitalId, isActive: true });
      if (!bed) {
        const { tenantLocalStorage } = require('../utils/tenantModel');
        await tenantLocalStorage.run({ connection: null }, async () => {
          bed = await IPDBed.findOne({ _id: bedId, hospitalId: req.hospitalId, isActive: true });
        });
      }
      if (!bed) return res.status(404).json({ message: 'Bed not found' });
      if (bed.status !== 'Available') {
        // Auto-heal if bed has stale occupied status (i.e. its current admission is discharged or cancelled)
        let isStale = false;
        if (bed.currentAdmissionId) {
          const adm = await IPDAdmission.findById(bed.currentAdmissionId);
          if (!adm || adm.status !== 'Admitted' || adm.isActive === false) {
            isStale = true;
          }
        } else {
          isStale = true;
        }

        if (isStale) {
          bed.status = 'Available';
          bed.currentAdmissionId = null;
          await bed.save();
        } else {
          return res.status(400).json({ message: 'Selected bed is already occupied' });
        }
      }
    }

    // Generate unique sequential admission ID with collision retry
    const admissionCount = await IPDAdmission.countDocuments({ hospitalId: req.hospitalId });
    let seq = admissionCount + 1;
    let admissionId = `IPD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
    let attempts = 0;
    while ((await IPDAdmission.findOne({ admissionId })) && attempts < 10) {
      seq += 1;
      admissionId = `IPD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
      attempts++;
    }

    let finalAdmissionDate = new Date();
    if (admissionDate) {
      if (admissionTime) {
        finalAdmissionDate = new Date(`${admissionDate}T${admissionTime}`);
        if (isNaN(finalAdmissionDate.getTime())) {
          finalAdmissionDate = new Date(admissionDate);
        }
      } else {
        finalAdmissionDate = new Date(admissionDate);
      }
      if (isNaN(finalAdmissionDate.getTime())) {
        finalAdmissionDate = new Date();
      }
    }

    const parsedTotalBill = Math.max(0, Number(req.body.totalBill) || 0);
    const parsedAmountPaid = Math.max(0, Number(amountPaid) || 0);
    let initialPaymentStatus = 'Unpaid';
    if (parsedTotalBill > 0 && parsedAmountPaid >= parsedTotalBill) {
      initialPaymentStatus = 'Paid';
    } else if (parsedAmountPaid > 0) {
      initialPaymentStatus = 'Partially Paid';
    }

    const newAdmission = new IPDAdmission({
      patientId,
      admissionId,
      bedId,
      attendingDoctorId,
      reasonForAdmission: finalReason,
      admissionNotes,
      admissionType: admissionType || 'Routine Admission',
      admissionDate: finalAdmissionDate,
      admissionTime: admissionTime || finalAdmissionDate.toTimeString().slice(0, 5),
      amountMode: amountMode || 'Cash',
      amountPaid: parsedAmountPaid,
      paymentStatus: initialPaymentStatus,
      billingDetails: {
        totalBill: parsedTotalBill,
        isCustomized: parsedTotalBill > 0,
        paymentTransactions: parsedAmountPaid > 0 ? [{
          amount: parsedAmountPaid,
          paymentMode: amountMode || 'Cash',
          notes: 'Initial admission deposit',
          recordedBy: req.user._id,
          createdAt: new Date()
        }] : []
      },
      clinicalWorkload: clinicalWorkload || {
        doctorRounds: attendingDoctorId ? 1 : 0,
        labTests: 0,
        imagingScans: 0,
        medsPrescribed: 0
      },
      status: 'Admitted',
      queueStatus: queueStatus || 'Waiting',
      hospitalId: req.hospitalId,
      branchId: req.branchId,
      createdBy: req.user._id
    });

    const savedAdmission = await newAdmission.save();

    // Mark bed as occupied
    if (bedId) {
      await IPDBed.findByIdAndUpdate(bedId, {
        status: 'Occupied',
        currentAdmissionId: savedAdmission._id,
        updatedBy: req.user._id
      });
    }

    // Populate for response & real-time notification
    const populated = await IPDAdmission.findById(savedAdmission._id)
      .populate('patientId', 'name uhid age gender mobileNumber')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        populate: { path: 'wardId', select: 'name type code' }
      });

    // Emit real-time workflow event
    try {
      WorkflowEventHub.publish('IPD_ADMISSION_CREATED', {
        admissionId: savedAdmission._id,
        admissionNumber: savedAdmission.admissionId,
        patientName: populated?.patientId?.name,
        patientId: savedAdmission.patientId,
        queueStatus: savedAdmission.queueStatus,
        status: savedAdmission.status,
        hospitalId: String(req.hospitalId)
      });
    } catch (e) {
      console.warn('WorkflowEventHub publish warning:', e.message);
    }

    res.status(201).json(populated || savedAdmission);
  } catch (error) {
    res.status(500).json({ message: 'Error admitting patient', error: error.message });
  }
};

exports.updateAdmissionQueueStatus = async (req, res) => {
  try {
    const { queueStatus, status } = req.body;
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const admission = await IPDAdmission.findOne({
      $or: [
        ...(isObjectId ? [{ _id: req.params.id }] : []),
        { admissionId: req.params.id }
      ],
      hospitalId: req.hospitalId,
      isActive: true
    });

    if (!admission) {
      return res.status(404).json({ message: 'Admission record not found' });
    }

    if (admission.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot modify admission status on a finalized discharge' });
    }

    if (queueStatus) {
      const validStatuses = ['Waiting', 'In Progress', 'Completed', 'Cancelled'];
      if (!validStatuses.includes(queueStatus)) {
        return res.status(400).json({ message: `Invalid queue status. Must be one of: ${validStatuses.join(', ')}` });
      }
      admission.queueStatus = queueStatus;
    }

    if (status) {
      admission.status = status;
    }

    // If cancelled, free up bed
    if ((queueStatus === 'Cancelled' || status === 'Cancelled') && admission.bedId) {
      await IPDBed.findByIdAndUpdate(admission.bedId, {
        status: 'Available',
        $unset: { currentAdmissionId: 1 },
        updatedBy: req.user._id
      });
    }

    admission.updatedBy = req.user._id;
    await admission.save();

    // Emit real-time event
    try {
      WorkflowEventHub.publish('IPD_ADMISSION_STATUS_UPDATED', {
        admissionId: admission._id,
        admissionNumber: admission.admissionId,
        queueStatus: admission.queueStatus,
        status: admission.status,
        hospitalId: String(req.hospitalId)
      });
    } catch (e) {}

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender')
      .populate('attendingDoctorId', 'name firstName lastName')
      .populate({
        path: 'bedId',
        populate: { path: 'wardId', select: 'name type code' }
      });

    res.json(populated || admission);
  } catch (error) {
    res.status(500).json({ message: 'Error updating admission status', error: error.message });
  }
};

exports.saveClinicalDischargeSummary = async (req, res) => {
  try {
    const admission = await IPDAdmission.findOne({ _id: req.params.id, hospitalId: req.hospitalId, isActive: true });
    if (!admission) return res.status(404).json({ message: 'Admission record not found' });

    const {
      finalDiagnosis,
      dischargeCondition,
      dischargeType,
      dischargeDate,
      dischargeTime,
      treatmentSummary,
      dischargeInstructions,
      dischargeMedicines,
      nextReviewDate,
      followupAdvice,
      referralDetails,
      status: summaryStatus // 'Draft' | 'Sent to Reception'
    } = req.body;

    if (finalDiagnosis !== undefined) admission.finalDiagnosis = finalDiagnosis;
    if (dischargeCondition !== undefined) admission.dischargeCondition = dischargeCondition;
    if (dischargeType !== undefined) admission.dischargeType = dischargeType;
    if (treatmentSummary !== undefined) {
      admission.treatmentSummary = treatmentSummary;
      admission.dischargeSummary = treatmentSummary;
    }
    if (dischargeInstructions !== undefined) admission.dischargeInstructions = dischargeInstructions;
    if (dischargeDate) {
      const parsedDate = new Date(dischargeDate);
      if (!isNaN(parsedDate.getTime())) {
        admission.dischargeDate = parsedDate;
      }
    }
    if (dischargeTime !== undefined) admission.dischargeTime = dischargeTime;
    if (dischargeMedicines !== undefined) admission.dischargeMedicines = dischargeMedicines;
    if (nextReviewDate) {
      const parsedReview = new Date(nextReviewDate);
      if (!isNaN(parsedReview.getTime())) {
        admission.nextReviewDate = parsedReview;
      }
    }
    if (followupAdvice !== undefined) admission.followupAdvice = followupAdvice;
    if (referralDetails !== undefined) admission.referralDetails = referralDetails;
    if (summaryStatus === 'Sent to Reception') {
      admission.dischargeSummaryStatus = 'Sent to Reception';
      admission.queueStatus = 'Completed';
      admission.consultationStatus = 'Completed';
      admission.consultationFinished = true;
      admission.consultationCompletedAt = new Date();

      try {
        const Appointment = require('../models/Appointment');
        await Appointment.updateMany(
          {
            $or: [
              { ipdAdmissionId: admission._id },
              { admissionId: admission._id },
              { 'metadata.ipdAdmissionId': admission._id }
            ]
          },
          {
            $set: {
              status: 'Completed',
              queueStatus: 'Completed',
              'workflow.queueState': 'COMPLETED',
              'workflow.consultationState': 'COMPLETED',
              'workflow.timestamps.completedAt': new Date()
            }
          }
        );
      } catch (apptErr) {
        console.warn('Could not update linked appointment for IPD admission:', apptErr.message);
      }
    } else if (summaryStatus !== undefined) {
      admission.dischargeSummaryStatus = summaryStatus;
    }

    admission.clinicalDischargeSummary = {
      finalDiagnosis: admission.finalDiagnosis,
      dischargeCondition: admission.dischargeCondition,
      dischargeType: admission.dischargeType,
      dischargeDate: admission.dischargeDate,
      dischargeTime: admission.dischargeTime,
      treatmentSummary: admission.treatmentSummary,
      dischargeInstructions: admission.dischargeInstructions,
      dischargeMedicines: admission.dischargeMedicines,
      nextReviewDate: admission.nextReviewDate,
      followupAdvice: admission.followupAdvice,
      referralDetails: admission.referralDetails,
      status: summaryStatus || admission.dischargeSummaryStatus || 'Draft',
      updatedByDoctorId: req.user._id,
      updatedAt: new Date()
    };

    admission.updatedBy = req.user._id;
    await admission.save();

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender phone mobileNumber address bloodGroup')
      .populate('attendingDoctorId', 'name department specialization')
      .populate({
        path: 'bedId',
        populate: { path: 'wardId', select: 'name type code' }
      });

    try {
      WorkflowEventHub.publish('IPD_DISCHARGE_SUMMARY_UPDATED', {
        admissionId: admission._id,
        admissionNumber: admission.admissionId,
        status: summaryStatus || 'Draft',
        hospitalId: String(req.hospitalId)
      });
    } catch (e) {}

    return res.json({
      success: true,
      message: summaryStatus === 'Sent to Reception'
        ? 'Discharge summary sent to reception successfully'
        : 'Discharge summary draft saved successfully',
      data: populated || admission
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error saving clinical discharge summary', error: error.message });
  }
};

exports.dischargePatient = async (req, res) => {
  try {
    const admission = await IPDAdmission.findOne({ _id: req.params.id, hospitalId: req.hospitalId, isActive: true });
    if (!admission) return res.status(404).json({ message: 'Admission record not found' });
    if (admission.status !== 'Admitted') return res.status(400).json({ message: 'Patient is not currently admitted' });

    const { 
      dischargeDate,
      dischargeTime,
      finalDiagnosis, 
      treatmentSummary,
      dischargeSummary,
      dischargeCondition,
      dischargeInstructions,
      settlementException,
      billingDetails: finalizedBilling,
      amountReceived,
      amountPaid: incomingAmountPaid,
      paymentMethod,
      paymentMode: incomingPaymentMode,
      paymentDate: incomingPaymentDate,
      paymentReference,
      paymentDetails
    } = req.body;

    // Snapshot finalized billing items if provided before checking balance
    if (finalizedBilling && typeof finalizedBilling === 'object') {
      if (!admission.billingDetails) admission.billingDetails = {};
      if (finalizedBilling.bedCharges !== undefined) admission.billingDetails.bedCharges = Math.max(0, Number(finalizedBilling.bedCharges) || 0);
      if (finalizedBilling.consultationCharges !== undefined) admission.billingDetails.consultationCharges = Math.max(0, Number(finalizedBilling.consultationCharges) || 0);
      if (finalizedBilling.nursingCharges !== undefined) admission.billingDetails.nursingCharges = Math.max(0, Number(finalizedBilling.nursingCharges) || 0);
      if (finalizedBilling.procedureCharges !== undefined) admission.billingDetails.procedureCharges = Math.max(0, Number(finalizedBilling.procedureCharges) || 0);
      if (finalizedBilling.labCharges !== undefined) admission.billingDetails.labCharges = Math.max(0, Number(finalizedBilling.labCharges) || 0);
      if (finalizedBilling.medicationCharges !== undefined) admission.billingDetails.medicationCharges = Math.max(0, Number(finalizedBilling.medicationCharges) || 0);
      if (finalizedBilling.otherCharges !== undefined) admission.billingDetails.otherCharges = Math.max(0, Number(finalizedBilling.otherCharges) || 0);
      if (finalizedBilling.discount !== undefined) admission.billingDetails.discount = Math.max(0, Number(finalizedBilling.discount) || 0);
      if (finalizedBilling.tax !== undefined) admission.billingDetails.tax = Math.max(0, Number(finalizedBilling.tax) || 0);
      if (finalizedBilling.totalBill !== undefined) admission.billingDetails.totalBill = Math.max(0, Number(finalizedBilling.totalBill) || 0);
      if (finalizedBilling.dailyRate !== undefined) admission.billingDetails.dailyRate = Number(finalizedBilling.dailyRate) || 0;
      if (finalizedBilling.chargeableDays !== undefined) admission.billingDetails.chargeableDays = Number(finalizedBilling.chargeableDays) || 1;
      if (Array.isArray(finalizedBilling.billingItems)) {
        admission.billingDetails.billingItems = finalizedBilling.billingItems;
      }
      admission.billingDetails.isCustomized = true;
    }

    const totalBill = Number(admission.billingDetails?.totalBill) || 0;

    // Record and synchronize payment collection at discharge
    const payMode = paymentMethod || incomingPaymentMode || paymentDetails?.paymentMode || admission.amountMode || 'Cash';
    const refNo = paymentReference || paymentDetails?.referenceNo || '';
    const payNotes = req.body.notes || paymentDetails?.notes || 'Settlement at discharge';
    const incomingAmt = Math.max(
      0,
      Number(amountReceived) || Number(incomingAmountPaid) || Number(paymentDetails?.amount) || 0
    );

    if (incomingAmt > 0) {
      if (!admission.billingDetails) admission.billingDetails = {};
      if (!admission.billingDetails.paymentTransactions) admission.billingDetails.paymentTransactions = [];

      admission.billingDetails.paymentTransactions.push({
        amount: incomingAmt,
        paymentMode: payMode,
        referenceNo: refNo,
        notes: payNotes,
        paymentType: 'Final Settlement',
        receiptNumber: `RCP-IPD-${Date.now().toString().slice(-6)}`,
        recordedBy: req.user._id,
        createdAt: new Date()
      });

      if (incomingAmt >= totalBill) {
        admission.amountPaid = incomingAmt;
      } else {
        admission.amountPaid = (Number(admission.amountPaid) || 0) + incomingAmt;
      }
      admission.amountMode = payMode;
    }

    const isFullySettledException = settlementException?.allowed &&
      (settlementException?.reason?.toLowerCase().includes('fully settled') ||
       settlementException?.reason?.toLowerCase().includes('settled'));

    const currentPaid = Number(admission.amountPaid) || 0;
    if (isFullySettledException || (totalBill > 0 && currentPaid >= totalBill)) {
      admission.amountPaid = Math.max(currentPaid, totalBill);
      admission.paymentStatus = 'Paid';
    } else if (currentPaid > 0) {
      admission.paymentStatus = 'Partially Paid';
    } else {
      admission.paymentStatus = 'Unpaid';
    }

    // Check financial settlement status if totalBill is configured
    const finalBill = Number(admission.billingDetails?.totalBill) || 0;
    const finalPaid = Number(admission.amountPaid) || 0;
    const pendingBalance = Math.max(0, finalBill - finalPaid);

    if (pendingBalance > 0 && !isFullySettledException) {
      if (settlementException && settlementException.allowed) {
        if (!admission.billingDetails) {
          admission.billingDetails = {};
        }
        admission.billingDetails.settlementException = {
          allowed: true,
          reason: settlementException.reason || 'Authorized settlement exception / credit discharge',
          authorizedBy: req.user._id,
          authorizedAt: new Date()
        };
      } else {
        return res.status(400).json({
          message: `Outstanding Balance: ₹${pendingBalance.toLocaleString()}. Please collect the remaining amount or follow the hospital's authorized settlement procedure before finalizing discharge.`
        });
      }
    }

    // Calculate final discharge date timestamp
    let finalDischargeDate = new Date();
    if (dischargeDate) {
      if (dischargeTime) {
        finalDischargeDate = new Date(`${dischargeDate}T${dischargeTime}`);
        if (isNaN(finalDischargeDate.getTime())) {
          finalDischargeDate = new Date(dischargeDate);
        }
      } else {
        finalDischargeDate = new Date(dischargeDate);
      }
    }

    admission.status = 'Discharged';
    admission.dischargeDate = finalDischargeDate;
    if (dischargeTime) admission.dischargeTime = dischargeTime;
    admission.finalDiagnosis = finalDiagnosis || admission.finalDiagnosis || admission.reasonForAdmission || 'Under observation and medical management';
    admission.treatmentSummary = treatmentSummary || dischargeSummary || admission.treatmentSummary || 'Supportive inpatient care and treatment administered.';
    admission.dischargeSummary = admission.treatmentSummary;
    if (dischargeCondition) admission.dischargeCondition = dischargeCondition;
    if (dischargeInstructions) admission.dischargeInstructions = dischargeInstructions;
    admission.updatedBy = req.user._id;

    await admission.save();

    // Sync or update invoice if linked
    try {
      const Invoice = require('../models/Invoice');
      let inv = await Invoice.findOne({ patientId: admission.patientId, hospitalId: req.hospitalId }).sort({ createdAt: -1 });
      if (inv) {
        inv.paymentStatus = admission.paymentStatus === 'Paid' ? 'Paid' : (admission.paymentStatus === 'Partially Paid' ? 'Partially-Paid' : 'Unpaid');
        if (payMode) inv.paymentMode = payMode;
        if (admission.paymentStatus === 'Paid') {
          inv.paidAmount = finalBill;
          inv.balance = 0;
        }
        await inv.save();
      }
    } catch (invErr) {
      console.warn('Invoice sync warning during discharge:', invErr.message);
    }

    // Release bed unconditionally: both by admission.bedId and by any bed referencing this admission
    const bedQueryConditions = [{ currentAdmissionId: admission._id }];
    if (admission.bedId) {
      bedQueryConditions.push({ _id: admission.bedId });
    }
    await IPDBed.updateMany(
      {
        hospitalId: req.hospitalId,
        $or: bedQueryConditions
      },
      {
        $set: { status: 'Available' },
        $unset: { currentAdmissionId: 1 },
        updatedBy: req.user._id
      }
    );

    // Emit real-time event
    try {
      WorkflowEventHub.publish('IPD_ADMISSION_DISCHARGED', {
        admissionId: admission._id,
        admissionNumber: admission.admissionId,
        bedId: admission.bedId,
        status: 'Discharged',
        hospitalId: String(req.hospitalId)
      });
      WorkflowEventHub.publish('IPD_BED_RELEASED', {
        bedId: admission.bedId,
        hospitalId: String(req.hospitalId)
      });
    } catch (e) {}

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode allergies diagnosis medicalAlerts email address')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType dailyCharge wardId equipment status',
        populate: { path: 'wardId', select: 'name type code building floor baseCharges dailyBaseRate nursingRate' }
      })
      .populate('billingDetails.paymentTransactions.recordedBy', 'name firstName lastName')
      .populate('billingDetails.billingItems.addedBy', 'name firstName lastName');

    res.json(populated || admission);
  } catch (error) {
    res.status(500).json({ message: 'Error discharging patient', error: error.message });
  }
};

exports.recordAdmissionPayment = async (req, res) => {
  try {
    const { amount, paymentMode, referenceNo, notes, paymentType, receiptNumber, totalBill: incomingTotalBill } = req.body;
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: 'A valid positive payment amount is required' });
    }

    const admission = await IPDAdmission.findOne({ _id: req.params.id, hospitalId: req.hospitalId, isActive: true });
    if (!admission) {
      return res.status(404).json({ message: 'Admission record not found' });
    }

    if (!admission.billingDetails) {
      admission.billingDetails = {
        bedCharges: 0,
        consultationCharges: 0,
        nursingCharges: 0,
        procedureCharges: 0,
        labCharges: 0,
        medicationCharges: 0,
        otherCharges: 0,
        discount: 0,
        tax: 0,
        totalBill: 0,
        adjustments: [],
        paymentTransactions: [],
        billingItems: []
      };
    }

    // If incoming request specifies or updates the total bill, update it first
    if (incomingTotalBill !== undefined && Number(incomingTotalBill) > 0) {
      admission.billingDetails.totalBill = Number(incomingTotalBill);
      admission.billingDetails.isCustomized = true;
    }

    // Ensure payment amount does not exceed remaining pending balance if total bill is established
    const currentTotalBill = Number(admission.billingDetails?.totalBill) || 0;
    const currentPaid = Number(admission.amountPaid) || 0;
    const currentPending = Math.max(0, currentTotalBill - currentPaid);
    if (currentTotalBill > 0 && paymentAmount > currentPending && paymentAmount !== currentTotalBill) {
      return res.status(400).json({ 
        message: `Payment amount (₹${paymentAmount.toLocaleString()}) cannot exceed remaining pending balance of ₹${currentPending.toLocaleString()}` 
      });
    }

    if (!admission.billingDetails.paymentTransactions) {
      admission.billingDetails.paymentTransactions = [];
    }

    const mode = paymentMode || 'Cash';
    const finalReceiptNo = receiptNumber || `RCP-IPD-${Date.now().toString().slice(-6)}`;
    const type = paymentType || (admission.status === 'Discharged' ? 'Final Settlement' : 'Interim Payment');

    admission.billingDetails.paymentTransactions.push({
      amount: paymentAmount,
      paymentMode: mode,
      referenceNo: referenceNo || '',
      notes: notes || '',
      paymentType: type,
      receiptNumber: finalReceiptNo,
      recordedBy: req.user._id,
      createdAt: new Date()
    });

    if (paymentAmount >= currentTotalBill && currentTotalBill > 0) {
      admission.amountPaid = currentTotalBill;
    } else {
      admission.amountPaid = (Number(admission.amountPaid) || 0) + paymentAmount;
    }
    admission.amountMode = mode;

    const total = Number(admission.billingDetails.totalBill) || Number(admission.amountPaid);
    if (admission.amountPaid >= total && total > 0) {
      admission.paymentStatus = 'Paid';
    } else {
      admission.paymentStatus = 'Partially Paid';
    }
    admission.updatedBy = req.user._id;

    await admission.save();

    // Sync or update invoice if linked
    try {
      const Invoice = require('../models/Invoice');
      let inv = await Invoice.findOne({ patientId: admission.patientId, hospitalId: req.hospitalId }).sort({ createdAt: -1 });
      if (inv) {
        inv.paymentStatus = admission.paymentStatus === 'Paid' ? 'Paid' : 'Partially-Paid';
        inv.paymentMode = mode;
        if (admission.paymentStatus === 'Paid') {
          inv.paidAmount = total;
          inv.balance = 0;
        }
        await inv.save();
      }
    } catch (e) {
      console.warn('Invoice sync notice:', e.message);
    }

    try {
      WorkflowEventHub.publish('IPD_PAYMENT_RECORDED', {
        admissionId: admission._id,
        amount: paymentAmount,
        paymentMode: mode,
        receiptNumber: finalReceiptNo,
        hospitalId: String(req.hospitalId)
      });
    } catch (e) {}

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode allergies diagnosis medicalAlerts email address')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType dailyCharge wardId equipment status',
        populate: { path: 'wardId', select: 'name type code building floor baseCharges dailyBaseRate nursingRate' }
      })
      .populate('billingDetails.paymentTransactions.recordedBy', 'name firstName lastName')
      .populate('billingDetails.billingItems.addedBy', 'name firstName lastName');

    res.json(populated || admission);
  } catch (error) {
    res.status(500).json({ message: 'Error recording payment', error: error.message });
  }
};

exports.updateAdmissionBilling = async (req, res) => {
  try {
    const admission = await IPDAdmission.findOne({ _id: req.params.id, hospitalId: req.hospitalId, isActive: true });
    if (!admission) {
      return res.status(404).json({ message: 'Admission record not found' });
    }

    if (admission.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot modify billing charges on a finalized discharge' });
    }

    const {
      bedCharges,
      consultationCharges,
      nursingCharges,
      procedureCharges,
      labCharges,
      medicationCharges,
      otherCharges,
      discount,
      tax,
      dailyRate,
      chargeableDays,
      adjustmentReason,
      chargeType
    } = req.body;

    if (!admission.billingDetails) {
      admission.billingDetails = {
        bedCharges: 0,
        consultationCharges: 0,
        nursingCharges: 0,
        procedureCharges: 0,
        labCharges: 0,
        medicationCharges: 0,
        otherCharges: 0,
        discount: 0,
        tax: 0,
        totalBill: 0,
        adjustments: [],
        paymentTransactions: []
      };
    }

    const prevBed = Number(admission.billingDetails.bedCharges) || 0;
    const prevTotal = Number(admission.billingDetails.totalBill) || 0;

    const bCharges = bedCharges !== undefined ? Math.max(0, Number(bedCharges) || 0) : prevBed;
    const cCharges = consultationCharges !== undefined ? Math.max(0, Number(consultationCharges) || 0) : (Number(admission.billingDetails.consultationCharges) || 0);
    const nCharges = nursingCharges !== undefined ? Math.max(0, Number(nursingCharges) || 0) : (Number(admission.billingDetails.nursingCharges) || 0);
    const pCharges = procedureCharges !== undefined ? Math.max(0, Number(procedureCharges) || 0) : (Number(admission.billingDetails.procedureCharges) || 0);
    const lCharges = labCharges !== undefined ? Math.max(0, Number(labCharges) || 0) : (Number(admission.billingDetails.labCharges) || 0);
    const mCharges = medicationCharges !== undefined ? Math.max(0, Number(medicationCharges) || 0) : (Number(admission.billingDetails.medicationCharges) || 0);
    const oCharges = otherCharges !== undefined ? Math.max(0, Number(otherCharges) || 0) : (Number(admission.billingDetails.otherCharges) || 0);
    const dVal = discount !== undefined ? Math.max(0, Number(discount) || 0) : (Number(admission.billingDetails.discount) || 0);
    const tVal = tax !== undefined ? Math.max(0, Number(tax) || 0) : (Number(admission.billingDetails.tax) || 0);

    const calculatedTotal = (bCharges + cCharges + nCharges + pCharges + lCharges + mCharges + oCharges) - dVal + tVal;
    const finalTotal = Math.max(0, calculatedTotal);

    if (adjustmentReason) {
      if (!admission.billingDetails.adjustments) admission.billingDetails.adjustments = [];
      admission.billingDetails.adjustments.push({
        chargeType: chargeType || 'Manual Adjustment',
        previousAmount: prevTotal,
        newAmount: finalTotal,
        reason: adjustmentReason,
        adjustedBy: req.user._id,
        adjustedAt: new Date()
      });
    }

    admission.billingDetails.bedCharges = bCharges;
    admission.billingDetails.consultationCharges = cCharges;
    admission.billingDetails.nursingCharges = nCharges;
    admission.billingDetails.procedureCharges = pCharges;
    admission.billingDetails.labCharges = lCharges;
    admission.billingDetails.medicationCharges = mCharges;
    admission.billingDetails.otherCharges = oCharges;
    admission.billingDetails.discount = dVal;
    admission.billingDetails.tax = tVal;
    admission.billingDetails.totalBill = finalTotal;
    if (dailyRate !== undefined) admission.billingDetails.dailyRate = Number(dailyRate) || 0;
    if (chargeableDays !== undefined) admission.billingDetails.chargeableDays = Number(chargeableDays) || 1;
    admission.billingDetails.isCustomized = true;

    // Recalculate payment status
    const paid = Number(admission.amountPaid) || 0;
    if (paid >= finalTotal && finalTotal > 0) {
      admission.paymentStatus = 'Paid';
    } else if (paid > 0) {
      admission.paymentStatus = 'Partially Paid';
    } else {
      admission.paymentStatus = 'Unpaid';
    }

    admission.updatedBy = req.user._id;
    await admission.save();

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode allergies diagnosis medicalAlerts email address')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType dailyCharge wardId equipment status',
        populate: { path: 'wardId', select: 'name type code building floor baseCharges dailyBaseRate nursingRate' }
      })
      .populate('billingDetails.paymentTransactions.recordedBy', 'name firstName lastName')
      .populate('billingDetails.billingItems.addedBy', 'name firstName lastName');

    res.json(populated || admission);
  } catch (error) {
    res.status(500).json({ message: 'Error updating billing details', error: error.message });
  }
};

exports.addAdmissionBillingItem = async (req, res) => {
  try {
    const admission = await IPDAdmission.findOne({ _id: req.params.id, hospitalId: req.hospitalId, isActive: true });
    if (!admission) {
      return res.status(404).json({ message: 'Admission record not found' });
    }
    if (admission.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot add services to a finalized discharge record' });
    }

    const {
      serviceCategory,
      serviceName,
      description,
      quantity,
      unitPrice,
      amount,
      dateTime
    } = req.body;

    if (!serviceName || !serviceName.trim()) {
      return res.status(400).json({ message: 'Service name is required' });
    }

    const parsedQty = Math.max(1, Number(quantity) || 1);
    const parsedUnitPrice = Math.max(0, Number(unitPrice) || 0);
    const parsedAmount = amount !== undefined ? Math.max(0, Number(amount) || 0) : Math.round(parsedQty * parsedUnitPrice * 100) / 100;

    if (!admission.billingDetails) {
      admission.billingDetails = {
        bedCharges: 0,
        consultationCharges: 0,
        nursingCharges: 0,
        procedureCharges: 0,
        labCharges: 0,
        medicationCharges: 0,
        otherCharges: 0,
        discount: 0,
        tax: 0,
        totalBill: 0,
        adjustments: [],
        paymentTransactions: [],
        billingItems: []
      };
    }

    if (!Array.isArray(admission.billingDetails.billingItems)) {
      admission.billingDetails.billingItems = [];
    }

    const category = serviceCategory || 'Other';
    const newItem = {
      serviceCategory: category,
      serviceName: serviceName.trim(),
      description: description ? description.trim() : '',
      quantity: parsedQty,
      unitPrice: parsedUnitPrice,
      amount: parsedAmount,
      dateTime: dateTime ? new Date(dateTime) : new Date(),
      status: 'Added to Bill',
      isManual: true,
      addedBy: req.user._id,
      createdAt: new Date()
    };

    admission.billingDetails.billingItems.push(newItem);

    // Increment corresponding category
    if (category === 'Bed / Room') {
      admission.billingDetails.bedCharges = (Number(admission.billingDetails.bedCharges) || 0) + parsedAmount;
    } else if (category === 'Doctor Consultation') {
      admission.billingDetails.consultationCharges = (Number(admission.billingDetails.consultationCharges) || 0) + parsedAmount;
    } else if (category === 'Nursing') {
      admission.billingDetails.nursingCharges = (Number(admission.billingDetails.nursingCharges) || 0) + parsedAmount;
    } else if (category === 'Procedure') {
      admission.billingDetails.procedureCharges = (Number(admission.billingDetails.procedureCharges) || 0) + parsedAmount;
    } else if (category === 'Laboratory') {
      admission.billingDetails.labCharges = (Number(admission.billingDetails.labCharges) || 0) + parsedAmount;
    } else if (category === 'Pharmacy / Medication') {
      admission.billingDetails.medicationCharges = (Number(admission.billingDetails.medicationCharges) || 0) + parsedAmount;
    } else {
      admission.billingDetails.otherCharges = (Number(admission.billingDetails.otherCharges) || 0) + parsedAmount;
    }

    // Recalculate total bill
    const bCharges = Number(admission.billingDetails.bedCharges) || 0;
    const cCharges = Number(admission.billingDetails.consultationCharges) || 0;
    const nCharges = Number(admission.billingDetails.nursingCharges) || 0;
    const pCharges = Number(admission.billingDetails.procedureCharges) || 0;
    const lCharges = Number(admission.billingDetails.labCharges) || 0;
    const mCharges = Number(admission.billingDetails.medicationCharges) || 0;
    const oCharges = Number(admission.billingDetails.otherCharges) || 0;
    const dVal = Number(admission.billingDetails.discount) || 0;
    const tVal = Number(admission.billingDetails.tax) || 0;

    admission.billingDetails.totalBill = Math.max(0, Math.round(((bCharges + cCharges + nCharges + pCharges + lCharges + mCharges + oCharges) - dVal + tVal) * 100) / 100);
    admission.billingDetails.isCustomized = true;

    // Recalculate payment status
    const paid = Number(admission.amountPaid) || 0;
    if (paid >= admission.billingDetails.totalBill && admission.billingDetails.totalBill > 0) {
      admission.paymentStatus = 'Paid';
    } else if (paid > 0) {
      admission.paymentStatus = 'Partially Paid';
    } else {
      admission.paymentStatus = 'Unpaid';
    }

    admission.updatedBy = req.user._id;
    await admission.save();

    try {
      WorkflowEventHub.publish('IPD_BILLING_UPDATED', {
        admissionId: admission._id,
        totalBill: admission.billingDetails.totalBill,
        hospitalId: String(req.hospitalId)
      });
    } catch (e) {}

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode allergies diagnosis medicalAlerts email address vitals')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType dailyCharge wardId equipment status',
        populate: { path: 'wardId', select: 'name type code building floor baseCharges dailyBaseRate nursingRate' }
      })
      .populate('billingDetails.paymentTransactions.recordedBy', 'name firstName lastName')
      .populate('billingDetails.billingItems.addedBy', 'name firstName lastName');

    res.status(201).json({ success: true, data: populated || admission });
  } catch (error) {
    res.status(500).json({ message: 'Error adding service charge', error: error.message });
  }
};

exports.deleteAdmissionBillingItem = async (req, res) => {
  try {
    const admission = await IPDAdmission.findOne({ _id: req.params.id, hospitalId: req.hospitalId, isActive: true });
    if (!admission) {
      return res.status(404).json({ message: 'Admission record not found' });
    }
    if (admission.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot modify billing charges on a finalized discharge' });
    }

    const { itemId } = req.params;
    const items = admission.billingDetails?.billingItems || [];
    const itemIndex = items.findIndex(it => it._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Billing item not found' });
    }

    const removedItem = items[itemIndex];
    const removedAmount = Number(removedItem.amount) || 0;
    const category = removedItem.serviceCategory || 'Other';

    items.splice(itemIndex, 1);

    // Deduct from category
    if (category === 'Bed / Room') {
      admission.billingDetails.bedCharges = Math.max(0, (Number(admission.billingDetails.bedCharges) || 0) - removedAmount);
    } else if (category === 'Doctor Consultation') {
      admission.billingDetails.consultationCharges = Math.max(0, (Number(admission.billingDetails.consultationCharges) || 0) - removedAmount);
    } else if (category === 'Nursing') {
      admission.billingDetails.nursingCharges = Math.max(0, (Number(admission.billingDetails.nursingCharges) || 0) - removedAmount);
    } else if (category === 'Procedure') {
      admission.billingDetails.procedureCharges = Math.max(0, (Number(admission.billingDetails.procedureCharges) || 0) - removedAmount);
    } else if (category === 'Laboratory') {
      admission.billingDetails.labCharges = Math.max(0, (Number(admission.billingDetails.labCharges) || 0) - removedAmount);
    } else if (category === 'Pharmacy / Medication') {
      admission.billingDetails.medicationCharges = Math.max(0, (Number(admission.billingDetails.medicationCharges) || 0) - removedAmount);
    } else {
      admission.billingDetails.otherCharges = Math.max(0, (Number(admission.billingDetails.otherCharges) || 0) - removedAmount);
    }

    // Recalculate total bill
    const bCharges = Number(admission.billingDetails.bedCharges) || 0;
    const cCharges = Number(admission.billingDetails.consultationCharges) || 0;
    const nCharges = Number(admission.billingDetails.nursingCharges) || 0;
    const pCharges = Number(admission.billingDetails.procedureCharges) || 0;
    const lCharges = Number(admission.billingDetails.labCharges) || 0;
    const mCharges = Number(admission.billingDetails.medicationCharges) || 0;
    const oCharges = Number(admission.billingDetails.otherCharges) || 0;
    const dVal = Number(admission.billingDetails.discount) || 0;
    const tVal = Number(admission.billingDetails.tax) || 0;

    admission.billingDetails.totalBill = Math.max(0, Math.round(((bCharges + cCharges + nCharges + pCharges + lCharges + mCharges + oCharges) - dVal + tVal) * 100) / 100);

    // Recalculate payment status
    const paid = Number(admission.amountPaid) || 0;
    if (paid >= admission.billingDetails.totalBill && admission.billingDetails.totalBill > 0) {
      admission.paymentStatus = 'Paid';
    } else if (paid > 0) {
      admission.paymentStatus = 'Partially Paid';
    } else {
      admission.paymentStatus = 'Unpaid';
    }

    admission.updatedBy = req.user._id;
    await admission.save();

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode allergies diagnosis medicalAlerts email address vitals')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType dailyCharge wardId equipment status',
        populate: { path: 'wardId', select: 'name type code building floor baseCharges dailyBaseRate nursingRate' }
      })
      .populate('billingDetails.paymentTransactions.recordedBy', 'name firstName lastName')
      .populate('billingDetails.billingItems.addedBy', 'name firstName lastName');

    res.json({ success: true, data: populated || admission });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting service charge', error: error.message });
  }
};

exports.recordDoctorVisit = async (req, res) => {
  try {
    const admission = await IPDAdmission.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId,
      isActive: true
    });
    if (!admission) return res.status(404).json({ message: 'Admission record not found' });

    if (admission.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot record doctor visit on a finalized discharge' });
    }

    const doctorId = req.body.doctorId || req.user?._id;
    if (!doctorId) return res.status(400).json({ message: 'Doctor ID is required' });

    if (!admission.visitedDoctorIds) admission.visitedDoctorIds = [];
    if (!admission.visitedDoctorIds.some(id => id.toString() === doctorId.toString())) {
      admission.visitedDoctorIds.push(doctorId);
    }

    if (!admission.clinicalWorkload) {
      admission.clinicalWorkload = { doctorRounds: 1, labTests: 0, imagingScans: 0, medsPrescribed: 0 };
    } else {
      admission.clinicalWorkload.doctorRounds = (admission.clinicalWorkload.doctorRounds || 0) + 1;
    }

    if (req.body.notes && req.body.notes.trim()) {
      const timestamp = new Date().toLocaleString('en-GB');
      admission.admissionNotes = (admission.admissionNotes ? admission.admissionNotes + '\n' : '') +
        `[Doctor Round - ${timestamp}] ${req.body.notes.trim()}`;
    }

    admission.updatedBy = req.user._id;
    await admission.save();

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup countryCode')
      .populate('attendingDoctorId', 'name firstName lastName doctorProfile')
      .populate('visitedDoctorIds', 'name firstName lastName doctorProfile')
      .populate({
        path: 'bedId',
        populate: { path: 'wardId', select: 'name type' }
      });

    res.json({ success: true, message: 'Doctor visit recorded successfully', admission: populated });
  } catch (error) {
    res.status(500).json({ message: 'Error recording doctor visit', error: error.message });
  }
};

// -----------------------------------------
// IPD Daily Clinical Reviews & Consultation
// -----------------------------------------

exports.getDailyReviews = async (req, res) => {
  try {
    const paramId = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(paramId);

    let admission = await IPDAdmission.findOne({
      ...(isObjectId ? { $or: [{ _id: paramId }, { admissionId: paramId }] } : { admissionId: paramId }),
      hospitalId: req.hospitalId,
      isActive: true
    })
      .populate('patientId')
      .populate('attendingDoctorId', 'name doctorProfile department specialization')
      .populate('visitedDoctorIds', 'name doctorProfile department specialization')
      .populate({
        path: 'bedId',
        populate: { path: 'wardId', select: 'name type code' }
      });

    if (!admission && isObjectId) {
      admission = await IPDAdmission.findOne({
        patientId: paramId,
        status: 'Admitted',
        hospitalId: req.hospitalId,
        isActive: true
      })
        .populate('patientId')
        .populate('attendingDoctorId', 'name doctorProfile department specialization')
        .populate('visitedDoctorIds', 'name doctorProfile department specialization')
        .populate({
          path: 'bedId',
          populate: { path: 'wardId', select: 'name type code' }
        });
    }

    if (!admission) return res.status(404).json({ message: 'Admission not found' });

    // Auto-fetch and synthesize any doctor consultations completed for this patient/admission
    try {
      const Consultation = require('../models/Consultation');
      const Prescription = require('../models/Prescription');

      const patId = admission.patientId?._id || admission.patientId;
      if (patId) {
        const consultFilter = {
          hospitalId: req.hospitalId,
          $or: [
            { appointmentId: admission._id },
            ...(admission.admissionId && mongoose.Types.ObjectId.isValid(admission.admissionId) ? [{ appointmentId: admission.admissionId }] : []),
            { patientId: patId }
          ]
        };
        if (admission.admissionDate) {
          const startAdm = new Date(admission.admissionDate);
          startAdm.setHours(0, 0, 0, 0);
          consultFilter.createdAt = { $gte: startAdm };
        }

        const consultations = await Consultation.find(consultFilter)
          .populate('doctorId', 'name doctorProfile department specialization')
          .sort({ createdAt: 1 });

        if (consultations && consultations.length > 0) {
          if (!Array.isArray(admission.dailyReviews)) admission.dailyReviews = [];
          let hasNewReviews = false;

          for (const c of consultations) {
            const cTime = new Date(c.createdAt || c.date || Date.now()).getTime();
            const existingReview = admission.dailyReviews.find(r => {
              if (r.consultationId && String(r.consultationId) === String(c._id)) return true;
              const rDiag = (r.diagnosis || '').trim().toLowerCase();
              const cDiag = (c.diagnosis || c.primaryDiagnosis || '').trim().toLowerCase();
              if (rDiag && cDiag && rDiag === cDiag) return true;
              const rTime = new Date(r.reviewDate || r.createdAt || 0).getTime();
              return Math.abs(rTime - cTime) < 12 * 60 * 60 * 1000;
            });

            if (!existingReview) {
              const rxDoc = await Prescription.findOne({ consultationId: c._id });
              const rxItems = (rxDoc?.items || []).map(p => ({
                medicineName: p.medicineName || '',
                dose: p.dosage || p.strength || '',
                route: p.route || 'Oral',
                frequency: p.frequency || 'Once daily',
                duration: p.duration || '3 days',
                instructions: normalizeFoodTiming(p.instructions || p.foodTiming),
                foodTiming: normalizeFoodTiming(p.foodTiming || p.instructions),
                quantity: Number(p.quantity || 1),
                pharmacyStatus: rxDoc?.status === 'Sent to Pharmacy' || rxDoc?.status === 'Dispensed' ? rxDoc.status : 'Pending'
              }));

              const revDate = c.createdAt || new Date();
              const dObj = new Date(revDate);
              let hours = dObj.getHours();
              const minutes = String(dObj.getMinutes()).padStart(2, '0');
              const ampm = hours >= 12 ? 'PM' : 'AM';
              hours = hours % 12 || 12;
              const revTime = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

              const docName = c.doctorId?.name
                ? (c.doctorId.name.startsWith('Dr.') ? c.doctorId.name : `Dr. ${c.doctorId.name}`)
                : 'Attending Doctor';

              const synchedReview = {
                dayNumber: Number(c.dayNumber || c.roundNumber) || (admission.dailyReviews.length + 1),
                reviewDate: revDate,
                reviewTime: revTime,
                doctorId: c.doctorId?._id || c.doctorId,
                doctorName: docName,
                chiefComplaints: c.chiefComplaint || c.diagnosis || '',
                diagnosis: c.diagnosis || c.primaryDiagnosis || '',
                clinicalFindings: c.clinicalNotes || c.examinationFindings || '',
                assessment: c.assessmentNotes || c.clinicalNotes || 'Doctor consultation completed.',
                assessmentPlan: c.assessmentNotes || c.clinicalNotes || '',
                treatmentPlan: c.advice || '',
                vitals: {
                  bp: c.vitals?.bpSystolic && c.vitals?.bpDiastolic ? `${c.vitals.bpSystolic}/${c.vitals.bpDiastolic}` : (c.vitals?.bp || ''),
                  pulse: c.vitals?.pulse || '',
                  temperature: c.vitals?.temperature || '',
                  spo2: c.vitals?.spo2 || ''
                },
                prescriptions: rxItems,
                investigations: Array.isArray(c.investigations) ? c.investigations : [],
                statusBadge: 'Doctor Consulted',
                consultationId: c._id,
                isDraft: false,
                createdAt: revDate,
                updatedAt: new Date()
              };

              admission.dailyReviews.push(synchedReview);
              hasNewReviews = true;
            } else {
              let revUpdated = false;
              if (!existingReview.clinicalFindings || existingReview.clinicalFindings.trim() === '') {
                const parts = [];
                if (existingReview.generalCondition) parts.push(`Condition: ${existingReview.generalCondition}`);
                if (existingReview.consciousnessLevel) parts.push(`Consciousness: ${existingReview.consciousnessLevel}`);
                if (existingReview.painScore) parts.push(`Pain: ${existingReview.painScore}`);
                existingReview.clinicalFindings = c.clinicalNotes || (parts.length > 0 ? parts.join(' | ') : '');
                revUpdated = true;
              }
              if ((!existingReview.assessment || existingReview.assessment === 'Doctor consultation completed.') && (existingReview.assessmentPlan || c.clinicalNotes)) {
                existingReview.assessment = existingReview.assessmentPlan || c.clinicalNotes;
                revUpdated = true;
              }
              if (!existingReview.treatmentPlan && (c.advice || existingReview.instructions)) {
                existingReview.treatmentPlan = c.advice || existingReview.instructions;
                revUpdated = true;
              }
              if ((!existingReview.investigations || existingReview.investigations.length === 0) && Array.isArray(c.investigations) && c.investigations.length > 0) {
                existingReview.investigations = c.investigations;
                revUpdated = true;
              }
              if ((!existingReview.prescriptions || existingReview.prescriptions.length === 0)) {
                const rxDoc = await Prescription.findOne({ consultationId: c._id });
                if (rxDoc?.items && rxDoc.items.length > 0) {
                  existingReview.prescriptions = rxDoc.items.map(p => ({
                    medicineName: p.medicineName || '',
                    dose: p.dosage || p.strength || '',
                    route: p.route || 'Oral',
                    frequency: p.frequency || 'Once daily',
                    duration: p.duration || '3 days',
                    instructions: normalizeFoodTiming(p.instructions || p.foodTiming),
                    foodTiming: normalizeFoodTiming(p.foodTiming || p.instructions),
                    quantity: Number(p.quantity || 1),
                    pharmacyStatus: rxDoc?.status === 'Sent to Pharmacy' || rxDoc?.status === 'Dispensed' ? rxDoc.status : 'Pending'
                  }));
                  revUpdated = true;
                }
              }
              if (revUpdated) hasNewReviews = true;
            }
          }

          if (hasNewReviews) {
            if (!admission.clinicalWorkload) {
              admission.clinicalWorkload = { doctorRounds: admission.dailyReviews.length, labTests: 0, imagingScans: 0, medsPrescribed: 0 };
            } else {
              admission.clinicalWorkload.doctorRounds = Math.max(admission.clinicalWorkload.doctorRounds || 0, admission.dailyReviews.length);
            }
            await admission.save();
          }
        }
      }
    } catch (syncErr) {
      console.warn('Auto-sync doctor consultations in getDailyReviews note:', syncErr.message);
    }

    (admission.dailyReviews || []).forEach(rev => {
      if (!rev.clinicalFindings || rev.clinicalFindings.trim() === '') {
        const parts = [];
        if (rev.generalCondition) parts.push(`Condition: ${rev.generalCondition}`);
        if (rev.consciousnessLevel) parts.push(`Consciousness: ${rev.consciousnessLevel}`);
        if (rev.painScore) parts.push(`Pain: ${rev.painScore}`);
        if (parts.length > 0) rev.clinicalFindings = parts.join(' | ');
      }
      if ((!rev.assessment || rev.assessment === 'Doctor consultation completed.') && rev.assessmentPlan) {
        rev.assessment = rev.assessmentPlan;
      }
      if (!rev.treatmentPlan && rev.instructions) {
        rev.treatmentPlan = rev.instructions;
      }
    });

    // Deduplicate dailyReviews to return only original consulted rounds without duplicates
    const sortedReviews = [...(admission.dailyReviews || [])].sort((a, b) => {
      const da = new Date(a.reviewDate || a.createdAt || 0);
      const db = new Date(b.reviewDate || b.createdAt || 0);
      return da - db;
    });

    const seenReviewIds = new Set();
    const seenConsultationIds = new Set();
    const seenClinicalSignatures = new Set();
    const cleanReviews = [];

    for (const rev of sortedReviews) {
      const idKey = rev._id ? String(rev._id) : null;
      if (idKey && seenReviewIds.has(idKey)) continue;

      if (rev.consultationId) {
        const cKey = String(rev.consultationId);
        if (seenConsultationIds.has(cKey)) continue;
        seenConsultationIds.add(cKey);
      }

      const diagNorm = (rev.diagnosis || '').trim().toLowerCase();
      const rxNorm = Array.isArray(rev.prescriptions)
        ? rev.prescriptions.map(p => `${(p.medicineName || '').trim().toLowerCase()}_${(p.dose || p.dosage || '').trim().toLowerCase()}_${p.quantity || ''}`).sort().join('|')
        : '';
      const vitalsNorm = `${rev.vitals?.bp || ''}_${rev.vitals?.pulse || ''}_${rev.vitals?.temperature || ''}`;
      const contentSig = diagNorm || rxNorm ? `${diagNorm}:::${rxNorm}:::${vitalsNorm}` : null;

      if (contentSig && seenClinicalSignatures.has(contentSig)) {
        continue;
      }

      if (idKey) seenReviewIds.add(idKey);
      if (contentSig) seenClinicalSignatures.add(contentSig);

      cleanReviews.push(rev);
    }

    cleanReviews.forEach((rev, idx) => {
      rev.dayNumber = idx + 1;
      rev.roundNumber = idx + 1;
    });

    res.json({ success: true, admission, dailyReviews: cleanReviews });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch daily reviews', error: err.message });
  }
};

exports.saveDailyReview = async (req, res) => {
  try {
    const paramId = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(paramId);
    let admission = await IPDAdmission.findOne({
      ...(isObjectId ? { $or: [{ _id: paramId }, { admissionId: paramId }] } : { admissionId: paramId }),
      hospitalId: req.hospitalId,
      isActive: true
    });

    if (!admission && isObjectId) {
      admission = await IPDAdmission.findOne({
        patientId: paramId,
        status: 'Admitted',
        hospitalId: req.hospitalId,
        isActive: true
      });
    }

    if (!admission) return res.status(404).json({ message: 'Admission not found' });

    const {
      dayNumber,
      reviewDate,
      reviewTime,
      doctorId,
      doctorName,
      chiefComplaints,
      vitals,
      clinicalFindings,
      examinationFindings,
      generalCondition,
      consciousnessLevel,
      painScore,
      diagnosis,
      assessment,
      assessmentPlan,
      treatmentPlan,
      prescriptions,
      investigations,
      statusBadge,
      isDraft,
      sendToPharmacy
    } = req.body;

    if (!admission.dailyReviews) admission.dailyReviews = [];

    // Check if review for this day exists or update it
    const existingIdx = admission.dailyReviews.findIndex(r => r.dayNumber === Number(dayNumber));

    const updatedPrescriptions = (prescriptions || []).map(p => ({
      medicineName: p.medicineName || '',
      dose: p.dose || '',
      route: p.route || 'Oral',
      frequency: p.frequency || 'Once daily',
      duration: p.duration || '3 days',
      instructions: normalizeFoodTiming(p.instructions || p.timing),
      foodTiming: normalizeFoodTiming(p.foodTiming || p.instructions || p.timing),
      quantity: Number(p.quantity || p.qty || 1),
      pharmacyStatus: sendToPharmacy ? 'Sent to Pharmacy' : (p.pharmacyStatus || 'Pending')
    }));

    const conditionList = [];
    if (generalCondition) conditionList.push(`Condition: ${generalCondition}`);
    if (consciousnessLevel) conditionList.push(`Consciousness: ${consciousnessLevel}`);
    if (painScore !== undefined && painScore !== null && painScore !== '') conditionList.push(`Pain: ${painScore}`);
    const synthesizedFindings = conditionList.join(' | ');

    const reviewData = {
      dayNumber: Number(dayNumber) || (admission.dailyReviews.length + 1),
      reviewDate: reviewDate ? new Date(reviewDate) : new Date(),
      reviewTime: reviewTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      doctorId: doctorId || req.user?._id,
      doctorName: doctorName || req.user?.name || 'Attending Doctor',
      chiefComplaints: chiefComplaints || '',
      vitals: vitals || {},
      clinicalFindings: clinicalFindings || examinationFindings || synthesizedFindings || '',
      examinationFindings: examinationFindings || clinicalFindings || '',
      generalCondition: generalCondition || 'Stable',
      consciousnessLevel: consciousnessLevel || 'Alert',
      painScore: painScore !== undefined ? String(painScore) : '2',
      diagnosis: diagnosis || '',
      assessment: (assessment && assessment !== 'Doctor consultation completed.') ? assessment : (assessmentPlan || assessment || ''),
      assessmentPlan: assessmentPlan || assessment || '',
      treatmentPlan: treatmentPlan || '',
      prescriptions: updatedPrescriptions,
      investigations: Array.isArray(investigations) ? investigations : [],
      statusBadge: statusBadge || (existingIdx >= 0 ? 'Symptoms improving' : 'Initial Review'),
      isDraft: Boolean(isDraft),
      updatedAt: new Date()
    };

    // Synchronize investigations into billingItems
    if (Array.isArray(investigations) && investigations.length > 0) {
      if (!admission.billingDetails) admission.billingDetails = {};
      if (!Array.isArray(admission.billingDetails.billingItems)) admission.billingDetails.billingItems = [];

      let additionalLabTotal = 0;
      for (const inv of investigations) {
        const invName = inv.name || inv.serviceName;
        if (!invName) continue;
        const invPrice = Number(inv.price || inv.unitPrice || inv.amount || 0);
        const isRad = (inv.serviceType || inv.category || '').toLowerCase().includes('radiology') ||
                      (inv.serviceType || inv.category || '').toLowerCase().includes('imaging') ||
                      invName.toLowerCase().includes('x-ray') ||
                      invName.toLowerCase().includes('scan') ||
                      invName.toLowerCase().includes('ultrasound') ||
                      invName.toLowerCase().includes('mri') ||
                      invName.toLowerCase().includes('ct');
        const invCategory = isRad ? 'Radiology' : 'Laboratory';

        const existingItem = admission.billingDetails.billingItems.find(
          b => (b.serviceName || '').trim().toLowerCase() === invName.trim().toLowerCase()
        );

        const isAlreadyAddedForThisRound = admission.billingDetails.billingItems.some(
          b => (b.serviceName || '').trim().toLowerCase() === invName.trim().toLowerCase() &&
               (b.description || '').includes(`Round ${reviewData.dayNumber}`)
        );

        if (existingItem) {
          if (!isAlreadyAddedForThisRound) {
            const currentQty = Number(existingItem.quantity) || 1;
            const unitPrice = Number(existingItem.unitPrice || invPrice);
            const newQty = currentQty + 1;
            existingItem.quantity = newQty;
            existingItem.unitPrice = unitPrice;
            existingItem.amount = newQty * unitPrice;
            existingItem.description = `Ordered across ${newQty} Rounds (Round ${reviewData.dayNumber})`;
            additionalLabTotal += unitPrice;
          }
        } else {
          admission.billingDetails.billingItems.push({
            serviceCategory: invCategory,
            serviceName: invName,
            description: `Ordered in Round ${reviewData.dayNumber}`,
            quantity: 1,
            unitPrice: invPrice,
            amount: invPrice,
            dateTime: new Date(),
            status: 'Added to Bill',
            isManual: false,
            addedBy: doctorId || req.user?._id,
            createdAt: new Date()
          });
          additionalLabTotal += invPrice;
        }
      }
      if (additionalLabTotal > 0) {
        admission.billingDetails.labCharges = (admission.billingDetails.labCharges || 0) + additionalLabTotal;
        admission.billingDetails.totalBill = (admission.billingDetails.totalBill || 0) + additionalLabTotal;
      }
    }

    if (existingIdx >= 0) {
      admission.dailyReviews[existingIdx] = {
        ...admission.dailyReviews[existingIdx].toObject(),
        ...reviewData
      };
    } else {
      reviewData.createdAt = new Date();
      admission.dailyReviews.push(reviewData);
    }

    // Update clinical workload
    if (!admission.clinicalWorkload) {
      admission.clinicalWorkload = { doctorRounds: 1, labTests: 0, imagingScans: 0, medsPrescribed: 0 };
    } else {
      admission.clinicalWorkload.doctorRounds = Math.max((admission.clinicalWorkload.doctorRounds || 0), admission.dailyReviews.length);
      admission.clinicalWorkload.medsPrescribed = (admission.clinicalWorkload.medsPrescribed || 0) + (prescriptions ? prescriptions.length : 0);
    }

    // Record doctor visit if not visited
    if (doctorId && !admission.visitedDoctorIds.some(id => String(id) === String(doctorId))) {
      admission.visitedDoctorIds.push(doctorId);
    }

    // Append summary note if provided
    if (chiefComplaints || clinicalFindings || diagnosis) {
      const timestamp = new Date().toLocaleDateString('en-GB');
      const noteSummary = `[Day ${reviewData.dayNumber} Review - ${timestamp}] ${diagnosis ? `Diagnosis: ${diagnosis}. ` : ''}${treatmentPlan ? `Plan: ${treatmentPlan}` : ''}`;
      if (!admission.admissionNotes?.includes(`[Day ${reviewData.dayNumber} Review`)) {
        admission.admissionNotes = (admission.admissionNotes ? admission.admissionNotes + '\n' : '') + noteSummary;
      }
    }

    admission.updatedBy = req.user._id;
    await admission.save();

    const populated = await IPDAdmission.findById(admission._id)
      .populate('patientId')
      .populate('attendingDoctorId', 'name doctorProfile department specialization')
      .populate('visitedDoctorIds', 'name doctorProfile department specialization')
      .populate({
        path: 'bedId',
        populate: { path: 'wardId', select: 'name type code' }
      });

    res.json({
      success: true,
      message: sendToPharmacy ? 'Daily review saved and prescription sent to IPD Pharmacy!' : 'Daily clinical review saved successfully!',
      admission: populated,
      dailyReviews: populated.dailyReviews || []
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save daily review', error: err.message });
  }
};

// -------------------------------------------------------------
// IPD Pharmacy Prescriptions Queue & Dispense Desk Endpoints
// -------------------------------------------------------------

exports.getIpdPrescriptionQueue = async (req, res) => {
  try {
    const { filter = 'queue', search = '' } = req.query;
    const hospitalId = req.hospitalId || req.user?.hospitalId || req.user?.hospital?._id || req.user?.hospital;

    const query = {
      isActive: true,
      'dailyReviews.prescriptions.0': { $exists: true }
    };
    if (hospitalId) {
      query.hospitalId = hospitalId;
    }

    const admissions = await IPDAdmission.find(query)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup allergies')
      .populate('attendingDoctorId', 'name doctorProfile department specialization')
      .populate({
        path: 'bedId',
        select: 'bedNumber roomNumber bedType',
        populate: { path: 'wardId', select: 'name type code' }
      })
      .sort({ updatedAt: -1 });

    const queueItems = [];

    for (const adm of admissions) {
      if (!adm.dailyReviews || adm.dailyReviews.length === 0) continue;

      for (const review of adm.dailyReviews) {
        if (!review.prescriptions || review.prescriptions.length === 0) continue;

        const prescriptions = review.prescriptions;
        const allDispensed = prescriptions.every(p => p.pharmacyStatus === 'Dispensed');
        const anyDispensed = prescriptions.some(p => p.pharmacyStatus === 'Dispensed');

        let reviewStatus = 'Pending';
        if (allDispensed) {
          reviewStatus = 'Dispensed';
        } else if (anyDispensed) {
          reviewStatus = 'Dispensing';
        }

        if (filter === 'history' && !allDispensed && reviewStatus !== 'Dispensing') {
          continue;
        }
        if (filter === 'queue' && allDispensed) {
          continue;
        }

        // Apply search filter if provided
        if (search) {
          const s = search.toLowerCase();
          const matchPatient = (adm.patientId?.name || '').toLowerCase().includes(s) ||
                               (adm.patientId?.uhid || '').toLowerCase().includes(s) ||
                               (adm.admissionNumber || '').toLowerCase().includes(s);
          const matchWard = (adm.bedId?.wardId?.name || '').toLowerCase().includes(s) ||
                            (adm.bedId?.bedNumber || '').toLowerCase().includes(s);
          const matchMed = prescriptions.some(p => (p.medicineName || '').toLowerCase().includes(s));
          if (!matchPatient && !matchWard && !matchMed) {
            continue;
          }
        }

        queueItems.push({
          _id: `${adm._id}_${review._id}`,
          admissionId: adm._id,
          admissionNumber: adm.admissionNumber || adm.admissionId || 'ADM',
          ipdNo: adm.admissionId || adm.admissionNumber || 'IPD-—',
          admissionStatus: adm.status,
          admissionDate: adm.admissionDate,
          admissionTime: adm.admissionTime || '',
          patientId: adm.patientId,
          patientName: adm.patientId?.name || 'Inpatient',
          uhid: adm.patientId?.uhid || 'N/A',
          gender: adm.patientId?.gender,
          age: adm.patientId?.age,
          mobileNumber: adm.patientId?.mobileNumber,
          bloodGroup: adm.patientId?.bloodGroup,
          wardName: adm.bedId?.wardId?.name || 'General Ward',
          wardId: adm.bedId?.wardId?._id || adm.bedId?.wardId,
          bedNumber: adm.bedId?.bedNumber || 'N/A',
          bedId: adm.bedId?._id || adm.bedId,
          bedType: adm.bedId?.bedType || 'Standard',
          doctorName: review.doctorName || adm.attendingDoctorId?.name || 'Attending Doctor',
          doctorId: review.doctorId || adm.attendingDoctorId?._id,
          reviewId: review._id,
          dayNumber: review.dayNumber,
          roundNumber: review.roundNumber || review.dayNumber || 1,
          round: `Round ${review.roundNumber || review.dayNumber || 1}`,
          reviewDate: review.reviewDate || review.createdAt,
          prescriptionSentDate: review.reviewDate || review.createdAt,
          reviewTime: review.reviewTime,
          diagnosis: review.diagnosis || adm.diagnosis || adm.finalDiagnosis || adm.reasonForAdmission || '',
          chiefComplaints: review.chiefComplaints || adm.chiefComplaints || adm.reasonForAdmission || '',
          treatmentPlan: review.treatmentPlan || '',
          prescriptions: review.prescriptions,
          status: reviewStatus,
          dispensedAt: review.dispensedAt || (review.prescriptions || []).find(p => p.dispensedAt)?.dispensedAt || (reviewStatus === 'Dispensed' ? (review.updatedAt || review.reviewDate || review.createdAt) : null),
          createdAt: review.createdAt || review.reviewDate || adm.updatedAt
        });
      }
    }

    res.json({ success: true, count: queueItems.length, data: queueItems });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch IPD prescription queue', error: err.message });
  }
};

exports.dispenseIpdPrescription = async (req, res) => {
  try {
    const { admissionId, reviewId, prescriptionIds, pharmacistNotes, items } = req.body;
    const hospitalId = req.hospitalId || req.user?.hospitalId || req.user?.hospital?._id || req.user?.hospital;

    // 1. Resolve admission safely (handling composite keys, admission number, or direct ObjectId)
    const cleanAdmissionId = (admissionId && typeof admissionId === 'string' && admissionId.includes('_'))
      ? admissionId.split('_')[0].trim()
      : (admissionId ? String(admissionId).trim() : '');

    if (!cleanAdmissionId) {
      return res.status(400).json({ success: false, message: 'Valid admission identifier is required' });
    }

    const isObjId = mongoose.Types.ObjectId.isValid(cleanAdmissionId);
    let admission = null;

    if (isObjId) {
      admission = await IPDAdmission.findOne({
        _id: cleanAdmissionId,
        ...(hospitalId ? { hospitalId } : {}),
        isActive: true
      });
      if (!admission) {
        admission = await IPDAdmission.findOne({ _id: cleanAdmissionId, isActive: true });
      }
    }

    if (!admission) {
      admission = await IPDAdmission.findOne({
        admissionId: cleanAdmissionId,
        ...(hospitalId ? { hospitalId } : {}),
        isActive: true
      });
      if (!admission) {
        admission = await IPDAdmission.findOne({ admissionId: cleanAdmissionId, isActive: true });
      }
    }

    if (!admission) {
      return res.status(404).json({ success: false, message: 'Inpatient admission record not found' });
    }

    // 2. Resolve clinical review safely (without throwing BSON/CastError on .id())
    const cleanReviewId = (reviewId && typeof reviewId === 'string' && reviewId.includes('_'))
      ? reviewId.split('_')[1].trim()
      : (reviewId ? String(reviewId).trim() : '');

    let review = null;
    if (cleanReviewId && Array.isArray(admission.dailyReviews)) {
      if (mongoose.Types.ObjectId.isValid(cleanReviewId) && typeof admission.dailyReviews.id === 'function') {
        try {
          review = admission.dailyReviews.id(cleanReviewId);
        } catch (_) {}
      }
      if (!review) {
        review = admission.dailyReviews.find(r =>
          (r._id && String(r._id) === cleanReviewId) ||
          (r.id && String(r.id) === cleanReviewId) ||
          String(r.dayNumber) === cleanReviewId
        );
      }
    }

    // Fallback: If cleanReviewId wasn't matched or not provided, match the latest review with pending/sent prescriptions
    if (!review && Array.isArray(admission.dailyReviews) && admission.dailyReviews.length > 0) {
      review = [...admission.dailyReviews].reverse().find(r =>
        Array.isArray(r.prescriptions) && r.prescriptions.length > 0 &&
        r.prescriptions.some(p => p.pharmacyStatus !== 'Dispensed')
      ) || admission.dailyReviews[admission.dailyReviews.length - 1];
    }

    if (!review) {
      return res.status(404).json({ success: false, message: 'Clinical review not found for this admission' });
    }

    // 3. Mark prescriptions as Dispensed
    const now = new Date();
    review.dispensedAt = now;
    const targetPrescriptions = review.prescriptions || [];
    if (prescriptionIds && Array.isArray(prescriptionIds) && prescriptionIds.length > 0) {
      const idStrs = prescriptionIds.map(id => String(id));
      targetPrescriptions.forEach(p => {
        if (idStrs.includes(String(p._id))) {
          p.pharmacyStatus = 'Dispensed';
          p.dispensedAt = now;
        }
      });
    } else {
      targetPrescriptions.forEach(p => {
        p.pharmacyStatus = 'Dispensed';
        p.dispensedAt = now;
      });
    }

    if (items && Array.isArray(items) && items.length > 0) {
      items.forEach(it => {
        const match = targetPrescriptions.find(p => String(p._id) === String(it._id) || (p.medicineName && p.medicineName.toLowerCase() === String(it.medicineName || it.name).toLowerCase()));
        if (match) {
          if (it.substituteMedicine) match.substituteMedicine = it.substituteMedicine;
          if (it.pharmacistNotes) match.pharmacistNotes = it.pharmacistNotes;
          if (it.quantity !== undefined && Number(it.quantity) > 0) match.quantity = Number(it.quantity);
        }
      });
    }

    // 4. Safely deduct medicine stock if matching medicine is cataloged
    const escapeRegex = (s) => (s ? String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '');
    const Medicine = require('../models/Medicine');

    for (const rx of targetPrescriptions) {
      if (rx.medicineName && rx.quantity && rx.pharmacyStatus === 'Dispensed') {
        try {
          const escapedName = escapeRegex(rx.medicineName.trim());
          let med = null;
          if (hospitalId) {
            med = await Medicine.findOne({
              name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
              hospitalId
            });
          }
          if (!med) {
            med = await Medicine.findOne({
              name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
            });
          }
          if (med && typeof med.stock === 'number' && med.stock > 0) {
            const qty = Number(rx.quantity) || 1;
            med.stock = Math.max(0, med.stock - qty);
            await med.save();
          }
        } catch (stockErr) {
          console.warn('Medicine stock deduction error for IPD prescription:', stockErr.message);
        }
      }
    }

    // 5. Append pharmacist handover note if provided
    if (pharmacistNotes && typeof pharmacistNotes === 'string' && pharmacistNotes.trim()) {
      const note = `[Pharmacy Dispensed - ${new Date().toLocaleDateString('en-GB')}]: ${pharmacistNotes.trim()}`;
      admission.admissionNotes = (admission.admissionNotes ? admission.admissionNotes + '\n' : '') + note;
    }

    const userId = req.user?._id || req.user?.id || admission.updatedBy;
    if (userId) {
      admission.updatedBy = userId;
    }

    // 6. Explicit dirty tracking and resilient persistence
    if (typeof admission.markModified === 'function') {
      admission.markModified('dailyReviews');
      admission.markModified('admissionNotes');
    }

    try {
      await admission.save();
    } catch (saveErr) {
      console.warn('admission.save() validation failed, using updateOne fallback:', saveErr.message);
      await IPDAdmission.updateOne(
        { _id: admission._id },
        {
          $set: {
            dailyReviews: admission.dailyReviews,
            admissionNotes: admission.admissionNotes,
            ...(userId ? { updatedBy: userId } : {})
          }
        }
      );
    }

    // 7. Synchronize any Prescription collection record for this IPD admission/review so it never lingers as pending
    try {
      const Prescription = require('../models/Prescription');
      await Prescription.updateMany(
        {
          $or: [
            { admissionId: admission._id },
            { appointmentId: admission._id },
            ...(review.consultationId ? [{ consultationId: review.consultationId }] : [])
          ]
        },
        {
          $set: {
            isIpd: true,
            status: 'Dispensed',
            dispensedAt: new Date(),
            dispensedBy: userId
          }
        }
      );
    } catch (_) {}

    // 8. Publish workflow real-time event
    try {
      WorkflowEventHub.publish('IPD_PRESCRIPTION_DISPENSED', {
        admissionId: admission._id,
        admissionNumber: admission.admissionNumber,
        reviewId: review._id,
        hospitalId: hospitalId || admission.hospitalId,
        patientName: admission.patientId?.name,
        dispensedAt: new Date()
      });
    } catch (eventErr) {
      console.warn('WorkflowEventHub publish warning in IPD dispense:', eventErr.message);
    }

    res.json({
      success: true,
      message: 'IPD medicines dispensed to ward successfully!',
      review
    });
  } catch (err) {
    console.error('CRITICAL ERROR in dispenseIpdPrescription:', err);
    res.status(500).json({ success: false, message: 'Failed to dispense IPD medicines', error: err.message });
  }
};

