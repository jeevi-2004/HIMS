/**
 * VillZone HIMS — IPD Admission & Queue Helper Utilities
 * Accurate timezone calculation, status mapping, and formatters.
 */

/**
 * Resolves the hospital's configured timezone.
 * Defaults to 'Asia/Kolkata'.
 */
function getHospitalTimezone(hospital) {
  if (hospital && hospital.timezone) return hospital.timezone;
  if (hospital && hospital.settings && hospital.settings.timezone) return hospital.settings.timezone;
  return 'Asia/Kolkata';
}

/**
 * Calculates start (00:00:00.000) and end (23:59:59.999) UTC boundaries
 * for a hospital local calendar day in the given timezone.
 *
 * @param {string|Date|null} dateInput - Optional YYYY-MM-DD or Date object
 * @param {string} timeZone - IANA timezone string (e.g. 'Asia/Kolkata')
 * @returns {{ localDateStr: string, startUtc: Date, endUtc: Date, timeZone: string }}
 */
function getHospitalDayRange(dateInput = null, timeZone = 'Asia/Kolkata') {
  let localDateStr;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    localDateStr = dateInput;
  } else {
    const now = dateInput instanceof Date ? dateInput : new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    localDateStr = formatter.format(now); // 'YYYY-MM-DD'
  }

  const [year, month, day] = localDateStr.split('-').map(Number);

  const localToUtc = (y, m, d, h, min, s, ms) => {
    const guessUtc = new Date(Date.UTC(y, m - 1, d, h, min, s, ms));
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = dtf.formatToParts(guessUtc);
    const p = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    let localHour = parseInt(p.hour, 10);
    if (localHour === 24) localHour = 0;

    const localTimeFromGuess = Date.UTC(
      parseInt(p.year, 10),
      parseInt(p.month, 10) - 1,
      parseInt(p.day, 10),
      localHour,
      parseInt(p.minute, 10),
      parseInt(p.second, 10),
      guessUtc.getUTCMilliseconds()
    );

    const targetLocalTime = Date.UTC(y, m - 1, d, h, min, s, ms);
    const offset = localTimeFromGuess - guessUtc.getTime();
    return new Date(targetLocalTime - offset);
  };

  const startUtc = localToUtc(year, month, day, 0, 0, 0, 0);
  const endUtc = localToUtc(year, month, day, 23, 59, 59, 999);

  return { localDateStr, startUtc, endUtc, timeZone };
}

/**
 * Standardized status mapping layer for IPD Queue.
 * Mutually exclusive mapping: 'Waiting', 'In Progress', 'Completed'.
 *
 * @param {Object} admission - The IPDAdmission record
 * @returns {'Waiting'|'In Progress'|'Completed'}
 */
function mapToQueueStatus(admission) {
  if (!admission) return 'Waiting';

  const rawQueueStatus = (admission.queueStatus || '').trim().toUpperCase();

  if (
    rawQueueStatus === 'COMPLETED' || 
    rawQueueStatus === 'ADMITTED_COMPLETED' ||
    admission.dischargeSummaryStatus === 'Sent to Reception' ||
    admission.dischargeSummaryStatus === 'Completed' ||
    admission.consultationStatus === 'Completed' ||
    admission.consultationFinished === true
  ) {
    return 'Completed';
  }

  if (
    rawQueueStatus === 'IN PROGRESS' ||
    rawQueueStatus === 'IN_PROGRESS' ||
    rawQueueStatus === 'IN-PROGRESS' ||
    rawQueueStatus === 'PROCESSING'
  ) {
    return 'In Progress';
  }

  if (
    rawQueueStatus === 'WAITING' ||
    rawQueueStatus === 'PENDING' ||
    rawQueueStatus === 'SCHEDULED'
  ) {
    return 'Waiting';
  }

  // Fallback for legacy records without explicit queueStatus
  // A newly created admission starts in 'Waiting' queue status
  return 'Waiting';
}

/**
 * Formats doctor display name.
 */
function formatDoctorName(doctor) {
  if (!doctor) return 'Unassigned';
  const name = doctor.name || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Assigned';
  return name.startsWith('Dr.') ? name : `Dr. ${name}`;
}

/**
 * Formats a single recent admission entry according to API requirements.
 */
function formatRecentAdmission(admission) {
  if (!admission) return null;

  const patient = admission.patientId || {};
  const bed = admission.bedId || {};
  const ward = bed.wardId || bed.ward || {};

  return {
    admissionId: admission._id,
    patientName: patient.name || 'Patient',
    uhid: patient.uhid || 'N/A',
    admissionNumber: admission.admissionId || 'IPD-N/A',
    ward: ward.name || 'General Ward',
    bed: bed.bedNumber ? `Bed ${bed.bedNumber}` : null,
    doctorName: formatDoctorName(admission.attendingDoctorId),
    status: mapToQueueStatus(admission),
    rawStatus: admission.status,
    admittedAt: admission.admissionDate || admission.createdAt
  };
}

module.exports = {
  getHospitalTimezone,
  getHospitalDayRange,
  mapToQueueStatus,
  formatDoctorName,
  formatRecentAdmission
};
