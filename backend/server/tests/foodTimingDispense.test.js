const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

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

const getDefaultFoodTimingForMedicine = (medicineName = '', explicitFood = '') => {
  if (explicitFood && String(explicitFood).trim()) {
    return normalizeFoodTiming(explicitFood);
  }
  const name = String(medicineName || '').toLowerCase();
  if (/panto|omepra|rabe|esomepra|lansopra|antacid|sucralfate|levothyrox/i.test(name)) {
    return 'Before Food';
  }
  return 'After Food';
};

describe('Food Timing Normalization & Dispensing Desk Suite', () => {
  test('1. Normalizes all casing variations to canonical capitalized options', () => {
    assert.equal(normalizeFoodTiming('After food'), 'After Food');
    assert.equal(normalizeFoodTiming('before food'), 'Before Food');
    assert.equal(normalizeFoodTiming('Before Food'), 'Before Food');
    assert.equal(normalizeFoodTiming('After Food'), 'After Food');
    assert.equal(normalizeFoodTiming('With Food'), 'With Food');
    assert.equal(normalizeFoodTiming('with food'), 'With Food');
  });

  test('2. Handles medical abbreviations and empty stomach variants', () => {
    assert.equal(normalizeFoodTiming('Empty Stomach'), 'Before Food');
    assert.equal(normalizeFoodTiming('empty stomach'), 'Before Food');
    assert.equal(normalizeFoodTiming('AC'), 'Before Food');
    assert.equal(normalizeFoodTiming('ac'), 'Before Food');
    assert.equal(normalizeFoodTiming('PC'), 'After Food');
    assert.equal(normalizeFoodTiming('pc'), 'After Food');
    assert.equal(normalizeFoodTiming('CC'), 'With Food');
  });

  test('3. Prevents blank select values by defaulting missing/empty values to After Food', () => {
    assert.equal(normalizeFoodTiming(''), 'After Food');
    assert.equal(normalizeFoodTiming(null), 'After Food');
    assert.equal(normalizeFoodTiming(undefined), 'After Food');
    assert.equal(normalizeFoodTiming('   '), 'After Food');
  });

  test('4. Provides intelligent clinical defaults for antacids/PPIs vs general medicines', () => {
    assert.equal(getDefaultFoodTimingForMedicine('Pantoprazole 40mg'), 'Before Food');
    assert.equal(getDefaultFoodTimingForMedicine('Omeprazole 20mg'), 'Before Food');
    assert.equal(getDefaultFoodTimingForMedicine('Rabeprazole 20mg'), 'Before Food');
    assert.equal(getDefaultFoodTimingForMedicine('Sucralfate Suspension'), 'Before Food');
    assert.equal(getDefaultFoodTimingForMedicine('Paracetamol 650mg'), 'After Food');
    assert.equal(getDefaultFoodTimingForMedicine('Amoxicillin 500mg'), 'After Food');
  });

  test('5. Respects explicit doctor instructions over drug class default', () => {
    assert.equal(getDefaultFoodTimingForMedicine('Pantoprazole 40mg', 'With Food'), 'With Food');
    assert.equal(getDefaultFoodTimingForMedicine('Paracetamol 650mg', 'before food'), 'Before Food');
  });
});

