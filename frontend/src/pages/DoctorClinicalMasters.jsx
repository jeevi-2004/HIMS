import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Input from '../components/Input';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Table from '../components/Table';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  getMasterList, saveMasterList, universalClinicalSearch, exportMasterCSV, getDoctorFavorites, toggleDoctorFavorite
} from '../utils/clinicalMasters';
import { isFeatureModuleEnabled } from '../utils/featureUtils';
import { isLikelyRadiology } from '../utils/investigationUtils';
import {
  Plus, Trash2, Edit3, Eye, Search, Star,
  FileText, Activity, Pill, Settings, Layers,
  Sliders, Printer, Save, ChevronDown,
  MoreVertical, AlertTriangle, Clock, Package, RotateCw, Lightbulb, Microscope,
  FileCode2, Database, Stethoscope
} from 'lucide-react';
import useFormDraft from '../hooks/useFormDraft';

// Helper to safely extract string display text from master items (string or object)
const getItemText = (item) => {
  if (item === null || item === undefined) return '';
  if (typeof item === 'object') {
    return item.name || item.text || item.title || item.label || item.value || item.val || item.code || item.allergy || JSON.stringify(item);
  }
  return String(item);
};

// Helper to highlight matching text query search results
const highlightMatch = (text, query) => {
  if (!text) return '';
  if (!query || !query.trim()) return <span>{text}</span>;

  const cleanQuery = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const parts = text.split(new RegExp(`(${cleanQuery})`, 'gi'));

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-100 text-yellow-950 px-0.5 rounded font-bold">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
};

// Searchable Multi-Select Component with Quick-Add Modal Trigger
export const SearchableMultiSelect = ({
  title,
  placeholder,
  items = [],
  selected = [],
  onToggle,
  onAddNew,
  addNewLabel
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredItems = useMemo(() => {
    return items.filter(item =>
      getItemText(item).toLowerCase().includes(filterText.toLowerCase())
    );
  }, [items, filterText]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">
          {title}
        </label>
        {selected.length > 0 && (
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#3563FF]/10 text-[#3563FF] border border-[#3563FF]/20">
            {selected.length} Selected
          </span>
        )}
      </div>

      {/* Search Box + Add Button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={placeholder}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3563FF]/30 font-medium bg-white"
          />
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-2.5" />
        </div>
        <button
          type="button"
          onClick={onAddNew}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-[#3563FF]/10 text-[#3563FF] border border-[#3563FF]/20 hover:bg-[#3563FF] hover:text-white transition-all flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          {addNewLabel}
        </button>
      </div>

      {/* Checkbox List */}
      <div className="p-3 bg-slate-50/70 border border-[#E5E7EB] rounded-xl max-h-[150px] overflow-y-auto space-y-1.5 text-xs">
        {filteredItems.length > 0 ? (
          filteredItems.map((item, idx) => {
            const itemText = getItemText(item);
            const isChecked = selected.includes(itemText);
            return (
              <label
                key={typeof item === 'object' ? (item.id || idx) : idx}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${isChecked
                    ? 'bg-[#3563FF]/10 text-[#3563FF] font-semibold border border-[#3563FF]/20'
                    : 'hover:bg-slate-100/80 text-[#111827] font-medium'
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(itemText)}
                    className="rounded text-[#3563FF] focus:ring-[#3563FF] w-4 h-4 cursor-pointer"
                  />
                  <span>{itemText}</span>
                </div>
                {item?.category && (
                  <span className="text-[10px] text-[#6B7280] bg-slate-200/60 px-2 py-0.5 rounded font-normal">
                    {getItemText(item.category)}
                  </span>
                )}
              </label>
            );
          })
        ) : (
          <div className="text-center py-4 text-xs text-[#6B7280] font-medium">
            No matching records found. Click <span className="font-bold text-[#3563FF] cursor-pointer" onClick={onAddNew}>{addNewLabel}</span> to add.
          </div>
        )}
      </div>
    </div>
  );
};

// Searchable Selector with Chips
const ChipSelector = ({
  title,
  placeholder,
  items = [],
  selected = [],
  onToggle,
  onAddNew,
  addNewLabel,
  manageUrl,
  manageLabel,
  colorClass = 'blue'
}) => {
  const [filterText, setFilterText] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredItems = useMemo(() => {
    if (!filterText) return [];
    return items.filter(item =>
      getItemText(item).toLowerCase().includes(filterText.toLowerCase()) &&
      !selected.includes(getItemText(item))
    );
  }, [items, filterText, selected]);

  const colors = {
    blue: {
      badge: 'bg-[#2F63F2]/10 text-[#2F63F2] border-[#2F63F2]/20',
      chip: 'bg-[#2F63F2]/10 text-[#2F63F2] border-[#2F63F2]/20 hover:bg-[#2F63F2]/25',
    },
    green: {
      badge: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      chip: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100',
    },
    amber: {
      badge: 'bg-amber-50 text-amber-600 border-amber-200',
      chip: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100',
    },
    purple: {
      badge: 'bg-purple-50 text-purple-600 border-purple-200',
      chip: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
    }
  };

  const scheme = colors[colorClass] || colors.blue;

  return (
    <div className="space-y-2 sm:space-y-3 p-2.5 sm:p-4 bg-white border border-[#E5E7EB] rounded-xl text-left relative">
      {/* Title & Count Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{title}</span>
        {selected.length > 0 && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scheme.badge}`}>
            {selected.length} Selected
          </span>
        )}
      </div>

      {/* Input Group */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={placeholder}
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            className="w-full pl-8 pr-2.5 py-1.5 sm:py-2 text-xs border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2F63F2]/30 font-medium bg-white"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 sm:top-2.5" />

          {/* Dropdown Options */}
          {isOpen && filteredItems.length > 0 && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
              <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-[#E5E7EB] rounded-xl shadow-dropdown z-20 py-1">
                {filteredItems.map((item, idx) => {
                  const txt = getItemText(item);
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        onToggle(txt);
                        setFilterText('');
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs font-medium text-slate-700"
                    >
                      {txt}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onAddNew}
          className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-[#2F63F2]/10 text-[#2F63F2] border border-[#2F63F2]/20 hover:bg-[#2F63F2] hover:text-white transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>{addNewLabel}</span>
        </button>
      </div>

      {/* Selected Chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((val) => (
            <span
              key={val}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${scheme.chip}`}
            >
              {val}
              <button
                type="button"
                onClick={() => onToggle(val)}
                className="hover:text-red-500 font-bold focus:outline-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Manage Link */}
      {manageLabel && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={manageUrl}
            className="text-xs font-bold text-[#2F63F2] hover:underline"
          >
            {manageLabel} &rarr;
          </button>
        </div>
      )}
    </div>
  );
};

// Reusable Section Card Wrapper Component with optional Collapsible support
const MasterSectionCard = ({ title, subtitle, searchVal, setSearchVal, onAddNew, addNewLabel, collapsible = false, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-3">
        <div
          onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
          className={`flex-1 text-left ${collapsible ? 'cursor-pointer select-none group' : ''}`}
        >
          <h3 className="text-base font-bold text-[#111827] flex items-center gap-2 group-hover:text-[#2F63F2] transition-colors">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-[#6B7280] mt-0.5 font-medium">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          {setSearchVal !== undefined && isOpen && (
            <div className="w-full sm:w-60">
              <Input
                placeholder={`Search ${title}...`}
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                icon={Search}
              />
            </div>
          )}

          {onAddNew && isOpen && (
            <Button
              onClick={onAddNew}
              variant="primary"
              className="h-[38px] px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap"
              icon={Plus}
            >
              {addNewLabel || 'Add New'}
            </Button>
          )}

          {collapsible && (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-[#2F63F2] hover:text-white transition-all shrink-0 cursor-pointer border border-slate-200"
              title={isOpen ? "Collapse section" : "Expand section"}
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {(!collapsible || isOpen) && children}
    </div>
  );
};

// Floating Portal-based Context Menu for Diagnosis Templates
const DiagnosisTemplateContextMenu = ({ anchor, onClose, onAction }) => {
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [isFlipped, setIsFlipped] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const template = anchor.template;

  // Calculate position dynamically including scroll & flips
  const calculatePosition = useCallback(() => {
    if (!anchor || !anchor.target) return;
    const rect = anchor.target.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 175; // exact height for 4 options + 2 dividers

    let top = rect.bottom + window.scrollY + 8;
    let flipped = false;

    if (rect.bottom + menuHeight > window.innerHeight) {
      top = rect.top + window.scrollY - menuHeight - 8;
      flipped = true;
    }

    let left = rect.right + window.scrollX - menuWidth;
    if (left < 8) {
      left = 8;
    } else if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    setCoords({ top, left });
    setIsFlipped(flipped);
  }, [anchor]);

  useEffect(() => {
    calculatePosition();
    window.addEventListener('scroll', calculatePosition, true);
    window.addEventListener('resize', calculatePosition);
    return () => {
      window.removeEventListener('scroll', calculatePosition, true);
      window.removeEventListener('resize', calculatePosition);
    };
  }, [anchor, calculatePosition]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !anchor.target.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose, anchor]);

  // Keyboard navigation & Focus trap
  const menuItems = [
    { label: 'Edit', icon: '✏', action: 'edit' },
    { label: 'Duplicate', icon: '📄', action: 'duplicate' },
    { label: template.status === 'Inactive' ? 'Mark Active' : 'Mark Inactive', icon: '⏸', action: 'toggle-status' },
    { label: 'Delete Template', icon: '🗑', action: 'delete', danger: true }
  ];

  useEffect(() => {
    // Focus the current indexed menu item
    const buttons = menuRef.current?.querySelectorAll('[role="menuitem"]');
    if (buttons && buttons[focusedIndex]) {
      buttons[focusedIndex].focus();
    }
  }, [focusedIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        anchor.target?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % menuItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          setFocusedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
        } else {
          setFocusedIndex((prev) => (prev + 1) % menuItems.length);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      anchor.target?.focus();
    };
  }, [onClose, anchor, menuItems.length]);

  return (
    <div
      ref={menuRef}
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      className="absolute w-[220px] bg-white border border-[#E5E7EB] rounded-xl shadow-lg py-1.5 z-[9999] text-left text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-120 focus:outline-none"
      role="menu"
      aria-label="Template options"
      tabIndex={-1}
    >
      {/* Caret arrow pointing to three-dot trigger */}
      <div
        className={`absolute right-[11px] w-2.5 h-2.5 bg-white border-l border-t border-[#E5E7EB] transform rotate-45 z-10 ${isFlipped ? '-bottom-1.5 border-l-0 border-t-0 border-r border-b' : '-top-1.5'
          }`}
      />

      {menuItems.map((item, idx) => {
        const isFocused = idx === focusedIndex;
        const showTopDivider = idx === 2 || idx === 3;

        return (
          <React.Fragment key={item.action}>
            {showTopDivider && <hr className="my-1 border-slate-100" />}
            <button
              type="button"
              role="menuitem"
              tabIndex={isFocused ? 0 : -1}
              onClick={() => {
                onAction(item.action, template);
                onClose();
              }}
              className={`w-full px-4 py-2 flex items-center gap-2.5 transition-colors duration-100 relative z-20 ${item.danger
                  ? 'hover:bg-red-50 text-red-650 focus:bg-red-50 focus:text-red-650'
                  : 'hover:bg-[#2F63F2]/5 hover:text-[#2F63F2] focus:bg-[#2F63F2]/5 focus:text-[#2F63F2]'
                } focus:outline-none`}
            >
              <span className="text-sm shrink-0 w-3.5 h-3.5 flex items-center justify-center select-none">{item.icon}</span>
              {item.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Main Component with 5 Logical Tab Sections & Inline Action Buttons
const DoctorClinicalMasters = () => {
  const { user } = useAuth();

  // Active Main Tab State (Default: 'diagnosis')
  const [activeTab, setActiveTab] = useState('diagnosis');

  // Redesigned builder pagination & mobile section togglers
  const [templatePage, setTemplatePage] = useState(1);
  const [mobileSections, setMobileSections] = useState({
    details: true,
    symptoms: false,
    medicines: false,
    advice: false,
    investigations: false,
    followup: false
  });
  const toggleMobileSection = (section) => {
    setMobileSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // State & handlers for template builder UI/UX refactoring
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState(null);
  const touchTimerRef = useRef(null);

  const handleTouchStart = (e, template) => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    const target = e.currentTarget;
    touchTimerRef.current = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      setMenuAnchor({
        id: template._id,
        rect,
        target,
        template
      });
    }, 600);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
  };

  const isTemplateUsedInConsultations = (template) => {
    if (!template) return false;
    const seedIds = ['1', '2', '3', '4', '5'];
    return seedIds.includes(String(template._id || template.id));
  };

  const handleDuplicateTemplate = (template) => {
    if (!template) return;
    const newTemplate = {
      ...template,
      _id: String(Date.now()),
      id: String(Date.now()),
      name: `${getItemText(template)} (Copy)`,
      frequent: template.frequent || false,
      status: 'Active'
    };
    const updated = [...dlist, newTemplate];
    saveMaster('dlist', updated);
    toast.success('Template duplicated successfully');
  };

  const handleToggleActiveStatus = (template) => {
    if (!template) return;
    const updatedStatus = template.status === 'Inactive' ? 'Active' : 'Inactive';
    const updated = dlist.map(item =>
      (item._id === template._id || item.id === template.id)
        ? { ...item, status: updatedStatus }
        : item
    );
    saveMaster('dlist', updated);
    toast.success(`Template marked as ${updatedStatus}`);
  };

  const handleMenuAction = (action, template) => {
    if (action === 'edit') {
      handleDiagnosisEdit(template);
    } else if (action === 'duplicate') {
      handleDuplicateTemplate(template);
    } else if (action === 'toggle-status') {
      handleToggleActiveStatus(template);
    } else if (action === 'delete') {
      setDeleteTemplateConfirm(template);
    }
  };

  // Master Lists State
  const [dlist, setDlist] = useState([]);
  const [slist, setSlist] = useState([]);
  const [mlist, setMlist] = useState([]);
  const [adviceList, setAdviceList] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [dosages, setDosages] = useState([]);
  const [frequencies, setFrequencies] = useState([]);
  const [foodInstructions, setFoodInstructions] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [medicineForms, setMedicineForms] = useState([]);
  const [diagMasterList, setDiagMasterList] = useState([]);
  const [searchDiagMaster, setSearchDiagMaster] = useState('');

  // Fetch Medicine Forms from DB API
  const fetchMedicineForms = useCallback(async () => {
    try {
      const res = await api.get('/operations/medicine-forms');
      if (res.data?.success) {
        setMedicineForms(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching medicine forms from DB:', err);
    }
  }, []);

  // Fetch Medicine Frequencies from DB API
  const fetchFrequencies = useCallback(async () => {
    try {
      const res = await api.get('/operations/medicine-frequencies');
      if (res.data?.success) {
        setFrequencies(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching medicine frequencies from DB:', err);
    }
  }, []);

  // Fetch Medicine Dosages from DB API
  const fetchDosages = useCallback(async () => {
    try {
      const res = await api.get('/operations/medicine-dosages');
      if (res.data?.success) {
        setDosages(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching medicine dosages from DB:', err);
    }
  }, []);

  // Fetch Food Instructions from DB API
  const fetchFoodInstructions = useCallback(async () => {
    try {
      const res = await api.get('/operations/food-instructions');
      if (res.data?.success) {
        setFoodInstructions(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching food instructions from DB:', err);
    }
  }, []);

  // Fetch Diagnosis Masters directly from DB API
  const fetchDiagMasterList = useCallback(async () => {
    try {
      const res = await api.get('/operations/clinical-diagnoses/all');
      if (res.data?.success) {
        const dbList = res.data.data || [];
        setDiagMasterList(dbList);
        setDlist(dbList);
      }
    } catch (err) {
      console.error('Error fetching clinical diagnoses:', err);
    }
  }, []);

  // Fetch Investigation services from Hospital Service Catalog based on Laboratory & Radiology feature flags
  const fetchHospitalInvestigations = useCallback(async () => {
    try {
      const isLabEnabled = isFeatureModuleEnabled(user?.hospital || user, 'Laboratory');
      const isRadEnabled = isFeatureModuleEnabled(user?.hospital || user, 'Radiology');

      const res = await api.get('/admin/services');
      const services = Array.isArray(res.data?.data) ? res.data.data : [];

      const filtered = services.filter(s => {
        if (!s || s.status !== 'active') return false;
        const type = (s.serviceType || s.category || '').toLowerCase();
        const isLab = type.includes('laboratory') || type.includes('lab');
        const isRad = type.includes('radiology') || type.includes('imaging') || type.includes('x-ray') || type.includes('scan') || isLikelyRadiology(s.name, s.category, s.serviceType);

        if (isLabEnabled && isRadEnabled) return isLab || isRad;
        if (isLabEnabled) return isLab;
        if (isRadEnabled) return isRad;
        return false;
      }).map(s => {
        const isRad = isLikelyRadiology(s.name, s.category, s.serviceType);
        return {
          _id: s._id,
          id: s._id,
          val: s.name,
          name: s.name,
          department: s.serviceType || (isRad ? 'Radiology' : 'Laboratory'),
          serviceType: s.serviceType,
          category: s.category,
          price: s.price,
          status: s.status || 'active'
        };
      });

      setInvestigations(filtered);
    } catch (err) {
      console.error('Error fetching hospital investigations from services catalog:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchDiagMasterList();
    fetchMedicineForms();
    fetchFrequencies();
    fetchDosages();
    fetchFoodInstructions();
    fetchHospitalInvestigations();
  }, [fetchDiagMasterList, fetchMedicineForms, fetchFrequencies, fetchDosages, fetchFoodInstructions, fetchHospitalInvestigations]);

  // Medication Configuration, Clinical Library & Diagnosis/ICD Sub-Tab Split Workspace State
  const [medSubTab, setMedSubTab] = useState('med_master'); // 'med_master' | 'med_categories' | 'dosages' | 'frequencies' | 'food_instructions'
  const [consultSubTab, setConsultSubTab] = useState('advice_master'); // 'advice_master' | 'investigation_master' | 'followup_master'
  const [icdSubTab, setIcdSubTab] = useState('form_categories'); // 'form_categories' | 'specialty_categories' | 'icd_registry'

  // Search Filter States per Section
  const [searchDiagTemplates, setSearchDiagTemplates] = useState('');
  const [searchFrequentDiag, setSearchFrequentDiag] = useState('');
  const [searchSymptoms, setSearchSymptoms] = useState('');

  const [searchMedicines, setSearchMedicines] = useState('');
  const [searchCategories, setSearchCategories] = useState('');
  const [searchDosages, setSearchDosages] = useState('');
  const [searchFrequencies, setSearchFrequencies] = useState('');
  const [searchFood, setSearchFood] = useState('');

  const [searchAdvice, setSearchAdvice] = useState('');
  const [searchInvestigations, setSearchInvestigations] = useState('');
  const [searchFollowups, setSearchFollowups] = useState('');

  const [searchICD, setSearchICD] = useState('');
  const [searchDiagCat, setSearchDiagCat] = useState('');
  const [searchSpecCat, setSearchSpecCat] = useState('');

  // Diagnosis Protocol Template Form State
  const [diagnosisForm, setDiagnosisForm] = useState({
    name: '',
    icd: '',
    symptoms: [],
    medicines: [],
    advice: [],
    followup: '3 Days',
    investigations: [],
    status: 'Active',
    frequent: true
  });
  const [isCustomFollowup, setIsCustomFollowup] = useState(false);
  const [customFollowupDays, setCustomFollowupDays] = useState(3);
  const [editingTemplateId, setEditingTemplateId] = useState(null);

  const { clearDraft: clearDiagnosisDraft } = useFormDraft(
    editingTemplateId ? `clinical_template_edit_${editingTemplateId}` : 'clinical_template_create',
    diagnosisForm,
    setDiagnosisForm,
    { isEditMode: Boolean(editingTemplateId) }
  );

  // View Modal Item State for Inline View Action
  const [viewingItem, setViewingItem] = useState(null);

  // Modal State for CRUD Operations
  const [activeModalTarget, setActiveModalTarget] = useState(null); // Key identifying master target
  const [modalEditingItem, setModalEditingItem] = useState(null);
  const [modalForm, setModalForm] = useState({});

  const modalDraftKey = activeModalTarget
    ? `clinical_modal_${activeModalTarget}${modalEditingItem ? `_edit_${modalEditingItem.id || modalEditingItem._id || ''}` : '_create'}`
    : 'clinical_modal_draft';

  const { clearDraft: clearModalDraft } = useFormDraft(
    modalDraftKey,
    modalForm,
    setModalForm,
    { isEditMode: Boolean(modalEditingItem), enabled: Boolean(activeModalTarget) }
  );

  // Quick Add Modal State for Diagnosis Template Builder
  const [quickModalType, setQuickModalType] = useState(null);
  const [quickForm, setQuickForm] = useState({});

  // Settings State
  const [settingsForm, setSettingsForm] = useState({
    defaultFollowup: '3 Days',
    defaultDosage: '1',
    defaultFrequency: 'BD',
    defaultFood: 'After Food',
    autoFillFrequent: true,
    printNotesHeader: true,
    presetNotes: 'Patient advised to complete full course of medication and return if symptoms persist.'
  });

  // Load all master lists from storage & DB
  const reloadAllMasters = () => {
    setDlist(getMasterList('dlist') || []);
    setSlist(getMasterList('slist') || []);
    setMlist(getMasterList('mlist') || []);
    setAdviceList(getMasterList('adviceList') || []);
    fetchHospitalInvestigations();
    setFollowups(getMasterList('followups') || []);
    fetchMedicineForms();
    fetchFrequencies();
    fetchDosages();
    fetchFoodInstructions();

    const savedSettings = localStorage.getItem('cm_settings');
    if (savedSettings) {
      try {
        setSettingsForm(JSON.parse(savedSettings));
      } catch { }
    }
  };

  useEffect(() => {
    reloadAllMasters();
  }, []);

  const saveMaster = (key, data) => {
    saveMasterList(key, data);
    reloadAllMasters();
  };

  // 3 Main Tabs Definitions
  const mainTabs = [
    { key: 'diagnosis', label: 'Diagnosis', icon: Activity },
    { key: 'medicines', label: 'Medicines', icon: Pill },
    { key: 'consultation', label: 'Clinical Library', icon: FileText }
  ];

  // Helper Filter Function
  const filterList = (list, query) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(item => {
      if (typeof item === 'object') {
        return Object.values(item).some(val => String(val || '').toLowerCase().includes(q));
      }
      return String(item).toLowerCase().includes(q);
    });
  };

  // Filtered lists for each section
  const filteredTemplates = useMemo(() => filterList(dlist, searchDiagTemplates), [dlist, searchDiagTemplates]);

  const templatesPerPage = 7;
  const totalTemplatePages = Math.ceil(filteredTemplates.length / templatesPerPage);
  const paginatedTemplates = useMemo(() => {
    return filteredTemplates.slice(
      (templatePage - 1) * templatesPerPage,
      templatePage * templatesPerPage
    );
  }, [filteredTemplates, templatePage]);

  useEffect(() => {
    if (templatePage > totalTemplatePages && totalTemplatePages > 0) {
      setTemplatePage(totalTemplatePages);
    }
  }, [filteredTemplates, totalTemplatePages, templatePage]);

  const filteredFrequent = useMemo(() => filterList(dlist.filter(d => typeof d === 'object' && d.frequent), searchFrequentDiag), [dlist, searchFrequentDiag]);
  const filteredSymptoms = useMemo(() => filterList(slist, searchSymptoms), [slist, searchSymptoms]);

  const filteredMedicines = useMemo(() => filterList(mlist, searchMedicines), [mlist, searchMedicines]);
  const filteredMedicineForms = useMemo(() => filterList(medicineForms, searchCategories), [medicineForms, searchCategories]);
  const filteredDosages = useMemo(() => filterList(dosages, searchDosages), [dosages, searchDosages]);
  const filteredFrequencies = useMemo(() => filterList(frequencies, searchFrequencies), [frequencies, searchFrequencies]);
  const filteredFood = useMemo(() => filterList(foodInstructions, searchFood), [foodInstructions, searchFood]);

  const filteredAdvice = useMemo(() => filterList(adviceList, searchAdvice), [adviceList, searchAdvice]);
  const filteredInvestigations = useMemo(() => filterList(investigations, searchInvestigations), [investigations, searchInvestigations]);
  const filteredFollowups = useMemo(() => filterList(followups, searchFollowups), [followups, searchFollowups]);

  // Diagnosis Protocol Template Builder Actions
  const toggleDiagnosisFieldArray = (field, val) => {
    const list = diagnosisForm[field] || [];
    if (list.includes(val)) {
      setDiagnosisForm({ ...diagnosisForm, [field]: list.filter(x => x !== val) });
    } else {
      setDiagnosisForm({ ...diagnosisForm, [field]: [...list, val] });
    }
  };

  const handleDiagnosisSubmit = async (e) => {
    e.preventDefault();
    if (!diagnosisForm.name.trim()) return toast.error('Diagnosis template name is required');

    const payload = {
      name: diagnosisForm.name.trim(),
      icd10Code: (diagnosisForm.icd || '').trim(),
      template: {
        symptoms: diagnosisForm.symptoms || [],
        medicines: (diagnosisForm.medicines || []).map(m => {
          if (typeof m === 'string') return { name: m };
          return {
            name: m.name || m.medicineName || '',
            dosage: m.dose || m.dosage || '',
            duration: m.duration || '',
            frequency: m.frequency || '',
            foodInstruction: m.timing || m.foodInstruction || ''
          };
        }),
        advice: diagnosisForm.advice || [],
        followupDuration: diagnosisForm.followup || '3 Days',
        investigations: diagnosisForm.investigations || [],
        notes: diagnosisForm.notes || ''
      }
    };

    try {
      if (editingTemplateId && editingTemplateId.length === 24) {
        await api.patch(`/operations/clinical-diagnoses/${editingTemplateId}`, payload);
        toast.success('Diagnosis template updated in database');
      } else {
        await api.post('/operations/clinical-diagnoses', payload);
        toast.success('Diagnosis template saved to database');
      }
      fetchDiagMasterList();
    } catch (err) {
      toast.error('Failed to save diagnosis template');
    }

    resetDiagnosisForm();
  };

  const resetDiagnosisForm = () => {
    clearDiagnosisDraft();
    setDiagnosisForm({
      name: '',
      icd: '',
      symptoms: [],
      medicines: [],
      advice: [],
      followup: '3 Days',
      investigations: [],
      status: 'Active',
      frequent: true
    });
    setIsCustomFollowup(false);
    setEditingTemplateId(null);
  };

  const handleDiagnosisEdit = (item) => {
    if (typeof item === 'object') {
      const targetId = item.id || item.name;
      setEditingTemplateId(targetId);
      setDiagnosisForm({
        name: item.name || '',
        icd: item.icd || '',
        symptoms: item.symptoms || [],
        medicines: item.medicines || [],
        advice: item.advice || [],
        followup: item.followup || '3 Days',
        investigations: item.investigations || [],
        status: item.status || 'Active',
        frequent: item.frequent !== undefined ? item.frequent : true
      });

      if (['3 Days', '5 Days', '7 Days', '14 Days', '30 Days'].includes(item.followup)) {
        setIsCustomFollowup(false);
      } else if (item.followup) {
        setIsCustomFollowup(true);
        setCustomFollowupDays(parseInt(item.followup) || 3);
      }
    }
  };

  const handleToggleFrequentStatus = (targetRow) => {
    const targetId = typeof targetRow === 'object' ? (targetRow?.id || targetRow?._id) : targetRow;
    const targetName = getItemText(targetRow).trim().toLowerCase();

    const updated = dlist.map((item, idx) => {
      const itemId = typeof item === 'object' ? (item.id || item._id) : idx;
      const itemName = getItemText(item).trim().toLowerCase();

      const isMatch = (targetId && itemId && String(targetId) === String(itemId)) || (targetName && itemName === targetName);
      if (isMatch) {
        return typeof item === 'object' ? { ...item, frequent: !item.frequent } : { name: item, frequent: true };
      }
      return item;
    });
    saveMaster('dlist', updated);
    toast.success('Frequency status updated');
  };

  const handleDeleteMasterRow = async (key, item) => {
    if (!window.confirm('Delete this master record?')) return;

    const itemId = typeof item === 'object' ? (item._id || item.id) : null;
    const isValidObjectId = itemId && /^[0-9a-fA-F]{24}$/.test(String(itemId));

    if (key === 'dlist') {
      if (isValidObjectId) {
        try {
          await api.delete(`/operations/clinical-diagnoses/${itemId}`);
          toast.success('Diagnosis record deleted');
          await fetchDiagMasterList();
          return;
        } catch (err) {
          console.error('Error deleting diagnosis from DB:', err);
          toast.error(err.response?.data?.message || 'Failed to delete diagnosis record');
          return;
        }
      } else {
        const list = getMasterList('dlist') || [];
        const itemText = getItemText(item).trim().toLowerCase();
        const updated = list.filter(it => {
          const itId = typeof it === 'object' ? (it.id || it._id) : null;
          if (itemId !== null && itemId !== undefined && itId !== null && itId !== undefined) {
            return String(itId) !== String(itemId);
          }
          return getItemText(it).trim().toLowerCase() !== itemText;
        });
        saveMaster('dlist', updated);
        setDiagMasterList(updated);
        setDlist(updated);
        toast.success('Diagnosis record deleted');
        return;
      }
    }
    if (key === 'frequencies' && isValidObjectId) {
      try {
        await api.delete(`/operations/medicine-frequencies/${itemId}`);
        toast.success('Frequency record deleted');
        fetchFrequencies();
        return;
      } catch (err) {
        console.error('Error deleting frequency from DB:', err);
        toast.error(err.response?.data?.message || 'Failed to delete frequency record');
      }
    }
    if (key === 'dosages' && isValidObjectId) {
      try {
        await api.delete(`/operations/medicine-dosages/${itemId}`);
        toast.success('Dosage record deleted');
        fetchDosages();
        return;
      } catch (err) {
        console.error('Error deleting dosage from DB:', err);
        toast.error(err.response?.data?.message || 'Failed to delete dosage record');
      }
    }
    if (key === 'foodInstructions' && isValidObjectId) {
      try {
        await api.delete(`/operations/food-instructions/${itemId}`);
        toast.success('Food instruction record deleted');
        fetchFoodInstructions();
        return;
      } catch (err) {
        console.error('Error deleting food instruction from DB:', err);
        toast.error(err.response?.data?.message || 'Failed to delete food instruction record');
      }
    }

    // Local storage fallback for legacy string or client-cached records
    const list = getMasterList(key) || [];
    const itemText = getItemText(item).trim().toLowerCase();

    const updated = list.filter(it => {
      const itId = typeof it === 'object' ? (it.id || it._id) : null;
      if (itemId !== null && itemId !== undefined && itId !== null && itId !== undefined) {
        return String(itId) !== String(itemId);
      }
      return getItemText(it).trim().toLowerCase() !== itemText;
    });

    saveMaster(key, updated);
    if (key === 'frequencies') fetchFrequencies();
    else if (key === 'dosages') fetchDosages();
    else if (key === 'foodInstructions') fetchFoodInstructions();
    else if (key === 'dlist') {
      fetchDiagMasterList();
      setDiagMasterList(updated);
      setDlist(updated);
    } else if (key === 'mlist') {
      setMlist(updated);
    } else if (key === 'slist') {
      setSlist(updated);
    } else if (key === 'adviceList') {
      setAdviceList(updated);
    } else if (key === 'investigations') {
      setInvestigations(updated);
    } else if (key === 'followups') {
      setFollowups(updated);
    }

    toast.success('Record deleted');
  };

  // Quick Add Modal Submission for Diagnosis Builder
  const handleQuickAddSubmit = (e) => {
    e.preventDefault();
    if (!quickModalType) return;

    if (quickModalType === 'symptom') {
      if (!quickForm.name?.trim()) return;
      const newSymptom = { id: String(Date.now()), name: quickForm.name.trim(), description: quickForm.description || '', status: 'Active' };
      saveMaster('slist', [...slist, newSymptom]);
      toggleDiagnosisFieldArray('symptoms', newSymptom.name);
      toast.success('Symptom added');
    } else if (quickModalType === 'medicine') {
      if (!quickForm.name?.trim()) return;
      const newMed = { id: String(Date.now()), name: quickForm.name.trim(), generic: quickForm.generic || '', brand: quickForm.brand || '', category: quickForm.category || 'Tablet', status: 'Active' };
      saveMaster('mlist', [...mlist, newMed]);
      toggleDiagnosisFieldArray('medicines', newMed.name);
      toast.success('Medicine added');
    } else if (quickModalType === 'advice') {
      if (!quickForm.name?.trim()) return;
      const advName = quickForm.name.trim();
      saveMaster('adviceList', [...adviceList, advName]);
      toggleDiagnosisFieldArray('advice', advName);
      toast.success('Advice added');
    } else if (quickModalType === 'investigation') {
      if (!quickForm.name?.trim()) return;
      const invName = quickForm.name.trim();
      saveMaster('investigations', [...investigations, invName]);
      toggleDiagnosisFieldArray('investigations', invName);
      toast.success('Investigation added');
    }

    setQuickModalType(null);
    setQuickForm({});
  };

  // Open Edit or Create Modal for generic list
  const openMasterModal = (key, item = null) => {
    setActiveModalTarget(key);
    setModalEditingItem(item);
    if (item) {
      if (typeof item === 'object') {
        const isFav = item.frequentlyUsed && user && item.frequentlyUsed.some(uid => String(uid) === String(user._id));
        setModalForm({
          ...item,
          name: item.name || getItemText(item),
          icd10Code: item.icd10Code || item.icd || '',
          category: item.category || 'General Medicine',
          frequent: !!(item.frequent || isFav),
          symptoms: item.template?.symptoms || item.symptoms || [],
          medicines: item.template?.medicines || item.medicines || [],
          advice: item.template?.advice || item.advice || [],
          investigations: item.template?.investigations || item.investigations || [],
          followup: item.template?.followupDuration || item.followup || '3 Days'
        });
      } else {
        setModalForm({ val: String(item), name: String(item), category: 'General Medicine' });
      }
    } else {
      setModalForm({ category: 'General Medicine', frequent: false, symptoms: [], medicines: [], advice: [], investigations: [], followup: '3 Days' });
    }
  };

  // Submit Generic Master Modal (CRUD Create / Edit)
  const handleGenericMasterSubmit = async (e) => {
    e.preventDefault();
    if (!activeModalTarget) return;

    const list = getMasterList(activeModalTarget) || [];

    if (activeModalTarget === 'slist') {
      if (!modalForm.name?.trim()) return toast.error('Symptom Name is required');
      if (modalEditingItem) {
        const updated = list.map(it => (typeof it === 'object' && (it.id === modalEditingItem.id || String(it.id) === String(modalEditingItem.id)) ? { ...it, ...modalForm } : it));
        saveMaster('slist', updated);
      } else {
        const newItem = { id: String(Date.now()), name: modalForm.name.trim(), description: modalForm.description || '', status: 'Active' };
        saveMaster('slist', [...list, newItem]);
      }
    } else if (activeModalTarget === 'mlist') {
      if (!modalForm.name?.trim()) return toast.error('Medicine Name is required');
      if (modalEditingItem) {
        const updated = list.map(it => (typeof it === 'object' && (it.id === modalEditingItem.id || String(it.id) === String(modalEditingItem.id)) ? { ...it, ...modalForm } : it));
        saveMaster('mlist', updated);
      } else {
        const newItem = { id: String(Date.now()), name: modalForm.name.trim(), generic: modalForm.genericName || modalForm.generic || '', genericName: modalForm.genericName || modalForm.generic || '', category: modalForm.category || 'Tablet', status: 'Active' };
        saveMaster('mlist', [...list, newItem]);
      }
    } else if (activeModalTarget === 'icdList') {
      if (!modalForm.code?.trim()) return toast.error('ICD Code is required');
      if (modalEditingItem) {
        const updated = list.map(it => (it.code === modalEditingItem.code ? { ...it, ...modalForm } : it));
        saveMaster('icdList', updated);
      } else {
        saveMaster('icdList', [...list, { code: modalForm.code.trim(), desc: modalForm.desc || '', category: modalForm.category || 'General' }]);
      }
    } else if (activeModalTarget === 'dlist') {
      const diagName = (modalForm.name || modalForm.val || '').trim();
      if (!diagName) return toast.error('Diagnosis Name is required');

      const payload = {
        name: diagName,
        icd10Code: (modalForm.icd10Code || modalForm.icd || '').trim(),
        category: (modalForm.category || 'General Medicine').trim(),
        frequent: !!modalForm.frequent,
        template: {
          symptoms: modalForm.symptoms || [],
          medicines: (modalForm.medicines || []).map(m => {
            if (typeof m === 'string') return { name: m };
            return {
              name: m.name || m.medicineName || '',
              dosage: m.dose || m.dosage || '',
              duration: m.duration || '',
              frequency: m.frequency || '',
              foodInstruction: m.timing || m.foodInstruction || ''
            };
          }),
          advice: modalForm.advice || [],
          followupDuration: modalForm.followup || '3 Days',
          investigations: modalForm.investigations || [],
          notes: modalForm.notes || ''
        }
      };

      try {
        if (modalEditingItem && modalEditingItem._id) {
          await api.patch(`/operations/clinical-diagnoses/${modalEditingItem._id}`, payload);
          toast.success('Diagnosis record updated in database');
        } else {
          await api.post('/operations/clinical-diagnoses', payload);
          toast.success('Diagnosis record saved to database');
        }
        await fetchDiagMasterList();
      } catch (err) {
        console.error('Error saving diagnosis to database:', err);
        toast.error(err.response?.data?.message || err.message || 'Failed to save diagnosis to database');
      }

      setActiveModalTarget(null);
      setModalForm({});
      setModalEditingItem(null);
      return;
    } else if (activeModalTarget === 'frequencies') {
      const code = (modalForm.code || modalForm.val || modalForm.name || '').trim();
      const englishName = (modalForm.englishName || modalForm.name || code).trim();
      const explanation = (modalForm.explanation || englishName).trim();
      const gridPattern = (modalForm.gridPattern || '').trim();

      if (!code) return toast.error('Frequency Code is required');

      try {
        await api.post('/operations/medicine-frequencies', { code, englishName, explanation, gridPattern });
        toast.success('Frequency saved to database');
        fetchFrequencies();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to save frequency to database');
      }

      clearModalDraft();
      setActiveModalTarget(null);
      setModalForm({});
      setModalEditingItem(null);
      return;
    } else if (activeModalTarget === 'dosages') {
      const val = (modalForm.val || modalForm.name || '').trim();
      const description = (modalForm.description || '').trim();

      if (!val) return toast.error('Dosage Value is required');

      try {
        await api.post('/operations/medicine-dosages', { val, description });
        toast.success('Dosage saved to database');
        fetchDosages();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to save dosage to database');
      }

      clearModalDraft();
      setActiveModalTarget(null);
      setModalForm({});
      setModalEditingItem(null);
      return;
    } else if (activeModalTarget === 'foodInstructions') {
      const name = (modalForm.name || modalForm.val || '').trim();
      const description = (modalForm.description || '').trim();

      if (!name) return toast.error('Instruction Name is required');

      try {
        await api.post('/operations/food-instructions', { name, description });
        toast.success('Food instruction saved to database');
        fetchFoodInstructions();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to save food instruction to database');
      }

      clearModalDraft();
      setActiveModalTarget(null);
      setModalForm({});
      setModalEditingItem(null);
      return;
    } else {
      // Simple text-based or generic master lists
      const valToAdd = (modalForm.name || modalForm.val || modalForm.text || modalForm.allergy || '').trim();
      if (!valToAdd) return toast.error('Value is required');

      if (modalEditingItem) {
        const updated = list.map(it => getItemText(it) === getItemText(modalEditingItem) ? valToAdd : it);
        saveMaster(activeModalTarget, updated);
      } else {
        saveMaster(activeModalTarget, [...list, valToAdd]);
      }
    }

    toast.success('Master record saved successfully');
    clearModalDraft();
    setActiveModalTarget(null);
    setModalForm({});
    setModalEditingItem(null);
  };

  const handleModalSave = handleGenericMasterSubmit;

  // Save Settings Form
  const handleSaveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('cm_settings', JSON.stringify(settingsForm));
    toast.success('Settings saved successfully');
  };

  // Common Action Definitions with Direct Inline Action Styling
  const createTableActions = (onView, onEdit, onDelete) => [
    { label: 'View', icon: Eye, onClick: onView, variant: 'view' },
    { label: 'Edit', icon: Edit3, onClick: onEdit, variant: 'edit' },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'delete' }
  ];

  return (
    <div className="space-y-6 text-left px-4 sm:px-6 py-6 bg-[#F8FAFC] min-h-screen">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-2 border-b border-[#E5E7EB] mt-1 sm:mt-2">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2] shrink-0 mt-0.5 sm:mt-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">Clinical Masters</h1>
            <p className="text-xs font-medium text-slate-500 leading-relaxed mt-0.5">Manage protocols, diagnosis templates, medicine catalogs, and consultation presets.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset all Clinical Masters back to default standard presets?')) {
              restoreDefaultMasters();
              reloadAllMasters();
              toast.success('Clinical masters restored to default standard presets!');
            }
          }}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer border border-slate-300 shadow-2xs whitespace-nowrap shrink-0"
        >
          <Sliders className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <span>Reset Default Masters</span>
        </button>
      </div>

      {/* 5 HORIZONTAL MAIN TABS */}
      {/* Desktop Main Tabs View */}
      <div className="hidden sm:flex items-center gap-6 border-b border-[#E5E7EB] overflow-x-auto scrollbar-none">
        {mainTabs.map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.key;

          const getTabLabel = () => {
            if (tab.key === 'diagnosis') return 'Diagnosis Management';
            if (tab.key === 'medicines') return 'Medication Configuration';
            if (tab.key === 'consultation') return 'Clinical Library';
            if (tab.key === 'icd_categories') return 'Categories & Registries';
            return tab.label;
          };

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 pt-2 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 ${isActive
                  ? 'text-[#2F63F2] border-[#2F63F2]'
                  : 'text-[#6B7280] border-transparent hover:text-[#111827]'
                }`}
            >
              <IconComp className={`w-4 h-4 ${isActive ? 'text-[#2F63F2]' : 'text-[#6B7280]'}`} />
              <span>{getTabLabel()}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile Main Tabs View */}
      <div className="block sm:hidden px-1 py-3 bg-transparent">
        <div className="grid grid-cols-4 gap-2.5">
          {mainTabs.map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeTab === tab.key;

            const getMobileTabLabel = () => {
              if (tab.key === 'diagnosis') return 'Diagnosis';
              if (tab.key === 'medicines') return 'Medicines';
              if (tab.key === 'consultation') return 'Library';
              if (tab.key === 'icd_categories') return 'ICD';
              return tab.label;
            };

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-col items-center justify-center py-3 px-1.5 rounded-2xl transition-all duration-150 ${isActive
                    ? 'bg-[#EBF1FF] text-[#2F63F2] font-bold'
                    : 'bg-transparent text-slate-650 hover:text-[#111827] font-medium'
                  }`}
              >
                <IconComp className={`w-5 h-5 mb-1.5 ${isActive ? 'text-[#2F63F2]' : 'text-slate-500'}`} />
                <span className="text-[10px] leading-tight tracking-tight font-semibold">{getMobileTabLabel()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: DIAGNOSIS MANAGEMENT (SINGLE UNIFIED WORKSPACE) */}
      {activeTab === 'diagnosis' && (
        <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left font-sans">
          <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                <Stethoscope className="w-5 h-5 text-[#2F63F2] shrink-0" />
                <span>Diagnosis Management</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Manage reusable diagnoses, ICD-10 codes, categories, frequently used items, and prescription templates in one place.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
              <div className="w-full sm:w-80 md:w-96 max-w-md">
                <Input
                  placeholder="Search diagnosis, ICD-10, category..."
                  value={searchDiagMaster}
                  onChange={(e) => setSearchDiagMaster(e.target.value)}
                  icon={Search}
                />
              </div>
              <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    fetchDiagMasterList();
                    toast.success('Refreshed Diagnosis Master');
                  }}
                  className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                  title="Refresh list"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
                <Button
                  onClick={() => openMasterModal('dlist')}
                  variant="primary"
                  className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                  icon={Plus}
                >
                  Add Diagnosis
                </Button>
              </div>
            </div>
          </div>

          <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
            <Table
              inlineActions={true}
              headers={[
                {
                  key: 'val',
                  label: 'Diagnosis Name',
                  render: (row) => (
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">{row.name || getItemText(row)}</span>
                      {row.source === 'DOCTOR_ADDED' && (
                        <span className="text-[9px] font-extrabold text-[#3563FF] bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded inline-block mt-0.5">
                          ✨ Doctor Added
                        </span>
                      )}
                    </div>
                  )
                },
                {
                  key: 'icd10Code',
                  label: 'ICD-10 Code',
                  render: (row) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const newCode = prompt(`Enter ICD-10 Code for "${row.name}":`, row.icd10Code || '');
                        if (newCode !== null) {
                          try {
                            await api.patch(`/operations/clinical-diagnoses/${row._id}`, { icd10Code: newCode.trim() });
                            toast.success('Updated ICD-10 Code');
                            fetchDiagMasterList();
                          } catch (err) {
                            toast.error('Failed to update ICD-10 Code');
                          }
                        }
                      }}
                      className="text-xs font-mono font-bold text-[#2F63F2] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>{row.icd10Code || '—'}</span>
                      <Edit3 className="w-3 h-3 text-slate-400" />
                    </button>
                  )
                },
                {
                  key: 'category',
                  label: 'Category',
                  render: (row) => (
                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg inline-block">
                      {row.category || 'General Medicine'}
                    </span>
                  )
                },
                {
                  key: 'template',
                  label: 'Prescription Template',
                  render: (row) => {
                    const symptoms = row.template?.symptoms || row.symptoms || [];
                    const medicines = row.template?.medicines || row.medicines || [];
                    const advice = row.template?.advice || row.advice || [];
                    const followup = row.template?.followupDuration || row.followup || '3 Days';
                    if (symptoms.length === 0 && medicines.length === 0 && advice.length === 0) {
                      return <span className="text-slate-400 text-xs">—</span>;
                    }
                    return (
                      <div className="space-y-1 text-[10px] font-medium text-slate-600 max-w-[220px]">
                        {symptoms.length > 0 && (
                          <div className="flex items-center gap-1 truncate">
                            <span className="font-bold text-slate-500 shrink-0">Symptoms:</span>
                            <span className="truncate">{symptoms.join(', ')}</span>
                          </div>
                        )}
                        {medicines.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-500 shrink-0">Medicines:</span>
                            <span className="bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.2 rounded border border-emerald-200">{medicines.length} prescribed</span>
                          </div>
                        )}
                        {followup && (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-500 shrink-0">Follow-up:</span>
                            <span className="font-semibold text-blue-600">{followup}</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                },
                {
                  key: 'frequentlyUsed',
                  label: 'Frequently Used',
                  render: (row) => {
                    const isFav = row.frequentlyUsed && user && row.frequentlyUsed.some(uid => String(uid) === String(user._id));
                    const isFrequentFlag = row.frequent || isFav;
                    return (
                      <button
                        type="button"
                        onClick={async () => {
                          if (row._id) {
                            try {
                              const res = await api.post(`/operations/clinical-diagnoses/${row._id}/favorite`);
                              if (res.data?.success) {
                                toast.success(res.data.isFavorite ? 'Marked as frequently used' : 'Removed from frequently used');
                                fetchDiagMasterList();
                              }
                            } catch (err) {
                              toast.error('Failed to update favorite status');
                            }
                          } else {
                            handleToggleFrequentStatus(row);
                          }
                        }}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${isFrequentFlag
                            ? 'bg-amber-50 text-amber-600 border-amber-300 hover:bg-amber-100'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                          }`}
                        title={isFrequentFlag ? 'Frequently Used (Click to unmark)' : 'Click to mark as Frequently Used'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFrequentFlag ? 'fill-amber-500 text-amber-500' : ''}`} />
                        <span>{isFrequentFlag ? 'Frequent' : 'Standard'}</span>
                      </button>
                    );
                  }
                }
              ]}
              data={diagMasterList.filter(item => {
                if (!searchDiagMaster.trim()) return true;
                const q = searchDiagMaster.toLowerCase();
                const nameMatch = (item.name || '').toLowerCase().includes(q);
                const icdMatch = (item.icd10Code || item.icd || '').toLowerCase().includes(q);
                const catMatch = (item.category || '').toLowerCase().includes(q);
                return nameMatch || icdMatch || catMatch;
              })}
              actions={createTableActions(
                (row) => setViewingItem({ type: 'Diagnosis Record', item: row }),
                (row) => openMasterModal('dlist', row),
                (row) => handleDeleteMasterRow('dlist', row)
              )}
            />
            {diagMasterList.length === 0 && (
              <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                📋 No Clinical Diagnoses found. Click "Add Diagnosis" to create your first diagnosis record.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MEDICINES (ENTERPRISE MASTER-DETAIL WORKSPACE) */}
      {activeTab === 'medicines' && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* LEFT SIDEBAR NAVIGATION PANEL (280px) */}
          <div className="w-full lg:w-[280px] bg-white border border-[#E5E7EB] rounded-[20px] p-4 shadow-sm space-y-3 shrink-0 lg:sticky lg:top-6">
            <div className="px-2 pt-1 pb-2 border-b border-[#E5E7EB] flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Pill className="w-4 h-4 text-[#2F63F2]" />
                Medication Masters
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2F63F2]">
                5 Masters
              </span>
            </div>

            {/* Desktop / Laptop Navigation List */}
            <div className="hidden sm:space-y-1.5 sm:block">
              {[
                { key: 'med_master', label: 'Medicine Master', icon: Pill, count: mlist.length },
                { key: 'med_categories', label: 'Medicine Formats', icon: Package, count: medicineForms.length },
                { key: 'dosages', label: 'Dosage Master', icon: Sliders, count: dosages.length },
                { key: 'frequencies', label: 'Frequency Master', icon: Clock, count: frequencies.length },
                { key: 'food_instructions', label: 'Food Instruction Master', icon: FileText, count: foodInstructions.length }
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = medSubTab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMedSubTab(item.key)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-150 cursor-pointer text-left ${isSelected
                        ? 'bg-blue-50/80 border-l-4 border-[#2F63F2] font-bold text-[#2F63F2] shadow-xs'
                        : 'bg-white hover:bg-slate-50 text-slate-700 font-medium hover:text-slate-900 border-l-4 border-transparent'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-white text-[#2F63F2] shadow-2xs' : 'bg-slate-100 text-slate-500'
                        }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs">{item.label}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-blue-100 text-[#2F63F2]' : 'bg-slate-100 text-slate-500'
                      }`}>
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Responsive Mobile / Tablet Dropdown Selector */}
            <div className="block sm:hidden pt-1">
              <select
                value={medSubTab}
                onChange={(e) => setMedSubTab(e.target.value)}
                className="w-full h-[42px] px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2F63F2] cursor-pointer"
              >
                <option value="med_master">💊 Medicine Master ({mlist.length})</option>
                <option value="med_categories">📦 Medicine Formats ({medicineForms.length})</option>
                <option value="dosages">💊 Dosage Master ({dosages.length})</option>
                <option value="frequencies">⏰ Frequency Master ({frequencies.length})</option>
                <option value="food_instructions">🍽 Food Instruction Master ({foodInstructions.length})</option>
              </select>
            </div>
          </div>

          {/* RIGHT CONTENT AREA (DYNAMICALLY ANIMATED SPLIT WORKSPACE) */}
          <div className="flex-1 w-full min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={medSubTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                {/* 1. MEDICINE MASTER */}
                {medSubTab === 'med_master' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <Pill className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Medicine Master</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Manage medicines available for prescriptions.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search medicines..."
                            value={searchMedicines}
                            onChange={(e) => setSearchMedicines(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setMlist(getMasterList('mlist') || []);
                              toast.success('Refreshed Medicine Master');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                          <Button
                            onClick={() => openMasterModal('mlist')}
                            variant="primary"
                            className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                            icon={Plus}
                          >
                            Add Medicine
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'name', label: 'Medicine Name', render: (row) => <span className="font-bold text-[#111827]">{getItemText(row)}</span> },
                          { key: 'strength', label: 'Strength', render: (row) => <span className="font-mono text-xs text-slate-600">{row?.strength || '-'}</span> },
                          { key: 'category', label: 'Category', render: (row) => <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{getItemText(row?.category) || 'Tablet'}</span> },
                          { key: 'status', label: 'Status', render: (row) => <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">{row?.status || 'Active'}</span> }
                        ]}
                        data={filteredMedicines}
                        actions={createTableActions(
                          (row) => setViewingItem({ type: 'Medicine Master', item: row }),
                          (row) => openMasterModal('mlist', row),
                          (row) => handleDeleteMasterRow('mlist', row)
                        )}
                      />
                      {filteredMedicines.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Records Found. Click "Add Medicine" to create the first record.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. MEDICINE FORMATS (DATABASE BACKED) */}
                {medSubTab === 'med_categories' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <Package className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Medicine Formats (DB-Backed)</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Formulation types (Tablet, Capsule, Syrup, etc.) stored in tenant database.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search formats..."
                            value={searchCategories}
                            onChange={(e) => setSearchCategories(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              fetchMedicineForms();
                              toast.success('Refreshed Medicine Formats');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                          <Button
                            onClick={async () => {
                              const newFormName = prompt('Enter new Medicine Format name (e.g. Ointment, Gel, Drops):');
                              if (newFormName && newFormName.trim()) {
                                try {
                                  await api.post('/operations/medicine-forms', { name: newFormName.trim() });
                                  toast.success('Medicine format saved to database');
                                  fetchMedicineForms();
                                } catch (err) {
                                  toast.error('Failed to add medicine format');
                                }
                              }
                            }}
                            variant="primary"
                            className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                            icon={Plus}
                          >
                            Add Format
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'name', label: 'Format Name', render: (row) => <span className="font-bold text-[#111827]">{row.name}</span> },
                          { key: 'code', label: 'Code', render: (row) => <span className="font-mono text-xs text-slate-600">{row.code || '—'}</span> }
                        ]}
                        data={filteredMedicineForms}
                        actions={createTableActions(
                          (row) => setViewingItem({ type: 'Medicine Format', item: row }),
                          null,
                          async (row) => {
                            if (window.confirm(`Delete medicine format "${row.name}"?`)) {
                              try {
                                await api.delete(`/operations/medicine-forms/${row._id}`);
                                toast.success('Medicine format removed');
                                fetchMedicineForms();
                              } catch (err) {
                                toast.error('Failed to delete medicine format');
                              }
                            }
                          }
                        )}
                      />
                      {filteredMedicineForms.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Records Found. Click "Add Format" to create the first record.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. DOSAGE MASTER */}
                {medSubTab === 'dosages' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <Sliders className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Dosage Master</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Configure available dosage values.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search dosage..."
                            value={searchDosages}
                            onChange={(e) => setSearchDosages(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setDosages(getMasterList('dosages') || []);
                              toast.success('Refreshed Dosage Master');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                          <Button
                            onClick={() => openMasterModal('dosages')}
                            variant="primary"
                            className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                            icon={Plus}
                          >
                            Add Dosage
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'val', label: 'Dosage', render: (row) => <span className="font-bold text-[#111827]">{getItemText(row)}</span> },
                          { key: 'description', label: 'Description', render: (row) => <span className="text-slate-500 text-xs">{row.description || '—'}</span> }
                        ]}
                        data={filteredDosages}
                        actions={createTableActions(
                          (row) => setViewingItem({ type: 'Dosage Master', item: row }),
                          (row) => openMasterModal('dosages', row),
                          (row) => handleDeleteMasterRow('dosages', row)
                        )}
                      />
                      {filteredDosages.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Records Found. Click "Add Dosage" to create the first record.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. FREQUENCY MASTER */}
                {medSubTab === 'frequencies' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <Clock className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Frequency Master</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Configure prescription frequency options, English names, and dosage explanations.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search frequency..."
                            value={searchFrequencies}
                            onChange={(e) => setSearchFrequencies(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              fetchFrequencies();
                              toast.success('Refreshed Frequency Master');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                          <Button
                            onClick={() => openMasterModal('frequencies')}
                            variant="primary"
                            className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                            icon={Plus}
                          >
                            Add Frequency
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'code', label: 'Frequency Code', render: (row) => <span className="font-bold text-[#111827] font-mono">{row.code || row.val || getItemText(row)}</span> },
                          { key: 'englishName', label: 'English Name', render: (row) => <span className="font-bold text-slate-800 text-xs">{row.englishName || '—'}</span> },
                          { key: 'explanation', label: 'Explanation', render: (row) => <span className="text-slate-600 text-xs font-medium">{row.explanation || '—'}</span> },
                          { key: 'gridPattern', label: 'Grid Pattern', render: (row) => <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 font-bold">{row.gridPattern || '—'}</span> }
                        ]}
                        data={filteredFrequencies}
                        actions={createTableActions(
                          (row) => setViewingItem({ type: 'Frequency Master', item: row }),
                          (row) => openMasterModal('frequencies', row),
                          (row) => handleDeleteMasterRow('frequencies', row)
                        )}
                      />
                      {filteredFrequencies.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Records Found. Click "Add Frequency" to create the first record.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. FOOD INSTRUCTION MASTER */}
                {medSubTab === 'food_instructions' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <FileText className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Food Instruction Master</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Configure medicine food timing instructions.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search food instructions..."
                            value={searchFood}
                            onChange={(e) => setSearchFood(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              fetchFoodInstructions();
                              toast.success('Refreshed Food Instructions');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                          <Button
                            onClick={() => openMasterModal('foodInstructions')}
                            variant="primary"
                            className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                            icon={Plus}
                          >
                            Add Food Instruction
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'name', label: 'Instruction', render: (row) => <span className="font-bold text-[#111827]">{row.name || getItemText(row)}</span> },
                          { key: 'description', label: 'Description', render: (row) => <span className="text-slate-500 text-xs">{row.description || '—'}</span> }
                        ]}
                        data={filteredFood}
                        actions={createTableActions(
                          (row) => setViewingItem({ type: 'Food Instruction', item: row }),
                          (row) => openMasterModal('foodInstructions', row),
                          (row) => handleDeleteMasterRow('foodInstructions', row)
                        )}
                      />
                      {filteredFood.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Records Found. Click "Add Food Instruction" to create the first record.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      )}

      {/* TAB 3: CLINICAL LIBRARY (ENTERPRISE MASTER-DETAIL WORKSPACE) */}
      {activeTab === 'consultation' && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* LEFT SIDEBAR NAVIGATION PANEL (280px) */}
          <div className="w-full lg:w-[280px] bg-white border border-[#E5E7EB] rounded-[20px] p-4 shadow-sm space-y-3 shrink-0 lg:sticky lg:top-6">
            <div className="px-2 pt-1 pb-2 border-b border-[#E5E7EB] flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-[#2F63F2]" />
                Clinical Library
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2F63F2]">
                3 Masters
              </span>
            </div>

            {/* Desktop / Laptop Navigation List */}
            <div className="hidden sm:space-y-1.5 sm:block">
              {[
                { key: 'advice_master', label: 'Advice Master', icon: Lightbulb, count: adviceList.length },
                { key: 'investigation_master', label: 'Investigation Master', icon: Microscope, count: investigations.length },
                { key: 'followup_master', label: 'Follow-up Master', icon: Clock, count: followups.length }
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = consultSubTab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setConsultSubTab(item.key)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-150 cursor-pointer text-left ${isSelected
                        ? 'bg-blue-50/80 border-l-4 border-[#2F63F2] font-bold text-[#2F63F2] shadow-xs'
                        : 'bg-white hover:bg-slate-50 text-slate-700 font-medium hover:text-slate-900 border-l-4 border-transparent'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-white text-[#2F63F2] shadow-2xs' : 'bg-slate-100 text-slate-500'
                        }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs">{item.label}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-blue-100 text-[#2F63F2]' : 'bg-slate-100 text-slate-500'
                      }`}>
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Responsive Mobile / Tablet Dropdown Selector */}
            <div className="block sm:hidden pt-1">
              <select
                value={consultSubTab}
                onChange={(e) => setConsultSubTab(e.target.value)}
                className="w-full h-[42px] px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2F63F2] cursor-pointer"
              >
                <option value="advice_master">💡 Advice Master ({adviceList.length})</option>
                <option value="investigation_master">🔬 Investigation Master ({investigations.length})</option>
                <option value="followup_master">⏰ Follow-up Master ({followups.length})</option>
              </select>
            </div>
          </div>

          {/* RIGHT CONTENT AREA (DYNAMICALLY ANIMATED SPLIT WORKSPACE) */}
          <div className="flex-1 w-full min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={consultSubTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                {/* 1. ADVICE MASTER */}
                {consultSubTab === 'advice_master' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <Lightbulb className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Advice Master</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Standard clinical advice recommendations for prescription output.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search advice..."
                            value={searchAdvice}
                            onChange={(e) => setSearchAdvice(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setAdviceList(getMasterList('adviceList') || []);
                              toast.success('Refreshed Advice Master');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                          <Button
                            onClick={() => openMasterModal('adviceList')}
                            variant="primary"
                            className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                            icon={Plus}
                          >
                            Add Advice
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'val', label: 'Advice Text', render: (row) => <span className="font-bold text-[#111827]">{getItemText(row)}</span> },
                          { key: 'status', label: 'Status', render: () => <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">Active</span> }
                        ]}
                        data={filteredAdvice}
                        actions={createTableActions(
                          (row) => setViewingItem({ type: 'Advice Master', item: row }),
                          (row) => openMasterModal('adviceList', row),
                          (row) => handleDeleteMasterRow('adviceList', row)
                        )}
                      />
                      {filteredAdvice.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Records Found. Click "Add Advice" to create the first record.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. INVESTIGATION MASTER */}
                {consultSubTab === 'investigation_master' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <Microscope className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Investigation Master</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Diagnostic laboratory and radiology test orders configured in Hospital Service Catalog.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search investigations..."
                            value={searchInvestigations}
                            onChange={(e) => setSearchInvestigations(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              fetchHospitalInvestigations();
                              toast.success('Refreshed Investigation Master');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'val', label: 'Investigation Name', render: (row) => <span className="font-bold text-[#111827]">{getItemText(row)}</span> },
                          { key: 'department', label: 'Department', render: (row) => <span className="text-xs text-slate-600 font-medium">{row?.department || 'General'}</span> },
                          { key: 'status', label: 'Status', render: () => <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">Active</span> }
                        ]}
                        data={filteredInvestigations}
                        actions={[
                          { label: 'View', icon: Eye, onClick: (row) => setViewingItem({ type: 'Investigation Master', item: row }), variant: 'view' }
                        ]}
                      />
                      {filteredInvestigations.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Investigation Services Found in Hospital Service Catalog. Check that Laboratory and/or Radiology feature flags are enabled and services are added in Service Catalog.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. FOLLOW-UP MASTER */}
                {consultSubTab === 'followup_master' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-3.5 sm:p-6 shadow-sm space-y-5 text-left">
                    <div className="border-b border-[#E5E7EB] pb-4 space-y-3.5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                          <Clock className="w-5 h-5 text-[#2F63F2] shrink-0" />
                          <span>Follow-up Master</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Follow-up duration options (3 Days, 5 Days, 7 Days, etc.).
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                        <div className="w-full sm:w-80 md:w-96 max-w-md">
                          <Input
                            placeholder="Search follow-up options..."
                            value={searchFollowups}
                            onChange={(e) => setSearchFollowups(e.target.value)}
                            icon={Search}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setFollowups(getMasterList('followups') || []);
                              toast.success('Refreshed Follow-up Master');
                            }}
                            className="h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                            title="Refresh list"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                          </button>
                          <Button
                            onClick={() => openMasterModal('followups')}
                            variant="primary"
                            className="h-[38px] px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5] whitespace-nowrap shrink-0 shadow-sm"
                            icon={Plus}
                          >
                            Add Follow-up
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 sm:border border-[#E5E7EB] rounded-none sm:rounded-[16px] overflow-visible sm:overflow-hidden bg-transparent sm:bg-white">
                      <Table
                        inlineActions={true}
                        headers={[
                          { key: 'val', label: 'Follow-up Duration', render: (row) => <span className="font-bold text-[#111827]">{getItemText(row)}</span> },
                          { key: 'status', label: 'Status', render: () => <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">Active</span> }
                        ]}
                        data={filteredFollowups}
                        actions={createTableActions(
                          (row) => setViewingItem({ type: 'Follow-up Master', item: row }),
                          (row) => openMasterModal('followups', row),
                          (row) => handleDeleteMasterRow('followups', row)
                        )}
                      />
                      {filteredFollowups.length === 0 && (
                        <div className="p-10 text-center text-[#6B7280] font-medium text-xs">
                          📋 No Records Found. Click "Add Follow-up" to create the first record.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      )}



      {/* QUICK VIEW MODAL FOR INLINE VIEW ACTION */}
      <Modal
        isOpen={Boolean(viewingItem)}
        onClose={() => setViewingItem(null)}
        title={`View ${viewingItem?.type || 'Record'}`}
        size="lg"
      >
        {viewingItem && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-[#E5E7EB] rounded-xl space-y-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Item Title / Label</span>
                <p className="text-sm font-bold text-[#111827] mt-0.5">{getItemText(viewingItem.item)}</p>
              </div>

              {typeof viewingItem.item === 'object' && (
                <>
                  {viewingItem.item.icd && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">ICD Code</span>
                      <p className="text-xs font-mono font-bold text-[#3563FF] mt-0.5">{viewingItem.item.icd}</p>
                    </div>
                  )}

                  {viewingItem.item.desc && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Description</span>
                      <p className="text-xs font-medium text-[#111827] mt-0.5">{viewingItem.item.desc}</p>
                    </div>
                  )}

                  {viewingItem.item.symptoms && Array.isArray(viewingItem.item.symptoms) && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Associated Symptoms</span>
                      <p className="text-xs font-medium text-[#111827] mt-0.5">{viewingItem.item.symptoms.map(getItemText).join(', ')}</p>
                    </div>
                  )}

                  {viewingItem.item.medicines && Array.isArray(viewingItem.item.medicines) && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Associated Medicines</span>
                      <p className="text-xs font-medium text-[#3563FF] mt-0.5">{viewingItem.item.medicines.map(getItemText).join(', ')}</p>
                    </div>
                  )}

                  {viewingItem.item.advice && Array.isArray(viewingItem.item.advice) && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Advice Recommendations</span>
                      <p className="text-xs font-medium text-[#111827] mt-0.5">{viewingItem.item.advice.map(getItemText).join(', ')}</p>
                    </div>
                  )}

                  {viewingItem.item.followup && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Follow Up</span>
                      <p className="text-xs font-bold text-slate-700 mt-0.5">{getItemText(viewingItem.item.followup)}</p>
                    </div>
                  )}

                  {viewingItem.item.department && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Department / Category</span>
                      <p className="text-xs font-semibold text-slate-700 mt-0.5">{viewingItem.item.department}</p>
                    </div>
                  )}

                  {viewingItem.item.price !== undefined && viewingItem.item.price !== null && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Standard Rate / Fee</span>
                      <p className="text-xs font-mono font-bold text-emerald-600 mt-0.5">₹{Number(viewingItem.item.price).toLocaleString('en-IN')}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-[#E5E7EB]">
              <Button
                type="button"
                variant="primary"
                onClick={() => setViewingItem(null)}
                className="h-[38px] px-5 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* QUICK ADD MODAL FOR DIAGNOSIS BUILDER */}
      <Modal
        isOpen={Boolean(quickModalType)}
        onClose={() => setQuickModalType(null)}
        title={`Add New ${quickModalType ? quickModalType.toUpperCase() : ''}`}
        size="lg"
      >
        <form onSubmit={handleQuickAddSubmit} className="space-y-4">
          {quickModalType === 'symptom' && (
            <>
              <Input
                label="Symptom Name"
                placeholder="e.g. High Fever / Headaches"
                value={quickForm.name || ''}
                onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
                required
              />
              <Input
                label="Description (Optional)"
                placeholder="Brief description..."
                value={quickForm.description || ''}
                onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })}
              />
            </>
          )}

          {quickModalType === 'medicine' && (
            <>
              <Input
                label="Medicine Name"
                placeholder="e.g. Paracetamol 650mg"
                value={quickForm.name || ''}
                onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Strength"
                  placeholder="e.g. 650mg"
                  value={quickForm.strength || ''}
                  onChange={(e) => setQuickForm({ ...quickForm, strength: e.target.value })}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Category</label>
                  <select
                    className="w-full h-[40px] px-3 border border-[#E5E7EB] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#3563FF]"
                    value={quickForm.category || 'Tablet'}
                    onChange={(e) => setQuickForm({ ...quickForm, category: e.target.value })}
                  >
                    {medicineForms.map(form => (
                      <option key={form._id || form.name} value={form.name}>{form.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {quickModalType === 'advice' && (
            <Input
              label="Advice Text"
              placeholder="e.g. Drink plenty of water and rest..."
              value={quickForm.text || ''}
              onChange={(e) => setQuickForm({ ...quickForm, text: e.target.value })}
              required
            />
          )}

          {quickModalType === 'investigation' && (
            <Input
              label="Investigation Name"
              placeholder="e.g. Complete Blood Count (CBC)"
              value={quickForm.name || ''}
              onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
              required
            />
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[#E5E7EB]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuickModalType(null)}
              className="h-[38px] px-4 text-xs font-bold"
            >
              Close
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="h-[38px] px-5 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5]"
            >
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* STANDARD CENTERED MODAL FOR MASTER CRUD SECTIONS */}
      <Modal
        isOpen={Boolean(activeModalTarget)}
        onClose={() => setActiveModalTarget(null)}
        title={`${modalEditingItem ? 'Edit' : 'Add'} Master Item`}
        size="lg"
      >
        <form onSubmit={handleModalSave} className="space-y-4">
          {activeModalTarget === 'slist' && (
            <>
              <Input
                label="Symptom Name"
                placeholder="e.g. High Fever"
                value={modalForm.name || ''}
                onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                required
              />
              <Input
                label="Description"
                placeholder="Optional details..."
                value={modalForm.description || ''}
                onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
              />
            </>
          )}

          {activeModalTarget === 'mlist' && (
            <>
              <Input
                label="Medicine Name"
                placeholder="e.g. Paracetamol 650mg"
                value={modalForm.name || ''}
                onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Strength"
                  placeholder="e.g. 650mg"
                  value={modalForm.strength || ''}
                  onChange={(e) => setModalForm({ ...modalForm, strength: e.target.value })}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Category</label>
                  <select
                    className="w-full h-[40px] px-3 border border-[#E5E7EB] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#3563FF]"
                    value={modalForm.category || 'Tablet'}
                    onChange={(e) => setModalForm({ ...modalForm, category: e.target.value })}
                  >
                    {medicineForms.map(form => (
                      <option key={form._id || form.name} value={form.name}>{form.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {activeModalTarget === 'icdList' && (
            <>
              <Input
                label="ICD Code"
                placeholder="e.g. J20.9"
                value={modalForm.code || ''}
                onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                required
              />
              <Input
                label="Disease Description"
                placeholder="e.g. Acute bronchitis, unspecified"
                value={modalForm.desc || ''}
                onChange={(e) => setModalForm({ ...modalForm, desc: e.target.value })}
                required
              />
            </>
          )}

          {activeModalTarget === 'dlist' && (
            <div className="space-y-4 text-left font-sans max-h-[70vh] overflow-y-auto pr-1">
              <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 sm:space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#2F63F2] flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4" />
                  Diagnosis Basic Details
                </h4>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                  <Input
                    label="Diagnosis Name *"
                    placeholder="e.g. Acute Viral Bronchitis"
                    value={modalForm.name || modalForm.val || ''}
                    onChange={(e) => setModalForm({ ...modalForm, name: e.target.value, val: e.target.value })}
                    required
                  />
                  <Input
                    label="ICD-10 Code"
                    placeholder="e.g. J20.9"
                    value={modalForm.icd10Code || modalForm.icd || ''}
                    onChange={(e) => setModalForm({ ...modalForm, icd10Code: e.target.value, icd: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-center">
                  <div className="flex flex-col gap-1 sm:gap-1.5 w-full">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">
                      Diagnosis Category *
                    </label>
                    <select
                      className="enterprise-input h-[38px] sm:h-[42px] text-xs font-semibold"
                      value={modalForm.category || 'General Medicine'}
                      onChange={(e) => setModalForm({ ...modalForm, category: e.target.value })}
                      required
                    >
                      {['General Medicine', 'Cardiology', 'Pediatrics', 'Neurology', 'Orthopedics', 'ENT', 'Dermatology', 'Gastroenterology', 'Pulmonology', 'IPD Care', 'Emergency'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 pt-1 sm:pt-4 pl-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!modalForm.frequent}
                        onChange={(e) => setModalForm({ ...modalForm, frequent: e.target.checked })}
                        className="w-4 h-4 rounded text-[#2F63F2] focus:ring-[#2F63F2] cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        Mark as Frequently Used Diagnosis
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Prescription Protocol Template Section */}
              <div className="p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 sm:space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#2F63F2] flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  Prescription Protocol Template (Optional)
                </h4>

                <ChipSelector
                  title="Symptoms"
                  placeholder="Search symptoms..."
                  items={slist}
                  selected={modalForm.symptoms || []}
                  onToggle={(val) => {
                    const current = modalForm.symptoms || [];
                    const exists = current.includes(val);
                    const updated = exists ? current.filter(v => v !== val) : [...current, val];
                    setModalForm({ ...modalForm, symptoms: updated });
                  }}
                  onAddNew={() => {
                    setQuickModalType('symptom');
                    setQuickForm({ name: '', description: '' });
                  }}
                  addNewLabel="Add Symptom"
                  colorClass="blue"
                />

                <ChipSelector
                  title="Medicines"
                  placeholder="Search medicines..."
                  items={mlist}
                  selected={modalForm.medicines || []}
                  onToggle={(val) => {
                    const current = modalForm.medicines || [];
                    const exists = current.some(m => (typeof m === 'string' ? m : m.name) === val);
                    const updated = exists
                      ? current.filter(m => (typeof m === 'string' ? m : m.name) !== val)
                      : [...current, val];
                    setModalForm({ ...modalForm, medicines: updated });
                  }}
                  onAddNew={() => {
                    setQuickModalType('medicine');
                    setQuickForm({ name: '', strength: '', category: 'Tablet' });
                  }}
                  addNewLabel="Add Medicine"
                  colorClass="green"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <ChipSelector
                    title="Advice"
                    placeholder="Search advice..."
                    items={adviceList}
                    selected={modalForm.advice || []}
                    onToggle={(val) => {
                      const current = modalForm.advice || [];
                      const exists = current.includes(val);
                      const updated = exists ? current.filter(v => v !== val) : [...current, val];
                      setModalForm({ ...modalForm, advice: updated });
                    }}
                    onAddNew={() => {
                      setQuickModalType('advice');
                      setQuickForm({ text: '' });
                    }}
                    addNewLabel="Add Advice"
                    colorClass="amber"
                  />

                  <ChipSelector
                    title="Investigations"
                    placeholder="Search investigations..."
                    items={investigations}
                    selected={modalForm.investigations || []}
                    onToggle={(val) => {
                      const current = modalForm.investigations || [];
                      const exists = current.includes(val);
                      const updated = exists ? current.filter(v => v !== val) : [...current, val];
                      setModalForm({ ...modalForm, investigations: updated });
                    }}
                    onAddNew={() => {
                      setQuickModalType('investigation');
                      setQuickForm({ name: '' });
                    }}
                    addNewLabel="Add Investigation"
                    colorClass="purple"
                  />
                </div>

                <div className="flex flex-col gap-1 sm:gap-1.5 w-full">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">
                    Follow-up Duration
                  </label>
                  <select
                    className="enterprise-input h-[38px] sm:h-[42px] text-xs font-semibold"
                    value={modalForm.followup || '3 Days'}
                    onChange={(e) => setModalForm({ ...modalForm, followup: e.target.value })}
                  >
                    <option value="None">None (0 Days)</option>
                    <option value="3 Days">3 Days</option>
                    <option value="5 Days">5 Days</option>
                    <option value="7 Days">7 Days</option>
                    <option value="14 Days">14 Days</option>
                    <option value="30 Days">30 Days</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {!['slist', 'mlist', 'icdList', 'dlist'].includes(activeModalTarget) && (
            <Input
              label="Value Name"
              placeholder="Enter master item name..."
              value={modalForm.name || modalForm.val || modalForm.text || modalForm.allergy || ''}
              onChange={(e) => setModalForm({ ...modalForm, name: e.target.value, val: e.target.value, text: e.target.value, allergy: e.target.value })}
              required
            />
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[#E5E7EB]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActiveModalTarget(null)}
              className="h-[38px] px-4 text-xs font-bold"
            >
              Close
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="h-[38px] px-5 text-xs font-bold uppercase tracking-wider bg-[#3563FF] text-white hover:bg-[#2F58E5]"
            >
              Save Record
            </Button>
          </div>
        </form>
      </Modal>
      {/* Custom Delete Confirmation Modal */}
      {deleteTemplateConfirm && (
        <Modal
          isOpen={!!deleteTemplateConfirm}
          onClose={() => setDeleteTemplateConfirm(null)}
          title={isTemplateUsedInConsultations(deleteTemplateConfirm) ? "Template In Use" : "Delete Diagnosis Template?"}
        >
          {isTemplateUsedInConsultations(deleteTemplateConfirm) ? (
            <div className="space-y-4 text-left font-sans">
              <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-1">Protected Template Indicator</p>
                  <p className="font-medium text-slate-700">
                    This diagnosis template <strong className="text-[#111827] font-bold">"{getItemText(deleteTemplateConfirm)}"</strong> has already been used in patient consultations.
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-650 font-semibold">
                Deleting it may affect historical records. You can mark it as Inactive instead.
              </p>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setDeleteTemplateConfirm(null)}
                  className="px-4 py-2 border border-slate-355 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold rounded-xl transition-all"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleActiveStatus(deleteTemplateConfirm);
                    setDeleteTemplateConfirm(null);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Mark Inactive
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-left font-sans">
              <p className="text-xs text-slate-750 font-medium">
                Are you sure you want to delete the diagnosis template <strong className="text-slate-900 font-bold">"{getItemText(deleteTemplateConfirm)}"</strong>?
              </p>
              <p className="text-xs text-slate-500">
                This action permanently removes the diagnosis template. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setDeleteTemplateConfirm(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold rounded-xl transition-all"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = dlist.filter(it => it._id !== deleteTemplateConfirm._id && it.id !== deleteTemplateConfirm.id);
                    saveMaster('dlist', updated);
                    toast.success('Diagnosis template deleted');
                    setDeleteTemplateConfirm(null);
                  }}
                  className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {/* Floating Template Context Menu Portal */}
      {menuAnchor && createPortal(
        <DiagnosisTemplateContextMenu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onAction={handleMenuAction}
        />,
        document.body
      )}

    </div>
  );
};

export default DoctorClinicalMasters;
