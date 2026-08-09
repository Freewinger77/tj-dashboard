import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calculator,
  GitCompareArrows,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { fetchMeasurement, fetchMeasurementRoi } from '../lib/api.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';

const TABS = [
  { key: 'value', label: 'Value' },
  { key: 'ops', label: 'Operations' },
];

function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtPct(rate, digits = 1) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

export default function MeasurementPage() {
  const [tab, setTab] = useState('value');
  const [ticket, setTicket] = useState(89);
  const [fee, setFee] = useState(12);
  const [volume, setVolume] = useState('');

  const measurementQuery = useQuery({
    queryKey: ['measurement'],
    queryFn: () => fetchMeasurement(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const data = measurementQuery.data;
  const freshness = data?.freshness;
  const headline = data?.headline;
  const stale = Boolean(freshness?.stale);

  const liveUpliftPp = useMemo(() => {
    if (!headline?.leads_contacted) return null;
    const treated = headline.treated_rate || 0;
    const control = headline.bookings_expected / headline.leads_contacted;
    return (treated - control) * 100;
  }, [headline]);

  const roiQuery = useQuery({
    queryKey: ['measurement-roi', ticket, fee, volume, liveUpliftPp],
    enabled: Boolean(data) && liveUpliftPp != null,
    queryFn: () =>
      fetchMeasurementRoi({
        ticket_price: Number(ticket) || 0,
        fee_per_booking: Number(fee) || 0,
        monthly_lead_volume: volume === '' ? undefined : Number(volume),
        uplift_pp: liveUpliftPp,
      }),
  });

  if (measurementQuery.isLoading) return <MeasurementSkeleton />;
  if (measurementQuery.isError || !data) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="Measurement could not load"
        hint="Check API logs and Supabase connectivity."
      />
    );
  }

  return (
    <div className={`space-y-6 sm:space-y-8 ${stale ? 'opacity-90' : ''}`}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[30px] sm:text-[38px] font-medium leading-none tracking-tight text-[color:var(--color-ink)]">
              Measurement
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] text-[color:var(--color-ink-3)]">
              Incremental bookings vs an observational control — what would have happened anyway.
            </p>
          </div>
          <button
            type="button"
            onClick={() => measurementQuery.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border rule px-3 py-1.5 text-[12px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
          >
            <RefreshCw size={13} strokeWidth={1.75} />
            Refresh
          </button>
        </div>

        <FreshnessBar freshness={freshness} generatedAt={data.generated_at} />

        {stale && (
          <div className="flex items-start gap-2 rounded-xl border border-[color:var(--color-amber)]/40 bg-[color:var(--color-amber-soft)] px-4 py-3 text-[13px] text-[color:var(--color-ink)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
            <div>
              <div className="font-medium">Booking capture is stale</div>
              <div className="text-[color:var(--color-ink-2)]">
                Last snapshot was {freshness.days_since_capture} days ago. Value numbers below may
                understate recent bookings — treat as provisional until a new capture lands.
              </div>
            </div>
          </div>
        )}

        <div className="inline-flex rounded-full border rule bg-[color:var(--color-canvas-sunk)] p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                'rounded-full px-3.5 py-1.5 text-[12px] transition-colors',
                tab === t.key
                  ? 'bg-[color:var(--color-canvas-raised)] text-[color:var(--color-ink)] shadow-sm'
                  : 'text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'value' ? (
        <ValueTab
          data={data}
          liveUpliftPp={liveUpliftPp}
          ticket={ticket}
          setTicket={setTicket}
          fee={fee}
          setFee={setFee}
          volume={volume}
          setVolume={setVolume}
          roi={roiQuery.data}
          roiLoading={roiQuery.isLoading}
        />
      ) : (
        <OpsTab data={data} />
      )}
    </div>
  );
}

function FreshnessBar({ freshness, generatedAt }) {
  const captureLabel = freshness?.last_capture_at
    ? new Date(freshness.last_capture_at).toLocaleString('en-GB', {
        timeZone: 'Europe/Helsinki',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'unknown';

  return (
    <div className="rounded-xl border rule bg-[color:var(--color-canvas-raised)] px-4 py-3 text-[12px] text-[color:var(--color-ink-3)] leading-relaxed">
      <span className="text-[color:var(--color-ink-2)]">Booking data last captured:</span>{' '}
      {captureLabel}
      {freshness?.days_since_capture != null && <> · {freshness.days_since_capture} days ago</>}
      {' · '}
      <span className="text-[color:var(--color-ink-2)]">Weeks excluded for incomplete capture:</span>{' '}
      {fmt(freshness?.weeks_excluded_incomplete)}
      {' · '}
      <span className="text-[color:var(--color-ink-2)]">Control arm:</span>{' '}
      {freshness?.control_arm || 'observational'}, n = {fmt(freshness?.control_n)}
      {!freshness?.holdout_table_ready && (
        <>
          {' · '}
          <span className="text-[color:var(--color-sienna)]">holdout table not installed yet</span>
        </>
      )}
      <div className="mt-1 text-[11px] text-[color:var(--color-ink-4)]">
        Report generated {generatedAt ? new Date(generatedAt).toLocaleString() : '—'}
        {freshness?.holdout_n > 0 ? ` · holdout n=${freshness.holdout_n}` : ''}
      </div>
    </div>
  );
}

function ValueTab({
  data,
  liveUpliftPp,
  ticket,
  setTicket,
  fee,
  setFee,
  volume,
  setVolume,
  roi,
  roiLoading,
}) {
  const h = data.headline;
  const ci = h.ci95_incremental || [null, null];
  const muted = data.freshness?.stale;

  return (
    <div className={`space-y-6 ${muted ? '[&_.card]:opacity-95' : ''}`}>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Incremental bookings"
          value={fmt(h.bookings_incremental, 1)}
          hint={
            ci[0] != null
              ? `95% CI ${fmt(ci[0], 1)} – ${fmt(ci[1], 1)} · ${h.bootstrap_samples} resamples`
              : 'Standardised vs observational control'
          }
          accent
        />
        <Kpi
          label="Return multiple"
          value={h.multiplier != null ? `${fmt(h.multiplier, 2)}×` : '—'}
          hint={`${fmt(h.bookings_observed)} observed vs ${fmt(h.bookings_expected, 1)} expected${
            h.lift_pp != null ? ` · +${fmt(h.lift_pp, 1)}pp` : ''
          }`}
        />
        <Kpi
          label="Lift vs TJ reminders"
          value={
            data.lift_vs_tj_reminders?.multiplier != null
              ? `${fmt(data.lift_vs_tj_reminders.multiplier, 2)}×`
              : '—'
          }
          hint={`${fmt(data.lift_vs_tj_reminders?.bookings_incremental, 1)} incremental among reminded controls`}
        />
        <Kpi
          label="Recovered lapsed"
          value={fmt(data.recovered_lapsed_customers)}
          hint="Treated bookings in overdue_365_plus"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Mini
          label="Leads contacted"
          value={fmt(h.leads_contacted)}
          sub={`treated rate ${fmtPct(h.treated_rate)}`}
        />
        <Mini
          label="Days booked earlier"
          value={
            data.days_booked_earlier?.delta_days != null
              ? `${fmt(data.days_booked_earlier.delta_days, 1)}d`
              : '—'
          }
          sub="Control mean deadline distance − treated"
        />
        <Mini
          label="Remaining opportunity"
          value={fmt(data.remaining_opportunity?.implied_bookings_at_treated_rate, 0)}
          sub={`${fmt(data.remaining_opportunity?.uncontacted_eligible)} uncontacted × treated rate`}
        />
      </section>

      <Panel
        title="Uplift by campaign"
        description="Deadline-bin standardised. Bins with n_control < 30 are excluded and footnoted."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {['due_soon', 'passed'].map((key) => {
            const row = data.by_lead_type?.[key] || {};
            return (
              <div key={key} className="rounded-xl border rule bg-[color:var(--color-canvas-sunk)] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-4)]">
                  {key}
                </div>
                <div className="mt-1 font-display text-[28px] tabular-nums text-[color:var(--color-ink)]">
                  {fmt(row.bookings_incremental, 1)}
                  <span className="ml-2 text-[16px] text-[color:var(--color-ink-3)]">
                    {row.multiplier != null ? `${fmt(row.multiplier, 2)}×` : ''}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
                  {fmt(row.bookings_observed)} / {fmt(row.leads_contacted)} contacted · expected{' '}
                  {fmt(row.bookings_expected, 1)}
                </div>
              </div>
            );
          })}
        </div>
        {h.bins_skipped > 0 && (
          <p className="mt-3 text-[12px] text-[color:var(--color-ink-4)]">
            Skipped {h.bins_skipped} bin(s) with n_control &lt; 30.
          </p>
        )}
      </Panel>

      <Panel
        title="Uplift by station"
        description="Standardised incremental bookings — never raw station booking rates."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
              <tr className="border-b rule">
                <th className="py-2 pr-3 font-medium">Station</th>
                <th className="py-2 pr-3 font-medium">Contacted</th>
                <th className="py-2 pr-3 font-medium">Observed</th>
                <th className="py-2 pr-3 font-medium">Expected</th>
                <th className="py-2 pr-3 font-medium">Incremental</th>
                <th className="py-2 font-medium">Multiple</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-rule)]">
              {(data.by_station || []).map((row) => (
                <tr key={row.station_name}>
                  <td className="py-2.5 pr-3 text-[color:var(--color-ink)]">{row.station_name}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{fmt(row.leads_contacted)}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{fmt(row.bookings_observed)}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{fmt(row.bookings_expected, 1)}</td>
                  <td className="py-2.5 pr-3 tabular-nums font-medium text-[color:var(--color-ink)]">
                    {fmt(row.bookings_incremental, 1)}
                  </td>
                  <td className="py-2.5 tabular-nums">
                    {row.multiplier != null ? `${fmt(row.multiplier, 2)}×` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="ROI calculator"
        description="Uplift defaults to the live standardised figure. Ticket price is chain-configurable."
        action={<Calculator size={14} className="text-[color:var(--color-ink-4)]" strokeWidth={1.75} />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Avg inspection ticket (€)" value={ticket} onChange={setTicket} />
          <Field label="Fee per booking (€)" value={fee} onChange={setFee} />
          <Field
            label="Monthly lead volume"
            value={volume}
            onChange={setVolume}
            placeholder={String(data.remaining_opportunity?.uncontacted_due_soon || '')}
          />
        </div>
        <div className="mt-2 text-[12px] text-[color:var(--color-ink-4)]">
          Live uplift: {liveUpliftPp != null ? `${liveUpliftPp.toFixed(2)} pp` : '—'} (treated rate −
          standardised control rate)
        </div>
        {roiLoading && !roi ? (
          <div className="mt-4 text-[13px] text-[color:var(--color-ink-3)]">Calculating…</div>
        ) : roi ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Mini label="Incremental bookings" value={fmt(roi.incremental_bookings, 1)} />
            <Mini label="Added revenue" value={`€${fmt(roi.added_revenue, 0)}`} />
            <Mini label="Wasup cost" value={`€${fmt(roi.wasup_cost, 0)}`} />
            <Mini
              label="Return multiple"
              value={roi.return_multiple != null ? `${fmt(roi.return_multiple, 2)}×` : '—'}
            />
            <Mini
              label="Break-even fee"
              value={roi.break_even_fee != null ? `€${fmt(roi.break_even_fee, 2)}` : '—'}
              sub="Max fee before service stops paying for itself"
            />
          </div>
        ) : null}
      </Panel>

      <Panel title="Deadline bins" description="Unit of comparison for treated vs control.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
              <tr className="border-b rule">
                <th className="py-2 pr-2 font-medium">Type</th>
                <th className="py-2 pr-2 font-medium">Bin</th>
                <th className="py-2 pr-2 font-medium">Treated</th>
                <th className="py-2 pr-2 font-medium">T rate</th>
                <th className="py-2 pr-2 font-medium">Control</th>
                <th className="py-2 pr-2 font-medium">C rate</th>
                <th className="py-2 font-medium">Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-rule)]">
              {(data.bins || []).map((b) => (
                <tr key={`${b.lead_type}-${b.deadline_bin}`} className={b.usable ? '' : 'opacity-50'}>
                  <td className="py-2 pr-2">{b.lead_type}</td>
                  <td className="py-2 pr-2 font-mono text-[11px]">{b.deadline_bin}</td>
                  <td className="py-2 pr-2 tabular-nums">
                    {b.bk_treated}/{b.n_treated}
                  </td>
                  <td className="py-2 pr-2 tabular-nums">{fmtPct(b.treated_rate)}</td>
                  <td className="py-2 pr-2 tabular-nums">
                    {b.bk_control}/{b.n_control}
                  </td>
                  <td className="py-2 pr-2 tabular-nums">{fmtPct(b.control_rate)}</td>
                  <td className="py-2">{b.usable ? 'yes' : 'skipped'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function OpsTab({ data }) {
  const ops = data.ops || {};
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Contacted sessions" value={fmt(ops.contacted_sessions)} />
        <Kpi label="Reply rate" value={fmtPct(ops.reply_rate)} hint="Keep this off the buyer tab" />
        <Kpi label="WA failure rate" value={fmtPct(ops.failure_rate)} />
        <Kpi
          label="Overdue reminders"
          value={fmt(ops.overdue_reminders)}
          hint={`${fmt(ops.active_cadence)} active in cadence`}
          warn={ops.overdue_reminders > 0}
        />
      </section>

      {ops.overdue_reminders > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-[color:var(--color-sienna)]/30 bg-[color:var(--color-canvas-raised)] px-4 py-3 text-[13px]">
          <ShieldAlert size={16} className="mt-0.5 text-[color:var(--color-sienna)]" strokeWidth={1.75} />
          <div>
            <div className="font-medium text-[color:var(--color-ink)]">Drain before unpausing</div>
            <div className="text-[color:var(--color-ink-3)]">
              {fmt(ops.overdue_reminders)} sessions have overdue next_reminder_at. Use{' '}
              <code className="text-[12px]">POST /api/feeder/expire-overdue-reminders</code> (default
              older than 14 days) before flipping the scheduler back on.
            </div>
          </div>
        </div>
      )}

      <Panel title="Stop reasons" description="Closed outreach sessions.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(ops.stop_reasons || {}).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-lg border rule px-3 py-2 text-[13px]">
              <span className="text-[color:var(--color-ink-3)]">{k}</span>
              <span className="tabular-nums font-medium">{fmt(v)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Message status distribution">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(ops.status_counts || {}).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-lg border rule px-3 py-2 text-[13px]">
              <span className="text-[color:var(--color-ink-3)]">{k}</span>
              <span className="tabular-nums font-medium">{fmt(v)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Capture coverage"
        description="Incomplete / known-bad weeks are excluded from capture completeness counts."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
              <tr className="border-b rule">
                <th className="py-2 pr-2 font-medium">Week</th>
                <th className="py-2 pr-2 font-medium">Station</th>
                <th className="py-2 pr-2 font-medium">Rows</th>
                <th className="py-2 pr-2 font-medium">Last capture</th>
                <th className="py-2 font-medium">Complete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-rule)]">
              {(data.coverage?.weeks || []).map((w) => (
                <tr key={`${w.station_id}-${w.appointment_week_start}`}>
                  <td className="py-2 pr-2 font-mono text-[11px]">{w.appointment_week_start}</td>
                  <td className="py-2 pr-2">{w.station_name}</td>
                  <td className="py-2 pr-2 tabular-nums">{w.rows_captured}</td>
                  <td className="py-2 pr-2">{w.last_capture || '—'}</td>
                  <td className="py-2">
                    {w.is_complete ? (
                      <span className="text-[color:var(--color-moss)]">yes</span>
                    ) : (
                      <span className="text-[color:var(--color-amber)]">
                        no{w.known_bad ? ' (flagged)' : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, description, action, children }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b rule px-5 py-4">
        <div>
          <h2 className="text-sm font-medium text-[color:var(--color-ink)]">{title}</h2>
          {description && (
            <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint, accent, warn }) {
  return (
    <div
      className={[
        'rounded-xl border rule px-4 py-3 bg-[color:var(--color-canvas-raised)]',
        warn ? 'border-[color:var(--color-sienna)]/40' : '',
      ].join(' ')}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-4)]">
        {label}
      </div>
      <div
        className={[
          'mt-1 font-display text-[28px] sm:text-[32px] leading-none tabular-nums',
          accent ? 'text-[color:var(--color-clay)]' : 'text-[color:var(--color-ink)]',
        ].join(' ')}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-[11px] text-[color:var(--color-ink-4)]">{hint}</div>}
    </div>
  );
}

function Mini({ label, value, sub }) {
  return (
    <div className="rounded-xl border rule px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-4)]">
        {label}
      </div>
      <div className="mt-1 font-display text-[22px] tabular-nums text-[color:var(--color-ink)]">
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-[color:var(--color-ink-4)]">{sub}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block text-[12px] text-[color:var(--color-ink-3)]">
      {label}
      <input
        className="mt-1 w-full rounded-lg border rule bg-[color:var(--color-canvas)] px-3 py-2 text-[13px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-clay)]"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
      />
    </label>
  );
}

function MeasurementSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-3 sm:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
