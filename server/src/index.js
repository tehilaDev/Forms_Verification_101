import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import verifyRouter from './routes/verify.js';
import exportRouter from './routes/export.js';
import { startCron } from './cron.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/verify', verifyRouter);
app.use('/api/export', exportRouter);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

startCron();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
