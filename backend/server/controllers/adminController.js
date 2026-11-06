const Hospital = require('../models/Hospital');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const PrescriptionPrintTemplate = require('../models/PrescriptionPrintTemplate');
const logAudit = require('../utils/auditLogger');
const { generateHospitalCode, generateBranchCode } = require('../utils/helpers');

// ==========================================
// HOSPITAL MANAGEMENT
// ==========================================

// Helper function to seed tenant permissions, roles, and Doctor Admin user account
const seedTenantAdminUser = async (hospital) => {
  if (!hospital || !hospital.code) return null;
  const { getTenantConnection } = require('../utils/dbManager');
  const { tenantLocalStorage } = require('../utils/tenantModel');
  const conn = await getTenantConnection(hospital.code);

  let adminUser = null;
  await tenantLocalStorage.run({ connection: conn }, async () => {
    const Permission = require('../models/Permission');
    const Role = require('../models/Role');
    const User = require('../models/User');

    // Seed default permissions inside tenant database
    const countPermissions = await Permission.countDocuments();
    if (countPermissions === 0) {
      const permissionsData = [
        { name: 'user:create', module: 'auth', description: 'Create branch staff and admins' },
        { name: 'user:read', module: 'auth', description: 'Read user rosters' },
        { name: 'user:write', module: 'auth', description: 'Modify users' },
        { name: 'pin:reset', module: 'auth', description: 'Reset staff PINs' },
        { name: 'branch:create', module: 'branch', description: 'Establish hospital branches' },
        { name: 'branch:read', module: 'branch', description: 'View branches' },
        { name: 'department:create', module: 'department', description: 'Add departments' },
        { name: 'department:read', module: 'department', description: 'View department details' },
        { name: 'opd:view', module: 'opd', description: 'Access outpatient panels' },
        { name: 'opd:write', module: 'opd', description: 'Consult patients & write diagnoses' },
        { name: 'ipd:view', module: 'ipd', description: 'Access inpatient panels' },
        { name: 'ipd:write', module: 'ipd', description: 'Record ward updates & discharge reports' },
        { name: 'prescription:write', module: 'opd', description: 'Write prescriptions for patients' },
        { name: 'patient:create', module: 'reception', description: 'Register new patients' },
        { name: 'patient:read', module: 'reception', description: 'Search patient database' },
        { name: 'appointment:create', module: 'reception', description: 'Book medical appointments' },
        { name: 'appointment:read', module: 'reception', description: 'View schedules' },
        { name: 'pharmacy:view', module: 'pharmacy', description: 'Access pharmacy dispensing dashboards' },
        { name: 'pharmacy:inventory', module: 'pharmacy', description: 'Manage pharmacy stocks' },
        { name: 'billing:view', module: 'finance', description: 'Check receipts' },
        { name: 'billing:manage', module: 'finance', description: 'Generate invoices & take payments' }
      ];
      await Permission.insertMany(permissionsData);
    }

    // Seed default roles inside tenant database
    let adminRole = await Role.findOne({ name: 'DOCTOR_ADMIN' });
    if (!adminRole) {
      adminRole = await Role.findOne({ name: 'HOSPITAL_ADMIN' });
      if (adminRole) {
        adminRole.name = 'DOCTOR_ADMIN';
        adminRole.description = 'Doctor Admin. Hospital Owner and consulting doctor. Full administrative and clinical permissions.';
        adminRole.permissions = [
          'user:create', 'user:read', 'user:write', 'pin:reset',
          'branch:create', 'branch:read', 'branch:write',
          'department:create', 'department:read', 'department:write',
          'opd:view', 'opd:write', 'ipd:view', 'ipd:write', 'prescription:write',
          'patient:create', 'patient:read', 'appointment:create', 'appointment:read',
          'pharmacy:view', 'pharmacy:inventory', 'billing:view', 'billing:manage'
        ];
        await adminRole.save();
      } else {
        adminRole = await Role.create({
          name: 'DOCTOR_ADMIN',
          description: 'Doctor Admin. Hospital Owner and consulting doctor. Full administrative and clinical permissions.',
          permissions: [
            'user:create', 'user:read', 'user:write', 'pin:reset',
            'branch:create', 'branch:read', 'branch:write',
            'department:create', 'department:read', 'department:write',
            'opd:view', 'opd:write', 'ipd:view', 'ipd:write', 'prescription:write',
            'patient:create', 'patient:read', 'appointment:create', 'appointment:read',
            'pharmacy:view', 'pharmacy:inventory', 'billing:view', 'billing:manage'
          ]
        });
      }
    }

    // Delete BRANCH_ADMIN role if it exists
    await Role.deleteOne({ name: 'BRANCH_ADMIN' });

    const defaultRoles = [
      {
        name: 'ADMIN',
        description: 'Hospital Administrator / Owner managing hospital operations and workforce.',
        permissions: [
          'user:create', 'user:read', 'user:write', 'pin:reset',
          'branch:create', 'branch:read', 'branch:write',
          'department:create', 'department:read', 'department:write',
          'patient:create', 'patient:read', 'appointment:create', 'appointment:read',
          'pharmacy:view', 'billing:view', 'billing:manage',
          'opd:view', 'ipd:view'
        ]
      },
      {
        name: 'DOCTOR',
        description: 'Medical Practitioner. OPD, consultations, diagnoses and prescribing.',
        permissions: ['opd:view', 'opd:write', 'prescription:write', 'patient:read']
      },
      {
        name: 'RECEPTIONIST',
        description: 'Front Desk Operator. Registers patients and manages queues.',
        permissions: ['patient:create', 'patient:read', 'appointment:create', 'appointment:read']
      },
      {
        name: 'PHARMACIST',
        description: 'Pharmacy Operator. Dispenses medication and manages medicine inventory.',
        permissions: ['pharmacy:view', 'pharmacy:inventory']
      },
      {
        name: 'NURSE',
        description: 'Clinical Nurse. Patient care and vitals entry.',
        permissions: ['patient:read', 'appointment:read', 'opd:view']
      },
      {
        name: 'LABORATORY',
        description: 'Laboratory technician. Pathology & diagnostic testing.',
        permissions: ['patient:read', 'opd:view']
      },
      {
        name: 'BILLING',
        description: 'Cashier / Billing desk operator. Processes patient invoices.',
        permissions: ['billing:view', 'billing:manage']
      }
    ];

    for (const r of defaultRoles) {
      const existing = await Role.findOne({ name: r.name });
      if (!existing) {
        await Role.create(r);
      } else {
        existing.permissions = r.permissions;
        existing.description = r.description;
        await existing.save();
      }
    }

    const targetMobiles = [
      hospital.ownerMobile,
      hospital.adminMobile,
      hospital.contactNumber
    ].map(m => (m || '').toString().trim()).filter(Boolean);

    const primaryMobile = targetMobiles[0] || '9876543210';
    const defaultPin = hospital.adminPin || '123456';
    const adminDisplayName = hospital.ownerName && hospital.ownerName.trim() ? hospital.ownerName.trim() : `${hospital.name} Admin`;

    // Seed default Facility inside tenant database based on hospital City Name (Option A: City Only)
    const Branch = require('../models/Branch');
    const cityName = (hospital.address?.city || '').toString().trim();
    const defaultFacilityName = cityName || 'Main Facility';
    let mainBranch = await Branch.findOne({ isDefault: true });
    if (!mainBranch) {
      mainBranch = await Branch.findOne({ name: defaultFacilityName }) ||
        await Branch.findOne({ name: `${cityName} Branch` }) ||
        await Branch.findOne({ name: 'Main Facility' });
    }
    if (!mainBranch) {
      const mainCode = `${(hospital.code || 'HOSP').replace(/[^A-Z0-9]/gi, '')}-MAIN`;
      mainBranch = await Branch.create({
        name: defaultFacilityName,
        code: mainCode,
        isDefault: true,
        status: 'active',
        contactNumber: primaryMobile,
        address: hospital.address || { street: '', city: cityName, state: '', zip: '', country: 'India' }
      });
    } else {
      if (cityName && (mainBranch.name === 'Main Facility' || mainBranch.name === `${cityName} Branch` || !mainBranch.name)) {
        mainBranch.name = defaultFacilityName;
      }
      if (!mainBranch.isDefault) {
        mainBranch.isDefault = true;
      }
      await mainBranch.save();
    }

    // Look for existing admin user by mobile or role
    let existingUser = await User.findOne({
      $or: [
        { mobileNumber: primaryMobile },
        { roleId: adminRole._id }
      ]
    });

    if (!existingUser) {
      const empCode = `VZE-${(hospital.code || 'HOSP').replace(/[^A-Z0-9]/gi, '')}-ADMIN-${primaryMobile.slice(-4)}`;
      existingUser = await User.create({
        name: adminDisplayName,
        countryCode: hospital.ownerCountryCode || hospital.adminCountryCode || hospital.contactCountryCode || '+91',
        mobileNumber: primaryMobile,
        pin: defaultPin,
        roleId: adminRole._id,
        hospitalId: hospital._id,
        branchId: mainBranch._id,
        hospitalCode: hospital.code.toUpperCase(),
        employeeCode: empCode,
        status: 'active'
      });
    } else {
      existingUser.name = adminDisplayName;
      existingUser.hospitalCode = hospital.code.toUpperCase();
      existingUser.pin = defaultPin;
      existingUser.branchId = mainBranch._id;
      existingUser.status = 'active';
      await existingUser.save();
    }
    adminUser = existingUser;

    // Clean up any extra auto-seeded duplicate admin accounts
    if (existingUser) {
      await User.deleteMany({
        _id: { $ne: existingUser._id },
        roleId: adminRole._id,
        name: adminDisplayName,
        employeeCode: { $regex: /^VZE-.*-ADMIN-/i }
      }).catch(() => { });
    }

    hospital.adminMobile = primaryMobile;
    hospital.adminPin = defaultPin;
    hospital.defaultBranchId = mainBranch._id;
    await hospital.save();
  });

  return adminUser;
};

const createHospital = async (req, res, next) => {
  const { name, code: customCode, address, contactCountryCode, contactNumber, email, hospitalType, registrationNumber, gstNumber, ownerName, ownerCountryCode, ownerMobile, logo, opdOperationMode, planName, ipd_requested } = req.body;
  try {
    let code = customCode ? customCode.trim().toUpperCase() : await generateHospitalCode();

    const existingCode = await Hospital.findOne({ code });
    if (existingCode) {
      return res.status(400).json({ success: false, message: `Hospital Code "${code}" already exists. Please enter a unique hospital code.` });
    }

    const databaseName = `hospital_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const mode = opdOperationMode === 'TOKEN_ONLY' ? 'TOKEN_ONLY' : 'FULL_DIGITAL';

    const featureModules = {
      OPD: true,
      Appointments: true,
      IPD: false,
      Billing: true,
      Pharmacy: true,
      digitalPrescription: mode === 'FULL_DIGITAL',
      doctorConsultationDesk: mode === 'FULL_DIGITAL',
      voiceAnnouncements: true,
      Branches: false,
      Laboratory: false,
      Radiology: false,
      Inventory: false,
      HRMS: false,
      Finance: false,
      Insurance: false,
      PatientPortal: false
    };

    const hospital = await Hospital.create({
      name,
      code,
      address,
      contactCountryCode,
      contactNumber,
      email,
      hospitalType: hospitalType || 'General',
      opdOperationMode: mode,
      planName: planName || (mode === 'TOKEN_ONLY' ? 'Plan 1: OPD Token Generation & Queue Suite' : 'Plan 2: Complete Digital OPD Suite'),
      featureModules,
      registrationNumber,
      gstNumber,
      ownerName,
      ownerCountryCode,
      ownerMobile,
      adminCountryCode: contactCountryCode || '+91',
      adminMobile: contactNumber,
      adminPin: '1234',
      databaseName,
      logo,
      ipd_requested: Boolean(ipd_requested)
    });

    // Auto-seed tenant DB permissions, roles, and DOCTOR_ADMIN user on creation
    try {
      await seedTenantAdminUser(hospital);
    } catch (seedErr) {
      console.error('Error auto-seeding tenant admin user during createHospital:', seedErr);
    }

    await logAudit(req.user._id, 'CREATE_HOSPITAL', 'HOSPITAL', { hospitalId: hospital._id, code }, req);
    res.status(201).json({ success: true, data: hospital });
  } catch (error) {
    console.error('ACTIVATE_HOSPITAL_PLAN ERROR:', error);
    next(error);
  }
};

const getHospitals = async (req, res, next) => {
  try {
    let query = {};
    const tenantScopedRoles = ['DOCTOR_ADMIN', 'ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PHARMACIST', 'NURSE', 'LABORATORY', 'BILLING'];
    if (tenantScopedRoles.includes(req.user.roleId.name)) {
      query._id = req.user.hospitalId;
    } else if (req.user.roleId.name !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const hospitals = await Hospital.find(query);
    res.status(200).json({ success: true, data: hospitals });
  } catch (error) {
    console.error('ERROR fetching hospitals:', error);
    next(error);
  }
};

// ==========================================
// BRANCH MANAGEMENT
// ==========================================

const createBranch = async (req, res, next) => {
  const { name, hospitalId, address, contactNumber } = req.body;
  const targetHospitalId = hospitalId || req.user?.hospitalId;
  try {
    const targetHospital = await Hospital.findById(targetHospitalId);
    if (!targetHospital) {
      return res.status(404).json({ success: false, message: 'Hospital context not found' });
    }

    // Auth check: Doctor Admin & Admin can only create branches for their own hospital
    if (['DOCTOR_ADMIN', 'ADMIN'].includes(req.user?.roleId?.name) && (!req.user.hospitalId || req.user.hospitalId.toString() !== targetHospitalId?.toString())) {
      return res.status(403).json({ success: false, message: 'Unauthorized hospital context' });
    }

    // Feature check: Verify Multi-Branch (Branches: true) feature is enabled by Super Admin
    const isMultiBranchEnabled = targetHospital.featureModules?.Branches === true ||
      (targetHospital.featureModules?.get && targetHospital.featureModules.get('Branches') === true);

    if (!isMultiBranchEnabled) {
      return res.status(403).json({
        success: false,
        message: 'Multi-Branch feature is disabled for your hospital. Please contact Super Admin to enable Multi-Branch module.'
      });
    }

    const hospitalCode = targetHospital.code || 'VZH';
    const code = await generateBranchCode(targetHospitalId, hospitalCode);
    const branch = await Branch.create({
      name,
      code,
      address,
      contactNumber,
      isDefault: false,
      status: 'active'
    });
    await logAudit(req.user._id, 'CREATE_BRANCH', 'BRANCH', { branchId: branch._id, code }, req);
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const getBranches = async (req, res, next) => {
  try {
    let query = {};

    // Filter by user role permissions
    if (req.user.roleId.name !== 'SUPER_ADMIN' && req.user.roleId.name !== 'DOCTOR_ADMIN' && req.user.roleId.name !== 'ADMIN') {
      // Staff roles see their own branch
      query._id = req.user.branchId;
    }

    const branches = await Branch.find(query);

    // Auto-update any default branch named "Main Facility" to the hospital's registered city name if available
    try {
      const hospitalId = req.user.hospitalId?._id || req.user.hospitalId;
      if (hospitalId) {
        const hospital = await Hospital.findById(hospitalId);
        const cityName = hospital?.address?.city?.trim();
        if (cityName) {
          for (const b of branches) {
            if (b.isDefault && (b.name === 'Main Facility' || b.name === `${cityName} Branch` || !b.name)) {
              b.name = cityName;
              await b.save();
            }
          }
        }
      }
    } catch (e) {
      console.error('[getBranches City Rename Error]:', e);
    }

    res.status(200).json({ success: true, data: branches });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// ==========================================
// DEPARTMENT MANAGEMENT
// ==========================================

const updateBranch = async (req, res, next) => {
  const { name, contactNumber, address } = req.body;
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    if (name) branch.name = name;
    if (contactNumber) branch.contactNumber = contactNumber;
    if (address) branch.address = address;

    await branch.save();

    const logAudit = require('../utils/auditLogger');
    await logAudit(req.user._id, 'UPDATE_BRANCH', 'BRANCH', { branchId: branch._id, code: branch.code }, req);
    res.status(200).json({ success: true, data: branch });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// ==========================================

const createDepartment = async (req, res, next) => {
  const { name, code, description } = req.body;
  try {
    const dept = await Department.create({
      name,
      code: code.toUpperCase(),
      description: description || ''
    });

    await logAudit(req.user._id, 'CREATE_DEPARTMENT', 'DEPARTMENT', { deptId: dept._id, code: dept.code }, req);
    res.status(201).json({ success: true, data: dept });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const getDepartments = async (req, res, next) => {
  try {
    const depts = await Department.find({});
    res.status(200).json({ success: true, data: depts });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const updateDepartment = async (req, res, next) => {
  const { name, code, description } = req.body;
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    if (name) dept.name = name;
    if (code) dept.code = code.toUpperCase();
    if (description !== undefined) dept.description = description;

    await dept.save();

    await logAudit(req.user._id, 'UPDATE_DEPARTMENT', 'DEPARTMENT', { deptId: dept._id, code: dept.code }, req);
    res.status(200).json({ success: true, data: dept });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const deleteDepartment = async (req, res, next) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    await dept.deleteOne();

    await logAudit(req.user._id, 'DELETE_DEPARTMENT', 'DEPARTMENT', { deptId: dept._id, code: dept.code }, req);
    res.status(200).json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// ==========================================
// USER MANAGEMENT
// ==========================================

const getUsers = async (req, res, next) => {
  const { role, branchId, hospitalId } = req.query;
  try {
    let query = {};

    // Filter by role context
    const tenantScopedRoles = ['DOCTOR_ADMIN', 'ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PHARMACIST', 'NURSE', 'LABORATORY', 'BILLING'];
    if (tenantScopedRoles.includes(req.user.roleId.name)) {
      query.hospitalId = req.user.hospitalId;
    } else if (req.user.roleId.name !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Additional query filters (supports comma-separated list e.g. role=DOCTOR,DOCTOR_ADMIN)
    if (role) {
      let roleNames = role.split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
      if (roleNames.includes('DOCTOR') && !roleNames.includes('DOCTOR_ADMIN')) {
        roleNames.push('DOCTOR_ADMIN');
      }
      const dbRoles = await Role.find({ name: { $in: roleNames } });
      if (dbRoles && dbRoles.length > 0) {
        query.roleId = { $in: dbRoles.map(r => r._id) };
      }
    }
    if (branchId) query.branchId = branchId;
    if (hospitalId && req.user.roleId.name === 'SUPER_ADMIN') query.hospitalId = hospitalId;

    // Never return super admins unless requester is a Super Admin
    if (req.user.roleId.name !== 'SUPER_ADMIN') {
      const superAdminRole = await Role.findOne({ name: 'SUPER_ADMIN' });
      if (superAdminRole) {
        query.roleId = { $ne: superAdminRole._id };
      }
    }

    // Auto-clean any legacy duplicate seeded DOCTOR_ADMIN accounts if multiple exist
    try {
      const doctorAdminRole = await Role.findOne({ name: 'DOCTOR_ADMIN' });
      if (doctorAdminRole) {
        const adminUsers = await User.find({ roleId: doctorAdminRole._id });
        if (adminUsers.length > 1) {
          const byName = {};
          for (const u of adminUsers) {
            const n = (u.name || '').trim().toLowerCase();
            if (!byName[n]) byName[n] = [];
            byName[n].push(u);
          }
          for (const list of Object.values(byName)) {
            if (list.length > 1) {
              const autoSeeded = list.filter(u => /^VZE-.*-ADMIN-/i.test(u.employeeCode || ''));
              if (autoSeeded.length > 1) {
                const [keep, ...duplicates] = autoSeeded;
                for (const dup of duplicates) {
                  await User.findByIdAndDelete(dup._id).catch(() => { });
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[Duplicate Admin Cleanup Error]:', e);
    }

    const users = await User.find(query)
      .populate('roleId', 'name description')
      .populate('hospitalId', 'name code')
      .populate('branchId', 'name code')
      .populate('departmentId', 'name code')
      .select('-password');

    const processedUsers = users.map((u) => {
      const userObj = u.toObject ? u.toObject() : { ...u };
      return userObj;
    });

    res.status(200).json({ success: true, data: processedUsers });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const updateUserStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Role checks
    if (['DOCTOR_ADMIN', 'ADMIN'].includes(req.user.roleId.name) && user.hospitalId.toString() !== req.user.hospitalId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    user.status = status;
    await user.save();

    await logAudit(req.user._id, 'UPDATE_USER_STATUS', 'USER', { targetUserId: user._id, status }, req);

    res.status(200).json({ success: true, message: 'User status updated successfully', data: user });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// ==========================================
// ROLE & PERMISSION MANAGEMENT
// ==========================================

const getRoles = async (req, res, next) => {
  try {
    // Ensure default ADMIN role exists in tenant database if missing
    let adminRole = await Role.findOne({ name: 'ADMIN' });
    if (!adminRole) {
      adminRole = await Role.create({
        name: 'ADMIN',
        description: 'Hospital Administrator / Owner managing hospital operations and workforce.',
        permissions: [
          'user:create', 'user:read', 'user:write', 'pin:reset',
          'branch:create', 'branch:read', 'branch:write',
          'department:create', 'department:read', 'department:write',
          'patient:create', 'patient:read', 'appointment:create', 'appointment:read',
          'pharmacy:view', 'billing:view', 'billing:manage',
          'opd:view', 'ipd:view'
        ]
      });
    }

    let query = {};
    // Hospital and Branch admins cannot assign SUPER_ADMIN role
    if (req.user.roleId.name !== 'SUPER_ADMIN') {
      query.name = { $ne: 'SUPER_ADMIN' };
    }
    const roles = await Role.find(query).sort({ name: 1 });
    res.status(200).json({ success: true, data: roles });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const getPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.find();
    res.status(200).json({ success: true, data: permissions });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// ==========================================
// AUDIT & SECURITY LOGS
// ==========================================

const getAuditLogs = async (req, res, next) => {
  try {
    let query = {};

    // Multi-tenant logging boundaries
    if (['DOCTOR_ADMIN', 'ADMIN'].includes(req.user.roleId.name)) {
      const userIds = await User.find({ hospitalId: req.user.hospitalId }).select('_id');
      query.userId = { $in: userIds.map(u => u._id) };
    } else if (req.user.roleId.name !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const logs = await AuditLog.find(query)
      .populate('userId', 'name employeeCode mobileNumber')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const getLoginHistory = async (req, res, next) => {
  try {
    let query = {};
    if (['DOCTOR_ADMIN', 'ADMIN'].includes(req.user?.roleId?.name)) {
      const userIds = await User.find({ hospitalId: req.user.hospitalId }).select('_id');
      query.userId = { $in: userIds.map(u => u._id) };
    }
    const logs = await AuditLog.find(query)
      .populate('userId', 'name employeeCode mobileNumber email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    res.status(200).json({ success: true, data: [] });
  }
};

/**
 * @desc    Activate Hospital Plan & Create Primary Admin User
 * @route   PUT /api/admin/hospitals/:id/activate
 * @access  Private (Super Admin Only)
 */
const activateHospitalPlan = async (req, res, next) => {
  const { id } = req.params;
  const { planName, opdOperationMode, planType, subscriptionDuration } = req.body;

  try {
    const hospital = await Hospital.findById(id);
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }

    // Set plan attributes and change status to active
    hospital.status = 'active';
    if (opdOperationMode) {
      const mode = opdOperationMode === 'TOKEN_ONLY' ? 'TOKEN_ONLY' : 'FULL_DIGITAL';
      hospital.opdOperationMode = mode;
      hospital.featureModules.set('digitalPrescription', mode === 'FULL_DIGITAL');
      hospital.featureModules.set('doctorConsultationDesk', mode === 'FULL_DIGITAL');
    }
    hospital.planName = planName || hospital.planName || ((hospital.opdOperationMode === 'TOKEN_ONLY') ? 'Plan 1: OPD Token Generation & Queue Suite' : 'Plan 2: Complete Digital OPD Suite');
    hospital.planType = planType || hospital.planType || 'Monthly';
    if (subscriptionDuration) {
      hospital.subscriptionDuration = subscriptionDuration;
    }
    if (!hospital.activationDate) {
      hospital.activationDate = new Date();
    }
    await hospital.save();

    // 2. Connect dynamically to the new tenant DB and seed it
    const adminUser = await seedTenantAdminUser(hospital);

    await logAudit(req.user._id, 'ACTIVATE_HOSPITAL_PLAN', 'HOSPITAL', {
      hospitalId: hospital._id,
      planName: hospital.planName,
      adminUserId: adminUser?._id
    }, req);

    res.status(200).json({
      success: true,
      message: 'Hospital plan activated and administrator account successfully created!',
      data: hospital
    });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const Plan = require('../models/Plan');

// GET /api/admin/plans
const getPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find();
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// POST /api/admin/plans
const createPlan = async (req, res, next) => {
  const { name, code, description, price, billingCycle, features } = req.body;
  try {
    const existing = await Plan.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Plan code already exists' });
    }
    const plan = await Plan.create({
      name,
      code: code.toUpperCase(),
      description,
      price,
      billingCycle,
      features
    });
    await logAudit(req.user._id, 'CREATE_PLAN', 'PLAN', { planId: plan._id, code: plan.code }, req);
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// PUT /api/admin/plans/:id
const updatePlan = async (req, res, next) => {
  const { id } = req.params;
  const { name, description, price, billingCycle, features } = req.body;
  try {
    const plan = await Plan.findByIdAndUpdate(
      id,
      { name, description, price, billingCycle, features },
      { new: true, runValidators: true }
    );
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    await logAudit(req.user._id, 'UPDATE_PLAN', 'PLAN', { planId: plan._id, code: plan.code }, req);
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// PUT /api/admin/plans/:id/status
const updatePlanStatus = async (req, res, next) => {
  const { id } = req.params;
  const { isActive } = req.body;
  try {
    const plan = await Plan.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, runValidators: true }
    );
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    await logAudit(req.user._id, 'UPDATE_PLAN_STATUS', 'PLAN', { planId: plan._id, code: plan.code, isActive }, req);
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// DELETE /api/admin/plans/:id
const deletePlan = async (req, res, next) => {
  const { id } = req.params;
  try {
    const plan = await Plan.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    await logAudit(req.user._id, 'DELETE_PLAN', 'PLAN', { planId: plan._id, code: plan.code }, req);
    res.status(200).json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// UPDATE /api/admin/hospitals/:id
const updateHospital = async (req, res, next) => {
  const { id } = req.params;
  const { name, address, contactCountryCode, contactNumber, email, hospitalType, registrationNumber, gstNumber, ownerName, ownerCountryCode, ownerMobile, logo, opdOperationMode, planName, ipd_requested } = req.body;
  try {
    const updateData = { name, address, contactCountryCode, contactNumber, email, hospitalType, registrationNumber, gstNumber, ownerName, ownerCountryCode, ownerMobile, logo };
    if (ipd_requested !== undefined) {
      updateData.ipd_requested = Boolean(ipd_requested);
      if (!ipd_requested) {
        updateData['featureModules.IPD'] = false;
      }
    }
    if (opdOperationMode) {
      const mode = opdOperationMode === 'TOKEN_ONLY' ? 'TOKEN_ONLY' : 'FULL_DIGITAL';
      updateData.opdOperationMode = mode;
      updateData['featureModules.digitalPrescription'] = mode === 'FULL_DIGITAL';
      updateData['featureModules.doctorConsultationDesk'] = mode === 'FULL_DIGITAL';
      if (planName) updateData.planName = planName;
    }
    const hospital = await Hospital.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    if (hospital && ownerName && ownerName.trim()) {
      const adminRole = await Role.findOne({ name: 'DOCTOR_ADMIN' });
      if (adminRole) {
        await User.updateMany(
          { hospitalId: hospital._id, roleId: adminRole._id },
          { $set: { name: ownerName.trim() } }
        );
      }
    }

    await logAudit(req.user._id, 'UPDATE_HOSPITAL', 'HOSPITAL', { hospitalId: hospital._id, code: hospital.code }, req);
    res.status(200).json({ success: true, data: hospital });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// DELETE /api/admin/hospitals/:id
const deleteHospital = async (req, res, next) => {
  const { id } = req.params;
  try {
    const hospital = await Hospital.findByIdAndDelete(id);
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }

    await logAudit(req.user._id, 'DELETE_HOSPITAL', 'HOSPITAL', { hospitalId: hospital._id, code: hospital.code }, req);
    res.status(200).json({ success: true, message: 'Hospital deleted successfully' });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// PUT /api/admin/hospitals/:id/features
const toggleHospitalFeatures = async (req, res, next) => {
  const { id } = req.params;
  const { featureModules } = req.body;
  try {
    const hospital = await Hospital.findById(id);
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    if (featureModules && (featureModules.IPD === true || featureModules['IPD'] === true) && !hospital.ipd_requested) {
      return res.status(400).json({ success: false, message: 'Cannot enable IPD module because IPD was not requested during hospital registration.' });
    }
    hospital.featureModules = featureModules;
    await hospital.save();

    await logAudit(req.user._id, 'TOGGLE_HOSPITAL_FEATURES', 'HOSPITAL', { hospitalId: hospital._id, featureModules }, req);
    res.status(200).json({ success: true, data: hospital });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// PUT /api/admin/hospitals/:id/status
const toggleHospitalStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const hospital = await Hospital.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }

    // Sync status of users in the tenant database
    try {
      const { getTenantConnection } = require('../utils/dbManager');
      const { tenantLocalStorage } = require('../utils/tenantModel');
      const User = require('../models/User');
      const conn = await getTenantConnection(hospital.code);

      await tenantLocalStorage.run({ connection: conn }, async () => {
        if (status === 'inactive') {
          // Deactivate all users in tenant database when hospital is deactivated
          await User.updateMany({}, { $set: { status: 'inactive' } });
        } else if (status === 'active') {
          // Activate the primary hospital admin user when hospital is activated
          await User.updateOne({ mobileNumber: hospital.adminMobile }, { $set: { status: 'active' } });
        }
      });
    } catch (tenantErr) {
      console.error('Failed to sync user status in tenant database:', tenantErr);
    }

    await logAudit(req.user._id, 'TOGGLE_HOSPITAL_STATUS', 'HOSPITAL', { hospitalId: hospital._id, status }, req);
    res.status(200).json({ success: true, data: hospital });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// License Management Controllers
const License = require('../models/License');

const getLicenses = async (req, res, next) => {
  try {
    const licenses = await License.find().populate('hospitalId', 'name code');
    res.status(200).json({ success: true, data: licenses });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const createLicense = async (req, res, next) => {
  const { hospitalId, subYears, subMonths } = req.body;
  try {
    // Generate a license key: VZH-XXXXX-XXXXX-XXXXX
    const crypto = require('crypto');
    const key = `VZH-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + (parseInt(subYears) || 0));
    expiryDate.setMonth(expiryDate.getMonth() + (parseInt(subMonths) || 0));

    const license = await License.create({
      licenseKey: key,
      hospitalId,
      expiryDate,
      status: 'active'
    });

    await logAudit(req.user._id, 'CREATE_LICENSE', 'LICENSE', { licenseId: license._id, key }, req);
    res.status(201).json({ success: true, data: license });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const renewLicense = async (req, res, next) => {
  const { id } = req.params;
  const { subYears, subMonths } = req.body;
  try {
    const license = await License.findById(id);
    if (!license) {
      return res.status(404).json({ success: false, message: 'License key not found' });
    }
    const newExpiry = new Date(license.expiryDate);
    newExpiry.setFullYear(newExpiry.getFullYear() + (parseInt(subYears) || 0));
    newExpiry.setMonth(newExpiry.getMonth() + (parseInt(subMonths) || 0));

    license.expiryDate = newExpiry;
    license.status = 'active';
    await license.save();

    await logAudit(req.user._id, 'RENEW_LICENSE', 'LICENSE', { licenseId: license._id }, req);
    res.status(200).json({ success: true, data: license });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// Platform Settings Controllers
const SystemSetting = require('../models/SystemSetting');

const getSettings = async (req, res, next) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({});
    }
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const saveSettings = async (req, res, next) => {
  const { smtp, smsGateway, whatsApp, backup, timezone, currency, companyProfile } = req.body;
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }
    if (smtp) settings.smtp = smtp;
    if (smsGateway) settings.smsGateway = smsGateway;
    if (whatsApp) settings.whatsApp = whatsApp;
    if (backup) settings.backup = backup;
    if (timezone) settings.timezone = timezone;
    if (currency) settings.currency = currency;
    if (companyProfile) settings.companyProfile = companyProfile;

    await settings.save();
    await logAudit(req.user._id, 'UPDATE_SETTINGS', 'SETTINGS', {}, req);
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// SERVICE CRUD (Tenant database)
const Service = require('../models/Service');
const { isFeatureModuleEnabled } = require('../utils/featureUtils');

const validateServiceFeature = async (hospitalId, serviceType) => {
  if (!serviceType) return null;
  const sType = serviceType.toString().trim();
  if (sType === 'Laboratory') {
    const hospital = await Hospital.findById(hospitalId);
    if (!isFeatureModuleEnabled(hospital, 'Laboratory')) {
      return 'Laboratory module is not enabled for this hospital by Super Admin';
    }
  } else if (sType === 'Radiology') {
    const hospital = await Hospital.findById(hospitalId);
    if (!isFeatureModuleEnabled(hospital, 'Radiology')) {
      return 'Radiology module is not enabled for this hospital by Super Admin';
    }
  }
  return null;
};

const getServices = async (req, res, next) => {
  try {
    const services = await Service.find();
    res.status(200).json({ success: true, data: services });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const createService = async (req, res, next) => {
  const { name, code, serviceType, category, price, description, status } = req.body;
  try {
    const featureErr = await validateServiceFeature(req.user?.hospitalId, serviceType);
    if (featureErr) {
      return res.status(403).json({ success: false, message: featureErr });
    }
    const service = await Service.create({
      name,
      code,
      serviceType: serviceType || 'General',
      category: category || 'General',
      price,
      description,
      status: status || 'active'
    });
    await logAudit(req.user._id, 'CREATE_SERVICE', 'SERVICE', { serviceId: service._id, name, serviceType, category }, req);
    res.status(201).json({ success: true, data: service });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const updateService = async (req, res, next) => {
  const { id } = req.params;
  const { name, code, serviceType, category, price, description, status } = req.body;
  try {
    if (serviceType) {
      const featureErr = await validateServiceFeature(req.user?.hospitalId, serviceType);
      if (featureErr) {
        return res.status(403).json({ success: false, message: featureErr });
      }
    }
    const service = await Service.findByIdAndUpdate(
      id,
      {
        name,
        code,
        serviceType: serviceType || 'General',
        category: category || 'General',
        price,
        description,
        status: status || 'active'
      },
      { new: true, runValidators: true }
    );
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    await logAudit(req.user._id, 'UPDATE_SERVICE', 'SERVICE', { serviceId: service._id, serviceType, category }, req);
    res.status(200).json({ success: true, data: service });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const deleteService = async (req, res, next) => {
  const { id } = req.params;
  try {
    const service = await Service.findByIdAndDelete(id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    await logAudit(req.user._id, 'DELETE_SERVICE', 'SERVICE', { serviceId: service._id }, req);
    res.status(200).json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// DOCTOR PROFILE CONFIGURATION (Tenant database)
const updateDoctorProfile = async (req, res, next) => {
  const { id } = req.params;
  const { qualification, specialization, experience, consultationFee, consultationFees, prescriptionPrintConfig } = req.body;
  try {
    const doctor = await User.findById(id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor account not found' });
    }

    const currentProfile = doctor.doctorProfile || {};

    doctor.doctorProfile = {
      qualification: qualification !== undefined ? qualification : currentProfile.qualification,
      specialization: specialization !== undefined ? specialization : currentProfile.specialization,
      experience: experience !== undefined ? parseInt(experience) : currentProfile.experience,
      consultationFee: consultationFee !== undefined ? parseFloat(consultationFee) : currentProfile.consultationFee,
      consultationFees: consultationFees ? { ...currentProfile.consultationFees, ...consultationFees } : currentProfile.consultationFees,
      prescriptionPrintConfig: prescriptionPrintConfig ? { ...currentProfile.prescriptionPrintConfig, ...prescriptionPrintConfig } : currentProfile.prescriptionPrintConfig
    };

    await doctor.save();
    await logAudit(req.user._id, 'UPDATE_DOCTOR_PROFILE', 'USER', { doctorId: doctor._id }, req);
    res.status(200).json({ success: true, data: doctor });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// HOSPITAL PROFILE UPDATE (Central database)
const updateHospitalProfile = async (req, res, next) => {
  const { id } = req.params;
  const { logo, registrationNumber, gstNumber, address, contactCountryCode, contactNumber, email, website, printConfiguration } = req.body;
  try {
    const updateData = {};
    if (logo !== undefined) updateData.logo = logo;
    if (registrationNumber !== undefined) updateData.registrationNumber = registrationNumber;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber;
    if (address !== undefined) updateData.address = address;
    if (contactCountryCode !== undefined) updateData.contactCountryCode = contactCountryCode;
    if (contactNumber !== undefined) updateData.contactNumber = contactNumber;
    if (email !== undefined) updateData.email = email;
    if (website !== undefined) updateData.website = website;
    if (printConfiguration !== undefined) updateData.printConfiguration = printConfiguration;

    const hospital = await Hospital.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    await logAudit(req.user._id, 'UPDATE_HOSPITAL_PROFILE', 'HOSPITAL', { hospitalId: hospital._id }, req);
    res.status(200).json({ success: true, data: hospital });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// UPDATE USER DETAILS
const updateUser = async (req, res, next) => {
  const { id } = req.params;
  const {
    name,
    countryCode,
    mobileNumber,
    pin,
    roleId,
    branchId,
    departmentId,
    doctorProfile,
    nurseProfile,
    pharmacistProfile,
    labTechProfile,
    billingProfile,
    receptionistProfile
  } = req.body;
  try {
    const User = require('../models/User');
    const cleanDeptId = (departmentId === "" || !departmentId) ? null : departmentId;
    const updateData = { name, countryCode, mobileNumber, roleId, branchId, departmentId: cleanDeptId };

    if (doctorProfile) updateData.doctorProfile = doctorProfile;
    if (nurseProfile) updateData.nurseProfile = nurseProfile;
    if (pharmacistProfile) updateData.pharmacistProfile = pharmacistProfile;
    if (labTechProfile) updateData.labTechProfile = labTechProfile;
    if (billingProfile) updateData.billingProfile = billingProfile;
    if (receptionistProfile) updateData.receptionistProfile = receptionistProfile;

    if (pin) {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      updateData.pin = await bcrypt.hash(pin, salt);
    }

    const user = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    await logAudit(req.user._id, 'UPDATE_USER', 'USER', { userId: user._id }, req);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// DELETE USER
const deleteUser = async (req, res, next) => {
  const { id } = req.params;
  try {
    const User = require('../models/User');
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    await logAudit(req.user._id, 'DELETE_USER', 'USER', { userId: user._id, employeeCode: user.employeeCode }, req);
    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const getBillingSettings = async (req, res, next) => {
  try {
    const Hospital = require('../models/Hospital');
    const hospitalId = req.user.hospitalId?._id || req.user.hospitalId;
    let hospital;
    if (hospitalId) {
      hospital = await Hospital.findById(hospitalId);
    }
    if (!hospital && req.user.hospitalCode) {
      hospital = await Hospital.findOne({ code: req.user.hospitalCode.toUpperCase() });
    }
    if (!hospital) {
      hospital = await Hospital.findOne({});
    }
    const defaults = {
      feeCollectionRole: 'Reception',
      consultationFeeType: 'Predefined',
      paymentTiming: 'Before Consultation',
      collectMedicineInPharmacy: true,
      enableConsolidatedBilling: true,
      prescriptionDelivery: 'internal_pharmacy',
      enableEmergencyModule: false,
      allowUnknownPatients: true,
      emergencyQueuePriority: 'OVERRIDE',
      emergencyTokenPrefix: 'EMG',
      emergencyBillingPolicy: 'POSTPONE'
    };
    const defaultQueueRules = {
      allowWalkInRegistration: true,
      tokenPrefix: 'OP'
    };
    const settings = {
      ...defaults,
      ...(hospital?.billingWorkflowSettings || {}),
      opdOperationMode: hospital?.opdOperationMode || 'TOKEN_ONLY',
      planName: hospital?.planName || (hospital?.opdOperationMode === 'FULL_DIGITAL' ? 'Plan 2: Complete Digital OPD Suite' : 'Plan 1: Token Generation & Queue Management'),
      queueRulesSettings: hospital?.queueRulesSettings || defaultQueueRules
    };
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const updateBillingSettings = async (req, res, next) => {
  try {
    const Hospital = require('../models/Hospital');
    const hospitalId = req.user.hospitalId?._id || req.user.hospitalId;
    let hospital;
    if (hospitalId) {
      hospital = await Hospital.findById(hospitalId);
    }
    if (!hospital) {
      hospital = await Hospital.findOne({});
    }
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital profile not found' });
    }

    const { validateBillingConfiguration } = require('../utils/billingWorkflowValidator');

    const validation = validateBillingConfiguration(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message || 'Invalid billing configuration'
      });
    }

    const {
      feeCollectionRole,
      consultationFeeType,
      paymentTiming,
      collectMedicineInPharmacy,
      enableConsolidatedBilling,
      prescriptionDelivery,
      enableEmergencyModule,
      allowUnknownPatients,
      emergencyQueuePriority,
      emergencyTokenPrefix,
      notifyDoctorAlert,
      notifyDisplayBoard,
      notifyVoiceAnnouncement,
      emergencyBillingPolicy,
      queueRulesSettings,
      opdOperationMode,
      planName
    } = req.body;

    const validatedSettings = validation.sanitized;

    hospital.billingWorkflowSettings = {
      ...(hospital.billingWorkflowSettings || {}),
      feeCollectionRole: validatedSettings.feeCollectionRole,
      consultationFeeType: validatedSettings.consultationFeeType,
      paymentTiming: validatedSettings.paymentTiming,
      collectMedicineInPharmacy: validatedSettings.collectMedicineInPharmacy,
      enableConsolidatedBilling: enableConsolidatedBilling !== undefined ? enableConsolidatedBilling : true,
      prescriptionDelivery: prescriptionDelivery || 'internal_pharmacy',
      enableEmergencyModule: enableEmergencyModule !== undefined ? enableEmergencyModule : false,
      allowUnknownPatients: allowUnknownPatients !== undefined ? allowUnknownPatients : true,
      emergencyQueuePriority: emergencyQueuePriority || 'OVERRIDE',
      emergencyTokenPrefix: emergencyTokenPrefix || 'EMG',
      notifyDoctorAlert: notifyDoctorAlert !== undefined ? notifyDoctorAlert : true,
      notifyDisplayBoard: notifyDisplayBoard !== undefined ? notifyDisplayBoard : true,
      notifyVoiceAnnouncement: notifyVoiceAnnouncement !== undefined ? notifyVoiceAnnouncement : true,
      emergencyBillingPolicy: emergencyBillingPolicy || 'POSTPONE'
    };

    if (opdOperationMode) {
      const mode = opdOperationMode === 'TOKEN_ONLY' ? 'TOKEN_ONLY' : 'FULL_DIGITAL';
      hospital.opdOperationMode = mode;
      hospital.featureModules.set('digitalPrescription', mode === 'FULL_DIGITAL');
      hospital.featureModules.set('doctorConsultationDesk', mode === 'FULL_DIGITAL');
      if (planName) hospital.planName = planName;
    }

    if (queueRulesSettings) {
      hospital.queueRulesSettings = { ...hospital.queueRulesSettings, ...queueRulesSettings };
    }

    await hospital.save();
    await logAudit(req.user._id, 'UPDATE_BILLING_SETTINGS', 'HOSPITAL', { hospitalId: hospital._id }, req);

    res.status(200).json({
      success: true,
      data: {
        ...hospital.billingWorkflowSettings,
        opdOperationMode: hospital.opdOperationMode,
        planName: hospital.planName,
        queueRulesSettings: hospital.queueRulesSettings
      }
    });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// ==========================================
// PRESCRIPTION PRINT TEMPLATE CONTROLLERS
// ==========================================

const getPrintTemplates = async (req, res, next) => {
  const { hospitalId } = req.params;
  try {
    // Multi-tenant security isolation check
    if (req.user.roleId?.name !== 'SUPER_ADMIN' && req.user.hospitalId?.toString() !== hospitalId) {
      return res.status(403).json({ success: false, message: 'Access denied to target hospital templates' });
    }
    const templates = await PrescriptionPrintTemplate.find({ hospitalId }).sort({ isDefault: -1, updatedAt: -1 });
    res.status(200).json({ success: true, data: templates });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const getActivePrintTemplate = async (req, res, next) => {
  const { hospitalId } = req.params;
  try {
    // Multi-tenant security isolation check scoped by hospitalId (Allow staff/doctors fetching active print configuration)
    const userHospitalId = req.user.hospitalId?._id?.toString() || req.user.hospitalId?.toString() || req.user.hospital?._id?.toString() || req.user.hospital?.toString();
    if (req.user.roleId?.name !== 'SUPER_ADMIN' && userHospitalId && userHospitalId !== hospitalId) {
      // Log soft warning and resolve active template for targeted hospitalId
      console.warn(`[getActivePrintTemplate] User hospitalId ${userHospitalId} requested template for hospitalId ${hospitalId}`);
    }

    // Query authoritative source: PrescriptionPrintTemplate { hospitalId, isDefault: true, status: 'ACTIVE' }
    let template = await PrescriptionPrintTemplate.findOne({ hospitalId, status: 'ACTIVE', isDefault: true }).sort({ updatedAt: -1 });
    if (!template) {
      template = await PrescriptionPrintTemplate.findOne({ hospitalId, status: 'ACTIVE' }).sort({ updatedAt: -1 });
    }
    if (!template) {
      template = await PrescriptionPrintTemplate.findOne({ hospitalId }).sort({ updatedAt: -1 });
    }

    // Migration: If no active template exists, check Hospital profile printMode or create STANDARD default
    if (!template) {
      const Hospital = require('../models/Hospital');
      const hProfile = await Hospital.findById(hospitalId);
      const initialMode = hProfile?.printConfiguration?.printMode || 'STANDARD';

      template = await PrescriptionPrintTemplate.create({
        hospitalId,
        name: 'General OPD Prescription',
        mode: initialMode,
        isDefault: true,
        status: 'ACTIVE',
        version: 1
      });
    }

    res.status(200).json({ success: true, data: template });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const createPrintTemplate = async (req, res, next) => {
  const { hospitalId } = req.params;
  const body = req.body;
  try {
    // Multi-tenant security isolation check
    const userHospitalId = req.user.hospitalId?._id?.toString() || req.user.hospitalId?.toString() || req.user.hospital?._id?.toString() || req.user.hospital?.toString();
    if (req.user.roleId?.name !== 'SUPER_ADMIN' && userHospitalId && userHospitalId !== hospitalId) {
      return res.status(403).json({ success: false, message: 'Access denied to create templates for target hospital' });
    }
    if (body.isDefault !== false) {
      await PrescriptionPrintTemplate.updateMany({ hospitalId }, { isDefault: false });
    }
    const template = await PrescriptionPrintTemplate.create({
      ...body,
      hospitalId,
      createdBy: req.user?._id,
      updatedBy: req.user?._id
    });

    if (template && template.isDefault) {
      await Hospital.findByIdAndUpdate(hospitalId, {
        $set: {
          'printConfiguration.printMode': template.mode,
          'printConfiguration.paperSize': template.paperSize,
          'printConfiguration.orientation': template.orientation,
          'printConfiguration.margins': template.margins
        }
      });
    }

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const updatePrintTemplate = async (req, res, next) => {
  const { id } = req.params;
  const body = req.body;
  try {
    const existing = await PrescriptionPrintTemplate.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Print template not found' });
    }

    const userHospitalId = req.user.hospitalId?._id?.toString() || req.user.hospitalId?.toString() || req.user.hospital?._id?.toString() || req.user.hospital?.toString();
    if (req.user.roleId?.name !== 'SUPER_ADMIN' && userHospitalId && userHospitalId !== existing.hospitalId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied to update template' });
    }

    if (body.isDefault !== false) {
      await PrescriptionPrintTemplate.updateMany({ hospitalId: existing.hospitalId }, { isDefault: false });
    }

    const updated = await PrescriptionPrintTemplate.findByIdAndUpdate(
      id,
      { ...body, updatedBy: req.user?._id },
      { new: true, runValidators: true }
    );

    // Sync active mode and settings to Hospital document to maintain consistency across legacy endpoints
    if (updated && updated.isDefault) {
      await Hospital.findByIdAndUpdate(existing.hospitalId, {
        $set: {
          'printConfiguration.printMode': updated.mode,
          'printConfiguration.paperSize': updated.paperSize,
          'printConfiguration.orientation': updated.orientation,
          'printConfiguration.margins': updated.margins
        }
      });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const activatePrintTemplate = async (req, res, next) => {
  const { id } = req.params;
  try {
    const template = await PrescriptionPrintTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    if (req.user.roleId?.name !== 'SUPER_ADMIN' && req.user.hospitalId?.toString() !== template.hospitalId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied to activate template' });
    }

    await PrescriptionPrintTemplate.updateMany({ hospitalId: template.hospitalId }, { isDefault: false });
    template.isDefault = true;
    template.status = 'ACTIVE';
    template.updatedBy = req.user?._id;
    await template.save();

    await Hospital.findByIdAndUpdate(template.hospitalId, {
      $set: {
        'printConfiguration.printMode': template.mode,
        'printConfiguration.paperSize': template.paperSize,
        'printConfiguration.orientation': template.orientation,
        'printConfiguration.margins': template.margins
      }
    });

    res.status(200).json({ success: true, data: template });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

const duplicatePrintTemplate = async (req, res, next) => {
  const { id } = req.params;
  try {
    const existing = await PrescriptionPrintTemplate.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const dupObj = existing.toObject();
    delete dupObj._id;
    delete dupObj.createdAt;
    delete dupObj.updatedAt;

    dupObj.name = `${existing.name} (Copy)`;
    dupObj.isDefault = false;
    dupObj.status = 'DRAFT';
    dupObj.version = (existing.version || 1) + 1;
    dupObj.createdBy = req.user?._id;
    dupObj.updatedBy = req.user?._id;

    const newTemplate = await PrescriptionPrintTemplate.create(dupObj);
    res.status(201).json({ success: true, data: newTemplate });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

// UPDATE HOSPITAL GEOLOCATION SETTINGS
const updateHospitalGeolocation = async (req, res, next) => {
  const { id } = req.params;
  const { enabled, latitude, longitude, radiusMeters, enforceRoles, allowBypassWithPin } = req.body;
  try {
    const Hospital = require('../models/Hospital');
    const hospital = await Hospital.findById(id);
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }

    // Role check: Only SUPER_ADMIN or DOCTOR_ADMIN of this hospital can update geolocation settings
    if (req.user.roleId?.name !== 'SUPER_ADMIN' && req.user.hospitalId?.toString() !== id) {
      return res.status(403).json({ success: false, message: 'Access denied: Cannot configure geolocation for another hospital' });
    }

    // Validation when geofencing is enabled
    if (enabled) {
      const latNum = latitude !== undefined && latitude !== null ? parseFloat(latitude) : hospital.geolocationSettings?.latitude;
      const lngNum = longitude !== undefined && longitude !== null ? parseFloat(longitude) : hospital.geolocationSettings?.longitude;
      const radNum = radiusMeters !== undefined ? parseInt(radiusMeters) : (hospital.geolocationSettings?.radiusMeters || 300);

      if (latNum === undefined || latNum === null || isNaN(latNum) || latNum < -90 || latNum > 90) {
        return res.status(400).json({ success: false, message: 'Please capture or enter valid hospital location coordinates (-90 to 90) before enabling geofence.' });
      }
      if (lngNum === undefined || lngNum === null || isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        return res.status(400).json({ success: false, message: 'Please capture or enter valid hospital location coordinates (-180 to 180) before enabling geofence.' });
      }
      if (isNaN(radNum) || radNum <= 0) {
        return res.status(400).json({ success: false, message: 'Please provide a valid radius greater than 0 meters before enabling geofence.' });
      }
    }

    const currentGeo = hospital.geolocationSettings || {};
    hospital.geolocationSettings = {
      enabled: enabled !== undefined ? enabled : currentGeo.enabled,
      latitude: latitude !== undefined ? (latitude === null || latitude === '' ? null : parseFloat(latitude)) : currentGeo.latitude,
      longitude: longitude !== undefined ? (longitude === null || longitude === '' ? null : parseFloat(longitude)) : currentGeo.longitude,
      radiusMeters: radiusMeters !== undefined ? parseInt(radiusMeters) : (currentGeo.radiusMeters || 300),
      enforceRoles: enforceRoles || currentGeo.enforceRoles || ['RECEPTIONIST', 'BILLING_CLERK'],
      allowBypassWithPin: allowBypassWithPin !== undefined ? allowBypassWithPin : true
    };

    await hospital.save();
    await logAudit(req.user._id, 'UPDATE_HOSPITAL_GEOLOCATION', 'HOSPITAL', { hospitalId: hospital._id, geolocationSettings: hospital.geolocationSettings }, req);

    res.status(200).json({
      success: true,
      message: 'Hospital GPS Geofence settings updated successfully',
      data: hospital.geolocationSettings
    });
  } catch (error) {
    console.error('ERROR:', error);
    next(error);
  }
};

module.exports = {
  seedTenantAdminUser,
  createHospital,
  getHospitals,
  activateHospitalPlan,
  createBranch,
  getBranches,
  updateBranch,
  createDepartment,
  getDepartments,
  updateDepartment,
  deleteDepartment,
  getUsers,
  updateUserStatus,
  getRoles,
  getPermissions,
  getAuditLogs,
  getLoginHistory,
  getPlans,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan,
  updateHospital,
  deleteHospital,
  toggleHospitalFeatures,
  toggleHospitalStatus,
  getLicenses,
  createLicense,
  renewLicense,
  getSettings,
  saveSettings,
  getServices,
  createService,
  updateService,
  deleteService,
  updateDoctorProfile,
  updateHospitalProfile,
  updateUser,
  deleteUser,
  getBillingSettings,
  updateBillingSettings,
  getPrintTemplates,
  getActivePrintTemplate,
  createPrintTemplate,
  updatePrintTemplate,
  activatePrintTemplate,
  duplicatePrintTemplate,
  updateHospitalGeolocation
};
