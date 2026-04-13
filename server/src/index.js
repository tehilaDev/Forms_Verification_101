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
import rateLimit from 'express-rate-limit';
import verifyRouter from './routes/verify.js';
import exportRouter from './routes/export.js';
import { startCron } from './cron.js';

const app = express();
const PORT = process.env.PORT || 3001;
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

// General limiter: 60 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות, נסה שוב מאוחר יותר' },
});

// Init limiter: 30 lookups per 15 minutes per IP (lenient — just an ID lookup)
const verifyInitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות, נסה שוב מאוחר יותר' },
});

// Submit limiter: 10 answer attempts per 15 minutes per IP (strict)
const verifySubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות אימות, נסה שוב מאוחר יותר' },
});

app.use('/api/', generalLimiter);
app.use('/api/verify/init',   verifyInitLimiter);
app.use('/api/verify/submit', verifySubmitLimiter);
app.use('/api/verify', verifyRouter);
app.use('/api/export', exportRouter);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

startCron();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
