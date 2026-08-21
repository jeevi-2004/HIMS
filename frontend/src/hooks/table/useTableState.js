import { useState, useCallback } from 'react';

export const useTableState = (initialPageSize = 15) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  const handleSort = useCallback((field) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortOrder('asc');
      return field;
    });
  }, []);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    sortField,
    sortOrder,
    handlePageChange,
    handleSort
  };
};

export default useTableState;
