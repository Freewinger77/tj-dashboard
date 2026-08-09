-- TJ measurement & uplift layer (run in Supabase SQL editor)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

-- 1) Randomised holdout assignments (empty until §7 assignment runs)
CREATE TABLE IF NOT EXISTS tj_holdout_assignment (
  lead_id        bigint PRIMARY KEY REFERENCES tj_csv_leads(id),
  cohort_id      text        NOT NULL,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  holdout_pct    numeric     NOT NULL,
  release_after  date,
  reason         text        NOT NULL DEFAULT 'randomised_control',
  rng_seed       text
);
CREATE INDEX IF NOT EXISTS tj_holdout_assignment_cohort_idx
  ON tj_holdout_assignment (cohort_id);

-- 2) Capture coverage from Doris/vision snapshots
CREATE MATERIALIZED VIEW IF NOT EXISTS tj_capture_coverage AS
SELECT
  station_id,
  station_name,
  appointment_week_start,
  COUNT(*) AS rows_captured,
  MIN(first_seen_at)::date AS first_capture,
  MAX(first_seen_at)::date AS last_capture,
  COUNT(DISTINCT COALESCE(source_batch_id, source)) AS capture_runs,
  (MAX(first_seen_at)::date >= appointment_week_start + 6) AS is_complete
FROM tj_booking_snapshots
WHERE appointment_week_start IS NOT NULL
  AND station_id IS NOT NULL
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS tj_capture_coverage_pk
  ON tj_capture_coverage (station_id, appointment_week_start);

-- 3) Lead-level measurement fact (refresh after snapshot ingest)
CREATE MATERIALIZED VIEW IF NOT EXISTS tj_measurement_leads AS
SELECT
  l.id,
  l.station_id,
  l.station_name,
  l.lead_type,
  l.imported_at::date AS cohort_date,
  (l.next_inspection_date - l.imported_at::date) AS days_to_deadline_at_ref,
  CASE
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN 0 AND 10 THEN 'd00_10'
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN 11 AND 20 THEN 'd11_20'
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN 21 AND 30 THEN 'd21_30'
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN 31 AND 45 THEN 'd31_45'
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN 46 AND 60 THEN 'd46_60'
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN 61 AND 90 THEN 'd61_90'
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN -90 AND -1 THEN 'overdue_0_90'
    WHEN (l.next_inspection_date - l.imported_at::date) BETWEEN -365 AND -91 THEN 'overdue_91_365'
    ELSE 'overdue_365_plus'
  END AS deadline_bin,
  CASE
    WHEN h.lead_id IS NOT NULL THEN 'holdout'
    WHEN l.contacted_at IS NOT NULL THEN 'treated'
    ELSE 'control'
  END AS arm,
  (l.booked_at IS NOT NULL) AS booked,
  (l.reminder_sms_at IS NOT NULL OR l.reminder_email_at IS NOT NULL) AS tj_own_reminder,
  l.contacted_at,
  l.booked_at,
  l.normalized_phone,
  l.next_inspection_date
FROM tj_csv_leads l
LEFT JOIN tj_holdout_assignment h ON h.lead_id = l.id
WHERE COALESCE(l.normalized_phone, '') <> ''
  AND l.lead_type IN ('due_soon', 'passed')
  AND l.next_inspection_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS tj_measurement_leads_arm_bin_idx
  ON tj_measurement_leads (arm, lead_type, deadline_bin);

-- Refresh helpers (call after snapshot ingest):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY tj_capture_coverage;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY tj_measurement_leads;

-- Note: the Node API also computes the same uplift live from base tables so the
-- dashboard works before these views are created. Views are the durable source of truth.
