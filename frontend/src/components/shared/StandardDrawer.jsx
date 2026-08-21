import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import DrawerHeader from './DrawerHeader';

const StandardDrawer = React.memo(({
  open = false,
  isOpen, // Backward compatibility alias
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
  width,
  closeOnOverlayClick = true,
  disableEsc = false,
  className = ''
}) => {
  const activeOpen = open || isOpen;

  // Prevent body scroll when drawer is active
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
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl'
  };

  const drawerContent = (
    <AnimatePresence>
      {activeOpen && (
        <div 
          className="fixed inset-0 z-[9999] overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Overlay Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnOverlayClick ? onClose : undefined}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs"
          />

          {/* Drawer Container Panel */}
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.35 }}
              className={`w-screen ${width || sizes[size] || sizes.md} bg-white shadow-2xl flex flex-col ${className}`}
            >
              {/* Header */}
              {title && (
                <DrawerHeader
                  title={title}
                  subtitle={subtitle}
                  icon={icon}
                  onClose={onClose}
                />
              )}

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {children}
              </div>

              {/* Sticky Footer */}
              {footer && (
                <div className="p-4 border-t border-[#E5E7EB] bg-slate-50 shrink-0">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(drawerContent, document.body);
});

StandardDrawer.displayName = 'StandardDrawer';

export default StandardDrawer;
