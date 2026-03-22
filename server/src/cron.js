import cron from 'node-cron';
import { generateDailyExport } from './routes/export.js';

export function startCron() {
  // Runs every day at 23:59 Israel time
  cron.schedule(
    '59 23 * * *',
    async () => {
      console.log('[cron] Running daily export…');
      try {
        const { filePath, count } = await generateDailyExport();
        console.log(`[cron] Done — ${count} records saved to ${filePath}`);
      } catch (err) {
        console.error('[cron] Daily export failed:', err);
      }
    },
    { timezone: 'Asia/Jerusalem' }
  );

  console.log('[cron] Daily export scheduled at 23:59 Asia/Jerusalem');
}
