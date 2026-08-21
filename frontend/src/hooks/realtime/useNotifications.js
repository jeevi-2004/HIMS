import { useState, useCallback } from 'react';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((notification) => {
    setNotifications((prev) => [
      { id: Date.now(), timestamp: new Date(), read: false, ...notification },
      ...prev
    ]);
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    markAsRead,
    clearNotifications
  };
};

export default useNotifications;
