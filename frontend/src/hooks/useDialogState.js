import { useState, useCallback } from 'react';

export const useDialogState = (initialOpen = false, initialData = null) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState(initialData);

  const openDialog = useCallback((dialogData = null) => {
    setData(dialogData);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const toggleDialog = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    data,
    openDialog,
    closeDialog,
    toggleDialog,
    setIsOpen,
    setData
  };
};

export default useDialogState;
