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
  
  // First day of current month: YYYY-MM-01
  const defaultStart = `${year}-${month}-01`;
  
  // Last day of current month
  const lastDayNum = new Date(year, now.getMonth() + 1, 0).getDate();
  const defaultEnd = `${year}-${month}-${String(lastDayNum).padStart(2, '0')}`;

  const cleanStart = (queryStart || '').trim();
  const cleanEnd = (queryEnd || '').trim();

  const isDefault = !cleanStart && !cleanEnd;

  return {
    startDate: cleanStart || defaultStart,
    endDate: cleanEnd || defaultEnd,
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
  if (!startDate && !endDate) return items;

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

module.exports = {
  getDateRange,
  filterByDateRange
};
