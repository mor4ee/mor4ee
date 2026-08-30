// Reproducible synthetic snapshots, never account activity.
const start = Date.UTC(2026, 0, 1);
const fullDays = Array.from({length:365}, (_, index) => ({
  date:new Date(start + index * 86400000).toISOString().slice(0,10),
  count:index % 5 === 0 ? 0 : (index * 13 + Math.floor(index / 7) * 3) % 23,
}));
export const calendarYearDemo = {schemaVersion:1, source:'demo', year:2026,
  asOfDate:'2026-12-31', days:fullDays};
export const calendarPartialDemo = {...calendarYearDemo, asOfDate:'2026-08-30',
  days:fullDays.filter(day => day.date <= '2026-08-30'
    && !['2026-07-17','2026-07-18','2026-07-19'].includes(day.date))};
