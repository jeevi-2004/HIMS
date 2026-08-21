import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import { ShieldAlert } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center text-center p-6 relative overflow-hidden font-sans">
      {/* Glow backgrounds */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 glow-primary-subtle opacity-40 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 glow-blue-subtle opacity-30 pointer-events-none" />

      <div className="max-w-md space-y-6 relative z-10 bg-white border border-[#E5E7EB] rounded-[20px] shadow-card-soft p-8">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-10 h-10" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-[#111827]">
          404 - Page Not Found
        </h1>
        
        <p className="text-xs text-[#6B7280] leading-relaxed">
          The clinic module or resource directory you are trying to access does not exist or has been relocated within the HIMS network directory.
        </p>

        <div className="flex justify-center pt-2">
          <Link to="/dashboard">
            <Button variant="primary">
              Return to Safe Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
