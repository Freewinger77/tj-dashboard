/** Europe/Helsinki calendar helpers — cutoffs are real Helsinki midnights (UTC instants). */

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

/** UTC instant for 00:00:00 on the given Helsinki calendar day (YYYY, MM, DD strings/numbers). */
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
  // Noon UTC on Helsinki calendar day, step back to Monday, then Helsinki midnight
  const noonUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), 12, 0, 0);
  const mondayNoon = new Date(noonUtc - weekdayIndex * 86400000);
  const mon = helsinkiParts(mondayNoon);
  return helsinkiMidnightUTC(mon.year, mon.month, mon.day);
}

export function startOfHelsinkiMonth(date = new Date()) {
  const map = helsinkiParts(date);
  return helsinkiMidnightUTC(map.year, map.month, 1);
}

export function formatHelsinkiDate(date, opts = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Helsinki',
    ...opts,
  }).format(date instanceof Date ? date : new Date(date));
}

/** True when capture/booking data is older than `days` (default 7). */
export function isCaptureStale(throughTs, days = 7) {
  if (throughTs == null || !Number.isFinite(Number(throughTs))) return false;
  return Date.now() - Number(throughTs) >= days * 86400000;
}
