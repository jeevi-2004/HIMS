
const parseDateRobust = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const isoMatch = trimmed.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

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
const Service = require('../models/Service');
const ClinicalDiagnosis = require('../models/ClinicalDiagnosis');
const Department = require('../models/Department');
const Role = require('../models/Role');
require('../models/IPDBed');
require('../models/IPDWard');
const IPDAdmission = require('../models/IPDAdmission');
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

/**
 * Generates an original, strictly unique sequential daily token (e.g. OP001, OP002, EMG001)
 * for any given date and facility. Guarantees no collisions between male, female, or follow-up patients.
 */
const generateUniqueDailyToken = async ({
  targetDate = new Date(),
  branchId = null,
  hospitalId = null,
  isEmergency = false,
  excludeApptId = null,
  customPrefix = null
}) => {
  const d = new Date(targetDate || new Date());
  const sOfDay = new Date(d); sOfDay.setHours(0, 0, 0, 0);
  const eOfDay = new Date(d); eOfDay.setHours(23, 59, 59, 999);

  let prefix = customPrefix;
  if (!prefix) {
    prefix = isEmergency ? 'EMG' : 'OP';
  }

  const query = {
    $or: [
      { date: { $gte: sOfDay, $lte: eOfDay } },
      { consultationDate: { $gte: sOfDay, $lte: eOfDay } }
    ],
    tokenNumber: { $exists: true, $nin: ['', null, 'N/A', 'undefined'] }
  };

  if (excludeApptId) {
    query._id = { $ne: excludeApptId };
  }
  if (branchId) {
    query.branchId = branchId;
  } else if (hospitalId) {
    query.hospitalId = hospitalId;
  }

  const existing = await Appointment.find(query).select('tokenNumber').lean();
  const usedTokens = new Set();
  let maxIndex = 0;

  for (const item of existing) {
    if (!item.tokenNumber) continue;
    const str = String(item.tokenNumber).trim().toUpperCase();
    usedTokens.add(str);

    if (str.startsWith(prefix.toUpperCase())) {
      const match = str.match(/\d+/);
      if (match) {
        const val = parseInt(match[0], 10);
        if (!isNaN(val) && val > maxIndex) {
          maxIndex = val;
        }
      }
    }
  }

  let nextNum = 1;
  let candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
  while (usedTokens.has(candidate.toUpperCase())) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
  }

  return candidate;
};

const BACKEND_MEDICAL_ALIASES = [
  { group: 'mri', terms: ['mri', 'magnetic resonance'] },
  { group: 'ct', terms: ['ct', 'cat scan', 'computed tomography'] },
  { group: 'usg', terms: ['usg', 'ultrasound', 'sonography', 'ultrasonography'] },
  { group: 'xray', terms: ['xray', 'x-ray', 'radiograph', 'radiography'] },
  { group: 'ecg', terms: ['ecg', 'ekg', 'electrocardiogram'] },
  { group: 'cbc', terms: ['cbc', 'complete blood count', 'blood test', 'hemogram'] },
  { group: 'lft', terms: ['lft', 'liver function'] },
  { group: 'kft', terms: ['kft', 'rft', 'kidney function', 'renal function'] },
  { group: 'thyroid', terms: ['thyroid', 'tft', 'tsh'] },
  { group: 'diabetes', terms: ['diabetes', 'blood sugar', 'glucose', 'fbs', 'ppbs', 'rbs', 'hba1c'] },
  { group: 'urine', terms: ['urine', 'urinalysis'] }
];

const isLikelyRadiologyBackend = (name = '', category = '', serviceType = '') => {
  const combined = `${name} ${category} ${serviceType}`.toLowerCase();
  if (combined.includes('radiology') || combined.includes('imaging')) {
    return true;
  }
  return (
    combined.includes('scan') ||
    combined.includes('mri') ||
    combined.includes('x-ray') ||
    combined.includes('xray') ||
    combined.includes('ct ') ||
    combined.includes('ct_') ||
    combined.endsWith('ct') ||
    combined.startsWith('ct') ||
    combined.includes('ultrasound') ||
    combined.includes('usg') ||
    combined.includes('echo') ||
    combined.includes('doppler') ||
    combined.includes('mammography')
  );
};

const enrichInvestigationsBackend = async (rawInvestigations, options = {}) => {
  if (!Array.isArray(rawInvestigations) || rawInvestigations.length === 0) {
    return [];
  }
  let activeServices = [];
  try {
    activeServices = await Service.find({ status: 'active' }, null, options).lean();
  } catch (err) {
    activeServices = [];
  }

  const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  return rawInvestigations.map(item => {
    const itemName = typeof item === 'object' ? (item.name || item.investigationName || '') : String(item);
    const itemPrice = typeof item === 'object' ? Number(item.price) || 0 : 0;
    const currentType = typeof item === 'object' ? (item.serviceType || '').toLowerCase() : '';

    if (itemPrice === 0 || currentType === 'other' || !currentType) {
      const targetRaw = itemName.trim().toLowerCase();
      const targetNorm = normalize(targetRaw);

      if (targetNorm && activeServices.length > 0) {
        // 1. Exact match on name, code, or category
        let matched = activeServices.find(s => 
          (s.name || '').trim().toLowerCase() === targetRaw ||
          (s.code || '').trim().toLowerCase() === targetRaw ||
          (s.category && (s.category || '').trim().toLowerCase() === targetRaw)
        );

        // 2. Normalized match on name, code, or category
        if (!matched) {
          matched = activeServices.find(s => {
            const sNameNorm = normalize(s.name);
            const sCodeNorm = normalize(s.code);
            const sCatNorm = normalize(s.category);
            return sNameNorm === targetNorm || (sCodeNorm && sCodeNorm === targetNorm) || (sCatNorm && sCatNorm === targetNorm);
          });
        }

        // 3. Substring match
        if (!matched) {
          matched = activeServices.find(s => {
            const sNorm = normalize(s.name);
            return sNorm && (sNorm.includes(targetNorm) || targetNorm.includes(sNorm));
          });
        }

        // 4. Alias / Modality match (e.g. MRI, CT, USG, X-Ray)
        if (!matched) {
          for (const alias of BACKEND_MEDICAL_ALIASES) {
            const targetHasTerm = alias.terms.some(t => {
              const tNorm = normalize(t);
              return targetNorm.includes(tNorm) || targetRaw.includes(t);
            });
            if (targetHasTerm) {
              matched = activeServices.find(s => {
                const sNameNorm = normalize(s.name);
                const sCatNorm = normalize(s.category);
                return alias.terms.some(t => {
                  const tNorm = normalize(t);
                  return sNameNorm.includes(tNorm) || sCatNorm.includes(tNorm);
                });
              });
              if (matched) break;
            }
          }
        }

        // 5. Code match
        if (!matched) {
          matched = activeServices.find(s => (s.code || '').trim().toLowerCase() === targetRaw);
        }

        if (matched) {
          const resolvedType = matched.serviceType || (isLikelyRadiologyBackend(matched.name, matched.category) ? 'Radiology' : 'Laboratory');
          return {
            ...(typeof item === 'object' ? item : {}),
            serviceId: matched._id,
            name: matched.name,
            code: matched.code || (typeof item === 'object' ? item.code : ''),
            serviceType: resolvedType,
            category: matched.category || matched.serviceType || (resolvedType === 'Radiology' ? 'Radiology' : 'Laboratory'),
            price: Number(matched.price) || 0
          };
        }
      }
    }

    if (typeof item === 'object') return item;
    return {
      name: itemName,
      serviceType: isLikelyRadiologyBackend(itemName) ? 'Radiology' : 'Laboratory',
      category: 'General',
      price: 0
    };
  });
};

// ==========================================
// PATIENT OPERATIONS
// ==========================================

const registerPatient = async (req, res, next) => {
  const { 
    name, age, gender, bloodGroup, countryCode, mobileNumber, email, allergies, contacts, addresses,
    alternativeMobile, dob, aadhaarNumber, occupation, maritalStatus, medicalAlerts, diagnosis
  } = req.body;
  try {
    let existingPatient = req.existingPatient;
    if (!existingPatient && mobileNumber) {
      existingPatient = await Patient.findOne({ mobileNumber, hospitalId: req.user.hospitalId });
    }

    if (existingPatient) {
      if (allergies && (Array.isArray(allergies) ? allergies.length > 0 : String(allergies).trim())) {
        const cleanAllergies = Array.isArray(allergies)
          ? allergies.flatMap(a => (typeof a === 'string' ? a.split(/[,;\n/]+/) : [String(a)])).map(s => s.trim()).filter(Boolean)
          : String(allergies).split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean);
        if (cleanAllergies.length > 0) {
          existingPatient.allergies = cleanAllergies;
          await existingPatient.save();
        }
      }
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
      diagnosis,
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
      const q = String(query).trim();
      const isHexId = /^[0-9a-fA-F]{24}$/.test(q);
      filter = {
        $or: [
          ...(isHexId ? [{ _id: new mongoose.Types.ObjectId(q) }] : []),
          { name: { $regex: q, $options: 'i' } },
          { mobileNumber: { $regex: q } },
          { uhid: { $regex: q, $options: 'i' } },
          { aadhaarNumber: { $regex: q } }
        ]
      };
    }
    const patients = await Patient.find(filter).sort({ updatedAt: -1 }).limit(20);
    res.status(200).json({ success: true, data: patients });
  } catch (error) {
    next(error);
  }
};

const getPatientById = async (req, res, next) => {
  const { id } = req.params;
  try {
    if (!id) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }
    const trimmedId = String(id).trim();
    const isHexId = /^[0-9a-fA-F]{24}$/.test(trimmedId);
    let patient = null;

    if (isHexId) {
      patient = await Patient.findById(trimmedId).lean();
    }
    if (!patient) {
      patient = await Patient.findOne({ uhid: { $regex: `^${trimmedId}$`, $options: 'i' } }).lean();
    }
    if (!patient && isHexId) {
      patient = await Patient.findOne({ _id: new mongoose.Types.ObjectId(trimmedId) }).lean();
    }

    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    res.status(200).json({ success: true, data: patient });
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
    billingStatus, consultationFee, paymentMethod, chiefComplaint, allergies, isEmergency,
    appointmentSlot, bookingSource, vitals
  } = req.body;
  try {
    const isEmgApp = Boolean(isEmergency);
    const Hospital = require('../models/Hospital');
    const hospital = await Hospital.findById(req.user.hospitalId);

    // Resolve & deduplicate patient allergies from token request or existing profile
    let appAllergies = [];
    if (allergies) {
      if (Array.isArray(allergies)) {
        appAllergies = allergies.flatMap(a => {
          if (typeof a === 'string') return a.split(/[,;\n/]+/);
          if (typeof a === 'object' && a) return (a.name || a.allergy || a.allergyName || a.val || '').split(/[,;\n/]+/);
          return String(a).split(/[,;\n/]+/);
        }).map(s => s.trim()).filter(Boolean);
      } else if (typeof allergies === 'string') {
        appAllergies = allergies.split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean);
      }
    }
    if (appAllergies.length === 0 && patientId) {
      try {
        const pDoc = await Patient.findById(patientId).select('allergies').lean();
        if (pDoc && Array.isArray(pDoc.allergies) && pDoc.allergies.length > 0) {
          appAllergies = pDoc.allergies.map(s => String(s).trim()).filter(Boolean);
        }
      } catch (_) {}
    }
    // Also check chief complaint if allergies array is still empty
    if (appAllergies.length === 0 && chiefComplaint) {
      const match = String(chiefComplaint).match(/allerg(?:y|ies)?(?:\s*[:\-\(]\s*|\s+to\s+)([^,;\)\.]+)/i);
      if (match && match[1] && match[1].trim().toLowerCase() !== 'other') {
        const parsed = match[1].split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean);
        if (parsed.length > 0) appAllergies.push(...parsed);
      }
    }
    // Deduplicate case-insensitively while preserving original capitalization
    const seenAllergies = new Set();
    const uniqueAppAllergies = [];
    for (const a of appAllergies) {
      const k = a.toLowerCase();
      if (!seenAllergies.has(k) && k !== 'none' && k !== 'null' && k !== 'undefined' && k !== 'nil') {
        seenAllergies.add(k);
        uniqueAppAllergies.push(a);
      }
    }

    if (patientId && uniqueAppAllergies.length > 0) {
      try {
        await Patient.findByIdAndUpdate(patientId, { $set: { allergies: uniqueAppAllergies } });
      } catch (_) {}
    }

    // Geofence Enforcement during OPD Token Generation
    const geoSettings = hospital?.geolocationSettings || {};
    if (geoSettings.enabled && geoSettings.latitude != null && geoSettings.longitude != null) {
      const userRoleName = (req.user?.roleId?.name || req.user?.roleId || req.user?.role || '').toString().toUpperCase();
      const isSuperAdmin = userRoleName.includes('SUPER_ADMIN');
      const isDev = process.env.NODE_ENV === 'development' || req.hostname === 'localhost' || req.hostname === '127.0.0.1';

      if (!isSuperAdmin && !isDev) {
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
    const isScheduledApp = isFutureBooking || String(consultationType || '').toLowerCase() === 'appointment';

    let slotObj = appointmentSlot;
    if (typeof appointmentSlot === 'string' && appointmentSlot.trim()) {
      slotObj = {
        startTime: appointmentSlot.trim(),
        endTime: appointmentSlot.trim(),
        slotId: appointmentSlot.trim()
      };
    }

    // Check for existing double-booking on same doctor, date, and time slot
    if (doctorId && time && isScheduledApp) {
      const normTime = String(time).trim();
      let altTime = normTime;
      if (/am|pm/i.test(normTime)) {
        const parts = normTime.split(' ');
        const [h, m] = parts[0].split(':').map(Number);
        const ampm = (parts[1] || '').toUpperCase();
        let h24 = h % 12;
        if (ampm === 'PM') h24 += 12;
        altTime = `${String(h24).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
      } else if (normTime.includes(':')) {
        const [h24, m] = normTime.split(':').map(Number);
        const ampm = h24 >= 12 ? 'PM' : 'AM';
        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;
        altTime = `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${ampm}`;
      }

      const [y, m, d] = dateStr.split('-').map(Number);
      const localStart = new Date(y, m - 1, d, 0, 0, 0, 0);
      const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
      const utcStart = new Date(`${dateStr}T00:00:00.000Z`);
      const utcEnd = new Date(`${dateStr}T23:59:59.999Z`);
      const minDate = new Date(Math.min(localStart.getTime(), utcStart.getTime()));
      const maxDate = new Date(Math.max(localEnd.getTime(), utcEnd.getTime()));

      const existingBooking = await Appointment.findOne({
        doctorId,
        date: { $gte: minDate, $lte: maxDate },
        $or: [
          { time: normTime },
          { time: altTime },
          { 'appointmentSlot.startTime': normTime },
          { 'appointmentSlot.startTime': altTime },
          { 'appointmentSlot.slotId': normTime },
          { 'appointmentSlot.slotId': altTime }
        ],
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

    const tokenNumber = await generateUniqueDailyToken({
      targetDate: targetBookingDate,
      branchId: req.user.branchId,
      hospitalId: req.user.hospitalId,
      isEmergency: isEmgApp,
      customPrefix: isEmgApp ? tokenPrefix : (tokenPrefix || 'OP')
    });

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

    // If booked date has arrived (today or past), redirect to Waiting queue immediately.
    // Only strictly future bookings (startOfDay > todayStart) start in 'Scheduled' state.
    const initialStatus = isEmgApp ? 'Arrived' : (isFutureBooking ? 'Scheduled' : 'Waiting');
    const initialQueueState = isEmgApp ? 'WAITING' : (isFutureBooking ? 'SCHEDULED' : 'WAITING');

    const appointment = await Appointment.create({
      patientId,
      doctorId,
      date: targetBookingDate,
      time: time || '09:00 AM',
      tokenNumber,
      consultationType: consultationType || (isFutureBooking ? 'Appointment' : 'Walk-In'),
      chiefComplaint,
      allergies: uniqueAppAllergies,
      vitals: (vitals && typeof vitals === 'object') ? vitals : undefined,
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
      appointmentSlot: slotObj || null,
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

    if (patientId && vitals && typeof vitals === 'object' && Object.keys(vitals).length > 0) {
      try {
        await Patient.findByIdAndUpdate(patientId, { $set: { vitals } });
      } catch (_) {}
    }

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

const getAppointmentById = async (req, res, next) => {
  const { id } = req.params;
  try {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID format' });
    }
    const appointment = await Appointment.findById(id)
      .populate('patientId', 'name uhid age gender mobileNumber alternativeMobile bloodGroup allergies medicalAlerts address addresses contacts guardianName emergencyContact isProfileCompleted dob aadhaarNumber occupation maritalStatus lastVisitDate vitals')
      .populate('doctorId', 'name email doctorProfile employeeCode roomNo');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment record not found' });
    }
    res.status(200).json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

const getAppointments = async (req, res, next) => {
  const { doctorId, date, status } = req.query;
  try {
    // Auto-heal, assign order-wise tokens, and transition appointments whose booked date has arrived
    try {
      const todayEndOfDay = new Date();
      todayEndOfDay.setHours(23, 59, 59, 999);

      // 1. Auto-assign order-wise sequential tokens to any scheduled or follow-up appointments missing a token
      const missingTokenAppointments = await Appointment.find({
        $or: [
          { tokenNumber: { $exists: false } },
          { tokenNumber: '' },
          { tokenNumber: null },
          { tokenNumber: 'N/A' }
        ]
      }).sort({ date: 1, time: 1, createdAt: 1 });

      if (missingTokenAppointments.length > 0) {
        // Group by doctorId and date (YYYY-MM-DD)
        const dateDoctorGroups = {};
        for (const app of missingTokenAppointments) {
          const dStr = app.date ? new Date(app.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const groupKey = `${app.doctorId || 'doc'}_${dStr}`;
          if (!dateDoctorGroups[groupKey]) dateDoctorGroups[groupKey] = [];
          dateDoctorGroups[groupKey].push(app);
        }

        for (const groupKey of Object.keys(dateDoctorGroups)) {
          const appList = dateDoctorGroups[groupKey];
          const sample = appList[0];
          const dStr = sample.date ? new Date(sample.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const sOfDay = new Date(dStr); sOfDay.setHours(0, 0, 0, 0);
          const eOfDay = new Date(dStr); eOfDay.setHours(23, 59, 59, 999);

          const existingTokensOnDate = await Appointment.find({
            date: { $gte: sOfDay, $lte: eOfDay },
            tokenNumber: { $exists: true, $nin: ['', null, 'N/A'] },
            ...(sample.branchId ? { branchId: sample.branchId } : {})
          }).select('tokenNumber').lean();

          let maxNum = 0;
          for (const ext of existingTokensOnDate) {
            const m = String(ext.tokenNumber || '').match(/\d+/);
            if (m) {
              const val = parseInt(m[0], 10);
              if (val > maxNum) maxNum = val;
            }
          }

          let nextOrder = maxNum + 1;
          for (const appItem of appList) {
            const isEmg = Boolean(appItem.isEmergency);
            const prefix = isEmg ? 'EMG' : 'OP';
            const assignedToken = `${prefix}${String(nextOrder).padStart(3, '0')}`;
            await Appointment.updateOne(
              { _id: appItem._id },
              { $set: { tokenNumber: assignedToken } }
            );
            appItem.tokenNumber = assignedToken;
            nextOrder++;
          }
        }
      }

      // 1.1 Auto-deduplicate any colliding tokens across appointments on the same date (e.g. Male and Female sharing OP001)
      const allDatedApps = await Appointment.find({
        status: { $nin: ['Cancelled'] },
        'workflow.queueState': { $ne: 'CANCELLED' },
        tokenNumber: { $exists: true, $nin: ['', null, 'N/A', 'undefined'] }
      }).select('_id date consultationDate scheduledDate tokenNumber isEmergency tokenType priorityLevel createdAt time doctorId patientId branchId').sort({ createdAt: 1 }).lean();

      if (allDatedApps.length > 0) {
        const appsByDate = new Map();
        for (const app of allDatedApps) {
          const rawD = app.consultationDate || app.date || app.createdAt;
          const dObj = new Date(rawD);
          const dKey = !isNaN(dObj.getTime()) ? dObj.toISOString().split('T')[0] : 'undated';
          if (!appsByDate.has(dKey)) appsByDate.set(dKey, []);
          appsByDate.get(dKey).push(app);
        }

        for (const [dKey, dayApps] of appsByDate.entries()) {
          if (dKey === 'undated' || dayApps.length <= 1) continue;

          const seenTokens = new Set();
          const duplicates = [];
          for (const app of dayApps) {
            const tok = String(app.tokenNumber || '').trim().toUpperCase();
            if (seenTokens.has(tok)) {
              duplicates.push(app);
            } else {
              seenTokens.add(tok);
            }
          }

          if (duplicates.length > 0) {
            for (const dupApp of duplicates) {
              const isEmg = Boolean(dupApp.isEmergency) || (dupApp.tokenType === 'EMERGENCY') || (dupApp.priorityLevel === 'EMERGENCY') || String(dupApp.tokenNumber || '').startsWith('EMG');
              const prefix = isEmg ? 'EMG' : 'OP';
              let candidateNum = 1;
              let candidateToken = `${prefix}${String(candidateNum).padStart(3, '0')}`;
              while (seenTokens.has(candidateToken.toUpperCase())) {
                candidateNum++;
                candidateToken = `${prefix}${String(candidateNum).padStart(3, '0')}`;
              }
              seenTokens.add(candidateToken.toUpperCase());

              await Appointment.updateOne(
                { _id: dupApp._id },
                { $set: { tokenNumber: candidateToken } }
              );
              await Consultation.updateOne(
                { appointmentId: dupApp._id },
                { $set: { tokenNumber: candidateToken } }
              ).catch(() => {});
            }
          }
        }
      }

      const todayStartOfDay = new Date();
      todayStartOfDay.setHours(0, 0, 0, 0);

      // 2. Automatically transition scheduled / follow-up appointments whose booked date has arrived (today) to Active Queue (Waiting)
      // They redirect to Today's Queue on their scheduled date!
      await Appointment.updateMany(
        {
          date: { $gte: todayStartOfDay, $lte: todayEndOfDay },
          status: { $in: ['Scheduled', 'SCHEDULED'] }
        },
        {
          $set: {
            status: 'Waiting',
            queueStatus: 'Waiting',
            'workflow.queueState': 'WAITING',
            'workflow.timestamps.checkedInAt': new Date()
          }
        }
      );

      // 3. Ensure all strictly future appointments (date > today) remain in 'Scheduled' state, UNLESS already Completed or Cancelled
      await Appointment.updateMany(
        {
          date: { $gt: todayEndOfDay },
          status: { $nin: ['Cancelled', 'Scheduled', 'Completed'] }
        },
        {
          $set: {
            status: 'Scheduled',
            queueStatus: 'Scheduled',
            'workflow.queueState': 'SCHEDULED'
          }
        }
      );

      // 4. Heal past/today appointments where consultation is finished or pharmacy dispensed, but status was left Waiting
      await Appointment.updateMany(
        {
          $or: [
            { 'workflow.consultationState': 'COMPLETED' },
            { 'workflow.queueState': 'COMPLETED' },
            { 'workflow.pharmacyState': 'DISPENSED' },
            { pharmacyStatus: 'DISPENSED' },
            { 'workflow.timestamps.completedAt': { $exists: true, $ne: null } }
          ],
          status: { $in: ['Waiting', 'Admitted', 'In Consultation'] },
          date: { $lte: todayEndOfDay }
        },
        {
          $set: {
            status: 'Completed',
            queueStatus: 'Completed',
            'workflow.queueState': 'COMPLETED'
          }
        }
      );

      // 5. Auto-sync upcoming consultations with follow-up dates into Appointment collection
      // Ensures Doctor follow-ups and Receptionist scheduled queue are always 100% in sync without missing patients or duplicates
      try {
        const upcomingFollowups = await Consultation.find({
          followupRequired: true,
          followupDate: { $gte: new Date(todayEndOfDay.getFullYear(), todayEndOfDay.getMonth(), todayEndOfDay.getDate(), 0, 0, 0, 0) },
          followupStatus: { $ne: 'Completed' },
          followupCompleted: { $ne: true }
        }).select('_id patientId doctorId followupDate followupTime hospitalId branchId followUpAppointmentId createdAt').lean();

        for (const consult of upcomingFollowups) {
          if (!consult.patientId || !consult.followupDate) continue;
          const fDate = new Date(consult.followupDate);
          const sOfDay = new Date(fDate.getFullYear(), fDate.getMonth(), fDate.getDate(), 0, 0, 0, 0);
          const eOfDay = new Date(fDate.getFullYear(), fDate.getMonth(), fDate.getDate(), 23, 59, 59, 999);

          // Check if patient was already consulted ON OR AFTER this follow-up date
          const hasSubsequentConsult = await Consultation.findOne({
            patientId: consult.patientId,
            _id: { $ne: consult._id },
            createdAt: { $gte: sOfDay }
          }).select('_id').lean();

          if (hasSubsequentConsult) {
            // Patient was already consulted on or after follow-up date! Mark scheduled appointment Completed
            await Appointment.updateMany(
              {
                patientId: consult.patientId,
                status: { $in: ['Scheduled', 'SCHEDULED'] },
                date: { $gte: sOfDay, $lte: eOfDay }
              },
              {
                $set: {
                  status: 'Completed',
                  queueStatus: 'Completed',
                  'workflow.queueState': 'COMPLETED'
                }
              }
            );
            await Consultation.updateOne(
              { _id: consult._id },
              { $set: { followupStatus: 'Completed', followupCompleted: true } }
            );
            continue; // Do not re-create a scheduled appointment for an already-consulted patient!
          }

          const existingAppt = await Appointment.findOne({
            patientId: consult.patientId,
            date: { $gte: sOfDay, $lte: eOfDay }
          }).select('_id').lean();

          if (!existingAppt) {
            const tokenNumber = await generateUniqueDailyToken({
              targetDate: consult.followupDate,
              hospitalId: consult.hospitalId,
              branchId: consult.branchId,
              isEmergency: false
            });

            let fTime = consult.followupTime || '10:00 AM';
            if (/^\d{1,2}:\d{2}$/.test(fTime)) {
              const [h, m] = fTime.split(':').map(Number);
              const period = h >= 12 ? 'PM' : 'AM';
              const displayH = h % 12 || 12;
              fTime = `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
            }

            const createdAppt = await Appointment.create({
              patientId: consult.patientId,
              doctorId: consult.doctorId,
              date: consult.followupDate,
              time: fTime,
              slotTime: fTime,
              tokenNumber,
              consultationType: 'Follow-Up',
              status: 'Scheduled',
              queueStatus: 'Scheduled',
              workflow: {
                queueState: 'SCHEDULED'
              },
              bookingSource: 'DOCTOR',
              billingStatus: 'Unpaid',
              hospitalId: consult.hospitalId || undefined,
              branchId: consult.branchId || undefined,
              createdBy: consult.doctorId || undefined,
              updatedBy: consult.doctorId || undefined
            });

            await Consultation.updateOne(
              { _id: consult._id },
              { $set: { followUpAppointmentId: createdAppt._id } }
            );
          }
        }
      } catch (syncErr) {
        console.warn('Consultation followup auto-sync error:', syncErr);
      }
    } catch (healErr) {
      console.warn('Appointment queue healing error:', healErr);
    }

    let query = {};
    
    const userRole = (req.user?.roleId?.name || req.user?.role || '').toUpperCase();
    const isPureDoctor = userRole === 'DOCTOR';
    const isDoctorAdmin = userRole === 'DOCTOR_ADMIN';
    const isDoctorWorkspace = req.query.scope === 'my_desk' || 
                              req.headers['x-workspace-mode'] === 'clinical_consultation' || 
                              req.headers['referer']?.includes('/doctor/') ||
                              Boolean(doctorId);
    const isReception = ['RECEPTIONIST', 'RECEPTION'].includes(userRole) || 
                        req.headers['referer']?.includes('/reception/');

    // Scoped queries:
    // 1. Pure DOCTOR accounts are strictly locked to their own desk and assigned patients
    // 2. DOCTOR_ADMIN in clinical consultation/doctor desk workspace strictly fetches their own desk
    // 3. Explicit doctor requested (e.g. reception filtering by a doctor) sets query.doctorId
    // 4. Receptionist/Admin without doctorId can view all/both doctors assigned
    const mongoose = require('mongoose');
    if (doctorId && doctorId !== 'all') {
      const docObjId = mongoose.Types.ObjectId.isValid(doctorId) ? new mongoose.Types.ObjectId(doctorId) : doctorId;
      query.doctorId = docObjId;
    } else if (!isReception && (isPureDoctor || (isDoctorAdmin && isDoctorWorkspace))) {
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
          { status: { $in: ['Completed', 'Sent to Pharmacy', 'Sent To Pharmacy'] } },
          { queueStatus: { $in: ['Completed', 'Sent to Pharmacy', 'Sent To Pharmacy', 'Dispensing', 'Dispensed'] } },
          { 'workflow.queueState': { $in: ['COMPLETED', 'SENT_TO_PHARMACY'] } }
        ];
      } else {
        query.status = status;
      }
    }

    const rawAppointments = await Appointment.find(query)
      .populate('patientId', 'name uhid age gender mobileNumber alternativeMobile bloodGroup allergies medicalAlerts address addresses contacts guardianName emergencyContact isProfileCompleted dob aadhaarNumber occupation maritalStatus lastVisitDate')
      .populate('doctorId', 'name employeeCode')
      .sort({ createdAt: 1 });

    const apptIds = rawAppointments.map(a => a._id);
    const patientIds = rawAppointments.map(a => a.patientId?._id || a.patientId).filter(Boolean);
    let consultMap = new Map();
    let patientConsultMap = new Map();
    let rxMap = new Map();
    if (apptIds.length > 0 || patientIds.length > 0) {
      try {
        const [consultations, prescriptions] = await Promise.all([
          Consultation.find(
            { 
              $or: [
                { appointmentId: { $in: apptIds } },
                { patientId: { $in: patientIds } }
              ] 
            }, 
            '_id appointmentId patientId status chiefComplaint diagnosis primaryDiagnosis diagnoses clinicalImpression symptoms vitals createdAt'
          ).sort({ createdAt: -1 }).lean(),
          Prescription.find({ appointmentId: { $in: apptIds } }, '_id appointmentId status dispensedAt').lean()
        ]);
        (consultations || []).forEach(c => {
          if (c.appointmentId && !consultMap.has(String(c.appointmentId))) {
            consultMap.set(String(c.appointmentId), c);
          }
          if (c.patientId && !patientConsultMap.has(String(c.patientId))) {
            patientConsultMap.set(String(c.patientId), c);
          }
        });
        (prescriptions || []).forEach(p => rxMap.set(String(p.appointmentId), p));
      } catch (lookupErr) {
        console.warn('Consultation/Prescription lookup error in getAppointments:', lookupErr.message);
      }
    }

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

      const hasConsultation = consultMap.has(String(appObj._id));
      const rx = rxMap.get(String(appObj._id));
      const isRxDispensed = rx && (rx.status === 'Dispensed' || rx.status === 'Completed' || Boolean(rx.dispensedAt));
      const isRxPending = rx && (rx.status === 'Pending' || rx.status === 'Sent to Pharmacy' || rx.status === 'Dispensing');

      // Check if this appointment is upcoming in future
      const todayEndOfDay = new Date();
      todayEndOfDay.setHours(23, 59, 59, 999);
      const appDate = parseDateRobust(appObj.date);
      const isFutureAppt = Boolean(appDate && appDate > todayEndOfDay);

      // Only strictly FUTURE appointments stay in 'Scheduled' state
      if (isFutureAppt && appObj.status !== 'Completed' && appObj.status !== 'Cancelled' && appObj.status !== 'Admitted') {
        appObj.status = 'Scheduled';
        appObj.queueStatus = 'Scheduled';
        if (!appObj.workflow) appObj.workflow = {};
        appObj.workflow.queueState = 'SCHEDULED';
        appObj.workflow.consultationState = 'NOT_STARTED';
        if (app.status === 'In Consultation' || app.status === 'In-Consultation' || app.queueStatus === 'In-Consultation' || app.workflow?.queueState === 'IN_CONSULTATION') {
          Appointment.updateOne(
            { _id: app._id },
            { $set: { status: 'Scheduled', queueStatus: 'Scheduled', 'workflow.queueState': 'SCHEDULED', 'workflow.consultationState': 'NOT_STARTED' } }
          ).exec().catch(() => {});
        }
      } else if (!isFutureAppt && (appObj.status === 'Scheduled' || appObj.queueStatus === 'Scheduled' || appObj.workflow?.queueState === 'SCHEDULED')) {
        // Booked date has arrived (today or past)! Patient MUST redirect to Active Queue (Waiting)
        appObj.status = 'Waiting';
        appObj.queueStatus = 'Waiting';
        if (!appObj.workflow) appObj.workflow = {};
        appObj.workflow.queueState = 'WAITING';
      } else {
        // Priority 1: If doctor consulted and prescription is pending dispensing at pharmacy
        if (hasConsultation && isRxPending && appObj.status !== 'Cancelled') {
          appObj.status = 'Sent to Pharmacy';
          appObj.queueStatus = 'Sent to Pharmacy';
          if (!appObj.workflow) appObj.workflow = {};
          appObj.workflow.queueState = 'SENT_TO_PHARMACY';
          appObj.workflow.consultationState = 'COMPLETED';
          appObj.pharmacyStatus = 'SENT';

          // Asynchronously sync MongoDB document to Sent to Pharmacy
          if (app.status !== 'Sent to Pharmacy' || app.queueStatus !== 'Sent to Pharmacy' || app.pharmacyStatus !== 'SENT') {
            Appointment.updateOne(
              { _id: app._id },
              { 
                $set: { 
                  status: 'Sent to Pharmacy', 
                  queueStatus: 'Sent to Pharmacy', 
                  pharmacyStatus: 'SENT',
                  'workflow.queueState': 'SENT_TO_PHARMACY',
                  'workflow.consultationState': 'COMPLETED'
                } 
              }
            ).exec().catch(() => {});
          }
        } else {
          // Priority 2: Fully completed consultations or dispensed prescriptions
          const isConsCompleted = appObj.workflow?.consultationState === 'COMPLETED' || 
                                  appObj.workflow?.queueState === 'COMPLETED' || 
                                  appObj.workflow?.pharmacyState === 'DISPENSED' || 
                                  appObj.pharmacyStatus === 'DISPENSED' || 
                                  Boolean(appObj.workflow?.timestamps?.completedAt) ||
                                  Boolean(appObj.workflow?.timestamps?.pharmacyCompletedAt) ||
                                  isRxDispensed ||
                                  (hasConsultation && !isRxPending);

          if (isConsCompleted && appObj.status !== 'Cancelled') {
            appObj.status = 'Completed';
            appObj.queueStatus = 'Completed';
            if (!appObj.workflow) appObj.workflow = {};
            appObj.workflow.queueState = 'COMPLETED';
            appObj.workflow.consultationState = 'COMPLETED';
            if (isRxDispensed) {
              appObj.pharmacyStatus = 'DISPENSED';
              appObj.workflow.pharmacyState = 'DISPENSED';
            }

            // Asynchronously self-heal MongoDB document if it wasn't marked Completed
            if (app.status !== 'Completed' || app.queueStatus !== 'Completed') {
              Appointment.updateOne(
                { _id: app._id },
                { 
                  $set: { 
                    status: 'Completed', 
                    queueStatus: 'Completed', 
                    'workflow.queueState': 'COMPLETED',
                    'workflow.consultationState': 'COMPLETED'
                  } 
                }
              ).exec().catch(() => {});
            }
          }
        }
      }

      const consult = consultMap.get(String(appObj._id)) || patientConsultMap.get(String(appObj.patientId?._id || appObj.patientId));
      if (consult) {
        appObj.consultation = consult;
        const consultComplaint = consult.chiefComplaint || 
          (Array.isArray(consult.diagnoses) && consult.diagnoses.filter(Boolean).length > 0 ? consult.diagnoses.filter(Boolean).join(', ') : '') ||
          consult.diagnosis || 
          consult.primaryDiagnosis || 
          consult.symptoms || 
          '';

        const consultDiag = consult.diagnosis || 
          consult.primaryDiagnosis || 
          (Array.isArray(consult.diagnoses) && consult.diagnoses.filter(Boolean).length > 0 ? consult.diagnoses.filter(Boolean).join(', ') : '') ||
          consult.chiefComplaint || 
          '';

        if (!appObj.chiefComplaint || String(appObj.chiefComplaint).trim() === '') {
          appObj.chiefComplaint = consultComplaint || consultDiag;
        }
        if (!appObj.diagnosis || String(appObj.diagnosis).trim() === '') {
          appObj.diagnosis = consultDiag || consultComplaint;
        }
        if (Array.isArray(consult.diagnoses) && consult.diagnoses.length > 0) {
          appObj.diagnoses = consult.diagnoses;
        }
        if ((!appObj.vitals || !appObj.vitals.bpSystolic) && consult.vitals && consult.vitals.bpSystolic) {
          appObj.vitals = consult.vitals;
        }
      }

      // Attach accurate consultation date ONLY for completed visits
      const isCompletedVisit = 
        appObj.status === 'Completed' ||
        appObj.status === 'Sent to Pharmacy' ||
        appObj.queueStatus === 'Completed' ||
        appObj.queueStatus === 'Sent to Pharmacy' ||
        appObj.workflow?.queueState === 'COMPLETED' ||
        appObj.workflow?.queueState === 'SENT_TO_PHARMACY' ||
        appObj.workflow?.consultationState === 'COMPLETED';

      if (isCompletedVisit) {
        const effectiveConsultDate = 
          appObj.consultationDate ||
          appObj.workflow?.timestamps?.consultationCompletedAt ||
          consult?.consultationDate ||
          consult?.createdAt ||
          appObj.workflow?.timestamps?.completedAt ||
          appObj.sentToPharmacyAt ||
          appObj.completedAt;

        if (effectiveConsultDate) {
          appObj.consultationDate = effectiveConsultDate;
          const appDateVal = appObj.date ? new Date(appObj.date) : null;
          if (appDateVal && !isNaN(appDateVal.getTime()) && appDateVal.getTime() > Date.now() + 86400000) {
            appObj.scheduledDate = appObj.date;
            appObj.date = effectiveConsultDate;
          }
        }
      }

      return appObj;
    });

    // Guarantee 100% unique, non-colliding tokens per calendar date across all returned appointments (validating both Male & Female counts)
    const tokensByDate = new Map();
    for (const appObj of appointments) {
      const isCompleted = appObj.status === 'Completed' || appObj.status === 'Sent to Pharmacy';
      const targetD = (isCompleted && appObj.consultationDate) ? appObj.consultationDate : (appObj.date || appObj.createdAt);
      const dObj = new Date(targetD);
      const dKey = !isNaN(dObj.getTime()) ? dObj.toISOString().split('T')[0] : 'undated';
      if (!tokensByDate.has(dKey)) {
        tokensByDate.set(dKey, { used: new Set(), items: [] });
      }
      tokensByDate.get(dKey).items.push(appObj);
    }

    for (const [dKey, dayData] of tokensByDate.entries()) {
      if (dKey === 'undated') continue;
      for (const appObj of dayData.items) {
        let tok = String(appObj.tokenNumber || '').trim().toUpperCase();
        const isEmg = Boolean(appObj.isEmergency) || (appObj.tokenType === 'EMERGENCY') || (appObj.priorityLevel === 'EMERGENCY') || tok.startsWith('EMG');
        const prefix = isEmg ? 'EMG' : 'OP';

        if (!tok || tok === 'N/A' || dayData.used.has(tok)) {
          // Token is missing or duplicate on this date! Generate next original unique sequential token
          let nextNum = 1;
          let candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
          while (dayData.used.has(candidate)) {
            nextNum++;
            candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
          }
          tok = candidate;
          appObj.tokenNumber = tok;

          // Asynchronously persist this original unique token to MongoDB
          Appointment.updateOne({ _id: appObj._id }, { $set: { tokenNumber: tok } }).exec().catch(() => {});
          Consultation.updateOne({ appointmentId: appObj._id }, { $set: { tokenNumber: tok } }).exec().catch(() => {});
        }
        dayData.used.add(tok);
      }
    }

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
};

const enterVitals = async (req, res, next) => {
  const { id } = req.params;
  const { vitals, allergies } = req.body;
  try {
    const mongoose = require('mongoose');
    let appointment = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      appointment = await Appointment.findById(id);
    }

    if (!appointment) {
      // Check if this ID is an IPD Admission (either MongoDB ObjectId or admissionId string e.g. IPD-2026-0004)
      const IPDAdmission = require('../models/IPDAdmission');
      let admission = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        admission = await IPDAdmission.findById(id);
      }
      if (!admission) {
        admission = await IPDAdmission.findOne({ admissionId: id });
      }

      if (admission) {
        if (vitals !== undefined) {
          admission.vitals = vitals;
          if (Array.isArray(admission.dailyReviews) && admission.dailyReviews.length > 0) {
            const lastRev = admission.dailyReviews[admission.dailyReviews.length - 1];
            if (lastRev) {
              lastRev.vitals = {
                bp: (vitals.bpSystolic && vitals.bpDiastolic) ? `${vitals.bpSystolic}/${vitals.bpDiastolic}` : (vitals.bp || ''),
                pulse: vitals.pulse || '',
                temperature: vitals.temperature || '',
                spo2: vitals.spo2 || ''
              };
            }
          }
        }
        if (allergies !== undefined) {
          const cleanAllergies = Array.isArray(allergies)
            ? allergies.map(s => String(s).trim()).filter(Boolean)
            : String(allergies).split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean);
          if (admission.patientId) {
            await Patient.findByIdAndUpdate(admission.patientId, { $set: { allergies: cleanAllergies } });
          }
        }
        admission.updatedBy = req.user._id;
        await admission.save();

        await logAudit(req.user._id, 'RECORD_VITALS', 'IPD', { admissionId: admission._id, vitals }, req);

        return res.status(200).json({ success: true, data: admission });
      }

      return res.status(404).json({ success: false, message: 'Appointment slot or IPD admission not found' });
    }

    if (vitals !== undefined) appointment.vitals = vitals;
    if (allergies !== undefined) {
      const cleanAllergies = Array.isArray(allergies)
        ? allergies.map(s => String(s).trim()).filter(Boolean)
        : String(allergies).split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean);
      appointment.allergies = cleanAllergies;
      if (appointment.patientId) {
        await Patient.findByIdAndUpdate(appointment.patientId, { $set: { allergies: cleanAllergies } });
      }
    }
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
  const { queueStatus, status, billingStatus, doctorId, date, time, allergies } = req.body;
  try {
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Queue appointment not found' });
    }

    if (allergies !== undefined) {
      const cleanAllergies = Array.isArray(allergies)
        ? allergies.map(s => String(s).trim()).filter(Boolean)
        : String(allergies).split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean);
      appointment.allergies = cleanAllergies;
      if (appointment.patientId) {
        await Patient.findByIdAndUpdate(appointment.patientId, { $set: { allergies: cleanAllergies } });
      }
    }

    if (queueStatus !== undefined || status !== undefined) {
      const targetInput = queueStatus !== undefined ? queueStatus : status;
      const targetQueueState = WorkflowEngine.mapLegacyToQueueState(targetInput);
      if (targetQueueState) {
        WorkflowEngine.transitionQueueState(appointment, targetQueueState, req.user);
      }
      if (targetInput === 'In Consultation' || targetInput === 'In-Consultation' || targetQueueState === 'IN_CONSULTATION') {
        const apptDate = appointment.date ? new Date(appointment.date) : null;
        const today = new Date();
        const isDifferentDay = !apptDate ||
          apptDate.getFullYear() !== today.getFullYear() ||
          apptDate.getMonth() !== today.getMonth() ||
          apptDate.getDate() !== today.getDate();

        if (isDifferentDay) {
          appointment.date = today;
          appointment.time = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }
    }
    
    if (billingStatus !== undefined) {
      const targetPaymentState = WorkflowEngine.mapLegacyToPaymentState(billingStatus);
      if (targetPaymentState) {
        WorkflowEngine.transitionPaymentState(appointment, targetPaymentState, req.user);
        if (targetPaymentState === 'PAID') {
          const isPharmDispensed = appointment.workflow?.pharmacyState === 'DISPENSED' || appointment.pharmacyStatus === 'DISPENSED';
          if (isPharmDispensed) {
            WorkflowEngine.transitionQueueState(appointment, QUEUE_STATES.COMPLETED, req.user);
            appointment.status = 'Completed';
            appointment.queueStatus = 'Completed';
            const Consultation = require('../models/Consultation');
            await Consultation.updateOne(
              { appointmentId: appointment._id },
              { $set: { status: 'COMPLETED' } }
            );
          }
        }
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
    if (req.body.consultationFee !== undefined && !isNaN(Number(req.body.consultationFee))) {
      appointment.consultationFee = Number(req.body.consultationFee);
    }
    if (req.body.additionalCharges !== undefined && !isNaN(Number(req.body.additionalCharges))) {
      appointment.additionalCharges = Number(req.body.additionalCharges);
    }
    if (Array.isArray(req.body.additionalChargeItems)) {
      appointment.additionalChargeItems = req.body.additionalChargeItems;
    }
    if (req.body.transactionId !== undefined) {
      appointment.transactionId = req.body.transactionId;
    }
    if (req.body.paymentDetails !== undefined) {
      appointment.paymentDetails = req.body.paymentDetails;
    }
    if (req.body.investigations && Array.isArray(req.body.investigations)) {
      appointment.investigations = await enrichInvestigationsBackend(req.body.investigations);
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
        if (req.body.consultationFee !== undefined && !isNaN(Number(req.body.consultationFee))) {
          const fee = Number(req.body.consultationFee);
          const consultItem = inv.items?.find(it => it.name === 'OPD Consultation Fee' || it.name === 'OPD Consultation');
          if (consultItem) {
            consultItem.unitPrice = fee;
            consultItem.amount = fee * (consultItem.quantity || 1);
          }
        }
        if (req.body.discount !== undefined && !isNaN(Number(req.body.discount))) {
          inv.discount = Number(req.body.discount);
        }
        if (Array.isArray(req.body.additionalChargeItems) && req.body.additionalChargeItems.length > 0) {
          inv.items = (inv.items || []).filter(it => it.name !== 'Additional Charges' && !it.isAdditionalCharge);
          for (const item of req.body.additionalChargeItems) {
            const itemPrice = Number(item.amount || item.price || 0);
            if (itemPrice > 0) {
              inv.items.push({
                name: item.name || 'Additional Charge',
                quantity: 1,
                unitPrice: itemPrice,
                amount: itemPrice,
                isAdditionalCharge: true
              });
            }
          }
        } else if (req.body.additionalCharges && Number(req.body.additionalCharges) > 0) {
          const addAmt = Number(req.body.additionalCharges);
          const existingAdd = inv.items?.find(it => it.name === 'Additional Charges');
          if (existingAdd) {
            existingAdd.unitPrice = addAmt;
            existingAdd.amount = addAmt;
          } else if (inv.items) {
            inv.items.push({
              name: 'Additional Charges',
              quantity: 1,
              unitPrice: addAmt,
              amount: addAmt
            });
          }
        }
        if (Array.isArray(appointment.investigations) && appointment.investigations.length > 0) {
          for (const invItem of appointment.investigations) {
            const p = parseFloat(invItem.price) || 0;
            const targetInvName = (invItem.name || '').toLowerCase();
            const existingInvLine = inv.items?.find(it => {
              const itLower = (it.name || '').toLowerCase();
              return itLower.includes(targetInvName) || targetInvName.includes(itLower);
            });
            if (existingInvLine) {
              existingInvLine.unitPrice = p;
              existingInvLine.amount = p * (existingInvLine.quantity || 1);
            } else if (inv.items) {
              inv.items.push({
                name: `${invItem.name}${invItem.serviceType ? ` (${invItem.serviceType})` : ''}`,
                quantity: 1,
                unitPrice: p,
                amount: p
              });
            }
          }
        }
        if (inv.items && inv.items.length > 0) {
          const sub = inv.items.reduce((s, it) => s + (Number(it.amount) || (Number(it.unitPrice) * (Number(it.quantity) || 1)) || 0), 0);
          inv.totalAmount = sub;
          inv.tax = sub * 0.18;
          inv.grandTotal = Math.max(0, inv.totalAmount + inv.tax - (inv.discount || 0));
        }
        inv.updatedBy = req.user._id;
        await inv.save();
      } else if (isPaid) {
        const invoiceNo = await generateInvoiceNo();
        const fee = (req.body.consultationFee !== undefined && !isNaN(Number(req.body.consultationFee)))
          ? Number(req.body.consultationFee)
          : (parseFloat(appointment.consultationFee) || 500);
        const items = [{
          name: 'OPD Consultation Fee',
          quantity: 1,
          unitPrice: fee,
          amount: fee
        }];
        if (Array.isArray(appointment.investigations) && appointment.investigations.length > 0) {
          for (const invItem of appointment.investigations) {
            const p = parseFloat(invItem.price) || 0;
            items.push({
              name: `${invItem.name}${invItem.serviceType ? ` (${invItem.serviceType})` : ''}`,
              quantity: 1,
              unitPrice: p,
              amount: p
            });
          }
        }
        if (Array.isArray(req.body.additionalChargeItems) && req.body.additionalChargeItems.length > 0) {
          for (const item of req.body.additionalChargeItems) {
            const itemPrice = Number(item.amount || item.price || 0);
            if (itemPrice > 0) {
              items.push({
                name: item.name || 'Additional Charge',
                quantity: 1,
                unitPrice: itemPrice,
                amount: itemPrice,
                isAdditionalCharge: true
              });
            }
          }
        } else if (req.body.additionalCharges && Number(req.body.additionalCharges) > 0) {
          const addAmt = Number(req.body.additionalCharges);
          items.push({
            name: 'Additional Charges',
            quantity: 1,
            unitPrice: addAmt,
            amount: addAmt
          });
        }
        const sub = items.reduce((s, it) => s + it.amount, 0);
        const discountVal = (req.body.discount !== undefined && !isNaN(Number(req.body.discount))) ? Number(req.body.discount) : 0;
        const taxVal = sub * 0.18;
        const grandTotalVal = Math.max(0, sub + taxVal - discountVal);
        await Invoice.create({
          invoiceNo,
          patientId: appointment.patientId,
          appointmentId: appointment._id,
          items,
          totalAmount: sub,
          discount: discountVal,
          tax: taxVal,
          grandTotal: grandTotalVal,
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
    const hospitalId = appointment.hospitalId || req.user?.hospitalId || req.hospitalId;
    const callData = {
      appointmentId: populated._id,
      _id: populated._id,
      tokenNumber: populated.tokenNumber,
      tokenNo: populated.tokenNumber,
      queueState: populated.status || populated.queueStatus,
      patientId: populated.patientId?._id || populated.patientId,
      doctorId: populated.doctorId?._id || populated.doctorId,
      patientName: populated.patientId?.name || '',
      doctorName: populated.doctorId?.name || '',
      roomNo: populated.doctorId?.roomNo || populated.doctorId?.doctorProfile?.roomNo || 'Room 1',
      hospitalId: hospitalId ? String(hospitalId) : undefined
    };

    const isInConsultation = 
      (queueStatus && String(queueStatus).toLowerCase().includes('consultation')) ||
      (status && String(status).toLowerCase().includes('consultation')) ||
      (populated.status && String(populated.status).toLowerCase().includes('consultation')) ||
      (populated.queueStatus && String(populated.queueStatus).toLowerCase().includes('consultation'));

    if (isInConsultation) {
      WorkflowEventHub.publish('TriggerVoiceCall', {
        ...callData,
        type: 'TriggerVoiceCall'
      });
    } else {
      WorkflowEventHub.publish('PatientCalled', callData);
    }

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
    const rawFood = p.foodTiming || p.instructions || p.food || '';
    const resolvedFood = normalizeFoodTiming(rawFood || (
      /panto|omepra|rabe|esomepra|lansopra|antacid|sucralfate|levothyrox/i.test(p.medicineName || '') ? 'Before Food' : 'After Food'
    ));
    const item = {
      medicineName: p.medicineName || 'Medication',
      dosage: p.dosage || `${p.morning || '1'}-${p.afternoon || '0'}-${p.night || '1'}`,
      frequency: p.frequency || 'BD',
      duration: p.duration || '5 Days',
      instructions: resolvedFood,
      foodTiming: resolvedFood,
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
    // Determine whether this consultation is for an IPD Inpatient
    const isExplicitIpd = req.body.isIpd === true || 
      (typeof req.body.consultationType === 'string' && req.body.consultationType.toLowerCase().startsWith('round')) ||
      Boolean(req.body.roundNumber || req.body.dayNumber);

    let linkedAppointment = null;
    if (isValidHexObjectId(String(appointmentId))) {
      linkedAppointment = await Appointment.findById(appointmentId, null, options);
    }

    let ipdAdmission = null;
    // Only resolve IPD admission if this is explicitly an IPD consultation or appointmentId is not an OPD appointment
    if (!linkedAppointment || isExplicitIpd) {
      if (isValidHexObjectId(String(appointmentId))) {
        ipdAdmission = await IPDAdmission.findById(appointmentId, null, options);
      }
      if (!ipdAdmission && appointmentId) {
        ipdAdmission = await IPDAdmission.findOne({ admissionId: String(appointmentId) }, null, options);
      }
      if (!ipdAdmission && patientId && isExplicitIpd) {
        ipdAdmission = await IPDAdmission.findOne({ patientId, status: 'Admitted', isActive: true, ...(validHospitalId ? { hospitalId: validHospitalId } : {}) }, null, options);
      }
    }

    const isIpdPatient = Boolean(!linkedAppointment && (isExplicitIpd || ipdAdmission));
    const roundNumberVal = Number(req.body.roundNumber || req.body.dayNumber) || 1;
    const dayNumberVal = Number(req.body.dayNumber || req.body.roundNumber) || 1;
    const targetPatient = patientId || linkedAppointment?.patientId || ipdAdmission?.patientId;

    // 1. Create or Update Consultation record (Status COMPLETED)
    let consultation;
    const existingConsultation = await Consultation.findOne({ appointmentId }, null, options);
    const enrichedInvestigations = await enrichInvestigationsBackend(investigations, options);

    if (existingConsultation) {
      existingConsultation.patientId = targetPatient || existingConsultation.patientId;
      existingConsultation.diagnosis = finalDiagnosis;
      existingConsultation.clinicalNotes = clinicalNotes || '';
      existingConsultation.advice = advice || '';
      existingConsultation.followupDate = (followupRequired && followupDate) ? new Date(followupDate) : undefined;
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
      existingConsultation.isIpd = isIpdPatient;
      if (isIpdPatient) {
        existingConsultation.admissionId = ipdAdmission?._id || appointmentId;
        existingConsultation.roundNumber = roundNumberVal;
        existingConsultation.dayNumber = dayNumberVal;
      } else {
        existingConsultation.isIpd = false;
      }
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
      existingConsultation.investigations = enrichedInvestigations;
      const consultationAllergies = Array.isArray(req.body.allergies) 
        ? req.body.allergies.map(s => String(s).trim()).filter(Boolean)
        : (typeof req.body.allergies === 'string' ? req.body.allergies.split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean) : []);
      const uniqueConsultationAllergies = Array.from(new Set(consultationAllergies));
      if (uniqueConsultationAllergies.length > 0) {
        existingConsultation.allergies = uniqueConsultationAllergies;
      }
      existingConsultation.updatedBy = req.user._id;

      consultation = await existingConsultation.save(options);
    } else {
      const consultationAllergies = Array.isArray(req.body.allergies) 
        ? req.body.allergies.map(s => String(s).trim()).filter(Boolean)
        : (typeof req.body.allergies === 'string' ? req.body.allergies.split(/[,;\n/]+/).map(s => s.trim()).filter(Boolean) : []);
      const uniqueConsultationAllergies = Array.from(new Set(consultationAllergies));

      const createdDocs = await Consultation.create([{
        appointmentId,
        admissionId: isIpdPatient ? (ipdAdmission?._id || appointmentId) : undefined,
        isIpd: isIpdPatient,
        roundNumber: isIpdPatient ? roundNumberVal : undefined,
        dayNumber: isIpdPatient ? dayNumberVal : undefined,
        patientId: targetPatient,
        allergies: uniqueConsultationAllergies,
        doctorId: req.user._id,
        diagnosis: finalDiagnosis,
        clinicalNotes: clinicalNotes || '',
        advice: advice || '',
        followupDate: (followupRequired && followupDate) ? new Date(followupDate) : undefined,
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
        investigations: enrichedInvestigations,
        hospitalId: validHospitalId,
        branchId: validBranchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }], options);
      consultation = createdDocs[0];
    }

    // Determine Prescription Delivery Routing from Hospital Settings & Request
    const hospitalForDelivery = validHospitalId ? await Hospital.findById(validHospitalId).lean() : null;
    const configuredDelivery = hospitalForDelivery?.billingWorkflowSettings?.prescriptionDelivery || 'internal_pharmacy';
    const reqDelivery = req.body.deliveryMethod || req.body.prescriptionDelivery;

    // Request explicit delivery choice takes precedence if present, fallback to hospital settings
    const effectiveDelivery = reqDelivery || configuredDelivery;
    const isExternalPrint = effectiveDelivery === 'print_only' || effectiveDelivery === 'external_print' || effectiveDelivery === 'external';
    const shouldSendToPharmacy = hasRx && !isExternalPrint;

    const opdToken = linkedAppointment?.tokenNumber || 'OP001';

    // 2. Create or Update Prescription mapping if medicines exist (preventing duplicate prescriptions)
    let prescription = null;
    if (hasRx && shouldSendToPharmacy) {
      const existingRx = await Prescription.findOne({ consultationId: consultation._id }, null, options);
      if (existingRx) {
        existingRx.appointmentId = isIpdPatient ? undefined : appointmentId;
        if (isIpdPatient) {
          existingRx.admissionId = ipdAdmission?._id || appointmentId;
          existingRx.isIpd = true;
          existingRx.tokenNumber = 'IPD';
        } else {
          existingRx.admissionId = undefined;
          existingRx.isIpd = false;
          existingRx.tokenNumber = opdToken;
        }
        existingRx.doctorId = req.user._id;
        existingRx.items = sanitizedRxItems;
        if (existingRx.status !== 'Dispensed' && existingRx.status !== 'Completed') {
          existingRx.status = isIpdPatient ? 'Sent to Pharmacy' : 'Pending';
          existingRx.dispensedAt = null;
          existingRx.completedAt = null;
        }
        existingRx.sentToPharmacyAt = new Date();
        existingRx.sentByDoctorId = req.user._id;
        existingRx.updatedBy = req.user._id;
        await existingRx.save(options);
        prescription = existingRx;
      } else {
        const rxDocs = await Prescription.create([{
          appointmentId: isIpdPatient ? undefined : appointmentId,
          admissionId: isIpdPatient ? (ipdAdmission?._id || appointmentId) : undefined,
          isIpd: isIpdPatient,
          tokenNumber: isIpdPatient ? 'IPD' : opdToken,
          consultationId: consultation._id,
          patientId,
          doctorId: req.user._id,
          items: sanitizedRxItems,
          status: isIpdPatient ? 'Sent to Pharmacy' : 'Pending',
          sentToPharmacyAt: new Date(),
          sentByDoctorId: req.user._id,
          hospitalId: validHospitalId,
          branchId: validBranchId,
          createdBy: req.user._id,
          updatedBy: req.user._id
        }], options);
        prescription = rxDocs[0];
      }
    } else if (hasRx) {
      const existingRx = await Prescription.findOne({ consultationId: consultation._id }, null, options);
      if (existingRx) {
        existingRx.appointmentId = isIpdPatient ? undefined : appointmentId;
        if (isIpdPatient) {
          existingRx.admissionId = ipdAdmission?._id || appointmentId;
          existingRx.isIpd = true;
          existingRx.tokenNumber = 'IPD';
        } else {
          existingRx.admissionId = undefined;
          existingRx.isIpd = false;
          existingRx.tokenNumber = opdToken;
        }
        existingRx.doctorId = req.user._id;
        existingRx.items = sanitizedRxItems;
        existingRx.status = 'External';
        existingRx.printedAt = new Date();
        existingRx.sentByDoctorId = req.user._id;
        existingRx.updatedBy = req.user._id;
        await existingRx.save(options);
        prescription = existingRx;
      } else {
        const rxDocs = await Prescription.create([{
          appointmentId: isIpdPatient ? undefined : appointmentId,
          admissionId: isIpdPatient ? (ipdAdmission?._id || appointmentId) : undefined,
          isIpd: isIpdPatient,
          tokenNumber: isIpdPatient ? 'IPD' : opdToken,
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
    }

    // 3. Populate snapshot entities
    const patientDoc = await Patient.findById(patientId, null, options);
    const doctorDoc = await User.findById(req.user._id, null, options);
    const hospitalDoc = hospitalForDelivery || (validHospitalId ? await Hospital.findById(validHospitalId).lean() : null);
    const branchDoc = validBranchId ? await Branch.findById(validBranchId, null, options) : null;
    const appointment = await Appointment.findById(appointmentId, null, options);

    // 4. Update Consultation status to past
    consultation.status = 'past';
    await consultation.save(options);

    const snapshot = consultation;

    // 5. Update Appointment & Queue state based on delivery routing
    if (appointment) {
      const isAlreadyDispensed = appointment.pharmacyStatus === 'DISPENSED' || appointment.workflow?.pharmacyState === 'DISPENSED';
      const targetState = (shouldSendToPharmacy && !isAlreadyDispensed) ? QUEUE_STATES.SENT_TO_PHARMACY : QUEUE_STATES.COMPLETED;
      try {
        WorkflowEngine.transitionQueueState(appointment, targetState, req.user);
      } catch (wfErr) {
        console.warn('Workflow transition bypassed in createConsultation:', wfErr.message);
        if (appointment.workflow) {
          appointment.workflow.queueState = targetState;
        }
      }
      if (!appointment.workflow) appointment.workflow = {};
      appointment.workflow.queueState = targetState;
      appointment.workflow.consultationState = 'COMPLETED';
      if (!appointment.workflow.timestamps) appointment.workflow.timestamps = {};
      appointment.workflow.timestamps.consultationCompletedAt = new Date();
      appointment.consultationDate = new Date();
      const scheduledAppDate = appointment.date ? new Date(appointment.date) : null;
      if (scheduledAppDate && !isNaN(scheduledAppDate.getTime()) && scheduledAppDate.getTime() > Date.now() + 86400000) {
        appointment.scheduledDate = appointment.date;
        appointment.date = new Date();
      }

      if (shouldSendToPharmacy && !isAlreadyDispensed) {
        appointment.status = 'Sent to Pharmacy';
        appointment.queueStatus = 'Sent to Pharmacy';
        appointment.pharmacyStatus = 'SENT';
      } else {
        appointment.status = 'Completed';
        appointment.queueStatus = 'Completed';
      }
      appointment.followupStatus = 'Completed';
      appointment.followupCompleted = true;
      // Ensure appointment always has an original, non-clashing unique token number on this consultation date
      const apptTargetDate = appointment.consultationDate || appointment.date || new Date();
      const sOfDay = new Date(apptTargetDate); sOfDay.setHours(0, 0, 0, 0);
      const eOfDay = new Date(apptTargetDate); eOfDay.setHours(23, 59, 59, 999);
      const isEmg = Boolean(appointment.isEmergency);

      const hasCollidingToken = (appointment.tokenNumber && appointment.tokenNumber !== 'N/A') ? await Appointment.findOne({
        _id: { $ne: appointment._id },
        $or: [
          { date: { $gte: sOfDay, $lte: eOfDay } },
          { consultationDate: { $gte: sOfDay, $lte: eOfDay } }
        ],
        tokenNumber: appointment.tokenNumber
      }).select('_id').lean() : null;

      if (!appointment.tokenNumber || String(appointment.tokenNumber).trim() === '' || appointment.tokenNumber === 'N/A' || hasCollidingToken) {
        appointment.tokenNumber = await generateUniqueDailyToken({
          targetDate: apptTargetDate,
          branchId: validBranchId,
          hospitalId: validHospitalId || req.user.hospitalId,
          isEmergency: isEmg,
          excludeApptId: appointment._id
        });
      }
      if (chiefComplaint || finalDiagnosis) {
        appointment.chiefComplaint = chiefComplaint || finalDiagnosis;
      }
      if (finalDiagnosis || primaryDiagnosis) {
        appointment.diagnosis = finalDiagnosis || primaryDiagnosis;
      }
      if (Array.isArray(activeDiagnoses) && activeDiagnoses.length > 0) {
        appointment.diagnoses = activeDiagnoses;
      }
      if (vitals && typeof vitals === 'object' && Object.keys(vitals).length > 0) {
        appointment.vitals = vitals;
      }
      appointment.completedByDoctorId = req.user._id;
      if (req.body.consultationFee !== undefined && !isNaN(Number(req.body.consultationFee))) {
        appointment.consultationFee = Number(req.body.consultationFee);
      }
      appointment.investigations = enrichedInvestigations;
      if (shouldSendToPharmacy) {
        appointment.sentToPharmacyAt = new Date();
        appointment.sentByDoctorId = req.user._id;
      }
      if (consultation) {
        appointment.consultationId = consultation._id;
      }
      await appointment.save(options);
      if (consultation) {
        consultation.tokenNumber = appointment.tokenNumber;
        await consultation.save(options).catch(() => {});
      }
      if (prescription && !isIpdPatient) {
        prescription.tokenNumber = appointment.tokenNumber;
        await prescription.save(options).catch(() => {});
      }
    }

    // 5b. Update IPD Admission & Record Daily Review if this is an IPD Inpatient Consultation
    try {
      const IPDAdmission = require('../models/IPDAdmission');
      let ipdAdmission = null;
      if (isValidHexObjectId(String(appointmentId))) {
        ipdAdmission = await IPDAdmission.findById(appointmentId, null, options);
      }
      if (!ipdAdmission && appointmentId) {
        ipdAdmission = await IPDAdmission.findOne({ admissionId: String(appointmentId) }, null, options);
      }
      if (!ipdAdmission && patientId) {
        ipdAdmission = await IPDAdmission.findOne({ patientId, status: 'Admitted', hospitalId: req.hospitalId }, null, options);
      }

      if (ipdAdmission) {
        ipdAdmission.queueStatus = 'Completed';
        if (!Array.isArray(ipdAdmission.visitedDoctorIds)) ipdAdmission.visitedDoctorIds = [];
        if (!ipdAdmission.visitedDoctorIds.some(d => String(d) === String(req.user._id))) {
          ipdAdmission.visitedDoctorIds.push(req.user._id);
        }
        if (!Array.isArray(ipdAdmission.dailyReviews)) ipdAdmission.dailyReviews = [];
        const targetDayNum = Number(req.body.dayNumber || req.body.roundNumber) || (ipdAdmission.dailyReviews.length || 0) + 1;
        const existingRevIdx = ipdAdmission.dailyReviews.findIndex(r => Number(r.dayNumber) === targetDayNum);
        const reviewObj = {
          dayNumber: targetDayNum,
          reviewDate: new Date(),
          reviewTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          doctorId: req.user._id,
          doctorName: req.user.name || 'Doctor',
          chiefComplaints: chiefComplaint || finalDiagnosis || '',
          diagnosis: finalDiagnosis,
          clinicalFindings: clinicalNotes || '',
          assessment: assessmentNotes || clinicalNotes || 'Doctor consultation completed.',
          treatmentPlan: advice || '',
          vitals: {
            bp: vitals?.bpSystolic && vitals?.bpDiastolic ? `${vitals.bpSystolic}/${vitals.bpDiastolic}` : (vitals?.bp || ''),
            pulse: vitals?.pulse || '',
            temperature: vitals?.temperature || '',
            spo2: vitals?.spo2 || ''
          },
          prescriptions: sanitizedRxItems.map(p => ({
            medicineName: p.medicineName,
            dose: p.dosage,
            route: p.route || 'Oral',
            frequency: p.frequency || 'Once daily',
            duration: p.duration || '3 days',
            instructions: p.instructions || 'After food',
            quantity: p.quantity || 1,
            pharmacyStatus: shouldSendToPharmacy ? 'Sent to Pharmacy' : 'Pending'
          })),
          statusBadge: 'Doctor Consulted',
          consultationId: consultation._id,
          isDraft: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        if (existingRevIdx >= 0) {
          ipdAdmission.dailyReviews[existingRevIdx] = {
            ...(ipdAdmission.dailyReviews[existingRevIdx].toObject ? ipdAdmission.dailyReviews[existingRevIdx].toObject() : ipdAdmission.dailyReviews[existingRevIdx]),
            ...reviewObj
          };
        } else {
          ipdAdmission.dailyReviews.push(reviewObj);
        }
        // Attach investigations to the daily review
        if (Array.isArray(enrichedInvestigations) && enrichedInvestigations.length > 0) {
          reviewObj.investigations = enrichedInvestigations;

          // Automatically sync ordered investigations into IPD billing items
          if (!ipdAdmission.billingDetails) ipdAdmission.billingDetails = {};
          if (!Array.isArray(ipdAdmission.billingDetails.billingItems)) ipdAdmission.billingDetails.billingItems = [];

          let additionalLabTotal = 0;
          for (const inv of enrichedInvestigations) {
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

            const alreadyAdded = ipdAdmission.billingDetails.billingItems.some(
              b => (b.serviceName || '').toLowerCase() === invName.toLowerCase() &&
                   (b.description || '').includes(`Round ${targetDayNum}`)
            );
            if (!alreadyAdded) {
              ipdAdmission.billingDetails.billingItems.push({
                serviceCategory: invCategory,
                serviceName: invName,
                description: `Ordered in Round ${targetDayNum} by Dr. ${req.user.name || 'Doctor'}`,
                quantity: 1,
                unitPrice: invPrice,
                amount: invPrice,
                dateTime: new Date(),
                status: 'Added to Bill',
                isManual: false,
                addedBy: req.user._id,
                createdAt: new Date()
              });
              additionalLabTotal += invPrice;
            }
          }
          if (additionalLabTotal > 0) {
            ipdAdmission.billingDetails.labCharges = (ipdAdmission.billingDetails.labCharges || 0) + additionalLabTotal;
            ipdAdmission.billingDetails.totalBill = (ipdAdmission.billingDetails.totalBill || 0) + additionalLabTotal;
          }
        }

        const labCount = (enrichedInvestigations || []).filter(i => {
          const cat = (i.serviceType || i.category || '').toLowerCase();
          return !cat.includes('radiology') && !cat.includes('imaging') && !i.name.toLowerCase().includes('x-ray');
        }).length;
        const radCount = (enrichedInvestigations || []).length - labCount;

        if (!ipdAdmission.clinicalWorkload) {
          ipdAdmission.clinicalWorkload = { 
            doctorRounds: ipdAdmission.dailyReviews.length, 
            labTests: labCount, 
            imagingScans: radCount, 
            medsPrescribed: (sanitizedRxItems || []).length 
          };
        } else {
          ipdAdmission.clinicalWorkload.doctorRounds = Math.max(ipdAdmission.clinicalWorkload.doctorRounds || 0, ipdAdmission.dailyReviews.length);
          ipdAdmission.clinicalWorkload.labTests = (ipdAdmission.clinicalWorkload.labTests || 0) + labCount;
          ipdAdmission.clinicalWorkload.imagingScans = (ipdAdmission.clinicalWorkload.imagingScans || 0) + radCount;
          ipdAdmission.clinicalWorkload.medsPrescribed = (ipdAdmission.clinicalWorkload.medsPrescribed || 0) + (sanitizedRxItems || []).length;
        }
        await ipdAdmission.save(options);
      }
    } catch (ipdErr) {
      console.warn('IPD admission sync warning in createConsultation:', ipdErr.message);
    }

    // 6. Create or Update Invoice for Consultation & Investigations
    // Check if an invoice already exists for this appointment (e.g., from reception token generation)
    const invoiceQuery = { appointmentId };
    if (validHospitalId) invoiceQuery.hospitalId = validHospitalId;
    let existingInvoice = await Invoice.findOne(invoiceQuery, null, options).sort({ createdAt: 1 });

    if (existingInvoice) {
      // If investigations were added during consultation, append to existing invoice items
      if (Array.isArray(enrichedInvestigations) && enrichedInvestigations.length > 0) {
        for (const inv of enrichedInvestigations) {
          const invPrice = parseFloat(inv.price) || 0;
          existingInvoice.items.push({
            name: `${inv.name || 'Investigation'}${inv.serviceType ? ` (${inv.serviceType})` : ''}`,
            quantity: 1,
            unitPrice: invPrice,
            amount: invPrice
          });
        }
        const updatedTotal = existingInvoice.items.reduce((s, it) => s + (it.amount || (it.quantity * it.unitPrice) || 0), 0);
        existingInvoice.totalAmount = updatedTotal;
        existingInvoice.grandTotal = Math.max(0, updatedTotal - (existingInvoice.discount || 0));
        await existingInvoice.save(options);
      }
    } else {
      // Create primary consultation invoice
      const invoiceNo = await generateInvoiceNo();
      let totalAmount = 0;
      const initialFee = (req.body.consultationFee !== undefined && !isNaN(Number(req.body.consultationFee)))
        ? Number(req.body.consultationFee)
        : (appointment?.consultationFee || 500);
      let invoiceItems = [
        { name: 'OPD Consultation Fee', quantity: 1, unitPrice: initialFee, amount: initialFee }
      ];
      totalAmount += initialFee;

      if (Array.isArray(enrichedInvestigations) && enrichedInvestigations.length > 0) {
        for (const inv of enrichedInvestigations) {
          const invPrice = parseFloat(inv.price) || 0;
          invoiceItems.push({
            name: `${inv.name || 'Investigation'}${inv.serviceType ? ` (${inv.serviceType})` : ''}`,
            quantity: 1,
            unitPrice: invPrice,
            amount: invPrice
          });
          totalAmount += invPrice;
        }
      }

      const isAppPaid = appointment?.billingStatus === 'Paid' || appointment?.workflow?.paymentState === 'PAID';

      await Invoice.create([{
        invoiceNo,
        patientId,
        appointmentId,
        items: invoiceItems,
        totalAmount,
        discount: 0,
        tax: 0,
        grandTotal: totalAmount,
        paymentStatus: isAppPaid ? 'Paid' : 'Unpaid',
        hospitalId: validHospitalId,
        branchId: validBranchId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }], options);
    }

    // Auto-fulfill previous pending scheduled follow-up appointments and consultations for this patient
    // CRITICAL: Only fulfill appointments and follow-ups on or before today (date <= endOfToday), NEVER future scheduled reviews!
    if (patientId) {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      await Appointment.updateMany(
        {
          patientId,
          _id: { $ne: appointmentId },
          date: { $lte: endOfToday },
          $or: [
            { status: { $in: ['Scheduled', 'In Consultation', 'In-Consultation', 'In Progress'] } },
            { queueStatus: { $in: ['Scheduled', 'In Consultation', 'In-Consultation', 'In Progress'] } },
            { consultationType: { $in: ['Follow-Up', 'Follow-up', 'Appointment'] } }
          ]
        },
        {
          $set: {
            status: 'Completed',
            queueStatus: 'Completed',
            followupStatus: 'Completed',
            followupCompleted: true,
            'workflow.queueState': 'COMPLETED',
            'workflow.consultationState': 'COMPLETED'
          }
        },
        options
      );

      await Consultation.updateMany(
        {
          patientId,
          _id: { $ne: consultation._id },
          followupDate: { $exists: true, $ne: null, $lte: endOfToday }
        },
        {
          $set: {
            followupStatus: 'Completed',
            followupCompleted: true
          }
        },
        options
      );
    }

    // 7. Followup Appointment (ONLY when doctor explicitly required follow-up)
    if (followupRequired && followupDate) {
      const startOfDay = new Date(followupDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(followupDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingFollowupAppt = await Appointment.findOne({
        patientId,
        date: { $gte: startOfDay, $lte: endOfDay }
      }, null, options);

      if (!existingFollowupAppt) {
        const tokenNumber = await generateUniqueDailyToken({
          targetDate: followupDate,
          branchId: validBranchId,
          hospitalId: validHospitalId || req.user.hospitalId,
          isEmergency: false
        });

        let fTime = followupTime || '10:00 AM';
        if (/^\d{1,2}:\d{2}$/.test(fTime)) {
          const [h, m] = fTime.split(':').map(Number);
          const period = h >= 12 ? 'PM' : 'AM';
          const displayH = h % 12 || 12;
          fTime = `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
        }

        const [createdFollowUp] = await Appointment.create([{
          patientId,
          doctorId: req.user._id,
          date: new Date(followupDate),
          time: fTime,
          slotTime: fTime,
          tokenNumber,
          consultationType: 'Follow-Up',
          status: 'Scheduled',
          queueStatus: 'Scheduled',
          workflow: {
            queueState: 'SCHEDULED'
          },
          bookingSource: 'DOCTOR',
          billingStatus: 'Unpaid',
          hospitalId: validHospitalId,
          branchId: validBranchId,
          createdBy: req.user._id,
          updatedBy: req.user._id
        }], options);

        if (consultation && createdFollowUp) {
          consultation.followUpAppointmentId = createdFollowUp._id;
          await consultation.save(options);
        }
      }
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
    let targetPatientId = patientId;
    let patientDoc = null;

    if (patientId && mongoose.Types.ObjectId.isValid(patientId)) {
      patientDoc = await Patient.findById(patientId).populate('createdBy', 'name').lean();
    }

    if (!patientDoc && patientId) {
      const isHex = typeof patientId === 'string' && /^[0-9a-fA-F]{24}$/.test(patientId);
      patientDoc = await Patient.findOne({
        $or: [{ uhid: patientId }, { _id: isHex ? patientId : null }]
      }).populate('createdBy', 'name').lean();
    }

    if (patientDoc) {
      targetPatientId = patientDoc._id;
    }

    const hospitalFilter = (req.user?.hospitalId && mongoose.Types.ObjectId.isValid(req.user.hospitalId))
      ? { hospitalId: req.user.hospitalId }
      : {};

    // 1. Fetch all appointments for this patient
    const appointments = await Appointment.find({ patientId: targetPatientId, ...hospitalFilter })
      .populate('doctorId', 'name specialization')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const apptIds = appointments.map(a => a._id);
    const consultIdsFromAppts = appointments.map(a => a.consultationId).filter(Boolean);

    // 2. Fetch all consultations for this patient (including COMPLETED, Completed, past, active, etc.)
    const allConsultations = await Consultation.find({
      $or: [
        { patientId: targetPatientId },
        { appointmentId: { $in: apptIds } },
        { _id: { $in: consultIdsFromAppts } }
      ],
      ...hospitalFilter
    })
      .populate('doctorId', 'name specialization')
      .sort({ createdAt: -1 })
      .lean();

    const consultIds = allConsultations.map(c => c._id);

    // 3. Fetch all prescriptions for this patient
    const prescriptions = await Prescription.find({
      $or: [
        { patientId: targetPatientId },
        { appointmentId: { $in: apptIds } },
        { consultationId: { $in: consultIds } }
      ],
      ...hospitalFilter
    })
      .populate('doctorId', 'name specialization')
      .sort({ createdAt: -1 })
      .lean();

    // 4. Fetch all IPD Admissions for this patient
    let ipdAdmissions = [];
    try {
      ipdAdmissions = await IPDAdmission.find({ patientId: targetPatientId, ...hospitalFilter })
        .populate('attendingDoctorId', 'name specialization')
        .populate({
          path: 'bedId',
          populate: { path: 'wardId', select: 'name code' }
        })
        .sort({ admissionDate: -1, createdAt: -1 })
        .lean();
    } catch (ipdErr) {
      console.warn('[getPatientHistory] Could not query IPDAdmission:', ipdErr.message);
    }

    // Lookup caches for high-precision encounter categorization & mapping
    const apptMap = new Map(appointments.map(a => [String(a._id), a]));
    const ipdAdmMap = new Map(ipdAdmissions.map(a => [String(a._id), a]));
    const ipdCodeMap = new Map(ipdAdmissions.map(a => [String(a.admissionId), a]));
    const rxByConsultId = new Map();
    const rxByApptId = new Map();
    prescriptions.forEach(p => {
      if (p.consultationId) rxByConsultId.set(String(p.consultationId), p);
      if (p.appointmentId) rxByApptId.set(String(p.appointmentId), p);
    });

    // Explicitly separate IPD consultations (rounds) from OPD consultations to avoid duplicate General OPD cards
    const ipdConsultations = [];
    const pureOpdConsultations = [];

    allConsultations.forEach(c => {
      const rawApptId = String(c.appointmentId?._id || c.appointmentId || '');
      const rawAdmId = String(c.admissionId?._id || c.admissionId || '');
      const consultRx = rxByConsultId.get(String(c._id)) || (rawApptId ? rxByApptId.get(rawApptId) : null);

      const isIpd = Boolean(
        c.isIpd === true ||
        ipdAdmMap.has(rawApptId) ||
        ipdAdmMap.has(rawAdmId) ||
        ipdCodeMap.has(rawApptId) ||
        ipdCodeMap.has(rawAdmId) ||
        consultRx?.isIpd === true ||
        (consultRx?.admissionId && ipdAdmMap.has(String(consultRx.admissionId))) ||
        (typeof c.consultationType === 'string' && /round|ipd/i.test(c.consultationType)) ||
        (c.chiefComplaint && /transferred.*ipd/i.test(c.chiefComplaint)) ||
        (c.clinicalNotes && /inpatient round/i.test(c.clinicalNotes))
      );

      if (isIpd) {
        ipdConsultations.push(c);
      } else {
        const matchingAppt = apptMap.get(rawApptId);
        c.appointmentObj = matchingAppt || null;
        c.appointmentId = matchingAppt || c.appointmentId || rawApptId;
        pureOpdConsultations.push(c);
      }
    });

    // 5. Enrich genuine OPD consultations with linked prescriptions, vitals, diagnosis, and notes
    const enrichedConsultations = pureOpdConsultations.map(c => {
      const apptId = String(c.appointmentId?._id || c.appointmentId || '');
      const matchingAppt = apptMap.get(apptId) || c.appointmentObj || null;
      const matchingRx = prescriptions.filter(p =>
        !p.isIpd && !p.admissionId &&
        ((p.consultationId && String(p.consultationId) === String(c._id)) ||
         (apptId && p.appointmentId && String(p.appointmentId) === apptId))
      );

      const rxItems = matchingRx.flatMap(p => p.items || []);
      const combinedVitals = {
        ...(matchingAppt?.vitals || {}),
        ...(c.vitals || {})
      };
      if (combinedVitals.bp && (!combinedVitals.bpSystolic || !combinedVitals.bpDiastolic)) {
        const parts = String(combinedVitals.bp).split('/');
        if (parts.length === 2) {
          if (!combinedVitals.bpSystolic) combinedVitals.bpSystolic = parts[0].trim();
          if (!combinedVitals.bpDiastolic) combinedVitals.bpDiastolic = parts[1].trim();
        }
      }

      const docName = c.doctorId?.name || matchingAppt?.doctorId?.name || (typeof c.doctorId === 'string' ? c.doctorId : null) || 'Doctor';
      const docSpec = c.doctorId?.specialization || matchingAppt?.doctorId?.specialization || 'General OPD';
      const tokenNum = c.tokenNumber || matchingAppt?.tokenNumber || (c.appointmentId?.tokenNumber) || '';
      const apptTime = matchingAppt?.time || c.time || '';

      const finalDiagnoses = (c.diagnoses && Array.isArray(c.diagnoses) && c.diagnoses.length > 0)
        ? c.diagnoses
        : (c.primaryDiagnosis ? [c.primaryDiagnosis] : (c.diagnosis ? [c.diagnosis] : (matchingAppt?.diagnoses || [])));

      const primaryDiag = c.primaryDiagnosis || (finalDiagnoses.length > 0 ? finalDiagnoses[0] : null) || c.diagnosis || matchingAppt?.diagnosis || matchingAppt?.primaryDiagnosis || 'Clinical Consultation';

      const chiefComp = c.chiefComplaint || matchingAppt?.chiefComplaint || c.symptoms || matchingAppt?.symptoms || 'General Checkup';

      const finalRx = rxItems.length > 0
        ? rxItems
        : (c.prescriptions && c.prescriptions.length > 0
            ? c.prescriptions
            : (matchingAppt?.prescriptions && matchingAppt.prescriptions.length > 0
                ? matchingAppt.prescriptions
                : []));

      const consultDate = c.consultationDate || c.createdAt || matchingAppt?.consultationDate || matchingAppt?.workflow?.timestamps?.consultationCompletedAt || matchingAppt?.date;

      return {
        ...c,
        _id: c._id,
        appointmentId: matchingAppt || c.appointmentId,
        tokenNumber: tokenNum,
        time: apptTime,
        appointmentTime: apptTime,
        doctorName: docName,
        doctorSpecialization: docSpec || 'General OPD',
        isIpd: false,
        chiefComplaint: chiefComp,
        symptoms: c.symptoms || chiefComp,
        diagnosis: primaryDiag,
        primaryDiagnosis: primaryDiag,
        diagnoses: finalDiagnoses,
        advice: c.advice || c.generalInstructions || c.treatmentPlan || matchingAppt?.advice || '',
        notes: c.clinicalNotes || c.examinationFindings || c.notes || matchingAppt?.clinicalNotes || matchingAppt?.notes || '',
        clinicalNotes: c.clinicalNotes || c.examinationFindings || c.notes || matchingAppt?.clinicalNotes || matchingAppt?.notes || '',
        vitals: combinedVitals,
        prescriptions: finalRx,
        items: finalRx,
        investigations: (c.investigations && c.investigations.length > 0) ? c.investigations : (matchingAppt?.investigations || []),
        consultationDate: consultDate,
        createdAt: consultDate,
        date: matchingAppt?.date || consultDate
      };
    });

    // 6. Check if there are any completed appointments without a separate consultation record
    const existingConsultationApptIds = new Set();
    pureOpdConsultations.forEach(c => {
      const aId = String(c.appointmentId?._id || c.appointmentId || '');
      if (aId) existingConsultationApptIds.add(aId);
      if (c.appointmentObj?._id) existingConsultationApptIds.add(String(c.appointmentObj._id));
    });

    const transferredApptIds = new Set(
      ipdAdmissions.map(adm => String(adm.opdAppointmentId || '')).filter(Boolean)
    );

    const unlinkedVisits = appointments.filter(a =>
      !a.isIpd &&
      !a.isTransferredToIpd &&
      a.status !== 'Transferred to IPD' &&
      a.queueStatus !== 'Transferred to IPD' &&
      !transferredApptIds.has(String(a._id)) &&
      !existingConsultationApptIds.has(String(a._id)) &&
      ['Completed', 'Sent to Pharmacy', 'In Consultation', 'Dispensed', 'Dispensing'].includes(a.status || a.queueStatus)
    ).map(a => {
      const matchingRx = prescriptions.filter(p => !p.isIpd && !p.admissionId && p.appointmentId && String(p.appointmentId) === String(a._id));
      const rxItems = matchingRx.flatMap(p => p.items || []);
      const finalRx = rxItems.length > 0 ? rxItems : (a.prescriptions || a.items || []);

      const docName = a.doctorId?.name || (typeof a.doctorId === 'string' ? a.doctorId : null) || 'Doctor';
      const docSpec = a.doctorId?.specialization || 'General OPD';

      const resolvedChiefComplaint = a.chiefComplaint || a.symptoms || 'General Checkup';
      const resolvedDiag = a.diagnosis || a.primaryDiagnosis || (Array.isArray(a.diagnoses) && a.diagnoses.length > 0 ? a.diagnoses[0] : null) || (a.chiefComplaint ? `OPD: ${a.chiefComplaint}` : 'Clinical Consultation');

      return {
        _id: a._id,
        appointmentId: a,
        patientId: targetPatientId,
        doctorId: a.doctorId,
        doctorName: docName,
        doctorSpecialization: docSpec,
        isIpd: false,
        tokenNumber: a.tokenNumber || '',
        time: a.time || '',
        appointmentTime: a.time || '',
        chiefComplaint: resolvedChiefComplaint,
        symptoms: a.symptoms || a.chiefComplaint || '',
        diagnosis: resolvedDiag,
        primaryDiagnosis: resolvedDiag,
        diagnoses: a.diagnoses || [resolvedDiag],
        clinicalNotes: a.clinicalNotes || a.notes || '',
        notes: a.clinicalNotes || a.notes || '',
        advice: a.advice || a.generalInstructions || '',
        vitals: a.vitals || {},
        status: a.status || 'COMPLETED',
        prescriptions: finalRx,
        items: finalRx,
        investigations: a.investigations || [],
        consultationDate: a.consultationDate || a.workflow?.timestamps?.consultationCompletedAt || a.date || a.createdAt,
        createdAt: a.consultationDate || a.workflow?.timestamps?.consultationCompletedAt || a.date || a.createdAt,
        date: a.date,
        updatedAt: a.updatedAt || new Date()
      };
    });

    // 7. Map IPD Admissions and Daily Reviews into clinical visit records
    const ipdDailyConsultations = [];
    const ipdVisits = [];
    const processedIpdConsultIds = new Set();

    (ipdAdmissions || []).forEach(adm => {
      const bedObj = adm.bedId;
      const wardName = bedObj?.wardId?.name || (typeof bedObj?.wardId === 'string' ? bedObj.wardId : '');
      const bedNumber = bedObj?.bedNumber || '';
      const bedLabel = wardName && bedNumber ? `${wardName} | Bed ${bedNumber}` : (bedNumber ? `Bed ${bedNumber}` : (wardName || ''));
      const doctorName = adm.attendingDoctorId?.name || 'Inpatient Medical Team';
      const doctorSpecialization = adm.attendingDoctorId?.specialization || 'In-Patient Department (IPD)';

      // 7a. Map each dailyReview into an IPD Daily Consultation record, cleanly merging with any corresponding Consultation doc
      (adm.dailyReviews || []).forEach((rev, idx) => {
        const dayNum = rev.dayNumber || (idx + 1);
        const revDoctorName = rev.doctorName || rev.doctorId?.name || doctorName;

        // Find matching consultation for this review to prevent duplicates
        const matchedConsult = ipdConsultations.find(c => {
          if (processedIpdConsultIds.has(String(c._id))) return false;
          const rawAppt = String(c.appointmentId?._id || c.appointmentId || '');
          const rawAdm = String(c.admissionId?._id || c.admissionId || '');
          const matchesAdm = rawAppt === String(adm._id) || rawAdm === String(adm._id) || rawAdm === String(adm.admissionId);
          const matchesRound = c.roundNumber === dayNum || c.dayNumber === dayNum || (c.consultationType && c.consultationType.includes(String(dayNum)));
          return matchesAdm && (matchesRound || (adm.dailyReviews.length === 1 && ipdConsultations.length === 1));
        });

        if (matchedConsult) {
          processedIpdConsultIds.add(String(matchedConsult._id));
        }

        const consultRx = matchedConsult ? rxByConsultId.get(String(matchedConsult._id)) : null;

        let revRx = (rev.prescriptions || []).map(p => ({
          medicineName: p.medicineName || 'Medicine',
          dosage: p.dose || p.dosage || p.frequency || '1-0-1',
          morning: (p.dose && p.dose.split('-')[0]) || '1',
          afternoon: (p.dose && p.dose.split('-')[1]) || '0',
          night: (p.dose && p.dose.split('-')[2]) || '1',
          duration: p.duration || '3 Days',
          instructions: p.instructions || p.foodTiming || 'After Food',
          foodTiming: p.foodTiming || p.instructions || 'After Food',
          quantity: p.quantity !== undefined ? p.quantity : 1,
          notes: p.remarks || p.pharmacyStatus || '—'
        }));

        if (revRx.length === 0 && consultRx?.items && consultRx.items.length > 0) {
          revRx = consultRx.items;
        }

        // Clean, structured clinical notes without artificial pipe dumps
        const findings = (rev.clinicalFindings || '').trim();
        const assessment = (rev.assessment || '').trim();
        let dailyNotes = findings;
        if (assessment && assessment !== findings && assessment !== 'Doctor consultation completed.') {
          dailyNotes = dailyNotes ? `${dailyNotes}\nAssessment: ${assessment}` : assessment;
        }
        if (!dailyNotes && matchedConsult?.clinicalNotes) {
          dailyNotes = matchedConsult.clinicalNotes;
        }
        if (!dailyNotes) {
          dailyNotes = rev.chiefComplaints ? `Inpatient round observation: ${rev.chiefComplaints}` : 'Daily inpatient clinical round completed.';
        }

        const dailyAdvice = (rev.treatmentPlan || rev.instructions || matchedConsult?.advice || '').trim();

        const mergedReviewVitals = {
          ...(adm.vitals || {}),
          ...(matchedConsult?.vitals || {}),
          ...(rev.vitals || {})
        };
        if (mergedReviewVitals.bp && (!mergedReviewVitals.bpSystolic || !mergedReviewVitals.bpDiastolic)) {
          const parts = String(mergedReviewVitals.bp).split('/');
          if (parts.length === 2) {
            if (!mergedReviewVitals.bpSystolic) mergedReviewVitals.bpSystolic = parts[0].trim();
            if (!mergedReviewVitals.bpDiastolic) mergedReviewVitals.bpDiastolic = parts[1].trim();
          }
        }

        ipdDailyConsultations.push({
          _id: matchedConsult?._id || rev._id || `${adm._id}_rev_${dayNum}`,
          consultationId: matchedConsult?._id,
          admissionId: adm.admissionId,
          patientId: targetPatientId,
          doctorId: rev.doctorId || matchedConsult?.doctorId || adm.attendingDoctorId,
          doctorName: revDoctorName || matchedConsult?.doctorName,
          doctorSpecialization: `IPD Daily Consultation (Round ${dayNum})`,
          isIpd: true,
          isIPDDailyReview: true,
          dayNumber: dayNum,
          roundNumber: dayNum,
          wardBed: bedLabel,
          bedLabel,
          diagnosis: rev.diagnosis || matchedConsult?.diagnosis || matchedConsult?.primaryDiagnosis || adm.finalDiagnosis || adm.reasonForAdmission || 'IPD Daily Review',
          primaryDiagnosis: rev.diagnosis || matchedConsult?.primaryDiagnosis || matchedConsult?.diagnosis || adm.finalDiagnosis || adm.reasonForAdmission || 'IPD Daily Review',
          chiefComplaint: rev.chiefComplaints || matchedConsult?.chiefComplaint || adm.reasonForAdmission || `Round ${dayNum} Inpatient Daily Review`,
          clinicalNotes: dailyNotes,
          notes: dailyNotes,
          advice: dailyAdvice,
          vitals: (mergedReviewVitals && Object.values(mergedReviewVitals).some(Boolean)) ? mergedReviewVitals : {},
          status: 'COMPLETED',
          prescriptions: revRx,
          items: revRx,
          investigations: (rev.investigations && rev.investigations.length > 0) ? rev.investigations : (matchedConsult?.investigations || []),
          createdAt: rev.reviewDate || rev.createdAt || matchedConsult?.createdAt || adm.admissionDate || new Date(),
          updatedAt: rev.updatedAt || matchedConsult?.updatedAt || new Date()
        });
      });

      // Map any remaining unmerged IPD consultations for this admission
      ipdConsultations.forEach(c => {
        if (processedIpdConsultIds.has(String(c._id))) return;
        const rawAppt = String(c.appointmentId?._id || c.appointmentId || '');
        const rawAdm = String(c.admissionId?._id || c.admissionId || '');
        if (rawAppt === String(adm._id) || rawAdm === String(adm._id) || rawAdm === String(adm.admissionId)) {
          processedIpdConsultIds.add(String(c._id));
          const dayNum = c.roundNumber || c.dayNumber || 1;
          const consultRx = rxByConsultId.get(String(c._id));
          const rxItems = consultRx?.items || c.prescriptions || [];

          ipdDailyConsultations.push({
            _id: c._id,
            consultationId: c._id,
            admissionId: adm.admissionId,
            patientId: targetPatientId,
            doctorId: c.doctorId || adm.attendingDoctorId,
            doctorName: c.doctorId?.name || doctorName,
            doctorSpecialization: `IPD Daily Consultation (Round ${dayNum})`,
            isIpd: true,
            isIPDDailyReview: true,
            dayNumber: dayNum,
            roundNumber: dayNum,
            wardBed: bedLabel,
            bedLabel,
            diagnosis: c.primaryDiagnosis || c.diagnosis || adm.finalDiagnosis || 'IPD Daily Review',
            primaryDiagnosis: c.primaryDiagnosis || c.diagnosis || adm.finalDiagnosis || 'IPD Daily Review',
            chiefComplaint: c.chiefComplaint || adm.reasonForAdmission || `Round ${dayNum} Inpatient Daily Review`,
            clinicalNotes: c.clinicalNotes || c.notes || 'Inpatient daily round completed.',
            notes: c.clinicalNotes || c.notes || 'Inpatient daily round completed.',
            advice: c.advice || '',
            vitals: c.vitals || adm.vitals || {},
            status: 'COMPLETED',
            prescriptions: rxItems,
            items: rxItems,
            investigations: c.investigations || [],
            createdAt: c.createdAt || adm.admissionDate || new Date(),
            updatedAt: c.updatedAt || new Date()
          });
        }
      });

      // 7b. Map the Inpatient Admission Encounter
      // Admission encounter holds ONLY genuine admission prescriptions, NEVER routine round-by-round prescriptions!
      const diag = adm.finalDiagnosis || adm.reasonForAdmission || patientDoc?.diagnosis || 'Inpatient Admission';
      
      let cleanAdmissionNotes = (adm.admissionNotes || '')
        .replace(/Dr\.\s+Dr\./gi, 'Dr.')
        .trim();
      
      let admissionClinicalNotes = cleanAdmissionNotes;
      if (!admissionClinicalNotes) {
        admissionClinicalNotes = adm.reasonForAdmission
          ? `Admitted for ${adm.reasonForAdmission}.`
          : 'Inpatient admission and continuous clinical observation.';
      }
      if (adm.treatmentSummary && !admissionClinicalNotes.includes(adm.treatmentSummary)) {
        admissionClinicalNotes = `${admissionClinicalNotes}\nTreatment Plan: ${adm.treatmentSummary}`;
      }

      let admissionAdvice = '';
      if (adm.status === 'Discharged') {
        admissionAdvice = adm.dischargeInstructions || (adm.dischargeCondition ? `Discharged in ${adm.dischargeCondition} condition.` : 'Discharged from hospital.');
      } else {
        admissionAdvice = adm.dischargeInstructions || adm.treatmentSummary || '';
      }

      const admissionRx = (adm.admissionPrescriptions || []).map(p => ({
        medicineName: p.medicineName || 'Medicine',
        dosage: p.dose || p.dosage || '1-0-1',
        instructions: p.instructions || p.foodTiming || 'After Food',
        foodTiming: p.foodTiming || p.instructions || 'After Food',
        duration: p.duration || '3 Days',
        quantity: p.quantity !== undefined ? p.quantity : 1,
        notes: p.remarks || '—'
      }));

      // Only push initial admission card if NO daily consultation rounds exist for this admission yet,
      // OR if there are distinct admission prescriptions separate from the daily rounds!
      // This prevents duplicate cards on the same date when daily rounds are conducted.
      const hasDailyRounds = (adm.dailyReviews || []).length > 0 || ipdDailyConsultations.some(c => c.admissionId === adm.admissionId);
      if (!hasDailyRounds || admissionRx.length > 0) {
        ipdVisits.push({
          _id: adm._id,
          admissionId: adm.admissionId,
          patientId: targetPatientId,
          doctorId: adm.attendingDoctorId,
          doctorName,
          doctorSpecialization: 'In-Patient Department (IPD)',
          isIpd: true,
          isIPDAdmission: true,
          wardBed: bedLabel,
          bedLabel,
          admissionType: adm.admissionType || 'Inpatient Admission',
          diagnosis: diag,
          primaryDiagnosis: diag,
          chiefComplaint: adm.reasonForAdmission || 'Inpatient Admission & Care',
          clinicalNotes: admissionClinicalNotes,
          notes: admissionClinicalNotes,
          advice: admissionAdvice,
          vitals: adm.vitals || {},
          status: adm.status === 'Discharged' ? 'COMPLETED' : 'Admitted',
          prescriptions: admissionRx,
          items: admissionRx,
          investigations: adm.investigations || [],
          createdAt: adm.admissionDate || adm.createdAt || new Date(),
          updatedAt: adm.updatedAt || new Date()
        });
      }
    });

    const opdVisits = [...enrichedConsultations, ...unlinkedVisits];
    // Combine IPD daily consultations, IPD admission visits, and OPD visits
    const rawAllVisits = [...ipdDailyConsultations, ...opdVisits, ...ipdVisits];

    // Deduplicate all encounters to guarantee zero duplicate cards
    const seenEncounters = new Set();
    const uniqueVisits = [];

    for (const v of rawAllVisits) {
      if (!v) continue;
      const apptKey = v.appointmentId ? String(v.appointmentId?._id || v.appointmentId) : (!v.isIpd && !v.consultationId ? String(v._id) : null);
      const consultKey = v.consultationId ? String(v.consultationId?._id || v.consultationId) : (!v.isIpd && !v.appointmentId ? String(v._id) : null);
      const recId = String(v._id || '');

      let primaryKey = recId;
      if (v.isIPDDailyReview) {
        primaryKey = `ipd_round_${v.admissionId || ''}_${v.dayNumber || v.roundNumber || 1}`;
      } else if (v.isIPDAdmission || v.isIpd) {
        primaryKey = `ipd_adm_${v.admissionId || recId}`;
      } else if (apptKey) {
        primaryKey = `opd_appt_${apptKey}`;
      } else if (consultKey) {
        primaryKey = `opd_consult_${consultKey}`;
      }

      if (seenEncounters.has(primaryKey)) {
        continue;
      }
      if (v.isIPDDailyReview && seenEncounters.has(`ipd_round_${v.admissionId || ''}_${v.dayNumber || v.roundNumber || 1}`)) {
        continue;
      }
      if (!v.isIPDDailyReview && (v.isIPDAdmission || v.isIpd) && seenEncounters.has(`ipd_adm_${v.admissionId || recId}`)) {
        continue;
      }
      if (apptKey && seenEncounters.has(`opd_appt_${apptKey}`)) {
        continue;
      }
      if (consultKey && seenEncounters.has(`opd_consult_${consultKey}`)) {
        continue;
      }
      if (recId && seenEncounters.has(recId)) {
        continue;
      }

      seenEncounters.add(primaryKey);
      if (recId) seenEncounters.add(recId);
      if (v.isIPDDailyReview) seenEncounters.add(`ipd_round_${v.admissionId || ''}_${v.dayNumber || v.roundNumber || 1}`);
      if (!v.isIPDDailyReview && (v.isIPDAdmission || v.isIpd)) seenEncounters.add(`ipd_adm_${v.admissionId || recId}`);
      if (apptKey) seenEncounters.add(`opd_appt_${apptKey}`);
      if (consultKey) seenEncounters.add(`opd_consult_${consultKey}`);

      uniqueVisits.push(v);
    }

    // 8. Fallback: If no OPD or IPD records exist yet, generate Initial Patient Registration / Clinical Intake card
    if (uniqueVisits.length === 0 && patientDoc) {
      const initialDiagnosis = patientDoc.diagnosis || (patientDoc.allergies && patientDoc.allergies.length > 0 ? `Allergies: ${patientDoc.allergies.join(', ')}` : '') || 'Active Patient Profile';
      const intakeNotes = [
        patientDoc.medicalAlerts ? `Medical Alerts: ${patientDoc.medicalAlerts}` : null,
        patientDoc.allergies && patientDoc.allergies.length > 0 ? `Allergies: ${patientDoc.allergies.join(', ')}` : null,
        `Registration Date: ${new Date(patientDoc.createdAt).toLocaleDateString()}`
      ].filter(Boolean).join(' | ');

      uniqueVisits.push({
        _id: patientDoc._id,
        patientId: targetPatientId,
        doctorId: patientDoc.createdBy,
        doctorName: patientDoc.createdBy?.name || 'Reception & Registration',
        isRegistration: true,
        diagnosis: initialDiagnosis,
        primaryDiagnosis: initialDiagnosis,
        clinicalNotes: intakeNotes || 'Patient registration record created.',
        notes: intakeNotes || 'Patient registration record created.',
        advice: 'Registered patient. Ready for clinical consultation.',
        vitals: {},
        status: 'Active',
        prescriptions: [],
        items: [],
        investigations: [],
        createdAt: patientDoc.createdAt || new Date(),
        updatedAt: patientDoc.updatedAt || new Date()
      });
    }

    uniqueVisits.sort((a, b) => new Date(b.createdAt || b.date || Date.now()) - new Date(a.createdAt || a.date || Date.now()));

    // Categorize
    const completedOrPast = uniqueVisits.filter(c =>
      ['COMPLETED', 'Completed', 'past', 'DISPENSED', 'Discharged'].includes(c.status)
    );
    const activeOrInProgress = uniqueVisits.filter(c =>
      ['active', 'IN_PROGRESS', 'DRAFT', 'In Consultation', 'Admitted', 'Active'].includes(c.status)
    );

    res.status(200).json({
      success: true,
      data: {
        patient: patientDoc,
        appointments,
        snapshots: uniqueVisits, // Ensure visit list has all records
        consultations: uniqueVisits, // Backward-compatible for components looking for consultations
        activeConsultations: activeOrInProgress,
        completedConsultations: completedOrPast,
        history: uniqueVisits,
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
    if (!mongoose.Types.ObjectId.isValid(consultationId)) {
      return res.status(200).json({ success: true, data: null, message: 'Invalid ID format' });
    }

    const hospitalFilter = req.user?.hospitalId ? { hospitalId: req.user.hospitalId } : {};

    // 1. Try finding Consultation by its _id or by appointmentId
    let consultation = await Consultation.findOne({
      $or: [
        { _id: consultationId },
        { appointmentId: consultationId }
      ],
      ...hospitalFilter
    })
      .sort({ createdAt: -1 })
      .populate('patientId')
      .populate({
        path: 'doctorId',
        select: 'name email departmentId doctorProfile employeeCode',
        populate: {
          path: 'departmentId',
          select: 'name code description'
        }
      })
      .populate('appointmentId');

    let appointment = null;
    let patient = null;
    let doctor = null;

    if (consultation) {
      appointment = consultation.appointmentId;
      patient = consultation.patientId;
      doctor = consultation.doctorId;
      if (!appointment || typeof appointment !== 'object' || !appointment._id) {
        appointment = await Appointment.findById(consultation.appointmentId || consultationId).populate('patientId');
      }
    } else {
      // 2. If no Consultation found, check if consultationId is an Appointment ID
      appointment = await Appointment.findOne({
        _id: consultationId,
        ...hospitalFilter
      })
        .populate('patientId')
        .populate({
          path: 'doctorId',
          select: 'name email departmentId doctorProfile employeeCode',
          populate: {
            path: 'departmentId',
            select: 'name code description'
          }
        });

      if (appointment) {
        patient = appointment.patientId;
        doctor = appointment.doctorId;

        // Try finding Consultation linked to this appointment
        consultation = await Consultation.findOne({
          $or: [
            { appointmentId: appointment._id },
            ...(appointment.consultationId ? [{ _id: appointment.consultationId }] : [])
          ],
          ...hospitalFilter
        })
          .sort({ createdAt: -1 })
          .populate('patientId')
          .populate({
            path: 'doctorId',
            select: 'name email departmentId doctorProfile employeeCode',
            populate: {
              path: 'departmentId',
              select: 'name code description'
            }
          });
      }
    }

    if (!consultation && patient) {
      // If no direct Consultation found for this specific follow-up token,
      // query the patient's latest Consultation record to fetch clinical diagnoses, advice & notes
      const pId = patient._id || patient;
      const priorConsultation = await Consultation.findOne({
        patientId: pId,
        ...hospitalFilter
      })
        .sort({ createdAt: -1 })
        .populate('patientId')
        .populate({
          path: 'doctorId',
          select: 'name email departmentId doctorProfile employeeCode',
          populate: {
            path: 'departmentId',
            select: 'name code description'
          }
        });

      if (priorConsultation) {
        consultation = priorConsultation;
        if (!doctor && priorConsultation.doctorId) {
          doctor = priorConsultation.doctorId;
        }
      }
    }

    if (!consultation && !appointment) {
      return res.status(200).json({ success: true, data: null, message: 'Consultation record not found' });
    }

    const consultObj = consultation ? consultation.toObject() : {};
    const appObj = appointment ? (appointment.toObject ? appointment.toObject() : appointment) : {};
    const patObj = patient ? (patient.toObject ? patient.toObject() : patient) : {};
    const docObj = doctor ? (doctor.toObject ? doctor.toObject() : doctor) : {};

    // Detect if this snapshot belongs to a follow-up visit
    const isFollowUp = 
      appObj.consultationType === 'Follow-Up' ||
      appointment?.consultationType === 'Follow-Up' ||
      Boolean(appObj.isFollowUp) ||
      Boolean(appointment?.isFollowUp) ||
      Boolean(consultObj.followupRequired) ||
      Boolean(consultObj.isFollowUp) ||
      String(appObj.type || '').toLowerCase().includes('follow') ||
      String(appObj.appointmentType || '').toLowerCase().includes('follow') ||
      String(consultObj.consultationType || '').toLowerCase().includes('follow');

    // 3. Resolve Prescription Items
    let prescriptions = consultObj.prescriptions || [];
    if (!prescriptions || prescriptions.length === 0) {
      const rxDocs = await Prescription.find({
        $or: [
          ...(consultation ? [{ consultationId: consultation._id }] : []),
          ...(appObj._id ? [{ consultationId: appObj._id }, { appointmentId: appObj._id }] : []),
          ...(patObj._id ? [{ patientId: patObj._id }] : [])
        ],
        ...hospitalFilter
      }).sort({ createdAt: -1 });

      const targetRx = rxDocs.find(rx => consultation && String(rx.consultationId) === String(consultation._id)) ||
                       rxDocs.find(rx => appObj._id && (String(rx.appointmentId) === String(appObj._id) || String(rx.consultationId) === String(appObj._id))) ||
                       rxDocs[0];

      const allRxItems = targetRx ? (targetRx.items || []) : (rxDocs.length > 0 ? rxDocs[0].items || [] : []);
      if (allRxItems.length > 0) {
        prescriptions = allRxItems.map(item => {
          const rawDose = item.dosage || item.dose || '';
          const parts = rawDose.includes('-') ? rawDose.split('-') : ['', '', ''];
          return {
            _id: item._id,
            medicineId: item.medicineId,
            medicineName: item.medicineName || item.name || '',
            morning: item.morning !== undefined && item.morning !== null ? String(item.morning) : (parts[0] || ''),
            afternoon: item.afternoon !== undefined && item.afternoon !== null ? String(item.afternoon) : (parts[1] || ''),
            night: item.night !== undefined && item.night !== null ? String(item.night) : (parts[2] || ''),
            dosage: item.dosage || (item.morning || item.afternoon || item.night ? `${item.morning || '0'}-${item.afternoon || '0'}-${item.night || '0'}` : ''),
            frequency: item.frequency || '',
            duration: item.duration || '',
            dose: item.dosage || `${item.morning || '1'}-${item.afternoon || '0'}-${item.night || '1'}`,
            timing: item.instructions || item.foodTiming || item.food || '',
            food: item.food || item.foodTiming || item.instructions || item.timing || '',
            foodTiming: item.foodTiming || item.instructions || item.food || item.timing || '',
            quantity: item.quantity || 1,
            remarks: item.notes || item.remarks || ''
          };
        });
      }
    } else {
      prescriptions = prescriptions.map(item => {
        const rawDose = item.dosage || item.dose || '';
        const parts = rawDose.includes('-') ? rawDose.split('-') : ['', '', ''];
        return {
          _id: item._id,
          medicineId: item.medicineId,
          medicineName: item.medicineName || item.name || '',
          morning: item.morning !== undefined && item.morning !== null ? String(item.morning) : (parts[0] || ''),
          afternoon: item.afternoon !== undefined && item.afternoon !== null ? String(item.afternoon) : (parts[1] || ''),
          night: item.night !== undefined && item.night !== null ? String(item.night) : (parts[2] || ''),
          dosage: item.dosage || item.dose || '',
          frequency: item.frequency || '',
          duration: item.duration || '',
          dose: item.dosage || item.dose || '',
          timing: item.timing || item.instructions || item.foodTiming || item.food || '',
          food: item.food || item.foodTiming || item.instructions || item.timing || '',
          foodTiming: item.foodTiming || item.instructions || item.food || item.timing || '',
          quantity: item.quantity || 1,
          remarks: item.remarks || item.notes || ''
        };
      });
    }

    // 4. Resolve Vitals (merge consultation and appointment vitals)
    const cVitals = consultObj.vitals || {};
    const aVitals = appObj.vitals || {};
    const vitals = {
      bpSystolic: cVitals.bpSystolic || aVitals.bpSystolic || null,
      bpDiastolic: cVitals.bpDiastolic || aVitals.bpDiastolic || null,
      pulse: cVitals.pulse || aVitals.pulse || null,
      temperature: cVitals.temperature || aVitals.temperature || null,
      spo2: cVitals.spo2 || aVitals.spo2 || null,
      weight: cVitals.weight || aVitals.weight || null,
      height: cVitals.height || aVitals.height || null,
      bloodSugar: cVitals.bloodSugar || aVitals.bloodSugar || null,
      bmi: cVitals.bmi || aVitals.bmi || null
    };

    // 5. Resolve Investigations
    const rawInv = (consultObj.investigations && consultObj.investigations.length > 0)
      ? consultObj.investigations
      : (appObj.investigations || []);

    const investigations = rawInv.map(inv => ({
      _id: inv._id,
      serviceId: inv.serviceId,
      serviceType: inv.serviceType || 'Laboratory',
      name: inv.name || inv.investigationName || '',
      code: inv.code || inv.serviceCode || '',
      price: typeof inv.price === 'number' ? inv.price : (parseFloat(inv.price) || 0),
      category: inv.category || '',
      notes: inv.notes || ''
    }));

    // 6. Resolve Billing / Invoice
    let invoice = null;
    if (appObj._id) {
      // Prioritize the paid consultation invoice, or the primary appointment invoice
      invoice = await Invoice.findOne({
        appointmentId: appObj._id,
        paymentStatus: 'Paid',
        ...hospitalFilter
      }).sort({ createdAt: 1 });

      if (!invoice) {
        invoice = await Invoice.findOne({
          appointmentId: appObj._id,
          ...hospitalFilter
        }).sort({ createdAt: 1 });
      }
      if (!invoice && patObj._id) {
        invoice = await Invoice.findOne({
          patientId: patObj._id,
          ...hospitalFilter
        }).sort({ createdAt: -1 });
      }
    }

    let consultationFee = null;
    let investigationCharges = 0;
    let discount = 0;

    const isPaid = appObj.billingStatus === 'Paid' ||
                   appObj.paymentStatus === 'Paid' ||
                   appObj.workflow?.paymentState === 'PAID' ||
                   invoice?.paymentStatus === 'Paid';
    let paymentStatus = isPaid ? 'Paid' : (invoice?.paymentStatus || appObj.billingStatus || 'Unpaid');
    let paymentDate = null;

    if (investigations.length > 0) {
      investigationCharges = investigations.reduce((sum, inv) => sum + (Number(inv.price) || 0), 0);
    }

    if (invoice) {
      discount = invoice.discount || 0;
      if (invoice.paymentStatus === 'Paid') {
        paymentDate = invoice.updatedAt || invoice.createdAt;
      }

      const consultItem = (invoice.items || []).find(it => /consultation/i.test(it.name));
      if (consultItem) {
        consultationFee = consultItem.amount || (consultItem.quantity * consultItem.unitPrice);
      }
    }

    if (consultationFee === null) {
      consultationFee = appObj.consultationFee !== undefined && !isNaN(Number(appObj.consultationFee))
        ? Number(appObj.consultationFee)
        : 500;
    }

    let additionalCharges = 0;
    if (appObj.additionalCharges !== undefined && !isNaN(Number(appObj.additionalCharges))) {
      additionalCharges = Number(appObj.additionalCharges);
    } else if (invoice && invoice.items) {
      const addItems = invoice.items.filter(it => it.isAdditionalCharge || it.name === 'Additional Charges');
      additionalCharges = addItems.reduce((s, it) => s + (Number(it.amount) || (Number(it.unitPrice) * (Number(it.quantity) || 1)) || 0), 0);
    }

    // Exact mathematical formula for Consultation Record:
    // Total Payable = Consultation Fee + Investigation Charges + Additional Charges - Discount
    const totalPayable = Math.max(0, (consultationFee || 0) + (investigationCharges || 0) + (additionalCharges || 0) - (discount || 0));

    if (!paymentDate && isPaid) {
      paymentDate = appObj.workflow?.timestamps?.paymentCompletedAt || appObj.updatedAt || appObj.date;
    }

    const billing = {
      consultationFee,
      investigationCharges,
      additionalCharges,
      additionalChargeItems: appObj.additionalChargeItems || [],
      discount,
      tax: invoice?.tax || 0,
      totalAmount: invoice?.totalAmount || ((consultationFee || 0) + (investigationCharges || 0) + (additionalCharges || 0)),
      grandTotal: invoice?.grandTotal || totalPayable,
      totalPayable,
      paymentMode: invoice?.paymentMode && invoice.paymentMode !== 'N/A' ? invoice.paymentMode : (appObj.paymentMethod || 'Cash'),
      paymentStatus: paymentStatus === 'Paid' ? 'Paid' : (paymentStatus || 'Unpaid'),
      paymentDate: paymentDate ? new Date(paymentDate).toISOString().split('T')[0] : null,
      invoiceNo: invoice?.invoiceNo || null,
      items: (invoice?.items || []).map(it => ({
        name: it.name,
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || it.amount || 0,
        amount: it.amount || ((it.quantity || 1) * (it.unitPrice || it.amount || 0))
      }))
    };

    const departmentName = docObj.departmentId?.name || docObj.doctorProfile?.specialization || 'General Medicine';

    let hospitalMode = 'FULL_DIGITAL';
    try {
      const hId = req.user?.hospitalId?._id || req.user?.hospitalId || req.hospital?._id || appObj.hospitalId?._id || appObj.hospitalId;
      if (hId) {
        const hosp = await Hospital.findById(hId).select('opdOperationMode planName subscriptionPlan').lean();
        if (hosp) {
          hospitalMode = hosp.opdOperationMode || (hosp.planName?.includes('Plan 1') ? 'TOKEN_ONLY' : 'FULL_DIGITAL');
        }
      }
      if (hospitalMode === 'FULL_DIGITAL' && (appObj.opdOperationMode === 'TOKEN_ONLY' || appObj.hospitalId?.opdOperationMode === 'TOKEN_ONLY')) {
        hospitalMode = 'TOKEN_ONLY';
      }
    } catch (e) {}

    // Follow-up patients are clinical reviews and must never be forced into TOKEN_ONLY / Plan 1 paper mode
    if (isFollowUp) {
      hospitalMode = 'FULL_DIGITAL';
    }

    // Build structured output preserving backward compatibility for DoctorConsultation
    const fullResponse = {
      ...consultObj,
      appointmentId: appObj,
      patientId: patObj,
      doctorId: {
        ...docObj,
        departmentName
      },
      vitals,
      prescriptions,
      investigations,
      billing,
      // Section 1
      patientName: patObj.name || null,
      uhid: patObj.uhid || null,
      age: patObj.age || null,
      gender: patObj.gender || null,
      mobile: patObj.mobileNumber || patObj.phone || patObj.contactNumber || null,
      address: patObj.address || null,
      bloodGroup: patObj.bloodGroup || null,
      consultationType: isFollowUp ? 'Follow-Up' : (appObj.consultationType || 'Walk-In'),
      isFollowUp: Boolean(isFollowUp),
      hospitalMode: isFollowUp ? 'FULL_DIGITAL' : hospitalMode,
      tokenNumber: appObj.tokenNumber || null,
      consultationDate: appObj.date || consultObj.createdAt || null,
      doctorName: docObj.name ? (docObj.name.startsWith('Dr.') ? docObj.name : `Dr. ${docObj.name}`) : null,
      department: departmentName,
      consultationStatus: consultObj.status === 'past' || consultObj.status === 'Completed' || appObj.status === 'Completed' ? 'Completed' : (appObj.status || 'Completed'),
      // Section 3
      chiefComplaint: consultObj.chiefComplaint || appObj.chiefComplaint || consultObj.symptoms || (isFollowUp ? 'Follow-Up Review' : null),
      primaryDiagnosis: consultObj.primaryDiagnosis || appObj.diagnosis || consultObj.diagnosis || null,
      diagnoses: (consultObj.diagnoses && Array.isArray(consultObj.diagnoses) && consultObj.diagnoses.length > 0)
        ? consultObj.diagnoses
        : (appObj.diagnoses && Array.isArray(appObj.diagnoses) && appObj.diagnoses.length > 0
            ? appObj.diagnoses
            : (consultObj.primaryDiagnosis ? [consultObj.primaryDiagnosis] : (consultObj.diagnosis ? [consultObj.diagnosis] : []))),
      diagnosis: consultObj.primaryDiagnosis || (Array.isArray(consultObj.diagnoses) && consultObj.diagnoses.length > 0 ? consultObj.diagnoses.join(', ') : consultObj.diagnosis) || (isFollowUp ? 'Follow-Up Review & Consultation' : (appObj.chiefComplaint ? `OPD: ${appObj.chiefComplaint}` : 'Clinical Consultation')),
      advice: consultObj.advice || consultObj.clinicalNotes || consultObj.generalInstructions || appObj.advice || appObj.notes || (isFollowUp ? 'Continue prescribed regimen. Review on next scheduled date.' : null),
      doctorAdvice: consultObj.advice || consultObj.clinicalNotes || appObj.advice || '',
      clinicalNotes: consultObj.clinicalNotes || consultObj.assessmentNotes || appObj.notes || null,
      followupDate: consultObj.followupDate || null,
      followupRequired: consultObj.followupRequired !== undefined ? consultObj.followupRequired : Boolean(consultObj.followupDate),
      followupReason: consultObj.followupReason || '',
      allergies: patObj.allergies || appObj.allergies || consultObj.allergies || []
    };

    res.status(200).json({ success: true, data: fullResponse });
  } catch (error) {
    next(error);
  }
};

const getConsultations = async (req, res, next) => {
  try {
    const hospitalFilter = req.user?.hospitalId ? { hospitalId: req.user.hospitalId } : {};
    let query = { ...hospitalFilter };

    const { doctorId, patientId, followup, limit } = req.query;

    const userRole = (req.user?.roleId?.name || req.user?.role || '').toUpperCase();
    const isPureDoctor = userRole === 'DOCTOR';
    const isDoctorAdmin = userRole === 'DOCTOR_ADMIN';
    const isDoctorWorkspace = req.query.scope === 'my_desk' || 
                              req.headers['x-workspace-mode'] === 'clinical_consultation' || 
                              req.headers['referer']?.includes('/doctor/') ||
                              Boolean(doctorId);
    const isReception = ['RECEPTIONIST', 'RECEPTION'].includes(userRole) || 
                        req.headers['referer']?.includes('/reception/');

    const mongoose = require('mongoose');
    if (doctorId && doctorId !== 'all') {
      const docObjId = mongoose.Types.ObjectId.isValid(doctorId) ? new mongoose.Types.ObjectId(doctorId) : doctorId;
      query.doctorId = docObjId;
    } else if (!isReception && (isPureDoctor || (isDoctorAdmin && isDoctorWorkspace))) {
      query.doctorId = req.user._id;
    }

    if (patientId) {
      query.patientId = patientId;
    }

    if (followup === 'true') {
      query.$or = [
        { followupRequired: true },
        { followupDate: { $exists: true, $ne: null } }
      ];
    }

    const maxLimit = parseInt(limit, 10) || 200;

    // 1. Fetch consultations matching query
    const rawConsultations = await Consultation.find(query)
      .populate('patientId', 'name uhid age gender mobileNumber alternativeMobile bloodGroup allergies medicalAlerts address addresses contacts guardianName emergencyContact isProfileCompleted dob aadhaarNumber occupation maritalStatus lastVisitDate')
      .populate('doctorId', 'name email doctorProfile employeeCode')
      .populate('appointmentId')
      .sort({ followupDate: 1, createdAt: -1 })
      .limit(maxLimit)
      .lean();

    // Enrich consultations to ensure exact date, time, and true follow-up status are resolved
    const getLocalDateString = (val) => {
      const d = parseDateRobust(val);
      if (!d) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = getLocalDateString(today);

    const consultations = await Promise.all(rawConsultations.map(async (c) => {
      let resolvedTime = c.followupTime || c.appointmentId?.time || c.appointmentId?.slotTime || '';
      let matchedAppt = null;

      if (c.patientId?._id && c.followupDate) {
        try {
          const dObj = new Date(c.followupDate);
          if (!isNaN(dObj.getTime())) {
            const startOfDay = new Date(dObj.getFullYear(), dObj.getMonth(), dObj.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(dObj.getFullYear(), dObj.getMonth(), dObj.getDate(), 23, 59, 59, 999);

            matchedAppt = await Appointment.findOne({
              ...hospitalFilter,
              patientId: c.patientId._id,
              date: { $gte: startOfDay, $lte: endOfDay }
            }).select('time slotTime status').lean();

            if (matchedAppt && !resolvedTime) {
              resolvedTime = matchedAppt.time || matchedAppt.slotTime || '';
            }
          }
        } catch (e) {}
      }

      if (!resolvedTime) {
        resolvedTime = '10:00 AM';
      }

      // Check if this follow-up has actually been completed by a subsequent consultation on or after the follow-up date
      const fDate = c.followupDate ? parseDateRobust(c.followupDate) : (c.appointmentId?.date ? parseDateRobust(c.appointmentId.date) : null);
      if (fDate) fDate.setHours(0, 0, 0, 0);
      const fDateStr = getLocalDateString(c.followupDate || c.appointmentId?.date);

      const isMatchedApptCompleted = matchedAppt && (
        matchedAppt.status === 'Completed' ||
        matchedAppt.status === 'Consulted' ||
        matchedAppt.status === 'Sent to Pharmacy' ||
        matchedAppt.status === 'Sent To Pharmacy' ||
        matchedAppt.queueStatus === 'Completed' ||
        matchedAppt.queueStatus === 'Sent to Pharmacy' ||
        matchedAppt.workflow?.consultationState === 'COMPLETED' ||
        matchedAppt.workflow?.queueState === 'SENT_TO_PHARMACY' ||
        matchedAppt.workflow?.queueState === 'COMPLETED'
      );

      // A follow-up is completed ONLY IF:
      // 1. Explicitly marked completed on the consultation itself (c.followupCompleted or c.followupStatus === 'Completed')
      // 2. OR the matched follow-up appointment on that follow-up date was actually completed (isMatchedApptCompleted)
      // NOTE: c.appointmentId is the PREVIOUS visit that prescribed the follow-up, so it must NEVER mark the future follow-up as completed!
      let isFollowupCompleted = Boolean(c.followupCompleted || c.followupStatus === 'Completed' || isMatchedApptCompleted);

      // If the follow-up date is in the future and there is a matched scheduled appointment, it's definitely Scheduled (NOT completed!)
      if (fDateStr && fDateStr > todayStr && matchedAppt && (matchedAppt.status === 'Scheduled' || matchedAppt.queueStatus === 'Scheduled')) {
        isFollowupCompleted = false;
      } else if (!isFollowupCompleted && c.patientId?._id && fDate) {
        // Subsequent consultation or completed appointment only fulfills the follow-up if it occurred ON OR AFTER the follow-up date!
        const subsequentConsultation = await Consultation.findOne({
          ...hospitalFilter,
          patientId: c.patientId._id,
          _id: { $ne: c._id },
          createdAt: { $gte: fDate }
        }).select('_id createdAt date status').lean();

        if (subsequentConsultation) {
          isFollowupCompleted = true;
        } else {
          const completedAppt = await Appointment.findOne({
            ...hospitalFilter,
            patientId: c.patientId._id,
            status: { $in: ['Completed', 'Consulted', 'Sent to Pharmacy', 'Sent To Pharmacy'] },
            date: { $gte: fDate }
          }).select('_id').lean();

          if (completedAppt) {
            isFollowupCompleted = true;
          }
        }
      }

      // Check if the patient has an active appointment in consultation today ONLY if not completed
      let activeInConsultAppt = null;
      if (!isFollowupCompleted && c.patientId?._id) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        activeInConsultAppt = await Appointment.findOne({
          ...hospitalFilter,
          patientId: c.patientId._id,
          date: { $gte: startOfToday, $lte: endOfToday },
          status: { $nin: ['Completed', 'Consulted', 'Sent to Pharmacy', 'Sent To Pharmacy', 'Cancelled'] },
          'workflow.consultationState': { $ne: 'COMPLETED' },
          $or: [
            { status: { $in: ['In Consultation', 'In-Consultation', 'In Progress'] } },
            { queueStatus: { $in: ['In Consultation', 'In-Consultation', 'In Progress'] } },
            { 'workflow.consultationState': 'STARTED' },
            { 'workflow.queueState': 'IN_CONSULTATION' }
          ]
        }).select('_id date time slotTime status queueStatus workflow').lean();
      }

      let computedStatus = 'Scheduled';
      if (isFollowupCompleted) {
        computedStatus = 'Completed';
      } else if (activeInConsultAppt) {
        computedStatus = 'In Consultation';
      } else if (fDateStr && fDateStr > todayStr) {
        computedStatus = 'Scheduled';
      } else if (fDateStr && fDateStr === todayStr) {
        computedStatus = 'Scheduled';
      } else if (fDateStr && fDateStr < todayStr) {
        computedStatus = 'Missed';
      }

      return {
        ...c,
        tokenNumber: matchedAppt?.tokenNumber || c.tokenNumber || c.appointmentId?.tokenNumber,
        followupDate: activeInConsultAppt ? (c.followupDate || new Date()) : (c.followupDate || c.appointmentId?.date),
        date: activeInConsultAppt ? (c.followupDate || new Date()) : (c.followupDate || c.appointmentId?.date),
        followupTime: resolvedTime,
        time: resolvedTime,
        slotTime: resolvedTime,
        followupStatus: computedStatus,
        status: computedStatus,
        isInConsultation: computedStatus === 'In Consultation',
        activeAppointmentId: activeInConsultAppt?._id || matchedAppt?._id || c.appointmentId?._id || c.appointmentId
      };
    }));

    // 2. If followup=true, also include any booked follow-up or scheduled appointments that don't already have a linked consultation
    if (followup === 'true') {
      let apptQuery = {
        ...hospitalFilter,
        $or: [
          { type: { $regex: /^follow-?up$/i } },
          { consultationType: { $regex: /^(follow-?up|appointment)$/i } },
          { isFollowup: true },
          { status: { $in: ['Scheduled', 'In Consultation', 'In-Consultation', 'In Progress'] } },
          { queueStatus: { $in: ['Scheduled', 'In Consultation', 'In-Consultation', 'In Progress'] } },
          { 'workflow.consultationState': 'STARTED' },
          { 'workflow.queueState': 'IN_CONSULTATION' },
          { isFutureBooking: true }
        ]
      };
      if (query.doctorId) {
        apptQuery.doctorId = { $in: [query.doctorId, String(query.doctorId)] };
      }

      const existingApptIds = new Set(
        consultations
          .map(c => c.appointmentId?._id ? String(c.appointmentId._id) : (c.appointmentId ? String(c.appointmentId) : null))
          .filter(Boolean)
      );

      // Deduplicate by patient ID and date to avoid duplicating follow-ups that already have a consultation record
      const existingPatientDates = new Set(
        consultations
          .filter(c => c.patientId?._id && (c.followupDate || c.date))
          .map(c => {
            const pId = String(c.patientId._id || c.patientId);
            const dStr = getLocalDateString(c.followupDate || c.date);
            return `${pId}_${dStr}`;
          })
      );

      const appointments = await Appointment.find(apptQuery)
        .populate('patientId', 'name uhid age gender mobileNumber alternativeMobile bloodGroup allergies medicalAlerts address addresses contacts guardianName emergencyContact isProfileCompleted dob aadhaarNumber occupation maritalStatus lastVisitDate')
        .populate('doctorId', 'name email doctorProfile employeeCode')
        .sort({ date: 1, createdAt: -1 })
        .limit(maxLimit)
        .lean();

      const additionalFollowups = appointments
        .filter(app => {
          if (existingApptIds.has(String(app._id))) return false;
          if (app.patientId?._id && app.date) {
            const pId = String(app.patientId._id || app.patientId);
            const dStr = getLocalDateString(app.date);
            if (existingPatientDates.has(`${pId}_${dStr}`)) return false;
          }
          return true;
        })
        .map(app => {
          const resolvedTime = app.slotTime || app.time || '10:00 AM';
          const appDateStr = getLocalDateString(app.date);

          let appStatus = app.status || 'Scheduled';
          const stLower = appStatus.toLowerCase();

          const isCompletedAppt =
            stLower === 'completed' ||
            stLower === 'consulted' ||
            stLower === 'sent to pharmacy' ||
            stLower === 'sent_to_pharmacy' ||
            app.queueStatus === 'Completed' ||
            app.queueStatus === 'Sent to Pharmacy' ||
            app.workflow?.consultationState === 'COMPLETED' ||
            app.workflow?.queueState === 'COMPLETED' ||
            app.workflow?.queueState === 'SENT_TO_PHARMACY' ||
            app.pharmacyStatus === 'SENT' ||
            app.pharmacyStatus === 'DISPENSED' ||
            Boolean(app.sentToPharmacyAt) ||
            Boolean(app.completedByDoctorId);

          const isAppInConsult = !isCompletedAppt && (
            app.status === 'In Consultation' ||
            app.status === 'In-Consultation' ||
            app.status === 'In Progress' ||
            app.queueStatus === 'In-Consultation' ||
            app.queueStatus === 'In Consultation' ||
            app.queueStatus === 'In Progress' ||
            app.workflow?.queueState === 'IN_CONSULTATION' ||
            app.workflow?.consultationState === 'STARTED'
          );

          if (isCompletedAppt) {
            appStatus = 'Completed';
          } else if (isAppInConsult) {
            appStatus = 'In Consultation';
          } else if (stLower === 'cancelled') {
            appStatus = 'Cancelled';
          } else if (appDateStr > todayStr) {
            appStatus = 'Scheduled';
          } else if (appDateStr === todayStr) {
            appStatus = 'Scheduled';
          } else if (appDateStr < todayStr) {
            appStatus = 'Missed';
          }

          return {
            _id: app._id,
            appointmentId: app,
            patientId: app.patientId,
            doctorId: app.doctorId,
            tokenNumber: app.tokenNumber || '',
            consultationType: app.consultationType || 'Appointment',
            bookingSource: app.bookingSource || 'RECEPTION',
            isFutureBooking: Boolean(app.isFutureBooking || (appDateStr > todayStr)),
            appointmentSlot: app.appointmentSlot || null,
            diagnosis: app.diagnosis || 'Follow-up Appointment',
            clinicalNotes: app.reason || app.notes || '',
            followupDate: app.date,
            date: app.date,
            followupTime: resolvedTime,
            time: resolvedTime,
            slotTime: resolvedTime,
            followupReason: app.reason || 'Scheduled Follow-up',
            followupPriority: app.priority || 'Routine',
            followupStatus: appStatus,
            status: appStatus,
            isInConsultation: isAppInConsult,
            activeAppointmentId: app._id,
            createdAt: app.createdAt
          };
        });

      const combined = [...consultations, ...additionalFollowups];
      combined.sort((a, b) => {
        const dateA = new Date(a.followupDate || a.date || 0);
        const dateB = new Date(b.followupDate || b.date || 0);
        return dateB - dateA;
      });
      return res.status(200).json({
        success: true,
        count: combined.length,
        data: combined
      });
    }

    return res.status(200).json({
      success: true,
      count: consultations.length,
      data: consultations
    });
  } catch (error) {
    console.error('[getConsultations] Error:', error);
    next(error);
  }
};

const startFollowupConsultation = async (req, res, next) => {
  try {
    const { consultationId, patientId, isEmergency } = req.body;
    const isValidHexObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

    const validHospitalId = (req.user?.hospitalId && isValidHexObjectId(String(req.user.hospitalId))) ? req.user.hospitalId : undefined;
    const validBranchId = (req.user?.branchId && isValidHexObjectId(String(req.user.branchId))) ? req.user.branchId : undefined;

    const hospitalFilter = {
      ...(validHospitalId ? { hospitalId: validHospitalId } : {}),
      ...(validBranchId ? { branchId: validBranchId } : {})
    };

    let prevConsultation = null;
    if (consultationId && isValidHexObjectId(String(consultationId))) {
      prevConsultation = await Consultation.findById(consultationId);
    }

    const resolvedPatientId = patientId || prevConsultation?.patientId;
    if (!resolvedPatientId) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const nowTime = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let targetAppointment = null;

    // 1. Check if followUpAppointmentId is already linked
    if (prevConsultation?.followUpAppointmentId) {
      targetAppointment = await Appointment.findById(prevConsultation.followUpAppointmentId);
    }

    // 2. Check if an appointment was passed as consultationId
    if (!targetAppointment && consultationId && isValidHexObjectId(String(consultationId))) {
      targetAppointment = await Appointment.findById(consultationId);
    }

    // 3. Search for any future Scheduled appointment for this patient
    if (!targetAppointment) {
      targetAppointment = await Appointment.findOne({
        ...hospitalFilter,
        patientId: resolvedPatientId,
        status: { $in: ['Scheduled', 'Waiting', 'Confirmed'] }
      }).sort({ date: 1 });
    }

    if (targetAppointment) {
      // If the target appointment is an already completed visit, do NOT reuse it as the active prescription visit!
      if (targetAppointment.status === 'Completed' || targetAppointment.queueStatus === 'Completed') {
        targetAppointment = null; // Create a fresh visit below
      }
    }

    if (targetAppointment) {
      targetAppointment.date = new Date();
      targetAppointment.time = nowTime;
      targetAppointment.slotTime = nowTime;
      targetAppointment.status = 'In Consultation';
      targetAppointment.queueStatus = 'In-Consultation';
      if (isEmergency) targetAppointment.isEmergency = true;
      if (req.user?._id) targetAppointment.doctorId = req.user._id;
      const sOfToday = new Date(); sOfToday.setHours(0, 0, 0, 0);
      const eOfToday = new Date(); eOfToday.setHours(23, 59, 59, 999);
      const collidingAppt = targetAppointment.tokenNumber ? await Appointment.findOne({
        ...hospitalFilter,
        _id: { $ne: targetAppointment._id },
        $or: [
          { date: { $gte: sOfToday, $lte: eOfToday } },
          { consultationDate: { $gte: sOfToday, $lte: eOfToday } }
        ],
        tokenNumber: targetAppointment.tokenNumber
      }).select('_id').lean() : null;

      if (!targetAppointment.tokenNumber || collidingAppt) {
        targetAppointment.tokenNumber = await generateUniqueDailyToken({
          targetDate: new Date(),
          branchId: req.user?.branchId,
          hospitalId: req.user?.hospitalId,
          isEmergency,
          excludeApptId: targetAppointment._id
        });
      }
      if (targetAppointment.workflow) {
        targetAppointment.workflow.queueState = 'IN_CONSULTATION';
      }
      targetAppointment.updatedBy = req.user._id;
      await targetAppointment.save();

      if (prevConsultation && !prevConsultation.followUpAppointmentId) {
        prevConsultation.followUpAppointmentId = targetAppointment._id;
        await prevConsultation.save();
      }

      try {
        const populatedAppt = await Appointment.findById(targetAppointment._id)
          .populate('patientId', 'name uhid age gender mobileNumber')
          .populate('doctorId', 'name roomNo doctorProfile');

        const WorkflowEventHub = require('../services/WorkflowEventHub');
        const fHospId = targetAppointment.hospitalId || req.user?.hospitalId || req.hospitalId;
        const followUpCallData = {
          appointmentId: populatedAppt._id,
          _id: populatedAppt._id,
          tokenNumber: populatedAppt.tokenNumber,
          tokenNo: populatedAppt.tokenNumber,
          queueState: 'IN_CONSULTATION',
          patientId: populatedAppt.patientId?._id || populatedAppt.patientId,
          doctorId: populatedAppt.doctorId?._id || populatedAppt.doctorId,
          patientName: populatedAppt.patientId?.name || '',
          doctorName: populatedAppt.doctorId?.name || '',
          roomNo: populatedAppt.doctorId?.roomNo || populatedAppt.doctorId?.doctorProfile?.roomNo || 'Room 1',
          hospitalId: fHospId ? String(fHospId) : undefined,
          type: 'TriggerVoiceCall'
        };
        WorkflowEventHub.publish('TriggerVoiceCall', followUpCallData);
      } catch (e) {
        console.warn('Failed to broadcast follow-up voice call event:', e?.message);
      }

      return res.json({
        success: true,
        appointmentId: targetAppointment._id,
        appointment: targetAppointment,
        message: 'Follow-up consultation activated for today'
      });
    }

    // 4. Create fresh follow-up appointment for today
    const tokenNumber = await generateUniqueDailyToken({
      targetDate: new Date(),
      branchId: req.user?.branchId,
      hospitalId: req.user?.hospitalId,
      isEmergency
    });

    const [createdAppt] = await Appointment.create([{
      patientId: resolvedPatientId,
      doctorId: req.user?._id || prevConsultation?.doctorId,
      date: new Date(),
      time: nowTime,
      slotTime: nowTime,
      tokenNumber,
      consultationType: 'Follow-Up',
      status: 'In Consultation',
      queueStatus: 'In-Consultation',
      isEmergency: Boolean(isEmergency),
      workflow: {
        queueState: 'IN_CONSULTATION'
      },
      bookingSource: 'DOCTOR',
      billingStatus: 'Unpaid',
      hospitalId: validHospitalId,
      branchId: validBranchId,
      createdBy: req.user._id,
      updatedBy: req.user._id
    }]);

    if (prevConsultation) {
      prevConsultation.followUpAppointmentId = createdAppt._id;
      await prevConsultation.save();
    }

    try {
      const populatedAppt = await Appointment.findById(createdAppt._id)
        .populate('patientId', 'name uhid age gender mobileNumber')
        .populate('doctorId', 'name roomNo doctorProfile');

      const WorkflowEventHub = require('../services/WorkflowEventHub');
      const fHospId2 = createdAppt.hospitalId || req.user?.hospitalId || req.hospitalId;
      const followUpCallData = {
        appointmentId: populatedAppt._id,
        _id: populatedAppt._id,
        tokenNumber: populatedAppt.tokenNumber,
        tokenNo: populatedAppt.tokenNumber,
        queueState: 'IN_CONSULTATION',
        patientId: populatedAppt.patientId?._id || populatedAppt.patientId,
        doctorId: populatedAppt.doctorId?._id || populatedAppt.doctorId,
        patientName: populatedAppt.patientId?.name || '',
        doctorName: populatedAppt.doctorId?.name || '',
        roomNo: populatedAppt.doctorId?.roomNo || populatedAppt.doctorId?.doctorProfile?.roomNo || 'Room 1',
        hospitalId: fHospId2 ? String(fHospId2) : undefined,
        type: 'TriggerVoiceCall'
      };
      WorkflowEventHub.publish('TriggerVoiceCall', followUpCallData);
    } catch (e) {
      console.warn('Failed to broadcast follow-up voice call event:', e?.message);
    }

    return res.json({
      success: true,
      appointmentId: createdAppt._id,
      appointment: createdAppt,
      message: 'New follow-up consultation created and started for today'
    });
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

const DEFAULT_MEDICINES = [
  { name: 'Paracetamol 650mg', category: 'Analgesics', unitPrice: 2.50, stock: 150, rackNo: 'A-01' },
  { name: 'Amoxicillin 500mg', category: 'Antibiotics', unitPrice: 8.00, stock: 120, rackNo: 'A-02' },
  { name: 'Azithromycin 500mg', category: 'Antibiotics', unitPrice: 24.00, stock: 18, rackNo: 'B-01' },
  { name: 'Cetirizine 10mg', category: 'Antihistamines', unitPrice: 3.50, stock: 25, rackNo: 'B-02' },
  { name: 'Pantoprazole 40mg', category: 'Antacids', unitPrice: 9.00, stock: 110, rackNo: 'C-01' },
  { name: 'Metformin 500mg', category: 'Antidiabetic', unitPrice: 4.50, stock: 35, rackNo: 'C-02' },
  { name: 'Vitamin C 500mg', category: 'Supplements', unitPrice: 6.00, stock: 40, rackNo: 'D-01' },
  { name: 'ORS', category: 'Hydration', unitPrice: 18.00, stock: 90, rackNo: 'D-02' },
  { name: 'Ibuprofen 400mg', category: 'NSAID', unitPrice: 4.00, stock: 85, rackNo: 'E-01' },
  { name: 'Cough Syrup 100ml', category: 'Respiratory', unitPrice: 65.00, stock: 15, rackNo: 'E-02' }
];

const seedDefaultMedicinesIfNeeded = async (hospitalId, branchId, userId) => {
  try {
    const existingCount = await Medicine.countDocuments();
    if (existingCount > 0) return;

    for (const item of DEFAULT_MEDICINES) {
      const createdMed = await Medicine.create({
        ...item,
        hospitalId,
        branchId,
        createdBy: userId,
        updatedBy: userId
      });

      // Also create a batch for this medicine so dispensing & batch tracking works seamlessly
      await MedicineBatch.create({
        medicineId: createdMed._id,
        batchCode: `BAT-${Math.floor(1000 + Math.random() * 9000)}`,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        stock: item.stock,
        unitPrice: item.unitPrice,
        hospitalId,
        branchId,
        createdBy: userId,
        updatedBy: userId
      });
    }
  } catch (err) {
    console.error('[seedDefaultMedicinesIfNeeded] Error seeding default medicines:', err.message);
  }
};

const getPharmacyStats = async (req, res, next) => {
  try {
    const { today, timezoneOffset } = req.query;

    // Ensure medicines catalog has records so low-stock count and catalog are populated
    await seedDefaultMedicinesIfNeeded(req.user?.hospitalId, req.user?.branchId, req.user?._id);

    // Compute today's start and end boundaries
    let startOfDay;
    let endOfDay;

    if (today && /^\d{4}-\d{2}-\d{2}$/.test(today)) {
      const [y, m, d] = today.split('-').map(Number);
      const parsedOffset = Number(timezoneOffset);
      const offsetMs = !isNaN(parsedOffset) ? parsedOffset * 60000 : 0;
      
      startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + offsetMs);
      endOfDay = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0) + offsetMs);
    } else {
      const now = new Date();
      startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    }

    // Identify active IPD admitted patients and admission IDs
    const activeAdmissions = await IPDAdmission.find({
      $or: [{ status: 'Admitted' }, { isActive: true }]
    }).select('patientId _id');
    const admittedPatientIds = activeAdmissions.map(a => a.patientId).filter(Boolean);
    const admissionIds = activeAdmissions.map(a => a._id);

    const baseOpdFilter = {
      isIpd: { $ne: true },
      admissionId: { $nin: admissionIds }
    };

    // 1. Pending Prescriptions count (Active pending orders waiting in OPD queue)
    const pending = await Prescription.countDocuments({
      ...baseOpdFilter,
      status: { $in: [/^pending$/i, /^waiting payment$/i, /^sent to pharmacy$/i] },
      $or: [{ dispensedAt: { $exists: false } }, { dispensedAt: null }]
    });

    // 2. Dispensing count (Active in-progress dispensing in OPD)
    const dispensing = await Prescription.countDocuments({
      ...baseOpdFilter,
      status: { $in: [/^dispensing$/i, /^in progress$/i] },
      $or: [{ dispensedAt: { $exists: false } }, { dispensedAt: null }]
    });

    // 3. Dispensed Today count (Orders that have been dispensed today in OPD)
    const dispensedToday = await Prescription.countDocuments({
      ...baseOpdFilter,
      status: { $in: [/^dispensed$/i, /^completed$/i, /^partially dispensed$/i] },
      $or: [
        { dispensedAt: { $gte: startOfDay, $lt: endOfDay } },
        { completedAt: { $gte: startOfDay, $lt: endOfDay } },
        { updatedAt: { $gte: startOfDay, $lt: endOfDay } }
      ]
    });

    // 4. Low Stock Medicines count (stock < 50)
    const lowStock = await Medicine.countDocuments({
      $or: [
        { stock: { $lt: 50 } },
        { stock: { $exists: false } },
        { stock: null }
      ]
    });

    const totalMedicines = await Medicine.countDocuments();
    const totalPrescriptions = await Prescription.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        pending,
        dispensing,
        dispensedToday,
        lowStock,
        totalMedicines,
        totalPrescriptions
      }
    });
  } catch (error) {
    next(error);
  }
};

const getMedicines = async (req, res, next) => {
  try {
    await seedDefaultMedicinesIfNeeded(req.user?.hospitalId, req.user?.branchId, req.user?._id);
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
    // Auto-heal any legacy prescriptions where admissionId was erroneously pointing to an Appointment
    try {
      const activeApptIds = await Appointment.find({}).select('_id tokenNumber').lean();
      if (activeApptIds && activeApptIds.length > 0) {
        const apptIdMap = new Map(activeApptIds.map(a => [String(a._id), a.tokenNumber]));
        const misalignedRxs = await Prescription.find({
          $or: [
            { admissionId: { $in: Array.from(apptIdMap.keys()) } },
            { isIpd: true, appointmentId: { $in: Array.from(apptIdMap.keys()) } },
            { appointmentId: { $exists: false }, isIpd: { $ne: true } },
            { appointmentId: null, isIpd: { $ne: true } }
          ]
        }).populate('consultationId');
        for (const mRx of misalignedRxs) {
          const matchedApptId = String(mRx.admissionId || mRx.appointmentId || mRx.consultationId?.appointmentId || '');
          if (apptIdMap.has(matchedApptId)) {
            mRx.appointmentId = matchedApptId;
            mRx.admissionId = undefined;
            mRx.isIpd = false;
            if (!mRx.tokenNumber || mRx.tokenNumber === 'IPD' || mRx.tokenNumber === 'undefined') {
              mRx.tokenNumber = apptIdMap.get(matchedApptId) || 'OP001';
            }
            if (mRx.status === 'Sent to Pharmacy') {
              mRx.status = 'Pending';
            }
            await mRx.save();
          }
        }
      }
    } catch (healErr) {
      console.warn('[getPrescriptionQueue] Auto-heal warning:', healErr.message);
    }

    let query = {
      isIpd: { $ne: true }
    };
    if (filter === 'history') {
      query.$or = [
        { status: { $in: [/^dispensed$/i, /^completed$/i, /^cancelled$/i, /^paid$/i, /^partially dispensed$/i] } },
        { dispensedAt: { $exists: true, $ne: null } }
      ];
    } else if (filter === 'all') {
      // all OPD prescriptions
    } else {
      query.status = { $in: [/^pending$/i, /^dispensing$/i, /^in progress$/i, /^waiting payment$/i, /^sent to pharmacy$/i] };
      query.$or = [
        { dispensedAt: { $exists: false } },
        { dispensedAt: null }
      ];
    }

    const rawQueue = await Prescription.find(query)
      .populate('patientId', 'name uhid age gender mobileNumber bloodGroup')
      .populate('doctorId', 'name employeeCode')
      .populate('dispensedBy', 'name')
      .populate({
        path: 'consultationId',
        select: 'appointmentId createdAt chiefComplaint primaryDiagnosis status',
        populate: {
          path: 'appointmentId',
          select: 'tokenNumber time date status queueStatus billingStatus pharmacyStatus isEmergency priority'
        }
      })
      .populate('appointmentId', 'tokenNumber time date status queueStatus billingStatus pharmacyStatus isEmergency priority')
      .sort({ createdAt: -1 });

    // Identify active IPD admitted patients and admission IDs to strictly isolate from OPD desk
    const activeAdmissions = await IPDAdmission.find({
      $or: [{ status: 'Admitted' }, { isActive: true }]
    }).select('patientId _id');
    const admittedPatientIds = new Set(activeAdmissions.map(a => String(a.patientId)));
    const admissionIds = new Set(activeAdmissions.map(a => String(a._id)));

    // Deduplicate by consultationId, prescription ID, and ensure ONE active record per patient
    const seenConsultations = new Set();
    const seenPrescriptionIds = new Set();
    const seenPatients = new Set();
    const queue = [];

    // Track tokens assigned per day to ensure strictly UNIQUE tokens per day with zero duplicates
    const usedTokensByDate = new Map(); // dateKey -> Set of token strings
    const maxTokenNumByDate = new Map(); // dateKey -> max numeric token

    for (const rx of rawQueue) {
      // Exclude IPD flagged prescriptions immediately
      if (rx.isIpd === true) continue;

      const rxId = String(rx._id);
      const consultId = rx.consultationId?._id ? String(rx.consultationId._id) : (rx.consultationId ? String(rx.consultationId) : null);
      const patId = String(rx.patientId?._id || rx.patientId || '');
      const apptId = String(rx.appointmentId?._id || rx.appointmentId || '');

      // Exclude if linked directly to a real IPD admission ID
      if (rx.admissionId && admissionIds.has(String(rx.admissionId))) continue;
      if (admissionIds.has(apptId)) continue;

      // Exclude if consultation type indicates inpatient round
      const cType = String(rx.consultationId?.consultationType || '').toLowerCase();
      if (cType.startsWith('round')) continue;

      // If patient is currently an admitted IPD inpatient and rx has no separate legitimate OPD appointment
      if (admittedPatientIds.has(patId)) {
        const linkedAppt = rx.appointmentId || rx.consultationId?.appointmentId;
        const linkedApptId = String(linkedAppt?._id || linkedAppt || '');
        const hasValidOpdAppt = linkedAppt && !admissionIds.has(linkedApptId) && (linkedAppt.tokenNumber || rx.tokenNumber !== 'IPD');
        if (!hasValidOpdAppt) {
          continue;
        }
      }

      if (seenPrescriptionIds.has(rxId)) continue;
      seenPrescriptionIds.add(rxId);

      if (consultId) {
        if (seenConsultations.has(consultId)) continue;
        seenConsultations.add(consultId);
      }

      // Strictly single original record per patient in active queue (never duplicate patients)
      if (filter !== 'history' && patId) {
        if (seenPatients.has(patId)) continue;
        seenPatients.add(patId);
      }

      const rxObj = rx.toObject();
      const linkedAppt = rxObj.appointmentId || rxObj.consultationId?.appointmentId;

      // Group & scope unique tokens per day so no two patients ever share a token ID on the same day
      const effectiveDate = filter === 'history'
        ? (rxObj.dispensedAt || rxObj.updatedAt || rxObj.createdAt || new Date())
        : (rxObj.createdAt || rxObj.sentToPharmacyAt || new Date());
      const dateKey = new Date(effectiveDate).toISOString().split('T')[0];

      if (!usedTokensByDate.has(dateKey)) {
        usedTokensByDate.set(dateKey, new Set());
        maxTokenNumByDate.set(dateKey, 0);
      }

      const dayTokens = usedTokensByDate.get(dateKey);
      let dayMax = maxTokenNumByDate.get(dateKey);

      let tokenNumber = (rxObj.tokenNumber && rxObj.tokenNumber !== 'N/A' && String(rxObj.tokenNumber).trim() !== '')
        ? String(rxObj.tokenNumber).trim()
        : '';

      // Check if rx.tokenNumber is already unique for this day and hasn't been assigned yet
      if (tokenNumber && !dayTokens.has(tokenNumber)) {
        dayTokens.add(tokenNumber);
        const m = tokenNumber.match(/\d+/);
        if (m) {
          const num = parseInt(m[0], 10);
          if (num > dayMax) {
            dayMax = num;
            maxTokenNumByDate.set(dateKey, dayMax);
          }
        }
      } else {
        // If rx token is missing or collides with another patient on this day, check linked appointment
        const candidate = (linkedAppt?.tokenNumber && linkedAppt.tokenNumber !== 'N/A' && String(linkedAppt.tokenNumber).trim() !== '')
          ? String(linkedAppt.tokenNumber).trim()
          : '';

        if (candidate && !dayTokens.has(candidate)) {
          tokenNumber = candidate;
          dayTokens.add(tokenNumber);
          const m = tokenNumber.match(/\d+/);
          if (m) {
            const num = parseInt(m[0], 10);
            if (num > dayMax) {
              dayMax = num;
              maxTokenNumByDate.set(dateKey, dayMax);
            }
          }
        } else {
          // Candidate also collided or is missing -> Assign next sequential unique token for this date
          dayMax++;
          maxTokenNumByDate.set(dateKey, dayMax);
          const prefix = linkedAppt?.isEmergency ? 'EMG' : 'OP';
          tokenNumber = `${prefix}${String(dayMax).padStart(3, '0')}`;
          dayTokens.add(tokenNumber);
        }

        // Persist strictly unique token to Prescription in DB
        Prescription.updateOne({ _id: rx._id }, { $set: { tokenNumber } }).exec().catch(() => {});
      }

      rxObj.tokenNumber = tokenNumber || 'N/A';
      rxObj.slotTime = linkedAppt?.time || '';
      rxObj.appointmentDate = linkedAppt?.date || null;
      rxObj.appointmentBillingStatus = linkedAppt?.billingStatus || rxObj.paymentStatus || 'Unpaid';
      rxObj.appointmentPharmacyStatus = linkedAppt?.pharmacyStatus || '';

      queue.push(rxObj);
    }

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
      .populate('appointmentId')
      .populate({
        path: 'consultationId',
        populate: {
          path: 'appointmentId',
          select: 'tokenNumber time date status queueStatus billingStatus'
        }
      });
    if (!rx) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    const rxObj = rx.toObject();
    const linkedAppt = rxObj.appointmentId || rxObj.consultationId?.appointmentId;
    rxObj.tokenNumber = linkedAppt?.tokenNumber || rxObj.tokenNumber || 'N/A';
    if (Array.isArray(rxObj.items)) {
      rxObj.items = rxObj.items.map(it => {
        const food = normalizeFoodTiming(it.foodTiming || it.instructions || (
          /panto|omepra|rabe|esomepra|lansopra|antacid|sucralfate|levothyrox/i.test(it.medicineName || '') ? 'Before Food' : 'After Food'
        ));
        return {
          ...it,
          foodTiming: food,
          instructions: food
        };
      });
    }
    res.status(200).json({ success: true, data: rxObj });
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

      // Ensure prescription has a strictly unique token on its dispensed date
      const dispDateStr = prescription.dispensedAt.toISOString().split('T')[0];
      const startOfDisp = new Date(`${dispDateStr}T00:00:00.000Z`);
      const endOfDisp = new Date(`${dispDateStr}T23:59:59.999Z`);

      const existingRxOnDate = await Prescription.find({
        _id: { $ne: prescription._id },
        dispensedAt: { $gte: startOfDisp, $lte: endOfDisp },
        tokenNumber: { $exists: true, $nin: ['', null, 'N/A'] }
      }).select('tokenNumber').lean();

      const existingTokensSet = new Set(existingRxOnDate.map(r => r.tokenNumber));
      if (!prescription.tokenNumber || existingTokensSet.has(prescription.tokenNumber)) {
        let maxNum = 0;
        for (const r of existingRxOnDate) {
          const m = String(r.tokenNumber || '').match(/\d+/);
          if (m) {
            const num = parseInt(m[0], 10);
            if (num > maxNum) maxNum = num;
          }
        }
        prescription.tokenNumber = `OP${String(maxNum + 1).padStart(3, '0')}`;
      }

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
          if (itemUpdate.morning !== undefined) item.morning = itemUpdate.morning;
          if (itemUpdate.afternoon !== undefined) item.afternoon = itemUpdate.afternoon;
          if (itemUpdate.night !== undefined) item.night = itemUpdate.night;
          if (itemUpdate.foodTiming !== undefined) {
            item.foodTiming = normalizeFoodTiming(itemUpdate.foodTiming);
            item.instructions = item.foodTiming;
          }
          if (itemUpdate.duration !== undefined) item.duration = itemUpdate.duration;
        }
      }
    } else if (status === 'Completed' || status === 'Dispensed') {
      // Default non-out-of-stock items to Dispensed
      for (const item of prescription.items) {
        if (item.dispensingStatus !== 'Out of Stock') {
          item.dispensingStatus = 'Dispensed';
        }
      }
    }

    await prescription.save();

    // Sync status back to Appointment & Consultation
    const consultation = await Consultation.findById(prescription.consultationId);
    if (consultation) {
      const appointment = await Appointment.findById(prescription.appointmentId || consultation.appointmentId);
      if (appointment) {
        if (status === 'Dispensing' || status === 'In Progress') {
          WorkflowEngine.transitionPharmacyState(appointment, PHARMACY_STATES.DISPENSING, req.user);
          appointment.pharmacyStatus = 'DISPENSING';
        } else if (status === 'Completed' || status === 'Dispensed' || status === 'Partially Dispensed' || status === 'Paid' || status === 'Waiting Payment') {
          WorkflowEngine.transitionPharmacyState(appointment, PHARMACY_STATES.DISPENSED, req.user);
          appointment.pharmacyStatus = 'DISPENSED';
          try {
            WorkflowEngine.transitionQueueState(appointment, QUEUE_STATES.COMPLETED, req.user);
          } catch (wfErr) {
            if (appointment.workflow) appointment.workflow.queueState = 'COMPLETED';
          }
          appointment.status = 'Completed';
          appointment.queueStatus = 'Completed';
          if (consultation) {
            consultation.status = 'COMPLETED';
            await consultation.save();
          }
        } else if (status === 'Cancelled') {
          if (appointment.billingStatus === 'Paid') {
            WorkflowEngine.transitionQueueState(appointment, QUEUE_STATES.COMPLETED, req.user);
            appointment.status = 'Completed';
            appointment.queueStatus = 'Completed';
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

/**
 * Authoritative Hospital Performance Reports & Analytics
 * Returns actual data for the 4 core performance cards:
 * 1. Today's / Period Performance Metrics (OPD, Prescriptions, Invoiced Revenue, IPD Admissions, Completed Consultations)
 * 2. Department Performance (Unique patients consulted per department)
 * 3. Doctor Consultations Summary (Total completed consultations per doctor)
 * 4. Hospital Revenue Overview (Total Billed, Total Collected, Pending Amount)
 */
const getHospitalPerformanceReports = async (req, res, next) => {
  try {
    const hospitalId = req.user?.hospitalId;
    const { period = 'today', startDate: qStartDate, endDate: qEndDate } = req.query;

    // Optional auto-reconcile paid appointments into Invoice ledger
    try {
      if (typeof autoReconcilePaidAppointments === 'function') {
        await autoReconcilePaidAppointments(hospitalId);
      }
    } catch (reconcileErr) {
      console.warn('Auto reconciliation warning in performance reports:', reconcileErr.message);
    }

    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    if (qStartDate && qEndDate) {
      start = new Date(qStartDate);
      end = new Date(qEndDate);
      end.setHours(23, 59, 59, 999);
    } else {
      switch (period) {
        case 'week': {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999);
          break;
        }
        case 'month': {
          start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        }
        case 'year': {
          start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
        }
        case 'today':
        default: {
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
        }
      }
    }

    const minStart = start;
    const maxEnd = end;

    // Helper for hospital ID query match (handles ObjectId, string, and omitted in tenant databases)
    const buildHospitalFilter = () => {
      if (!hospitalId) return {};
      return {
        $or: [
          { hospitalId: hospitalId },
          { hospitalId: new mongoose.Types.ObjectId(hospitalId) },
          { hospitalId: { $exists: false } },
          { hospitalId: null }
        ]
      };
    };

    // 1. OPD Registrations (Total patients registered / appointments during period)
    const apptQuery = {
      isActive: { $ne: false },
      $or: [
        { date: { $gte: minStart, $lte: maxEnd } },
        { createdAt: { $gte: minStart, $lte: maxEnd } }
      ]
    };
    if (hospitalId) apptQuery.$and = [buildHospitalFilter()];
    const periodAppointments = await Appointment.find(apptQuery).lean();
    const totalRegs = periodAppointments.length;

    // 2. Dispensed Prescriptions during period
    const rxQuery = {
      status: { $in: ['Dispensed', 'Completed', 'DISPENSED', 'COMPLETED'] },
      isActive: { $ne: false },
      $or: [
        { dispensedAt: { $gte: minStart, $lte: maxEnd } },
        { updatedAt: { $gte: minStart, $lte: maxEnd } },
        { createdAt: { $gte: minStart, $lte: maxEnd } }
      ]
    };
    if (hospitalId) rxQuery.$and = [buildHospitalFilter()];
    const periodPrescriptions = await Prescription.find(rxQuery).lean();
    const dispensedCount = periodPrescriptions.length;

    // 3. IPD Admissions during period
    const ipdQuery = {
      isActive: { $ne: false },
      $or: [
        { admissionDate: { $gte: minStart, $lte: maxEnd } },
        { createdAt: { $gte: minStart, $lte: maxEnd } }
      ]
    };
    if (hospitalId) ipdQuery.$and = [buildHospitalFilter()];
    let periodIpdAdmissions = [];
    try {
      periodIpdAdmissions = await IPDAdmission.find(ipdQuery).lean();
    } catch (e) {
      console.warn('IPD count error:', e.message);
    }
    const ipdCount = periodIpdAdmissions.length;

    // Check if IPD is enabled for this hospital
    let hasIpdModule = false;
    try {
      if (hospitalId) {
        const hospital = await Hospital.findById(hospitalId).lean();
        if (hospital) {
          const requested = Boolean(hospital.ipd_requested);
          let enabled = false;
          if (hospital.featureModules) {
            if (typeof hospital.featureModules.get === 'function') {
              enabled = Boolean(hospital.featureModules.get('IPD'));
            } else {
              enabled = Boolean(hospital.featureModules.IPD);
            }
          }
          hasIpdModule = (requested && enabled) || ipdCount > 0;
        }
      }
    } catch (e) {
      console.warn('Hospital IPD check error:', e.message);
    }

    // 4. Completed Consultations during period (Unified from Consultation model & Appointment workflow)
    const consultQuery = {
      isActive: { $ne: false },
      status: { $in: ['COMPLETED', 'Completed', 'past'] },
      $or: [
        { createdAt: { $gte: minStart, $lte: maxEnd } },
        { updatedAt: { $gte: minStart, $lte: maxEnd } },
        { date: { $gte: minStart, $lte: maxEnd } },
        { consultationDate: { $gte: minStart, $lte: maxEnd } }
      ]
    };
    if (hospitalId) consultQuery.$and = [buildHospitalFilter()];
    const completedConsultations = await Consultation.find(consultQuery).lean();

    // Query any completed appointments during this period
    const completedApptQuery = {
      isActive: { $ne: false },
      $or: [
        { status: { $in: ['Completed', 'COMPLETED'] } },
        { queueStatus: { $in: ['Completed', 'COMPLETED'] } },
        { 'workflow.consultationState': 'COMPLETED' },
        { 'workflow.queueState': 'COMPLETED' },
        { 'workflow.timestamps.completedAt': { $exists: true, $ne: null } }
      ],
      $and: [
        {
          $or: [
            { 'workflow.timestamps.completedAt': { $gte: minStart, $lte: maxEnd } },
            { date: { $gte: minStart, $lte: maxEnd } },
            { updatedAt: { $gte: minStart, $lte: maxEnd } },
            { createdAt: { $gte: minStart, $lte: maxEnd } }
          ]
        },
        ...(hospitalId ? [buildHospitalFilter()] : [])
      ]
    };
    let completedAppts = [];
    try {
      completedAppts = await Appointment.find(completedApptQuery).lean();
    } catch (e) {
      console.warn('Completed appointments query error:', e.message);
    }

    // Deduplicate into unified completed visits
    const handledApptIds = new Set();
    const allCompletedVisits = [];

    for (const c of completedConsultations) {
      const apptId = String(c.appointmentId?._id || c.appointmentId || '');
      if (apptId) handledApptIds.add(apptId);
      allCompletedVisits.push({
        _id: c._id,
        appointmentId: apptId || null,
        doctorId: String(c.doctorId?._id || c.doctorId || ''),
        patientId: String(c.patientId?._id || c.patientId || '')
      });
    }

    const candidateAppts = [...completedAppts, ...periodAppointments];
    for (const a of candidateAppts) {
      const aIdStr = String(a._id);
      if (handledApptIds.has(aIdStr)) continue;

      const isCompleted = ['Completed', 'COMPLETED'].includes(a.status) ||
                          ['Completed', 'COMPLETED'].includes(a.queueStatus) ||
                          a.workflow?.consultationState === 'COMPLETED' ||
                          a.workflow?.queueState === 'COMPLETED' ||
                          Boolean(a.workflow?.timestamps?.completedAt);

      if (isCompleted) {
        handledApptIds.add(aIdStr);
        allCompletedVisits.push({
          _id: a._id,
          appointmentId: aIdStr,
          doctorId: String(a.doctorId?._id || a.doctorId || ''),
          patientId: String(a.patientId?._id || a.patientId || '')
        });
      }
    }

    const completedConsultationsCount = allCompletedVisits.length;

    // 5. Invoices & Revenue (Total Billed, Total Collected, Pending Amount)
    const invQuery = {
      isActive: { $ne: false },
      $or: [
        { createdAt: { $gte: minStart, $lte: maxEnd } },
        { updatedAt: { $gte: minStart, $lte: maxEnd } },
        { invoiceDate: { $gte: minStart, $lte: maxEnd } }
      ]
    };
    if (hospitalId) invQuery.$and = [buildHospitalFilter()];
    const invoices = await Invoice.find(invQuery).lean();

    let totalBilled = 0;
    let totalCollected = 0;
    let pendingAmount = 0;

    invoices.forEach(inv => {
      const amt = Number(inv.grandTotal) || 0;
      totalBilled += amt;
      if (inv.paymentStatus === 'Paid') {
        totalCollected += amt;
      } else {
        pendingAmount += amt;
      }
    });

    // 6. Doctors & Staff
    let doctorRoleIds = [];
    try {
      doctorRoleIds = await Role.find({ name: { $in: ['DOCTOR', 'DOCTOR_ADMIN'] } }).distinct('_id');
    } catch (e) {
      // ignore
    }

    const doctorQuery = {
      status: { $ne: 'INACTIVE' },
      $or: [
        { role: { $in: ['DOCTOR', 'DOCTOR_ADMIN'] } },
        { userType: { $in: ['DOCTOR', 'DOCTOR_ADMIN'] } },
        ...(doctorRoleIds.length > 0 ? [{ roleId: { $in: doctorRoleIds } }] : [])
      ]
    };
    if (hospitalId) doctorQuery.$and = [buildHospitalFilter()];
    const doctors = await User.find(doctorQuery).lean();

    const staffQuery = { status: { $ne: 'INACTIVE' } };
    if (hospitalId) staffQuery.$and = [buildHospitalFilter()];
    const allStaff = await User.find(staffQuery).lean();

    // Departments in tenant database
    const departments = await Department.find({ isActive: { $ne: false } }).lean();

    // 7. Department Stats (Unique patients handled per department during period)
    const departmentStats = departments.map(dept => {
      const deptIdStr = String(dept._id);
      const deptNameLower = (dept.name || '').toLowerCase();
      const deptCodeUpper = (dept.code || '').toUpperCase();

      const deptStaff = allStaff.filter(s => s.departmentId && String(s.departmentId) === deptIdStr);
      const deptDocs = doctors.filter(doc => {
        if (doc.departmentId && String(doc.departmentId) === deptIdStr) return true;
        if (doc.doctorProfile?.specialization && deptNameLower.includes(doc.doctorProfile.specialization.toLowerCase())) return true;
        return false;
      });

      const isClinicalDept = deptDocs.length > 0 || 
        ['CHILD', 'GM', 'CARDIO', 'ORTHO', 'PEDIATRIC', 'ENT', 'OPHTH', 'GYN', 'SURG', 'DERM'].includes(deptCodeUpper) ||
        ['specialist', 'pediatric', 'cardiology', 'orthopedic', 'consultation', 'doctor', 'clinic', 'medicine', 'surgery'].some(w => deptNameLower.includes(w));

      let patientCount = 0;

      if (isClinicalDept) {
        // Clinical department: count unique patients who had completed consultations or appointments with department doctors
        const deptDocIds = deptDocs.map(d => String(d._id));
        const deptVisits = allCompletedVisits.filter(c => deptDocIds.includes(String(c.doctorId)));
        patientCount = new Set(deptVisits.map(c => String(c.patientId))).size;
        
        if (patientCount === 0 && deptDocIds.length > 0) {
          const deptAppts = periodAppointments.filter(a => deptDocIds.includes(String(a.doctorId)));
          patientCount = new Set(deptAppts.map(a => String(a.patientId))).size;
        }
      } else if (deptCodeUpper === 'RECEPT' || deptNameLower.includes('recept') || deptNameLower.includes('front') || deptNameLower.includes('registration') || deptNameLower.includes('opd')) {
        // Receptionist / Front Desk: count unique patients with appointments during the period
        patientCount = new Set(periodAppointments.map(a => String(a.patientId))).size;
      } else if (deptCodeUpper === 'PHARM' || deptNameLower.includes('pharm')) {
        // Pharmacy: count unique patients with dispensed prescriptions during the period
        patientCount = new Set(periodPrescriptions.map(p => String(p.patientId))).size;
        if (patientCount === 0 && periodPrescriptions.length > 0) {
          patientCount = periodPrescriptions.length;
        }
      } else if (deptCodeUpper === 'NURSE' || deptCodeUpper === 'IPD' || deptNameLower.includes('nurse') || deptNameLower.includes('ward') || deptNameLower.includes('ipd')) {
        // Nursing / IPD: count unique patients admitted to IPD
        patientCount = new Set(periodIpdAdmissions.map(i => String(i.patientId))).size;
      } else if (deptCodeUpper === 'BILL' || deptNameLower.includes('bill') || deptNameLower.includes('cash') || deptNameLower.includes('finance')) {
        // Billing / Finance: count unique patients billed
        patientCount = new Set(invoices.map(i => String(i.patientId))).size;
      } else {
        // Generic operational staff department
        const staffIds = deptStaff.map(s => String(s._id));
        const staffAppts = periodAppointments.filter(a => staffIds.includes(String(a.createdBy)) || staffIds.includes(String(a.updatedBy)));
        patientCount = new Set(staffAppts.map(a => String(a.patientId))).size;
      }

      return {
        _id: dept._id,
        name: dept.name,
        code: dept.code,
        totalPatients: patientCount
      };
    });

    // 8. Doctor Stats (Completed consultations per doctor during period)
    const doctorStats = doctors.map(doc => {
      const docIdStr = String(doc._id);
      const docConsultsCount = allCompletedVisits.filter(c => String(c.doctorId) === docIdStr).length;
      return {
        _id: doc._id,
        name: doc.name,
        totalConsultations: docConsultsCount
      };
    });
    doctorStats.sort((a, b) => (b.totalConsultations || 0) - (a.totalConsultations || 0));

    res.status(200).json({
      success: true,
      data: {
        period,
        startDate: minStart.toISOString(),
        endDate: maxEnd.toISOString(),
        metrics: {
          totalRegs,
          dispensedCount,
          invoicedRevenue: totalCollected,
          ipdCount,
          completedConsultationsCount,
          hasIpdModule
        },
        departmentStats,
        doctorStats,
        revenue: {
          totalBilled,
          totalCollected,
          pendingAmount
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
      .limit(60);

    const sorted = items.sort((a, b) => {
      const isFavA = a.frequentlyUsed && a.frequentlyUsed.some(uid => uid.toString() === userId.toString());
      const isFavB = b.frequentlyUsed && b.frequentlyUsed.some(uid => uid.toString() === userId.toString());
      if (isFavA && !isFavB) return -1;
      if (!isFavA && isFavB) return 1;
      return 0;
    }).slice(0, 24);

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

const updateMedicineForm = async (req, res, next) => {
  try {
    const MedicineForm = require('../models/MedicineForm');
    const { id } = req.params;
    const { name, code, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Form name is required' });
    }
    const updateData = {
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : name.substring(0, 3).toUpperCase()
    };
    if (description !== undefined) {
      updateData.description = description ? description.trim() : '';
    }
    const form = await MedicineForm.findByIdAndUpdate(id, updateData, { new: true });
    if (!form) {
      return res.status(404).json({ success: false, message: 'Medicine form not found' });
    }
    await logAudit(req.user._id, 'UPDATE_MEDICINE_FORM', 'MEDICINE', { formId: form._id, name: form.name }, req);
    res.status(200).json({ success: true, data: form });
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

    const cleanDoctorId = String(doctorId);
    const parsedIsOnline = Boolean(isOnline);
    const presenceData = doctorPresenceService.setPresence(cleanDoctorId, parsedIsOnline);

    // Broadcast SSE update to all connected receptionists/display boards
    WorkflowEventHub.publish('DOCTOR_PRESENCE_UPDATED', {
      doctorId: cleanDoctorId,
      isOnline: parsedIsOnline,
      performedBy: req.user?.name || 'Doctor'
    });

    res.status(200).json({
      success: true,
      message: `Doctor presence set to ${parsedIsOnline ? 'ONLINE' : 'OFFLINE'}`,
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
      .populate('patientId', 'name uhid age gender mobileNumber alternativeMobile bloodGroup allergies medicalAlerts address addresses contacts guardianName emergencyContact isProfileCompleted dob aadhaarNumber occupation maritalStatus lastVisitDate')
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
      tokenNumber: { $exists: true, $nin: ['', null, 'N/A'] }
    };
    if (req.user.branchId) {
      countFilter.branchId = req.user.branchId;
    }

    const count = await Appointment.countDocuments(countFilter);
    const existingTokens = await Appointment.find(countFilter).select('tokenNumber').lean();
    let maxIndex = 0;
    for (const t of existingTokens) {
      const numMatch = String(t.tokenNumber || '').match(/\d+/);
      if (numMatch) {
        const n = parseInt(numMatch[0], 10);
        if (n > maxIndex) maxIndex = n;
      }
    }

    const index = Math.max(count, maxIndex) + 1;
    const tokenNumber = `${tokenPrefix}${String(index).padStart(3, '0')}`;

    const checkInTime = new Date();
    const originalDate = appointment.date;
    let isEarlyArrival = false;
    if (originalDate) {
      const origDateObj = new Date(originalDate);
      const checkInDay = new Date(checkInTime);
      origDateObj.setHours(0, 0, 0, 0);
      checkInDay.setHours(0, 0, 0, 0);
      if (origDateObj.getTime() > checkInDay.getTime()) {
        isEarlyArrival = true;
      }
    }

    // Move appointment date to today so it matches doctor desk today's queue filter
    appointment.date = checkInTime;
    appointment.isFutureBooking = false;
    appointment.tokenNumber = tokenNumber;
    appointment.status = 'Waiting';
    appointment.queueStatus = 'Waiting';
    if (!appointment.workflow) {
      appointment.workflow = {};
    }
    appointment.workflow.queueState = 'WAITING';
    appointment.workflow.timestamps = {
      ...(appointment.workflow.timestamps || {}),
      checkedInAt: checkInTime,
      ...(isEarlyArrival && originalDate ? { originalScheduledDate: originalDate } : {})
    };
    appointment.markModified('workflow');
    appointment.updatedBy = req.user._id;

    const originalDateStr = originalDate ? new Date(originalDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    if (!appointment.workflowHistory) appointment.workflowHistory = [];
    appointment.workflowHistory.push({
      fromState: 'SCHEDULED',
      toState: 'WAITING',
      stateType: 'queueState',
      changedBy: req.user._id,
      changedByName: req.user.name || 'Receptionist',
      changedByRole: req.user.role || 'RECEPTIONIST',
      timestamp: checkInTime,
      note: isEarlyArrival
        ? `Early arrival check-in confirmed at reception desk. (Original scheduled date: ${originalDateStr}). Assigned Token: ${tokenNumber}`
        : `Patient checked in. Assigned Token: ${tokenNumber}`
    });

    await appointment.save();

    // Emit Real-Time Events so Doctor Desk updates immediately
    try {
      const WorkflowEventHub = require('../services/WorkflowEventHub');
      WorkflowEventHub.publish('PatientCheckedIn', {
        ...appointment.toObject(),
        isEarlyArrival,
        originalScheduledDate: originalDate,
        performedBy: req.user.name || 'Receptionist'
      });
      WorkflowEventHub.publish('DOCTOR_QUEUE_UPDATED', {
        doctorId: appointment.doctorId?._id || appointment.doctorId,
        appointmentId: appointment._id,
        action: 'CHECK_IN',
        isEarlyArrival
      });
    } catch (e) {}

    await logAudit(req.user._id, 'CHECK_IN_APPOINTMENT', 'OPD', { appointmentId: appointment._id, tokenNumber, isEarlyArrival }, req);

    const docName = appointment.doctorId?.name ? `Dr. ${appointment.doctorId.name.replace(/^Dr\.\s*/i, '')}` : 'Assigned Doctor';
    const successMsg = isEarlyArrival
      ? `Early arrival confirmed! Patient moved to today's queue with Token #${tokenNumber} for ${docName}.`
      : `Patient successfully checked in! OPD Token: #${tokenNumber} for ${docName}.`;

    return res.status(200).json({
      success: true,
      message: successMsg,
      data: appointment,
      tokenNumber,
      isEarlyArrival
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerPatient,
  getPatients,
  searchPatients,
  getPatientById,
  updatePatient,
  bookAppointment,
  getAppointmentById,
  checkInAppointment,
  getAppointments,
  enterVitals,
  updateQueueStatus,
  createConsultation,
  getPatientHistory,
  createMedicine,
  getMedicines,
  getPharmacyStats,
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
  getHospitalPerformanceReports,
  getConsultations,
  startFollowupConsultation,
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
  updateMedicineForm,
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
