import { useEffect, useRef, useCallback, useState } from 'react';

const DRAFT_PREFIX = 'vzh_draft_';
const DEFAULT_EXCLUDE_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'pin',
  'adminPin',
  'oldPin',
  'securityPin',
  'token'
];

/**
 * Helper to safely sanitize form state before saving to localStorage
 * Strips security credentials and non-serializable objects like binary File/Blob
 */
const sanitizeFormData = (data, excludeKeys = DEFAULT_EXCLUDE_KEYS) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data
      .filter((item) => !(typeof window !== 'undefined' && (item instanceof File || item instanceof Blob)))
      .map((item) => sanitizeFormData(item, excludeKeys));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    // Exclude security sensitive fields
    if (excludeKeys.includes(key)) {
      continue;
    }
    // Exclude binary browser File or Blob objects
    if (typeof window !== 'undefined' && (value instanceof File || value instanceof Blob)) {
      continue;
    }
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeFormData(value, excludeKeys);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Check if the form state has any non-default, user-entered values
 */
const hasUserEnteredContent = (data) => {
  if (!data || typeof data !== 'object') return false;
  return Object.values(data).some((val) => {
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'boolean') return true;
    if (typeof val === 'number') return true;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return hasUserEnteredContent(val);
    return String(val).trim().length > 0;
  });
};

/**
 * Reusable Plain-JavaScript Form Draft Auto-Save & Restoration Hook
 * 
 * @param {string} formKey - Unique deterministic identity for this form
 * @param {object} formData - Current form state
 * @param {function} setFormData - State setter dispatch
 * @param {object} options - Configuration options
 */
export const useFormDraft = (formKey, formData, setFormData, options = {}) => {
  const {
    isEditMode = false,
    excludeKeys = DEFAULT_EXCLUDE_KEYS,
    debounceMs = 300,
    enabled = true,
    onRestored = null
  } = options;

  const storageKey = `${DRAFT_PREFIX}${formKey}`;
  const isHydratedRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Check initial draft presence
  useEffect(() => {
    if (typeof window === 'undefined' || !formKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      setHasDraft(Boolean(stored));
    } catch (e) {
      setHasDraft(false);
    }
  }, [storageKey, formKey]);

  // Hydrate / Restore draft on mount or formKey switch (Only in Create/New mode)
  useEffect(() => {
    if (!enabled || isEditMode || typeof window === 'undefined' || !formKey) return;

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const draftData = parsed && parsed.data ? parsed.data : parsed;
        if (draftData && typeof draftData === 'object' && Object.keys(draftData).length > 0) {
          if (typeof setFormData === 'function') {
            setFormData((prev) => {
              if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
                return { ...prev, ...draftData };
              }
              return draftData;
            });
          }
          if (typeof onRestored === 'function') {
            onRestored(draftData);
          }
          setHasDraft(true);
        }
      }
    } catch (err) {
      console.warn(`[useFormDraft] Failed to restore draft for key "${formKey}":`, err);
    } finally {
      isHydratedRef.current = true;
    }
  }, [formKey, storageKey, enabled, isEditMode]);

  // Auto-Save changes with debouncing (Only in Create/New mode)
  useEffect(() => {
    if (!enabled || isEditMode || typeof window === 'undefined' || !formKey) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        if (formData && hasUserEnteredContent(formData)) {
          const sanitized = sanitizeFormData(formData, excludeKeys);
          const payload = {
            data: sanitized,
            savedAt: Date.now()
          };
          localStorage.setItem(storageKey, JSON.stringify(payload));
          setHasDraft(true);
        }
      } catch (err) {
        console.warn(`[useFormDraft] Auto-save error for key "${formKey}":`, err);
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [formData, formKey, storageKey, enabled, isEditMode, debounceMs, excludeKeys]);

  // Explicit clear method (called on successful submission or discard)
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined' || !formKey) return;
    try {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
    } catch (err) {
      console.warn(`[useFormDraft] Failed to clear draft for key "${formKey}":`, err);
    }
  }, [storageKey, formKey]);

  // Read saved draft data from storage without mutating
  const getDraftData = useCallback(() => {
    if (typeof window === 'undefined' || !formKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed && parsed.data ? parsed.data : parsed;
      }
    } catch (err) {
      console.warn(`[useFormDraft] Error reading draft for key "${formKey}":`, err);
    }
    return null;
  }, [storageKey, formKey]);

  // Explicit restore trigger
  const restoreDraft = useCallback(() => {
    const draftData = getDraftData();
    if (draftData && typeof draftData === 'object' && Object.keys(draftData).length > 0) {
      if (typeof setFormData === 'function') {
        setFormData((prev) => {
          if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
            return { ...prev, ...draftData };
          }
          return draftData;
        });
      }
      if (typeof onRestored === 'function') {
        onRestored(draftData);
      }
      setHasDraft(true);
      return draftData;
    }
    return null;
  }, [getDraftData, setFormData, onRestored]);

  // Manual save trigger
  const saveDraft = useCallback(() => {
    if (typeof window === 'undefined' || !formKey || isEditMode) return;
    try {
      if (formData) {
        const sanitized = sanitizeFormData(formData, excludeKeys);
        localStorage.setItem(storageKey, JSON.stringify({ data: sanitized, savedAt: Date.now() }));
        setHasDraft(true);
      }
    } catch (err) {
      console.warn(`[useFormDraft] Manual save error for key "${formKey}":`, err);
    }
  }, [formData, formKey, storageKey, isEditMode, excludeKeys]);

  return {
    clearDraft,
    saveDraft,
    restoreDraft,
    getDraftData,
    hasDraft
  };
};

export default useFormDraft;
