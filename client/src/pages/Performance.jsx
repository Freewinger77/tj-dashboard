import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAnalytics,
  fetchMeasurement,
  fetchStats,
  getStationPause,
  pollMessageStatuses,
} from '../lib/api.js';
import {
  formatHelsinkiDate,
  isCaptureStale,
  startOfHelsinkiMonth,
  startOfHelsinkiWeek,
} from '../lib/helsinki.js';
import { PageHeader } from '../components/layout/Shell.jsx';
import HelpTip from '../components/ui/HelpTip.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';

const PERIODS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All time' },
];

/** Ticket value used for incremental impact revenue. */
const AVG_TICKET_EUR = 63;

const METHOD_HELP = {
  attributed:
    'Registration-matched bookings after a WhatsApp outreach. Follows the Week / Month / All time control above.',
  incremental:
    'Extra bookings above control via deadline-bin direct standardisation on capture-observable due_soon leads (not a crude contacted÷not-contacted rate). Scaled to the selected period using the measured multiplier.',
};

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

function periodWindowLabel(period) {
  const now = new Date();
  if (period === 'week') {
    return `${formatHelsinkiDate(startOfHelsinkiWeek(now))} – ${formatHelsinkiDate(now)}`;
  }
  if (period === 'month') {
    return `${formatHelsinkiDate(startOfHelsinkiMonth(now))} – ${formatHelsinkiDate(now)}`;
  }
  return 'All reachable due_soon / passed leads';
}

export default function PerformancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const period = PERIODS.some((p) => p.key === searchParams.get('period'))
    ? searchParams.get('period')
    : 'all';
  // Default: Attributed. Incremental is opt-in and also follows the period control.
  const method = searchParams.get('method') === 'incremental' ? 'incremental' : 'attributed';

  const setParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, val);
    setSearchParams(next, { replace: true });
  };

  // Ensure default period is visible in the URL so reloads stay on All time.
  useEffect(() => {
    if (!searchParams.get('period')) {
      const next = new URLSearchParams(searchParams);
      next.set('period', 'all');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const statsQ = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 60_000 });
  const analyticsQ = useQuery({
    queryKey: ['analytics', period],
    queryFn: () => fetchAnalytics(period),
    refetchInterval: 5 * 60_000,
    placeholderData: (prev) => prev,
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

  const analyticsPeriodMismatch =
    Boolean(analyticsQ.data) && analyticsQ.data.period !== period;
  const loading =
    statsQ.isLoading ||
    measurementQ.isLoading ||
    analyticsQ.isLoading ||
    (analyticsQ.isFetching && analyticsPeriodMismatch);

  const stats = statsQ.data || {};
  const analytics = analyticsQ.data || {};
  const measurement = measurementQ.data;
  const summary = analytics.summary || {};
  const bookings = analytics.bookingsAfterWhatsApp || [];
  const sendWindows = analytics.sendTimePerformance || analytics.bestSendWindows || [];
  const stations = stationsQ.data?.stations || [];
  const pausedIds = new Set(stations.filter((s) => s.paused).map((s) => String(s.station_id)));

  // Prefer period-scoped analytics funnel; fall back to /stats calendar buckets.
  const sent = summary.contacted ?? (period === 'week' ? stats.week?.sent : period === 'month' ? stats.month?.sent : stats.total?.sent) ?? 0;
  const replied = summary.replied ?? (period === 'week' ? stats.week?.replied : period === 'month' ? stats.month?.replied : stats.total?.replied) ?? 0;
  const delivered = summary.delivered ?? (period === 'all' ? stats.total?.delivered : null);

  const cutoff =
    period === 'week'
      ? startOfHelsinkiWeek().getTime()
      : period === 'month'
        ? startOfHelsinkiMonth().getTime()
        : 0;

  // Analytics payload is already period-filtered server-side.
  const attributedCount = summary.bookingsAfterWhatsApp ?? bookings.length;
  const attributedAllTime =
    period === 'all' ? attributedCount : measurement?.headline?.bookings_observed ?? attributedCount;
  const silentBookings =
    summary.bookingsAfterWhatsAppSilent ?? bookings.filter((b) => !b.customerReplied).length;
  const multiplier = measurement?.headline?.multiplier;
  const incrementalAllTime = measurement?.headline?.bookings_incremental;
  // Scale incremental to the selected window: attributed × (1 − 1/multiplier).
  const incremental =
    period === 'all' || multiplier == null || !(multiplier > 0)
      ? incrementalAllTime
      : attributedCount * (1 - 1 / multiplier);
  const hero = method === 'incremental' ? incremental : attributedCount;

  const lastBookingAt = useMemo(() => {
    let max = 0;
    for (const b of bookings) {
      const ts = Date.parse(b.dorisBookingCreatedAt || b.bookingDetectedAt || 0);
      if (Number.isFinite(ts) && ts > max) max = ts;
    }
    return max || null;
  }, [bookings]);

  const lastCaptureAt = measurement?.freshness?.last_capture_at
    ? Date.parse(measurement.freshness.last_capture_at)
    : null;
  const bookingDataThrough = Math.max(lastBookingAt || 0, lastCaptureAt || 0) || null;

  // Only warn when capture itself is older than a week — not on a fresh Monday rollover.
  const showStaleBanner = !isNaN(cutoff) && isCaptureStale(bookingDataThrough, 7);

  const priorMonthBookings =
    period === 'month' && summary.priorMonthAttributed != null
      ? { count: summary.priorMonthAttributed }
      : null;

  const perfBars = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      const ts = Date.parse(b.dorisBookingCreatedAt || b.appointmentAt || 0);
      if (!Number.isFinite(ts)) continue;
      const key = startOfHelsinkiWeek(new Date(ts)).toISOString().slice(0, 10);
      const due = (b.campaignType || b.campaign_type || '').includes('due');
      const cur = map.get(key) || { due: 0, passed: 0 };
      if (due) cur.due += 1;
      else cur.passed += 1;
      map.set(key, cur);
    }
    const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-13);
    const max = Math.max(...rows.map(([, v]) => v.due + v.passed), 1);
    return rows.map(([weekKey, v]) => ({
      weekKey,
      d: `${Math.max(2, Math.round((v.due / max) * 100))}%`,
      p: `${Math.max(0, Math.round((v.passed / max) * 100))}%`,
      total: v.due + v.passed,
    }));
  }, [bookings]);

  // Cumulative additional revenue for Incremental view: weekly attributed × lift share × ticket.
  const revenueSeries = useMemo(() => {
    const liftShare =
      multiplier != null && multiplier > 1 ? 1 - 1 / multiplier : 0;
    const map = new Map();
    for (const b of bookings) {
      const ts = Date.parse(b.dorisBookingCreatedAt || b.appointmentAt || 0);
      if (!Number.isFinite(ts)) continue;
      const key = startOfHelsinkiWeek(new Date(ts)).toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    }
    const weeks = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-13);
    let cum = 0;
    return weeks.map(([weekKey, attributed]) => {
      const incrementalBookings = attributed * liftShare;
      const revenue = incrementalBookings * AVG_TICKET_EUR;
      cum += revenue;
      return {
        weekKey,
        attributed,
        incrementalBookings,
        revenue,
        cumulative: cum,
      };
    });
  }, [bookings, multiplier]);

  // Period-scoped station booking rates from analytics (not all-time measurement).
  const byStation = analytics.byStation || [];
  const heat = buildHeat(sendWindows);
  const bestWindow = useMemo(() => {
    let best = null;
    for (const [key, cell] of heat.cells.entries()) {
      if (!best || cell.replyRate > best.replyRate) {
        const [day, hour] = key.split('|');
        best = { day, hour: Number(hour), replyRate: cell.replyRate, sent: cell.sent || 0 };
      }
    }
    return best;
  }, [heat]);

  const periodControls = (
    <div className="rs-seg">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          aria-pressed={period === p.key}
          onClick={() => setParam('period', p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  const isIncremental = method === 'incremental';

  const handleExportReport = async () => {
    if (exporting || loading) return;
    setExporting(true);
    try {
      const { exportPerformanceReport } = await import('../lib/exportPerformanceReport.js');
      const dueSoon = measurement?.by_lead_type?.due_soon;
      const passed = measurement?.by_lead_type?.passed;
      exportPerformanceReport({
        periodLabel: PERIODS.find((p) => p.key === period)?.label || period,
        periodWindow: periodWindowLabel(period),
        method,
        attributedCount,
        attributedAllTime,
        incremental,
        multiplier: measurement?.headline?.multiplier,
        leadsContacted: measurement?.headline?.leads_contacted,
        treatedRate: measurement?.headline?.treated_rate,
        sent,
        delivered,
        replied,
        silentBookings,
        byStation,
        bestWindow,
        dueSoonRate:
          dueSoon?.leads_contacted > 0
            ? dueSoon.bookings_observed / dueSoon.leads_contacted
            : null,
        passedRate:
          passed?.leads_contacted > 0
            ? passed.bookings_observed / passed.leads_contacted
            : null,
        bookingDataThrough,
        captureStale: showStaleBanner,
        generatedAt: new Date(),
      });
    } catch (err) {
      console.error('Export report failed', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader
          title="Performance"
          subtitle="Outreach funnel, bookings, and send windows"
          actions={periodControls}
        />
        <div
          style={{ overflowY: 'auto', padding: '16px 20px 28px', flex: 1 }}
          className="lg:!px-7 lg:!pt-6 lg:!pb-10"
        >
          <PerformanceSkeleton />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Performance"
        subtitle="Outreach funnel, bookings, and send windows"
        actions={
          <>
            {periodControls}
            <button
              type="button"
              className="rs-btn"
              onClick={handleExportReport}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Export report'}
            </button>
          </>
        }
      />

      {/* Mobile period chips + export */}
      <div
        className="flex lg:hidden"
        style={{
          flex: 'none',
          gap: 8,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          alignItems: 'center',
        }}
      >
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setParam('period', p.key)}
            style={{
              flex: 'none',
              padding: '6px 13px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 12,
              whiteSpace: 'nowrap',
              border: `1px solid ${period === p.key ? '#000' : 'var(--border-default)'}`,
              background: period === p.key ? 'rgba(0,0,0,.04)' : 'transparent',
              color: period === p.key ? '#000' : 'rgba(0,0,0,.55)',
              fontWeight: period === p.key ? 500 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="rs-btn"
          onClick={handleExportReport}
          disabled={exporting}
          style={{ flex: 'none', marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }}
        >
          {exporting ? 'Exporting…' : 'Export report'}
        </button>
      </div>

      <div
        style={{
          overflowY: 'auto',
          padding: '16px 20px 28px',
          flex: 1,
        }}
        className="lg:!px-7 lg:!pt-6 lg:!pb-10"
      >
        <div className="rs-panel" style={{ overflow: 'hidden', marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Bookings from outreach</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {periodWindowLabel(period)} · Europe/Helsinki
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="hidden sm:inline" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Counting method
              </span>
              <div className="rs-seg">
                <button
                  type="button"
                  aria-pressed={method === 'attributed'}
                  onClick={() => setParam('method', 'attributed')}
                >
                  Attributed
                  <HelpTip label="About attributed bookings" side="bottom">
                    {METHOD_HELP.attributed}
                  </HelpTip>
                </button>
                <button
                  type="button"
                  aria-pressed={method === 'incremental'}
                  onClick={() => setParam('method', 'incremental')}
                >
                  Incremental
                  <HelpTip label="About incremental bookings" side="bottom">
                    {METHOD_HELP.incremental}
                  </HelpTip>
                </button>
              </div>
            </div>
          </div>

          {!isIncremental && showStaleBanner && (
            <div
              style={{
                margin: '0 0 0',
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'rgba(232, 168, 56, 0.1)',
                fontSize: 13,
                lineHeight: 1.45,
                color: 'rgba(0,0,0,.75)',
              }}
            >
              Booking capture last updated{' '}
              <b style={{ color: '#000' }}>
                {bookingDataThrough
                  ? new Intl.DateTimeFormat('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'Europe/Helsinki',
                    }).format(new Date(bookingDataThrough))
                  : '—'}
              </b>
              . Attributed numbers for this period are incomplete until you{' '}
              <Link to="/capture" style={{ color: 'var(--brand-logo-indigo)', fontWeight: 500 }}>
                run a new capture
              </Link>
              {priorMonthBookings?.count
                ? ` — ${priorMonthBookings.count} bookings were captured in the prior month.`
                : '.'}
            </div>
          )}

          <div
            className="grid"
            style={{ gridTemplateColumns: 'minmax(0,1fr)', }}
          >
            <div
              className="lg:grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr)',
              }}
            >
              <div
                className="lg:!grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                }}
              >
                <style>{`@media(min-width:1024px){.perf-hero{grid-template-columns:300px minmax(0,1fr)!important}}`}</style>
                <div className="perf-hero" style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
                  <div
                    style={{
                      padding: '24px 20px',
                      borderRight: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {isIncremental ? 'Incremental bookings' : 'Attributed bookings'}
                      <HelpTip
                        label={isIncremental ? 'About incremental bookings' : 'About attributed bookings'}
                        side="bottom"
                      >
                        {isIncremental ? METHOD_HELP.incremental : METHOD_HELP.attributed}
                      </HelpTip>
                    </div>
                    <div
                      style={{
                        fontSize: 64,
                        fontWeight: 600,
                        letterSpacing: '-.03em',
                        lineHeight: 1,
                        marginTop: 12,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmt(hero, 0)}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'rgba(0,0,0,.55)',
                        marginTop: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      {isIncremental ? (
                        <>
                          Lift above the control rate for{' '}
                          {period === 'week'
                            ? 'this week'
                            : period === 'month'
                              ? 'this month'
                              : 'all time'}
                          {multiplier != null ? ` · ${Number(multiplier).toFixed(2)}× control` : ''}
                          . Attributed in this window:{' '}
                          <b style={{ color: '#000' }}>{fmt(attributedCount)}</b>.
                        </>
                      ) : (
                        <>
                          Registration-matched bookings for{' '}
                          {period === 'week'
                            ? 'this week'
                            : period === 'month'
                              ? 'this month'
                              : 'all time'}
                          . Incremental lift for the same window:{' '}
                          <b style={{ color: '#000' }}>{fmt(incremental, 0)}</b>.
                        </>
                      )}
                    </div>
                    {!measurement?.freshness?.holdout_table_ready && (
                      <div
                        style={{
                          marginTop: 16,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          background: 'var(--surface-sunken)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--secondary-yellow)',
                          }}
                        />
                        <div style={{ fontSize: 11, color: 'rgba(0,0,0,.55)' }}>
                          Control arm is observational
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="hidden lg:block" style={{ padding: '24px 24px 20px', minWidth: 0 }}>
                    {isIncremental ? (
                      <CumulativeRevenueChart series={revenueSeries} period={period} />
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            marginBottom: 16,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              letterSpacing: '.14em',
                              textTransform: 'uppercase',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Bookings per week
                            {period !== 'all' ? ' · this period' : ' · all time'}
                          </div>
                          <div
                            style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(0,0,0,.55)' }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 2,
                                  background: 'var(--brand-logo-indigo)',
                                }}
                              />
                              Due soon
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 2,
                                  background: 'rgba(79,80,127,.42)',
                                }}
                              />
                              Passed
                            </span>
                          </div>
                        </div>
                        {perfBars.length === 0 ? (
                          <div
                            style={{
                              height: 190,
                              display: 'grid',
                              placeItems: 'center',
                              borderBottom: '1px solid var(--border-default)',
                              fontSize: 13,
                              color: 'var(--text-muted)',
                              textAlign: 'center',
                              padding: '0 16px',
                              lineHeight: 1.45,
                            }}
                          >
                            No bookings in this period yet.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-end',
                              gap: 8,
                              height: 190,
                              borderBottom: '1px solid var(--border-default)',
                            }}
                          >
                            {perfBars.map((b) => (
                              <div
                                key={b.weekKey}
                                title={`${b.weekKey} · ${b.total} bookings`}
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'flex-end',
                                  height: '100%',
                                }}
                              >
                                <div style={{ background: 'rgba(79,80,127,.42)', height: b.p }} />
                                <div style={{ background: 'var(--brand-logo-indigo)', height: b.d }} />
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              borderTop: '1px solid var(--border-subtle)',
            }}
            className="lg:!grid-cols-4"
          >
            <FunnelCell label="Sent" value={fmt(sent)} />
            <FunnelCell
              label="Delivered"
              value={fmt(delivered)}
              hint={delivered != null && sent ? `${pct(delivered, sent)}% of sent` : undefined}
            />
            <FunnelCell
              label="Replied"
              value={fmt(replied)}
              hint={sent ? `${pct(replied, sent)}% of sent` : undefined}
            />
            <FunnelCell
              label="Booked without replying"
              value={fmt(silentBookings)}
              hint={
                attributedCount
                  ? `${pct(silentBookings, attributedCount)}% of attributed`
                  : undefined
              }
            />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 20,
            alignItems: 'start',
          }}
          className="lg:!grid-cols-[minmax(0,1fr)_400px]"
        >
          <div className="rs-panel" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>When to send</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Reply rate by weekday and hour for{' '}
                {period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'all time'}.
                Darker is better.
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <HeatGrid heat={heat} />
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 14px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 13, color: 'rgba(0,0,0,.8)' }}>
                  {bestWindow ? (
                    <>
                      {bestWindow.day === 'Mon'
                        ? 'Monday'
                        : bestWindow.day === 'Tue'
                          ? 'Tuesday'
                          : bestWindow.day === 'Wed'
                            ? 'Wednesday'
                            : bestWindow.day === 'Thu'
                              ? 'Thursday'
                              : bestWindow.day === 'Fri'
                                ? 'Friday'
                                : bestWindow.day}{' '}
                      {String(bestWindow.hour).padStart(2, '0')}:00 replies at{' '}
                      <b>{Math.round(bestWindow.replyRate * 100)}%</b>
                      {bestWindow.sent ? ` · n=${bestWindow.sent}` : ''}.
                    </>
                  ) : (
                    <>Reply rates by send window — darker cells convert better.</>
                  )}
                </div>
                <Link to="/controls" className="rs-btn-fill" style={{ textDecoration: 'none', padding: '6px 12px', fontSize: 12 }}>
                  Shift the schedule
                </Link>
              </div>
            </div>
          </div>

          <div className="rs-panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                By station
                <HelpTip label="About station rates" side="left">
                  {isIncremental
                    ? 'Estimated incremental bookings for this period at each site (attributed × (1 − 1/multiplier)), using the measured control multiplier.'
                    : 'Booking rate for this period: attributed bookings ÷ contacted, shown as a percentage.'}
                </HelpTip>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {isIncremental
                  ? `${PERIODS.find((p) => p.key === period)?.label || 'Period'} · estimated incremental bookings`
                  : `${PERIODS.find((p) => p.key === period)?.label || 'Period'} · booking rate (%)`}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 60px 72px',
                gap: 8,
                padding: '10px 20px',
                background: 'var(--surface-sunken)',
                fontSize: 10,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              <span>Station</span>
              <span style={{ textAlign: 'right' }}>Sent</span>
              <span style={{ textAlign: 'right' }}>{isIncremental ? 'Lift' : 'Rate %'}</span>
            </div>
            {(Array.isArray(byStation) ? byStation : []).slice(0, 8).map((row) => {
              const name = row.station_name || row.station || '—';
              const contacted = row.contacted || row.leads_contacted || 0;
              const rateValue =
                contacted > 0 && row.bookingRate != null
                  ? row.bookingRate
                  : contacted > 0 && row.dueSoonBookingRate != null
                    ? row.dueSoonBookingRate
                    : null;
              const rateLabel = rateValue != null ? `${Number(rateValue).toFixed(1)}%` : '—';
              // Incremental tab: scale period attributed detections by the measured multiplier.
              const stationAttributed = row.bookings ?? 0;
              const stationLift =
                contacted > 0 && multiplier != null && multiplier > 0
                  ? stationAttributed * (1 - 1 / multiplier)
                  : null;
              const liftLabel =
                stationLift != null ? fmt(stationLift, stationLift < 10 ? 1 : 0) : '—';
              const paused = pausedIds.has(String(row.station_id));
              return (
                <div
                  key={row.station_id || name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 60px 72px',
                    gap: 8,
                    padding: '13px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: 13,
                    alignItems: 'center',
                    color: paused ? 'var(--text-muted)' : '#000',
                  }}
                >
                  <span>
                    {name}
                    {paused ? ' · paused' : ''}
                  </span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(contacted)}
                  </span>
                  <span
                    style={{
                      textAlign: 'right',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {isIncremental ? liftLabel : rateLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function formatEuro(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

function shortWeekLabel(weekKey) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Helsinki',
    }).format(new Date(`${weekKey}T12:00:00Z`));
  } catch {
    return weekKey;
  }
}

/** Catmull-Rom → cubic Bézier smooth path through points. */
function smoothLinePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function CumulativeRevenueChart({ series, period }) {
  const total = series.length ? series[series.length - 1].cumulative : 0;
  const w = 560;
  const h = 190;
  const padX = 8;
  const padY = 16;
  const maxY = Math.max(total, 1);

  const points = series.map((row, i) => {
    const x =
      series.length === 1
        ? w / 2
        : padX + (i / (series.length - 1)) * (w - padX * 2);
    const y = padY + (1 - row.cumulative / maxY) * (h - padY * 2);
    return { x, y, ...row };
  });
  const line = smoothLinePath(points);
  const area = line
    ? `${line} L ${points[points.length - 1].x} ${h - 4} L ${points[0].x} ${h - 4} Z`
    : '';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Additional revenue · cumulative
          {period !== 'all' ? ' · this period' : ''}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatEuro(total)}
        </div>
      </div>
      {series.length === 0 ? (
        <div
          style={{
            height: h,
            display: 'grid',
            placeItems: 'center',
            borderBottom: '1px solid var(--border-default)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          No incremental revenue in this period yet.
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Cumulative additional revenue ${formatEuro(total)}`}
            style={{ display: 'block', borderBottom: '1px solid var(--border-default)' }}
          >
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-logo-indigo)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--brand-logo-indigo)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill="url(#revFill)" />}
            <path
              d={line}
              fill="none"
              stroke="var(--brand-logo-indigo)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {points.length > 0 && (
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="3.5"
                fill="var(--brand-logo-indigo)"
              />
            )}
          </svg>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            <span>{shortWeekLabel(series[0].weekKey)}</span>
            <span style={{ color: 'rgba(0,0,0,.4)' }}>
              €{AVG_TICKET_EUR}/booking · lift share
            </span>
            <span>{shortWeekLabel(series[series.length - 1].weekKey)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function PerformanceSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="rs-panel" style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ flex: 1 }}>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" style={{ marginTop: 8 }} />
          </div>
          <Skeleton className="h-9 w-52" />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            padding: 20,
            gap: 20,
          }}
          className="lg:!grid-cols-[300px_minmax(0,1fr)]"
        >
          <div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-16 w-28" style={{ marginTop: 12 }} />
            <Skeleton className="h-3 w-full" style={{ marginTop: 16 }} />
            <Skeleton className="h-3 w-4/5" style={{ marginTop: 8 }} />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2,1fr)',
            borderTop: '1px solid var(--border-subtle)',
          }}
          className="lg:!grid-cols-4"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: '16px 20px' }}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-20" style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}
        className="lg:!grid-cols-[minmax(0,1fr)_400px]"
      >
        <div className="rs-panel" style={{ padding: 20 }}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-48" style={{ marginTop: 8 }} />
          <Skeleton className="h-56 w-full" style={{ marginTop: 20 }} />
        </div>
        <div className="rs-panel" style={{ padding: 20 }}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-36" style={{ marginTop: 8 }} />
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelCell({ label, value, hint }) {
  return (
    <div style={{ padding: '16px 20px', borderLeft: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginTop: 5,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
}

function HeatGrid({ heat }) {
  const { days, hours, cells, maxRate } = heat;
  if (!days.length) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No send-window data yet.</div>;
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `44px repeat(${hours.length}, minmax(0,1fr))`,
        gap: 5,
      }}
    >
      <div />
      {hours.map((h) => (
        <div key={h} style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          {String(h).padStart(2, '0')}
        </div>
      ))}
      {days.map((day) => (
        <div key={day} style={{ display: 'contents' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            {day.slice(0, 3)}
          </div>
          {hours.map((hour) => {
            const cell = cells.get(`${day}|${hour}`);
            const rate = cell?.replyRate ?? 0;
            const intensity = maxRate ? Math.max(rate / maxRate, 0.08) : 0.08;
            return (
              <div
                key={`${day}-${hour}`}
                title={
                  cell
                    ? `${day} ${hour}:00 · ${(rate * 100).toFixed(0)}% reply`
                    : `${day} ${hour}:00`
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 38,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  background: `rgba(79,80,127,${intensity})`,
                  color: intensity > 0.55 ? '#fff' : 'rgba(0,0,0,.55)',
                }}
              >
                {cell ? `${Math.round(rate * 100)}` : ''}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function buildHeat(rows) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  // Mockup columns — map nearby send hours into these buckets
  const hours = [9, 11, 13, 15, 17, 19];
  const raw = new Map(); // day|hourExact -> rate
  for (const row of rows || []) {
    let dayRaw = row.weekday || row.day || row.dow;
    let hour = Number(row.hour ?? row.sendHour);
    // Live analytics shape: { key: "Thu 10", replyRate: 5.5 }
    if ((dayRaw == null || Number.isNaN(hour)) && row.key) {
      const parts = String(row.key).trim().split(/\s+/);
      if (parts.length >= 2) {
        dayRaw = parts[0];
        hour = Number(parts[1]);
      }
    }
    if (!dayRaw || Number.isNaN(hour)) continue;
    const day =
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
      }[dayRaw] || String(dayRaw).slice(0, 3);
    if (!days.includes(day)) continue;
    const replyRate = row.replyRate > 1 ? row.replyRate / 100 : row.replyRate || 0;
    const key = `${day}|${hour}`;
    const prev = raw.get(key);
    // Prefer higher-volume windows when colliding
    if (!prev || (row.sent || 0) >= (prev.sent || 0)) {
      raw.set(key, { replyRate, sent: row.sent || 0 });
    }
  }

  const cells = new Map();
  let maxRate = 0;
  for (const day of days) {
    for (const displayHour of hours) {
      // Exact hour, then ±1 (so "10" lands under 09/11)
      const candidates = [displayHour, displayHour - 1, displayHour + 1]
        .map((h) => raw.get(`${day}|${h}`))
        .filter(Boolean);
      if (!candidates.length) continue;
      const best = candidates.reduce((a, b) => (b.replyRate > a.replyRate ? b : a));
      cells.set(`${day}|${displayHour}`, best);
      maxRate = Math.max(maxRate, best.replyRate);
    }
  }

  return { days, hours, cells, maxRate };
}
