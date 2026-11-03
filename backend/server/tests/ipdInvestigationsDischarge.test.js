const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('IPD Investigations in Receptionist Discharge Summary Test Suite', () => {

  it('1. Correctly classifies Laboratory and Radiology investigations', () => {
    const isLikelyRadiology = (name) => {
      const lower = String(name || '').toLowerCase();
      return lower.includes('x-ray') || 
             lower.includes('scan') || 
             lower.includes('radiology') || 
             lower.includes('imaging') ||
             lower.includes('mri') || 
             lower.includes('ct') || 
             lower.includes('ultrasound');
    };

    assert.equal(isLikelyRadiology('X-Ray'), true);
    assert.equal(isLikelyRadiology('Chest X-Ray PA View'), true);
    assert.equal(isLikelyRadiology('Ultrasound Scan'), true);
    assert.equal(isLikelyRadiology('CT Scan Brain'), true);
    assert.equal(isLikelyRadiology('MRI Spine'), true);
    assert.equal(isLikelyRadiology('Blood Test'), false);
    assert.equal(isLikelyRadiology('Complete Blood Count (CBC)'), false);
    assert.equal(isLikelyRadiology('Urine Test'), false);
    assert.equal(isLikelyRadiology('Thyroid Test'), false);
    assert.equal(isLikelyRadiology('Diabetes Test'), false);
  });

  it('2. Synchronizes selected investigations into admission billingItems with correct amounts', () => {
    const admission = {
      admissionId: 'IPD-2026-0006',
      status: 'Admitted',
      billingDetails: {
        bedCharges: 1200,
        consultationCharges: 1200,
        labCharges: 0,
        totalBill: 2400,
        billingItems: []
      },
      dailyReviews: [
        {
          dayNumber: 1,
          doctorName: 'Dr. Vedha',
          investigations: [
            { name: 'Blood Test', serviceType: 'Laboratory', price: 250 },
            { name: 'X-Ray', serviceType: 'Radiology', price: 300 }
          ]
        }
      ]
    };

    // Simulate auto-sync logic from getAdmissionById / saveDailyReview
    for (const rev of admission.dailyReviews) {
      if (Array.isArray(rev.investigations)) {
        for (const inv of rev.investigations) {
          const invName = inv.name;
          const alreadyExists = admission.billingDetails.billingItems.some(
            b => b.serviceName.toLowerCase() === invName.toLowerCase()
          );
          if (!alreadyExists) {
            const isRad = inv.serviceType === 'Radiology';
            admission.billingDetails.billingItems.push({
              serviceCategory: isRad ? 'Radiology' : 'Laboratory',
              serviceName: invName,
              quantity: 1,
              unitPrice: inv.price,
              amount: inv.price,
              isManual: false
            });
            admission.billingDetails.labCharges += inv.price;
            admission.billingDetails.totalBill += inv.price;
          }
        }
      }
    }

    assert.equal(admission.billingDetails.billingItems.length, 2);
    assert.equal(admission.billingDetails.billingItems[0].serviceName, 'Blood Test');
    assert.equal(admission.billingDetails.billingItems[0].serviceCategory, 'Laboratory');
    assert.equal(admission.billingDetails.billingItems[0].amount, 250);

    assert.equal(admission.billingDetails.billingItems[1].serviceName, 'X-Ray');
    assert.equal(admission.billingDetails.billingItems[1].serviceCategory, 'Radiology');
    assert.equal(admission.billingDetails.billingItems[1].amount, 300);

    // Total should be Bed (1200) + Consultation (1200) + Blood Test (250) + X-Ray (300) = 2950
    assert.equal(admission.billingDetails.labCharges, 550);
    assert.equal(admission.billingDetails.totalBill, 2950);
  });

  it('3. Formats IPD Charges Breakdown rows for Receptionist Discharge Form', () => {
    const stayDays = 6;
    const bedRate = 200;
    const doctorRate = 200;

    const bd = {
      billingItems: [
        { serviceCategory: 'Laboratory', serviceName: 'Blood Test', quantity: 1, unitPrice: 250, amount: 250 },
        { serviceCategory: 'Radiology', serviceName: 'X-Ray', quantity: 1, unitPrice: 300, amount: 300 }
      ]
    };

    const rows = [
      { id: 'bed', category: 'Bed Charges', details: 'ward-01 (203)', qtyDuration: `${stayDays} Days`, rate: bedRate, amount: bedRate * stayDays },
      { id: 'doctor', category: 'Doctor Consultation', details: 'Daily Doctor Consultation & Rounds', qtyDuration: `${stayDays} Days`, rate: doctorRate, amount: doctorRate * stayDays }
    ];

    bd.billingItems.forEach(item => {
      rows.push({
        id: item.serviceName,
        category: item.serviceCategory,
        details: item.serviceName,
        qtyDuration: String(item.quantity || 1),
        rate: item.unitPrice,
        amount: item.amount
      });
    });

    assert.equal(rows.length, 4);
    assert.equal(rows[0].category, 'Bed Charges');
    assert.equal(rows[0].amount, 1200);

    assert.equal(rows[1].category, 'Doctor Consultation');
    assert.equal(rows[1].amount, 1200);

    assert.equal(rows[2].category, 'Laboratory');
    assert.equal(rows[2].details, 'Blood Test');
    assert.equal(rows[2].rate, 250);
    assert.equal(rows[2].amount, 250);

    assert.equal(rows[3].category, 'Radiology');
    assert.equal(rows[3].details, 'X-Ray');
    assert.equal(rows[3].rate, 300);
    assert.equal(rows[3].amount, 300);

    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    assert.equal(total, 2950);
  });

  it('4. Prevents duplicate generic lump-sum row when individual investigation items are present', () => {
    const rows = [
      { id: 'bed', category: 'Bed Charges', amount: 1200 },
      { id: 'doctor', category: 'Doctor Consultation', amount: 1200 },
      { id: 'inv1', category: 'Laboratory', details: 'Blood Test', amount: 250 },
      { id: 'inv2', category: 'Radiology', details: 'X-Ray', amount: 300 }
    ];

    const initialLabAmount = 550;
    const hasDiagnosticItems = rows.some(r => r.category === 'Laboratory' || r.category === 'Radiology');

    if (!hasDiagnosticItems && initialLabAmount > 0) {
      rows.push({ id: 'lab', category: 'Lab / Diagnostics', amount: initialLabAmount });
    }

    // Since individual items exist, no generic "Lab / Diagnostics" lump sum is added
    assert.equal(rows.some(r => r.id === 'lab'), false);
    assert.equal(rows.length, 4);
  });
});

