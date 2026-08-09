import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import {
  getAutoSend,
  getFeederProgress,
  getStationPause,
  setAutoSend,
  setStationPause,
  triggerFeeder,
} from '../lib/api.js';
import Skeleton from '../components/ui/Skeleton.jsx';
import { ToastContainer, useToast } from '../components/ui/Toast.jsx';

const COST_PER_MSG = 0.06;
const POLL_INTERVAL = 5_000;
const POLL_TIMEOUT = 5 * 60 * 1000;

function Toggle({ enabled, onToggle, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="toggle"
    >
      <span className="toggle-knob" />
    </button>
  );
}

export default function ControlsPage() {
  const { toasts, addToast, removeToast } = useToast();
  const queryClient = useQueryClient();

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

  const autoMutation = useMutation({
    mutationFn: ({ type, enabled }) => setAutoSend(type, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-send'] }),
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
  });

  const stationMutation = useMutation({
    mutationFn: ({ stationId, paused }) => setStationPause(stationId, paused),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['station-pause'] });
      addToast(
        variables.paused ? 'Station paused' : 'Station resumed',
        variables.paused ? 'info' : 'success'
      );
    },
    onError: (err) => addToast(err.response?.data?.error || err.message, 'error'),
  });

  const dueSoonOn = autoSendQ.data?.auto_send_due_soon ?? false;
  const passedOn = autoSendQ.data?.auto_send_passed ?? false;
  const outreachOn = dueSoonOn || passedOn;
  const stations = stationsQ.data?.stations || [];

  const masterMutationPending = autoMutation.isPending;

  const setMaster = (enabled) => {
    autoMutation.mutate({ type: 'due_soon', enabled });
    autoMutation.mutate({ type: 'passed', enabled });
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-up">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]">
            Controls
          </h1>
          <p className="mt-2 text-[13px] text-[color:var(--color-ink-3)]">
            Who gets contacted, from which station, and how often.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border rule bg-[color:var(--color-canvas-sunk)] px-4 py-2.5">
          <div>
            <div className="text-[11px] text-[color:var(--color-ink-4)]">Outreach</div>
            <div className="text-[13px] font-semibold">{outreachOn ? 'On' : 'Off'}</div>
          </div>
          <Toggle
            enabled={outreachOn}
            disabled={masterMutationPending || autoSendQ.isLoading}
            label="Master outreach switch"
            onToggle={() => setMaster(!outreachOn)}
          />
        </div>
      </header>

      <section className="panel overflow-hidden">
        <div className="border-b rule px-5 py-4">
          <h2 className="text-[15px] font-semibold">Campaign × station</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
            A station that is off sends neither first contacts nor reminders. Campaign toggles apply to all stations.
          </p>
        </div>

        <div className="grid gap-3 border-b rule px-5 py-4 sm:grid-cols-2">
          <CampaignToggle
            title="Due soon"
            subtitle="Inspection coming up · up to 12 / batch"
            enabled={dueSoonOn}
            loading={autoSendQ.isLoading}
            pending={autoMutation.isPending}
            onToggle={() => autoMutation.mutate({ type: 'due_soon', enabled: !dueSoonOn })}
          />
          <CampaignToggle
            title="Passed"
            subtitle="Oldest lapsed leads · up to 4 / batch"
            enabled={passedOn}
            loading={autoSendQ.isLoading}
            pending={autoMutation.isPending}
            onToggle={() => autoMutation.mutate({ type: 'passed', enabled: !passedOn })}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="border-b rule text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-ink-4)]">
                <th className="px-5 py-3 font-medium">Station</th>
                <th className="px-3 py-3 font-medium">Due soon</th>
                <th className="px-3 py-3 font-medium">Passed</th>
                <th className="px-5 py-3 font-medium text-right">Sending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-rule)]">
              {stationsQ.isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3" colSpan={4}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : stations.map((station) => {
                    const on = !station.paused;
                    return (
                      <tr key={station.station_id} className={!on ? 'bg-[color:var(--color-canvas-sunk)]/60' : ''}>
                        <td className="px-5 py-3 font-medium">{station.station_name}</td>
                        <td className="px-3 py-3 text-[color:var(--color-ink-3)]">
                          {on && dueSoonOn ? 'On' : 'Off'}
                        </td>
                        <td className="px-3 py-3 text-[color:var(--color-ink-3)]">
                          {on && passedOn ? 'On' : 'Off'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Toggle
                            enabled={on}
                            disabled={stationMutation.isPending}
                            label={`Toggle ${station.station_name}`}
                            onToggle={() =>
                              stationMutation.mutate({
                                stationId: station.station_id,
                                paused: !station.paused,
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-[15px] font-semibold">Schedule</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
            Batches run automatically inside this window.
          </p>
          <dl className="mt-4 space-y-3 text-[13px]">
            <div className="flex justify-between gap-3 border-b rule pb-2">
              <dt className="text-[color:var(--color-ink-3)]">Hours</dt>
              <dd className="font-medium">08:00 – 18:00</dd>
            </div>
            <div className="flex justify-between gap-3 border-b rule pb-2">
              <dt className="text-[color:var(--color-ink-3)]">Interval</dt>
              <dd className="font-medium">Every 2 hours</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--color-ink-3)]">Batch size</dt>
              <dd className="font-medium">12 due soon · 4 passed</dd>
            </div>
          </dl>
          <p className="mt-4 text-[12px] text-[color:var(--color-ink-3)]">
            Wednesday afternoon replies best.{' '}
            <Link to="/performance" className="font-medium text-[color:var(--brand-logo-indigo)] hover:underline">
              See the evidence
            </Link>
          </p>
        </div>

        <SendBatchPanel addToast={addToast} />
      </section>
    </div>
  );
}

function CampaignToggle({ title, subtitle, enabled, loading, pending, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border rule px-4 py-3">
      <div>
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11px] text-[color:var(--color-ink-4)]">{subtitle}</div>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-11" />
      ) : (
        <Toggle enabled={enabled} disabled={pending} onToggle={onToggle} label={title} />
      )}
    </div>
  );
}

function SendBatchPanel({ addToast }) {
  const queryClient = useQueryClient();
  const [count, setCount] = useState(50);
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
            setResult({ ok: true, msg: `Done — ${new_sessions} new ${label} leads sent` });
            addToast(`${new_sessions} new ${label} leads sent`, 'success');
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
                ? `${new_sessions} leads sent so far. Processing may still be running.`
                : 'Scan complete — no new eligible leads found.',
            });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
          }
        } catch {
          // keep polling
        }
      }, POLL_INTERVAL);
    },
    [addToast, queryClient, stopPolling]
  );

  const handleTrigger = async () => {
    const label = leadType === 'due_soon' ? 'due soon' : leadType === 'passed' ? 'passed' : 'mixed';
    setShowConfirm(false);
    setResult(null);
    setScanning(true);
    setProgress('Scanning leads…');
    try {
      const { triggered_at } = await triggerFeeder(count, leadType);
      startPolling(triggered_at, label);
    } catch (err) {
      setScanning(false);
      setProgress(null);
      const msg = err.response?.data?.error || err.message;
      setResult({ ok: false, msg });
      addToast(`Failed to trigger feeder: ${msg}`, 'error');
    }
  };

  return (
    <div className="panel p-5">
      <h2 className="text-[15px] font-semibold">Send a batch now</h2>
      <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-4)]">
        On top of the schedule, respecting station switches above.
      </p>

      <div className="mt-4 space-y-3">
        <div className="segmented w-full">
          {[
            { key: 'due_soon', label: 'Due soon' },
            { key: 'passed', label: 'Passed' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="flex-1"
              aria-pressed={leadType === opt.key}
              onClick={() => setLeadType(opt.key)}
              disabled={scanning}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-[color:var(--color-ink-3)]">Recipients</span>
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            disabled={scanning}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-24 rounded-lg border rule bg-[color:var(--color-canvas)] px-3 py-1.5 text-right tabular-nums focus:border-[color:var(--brand-logo-blue)] focus:outline-none disabled:opacity-50"
          />
        </label>

        <div className="rounded-lg bg-[color:var(--color-canvas-sunk)] px-3 py-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[color:var(--color-ink-3)]">Cost</span>
            <span className="tabular-nums">
              {count} × ${COST_PER_MSG.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">${(count * COST_PER_MSG).toFixed(2)}</span>
          </div>
        </div>

        <button
          type="button"
          disabled={scanning}
          onClick={() => setShowConfirm(true)}
          className="btn-primary w-full"
        >
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send to {count} customers
        </button>

        <p className="text-[11px] text-[color:var(--color-ink-4)]">
          Holdout customers are excluded automatically. Paused stations send nothing.
        </p>

        {progress && (
          <div className="flex items-center gap-2 rounded-lg bg-[color:var(--color-amber-soft)] px-3 py-2 text-[12px] font-medium text-[color:var(--color-amber)]">
            <Loader2 size={12} className="animate-spin" />
            {progress}
          </div>
        )}
        {result && !progress && (
          <div
            className={[
              'rounded-lg px-3 py-2 text-[12px] font-medium',
              result.ok
                ? 'bg-[color:var(--color-moss-soft)] text-[color:var(--color-moss)]'
                : 'bg-[color:var(--color-sienna-soft)] text-[color:var(--color-sienna)]',
            ].join(' ')}
          >
            {result.msg}
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border rule bg-[color:var(--color-canvas)] px-6 py-5 shadow-[var(--shadow-float)]">
            <h3 className="text-[16px] font-semibold">Send now?</h3>
            <p className="mt-2 text-[13px] text-[color:var(--color-ink-3)]">
              Up to {count} {leadType === 'due_soon' ? 'due soon' : 'passed'} customers · $
              {(count * COST_PER_MSG).toFixed(2)} estimated.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleTrigger}>
                Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
