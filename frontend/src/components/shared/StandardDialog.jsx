import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

const StandardDialog = React.memo(({
  open = false,
  isOpen, // Backward compatibility alias
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  disableEsc = false,
  className = ''
}) => {
  const activeOpen = open || isOpen;

  // Prevent body scroll when dialog is active
  useEffect(() => {
    if (activeOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [activeOpen]);

  // Handle ESC Key close
  useEffect(() => {
    if (!activeOpen || disableEsc || !onClose) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeOpen, disableEsc, onClose]);

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    booking: 'max-w-[800px] w-full',
    '2xl': 'max-w-[1100px] w-[min(1100px,90vw)]',
    max: 'max-w-[1100px] w-[min(1100px,90vw)]'
  };

  const dialogContent = (
    <AnimatePresence>
      {activeOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="standard-dialog-title"
        >
          {/* Full-Screen Dark Backdrop Overlay with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnOverlayClick ? onClose : undefined}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />

          {/* Centered Dialog Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className={`relative w-full max-h-[88vh] bg-white border border-slate-200 rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden ${sizes[size] || sizes.md} ${className}`}
          >
            {/* Fixed Header */}
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/90 shrink-0">
                <div>
                  <h3 id="standard-dialog-title" className="text-base font-bold text-[#2F63F2] uppercase tracking-wide truncate pr-4">
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</p>
                  )}
                </div>
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all cursor-pointer flex-shrink-0"
                    title="Close"
                    aria-label="Close dialog"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 text-slate-800 text-sm space-y-6">
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

  return createPortal(dialogContent, document.body);
});

StandardDialog.displayName = 'StandardDialog';

export default StandardDialog;
