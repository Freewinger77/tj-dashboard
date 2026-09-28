import { Router } from 'express';
import { supabase, fetchAll } from '../lib/supabase.js';
import axios from 'axios';

const router = Router();

async function stationExists(stationId) {
  const { data, error } = await supabase
    .from('tj_station_pause')
    .select('station_id, station_name')
    .eq('station_id', stationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureStationPauseRows() {
  const { data, error: readError } = await supabase
    .from('tj_station_pause')
    .select('station_id')
    .limit(1);
  if (readError) throw readError;
  if (data?.length) return;
  const seed = process.env.STATION_SEED_JSON;
  if (!seed) return;
  let stations;
  try {
    stations = JSON.parse(seed);
  } catch {
    throw new Error('STATION_SEED_JSON must be valid JSON');
  }
  if (!Array.isArray(stations) || !stations.every((station) =>
    Number.isInteger(station.station_id) && typeof station.station_name === 'string' && station.station_name.trim()
  )) throw new Error('STATION_SEED_JSON must contain station_id and station_name');
  const { error } = await supabase.from('tj_station_pause').upsert(
    stations.map((station) => ({
      station_id: station.station_id,
      station_name: station.station_name,
      paused: true,
      pause_outbound: true,
      pause_reminders: true,
      reason: 'New station — connect data and sender before resuming',
    })),
    { onConflict: 'station_id', ignoreDuplicates: true }
  );
  if (error) throw error;
}

router.post('/trigger', async (req, res) => {
  const { max_leads_to_send, lead_type } = req.body;

  const webhookUrl = process.env.N8N_FEEDER_WEBHOOK;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'N8N_FEEDER_WEBHOOK not configured' });
  }

  const count = Number(max_leads_to_send);
  if (max_leads_to_send == null || !Number.isInteger(count) || count < 1 || count > 500) {
    return res.status(400).json({ error: 'max_leads_to_send must be 1-500' });
  }

  const validTypes = ['both', 'passed', 'due_soon'];
  const type = validTypes.includes(lead_type) ? lead_type : 'both';

  try {
    const { data: holdoutRows, error: holdoutError } = await supabase
      .from('tj_holdout_assignment')
      .select('lead_id');
    if (holdoutError && !['42P01', 'PGRST205', 'PGRST116'].includes(holdoutError.code)) {
      throw holdoutError;
    }
    if (!holdoutError && holdoutRows?.length) {
      const holdoutPhones = new Set();
      const ids = holdoutRows.map((row) => row.lead_id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data: leads, error } = await supabase.from('tj_csv_leads')
          .select('normalized_phone').in('id', ids.slice(i, i + 200));
        if (error) throw error;
        for (const lead of leads || []) {
          if (lead.normalized_phone) holdoutPhones.add(String(lead.normalized_phone).replace(/\D/g, ''));
        }
      }
      const sessions = await fetchAll(() => supabase.from('tj_outbound_sessions')
        .select('number').order('id', { ascending: true }));
      if (sessions.some((session) => holdoutPhones.has(String(session.number || '').replace(/\D/g, '')))) {
        return res.status(409).json({ error: 'Holdout leads already have outbound sessions; check sender exclusions.' });
      }
    }
    const { data } = await axios.post(
      webhookUrl,
      { max_leads_to_send: count, lead_type: type,
        exclude_holdout: true,
        holdout_table_ready: !holdoutError,
        holdout_count: holdoutRows?.length || 0 },
      { timeout: 55_000 }
    );
    if (data?.ok === false || data?.success === false) {
      return res.status(502).json({ error: 'Sender rejected the batch', detail: data?.error || null });
    }
    res.json({
      ok: true,
      accepted: true,
      requested: count,
      lead_type: type,
      worker_response: data?.status || null,
      triggered_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[feeder]', err.message);
    res.status(502).json({ error: 'Failed to trigger feeder', detail: err.message });
  }
});

/** Expire overdue reminder targets older than N days before re-enabling scheduler. */
router.post('/expire-overdue-reminders', async (req, res) => {
  const olderThanDays = Number(req.body?.older_than_days) || 14;
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  try {
    const { data, error } = await supabase
      .from('tj_outbound_sessions')
      .update({
        stop_reminders: true,
        stop_reason: 'expired_overdue_backlog',
        next_reminder_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('stop_reminders', false)
      .lt('next_reminder_at', cutoff)
      .select('id');

    if (error) throw error;
    res.json({
      ok: true,
      expired: (data || []).length,
      older_than_days: olderThanDays,
      cutoff,
    });
  } catch (err) {
    console.error('[expire-overdue]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/progress', async (req, res) => {
  const { since } = req.query;
  if (!since) {
    return res.status(400).json({ error: 'since query param required (ISO timestamp)' });
  }

  const { count, error } = await supabase
    .from('tj_outbound_sessions')
    .select('*', { count: 'exact', head: true })
    .gt('last_outbound_at', since);

  if (error) {
    console.error('[feeder-progress]', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ new_sessions: count || 0, since });
});

router.get('/status', async (_req, res) => {
  const { data, error } = await supabase
    .from('tj_outbound_sessions')
    .select('last_outbound_at')
    .order('last_outbound_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[feeder-status]', error);
    return res.status(500).json({ error: error.message });
  }

  const { count } = await supabase
    .from('tj_outbound_sessions')
    .select('*', { count: 'exact', head: true });

  res.json({
    total_contacted: count || 0,
    last_sent_at: data?.last_outbound_at || null,
  });
});

router.get('/auto-send', async (_req, res) => {
  const { data, error } = await supabase
    .from('tj_config')
    .select('auto_send_due_soon, auto_send_passed, updated_at')
    .eq('id', 'main')
    .maybeSingle();

  if (error) {
    console.error('[auto-send]', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({
    auto_send_due_soon: data?.auto_send_due_soon ?? false,
    auto_send_passed: data?.auto_send_passed ?? false,
    updated_at: data?.updated_at ?? null,
  });
});

router.put('/auto-send', async (req, res) => {
  const { type, enabled } = req.body;

  if (!['due_soon', 'passed'].includes(type)) {
    return res.status(400).json({ error: 'type must be "due_soon" or "passed"' });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }

  const column = type === 'due_soon' ? 'auto_send_due_soon' : 'auto_send_passed';
  const { error } = await supabase
    .from('tj_config')
    .update({ [column]: enabled, updated_at: new Date().toISOString() })
    .eq('id', 'main');

  if (error) {
    console.error('[auto-send]', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, [column]: enabled });
});

router.post('/stations', async (req, res) => {
  const stationId = Number(req.body?.station_id);
  const stationName = String(req.body?.station_name || '').trim();
  if (!Number.isInteger(stationId) || stationId <= 0 || !stationName || stationName.length > 80) {
    return res.status(400).json({ error: 'positive integer station_id and station_name (1-80 chars) required' });
  }
  const { data, error } = await supabase
    .from('tj_station_pause')
    .insert({
      station_id: stationId,
      station_name: stationName,
      paused: true,
      pause_outbound: true,
      pause_reminders: true,
      reason: 'New station — connect data and sender before resuming',
    })
    .select('station_id, station_name, paused, pause_outbound, pause_reminders')
    .single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message });
  res.status(201).json({ station: data });
});

router.get('/station-pause', async (_req, res) => {
  try {
    await ensureStationPauseRows();

    const { data, error } = await supabase
      .from('tj_station_pause')
      .select('station_id, station_name, paused, pause_outbound, pause_reminders, reason, updated_at')
      .order('station_id', { ascending: true });

    if (error) throw error;

    res.json({ stations: data || [] });
  } catch (err) {
    console.error('[station-pause]', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/station-pause/:stationId', async (req, res) => {
  const stationId = Number(req.params.stationId);
  const { paused, reason } = req.body;

  if (!Number.isInteger(stationId) || typeof paused !== 'boolean') {
    return res.status(400).json({ error: 'valid station id and boolean paused are required' });
  }

  let station;
  try {
    station = await stationExists(stationId);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  if (!station) return res.status(400).json({ error: 'unknown station id' });
  const payload = {
    station_id: stationId,
    station_name: station.station_name,
    paused,
    pause_outbound: true,
    pause_reminders: true,
    reason: paused ? (reason || 'Paused from dashboard') : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('tj_station_pause')
    .upsert(payload, { onConflict: 'station_id' })
    .select('station_id, station_name, paused, pause_outbound, pause_reminders, reason, updated_at')
    .single();

  if (error) {
    console.error('[station-pause]', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, station: data });
});

export default router;
