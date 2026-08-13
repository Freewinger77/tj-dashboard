import './api/lib/env.js';
import express from 'express';
import cors from 'cors';
import api from './api/index.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '12mb' }));
app.use('/api', api);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`[api] http://localhost:${port}`);
});
