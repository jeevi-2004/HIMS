import React, { useState } from 'react';
import PrescriptionPrintEngine from './PrescriptionPrintEngine';
import { triggerPrint } from './printUtils';
import { PRINT_MODES, DEFAULT_PRINT_CONFIG } from './prescriptionPrint.types';
import Button from '../../components/Button';
import { Printer, Eye, Sliders, CheckCircle } from 'lucide-react';

/**
 * PrescriptionPrintPreview Component
 * Renders the selected template inside a print-friendly container with mode switcher & print triggers.
 */
const PrescriptionPrintPreview = ({ 
  rawConsultation = {}, 
  rawDoctor = {}, 
  rawHospital = {},
  initialConfig = DEFAULT_PRINT_CONFIG 
}) => {
  const [config, setConfig] = useState(initialConfig);

  const handleToggleMode = (mode) => {
    setConfig(prev => ({
      ...prev,
      printMode: mode
    }));
  };

  const handlePrint = () => {
    triggerPrint(rawConsultation, rawDoctor, config);
  };

  return (
    <div className="space-y-4 font-sans text-left">
      
      {/* Top Toolbar (Hidden during print) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Template Mode:</span>
          
          <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleToggleMode(PRINT_MODES.STANDARD)}
              className={`px-3 py-1.5 rounded-md transition-all ${
                config.printMode === PRINT_MODES.STANDARD
                  ? 'bg-white text-[#2F63F2] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Standard Digital
            </button>

            <button
              type="button"
              onClick={() => handleToggleMode(PRINT_MODES.PRE_PRINTED)}
              className={`px-3 py-1.5 rounded-md transition-all ${
                config.printMode === PRINT_MODES.PRE_PRINTED
                  ? 'bg-white text-[#2F63F2] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pre-printed Pad
            </button>
          </div>
        </div>

        <Button
          onClick={handlePrint}
          variant="primary"
          icon={Printer}
          className="text-xs font-bold uppercase tracking-wider h-9 px-4 bg-[#2F63F2]"
        >
          Print Prescription
        </Button>
      </div>

      {/* Render Engine inside Print Container */}
      <div className="prescription-print-root">
        <PrescriptionPrintEngine 
          prescriptionData={rawConsultation} 
          doctorData={rawDoctor} 
          hospitalData={rawHospital} 
          printConfig={config} 
        />
      </div>

    </div>
  );
};

export default PrescriptionPrintPreview;
