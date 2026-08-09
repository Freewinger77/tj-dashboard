# TJ Katsastus — WhatsApp Pause Impact Report

**Generated:** 2026-08-09 (Europe/Helsinki)  
**Source:** Supabase project `pzhahidkjxihhxzzxevz` (`tj_*` tables)  
**Production dashboard:** https://tjkat.vercel.app

---

## 1. Executive summary

Outbound WhatsApp was fully paused for roughly **35 days** from **22 Jun 2026 evening → 27 Jul 2026 afternoon** (Helsinki).

During that silence:

- **No new WhatsApp sends** and **no new outreach sessions**
- Station calendars kept filling (organic / seasonal demand stayed hot)
- Customers who had already been messaged **kept converting**, but at a lower rate that **decayed quickly**

**WhatsApp’s measurable impact** shows up in *attributed* bookings (messaged customer → later marked booked), not in raw calendar snapshot volume:

| Signal | WA on (pre-gap) | WA off (main gap) | Change |
|---|---:|---:|---:|
| Attributed bookings detected | **3.62 / day** | **1.82 / day** | **~50% lower** |
| Attributed bookings / week (quiet weeks) | **~26 / week** (lumpy) | **~7 / week** | **~72% lower** |
| Raw Doris snapshot rows ingested / day | 31.4 | 35.7 | not a WA proxy (batch scrapes + seasonality) |

Of **1,624** people contacted before the pause:

- **203 (12.5%)** booked while WA was still on
- **62 (3.8%)** booked during the silence (lag from earlier messages)
- **265 (16.3%)** booked in total from that cohort

**Bottom line:** pausing WA did **not** stop the stations from getting bookings, but it **cut attributed (WA-touched) booking detections roughly in half**, and the residual tail mostly burned out within ~1–2 weeks after cutoff.

---

## 2. The pause gap

### Exact edges (Helsinki)

| Event | Timestamp |
|---|---|
| Last WA send before pause | **2026-06-22 18:01** (`reminder_reminder_1d`) |
| Quiet period | **2026-06-23 → 2026-07-26** (34 calendar days, zero sends) |
| First WA send after resume | **2026-07-27 16:09** (`first_contact`) |
| Config flip on resume | **2026-07-27 13:07** — `tj_config.auto_send_due_soon = true` |

Gap between consecutive sends: **34 days 22 hours**.

### Other quiet stretches (for context)

| Gap | Days | Notes |
|---|---:|---|
| **22 Jun → 27 Jul 2026** | **~35** | **Main full pause** |
| 16 May → 28 May 2026 | 13 | Earlier full pause |
| 10 May → 13 May 2026 | 4 | Short dip |
| 26–27 Apr, 29 Apr, 13 Jun | 1–2 | Minor blips |

### Weekly WA send volume

| Week | WA sends | Notes |
|---|---:|---|
| 2026-W18 (from 27 Apr) | 389 | Ramp-up |
| 2026-W19 | 530 | Peak new outreach |
| 2026-W22 | 177 | After May pause |
| 2026-W23 | 360 | |
| 2026-W24 | 282 | Mostly reminders |
| 2026-W25 | 372 | Mostly reminders |
| 2026-W26 | 12 | **Cutoff week** (22 Jun only) |
| **W27–W30** | **0** | **Main silence** |
| 2026-W31+ | 28/week | Trickle resume (~4/day) |

---

## 3. Method

### What we measured

1. **WA activity** — `tj_message_status.sent_at` (actual WhatsApp sends)
2. **Outreach sessions** — `tj_outbound_sessions` (excl. `business_customer`)
3. **Attributed bookings** — sessions with `stop_reminders` and `stop_reason ∈ {booked, booked_from_snapshot}`; detection time ≈ `updated_at`
4. **Calendar / Doris snapshots** — `tj_booking_snapshots.first_seen_at` (when a booking appeared in our scrape pipeline)

### Windows compared

| Window | Dates (Helsinki) | Days | WA |
|---|---|---:|---|
| Active pre-gap | 28 Apr → 22 Jun 2026 | 56 | On |
| Main gap | 23 Jun → 26 Jul 2026 | 34 | Off |
| Post resume | 27 Jul → 9 Aug 2026 | 14 | Trickle (4/day) |

### Important caveat on raw snapshots

Snapshot ingestion is **batchy** (large dumps on e.g. 27 Jun, 5 Jul, 27 Jul), and the pipeline only really starts around **31 May**.  
So **snapshots/day is a poor causal measure of WhatsApp impact**. It mostly reflects:

- seasonal inspection demand
- when vision/CSV scrapes ran
- appointment weeks being captured

**Attributed messaged→booked** is the right WA impact metric.

---

## 3b. Natural-experiment gate (three-table gap query)

Replicated the “daily activity → largest missing_days” query separately on each table.

### Largest gaps

| Table | Timestamp | Last active | Resumed | Missing days | Vol before → after |
|---|---|---|---|---:|---:|
| `tj_message_status` | `sent_at` | **2026-06-22** | **2026-07-27** | **34** | 12 → 4 |
| `tj_outbound_sessions` | `last_outbound_at` | **2026-06-22** | **2026-07-27** | **34** | 12 → 4 |
| `tj_outbound_sessions` | `created_at` (new sessions) | 2026-06-08 | 2026-07-27 | 48 | 24 → 4 |
| `tj_booking_snapshots` | `first_seen_at` | 2026-07-05 | 2026-07-26 | 20* | 620 → 19 |

\*Snapshot “gaps” are scrape-cadence holes, not “no bookings existed.” During the WA silence, scrapes still landed on **27 Jun (576)**, **5 Jul (620)**, **26 Jul (19)** — **1,215 snapshot rows** inside the zero-outbound window.

### Verdict

**GENUINE CONTROL (with intermittent measurement).**

- Intervention (`tj_message_status` / outbound) **stopped** for 34 days
- Measurement (`tj_booking_snapshots`) **kept running** (batch scrapes during the same window)
- Therefore the pause *can* be used as a natural experiment — with the caveat that snapshot ingest is bursty, not daily-continuous (including a 20-day scrape hole 5 Jul → 26 Jul)

### Correction to trailing-counter back-of-envelope

Dashboard `month=36` / `week=28` is **calendar August / current ISO week**, not a rolling lookback:

- Aug 1–9 @ 4/day ≈ **36**
- Last 7 days @ 4/day ≈ **28**
- **10 Jul → 26 Jul had zero sends** (still inside the pause)
- Resume is **27 Jul**, not ~3 Aug; post-resume rate is a steady trickle of **4/day**, not a late restart of the old ~21/day machine

### Attribution check during zero-outbound

| | Active pre (56d) | Gap no-WA (34d) | Gap/Pre rate |
|---|---:|---:|---:|
| `booked_from_snapshot` | 181 (3.23/d) | 57 (1.68/d) | **0.52×** |
| `booked` (explicit) | 22 (0.39/d) | 5 (0.15/d) | 0.38× |
| All attributed | 203 (3.62/d) | 62 (1.82/d) | 0.50× |

All **57** gap `booked_from_snapshot` rows had a prior `last_outbound_at` (they are messaged customers). Lag message → detect during gap: **median 52 days** (p25 44, p75 59).

**Read:** snapshot-matched attributions do **not** collapse to zero when outbound stops — they continue at ~half rate as a **lagged tail**. That is consistent with delayed conversion / delayed scrape matching, but it is **not yet** a clean proof against matching noise. Defending 20% / 26.7% to K1 still needs a tighter never-messaged control (reg join formats in `raw_data` are messy; deep extract only recovered 1,242 session regs).

### Per-station attributed / day

| Station | Pre | Gap | Notes |
|---|---:|---:|---|
| Vaajakoski | 0.89 | 0.65 | Smallest drop |
| Muurame | 0.68 | 0.44 | |
| Laukaa | 1.07 | 0.38 | |
| Jämsä | 0.98 | 0.35 | Station-paused since 18 Jun; still sees gap lag attributions |

Jämsä-as-cross-section control is contaminated for this pause window because Jämsä was already station-paused *before* the global outbound kill, and gap attributions there are still mostly lag from earlier messages.

---

## 4. Overall funnel (current DB snapshot)

| Metric | Value |
|---|---:|
| Outreach sessions | 1,780 |
| Contacted (excl. business) | 1,680 |
| Delivered | 1,357 (80.8%) |
| Read | 1,134 (67.5%) |
| Replied | 131 (7.8%) |
| Booked (stop reason) | 267 (15.9% of sent / 19.7% of delivered) |
| CSV leads loaded | 60,326 |
| Booking snapshots | 3,181 |

### By campaign (all-time contacted)

| Campaign | Sent | Delivered | Replied | Booked | Book % of sent |
|---|---:|---:|---:|---:|---:|
| due_soon | 1,233 | 991 | 97 (7.9%) | **245** | **19.9%** |
| passed | 447 | 366 | 34 (7.6%) | 22 | 4.9% |

### Station pause state

- **Jämsä:** paused (since 18 Jun — “Station requested pause”)
- Vaajakoski / Laukaa / Muurame: active

---

## 5. Gap vs active — booking comparison

### 5.1 Attributed bookings (messaged customers)

| Window | WA sends | New sessions | Attributed bookings | Per day | Replied | Silent |
|---|---:|---:|---:|---:|---:|---:|
| Active pre-gap | 2,154 | 1,624 | **203** | **3.62** | 19 | 184 |
| Main gap (no WA) | **0** | **0** | **62** | **1.82** | 5 | 57 |
| Post resume | 56 | 56 | 2 | 0.14 | 0 | 2 |

**Interpretation**

- While WA was live, we detected ~**3.6 attributed bookings/day**
- During full silence, previously messaged people still produced ~**1.8/day**
- That residual is **not new WA** — median lag from last message → booking detection ≈ **52 days**
- After the first quiet week, residual detections collapse (see weekly table below)

### 5.2 Attributed detections by week

| Week | WA sends | Attributed bookings detected | Phase |
|---|---:|---:|---|
| W22 (25 May) | 177 | 19 | Active |
| W25 (15 Jun) | 372 | **183** | Active (large snapshot-match batch) |
| W26 (22 Jun) | 12 | 33 | Cutoff |
| **W27 (29 Jun)** | **0** | **28** | **Silence — residual** |
| W28 | 0 | 0 | Silence |
| **W29 (13 Jul)** | **0** | **1** | **Silence — tail almost dead** |
| W30 | 0 | 0 | Silence |
| W31 (27 Jul) | 28 | 2 | Resume trickle |

Pure no-WA weeks **W27–W30**: **~7.2 attributed bookings/week**  
Active pre-gap weeks: **~26.2/week** (inflated by the W25 batch)  
→ roughly **~72% fewer** attributed detections/week with WA off.

### 5.3 Cohort view (everyone messaged before the pause)

**Cohort size: 1,624**

| Outcome | Count | % of cohort |
|---|---:|---:|
| Booked while WA still on | 203 | 12.5% |
| Booked during silence | 62 | 3.8% |
| **Ever booked (through gap)** | **265** | **16.3%** |

Among gap bookings from this cohort:

- **57 / 62** were silent (no inbound reply)
- **53** due_soon / **9** passed
- Stop reasons: 57 `booked_from_snapshot`, 5 `booked`

### 5.4 Raw calendar snapshots (context only)

| Window | Snapshot rows first_seen | Per day |
|---|---:|---:|
| Active pre-gap | 1,757 | 31.4 |
| Main gap | 1,215 | 35.7 |
| Post resume | 209 | 14.9 |

Snapshots stayed high during the pause because:

1. Appointment demand for late-June / early-July weeks was strong
2. Ingest happened in big scrapes (e.g. **576** on 27 Jun, **620** on 5 Jul), not smoothly per day
3. Most of those rows are **not** proof of WA causation

**Do not read “snapshots/day went up during the pause” as “WA had negative impact.”**  
It means the market + scrape cadence stayed busy while our outbound was off.

---

## 6. What impact did WhatsApp have?

### Clear positive signals

1. **Attributed booking flow is much stronger while WA is running**  
   ~3.6/day with WA vs ~1.8/day residual with WA off.

2. **Residual conversions decay fast without continued outreach**  
   First quiet week still sees lag bookings (28), then near-zero (1, then 0).  
   WA is not just a one-shot nudge with infinite half-life.

3. **Best early cohorts convert hard**  
   Example: week of 4 May — **530** new sessions → **~28%** eventually booked (including some during the later pause).

4. **due_soon is the engine**  
   All-time book rate ~**20%** of due_soon sent vs ~**5%** for passed.

### What WA did *not* uniquely own

- Station calendars still filled during the silence (organic + seasonal + delayed effects).
- Most attributed bookings are **silent** (no WhatsApp reply) — conversion often happens off-thread, observed later via Doris snapshots.

### Practical read

> Turning WA off did not freeze the business, but it **removed the steady attributed conversion engine**.  
> About **half** the attributed detection rate disappeared immediately, and nearly all of the rest faded within two weeks.  
> If the goal is incremental bookings from contacted due-soon customers, **sustained WA outreach matters**.

Rough magnitude on the pre-gap active window (56 days):

- Observed attributed detections with WA: **203**
- If the gap residual rate (1.82/day) were the “no new WA” baseline over those same 56 days: ~**102**
- Implied incremental attributed bookings while WA was active: on the order of **~100 bookings** over that window  
  (directionally useful; not a perfect causal experiment — snapshot matching cadence also affects detection timing)

---

## 7. Operational notes discovered during the analysis

1. **Reminder backlog looks stuck** — ~850 active sessions still have `next_reminder_at`, of which ~846 are overdue (oldest ~29 Apr). Pause + incomplete resume left the cadence unhealthy.
2. **Post-gap resume is a trickle** — 4 first-contacts/day since 27 Jul; almost no new attributed bookings yet from that trickle.
3. **Jämsä remains paused** at station level since 18 Jun.
4. **`tj_booking_conversions` is currently unreadable** (statement timeout / query errors) — report uses sessions + snapshots instead.
5. Lead-pool “remaining” on the dashboard (~662) is tighter than raw uncontacted due_soon CSV rows (~2,706), because the app excludes already-sessioned numbers / uses Doris pool logic.

---

## 8. Recommendations

1. **Treat the Jun–Jul pause as evidence WA adds incremental attributed bookings**, especially for due_soon.
2. **Don’t judge WA only on raw calendar volume** — always track messaged→booked attribution.
3. **Fix the reminder scheduler** before scaling sends again (overdue `next_reminder_at` pile).
4. If pausing again, expect:
   - ~1–2 weeks of residual attributed bookings
   - then attributed detections to fall near zero without new outbound
5. Re-enable due_soon volume intentionally (not only 4/day) if the goal is to recover the pre-gap attributed booking rate.

---

## 9. Data appendix

### Key tables

| Table | Rows (at analysis) | Role |
|---|---:|---|
| `tj_outbound_sessions` | 1,780 | Outreach + booking attribution |
| `tj_message_status` | 2,211 | WA send/delivery/read |
| `tj_booking_snapshots` | 3,181 | Doris/calendar booking observations |
| `tj_csv_leads` | 60,326 | Lead pool |
| `tj_config` | 1 | Auto-send flags |
| `tj_station_pause` | 4 | Per-station pause |

### Supporting artifacts

- `/opt/cursor/artifacts/tj-activity-gap.json` — daily WA/session timeline + quiet streaks
- `/opt/cursor/artifacts/tj-wa-impact-gap.json` — window comparison + cohort summary
- `/opt/cursor/artifacts/tj-supabase-metrics.json` — full DB metrics extract

### Definitions

- **Attributed booking:** outreach session stopped as `booked` or `booked_from_snapshot`
- **Detection time:** `tj_outbound_sessions.updated_at` when that stop was applied
- **Silent booking:** attributed booking with no `last_inbound_at`
- **Main gap:** first WA-quiet day 23 Jun through last WA-quiet day 26 Jul 2026 (Helsinki)
