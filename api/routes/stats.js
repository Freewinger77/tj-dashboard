import { Router } from 'express';
import axios from 'axios';
import { supabase, fetchAll } from '../lib/supabase.js';

const router = Router();
const BOOKED_STOP_REASONS = new Set(['booked', 'booked_from_snapshot']);

router.get('/', async (_req, res) => {
  let sessions;
  let statuses;
  try {
    [sessions, statuses] = await Promise.all([
      fetchAll(() =>
        supabase
          .from('tj_outbound_sessions')
          .select('number, last_outbound_at, last_inbound_at, stop_reminders, stop_reason')
          .not('last_outbound_at', 'is', null)
          .or('stop_reason.neq.business_customer,stop_reason.is.null')
          .order('id', { ascending: true })
      ),
      fetchAll(() =>
        supabase.from('tj_message_status').select('status, number').order('id', { ascending: true })
      ),
    ]);
  } catch (err) {
    console.error('[stats]', err);
    return res.status(500).json({ error: err.message });
  }

  const now = new Date();
  const currentDay = dayKey(now);
  const currentWeek = weekKey(now);
  const currentMonth = monthKey(now);

  let totalSent = 0;
  let totalReplied = 0;
  let weekSent = 0;
  let weekReplied = 0;
  let todaySent = 0;
  let todayReplied = 0;
  let monthSent = 0;
  let monthReplied = 0;
  let stopped = 0;
  let booked = 0;

  for (const s of sessions) {
    totalSent++;
    if (s.last_inbound_at) totalReplied++;
    if (s.stop_reminders && BOOKED_STOP_REASONS.has(s.stop_reason)) booked++;
    else if (s.stop_reminders) stopped++;

    const sentAt = new Date(s.last_outbound_at);
    if (dayKey(sentAt) === currentDay) {
      todaySent++;
      if (s.last_inbound_at) todayReplied++;
    }
    if (weekKey(sentAt) === currentWeek) {
      weekSent++;
      if (s.last_inbound_at) weekReplied++;
    }
    if (monthKey(sentAt) === currentMonth) {
      monthSent++;
      if (s.last_inbound_at) monthReplied++;
    }
  }

  const visibleNumbers = new Set(sessions.map((s) => normalizePhone(s.number)));
  const statusByNumber = new Map();
  for (const m of statuses) {
    const number = normalizePhone(m.number);
    if (!visibleNumbers.has(number)) continue;
    if (!statusByNumber.has(number)) statusByNumber.set(number, new Set());
    statusByNumber.get(number).add(String(m.status || '').toLowerCase());
  }

  let delivered = 0;
  let read = 0;
  for (const statusSet of statusByNumber.values()) {
    if (statusSet.has('delivered') || statusSet.has('read')) delivered++;
    if (statusSet.has('read')) read++;
  }

  res.json({
    total: {
      sent: totalSent,
      delivered,
      read,
      replied: totalReplied,
      replyRate: totalSent ? Math.round((totalReplied / totalSent) * 100) : 0,
      stopped,
      booked,
      bookedByBot: booked,
    },
    today: {
      sent: todaySent,
      replied: todayReplied,
      replyRate: todaySent ? Math.round((todayReplied / todaySent) * 100) : 0,
    },
    week: {
      sent: weekSent,
      replied: weekReplied,
      replyRate: weekSent ? Math.round((weekReplied / weekSent) * 100) : 0,
    },
    month: {
      sent: monthSent,
      replied: monthReplied,
      replyRate: monthSent ? Math.round((monthReplied / monthSent) * 100) : 0,
    },
  });
});

router.get('/lead-pool', async (req, res) => {
  const refresh = req.query.refresh === '1';
  let sessions;
  try {
    sessions = await fetchAll(() =>
      supabase
        .from('tj_outbound_sessions')
        .select('number, customer_id, campaign_type')
        .order('id', { ascending: true })
    );
  } catch (err) {
    console.error('[lead-pool]', err);
    return res.status(500).json({ error: err.message });
  }

  try {
    const bridge = await bridgePost('/api/doris/lead-pool/summary', {
      lead_type: 'due_soon',
      refresh,
      excluded_numbers: (sessions || []).map((session) => session.number).filter(Boolean),
      excluded_customer_ids: (sessions || [])
        .map((session) => session.customer_id)
        .filter((id) => id !== null && id !== undefined),
    });

    res.json({
      ...bridge,
      contacted_sessions_excluded: sessions?.length || 0,
      existing_due_soon_sessions: (sessions || []).filter((session) => session.campaign_type === 'due_soon').length,
      existing_passed_sessions: (sessions || []).filter((session) => session.campaign_type === 'passed').length,
    });
  } catch (err) {
    console.error('[lead-pool]', err.response?.data || err.message);
    res.status(502).json({
      error: 'Failed to load remaining due-soon pool',
      detail: err.response?.data?.error || err.message,
    });
  }
});

async function bridgePost(path, body) {
  const baseURL = process.env.DORIS_BRIDGE_URL;
  if (!baseURL) throw new Error('DORIS_BRIDGE_URL not configured');
  const apiKey = process.env.DORIS_BRIDGE_API_KEY || process.env.BRIDGE_API_KEY;
  const headers = apiKey ? { 'X-API-Key': apiKey } : {};
  const { data } = await axios.post(`${baseURL}${path}`, body, { headers, timeout: 300000 });
  if (data?.success === false) throw new Error(data.error || 'DORIS bridge request failed');
  return data?.data ?? data;
}

function normalizePhone(value) {
  let phone = String(value || '').replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = `358${phone.slice(1)}`;
  return phone;
}

function helsinkiParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const value = {};
  for (const part of parts) value[part.type] = part.value;
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    weekday: value.weekday,
  };
}

function dayKey(date) {
  const { year, month, day } = helsinkiParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthKey(date) {
  const { year, month } = helsinkiParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function weekKey(date) {
  const { year, month, day, weekday } = helsinkiParts(date);
  const weekdayIndex = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }[weekday] ?? 0;
  const utcDay = Date.UTC(year, month - 1, day);
  return new Date(utcDay - weekdayIndex * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default router;
