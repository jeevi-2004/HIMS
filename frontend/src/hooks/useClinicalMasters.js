import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { 
  getMasterList, saveMasterList, universalClinicalSearch, exportMasterCSV, getDoctorFavorites, toggleDoctorFavorite 
} from '../utils/clinicalMasters';

export const useClinicalMasters = () => {
  const [activeMasterKey, setActiveMasterKey] = useState('icd10');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState(() => getDoctorFavorites());

  const handleToggleFavorite = useCallback((key) => {
    const updated = toggleDoctorFavorite(key);
    setFavorites(updated);
    toast.success('Updated favorites');
  }, []);

  const handleExportCSV = useCallback((masterKey) => {
    exportMasterCSV(masterKey);
    toast.success('Master exported to CSV');
  }, []);

  return {
    activeMasterKey,
    setActiveMasterKey,
    searchQuery,
    setSearchQuery,
    favorites,
    handleToggleFavorite,
    handleExportCSV,
    getMasterList,
    saveMasterList,
    universalClinicalSearch
  };
};
