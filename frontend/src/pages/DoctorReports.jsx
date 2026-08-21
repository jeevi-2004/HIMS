import React from 'react';
import Card from '../components/Card';
import { BarChart3 } from 'lucide-react';

const DoctorReports = () => {
  return (
    <div className="space-y-5 text-left px-4 sm:px-5 md:px-6 py-4 sm:py-5 bg-[#F8FAFC] min-h-screen">
      
      {/* Page Heading Outside Content Card */}
      <div className="pb-2 border-b border-[#E5E7EB]">
        <h1 className="text-xl font-bold text-[#111827] flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2]">
            <BarChart3 className="w-5 h-5" />
          </div>
          Doctor Reports & Analytics
        </h1>
        <p className="text-xs text-[#6B7280] mt-1 font-medium">
          Outpatient consultation diagnosis ratios and intake channel metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5 shadow-card-soft space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#111827]">
              📊 Diagnosis Ratios Breakdown
            </h3>
            <p className="text-xs text-[#6B7280] font-medium mt-0.5">
              Outpatient consultation case categories.
            </p>
          </div>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-[#111827]"><span>Infections / Fever</span> <span className="font-mono text-[#2F63F2]">50%</span></div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#2F63F2] rounded-full" style={{ width: '50%' }}></div>
              </div>
            </div>
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-[#111827]"><span>Chronic Illness / Hypertension</span> <span className="font-mono text-purple-600">30%</span></div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: '30%' }}></div>
              </div>
            </div>
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-[#111827]"><span>Procedures & Minor Surgery</span> <span className="font-mono text-emerald-600">20%</span></div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '20%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5 shadow-card-soft space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#111827]">
              📈 Patient Intake Channels
            </h3>
            <p className="text-xs text-[#6B7280] font-medium mt-0.5">
              Scheduled appointments vs walk-ins.
            </p>
          </div>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-[#111827]"><span>Emergency Intake</span> <span className="font-mono text-rose-600">10%</span></div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: '10%' }}></div>
              </div>
            </div>
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-[#111827]"><span>Regular Walk-In</span> <span className="font-mono text-[#2F63F2]">70%</span></div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#2F63F2] rounded-full" style={{ width: '70%' }}></div>
              </div>
            </div>
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-[#111827]"><span>Pre-Booked Slots</span> <span className="font-mono text-amber-600">20%</span></div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '20%' }}></div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DoctorReports;
