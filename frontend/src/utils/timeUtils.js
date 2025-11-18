/**
 * Convert decimal hours to HH:MM format
 * @param {number} decimalHours - Hours in decimal format (e.g., 8.5)
 * @returns {string} - Formatted time string (e.g., "8h30")
 */
export const formatHours = (decimalHours) => {
  if (!decimalHours || decimalHours === 0) return '0h00';
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return minutes > 0 ? `${hours}h${minutes.toString().padStart(2, '0')}` : `${hours}h00`;
};

/**
 * Convert decimal hours to hours and minutes object
 * @param {number} decimalHours - Hours in decimal format
 * @returns {object} - {hours: number, minutes: number}
 */
export const decimalToHoursMinutes = (decimalHours) => {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return { hours, minutes };
};
