function normalizePhone(value) {
  let phone = String(value || '').replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = `358${phone.slice(1)}`;
  return phone;
}

/** Distinct delivered message rows (read receipts are delivered), in a sent-date cohort. */
export function countDeliveredMessages(statuses, eligibleNumbers, cutoff = 0) {
  return new Set(statuses.filter((status) => {
    if (!['delivered', 'read'].includes(String(status.status || '').toLowerCase())) return false;
    if (!eligibleNumbers.has(normalizePhone(status.number))) return false;
    if (!cutoff) return true;
    const sentMs = Date.parse(status.sent_at || '');
    return Number.isFinite(sentMs) && sentMs >= cutoff;
  }).map((status) => status.id)).size;
}

export function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator * 1000) / denominator) / 10;
}

export function trackedBookingRate(bookings, deliveredMessages) {
  return deliveredMessages > 0 ? percent(bookings, deliveredMessages) : null;
}
