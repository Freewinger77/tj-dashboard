import { supabase, fetchAll } from './supabase.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_CONTROL = 30;
const BOOTSTRAP_SAMPLES = 1000;
const STALE_CAPTURE_DAYS = 10;

const KNOWN_BAD_WEEKS = new Set(['2026-07-06', '2026-07-13']);

let cache = { at: 0, payload: null, promise: null };

function parseDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export function deadlineBin(days) {
  if (days == null || Number.isNaN(days)) return null;
  if (days >= 0 && days <= 10) return 'd00_10';
  if (days >= 11 && days <= 20) return 'd11_20';
  if (days >= 21 && days <= 30) return 'd21_30';
  if (days >= 31 && days <= 45) return 'd31_45';
  if (days >= 46 && days <= 60) return 'd46_60';
  if (days >= 61 && days <= 90) return 'd61_90';
  if (days >= -90 && days <= -1) return 'overdue_0_90';
  if (days >= -365 && days <= -91) return 'overdue_91_365';
  if (days < -365) return 'overdue_365_plus';
  return null;
}

function addDaysIso(iso, days) {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

async function tableExists(name) {
  const { error } = await supabase.from(name).select('*').limit(1);
  if (!error) return true;
  const msg = error.message || '';
  if (error.code === '42P01' || /does not exist|Could not find the table/i.test(msg)) return false;
  // Other errors: treat as existing but failing
  return true;
}

async function loadHoldoutIds() {
  const exists = await tableExists('tj_holdout_assignment');
  if (!exists) return { exists: false, ids: new Set() };
  try {
    const rows = await fetchAll(() =>
      supabase.from('tj_holdout_assignment').select('lead_id').order('lead_id', { ascending: true })
    );
    return { exists: true, ids: new Set(rows.map((r) => r.lead_id)) };
  } catch (err) {
    console.warn('[measurement] holdout load failed', err.message);
    return { exists: false, ids: new Set() };
  }
}

async function loadLeads() {
  return fetchAll(() =>
    supabase
      .from('tj_csv_leads')
      .select(
        [
          'id',
          'station_id',
          'station_name',
          'lead_type',
          'normalized_phone',
          'contacted_at',
          'booked_at',
          'next_inspection_date',
          'imported_at',
          'reminder_sms_at',
          'reminder_email_at',
          'registration',
        ].join(',')
      )
      .in('lead_type', ['due_soon', 'passed'])
      .neq('normalized_phone', '')
      .order('id', { ascending: true })
  );
}

async function loadSnapshots() {
  return fetchAll(() =>
    supabase
      .from('tj_booking_snapshots')
      .select(
        'station_id,station_name,appointment_week_start,first_seen_at,source_batch_id,source,reg'
      )
      .order('id', { ascending: true })
  );
}

async function loadOpsSignals() {
  const [sessions, statuses] = await Promise.all([
    fetchAll(() =>
      supabase
        .from('tj_outbound_sessions')
        .select(
          'id,number,stop_reminders,stop_reason,reminder_stage,next_reminder_at,last_outbound_at,last_inbound_at,station_id,campaign_type'
        )
        .order('id', { ascending: true })
    ),
    fetchAll(() =>
      supabase
        .from('tj_message_status')
        .select('id,number,status,stage,sent_at')
        .order('id', { ascending: true })
    ),
  ]);
  return { sessions, statuses };
}

export function buildCaptureCoverage(snapshots) {
  const map = new Map();
  let lastCaptureAt = null;

  for (const s of snapshots) {
    const week = parseDate(s.appointment_week_start);
    const sid = s.station_id;
    if (!week || sid == null) continue;
    const key = `${sid}|${week}`;
    const seen = parseDate(s.first_seen_at) || (s.first_seen_at ? String(s.first_seen_at).slice(0, 10) : null);
    const seenFull = s.first_seen_at ? new Date(s.first_seen_at) : null;
    if (seenFull && (!lastCaptureAt || seenFull > lastCaptureAt)) lastCaptureAt = seenFull;

    let row = map.get(key);
    if (!row) {
      row = {
        station_id: sid,
        station_name: s.station_name || null,
        appointment_week_start: week,
        rows_captured: 0,
        first_capture: seen,
        last_capture: seen,
        batches: new Set(),
      };
      map.set(key, row);
    }
    row.rows_captured += 1;
    if (s.source_batch_id || s.source) row.batches.add(s.source_batch_id || s.source);
    if (seen) {
      if (!row.first_capture || seen < row.first_capture) row.first_capture = seen;
      if (!row.last_capture || seen > row.last_capture) row.last_capture = seen;
    }
  }

  const weeks = [...map.values()]
    .map((row) => {
      const weekEnd = addDaysIso(row.appointment_week_start, 6);
      const knownBad = KNOWN_BAD_WEEKS.has(row.appointment_week_start);
      // Partial station coverage for 2026-07-20: only Vaajakoski/Laukaa in spec
      const partialBad =
        row.appointment_week_start === '2026-07-20' &&
        !['Vaajakoski', 'Laukaa'].includes(row.station_name);
      const is_complete =
        !knownBad &&
        !partialBad &&
        !!row.last_capture &&
        row.last_capture >= weekEnd;
      return {
        station_id: row.station_id,
        station_name: row.station_name,
        appointment_week_start: row.appointment_week_start,
        rows_captured: row.rows_captured,
        first_capture: row.first_capture,
        last_capture: row.last_capture,
        capture_runs: row.batches.size,
        is_complete,
        known_bad: knownBad || partialBad,
      };
    })
    .sort((a, b) =>
      a.appointment_week_start === b.appointment_week_start
        ? a.station_id - b.station_id
        : a.appointment_week_start.localeCompare(b.appointment_week_start)
    );

  const incomplete = weeks.filter((w) => !w.is_complete);
  return {
    weeks,
    incomplete_count: incomplete.length,
    complete_count: weeks.length - incomplete.length,
    last_capture_at: lastCaptureAt ? lastCaptureAt.toISOString() : null,
    days_since_capture: lastCaptureAt
      ? Math.floor((Date.now() - lastCaptureAt.getTime()) / 86_400_000)
      : null,
  };
}

export function buildMeasurementLeads(csvLeads, holdoutIds) {
  const out = [];
  for (const l of csvLeads) {
    if (!l.normalized_phone) continue;
    if (l.lead_type !== 'due_soon' && l.lead_type !== 'passed') continue;
    const next = parseDate(l.next_inspection_date);
    const imported = parseDate(l.imported_at);
    if (!next || !imported) continue;
    const days = daysBetween(next, imported);
    const bin = deadlineBin(days);
    if (!bin) continue;

    let arm = 'control';
    if (holdoutIds.has(l.id)) arm = 'holdout';
    else if (l.contacted_at) arm = 'treated';

    out.push({
      id: l.id,
      station_id: l.station_id,
      station_name: l.station_name || 'unknown',
      lead_type: l.lead_type,
      cohort_date: imported,
      days_to_deadline_at_ref: days,
      deadline_bin: bin,
      arm,
      booked: Boolean(l.booked_at),
      tj_own_reminder: Boolean(l.reminder_sms_at || l.reminder_email_at),
      contacted_at: l.contacted_at || null,
      booked_at: l.booked_at || null,
    });
  }
  return out;
}

function aggregateBins(leads, { byStation = false, onlyReminder = false } = {}) {
  const map = new Map();
  for (const l of leads) {
    if (onlyReminder && !l.tj_own_reminder) continue;
    const key = byStation
      ? `${l.lead_type}|${l.deadline_bin}|${l.station_name}`
      : `${l.lead_type}|${l.deadline_bin}`;
    let row = map.get(key);
    if (!row) {
      row = {
        lead_type: l.lead_type,
        deadline_bin: l.deadline_bin,
        station_name: byStation ? l.station_name : null,
        n_treated: 0,
        bk_treated: 0,
        n_control: 0,
        bk_control: 0,
        n_holdout: 0,
        bk_holdout: 0,
      };
      map.set(key, row);
    }
    if (l.arm === 'treated') {
      row.n_treated += 1;
      if (l.booked) row.bk_treated += 1;
    } else if (l.arm === 'holdout') {
      row.n_holdout += 1;
      if (l.booked) row.bk_holdout += 1;
      // holdouts count toward control rates until we have enough volume to separate
      row.n_control += 1;
      if (l.booked) row.bk_control += 1;
    } else {
      row.n_control += 1;
      if (l.booked) row.bk_control += 1;
    }
  }
  return [...map.values()];
}

export function computeStandardizedUplift(leads, { byStation = false, onlyReminder = false, minControl = MIN_CONTROL } = {}) {
  const bins = aggregateBins(leads, { byStation, onlyReminder });
  let bookings_observed = 0;
  let bookings_expected = 0;
  let leads_contacted = 0;
  const used = [];
  const skipped = [];

  for (const b of bins) {
    if (b.n_treated === 0) continue;
    if (b.n_control < minControl) {
      skipped.push({
        lead_type: b.lead_type,
        deadline_bin: b.deadline_bin,
        station_name: b.station_name,
        n_control: b.n_control,
        n_treated: b.n_treated,
        reason: `n_control < ${minControl}`,
      });
      continue;
    }
    const control_rate = b.bk_control / b.n_control;
    const expected = b.n_treated * control_rate;
    bookings_observed += b.bk_treated;
    bookings_expected += expected;
    leads_contacted += b.n_treated;
    used.push({
      ...b,
      control_rate,
      treated_rate: b.n_treated ? b.bk_treated / b.n_treated : 0,
      incremental: b.bk_treated - expected,
    });
  }

  const incremental = bookings_observed - bookings_expected;
  return {
    bookings_observed,
    bookings_expected,
    bookings_incremental: incremental,
    multiplier: bookings_expected > 0 ? bookings_observed / bookings_expected : null,
    leads_contacted,
    bins_used: used.length,
    bins_skipped: skipped.length,
    used,
    skipped,
  };
}

function bootstrapIncremental(leads, samples = BOOTSTRAP_SAMPLES, seed = 42) {
  // Bin-stratified bootstrap: resample treated/control counts within each
  // usable bin. Far cheaper than cloning 35k lead rows 1000×, and matches
  // the standardised estimator's stratification.
  const bins = aggregateBins(leads).filter((b) => b.n_treated > 0 && b.n_control >= MIN_CONTROL);
  if (!bins.length) return { samples: 0, ci95: [null, null], mean: null };

  const rand = mulberry32(seed);
  const resampleCount = (n, p) => {
    let k = 0;
    for (let i = 0; i < n; i++) if (rand() < p) k += 1;
    return k;
  };

  const values = [];
  for (let s = 0; s < samples; s++) {
    let obs = 0;
    let exp = 0;
    for (const b of bins) {
      const tRate = b.bk_treated / b.n_treated;
      const cRate = b.bk_control / b.n_control;
      const bkT = resampleCount(b.n_treated, tRate);
      const bkC = resampleCount(b.n_control, cRate);
      const controlRate = bkC / b.n_control;
      obs += bkT;
      exp += b.n_treated * controlRate;
    }
    values.push(obs - exp);
  }
  values.sort((a, b) => a - b);
  return {
    samples,
    mean: mean(values),
    ci95: [quantile(values, 0.025), quantile(values, 0.975)],
  };
}

function buildOps(sessions, statuses) {
  const now = Date.now();
  let overdueReminders = 0;
  let activeCadence = 0;
  const stopReasons = {};
  for (const s of sessions) {
    if (s.stop_reason === 'business_customer') continue;
    if (!s.stop_reminders) {
      activeCadence += 1;
      if (s.next_reminder_at && Date.parse(s.next_reminder_at) <= now) overdueReminders += 1;
    }
    if (s.stop_reminders) {
      const key = s.stop_reason || 'stopped';
      stopReasons[key] = (stopReasons[key] || 0) + 1;
    }
  }

  const statusCounts = {};
  let failed = 0;
  for (const m of statuses) {
    const st = (m.status || 'unknown').toLowerCase();
    statusCounts[st] = (statusCounts[st] || 0) + 1;
    if (st === 'failed') failed += 1;
  }

  const contacted = sessions.filter(
    (s) => s.last_outbound_at && s.stop_reason !== 'business_customer'
  ).length;
  const replied = sessions.filter(
    (s) => s.last_outbound_at && s.last_inbound_at && s.stop_reason !== 'business_customer'
  ).length;

  return {
    contacted_sessions: contacted,
    replied_sessions: replied,
    reply_rate: contacted ? replied / contacted : 0,
    message_rows: statuses.length,
    failure_rate: statuses.length ? failed / statuses.length : 0,
    status_counts: statusCounts,
    active_cadence: activeCadence,
    overdue_reminders: overdueReminders,
    stop_reasons: stopReasons,
  };
}

export async function getMeasurementReport({ force = false } = {}) {
  const fresh = Date.now() - cache.at < CACHE_TTL_MS;
  if (!force && cache.payload && fresh) return { ...cache.payload, cache: { hit: true, age_ms: Date.now() - cache.at } };
  if (!force && cache.promise) return cache.promise;

  cache.promise = (async () => {
    const started = Date.now();
    const [csvLeads, snapshots, holdout, opsRaw] = await Promise.all([
      loadLeads(),
      loadSnapshots(),
      loadHoldoutIds(),
      loadOpsSignals(),
    ]);

    const coverage = buildCaptureCoverage(snapshots);
    const leads = buildMeasurementLeads(csvLeads, holdout.ids);

    const headline = computeStandardizedUplift(leads);
    const byType = {
      due_soon: computeStandardizedUplift(leads.filter((l) => l.lead_type === 'due_soon')),
      passed: computeStandardizedUplift(leads.filter((l) => l.lead_type === 'passed')),
    };
    const byStationRaw = computeStandardizedUplift(leads, { byStation: true });
    const stationMap = new Map();
    for (const b of byStationRaw.used) {
      let row = stationMap.get(b.station_name);
      if (!row) {
        row = {
          station_name: b.station_name,
          bookings_observed: 0,
          bookings_expected: 0,
          leads_contacted: 0,
        };
        stationMap.set(b.station_name, row);
      }
      row.bookings_observed += b.bk_treated;
      row.bookings_expected += b.n_treated * b.control_rate;
      row.leads_contacted += b.n_treated;
    }
    const by_station = [...stationMap.values()].map((r) => ({
      ...r,
      bookings_incremental: r.bookings_observed - r.bookings_expected,
      multiplier: r.bookings_expected > 0 ? r.bookings_observed / r.bookings_expected : null,
      treated_rate: r.leads_contacted ? r.bookings_observed / r.leads_contacted : 0,
    }));

    const reminderLift = computeStandardizedUplift(leads, { onlyReminder: true });
    const recoveredLapsed = leads.filter(
      (l) => l.arm === 'treated' && l.booked && l.deadline_bin === 'overdue_365_plus'
    ).length;

    const treatedBookedDays = leads
      .filter((l) => l.arm === 'treated' && l.booked)
      .map((l) => l.days_to_deadline_at_ref);
    const controlBookedDays = leads
      .filter((l) => (l.arm === 'control' || l.arm === 'holdout') && l.booked)
      .map((l) => l.days_to_deadline_at_ref);

    const bootstrap = bootstrapIncremental(leads, BOOTSTRAP_SAMPLES, 42);

    const nTreated = leads.filter((l) => l.arm === 'treated').length;
    const nControl = leads.filter((l) => l.arm === 'control').length;
    const nHoldout = leads.filter((l) => l.arm === 'holdout').length;
    const remainingEligible = leads.filter((l) => l.arm === 'control' || l.arm === 'holdout').length;
    const remainingDueSoon = leads.filter(
      (l) => (l.arm === 'control' || l.arm === 'holdout') && l.lead_type === 'due_soon'
    ).length;
    const treatedRate = headline.leads_contacted
      ? headline.bookings_observed / headline.leads_contacted
      : 0;

    const stale = (coverage.days_since_capture ?? 999) > STALE_CAPTURE_DAYS;
    const controlArmLabel = nHoldout > 0 ? 'randomised+observational' : 'observational';

    const bins = aggregateBins(leads).map((b) => ({
      lead_type: b.lead_type,
      deadline_bin: b.deadline_bin,
      n_treated: b.n_treated,
      bk_treated: b.bk_treated,
      treated_rate: b.n_treated ? b.bk_treated / b.n_treated : 0,
      n_control: b.n_control,
      bk_control: b.bk_control,
      control_rate: b.n_control ? b.bk_control / b.n_control : null,
      n_holdout: b.n_holdout,
      usable: b.n_control >= MIN_CONTROL && b.n_treated > 0,
    }));

    const payload = {
      generated_at: new Date().toISOString(),
      compute_ms: Date.now() - started,
      freshness: {
        last_capture_at: coverage.last_capture_at,
        days_since_capture: coverage.days_since_capture,
        stale,
        stale_threshold_days: STALE_CAPTURE_DAYS,
        weeks_excluded_incomplete: coverage.incomplete_count,
        weeks_complete: coverage.complete_count,
        control_arm: controlArmLabel,
        control_n: nControl + nHoldout,
        holdout_n: nHoldout,
        holdout_table_ready: holdout.exists,
        note:
          'Headline uplift uses deadline-bin standardisation on reachable due_soon/passed leads. Snapshot capture is batchy — incomplete weeks are reported here and must not be read as zero demand.',
      },
      arms: {
        treated: nTreated,
        control: nControl,
        holdout: nHoldout,
        treated_booked: leads.filter((l) => l.arm === 'treated' && l.booked).length,
        control_booked: leads.filter((l) => l.arm === 'control' && l.booked).length,
      },
      headline: {
        bookings_observed: headline.bookings_observed,
        bookings_expected: Number(headline.bookings_expected.toFixed(2)),
        bookings_incremental: Number(headline.bookings_incremental.toFixed(2)),
        multiplier: headline.multiplier != null ? Number(headline.multiplier.toFixed(3)) : null,
        leads_contacted: headline.leads_contacted,
        treated_rate: Number(treatedRate.toFixed(4)),
        ci95_incremental: bootstrap.ci95.map((v) => (v == null ? null : Number(v.toFixed(1)))),
        bootstrap_samples: bootstrap.samples,
        bins_used: headline.bins_used,
        bins_skipped: headline.bins_skipped,
        skipped_bins: headline.skipped,
      },
      by_lead_type: {
        due_soon: {
          bookings_incremental: Number(byType.due_soon.bookings_incremental.toFixed(2)),
          multiplier:
            byType.due_soon.multiplier != null ? Number(byType.due_soon.multiplier.toFixed(3)) : null,
          leads_contacted: byType.due_soon.leads_contacted,
          bookings_observed: byType.due_soon.bookings_observed,
          bookings_expected: Number(byType.due_soon.bookings_expected.toFixed(2)),
        },
        passed: {
          bookings_incremental: Number(byType.passed.bookings_incremental.toFixed(2)),
          multiplier:
            byType.passed.multiplier != null ? Number(byType.passed.multiplier.toFixed(3)) : null,
          leads_contacted: byType.passed.leads_contacted,
          bookings_observed: byType.passed.bookings_observed,
          bookings_expected: Number(byType.passed.bookings_expected.toFixed(2)),
        },
      },
      by_station,
      lift_vs_tj_reminders: {
        bookings_incremental: Number(reminderLift.bookings_incremental.toFixed(2)),
        multiplier:
          reminderLift.multiplier != null ? Number(reminderLift.multiplier.toFixed(3)) : null,
        leads_contacted: reminderLift.leads_contacted,
        bookings_observed: reminderLift.bookings_observed,
        bookings_expected: Number(reminderLift.bookings_expected.toFixed(2)),
      },
      recovered_lapsed_customers: recoveredLapsed,
      days_booked_earlier: {
        treated_mean_days_to_deadline: mean(treatedBookedDays),
        control_mean_days_to_deadline: mean(controlBookedDays),
        delta_days:
          mean(treatedBookedDays) != null && mean(controlBookedDays) != null
            ? mean(controlBookedDays) - mean(treatedBookedDays)
            : null,
        note: 'Positive delta = treated book further before deadline (capacity smoothing).',
      },
      remaining_opportunity: {
        uncontacted_eligible: remainingEligible,
        uncontacted_due_soon: remainingDueSoon,
        implied_bookings_at_treated_rate: Number((remainingEligible * treatedRate).toFixed(1)),
        implied_due_soon_bookings_at_treated_rate: Number((remainingDueSoon * treatedRate).toFixed(1)),
      },
      bins,
      coverage: {
        weeks: coverage.weeks,
        incomplete_count: coverage.incomplete_count,
        complete_count: coverage.complete_count,
      },
      ops: buildOps(opsRaw.sessions, opsRaw.statuses),
      cache: { hit: false, age_ms: 0 },
    };

    cache = { at: Date.now(), payload, promise: null };
    return payload;
  })().catch((err) => {
    cache.promise = null;
    throw err;
  });

  return cache.promise;
}

/** Hard guard for send path — never contact holdout leads. */
export async function assertNoHoldoutLeak(phoneNumbers = []) {
  const { exists, ids } = await loadHoldoutIds();
  if (!exists || !ids.size || !phoneNumbers.length) {
    return { ok: true, holdout_table_ready: exists, blocked: [] };
  }

  const phones = [...new Set(phoneNumbers.map((p) => String(p || '').replace(/\D/g, '')).filter(Boolean))];
  if (!phones.length) return { ok: true, holdout_table_ready: true, blocked: [] };

  // Map holdout lead ids → phones
  const holdoutIds = [...ids];
  const blocked = [];
  // chunked query
  for (let i = 0; i < holdoutIds.length; i += 200) {
    const chunk = holdoutIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('tj_csv_leads')
      .select('id,normalized_phone')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      const phone = String(row.normalized_phone || '').replace(/\D/g, '');
      if (phone && phones.includes(phone)) {
        blocked.push({ lead_id: row.id, normalized_phone: phone });
      }
    }
  }
  return { ok: blocked.length === 0, holdout_table_ready: true, blocked };
}

export function roiFromUplift({
  ticketPrice,
  feePerBooking,
  monthlyLeadVolume,
  upliftPp,
  grossBookingRate,
}) {
  const ticket = Number(ticketPrice) || 0;
  const fee = Number(feePerBooking) || 0;
  const volume = Number(monthlyLeadVolume) || 0;
  const uplift = Number(upliftPp) || 0;
  const gross = Number(grossBookingRate) || 0;

  const incrementalBookings = volume * (uplift / 100);
  const addedRevenue = incrementalBookings * ticket;
  const wasupCost = incrementalBookings * fee;
  const returnMultiple = wasupCost > 0 ? addedRevenue / wasupCost : null;
  const breakEvenFee = gross > 0 ? (uplift / 100) * ticket / gross : null;

  return {
    incremental_bookings: Number(incrementalBookings.toFixed(2)),
    added_revenue: Number(addedRevenue.toFixed(2)),
    wasup_cost: Number(wasupCost.toFixed(2)),
    return_multiple: returnMultiple != null ? Number(returnMultiple.toFixed(2)) : null,
    break_even_fee: breakEvenFee != null ? Number(breakEvenFee.toFixed(2)) : null,
    inputs: {
      ticket_price: ticket,
      fee_per_booking: fee,
      monthly_lead_volume: volume,
      uplift_pp: uplift,
      gross_booking_rate: gross,
    },
  };
}
