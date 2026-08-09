import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  MessageSquareReply,
  PauseCircle,
  Play,
} from 'lucide-react';
import {
  expireOverdueReminders,
  fetchAnalytics,
  fetchCustomers,
  fetchLeadPoolSummary,
  fetchMeasurement,
  fetchStats,
  getAutoSend,
  getStationPause,
  setStationPause,
} from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { useLocale } from '../lib/locale.js';
import Skeleton from '../components/ui/Skeleton.jsx';
import { ToastContainer, useToast } from '../components/ui/Toast.jsx';

function greetingKey(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Helsinki' }).format(date)
  );
  if (hour < 12) return 'goodMorning';
  if (hour < 17) return 'goodAfternoon';
  return 'goodEvening';
}

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

function helsinkiDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Helsinki',
  }).format(date);
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

export default function TodayPage() {
  const { t } = useLocale();
  const { toasts, addToast, removeToast } = useToast();
  const queryClient = useQueryClient();

  const statsQ = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 60_000 });
  const analyticsQ = useQuery({ queryKey: ['analytics'], queryFn: fetchAnalytics, refetchInterval: 5 * 60_000 });
  const measurementQ = useQuery({ queryKey: ['measurement'], queryFn: () => fetchMeasurement(), staleTime: 5 * 60_000 });
  const autoSendQ = useQuery({ queryKey: ['auto-send'], queryFn: getAutoSend, refetchInterval: 30_000 });
  const stationsQ = useQuery({ queryKey: ['station-pause'], queryFn: getStationPause, refetchInterval: 30_000 });
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

  const resumeMutation = useMutation({
    mutationFn: ({ stationId }) => setStationPause(stationId, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-pause'] });
      addToast('Station resumed', 'success');
    },
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
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

  const campaignLabel = [
    dueSoonOn ? 'Due soon' : null,
    passedOn ? 'Passed' : null,
  ].filter(Boolean).join(' · ') || 'None';

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

  const weekBooked = useMemo(() => {
    const bookings = analyticsQ.data?.bookingsAfterWhatsApp || [];
    const weekStart = startOfHelsinkiWeek().getTime();
    return bookings.filter((b) => {
      const ts = Date.parse(b.dorisBookingCreatedAt || b.appointmentAt || 0);
      return Number.isFinite(ts) && ts >= weekStart;
    }).length;
  }, [analyticsQ.data]);

  const deliveredRate = pct(total.delivered, total.sent);
  const weekDelivered = week.sent && deliveredRate != null
    ? Math.round((week.sent * deliveredRate) / 100)
    : null;

  const needsItems = [];
  if (needsReply.length > 0) {
    const oldest = needsReply[0];
    needsItems.push({
      key: 'replies',
      icon: MessageSquareReply,
      title: `${needsReply.length} ${needsReply.length === 1 ? 'reply' : 'replies'} waiting for a person`,
      detail: oldest?.last_inbound_at
        ? `Oldest has waited ${relativeTime(oldest.last_inbound_at).replace(' ago', '')}`
        : 'Open Conversations to answer',
      actionLabel: 'Open',
      to: '/conversations?status=replied&sort=last_inbound_at',
      tone: 'amber',
    });
  }
  for (const station of pausedStations) {
    needsItems.push({
      key: `pause-${station.station_id}`,
      icon: PauseCircle,
      title: `${station.station_name} is paused`,
      detail: 'No first contacts or reminders send while a station is off.',
      actionLabel: 'Resume',
      onAction: () => resumeMutation.mutate({ stationId: station.station_id }),
      tone: 'sienna',
    });
  }
  if (overdue > 0) {
    needsItems.push({
      key: 'overdue',
      icon: Clock,
      title: `${fmt(overdue)} reminders are overdue`,
      detail: 'Expire them before the scheduler picks them up.',
      actionLabel: 'Expire',
      onAction: () => expireMutation.mutate(),
      tone: 'amber',
    });
  }
  if (failed.length > 0) {
    const first = failed[0];
    needsItems.push({
      key: 'failed',
      icon: AlertTriangle,
      title: `${failed.length} message${failed.length === 1 ? '' : 's'} failed to deliver`,
      detail: first?.number ? `Latest · ${first.number}` : 'Review failed deliveries',
      actionLabel: 'Review',
      to: '/conversations?status=failed',
      tone: 'sienna',
    });
  }

  const loading = statsQ.isLoading || autoSendQ.isLoading || stationsQ.isLoading;
  const updatedAt = analyticsQ.data?.generated_at || measurementQ.data?.generated_at;

  const leadPool = leadPoolQ.data;
  const remaining = leadPool?.eligible_remaining ?? leadPool?.remaining ?? null;
  const byStation = leadPool?.by_station || leadPool?.stations || [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]">
            {t(greetingKey())}
          </h1>
          <p className="mt-2 text-[13px] text-[color:var(--color-ink-3)]">
            {helsinkiDateLabel()}
            {updatedAt && (
              <span className="text-[color:var(--color-ink-4)]">
                {' '}
                · updated{' '}
                {new Intl.DateTimeFormat('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Helsinki',
                }).format(new Date(updatedAt))}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/controls" className="btn-primary">
            {t('sendBatch')}
          </Link>
          <Link to="/controls" className="btn-ghost">
            {t('pauseAll')}
          </Link>
        </div>
      </header>

      <section className="panel animate-fade-up-delay-1 overflow-hidden">
        {loading ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="grid gap-0 sm:grid-cols-[1.2fr_1fr]">
            <div className="border-b rule p-5 sm:border-b-0 sm:border-r">
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'size-2 rounded-full',
                    outreachOn ? 'bg-[color:var(--color-moss)]' : 'bg-[color:var(--color-ink-5)]',
                  ].join(' ')}
                />
                <h2 className="text-[15px] font-semibold">
                  {outreachOn ? t('outreachRunning') : t('outreachPaused')}
                </h2>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-[color:var(--color-ink-4)]">Campaigns</dt>
                  <dd className="mt-0.5 font-medium">{campaignLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[color:var(--color-ink-4)]">Stations</dt>
                  <dd className="mt-0.5 font-medium">
                    {stations.length ? `${sendingCount} of ${stations.length} sending` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[color:var(--color-ink-4)]">Next batch</dt>
                  <dd className="mt-0.5 font-medium">
                    {outreachOn ? '08:00–18:00 · every 2h' : 'Scheduler off'}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="flex items-center justify-between gap-3 p-5">
              <div>
                <div className="text-[11px] text-[color:var(--color-ink-4)]">This week so far</div>
                <div className="mt-1 font-display text-[28px] font-semibold tabular-nums leading-none">
                  {fmt(week.sent)}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
                  sent · {fmt(week.replied)} replied
                </div>
              </div>
              <Link
                to="/controls"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--brand-logo-indigo)] hover:underline"
              >
                Controls <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="animate-fade-up-delay-2 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{t('needsYou')}</h2>
          <span className="text-[12px] text-[color:var(--color-ink-4)]">
            {needsItems.length} item{needsItems.length === 1 ? '' : 's'}
          </span>
        </div>
        {needsItems.length === 0 ? (
          <div className="panel px-5 py-6 text-[13px] text-[color:var(--color-ink-3)]">
            Nothing waiting — outreach queue is clear.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--color-rule)] overflow-hidden rounded-xl border rule">
            {needsItems.map((item) => {
              const Icon = item.icon;
              const action = item.to ? (
                <Link to={item.to} className="btn-ghost !py-1.5 !text-[12px]">
                  {item.actionLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={item.onAction}
                  className="btn-ghost !py-1.5 !text-[12px]"
                >
                  {item.actionLabel === 'Resume' ? <Play size={12} /> : null}
                  {item.actionLabel}
                </button>
              );
              return (
                <li key={item.key} className="flex items-start gap-3 bg-[color:var(--color-canvas)] px-4 py-3.5 sm:px-5">
                  <div
                    className={[
                      'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                      item.tone === 'sienna'
                        ? 'bg-[color:var(--color-sienna-soft)] text-[color:var(--color-sienna)]'
                        : 'bg-[color:var(--color-amber-soft)] text-[color:var(--color-amber)]',
                    ].join(' ')}
                  >
                    <Icon size={15} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{item.title}</div>
                    <div className="mt-0.5 text-[12px] text-[color:var(--color-ink-3)]">{item.detail}</div>
                  </div>
                  {action}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">{t('thisWeek')}</h2>
            <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
              Every number below is on this calendar week
            </p>
          </div>
          <Link
            to="/performance"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--brand-logo-indigo)] hover:underline"
          >
            Performance <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Sent" value={fmt(week.sent)} />
          <MetricCard
            label="Delivered"
            value={fmt(weekDelivered)}
            hint={deliveredRate != null ? `${deliveredRate}% of sent (all-time rate)` : undefined}
          />
          <MetricCard
            label="Replied"
            value={fmt(week.replied)}
            hint={week.sent ? `${pct(week.replied, week.sent)}% of sent` : undefined}
          />
          <MetricCard
            label="Booked"
            value={fmt(weekBooked)}
            hint={week.sent ? `${pct(weekBooked, week.sent)}% of sent` : undefined}
          />
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">{t('valueOfProgramme')}</h2>
            <p className="mt-1 text-[12px] text-[color:var(--color-ink-4)]">
              All time · {fmt(headline?.leads_contacted)} customers contacted
            </p>
          </div>
          <Link
            to="/performance?method=incremental"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--brand-logo-indigo)] hover:underline"
          >
            Details <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
          <div>
            <div className="text-[11px] text-[color:var(--color-ink-4)]">Incremental bookings</div>
            <div className="mt-1 font-display text-[36px] font-semibold leading-none tabular-nums tracking-tight">
              {fmt(headline?.bookings_incremental, 0)}
            </div>
            <p className="mt-2 max-w-md text-[12px] text-[color:var(--color-ink-3)]">
              Bookings above what the control arm would have produced on its own.
            </p>
          </div>
          <div className="sm:text-right">
            <div className="font-display text-[28px] font-semibold tabular-nums">
              {headline?.multiplier != null ? `${Number(headline.multiplier).toFixed(2)}×` : '—'}
            </div>
            <div className="text-[12px] text-[color:var(--color-ink-3)]">the control rate</div>
            <div className="mt-3 flex flex-wrap gap-3 text-[12px] sm:justify-end">
              <span>
                Due soon{' '}
                <strong className="font-semibold">
                  {byType.due_soon?.multiplier != null
                    ? `${Number(byType.due_soon.multiplier).toFixed(2)}×`
                    : '—'}
                </strong>
              </span>
              <span>
                Passed{' '}
                <strong className="font-semibold">
                  {byType.passed?.multiplier != null
                    ? `${Number(byType.passed.multiplier).toFixed(2)}×`
                    : '—'}
                </strong>
              </span>
            </div>
          </div>
        </div>
        {!measurementQ.data?.freshness?.holdout_table_ready && (
          <p className="mt-4 text-[11px] text-[color:var(--color-ink-4)]">
            Control arm is observational until the holdout table is installed.
          </p>
        )}
      </section>

      {(remaining != null || byStation.length > 0) && (
        <section className="space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold">Leads left to contact</h2>
            <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">due soon · eligible pool</p>
          </div>
          <div className="panel p-5">
            <div className="font-display text-[28px] font-semibold tabular-nums">
              {fmt(remaining ?? leadPool?.eligible_total)}
            </div>
            {Array.isArray(byStation) && byStation.length > 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {byStation.slice(0, 6).map((row) => {
                  const name = row.station_name || row.name || `Station ${row.station_id}`;
                  const count = row.remaining ?? row.count ?? row.eligible ?? 0;
                  const paused = stations.find((s) => String(s.station_id) === String(row.station_id))?.paused;
                  return (
                    <li
                      key={name}
                      className={[
                        'flex items-center justify-between text-[13px]',
                        paused ? 'text-[color:var(--color-ink-4)]' : '',
                      ].join(' ')}
                    >
                      <span>
                        {name}
                        {paused ? ' · paused' : ''}
                      </span>
                      <span className="tabular-nums font-medium">{fmt(count)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="panel px-4 py-4">
      <div className="text-[11px] text-[color:var(--color-ink-4)]">{label}</div>
      <div className="mt-1 font-display text-[26px] font-semibold leading-none tabular-nums tracking-tight">
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-[color:var(--color-ink-3)]">{hint}</div>}
    </div>
  );
}
