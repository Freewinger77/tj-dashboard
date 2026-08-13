import { Router } from 'express';
import {
  clearSessionCookie,
  issueSessionCookie,
  readSession,
  validateCredentials,
} from '../lib/auth.js';

const router = Router();

router.get('/me', (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false });
  return res.json({ ok: true, user: session.sub });
});

router.post('/login', (req, res) => {
  const username = String(req.body?.username ?? req.body?.user ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'missing_credentials' });
  }
  if (!process.env.DASHBOARD_PASSWORD) {
    console.error('[auth] DASHBOARD_PASSWORD is not set');
    return res.status(500).json({ ok: false, error: 'auth_not_configured' });
  }
  if (!validateCredentials(username, password)) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }
  issueSessionCookie(res, username);
  return res.json({ ok: true, user: username });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

export default router;
