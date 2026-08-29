import { useState, useCallback, useEffect } from 'react';

/**
 * Custom React Hook wrapper around HTML5 navigator.geolocation API
 * Captures device latitude, longitude, accuracy, and handles permission states.
 */
export const useGeolocation = (options = {}) => {
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: false,
    permissionState: 'prompt' // 'granted' | 'denied' | 'prompt'
  });

  const getCoordinates = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocation((prev) => ({
        ...prev,
        error: 'Geolocation is not supported by this browser.',
        loading: false
      }));
      return Promise.reject('Geolocation not supported');
    }

    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            error: null,
            loading: false,
            permissionState: 'granted'
          };
          setLocation(coords);
          resolve(coords);
        },
        (err) => {
          let errorMsg = 'Failed to obtain location';
          if (err.code === err.PERMISSION_DENIED) {
            errorMsg = 'Location permission denied by user/browser.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMsg = 'Location information is unavailable.';
          } else if (err.code === err.TIMEOUT) {
            errorMsg = 'Location request timed out.';
          }

          const state = {
            latitude: null,
            longitude: null,
            accuracy: null,
            error: errorMsg,
            loading: false,
            permissionState: err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt'
          };
          setLocation(state);
          reject(errorMsg);
        },
        {
          enableHighAccuracy: true,
          timeout: options.timeout || 10000,
          maximumAge: options.maximumAge || 0
        }
      );
    });
  }, [options.timeout, options.maximumAge]);

  // Check permission state if available
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setLocation((prev) => ({ ...prev, permissionState: result.state }));
        result.onchange = () => {
          setLocation((prev) => ({ ...prev, permissionState: result.state }));
        };
      }).catch(() => {});
    }
  }, []);

  return {
    ...location,
    getCoordinates
  };
};

export default useGeolocation;
