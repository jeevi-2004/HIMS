import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AppRoutes from './routes/AppRoutes';
import SplashScreen from './components/SplashScreen';

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem('villzone_splash_shown');
    } catch {
      return true;
    }
  });

  const handleFinishSplash = () => {
    try {
      sessionStorage.setItem('villzone_splash_shown', 'true');
    } catch {}
    setShowSplash(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative">
      <AnimatePresence mode="wait">
        {showSplash && (
          <SplashScreen key="villzone-splash" onFinish={handleFinishSplash} />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showSplash ? 0 : 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <AppRoutes />
      </motion.div>
    </div>
  );
}

export default App;
