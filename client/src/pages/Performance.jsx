import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAnalytics,
  fetchMeasurement,
  fetchStats,
  getStationPause,
  pollMessageStatuses,
} from '../lib/api.js';
import { PageHeader } from '../components/layout/Shell.jsx';

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
  if (period === 'week') return `${fmtDate(startOfHelsinkiWeek(now))} – ${fmtDate(now)}`;
  if (period === 'month') return `${fmtDate(startOfHelsinkiMonth(now))} – ${fmtDate(now)}`;
  return 'All reachable due_soon / passed leads';
}

export default function PerformancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = PERIODS.some((p) => p.key === searchParams.get('period'))
    ? searchParams.get('period')
    : 'week';
  const method = searchParams.get('method') === 'attributed' ? 'attributed' : 'incremental';

  const setParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, val);
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
    period === 'all' ? summary.bookingsAfterWhatsApp ?? bookings.length : periodBookings.length;
  const silentBookings = periodBookings.filter((b) => !b.customerReplied).length;
  const incremental = measurement?.headline?.bookings_incremental;
  const hero = method === 'incremental' ? incremental : attributedCount;

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
    return rows.map(([, v]) => ({
      d: `${Math.max(2, Math.round((v.due / max) * 100))}%`,
      p: `${Math.max(0, Math.round((v.passed / max) * 100))}%`,
    }));
  }, [bookings]);

  const byStation = measurement?.by_station || [];
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

  return (
    <>
      <PageHeader
        title="Performance"
        subtitle="Every panel on this page uses the period below"
        actions={
          <>
            {periodControls}
            <button type="button" className="rs-btn">
              Export
            </button>
          </>
        }
      />

      {/* Mobile period chips */}
      <div
        className="flex lg:hidden"
        style={{
          flex: 'none',
          gap: 8,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
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
                  aria-pressed={method === 'incremental'}
                  onClick={() => setParam('method', 'incremental')}
                >
                  Incremental
                </button>
                <button
                  type="button"
                  aria-pressed={method === 'attributed'}
                  onClick={() => setParam('method', 'attributed')}
                >
                  Attributed
                </button>
              </div>
            </div>
          </div>

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
                      }}
                    >
                      {method === 'incremental' ? 'Incremental bookings' : 'Attributed bookings'}
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
                      {method === 'incremental' ? fmt(hero, 0) : fmt(hero)}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'rgba(0,0,0,.55)',
                        marginTop: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      {method === 'incremental' ? (
                        <>
                          Bookings above the control rate, from{' '}
                          {fmt(measurement?.headline?.leads_contacted)} contacted. Attributed count
                          is <b style={{ color: '#000' }}>{fmt(summary.bookingsAfterWhatsApp ?? bookings.length)}</b>.
                        </>
                      ) : (
                        <>
                          Registration-matched bookings after outreach. Incremental lift is{' '}
                          <b style={{ color: '#000' }}>{fmt(incremental, 0)}</b> all-time.
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
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(0,0,0,.55)' }}>
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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 8,
                        height: 190,
                        borderBottom: '1px solid var(--border-default)',
                      }}
                    >
                      {(perfBars.length
                        ? perfBars
                        : Array.from({ length: 8 }, () => ({ d: '20%', p: '10%' }))
                      ).map((b, i) => (
                        <div
                          key={i}
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
                Reply rate by weekday and hour. Darker is better.
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
              <div style={{ fontSize: 14, fontWeight: 600 }}>By station</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Bookings per 100 contacted
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 60px 60px',
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
              <span style={{ textAlign: 'right' }}>Rate</span>
            </div>
            {(Array.isArray(byStation) ? byStation : []).slice(0, 8).map((row) => {
              const name = row.station_name || row.station || '—';
              const contacted = row.leads_contacted || 0;
              const booked = row.bookings_observed || 0;
              const rate = contacted ? ((booked / contacted) * 100).toFixed(1) : '—';
              const paused = pausedIds.has(String(row.station_id));
              return (
                <div
                  key={name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 60px 60px',
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
                    {rate}
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
