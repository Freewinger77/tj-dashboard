import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  expireOverdueReminders,
  fetchAnalytics,
  fetchCustomers,
  fetchLeadPoolSummary,
  fetchMeasurement,
  fetchStats,
  getAutoSend,
  getStationPause,
  setAutoSend,
  setStationPause,
} from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { startOfHelsinkiWeek } from '../lib/helsinki.js';
import { PageHeader } from '../components/layout/Shell.jsx';
import HelpTip from '../components/ui/HelpTip.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { ToastContainer, useToast } from '../components/ui/Toast.jsx';

function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

function greeting(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/Helsinki',
    }).format(date)
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function helsinkiDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Helsinki',
  }).format(date);
}

function weekWindowLabel() {
  const start = startOfHelsinkiWeek();
  const end = new Date();
  const fmtD = (d, opts) =>
    new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'Europe/Helsinki' }).format(d);
  return `${fmtD(start, { weekday: 'short', day: 'numeric' })} – ${fmtD(end, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} · every number below is on this window`;
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { toasts, addToast, removeToast } = useToast();
  const queryClient = useQueryClient();

  const statsQ = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 60_000 });
  const analyticsQ = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetchAnalytics('all'),
    refetchInterval: 5 * 60_000,
  });
  const measurementQ = useQuery({
    queryKey: ['measurement'],
    queryFn: () => fetchMeasurement(),
    staleTime: 5 * 60_000,
  });
  const autoSendQ = useQuery({
    queryKey: ['auto-send'],
    queryFn: getAutoSend,
    refetchInterval: 30_000,
  });
  const stationsQ = useQuery({
    queryKey: ['station-pause'],
    queryFn: getStationPause,
    refetchInterval: 30_000,
  });
  const customersQ = useQuery({
    queryKey: ['customers', 'replied'],
    queryFn: () => fetchCustomers({ status: 'replied' }),
    refetchInterval: 60_000,
  });
  const failedQ = useQuery({
    queryKey: ['customers', 'failed'],
    queryFn: () => fetchCustomers({ status: 'failed' }),
    refetchInterval: 60_000,
  });
  const leadPoolQ = useQuery({
    queryKey: ['lead-pool', 'due_soon'],
    queryFn: fetchLeadPoolSummary,
    staleTime: 30 * 60_000,
  });

  const masterMutation = useMutation({
    mutationFn: async (enabled) => {
      await setAutoSend('due_soon', enabled);
      await setAutoSend('passed', enabled);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-send'] }),
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
  });

  const resumeMutation = useMutation({
    mutationFn: ({ stationId }) => setStationPause(stationId, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-pause'] });
      addToast('Station resumed', 'success');
    },
  });

  const expireMutation = useMutation({
    mutationFn: () => expireOverdueReminders(14),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['measurement'] });
      addToast(`Expired ${data?.expired ?? 0} overdue reminders`, 'success');
    },
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
  });

  const stations = stationsQ.data?.stations || [];
  const sendingCount = stations.filter((s) => !s.paused).length;
  const pausedStations = stations.filter((s) => s.paused);
  const dueSoonOn = autoSendQ.data?.auto_send_due_soon ?? false;
  const passedOn = autoSendQ.data?.auto_send_passed ?? false;
  const outreachOn = dueSoonOn || passedOn;

  const campaignLabel = [dueSoonOn ? 'Due soon' : null, passedOn ? 'Passed' : null]
    .filter(Boolean)
    .join(' · ') || 'None';

  const needsReply = useMemo(() => {
    const list = customersQ.data?.customers || [];
    return [...list].sort((a, b) => {
      const aT = a.last_inbound_at ? Date.parse(a.last_inbound_at) : 0;
      const bT = b.last_inbound_at ? Date.parse(b.last_inbound_at) : 0;
      return aT - bT;
    });
  }, [customersQ.data]);

  const failed = failedQ.data?.customers || [];
  const overdue = measurementQ.data?.ops?.overdue_reminders || 0;
  const headline = measurementQ.data?.headline;
  const byType = measurementQ.data?.by_lead_type || {};
  const week = statsQ.data?.week || {};
  const total = statsQ.data?.total || {};
  const today = statsQ.data?.today || {};

  const weekBooked = useMemo(() => {
    const bookings = analyticsQ.data?.bookingsAfterWhatsApp || [];
    const weekStart = startOfHelsinkiWeek().getTime();
    return bookings.filter((b) => {
      const ts = Date.parse(b.dorisBookingCreatedAt || b.appointmentAt || 0);
      return Number.isFinite(ts) && ts >= weekStart;
    }).length;
  }, [analyticsQ.data]);

  const deliveredRate = pct(total.delivered, total.sent);
  const weekDelivered =
    week.sent && deliveredRate != null ? Math.round((week.sent * deliveredRate) / 100) : null;

  const weekBars = useMemo(() => {
    const bookings = analyticsQ.data?.bookingsAfterWhatsApp || [];
    const map = new Map();
    for (const b of bookings) {
      const ts = Date.parse(b.dorisBookingCreatedAt || b.appointmentAt || 0);
      if (!Number.isFinite(ts)) continue;
      const key = startOfHelsinkiWeek(new Date(ts)).toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    }
    const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
    const max = Math.max(...rows.map((r) => r[1]), 1);
    return rows.map((r, i) => ({
      h: `${Math.max(8, Math.round((r[1] / max) * 100))}%`,
      c: i === rows.length - 1 ? 'var(--brand-logo-blue)' : 'rgba(79,80,127,.28)',
    }));
  }, [analyticsQ.data]);

  const poolStations = useMemo(() => {
    const leadPool = leadPoolQ.data;
    if (Array.isArray(leadPool?.by_station)) return leadPool.by_station;
    if (Array.isArray(leadPool?.stations)) return leadPool.stations;
    const counts = leadPool?.station_counts;
    if (counts && typeof counts === 'object') {
      return Object.entries(counts)
        .map(([name, n]) => ({ name, station_name: name, remaining: Number(n) || 0 }))
        .sort((a, b) => b.remaining - a.remaining);
    }
    return [];
  }, [leadPoolQ.data]);

  const tasks = [];
  if (needsReply.length > 0) {
    const oldest = needsReply[0];
    tasks.push({
      key: 'replies',
      dot: 'var(--secondary-red)',
      title: `${needsReply.length} ${needsReply.length === 1 ? 'reply' : 'replies'} waiting for a person`,
      sub: oldest?.last_inbound_at
        ? `Oldest has waited ${relativeTime(oldest.last_inbound_at).replace(/^about /, '').replace(' ago', '')}`
        : 'Open Conversations to answer',
      when: oldest?.last_inbound_at
        ? new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Helsinki',
          }).format(new Date(oldest.last_inbound_at))
        : '',
      action: 'Open',
      onAction: () => navigate('/conversations?status=replied&sort=last_inbound_at'),
    });
  }
  for (const station of pausedStations) {
    tasks.push({
      key: `pause-${station.station_id}`,
      dot: 'var(--secondary-yellow)',
      title: `${station.station_name} is paused`,
      sub: 'No first contacts or reminders send while a station is off.',
      when: '',
      action: 'Resume',
      onAction: () => resumeMutation.mutate({ stationId: station.station_id }),
    });
  }
  if (overdue > 0) {
    tasks.push({
      key: 'overdue',
      dot: 'var(--secondary-yellow)',
      title: `${fmt(overdue)} reminders are overdue`,
      sub: 'Expire them before the scheduler picks them up',
      when: '',
      action: 'Expire',
      onAction: () => expireMutation.mutate(),
    });
  }
  if (failed.length > 0) {
    const first = failed[0];
    tasks.push({
      key: 'failed',
      dot: 'var(--secondary-red)',
      title: `${failed.length} message${failed.length === 1 ? '' : 's'} failed to deliver`,
      sub: first?.number ? `${first.number} — number not on WhatsApp` : 'Review failed deliveries',
      when: '',
      action: 'Review',
      onAction: () => navigate('/conversations?status=failed'),
    });
  }

  const spendToday = today.sent ? `$${(today.sent * 0.06).toFixed(2)} · ${today.sent} messages` : '$0.00 · 0 messages';

  const leadPool = leadPoolQ.data;
  const poolTotal =
    leadPool?.total_remaining ??
    leadPool?.eligible_remaining ??
    leadPool?.remaining ??
    leadPool?.eligible_total ??
    null;
  const poolMax = Math.max(...poolStations.map((p) => p.remaining ?? p.count ?? p.eligible ?? 0), 1);
  const weeksAtPace =
    poolTotal != null && week.sent > 0 ? Math.max(1, Math.round(poolTotal / week.sent)) : null;

  const updatedAt = analyticsQ.data?.generated_at || measurementQ.data?.generated_at;
  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Helsinki',
      }).format(new Date(updatedAt))
    : null;

  const title = `${greeting()}, Pyry`;
  const subtitle = `${helsinkiDateLabel()}${updatedLabel ? ` · updated ${updatedLabel}` : ''}`;

  const weekLoading = statsQ.isLoading || analyticsQ.isLoading;
  const valueLoading = measurementQ.isLoading || analyticsQ.isLoading;
  const poolLoading = leadPoolQ.isLoading || leadPool?.status === 'running';

  const attributedTotal =
    analyticsQ.data?.summary?.bookingsAfterWhatsApp ?? headline?.bookings_observed ?? null;
  const attributedByCampaign = analyticsQ.data?.summary?.bookingsAfterWhatsAppByCampaign || {};
  const attributedDue = attributedByCampaign.due_soon ?? byType.due_soon?.bookings_observed ?? 0;
  const attributedPassed = attributedByCampaign.passed ?? byType.passed?.bookings_observed ?? 0;
  const attributedBarMax = Math.max(attributedDue, attributedPassed, 1);
  const incremental = headline?.bookings_incremental;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Link to="/controls" className="rs-btn" style={{ textDecoration: 'none' }}>
              Send a batch
            </Link>
            <button
              type="button"
              className="rs-btn-fill"
              onClick={() => masterMutation.mutate(!outreachOn)}
              disabled={masterMutation.isPending}
            >
              {outreachOn ? 'Pause all outreach' : 'Resume outreach'}
            </button>
          </>
        }
      />

      {/* Desktop Today body — exact mockup 2-col */}
      <div
        className="hidden lg:block"
        style={{ overflowY: 'auto', padding: '24px 28px 40px', flex: 1 }}
      >
        <div
          className="rs-panel"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 'var(--radius-pill)',
                background: outreachOn ? 'var(--secondary-green)' : 'rgba(0,0,0,.2)',
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {outreachOn ? 'Outreach is running' : 'Outreach is paused'}
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: 'var(--border-subtle)' }} />
          <div style={{ display: 'flex', gap: 28, flex: 1, flexWrap: 'wrap' }}>
            <Meta label="Campaigns" value={campaignLabel} />
            <Meta
              label="Stations"
              value={stations.length ? `${sendingCount} of ${stations.length} sending` : '—'}
            />
            <Meta
              label="Next batch"
              value={outreachOn ? '08:00–18:00 · every 2h' : 'Scheduler off'}
            />
            <Meta label="Spend today" value={spendToday} />
          </div>
          <Link
            to="/controls"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--brand-logo-indigo)',
              cursor: 'pointer',
              flex: 'none',
              textDecoration: 'none',
            }}
          >
            Controls →
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 400px',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
            <div className="rs-panel" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  padding: '16px 20px 14px',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>Needs you</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {tasks.length} item{tasks.length === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {tasks.length === 0 ? (
                  <div style={{ padding: '18px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
                    Nothing waiting — outreach queue is clear.
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div
                      key={t.key}
                      className="rs-hover"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '8px minmax(0,1fr) auto auto',
                        gap: 14,
                        alignItems: 'center',
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 120ms',
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 'var(--radius-pill)',
                          background: t.dot,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{t.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {t.sub}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.when}</div>
                      <button type="button" className="rs-btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={t.onAction}>
                        {t.action}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rs-panel" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  padding: '16px 20px 14px',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>This week</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {weekWindowLabel()}
                  </div>
                </div>
                <Link
                  to="/performance"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--brand-logo-indigo)',
                    textDecoration: 'none',
                  }}
                >
                  Performance →
                </Link>
              </div>
              {weekLoading ? (
                <PanelSkeleton rows={4} />
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4,1fr)',
                      alignItems: 'start',
                      padding: 20,
                    }}
                  >
                    <WeekKpi label="Sent" value={fmt(week.sent)} hint="this week" first />
                    <WeekKpi
                      label="Delivered"
                      value={fmt(weekDelivered)}
                      hint={deliveredRate != null ? `${deliveredRate}% of sent` : '—'}
                    />
                    <WeekKpi
                      label="Replied"
                      value={fmt(week.replied)}
                      hint={
                        weekDelivered
                          ? `${pct(week.replied, weekDelivered)}% of delivered`
                          : week.sent
                            ? `${pct(week.replied, week.sent)}% of sent`
                            : '—'
                      }
                    />
                    <WeekKpi
                      label="Booked"
                      value={fmt(weekBooked)}
                      hint={week.sent ? `${pct(weekBooked, week.sent)}% of sent` : '—'}
                      green
                    />
                  </div>
                  <div style={{ padding: '0 20px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
                      {(weekBars.length
                        ? weekBars
                        : Array.from({ length: 8 }, () => ({
                            h: '12%',
                            c: 'rgba(79,80,127,.18)',
                          }))
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
                          <div
                            style={{
                              borderRadius: '3px 3px 0 0',
                              height: b.h,
                              background: b.c,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 8,
                        fontSize: 10,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>8 weeks ago</span>
                      <span>bookings per week · this week highlighted</span>
                      <span>now</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="rs-panel" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Value of the programme</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                All time ·{' '}
                {valueLoading ? '…' : `${fmt(headline?.leads_contacted)} customers contacted`}
              </div>
              {valueLoading ? (
                <PanelSkeleton rows={3} />
              ) : (
                <>
                  <div
                    style={{
                      marginTop: 18,
                      background: 'var(--surface-sunken)',
                      borderRadius: 'var(--radius-md)',
                      padding: 18,
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
                      Attributed bookings
                      <HelpTip label="About attributed bookings" side="bottom">
                        Registration-matched bookings after WhatsApp outreach. The overall attributed
                        count — all time.
                      </HelpTip>
                    </div>
                    <div
                      style={{
                        fontSize: 52,
                        fontWeight: 600,
                        letterSpacing: '-.025em',
                        lineHeight: 1,
                        marginTop: 10,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmt(attributedTotal, 0)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'rgba(0,0,0,.55)',
                        marginTop: 10,
                        lineHeight: 1.45,
                      }}
                    >
                      Registration-matched after outreach. Incremental lift (excl. WA outage
                      lag) is <b style={{ color: '#000' }}>{fmt(incremental, 0)}</b>
                      {headline?.multiplier != null
                        ? ` · ${Number(headline.multiplier).toFixed(2)}× control`
                        : ''}
                      .
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ fontSize: 13, color: 'rgba(0,0,0,.55)' }}>Due soon</div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmt(attributedDue)}
                      </div>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 'var(--radius-pill)',
                        background: 'rgba(0,0,0,.06)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (attributedDue / attributedBarMax) * 100)}%`,
                          height: '100%',
                          background: 'var(--brand-logo-indigo)',
                        }}
                      />
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ fontSize: 13, color: 'rgba(0,0,0,.55)' }}>Passed</div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmt(attributedPassed)}
                      </div>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 'var(--radius-pill)',
                        background: 'rgba(0,0,0,.06)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (attributedPassed / attributedBarMax) * 100)}%`,
                          height: '100%',
                          background: 'rgba(79,80,127,.5)',
                        }}
                      />
                    </div>
                  </div>
                  <Link
                    to="/performance?method=attributed"
                    style={{
                      marginTop: 16,
                      display: 'inline-block',
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--brand-logo-indigo)',
                      textDecoration: 'none',
                    }}
                  >
                    See the breakdown →
                  </Link>
                </>
              )}
            </div>

            <div className="rs-panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Leads left to contact</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>due soon</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 600,
                    letterSpacing: '-.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {poolLoading ? <Skeleton className="h-9 w-24" /> : fmt(poolTotal)}
                </div>
                {weeksAtPace != null && !poolLoading && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ≈ {weeksAtPace} weeks at current pace
                  </div>
                )}
              </div>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {poolLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                {poolStations.length === 0 && !poolLoading && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {leadPoolQ.isError
                      ? 'Could not load lead pool'
                      : 'No remaining due-soon leads in the pool'}
                  </div>
                )}
                {poolStations.slice(0, 6).map((p) => {
                  const name = p.station_name || p.name || `Station ${p.station_id}`;
                  const n = p.remaining ?? p.count ?? p.eligible ?? 0;
                  const paused = stations.some(
                    (s) =>
                      s.paused &&
                      (String(s.station_id) === String(p.station_id) ||
                        s.station_name === name)
                  );
                  return (
                    <div
                      key={name}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '74px minmax(0,1fr) 40px',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, color: 'rgba(0,0,0,.55)' }}>{name}</span>
                      <div
                        style={{
                          height: 8,
                          borderRadius: 'var(--radius-pill)',
                          background: 'rgba(0,0,0,.06)',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 'var(--radius-pill)',
                            width: `${Math.round((n / poolMax) * 100)}%`,
                            background: paused ? 'rgba(0,0,0,.18)' : 'var(--brand-logo-indigo)',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: paused ? 'var(--text-muted)' : '#000',
                        }}
                      >
                        {fmt(n)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {pausedStations[0] && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  {pausedStations[0].station_name} greyed out — station paused.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Today — exact mockup */}
      <div
        className="block lg:hidden"
        style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 28px' }}
      >
        <div
          onClick={() => masterMutation.mutate(!outreachOn)}
          className="rs-panel"
          style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 'var(--radius-pill)',
                background: outreachOn ? 'var(--secondary-green)' : 'rgba(0,0,0,.2)',
                flex: 'none',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {outreachOn ? 'Outreach running' : 'Outreach paused'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {outreachOn
                  ? `Next batch · ${sendingCount} of ${stations.length || 0} stations`
                  : 'Scheduler off'}
              </div>
            </div>
          </div>
          <div
            style={{
              width: 44,
              height: 26,
              borderRadius: 'var(--radius-pill)',
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              flex: 'none',
              background: outreachOn ? 'var(--secondary-green)' : 'rgba(0,0,0,.14)',
              justifyContent: outreachOn ? 'flex-end' : 'flex-start',
              transition: 'background 150ms',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 'var(--radius-pill)',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                flex: 'none',
              }}
            />
          </div>
        </div>

        <div className="rs-panel" style={{ overflow: 'hidden', marginBottom: 16 }}>
          <div
            style={{
              padding: '13px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>Needs you</div>
            <div
              style={{
                minWidth: 20,
                height: 20,
                padding: '0 7px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--secondary-red)',
                color: '#fff',
                font: '600 11px/20px Inter,sans-serif',
                textAlign: 'center',
              }}
            >
              {tasks.length}
            </div>
          </div>
          {tasks.slice(0, 4).map((t) => (
            <div
              key={t.key}
              onClick={t.onAction}
              style={{
                padding: '13px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--radius-pill)',
                  flex: 'none',
                  background: t.dot,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t.sub}</div>
              </div>
              <div
                style={{
                  flex: 'none',
                  padding: '5px 11px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {t.action}
              </div>
            </div>
          ))}
        </div>

        <div className="rs-panel" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>This week</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                day: 'numeric',
                timeZone: 'Europe/Helsinki',
              }).format(startOfHelsinkiWeek())}{' '}
              –{' '}
              {new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                day: 'numeric',
                timeZone: 'Europe/Helsinki',
              }).format(new Date())}
            </div>
          </div>
          {weekLoading ? (
            <PanelSkeleton rows={2} />
          ) : (
            <>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sent</div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 600,
                      marginTop: 3,
                      letterSpacing: '-.02em',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(week.sent)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Booked</div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 600,
                      marginTop: 3,
                      letterSpacing: '-.02em',
                      color: 'rgb(40,150,70)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(weekBooked)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                {week.sent ? `${pct(weekBooked, week.sent)}% of sent booked` : '—'} ·{' '}
                {week.sent ? `${pct(week.replied, week.sent)}% replied` : '—'}
              </div>
            </>
          )}
        </div>

        <div className="rs-panel" style={{ padding: 16, marginBottom: 16 }}>
          {valueLoading ? (
            <PanelSkeleton rows={2} />
          ) : (
            <>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Attributed bookings
                <HelpTip label="About attributed bookings" side="bottom">
                  Registration-matched bookings after WhatsApp outreach. Overall count — all time.
                </HelpTip>
              </div>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 600,
                  letterSpacing: '-.03em',
                  marginTop: 8,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(attributedTotal, 0)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,.55)', marginTop: 8, lineHeight: 1.45 }}>
                Incremental lift (excl. outage lag) {fmt(incremental, 0)}
                {headline?.multiplier != null
                  ? ` · ${Number(headline.multiplier).toFixed(2)}× control`
                  : ''}
                , from {fmt(headline?.leads_contacted)} contacted.
              </div>
              <Link
                to="/performance?method=attributed"
                style={{
                  marginTop: 14,
                  display: 'inline-block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--brand-logo-indigo)',
                  textDecoration: 'none',
                }}
              >
                See the breakdown →
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function PanelSkeleton({ rows = 3 }) {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function WeekKpi({ label, value, hint, first, green, loading }) {
  return (
    <div
      style={{
        paddingLeft: first ? 0 : 20,
        paddingRight: 20,
        borderLeft: first ? undefined : '1px solid var(--border-subtle)',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: '-.02em',
          marginTop: 6,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: green ? 'rgb(40,150,70)' : '#000',
        }}
      >
        {loading ? <Skeleton className="h-9 w-16" /> : value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 4,
          minHeight: 16,
        }}
      >
        {loading ? <Skeleton className="h-3 w-20" /> : hint || '\u00a0'}
      </div>
    </div>
  );
}
