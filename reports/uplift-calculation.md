# Uplift calculation — method

**Companion to:** measurement layer / dashboard tables.
This document covers only **how the number is computed**, so it can be reproduced and
ported to any client.

Worked against TJ-Katsastus data as of **10 Aug 2026**. Result: **946 contacted,
271 booked, 74.5 expected, +196.5 incremental, 3.64×, +20.8pp.**

Implemented in `api/lib/measurement.js` (`GET /api/measurement` headline).

---

## The problem this solves

The naive calculation is *booking rate of contacted ÷ booking rate of not-contacted*.
That number is wrong, and wrong in our favour, for two reasons:

1. **The arms have different deadline mixes.** Contacted leads skew toward customers
   whose inspection is due soon. Those people book more anyway. Comparing the arms as
   whole populations credits us for the mix, not the messaging.
2. **Some outcomes were never observable.** Booking data comes from periodic capture.
   A lead whose inspection happened during a capture gap can never show as booked, in
   either arm. Leaving those in deflates both rates unevenly.

The method below fixes both: **stratify, then standardise, over an observable window
only.**

---

## Step 1 — Eligible population

Applied identically to both arms. Nothing here may reference contact or outcome.

```sql
WHERE normalized_phone <> ''            -- must have been reachable at all
  AND lead_type IN ('due_soon','passed')
  AND next_inspection_date IS NOT NULL
```

**Rule:** any filter that touches `contacted_at`, `booked_at`, or `status` is
post-treatment and biases the result. Filter on lead attributes only.

---

## Step 2 — Arm assignment

| Arm | Rule |
|---|---|
| treated | `contacted_at IS NOT NULL` |
| control | `contacted_at IS NULL` |

---

## Step 3 — Observability window

Exclude leads whose outcome could not have been seen:

```sql
AND next_inspection_date >= (SELECT MIN(first_seen_at)::date FROM tj_booking_snapshots)
```

At TJ this is `>= 2026-06-01` (capture start). The filter is applied to **both** arms.
Because `passed` leads have deadlines in the past by definition, this filter removes
most of the `passed` campaign. The clean-window headline is **due_soon only**.

**Do not filter on `booked_at` timing.**

---

## Step 4 — Stratify

Strata = `lead_type × deadline_bin`. Bins are cut on
`(next_inspection_date - imported_at::date)`.

Thin-stratum rule: drop any stratum where `n_control < 30` or `n_treated = 0`.

---

## Step 5 — Standardise

For each surviving stratum *s*:

```
r_c(s) = b_c(s) / n_c(s)
e(s)   = n_t(s) × r_c(s)
Observed     = Σ b_t(s)
Expected     = Σ e(s)
Incremental  = Observed − Expected
Multiplier   = Observed / Expected
Lift (pp)    = (Incremental / Σ n_t(s)) × 100
```

---

## Step 6 — Confidence interval

Bootstrap within stratum and arm, 1,000 samples; report 2.5th / 97.5th percentiles of
Incremental and Multiplier.

---

## Pitfalls

- Always `order=id.asc` on PostgREST pagination.
- Estimates drift as capture completes — version published figures with capture date.
- TJ control is observational, not randomised — state that whenever quoting the number.
