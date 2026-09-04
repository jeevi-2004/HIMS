import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import SharedSidebar from '../components/SharedSidebar';
import SharedHeader from '../components/SharedHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const DashboardLayout = ({ children }) => {
  const { workspaceMode } = useWorkspace();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSubscriptionInactive = user?.role !== 'SUPER_ADMIN' && (user?.hospitalStatus === 'inactive' || user?.hospital?.status === 'inactive');

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#111827] relative font-sans">
      {/* Mobile Sidebar Toggle Backdrop Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-xs md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Shared Unified Sidebar across all roles */}
      <SharedSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* Main Content & Header Area */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0 md:pl-[270px] pb-20 md:pb-0">
        {/* Subscription Expired Warning Banner */}
        {isSubscriptionInactive && (
          <div className="bg-amber-600 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-xs sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-200 animate-bounce shrink-0" />
              <span>
                <strong>Subscription Expired (Read-Only Mode):</strong> Your hospital subscription has expired. Patient Registration, Token Generation, and Starting Consultations are locked until renewed by Super Admin.
              </span>
            </div>
            <span className="bg-amber-800/80 px-2.5 py-1 rounded-lg text-[10px] uppercase font-mono tracking-wider font-extrabold border border-amber-500/50">
              Read-Only
            </span>
          </div>
        )}

        {/* Shared Top Header bar */}
        <SharedHeader setSidebarOpen={setSidebarOpen} />

        {/* Content Body with smooth fade transitions */}
        <main className="flex-1 p-2 sm:p-6 md:p-8 max-w-[1920px] w-full mx-auto relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={workspaceMode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Role-based Mobile Bottom Navigation Bar */}
      <MobileBottomNav />
    </div>
  );
};

export default DashboardLayout;
