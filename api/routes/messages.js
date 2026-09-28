import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import axios from 'axios';

const router = Router();

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY;
const YCLOUD_BASE = 'https://api.ycloud.com/v2';
const BATCH_SIZE = 50;
const MAX_AGE_DAYS = 7;

router.post('/poll', async (_req, res) => {
  if (!YCLOUD_API_KEY) return res.status(503).json({ error: 'YCLOUD_API_KEY not configured' });
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: pending, error } = await supabase
    .from('tj_message_status')
    .select('id, wamid, ycloud_id, number, status, delivered_at')
    .in('status', ['sent', 'delivered'])
    .gt('sent_at', cutoff)
    .not('ycloud_id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[poll]', error);
    return res.status(500).json({ error: error.message });
  }

  if (!pending || pending.length === 0) {
    return res.json({ updated: 0, total_pending: 0 });
  }

  let updated = 0;
  const errors = [];

  const results = await Promise.allSettled(
    pending.map(async (msg) => {
      if (!msg.ycloud_id || msg.ycloud_id.startsWith('legacy-')) return null;

      try {
        const { data } = await axios.get(`${YCLOUD_BASE}/whatsapp/messages/${msg.ycloud_id}`, {
          headers: { 'X-API-Key': YCLOUD_API_KEY },
          timeout: 10_000,
        });

        const newStatus = data.status || msg.status;
        if (newStatus === msg.status) return null;

        const updates = { status: newStatus, updated_at: new Date().toISOString() };

        if (data.deliverTime) {
          updates.delivered_at = data.deliverTime;
        }
        if (data.readTime) {
          updates.read_at = data.readTime;
          if (!updates.delivered_at && data.deliverTime) {
            updates.delivered_at = data.deliverTime;
          }
        }

        const { error: uErr } = await supabase
          .from('tj_message_status')
          .update(updates)
          .eq('id', msg.id);

        if (uErr) {
          errors.push({ ycloud_id: msg.ycloud_id, error: uErr.message });
          return null;
        }

        updated++;
        return { ycloud_id: msg.ycloud_id, from: msg.status, to: newStatus };
      } catch (err) {
        const status = err.response?.status;
        const message = err.response?.data?.error?.message || err.message;
        errors.push({ ycloud_id: msg.ycloud_id, status, message });
        return null;
      }
    })
  );

  if (errors.length > 0) {
    console.warn(`[poll] ${errors.length} errors:`, errors.slice(0, 5));
  }

  res.json({ updated, total_pending: pending.length, errors: errors.length });
});

router.get('/statuses', async (req, res) => {
  const { number } = req.query;

  let query = supabase
    .from('tj_message_status')
    .select('wamid, ycloud_id, number, stage, status, sent_at, delivered_at, read_at');

  if (number) {
    query = query.eq('number', number);
  }

  const { data, error } = await query.order('sent_at', { ascending: true });

  if (error) {
    console.error('[statuses]', error);
    return res.status(500).json({ error: error.message });
  }

  res.json(data || []);
});

export default router;
