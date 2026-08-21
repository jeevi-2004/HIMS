/**
 * VillZone HIMS — Doctor In-Memory Presence Service
 * Holds live Doctor Online/Offline presence state in Node.js server RAM.
 * Zero database persistence.
 */

class DoctorPresenceService {
  constructor() {
    // Map storing doctorId -> { isOnline: boolean, updatedTime: string }
    this.presenceMap = new Map();
  }

  setPresence(doctorId, isOnline) {
    if (!doctorId) return null;
    const cleanId = String(doctorId);
    const data = {
      doctorId: cleanId,
      isOnline: Boolean(isOnline),
      updatedTime: new Date().toISOString()
    };
    this.presenceMap.set(cleanId, data);
    return data;
  }

  isOnline(doctorId) {
    if (!doctorId) return false;
    const cleanId = String(doctorId);
    const data = this.presenceMap.get(cleanId);
    return data ? data.isOnline : false;
  }

  getAllPresence() {
    const result = {};
    for (const [key, value] of this.presenceMap.entries()) {
      result[key] = value.isOnline;
    }
    return result;
  }
}

const doctorPresenceService = new DoctorPresenceService();
module.exports = doctorPresenceService;
