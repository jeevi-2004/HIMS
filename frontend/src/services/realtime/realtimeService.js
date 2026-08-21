import eventBus from './eventBus';

class RealtimeService {
  constructor() {
    this.connected = false;
  }

  connect() {
    this.connected = true;
  }

  disconnect() {
    this.connected = false;
  }

  subscribe(event, callback) {
    return eventBus.subscribe(event, callback);
  }

  emit(event, data) {
    eventBus.publish(event, data);
  }
}

export const realtimeService = new RealtimeService();
export default realtimeService;
