import { useState, useCallback } from 'react';

export const useDrawerState = (initialOpen = false, initialRecord = null) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [record, setRecord] = useState(initialRecord);

  const openDrawer = useCallback((selectedRecord = null) => {
    setRecord(selectedRecord);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setRecord(null);
  }, []);

  const toggleDrawer = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    record,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    setIsOpen,
    setRecord
  };
};

export default useDrawerState;
