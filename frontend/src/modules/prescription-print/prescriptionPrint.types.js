/**
 * Prescription Print Types & Contracts
 */

export const PRINT_MODES = Object.freeze({
  STANDARD: 'STANDARD',
  PRE_PRINTED: 'PRE_PRINTED'
});

export const PAPER_SIZES = Object.freeze({
  A4: 'A4',
  A5: 'A5',
  LETTER: 'LETTER',
  CUSTOM: 'CUSTOM'
});

export const PAPER_ORIENTATIONS = Object.freeze({
  PORTRAIT: 'PORTRAIT',
  LANDSCAPE: 'LANDSCAPE'
});

export const DEFAULT_PRINT_CONFIG = Object.freeze({
  printMode: PRINT_MODES.STANDARD,
  paper: {
    size: PAPER_SIZES.A4,
    orientation: PAPER_ORIENTATIONS.PORTRAIT,
    margin: 'MEDIUM',
    scale: 100,
    width: 210,
    height: 297
  },
  calibration: {
    topOffset: 0,
    leftOffset: 0,
    hardwareScale: 100
  },
  template: {
    fieldMappings: [],
    medicineTableConfig: {
      x: 20,
      y: 100,
      width: 170,
      columns: {
        medicineName: { visible: true, label: 'Medicine Name', width: 35 },
        dosage: { visible: true, label: 'Dosage', width: 15 },
        frequency: { visible: true, label: 'Frequency', width: 15 },
        duration: { visible: true, label: 'Duration', width: 15 },
        foodTiming: { visible: true, label: 'Food Timing', width: 20 }
      }
    }
  },
  letterhead: {
    enabled: false,
    backgroundImage: null
  }
});
