import SECURITY_CONFIG from '../config/securityConfig';
import AUDIT_EVENTS from './auditEvents';

class AuditLogger {
  constructor() {
    this.logs = [];
  }

  log(eventType, payload = {}) {
    if (!SECURITY_CONFIG.AUDIT_ENABLED) return;

    const event = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      eventType,
      timestamp: new Date().toISOString(),
      payload
    };

    this.logs.push(event);
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[AuditLogger] Event: ${eventType}`, event);
    }
  }

  getLogs() {
    return [...this.logs];
  }
}

export const auditLogger = new AuditLogger();
export default auditLogger;
