import 'dotenv/config';

// Validate required env vars at startup — before importing routes
const REQUIRED_ENV = ['JWT_SECRET', 'CLIENT_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import verifyRouter from './routes/verify.js';
import exportRouter from './routes/export.js';
import { startCron } from './cron.js';

const app = express();
const PORT = process.env.PORT || 3001;
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.use('/api/verify', verifyRouter);
app.use('/api/export', exportRouter);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

startCron();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
