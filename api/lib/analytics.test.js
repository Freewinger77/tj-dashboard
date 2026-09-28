import test from 'node:test';
import assert from 'node:assert/strict';
import { countDeliveredMessages, reactivationRate, trackedBookingRate } from './booking-rate.js';

const eligible = new Set(['358401234567']);
const messages = [
  { id: 1, number: '+358 40 123 4567', status: 'delivered', sent_at: '2026-09-01T08:00:00Z' },
  { id: 2, number: '0401234567', status: 'read', sent_at: '2026-09-02T08:00:00Z' },
  { id: 3, number: '358401234567', status: 'sent', sent_at: '2026-09-02T08:00:00Z' },
  { id: 4, number: '358409999999', status: 'delivered', sent_at: '2026-09-02T08:00:00Z' },
];

test('delivered message denominator includes reads but excludes sent and unrelated phones', () => {
  assert.equal(countDeliveredMessages(messages, eligible), 2);
});

test('period denominator uses message sent date and stable row IDs', () => {
  assert.equal(countDeliveredMessages(messages, eligible, Date.parse('2026-09-02T00:00:00Z')), 1);
  assert.equal(countDeliveredMessages([...messages, messages[1]], eligible), 2);
});

test('overall tracked booking percentage uses delivered message rows', () => {
  assert.equal(trackedBookingRate(483, 1688), 28.6);
  assert.equal(trackedBookingRate(0, 0), null);
});

test('reactivation counts distinct booked contacts over delivered contacts, not messages', () => {
  assert.equal(reactivationRate(400, 1374), 29.1);
  assert.equal(reactivationRate(0, 0), null);
});
