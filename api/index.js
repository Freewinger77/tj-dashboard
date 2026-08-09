import './lib/env.js';
import express from 'express';
import cors from 'cors';
import statsRouter from './routes/stats.js';
import analyticsRouter from './routes/analytics.js';
import customersRouter from './routes/customers.js';
import chatRouter from './routes/chat.js';
import feederRouter from './routes/feeder.js';
import messagesRouter from './routes/messages.js';
import captureRouter from './routes/capture.js';
import measurementRouter from './routes/measurement.js';

const app = express();
app.use(cors());
// Limit is generous for base64 screenshots from the booking-capture flow. The
// client downscales/compresses first, and Vercel still caps the platform body
// at ~4.5MB, so this just avoids the default 100kb express rejection.
app.use(express.json({ limit: '12mb' }));

app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const api = express.Router();
api.get('/health', (_req, res) => res.json({ ok: true }));
api.use('/stats', statsRouter);
api.use('/analytics', analyticsRouter);
api.use('/customers', customersRouter);
api.use('/chat', chatRouter);
api.use('/feeder', feederRouter);
api.use('/messages', messagesRouter);
api.use('/capture', captureRouter);
api.use('/measurement', measurementRouter);

app.use('/api', api);
app.use('/', api);

app.use((err, _req, res, _next) => {
  console.error('[api] error', err);
  res.status(500).json({ error: err.message || 'internal error' });
});

export default app;
