import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ShieldCheck } from 'lucide-react';

const LOADING_MESSAGES = [
  { threshold: 0, text: 'Initializing Secure Hospital Workspace...' },
  { threshold: 28, text: 'Loading Clinical Services...' },
  { threshold: 58, text: 'Connecting Departments...' },
  { threshold: 85, text: 'Preparing Dashboard...' }
];

const SplashScreen = ({ onFinish }) => {
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(LOADING_MESSAGES[0].text);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 2600; // ~2.6s total animation fill

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      
      setProgress(pct);

      const msgObj = [...LOADING_MESSAGES].reverse().find(m => pct >= m.threshold);
      if (msgObj) {
        setCurrentMessage(msgObj.text);
      }

      if (pct >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          onFinish();
        }, 200);
      }
    }, 30);

    return () => clearInterval(timer);
  }, [onFinish]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden font-sans bg-gradient-to-br from-slate-950 via-[#0F172A] to-[#0A101D] text-white selection:bg-blue-500 selection:text-white"
    >
      {/* Background Animated Floating Blue Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Glow ambient spheres */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#2F63F2]/15 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="absolute top-1/4 left-1/3 w-[350px] h-[350px] bg-cyan-500/10 rounded-full blur-[90px] pointer-events-none" />

        {/* Floating background particles */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
              opacity: 0.1 + Math.random() * 0.4,
              scale: 0.5 + Math.random() * 0.8
            }}
            animate={{
              y: [0, -35, 0],
              x: [0, 15, 0],
              opacity: [0.2, 0.6, 0.2]
            }}
            transition={{
              duration: 4 + Math.random() * 5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: Math.random() * 2
            }}
            className="absolute w-2 h-2 rounded-full bg-blue-400/30 blur-[1px]"
          />
        ))}
      </div>

      {/* Center Branding Content Box */}
      <div className="relative z-10 flex flex-col items-center max-w-md px-6 text-center">
        
        {/* Animated Logo with Pulsing Outer Ring & Soft Blue Glow */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 25 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-6"
        >
          {/* Outer Ping Ring */}
          <div className="absolute -inset-2.5 rounded-3xl bg-[#2F63F2]/30 blur-md animate-pulse" />

          {/* Logo Box */}
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#2F63F2] via-blue-600 to-cyan-500 p-0.5 shadow-[0_0_60px_rgba(47,99,242,0.55)] border border-white/20 relative flex items-center justify-center">
            <div className="w-full h-full bg-slate-950/40 backdrop-blur-xs rounded-[22px] flex items-center justify-center">
              <span className="font-extrabold text-white text-4xl tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                V
              </span>
            </div>
            {/* Small heartbeat pulse icon badge */}
            <div className="absolute -bottom-1 -right-1 w-6.5 h-6.5 rounded-xl bg-white text-[#2F63F2] flex items-center justify-center shadow-lg border border-blue-200">
              <Activity className="w-3.5 h-3.5 text-[#2F63F2] animate-pulse" />
            </div>
          </div>
        </motion.div>

        {/* Brand Name & Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-1 mb-5"
        >
          <h1 className="text-4xl font-extrabold text-white tracking-tight flex items-center justify-center gap-2">
            VillZone <span className="text-[#2F63F2] font-black">HIMS</span>
          </h1>
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-blue-300/80">
            Hospital Information Management System
          </p>
        </motion.div>

        {/* ANIMATED ECG HEARTBEAT WAVE SVG */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-[280px] h-10 mb-6 relative flex items-center justify-center"
        >
          <svg className="w-full h-full overflow-visible" viewBox="0 0 300 40">
            <path
              d="M 0 20 L 70 20 L 80 20 L 90 5 L 100 35 L 110 0 L 120 40 L 130 15 L 140 25 L 150 20 L 300 20"
              fill="none"
              stroke="rgba(47, 99, 242, 0.2)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <motion.path
              d="M 0 20 L 70 20 L 80 20 L 90 5 L 100 35 L 110 0 L 120 40 L 130 15 L 140 25 L 150 20 L 300 20"
              fill="none"
              stroke="url(#ecg-gradient-splash)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0.2, pathOffset: 0 }}
              animate={{
                pathLength: [0.2, 0.45, 0.2],
                pathOffset: [0, 1]
              }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                ease: 'linear'
              }}
              style={{
                filter: 'drop-shadow(0px 0px 6px #2F63F2)'
              }}
            />
            <defs>
              <linearGradient id="ecg-gradient-splash" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2F63F2" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#38BDF8" stopOpacity="1" />
                <stop offset="100%" stopColor="#2F63F2" stopOpacity="0.2" />
              </linearGradient>
            </defs>
          </svg>
        </motion.div>

        {/* PROGRESS BAR & PERCENTAGE */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full space-y-3"
        >
          {/* Outer Track */}
          <div className="w-full h-2 bg-slate-900/90 rounded-full p-0.5 border border-slate-800 shadow-inner relative overflow-hidden">
            {/* Animated Fill Bar */}
            <motion.div
              className="h-full bg-gradient-to-r from-[#2F63F2] via-blue-500 to-cyan-400 rounded-full shadow-[0_0_12px_rgba(47,99,242,0.9)]"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.1 }}
            />
          </div>

          {/* Dynamic Loading Message & Percentage */}
          <div className="flex items-center justify-between text-xs font-mono px-1">
            <AnimatePresence mode="wait">
              <motion.span
                key={currentMessage}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="text-slate-300 text-[11px] font-sans font-semibold truncate tracking-wide"
              >
                {currentMessage}
              </motion.span>
            </AnimatePresence>

            <span className="font-extrabold text-[#2F63F2] font-mono text-xs ml-3">
              {progress}%
            </span>
          </div>
        </motion.div>

      </div>

      {/* Footer Security Badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="absolute bottom-6 flex items-center gap-1.5 text-[10px] text-slate-400 font-mono tracking-wider uppercase bg-slate-900/60 border border-slate-800/80 px-3.5 py-1.5 rounded-full backdrop-blur-md"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Enterprise Healthcare Security Standard</span>
      </motion.div>
    </motion.div>
  );
};

export default SplashScreen;
