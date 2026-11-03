import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Wrench, AlertCircle, RefreshCw } from 'lucide-react';
import { ipdService } from '../../services/ipd/ipdService';
import workflowRealtimeService from '../../services/workflowRealtimeService';
import { ROUTES } from '../../constants/routes';

/**
 * Helper to check if a date string falls on today (local time)
 */
const isToday = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
};

/**
 * Today's Bed Maintenance Live Status Dashboard Card
 * Displays real-time counts for pending, in-progress, and completed maintenance,
 * along with recent entries and a direct View All action linking to Ward & Bed management.
 */
const TodayBedMaintenanceLiveStatus = ({ isEnabled = true }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // 1. Fetch all beds for the hospital to calculate real-time maintenance metrics
  const {
    data: beds = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['ipd-beds', 'dashboardLiveStatus'],
    queryFn: async () => {
      const res = await ipdService.getBeds();
      return Array.isArray(res) ? res : [];
    },
    enabled: Boolean(isEnabled),
    refetchInterval: 10000, // 10-second polling for real-time synchronization
    refetchIntervalInBackground: false,
    staleTime: 5000
  });

  // 2. Real-time update subscription via SSE & cross-tab BroadcastChannel
  useEffect(() => {
    if (!isEnabled) return;

    const unsubscribe = workflowRealtimeService.subscribe((event) => {
      if (
        event &&
        (event.type === 'IPD_BED_UPDATED' ||
          event.type === 'BED_STATUS_UPDATED' ||
          event.type === 'IPD_ADMISSION_CREATED' ||
          event.type === 'IPD_ADMISSION_DISCHARGED')
      ) {
        queryClient.invalidateQueries({ queryKey: ['ipd-beds', 'dashboardLiveStatus'] });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isEnabled, queryClient]);

  // If IPD is explicitly disabled for this hospital, do not render the card
  if (!isEnabled) {
    return null;
  }

  // 3. Calculate status metrics from live bed data
  const pendingCount = beds.filter(
    (b) => b.status === 'Maintenance' || b.status === 'Blocked'
  ).length;

  const inProgressCount = beds.filter(
    (b) => b.status === 'Cleaning'
  ).length;

  const completedTodayCount = beds.filter(
    (b) => b.status === 'Completed' || (b.status === 'Available' && isToday(b.updatedAt))
  ).length;

  // 4. Extract recent maintenance / servicing entries
  const maintenanceEntries = beds.filter(
    (b) =>
      ['Maintenance', 'Blocked', 'Cleaning', 'Completed'].includes(b.status) ||
      (b.status === 'Available' && isToday(b.updatedAt))
  );

  // Sort so active maintenance (Pending, In Progress) are prioritized at top, followed by recent completed
  maintenanceEntries.sort((a, b) => {
    const statusOrder = { Maintenance: 1, Blocked: 1, Cleaning: 2, Completed: 3, Available: 3 };
    const rankA = statusOrder[a.status] || 4;
    const rankB = statusOrder[b.status] || 4;
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  const handleViewAll = () => {
    navigate(ROUTES.ADMIN?.IPD_WARDS || '/admin/ipd/wards');
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5 shadow-card-soft space-y-4 text-left flex flex-col justify-between h-full">
      {/* Card Header */}
      <div>
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[#2F63F2]" />
              Today's Bed Maintenance Live Status
            </h3>
            <p className="text-[11px] text-[#6B7280]">
              Housekeeping, sanitation & facility readiness
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" title="Updating..." />
            )}
            <button
              type="button"
              onClick={handleViewAll}
              className="text-xs font-semibold py-1 px-2.5 h-[30px] rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-[#2F63F2] hover:border-blue-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="Open Ward & Bed Management"
            >
              View All ({beds.length})
            </button>
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="space-y-3 animate-pulse pt-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="h-16 bg-amber-50/60 rounded-xl border border-amber-100/60" />
              <div className="h-16 bg-blue-50/60 rounded-xl border border-blue-100/60" />
              <div className="h-16 bg-emerald-50/60 rounded-xl border border-emerald-100/60" />
            </div>
            <div className="h-12 bg-slate-50 rounded-xl border border-slate-200" />
          </div>
        ) : isError ? (
          /* Error State */
          <div className="p-4 mt-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Failed to load live bed maintenance: {error?.message || 'Network error'}</span>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-1 font-semibold text-rose-800 hover:underline cursor-pointer ml-2"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-3">
            {/* Status Breakdown Bar (3 Distinct Colored Counters matching OPD & IPD design) */}
            <div className="grid grid-cols-3 gap-3 font-mono text-center text-xs">
              {/* 1. PENDING */}
              <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl space-y-0.5">
                <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                  Pending
                </div>
                <div className="text-xl font-extrabold text-amber-900">{pendingCount}</div>
              </div>

              {/* 2. IN PROGRESS */}
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-0.5">
                <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                  In Progress
                </div>
                <div className="text-xl font-extrabold text-blue-900">{inProgressCount}</div>
              </div>

              {/* 3. COMPLETED */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl space-y-0.5">
                <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                  Completed
                </div>
                <div className="text-xl font-extrabold text-emerald-900">{completedTodayCount}</div>
              </div>
            </div>

            {/* Recent Bed Maintenance Entries Preview List */}
            <div className="space-y-2 pt-1">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Recent Bed Maintenance Entries
              </h4>

              {maintenanceEntries.slice(0, 4).map((entry, idx) => {
                const isBedCompleted = entry.status === 'Completed' || (entry.status === 'Available' && isToday(entry.updatedAt));
                const isBedCleaning = entry.status === 'Cleaning';
                const statusLabel = isBedCompleted
                  ? 'Completed'
                  : isBedCleaning
                  ? 'In Progress'
                  : 'Pending';

                const badgeStyle = isBedCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : isBedCleaning
                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                  : 'bg-amber-50 text-amber-700 border-amber-100';

                return (
                  <div
                    key={entry._id || idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs transition-colors hover:bg-slate-100/70"
                  >
                    <div className="space-y-0.5 pr-2">
                      <div className="font-bold text-slate-800 text-[13px]">
                        Bed {entry.bedNumber} {entry.roomNumber ? `• Room ${entry.roomNumber}` : ''}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex flex-wrap items-center gap-1">
                        <span>Ward: {entry.wardId?.name || 'General Ward'}</span>
                        <span>|</span>
                        <span>Type: {entry.bedType || 'Standard'}</span>
                        {entry.notes && (
                          <>
                            <span>|</span>
                            <span className="truncate max-w-[150px]">{entry.notes}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap shadow-2xs ${badgeStyle}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                );
              })}

              {/* Clean Empty State */}
              {maintenanceEntries.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-xs font-mono bg-slate-50 border border-dashed rounded-xl">
                  All hospital beds operational. No active maintenance or housekeeping tickets.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TodayBedMaintenanceLiveStatus;
