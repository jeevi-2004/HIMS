import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

const EMPTY_SUGGESTIONS = [];

const Autocomplete = ({
  label,
  placeholder = 'Search...',
  suggestions = EMPTY_SUGGESTIONS,
  onSelect,
  displayKey = 'name',
  valueKey = '_id',
  error,
  required = false,
  fetchOptions,
  value,
  icon: IconProp = Search,
  transformInput
}) => {
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const isSelectingRef = useRef(false);
  const fetchOptionsRef = useRef(fetchOptions);

  useEffect(() => {
    fetchOptionsRef.current = fetchOptions;
  }, [fetchOptions]);

  // Sync external value changes (e.g. modal reset or pre-selected patient)
  useEffect(() => {
    if (!value) {
      setQuery((prev) => (prev === '' ? prev : ''));
      setFiltered((prev) => (prev.length === 0 ? prev : []));
      setLoading((prev) => (prev ? false : prev));
    } else {
      const text = typeof value === 'object' ? (value[displayKey] || value.name || '') : String(value);
      setQuery((prev) => {
        if (prev !== text) {
          isSelectingRef.current = true;
          return text;
        }
        return prev;
      });
      setLoading(false);
    }
  }, [value, displayKey]);

  useEffect(() => {
    // If query updated due to user selecting an item or external value sync, do not trigger fetch
    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      setLoading(false);
      return;
    }

    if (!fetchOptionsRef.current) {
      // Filter static suggestions locally
      if (query.trim() === '') {
        setFiltered((prev) => (prev.length === 0 ? prev : []));
      } else {
        const match = suggestions.filter(item => {
          const val = item[displayKey] || '';
          return val.toLowerCase().includes(query.toLowerCase());
        });
        setFiltered(match);
      }
      setLoading(false);
      return;
    }

    if (query.trim() === '') {
      setFiltered((prev) => (prev.length === 0 ? prev : []));
      setLoading((prev) => (prev ? false : prev));
      return;
    }

    // Only show loading spinner while actively searching
    let active = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await fetchOptionsRef.current(query);
        if (active) {
          setFiltered(results || []);
        }
      } catch (err) {
        console.error('Autocomplete fetch error:', err);
        if (active) setFiltered([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, suggestions, displayKey]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  const handleItemSelect = (item) => {
    isSelectingRef.current = true;
    setLoading(false);
    setShowDropdown(false);
    setQuery(item[displayKey] || item.name || '');
    if (onSelect) onSelect(item);
  };

  const IconComponent = IconProp || Search;

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5 w-full relative">
      {label && (
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">
          {typeof label === 'string' ? label.replace(/\s*\*+$/, '') : label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      
      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#2F63F2]" />
          ) : (
            <IconComponent className="w-4 h-4 text-slate-400" />
          )}
        </div>
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            isSelectingRef.current = false;
            const raw = e.target.value;
            const nextVal = transformInput ? transformInput(raw) : raw;
            setQuery(nextVal);
            setShowDropdown(true);
          }}
          onFocus={() => {
            if (query.trim().length > 0) {
              setShowDropdown(true);
            }
          }}
          className={`enterprise-input w-full !pl-10 ${
            error ? 'border-rose-500 focus:ring-rose-500/20' : ''
          }`}
        />
      </div>

      {showDropdown && query.length > 0 && (
        <div className="absolute top-16 left-0 right-0 max-h-48 overflow-y-auto bg-white border border-slate-100 rounded-xl shadow-dropdown z-50 py-1.5">
          {filtered.map((item, idx) => (
            <button
              key={item[valueKey] || idx}
              type="button"
              onClick={() => handleItemSelect(item)}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold hover:text-primary transition-colors border-b border-slate-50 last:border-b-0"
            >
              {item.label || item[displayKey] || item.name}
            </button>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="px-4 py-2.5 text-xs text-slate-400 font-medium text-center">
              No results found
            </div>
          )}
        </div>
      )}
      
      {error && <span className="text-xs text-rose-500 pl-1 mt-0.5">{error}</span>}
    </div>
  );
};

export default Autocomplete;

