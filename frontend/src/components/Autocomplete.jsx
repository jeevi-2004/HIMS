import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

const Autocomplete = ({
  label,
  placeholder = 'Search...',
  suggestions = [],
  onSelect,
  displayKey = 'name',
  valueKey = '_id',
  error,
  required = false
}) => {
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    // Filter suggestions locally
    if (query.trim() === '') {
      setFiltered([]);
    } else {
      const match = suggestions.filter(item => {
        const val = item[displayKey] || '';
        return val.toLowerCase().includes(query.toLowerCase());
      });
      setFiltered(match);
    }
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

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5 w-full relative">
      {label && (
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">
          {typeof label === 'string' ? label.replace(/\s*\*+$/, '') : label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      
      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
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
              onClick={() => {
                onSelect(item);
                setQuery(item[displayKey]);
                setShowDropdown(false);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold hover:text-primary transition-colors border-b border-slate-50 last:border-b-0"
            >
              {item[displayKey]}
            </button>
          ))}
          {filtered.length === 0 && (
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
