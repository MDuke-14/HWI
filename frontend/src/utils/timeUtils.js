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

/**
 * Get current local time as ISO string with timezone offset.
 * Example: "2024-03-31T09:00:00+01:00"
 * This preserves the user's device timezone for backend storage.
 */
export const getLocalISOString = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset(); // minutes east of UTC
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(absOffset/60))}:${pad(absOffset%60)}`;
};
