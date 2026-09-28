import { Router } from 'express';
import axios from 'axios';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Station registry lives in the same table as the dashboard's pause controls.
async function stationName(stationId) {
  const { data, error } = await supabase
    .from('tj_station_pause')
    .select('station_name')
    .eq('station_id', stationId)
    .maybeSingle();
  if (error) throw error;
  return data?.station_name || null;
}

const REG_RE = /^[A-ZÄÖ]{2,3}-\d{1,3}$/;
const STORAGE_BUCKET = 'booking-captures';

const normReg = (r) => String(r || '').toUpperCase().replace(/\s+/g, '').trim();

// Monday (local) of the week containing `value`, as YYYY-MM-DD.
function mondayOf(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ISO week number for a YYYY-MM-DD date (matches the `week` column in snapshots).
function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const target = new Date(d);
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  return 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
}

// Best-effort: archive the raw screenshot to Storage for audit/re-processing.
// Never blocks extraction — the bucket may not exist yet.
async function archiveScreenshot(stationId, weekStart, dataUrl) {
  try {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl || '');
    if (!match) return null;
    const contentType = match[1];
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const path = `${stationId}/${weekStart}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.warn('[capture] archive skipped:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.warn('[capture] archive failed:', err.message);
    return null;
  }
}

// POST /api/capture/extract
// Body: { station_id, week_start, image_base64 (data URL) }
// Sends the screenshot to the n8n vision worker and returns cleaned rows for review.
router.post('/extract', async (req, res) => {
  const { station_id, week_start, image_base64 } = req.body || {};

  const stationId = Number(station_id);
  const station = await stationName(stationId);
  if (!station) {
    return res.status(400).json({ error: 'Unknown station_id' });
  }
  const weekStart = mondayOf(week_start);
  if (!weekStart) {
    return res.status(400).json({ error: 'Invalid week_start' });
  }
  if (typeof image_base64 !== 'string' || !image_base64.startsWith('data:image/')) {
    return res.status(400).json({ error: 'image_base64 must be a data URL' });
  }

  const webhookUrl = process.env.N8N_BOOKING_VISION_WEBHOOK;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'N8N_BOOKING_VISION_WEBHOOK not configured' });
  }

  const archivedPath = await archiveScreenshot(stationId, weekStart, image_base64);

  let visionData;
  try {
    const { data } = await axios.post(
      webhookUrl,
      {
        station: station,
        station_id: stationId,
        week_start: weekStart,
        image_base64,
      },
      { timeout: 120_000, maxBodyLength: Infinity, maxContentLength: Infinity },
    );
    visionData = data;
  } catch (err) {
    console.error('[capture-extract]', err.message);
    const detail = err.response?.data?.detail || err.message;
    return res.status(502).json({ error: 'Vision extraction failed', detail });
  }

  if (!visionData || visionData.ok === false || !Array.isArray(visionData.bookings)) {
    return res.status(502).json({ error: 'Vision worker returned no bookings', detail: visionData?.error || null });
  }

  const seen = new Set();
  const rows = [];
  for (const b of visionData.bookings) {
    const reg = normReg(b.registration);
    if (!REG_RE.test(reg) || seen.has(reg)) continue;
    seen.add(reg);
    rows.push({
      reg,
      customer_name: (b.customer_name && String(b.customer_name).trim()) || null,
      day: b.day || null,
      time: b.time || null,
    });
  }

  res.json({
    station_id: stationId,
    station_name: station,
    week_start: weekStart,
    archived_path: archivedPath,
    count: rows.length,
    rows,
  });
});

// POST /api/capture/commit
// Body: { station_id, week_start, source, rows: [{ reg, customer_name, appointment_date }] }
// Upserts reviewed rows into tj_booking_snapshots on the stable identity.
router.post('/commit', async (req, res) => {
  const { station_id, week_start, source, rows } = req.body || {};

  const stationId = Number(station_id);
  const station = await stationName(stationId);
  if (!station) {
    return res.status(400).json({ error: 'Unknown station_id' });
  }
  const weekStart = mondayOf(week_start);
  if (!weekStart) {
    return res.status(400).json({ error: 'Invalid week_start' });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows must be a non-empty array' });
  }

  const batchSource = (source && String(source).trim()) || `vision_${weekStart}`;
  const week = isoWeek(weekStart);
  const nowIso = new Date().toISOString();

  const seen = new Set();
  const payload = [];
  for (const r of rows) {
    const reg = normReg(r.reg);
    if (!REG_RE.test(reg) || seen.has(reg)) continue;
    seen.add(reg);
    const apptDate = r.appointment_date && /^\d{4}-\d{2}-\d{2}$/.test(r.appointment_date)
      ? r.appointment_date
      : null;
    payload.push({
      source_batch_id: batchSource,
      source: batchSource,
      station_id: stationId,
      station_name: station,
      reg,
      week,
      appointment_week_start: weekStart,
      appointment_date: apptDate,
      customer_name: (r.customer_name && String(r.customer_name).trim()) || null,
      is_baseline: false,
      last_seen_at: nowIso,
      // first_seen_at intentionally omitted: DB default fills it on insert and the
      // upsert leaves it untouched on conflict, so it keeps marking first appearance.
    });
  }

  if (payload.length === 0) {
    return res.status(400).json({ error: 'No valid registrations to commit' });
  }

  const { data, error } = await supabase
    .from('tj_booking_snapshots')
    .upsert(payload, { onConflict: 'station_id,reg,appointment_week_start' })
    .select('reg');

  if (error) {
    console.error('[capture-commit]', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, committed: data?.length ?? payload.length, source: batchSource });
});

export default router;
