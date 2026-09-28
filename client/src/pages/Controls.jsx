import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  addStation,
  fetchAnalytics,
  getAutoSend,
  getFeederProgress,
  getStationPause,
  setAutoSend,
  setStationPause,
  triggerFeeder,
} from '../lib/api.js';
import { PageHeader } from '../components/layout/Shell.jsx';
import { ToastContainer, useToast } from '../components/ui/Toast.jsx';

const COST_PER_MSG = 0.06;
const POLL_INTERVAL = 5_000;
const POLL_TIMEOUT = 5 * 60 * 1000;

function Toggle({ enabled, onToggle, disabled, size = 'desktop' }) {
  const w = size === 'mobile' ? 44 : 40;
  const h = size === 'mobile' ? 26 : 24;
  const knob = size === 'mobile' ? 20 : 18;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: w,
        height: h,
        borderRadius: 'var(--radius-pill)',
        padding: 3,
        display: 'flex',
        alignItems: 'center',
        flex: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 150ms',
        background: enabled ? 'var(--secondary-green)' : 'rgba(0,0,0,.14)',
        justifyContent: enabled ? 'flex-end' : 'flex-start',
        border: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          width: knob,
          height: knob,
          borderRadius: 'var(--radius-pill)',
          background: '#fff',
          flex: 'none',
          boxShadow: size === 'mobile' ? '0 1px 3px rgba(0,0,0,.25)' : '0 1px 2px rgba(0,0,0,.2)',
        }}
      />
    </button>
  );
}

export default function ControlsPage() {
  const { toasts, addToast, removeToast } = useToast();
  const queryClient = useQueryClient();
  const [newStationId, setNewStationId] = useState('');
  const [newStationName, setNewStationName] = useState('');

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
  const analyticsQ = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetchAnalytics('all'),
    refetchInterval: 5 * 60_000,
  });

  const autoMutation = useMutation({
    mutationFn: ({ type, enabled }) => setAutoSend(type, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-send'] }),
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
  });

  const stationMutation = useMutation({
    mutationFn: ({ stationId, paused }) => setStationPause(stationId, paused),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['station-pause'] });
      addToast(v.paused ? 'Station paused' : 'Station resumed', v.paused ? 'info' : 'success');
    },
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
  });

  const addStationMutation = useMutation({
    mutationFn: () => addStation(Number(newStationId), newStationName.trim()),
    onSuccess: () => {
      setNewStationId('');
      setNewStationName('');
      queryClient.invalidateQueries({ queryKey: ['station-pause'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      addToast('Station added as paused. Verify its data and sender before resuming it.', 'success');
    },
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
  });

  const dueSoonOn = autoSendQ.data?.auto_send_due_soon ?? false;
  const passedOn = autoSendQ.data?.auto_send_passed ?? false;
  const outreachOn = dueSoonOn || passedOn;
  const stations = stationsQ.data?.stations || [];
  const activity = analyticsQ.data?.recentSendActivity;
  const lastSentLabel = activity?.last_sent_at
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Helsinki',
      }).format(new Date(activity.last_sent_at))
    : 'No send timestamp available';

  const setMaster = (enabled) => {
    autoMutation.mutate({ type: 'due_soon', enabled });
    autoMutation.mutate({ type: 'passed', enabled });
  };

  const masterControl = (
    <div
      onClick={() => setMaster(!outreachOn)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 'var(--radius-pill)',
            background: outreachOn ? 'var(--secondary-green)' : 'rgba(0,0,0,.2)',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {outreachOn ? 'Outreach on' : 'Outreach off'}
        </span>
      </div>
      <Toggle
        enabled={outreachOn}
        disabled={autoMutation.isPending}
        onToggle={(e) => {
          e.stopPropagation();
          setMaster(!outreachOn);
        }}
      />
    </div>
  );

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <PageHeader
        title="Controls"
        subtitle="Who gets contacted, from which station, and how often."
        actions={masterControl}
      />

      <div
        style={{ overflowY: 'auto', padding: '16px 20px 28px', flex: 1 }}
        className="lg:!px-7 lg:!pt-6 lg:!pb-10"
      >
        {/* Mobile master */}
        <div
          className="rs-panel flex lg:hidden"
          onClick={() => setMaster(!outreachOn)}
          style={{
            padding: '14px 16px',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 'var(--radius-pill)',
                background: outreachOn ? 'var(--secondary-green)' : 'rgba(0,0,0,.2)',
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {outreachOn ? 'Outreach on' : 'Outreach off'}
            </div>
          </div>
          <Toggle enabled={outreachOn} size="mobile" onToggle={() => setMaster(!outreachOn)} />
        </div>

        <div
          className="rs-panel"
          style={{ overflow: 'hidden', maxWidth: 920, marginBottom: 20 }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Campaign × station</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              A station that is off sends neither first contacts nor reminders.
            </div>
          </div>

          <div
            className="hidden lg:grid"
            style={{
              gridTemplateColumns: 'minmax(0,1fr) 130px 130px 150px',
              alignItems: 'center',
              padding: '11px 20px',
              background: 'var(--surface-sunken)',
              fontSize: 10,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            <span>Station</span>
            <span style={{ textAlign: 'center' }}>Due soon</span>
            <span style={{ textAlign: 'center' }}>Passed</span>
            <span style={{ textAlign: 'right' }}>Sending</span>
          </div>

          {stations.map((station) => {
            const on = !station.paused;
            return (
              <div
                key={station.station_id}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: on ? 'transparent' : 'var(--surface-sunken)',
                  padding: '14px 20px',
                }}
              >
                {/* Desktop row */}
                <div
                  className="hidden lg:grid"
                  style={{
                    gridTemplateColumns: 'minmax(0,1fr) 130px 130px 150px',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{station.station_name}</span>
                      {station.paused && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            background: 'rgba(255,204,0,.18)',
                            color: 'rgb(140,100,0)',
                          }}
                        >
                          Paused
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {station.paused
                        ? 'Outreach + reminders paused'
                        : 'Outreach + reminders enabled'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Toggle
                      enabled={on && dueSoonOn}
                      disabled={!on}
                      onToggle={() =>
                        autoMutation.mutate({ type: 'due_soon', enabled: !dueSoonOn })
                      }
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Toggle
                      enabled={on && passedOn}
                      disabled={!on}
                      onToggle={() =>
                        autoMutation.mutate({ type: 'passed', enabled: !passedOn })
                      }
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Toggle
                      enabled={on}
                      disabled={stationMutation.isPending}
                      onToggle={() =>
                        stationMutation.mutate({
                          stationId: station.station_id,
                          paused: !station.paused,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Mobile row */}
                <div className="flex lg:hidden" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{station.station_name}</span>
                      {station.paused && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            background: 'rgba(255,204,0,.18)',
                            color: 'rgb(140,100,0)',
                          }}
                        >
                          Paused
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {on ? 'Sending' : 'Paused'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flex: 'none', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <Toggle
                        enabled={on && dueSoonOn}
                        size="mobile"
                        disabled={!on}
                        onToggle={() =>
                          autoMutation.mutate({ type: 'due_soon', enabled: !dueSoonOn })
                        }
                      />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Due soon</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <Toggle
                        enabled={on && passedOn}
                        size="mobile"
                        disabled={!on}
                        onToggle={() =>
                          autoMutation.mutate({ type: 'passed', enabled: !passedOn })
                        }
                      />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Passed</div>
                    </div>
                    <Toggle
                      enabled={on}
                      size="mobile"
                      onToggle={() =>
                        stationMutation.mutate({
                          stationId: station.station_id,
                          paused: !station.paused,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <form
          className="rs-panel"
          style={{ maxWidth: 920, padding: 20, marginBottom: 20 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (Number.isInteger(Number(newStationId)) && Number(newStationId) > 0 && newStationName.trim()) {
              addStationMutation.mutate();
            }
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>Add a station</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            New stations start paused. Connect the station ID in your data feed and sender before you resume it.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Station ID
              <input className="rs-btn" type="number" min="1" step="1" required value={newStationId}
                onChange={(event) => setNewStationId(event.target.value)} style={{ width: 120 }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Station name
              <input className="rs-btn" type="text" maxLength="80" required value={newStationName}
                onChange={(event) => setNewStationName(event.target.value)} placeholder="e.g. Central" />
            </label>
            <button className="rs-btn-fill" type="submit" disabled={addStationMutation.isPending}>
              {addStationMutation.isPending ? 'Adding…' : 'Add station'}
            </button>
          </div>
        </form>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 20,
            alignItems: 'start',
            maxWidth: 920,
          }}
          className="lg:!grid-cols-2"
        >
          <div className="rs-panel" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Send activity</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Read from recorded outbound sends, not a claimed sender configuration.
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Row label="Last observed send" value={lastSentLabel} />
              <Row label="Sent in last 7 days" value={activity ? String(activity.sent) : '—'} />
              <Row label="Earliest observed hour (Helsinki)" value={activity?.earliest_hour != null
                ? `${String(activity.earliest_hour).padStart(2, '0')}:00`
                : '—'} />
              <Row label="Latest observed hour (Helsinki)" value={activity?.latest_hour != null
                ? `${String(activity.latest_hour).padStart(2, '0')}:00`
                : '—'} />
              <Row label="Next scheduled send" value="Unavailable from connected sender" />
            </div>
            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: 'rgba(0,0,0,.55)',
                lineHeight: 1.5,
              }}
            >
              Performance uses recorded send/reply history, not a verified scheduler configuration.
              It cannot move the external n8n scheduler; no schedule read/write integration is connected.{' '}
              <Link to="/performance" style={{ color: 'var(--brand-logo-indigo)' }}>
                View historical send windows
              </Link>
              .
            </div>
          </div>

          <SendBatchPanel addToast={addToast} />
        </div>
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, color: 'rgba(0,0,0,.55)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SendBatchPanel({ addToast }) {
  const queryClient = useQueryClient();
  const [count, setCount] = useState('50');
  const [leadType, setLeadType] = useState('due_soon');
  const [showConfirm, setShowConfirm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (triggerTime, label) => {
      const startedAt = Date.now();
      let lastCount = 0;
      let stableChecks = 0;
      pollRef.current = setInterval(async () => {
        try {
          const { new_sessions } = await getFeederProgress(triggerTime);
          if (new_sessions > 0) {
            setProgress(`Sending… ${new_sessions} lead${new_sessions !== 1 ? 's' : ''} queued`);
          }
          if (new_sessions > 0 && new_sessions === lastCount) stableChecks += 1;
          else stableChecks = 0;
          lastCount = new_sessions;
          if (stableChecks >= 3 && new_sessions > 0) {
            stopPolling();
            setScanning(false);
            setProgress(null);
            setResult({ ok: true, msg: `${new_sessions} new ${label} sessions recorded. Confirm delivery in Conversations.` });
            addToast(`${new_sessions} new sessions recorded`, 'info');
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            return;
          }
          if (Date.now() - startedAt > POLL_TIMEOUT) {
            stopPolling();
            setScanning(false);
            setProgress(null);
            setResult({
              ok: true,
              msg: new_sessions
                ? `${new_sessions} sessions recorded so far; delivery may still be pending.`
                : 'No new sessions recorded yet. Check the sender job before retrying.',
            });
          }
        } catch {
          /* keep polling */
        }
      }, POLL_INTERVAL);
    },
    [addToast, queryClient, stopPolling]
  );

  const handleTrigger = async () => {
    if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 500) {
      setShowConfirm(false);
      addToast('Enter a batch size from 1 to 500.', 'error');
      return;
    }
    const label = leadType === 'due_soon' ? 'due soon' : 'passed';
    setShowConfirm(false);
    setResult(null);
    setScanning(true);
    setProgress('Scanning leads…');
    try {
      const { triggered_at } = await triggerFeeder(Number(count), leadType);
      setProgress('Sender accepted the request; checking for new sessions…');
      startPolling(triggered_at, label);
    } catch (err) {
      setScanning(false);
      setProgress(null);
      const msg = err.response?.data?.error || err.message;
      setResult({ ok: false, msg });
      addToast(`Failed: ${msg}`, 'error');
    }
  };

  return (
    <div className="rs-panel" style={{ padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Send a batch now</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
        Manual request to the connected sender. Verify its station and campaign safeguards before sending.
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <div className="rs-seg" style={{ flex: 1 }}>
          {[
            { key: 'due_soon', label: 'Due soon' },
            { key: 'passed', label: 'Passed' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              style={{ flex: 1, textAlign: 'center', padding: '9px 0' }}
              aria-pressed={leadType === opt.key}
              onClick={() => setLeadType(opt.key)}
              disabled={scanning}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          max={500}
          value={count}
          disabled={scanning}
          onChange={(e) => setCount(e.target.value)}
          style={{
            width: 88,
            padding: '9px 12px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            textAlign: 'center',
            fontFamily: 'Inter,sans-serif',
            outline: 'none',
          }}
        />
      </div>
      <div
        style={{
          marginTop: 14,
          padding: 14,
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'rgba(0,0,0,.55)' }}>Cost</span>
          <span style={{ fontWeight: 500 }}>
            {count} × ${COST_PER_MSG.toFixed(2)}
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ fontWeight: 500 }}>Total</span>
          <span style={{ fontWeight: 600 }}>${(count * COST_PER_MSG).toFixed(2)}</span>
        </div>
      </div>
      <button
        type="button"
        className="rs-btn-fill"
        disabled={scanning || !Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 500}
        onClick={() => setShowConfirm(true)}
        style={{ marginTop: 14, width: '100%', padding: '11px 0', textAlign: 'center' }}
      >
        {scanning ? <Loader2 size={14} className="animate-spin" style={{ display: 'inline' }} /> : null}{' '}
        Send to {count} customers
      </button>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        Check campaign exclusions in the sender before launching a batch. Paused stations must not send.
      </div>
      {progress && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--brand-logo-blue)' }}>{progress}</div>
      )}
      {result && !progress && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: result.ok ? 'rgb(40,150,70)' : 'var(--secondary-red)',
          }}
        >
          {result.msg}
        </div>
      )}

      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.4)',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: '#fff',
              borderRadius: 12,
              border: '1px solid var(--border-default)',
              padding: '20px 22px',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>Send now?</div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(0,0,0,.55)' }}>
              Up to {count} {leadType === 'due_soon' ? 'due soon' : 'passed'} customers · $
              {(count * COST_PER_MSG).toFixed(2)} estimated.
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="rs-btn" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="rs-btn-fill" onClick={handleTrigger}>
                Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
