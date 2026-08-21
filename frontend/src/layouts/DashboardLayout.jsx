import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import SharedSidebar from '../components/SharedSidebar';
import SharedHeader from '../components/SharedHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { motion, AnimatePresence } from 'framer-motion';

const DashboardLayout = ({ children }) => {
  const { workspaceMode } = useWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <div className="flex-1 flex flex-col min-h-screen min-w-0 pb-20 md:pb-0">
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
