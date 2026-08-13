import crypto from 'node:crypto';

const COOKIE_NAME = 'tj_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

function authSecret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.DASHBOARD_AUTH_SECRET ||
    'tj-dev-auth-secret-change-me'
  );
}

function expectedUser() {
  return process.env.DASHBOARD_USER || 'admin';
}

function expectedPassword() {
  return process.env.DASHBOARD_PASSWORD || '';
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', authSecret()).update(body).digest());
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', authSecret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function readSession(req) {
  const cookies = parseCookies(req);
  return verify(cookies[COOKIE_NAME]);
}

export function validateCredentials(username, password) {
  const u = String(username || '');
  const p = String(password || '');
  const wantU = expectedUser();
  const wantP = expectedPassword();
  if (!wantP) return false;
  const uOk = u.length === wantU.length && crypto.timingSafeEqual(Buffer.from(u), Buffer.from(wantU));
  const pOk =
    p.length === wantP.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(wantP));
  return Boolean(uOk && pOk);
}

export function issueSessionCookie(res, username) {
  const token = sign({
    sub: username,
    exp: Date.now() + MAX_AGE_SEC * 1000,
  });
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** Express middleware — blocks unauthenticated API access. */
export function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.session = session;
  return next();
}

export { COOKIE_NAME, MAX_AGE_SEC };
