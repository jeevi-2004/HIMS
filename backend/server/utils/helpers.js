const Hospital = require('../models/Hospital');
const Branch = require('../models/Branch');
const User = require('../models/User');

/**
 * Generate a unique Hospital Code (e.g., VZH001)
 */
const generateHospitalCode = async () => {
  const count = await Hospital.countDocuments();
  const index = count + 1;
  return `VZH${String(index).padStart(3, '0')}`;
};

/**
 * Generate a unique Branch Code based on parent hospital code (e.g., VZH-B01, VZH-B02)
 */
const generateBranchCode = async (hospitalId, hospitalCode = 'VZH') => {
  const prefix = (hospitalCode || 'VZH').toUpperCase();
  const Branch = require('../models/Branch');

  const existingBranches = await Branch.find({
    code: new RegExp(`^${prefix}-B\\d+$`, 'i')
  }).select('code');

  let maxIndex = 0;
  for (const b of existingBranches) {
    if (b.code) {
      const match = b.code.match(/-B(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxIndex) {
          maxIndex = num;
        }
      }
    }
  }

  let nextIndex = maxIndex + 1;
  let candidateCode = `${prefix}-B${String(nextIndex).padStart(2, '0')}`;

  while (await Branch.findOne({ code: candidateCode })) {
    nextIndex++;
    candidateCode = `${prefix}-B${String(nextIndex).padStart(2, '0')}`;
  }

  return candidateCode;
};

/**
 * Generate a unique Employee Code based on Hospital Code (e.g., VZH1, VZH2, VZK1)
 */
const generateEmployeeCode = async (hospitalCode = 'VZH') => {
  const prefix = (hospitalCode || 'VZH').toUpperCase();
  const regex = new RegExp(`^${prefix}\\d+$`, 'i');

  const docs = await User.collection
    .find({ employeeCode: regex })
    .toArray();

  let maxIndex = 0;
  for (const doc of docs) {
    if (doc.employeeCode) {
      const numPart = doc.employeeCode.replace(new RegExp(`^${prefix}`, 'i'), '');
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > maxIndex) {
        maxIndex = parsed;
      }
    }
  }

  const nextIndex = maxIndex + 1;
  return `${prefix}${nextIndex}`;
};

module.exports = {
  generateHospitalCode,
  generateBranchCode,
  generateEmployeeCode
};
