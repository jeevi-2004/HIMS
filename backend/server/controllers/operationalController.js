const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Medicine = require('../models/Medicine');
const MedicineBatch = require('../models/MedicineBatch');
const Invoice = require('../models/Invoice');
const PharmacyBill = require('../models/PharmacyBill');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Branch = require('../models/Branch');
const ClinicalDiagnosis = require('../models/ClinicalDiagnosis');
const logAudit = require('../utils/auditLogger');
const { tenantLocalStorage } = require('../utils/tenantModel');
const { WorkflowEngine, QUEUE_STATES, PAYMENT_STATES, PHARMACY_STATES } = require('../services/WorkflowEngine');
const QueueOrchestrationEngine = require('../services/QueueOrchestrationEngine');

// Generate Unique Health Identification (UHID)
const generateUHID = async () => {
  const docs = await Patient.collection
    .find({ uhid: /^PAT\d{6}$/ })
    .sort({ uhid: -1 })
    .limit(1)
    .toArray();

  const lastPatient = docs[0];
  let index = 1;

  if (lastPatient && lastPatient.uhid) {
    const match = lastPatient.uhid.match(/\d+/);
    if (match) {
      index = parseInt(match[0]) + 1;
    }
  }

  return `PAT${String(index).padStart(6, '0')}`;
};

const generateInvoiceNo = async () => {
  const count = await Invoice.countDocuments();
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `INV-${datePrefix}-${String(count + 1).padStart(4, '0')}-${randomSuffix}`;
};

// ==========================================
// PATIENT OPERATIONS
// ==========================================

const registerPatient = async (req, res, next) => {
  const { 
    name, age, gender, bloodGroup, countryCode, mobileNumber, email, allergies, contacts, addresses,
    alternativeMobile, dob, aadhaarNumber, occupation, maritalStatus, medicalAlerts
  } = req.body;
  try {
    let existingPatient = req.existingPatient;
    if (!existingPatient && mobileNumber) {
      existingPatient = await Patient.findOne({ mobileNumber, hospitalId: req.user.hospitalId });
    }

    if (existingPatient) {
      return res.status(200).json({
        success: true,
        isExisting: true,
        data: existingPatient,
        message: `Existing patient profile found (${existingPatient.uhid})`
      });
    }

    const uhid = await generateUHID();
    const patient = await Patient.create({
      name,
      uhid,
      age,
      gender,
      bloodGroup,
      countryCode: countryCode || '+91',
      mobileNumber,
      email,
      allergies,
      contacts,
      addresses,
      alternativeMobile,
      dob: dob ? new Date(dob) : undefined,
      aadhaarNumber,
      occupation,
      maritalStatus,
      medicalAlerts,
      hospitalId: req.user.hospitalId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await logAudit(req.user._id, 'REGISTER_PATIENT', 'PATIENT', { patientId: patient._id, uhid }, req);

    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

const getPatients = async (req, res, next) => {
  try {
    const patients = await Patient.find({}).sort({ createdAt: -1 }).limit(100);
    res.status(200).json({ success: true, data: patients });
  } catch (error) {
    next(error);
  }
};

const searchPatients = async (req, res, next) => {
  const { query } = req.query;
  try {
    let filter = {};
    if (query) {
      filter = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { mobileNumber: { $regex: query } },
          { uhid: { $regex: query, $options: 'i' } },
          { aadhaarNumber: { $regex: query } }
        ]
      };
    }
    const patients = await Patient.find(filter).limit(20);
    res.status(200).json({ success: true, data: patients });
  } catch (error) {
    next(error);
  }
};

const updatePatient = async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    const allowedFields = [
      'name', 'age', 'gender', 'bloodGroup', 'countryCode', 'mobileNumber', 'email',
      'alternativeMobile', 'dob', 'aadhaarNumber', 'occupation', 'maritalStatus',
      'medicalAlerts', 'allergies', 'contacts', 'addresses', 'address', 'isProfileCompleted'
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        patient[field] = updates[field];
      }
    });

    patient.updatedBy = req.user._id;
    await patient.save();

    await logAudit(req.user._id, 'UPDATE_PATIENT', 'PATIENT', { patientId: patient._id }, req);

    res.status(200).json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// APPOINTMENT & OPD QUEUE OPERATIONS
// ==========================================

const bookAppointment = async (req, res, next) => {
  const { 
    patientId, doctorId, date, time, consultationType, 
    billingStatus, consultationFee, paymentMethod, chiefComplaint, isEmergency,
    appointmentSlot, bookingSource
  } = req.body;
  try {
    const isEmgApp = Boolean(isEmergency);
    const Hospital = require('../models/Hospital');
    const hospital = await Hospital.findById(req.user.hospitalId);

    // Geofence Enforcement during OPD Token Generation
    const geoSettings = hospital?.geolocationSettings || {};
    if (geoSettings.enabled && geoSettings.latitude != null && geoSettings.longitude != null) {
      const userRoleName = (req.user?.roleId?.name || req.user?.roleId || req.user?.role || '').toString().toUpperCase();
      const isSuperAdmin = userRoleName.includes('SUPER_ADMIN');

      if (!isSuperAdmin) {
        const { latitude, longitude, bypassPin } = req.body;
        const { isWithinGeofence } = require('../utils/geoUtils');

        let bypassApproved = false;
        if (bypassPin && geoSettings.allowBypassWithPin && hospital?.adminPin) {
          const bcrypt = require('bcryptjs');
          bypassApproved = await bcrypt.compare(bypassPin, hospital.adminPin);
        }

        if (!bypassApproved) {
          if (latitude == null || longitude == null) {
            return res.status(403).json({
              success: false,
              code: 'GPS_PERMISSION_REQUIRED',
              message: `GPS Location is required to generate OPD Tokens under ${hospital?.name || 'hospital'}. Please allow location permissions on your device.`
            });
          }

          const { isWithin, distanceMeters } = isWithinGeofence(
            parseFloat(latitude),
            parseFloat(longitude),
            geoSettings.latitude,
            geoSettings.longitude,
            geoSettings.radiusMeters || 300
          );

          if (!isWithin) {
            await logAudit(req.user._id, 'GPS_GEOFENCE_VIOLATION', 'APPOINTMENT', {
              distanceMeters,
              allowedRadius: geoSettings.radiusMeters || 300,
              userLat: latitude,
              userLng: longitude
            }, req);

            return res.status(403).json({
              success: false,
              code: 'GEOFENCE_OUT_OF_RANGE',
              distanceMeters,
              allowedRadius: geoSettings.radiusMeters || 300,
              message: `OPD Token Generation Blocked: You are located ${distanceMeters}m away from hospital premises (${hospital?.name || 'hospital'}). OPD Token generation is permitted within ${geoSettings.radiusMeters || 300}m radius.`
            });
          }
        }
      }
    }

    const configuredOpPrefix = hospital?.queueRulesSettings?.tokenPrefix || 'OP';

    const tokenPrefix = configuredOpPrefix;
    const tokenType = isEmgApp ? 'EMERGENCY' : 'NORMAL';
    const priority = isEmgApp ? 'EMERGENCY' : 'NORMAL';

    // Generate Daily Reset, Branch-Scoped Sequential Token Number
    const dateStr = String(date || '').split('T')[0] || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);
    const targetBookingDate = new Date(`${dateStr}T12:00:00.000Z`);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const isFutureBooking = startOfDay > todayStart;

    // Check for existing double-booking on same doctor, date, and time slot
    if (doctorId && time) {
      const normTime = String(time).trim();
      const existingBooking = await Appointment.findOne({
        doctorId,
        date: { $gte: startOfDay, $lte: endOfDay },
        time: normTime,
        status: { $ne: 'Cancelled' },
        'workflow.queueState': { $ne: 'CANCELLED' }
      });

      if (existingBooking) {
        return res.status(400).json({
          success: false,
          message: `Time slot (${normTime}) is already booked for this doctor on the selected date. Please select another available slot.`
        });
      }
    }

    const countFilter = {
      date: { $gte: startOfDay, $lte: endOfDay },
      tokenType: tokenType
    };
    if (req.user.branchId) {
      countFilter.branchId = req.user.branchId;
    }

    const isScheduledApp = isFutureBooking || String(consultationType || '').toLowerCase() === 'appointment';

    const count = await Appointment.countDocuments(countFilter);

    const index = count + 1;
    const generatedTokenNumber = `${tokenPrefix}${String(index).padStart(3, '0')}`;
    const tokenNumber = isScheduledApp ? '' : generatedTokenNumber;

    const rawBillingStatus = String(billingStatus || '').trim();
    const effectiveBillingStatus = (rawBillingStatus === 'Pending' || !rawBillingStatus) ? 'Unpaid' : rawBillingStatus;

    const { workflow, metadata, history } = WorkflowEngine.initializeWorkflow({
      billingStatus: effectiveBillingStatus,
      consultationType: consultationType || (isScheduledApp ? 'Appointment' : 'Walk-In'),
      isEmergency: isEmgApp
    }, req.user);

    if (effectiveBillingStatus === 'Paid' || effectiveBillingStatus === 'Exempt') {
      metadata.paymentCollectedBy = req.user._id;
    }

    const initialStatus = isEmgApp ? 'Arrived' : (isScheduledApp ? 'Scheduled' : 'Waiting');
    const initialQueueState = isEmgApp ? 'WAITING' : (isScheduledApp ? 'SCHEDULED' : (workflow?.queueState || 'WAITING'));

    const appointment = await Appointment.create({
      patientId,
      doctorId,
      date: targetBookingDate,
      time: time || '09:00 AM',
      tokenNumber,
      consultationType: consultationType || (isFutureBooking ? 'Appointment' : 'Walk-In'),
      chiefComplaint,
      isEmergency: isEmgApp,
      priorityLevel: priority,
      priority: priority,
      tokenType: tokenType,
      queueType: tokenType,
      consultationFee: consultationFee || 500,
      paymentMethod: paymentMethod || 'Cash',
      status: initialStatus,
      queueStatus: initialStatus,
      billingStatus: effectiveBillingStatus,
      appointmentSlot: appointmentSlot || null,
      bookingSource: bookingSource || 'RECEPTION',
      isFutureBooking: isFutureBooking,
      workflow: {
        ...workflow,
        queueState: initialQueueState
      },
      workflowMetadata: metadata,
      hospitalId: req.user.hospitalId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      billingPolicySnapshot: {
        consultationFeeType: hospital?.billingWorkflowSettings?.consultationFeeType || 'Predefined',
        feeCollectionRole: hospital?.billingWorkflowSettings?.feeCollectionRole || 'Reception',
        paymentTiming: hospital?.billingWorkflowSettings?.paymentTiming || 'Before Consultation',
        capturedAt: new Date()
      }
    });

    // Create corresponding Invoice document for financial ledger reconciliation
    try {
      const invoiceNo = await generateInvoiceNo();
      const fee = parseFloat(consultationFee) || 500;
      await Invoice.create({
        invoiceNo,
        patientId,
        appointmentId: appointment._id,
        items: [{
          name: `OPD Consultation (${tokenType || 'NORMAL'})`,
          quantity: 1,
          unitPrice: fee,
          amount: fee
        }],
        totalAmount: fee,
        discount: 0,
        tax: 0,
        grandTotal: fee,
        paymentStatus: effectiveBillingStatus === 'Paid' ? 'Paid' : 'Unpaid',
        paymentMode: effectiveBillingStatus === 'Paid' ? (paymentMethod || 'Cash') : 'N/A',
        hospitalId: req.user.hospitalId,
        branchId: req.user.branchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });
    } catch (invErr) {
      console.error('Invoice creation during bookAppointment warning:', invErr);
    }

    await logAudit(req.user._id, 'BOOK_APPOINTMENT', 'OPD', { appointmentId: appointment._id, patientId }, req);

    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

const getAppointments = async (req, res, next) => {
  const { doctorId, date, status } = req.query;
  try {
    // Heal any appointments with no tokenNumber that were mistakenly mutated to Waiting
    try {
      await Appointment.updateMany(
        {
          $or: [{ tokenNumber: { $exists: false } }, { tokenNumber: '' }, { tokenNumber: null }],
          status: 'Waiting',
          'workflow.timestamps.checkedInAt': { $exists: false }
        },
        {
          $set: {
            status: 'Scheduled',
            queueStatus: 'Scheduled',
            'workflow.queueState': 'SCHEDULED'
          }
        }
      );
    } catch (healErr) {}

    let query = {};
    
    // Scoped queries
    if (doctorId) {
      query.doctorId = doctorId;
    } else if (req.user.roleId?.name === 'DOCTOR') {
      query.doctorId = req.user._id;
    }

    const filterFromDate = req.query.fromDate || date;
    const filterToDate = req.query.toDate || date;

    if (filterFromDate || filterToDate) {
      const cleanFrom = String(filterFromDate || filterToDate).replace(/[^0-9\-T:]/g, '');
      const cleanTo = String(filterToDate || filterFromDate).replace(/[^0-9\-T:]/g, '');

      const fromStr = cleanFrom.split('T')[0];
      const toStr = cleanTo.split('T')[0];

      if (fromStr && toStr && fromStr.length === 10 && toStr.length === 10) {
        const [yFrom, mFrom, dFrom] = fromStr.split('-').map(Number);
        const [yTo, mTo, dTo] = toStr.split('-').map(Number);

        const localStartOfDay = new Date(yFrom, mFrom - 1, dFrom, 0, 0, 0, 0);
        const localEndOfDay = new Date(yTo, mTo - 1, dTo, 23, 59, 59, 999);

        const utcStartOfDay = new Date(`${fromStr}T00:00:00.000Z`);
        const utcEndOfDay = new Date(`${toStr}T23:59:59.999Z`);

        if (!isNaN(localStartOfDay.getTime()) && !isNaN(localEndOfDay.getTime())) {
          const minStart = new Date(Math.min(localStartOfDay.getTime(), utcStartOfDay.getTime()));
          const maxEnd = new Date(Math.max(localEndOfDay.getTime(), utcEndOfDay.getTime()));

          if (req.query.daysLimit) {
            const limit = parseInt(req.query.daysLimit) || 0;
            maxEnd.setDate(maxEnd.getDate() + limit);
          }

          if (req.query.includeUpcomingScheduled === 'true' || req.query.includeScheduled === 'true') {
            query.$or = [
              { date: { $gte: minStart, $lte: maxEnd } },
              { status: 'Scheduled', date: { $gte: minStart } },
              { queueStatus: 'Scheduled', date: { $gte: minStart } },
              { 'workflow.queueState': 'SCHEDULED', date: { $gte: minStart } }
            ];
          } else {
            query.date = { $gte: minStart, $lte: maxEnd };
          }
        }
      }
    }
    
    if (status) {
      if (status === 'Completed') {
        query.$or = [
          { status: 'Completed' },
          { queueStatus: { $in: ['Sent To Pharmacy', 'Dispensing', 'Dispensed'] } }
        ];
      } else {
        query.status = status;
      }
    }

    const rawAppointments = await Appointment.find(query)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup allergies')
      .populate('doctorId', 'name employeeCode')
      .sort({ createdAt: 1 });

    const Hospital = require('../models/Hospital');
    const hospital = await Hospital.findById(req.user.hospitalId);
    const emgPrefix = hospital?.billingWorkflowSettings?.emergencyTokenPrefix || 'EMG';

    let emgIndex = 1;
    const appointments = rawAppointments.map((app) => {
      const appObj = app.toObject();
      const pName = (appObj.patientId?.name || '').toLowerCase();
      const isEmg = appObj.isEmergency || 
                    appObj.priorityLevel === 'EMERGENCY' || 
                    appObj.priority === 'EMERGENCY' || 
                    (appObj.consultationType || '').toLowerCase() === 'emergency' ||
                    pName.includes('unknown');

      if (isEmg) {
        if (!appObj.tokenNumber || appObj.tokenNumber.startsWith('OP')) {
          const newToken = `${emgPrefix}${String(emgIndex).padStart(3, '0')}`;
          appObj.tokenNumber = newToken;
          appObj.isEmergency = true;
          appObj.priorityLevel = 'EMERGENCY';
          appObj.priority = 'EMERGENCY';
          appObj.tokenType = 'EMERGENCY';

          // Asynchronously update MongoDB document
          Appointment.updateOne(
            { _id: app._id },
            { 
              tokenNumber: newToken, 
              isEmergency: true, 
              priorityLevel: 'EMERGENCY', 
              priority: 'EMERGENCY', 
              tokenType: 'EMERGENCY' 
            }
          ).exec().catch(() => {});
        }
        emgIndex++;
      }

      if (!appObj.tokenNumber || appObj.tokenNumber === '') {
        if (appObj.status !== 'Completed' && appObj.status !== 'In Consultation' && appObj.status !== 'Sent to Pharmacy' && appObj.status !== 'Cancelled') {
          appObj.status = 'Scheduled';
          appObj.queueStatus = 'Scheduled';
          if (!appObj.workflow) appObj.workflow = {};
          appObj.workflow.queueState = 'SCHEDULED';
        }
      }

      return appObj;
    });

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
};

const enterVitals = async (req, res, next) => {
  const { id } = req.params;
  const { vitals } = req.body;
  try {
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment slot not found' });
    }

    appointment.vitals = vitals;
    appointment.status = 'Admitted'; // Mark as admitted/vitals entered
    appointment.updatedBy = req.user._id;
    await appointment.save();

    await logAudit(req.user._id, 'RECORD_VITALS', 'OPD', { appointmentId: appointment._id, vitals }, req);

    res.status(200).json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

const updateQueueStatus = async (req, res, next) => {
  const { id } = req.params;
  const { queueStatus, status, billingStatus, doctorId, date, time } = req.body;
  try {
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Queue appointment not found' });
    }

    if (queueStatus !== undefined || status !== undefined) {
      const targetInput = queueStatus !== undefined ? queueStatus : status;
      const targetQueueState = WorkflowEngine.mapLegacyToQueueState(targetInput);
      if (targetQueueState) {
        WorkflowEngine.transitionQueueState(appointment, targetQueueState, req.user);
      }
    }
    
    if (billingStatus !== undefined) {
      const targetPaymentState = WorkflowEngine.mapLegacyToPaymentState(billingStatus);
      if (targetPaymentState) {
        WorkflowEngine.transitionPaymentState(appointment, targetPaymentState, req.user);
      }
    }

    if (doctorId !== undefined) {
      appointment.doctorId = doctorId;
    }
    if (date !== undefined) {
      appointment.date = new Date(date);
    }
    if (time !== undefined) {
      appointment.time = time;
    }
    
    appointment.updatedBy = req.user._id;
    await appointment.save();

    // Sync corresponding Invoice document if payment status changed
    try {
      const isPaid = (appointment.billingStatus === 'Paid' || appointment.workflow?.paymentState === 'PAID');
      const payMode = req.body.paymentMethod || appointment.paymentMethod || 'Cash';
      let inv = await Invoice.findOne({ appointmentId: appointment._id });
      if (inv) {
        inv.paymentStatus = isPaid ? 'Paid' : (appointment.billingStatus || 'Unpaid');
        if (isPaid) inv.paymentMode = payMode;
        inv.updatedBy = req.user._id;
        await inv.save();
      } else if (isPaid) {
        const invoiceNo = await generateInvoiceNo();
        const fee = parseFloat(appointment.consultationFee) || 500;
        await Invoice.create({
          invoiceNo,
          patientId: appointment.patientId,
          appointmentId: appointment._id,
          items: [{
            name: 'OPD Consultation',
            quantity: 1,
            unitPrice: fee,
            amount: fee
          }],
          totalAmount: fee,
          discount: 0,
          tax: 0,
          grandTotal: fee,
          paymentStatus: 'Paid',
          paymentMode: payMode,
          hospitalId: appointment.hospitalId || req.user.hospitalId,
          branchId: appointment.branchId || req.user.branchId,
          createdBy: req.user._id,
          updatedBy: req.user._id
        });
      }
    } catch (syncErr) {
      console.error('Invoice sync error in updateQueueStatus:', syncErr);
    }

    // Populate for SSE Broadcast
    const populated = await Appointment.findById(appointment._id)
      .populate('patientId', 'name uhid age gender mobileNumber')
      .populate('doctorId', 'name roomNo doctorProfile');

    const WorkflowEventHub = require('../services/WorkflowEventHub');
    WorkflowEventHub.publish('PatientCalled', {
      _id: populated._id,
      tokenNumber: populated.tokenNumber,
      queueState: populated.status || populated.queueStatus,
      patientId: populated.patientId,
      doctorId: populated.doctorId,
      patientName: populated.patientId?.name,
      doctorName: populated.doctorId?.name,
      roomNo: populated.doctorId?.roomNo || populated.doctorId?.doctorProfile?.roomNo || 'Room 1'
    });

    res.status(200).json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// DOCTOR CONSULTATION OPERATIONS
// ==========================================

const createConsultation = async (req, res, next) => {
  const { 
    appointmentId, patientId, diagnosis, clinicalNotes, advice, followupDate, prescriptions,
    chiefComplaint, historyOfPresentIllness, examinationFindings, painScale, symptoms, vitals,
    primaryDiagnosis, diagnoses, secondaryDiagnosis, icd10Code, clinicalImpression, differentialDiagnosis,
    assessmentNotes, diagnosisStatus, dietAdvice, exerciseAdvice, restrictions, generalInstructions,
    returnPrecautions, patientEducation, followupRequired, followupTime, followupReason, followupPriority,
    documents, investigations
  } = req.body;

  const isValidHexObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

  const validHospitalId = (req.user?.hospitalId && isValidHexObjectId(String(req.user.hospitalId))) ? req.user.hospitalId : undefined;
  const validBranchId = (req.user?.branchId && isValidHexObjectId(String(req.user.branchId))) ? req.user.branchId : undefined;

  const activeDiagnoses = (diagnoses && Array.isArray(diagnoses) && diagnoses.length > 0)
    ? diagnoses.filter(d => typeof d === 'string' && d.trim().length > 0)
    : (primaryDiagnosis && primaryDiagnosis.trim() ? [primaryDiagnosis.trim()] : (diagnosis && diagnosis.trim() ? [diagnosis.trim()] : []));

  const finalDiagnosis = (diagnosis && diagnosis.trim()) 
    || (activeDiagnoses.length > 0 ? activeDiagnoses.join(', ') : '')
    || 'General Consultation';

  const hasRx = prescriptions && Array.isArray(prescriptions) && prescriptions.length > 0;

  const sanitizedRxItems = (prescriptions || []).map(p => {
    const item = {
      medicineName: p.medicineName || 'Medication',
      dosage: p.dosage || `${p.morning || '1'}-${p.afternoon || '0'}-${p.night || '1'}`,
      frequency: p.frequency || 'BD',
      duration: p.duration || '5 Days',
      instructions: p.instructions || p.foodTiming || p.food || 'After Food',
      foodTiming: p.foodTiming || p.instructions || p.food || 'After Food',
      morning: p.morning || '1',
      afternoon: p.afternoon || '0',
      night: p.night || '1',
      route: p.route || 'Oral',
      quantity: typeof p.quantity === 'number' ? p.quantity : (parseInt(p.quantity) || 10),
      notes: p.notes || p.remarks || ''
    };
    if (p.medicineId && isValidHexObjectId(String(p.medicineId))) {
      item.medicineId = p.medicineId;
    } else {
      item.medicineId = null;
    }
    return item;
  });

  const runConsultationSave = async (options = {}) => {
    // 1. Create or Update Consultation record (Status COMPLETED)
    let consultation;
    const existingConsultation = await Consultation.findOne({ appointmentId }, null, options);

    if (existingConsultation) {
      existingConsultation.diagnosis = finalDiagnosis;
      existingConsultation.clinicalNotes = clinicalNotes || '';
      existingConsultation.advice = advice || '';
      existingConsultation.followupDate = followupDate ? new Date(followupDate) : undefined;
      existingConsultation.chiefComplaint = chiefComplaint || finalDiagnosis;
      existingConsultation.historyOfPresentIllness = historyOfPresentIllness || '';
      existingConsultation.examinationFindings = examinationFindings || '';
      existingConsultation.painScale = typeof painScale === 'number' ? painScale : 0;
      existingConsultation.symptoms = symptoms || '';
      existingConsultation.vitals = vitals && typeof vitals === 'object' ? vitals : {};
      existingConsultation.primaryDiagnosis = primaryDiagnosis || (activeDiagnoses.length > 0 ? activeDiagnoses[0] : finalDiagnosis);
      existingConsultation.diagnoses = activeDiagnoses.length > 0 ? activeDiagnoses : [finalDiagnosis];
      existingConsultation.secondaryDiagnosis = secondaryDiagnosis || '';
      existingConsultation.icd10Code = icd10Code || '';
      existingConsultation.clinicalImpression = clinicalImpression || '';
      existingConsultation.differentialDiagnosis = differentialDiagnosis || '';
      existingConsultation.assessmentNotes = assessmentNotes || '';
      existingConsultation.diagnosisStatus = diagnosisStatus || 'Provisional';
      existingConsultation.status = 'COMPLETED';
      existingConsultation.dietAdvice = dietAdvice || '';
      existingConsultation.exerciseAdvice = exerciseAdvice || '';
      existingConsultation.restrictions = restrictions || '';
      existingConsultation.generalInstructions = generalInstructions || '';
      existingConsultation.returnPrecautions = returnPrecautions || '';
      existingConsultation.patientEducation = patientEducation || '';
      existingConsultation.followupRequired = !!followupRequired;
      existingConsultation.followupTime = followupTime || '';
      existingConsultation.followupReason = followupReason || '';
      existingConsultation.followupPriority = followupPriority || 'Routine';
      existingConsultation.documents = Array.isArray(documents) ? documents : [];
      existingConsultation.updatedBy = req.user._id;

      consultation = await existingConsultation.save(options);
    } else {
      const createdDocs = await Consultation.create([{
        appointmentId,
        patientId,
        doctorId: req.user._id,
        diagnosis: finalDiagnosis,
        clinicalNotes: clinicalNotes || '',
        advice: advice || '',
        followupDate: followupDate ? new Date(followupDate) : undefined,
        chiefComplaint: chiefComplaint || finalDiagnosis,
        historyOfPresentIllness: historyOfPresentIllness || '',
        examinationFindings: examinationFindings || '',
        painScale: typeof painScale === 'number' ? painScale : 0,
        symptoms: symptoms || '',
        vitals: vitals && typeof vitals === 'object' ? vitals : {},
        primaryDiagnosis: primaryDiagnosis || (activeDiagnoses.length > 0 ? activeDiagnoses[0] : finalDiagnosis),
        diagnoses: activeDiagnoses.length > 0 ? activeDiagnoses : [finalDiagnosis],
        secondaryDiagnosis: secondaryDiagnosis || '',
        icd10Code: icd10Code || '',
        clinicalImpression: clinicalImpression || '',
        differentialDiagnosis: differentialDiagnosis || '',
        assessmentNotes: assessmentNotes || '',
        diagnosisStatus: diagnosisStatus || 'Provisional',
        status: 'COMPLETED',
        dietAdvice: dietAdvice || '',
        exerciseAdvice: exerciseAdvice || '',
        restrictions: restrictions || '',
        generalInstructions: generalInstructions || '',
        returnPrecautions: returnPrecautions || '',
        patientEducation: patientEducation || '',
        followupRequired: !!followupRequired,
        followupTime: followupTime || '',
        followupReason: followupReason || '',
        followupPriority: followupPriority || 'Routine',
        documents: Array.isArray(documents) ? documents : [],
        hospitalId: validHospitalId,
        branchId: validBranchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }], options);
      consultation = createdDocs[0];
    }

    // Determine Prescription Delivery Routing from Hospital Settings & Request
    const hospitalForDelivery = validHospitalId ? await Hospital.findById(validHospitalId, null, options) : null;
    const configuredDelivery = hospitalForDelivery?.billingWorkflowSettings?.prescriptionDelivery || 'internal_pharmacy';
    const reqDelivery = req.body.deliveryMethod || req.body.prescriptionDelivery;

    // Request explicit delivery choice takes precedence if present, fallback to hospital settings
    const effectiveDelivery = reqDelivery || configuredDelivery;
    const isExternalPrint = effectiveDelivery === 'print_only' || effectiveDelivery === 'external_print' || effectiveDelivery === 'external';
    const shouldSendToPharmacy = hasRx && !isExternalPrint;

    // 2. Create Prescription mapping if medicines exist
    let prescription = null;
    if (hasRx && shouldSendToPharmacy) {
      const rxDocs = await Prescription.create([{
        consultationId: consultation._id,
        patientId,
        doctorId: req.user._id,
        items: sanitizedRxItems,
        status: 'Pending',
        sentToPharmacyAt: new Date(),
        sentByDoctorId: req.user._id,
        hospitalId: validHospitalId,
        branchId: validBranchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }], options);
      prescription = rxDocs[0];
    } else if (hasRx) {
      const rxDocs = await Prescription.create([{
        consultationId: consultation._id,
        patientId,
        doctorId: req.user._id,
        items: sanitizedRxItems,
        status: 'External',
        printedAt: new Date(),
        sentByDoctorId: req.user._id,
        hospitalId: validHospitalId,
        branchId: validBranchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }], options);
      prescription = rxDocs[0];
    }

    // 3. Populate snapshot entities
    const patientDoc = await Patient.findById(patientId, null, options);
    const doctorDoc = await User.findById(req.user._id, null, options);
    const hospitalDoc = hospitalForDelivery || (validHospitalId ? await Hospital.findById(validHospitalId, null, options) : null);
    const branchDoc = validBranchId ? await Branch.findById(validBranchId, null, options) : null;
    const appointment = await Appointment.findById(appointmentId, null, options);

    // 4. Update Consultation status to past
    consultation.status = 'past';
    await consultation.save(options);

    const snapshot = consultation;

    // 5. Update Appointment & Queue state based on delivery routing
    if (appointment) {
      const targetState = shouldSendToPharmacy ? QUEUE_STATES.SENT_TO_PHARMACY : QUEUE_STATES.COMPLETED;
      WorkflowEngine.transitionQueueState(appointment, targetState, req.user);
      appointment.status = 'Completed';
      appointment.completedByDoctorId = req.user._id;
      if (req.body.consultationFee !== undefined && !isNaN(Number(req.body.consultationFee))) {
        appointment.consultationFee = Number(req.body.consultationFee);
      }
      if (shouldSendToPharmacy) {
        appointment.sentToPharmacyAt = new Date();
        appointment.sentByDoctorId = req.user._id;
      }
      await appointment.save(options);
    }

    // 6. Create Invoice
    const invoiceNo = await generateInvoiceNo();
    let totalAmount = 0;
    let invoiceItems = [
      { name: 'OPD Consultation Fee', quantity: 1, unitPrice: 300 }
    ];
    if (prescriptions && prescriptions.length > 0) {
      for (const rx of prescriptions) {
        const hasValidMedicineId = rx.medicineId && isValidHexObjectId(String(rx.medicineId));
        const med = hasValidMedicineId ? await Medicine.findById(rx.medicineId, null, options) : null;
        const price = med ? med.unitPrice : 50;
        invoiceItems.push({
          name: rx.medicineName || 'Medication Charges',
          quantity: rx.quantity || 1,
          unitPrice: price
        });
      }
    }

    const processedItems = invoiceItems.map(item => {
      const amt = item.quantity * item.unitPrice;
      totalAmount += amt;
      return { ...item, amount: amt };
    });

    const tax = totalAmount * 0.18;
    const grandTotal = totalAmount + tax;

    await Invoice.create([{
      invoiceNo,
      patientId,
      appointmentId,
      items: processedItems,
      totalAmount,
      discount: 0,
      tax,
      grandTotal,
      paymentStatus: 'Unpaid',
      hospitalId: validHospitalId,
      branchId: validBranchId,
      createdBy: req.user._id,
      updatedBy: req.user._id
    }], options);

    // 7. Followup Appointment
    if (followupRequired && followupDate) {
      const startOfDay = new Date(followupDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(followupDate);
      endOfDay.setHours(23, 59, 59, 999);

      const count = await Appointment.countDocuments({
        ...(validBranchId ? { branchId: validBranchId } : {}),
        date: { $gte: startOfDay, $lte: endOfDay }
      });

      const index = count + 1;
      const tokenNumber = `OP${String(index).padStart(3, '0')}`;

      await Appointment.create([{
        patientId,
        doctorId: req.user._id,
        date: new Date(followupDate),
        time: followupTime || '10:00 AM',
        tokenNumber,
        consultationType: 'Follow-Up',
        status: 'Scheduled',
        queueStatus: 'Waiting',
        billingStatus: 'Unpaid',
        hospitalId: validHospitalId,
        branchId: validBranchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }], options);
    }

    // Auto-Upsert diagnosis into ClinicalDiagnosis tenant master
    if (activeDiagnoses && activeDiagnoses.length > 0) {
      for (const diagName of activeDiagnoses) {
        if (!diagName || !diagName.trim()) continue;
        const rawName = diagName.trim();
        const normalizedName = rawName.toLowerCase().replace(/\s+/g, ' ');

        try {
          await ClinicalDiagnosis.updateOne(
            { normalizedName },
            {
              $setOnInsert: {
                name: rawName,
                normalizedName,
                icd10Code: '',
                source: 'DOCTOR_ADDED',
                createdBy: req.user._id,
                updatedBy: req.user._id
              }
            },
            { upsert: true, ...(options || {}) }
          );
        } catch (err) {
          console.error('Error auto-upserting ClinicalDiagnosis:', err);
        }
      }
    }

    return { consultation, prescription, snapshot };
  };

  let session = null;
  let isTransactionActive = false;

  const store = tenantLocalStorage?.getStore ? tenantLocalStorage.getStore() : null;
  const activeConnection = store && store.connection;
  const connectionToUse = activeConnection || mongoose.connection;

  try {
    try {
      if (connectionToUse && typeof connectionToUse.startSession === 'function') {
        session = await connectionToUse.startSession();
        session.startTransaction();
        isTransactionActive = true;
      }
    } catch (e) {
      session = null;
      isTransactionActive = false;
    }

    const result = await runConsultationSave(isTransactionActive ? { session } : {});

    if (isTransactionActive && session) {
      await session.commitTransaction();
      session.endSession();
    }

    try {
      await logAudit(req.user._id, 'CREATE_CONSULTATION_SNAPSHOT', 'OPD', { consultationId: result.consultation._id, snapshotId: result.snapshot._id, snapshotVersion: result.snapshot.snapshotVersion, patientId }, req);
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: 'Consultation completed and immutable snapshot created successfully.',
      data: result
    });
  } catch (error) {
    if (isTransactionActive && session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (_) {}
    }

    // Fallback if session mismatch or replica set constraint error happens
    if (/ClientSession|MongoClient|replica set/i.test(error.message)) {
      console.warn('[createConsultation] Transaction session mismatch caught. Retrying consultation completion without session...');
      try {
        const result = await runConsultationSave({});
        try {
          await logAudit(req.user._id, 'CREATE_CONSULTATION_SNAPSHOT', 'OPD', { consultationId: result.consultation._id, snapshotId: result.snapshot._id, snapshotVersion: result.snapshot.snapshotVersion, patientId }, req);
        } catch (_) {}
        return res.status(201).json({
          success: true,
          message: 'Consultation completed and immutable snapshot created successfully.',
          data: result
        });
      } catch (fallbackError) {
        console.error('[createConsultation] Fallback save failed:', fallbackError);
        return res.status(500).json({
          success: false,
          message: fallbackError.message || 'Unable to finalize consultation. Please try again.',
          details: fallbackError.stack
        });
      }
    }

    console.error('[createConsultation] Exception caught:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to finalize consultation. Please try again.',
      details: error.stack
    });
  }
};

const getPatientHistory = async (req, res, next) => {
  const { patientId } = req.params;
  try {
    const consultations = await Consultation.find({ patientId, status: 'past' })
      .populate('appointmentId')
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });

    const activeConsultations = await Consultation.find({ patientId, status: 'active' })
      .populate('appointmentId')
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });

    const prescriptions = await Prescription.find({ patientId })
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        snapshots: consultations,
        consultations: activeConsultations,
        prescriptions
      }
    });
  } catch (error) {
    next(error);
  }
};

const getConsultationSnapshot = async (req, res, next) => {
  const { consultationId } = req.params;
  try {
    let consultation = null;
    if (mongoose.Types.ObjectId.isValid(consultationId)) {
      consultation = await Consultation.findOne({
        $or: [
          { _id: consultationId },
          { appointmentId: consultationId }
        ]
      }).populate('patientId').populate('doctorId', 'name');
    }

    if (!consultation) {
      return res.status(200).json({ success: true, data: null, message: 'Consultation record not found' });
    }

    const consultObj = consultation.toObject();

    // Fetch linked prescription items if not embedded directly
    if (!consultObj.prescriptions || consultObj.prescriptions.length === 0) {
      const rxDoc = await Prescription.findOne({
        $or: [
          { consultationId: consultation._id },
          { consultationId: consultation.appointmentId }
        ]
      });
      if (rxDoc && rxDoc.items && rxDoc.items.length > 0) {
        consultObj.prescriptions = rxDoc.items.map(item => ({
          _id: item._id,
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          dose: item.dosage || `${item.morning || '1'}-${item.afternoon || '0'}-${item.night || '1'}`,
          timing: item.instructions || item.foodTiming || 'After Food',
          duration: item.duration || '5 Days',
          quantity: item.quantity || 10,
          remarks: item.notes || ''
        }));
      }
    }

    res.status(200).json({ success: true, data: consultObj });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// PHARMACY INVENTORY OPERATIONS
// ==========================================

const createMedicine = async (req, res, next) => {
  const { name, category, unitPrice, rackNo } = req.body;
  try {
    const med = await Medicine.create({
      name,
      category,
      unitPrice,
      rackNo,
      hospitalId: req.user.hospitalId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    res.status(201).json({ success: true, data: med });
  } catch (error) {
    next(error);
  }
};

const getMedicines = async (req, res, next) => {
  try {
    const medicines = await Medicine.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
};

const addMedicineBatch = async (req, res, next) => {
  const { medicineId, batchCode, expiryDate, stock, unitPrice } = req.body;
  try {
    const batch = await MedicineBatch.create({
      medicineId,
      batchCode,
      expiryDate: new Date(expiryDate),
      stock,
      unitPrice,
      hospitalId: req.user.hospitalId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    // Update aggregate stock in medicine
    const med = await Medicine.findById(medicineId);
    if (med) {
      med.stock += parseInt(stock);
      await med.save();
    }

    res.status(201).json({ success: true, data: batch });
  } catch (error) {
    next(error);
  }
};

const getMedicineBatches = async (req, res, next) => {
  const { medicineId } = req.params;
  try {
    if (!medicineId || !mongoose.Types.ObjectId.isValid(medicineId)) {
      return res.status(200).json({ success: true, data: [] });
    }
    const batches = await MedicineBatch.find({ medicineId, stock: { $gt: 0 } }).sort({ expiryDate: 1 });
    res.status(200).json({ success: true, data: batches });
  } catch (error) {
    next(error);
  }
};

const getPrescriptionQueue = async (req, res, next) => {
  const { filter } = req.query;
  try {
    let query = {};
    if (filter === 'history') {
      query = {
        $or: [
          { status: { $in: [/^dispensed$/i, /^completed$/i, /^cancelled$/i, /^paid$/i, /^partially dispensed$/i] } },
          { dispensedAt: { $exists: true, $ne: null } }
        ]
      };
    } else {
      query = {
        status: { $in: [/^pending$/i, /^dispensing$/i, /^in progress$/i, /^waiting payment$/i] },
        dispensedAt: { $exists: false }
      };
    }

    const queue = await Prescription.find(query)
      .populate('patientId', 'name uhid age gender mobileNumber')
      .populate('doctorId', 'name')
      .populate('dispensedBy', 'name')
      .sort({ createdAt: -1 });

    console.log(`[getPrescriptionQueue] Filter: '${filter}', Found records count: ${queue.length}`);

    res.status(200).json({ success: true, data: queue });
  } catch (error) {
    next(error);
  }
};

const getPrescriptionById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const rx = await Prescription.findById(id)
      .populate('patientId')
      .populate('doctorId', 'name')
      .populate('dispensedBy', 'name')
      .populate({
        path: 'consultationId',
        populate: {
          path: 'appointmentId',
          select: 'tokenNumber'
        }
      });
    if (!rx) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    res.status(200).json({ success: true, data: rx });
  } catch (error) {
    next(error);
  }
};

const dispensePrescription = async (req, res, next) => {
  const { 
    prescriptionId, 
    dispenseItems = [], 
    patientId,
    status, // overall status: 'Dispensing', 'Dispensed', 'Partially Dispensed', 'Cancelled'
    items = [], // [{ _id, dispensingStatus, pharmacistNotes, substituteMedicine, quantity }]
    generalRemarks,
    deliveredBy,
    counselingChecklist
  } = req.body;
  try {
    const prescription = await Prescription.findById(prescriptionId);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // 1. Update overall status & audit fields
    if (status) {
      prescription.status = status;
      if (status === 'Waiting Payment') {
        prescription.paymentStatus = 'Unpaid';
      }
    }
    const isCompleting = status === 'Completed' || status === 'Dispensed' || status === 'Partially Dispensed';
    if (isCompleting) {
      prescription.dispensedAt = new Date();
      prescription.dispensedBy = req.user._id;
      if (status === 'Completed' || status === 'Dispensed') {
        prescription.completedAt = new Date();
        
        // Deduct medicine stock from inventory if not already done
        if (!prescription.stockDeducted) {
          for (const item of prescription.items) {
            if (item.dispensingStatus !== 'Out of Stock') {
              const substituteName = item.substituteMedicine || item.medicineName;
              // Find Medicine aggregate
              const med = await Medicine.findOne({ name: { $regex: new RegExp(`^${substituteName}$`, 'i') } });
              if (med) {
                // Deduct aggregate stock from Medicine
                med.stock = Math.max(0, med.stock - item.quantity);
                await med.save();

                // Deduct stock from MedicineBatch (earliest expiry date first)
                let qtyToDeduct = item.quantity;
                const batches = await MedicineBatch.find({ medicineId: med._id, stock: { $gt: 0 } }).sort({ expiryDate: 1 });
                for (const batch of batches) {
                  if (qtyToDeduct <= 0) break;
                  const deductFromThisBatch = Math.min(batch.stock, qtyToDeduct);
                  batch.stock -= deductFromThisBatch;
                  qtyToDeduct -= deductFromThisBatch;
                  await batch.save();
                }
              }
            }
          }
          prescription.stockDeducted = true;
        }
      }
    }

    if (generalRemarks !== undefined) prescription.generalRemarks = generalRemarks;
    if (deliveredBy !== undefined) prescription.deliveredBy = deliveredBy;
    if (counselingChecklist !== undefined) {
      prescription.counselingChecklist = counselingChecklist;
    }

    // 2. Update individual items
    if (items && items.length > 0) {
      for (const itemUpdate of items) {
        const item = prescription.items.id(itemUpdate._id);
        if (item) {
          if (itemUpdate.dispensingStatus) item.dispensingStatus = itemUpdate.dispensingStatus;
          if (itemUpdate.pharmacistNotes !== undefined) item.pharmacistNotes = itemUpdate.pharmacistNotes;
          if (itemUpdate.substituteMedicine !== undefined) item.substituteMedicine = itemUpdate.substituteMedicine;
          if (itemUpdate.quantity !== undefined) item.quantity = itemUpdate.quantity;
        }
      }
    }

    await prescription.save();

    // Sync status back to Appointment & Consultation
    const consultation = await Consultation.findById(prescription.consultationId);
    if (consultation) {
      const appointment = await Appointment.findById(consultation.appointmentId);
      if (appointment) {
        if (status === 'Dispensing' || status === 'In Progress') {
          WorkflowEngine.transitionPharmacyState(appointment, PHARMACY_STATES.DISPENSING, req.user);
        } else if (status === 'Completed' || status === 'Dispensed' || status === 'Partially Dispensed' || status === 'Paid' || status === 'Waiting Payment') {
          WorkflowEngine.transitionPharmacyState(appointment, PHARMACY_STATES.DISPENSED, req.user);
          if (appointment.billingStatus === 'Paid') {
            WorkflowEngine.transitionQueueState(appointment, QUEUE_STATES.COMPLETED, req.user);
            consultation.status = 'COMPLETED';
            await consultation.save();
          }
        } else if (status === 'Cancelled') {
          if (appointment.billingStatus === 'Paid') {
            WorkflowEngine.transitionQueueState(appointment, QUEUE_STATES.COMPLETED, req.user);
          }
          consultation.status = 'COMPLETED';
          await consultation.save();
        }
        await appointment.save();
      }
    }

    let invoice = null;

    // 3. Generate invoice only if completing and dispenseItems exist
    if (isCompleting && dispenseItems && dispenseItems.length > 0) {
      // Create Invoice
      const invoiceNo = await generateInvoiceNo();
      const invoiceItems = [];
      let totalAmount = 0;

      for (const item of dispenseItems) {
        const itemCost = item.qty * (item.unitPrice || 50);
        totalAmount += itemCost;
        invoiceItems.push({
          name: item.medicineName || 'Medication Charges',
          quantity: item.qty,
          unitPrice: item.unitPrice || 50,
          amount: itemCost
        });
      }

      const discount = 0;
      const tax = totalAmount * 0.05; // 5% GST
      const grandTotal = totalAmount + tax - discount;

      invoice = await Invoice.create({
        invoiceNo,
        patientId: patientId || prescription.patientId,
        items: invoiceItems,
        totalAmount,
        discount,
        tax,
        grandTotal,
        paymentStatus: 'Unpaid',
        hospitalId: req.user.hospitalId,
        branchId: req.user.branchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });

      await logAudit(req.user._id, 'DISPENSE_MEDICATION', 'PHARMACY', { prescriptionId, invoiceId: invoice._id }, req);
    } else {
      await logAudit(req.user._id, 'UPDATE_DISPENSING_STATUS', 'PHARMACY', { prescriptionId, status }, req);
    }

    res.status(201).json({ success: true, data: { invoice, prescription } });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// BILLING & INVOICING OPERATIONS
// ==========================================

const createInvoice = async (req, res, next) => {
  const { 
    patientId, 
    appointmentId, 
    items, 
    services, 
    discount = 0, 
    subtotal: reqSubtotal, 
    gstAmount: reqGst, 
    netAmount: reqNet, 
    paymentMode = 'Cash' 
  } = req.body;

  try {
    const rawItems = (items && items.length > 0) ? items : ((services && services.length > 0) ? services : []);
    const invoiceNo = await generateInvoiceNo();
    let computedSubtotal = 0;

    const processedItems = rawItems.map(item => {
      const price = parseFloat(item.unitPrice ?? item.price ?? 0) || 0;
      const qty = parseFloat(item.quantity ?? item.qty ?? 1) || 1;
      const amt = parseFloat((qty * price).toFixed(2));
      computedSubtotal += amt;
      return {
        name: item.name || 'Hospital Service',
        quantity: qty,
        unitPrice: price,
        amount: amt
      };
    });

    // If subtotal wasn't passed or is invalid/NaN, use computedSubtotal
    const subtotalVal = (reqSubtotal !== undefined && !isNaN(parseFloat(reqSubtotal))) ? parseFloat(reqSubtotal) : computedSubtotal;
    const totalAmount = parseFloat((subtotalVal || 0).toFixed(2));
    const discountVal = parseFloat((discount && !isNaN(parseFloat(discount))) ? parseFloat(discount) : 0);
    
    // Calculate GST tax (18%) if not explicitly passed
    const taxVal = (reqGst !== undefined && !isNaN(parseFloat(reqGst))) ? parseFloat(reqGst) : (totalAmount * 0.18);
    const tax = parseFloat((taxVal || 0).toFixed(2));
    
    // Grand Total calculation fallback
    const grandTotalVal = (reqNet !== undefined && !isNaN(parseFloat(reqNet))) ? parseFloat(reqNet) : (totalAmount + tax - discountVal);
    const grandTotal = parseFloat((grandTotalVal || 0).toFixed(2));

    const isPaid = req.body.paymentStatus === 'Paid' || req.body.isPaid === true || !!paymentMode;
    const finalPaymentStatus = isPaid ? 'Paid' : 'Unpaid';

    const invoice = await Invoice.create({
      invoiceNo,
      patientId,
      appointmentId,
      items: processedItems,
      totalAmount,
      discount: discountVal,
      tax,
      grandTotal,
      paymentMode,
      paymentStatus: finalPaymentStatus,
      hospitalId: req.user.hospitalId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    // If linked to appointment, set status
    if (appointmentId) {
      const app = await Appointment.findById(appointmentId);
      if (app) {
        app.billingStatus = finalPaymentStatus;
        app.paymentStatus = finalPaymentStatus;
        if (finalPaymentStatus === 'Paid') {
          if (app.pharmacyStatus === 'DISPENSED' || app.pharmacyStatus === 'Pending' || !app.pharmacyStatus) {
            app.status = 'Completed';
            app.queueStatus = 'Completed';
          }
        }
        await app.save();
      }
    }

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

const recordPayment = async (req, res, next) => {
  const { id } = req.params;
  const { paymentMode } = req.body;
  try {
    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Safety Guard: Prevent double-click or duplicate payment attempts on already-paid invoices
    if (invoice.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'Payment has already been completed for this invoice' });
    }

    invoice.paymentStatus = 'Paid';
    invoice.paymentMode = paymentMode;
    invoice.updatedBy = req.user._id;
    await invoice.save();

    // Mark corresponding appointment bill as Paid if linked
    if (invoice.appointmentId) {
      const app = await Appointment.findById(invoice.appointmentId);
      if (app) {
        app.billingStatus = 'Paid';
        if (app.pharmacyStatus === 'DISPENSED' || app.pharmacyStatus === 'Pending' || !app.pharmacyStatus) {
          app.status = 'Completed';
          app.queueStatus = 'Completed';
        }
        await app.save();
      }
    }

    await logAudit(req.user._id, 'RECORD_PAYMENT', 'BILLING', { invoiceId: invoice._id, grandTotal: invoice.grandTotal, paymentMode }, req);

    res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

const autoReconcilePaidAppointments = async (hospitalId) => {
  try {
    const filter = {
      $or: [
        { billingStatus: 'Paid' },
        { paymentStatus: 'Paid' },
        { 'workflow.paymentState': 'PAID' }
      ]
    };
    if (hospitalId) filter.hospitalId = hospitalId;

    const paidAppointments = await Appointment.find(filter);

    for (const app of paidAppointments) {
      let inv = await Invoice.findOne({ appointmentId: app._id });
      const pMode = app.paymentMethod && app.paymentMethod !== 'N/A' ? app.paymentMethod : 'Cash';
      if (inv) {
        if (inv.paymentStatus !== 'Paid' || inv.paymentMode === 'N/A' || !inv.paymentMode) {
          inv.paymentStatus = 'Paid';
          inv.paymentMode = pMode;
          await inv.save();
        }
      } else {
        const count = await Invoice.countDocuments();
        const invoiceNo = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(count + 1).padStart(4, '0')}-${Math.floor(100 + Math.random() * 900)}`;
        const fee = parseFloat(app.consultationFee) || 500;
        await Invoice.create({
          invoiceNo,
          patientId: app.patientId,
          appointmentId: app._id,
          items: [{
            name: 'OPD Consultation',
            quantity: 1,
            unitPrice: fee,
            amount: fee
          }],
          totalAmount: fee,
          discount: 0,
          tax: 0,
          grandTotal: fee,
          paymentStatus: 'Paid',
          paymentMode: pMode,
          hospitalId: app.hospitalId,
          branchId: app.branchId,
          createdAt: app.createdAt || app.date || new Date(),
          updatedAt: new Date()
        });
      }
    }
  } catch (err) {
    console.error('autoReconcilePaidAppointments error:', err);
  }
};

const getInvoices = async (req, res, next) => {
  try {
    // Auto-reconcile paid appointments into Invoice ledger
    await autoReconcilePaidAppointments(req.user?.hospitalId);

    const { 
      page = 1, 
      limit = 25, 
      search = '', 
      status = '', 
      paymentMode = '', 
      startDate = '', 
      endDate = '' 
    } = req.query;

    const query = {};

    // Multi-tenant hospital isolation
    if (req.user?.hospitalId) {
      query.hospitalId = req.user.hospitalId;
    }

    if (status) {
      query.paymentStatus = status;
    }

    if (paymentMode) {
      query.paymentMode = paymentMode;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search) {
      query.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    const skip = (pageNum - 1) * limitNum;

    const totalRecords = await Invoice.countDocuments(query);
    const invoices = await Invoice.find(query)
      .populate('patientId', 'name uhid mobileNumber')
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Financial Aggregate Totals (Authoritative database aggregation)
    const aggregateTotals = await Invoice.aggregate([
      { $match: query },
      { 
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' },
          paidRevenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$grandTotal', 0]
            }
          },
          pendingRevenue: {
            $sum: {
              $cond: [{ $ne: ['$paymentStatus', 'Paid'] }, '$grandTotal', 0]
            }
          }
        }
      }
    ]);

    const summary = aggregateTotals[0] || { totalRevenue: 0, paidRevenue: 0, pendingRevenue: 0 };

    res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        totalRecords,
        currentPage: pageNum,
        totalPages: Math.ceil(totalRecords / limitNum),
        pageSize: limitNum
      },
      summary: {
        totalRevenue: summary.totalRevenue,
        paidRevenue: summary.paidRevenue,
        pendingRevenue: summary.pendingRevenue,
        balance: summary.pendingRevenue
      }
    });
  } catch (error) {
    next(error);
  }
};

const getBillingReports = async (req, res, next) => {
  try {
    // Auto-reconcile paid appointments into Invoice ledger
    await autoReconcilePaidAppointments(req.user?.hospitalId);

    const { startDate = '', endDate = '' } = req.query;
    const query = {};

    if (req.user?.hospitalId) {
      query.hospitalId = req.user.hospitalId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const invoices = await Invoice.find(query);
    const pharmacyBills = await PharmacyBill.find(query);

    let totalBilled = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let consultationRevenue = 0;
    let medicineRevenue = 0;

    const paymentMethodMap = { Cash: 0, Card: 0, UPI: 0, Insurance: 0, NetBanking: 0, Other: 0 };
    const collectorMap = { Reception: 0, Doctor: 0, Pharmacy: 0 };

    invoices.forEach(inv => {
      totalBilled += inv.grandTotal || 0;
      if (inv.paymentStatus === 'Paid') {
        totalCollected += inv.grandTotal || 0;
        consultationRevenue += inv.grandTotal || 0;
        const mode = inv.paymentMode || 'Cash';
        paymentMethodMap[mode] = (paymentMethodMap[mode] || 0) + (inv.grandTotal || 0);
        collectorMap.Reception += inv.grandTotal || 0;
      } else {
        totalPending += inv.grandTotal || 0;
      }
    });

    pharmacyBills.forEach(pb => {
      totalBilled += pb.grandTotal || 0;
      if (pb.paymentStatus === 'Paid') {
        totalCollected += pb.grandTotal || 0;
        medicineRevenue += pb.grandTotal || 0;
        const mode = pb.paymentMode || 'Cash';
        paymentMethodMap[mode] = (paymentMethodMap[mode] || 0) + (pb.grandTotal || 0);
        collectorMap.Pharmacy += pb.grandTotal || 0;
      } else {
        totalPending += pb.grandTotal || 0;
      }
    });

    const reconciliationStatus = totalPending === 0 ? 'RECONCILED' : 'PENDING_REVIEW';

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalBilled,
          totalCollected,
          totalPending,
          consultationRevenue,
          medicineRevenue,
          reconciliationStatus
        },
        paymentMethods: paymentMethodMap,
        collectorBreakdown: collectorMap
      }
    });
  } catch (error) {
    next(error);
  }
};

const createPharmacyBill = async (req, res, next) => {
  const {
    consultationId,
    patientId,
    doctorId,
    prescriptionId,
    medicines = [],
    subtotal,
    discount,
    gst,
    grandTotal,
    paymentMode,
    paymentStatus = 'Paid',
    dueAmount = 0,
    dueDate,
    creditRemarks
  } = req.body;

  try {
    // Prevent duplicate billing by ensuring one active billing record exists per prescription
    const existingBill = await PharmacyBill.findOne({ prescriptionId });
    if (existingBill) {
      return res.status(400).json({ success: false, message: 'An active billing record already exists for this prescription' });
    }

    const timestamp = Date.now();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const billNumber = `BILL-PH-${String(timestamp).slice(-6)}-${rand}`;
    const receiptNumber = `REC-PH-${String(timestamp).slice(-6)}`;
    const invoiceNumber = `INV-PH-${String(timestamp).slice(-6)}`;

    const pharmacyBill = await PharmacyBill.create({
      billNumber,
      consultationId,
      patientId,
      doctorId,
      prescriptionId,
      medicines,
      subtotal,
      discount,
      gst,
      grandTotal,
      paymentMode,
      paymentStatus,
      dueAmount,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      creditRemarks,
      collectedBy: req.user._id,
      collectedAt: new Date(),
      receiptNumber,
      invoiceNumber,
      printedAt: new Date(),
      hospitalId: req.user.hospitalId,
      branchId: req.user.branchId
    });

    // Update the statuses (workflowStatus = PAID)
    const rx = await Prescription.findById(prescriptionId);
    if (rx) {
      rx.status = 'Paid';
      rx.paymentStatus = 'Paid';
      rx.paidAt = new Date();

      // Sync edited quantities from billing medicines list to prescription items
      if (medicines && medicines.length > 0) {
        for (const med of medicines) {
          const matchingItem = rx.items.find(item => {
            const finalName = item.substituteMedicine || item.medicineName;
            return finalName.toLowerCase() === med.medicineName.toLowerCase();
          });
          if (matchingItem) {
            matchingItem.quantity = med.quantity;
          }
        }
      }

      await rx.save();
    }

    const consult = await Consultation.findById(consultationId);
    if (consult) {
      const app = await Appointment.findById(consult.appointmentId);
      if (app) {
        app.status = 'Admitted';
        app.queueStatus = 'Dispensing';
        app.pharmacyStatus = 'PAID';
        await app.save();
      }
    }

    await logAudit(req.user._id, 'CREATE_PHARMACY_BILL', 'PHARMACY', { billId: pharmacyBill._id, grandTotal, paymentMode, paymentStatus }, req);

    res.status(201).json({ success: true, data: pharmacyBill });
  } catch (error) {
    next(error);
  }
};

const getPharmacyBills = async (req, res, next) => {
  try {
    const bills = await PharmacyBill.find()
      .populate('patientId', 'name uhid mobileNumber')
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: bills });
  } catch (error) {
    next(error);
  }
};

const payPharmacyBill = async (req, res, next) => {
  const { id } = req.params;
  const { paymentMode } = req.body;

  try {
    const bill = await PharmacyBill.findById(id);
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Pharmacy bill not found' });
    }

    bill.paymentStatus = 'Paid';
    bill.paymentMode = paymentMode || bill.paymentMode;
    bill.dueAmount = 0;
    bill.collectedAt = new Date();
    bill.collectedBy = req.user._id;
    await bill.save();

    const rx = await Prescription.findById(bill.prescriptionId);
    if (rx) {
      rx.status = 'Dispensed';
      rx.dispensedAt = new Date();
      rx.dispensedBy = req.user._id;
      await rx.save();
    }

    const consult = await Consultation.findById(bill.consultationId);
    if (consult) {
      consult.status = 'COMPLETED';
      await consult.save();

      const app = await Appointment.findById(consult.appointmentId);
      if (app) {
        app.status = 'Completed';
        app.queueStatus = 'Completed';
        app.pharmacyStatus = 'PAID';
        await app.save();
      }
    }

    await logAudit(req.user._id, 'PAY_PHARMACY_BILL', 'PHARMACY', { billId: bill._id, grandTotal: bill.grandTotal, paymentMode }, req);

    res.status(200).json({ success: true, data: bill });
  } catch (error) {
    next(error);
  }
};

const getOPDReports = async (req, res, next) => {
  try {
    const { startDate, endDate, doctorId } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endToday = new Date();
      endToday.setHours(23, 59, 59, 999);
      query.date = { $gte: today, $lte: endToday };
    }

    if (doctorId && doctorId !== 'ALL') {
      query.doctorId = doctorId;
    }

    const appointments = await Appointment.find(query)
      .populate('patientId', 'name uhid mobileNumber age gender')
      .populate('doctorId', 'name department');

    const totalPatients = appointments.length;
    const walkInCount = appointments.filter(a => a.consultationType === 'Walk-In').length;
    const appointmentCount = appointments.filter(a => a.consultationType === 'Appointment').length;
    const completedCount = appointments.filter(a => (a.workflow?.queueState || a.queueStatus || a.status) === 'COMPLETED' || a.status === 'Completed').length;
    const cancelledCount = appointments.filter(a => (a.workflow?.queueState || a.queueStatus || a.status) === 'CANCELLED' || a.status === 'Cancelled').length;
    const skippedCount = appointments.filter(a => (a.workflow?.queueState || a.queueStatus || a.status) === 'SKIPPED' || a.status === 'Skipped').length;
    const noShowCount = appointments.filter(a => (a.workflow?.queueState || a.queueStatus || a.status) === 'NO_SHOW' || a.status === 'No Show').length;
    const pharmacyCount = appointments.filter(a => (a.workflow?.queueState || a.queueStatus || a.status) === 'SENT_TO_PHARMACY' || a.status === 'Sent to Pharmacy').length;

    // Calculate real dynamic wait times from appointment timestamps
    let totalWaitMin = 0;
    let maxWaitMin = 0;
    let waitCount = 0;

    appointments.forEach(a => {
      if (a.createdAt && a.updatedAt && (a.status === 'Completed' || a.workflow?.queueState === 'COMPLETED')) {
        const diffMs = new Date(a.updatedAt) - new Date(a.createdAt);
        if (diffMs > 0) {
          const diffMin = Math.round(diffMs / (1000 * 60));
          totalWaitMin += diffMin;
          if (diffMin > maxWaitMin) maxWaitMin = diffMin;
          waitCount++;
        }
      }
    });

    const calculatedAvgWait = waitCount > 0 ? Math.round(totalWaitMin / waitCount) : 0;

    // Doctor-wise metrics
    const doctorStats = {};
    appointments.forEach(a => {
      const dId = a.doctorId?._id || 'unassigned';
      const dName = a.doctorId?.name || 'Unassigned Doctor';
      if (!doctorStats[dId]) {
        doctorStats[dId] = { doctorName: dName, total: 0, completed: 0, waiting: 0, avgWaitMin: calculatedAvgWait, avgConsultMin: 0 };
      }
      doctorStats[dId].total++;
      if (a.status === 'Completed' || a.workflow?.queueState === 'COMPLETED') doctorStats[dId].completed++;
      else doctorStats[dId].waiting++;
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalPatients,
          walkInCount,
          appointmentCount,
          completedCount,
          cancelledCount,
          skippedCount,
          noShowCount,
          pharmacyCount,
          avgWaitingTimeMinutes: calculatedAvgWait,
          avgConsultationTimeMinutes: 0
        },
        doctorWise: Object.values(doctorStats),
        receptionActivity: {
          patientsRegistered: totalPatients,
          paymentsCollectedCount: appointments.filter(a => a.billingStatus === 'Paid' || a.paymentStatus === 'Paid' || a.workflow?.paymentState === 'PAID').length,
          skippedTokens: skippedCount,
          cancelledAppointments: cancelledCount
        },
        pharmacyActivity: {
          prescriptionsReceived: pharmacyCount,
          dispensedCount: completedCount,
          pendingCount: pharmacyCount
        },
        queuePerformance: {
          avgWaitingTimeMinutes: calculatedAvgWait,
          maxWaitingTimeMinutes: maxWaitMin,
          patientsPerHour: totalPatients > 0 ? Math.max(1, Math.round(totalPatients / 8)) : 0,
          peakHour: totalPatients > 0 ? 'Peak Operations' : 'N/A'
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// CLINICAL DIAGNOSIS MASTER OPERATIONS
// ==========================================

// Helper to calculate Levenshtein distance for fuzzy/typo matching
const getLevenshteinDistance = (a = '', b = '') => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const searchClinicalDiagnoses = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const normalizedQ = q.toLowerCase().replace(/\s+/g, ' ');

    let query = {};
    if (normalizedQ) {
      query.normalizedName = { $regex: normalizedQ, $options: 'i' };
    }

    const matches = await ClinicalDiagnosis.find(query)
      .sort({ name: 1 })
      .limit(10);

    const exactMatch = matches.some(m => m.normalizedName === normalizedQ);

    let suggestions = [];
    if (normalizedQ && !exactMatch) {
      const allActive = await ClinicalDiagnosis.find({}).select('name normalizedName icd10Code').limit(100);
      suggestions = allActive
        .map(d => ({
          ...d.toObject(),
          distance: getLevenshteinDistance(normalizedQ, d.normalizedName)
        }))
        .filter(d => d.distance > 0 && d.distance <= 4)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
    }

    res.status(200).json({
      success: true,
      data: matches,
      exactMatch,
      suggestions
    });
  } catch (error) {
    next(error);
  }
};

const createClinicalDiagnosis = async (req, res, next) => {
  try {
    const { name, icd10Code, category, template, frequent } = req.body;
    const doctorId = req.user._id;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Diagnosis name is required' });
    }

    const rawName = name.trim();
    const normalizedName = rawName.toLowerCase().replace(/\s+/g, ' ');

    let existing = await ClinicalDiagnosis.findOne({ normalizedName });
    if (existing) {
      if (template) existing.template = template;
      if (icd10Code) existing.icd10Code = icd10Code.trim();
      if (category) existing.category = category.trim();
      if (frequent && doctorId) {
        if (!existing.frequentlyUsed) existing.frequentlyUsed = [];
        if (!existing.frequentlyUsed.some(uid => uid.toString() === doctorId.toString())) {
          existing.frequentlyUsed.push(doctorId);
        }
      }
      await existing.save();
      return res.status(200).json({ success: true, data: existing, created: false });
    }

    const frequentlyUsed = (frequent && doctorId) ? [doctorId] : [];

    const newDiagnosis = await ClinicalDiagnosis.create({
      name: rawName,
      normalizedName,
      icd10Code: (icd10Code || '').trim(),
      category: (category || 'General Medicine').trim(),
      template: template || undefined,
      frequentlyUsed,
      source: 'DOCTOR_ADDED',
      createdBy: doctorId,
      updatedBy: doctorId
    });

    res.status(201).json({ success: true, data: newDiagnosis, created: true });
  } catch (error) {
    if (error.code === 11000) {
      const normalizedName = (req.body.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const existing = await ClinicalDiagnosis.findOne({ normalizedName });
      if (existing) {
        return res.status(200).json({ success: true, data: existing, created: false });
      }
    }
    next(error);
  }
};

const getFrequentDiagnoses = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const items = await ClinicalDiagnosis.find({})
      .sort({ createdAt: -1 })
      .limit(30);

    const sorted = items.sort((a, b) => {
      const isFavA = a.frequentlyUsed && a.frequentlyUsed.some(uid => uid.toString() === userId.toString());
      const isFavB = b.frequentlyUsed && b.frequentlyUsed.some(uid => uid.toString() === userId.toString());
      if (isFavA && !isFavB) return -1;
      if (!isFavA && isFavB) return 1;
      return 0;
    }).slice(0, 8);

    res.status(200).json({ success: true, data: sorted });
  } catch (error) {
    next(error);
  }
};

const toggleFavoriteDiagnosis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const diag = await ClinicalDiagnosis.findById(id);
    if (!diag) {
      return res.status(404).json({ success: false, message: 'Diagnosis not found' });
    }

    const hasFav = diag.frequentlyUsed && diag.frequentlyUsed.some(uid => uid.toString() === userId.toString());
    if (hasFav) {
      diag.frequentlyUsed = diag.frequentlyUsed.filter(uid => uid.toString() !== userId.toString());
    } else {
      if (!diag.frequentlyUsed) diag.frequentlyUsed = [];
      diag.frequentlyUsed.push(userId);
    }
    await diag.save();

    res.status(200).json({ success: true, isFavorite: !hasFav, data: diag });
  } catch (error) {
    next(error);
  }
};

const updateClinicalDiagnosis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, icd10Code, category, template, frequent } = req.body;

    const diag = await ClinicalDiagnosis.findById(id);
    if (!diag) {
      return res.status(404).json({ success: false, message: 'Diagnosis record not found' });
    }

    if (name && name.trim()) {
      diag.name = name.trim();
      diag.normalizedName = name.trim().toLowerCase().replace(/\s+/g, ' ');
    }
    if (icd10Code !== undefined) diag.icd10Code = (icd10Code || '').trim();
    if (category !== undefined) diag.category = (category || 'General Medicine').trim();
    if (template !== undefined) diag.template = template;
    if (frequent !== undefined && req.user?._id) {
      const userId = req.user._id;
      if (!diag.frequentlyUsed) diag.frequentlyUsed = [];
      const hasFav = diag.frequentlyUsed.some(uid => uid.toString() === userId.toString());
      if (frequent && !hasFav) {
        diag.frequentlyUsed.push(userId);
      } else if (!frequent && hasFav) {
        diag.frequentlyUsed = diag.frequentlyUsed.filter(uid => uid.toString() !== userId.toString());
      }
    }
    diag.updatedBy = req.user._id;

    await diag.save();
    res.status(200).json({ success: true, data: diag });
  } catch (error) {
    next(error);
  }
};

const deleteClinicalDiagnosis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const diag = await ClinicalDiagnosis.findByIdAndDelete(id);
    if (!diag) {
      return res.status(404).json({ success: false, message: 'Diagnosis record not found' });
    }
    res.status(200).json({ success: true, message: 'Diagnosis deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getAllClinicalDiagnoses = async (req, res, next) => {
  try {
    const items = await ClinicalDiagnosis.find({})
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

// MEDICINE FORM CONTROLLERS
const DEFAULT_MEDICINE_FREQUENCIES = require('../constants/defaultFrequencies');
const DEFAULT_MEDICINE_DOSAGES = require('../constants/defaultDosages');
const DEFAULT_FOOD_INSTRUCTIONS = require('../constants/defaultFoodInstructions');
const DEFAULT_MEDICINE_FORMS = require('../constants/defaultMedicineForms');

const getMedicineForms = async (req, res, next) => {
  try {
    const MedicineForm = require('../models/MedicineForm');
    let forms = await MedicineForm.find({}).sort({ name: 1 });

    if (forms.length === 0) {
      console.log('[+] Seeding default MedicineForm records for current database context...');
      const seedData = DEFAULT_MEDICINE_FORMS.map(item => ({
        ...item,
        hospitalId: req.user?.hospitalId,
        branchId: req.user?.branchId,
        createdBy: req.user?._id
      }));
      await MedicineForm.insertMany(seedData);
      forms = await MedicineForm.find({}).sort({ name: 1 });
    }

    res.status(200).json({ success: true, data: forms });
  } catch (error) {
    next(error);
  }
};

const createMedicineForm = async (req, res, next) => {
  try {
    const MedicineForm = require('../models/MedicineForm');
    const { name, code, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Form name is required' });
    }

    const form = await MedicineForm.create({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : name.substring(0, 3).toUpperCase(),
      description: description ? description.trim() : '',
      hospitalId: req.user?.hospitalId,
      branchId: req.user?.branchId,
      createdBy: req.user?._id
    });

    await logAudit(req.user._id, 'CREATE_MEDICINE_FORM', 'MEDICINE', { formId: form._id, name: form.name }, req);
    res.status(201).json({ success: true, data: form });
  } catch (error) {
    next(error);
  }
};

const deleteMedicineForm = async (req, res, next) => {
  try {
    const MedicineForm = require('../models/MedicineForm');
    const { id } = req.params;
    const form = await MedicineForm.findByIdAndDelete(id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Medicine form not found' });
    }
    await logAudit(req.user._id, 'DELETE_MEDICINE_FORM', 'MEDICINE', { formId: id }, req);
    res.status(200).json({ success: true, message: 'Medicine form removed' });
  } catch (error) {
    next(error);
  }
};

// Medicine Frequency Controllers
const getMedicineFrequencies = async (req, res, next) => {
  try {
    const MedicineFrequency = require('../models/MedicineFrequency');
    let frequencies = await MedicineFrequency.find({}).sort({ code: 1 });

    if (frequencies.length === 0) {
      console.log('[+] Seeding default MedicineFrequency records for current database context...');
      const seedData = DEFAULT_MEDICINE_FREQUENCIES.map(item => ({
        ...item,
        hospitalId: req.user?.hospitalId,
        branchId: req.user?.branchId,
        createdBy: req.user?._id
      }));
      await MedicineFrequency.insertMany(seedData);
      frequencies = await MedicineFrequency.find({}).sort({ code: 1 });
    }

    res.status(200).json({ success: true, data: frequencies });
  } catch (error) {
    next(error);
  }
};

const createMedicineFrequency = async (req, res, next) => {
  try {
    const MedicineFrequency = require('../models/MedicineFrequency');
    const { code, englishName, explanation, gridPattern } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Frequency code is required' });
    }
    if (!englishName || !englishName.trim()) {
      return res.status(400).json({ success: false, message: 'English name is required' });
    }
    if (!gridPattern || !gridPattern.trim()) {
      return res.status(400).json({ success: false, message: 'Grid pattern is required' });
    }

    const trimmedGrid = gridPattern.trim().toUpperCase();
    const existing = await MedicineFrequency.findOne({ gridPattern: trimmedGrid });
    if (existing) {
      return res.status(400).json({ success: false, message: `Grid pattern "${trimmedGrid}" already exists for frequency "${existing.code}"` });
    }

    const freq = await MedicineFrequency.create({
      code: code.trim().toUpperCase(),
      englishName: englishName.trim(),
      explanation: explanation ? explanation.trim() : englishName.trim(),
      gridPattern: trimmedGrid,
      hospitalId: req.user?.hospitalId,
      branchId: req.user?.branchId,
      createdBy: req.user?._id
    });

    await logAudit(req.user._id, 'CREATE_MEDICINE_FREQUENCY', 'MEDICINE', { freqId: freq._id, code: freq.code }, req);
    res.status(201).json({ success: true, data: freq });
  } catch (error) {
    next(error);
  }
};

const deleteMedicineFrequency = async (req, res, next) => {
  try {
    const MedicineFrequency = require('../models/MedicineFrequency');
    const { id } = req.params;
    const freq = await MedicineFrequency.findByIdAndDelete(id);
    if (!freq) {
      return res.status(404).json({ success: false, message: 'Medicine frequency not found' });
    }
    if (req.user?._id) {
      await logAudit(req.user._id, 'DELETE_MEDICINE_FREQUENCY', 'MEDICINE', { freqId: id }, req);
    }
    res.status(200).json({ success: true, message: 'Medicine frequency removed' });
  } catch (error) {
    next(error);
  }
};

// Medicine Dosage Controllers
const getMedicineDosages = async (req, res, next) => {
  try {
    const MedicineDosage = require('../models/MedicineDosage');
    let dosages = await MedicineDosage.find({}).sort({ val: 1 });

    if (dosages.length === 0) {
      console.log('[+] Seeding default MedicineDosage records for current database context...');
      const seedData = DEFAULT_MEDICINE_DOSAGES.map(item => ({
        ...item,
        hospitalId: req.user?.hospitalId,
        branchId: req.user?.branchId,
        createdBy: req.user?._id
      }));
      await MedicineDosage.insertMany(seedData);
      dosages = await MedicineDosage.find({}).sort({ val: 1 });
    }

    res.status(200).json({ success: true, data: dosages });
  } catch (error) {
    next(error);
  }
};

const createMedicineDosage = async (req, res, next) => {
  try {
    const MedicineDosage = require('../models/MedicineDosage');
    const { val, description } = req.body;
    if (!val || !val.trim()) {
      return res.status(400).json({ success: false, message: 'Dosage value is required' });
    }

    const dosage = await MedicineDosage.create({
      val: val.trim(),
      description: description ? description.trim() : '',
      hospitalId: req.user?.hospitalId,
      branchId: req.user?.branchId,
      createdBy: req.user?._id
    });

    await logAudit(req.user._id, 'CREATE_MEDICINE_DOSAGE', 'MEDICINE', { dosageId: dosage._id, val: dosage.val }, req);
    res.status(201).json({ success: true, data: dosage });
  } catch (error) {
    next(error);
  }
};

const deleteMedicineDosage = async (req, res, next) => {
  try {
    const MedicineDosage = require('../models/MedicineDosage');
    const { id } = req.params;
    const dosage = await MedicineDosage.findByIdAndDelete(id);
    if (!dosage) {
      return res.status(404).json({ success: false, message: 'Medicine dosage not found' });
    }
    if (req.user?._id) {
      await logAudit(req.user._id, 'DELETE_MEDICINE_DOSAGE', 'MEDICINE', { dosageId: id }, req);
    }
    res.status(200).json({ success: true, message: 'Medicine dosage removed' });
  } catch (error) {
    next(error);
  }
};

// Food Instruction Controllers
const getFoodInstructions = async (req, res, next) => {
  try {
    const FoodInstruction = require('../models/FoodInstruction');
    let foodInsts = await FoodInstruction.find({}).sort({ name: 1 });

    if (foodInsts.length === 0) {
      console.log('[+] Seeding default FoodInstruction records for current database context...');
      const seedData = DEFAULT_FOOD_INSTRUCTIONS.map(item => ({
        ...item,
        hospitalId: req.user?.hospitalId,
        branchId: req.user?.branchId,
        createdBy: req.user?._id
      }));
      await FoodInstruction.insertMany(seedData);
      foodInsts = await FoodInstruction.find({}).sort({ name: 1 });
    }

    res.status(200).json({ success: true, data: foodInsts });
  } catch (error) {
    next(error);
  }
};

const createFoodInstruction = async (req, res, next) => {
  try {
    const FoodInstruction = require('../models/FoodInstruction');
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Food instruction name is required' });
    }

    const foodInst = await FoodInstruction.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      hospitalId: req.user?.hospitalId,
      branchId: req.user?.branchId,
      createdBy: req.user?._id
    });

    await logAudit(req.user._id, 'CREATE_FOOD_INSTRUCTION', 'MEDICINE', { foodId: foodInst._id, name: foodInst.name }, req);
    res.status(201).json({ success: true, data: foodInst });
  } catch (error) {
    next(error);
  }
};

const deleteFoodInstruction = async (req, res, next) => {
  try {
    const FoodInstruction = require('../models/FoodInstruction');
    const { id } = req.params;
    const foodInst = await FoodInstruction.findByIdAndDelete(id);
    if (!foodInst) {
      return res.status(404).json({ success: false, message: 'Food instruction not found' });
    }
    if (req.user?._id) {
      await logAudit(req.user._id, 'DELETE_FOOD_INSTRUCTION', 'MEDICINE', { foodId: id }, req);
    }
    res.status(200).json({ success: true, message: 'Food instruction removed' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Set doctor online/offline presence (In-Memory, No DB)
 * @route   POST /api/operations/doctors/presence
 * @access  Private
 */
const updateDoctorPresence = async (req, res, next) => {
  try {
    const doctorPresenceService = require('../services/doctorPresenceService');
    const WorkflowEventHub = require('../services/WorkflowEventHub');
    
    const { isOnline, doctorId: customDoctorId } = req.body;
    const doctorId = customDoctorId || req.user?._id;

    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor ID is required' });
    }

    const presenceData = doctorPresenceService.setPresence(doctorId, isOnline);

    // Broadcast SSE update to all connected receptionists/display boards
    WorkflowEventHub.publish('DOCTOR_PRESENCE_UPDATED', {
      doctorId,
      isOnline: Boolean(isOnline),
      performedBy: req.user?.name || 'Doctor'
    });

    res.status(200).json({
      success: true,
      message: `Doctor presence set to ${isOnline ? 'ONLINE' : 'OFFLINE'}`,
      data: presenceData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get in-memory doctor presence dictionary
 * @route   GET /api/operations/doctors/presence
 * @access  Private
 */
const getDoctorPresence = async (req, res, next) => {
  try {
    const doctorPresenceService = require('../services/doctorPresenceService');
    const presenceMap = doctorPresenceService.getAllPresence();
    res.status(200).json({
      success: true,
      data: presenceMap
    });
  } catch (error) {
    next(error);
  }
};

const checkInAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    let appointment = await Appointment.findById(id)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup allergies')
      .populate('doctorId', 'name employeeCode departmentId');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment record not found.' });
    }

    if (appointment.status === 'Cancelled' || appointment.workflow?.queueState === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cancelled appointments cannot be checked in.' });
    }

    const currentQState = (appointment.workflow?.queueState || '').toUpperCase();
    const isAlreadyCheckedIn = Boolean(appointment.tokenNumber) && 
      (currentQState === 'WAITING' || currentQState === 'CHECKED_IN' || currentQState === 'CALLED' || currentQState === 'IN_CONSULTATION' || appointment.status === 'Waiting' || appointment.status === 'In Consultation');

    if (isAlreadyCheckedIn) {
      return res.status(200).json({
        success: true,
        message: `Patient is already checked in. Token: ${appointment.tokenNumber}`,
        data: appointment,
        alreadyCheckedIn: true
      });
    }

    // Generate OPD Token for Today
    const Hospital = require('../models/Hospital');
    const hospital = await Hospital.findById(req.user.hospitalId);
    const configuredOpPrefix = hospital?.queueRulesSettings?.tokenPrefix || 'OP';
    const isEmgApp = Boolean(appointment.isEmergency);
    const tokenPrefix = isEmgApp ? (hospital?.billingWorkflowSettings?.emergencyTokenPrefix || 'EMG') : configuredOpPrefix;
    const tokenType = isEmgApp ? 'EMERGENCY' : 'NORMAL';

    const dateStr = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const countFilter = {
      date: { $gte: startOfDay, $lte: endOfDay },
      tokenType: tokenType,
      tokenNumber: { $exists: true, $ne: '' }
    };
    if (req.user.branchId) {
      countFilter.branchId = req.user.branchId;
    }

    const count = await Appointment.countDocuments(countFilter);
    const index = count + 1;
    const tokenNumber = `${tokenPrefix}${String(index).padStart(3, '0')}`;

    appointment.tokenNumber = tokenNumber;
    appointment.status = 'Waiting';
    appointment.queueStatus = 'Waiting';
    if (!appointment.workflow) {
      appointment.workflow = {};
    }
    appointment.workflow.queueState = 'WAITING';
    appointment.workflow.timestamps = {
      ...(appointment.workflow.timestamps || {}),
      checkedInAt: new Date()
    };
    appointment.markModified('workflow');
    appointment.updatedBy = req.user._id;

    if (!appointment.workflowHistory) appointment.workflowHistory = [];
    appointment.workflowHistory.push({
      fromState: 'SCHEDULED',
      toState: 'WAITING',
      stateType: 'queueState',
      changedBy: req.user._id,
      changedByName: req.user.name || 'Receptionist',
      changedByRole: req.user.role || 'RECEPTIONIST',
      timestamp: new Date(),
      note: `Patient checked in. Assigned Token: ${tokenNumber}`
    });

    await appointment.save();

    // Emit Real-Time Event
    try {
      const WorkflowEventHub = require('../services/WorkflowEventHub');
      WorkflowEventHub.publish('PatientCheckedIn', {
        ...appointment.toObject(),
        performedBy: req.user.name || 'Receptionist'
      });
    } catch (e) {}

    await logAudit(req.user._id, 'CHECK_IN_APPOINTMENT', 'OPD', { appointmentId: appointment._id, tokenNumber }, req);

    return res.status(200).json({
      success: true,
      message: `Patient successfully checked in! OPD Token: ${tokenNumber}`,
      data: appointment
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerPatient,
  getPatients,
  searchPatients,
  updatePatient,
  bookAppointment,
  checkInAppointment,
  getAppointments,
  enterVitals,
  updateQueueStatus,
  createConsultation,
  getPatientHistory,
  createMedicine,
  getMedicines,
  addMedicineBatch,
  getMedicineBatches,
  getPrescriptionQueue,
  getPrescriptionById,
  dispensePrescription,
  createInvoice,
  recordPayment,
  getInvoices,
  getBillingReports,
  createPharmacyBill,
  getPharmacyBills,
  payPharmacyBill,
  getOPDReports,
  getConsultationSnapshot,
  searchClinicalDiagnoses,
  createClinicalDiagnosis,
  getFrequentDiagnoses,
  toggleFavoriteDiagnosis,
  updateClinicalDiagnosis,
  deleteClinicalDiagnosis,
  getAllClinicalDiagnoses,
  getMedicineForms,
  createMedicineForm,
  deleteMedicineForm,
  getMedicineFrequencies,
  createMedicineFrequency,
  deleteMedicineFrequency,
  getMedicineDosages,
  createMedicineDosage,
  deleteMedicineDosage,
  getFoodInstructions,
  createFoodInstruction,
  deleteFoodInstruction,
  updateDoctorPresence,
  getDoctorPresence
};
