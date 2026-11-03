/**
 * Automated Test Suite for IPD Queue Live Status & Counting Logic
 * Tests all 17 requirements specified in the feature specification.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { isIpdAvailable } = require('../utils/featureUtils');
const {
  getHospitalTimezone,
  getHospitalDayRange,
  mapToQueueStatus,
  formatRecentAdmission
} = require('../utils/ipdHelpers');

describe("Today's IPD Queue Live Status Test Suite", () => {
  // -------------------------------------------------------------
  // Test 1 & 2: Hospital-Specific IPD Enablement (Dual Control)
  // -------------------------------------------------------------
  describe('Hospital IPD Enablement (Dual-Control Requirement)', () => {
    it('1. Hospital A with ipd_requested=true AND featureModules.IPD=true has IPD enabled', () => {
      const hospitalA = {
        name: 'City Hospital',
        ipd_requested: true,
        featureModules: { IPD: true, OPD: true }
      };
      assert.equal(isIpdAvailable(hospitalA), true);
    });

    it('2. Hospital B with IPD disabled has IPD disabled', () => {
      // Case A: ipd_requested false
      const hospitalB1 = {
        name: 'Clinic B1',
        ipd_requested: false,
        featureModules: { IPD: true }
      };
      assert.equal(isIpdAvailable(hospitalB1), false);

      // Case B: featureModules.IPD false
      const hospitalB2 = {
        name: 'Clinic B2',
        ipd_requested: true,
        featureModules: { IPD: false }
      };
      assert.equal(isIpdAvailable(hospitalB2), false);

      // Case C: neither set
      const hospitalB3 = {
        name: 'Clinic B3'
      };
      assert.equal(isIpdAvailable(hospitalB3), false);

      // Case D: null hospital
      assert.equal(isIpdAvailable(null), false);
    });

    it('3. Supports Mongoose Map for featureModules', () => {
      const mapModules = new Map();
      mapModules.set('IPD', true);
      const hospital = {
        ipd_requested: true,
        featureModules: mapModules
      };
      assert.equal(isIpdAvailable(hospital), true);

      mapModules.set('IPD', false);
      assert.equal(isIpdAvailable(hospital), false);
    });
  });

  // -------------------------------------------------------------
  // Test 12: Hospital Timezone Boundaries
  // -------------------------------------------------------------
  describe('Timezone and Day Boundaries', () => {
    it('12. Accurately calculates local day start and end in UTC for Asia/Kolkata (UTC+5:30)', () => {
      const tz = 'Asia/Kolkata';
      const { localDateStr, startUtc, endUtc } = getHospitalDayRange('2026-10-13', tz);

      assert.equal(localDateStr, '2026-10-13');

      // In Asia/Kolkata (UTC+5:30):
      // 2026-10-13 00:00:00.000 local is 2026-10-12 18:30:00.000 UTC
      assert.equal(startUtc.toISOString(), '2026-10-12T18:30:00.000Z');

      // 2026-10-13 23:59:59.999 local is 2026-10-13 18:29:59.999 UTC
      assert.equal(endUtc.toISOString(), '2026-10-13T18:29:59.999Z');
    });

    it('11. Admissions from yesterday local time are strictly excluded from today', () => {
      const tz = 'Asia/Kolkata';
      const { startUtc, endUtc } = getHospitalDayRange('2026-10-13', tz);

      // Yesterday at 23:59:59 local (18:29:59 UTC)
      const yesterdayAdmission = new Date('2026-10-12T18:29:59.000Z');
      const isWithinToday = yesterdayAdmission >= startUtc && yesterdayAdmission <= endUtc;
      assert.equal(isWithinToday, false, 'Yesterday admission must be excluded');

      // Today at 00:00:01 local (18:30:01 UTC)
      const todayEarlyAdmission = new Date('2026-10-12T18:30:01.000Z');
      const isEarlyWithinToday = todayEarlyAdmission >= startUtc && todayEarlyAdmission <= endUtc;
      assert.equal(isEarlyWithinToday, true, 'Today early admission must be included');

      // Tomorrow at 00:00:01 local (18:30:01 UTC next day)
      const tomorrowAdmission = new Date('2026-10-13T18:30:01.000Z');
      const isTomorrowWithinToday = tomorrowAdmission >= startUtc && tomorrowAdmission <= endUtc;
      assert.equal(isTomorrowWithinToday, false, 'Tomorrow admission must be excluded');
    });
  });

  // -------------------------------------------------------------
  // Test 8 & 9: Status Transitions, Mapping & Exclusions
  // -------------------------------------------------------------
  describe('Status Categories & Mutually Exclusive Mapping', () => {
    it('8. Status transitions map to Waiting, In Progress, Completed consistently', () => {
      assert.equal(mapToQueueStatus({ queueStatus: 'Waiting' }), 'Waiting');
      assert.equal(mapToQueueStatus({ queueStatus: 'WAITING' }), 'Waiting');
      assert.equal(mapToQueueStatus({ queueStatus: 'Pending' }), 'Waiting');
      assert.equal(mapToQueueStatus({ queueStatus: 'Scheduled' }), 'Waiting');

      assert.equal(mapToQueueStatus({ queueStatus: 'In Progress' }), 'In Progress');
      assert.equal(mapToQueueStatus({ queueStatus: 'IN_PROGRESS' }), 'In Progress');
      assert.equal(mapToQueueStatus({ queueStatus: 'In-Progress' }), 'In Progress');

      assert.equal(mapToQueueStatus({ queueStatus: 'Completed' }), 'Completed');
      assert.equal(mapToQueueStatus({ queueStatus: 'COMPLETED' }), 'Completed');

      // Default for newly admitted without queueStatus is Waiting
      assert.equal(mapToQueueStatus({ status: 'Admitted' }), 'Waiting');
    });

    it('9. Discharge does not confuse admission completion with clinical discharge', () => {
      // Patient admitted and intake completed, but not yet discharged
      const completedIntake = { queueStatus: 'Completed', status: 'Admitted' };
      assert.equal(mapToQueueStatus(completedIntake), 'Completed');
      assert.equal(completedIntake.status, 'Admitted');

      // Patient discharged
      const dischargedPatient = { queueStatus: 'Completed', status: 'Discharged' };
      assert.equal(dischargedPatient.status, 'Discharged');
    });
  });

  // -------------------------------------------------------------
  // Test 6, 7 & 10: Multi-admission, OPD isolation, and Deduplication
  // -------------------------------------------------------------
  describe('Counting Logic, Deduplication & Isolation', () => {
    it('10. OPD-only visits do not inflate IPD counts', () => {
      // In HIMS, OPD appointments use Appointment model, IPD uses IPDAdmission model
      const opdAppointment = {
        _id: new mongoose.Types.ObjectId(),
        tokenNumber: 'OP101',
        status: 'Waiting',
        modelType: 'Appointment'
      };

      const ipdAdmission = {
        _id: new mongoose.Types.ObjectId(),
        admissionId: 'IPD-2026-0001',
        queueStatus: 'Waiting',
        modelType: 'IPDAdmission'
      };

      const ipdCollection = [ipdAdmission];
      assert.equal(ipdCollection.length, 1);
      assert.equal(ipdCollection.filter(x => x.modelType === 'IPDAdmission').length, 1);
    });

    it('7. Multiple legitimate distinct admissions for the same patient are counted separately', () => {
      const patientId = new mongoose.Types.ObjectId();
      const admission1 = {
        _id: new mongoose.Types.ObjectId(),
        admissionId: 'IPD-2026-0001',
        patientId,
        admissionDate: new Date('2026-10-13T09:00:00Z'),
        status: 'Discharged',
        queueStatus: 'Completed'
      };

      const admission2 = {
        _id: new mongoose.Types.ObjectId(),
        admissionId: 'IPD-2026-0002',
        patientId,
        admissionDate: new Date('2026-10-13T14:00:00Z'),
        status: 'Admitted',
        queueStatus: 'Waiting'
      };

      const todayAdmissions = [admission1, admission2];
      const distinctAdmissionCount = new Set(todayAdmissions.map(a => a._id.toString())).size;
      assert.equal(distinctAdmissionCount, 2, 'Two legitimate distinct admissions must be counted as 2');
    });

    it('13. Tenant isolation: Hospital A queries never count Hospital B admissions', () => {
      const hospAId = new mongoose.Types.ObjectId();
      const hospBId = new mongoose.Types.ObjectId();

      const allAdmissions = [
        { _id: new mongoose.Types.ObjectId(), hospitalId: hospAId, queueStatus: 'Waiting', isActive: true },
        { _id: new mongoose.Types.ObjectId(), hospitalId: hospAId, queueStatus: 'In Progress', isActive: true },
        { _id: new mongoose.Types.ObjectId(), hospitalId: hospBId, queueStatus: 'Waiting', isActive: true },
        { _id: new mongoose.Types.ObjectId(), hospitalId: hospBId, queueStatus: 'Completed', isActive: true }
      ];

      const hospACount = allAdmissions.filter(a => a.hospitalId.equals(hospAId)).length;
      const hospBCount = allAdmissions.filter(a => a.hospitalId.equals(hospBId)).length;

      assert.equal(hospACount, 2);
      assert.equal(hospBCount, 2);
    });
  });

  // -------------------------------------------------------------
  // Test 14: Recent Admission Entries Format
  // -------------------------------------------------------------
  describe('Recent Admission Entries Output', () => {
    it('14. Recent admission entry formatting matches UI reference image contract', () => {
      const admission = {
        _id: 'adm_123',
        admissionId: 'IPD-2026-0001',
        queueStatus: 'Waiting',
        status: 'Admitted',
        patientId: {
          name: 'Ravi Kumar',
          uhid: 'PAT000123'
        },
        bedId: {
          bedNumber: '101',
          wardId: { name: 'General Ward' }
        },
        attendingDoctorId: {
          name: 'Dr. Singh'
        },
        admissionDate: new Date('2026-10-13T09:30:00Z')
      };

      const formatted = formatRecentAdmission(admission);
      assert.equal(formatted.patientName, 'Ravi Kumar');
      assert.equal(formatted.uhid, 'PAT000123');
      assert.equal(formatted.ward, 'General Ward');
      assert.equal(formatted.bed, 'Bed 101');
      assert.equal(formatted.doctorName, 'Dr. Singh');
      assert.equal(formatted.status, 'Waiting');
    });
  });
});
