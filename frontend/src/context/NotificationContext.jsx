import React, { createContext, useContext } from 'react';
import { useNotifications } from '../hooks/realtime/useNotifications';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const notificationState = useNotifications();

  return (
    <NotificationContext.Provider value={notificationState}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
