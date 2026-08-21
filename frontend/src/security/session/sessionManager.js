import SECURITY_CONFIG from '../config/securityConfig';

class SessionManager {
  constructor() {
    this.lastActivityTime = Date.now();
  }

  touch() {
    this.lastActivityTime = Date.now();
  }

  isExpired() {
    return Date.now() - this.lastActivityTime > SECURITY_CONFIG.SESSION_TIMEOUT_MS;
  }

  clearSession() {
    localStorage.removeItem('vzh_token');
    localStorage.removeItem('vzh_user');
  }
}

export const sessionManager = new SessionManager();
export default sessionManager;
