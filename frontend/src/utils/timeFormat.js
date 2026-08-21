/**
 * Converts a 24-hour time string (HH:MM) to 12-hour format with AM/PM.
 * E.g., '14:30' -> '02:30 PM', '10:00' -> '10:00 AM'
 */
export const formatTimeTo12Hr = (timeString) => {
  if (!timeString) return '';
  // Check if it's already in 12-hour format
  if (timeString.toLowerCase().includes('am') || timeString.toLowerCase().includes('pm')) {
    return timeString;
  }
  const parts = timeString.split(':');
  if (parts.length < 2) return timeString;
  const hourStr = parts[0];
  const minStr = parts[1];
  let hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return timeString;
  const min = minStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12; // the hour '0' should be '12'
  return `${hour.toString().padStart(2, '0')}:${min} ${ampm}`;
};

/**
 * Converts a 12-hour time string (HH:MM AM/PM) to 24-hour format (HH:MM).
 * E.g., '10:00 AM' -> '10:00', '02:30 PM' -> '14:30'
 */
export const formatTimeTo24Hr = (timeString) => {
  if (!timeString) return '10:00';
  // Check if it's already in 24-hour format
  if (!timeString.toLowerCase().includes('am') && !timeString.toLowerCase().includes('pm')) {
    return timeString;
  }
  const match = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '10:00';
  let [_, hourStr, minStr, ampm] = match;
  let hour = parseInt(hourStr, 10);
  if (ampm.toUpperCase() === 'PM' && hour < 12) {
    hour += 12;
  } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
    hour = 0;
  }
  return `${hour.toString().padStart(2, '0')}:${minStr}`;
};
