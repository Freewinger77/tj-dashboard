# Measurement layer — runbook

## Live endpoint

- `GET /api/measurement` — full Value + Ops payload (cached ~10 min)
- `GET /api/measurement?refresh=1` — force recompute
- `POST /api/measurement/roi` — ROI calculator (uplift defaults to live standardised pp)
- UI: `/measurement` (nav label **Value**)

## Baseline (Aug 2026 live DB)

Reproduced from `tj_csv_leads` reachable `due_soon`/`passed`:

| Metric | Spec target | Live |
|---|---:|---:|
| Contacted | 2,209 | 2,209 |
| Incremental bookings | ~246 | **248.2** |
| Multiplier | ~3.85 | **3.96** |
| due_soon multiple | ~4.07 | **4.07** |
| passed multiple | ~3.41 | **3.73** |

## Supabase SQL

Apply `sql/001_measurement.sql` in the Supabase SQL editor to create:

- `tj_holdout_assignment`
- `tj_capture_coverage` (materialized)
- `tj_measurement_leads` (materialized)

The API works **without** these views (computes live from base tables). Views are the durable path once installed; refresh after every snapshot ingest:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY tj_capture_coverage;
REFRESH MATERIALIZED VIEW CONCURRENTLY tj_measurement_leads;
```

## Holdout protection

- Feeder trigger sends `exclude_holdout: true` to n8n and refuses to fire if any holdout phone already has a session.
- n8n feeder **must** also `LEFT JOIN tj_holdout_assignment` before selecting leads — that is the real gate.
- Until the holdout table exists, UI labels the control arm **observational**.

## Reminder backlog

`POST /api/feeder/expire-overdue-reminders` with `{ "older_than_days": 14 }` expires overdue cadence rows before re-enabling the scheduler.
