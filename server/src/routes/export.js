import express from 'express';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import supabase from '../supabase.js';

const router = express.Router();

/**
 * Build and save a daily .xlsx file.
 * @param {Date} date  - which day to export (defaults to today)
 * @returns {{ filePath: string, count: number }}
 */
export async function generateDailyExport(date = new Date()) {
  // Israel timezone offset: UTC+2 (UTC+3 in summer).
  // Supabase stores UTC; we filter by the calendar day in Israel time.
  const tzOffset = 2 * 60; // minutes — adjust to 3 during daylight saving if needed
  const localDate = new Date(date.getTime() + tzOffset * 60 * 1000);
  const dateStr = localDate.toISOString().split('T')[0]; // YYYY-MM-DD

  const startUTC = new Date(`${dateStr}T00:00:00.000Z`);
  startUTC.setMinutes(startUTC.getMinutes() - tzOffset); // convert local midnight → UTC
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

  const { data, error } = await supabase
    .from('verifications')
    .select('employee_name, employee_id_number, verified_at, ip_address')
    .gte('verified_at', startUTC.toISOString())
    .lte('verified_at', endUTC.toISOString())
    .order('verified_at', { ascending: true });

  if (error) throw error;

  const rows = (data || []).map((v) => ({
    'שם עובד': v.employee_name,
    'תעודת זהות': v.employee_id_number,
    'שעת אימות': new Date(v.verified_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
    'כתובת IP': v.ip_address || '',
  }));

  const ws = xlsx.utils.json_to_sheet(rows, {
    header: ['שם עובד', 'תעודת זהות', 'שעת אימות', 'כתובת IP'],
  });

  // Set column widths for readability
  ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 16 }];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'אימותים');

  const exportDir = process.env.EXPORT_DIR || './exports';
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const filePath = path.resolve(exportDir, `verifications_${dateStr}.xlsx`);
  xlsx.writeFile(wb, filePath);

  return { filePath, count: rows.length, dateStr };
}

// GET /api/export/daily  — download today's export on demand
router.get('/daily', async (req, res) => {
  try {
    const { filePath, count, dateStr } = await generateDailyExport();
    console.log(`[export] ${count} records → ${filePath}`);
    res.download(filePath, `verifications_${dateStr}.xlsx`);
  } catch (err) {
    console.error('[export] failed:', err);
    res.status(500).json({ error: 'שגיאה בייצוא הנתונים' });
  }
});

export default router;
