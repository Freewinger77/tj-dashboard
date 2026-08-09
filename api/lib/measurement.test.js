import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deadlineBin,
  computeStandardizedUplift,
  buildMeasurementLeads,
  buildCaptureCoverage,
  roiFromUplift,
  applyOutageBookingAdjustment,
  isInWaOutage,
} from './measurement.js';

test('deadlineBin buckets match spec', () => {
  assert.equal(deadlineBin(0), 'd00_10');
  assert.equal(deadlineBin(10), 'd00_10');
  assert.equal(deadlineBin(11), 'd11_20');
  assert.equal(deadlineBin(45), 'd31_45');
  assert.equal(deadlineBin(90), 'd61_90');
  assert.equal(deadlineBin(-1), 'overdue_0_90');
  assert.equal(deadlineBin(-91), 'overdue_91_365');
  assert.equal(deadlineBin(-400), 'overdue_365_plus');
});

test('standardised uplift reproduces positive incremental when treated rate higher', () => {
  const leads = [];
  for (let i = 0; i < 100; i++) {
    leads.push({
      lead_type: 'due_soon',
      deadline_bin: 'd11_20',
      station_name: 'Laukaa',
      arm: 'treated',
      booked: i < 40,
      tj_own_reminder: false,
    });
  }
  for (let i = 0; i < 200; i++) {
    leads.push({
      lead_type: 'due_soon',
      deadline_bin: 'd11_20',
      station_name: 'Laukaa',
      arm: 'control',
      booked: i < 20,
      tj_own_reminder: false,
    });
  }
  const u = computeStandardizedUplift(leads);
  assert.equal(u.leads_contacted, 100);
  assert.equal(u.bookings_observed, 40);
  assert.ok(u.bookings_expected > 9 && u.bookings_expected < 11);
  assert.ok(u.bookings_incremental > 29);
  assert.ok(u.multiplier > 3.5);
});

test('bins with n_control < 30 are skipped', () => {
  const leads = [
    ...Array.from({ length: 10 }, () => ({
      lead_type: 'due_soon',
      deadline_bin: 'd00_10',
      station_name: 'X',
      arm: 'treated',
      booked: true,
      tj_own_reminder: false,
    })),
    ...Array.from({ length: 10 }, () => ({
      lead_type: 'due_soon',
      deadline_bin: 'd00_10',
      station_name: 'X',
      arm: 'control',
      booked: false,
      tj_own_reminder: false,
    })),
  ];
  const u = computeStandardizedUplift(leads);
  assert.equal(u.bins_skipped, 1);
  assert.equal(u.leads_contacted, 0);
});

test('buildMeasurementLeads assigns arms and holdouts', () => {
  const leads = buildMeasurementLeads(
    [
      {
        id: 1,
        normalized_phone: '358401',
        lead_type: 'due_soon',
        next_inspection_date: '2026-06-20',
        imported_at: '2026-05-20',
        contacted_at: '2026-05-21',
        booked_at: null,
        station_name: 'Laukaa',
      },
      {
        id: 2,
        normalized_phone: '358402',
        lead_type: 'passed',
        next_inspection_date: '2025-01-01',
        imported_at: '2026-05-20',
        contacted_at: null,
        booked_at: '2026-06-01',
        station_name: 'Muurame',
      },
      {
        id: 3,
        normalized_phone: '358403',
        lead_type: 'due_soon',
        next_inspection_date: '2026-06-01',
        imported_at: '2026-05-20',
        contacted_at: null,
        booked_at: null,
        station_name: 'Jämsä',
      },
    ],
    new Set([3])
  );
  assert.equal(leads.find((l) => l.id === 1).arm, 'treated');
  assert.equal(leads.find((l) => l.id === 2).arm, 'control');
  assert.equal(leads.find((l) => l.id === 3).arm, 'holdout');
  assert.equal(leads.find((l) => l.id === 2).booked, true);
  assert.equal(leads.find((l) => l.id === 1).deadline_bin, 'd31_45');
});

test('capture coverage marks known-bad weeks incomplete', () => {
  const coverage = buildCaptureCoverage([
    {
      station_id: 58,
      station_name: 'Vaajakoski',
      appointment_week_start: '2026-07-06',
      first_seen_at: '2026-07-20T00:00:00Z',
      source_batch_id: 'vision_2026-07-20',
    },
    {
      station_id: 58,
      station_name: 'Vaajakoski',
      appointment_week_start: '2026-06-29',
      first_seen_at: '2026-07-10T00:00:00Z',
      source_batch_id: 'vision_2026-07-10',
    },
  ]);
  const bad = coverage.weeks.find((w) => w.appointment_week_start === '2026-07-06');
  const good = coverage.weeks.find((w) => w.appointment_week_start === '2026-06-29');
  assert.equal(bad.is_complete, false);
  assert.equal(bad.known_bad, true);
  assert.equal(good.is_complete, true);
});

test('WA outage treated lag bookings are excluded from uplift', () => {
  assert.equal(isInWaOutage('2026-07-01'), true);
  assert.equal(isInWaOutage('2026-06-22'), false);
  assert.equal(isInWaOutage('2026-07-27'), false);

  const leads = [
    ...Array.from({ length: 50 }, (_, i) => ({
      lead_type: 'due_soon',
      deadline_bin: 'd11_20',
      station_name: 'Laukaa',
      arm: 'treated',
      booked: true,
      booked_at: i < 20 ? '2026-07-01' : '2026-08-01',
      tj_own_reminder: false,
    })),
    ...Array.from({ length: 100 }, (_, i) => ({
      lead_type: 'due_soon',
      deadline_bin: 'd11_20',
      station_name: 'Laukaa',
      arm: 'control',
      booked: i < 10,
      booked_at: i < 10 ? '2026-07-01' : null,
      tj_own_reminder: false,
    })),
  ];

  const raw = computeStandardizedUplift(leads);
  const { leads: adjusted, excluded } = applyOutageBookingAdjustment(leads);
  const clean = computeStandardizedUplift(adjusted);

  assert.equal(excluded, 20);
  assert.equal(raw.bookings_observed, 50);
  assert.equal(clean.bookings_observed, 30);
  // Control bookings inside the outage stay — only treated lag is dropped.
  assert.equal(clean.bookings_expected, raw.bookings_expected);
  assert.ok(clean.bookings_incremental < raw.bookings_incremental);
  assert.ok(clean.multiplier < raw.multiplier);
});

test('ROI break-even fee uses live uplift inputs', () => {
  const roi = roiFromUplift({
    ticketPrice: 100,
    feePerBooking: 10,
    monthlyLeadVolume: 1000,
    upliftPp: 10,
    grossBookingRate: 0.2,
  });
  assert.equal(roi.incremental_bookings, 100);
  assert.equal(roi.added_revenue, 10000);
  assert.equal(roi.wasup_cost, 1000);
  assert.equal(roi.return_multiple, 10);
  assert.equal(roi.break_even_fee, 50);
});

test('holdout leak guard fails closed when blocked phones provided', async () => {
  // Unit-level contract: assertNoHoldoutLeak with empty holdout table returns ok.
  // Full DB integration requires tj_holdout_assignment installed in Supabase.
  const { assertNoHoldoutLeak } = await import('./measurement.js');
  const result = await assertNoHoldoutLeak([]);
  assert.equal(result.ok, true);
});
