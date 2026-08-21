import React from 'react';
import StandardPrescriptionTemplate from './StandardPrescriptionTemplate';
import PrePrintedPrescriptionTemplate from './PrePrintedPrescriptionTemplate';
import { PRINT_MODES, DEFAULT_PRINT_CONFIG } from './prescriptionPrint.types';
import { normalizePrescriptionData } from './printUtils';

/**
 * PrescriptionPrintEngine Component
 * Central entry point for prescription rendering.
 * Selects and renders the template based on printConfig.printMode.
 */
const PrescriptionPrintEngine = ({ 
  prescriptionData = {}, 
  doctorData = {}, 
  hospitalData = {}, 
  printConfig = DEFAULT_PRINT_CONFIG 
}) => {
  const normalizedData = normalizePrescriptionData(prescriptionData, doctorData, hospitalData);
  const mode = printConfig?.printMode || PRINT_MODES.STANDARD;

  if (mode === PRINT_MODES.PRE_PRINTED) {
    return <PrePrintedPrescriptionTemplate data={normalizedData} config={printConfig} />;
  }

  return <StandardPrescriptionTemplate data={normalizedData} config={printConfig} />;
};

export default PrescriptionPrintEngine;
