/**
 * VillZone HIMS — Workflow Real-Time Synchronization Service (Phase 5)
 * SSE EventSource Subscriptions & Cross-Tab BroadcastChannel Real-Time Engine.
 */

class WorkflowRealtimeService {
  constructor() {
    this.listeners = new Set();
    this.eventSource = null;
    this.broadcastChannel = null;
    this.isConnected = false;
    this.reconnectTimer = null;

    this.initBroadcastChannel();
    this.initSSE();
  }

  initBroadcastChannel() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('villzone_workflow_events');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data) {
            this.notifyListeners(event.data);
          }
        };
      }
    } catch (err) {
      console.log('[REALTIME SERVICE] BroadcastChannel not supported:', err?.message);
    }
  }

  initSSE() {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;

    try {
      const streamUrl = '/api/workflow/events/stream';
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        console.log('[REALTIME SERVICE] Connected to Workflow SSE Stream.');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'PING') return;

          this.notifyListeners(payload);

          // Broadcast cross-tab
          if (this.broadcastChannel) {
            this.broadcastChannel.postMessage(payload);
          }
        } catch (e) {
          console.error('[REALTIME SERVICE] Error parsing SSE payload:', e);
        }
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        if (this.eventSource) {
          this.eventSource.close();
        }
        // Auto reconnect after 5s
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.initSSE();
        }, 5000);
      };
    } catch (err) {
      console.log('[REALTIME SERVICE] SSE init error:', err?.message);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  notifyListeners(eventPayload) {
    this.listeners.forEach((listener) => {
      try {
        listener(eventPayload);
      } catch (err) {
        console.error('[REALTIME SERVICE] Listener error:', err);
      }
    });
  }

  broadcastLocalEvent(eventType, payload = {}) {
    const eventObj = {
      eventId: `local_${Date.now()}`,
      type: eventType,
      appointmentId: payload._id || payload.id,
      tokenNumber: payload.tokenNumber,
      patientName: payload.patientId?.name || payload.patientName,
      doctorName: payload.doctorId?.name || payload.doctorName,
      queueState: payload.queueState || payload.queueStatus || payload.status,
      timestamp: new Date().toISOString(),
      performedBy: payload.performedBy || 'User'
    };

    this.notifyListeners(eventObj);
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(eventObj);
    }
  }
}

export const workflowRealtime = new WorkflowRealtimeService();
export default workflowRealtime;

