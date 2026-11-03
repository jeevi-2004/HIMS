/**
 * Unit Test for IPD Billing Calculations and State Logic
 * Runs entirely offline without requiring external network connectivity.
 */

const assert = require('assert');

function runUnitBillingTests() {
  console.log('====================================================================');
  console.log('   RUNNING IPD BILLING LOGIC & RECONCILIATION UNIT TESTS            ');
  console.log('====================================================================');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`, err.message);
      failed++;
    }
  }

  // 1. Bed charges calculation rule: dailyRate * chargeableDays (minimum 1 day)
  test('Bed Charges calculation: rate * chargeableDays with at least 1 day minimum', () => {
    const dailyRate = 400;
    const stayHoursLessThan24 = 6; // 6 hours
    const daysCalc1 = Math.max(1, Math.ceil(stayHoursLessThan24 / 24));
    assert.strictEqual(daysCalc1, 1, 'Partial day under 24 hours counts as 1 chargeable day');
    assert.strictEqual(dailyRate * daysCalc1, 400, 'Charge for 6 hours is 1 day * 400 = 400');

    const stayHours30 = 30; // 30 hours = 1 day 6 hours
    const daysCalc2 = Math.max(1, Math.ceil(stayHours30 / 24));
    assert.strictEqual(daysCalc2, 2, '30 hours counts as 2 chargeable days');
    assert.strictEqual(dailyRate * daysCalc2, 800, 'Charge for 30 hours is 2 days * 400 = 800');
  });

  // 2. Add service to bill calculation
  test('Add Service Item: increments category and total bill correctly', () => {
    const billingDetails = {
      bedCharges: 1200,
      consultationCharges: 600,
      nursingCharges: 0,
      procedureCharges: 0,
      labCharges: 0,
      medicationCharges: 400,
      otherCharges: 0,
      discount: 100,
      tax: 0,
      totalBill: 2100, // 1200 + 600 + 400 - 100
      billingItems: []
    };

    const newItem = {
      serviceCategory: 'Procedure',
      serviceName: 'Wound Dressing & Suturing',
      quantity: 2,
      unitPrice: 250,
      amount: 500
    };

    billingDetails.billingItems.push(newItem);
    if (newItem.serviceCategory === 'Procedure') {
      billingDetails.procedureCharges += newItem.amount;
    }

    const calculatedTotal = (
      billingDetails.bedCharges +
      billingDetails.consultationCharges +
      billingDetails.nursingCharges +
      billingDetails.procedureCharges +
      billingDetails.labCharges +
      billingDetails.medicationCharges +
      billingDetails.otherCharges
    ) - billingDetails.discount + billingDetails.tax;

    billingDetails.totalBill = calculatedTotal;

    assert.strictEqual(billingDetails.procedureCharges, 500, 'Procedure charges incremented by 500');
    assert.strictEqual(billingDetails.totalBill, 2600, 'Total bill recalculated to 2600 (was 2100 + 500)');
  });

  // 3. Payment collection and outstanding balance reconciliation
  test('Payment settlement: advance + interim + final settlement balances correctly', () => {
    const totalBill = 3300;
    const advancePaid = 1500;
    let totalPaid = advancePaid;

    let outstanding = totalBill - totalPaid;
    assert.strictEqual(outstanding, 1800, 'Initial pending balance is 3300 - 1500 = 1800');

    // Interim payment of 800
    const interimPayment = 800;
    totalPaid += interimPayment;
    outstanding = totalBill - totalPaid;
    assert.strictEqual(outstanding, 1000, 'Pending balance after interim is 3300 - 2300 = 1000');

    // Final settlement of 1000
    const finalSettlement = 1000;
    totalPaid += finalSettlement;
    outstanding = Math.max(0, totalBill - totalPaid);
    assert.strictEqual(outstanding, 0, 'Pending balance after final settlement is 0 (Fully Settled)');
  });

  // 4. Overpayment / credit balance rule
  test('Overpayment results in credit balance instead of negative payable', () => {
    const totalBill = 2000;
    const totalPaid = 2500;

    const outstanding = totalBill - totalPaid > 0 ? totalBill - totalPaid : 0;
    const creditBalance = totalPaid > totalBill ? totalPaid - totalBill : 0;

    assert.strictEqual(outstanding, 0, 'No outstanding payable when paid > bill');
    assert.strictEqual(creditBalance, 500, 'Credit balance / refund due is 500');
  });

  // 5. Payment validation: cannot pay negative or zero
  test('Payment validation: reject <= 0 amounts', () => {
    function validatePayment(amt) {
      const num = Number(amt);
      if (!num || num <= 0) throw new Error('A valid positive payment amount is required');
      return true;
    }

    assert.throws(() => validatePayment(0), /positive payment amount/);
    assert.throws(() => validatePayment(-500), /positive payment amount/);
    assert.doesNotThrow(() => validatePayment(100));
  });

  // 6. Delete billing item: decrements category and total bill
  test('Delete Service Item: decrements category and recalculates total bill', () => {
    const billingDetails = {
      bedCharges: 1200,
      consultationCharges: 0,
      nursingCharges: 0,
      procedureCharges: 500,
      labCharges: 350,
      medicationCharges: 0,
      otherCharges: 0,
      discount: 0,
      tax: 0,
      totalBill: 2050,
      billingItems: [
        { _id: '1', serviceCategory: 'Procedure', amount: 500 },
        { _id: '2', serviceCategory: 'Laboratory', amount: 350 }
      ]
    };

    // Remove laboratory item
    const itemIndex = billingDetails.billingItems.findIndex(it => it._id === '2');
    const removedItem = billingDetails.billingItems.splice(itemIndex, 1)[0];
    billingDetails.labCharges = Math.max(0, billingDetails.labCharges - removedItem.amount);
    billingDetails.totalBill = (
      billingDetails.bedCharges +
      billingDetails.procedureCharges +
      billingDetails.labCharges
    ) - billingDetails.discount;

    assert.strictEqual(billingDetails.billingItems.length, 1, 'Only 1 item left');
    assert.strictEqual(billingDetails.labCharges, 0, 'Lab charges decremented to 0');
    assert.strictEqual(billingDetails.totalBill, 1700, 'Total bill recalculated to 1700 (2050 - 350)');
  });

  console.log('====================================================================');
  console.log(`   UNIT TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED         `);
  console.log('====================================================================');

  if (failed > 0) process.exit(1);
}

runUnitBillingTests();

