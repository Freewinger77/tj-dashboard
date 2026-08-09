import { Link } from 'react-router-dom';
import HelpTip from './ui/HelpTip.jsx';
import Skeleton from './ui/Skeleton.jsx';

function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function Delta({ value, suffix = '' }) {
  if (value == null || Number.isNaN(value)) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  const positive = value > 0;
  const neutral = value === 0;
  const color = neutral ? 'var(--text-muted)' : positive ? 'rgb(40,150,70)' : 'var(--secondary-red)';
  const prefix = positive ? '+' : '';
  return (
    <span style={{ color, fontWeight: 500 }}>
      {prefix}
      {typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : value}
      {suffix} from previous period
    </span>
  );
}

/** Simple SVG sparkline — RapidScreen blue */
function Sparkline({ series = [], color = 'var(--brand-logo-blue)', fill = true, height = 72 }) {
  if (!series.length) {
    return <div style={{ height, background: 'var(--surface-sunken)', borderRadius: 12 }} />;
  }
  const w = 320;
  const h = height;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = Math.max(max - min, 1);
  const pts = series.map((v, i) => {
    const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * w;
    const y = h - 8 - ((v - min) / span) * (h - 16);
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      {fill && (
        <path d={area} fill="var(--brand-logo-blue)" opacity="0.12" />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SoftCard({ children, style, className = '' }) {
  return (
    <div className={`rs-soft-card ${className}`} style={style}>
      {children}
    </div>
  );
}

function MetricTile({ label, value, delta, deltaSuffix = '%', link, hint, loading }) {
  return (
    <SoftCard style={{ padding: 20, minHeight: 132, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(0,0,0,.55)' }}>{label}</div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: '-.03em',
          marginTop: 10,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loading ? <Skeleton className="h-9 w-24" /> : value}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 12 }}>
        {link ? (
          <Link to={link.to} style={{ color: 'var(--brand-logo-indigo)', fontWeight: 500, textDecoration: 'none' }}>
            {link.label}
          </Link>
        ) : delta != null ? (
          <Delta value={delta} suffix={deltaSuffix} />
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>{hint || 'All time'}</span>
        )}
      </div>
    </SoftCard>
  );
}

/**
 * Mockup-style programme snapshot — recycles live TJ metrics into soft metric cards,
 * sparkline, and a funnel flow.
 */
export default function ProgrammeSnapshot({
  loading,
  contacted,
  sentSeries = [],
  bookingSeries = [],
  seriesLabels = [],
  overallBookings,
  bookingRate,
  replyRate,
  incremental,
  revenueImpact,
  funnel,
  campaignSplit,
  bookingDeltaPct,
  bookingRateDeltaPp,
  replyRateDeltaPp,
}) {
  const firstLabel = seriesLabels[0] || '';
  const lastLabel = seriesLabels[seriesLabels.length - 1] || '';

  return (
    <div className="rs-snapshot">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Programme snapshot</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Live metrics · same numbers as Performance · all time unless noted
          </div>
        </div>
        <Link
          to="/performance"
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--brand-logo-indigo)', textDecoration: 'none' }}
        >
          Open Performance →
        </Link>
      </div>

      <div className="rs-snapshot-grid">
        {/* Hero sparkline — Total contacted */}
        <SoftCard className="rs-snapshot-hero" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(0,0,0,.55)' }}>
              Overall bookings
              <span style={{ marginLeft: 6, verticalAlign: 'middle' }}>
                <HelpTip label="About overall bookings">
                  Registration-matched bookings after WhatsApp outreach (attributed, all time).
                </HelpTip>
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
              <span>{firstLabel}</span>
              <span>{lastLabel}</span>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            {loading ? <Skeleton className="h-20 w-full" /> : <Sparkline series={bookingSeries} height={88} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
            <div
              style={{
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: '-.03em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {loading ? <Skeleton className="h-10 w-20" /> : fmt(overallBookings)}
            </div>
            <div style={{ fontSize: 12 }}>
              <Delta value={bookingDeltaPct} suffix="%" />
            </div>
          </div>
        </SoftCard>

        <div className="rs-snapshot-tiles">
          <MetricTile
            label="Customers contacted"
            value={fmt(contacted)}
            hint="All time"
            loading={loading}
          />
          <MetricTile
            label="Booking rate"
            value={bookingRate != null ? `${fmt(bookingRate, 1)}%` : '—'}
            delta={bookingRateDeltaPp}
            deltaSuffix=" pp"
            loading={loading}
          />
          <MetricTile
            label="Reply rate"
            value={replyRate != null ? `${fmt(replyRate, 1)}%` : '—'}
            delta={replyRateDeltaPp}
            deltaSuffix=" pp"
            loading={loading}
          />
          <MetricTile
            label="Revenue impact"
            value={revenueImpact != null ? `€${fmt(revenueImpact, 0)}` : '—'}
            link={{ to: '/performance?method=incremental', label: 'View calculation' }}
            loading={loading}
          />
        </div>

        {/* Funnel flow */}
        <SoftCard className="rs-snapshot-flow" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(0,0,0,.55)', marginBottom: 16 }}>
            Outreach flow
          </div>
          {loading ? (
            <Skeleton className="h-36 w-full" />
          ) : (
            <FunnelFlow funnel={funnel} />
          )}
        </SoftCard>

        {/* Campaign split waves */}
        <SoftCard className="rs-snapshot-split" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(0,0,0,.55)' }}>
            Due soon / Passed
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 12 }}>
            Bookings by campaign · weekly
          </div>
          {loading ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <>
              <DualWave dueSeries={campaignSplit?.due || []} passedSeries={campaignSplit?.passed || []} />
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--brand-logo-blue)' }} />
                  Due soon · {fmt(campaignSplit?.dueTotal)}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(79,80,127,.55)' }} />
                  Passed · {fmt(campaignSplit?.passedTotal)}
                </span>
              </div>
              <div style={{ marginTop: 14, fontSize: 13 }}>
                Incremental lift{' '}
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(incremental, 0)}</b>
                <span style={{ color: 'var(--text-muted)' }}> all-time</span>
              </div>
            </>
          )}
        </SoftCard>
      </div>
    </div>
  );
}

function FunnelFlow({ funnel }) {
  const steps = [
    { key: 'sent', label: 'Sent', color: 'var(--brand-logo-blue)', n: funnel?.sent ?? 0 },
    { key: 'delivered', label: 'Delivered', color: 'rgb(125,187,255)', n: funnel?.delivered ?? 0 },
    { key: 'replied', label: 'Replied', color: 'var(--secondary-green)', n: funnel?.replied ?? 0 },
    { key: 'booked', label: 'Booked', color: 'var(--brand-logo-indigo)', n: funnel?.booked ?? 0 },
  ];
  const max = Math.max(...steps.map((s) => s.n), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, minHeight: 140 }}>
      {steps.map((step, i) => {
        const h = Math.max(18, Math.round((step.n / max) * 120));
        return (
          <div key={step.key} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: '70%',
                  height: h,
                  borderRadius: 10,
                  background: step.color,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.04)',
                }}
                title={`${step.label}: ${fmt(step.n)}`}
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{step.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(step.n)}
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                aria-hidden
                style={{
                  width: 18,
                  alignSelf: 'center',
                  marginBottom: 36,
                  height: 2,
                  background: 'linear-gradient(90deg, rgba(0,0,0,.12), rgba(0,0,0,.04))',
                  borderRadius: 2,
                  flex: 'none',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DualWave({ dueSeries, passedSeries }) {
  const w = 280;
  const h = 100;
  const len = Math.max(dueSeries.length, passedSeries.length, 1);
  const due = dueSeries.length ? dueSeries : Array(len).fill(0);
  const passed = passedSeries.length ? passedSeries : Array(len).fill(0);
  const max = Math.max(...due, ...passed, 1);

  const pathFor = (series) => {
    const pts = series.map((v, i) => {
      const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * w;
      const y = h - 6 - (v / max) * (h - 14);
      return [x, y];
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
    const area = `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
    return { line, area };
  };

  const d = pathFor(due);
  const p = pathFor(passed);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={100} preserveAspectRatio="none" aria-hidden>
      <path d={d.area} fill="var(--brand-logo-blue)" opacity="0.14" />
      <path d={p.area} fill="rgba(79,80,127,.18)" />
      <path d={d.line} fill="none" stroke="var(--brand-logo-blue)" strokeWidth="2.25" strokeLinejoin="round" />
      <path d={p.line} fill="none" stroke="rgba(79,80,127,.7)" strokeWidth="2.25" strokeLinejoin="round" />
    </svg>
  );
}
