import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  CalendarCheck,
  CheckCheck,
  MessageSquareReply,
  Table2,
} from 'lucide-react';
import { fetchAnalytics, fetchLeadPoolSummary, fetchStats, pollMessageStatuses } from '../lib/api.js';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';

const PERIODS = [
  { key: 'today', label: 'Today', hint: 'calendar day' },
  { key: 'week', label: 'This week', hint: 'Mon-Sun' },
  { key: 'month', label: 'This month', hint: 'calendar month' },
];

export default function StatsPage() {
  const location = useLocation();
  const [bookingView, setBookingView] = useState('chart');
  const [bookingSort, setBookingSort] = useState('desc');
  const [sendView, setSendView] = useState('chart');
  const [sendSort, setSendSort] = useState('desc');

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 60_000,
  });

  const analyticsQuery = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetchAnalytics('all'),
    refetchInterval: 5 * 60_000,
  });

  const leadPoolQuery = useQuery({
    queryKey: ['lead-pool', 'due_soon'],
    queryFn: fetchLeadPoolSummary,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 15_000 : 60 * 60_000,
    staleTime: 30 * 60_000,
  });

  useEffect(() => {
    pollMessageStatuses().catch(() => {});
    const id = setInterval(() => pollMessageStatuses().catch(() => {}), 60_000);
    return () => clearInterval(id);
  }, []);

  const stats = statsQuery.data || {};
  const analytics = analyticsQuery.data || {};
  const summary = analytics.summary || {};
  const bookings = analytics.bookingsAfterWhatsApp || [];
  const sendWindows = analytics.sendTimePerformance || analytics.bestSendWindows || [];
  const loading = statsQuery.isLoading || analyticsQuery.isLoading;
  const leadPool = leadPoolQuery.data;
  const returnTo = `${location.pathname}${location.search}`;

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const aTime = new Date(a.dorisBookingCreatedAt || 0).getTime();
      const bTime = new Date(b.dorisBookingCreatedAt || 0).getTime();
      return bookingSort === 'desc' ? bTime - aTime : aTime - bTime;
    });
  }, [bookings, bookingSort]);

  const sortedSendWindows = useMemo(() => {
    return [...sendWindows].sort((a, b) => {
      const diff = (b.replyRate || 0) - (a.replyRate || 0);
      return sendSort === 'desc' ? diff : -diff;
    });
  }, [sendWindows, sendSort]);

  const bookingChartRows = useMemo(() => buildBookingChartRows(bookings), [bookings]);

  if (loading) return <StatsSkeleton />;
  if (statsQuery.isError || analyticsQuery.isError) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Stats could not load"
        hint="Check the API logs and refresh the page."
      />
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader generatedAt={analytics.generated_at} />
      <KpiGrid
        stats={stats}
        summary={summary}
        leadPool={leadPool}
        leadPoolLoading={leadPoolQuery.isLoading || leadPool?.status === 'running'}
        leadPoolError={leadPoolQuery.isError}
      />
      <PeriodCards stats={stats} />
      <ReminderPanel summary={summary} />
      <LeadPoolPanel
        leadPool={leadPool}
        loading={leadPoolQuery.isLoading || leadPool?.status === 'running'}
        error={leadPoolQuery.isError}
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel
          title="Bookings After Outreach"
          description="Bookings matched to messaged vehicles after outreach (same registration)."
          action={
            <ViewToggle
              value={bookingView}
              onChange={setBookingView}
              firstLabel="Chart"
              secondLabel="Table"
            />
          }
        >
          {bookingView === 'chart' ? (
            <BookingsChart rows={bookingChartRows} bookings={bookings} />
          ) : (
            <BookingsTable
              bookings={sortedBookings}
              sort={bookingSort}
              onSortChange={setBookingSort}
              returnTo={returnTo}
            />
          )}
        </Panel>

        <BookingSummary summary={summary} />
      </section>

      <Panel
        title="Send-Time Performance"
        description="Message volume, replies, and matched bookings by send window."
        action={
          <ViewToggle
            value={sendView}
            onChange={setSendView}
            firstLabel="Chart"
            secondLabel="Table"
          />
        }
      >
        {sendView === 'chart' ? (
          <SendTimeChart rows={sortedSendWindows} />
        ) : (
          <SendTimesTable
            windows={sortedSendWindows}
            sort={sendSort}
            onSortChange={setSendSort}
          />
        )}
      </Panel>
    </div>
  );
}

function PageHeader({ generatedAt }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-[30px] sm:text-[38px] leading-none font-medium tracking-tight">
          Stats
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--color-ink-3)]">
          Customer replies and bookings after outreach.
        </p>
      </div>
      {generatedAt && (
        <p className="text-[11px] text-[color:var(--color-ink-4)]">
          Updated {formatLocal(generatedAt)}
        </p>
      )}
    </header>
  );
}

function KpiGrid({ stats, summary }) {
  const total = stats.total || {};
  const totalBookings = summary.totalAttributedBookings ?? (
    Number(summary.botBooked || 0) + Number(summary.bookingsAfterWhatsApp || 0)
  );
  const cards = [
    { label: 'Total sent', value: total.sent ?? summary.contacted ?? summary.currentSent, icon: BarChart3, tone: 'amber' },
    { label: 'Due soon sent', value: summary.dueSoonSentReachouts ?? summary.currentDueSoonSent, icon: BarChart3, tone: 'teal' },
    { label: 'Delivered', value: total.delivered ?? summary.delivered ?? summary.currentDelivered, icon: CheckCheck, tone: 'amber' },
    { label: 'Replied', value: total.replied ?? summary.replied ?? summary.currentReplied, icon: MessageSquareReply, tone: 'amber' },
    { label: 'Bookings', value: totalBookings, icon: CalendarCheck, tone: 'moss', featured: true },
    {
      label: 'Conversion',
      value: summary.currentBookingConversionRate ?? summary.dueSoonBookingConversionRate,
      icon: BarChart3,
      tone: 'moss',
      format: 'percent',
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {cards.map(({ label, value, icon: Icon, tone, featured, format, loading, hint }) => (
        <div
          key={label}
          className={`rounded-xl border rule bg-[color:var(--color-canvas-raised)] p-4 transition-colors duration-150 hover:border-[color:var(--color-rule-strong)] ${
            featured ? 'ring-1 ring-[color:var(--color-moss)]/20' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-[color:var(--color-ink-3)]">{label}</p>
            <Icon size={15} strokeWidth={1.75} style={{ color: `var(--color-${tone})` }} />
          </div>
          <p className={`mt-3 font-display text-[34px] leading-none tabular-nums ${featured ? 'text-[color:var(--color-moss)]' : ''}`}>
            {loading ? '...' : formatMetric(value, format)}
          </p>
          {hint && (
            <p className="mt-2 truncate text-[10px] text-[color:var(--color-ink-4)]">{hint}</p>
          )}
        </div>
      ))}
    </section>
  );
}

function PeriodCards({ stats }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-4)]">
        Calendar periods
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {PERIODS.map(({ key, label, hint }) => (
          <div key={key} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-[color:var(--color-ink-3)]">{label}</p>
              <span className="text-[10px] text-[color:var(--color-ink-5)]">{hint}</span>
            </div>
            <p className="mt-3 font-display text-[36px] leading-none tabular-nums">
              {formatNumber(stats?.[key]?.sent)}
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--color-ink-4)]">
              {formatNumber(stats?.[key]?.replied)} replies
              {stats?.[key]?.replyRate !== undefined && (
                <span className="ml-2">{formatPercent(stats[key].replyRate)} reply rate</span>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReminderPanel({ summary }) {
  const byStage = summary.remindersByStage || {};
  const pending = Number(summary.pendingReminders || 0);
  const nextLabel = pending > 0
    ? 'Ready now'
    : summary.nextReminderAt
      ? formatLocal(summary.nextReminderAt)
      : '—';

  return (
    <section className="card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-medium">Reminders</h2>
          <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
            Follow-ups for active outreach customers who have not booked yet.
          </p>
        </div>
        <div className="grid min-w-full gap-2 sm:grid-cols-3 lg:min-w-[420px]">
          <MiniMetric label="Sent" value={formatNumber(summary.remindersSent)} tone="moss" />
          <MiniMetric label="Pending" value={formatNumber(pending)} tone={pending > 0 ? 'moss' : undefined} />
          <MiniMetric label="Next" value={nextLabel} />
        </div>
      </div>
      {pending > 0 && (
        <p className="mt-3 text-[11px] text-[color:var(--color-ink-4)]">
          Pending by stage: {formatReminderStages(byStage)}
        </p>
      )}
    </section>
  );
}

function LeadPoolPanel({ leadPool, loading, error }) {
  if (loading) {
    return <Skeleton className="h-32" />;
  }

  if (error || !leadPool) {
    return (
      <section className="card p-5">
        <h2 className="text-sm font-medium">Remaining Due-Soon Pool</h2>
        <p className="mt-2 text-[12px] text-[color:var(--color-ink-4)]">
          Lead pool estimate could not be loaded. Existing outreach metrics are still available.
        </p>
      </section>
    );
  }

  const stationCounts = leadPool.station_counts || {};
  const deadlineBuckets = leadPool.deadline_buckets || {};
  const stationRows = Object.entries(stationCounts).filter(([, value]) => Number(value) > 0);
  const maxStation = Math.max(...stationRows.map(([, value]) => Number(value)), 1);

  return (
    <section className="card overflow-hidden">
      <div className="border-b rule px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-medium">Remaining Due-Soon Pool</h2>
            <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
              Estimated uncontacted due-soon customers.
            </p>
          </div>
          <p className="text-[11px] text-[color:var(--color-ink-4)]">
            Updated {formatLocal(leadPool.generated_at)}
          </p>
        </div>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[260px_1fr_1fr]">
        <div className="rounded-xl bg-[color:var(--color-canvas-sunk)] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-4)]">
            Remaining
          </p>
          <p className="mt-2 font-display text-[52px] leading-none text-[color:var(--color-teal)]">
            {formatNumber(leadPool.total_remaining)}
          </p>
        </div>

        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--color-ink-4)]">
            By station
          </p>
          <div className="space-y-2">
            {stationRows.map(([station, value]) => (
              <div key={station} className="grid grid-cols-[92px_1fr_36px] items-center gap-3">
                <span className="text-[11px] text-[color:var(--color-ink-4)]">{station}</span>
                <div className="h-7 overflow-hidden rounded-lg bg-[color:var(--color-canvas-sunk)]">
                  <div
                    className="h-full rounded-lg bg-[color:var(--color-teal)]"
                    style={{ width: `${Math.max((Number(value) / maxStation) * 100, 5)}%` }}
                  />
                </div>
                <span className="text-right text-[12px] font-medium tabular-nums">{formatNumber(value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--color-ink-4)]">
            Deadline window
          </p>
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="0-30d" value={formatNumber(deadlineBuckets.within_30_days)} tone="moss" />
            <MiniMetric label="31-60d" value={formatNumber(deadlineBuckets.days_31_to_60)} />
            <MiniMetric label="61-90d" value={formatNumber(deadlineBuckets.days_61_to_90)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Panel({ title, description, action, children }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b rule px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {description && (
            <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ViewToggle({ value, onChange, firstLabel, secondLabel }) {
  return (
    <div className="inline-flex rounded-lg border rule bg-[color:var(--color-canvas-sunk)] p-1">
      {[
        { key: 'chart', label: firstLabel, icon: BarChart3 },
        { key: 'table', label: secondLabel, icon: Table2 },
      ].map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors duration-150 ${
            value === key
              ? 'bg-[color:var(--color-canvas-raised)] text-[color:var(--color-ink)] shadow-sm'
              : 'text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink)]'
          }`}
        >
          <Icon size={13} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}

function BookingsChart({ rows, bookings }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  const replied = bookings.filter((booking) => booking.customerReplied).length;

  return (
    <div className="p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <CompactStat label="Bookings" value={bookings.length} tone="moss" />
        <CompactStat label="Replied" value={replied} tone="amber" />
        <CompactStat label="No reply" value={bookings.length - replied} tone="teal" />
      </div>
      <div className="mt-5">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--color-ink-4)]">
              Weekly bookings
            </p>
            <div className="flex items-center gap-3 text-[10px] text-[color:var(--color-ink-4)]">
              <LegendDot tone="amber" label="Due soon" />
              <LegendDot tone="clay" label="Passed" />
            </div>
          </div>
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[72px_1fr_34px] items-center gap-3">
                <span className="text-[11px] text-[color:var(--color-ink-4)]">{row.displayLabel}</span>
                <div className="flex h-8 overflow-hidden rounded-lg bg-[color:var(--color-canvas-sunk)]">
                  <Segment value={row.dueSoon} total={row.count} max={max} color="var(--color-amber)" />
                  <Segment value={row.passed} total={row.count} max={max} color="var(--color-clay)" />
                </div>
                <span className="text-right text-[12px] font-medium tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Segment({ value, total, max, color }) {
  if (!value) return null;
  return (
    <div
      className="h-full transition-[width] duration-200"
      style={{
        width: `${(value / total) * Math.max((total / max) * 100, 4)}%`,
        backgroundColor: color,
      }}
    />
  );
}

function LegendDot({ tone, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ backgroundColor: `var(--color-${tone})` }} />
      {label}
    </span>
  );
}

function BookingsTable({ bookings, sort, onSortChange, returnTo }) {
  return (
    <div>
      <TableToolbar
        label={`${bookings.length} bookings`}
        sortLabel={sort === 'desc' ? 'Newest first' : 'Oldest first'}
        onSortToggle={() => onSortChange(sort === 'desc' ? 'asc' : 'desc')}
      />
      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full text-left text-[12px]">
          <thead className="bg-[color:var(--color-canvas-sunk)]/70 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
            <tr>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-3 py-3 font-medium">Campaign</th>
              <th className="px-3 py-3 font-medium">Car</th>
              <th className="px-3 py-3 font-medium">Contacted</th>
              <th className="px-3 py-3 font-medium">Booked</th>
              <th className="px-3 py-3 font-medium">Replied</th>
            </tr>
          </thead>
          <tbody className="divide-y rule">
            {bookings.map((booking) => (
              <tr key={`${booking.number}-${booking.registration}-${booking.customer_id}`} className="hover:bg-[color:var(--color-canvas-sunk)]/45">
                <td className="px-5 py-3">
                  <Link
                    to={`/customers/${booking.number}`}
                    state={{ returnTo }}
                    className="font-medium text-[color:var(--color-ink)] transition-colors hover:text-[color:var(--color-clay)]"
                  >
                    {booking.name}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <CampaignBadge type={booking.campaignType} />
                </td>
                <td className="px-3 py-3">
                  <div className="font-mono text-[11px]">{booking.registration}</div>
                  <div className="text-[10px] text-[color:var(--color-ink-4)]">
                    {booking.station || (booking.calendarMatched ? '' : 'In-chat booking')}
                  </div>
                </td>
                <td className="px-3 py-3 text-[color:var(--color-ink-3)]">{booking.whatsappSentLocal ? 'Yes' : '—'}</td>
                <td className="px-3 py-3 text-[color:var(--color-ink-3)]">Yes</td>
                <td className="px-3 py-3">
                  {booking.customerReplied ? (
                    <span className="font-medium text-[color:var(--color-amber)]">Yes</span>
                  ) : (
                    <span className="text-[color:var(--color-ink-4)]">No reply</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BookingSummary({ summary }) {
  const byCampaign = summary.bookingsAfterWhatsAppByCampaign || {};

  return (
    <aside className="space-y-4">
      <div className="card p-5">
        <h2 className="text-sm font-medium">Booking summary</h2>
        <div className="mt-4 rounded-xl bg-[color:var(--color-canvas-sunk)] p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-4)]">
            Bookings
          </p>
          <p className="mt-2 font-display text-[50px] leading-none text-[color:var(--color-moss)]">
            {formatNumber(summary.totalAttributedBookings)}
          </p>
          <p className="mt-2 text-[12px] text-[color:var(--color-ink-3)]">
            Vehicles booked after WhatsApp outreach.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium">Campaign split</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <CompactStat label="Due soon" value={byCampaign.due_soon || 0} tone="amber" />
          <CompactStat label="Passed" value={byCampaign.passed || 0} tone="clay" />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium">Reply split</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <CompactStat label="Replied" value={summary.bookingsAfterWhatsAppReplied} tone="amber" />
          <CompactStat label="No reply" value={summary.bookingsAfterWhatsAppSilent} tone="teal" />
        </div>
      </div>
    </aside>
  );
}

function SendTimeChart({ rows }) {
  const heatmap = buildSendHeatmap(rows);
  const maxSent = Math.max(...rows.map((row) => row.sent || 0), 1);

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--color-ink-4)]">
          Weekday / hour heatmap
        </p>
        <div className="flex items-center gap-3 text-[10px] text-[color:var(--color-ink-4)]">
          <LegendDot tone="amber" label="Replies" />
          <LegendDot tone="moss" label="Bookings" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid min-w-[720px] gap-2"
          style={{ gridTemplateColumns: `72px repeat(${heatmap.hours.length}, minmax(58px, 1fr))` }}
        >
          <div />
          {heatmap.hours.map((hour) => (
            <div key={hour} className="text-center text-[10px] text-[color:var(--color-ink-4)]">
              {hour}:00
            </div>
          ))}
          {heatmap.days.map((day) => (
            <HeatmapRow key={day} day={day} hours={heatmap.hours} rows={heatmap.byDayHour} maxSent={maxSent} />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-4">
        {rows.slice(0, 4).map((row) => (
          <div key={row.key} className="rounded-xl border rule bg-[color:var(--color-canvas-sunk)]/45 p-3">
            <p className="font-medium">{row.key}:00</p>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
              <MiniMetric label="Sent" value={row.sent} />
              <MiniMetric label="Replies" value={row.replied} />
              <MiniMetric label="Bookings" value={row.totalAttributedBookings} tone="moss" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapRow({ day, hours, rows, maxSent }) {
  return (
    <>
      <div className="flex items-center text-[11px] font-medium text-[color:var(--color-ink-3)]">{day}</div>
      {hours.map((hour) => {
        const row = rows.get(`${day} ${hour}`);
        const intensity = row ? Math.max(row.sent / maxSent, 0.08) : 0;
        return (
          <div
            key={`${day}-${hour}`}
            className="min-h-16 rounded-xl border rule p-2 transition-colors duration-150 hover:border-[color:var(--color-rule-strong)]"
            style={{
              backgroundColor: row
                ? `color-mix(in srgb, var(--color-amber) ${Math.round(intensity * 24)}%, var(--color-canvas-raised))`
                : 'var(--color-canvas-sunk)',
            }}
          >
            {row ? (
              <>
                <div className="text-[12px] font-medium tabular-nums">{row.sent}</div>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="text-[color:var(--color-amber)]">{row.replied} r</span>
                  <span className="text-[color:var(--color-moss)]">{row.totalAttributedBookings} b</span>
                </div>
                <div className="mt-1 text-[9px] text-[color:var(--color-ink-4)]">
                  {formatPercent(row.replyRate)}
                </div>
              </>
            ) : (
              <span className="text-[10px] text-[color:var(--color-ink-5)]">—</span>
            )}
          </div>
        );
      })}
    </>
  );
}

function SendTimesTable({ windows, sort, onSortChange }) {
  return (
    <div>
      <TableToolbar
        label={`${windows.length} windows`}
        sortLabel={sort === 'desc' ? 'Highest reply rate' : 'Lowest reply rate'}
        onSortToggle={() => onSortChange(sort === 'desc' ? 'asc' : 'desc')}
      />
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-[12px]">
          <thead className="bg-[color:var(--color-canvas-sunk)]/70 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
            <tr>
              <th className="px-5 py-3 font-medium">Send time</th>
              <th className="px-3 py-3 font-medium">Sent</th>
              <th className="px-3 py-3 font-medium">Replies</th>
              <th className="px-3 py-3 font-medium">Reply rate</th>
              <th className="px-5 py-3 font-medium">Bookings</th>
            </tr>
          </thead>
          <tbody className="divide-y rule">
            {windows.map((window) => (
              <tr key={window.key} className="hover:bg-[color:var(--color-canvas-sunk)]/45">
                <td className="px-5 py-3 font-medium">{window.key}:00</td>
                <td className="px-3 py-3 tabular-nums">{formatNumber(window.sent)}</td>
                <td className="px-3 py-3 tabular-nums">{formatNumber(window.replied)}</td>
                <td className="px-3 py-3 font-medium tabular-nums text-[color:var(--color-amber)]">
                  {formatPercent(window.replyRate)}
                </td>
                <td className="px-5 py-3 font-medium tabular-nums text-[color:var(--color-moss)]">
                  {formatNumber(window.totalAttributedBookings)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableToolbar({ label, sortLabel, onSortToggle }) {
  return (
    <div className="flex items-center justify-between border-b rule bg-[color:var(--color-canvas-sunk)]/25 px-5 py-3">
      <Badge tone="neutral">{label}</Badge>
      <button
        type="button"
        onClick={onSortToggle}
        className="rounded-lg border rule bg-[color:var(--color-canvas-raised)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--color-ink-3)] transition-colors duration-150 hover:text-[color:var(--color-ink)]"
      >
        {sortLabel}
      </button>
    </div>
  );
}

function CompactStat({ label, value, tone }) {
  return (
    <div className="rounded-xl border rule bg-[color:var(--color-canvas-sunk)]/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-ink-4)]">
        {label}
      </p>
      <p className="mt-2 font-display text-[30px] leading-none" style={{ color: `var(--color-${tone})` }}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

function MiniMetric({ label, value, tone }) {
  return (
    <div className="rounded-lg border rule bg-[color:var(--color-canvas-raised)] px-2 py-1.5">
      <p className="text-[9px] text-[color:var(--color-ink-4)]">{label}</p>
      <p className={`mt-0.5 font-medium tabular-nums ${tone === 'moss' ? 'text-[color:var(--color-moss)]' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function CampaignBadge({ type }) {
  if (type === 'due_soon') return <Badge tone="amber">Due soon</Badge>;
  if (type === 'passed') return <Badge tone="clay">Passed</Badge>;
  return <Badge tone="neutral">Other</Badge>;
}

function formatReminderStages(stages) {
  const labels = {
    first_contact: 'first',
    reminder_1d: 'second',
    reminder_3d: 'final',
    first_followup: 'second',
    second_followup: 'final',
    final_followup: 'final',
  };
  const rows = Object.entries(stages || {}).filter(([, value]) => Number(value) > 0);
  if (!rows.length) return '—';
  return rows
    .map(([stage, value]) => `${labels[stage] || stage}: ${formatNumber(value)}`)
    .join(' · ');
}

function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
  );
}

function buildBookingChartRows(bookings) {
  const grouped = new Map();
  for (const booking of bookings) {
    const key = dateKey(booking.dorisBookingCreatedAt);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: shortDate(booking.dorisBookingCreatedAt),
        count: 0,
        dueSoon: 0,
        passed: 0,
        other: 0,
      });
    }
    const row = grouped.get(key);
    row.count++;
    if (booking.campaignType === 'due_soon') row.dueSoon++;
    else if (booking.campaignType === 'passed') row.passed++;
    else row.other++;
  }
  return Array.from(grouped.values())
    .sort((a, b) => new Date(a.key) - new Date(b.key))
    .map((row) => ({
      ...row,
      displayLabel: workWeekLabel(row.key),
    }));
}

function buildSendHeatmap(rows) {
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const byDayHour = new Map();
  const hours = new Set();
  const days = new Set();

  for (const row of rows) {
    const [day, hour] = String(row.key || '').split(' ');
    if (!day || !hour) continue;
    hours.add(hour);
    days.add(day);
    byDayHour.set(`${day} ${hour}`, row);
  }

  return {
    days: dayOrder.filter((day) => days.has(day)),
    hours: Array.from(hours).sort((a, b) => Number(a) - Number(b)),
    byDayHour,
  };
}

function dateKey(value) {
  if (!value) return 'unknown';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const keyed = {};
  for (const part of parts) keyed[part.type] = part.value;
  return `${keyed.year}-${keyed.month}-${keyed.day}`;
}

function shortDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function workWeekLabel(value) {
  if (!value || value === 'unknown') return '—';
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) return '—';
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const sameMonth = start.getMonth() === end.getMonth();
  const startDay = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    day: 'numeric',
  }).format(start);
  const endLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    day: 'numeric',
    month: 'short',
  }).format(end);
  if (sameMonth) return `Mon-Fri ${startDay}-${endLabel}`;
  const startLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    day: 'numeric',
    month: 'short',
  }).format(start);
  return `Mon-Fri ${startLabel}-${endLabel}`;
}

function formatLocal(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-GB');
}

function formatMetric(value, format) {
  if (value === null || value === undefined) return '—';
  if (format === 'percent') return formatPercent(value);
  return formatNumber(value);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0)}%`;
}

