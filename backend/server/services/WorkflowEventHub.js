/**
 * VillZone HIMS — Workflow Event Hub (Phase 5)
 * Server-Side SSE Event Broadcast Service & Heartbeat Manager.
 */

const { EventEmitter } = require('events');

class WorkflowEventHubService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(250);
    this.clients = new Set();
    this.history = [];
    this.maxHistory = 100;

    // Heartbeat every 25 seconds to keep SSE connections alive
    setInterval(() => {
      this.broadcastHeartbeat();
    }, 25000);
  }

  /**
   * Adds an SSE client connection.
   */
  addClient(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const client = { 
      id: Date.now(), 
      res,
      hospitalId: String(req.query?.hospitalId || req.headers?.['x-hospital-id'] || '')
    };
    this.clients.add(client);

    const cleanup = () => {
      this.clients.delete(client);
    };

    req.on('close', cleanup);
    req.on('end', cleanup);
    req.on('error', (err) => {
      // Prevent uncaught ECONNRESET / EPIPE socket aborts from crashing Node process
      cleanup();
    });
    res.on('error', (err) => {
      // Prevent uncaught socket write errors from crashing Node process
      cleanup();
    });

    try {
      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientCount: this.clients.size, timestamp: new Date().toISOString() })}\n\n`);
    } catch (_) {
      cleanup();
    }
  }

  /**
   * Publishes a standardized workflow event and broadcasts to all connected SSE clients.
   */
  publish(eventType, payload = {}) {
    // Deduplication check for voice calling events: prevent rapid duplicate triggers within 3.5 seconds
    if (eventType === 'TriggerVoiceCall') {
      const token = String(payload.tokenNumber || payload.token || '').trim();
      const patId = String(typeof payload.patientId === 'object' ? payload.patientId?._id : payload.patientId || '').trim();
      const hospId = String(payload.hospitalId || '').trim();
      const dedupeKey = `${hospId}_${token}_${patId}`;
      const now = Date.now();
      if (this.lastVoiceCallKey === dedupeKey && (now - (this.lastVoiceCallTime || 0)) < 3500) {
        console.log(`[WORKFLOW EVENT HUB] Duplicate TriggerVoiceCall suppressed within 3500ms for: ${dedupeKey}`);
        return null;
      }
      this.lastVoiceCallKey = dedupeKey;
      this.lastVoiceCallTime = now;
    }

    const eventObj = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: eventType,
      appointmentId: payload.appointmentId || payload._id || payload.id,
      tokenNumber: payload.tokenNumber || payload.token,
      doctorId: typeof payload.doctorId === 'object' && payload.doctorId?._id ? String(payload.doctorId._id) : (payload.doctorId ? String(payload.doctorId) : undefined),
      doctorName: payload.doctorName || (typeof payload.doctorId === 'object' ? payload.doctorId?.name : ''),
      patientId: payload.patientId,
      patientName: payload.patientName || (typeof payload.patientId === 'object' ? payload.patientId?.name : ''),
      roomNo: payload.roomNo || (typeof payload.doctorId === 'object' ? (payload.doctorId?.roomNo || payload.doctorId?.doctorProfile?.roomNo || payload.doctorId?.doctorProfile?.roomNumber) : 'Room 1'),
      departmentId: payload.departmentId,
      hospitalId: payload.hospitalId ? String(payload.hospitalId) : undefined,
      queueState: payload.queueState || payload.queueStatus || payload.status,
      isOnline: payload.isOnline !== undefined ? Boolean(payload.isOnline) : undefined,
      timestamp: new Date().toISOString(),
      performedBy: payload.performedBy || 'System',
      metadata: payload.metadata || {},
      ...payload
    };

    if (eventObj.doctorId) {
      eventObj.doctorId = String(eventObj.doctorId);
    }
    if (payload.isOnline !== undefined) {
      eventObj.isOnline = Boolean(payload.isOnline);
    }
    if (eventObj.hospitalId) {
      eventObj.hospitalId = String(eventObj.hospitalId);
    }

    // Store in history
    this.history.unshift(eventObj);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    // Emit node event
    this.emit('workflow_event', eventObj);

    // Broadcast to SSE clients matching hospitalId (or broadcast if not scoped)
    const targetHospitalId = String(eventObj.hospitalId || '');
    const dataString = `data: ${JSON.stringify(eventObj)}\n\n`;
    this.clients.forEach((client) => {
      if (targetHospitalId && client.hospitalId && targetHospitalId !== client.hospitalId) {
        return;
      }
      try {
        client.res.write(dataString);
      } catch (err) {
        this.clients.delete(client);
      }
    });

    console.log(`[WORKFLOW EVENT HUB] Event published: ${eventType} | Token: ${eventObj.tokenNumber || 'N/A'} | Hospital: ${eventObj.hospitalId || 'All'} | Active Clients: ${this.clients.size}`);
    return eventObj;
  }

  broadcastHeartbeat() {
    const ping = `data: ${JSON.stringify({ type: 'PING', timestamp: new Date().toISOString() })}\n\n`;
    this.clients.forEach((client) => {
      try {
        client.res.write(ping);
      } catch (err) {
        this.clients.delete(client);
      }
    });
  }

  getEventHistory() {
    return this.history;
  }
}

const WorkflowEventHub = new WorkflowEventHubService();
module.exports = WorkflowEventHub;
