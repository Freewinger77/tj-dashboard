import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, ImageUp, Loader2, Trash2, Upload, CheckCircle2 } from 'lucide-react';
import { extractBookingCapture, commitBookingCapture } from '../lib/api.js';
import { PageHeader } from '../components/layout/Shell.jsx';
import { ToastContainer, useToast } from '../components/ui/Toast.jsx';

const STATIONS = [
  { id: 58, name: 'Vaajakoski' },
  { id: 59, name: 'Jämsä' },
  { id: 60, name: 'Laukaa' },
  { id: 61, name: 'Muurame' },
];

// Monday (YYYY-MM-DD) of the week containing `date`.
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Downscale + JPEG-compress so the base64 payload stays well under Vercel's body
// cap while keeping plate text legible for the vision model.
function compressImage(file, maxDim = 2000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

export default function BookingCapturePage() {
  const { toasts, addToast, removeToast } = useToast();
  const queryClient = useQueryClient();

  const [stationId, setStationId] = useState(58);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [files, setFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState(null);

  const stationName = STATIONS.find((s) => s.id === Number(stationId))?.name ?? '';

  const extractMutation = useMutation({
    mutationFn: async () => {
      const collected = new Map();
      let processed = 0;
      for (const file of files) {
        processed += 1;
        setProgress(`Reading screenshot ${processed} of ${files.length}…`);
        const dataUrl = await compressImage(file);
        const result = await extractBookingCapture({
          station_id: Number(stationId),
          week_start: weekStart,
          image_base64: dataUrl,
        });
        for (const r of result.rows || []) {
          if (!collected.has(r.reg)) collected.set(r.reg, r);
        }
      }
      return Array.from(collected.values());
    },
    onSuccess: (extracted) => {
      setProgress(null);
      setRows((prev) => {
        const merged = new Map(prev.map((r) => [r.reg, r]));
        for (const r of extracted) {
          if (!merged.has(r.reg)) merged.set(r.reg, { ...r, appointment_date: '' });
        }
        return Array.from(merged.values());
      });
      addToast(`Extracted ${extracted.length} registration${extracted.length === 1 ? '' : 's'}`, extracted.length ? 'success' : 'info');
    },
    onError: (err) => {
      setProgress(null);
      const msg = err.response?.data?.detail || err.response?.data?.error || err.message;
      addToast(`Extraction failed: ${msg}`, 'error');
    },
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commitBookingCapture({
        station_id: Number(stationId),
        week_start: weekStart,
        rows: rows.map((r) => ({
          reg: r.reg,
          customer_name: r.customer_name || null,
          appointment_date: r.appointment_date || null,
        })),
      }),
    onSuccess: (data) => {
      addToast(`Saved ${data.committed} booking${data.committed === 1 ? '' : 's'} to the calendar`, 'success');
      setRows([]);
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err) => {
      const msg = err.response?.data?.error || err.message;
      addToast(`Save failed: ${msg}`, 'error');
    },
  });

  const updateRow = useCallback((reg, patch) => {
    setRows((prev) => prev.map((r) => (r.reg === reg ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((reg) => {
    setRows((prev) => prev.filter((r) => r.reg !== reg));
  }, []);

  const validRegs = useMemo(
    () => rows.filter((r) => /^[A-ZÄÖ]{2,3}-\d{1,3}$/.test(r.reg)).length,
    [rows],
  );

  const isExtracting = extractMutation.isPending;
  const isCommitting = commitMutation.isPending;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <PageHeader
        title="Capture"
        subtitle="Log a booking that came in outside the calendar sync."
        mobileScope={false}
      />
      <div style={{ overflowY: 'auto', padding: '24px 28px 40px', flex: 1 }}>
      <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="rs-panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          1 · Upload screenshots
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          Calendar screenshots — we extract plates into booking snapshots.
        </p>
        <div style={{ marginTop: 14 }}>
        <div className="card px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-[color:var(--color-ink-4)]">Station</span>
              <select
                value={stationId}
                onChange={(e) => setStationId(Number(e.target.value))}
                disabled={isExtracting}
                className="mt-1 w-full rounded-lg border rule bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-ink)] focus:border-[color:var(--color-clay)] focus:outline-none disabled:opacity-50"
              >
                {STATIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-[color:var(--color-ink-4)]">Week starting (Monday)</span>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(mondayOf(e.target.value))}
                disabled={isExtracting}
                className="mt-1 w-full rounded-lg border rule bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-ink)] focus:border-[color:var(--color-clay)] focus:outline-none disabled:opacity-50"
              />
            </label>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed rule px-4 py-6 text-center transition-colors hover:border-[color:var(--color-clay)]">
            <ImageUp size={20} className="text-[color:var(--color-ink-4)]" strokeWidth={1.75} />
            <span className="text-[13px] text-[color:var(--color-ink-3)]">
              {files.length ? `${files.length} screenshot${files.length === 1 ? '' : 's'} selected` : 'Choose calendar screenshots'}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={isExtracting}
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="hidden"
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-[color:var(--color-ink-4)] flex items-center gap-1.5">
              <CalendarRange size={12} />
              {stationName} · week of {weekStart}
            </p>
            <button
              type="button"
              onClick={() => extractMutation.mutate()}
              disabled={isExtracting || files.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--color-clay)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Read screenshots
            </button>
          </div>

          {progress && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] font-medium text-blue-700 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              {progress}
            </div>
          )}
        </div>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="rs-panel" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
            2 · Check what we read
          </h2>
          <div className="mt-4 overflow-hidden rounded-lg border rule">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b rule text-left text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-ink-4)]">
                    <th className="px-4 py-2.5 font-medium">Registration</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Appointment date</th>
                    <th className="px-4 py-2.5 font-medium">Read as</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const valid = /^[A-ZÄÖ]{2,3}-\d{1,3}$/.test(r.reg);
                    return (
                      <tr key={r.reg} className="border-b rule last:border-0">
                        <td className="px-4 py-2">
                          <input
                            value={r.reg}
                            onChange={(e) => updateRow(r.reg, { reg: e.target.value.toUpperCase() })}
                            className={`w-28 rounded-md border bg-[color:var(--color-canvas)] px-2 py-1 font-mono text-[13px] focus:outline-none ${
                              valid ? 'rule text-[color:var(--color-ink)]' : 'border-[color:var(--color-sienna)] text-[color:var(--color-sienna)]'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={r.customer_name || ''}
                            placeholder="—"
                            onChange={(e) => updateRow(r.reg, { customer_name: e.target.value })}
                            className="w-40 rounded-md border rule bg-[color:var(--color-canvas)] px-2 py-1 text-[13px] text-[color:var(--color-ink)] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={r.appointment_date || ''}
                            onChange={(e) => updateRow(r.reg, { appointment_date: e.target.value })}
                            className="rounded-md border rule bg-[color:var(--color-canvas)] px-2 py-1 text-[13px] text-[color:var(--color-ink)] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2 text-[11px] text-[color:var(--color-ink-4)] whitespace-nowrap">
                          {[r.day, r.time].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeRow(r.reg)}
                            className="text-[color:var(--color-ink-4)] transition-colors hover:text-[color:var(--color-sienna)]"
                            aria-label="Remove row"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-[color:var(--color-ink-4)]">
              {validRegs} of {rows.length} rows have a valid plate · saving to {stationName}, week of {weekStart}
            </p>
            <button
              type="button"
              onClick={() => commitMutation.mutate()}
              disabled={isCommitting || validRegs === 0}
              className="rs-btn-fill inline-flex items-center gap-2"
            >
              {isCommitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Save {validRegs} booking{validRegs === 1 ? '' : 's'}
            </button>
          </div>
        </section>
      )}
      </div>
      </div>
    </>
  );
}
