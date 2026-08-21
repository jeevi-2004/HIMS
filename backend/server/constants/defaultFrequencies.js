// VillZone HIMS — Default Medicine Frequency Seed Master

const DEFAULT_MEDICINE_FREQUENCIES = [
  {
    code: 'OD',
    englishName: 'Once Daily',
    explanation: 'Take 1 dose per day (Morning)',
    gridPattern: '1-0-0'
  },
  {
    code: 'TDS',
    englishName: 'Thrice Daily',
    explanation: 'Take 3 doses per day (Morning, Afternoon, and Night)',
    gridPattern: '1-1-1'
  },
  {
    code: 'QID',
    englishName: 'Four Times Daily',
    explanation: 'Take 4 doses per day (Every 6 hours)',
    gridPattern: '1-1-1-1'
  },
  {
    code: 'SOS',
    englishName: 'As Needed',
    explanation: 'Take only when needed or when symptoms occur',
    gridPattern: 'SOS'
  },
  {
    code: 'STAT',
    englishName: 'Immediately',
    explanation: 'Take immediately as a single dose',
    gridPattern: 'STAT'
  },
  {
    code: 'HS',
    englishName: 'At Bedtime',
    explanation: 'Take 1 dose at night before sleeping',
    gridPattern: '0-0-1'
  },
  {
    code: 'OM',
    englishName: 'Afternoon Only',
    explanation: 'Take 1 dose in the afternoon only',
    gridPattern: '0-1-0'
  },
  {
    code: 'BID_HALF',
    englishName: 'Half Morning & Night',
    explanation: 'Take half dose in morning and half dose at night',
    gridPattern: '½-0-½'
  },
  {
    code: 'TD_NO_NIGHT',
    englishName: 'Morning & Afternoon',
    explanation: 'Take 1 dose in morning and 1 in afternoon',
    gridPattern: '1-1-0'
  },
  {
    code: 'TD_NO_MORN',
    englishName: 'Afternoon & Night',
    explanation: 'Take 1 dose in afternoon and 1 at night',
    gridPattern: '0-1-1'
  }
];

module.exports = DEFAULT_MEDICINE_FREQUENCIES;
