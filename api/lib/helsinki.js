/** Europe/Helsinki calendar cutoffs for period filtering. */

function helsinkiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

export function helsinkiMidnightUTC(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const target = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00`;
  let lo = Date.UTC(y, m - 1, d - 1, 0, 0, 0);
  let hi = Date.UTC(y, m - 1, d + 1, 12, 0, 0);
  while (hi - lo > 500) {
    const mid = Math.floor((lo + hi) / 2);
    const p = helsinkiParts(new Date(mid));
    const key = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
    if (key >= target) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

export function startOfHelsinkiWeek(date = new Date()) {
  const map = helsinkiParts(date);
  const weekdayIndex = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[map.weekday] ?? 0;
  const noonUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), 12, 0, 0);
  const mondayNoon = new Date(noonUtc - weekdayIndex * 86400000);
  const mon = helsinkiParts(mondayNoon);
  return helsinkiMidnightUTC(mon.year, mon.month, mon.day);
}

export function startOfHelsinkiMonth(date = new Date()) {
  const map = helsinkiParts(date);
  return helsinkiMidnightUTC(map.year, map.month, 1);
}

/** @returns {number} epoch ms cutoff, or 0 for all-time */
export function periodCutoffMs(period) {
  if (period === 'week') return startOfHelsinkiWeek().getTime();
  if (period === 'month') return startOfHelsinkiMonth().getTime();
  return 0;
}
