// VillZone HIMS — Clinical Knowledge Engine (Phase 7)
// Centralized Master Repository, Universal Clinical Search, Allergy Conflict Engine, and CSV Importer/Exporter.

const defaultMasters = {
  mlist: [
    { id: '1', name: 'Paracetamol 650mg', generic: 'Paracetamol', brand: 'Dolo 650', strength: '650mg', category: 'Tablet', morning: '1', afternoon: '0', night: '1', duration: '5 Days', food: 'After Food', status: 'Active', maxDailyDose: '4000mg', controlled: false },
    { id: '2', name: 'Vitamin C 500mg', generic: 'Ascorbic Acid', brand: 'Limcee', strength: '500mg', category: 'Tablet', morning: '1', afternoon: '0', night: '0', duration: '10 Days', food: 'After Food', status: 'Active', maxDailyDose: '1000mg', controlled: false },
    { id: '3', name: 'Cetirizine 10mg', generic: 'Cetirizine', brand: 'Okacet', strength: '10mg', category: 'Tablet', morning: '0', afternoon: '0', night: '1', duration: '5 Days', food: 'After Food', status: 'Active', maxDailyDose: '20mg', controlled: false },
    { id: '4', name: 'Pantoprazole 40mg', generic: 'Pantoprazole', brand: 'Pan 40', strength: '40mg', category: 'Tablet', morning: '1', afternoon: '0', night: '0', duration: '7 Days', food: 'Before Food', status: 'Active', maxDailyDose: '80mg', controlled: false },
    { id: '5', name: 'Amoxicillin 500mg', generic: 'Amoxicillin', brand: 'Novamox', strength: '500mg', category: 'Capsule', morning: '1', afternoon: '0', night: '1', duration: '5 Days', food: 'After Food', status: 'Active', maxDailyDose: '3000mg', controlled: false },
    { id: '6', name: 'Cough Syrup 100ml', generic: 'Dextromethorphan', brand: 'Benadryl', strength: '10ml', category: 'Syrup', morning: '1', afternoon: '1', night: '1', duration: '5 Days', food: 'After Food', status: 'Active', maxDailyDose: '30ml', controlled: false },
    { id: '7', name: 'Metformin 500mg', generic: 'Metformin', brand: 'Glycomet 500', strength: '500mg', category: 'Tablet', morning: '1', afternoon: '0', night: '1', duration: '30 Days', food: 'After Food', status: 'Active', maxDailyDose: '2000mg', controlled: false },
    { id: '8', name: 'Amlodipine 5mg', generic: 'Amlodipine', brand: 'Amlong 5', strength: '5mg', category: 'Tablet', morning: '1', afternoon: '0', night: '0', duration: '30 Days', food: 'After Food', status: 'Active', maxDailyDose: '10mg', controlled: false },
    { id: '9', name: 'Salbutamol Inhaler', generic: 'Salbutamol', brand: 'Asthalin', strength: '100mcg', category: 'Inhaler', morning: '1', afternoon: '0', night: '1', duration: '15 Days', food: 'After Food', status: 'Active', maxDailyDose: '800mcg', controlled: false }
  ],
  dlist: [],
  dosages: ['0', '½', '1', '2', 'SOS'],
  frequencies: ['OD', 'BD', 'TDS', 'QID', 'SOS', 'STAT', 'HS'],
  durations: ['1 Day', '3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '15 Days', '30 Days', 'Other...'],
  foodInstructions: ['Before Food', 'After Food', 'With Food'],
  adviceList: ['Drink Water', 'Take Rest', 'Steam Inhalation', 'Avoid Cold Drinks', 'Avoid Oily Food', 'Finish Antibiotics', 'Return if Fever Continues', 'Low Salt Diet', 'Diabetic Diet'],
  followups: ['1 Day', '2 Days', '3 Days', '5 Days', '7 Days', '15 Days', '30 Days', '1 Month', '3 Months'],
  investigations: ['CBC', 'ESR', 'CRP', 'Blood Sugar', 'Urine Routine', 'ECG', 'X-Ray', 'CT', 'MRI', 'LFT', 'KFT'],
  procedureList: ['Nebulization', 'Injection', 'IV Fluids', 'Dressing', 'ECG', 'Suturing', 'Minor Surgery', 'BP Check'],
  allergies: ['Dust', 'Pollen', 'Penicillin', 'Amoxicillin', 'Sulfa Drugs', 'Lactose', 'Aspirin']
};

export const initClinicalMasters = () => {
  if (localStorage.getItem('cm_slist')) {
    localStorage.removeItem('cm_slist');
  }
  const cachedDlist = localStorage.getItem('cm_dlist');
  if (cachedDlist) {
    try {
      const parsed = JSON.parse(cachedDlist);
      if (Array.isArray(parsed) && parsed.some(item => item.id === '1' && item.name === 'Fever')) {
        localStorage.setItem('cm_dlist', JSON.stringify([]));
      }
    } catch {}
  }
  Object.keys(defaultMasters).forEach(key => {
    if (!localStorage.getItem(`cm_${key}`)) {
      localStorage.setItem(`cm_${key}`, JSON.stringify(defaultMasters[key]));
    }
  });

  // Sanitize durations in local storage
  const rawDurations = localStorage.getItem('cm_durations');
  if (rawDurations) {
    try {
      const parsedDurations = JSON.parse(rawDurations);
      if (Array.isArray(parsedDurations) && (!parsedDurations.includes('Other...') || !parsedDurations.includes('1 Day'))) {
        localStorage.setItem('cm_durations', JSON.stringify(defaultMasters.durations));
      }
    } catch {}
  }

  // Sanitize foodInstructions in local storage
  const rawFood = localStorage.getItem('cm_foodInstructions');
  if (rawFood) {
    try {
      const parsedFood = JSON.parse(rawFood);
      if (Array.isArray(parsedFood)) {
        const forbidden = ['morning only', 'night only', 'any time'];
        const cleanFood = parsedFood.filter(item => {
          const text = (typeof item === 'string' ? item : item.name || '').toLowerCase().trim();
          return !forbidden.includes(text);
        });
        if (cleanFood.length !== parsedFood.length) {
          localStorage.setItem('cm_foodInstructions', JSON.stringify(cleanFood.length > 0 ? cleanFood : defaultMasters.foodInstructions));
        }
      }
    } catch {}
  }
};

export const restoreDefaultMasters = (key) => {
  if (key && defaultMasters[key]) {
    localStorage.setItem(`cm_${key}`, JSON.stringify(defaultMasters[key]));
  } else {
    Object.keys(defaultMasters).forEach(k => {
      localStorage.setItem(`cm_${k}`, JSON.stringify(defaultMasters[k]));
    });
  }
};

export const getMasterList = (key) => {
  initClinicalMasters();
  const val = localStorage.getItem(`cm_${key}`);
  try {
    const parsed = val ? JSON.parse(val) : [];
    if (Array.isArray(parsed) && parsed.length === 0 && defaultMasters[key]) {
      localStorage.setItem(`cm_${key}`, JSON.stringify(defaultMasters[key]));
      return defaultMasters[key];
    }
    return parsed;
  } catch (e) {
    return defaultMasters[key] || [];
  }
};

export const saveMasterList = (key, data) => {
  localStorage.setItem(`cm_${key}`, JSON.stringify(data));
};

/**
 * Analyze and synchronize a medicine into Medicine Master (mlist).
 * If the medicine is already in Medicine Master, it is left untouched.
 * If not present, it is added to mlist and a sync event is dispatched.
 */
export const syncMedicineToMaster = (medInput) => {
  if (!medInput) return null;
  const rawName = typeof medInput === 'string' ? medInput : (medInput.medicineName || medInput.name || '');
  const cleanName = String(rawName).trim();
  if (!cleanName || cleanName.length < 2) return null;

  const cleanLower = cleanName.toLowerCase();
  const currentMlist = getMasterList('mlist') || [];

  // Check if medicine is already available in Medicine Master (leave it if already available)
  const isAvailable = currentMlist.some(m => {
    if (!m) return false;
    const mName = String(m.name || '').trim().toLowerCase();
    const mBrand = String(m.brand || '').trim().toLowerCase();
    const mGen = String(m.generic || m.genericName || '').trim().toLowerCase();
    return mName === cleanLower || (mBrand && mBrand === cleanLower) || (mGen && mGen === cleanLower);
  });

  if (isAvailable) {
    return null; // Already available, leave it as is
  }

  // Detect strength (e.g. 650mg, 500 mg, 10ml, etc.)
  const strMatch = cleanName.match(/\b\d+(\.\d+)?\s*(mg|mcg|ml|g|iu|%)\b/i);
  const detectedStrength = strMatch ? strMatch[0] : (typeof medInput === 'object' ? medInput.strength || '-' : '-');

  // Detect category from name or provided input
  let detectedCategory = 'Tablet';
  if (/\b(syrup|suspension|susp)\b/i.test(cleanName)) detectedCategory = 'Syrup';
  else if (/\b(inj|injection)\b/i.test(cleanName)) detectedCategory = 'Injection';
  else if (/\b(drop|drops|eye\s*drops|ear\s*drops)\b/i.test(cleanName)) detectedCategory = 'Drops';
  else if (/\b(inhaler|respules|rotacap)\b/i.test(cleanName)) detectedCategory = 'Inhaler';
  else if (/\b(capsule|cap|caps)\b/i.test(cleanName)) detectedCategory = 'Capsule';
  else if (/\b(ointment|cream|gel)\b/i.test(cleanName)) detectedCategory = 'Ointment';
  else if (typeof medInput === 'object' && medInput.category) detectedCategory = medInput.category;

  const newItem = {
    id: String(Date.now() + Math.floor(Math.random() * 10000)),
    name: cleanName,
    generic: (typeof medInput === 'object' ? medInput.generic || medInput.genericName : '') || '',
    brand: (typeof medInput === 'object' ? medInput.brand : '') || '',
    strength: detectedStrength,
    category: detectedCategory,
    morning: (typeof medInput === 'object' ? medInput.morning : '') || '1',
    afternoon: (typeof medInput === 'object' ? medInput.afternoon : '') || '0',
    night: (typeof medInput === 'object' ? medInput.night : '') || '1',
    duration: (typeof medInput === 'object' ? medInput.duration : '') || '5 Days',
    food: (typeof medInput === 'object' ? medInput.food : '') || 'After Food',
    status: 'Active',
    maxDailyDose: '',
    controlled: false,
    addedFromConsultation: true,
    createdAt: new Date().toISOString()
  };

  const updated = [...currentMlist, newItem];
  saveMasterList('mlist', updated);

  try {
    window.dispatchEvent(new CustomEvent('clinical_master_updated', { detail: { key: 'mlist', item: newItem } }));
    window.dispatchEvent(new Event('storage'));
  } catch (_) {}

  return newItem;
};

/**
 * Universal Clinical Search across Diagnosis, Medicines, Investigations, Advice, Procedures.
 */
export const universalClinicalSearch = (query = '') => {
  if (!query || !query.trim()) return { diagnoses: [], medicines: [], investigations: [], advice: [], procedures: [] };
  const cleanQ = query.trim().toLowerCase();

  const diagnoses = getMasterList('dlist').filter(d => 
    (d.name && d.name.toLowerCase().includes(cleanQ)) || (d.icdCode && d.icdCode.toLowerCase().includes(cleanQ))
  );

  const medicines = getMasterList('mlist').filter(m => 
    (m.name && m.name.toLowerCase().includes(cleanQ)) || 
    ((m.generic || m.genericName) && String(m.generic || m.genericName).toLowerCase().includes(cleanQ)) || 
    (m.brand && m.brand.toLowerCase().includes(cleanQ))
  );

  const investigations = getMasterList('investigations').filter(i => 
    (typeof i === 'string' ? i.toLowerCase() : String(i?.name || '').toLowerCase()).includes(cleanQ)
  );

  const advice = getMasterList('adviceList').filter(a => 
    (typeof a === 'string' ? a.toLowerCase() : String(a?.name || '').toLowerCase()).includes(cleanQ)
  );

  const procedures = getMasterList('procedureList').filter(p => 
    (typeof p === 'string' ? p.toLowerCase() : String(p?.name || '').toLowerCase()).includes(cleanQ)
  );

  return { diagnoses, medicines, investigations, advice, procedures };
};

/**
 * Allergy Conflict Detection Engine.
 */

/**
 * Canonical Food Timing Normalizer
 * Guarantees mapping to strictly 'Before Food', 'After Food', or 'With Food'.
 * Matches HTML <select> options perfectly and prevents blank dropdown selects.
 */
export const normalizeFoodTiming = (val) => {
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

/**
 * Intelligent Clinical Default Food Timing by Drug Class/Name
 */
export const getDefaultFoodTimingForMedicine = (medicineName = '', explicitFood = '') => {
  if (explicitFood && String(explicitFood).trim()) {
    return normalizeFoodTiming(explicitFood);
  }
  const name = String(medicineName || '').toLowerCase();
  // Antacids, PPIs, sucralfate, empty stomach / before food medications
  if (/panto|omepra|rabe|esomepra|lansopra|antacid|sucralfate|levothyrox/i.test(name)) {
    return 'Before Food';
  }
  return 'After Food';
};

export const checkAllergyConflict = (medicineName = '', patientAllergies = []) => {
  if (!medicineName || !patientAllergies || patientAllergies.length === 0) return null;

  const medLower = medicineName.toLowerCase();
  for (const allergy of patientAllergies) {
    const allergyText = (typeof allergy === 'object' ? allergy.name || allergy.allergy : allergy || '').toLowerCase();
    if (allergyText && medLower.includes(allergyText)) {
      return `⚠ Patient Allergy Conflict: Patient has documented ${allergyText.toUpperCase()} allergy!`;
    }
  }
  return null;
};

/**
 * Doctor Personal Favorites Helper.
 */
export const getDoctorFavorites = (doctorId = 'default') => {
  const key = `cm_fav_${doctorId}`;
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const toggleDoctorFavorite = (doctorId = 'default', templateId) => {
  const favorites = getDoctorFavorites(doctorId);
  const exists = favorites.includes(templateId);
  const updated = exists ? favorites.filter(id => id !== templateId) : [...favorites, templateId];
  localStorage.setItem(`cm_fav_${doctorId}`, JSON.stringify(updated));
  return updated;
};

/**
 * Export Master List as CSV.
 */
export const exportMasterCSV = (key, filename = 'clinical_master.csv') => {
  const data = getMasterList(key);
  if (!data || data.length === 0) return false;

  const sample = data[0];
  const headers = typeof sample === 'object' ? Object.keys(sample).join(',') : 'item';
  const rows = data.map(item => typeof item === 'object' ? Object.values(item).map(v => Array.isArray(v) ? `"${v.join(';')}"` : `"${v}"`).join(',') : `"${item}"`).join('\n');

  const csvContent = 'data:text/csv;charset=utf-8,' + headers + '\n' + rows;
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
};
