import { useState, useMemo, useCallback } from 'react';

export const useQueueFilters = (initialQueue = []) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  const filteredQueue = useMemo(() => {
    return initialQueue.filter((item) => {
      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pName = (item.patientId?.name || item.patientName || '').toLowerCase();
        const pMobile = (item.patientId?.mobile || item.mobileNumber || '').toLowerCase();
        const token = (item.tokenNumber || '').toLowerCase();
        const uhid = (item.patientId?.uhid || item.uhid || '').toLowerCase();

        const matchesSearch = pName.includes(q) || pMobile.includes(q) || token.includes(q) || uhid.includes(q);
        if (!matchesSearch) return false;
      }

      // 2. Status Filter
      if (selectedStatus !== 'ALL') {
        const itemStatus = (item.visitStatus || item.status || item.queueStatus || '').toUpperCase();
        if (itemStatus !== selectedStatus.toUpperCase()) return false;
      }

      return true;
    });
  }, [initialQueue, searchQuery, selectedStatus]);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedStatus('ALL');
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    selectedStatus,
    setSelectedStatus,
    filteredQueue,
    resetFilters
  };
};

export default useQueueFilters;
