import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Bed, 
  Building2, 
  Plus, 
  Search, 
  ChevronDown, 
  RefreshCw, 
  Check, 
  X, 
  Sparkles, 
  MoreVertical,
  Activity,
  Wind,
  HeartPulse,
  AlertCircle,
  Pencil,
  Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { isIpdAvailable } from '../../utils/featureUtils';

const WARD_TYPES = [
  'GENERAL',
  'ICU',
  'PRIVATE',
  'SEMI_PRIVATE',
  'EMERGENCY',
  'NICU',
  'PICU',
  'PRIVATE_DELUXE',
  'OTHER'
];

const BED_TYPES = [
  'STANDARD',
  'CRITICAL_CARE',
  'DELUXE_MOTORIZED',
  'ICU_VENTILATOR',
  'SEMI_PRIVATE',
  'EMERGENCY_TROLLEY'
];

// Natural alphanumeric ascending sort for wards (e.g. ward-1, ward-2, ward-3 / ward-01, ward-02, ward-03)
const sortWardsAscending = (a, b) => {
  const nameA = (a.name || a.code || '').trim();
  const nameB = (b.name || b.code || '').trim();
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
};

// Natural alphanumeric ascending sort for rooms and beds (Room R-101, R-102, R-103, etc.)
const sortBedsAscending = (a, b) => {
  const roomA = (a.roomNumber || (a.bedNumber ? `R-${a.bedNumber.split('-')[1] || a.bedNumber}` : '')).trim();
  const roomB = (b.roomNumber || (b.bedNumber ? `R-${b.bedNumber.split('-')[1] || b.bedNumber}` : '')).trim();

  if (roomA && roomB) {
    const roomCmp = roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: 'base' });
    if (roomCmp !== 0) return roomCmp;
  } else if (roomA && !roomB) {
    return -1;
  } else if (!roomA && roomB) {
    return 1;
  }

  const bedA = (a.bedNumber || '').trim();
  const bedB = (b.bedNumber || '').trim();
  return bedA.localeCompare(bedB, undefined, { numeric: true, sensitivity: 'base' });
};

// Helper to capitalize the first letter of each word
const capitalizeWords = (str) => {
  if (!str) return '';
  return str.replace(/(^|[\s,.\-/])([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase());
};

const WardsBeds = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isIpdEnabled = Boolean(isIpdAvailable(user?.hospital || user));

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWardFilter, setSelectedWardFilter] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [isWardModalOpen, setIsWardModalOpen] = useState(false);
  const [editingWard, setEditingWard] = useState(null);
  const [isBedModalOpen, setIsBedModalOpen] = useState(false);
  const [statusMenuBedId, setStatusMenuBedId] = useState(null);

  // Ward Form State
  const [wardForm, setWardForm] = useState({
    name: '',
    code: '',
    type: 'GENERAL',
    building: '',
    floor: '',
    dailyBaseRate: '',
    nursingRate: ''
  });

  // Bed Form State
  const [bedForm, setBedForm] = useState({
    wardId: '',
    bedNumber: '',
    roomNumber: '',
    bedType: 'STANDARD',
    dailyCharge: '',
    equipment: {
      oxygen: false,
      ventilator: false,
      cardiacMonitor: false
    }
  });

  // Queries
  // 1. Wards
  const { data: wards = [], isLoading: isLoadingWards, isError: isWardsError, refetch: refetchWards } = useQuery({
    queryKey: ['ipd-wards'],
    queryFn: async () => {
      const res = await api.get('/ipd/wards');
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // 2. Beds
  const { data: beds = [], isLoading: isLoadingBeds, isError: isBedsError, refetch: refetchBeds } = useQuery({
    queryKey: ['ipd-beds'],
    queryFn: async () => {
      const res = await api.get('/ipd/beds');
      return res.data || [];
    },
    enabled: Boolean(isIpdEnabled)
  });

  // Mutations
  // Create Ward
  const createWardMutation = useMutation({
    mutationFn: async (data) => {
      return api.post('/ipd/wards', {
        ...data,
        dailyBaseRate: data.dailyBaseRate !== '' ? Number(data.dailyBaseRate) : 0,
        baseCharges: data.dailyBaseRate !== '' ? Number(data.dailyBaseRate) : 0,
        nursingRate: data.nursingRate !== '' ? Number(data.nursingRate) : 0
      });
    },
    onSuccess: () => {
      toast.success('Ward created successfully');
      queryClient.invalidateQueries(['ipd-wards']);
      setIsWardModalOpen(false);
      setEditingWard(null);
      setWardForm({
        name: '',
        code: '',
        type: 'GENERAL',
        building: '',
        floor: '',
        dailyBaseRate: '',
        nursingRate: ''
      });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Error creating ward');
    }
  });

  // Update Ward
  const updateWardMutation = useMutation({
    mutationFn: async ({ wardId, data }) => {
      return api.put(`/ipd/wards/${wardId}`, {
        ...data,
        dailyBaseRate: data.dailyBaseRate !== '' ? Number(data.dailyBaseRate) : 0,
        baseCharges: data.dailyBaseRate !== '' ? Number(data.dailyBaseRate) : 0,
        nursingRate: data.nursingRate !== '' ? Number(data.nursingRate) : 0
      });
    },
    onSuccess: () => {
      toast.success('Ward details updated successfully');
      queryClient.invalidateQueries(['ipd-wards']);
      queryClient.invalidateQueries(['ipd-beds']);
      setIsWardModalOpen(false);
      setEditingWard(null);
      setWardForm({
        name: '',
        code: '',
        type: 'GENERAL',
        building: '',
        floor: '',
        dailyBaseRate: '',
        nursingRate: ''
      });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Error updating ward details');
    }
  });

  // Create Bed
  const createBedMutation = useMutation({
    mutationFn: async (data) => {
      return api.post('/ipd/beds', {
        ...data,
        dailyCharge: data.dailyCharge ? Number(data.dailyCharge) : 0,
        status: 'Available'
      });
    },
    onSuccess: () => {
      toast.success('Bed added successfully');
      queryClient.invalidateQueries(['ipd-beds']);
      setIsBedModalOpen(false);
      setBedForm({
        wardId: '',
        bedNumber: '',
        roomNumber: '',
        bedType: 'STANDARD',
        dailyCharge: '',
        equipment: {
          oxygen: false,
          ventilator: false,
          cardiacMonitor: false
        }
      });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Error creating bed');
    }
  });

  // Update Bed Status (e.g. toggle Available / Blocked / Cleaning)
  const updateBedStatusMutation = useMutation({
    mutationFn: async ({ bedId, newStatus }) => {
      return api.put(`/ipd/beds/${bedId}`, { status: newStatus });
    },
    onSuccess: () => {
      toast.success('Bed status updated');
      queryClient.invalidateQueries(['ipd-beds']);
      setStatusMenuBedId(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Error updating bed status');
    }
  });

  // Delete Bed Mutation
  const deleteBedMutation = useMutation({
    mutationFn: async (bedId) => {
      return api.delete(`/ipd/beds/${bedId}`);
    },
    onSuccess: () => {
      toast.success('Bed deleted successfully');
      queryClient.invalidateQueries(['ipd-beds']);
      queryClient.invalidateQueries(['ipd-wards']);
      setStatusMenuBedId(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Error deleting bed');
    }
  });

  // Refresh Live Status
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchWards(), refetchBeds()]);
      toast.success('Live bed matrix refreshed');
    } catch {
      toast.error('Failed to refresh live bed status');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Form Open & Submit Handlers
  const handleOpenCreateWard = () => {
    setEditingWard(null);
    setWardForm({
      name: '',
      code: '',
      type: 'GENERAL',
      building: 'Main Clinical Wing',
      floor: '1st Floor',
      dailyBaseRate: '',
      nursingRate: ''
    });
    setIsWardModalOpen(true);
  };

  const handleOpenEditWard = (ward) => {
    setEditingWard(ward);
    setWardForm({
      name: ward.name || '',
      code: ward.code || '',
      type: ward.type || 'GENERAL',
      building: ward.building || 'Main Clinical Wing',
      floor: ward.floor || '1st Floor',
      dailyBaseRate: ward.dailyBaseRate ?? ward.baseCharges ?? 0,
      nursingRate: ward.nursingRate ?? 0
    });
    setIsWardModalOpen(true);
  };

  const handleWardFormSubmit = (e) => {
    e.preventDefault();
    if (!wardForm.name.trim()) return toast.error('Please enter ward name');
    if (editingWard) {
      updateWardMutation.mutate({ wardId: editingWard._id, data: wardForm });
    } else {
      createWardMutation.mutate(wardForm);
    }
  };

  const handleCreateBedSubmit = (e) => {
    e.preventDefault();
    if (!bedForm.wardId) return toast.error('Please select a ward');
    if (!bedForm.bedNumber.trim()) return toast.error('Please enter bed number');
    createBedMutation.mutate(bedForm);
  };

  // Sort wards in ascending order (ward-1, ward-2, ward-3 etc.)
  const sortedWards = useMemo(() => {
    return [...wards].sort(sortWardsAscending);
  }, [wards]);

  // Group beds by Ward ID and sort each ward's beds by room in ascending order
  const bedsByWard = useMemo(() => {
    const map = {};
    sortedWards.forEach(w => {
      map[w._id] = [];
    });

    beds.forEach(bed => {
      const wId = bed.wardId?._id || bed.wardId;
      if (!map[wId]) map[wId] = [];
      map[wId].push(bed);
    });

    // Sort beds in each ward by room and bed number in ascending order
    Object.keys(map).forEach(wId => {
      map[wId].sort(sortBedsAscending);
    });

    return map;
  }, [sortedWards, beds]);

  // Helper to determine true bed status based on both bed document and current admission status
  const getEffectiveBedStatus = (bed) => {
    if (!bed) return 'Available';
    if (bed.status === 'Occupied') {
      const adm = bed.currentAdmissionId;
      // Bed is truly occupied ONLY if the admission exists and is still Admitted
      if (!adm || adm.status === 'Discharged' || adm.status === 'Cancelled' || adm.status !== 'Admitted') {
        return 'Available';
      }
      return 'Occupied';
    }
    return bed.status || 'Available';
  };

  // Filtered wards and their beds (preserving ascending order)
  const filteredWardData = useMemo(() => {
    return sortedWards.filter(ward => {
      if (selectedWardFilter !== 'All' && ward._id !== selectedWardFilter && ward.name !== selectedWardFilter) {
        return false;
      }
      return true;
    }).map(ward => {
      const allWardBeds = bedsByWard[ward._id] || [];

      // Calculate counts for ward header based on effective bed status
      const availableCount = allWardBeds.filter(b => getEffectiveBedStatus(b) === 'Available').length;
      const occupiedCount = allWardBeds.filter(b => getEffectiveBedStatus(b) === 'Occupied').length;
      const cleaningCount = allWardBeds.filter(b => getEffectiveBedStatus(b) === 'Cleaning').length;
      const blockedCount = allWardBeds.filter(b => {
        const st = getEffectiveBedStatus(b);
        return st === 'Blocked' || st === 'Maintenance';
      }).length;

      // Filter individual beds in this ward
      const displayBeds = allWardBeds.filter(bed => {
        const effectiveStatus = getEffectiveBedStatus(bed);

        // Status filter
        if (selectedStatusFilter !== 'All') {
          if (selectedStatusFilter === 'Blocked' && (effectiveStatus === 'Blocked' || effectiveStatus === 'Maintenance')) {
            // match
          } else if (effectiveStatus !== selectedStatusFilter) {
            return false;
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const bedNum = (bed.bedNumber || '').toLowerCase();
          const roomNum = (bed.roomNumber || '').toLowerCase();
          const pName = effectiveStatus === 'Occupied' ? (bed.currentAdmissionId?.patientId?.name || '').toLowerCase() : '';
          const uhid = effectiveStatus === 'Occupied' ? (bed.currentAdmissionId?.patientId?.uhid || '').toLowerCase() : '';
          return bedNum.includes(q) || roomNum.includes(q) || pName.includes(q) || uhid.includes(q);
        }

        return true;
      });

      return {
        ward,
        displayBeds,
        availableCount,
        occupiedCount,
        cleaningCount,
        blockedCount
      };
    });
  }, [sortedWards, bedsByWard, selectedWardFilter, selectedStatusFilter, searchQuery]);

  if (!isIpdEnabled) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-4 border border-amber-200">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">In-Patient Department (IPD) Disabled</h2>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          The In-Patient Department feature is not enabled for your assigned hospital. Please contact your hospital administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 sm:px-6 lg:px-8 pt-1 sm:pt-2 pb-6 space-y-6 -mt-2 sm:-mt-4">
      {/* ==================================================
          PAGE HEADER (MATCHING EXISTING DASHBOARD SECTIONS)
          ================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          {/* Top section category tag matching Hospital Settings pattern */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#2F63F2] uppercase tracking-wider mb-0.5">
            <Bed className="w-3.5 h-3.5 text-[#2F63F2]" />
            In-Patient Department
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Wards & Bed Management
          </h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Live clinical bed allocation matrix, occupancy controls, and housekeeping states
          </p>
        </div>

        {/* Action Buttons: Add Ward & Add Bed */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleOpenCreateWard}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold uppercase tracking-wider rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-slate-700 stroke-[2.2]" />
            <span>Add Ward</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBedModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 h-9 bg-[#2F63F2] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-white stroke-[2.2]" />
            <span>Add Bed</span>
          </button>
        </div>
      </div>

      {/* ==================================================
          SEARCH AND FILTER SECTION
          ================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-lg">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bed, patient or room..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all"
              />
            </div>

            {/* Ward & Status Filter: 1 row and 2 columns in mobile view only */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3.5 w-full sm:w-auto">
              {/* Ward Filter */}
              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0">
                  Ward:
                </label>
                <div className="relative flex-1 sm:flex-initial min-w-0">
                  <select
                    value={selectedWardFilter}
                    onChange={(e) => setSelectedWardFilter(e.target.value)}
                    className="w-full min-w-0 sm:min-w-[150px] appearance-none bg-white border border-slate-200 rounded-lg pl-2.5 sm:pl-3.5 pr-7 sm:pr-8 py-2 text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer truncate"
                  >
                    <option value="All">All Wards</option>
                    {sortedWards.map((ward) => (
                      <option key={ward._id} value={ward._id}>
                        {ward.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-400 absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0">
                  Status:
                </label>
                <div className="relative flex-1 sm:flex-initial min-w-0">
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value)}
                    className="w-full min-w-0 sm:min-w-[130px] appearance-none bg-white border border-slate-200 rounded-lg pl-2.5 sm:pl-3.5 pr-7 sm:pr-8 py-2 text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer truncate"
                  >
                    <option value="All">All States</option>
                    <option value="Available">Available</option>
                    <option value="Occupied">Occupied</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                  <ChevronDown className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-400 absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Refresh Live Status Button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Live Status</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================
          WARD DISPLAY CARDS & BED CARDS
          ================================================== */}
      {isLoadingWards || isLoadingBeds ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500/20 border-t-[#2F63F2] rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500">Loading clinical wards & bed allocation matrix...</p>
        </div>
      ) : isWardsError || isBedsError ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col items-center justify-center gap-3">
          <AlertCircle className="w-8 h-8 text-rose-500" />
          <p className="text-sm font-semibold text-slate-800">Failed to load wards or beds.</p>
          <button
            onClick={() => handleRefresh()}
            className="px-4 py-1.5 text-xs font-semibold text-[#2F63F2] border border-[#2F63F2] rounded-lg hover:bg-blue-50 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : wards.length === 0 ? (
        /* Empty state: No wards in hospital */
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-3">
          <div className="w-12 h-12 bg-blue-50 text-[#2F63F2] rounded-full flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No wards configured yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Get started by configuring your hospital's inpatient care units, general wards, or ICUs.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateWard}
            className="px-4 py-2 bg-[#2F63F2] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            + Add Ward
          </button>
        </div>
      ) : (
        /* Ward Cards List */
        <div className="space-y-6">
          {filteredWardData.map(({ ward, displayBeds, availableCount, occupiedCount, cleaningCount }) => {
            const wardCode = ward.code || (ward.name ? `W-${ward.name.substring(0, 3).toUpperCase()}` : 'W-01');
            const wardType = ward.type ? ward.type.toUpperCase() : 'GENERAL';
            const building = ward.building || 'Main Clinical Wing';
            const floor = ward.floor || '1st Floor';
            const baseRate = ward.dailyBaseRate || ward.baseCharges || 0;

            return (
              <div
                key={ward._id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4"
              >
                {/* Ward Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">
                        {ward.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        {wardCode}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {wardType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {ward.building ? <span className="text-slate-500">Building: <span className="font-semibold text-slate-700">{ward.building}</span> • </span> : null}
                      Floor: <span className="font-semibold text-slate-700">{floor}</span> • Base Rate: <span className="font-semibold text-slate-700">₹{baseRate}/day</span>
                    </p>
                  </div>

                  {/* Bed status count badges & Edit button on right */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleOpenEditWard(ward)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-[#2F63F2] bg-white hover:bg-blue-50/70 border border-slate-200 hover:border-blue-200 rounded-lg shadow-2xs transition-all duration-150 cursor-pointer"
                      title="Edit Ward Details (Floor, Base Rate)"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit</span>
                    </button>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {availableCount} Available
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200">
                      {occupiedCount} Occupied
                    </span>
                    {cleaningCount > 0 && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {cleaningCount} Cleaning
                      </span>
                    )}
                  </div>
                </div>

                {/* Thin separator line */}
                <div className="border-t border-slate-100"></div>

                {/* Bed Cards Grid */}
                {displayBeds.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-medium">
                    No beds match the current filters in this ward.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {displayBeds.map((bed) => {
                      const effectiveStatus = getEffectiveBedStatus(bed);
                      const isAvailable = effectiveStatus === 'Available';
                      const isOccupied = effectiveStatus === 'Occupied';
                      const isBlocked = effectiveStatus === 'Blocked' || effectiveStatus === 'Maintenance';
                      const isCleaning = effectiveStatus === 'Cleaning';

                      const dailyCharge = bed.dailyCharge || baseRate;
                      const roomNumber = bed.roomNumber || (bed.bedNumber ? `R-${bed.bedNumber.split('-')[1] || bed.bedNumber}` : 'R-01');
                      const bedType = bed.bedType ? bed.bedType.toUpperCase() : 'STANDARD';

                      // Container styling based on bed status
                      let cardBorder = 'border-emerald-300 bg-[#f0fdf4]/50';
                      let statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 border border-emerald-300 text-emerald-700">
                          <Check className="w-3 h-3 stroke-[2.5]" /> Available
                        </span>
                      );
                      let mainArea = (
                        <div className="bg-emerald-100/70 text-emerald-800 text-xs font-semibold py-2 px-3 rounded-lg text-center my-2">
                          Ready for Patient Admission
                        </div>
                      );

                      if (isBlocked) {
                        cardBorder = 'border-slate-300 bg-slate-50/70';
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 border border-slate-300 text-slate-700">
                            <X className="w-3 h-3 stroke-[2.5]" /> Blocked
                          </span>
                        );
                        mainArea = (
                          <div className="bg-slate-100 text-slate-700 text-xs font-semibold py-2 px-3 rounded-lg text-center my-2">
                            Bed BLOCKED
                          </div>
                        );
                      } else if (isCleaning) {
                        cardBorder = 'border-blue-300 bg-blue-50/50';
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 border border-amber-300 text-amber-700">
                            <Sparkles className="w-3 h-3 stroke-[2.5]" /> Cleaning
                          </span>
                        );
                        mainArea = (
                          <div className="bg-blue-100/80 text-blue-800 text-xs font-semibold py-2 px-3 rounded-lg text-center my-2 flex items-center justify-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span>Housekeeping In Progress</span>
                          </div>
                        );
                      } else if (isOccupied) {
                        cardBorder = 'border-rose-300 bg-rose-50/50';
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 border border-rose-300 text-rose-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Occupied
                          </span>
                        );
                        const patientName = bed.currentAdmissionId?.patientId?.name || 'Inpatient Admitted';
                        mainArea = (
                          <div className="bg-rose-100/80 text-rose-900 text-xs font-semibold py-2 px-3 rounded-lg text-center my-2 truncate">
                            {patientName}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={bed._id}
                          className={`relative rounded-xl p-3.5 border ${cardBorder} shadow-2xs flex flex-col justify-between transition-all hover:shadow-xs`}
                        >
                          {/* Top Row: Bed Number & Status Badge */}
                          <div>
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-bold text-slate-900 text-sm">
                                Bed {bed.bedNumber}
                              </span>
                              <div className="flex items-center gap-1">
                                {statusBadge}
                                {/* Quick Status change menu button */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setStatusMenuBedId(statusMenuBedId === bed._id ? null : bed._id)}
                                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-white/80 rounded transition-colors cursor-pointer"
                                    title="Change Bed Status"
                                  >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>

                                  {statusMenuBedId === bed._id && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-20 cursor-default"
                                        onClick={() => setStatusMenuBedId(null)}
                                      />
                                      <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-xs">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setStatusMenuBedId(null);
                                            updateBedStatusMutation.mutate({ bedId: bed._id, newStatus: 'Available' });
                                          }}
                                          disabled={isOccupied}
                                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-emerald-700 font-semibold disabled:opacity-40 cursor-pointer"
                                        >
                                          ✓ Set Available
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setStatusMenuBedId(null);
                                            updateBedStatusMutation.mutate({ bedId: bed._id, newStatus: 'Cleaning' });
                                          }}
                                          disabled={isOccupied}
                                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-blue-700 font-semibold disabled:opacity-40 cursor-pointer"
                                        >
                                          ✨ Housekeeping
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (window.confirm(`Are you sure you want to delete Bed ${bed.bedNumber}?`)) {
                                              setStatusMenuBedId(null);
                                              deleteBedMutation.mutate(bed._id);
                                            }
                                          }}
                                          disabled={isOccupied || deleteBedMutation.isPending}
                                          className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 font-semibold disabled:opacity-40 flex items-center gap-1.5 cursor-pointer transition-colors"
                                          title={isOccupied ? 'Cannot delete an occupied bed' : 'Delete Bed'}
                                        >
                                          <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Second Row: Room Number & Bed Type */}
                            <div className="flex items-center justify-between text-xs mt-1 text-slate-500 font-medium">
                              <span>Room: <strong className="text-slate-700">{roomNumber}</strong></span>
                              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
                                {bedType}
                              </span>
                            </div>

                            {/* Main Status Area */}
                            {mainArea}
                          </div>

                          {/* Bottom Row: Equipment Badges & Daily Rate */}
                          <div className="flex items-center justify-between pt-1 text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {bed.equipment?.oxygen && (
                                <span className="inline-flex items-center gap-0.5 border border-cyan-300 bg-cyan-50/80 text-cyan-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                  <Wind className="w-2.5 h-2.5" /> O₂
                                </span>
                              )}
                              {bed.equipment?.ventilator && (
                                <span className="inline-flex items-center gap-0.5 border border-purple-300 bg-purple-50/80 text-purple-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                  <Activity className="w-2.5 h-2.5" /> Vent
                                </span>
                              )}
                              {bed.equipment?.cardiacMonitor && (
                                <span className="inline-flex items-center gap-0.5 border border-blue-300 bg-blue-50/80 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                  <HeartPulse className="w-2.5 h-2.5" /> Monitor
                                </span>
                              )}
                              {!bed.equipment?.oxygen && !bed.equipment?.ventilator && !bed.equipment?.cardiacMonitor && (
                                <span className="text-[10px] text-slate-400 font-normal">Standard</span>
                              )}
                            </div>

                            <span className="font-bold text-slate-700 text-xs shrink-0">
                              ₹{dailyCharge}/d
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================
          CONFIGURE / EDIT WARD MODAL
          ================================================== */}
      <Modal
        isOpen={isWardModalOpen}
        onClose={() => {
          setIsWardModalOpen(false);
          setEditingWard(null);
        }}
        title={
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#2F63F2]" />
            <span className="text-base font-bold text-slate-900 tracking-tight">
              {editingWard ? `Edit Ward Details` : 'Configure New Ward'}
            </span>
          </div>
        }
        size="md"
        className="!max-w-[480px]"
      >
        <form onSubmit={handleWardFormSubmit} className="space-y-3.5 sm:space-y-4">
          {/* Row 1: Ward Name & Ward Type (1 row & 2 columns) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Ward Name">
                Ward Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ward C"
                value={wardForm.name}
                onChange={(e) => setWardForm({ ...wardForm, name: capitalizeWords(e.target.value) })}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Ward Type">
                Ward Type
              </label>
              <div className="relative">
                <select
                  value={wardForm.type}
                  onChange={(e) => setWardForm({ ...wardForm, type: e.target.value })}
                  className="w-full appearance-none px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer pr-7"
                >
                  {WARD_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Row 2: Base Rate & Floor (1 row & 2 columns) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Base Rate (₹/day)">
                Base Rate (₹/day)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={wardForm.dailyBaseRate}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = val.split('.');
                  if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                  setWardForm({ ...wardForm, dailyBaseRate: val });
                }}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Floor">
                Floor
              </label>
              <input
                type="text"
                placeholder="e.g. 1st Floor"
                value={wardForm.floor}
                onChange={(e) => setWardForm({ ...wardForm, floor: capitalizeWords(e.target.value) })}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all"
              />
            </div>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex justify-between items-center gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsWardModalOpen(false);
                setEditingWard(null);
              }}
              className="px-4 py-2 border border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-blue-50 active:bg-blue-100 font-bold rounded-xl transition-all text-sm cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={editingWard ? updateWardMutation.isPending : createWardMutation.isPending}
              className="px-5 py-2 bg-[#2F63F2] hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
            >
              {editingWard ? (
                updateWardMutation.isPending ? 'Saving...' : 'Save Changes'
              ) : (
                createWardMutation.isPending ? 'Creating...' : 'Create Ward'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================================================
          ADD INPATIENT BED MODAL (MATCHING IMAGE 2)
          ================================================== */}
      <Modal
        isOpen={isBedModalOpen}
        onClose={() => setIsBedModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Bed className="w-4 h-4 text-[#2F63F2]" />
            <span className="text-base font-bold text-slate-900 tracking-tight">Add Inpatient Bed</span>
          </div>
        }
        size="md"
      >
        <form onSubmit={handleCreateBedSubmit} className="space-y-4">
          {/* Field 1: Select Ward */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Ward <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                required
                value={bedForm.wardId}
                onChange={(e) => setBedForm({ ...bedForm, wardId: e.target.value })}
                className="w-full appearance-none px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer"
              >
                <option value="">-- Choose Ward --</option>
                {sortedWards.map(w => (
                  <option key={w._id} value={w._id}>{w.name} ({w.type || 'General'})</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Field 2 & 3: Bed Number & Room Number (1 row & 2 columns) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Bed Number">
                Bed Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="E.G. A-107"
                value={bedForm.bedNumber}
                onChange={(e) => setBedForm({ ...bedForm, bedNumber: e.target.value })}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Room Number">
                Room Number
              </label>
              <input
                type="text"
                placeholder="E.G. R-104"
                value={bedForm.roomNumber}
                onChange={(e) => setBedForm({ ...bedForm, roomNumber: e.target.value })}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all uppercase"
              />
            </div>
          </div>

          {/* Field 4 & 5: Bed Type & Daily Charge (1 row & 2 columns) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Bed Type">
                Bed Type
              </label>
              <div className="relative">
                <select
                  value={bedForm.bedType}
                  onChange={(e) => setBedForm({ ...bedForm, bedType: e.target.value })}
                  className="w-full appearance-none px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] cursor-pointer pr-7"
                >
                  {BED_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Daily Charge (₹)">
                Daily Charge (₹)
              </label>
              <input
                type="number"
                min="0"
                placeholder="800"
                value={bedForm.dailyCharge}
                onChange={(e) => setBedForm({ ...bedForm, dailyCharge: e.target.value })}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/20 focus:border-[#2F63F2] transition-all"
              />
            </div>
          </div>

          {/* Field 6: Equipment Attached Checkboxes */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
            <label className="block text-xs font-bold text-slate-700">
              Equipment Attached:
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bedForm.equipment.oxygen}
                  onChange={(e) => setBedForm({
                    ...bedForm,
                    equipment: { ...bedForm.equipment, oxygen: e.target.checked }
                  })}
                  className="w-4 h-4 text-[#2F63F2] rounded border-slate-300 focus:ring-[#2F63F2]"
                />
                <span>Oxygen Pipeline / Cylinder</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bedForm.equipment.ventilator}
                  onChange={(e) => setBedForm({
                    ...bedForm,
                    equipment: { ...bedForm.equipment, ventilator: e.target.checked }
                  })}
                  className="w-4 h-4 text-[#2F63F2] rounded border-slate-300 focus:ring-[#2F63F2]"
                />
                <span>Ventilator Machine</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bedForm.equipment.cardiacMonitor}
                  onChange={(e) => setBedForm({
                    ...bedForm,
                    equipment: { ...bedForm.equipment, cardiacMonitor: e.target.checked }
                  })}
                  className="w-4 h-4 text-[#2F63F2] rounded border-slate-300 focus:ring-[#2F63F2]"
                />
                <span>Multi-para Cardiac Monitor</span>
              </label>
            </div>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex justify-end items-center gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsBedModalOpen(false)}
              className="px-4 py-2 border border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-blue-50 active:bg-blue-100 font-bold rounded-xl transition-all text-sm cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={createBedMutation.isPending}
              className="px-5 py-2 bg-[#2F63F2] hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm cursor-pointer disabled:opacity-60"
            >
              {createBedMutation.isPending ? 'Adding...' : 'Add Bed'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default WardsBeds;
