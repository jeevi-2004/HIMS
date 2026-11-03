/**
 * Utility functions for OPD Queue calculation, grouping, and emergency sorting
 */

export const filterQueueByDate = (queue = [], fromDate, toDate) => {
  if (!fromDate && !toDate) return queue;
  return queue.filter((item) => {
    const itemDate = item.appointmentDate || item.date || item.createdAt;
    if (!itemDate) return true;
    const formatted = new Date(itemDate).toISOString().split('T')[0];
    if (fromDate && formatted < fromDate) return false;
    if (toDate && formatted > toDate) return false;
    return true;
  });
};

export const sortEmergencyPriorityFirst = (queue = [], enableEmergency = true) => {
  if (!enableEmergency) return queue;
  return [...queue].sort((a, b) => {
    const aIsEmg = a.isEmergency || a.priorityLevel === 'EMERGENCY' || a.priority === 'EMERGENCY' || String(a.tokenNumber || '').startsWith('EMG');
    const bIsEmg = b.isEmergency || b.priorityLevel === 'EMERGENCY' || b.priority === 'EMERGENCY' || String(b.tokenNumber || '').startsWith('EMG');
    if (aIsEmg && !bIsEmg) return -1;
    if (!aIsEmg && bIsEmg) return 1;
    return String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || ''), undefined, { numeric: true });
  });
};

export const groupQueueByDate = (queue = []) => {
  const groups = {};
  queue.forEach((item) => {
    const rawDate = item.appointmentDate || item.date || item.createdAt;
    const dateKey = rawDate ? new Date(rawDate).toISOString().split('T')[0] : 'Unknown';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });
  return groups;
};
