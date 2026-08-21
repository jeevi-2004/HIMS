import { useEffect } from 'react';
import realtimeService from '../../services/realtime/realtimeService';

export const useRealtime = (event, callback) => {
  useEffect(() => {
    if (!event || !callback) return;
    const unsubscribe = realtimeService.subscribe(event, callback);
    return () => {
      unsubscribe();
    };
  }, [event, callback]);
};

export default useRealtime;
