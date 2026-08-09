import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import {
  fetchAnalytics,
  fetchMeasurement,
  fetchStats,
  getStationPause,
  pollMessageStatuses,
} from '../lib/api.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';

const PERIODS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All time' },
];

function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function pct(part, whole) {
  if (part == null || !whole) return null;
  return Math.round((part / whole) * 100);
}

function startOfHelsinkiWeek(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const utc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day));
  const weekdayIndex = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[map.weekday] ?? 0;
  return new Date(utc - weekdayIndex * 86400000);
}

function startOfHelsinkiMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Date.UTC(Number(map.year), Number(map.month) - 1, 1));
}

function periodWindowLabel(period) {
  const fmtDate = (d) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  const now = new Date();
  if (period === 'week') {
    const start = startOfHelsinkiWeek(now);
    return `${fmtDate(start)} – ${fmtDate(now)} · Europe/Helsinki`;
  }
  if (period === 'month') {
    const start = startOfHelsinkiMonth(now);
    return `${fmtDate(start)} – ${fmtDate(now)} · Europe/Helsinki`;
  }
  return 'All reachable due_soon / passed leads · Europe/Helsinki';
}

export default function PerformancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = PERIODS.some((p) => p.key === searchParams.get('period'))
    ? searchParams.get('period')
    : 'week';
  const method = searchParams.get('method') === 'attributed' ? 'attributed' : 'incremental';

  const setPeriod = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('period', key);
    setSearchParams(next, { replace: true });
  };
  const setMethod = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('method', key);
    setSearchParams(next, { replace: true });
  };

  const statsQ = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 60_000 });
  const analyticsQ = useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
    refetchInterval: 5 * 60_000,
  });
  const measurementQ = useQuery({
    queryKey: ['measurement'],
    queryFn: () => fetchMeasurement(),
    staleTime: 5 * 60_000,
  });
  const stationsQ = useQuery({ queryKey: ['station-pause'], queryFn: getStationPause });

  useEffect(() => {
    pollMessageStatuses().catch(() => {});
  }, []);

  const loading = statsQ.isLoading || analyticsQ.isLoading || measurementQ.isLoading;
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (statsQ.isError || analyticsQ.isError) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Performance could not load"
        hint="Check the API logs and refresh the page."
      />
    );
  }

  const stats = statsQ.data || {};
  const analytics = analyticsQ.data || {};
  const measurement = measurementQ.data;
  const summary = analytics.summary || {};
  const bookings = analytics.bookingsAfterWhatsApp || [];
  const sendWindows = analytics.sendTimePerformance || analytics.bestSendWindows || [];
  const stations = stationsQ.data?.stations || [];
  const pausedIds = new Set(stations.filter((s) => s.paused).map((s) => String(s.station_id)));

  const periodStats =
    period === 'week' ? stats.week : period === 'month' ? stats.month : stats.total;
  const sent = periodStats?.sent ?? 0;
  const replied = periodStats?.replied ?? 0;
  const delivered =
    period === 'all'
      ? stats.total?.delivered
      : stats.total?.sent
        ? Math.round((sent * (stats.total.delivered || 0)) / stats.total.sent)
        : null;

  const cutoff =
    period === 'week'
      ? startOfHelsinkiWeek().getTime()
      : period === 'month'
        ? startOfHelsinkiMonth().getTime()
        : 0;

  const periodBookings = bookings.filter((b) => {
    if (!cutoff) return true;
    const ts = Date.parse(b.dorisBookingCreatedAt || b.appointmentAt || 0);
    return Number.isFinite(ts) && ts >= cutoff;
  });

  const attributedCount =
    period === 'all'
      ? summary.bookingsAfterWhatsApp ?? bookings.length
      : periodBookings.length;
  const silentBookings = periodBookings.filter((b) => !b.customerReplied).length;
  const incremental = measurement?.headline?.bookings_incremental;
  const bookingsHero = method === 'incremental' ? incremental : attributedCount;

  const chartRows = buildWeeklyRows(bookings);
  const heatmap = buildSendHeatmap(sendWindows);
  const byStation = measurement?.by_station || [];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-up">
      <header className="space-y-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]">
            Performance
          </h1>
          <p className="mt-2 text-[13px] text-[color:var(--color-ink-3)]">
            Every panel on this page uses the period below.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="segmented">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={period === p.key}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="text-[12px] text-[color:var(--color-ink-4)]">{periodWindowLabel(period)}</div>
        </div>
      </header>

      {measurement?.freshness?.stale && (
        <div className="flex items-start gap-2 rounded-xl border border-[color:var(--color-amber)]/30 bg-[color:var(--color-amber-soft)] px-4 py-3 text-[13px]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
          <div>
            <div className="font-medium">Booking capture is stale</div>
            <div className="text-[color:var(--color-ink-2)]">
              Last snapshot was {measurement.freshness.days_since_capture} days ago. Treat value
              numbers as provisional until a new capture lands.
            </div>
          </div>
        </div>
      )}

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
              Bookings from outreach
            </div>
            <div className="mt-2 font-display text-[44px] font-semibold leading-none tabular-nums tracking-tight">
              {method === 'incremental' ? fmt(bookingsHero, 0) : fmt(bookingsHero)}
            </div>
          </div>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={method === 'incremental'}
              onClick={() => setMethod('incremental')}
            >
              Incremental
            </button>
            <button
              type="button"
              aria-pressed={method === 'attributed'}
              onClick={() => setMethod('attributed')}
            >
              Attributed
            </button>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-[13px] text-[color:var(--color-ink-3)]">
          {method === 'incremental' ? (
            <>
              Bookings above the control rate, from {fmt(measurement?.headline?.leads_contacted)}{' '}
              contacted customers. Attributed count is{' '}
              <strong className="font-semibold text-[color:var(--color-ink)]">
                {fmt(summary.bookingsAfterWhatsApp ?? bookings.length)}
              </strong>{' '}
              — the difference is bookings the control arm suggests would have happened anyway.
              {period !== 'all' && (
                <span className="text-[color:var(--color-ink-4)]">
                  {' '}
                  Incremental is all-time; funnel metrics below follow the selected period.
                </span>
              )}
            </>
          ) : (
            <>
              Registration-matched bookings after outreach
              {period !== 'all' ? ' in this period' : ''}. Incremental lift is{' '}
              <strong className="font-semibold text-[color:var(--color-ink)]">
                {fmt(incremental, 0)}
              </strong>{' '}
              all-time.
            </>
          )}
        </p>

        {!measurement?.freshness?.holdout_table_ready && (
          <p className="mt-3 text-[11px] text-[color:var(--color-ink-4)]">
            Control arm is observational
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniStat label="Sent" value={fmt(sent)} />
          <MiniStat
            label="Delivered"
            value={fmt(delivered)}
            hint={
              delivered != null && sent
                ? `${pct(delivered, sent)}% of sent`
                : period !== 'all'
                  ? 'Estimated from all-time rate'
                  : undefined
            }
          />
          <MiniStat
            label="Replied"
            value={fmt(replied)}
            hint={sent ? `${pct(replied, sent)}% of sent` : undefined}
          />
          <MiniStat
            label="Booked without replying"
            value={fmt(silentBookings)}
            hint={
              attributedCount
                ? `${pct(silentBookings, attributedCount)}% of attributed`
                : undefined
            }
          />
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold">Bookings per week</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
            Attributed bookings · this week highlighted when period is Week
          </p>
        </div>
        <WeeklyBars rows={chartRows} highlightCurrent={period === 'week'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">When to send</h2>
              <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
                Reply rate by weekday and hour. Darker is better.
              </p>
            </div>
            <Link to="/controls" className="text-[12px] font-medium text-[color:var(--brand-logo-indigo)] hover:underline">
              Shift the schedule
            </Link>
          </div>
          <SendHeatmap heatmap={heatmap} />
        </div>

        <div className="panel p-5">
          <h2 className="text-[15px] font-semibold">By station</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
            Bookings per 100 contacted (measurement)
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b rule text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-ink-4)]">
                  <th className="pb-2 font-medium">Station</th>
                  <th className="pb-2 font-medium tabular-nums">Contacted</th>
                  <th className="pb-2 font-medium tabular-nums">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-rule)]">
                {(Array.isArray(byStation) ? byStation : Object.entries(byStation).map(([k, v]) => ({ station: k, ...v })))
                  .slice(0, 8)
                  .map((row) => {
                    const id = String(row.station_id ?? row.station ?? '');
                    const name = row.station_name || row.station || id || '—';
                    const contacted = row.leads_contacted ?? row.n_treated ?? row.contacted ?? 0;
                    const booked = row.bookings_observed ?? row.booked ?? 0;
                    const rate = contacted ? ((booked / contacted) * 100).toFixed(1) : '—';
                    const paused = pausedIds.has(id) || Boolean(row.paused);
                    return (
                      <tr key={name} className={paused ? 'text-[color:var(--color-ink-4)]' : ''}>
                        <td className="py-2.5">
                          {name}
                          {paused ? ' · paused' : ''}
                        </td>
                        <td className="py-2.5 tabular-nums">{fmt(contacted)}</td>
                        <td className="py-2.5 tabular-nums font-medium">{rate}</td>
                      </tr>
                    );
                  })}
                {(!byStation || (Array.isArray(byStation) && byStation.length === 0)) && (
                  <tr>
                    <td colSpan={3} className="py-4 text-[color:var(--color-ink-4)]">
                      Station breakdown unavailable
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-[15px] font-semibold">Message templates</h2>
        <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
          Campaign reply rates from analytics summary
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <TemplateRow
            label="Due soon · first contact"
            value={summary.dueSoonReplyRate ?? summary.currentDueSoonReplyRate}
          />
          <TemplateRow
            label="Passed · first contact"
            value={summary.passedReplyRate ?? summary.currentPassedReplyRate}
          />
          <TemplateRow
            label="Due soon contacted"
            value={summary.dueSoonSentReachouts ?? summary.currentDueSoonSent}
            format="count"
          />
          <TemplateRow
            label="Passed contacted"
            value={summary.passedSentReachouts ?? summary.currentPassedSent}
            format="count"
          />
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, hint }) {
  return (
    <div className="rounded-lg bg-[color:var(--color-canvas-sunk)] px-3 py-3">
      <div className="text-[11px] text-[color:var(--color-ink-4)]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">{hint}</div>}
    </div>
  );
}

function TemplateRow({ label, value, format = 'rate' }) {
  let display = '—';
  if (value != null && !Number.isNaN(Number(value))) {
    display = format === 'count' ? fmt(value) : `${Number(value).toFixed?.(1) ?? value}${format === 'rate' && Number(value) <= 1 ? '' : ''}`;
    if (format === 'rate') {
      const n = Number(value);
      display = n <= 1 ? `${(n * 100).toFixed(1)}%` : `${n.toFixed(1)}%`;
    }
  }
  return (
    <div className="flex items-center justify-between rounded-lg border rule px-3 py-2.5 text-[13px]">
      <span className="text-[color:var(--color-ink-2)]">{label}</span>
      <span className="font-semibold tabular-nums">{display}</span>
    </div>
  );
}

function WeeklyBars({ rows, highlightCurrent }) {
  if (!rows.length) {
    return <div className="text-[13px] text-[color:var(--color-ink-4)]">No booking weeks yet.</div>;
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2">
      {rows.map((row, i) => {
        const height = Math.max(4, Math.round((row.count / max) * 100));
        const isLast = i === rows.length - 1;
        return (
          <div key={row.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="text-[10px] tabular-nums text-[color:var(--color-ink-4)]">{row.count}</div>
            <div
              className={[
                'w-full rounded-t-md transition-all',
                highlightCurrent && isLast
                  ? 'bg-[color:var(--brand-logo-blue)]'
                  : 'bg-[color:var(--color-clay-soft)]',
              ].join(' ')}
              style={{ height: `${height}%` }}
              title={`${row.label}: ${row.count}`}
            />
            <div className="truncate text-[9px] text-[color:var(--color-ink-4)]">{row.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function SendHeatmap({ heatmap }) {
  const { days, hours, cells, maxRate } = heatmap;
  if (!days.length) {
    return <div className="text-[13px] text-[color:var(--color-ink-4)]">No send-window data yet.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `40px repeat(${hours.length}, minmax(28px, 1fr))` }}
      >
        <div />
        {hours.map((h) => (
          <div key={h} className="text-center text-[10px] text-[color:var(--color-ink-4)]">
            {String(h).padStart(2, '0')}
          </div>
        ))}
        {days.map((day) => (
          <div key={day} className="contents">
            <div className="flex items-center text-[11px] text-[color:var(--color-ink-3)]">
              {day.slice(0, 3)}
            </div>
            {hours.map((hour) => {
              const cell = cells.get(`${day}|${hour}`);
              const rate = cell?.replyRate ?? 0;
              const intensity = maxRate ? Math.max(rate / maxRate, 0.06) : 0.06;
              return (
                <div
                  key={`${day}-${hour}`}
                  title={cell ? `${day} ${hour}:00 · ${(rate * 100).toFixed(0)}% reply` : `${day} ${hour}:00`}
                  className="aspect-square rounded-sm"
                  style={{
                    backgroundColor: `rgba(76, 152, 253, ${intensity})`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildWeeklyRows(bookings) {
  const map = new Map();
  for (const b of bookings) {
    const ts = Date.parse(b.dorisBookingCreatedAt || b.appointmentAt || 0);
    if (!Number.isFinite(ts)) continue;
    const start = startOfHelsinkiWeek(new Date(ts));
    const key = start.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([key, count]) => ({
      key,
      count,
      label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(key)
      ),
    }));
}

function buildSendHeatmap(rows) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hourSet = new Set();
  const cells = new Map();
  let maxRate = 0;
  for (const row of rows || []) {
    const day = row.weekday || row.day || row.dow;
    const hour = Number(row.hour ?? row.sendHour);
    if (!day || Number.isNaN(hour)) continue;
    const dayKey = String(day).slice(0, 3);
    const normalized =
      {
        Mon: 'Mon',
        Tue: 'Tue',
        Wed: 'Wed',
        Thu: 'Thu',
        Fri: 'Fri',
        Sat: 'Sat',
        Sun: 'Sun',
        Monday: 'Mon',
        Tuesday: 'Tue',
        Wednesday: 'Wed',
        Thursday: 'Thu',
        Friday: 'Fri',
        Saturday: 'Sat',
        Sunday: 'Sun',
      }[day] || dayKey;
    hourSet.add(hour);
    const replyRate = row.replyRate > 1 ? row.replyRate / 100 : row.replyRate || 0;
    cells.set(`${normalized}|${hour}`, { ...row, replyRate });
    maxRate = Math.max(maxRate, replyRate);
  }
  const hours = [...hourSet].sort((a, b) => a - b);
  const presentDays = days.filter((d) => hours.some((h) => cells.has(`${d}|${h}`)));
  return { days: presentDays.length ? presentDays : days.slice(0, 5), hours: hours.length ? hours : [9, 11, 13, 15, 17], cells, maxRate };
}
