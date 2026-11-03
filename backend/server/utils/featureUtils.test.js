const { isIpdAvailable } = require('./featureUtils');

// Simple test runner for featureUtils
const runTests = () => {
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      passed++;
      console.log(`✅ PASS: ${message}`);
    } else {
      failed++;
      console.error(`❌ FAIL: ${message}`);
    }
  };

  // Test 1: Both false
  assert(isIpdAvailable({ ipd_requested: false, featureModules: { IPD: false } }) === false, 'Should be false when both are false');
  
  // Test 2: Requested true, Enabled false
  assert(isIpdAvailable({ ipd_requested: true, featureModules: { IPD: false } }) === false, 'Should be false when requested but not enabled');

  // Test 3: Requested false, Enabled true
  assert(isIpdAvailable({ ipd_requested: false, featureModules: { IPD: true } }) === false, 'Should be false when enabled but not requested');

  // Test 4: Both true
  assert(isIpdAvailable({ ipd_requested: true, featureModules: { IPD: true } }) === true, 'Should be true when both requested and enabled');

  // Test 5: Missing featureModules
  assert(isIpdAvailable({ ipd_requested: true }) === false, 'Should be false when featureModules is missing');

  // Test 6: featureModules as Map
  const mapModules = new Map();
  mapModules.set('IPD', true);
  assert(isIpdAvailable({ ipd_requested: true, featureModules: mapModules }) === true, 'Should handle featureModules as Map');

  console.log(`\nTests completed. ${passed} passed, ${failed} failed.`);
};

runTests();
