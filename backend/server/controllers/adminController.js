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

const createHospital = async (req, res, next) => {
  const { name, code: customCode, address, contactCountryCode, contactNumber, email, hospitalType, registrationNumber, gstNumber, ownerName, ownerCountryCode, ownerMobile, logo } = req.body;
  try {
    let code = customCode ? customCode.trim().toUpperCase() : await generateHospitalCode();

    const existingCode = await Hospital.findOne({ code });
    if (existingCode) {
      return res.status(400).json({ success: false, message: `Hospital Code "${code}" already exists. Please enter a unique hospital code.` });
    }

    const databaseName = `hospital_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    const hospital = await Hospital.create({
      name,
      code,
      address,
      contactCountryCode,
      contactNumber,
      email,
      hospitalType: hospitalType || 'General',
      registrationNumber,
      gstNumber,
      ownerName,
      ownerCountryCode,
      ownerMobile,
      adminCountryCode: contactCountryCode || '+91',
      adminMobile: contactNumber,
      adminPin: '1234',
      databaseName,
      logo
    });
    await logAudit(req.user._id, 'CREATE_HOSPITAL', 'HOSPITAL', { hospitalId: hospital._id, code }, req);
    res.status(201).json({ success: true, data: hospital });
  } catch (error) {
    next(error);
  }
};

const getHospitals = async (req, res, next) => {
  try {
    let query = {};
    const tenantScopedRoles = ['DOCTOR_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PHARMACIST', 'NURSE', 'LABORATORY', 'BILLING'];
    if (tenantScopedRoles.includes(req.user.roleId.name)) {
      query._id = req.user.hospitalId;
    } else if (req.user.roleId.name !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const hospitals = await Hospital.find(query);
    res.status(200).json({ success: true, data: hospitals });
  } catch (error) {
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
    // Auth check: Doctor Admin can only create branches for their own hospital
    if (req.user?.roleId?.name === 'DOCTOR_ADMIN' && (!req.user.hospitalId || req.user.hospitalId.toString() !== targetHospitalId?.toString())) {
      return res.status(403).json({ success: false, message: 'Unauthorized hospital context' });
    }

    let hospitalCode = 'VZH';
    if (targetHospitalId) {
      const hospital = await Hospital.findById(targetHospitalId);
      if (hospital?.code) {
        hospitalCode = hospital.code;
      }
    }

    const code = await generateBranchCode(targetHospitalId, hospitalCode);
    const branch = await Branch.create({
      name,
      code,
      address,
      contactNumber
    });
    await logAudit(req.user._id, 'CREATE_BRANCH', 'BRANCH', { branchId: branch._id, code }, req);
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
};

const getBranches = async (req, res, next) => {
  try {
    let query = {};

    // Filter by user role permissions
    if (req.user.roleId.name !== 'SUPER_ADMIN' && req.user.roleId.name !== 'DOCTOR_ADMIN') {
      // Staff roles see their own branch
      query._id = req.user.branchId;
    }

    const branches = await Branch.find(query);
    res.status(200).json({ success: true, data: branches });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// DEPARTMENT MANAGEMENT
// ==========================================

const createDepartment = async (req, res, next) => {
  const { name, code } = req.body;
  try {
    const dept = await Department.create({
      name,
      code: code.toUpperCase()
    });

    await logAudit(req.user._id, 'CREATE_DEPARTMENT', 'DEPARTMENT', { deptId: dept._id, code: dept.code }, req);
    res.status(201).json({ success: true, data: dept });
  } catch (error) {
    next(error);
  }
};

const getDepartments = async (req, res, next) => {
  try {
    const depts = await Department.find({});
    res.status(200).json({ success: true, data: depts });
  } catch (error) {
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
    const tenantScopedRoles = ['DOCTOR_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PHARMACIST', 'NURSE', 'LABORATORY', 'BILLING'];
    if (tenantScopedRoles.includes(req.user.roleId.name)) {
      query.hospitalId = req.user.hospitalId;
    } else if (req.user.roleId.name !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Additional query filters (supports comma-separated list e.g. role=DOCTOR,DOCTOR_ADMIN)
    if (role) {
      const roleNames = role.split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
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

    const users = await User.find(query)
      .populate('roleId', 'name description')
      .populate('hospitalId', 'name code')
      .populate('branchId', 'name code')
      .populate('departmentId', 'name code')
      .select('-password -pin');

    res.status(200).json({ success: true, data: users });
  } catch (error) {
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
    if (req.user.roleId.name === 'DOCTOR_ADMIN' && user.hospitalId.toString() !== req.user.hospitalId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    user.status = status;
    await user.save();

    await logAudit(req.user._id, 'UPDATE_USER_STATUS', 'USER', { targetUserId: user._id, status }, req);

    res.status(200).json({ success: true, message: 'User status updated successfully', data: user });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// ROLE & PERMISSION MANAGEMENT
// ==========================================

const getRoles = async (req, res, next) => {
  try {
    let query = {};
    // Hospital and Branch admins cannot assign SUPER_ADMIN role
    if (req.user.roleId.name !== 'SUPER_ADMIN') {
      query.name = { $ne: 'SUPER_ADMIN' };
    }
    const roles = await Role.find(query);
    res.status(200).json({ success: true, data: roles });
  } catch (error) {
    next(error);
  }
};

const getPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.find();
    res.status(200).json({ success: true, data: permissions });
  } catch (error) {
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
    if (req.user.roleId.name === 'DOCTOR_ADMIN') {
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
    next(error);
  }
};

/**
 * @desc    Activate Hospital Plan & Create Primary Admin User
 * @route   PUT /api/admin/hospitals/:id/activate
 * @access  Private (Super Admin Only)
 */
const activateHospitalPlan = async (req, res, next) => {
  const { id } = req.params;
  const { planName, planType, subscriptionDuration } = req.body;

  try {
    const hospital = await Hospital.findById(id);
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }

    // Set plan attributes and change status to active
    hospital.status = 'active';
    hospital.planName = planName || hospital.planName || 'Basic';
    hospital.planType = planType || hospital.planType || 'Monthly';
    if (subscriptionDuration) {
      hospital.subscriptionDuration = subscriptionDuration;
    }
    if (!hospital.activationDate) {
      hospital.activationDate = new Date();
    }
    await hospital.save();

    // 2. Connect dynamically to the new tenant DB and seed it
    const { getTenantConnection } = require('../utils/dbManager');
    const { tenantLocalStorage } = require('../utils/tenantModel');
    const conn = await getTenantConnection(hospital.code);

    let adminUser;
    await tenantLocalStorage.run({ connection: conn }, async () => {
      const Permission = require('../models/Permission');
      const Role = require('../models/Role');

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

      const targetMobile = (hospital.ownerMobile || hospital.adminMobile || hospital.contactNumber || '').toString().trim();
      if (!targetMobile) {
        throw new Error('Hospital has no contact or owner mobile number configured for admin account');
      }

      const defaultPin = hospital.adminPin || '1234';
      const adminDisplayName = hospital.ownerName && hospital.ownerName.trim() ? hospital.ownerName.trim() : `${hospital.name} Admin`;

      // 1. Try finding Doctor Admin by hospitalId + DOCTOR_ADMIN role
      adminUser = await User.findOne({ hospitalId: hospital._id, roleId: adminRole._id });

      // 2. Fallback by mobileNumber
      if (!adminUser) {
        adminUser = await User.findOne({ mobileNumber: targetMobile });
      }

      if (!adminUser) {
        const empCode = `VZE-${(hospital.code || 'HOSP').replace(/[^A-Z0-9]/gi, '')}-ADMIN`;
        adminUser = await User.create({
          name: adminDisplayName,
          countryCode: hospital.ownerCountryCode || hospital.adminCountryCode || hospital.contactCountryCode || '+91',
          mobileNumber: targetMobile,
          pin: defaultPin,
          roleId: adminRole._id,
          hospitalId: hospital._id,
          hospitalCode: hospital.code.toUpperCase(),
          employeeCode: empCode,
          status: 'active'
        });
      } else {
        adminUser.name = adminDisplayName;
        adminUser.hospitalCode = hospital.code.toUpperCase();
        adminUser.countryCode = hospital.ownerCountryCode || hospital.adminCountryCode || hospital.contactCountryCode || '+91';
        adminUser.pin = defaultPin;
        adminUser.status = 'active';
        await adminUser.save();
      }
      
      hospital.adminMobile = targetMobile;
      hospital.adminPin = defaultPin;
      await hospital.save();
    });

    await logAudit(req.user._id, 'ACTIVATE_HOSPITAL_PLAN', 'HOSPITAL', {
      hospitalId: hospital._id,
      planName: hospital.planName,
      adminUserId: adminUser._id
    }, req);

    res.status(200).json({
      success: true,
      message: 'Hospital plan activated and administrator account successfully created!',
      data: hospital
    });
  } catch (error) {
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
    next(error);
  }
};

// UPDATE /api/admin/hospitals/:id
const updateHospital = async (req, res, next) => {
  const { id } = req.params;
  const { name, address, contactCountryCode, contactNumber, email, hospitalType, registrationNumber, gstNumber, ownerName, ownerCountryCode, ownerMobile, logo } = req.body;
  try {
    const hospital = await Hospital.findByIdAndUpdate(
      id,
      { name, address, contactCountryCode, contactNumber, email, hospitalType, registrationNumber, gstNumber, ownerName, ownerCountryCode, ownerMobile, logo },
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
    hospital.featureModules = featureModules;
    await hospital.save();

    await logAudit(req.user._id, 'TOGGLE_HOSPITAL_FEATURES', 'HOSPITAL', { hospitalId: hospital._id, featureModules }, req);
    res.status(200).json({ success: true, data: hospital });
  } catch (error) {
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
    next(error);
  }
};

// SERVICE CRUD (Tenant database)
const Service = require('../models/Service');

const getServices = async (req, res, next) => {
  try {
    const services = await Service.find();
    res.status(200).json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
};

const createService = async (req, res, next) => {
  const { name, code, price, description, status } = req.body;
  try {
    const service = await Service.create({ name, code, price, description, status });
    await logAudit(req.user._id, 'CREATE_SERVICE', 'SERVICE', { serviceId: service._id, name }, req);
    res.status(201).json({ success: true, data: service });
  } catch (error) {
    next(error);
  }
};

const updateService = async (req, res, next) => {
  const { id } = req.params;
  const { name, code, price, description, status } = req.body;
  try {
    const service = await Service.findByIdAndUpdate(
      id,
      { name, code, price, description, status },
      { new: true, runValidators: true }
    );
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    await logAudit(req.user._id, 'UPDATE_SERVICE', 'SERVICE', { serviceId: service._id }, req);
    res.status(200).json({ success: true, data: service });
  } catch (error) {
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
      enableEmergencyModule: true,
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
      queueRulesSettings: hospital?.queueRulesSettings || defaultQueueRules
    };
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
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
      queueRulesSettings
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
      enableEmergencyModule: enableEmergencyModule !== undefined ? enableEmergencyModule : true,
      allowUnknownPatients: allowUnknownPatients !== undefined ? allowUnknownPatients : true,
      emergencyQueuePriority: emergencyQueuePriority || 'OVERRIDE',
      emergencyTokenPrefix: emergencyTokenPrefix || 'EMG',
      notifyDoctorAlert: notifyDoctorAlert !== undefined ? notifyDoctorAlert : true,
      notifyDisplayBoard: notifyDisplayBoard !== undefined ? notifyDisplayBoard : true,
      notifyVoiceAnnouncement: notifyVoiceAnnouncement !== undefined ? notifyVoiceAnnouncement : true,
      emergencyBillingPolicy: emergencyBillingPolicy || 'POSTPONE'
    };

    if (queueRulesSettings) {
      hospital.queueRulesSettings = { ...hospital.queueRulesSettings, ...queueRulesSettings };
    }

    await hospital.save();
    await logAudit(req.user._id, 'UPDATE_BILLING_SETTINGS', 'HOSPITAL', { hospitalId: hospital._id }, req);

    res.status(200).json({
      success: true,
      data: {
        ...hospital.billingWorkflowSettings,
        queueRulesSettings: hospital.queueRulesSettings
      }
    });
  } catch (error) {
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
    next(error);
  }
};

module.exports = {
  createHospital,
  getHospitals,
  activateHospitalPlan,
  createBranch,
  getBranches,
  createDepartment,
  getDepartments,
  getUsers,
  updateUserStatus,
  getRoles,
  getPermissions,
  getAuditLogs,
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
  duplicatePrintTemplate
};
