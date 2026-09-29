const validateMobileNumber = (req, res, next) => {
  const mappings = [
    { numKey: 'mobileNumber', ccKey: 'countryCode' },
    { numKey: 'contactNumber', ccKey: 'contactCountryCode' },
    { numKey: 'adminMobile', ccKey: 'adminCountryCode' },
    { numKey: 'ownerMobile', ccKey: 'ownerCountryCode' },
    { numKey: 'phone', ccKey: 'countryCode' }
  ];

  for (const mapping of mappings) {
    if (req.body[mapping.numKey] !== undefined) {
      const mobile = req.body[mapping.numKey];
      const countryCode = req.body[mapping.ccKey] || '+91';

      if (mobile !== null && mobile !== '') {
        // Enforce Indian mobile rules: starts with 6-9, 10 digits
        if (
          typeof mobile !== 'string' ||
          !/^(?:\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/.test(mobile)
        ) {
          require('fs').appendFileSync('debug.log', `VALIDATION 400: mobile invalid: ${mobile}\n`);
          return res.status(400).json({
            success: false,
            message: 'Please enter a valid mobile number.'
          });
        }
      }
    }
  }
  next();
};

const checkUserMobileUniqueness = async (req, res, next) => {
  const { countryCode, mobileNumber } = req.body;
  if (!mobileNumber) return next();

  const cc = countryCode || '+91';

  try {
    const User = require('../models/User');
    const Patient = require('../models/Patient');

    const query = { countryCode: cc, mobileNumber };
    const id = req.params.id;

    // Check Users
    const userQuery = { ...query };
    if (id) {
      userQuery._id = { $ne: id };
    }
    const existingUser = await User.findOne(userQuery);
    if (existingUser) {
      require('fs').appendFileSync('debug.log', `VALIDATION 409: Mobile already exists: ${mobileNumber}\n`);
      return res.status(409).json({
        success: false,
        message: 'Mobile number already exists.'
      });
    }

    // Check Patients
    const patientQuery = { ...query };
    if (id) {
      patientQuery._id = { $ne: id };
    }
    const existingPatient = await Patient.findOne(patientQuery);
    if (existingPatient) {
      // If registering/booking patient via POST /patients, pass existing patient forward for seamless token generation
      if (req.originalUrl && req.originalUrl.includes('/patients') && req.method === 'POST') {
        req.existingPatient = existingPatient;
        return next();
      }
      return res.status(409).json({
        success: false,
        message: 'Mobile number already exists.'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateMobileNumber,
  checkUserMobileUniqueness
};
