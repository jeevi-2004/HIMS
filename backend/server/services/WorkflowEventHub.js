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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const client = { id: Date.now(), res };
    this.clients.add(client);

    // Send initial connection event & recent history
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientCount: this.clients.size, timestamp: new Date().toISOString() })}\n\n`);

    req.on('close', () => {
      this.clients.delete(client);
    });
  }

  /**
   * Publishes a standardized workflow event and broadcasts to all connected SSE clients.
   */
  publish(eventType, payload = {}) {
    const eventObj = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: eventType,
      appointmentId: payload.appointmentId || payload._id || payload.id,
      tokenNumber: payload.tokenNumber || payload.token,
      doctorId: payload.doctorId,
      doctorName: payload.doctorName || (typeof payload.doctorId === 'object' ? payload.doctorId?.name : ''),
      patientId: payload.patientId,
      patientName: payload.patientName || (typeof payload.patientId === 'object' ? payload.patientId?.name : ''),
      roomNo: payload.roomNo || (typeof payload.doctorId === 'object' ? (payload.doctorId?.roomNo || payload.doctorId?.doctorProfile?.roomNo || payload.doctorId?.doctorProfile?.roomNumber) : 'Room 1'),
      departmentId: payload.departmentId,
      queueState: payload.queueState || payload.queueStatus || payload.status,
      timestamp: new Date().toISOString(),
      performedBy: payload.performedBy || 'System',
      metadata: payload.metadata || {}
    };

    // Store in history
    this.history.unshift(eventObj);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    // Emit node event
    this.emit('workflow_event', eventObj);

    // Broadcast to SSE clients
    const dataString = `data: ${JSON.stringify(eventObj)}\n\n`;
    this.clients.forEach((client) => {
      try {
        client.res.write(dataString);
      } catch (err) {
        this.clients.delete(client);
      }
    });

    console.log(`[WORKFLOW EVENT HUB] Event published: ${eventType} | Token: ${eventObj.tokenNumber || 'N/A'} | Active Clients: ${this.clients.size}`);
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
