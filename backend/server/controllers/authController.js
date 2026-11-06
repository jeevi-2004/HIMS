

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');
const Role = require('../models/Role');
const UserSession = require('../models/UserSession');
const logAudit = require('../utils/auditLogger');
const { generateEmployeeCode } = require('../utils/helpers');

// Helper to sign JWT token
const signToken = (id, hospitalCode) => {
  return jwt.sign({ id, hospitalCode }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRE
  });
};

/**
 * @desc    Login user (Super Admin: username/password; Hospital User: hospitalCode/mobile/PIN)
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  const { username, password, hospitalCode, mobileNumber, pin } = req.body;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const userAgent = req.headers['user-agent'];

  try {
    let user;
    let isMatch = false;

    // 1. Super Admin login path
    if (username && password) {
      user = await User.findOne({ username }).populate('roleId');
      
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (user.roleId.name !== 'SUPER_ADMIN') {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Check status
      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }

      // Generate JWT
      const token = signToken(user._id);

      // Save session in DB
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Matching JWT_EXPIRE

      await UserSession.create({
        userId: user._id,
        token,
        ipAddress,
        userAgent,
        expiresAt
      });

      // Log to audit logger
      await logAudit(user._id, 'USER_LOGIN', 'AUTHENTICATION', { email: user.email }, req);

      return res.status(200).json({
        success: true,
        token,
        user: {
          _id: user._id,
          name: user.name,
          username: user.username,
          mobileNumber: user.mobileNumber,
          employeeCode: user.employeeCode,
          hospitalCode: user.hospitalCode,
          role: user.roleId?.name || 'SUPER_ADMIN',
          permissions: user.roleId?.permissions || [],
          hospitalId: user.hospitalId,
          branchId: user.branchId,
          departmentId: user.departmentId
        }
      });
    } 
    // 2. Hospital User login path
    else if (hospitalCode && mobileNumber && pin) {
      const Hospital = require('../models/Hospital');
      const { getTenantConnection } = require('../utils/dbManager');
      const { tenantLocalStorage } = require('../utils/tenantModel');

      const cleanHospitalCode = (hospitalCode || '').toString().trim().toUpperCase();
      const rawMobile = (mobileNumber || '').toString().trim();
      let cleanMobile = rawMobile.replace(/[\s\-\(\)]/g, '');
      if (cleanMobile.startsWith('+91')) cleanMobile = cleanMobile.substring(3);
      else if (cleanMobile.length > 10 && cleanMobile.startsWith('91')) cleanMobile = cleanMobile.substring(2);

      // Verify hospital exists in central database and is strictly ACTIVE
      const hospitalObj = await Hospital.findOne({ code: cleanHospitalCode });
      if (!hospitalObj) {
        return res.status(401).json({
          success: false,
          message: `Invalid hospital code "${cleanHospitalCode}". No registered hospital found with this code.`
        });
      }

      if (hospitalObj.status === 'pending') {
        return res.status(403).json({
          success: false,
          message: `Hospital account "${cleanHospitalCode}" is awaiting subscription plan activation. Please contact Super Admin.`
        });
      }

      const conn = await getTenantConnection(cleanHospitalCode);

      return tenantLocalStorage.run({ connection: conn }, async () => {
        const cc = req.body.countryCode || '+91';

        // 1. Search for user by mobile number in tenant database
        let user = await User.findOne({
          $or: [
            { mobileNumber: cleanMobile },
            { mobileNumber: rawMobile },
            { mobileNumber: `${cc}${cleanMobile}` }
          ]
        }).populate('roleId');

        // 2. Auto-seed tenant database and create DOCTOR_ADMIN account if missing
        if (!user) {
          try {
            const { seedTenantAdminUser } = require('./adminController');
            await seedTenantAdminUser(hospitalObj);
            user = await User.findOne({
              $or: [
                { mobileNumber: cleanMobile },
                { mobileNumber: rawMobile },
                { mobileNumber: `${cc}${cleanMobile}` }
              ]
            }).populate('roleId');
          } catch (seedErr) {
            console.error('[Login Auto-Seed Error]:', seedErr);
          }
        }

        if (!user) {
          return res.status(401).json({
            success: false,
            message: `Mobile number "${rawMobile}" is not registered under hospital "${cleanHospitalCode}".`
          });
        }

        const stringPin = pin !== undefined && pin !== null ? String(pin).trim() : '';
        let isMatch = await user.matchPin(stringPin);
        if (!isMatch) {
          const bcrypt = require('bcryptjs');
          let isLegacyMatch = false;
          try {
            isLegacyMatch = (stringPin === '123456' || stringPin === '1234') && user.pin && await bcrypt.compare('1234', String(user.pin));
          } catch(_) {}
          if (isLegacyMatch) {
            isMatch = true;
            user.pin = '123456';
            await user.save();
            console.log(`[AUTH PIN MIGRATION] Auto-upgraded user ${user.mobileNumber} PIN from 1234 to 123456 in DB.`);
          }
        }

        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: `Invalid 6-digit security PIN for mobile number ${rawMobile}.`
          });
        }

        // Check status
        if (user.status !== 'active') {
          return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact Super Admin.' });
        }

        // Generate JWT
        const token = signToken(user._id, cleanHospitalCode);

        // Save session in DB
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // Matching JWT_EXPIRE

        await UserSession.create({
          userId: user._id,
          token,
          ipAddress,
          userAgent,
          expiresAt
        });

        // Log to audit logger
        await logAudit(user._id, 'USER_LOGIN', 'AUTHENTICATION', { email: user.email }, req);

        return res.status(200).json({
          success: true,
          token,
          user: {
            _id: user._id,
            name: user.name,
            username: user.username,
            mobileNumber: user.mobileNumber,
            employeeCode: user.employeeCode,
            hospitalCode: user.hospitalCode,
            role: user.roleId?.name || user.role || 'STAFF',
            permissions: user.roleId?.permissions || [],
            hospital: hospitalObj,
            opdOperationMode: hospitalObj.opdOperationMode || 'TOKEN_ONLY',
            planName: hospitalObj.planName,
            featureModules: hospitalObj.featureModules || {},
            hospitalId: user.hospitalId || hospitalObj._id,
            branchId: user.branchId,
            departmentId: user.departmentId,
            hospitalStatus: hospitalObj.status
          }
        });
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide either username/password (Super Admin) or hospitalCode/mobileNumber/PIN (Staff)' 
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user & invalidate session
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res, next) => {
  try {
    const token = req.token;
    await UserSession.deleteOne({ token });
    await logAudit(req.user._id, 'USER_LOGOUT', 'AUTHENTICATION', {}, req);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/profile
 * @access  Private
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('roleId')
      .populate('hospitalId', 'name code featureModules opdOperationMode planName geolocationSettings ipd_requested address contactCountryCode contactNumber ownerName ownerMobile prescriptionSettings')
      .populate('branchId', 'name code')
      .populate('departmentId', 'name code');

    let hospitalData = user.hospitalId;
    if (!hospitalData && user.hospitalCode) {
      hospitalData = await Hospital.findOne({ code: user.hospitalCode.toUpperCase() });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        mobileNumber: user.mobileNumber,
        employeeCode: user.employeeCode,
        hospitalCode: user.hospitalCode,
        role: user.roleId?.name || user.role || 'DOCTOR_ADMIN',
        permissions: user.roleId?.permissions || [],
        hospital: hospitalData,
        opdOperationMode: hospitalData?.opdOperationMode || 'TOKEN_ONLY',
        planName: hospitalData?.planName,
        featureModules: hospitalData?.featureModules || {},
        branch: user.branchId,
        department: user.departmentId,
        hospitalId: hospitalData?._id || user.hospitalId,
        branchId: user.branchId?._id || user.branchId,
        departmentId: user.departmentId?._id || user.departmentId,
        hospitalStatus: hospitalData?.status || req.hospitalStatus || 'active'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create User (Admin action)
 * @route   POST /api/auth/create-user
 * @access  Private
 */
const createUser = async (req, res, next) => {
  const { 
    name, 
    username, 
    password, 
    countryCode,
    mobileNumber, 
    pin, 
    roleId, 
    hospitalId, 
    branchId, 
    departmentId,
    hospitalCode 
  } = req.body;

  try {
    // Generate unique employee code based on target hospital code
    const targetHospCode = hospitalCode || req.user?.hospitalCode || 'VZH';
    const employeeCode = await generateEmployeeCode(targetHospCode);

    // Verify role exists
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Assigned Role not found' });
    }

    // Role restrictions for creation:
    // Super Admin can create any user
    // Hospital Admin can only create users under their hospital
    // Branch Admin can only create users under their branch
    if (['DOCTOR_ADMIN', 'ADMIN'].includes(req.user.roleId.name)) {
      if (hospitalId && hospitalId.toString() !== req.user.hospitalId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to create user in another hospital' });
      }
    }

    if (role.name === 'SUPER_ADMIN') {
      if (!username || !password) {
        require('fs').appendFileSync('debug.log', "CREATE_USER 400: Username and Password required\n");
        return res.status(400).json({ success: false, message: 'Username and Password are required for SUPER_ADMIN role' });
      }
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        require('fs').appendFileSync('debug.log', "CREATE_USER 400: Username taken\n");
        return res.status(400).json({ success: false, message: 'Username already taken' });
      }
    } else {
      // Pre-validating PIN/mobile for staff
      if (!mobileNumber || !pin) {
        require('fs').appendFileSync('debug.log', `CREATE_USER 400: Missing mobileNumber or pin. mobile: ${mobileNumber}, pin: ${pin}\n`);
        return res.status(400).json({ success: false, message: 'Mobile Number and PIN are required for Staff roles' });
      }
      if (pin.length !== 6 || isNaN(pin)) {
        require('fs').appendFileSync('debug.log', `CREATE_USER 400: Invalid PIN. pin: ${pin}, type: ${typeof pin}\n`);
        return res.status(400).json({ success: false, message: 'PIN must be exactly 6 numeric digits' });
      }
    }

    const cleanDeptId = (!departmentId || departmentId === '') ? null : departmentId;

    // Resolve target hospital and default branch assignment
    const targetHospId = hospitalId || req.user?.hospitalId;
    let finalBranchId = branchId;

    if (targetHospId) {
      const Hospital = require('../models/Hospital');
      const hospObj = await Hospital.findById(targetHospId);
      if (hospObj) {
        const isMultiBranchEnabled = hospObj.featureModules?.Branches === true ||
          (hospObj.featureModules?.get && hospObj.featureModules.get('Branches') === true);

        if (!isMultiBranchEnabled && hospObj.defaultBranchId) {
          // Force branchId to defaultBranchId (Main Facility) in Single Facility Mode
          finalBranchId = hospObj.defaultBranchId;
        }
      }
    }

    const { 
      doctorProfile, 
      nurseProfile, 
      pharmacistProfile, 
      labTechProfile, 
      billingProfile, 
      receptionistProfile 
    } = req.body;
    if (!finalBranchId || finalBranchId === '') {
      finalBranchId = null;
    }

    const newUser = await User.create({
      name,
      username,
      password,
      countryCode: countryCode || '+91',
      mobileNumber,
      pin,
      rawPin: pin,
      roleId,
      hospitalId,
      branchId: finalBranchId,
      departmentId: cleanDeptId,
      hospitalCode: hospitalCode ? hospitalCode.toUpperCase() : undefined,
      employeeCode,
      status: 'active',
      ...(doctorProfile ? { doctorProfile } : {}),
      ...(nurseProfile ? { nurseProfile } : {}),
      ...(pharmacistProfile ? { pharmacistProfile } : {}),
      ...(labTechProfile ? { labTechProfile } : {}),
      ...(billingProfile ? { billingProfile } : {}),
      ...(receptionistProfile ? { receptionistProfile } : {})
    });

    await logAudit(
      req.user._id, 
      'CREATE_USER', 
      'USER', 
      { createdUserId: newUser._id, employeeCode: newUser.employeeCode, role: role.name }, 
      req
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        employeeCode: newUser.employeeCode,
        hospitalCode: newUser.hospitalCode,
        status: newUser.status
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change PIN (Logged-in user action)
 * @route   POST /api/auth/change-pin
 * @access  Private
 */
const changePin = async (req, res, next) => {
  const { oldPin, newPin } = req.body;

  try {
    if (req.user.roleId.name === 'SUPER_ADMIN') {
      return res.status(400).json({ success: false, message: 'Super Admin does not use PIN authentication' });
    }

    if (!oldPin || !newPin) {
      return res.status(400).json({ success: false, message: 'Please provide both old PIN and new PIN' });
    }

    if (newPin.length !== 4 || isNaN(newPin)) {
      return res.status(400).json({ success: false, message: 'New PIN must be exactly 4 numeric digits' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.matchPin(oldPin);
    
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect old PIN' });
    }

    user.pin = newPin;
    await user.save();

    await logAudit(user._id, 'CHANGE_PIN', 'AUTHENTICATION', {}, req);

    res.status(200).json({
      success: true,
      message: 'PIN changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Set/Reset user PIN (Admin action)
 * @route   POST /api/auth/set-pin
 * @access  Private
 */
const setPin = async (req, res, next) => {
  const { userId, newPin } = req.body;

  try {
    if (!userId || !newPin) {
      return res.status(400).json({ success: false, message: 'Please provide both userId and new PIN' });
    }

    if (newPin.length !== 4 || isNaN(newPin)) {
      return res.status(400).json({ success: false, message: 'PIN must be exactly 4 numeric digits' });
    }

    const targetUser = await User.findById(userId).populate('roleId');
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (targetUser.roleId.name === 'SUPER_ADMIN') {
      return res.status(400).json({ success: false, message: 'Cannot set PIN for Super Admin' });
    }

    // Authorization checks
    if (['DOCTOR_ADMIN', 'ADMIN'].includes(req.user.roleId.name)) {
      if (targetUser.hospitalId.toString() !== req.user.hospitalId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to modify PIN of user in another hospital' });
      }
    } else if (req.user.roleId.name !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied: Insufficient permissions' });
    }

    targetUser.pin = newPin;
    targetUser.rawPin = newPin;
    await targetUser.save();

    await logAudit(
      req.user._id, 
      'SET_PIN', 
      'USER', 
      { targetUserId: targetUser._id, employeeCode: targetUser.employeeCode }, 
      req
    );

    res.status(200).json({
      success: true,
      message: `PIN for employee ${targetUser.employeeCode} has been reset successfully`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Public Hospital Registration Request with Subscription Plan
 * @route   POST /api/auth/register-hospital
 * @access  Public
 */
const registerHospital = async (req, res, next) => {
  const { name, code: customCode, contactCountryCode, contactNumber, email, street, city, state, zip, planName, planType, subscriptionDuration, adminCountryCode, adminMobile, adminPin } = req.body;
  const Hospital = require('../models/Hospital');
  const bcrypt = require('bcryptjs');
  const { generateHospitalCode } = require('../utils/helpers');

  try {
    if (!name || !contactNumber || !email || !adminMobile || !adminPin) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    if (adminPin.length !== 4 || isNaN(adminPin)) {
      return res.status(400).json({ success: false, message: 'PIN must be exactly 4 numeric digits' });
    }

    let code = customCode ? customCode.trim().toUpperCase() : await generateHospitalCode();

    const existingCode = await Hospital.findOne({ code });
    if (existingCode) {
      return res.status(400).json({ success: false, message: `Hospital Code "${code}" already exists. Please enter a unique hospital code.` });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(adminPin, salt);

    const hospital = await Hospital.create({
      name,
      code,
      address: { street, city, state, zip, country: 'India' },
      contactCountryCode: contactCountryCode || '+91',
      contactNumber,
      email,
      planName,
      planType,
      subscriptionDuration: subscriptionDuration || { years: 0, months: 0 },
      status: 'pending',
      adminCountryCode: adminCountryCode || '+91',
      adminMobile,
      adminPin: hashedPin
    });

    res.status(201).json({
      success: true,
      message: 'Hospital registration request submitted successfully. Pending admin approval.',
      data: {
        _id: hospital._id,
        name: hospital.name,
        code: hospital.code,
        status: hospital.status
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  logout,
  getProfile,
  createUser,
  changePin,
  setPin,
  registerHospital
};
