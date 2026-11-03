import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bed, AlertCircle, RefreshCw } from 'lucide-react';
import { ipdService } from '../../services/ipd/ipdService';
import workflowRealtimeService from '../../services/workflowRealtimeService';

/**
 * Today's IPD Queue Live Status Dashboard Card
 * Matches the existing OPD Queue Live Status styling and provided IPD reference design.
 */
const TodayIpdQueueLiveStatus = ({ hospitalInfo, isEnabled = true }) => {
  const queryClient = useQueryClient();

  // 1. Fetch live IPD statistics and recent admissions
  const {
    data: ipdData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['ipd', 'dashboardLiveStatus'],
    queryFn: async () => {
      const res = await ipdService.getDashboardLiveStatus();
      return res;
    },
    enabled: Boolean(isEnabled),
    refetchInterval: 10000, // 10-second polling for guaranteed fresh state
    refetchIntervalInBackground: false,
    staleTime: 5000
  });

  // 2. Real-time update subscription via SSE & cross-tab BroadcastChannel
  useEffect(() => {
    if (!isEnabled) return;

    const unsubscribe = workflowRealtimeService.subscribe((event) => {
      if (
        event &&
        (event.type === 'IPD_ADMISSION_CREATED' ||
          event.type === 'IPD_ADMISSION_STATUS_UPDATED' ||
          event.type === 'IPD_ADMISSION_DISCHARGED' ||
          event.type === 'ADMISSION_UPDATED')
      ) {
        queryClient.invalidateQueries({ queryKey: ['ipd', 'dashboardLiveStatus'] });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isEnabled, queryClient]);

  // If IPD is explicitly disabled for this hospital, do not render the card
  if (!isEnabled || ipdData?.enabled === false) {
    return null;
  }

  const totalAdmissions = ipdData?.totalAdmissions ?? 0;
  const waiting = ipdData?.waiting ?? 0;
  const inProgress = ipdData?.inProgress ?? 0;
  const completed = ipdData?.completed ?? 0;
  const recentAdmissions = ipdData?.recentAdmissions || [];

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5 shadow-card-soft space-y-4 text-left">
      {/* Card Header */}
      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
            <Bed className="w-4 h-4 text-[#2F63F2]" />
            Today's IPD Queue Live Status
          </h3>
          <p className="text-[11px] text-[#6B7280]">
            Real-time inpatient admission queue progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" title="Updating..." />
          )}
          <span className="text-xs font-mono font-bold text-[#2F63F2] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
            {totalAdmissions} Total Admissions
          </span>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 bg-amber-50/60 rounded-xl border border-amber-100/60" />
            <div className="h-16 bg-blue-50/60 rounded-xl border border-blue-100/60" />
            <div className="h-16 bg-emerald-50/60 rounded-xl border border-emerald-100/60" />
          </div>
          <div className="h-12 bg-slate-50 rounded-xl border border-slate-200" />
        </div>
      ) : isError ? (
        /* Error State */
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Failed to load live IPD status: {error?.message || 'Network error'}</span>
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
        <>
          {/* Status Breakdown Bar (3 Distinct Colored Counters) */}
          <div className="grid grid-cols-3 gap-3 font-mono text-center text-xs">
            {/* 1. WAITING */}
            <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl space-y-0.5">
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                Waiting
              </div>
              <div className="text-xl font-extrabold text-amber-900">{waiting}</div>
            </div>

            {/* 2. IN PROGRESS */}
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-0.5">
              <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                In Progress
              </div>
              <div className="text-xl font-extrabold text-blue-900">{inProgress}</div>
            </div>

            {/* 3. COMPLETED */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl space-y-0.5">
              <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                Completed
              </div>
              <div className="text-xl font-extrabold text-emerald-900">{completed}</div>
            </div>
          </div>

          {/* Recent Admission Entries Preview List */}
          <div className="space-y-2 pt-1">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Recent Admission Entries
            </h4>

            {recentAdmissions.slice(0, 2).map((entry, idx) => {
              const status = entry.status || 'Waiting';
              return (
                <div
                  key={entry.admissionId || idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs transition-colors hover:bg-slate-100/70"
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="font-bold text-slate-800 text-[13px]">
                      {entry.patientName || 'Inpatient'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono flex flex-wrap items-center gap-1">
                      <span>UHID: {entry.uhid || 'N/A'}</span>
                      <span>|</span>
                      <span>
                        Ward: {entry.ward || 'General Ward'}
                        {entry.bed ? ` (${entry.bed})` : ''}
                      </span>
                      <span>|</span>
                      <span>Doctor: {entry.doctorName || 'Assigned'}</span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap shadow-2xs ${
                      status === 'Completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : status === 'In Progress'
                        ? 'bg-blue-50 text-blue-700 border-blue-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {status}
                  </span>
                </div>
              );
            })}

            {/* Clear Empty State */}
            {recentAdmissions.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs font-mono bg-slate-50 border border-dashed rounded-xl">
                No inpatient admissions recorded for today yet.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TodayIpdQueueLiveStatus;
