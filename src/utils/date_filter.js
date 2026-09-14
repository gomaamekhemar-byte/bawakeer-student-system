// Helper utility for Date Range Filtering (DRY Principle)

/**
 * Returns the default date range (Current Month: 1st day to last day of month)
 * or parses user-provided startDate and endDate strings (YYYY-MM-DD).
 * 
 * @param {string} queryStart - User-provided start date string
 * @param {string} queryEnd - User-provided end date string
 * @returns {{ startDate: string, endDate: string, isDefault: boolean }}
 */
function getDateRange(queryStart, queryEnd) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  // First day of current month: YYYY-MM-01
  const defaultStart = `${year}-${month}-01`;
  
  // Today's date (never in the future)
  const todayStr = `${year}-${month}-${day}`;

  const cleanStart = (queryStart || '').trim();
  const cleanEnd = (queryEnd || '').trim();

  // If both were explicitly passed as empty strings, date filter was cleared
  if (queryStart !== undefined && queryEnd !== undefined && cleanStart === '' && cleanEnd === '') {
    return {
      startDate: '',
      endDate: '',
      isDefault: false
    };
  }

  const isDefault = !cleanStart && !cleanEnd;

  let finalStart = cleanStart || (isDefault ? defaultStart : '');
  let finalEnd = cleanEnd || (isDefault ? todayStr : '');

  // Clamp future end date to today
  if (finalEnd && finalEnd > todayStr) {
    finalEnd = todayStr;
  }

  // Fail-Safe: if start > end, clamp start to end
  if (finalStart && finalEnd && finalStart > finalEnd) {
    finalStart = finalEnd;
  }

  return {
    startDate: finalStart,
    endDate: finalEnd,
    isDefault
  };
}

/**
 * Filters an array of items by a date field falling within [startDate, endDate] inclusive.
 * Handles ISO strings, timestamps, or date strings.
 * 
 * @param {Array} items - Array of records
 * @param {string} dateField - Key of the date property (e.g., 'created_at', 'timestamp')
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Array} Filtered items
 */
function filterByDateRange(items, dateField, startDate, endDate) {
  if (!Array.isArray(items)) return [];
  // Fail-Safe Fallback: if no date boundaries, bypass date filtering completely
  if (!startDate && !endDate) return items;

  // Invalid date range guard
  if (startDate && endDate && startDate > endDate) return [];

  const startBound = startDate ? new Date(`${startDate}T00:00:00.000`).getTime() : -Infinity;
  const endBound = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Infinity;

  return items.filter(item => {
    const rawVal = item[dateField];
    if (!rawVal) return false;
    const time = new Date(rawVal).getTime();
    if (isNaN(time)) return false;
    return time >= startBound && time <= endBound;
  });
}

/**
 * Checks if a given date is within [startDate, endDate] inclusive.
 * Automatically normalizes startDate to 00:00:00.000 and endDate to 23:59:59.999.
 *
 * @param {string|Date} itemDate
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {boolean}
 */
function isWithinDateRange(itemDate, startDate, endDate) {
  // Fail-Safe Fallback: if no date boundaries, accept all items
  if (!startDate && !endDate) return true;
  if (startDate && endDate && startDate > endDate) return false;
  if (!itemDate) return false;
  const time = new Date(itemDate).getTime();
  if (isNaN(time)) return false;

  const startBound = startDate ? new Date(`${startDate}T00:00:00.000`).getTime() : -Infinity;
  const endBound = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Infinity;

  return time >= startBound && time <= endBound;
}

module.exports = {
  getDateRange,
  filterByDateRange,
  isWithinDateRange
};
