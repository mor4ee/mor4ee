// Transport-independent calendar model. No API requests, credentials or rendering.
// github-profile is enabled for approved date/count-only snapshots.
const DAY = 86400000;
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected YYYY-MM-DD');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
  return time;
}
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Unexpected calendar fields');
}

export function calendarModel(input) {
  exactKeys(input, ['schemaVersion', 'source', 'year', 'asOfDate', 'days']);
  if (input.schemaVersion !== 1 || !['demo', 'github-profile'].includes(input.source)) throw new Error('Unsupported calendar snapshot source');
  if (!Number.isInteger(input.year) || input.year < 1970 || input.year > 9998) throw new Error('Invalid calendar year');
  if (!Array.isArray(input.days)) throw new Error('Expected daily records');
  const start = dateValue(`${input.year}-01-01`);
  const end = dateValue(`${input.year}-12-31`);
  const asOf = dateValue(input.asOfDate);
  if (asOf < start) throw new Error('Snapshot precedes the calendar year');
  const records = new Map();
  let knownTotal = 0;
  for (const record of input.days) {
    exactKeys(record, ['date', 'count']);
    const time = dateValue(record.date);
    if (time < start || time > end || time > asOf) throw new Error('Record outside snapshot range');
    if (records.has(record.date)) throw new Error('Duplicate calendar date');
    if (!Number.isSafeInteger(record.count) || record.count < 0) throw new Error('Expected non-negative integer count');
    knownTotal += record.count;
    if (!Number.isSafeInteger(knownTotal)) throw new Error('Calendar total exceeds safe integer range');
    records.set(record.date, record.count);
  }
  const offset = new Date(start).getUTCDay();
  const days = [];
  for (let time = start, index = 0; time <= end; time += DAY, index++) {
    const date = new Date(time).toISOString().slice(0, 10);
    const state = time > asOf ? 'future' : records.has(date) ? 'known' : 'unknown';
    days.push({date, count: state === 'known' ? records.get(date) : null,
      state, column: Math.floor((index + offset) / 7), row: (index + offset) % 7});
  }
  const unknownDays = days.filter(day => day.state === 'unknown').length;
  return {schemaVersion: 1, source: input.source, year: input.year, asOfDate: input.asOfDate,
    days, columns: days.at(-1).column + 1, knownTotal,
    total: unknownDays === 0 ? knownTotal : null,
    coverage: {known: records.size, unknown: unknownDays,
      future: days.filter(day => day.state === 'future').length}};
}
