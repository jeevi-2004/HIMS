import SECURITY_CONFIG from '../config/securityConfig';
import sessionManager from './sessionManager';

class IdleTimeoutManager {
  constructor() {
    this.timer = null;
    this.onTimeoutCallback = null;
  }

  init(onTimeout) {
    this.onTimeoutCallback = onTimeout;
    const events = ['mousemove', 'keydown', 'click', 'scroll'];

    events.forEach((evt) => {
      window.addEventListener(evt, () => this.resetTimer(), { passive: true });
    });

    this.resetTimer();
  }

  resetTimer() {
    sessionManager.touch();
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      if (this.onTimeoutCallback) {
        this.onTimeoutCallback();
      }
    }, SECURITY_CONFIG.IDLE_TIMEOUT_MS);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
}

export const idleTimeout = new IdleTimeoutManager();
export default idleTimeout;
