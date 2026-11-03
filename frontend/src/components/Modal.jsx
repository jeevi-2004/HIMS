import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className = '',
  bodyClassName = 'p-6 text-slate-800 text-sm space-y-6',
  closeOnOverlayClick = true
}) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    booking: 'max-w-[800px] w-full',
    '2xl': 'max-w-[1100px] w-[min(1100px,90vw)]',
    max: 'max-w-[1100px] w-[min(1100px,90vw)]'
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          {/* Full-Screen Dark Backdrop Overlay with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnOverlayClick ? onClose : undefined}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />

          {/* Centered Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className={`relative w-full max-h-[88vh] bg-white border border-slate-200 rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden ${sizes[size] || sizes.md} ${className}`}
          >
            {/* Fixed Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/90 shrink-0">
              {typeof title === 'string' ? (
                <h3 className="text-base font-bold text-[#2F63F2] uppercase tracking-wide truncate pr-4">{title}</h3>
              ) : (
                <div className="flex-1 pr-4 min-w-0">{title}</div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all cursor-pointer flex-shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body Only */}
            <div className={`flex-1 overflow-y-auto ${bodyClassName}`}>
              {children}
            </div>

            {/* Fixed Footer (if provided) */}
            {footer && (
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex justify-end items-center gap-3 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
