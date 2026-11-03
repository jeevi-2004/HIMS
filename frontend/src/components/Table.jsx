import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';

// Safe helper to render action icons whether passed as Lucide components, dynamic functions, or React elements
const renderActionIcon = (iconProp, row) => {
  if (!iconProp) return null;

  // 1. If already a rendered React element, return it directly
  if (React.isValidElement(iconProp)) {
    return iconProp;
  }

  let TargetComponent = iconProp;

  // 2. If iconProp is a dynamic getter function (row) => IconComponent
  if (typeof iconProp === 'function' && !iconProp.displayName && !iconProp.$$typeof) {
    try {
      const res = iconProp(row);
      if (!res) return null;
      if (React.isValidElement(res)) {
        return res;
      }
      TargetComponent = res;
    } catch (e) {
      console.error('Error resolving action icon:', e);
      return null;
    }
  }

  // 3. Render TargetComponent as a JSX component element with default icon sizing
  if (React.isValidElement(TargetComponent)) {
    return TargetComponent;
  }

  if (typeof TargetComponent === 'function' || (typeof TargetComponent === 'object' && (TargetComponent?.$$typeof || TargetComponent?.render))) {
    const Component = TargetComponent;
    return <Component className="w-3.5 h-3.5 flex-shrink-0" />;
  }

  return null;
};

const Table = ({ 
  headers = [], 
  data = [], 
  actions = [], 
  inlineActions = false,
  _loading = false,
  itemsPerPage = 10,
  emptyState = null,
  flat = false,
  renderMobileCard = null,
  paginate = true,
  showPagination = true,
  actionsAlign = 'right'
}) => {
  const isOnlyThreeDots = !inlineActions && actions.length > 0 && !actions.some(act => act.isPrimary);
  const effectiveActionsAlign = actionsAlign === 'center' || isOnlyThreeDots ? 'center' : actionsAlign;
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ right: 0 });
  const triggerRefs = useRef({});
  const menuRef = useRef(null);

  // Helper to compute smart position with auto flip and boundary detection
  const computePosition = useCallback((triggerEl, rowCount = 4) => {
    if (!triggerEl) return null;
    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 192px
    const estimatedHeight = Math.max(80, rowCount * 38 + 16);

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Flip upwards if space below is insufficient and there is more room above
    const shouldFlipUp = spaceBelow < estimatedHeight + 12 && spaceAbove > spaceBelow;

    // Horizontal boundary clamping: keep at least 8px padding from screen edges
    const rawRight = window.innerWidth - rect.right;
    const minRight = 8;
    const maxRight = Math.max(8, window.innerWidth - menuWidth - 8);
    const clampedRight = Math.min(Math.max(minRight, rawRight), maxRight);

    if (shouldFlipUp) {
      return {
        bottom: Math.max(8, window.innerHeight - rect.top + 4),
        right: clampedRight,
        maxHeight: Math.max(120, rect.top - 16),
        isFlipped: true
      };
    } else {
      return {
        top: Math.max(8, rect.bottom + 4),
        right: clampedRight,
        maxHeight: Math.max(120, window.innerHeight - rect.bottom - 16),
        isFlipped: false
      };
    }
  }, []);

  // Close dropdown on outside click
  const handleClose = useCallback(() => setActiveMenuId(null), []);

  // Handle outside scroll & window resize, and fine-tune menu position post-mount
  useEffect(() => {
    if (activeMenuId === null) return;

    // Fine-tune position if actual rendered DOM height differs from estimate
    const triggerEl = triggerRefs.current[activeMenuId];
    const menuEl = menuRef.current;
    if (triggerEl && menuEl) {
      const rect = triggerEl.getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();
      const menuHeight = menuRect.height;
      const menuWidth = menuRect.width || 192;

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldFlipUp = spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow;

      const rawRight = window.innerWidth - rect.right;
      const minRight = 8;
      const maxRight = Math.max(8, window.innerWidth - menuWidth - 8);
      const clampedRight = Math.min(Math.max(minRight, rawRight), maxRight);

      if (shouldFlipUp) {
        const newBottom = Math.max(8, window.innerHeight - rect.top + 4);
        const newMaxH = Math.max(120, rect.top - 16);
        setMenuPosition(prev => {
          if (prev.bottom === newBottom && prev.right === clampedRight && prev.maxHeight === newMaxH && prev.top === undefined) return prev;
          return { bottom: newBottom, right: clampedRight, maxHeight: newMaxH, isFlipped: true };
        });
      } else {
        const newTop = Math.max(8, rect.bottom + 4);
        const newMaxH = Math.max(120, window.innerHeight - rect.bottom - 16);
        setMenuPosition(prev => {
          if (prev.top === newTop && prev.right === clampedRight && prev.maxHeight === newMaxH && prev.bottom === undefined) return prev;
          return { top: newTop, right: clampedRight, maxHeight: newMaxH, isFlipped: false };
        });
      }
    }

    const handleScroll = (e) => {
      // Don't close if scrolling inside the dropdown menu itself
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setActiveMenuId(null);
    };

    const handleResize = () => setActiveMenuId(null);

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeMenuId]);

  const handleSort = (field) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(order);
  };

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (!sortField) return 0;
    
    // Resolve nested fields like 'patientId.name'
    const resolveField = (obj, path) => {
      return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    let valA = resolveField(a, sortField) || '';
    let valB = resolveField(b, sortField) || '';

    if (typeof valA === 'string') {
      return sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
  });

  // Paginate data
  const shouldPaginate = paginate !== false && showPagination !== false;
  const totalPages = shouldPaginate ? Math.ceil(sortedData.length / itemsPerPage) : 1;
  const paginatedData = shouldPaginate
    ? sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : sortedData;

  const getStatusBadgeClass = (status) => {
    if (!status) return '';
    const s = status.toLowerCase();
    if (['paid', 'active', 'completed', 'dispensed', 'success'].includes(s)) {
      return 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20';
    }
    if (['unpaid', 'inactive', 'cancelled', 'failed'].includes(s)) {
      return 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20';
    }
    if (['scheduled', 'admitted', 'waiting', 'pending', 'partially-paid'].includes(s)) {
      return 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20';
    }
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="space-y-4">
      {/* Desktop Table View */}
      <div className={`hidden sm:block ${flat 
        ? "overflow-x-auto max-h-[500px]" 
        : "overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white max-h-[500px] shadow-sm"
      }`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-[#E5E7EB] text-[#6B7280] text-[10px] font-bold uppercase tracking-wider">
              {headers.map((header) => (
                <th 
                  key={header.key} 
                  onClick={() => header.sortable && handleSort(header.key)}
                  className={`p-4 sticky top-0 bg-slate-50 z-10 select-none ${
                    header.sortable ? 'cursor-pointer hover:bg-slate-100/80' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {header.label}
                    {header.sortable && sortField === header.key && (
                      sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-[#2F63F2]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#2F63F2]" />
                    )}
                  </div>
                </th>
              ))}
              {actions.length > 0 && (
                <th className={`p-4 sticky top-0 bg-slate-50 z-10 whitespace-nowrap font-bold uppercase tracking-wider text-[10px] text-[#6B7280] ${
                  effectiveActionsAlign === 'center' ? 'text-center' : 'text-right pr-11'
                }`}>
                  <div className={`w-full flex items-center ${effectiveActionsAlign === 'center' ? 'justify-center text-center' : 'justify-end'}`}>
                    Actions
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB] text-xs text-[#111827] font-medium">
            {paginatedData.map((row, idx) => (
              <tr key={row._id || row.id || idx} className="hover:bg-[#2F63F2]/5 transition-colors">
                {headers.map((header) => {
                  // Resolve cell values
                  const resolveVal = (obj, path) => {
                    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
                  };
                  const cellVal = resolveVal(row, header.key);

                  return (
                    <td key={header.key} className="p-4">
                      {header.render ? (
                        header.render(row)
                      ) : header.isStatus ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadgeClass(cellVal)}`}>
                          {cellVal}
                        </span>
                      ) : (
                        cellVal || '-'
                      )}
                    </td>
                  );
                })}

                {/* Inline Action Buttons or 3-Dot Dropdown Menu */}
                {actions.length > 0 && (
                  <td className={`p-4 whitespace-nowrap ${effectiveActionsAlign === 'center' ? 'text-center' : 'text-right'}`}>
                    {inlineActions ? (
                      <div className={`w-full flex items-center gap-2 ${effectiveActionsAlign === 'center' ? 'justify-center' : 'justify-end'}`}>
                        {actions
                          .filter(act => {
                            if (act.hidden && typeof act.hidden === 'function' && act.hidden(row)) return false;
                            if (act.show && typeof act.show === 'function' && !act.show(row)) return false;
                            return true;
                          })
                          .map((act, aIdx) => {
                            const actLabel = typeof act.label === 'function' ? act.label(row) : act.label;
                            const labelLower = String(actLabel || '').toLowerCase();
                            const isDisabled = typeof act.disabled === 'function' ? act.disabled(row) : !!act.disabled;
                            const variant = act.variant;

                            let btnStyle = act.iconOnly 
                              ? 'p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer border '
                              : 'px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border ';
                            if (variant === 'primary' || act.isPrimary) {
                              btnStyle += 'bg-[#2F63F2] text-white border-[#2F63F2] hover:bg-blue-700 shadow-xs';
                            } else if (variant === 'success') {
                              btnStyle += 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-xs';
                            } else if (variant === 'secondary') {
                              btnStyle += 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300';
                            } else if (labelLower.includes('view') || variant === 'view') {
                              btnStyle += 'border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-[#2F63F2]/10';
                            } else if (labelLower.includes('edit') || variant === 'edit') {
                              btnStyle += 'bg-[#2F63F2] text-white border-[#2F63F2] hover:bg-blue-700 shadow-xs';
                            } else if (labelLower.includes('delete') || variant === 'delete') {
                              btnStyle += 'border-rose-200 text-rose-600 bg-white hover:bg-rose-50';
                            } else {
                              btnStyle += 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50';
                            }

                            if (isDisabled) {
                              btnStyle += ' opacity-50 cursor-not-allowed';
                            }

                            return (
                              <button
                                key={aIdx}
                                disabled={isDisabled}
                                onClick={() => !isDisabled && act.onClick(row)}
                                className={btnStyle}
                                title={act.tooltip || actLabel}
                                aria-label={act.ariaLabel || actLabel}
                              >
                                {renderActionIcon(act.icon, row)}
                                {!act.iconOnly && <span>{actLabel}</span>}
                              </button>
                            );
                          })}
                      </div>
                    ) : (
                      <div className={`w-full flex items-center gap-2 ${effectiveActionsAlign === 'center' ? 'justify-center' : 'justify-end'}`}>
                        {/* 1. Primary status-driven action rendered inline */}
                        {actions.filter(act => act.isPrimary && (!act.show || act.show(row))).map((act, aIdx) => {
                          const actLabel = typeof act.label === 'function' ? act.label(row) : act.label;
                          const isDisabled = typeof act.disabled === 'function' ? act.disabled(row) : !!act.disabled;
                          const variant = typeof act.variant === 'function' ? act.variant(row) : act.variant;

                          let btnStyle = act.iconOnly 
                            ? 'p-1.5 rounded-lg flex items-center justify-center transition-all '
                            : 'px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all ';

                          if (isDisabled && (actLabel === 'Waiting...' || actLabel === 'Next in Queue')) {
                            btnStyle += 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-85 shadow-none';
                          } else if (actLabel === 'In Progress' || variant === 'purple') {
                            btnStyle += 'bg-purple-50 text-purple-700 border border-purple-200 font-bold';
                          } else if (actLabel === 'View' || variant === 'view' || String(actLabel).toLowerCase().includes('view')) {
                            btnStyle += 'border border-[#2F63F2] text-[#2F63F2] bg-white hover:bg-[#2F63F2]/10 shadow-xs cursor-pointer';
                          } else if (actLabel === 'Skipped' || actLabel === 'Skip' || variant === 'amber') {
                            btnStyle += 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 shadow-xs cursor-pointer font-bold';
                          } else if (actLabel === 'Cancelled' || variant === 'rose') {
                            btnStyle += 'bg-rose-50 text-rose-600 border border-rose-200 font-bold';
                          } else if (isDisabled) {
                            btnStyle += 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-75 shadow-none';
                          } else {
                            btnStyle += 'bg-[#2F63F2] text-white border border-[#2F63F2] hover:bg-blue-700 shadow-xs cursor-pointer';
                          }

                          return (
                            <button
                              key={aIdx}
                              disabled={isDisabled}
                              onClick={() => !isDisabled && act.onClick(row)}
                              className={btnStyle}
                              title={act.tooltip || actLabel}
                              aria-label={act.ariaLabel || actLabel}
                            >
                              {renderActionIcon(act.icon, row)}
                              {!act.iconOnly && <span>{actLabel}</span>}
                            </button>
                          );
                        })}

                        {/* 2. Secondary actions inside dedicated 3-dot dropdown menu */}
                        {actions.some(act => !act.isPrimary && (!act.show || act.show(row))) && (
                          <div className="relative inline-flex items-center justify-center">
                            <button 
                              ref={el => { triggerRefs.current[row._id || row.id || idx] = el; }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const rowId = row._id || row.id || idx;
                                if (activeMenuId === rowId) {
                                  setActiveMenuId(null);
                                } else {
                                  const rowActions = actions.filter(act => !act.isPrimary && (!act.show || act.show(row)));
                                  const pos = computePosition(e.currentTarget, rowActions.length);
                                  if (pos) setMenuPosition(pos);
                                  setActiveMenuId(rowId);
                                }
                              }}
                              className={`p-1.5 rounded-lg border transition-colors inline-flex items-center justify-center cursor-pointer ${
                                activeMenuId === (row._id || row.id || idx)
                                  ? 'bg-slate-100 border-slate-300 text-slate-800'
                                  : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                              }`}
                              title="More Options"
                              aria-label="More Options"
                              aria-expanded={activeMenuId === (row._id || row.id || idx)}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={headers.length + (actions.length > 0 ? 1 : 0)} className="p-12 text-center text-slate-400 font-medium">
                  {emptyState || "No records matching the search query."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Fixed-position 3-dot dropdown — escapes overflow constraints with intelligent flip & clamping */}
      {activeMenuId !== null && (() => {
        const row = paginatedData.find((r, i) => (r._id || r.id || i) === activeMenuId) || paginatedData[activeMenuId];
        if (!row) return null;
        const rowActions = actions.filter(act => !act.isPrimary && (!act.show || act.show(row)));
        if (rowActions.length === 0) return null;
        return createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={handleClose} />
            <div
              ref={menuRef}
              className="fixed z-[9999] w-48 bg-white border border-[#E5E7EB] rounded-xl shadow-xl py-1.5 text-left overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
              style={{
                ...(menuPosition.top !== undefined ? { top: `${menuPosition.top}px` } : {}),
                ...(menuPosition.bottom !== undefined ? { bottom: `${menuPosition.bottom}px` } : {}),
                right: `${menuPosition.right}px`,
                maxHeight: menuPosition.maxHeight ? `${menuPosition.maxHeight}px` : 'calc(100vh - 24px)',
              }}
            >
              {rowActions.map((act, aIdx) => {
                const actLabel = typeof act.label === 'function' ? act.label(row) : act.label;
                const isDelete = String(actLabel || '').toLowerCase().includes('delete') || act.variant === 'delete' || act.variant === 'danger';
                return (
                  <button
                    key={aIdx}
                    onClick={() => {
                      act.onClick(row);
                      setActiveMenuId(null);
                    }}
                    className={`w-full px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-2 text-left cursor-pointer ${
                      isDelete
                        ? 'text-rose-600 hover:bg-rose-50 hover:text-rose-700'
                        : 'text-slate-700 hover:bg-[#2F63F2]/5 hover:text-[#2F63F2]'
                    } ${act.className || ''}`}
                  >
                    {renderActionIcon(act.icon, row)}
                    <span>{actLabel}</span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        );
      })()}

      {/* Mobile Stacked Card View */}
      <div className="block sm:hidden space-y-2.5">
        {paginatedData.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-medium bg-white rounded-xl border border-[#E5E7EB]">
            {emptyState || "No records matching the search query."}
          </div>
        ) : (
          paginatedData.map((row, idx) => (
            renderMobileCard ? (
              <React.Fragment key={row._id || row.id || idx}>
                {renderMobileCard(row, idx)}
              </React.Fragment>
            ) : (
              (() => {
                const isActionCol = (h) => {
                  const k = String(h?.key || '').toLowerCase();
                  const l = String(h?.label || '').toLowerCase();
                  return k === 'actions' || k === 'action' || k === 'actionbutton' || l === 'action' || l === 'actions';
                };
                const dataHeaders = headers.filter(h => !isActionCol(h));
                const actionHeaders = headers.filter(isActionCol);

                return (
                  <div key={row._id || row.id || idx} className="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3 shadow-xs text-left font-sans transition-all hover:shadow-md">
                    {/* 2-Column Grid for Primary Card Fields */}
                    <div className="grid grid-cols-2 gap-2 pb-2.5 border-b border-slate-100">
                      {dataHeaders.slice(0, 2).map((header) => {
                        const resolveVal = (obj, path) => {
                          return path.split('.').reduce((acc, part) => acc && acc[part], obj);
                        };
                        const cellVal = resolveVal(row, header.key);
                        return (
                          <div key={header.key} className="text-left text-xs">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">{header.label}</span>
                            <div className="mt-0.5 text-slate-900 font-bold">
                              {header.render ? header.render(row) : (cellVal || '-')}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Remaining Card Data Fields */}
                    <div className="space-y-2 pt-0.5">
                      {dataHeaders.slice(2).map((header) => {
                        const resolveVal = (obj, path) => {
                          return path.split('.').reduce((acc, part) => acc && acc[part], obj);
                        };
                        const cellVal = resolveVal(row, header.key);
                        
                        return (
                          <div key={header.key} className="flex justify-between items-center text-xs py-0.5">
                            <span className="text-[11px] font-medium text-slate-500 shrink-0">{header.label}</span>
                            <div className="text-slate-800 font-semibold text-right pl-2">
                              {header.render ? (
                                header.render(row)
                              ) : header.isStatus ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadgeClass(cellVal)}`}>
                                  {cellVal}
                                </span>
                              ) : (
                                cellVal || '-'
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Header Action Column (Full-Width Bottom Bar) */}
                    {actionHeaders.length > 0 && (
                      <div className="border-t border-slate-100 pt-2.5 mt-1 flex items-center justify-end w-full">
                        {actionHeaders.map((header) => (
                          <div key={header.key} className="w-full">
                            {header.render ? header.render(row) : null}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mobile Card Actions (when passed via `actions` prop) */}
                {actions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {actions.filter(act => !act.show || act.show(row)).map((act, aIdx) => {
                      const actLabel = typeof act.label === 'function' ? act.label(row) : act.label;
                      const isDisabled = typeof act.disabled === 'function' ? act.disabled(row) : !!act.disabled;
                      const labelLower = String(actLabel || '').toLowerCase();
                      
                      let btnStyle = 'px-3 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all border flex-1 min-h-[44px] cursor-pointer ';
                      if (act.isPrimary || labelLower.includes('collect') || labelLower.includes('start') || labelLower.includes('generate')) {
                        btnStyle += 'bg-[#3563F6] text-white border-[#3563F6] hover:bg-blue-700 shadow-xs';
                      } else if (labelLower.includes('view') || act.variant === 'view') {
                        btnStyle += 'border-[#3563F6] text-[#3563F6] bg-blue-50/50 hover:bg-blue-100/70';
                      } else if (labelLower.includes('skip') || act.variant === 'amber') {
                        btnStyle += 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100';
                      } else if (labelLower.includes('delete') || act.variant === 'delete') {
                        btnStyle += 'border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100';
                      } else {
                        btnStyle += 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50';
                      }

                      if (isDisabled) {
                        btnStyle += ' opacity-50 cursor-not-allowed';
                      }
                      
                      return (
                        <button
                          key={aIdx}
                          disabled={isDisabled}
                          onClick={() => !isDisabled && act.onClick(row)}
                          className={btnStyle}
                          title={actLabel}
                        >
                          {renderActionIcon(act.icon, row)}
                          <span>{actLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()
        )
      ))
    )}
      </div>

      {/* Pagination Footer */}
      {shouldPaginate && totalPages > 1 && (
        <div className="flex justify-between items-center px-2">
          <span className="text-xs font-semibold text-[#6B7280]">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-[#2F63F2]/10"
            >
              Previous
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-[#2F63F2]/10"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;
