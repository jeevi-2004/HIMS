/**
 * Utility functions for matching, resolving, and categorizing
 * laboratory and radiology investigations against the hospital's services catalog.
 */

export const normalizeStr = (str = '') => {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Medical acronyms and synonym groups for investigations and imaging
const MEDICAL_ALIASES = [
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

export const isLikelyRadiology = (name = '', category = '', serviceType = '') => {
  const combined = `${name} ${category} ${serviceType}`.toLowerCase();
  if (
    combined.includes('radiology') ||
    combined.includes('imaging')
  ) {
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

export const isLikelyLaboratory = (name = '', category = '', serviceType = '') => {
  const combined = `${name} ${category} ${serviceType}`.toLowerCase();
  return (
    combined.includes('lab') ||
    combined.includes('blood') ||
    combined.includes('urine') ||
    combined.includes('pathology') ||
    combined.includes('biochemistry') ||
    combined.includes('culture') ||
    combined.includes('serology') ||
    combined.includes('hematology') ||
    combined.includes('cbc') ||
    combined.includes('thyroid') ||
    combined.includes('diabetes')
  );
};

/**
 * Resolves a test name against active services configured in the hospital catalog.
 * Supports exact match, normalized match, category match, code match, and alias matching.
 */
export const resolveHospitalService = (name, services = []) => {
  if (!name || typeof name !== 'string' || !Array.isArray(services) || services.length === 0) {
    return null;
  }
  const targetRaw = name.trim().toLowerCase();
  const targetNorm = normalizeStr(targetRaw);
  if (!targetNorm) return null;

  // Filter only active services if status is provided
  const activeServices = services.filter(s => s && s.status !== 'inactive');
  if (activeServices.length === 0) return null;

  // 1. Exact match on name, code, or category
  let matched = activeServices.find(s => 
    (s.name || '').trim().toLowerCase() === targetRaw ||
    (s.code || '').trim().toLowerCase() === targetRaw ||
    (s.category && (s.category || '').trim().toLowerCase() === targetRaw)
  );
  if (matched) return matched;

  // 2. Normalized alphanumeric match on name, code, or category
  matched = activeServices.find(s => {
    const nameNorm = normalizeStr(s.name);
    const codeNorm = normalizeStr(s.code);
    const catNorm = normalizeStr(s.category);
    return nameNorm === targetNorm || (codeNorm && codeNorm === targetNorm) || (catNorm && catNorm === targetNorm);
  });
  if (matched) return matched;

  // 3. Substring match (e.g. target "MRI Scan" vs service "MRI Scan Brain", or target "MRI" vs service "MRI Scan")
  matched = activeServices.find(s => {
    const nameNorm = normalizeStr(s.name);
    return nameNorm && (nameNorm.includes(targetNorm) || targetNorm.includes(nameNorm));
  });
  if (matched) return matched;

  // 4. Medical Alias / Modality matching (MRI, CT, USG, X-Ray, CBC, etc.)
  for (const alias of MEDICAL_ALIASES) {
    const targetHasTerm = alias.terms.some(t => {
      const tNorm = normalizeStr(t);
      return targetNorm.includes(tNorm) || targetRaw.includes(t);
    });

    if (targetHasTerm) {
      const serviceMatch = activeServices.find(s => {
        const sNameNorm = normalizeStr(s.name);
        const sCatNorm = normalizeStr(s.category);
        return alias.terms.some(t => {
          const tNorm = normalizeStr(t);
          return sNameNorm.includes(tNorm) || sCatNorm.includes(tNorm);
        });
      });
      if (serviceMatch) return serviceMatch;
    }
  }

  // 5. Code match (RAD001, LAB001, etc.)
  matched = activeServices.find(s => (s.code || '').trim().toLowerCase() === targetRaw);
  if (matched) return matched;

  return null;
};

/**
 * Enriches a list of investigation items by resolving missing/zero prices
 * against the hospital's active services catalog.
 * Preserves unmatched custom scans/tests under 'Other' with price 0.
 */
export const enrichInvestigationsList = (investigations = [], services = []) => {
  if (!Array.isArray(investigations)) return [];

  return investigations.map(item => {
    const itemName = typeof item === 'object' ? (item.name || item.investigationName || '') : String(item);
    const itemPrice = typeof item === 'object' ? Number(item.price) || 0 : 0;
    const currentType = typeof item === 'object' ? (item.serviceType || '').toLowerCase() : '';

    // If price is 0 or missing, or serviceType is 'other' / undefined, try to resolve from catalog
    if (itemPrice === 0 || currentType === 'other' || !currentType) {
      const matched = resolveHospitalService(itemName, services);
      if (matched) {
        const resolvedType = matched.serviceType || (isLikelyRadiology(matched.name, matched.category) ? 'Radiology' : 'Laboratory');
        return {
          ...(typeof item === 'object' ? item : {}),
          serviceId: matched._id,
          name: matched.name, // official catalog name (e.g. "MRI Scan")
          code: matched.code || (typeof item === 'object' ? item.code : ''),
          serviceType: resolvedType,
          category: matched.category || matched.serviceType || (resolvedType === 'Radiology' ? 'Radiology' : 'Laboratory'),
          price: Number(matched.price) || 0,
          isCatalogService: true
        };
      }
    }

    if (typeof item === 'object') {
      return item;
    }

    return {
      name: itemName,
      serviceType: isLikelyRadiology(itemName) ? 'Radiology' : 'Laboratory',
      category: 'General',
      price: 0
    };
  });
};

/**
 * Helper to split an enriched investigations list into Laboratory, Radiology, and Other groups.
 */
export const categorizeInvestigations = (investigations = []) => {
  const list = Array.isArray(investigations) ? investigations : [];

  const labInvestigations = [];
  const radInvestigations = [];
  const otherInvestigations = [];

  list.forEach(inv => {
    const name = inv.name || '';
    const cat = inv.category || '';
    const sType = inv.serviceType || '';
    const price = Number(inv.price) || 0;

    // Items with price > 0 that match radiology or laboratory
    if (isLikelyRadiology(name, cat, sType)) {
      if (price > 0 || inv.isCatalogService) {
        radInvestigations.push(inv);
        return;
      }
    }
    
    if (isLikelyLaboratory(name, cat, sType)) {
      if (price > 0 || inv.isCatalogService) {
        labInvestigations.push(inv);
        return;
      }
    }

    // Default to Other Investigations (unmatched custom tests or zero-priced custom requests)
    otherInvestigations.push(inv);
  });

  const labTotal = labInvestigations.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const radTotal = radInvestigations.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const otherTotal = otherInvestigations.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const totalAmount = labTotal + radTotal + otherTotal;

  return {
    labInvestigations,
    radInvestigations,
    otherInvestigations,
    labTotal,
    radTotal,
    otherTotal,
    totalAmount
  };
};
