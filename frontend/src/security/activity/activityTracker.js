import SECURITY_CONFIG from '../config/securityConfig';

class ActivityTracker {
  constructor() {
    this.activities = [];
  }

  track(actionName, meta = {}) {
    if (!SECURITY_CONFIG.ACTIVITY_TRACKING_ENABLED) return;

    this.activities.push({
      action: actionName,
      timestamp: new Date().toISOString(),
      meta
    });
  }

  getActivities() {
    return [...this.activities];
  }
}

export const activityTracker = new ActivityTracker();
export default activityTracker;
