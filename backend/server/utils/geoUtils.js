/**
 * Geospatial Utility Functions
 * Uses the Haversine formula to compute great-circle distance between two GPS coordinates in meters.
 */

/**
 * Calculates distance in meters between two (lat, lon) coordinates using Haversine formula.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in meters
 */
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return Infinity;
  }

  const R = 6371000; // Earth's mean radius in meters
  const toRad = (angle) => (angle * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  return Math.round(distance);
};

/**
 * Checks if client coordinates fall within hospital geofence radius.
 * @param {number} userLat Client Latitude
 * @param {number} userLng Client Longitude
 * @param {number} hospLat Registered Hospital Latitude
 * @param {number} hospLng Registered Hospital Longitude
 * @param {number} radiusMeters Allowed Geofence Radius in meters
 * @returns {{ isWithin: boolean, distanceMeters: number }}
 */
const isWithinGeofence = (userLat, userLng, hospLat, hospLng, radiusMeters = 300) => {
  const distanceMeters = calculateHaversineDistance(userLat, userLng, hospLat, hospLng);
  return {
    isWithin: distanceMeters <= radiusMeters,
    distanceMeters
  };
};

module.exports = {
  calculateHaversineDistance,
  isWithinGeofence
};
