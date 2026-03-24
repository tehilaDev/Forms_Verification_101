import express from 'express';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import supabase from '../supabase.js';

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// POST /api/export/admin/daily  { admin_id, admin_password }
// Protected endpoint: returns name, email, id_number of today's verified employees
router.post('/admin/daily', adminLimiter, async (req, res) => {
  const { admin_id, admin_password } = req.body;

  const allowedIds = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim());
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || '';

  const idValid = admin_id && allowedIds.includes(admin_id);
  const passValid = admin_password && adminPasswordHash && await bcrypt.compare(admin_password, adminPasswordHash);

  if (!idValid || !passValid) {
    console.warn(`[export/admin] failed login attempt for id: ${admin_id} from IP: ${req.ip}`);
    return res.status(403).json({ error: 'גישה נדחתה' });
  }
  console.log(`[export/admin] successful login for id: ${admin_id} from IP: ${req.ip}`);

  try {
    const tzOffset = 2 * 60;
    const localDate = new Date(Date.now() + tzOffset * 60 * 1000);
    const dateStr = localDate.toISOString().split('T')[0];

    const startUTC = new Date(`${dateStr}T00:00:00.000Z`);
    startUTC.setMinutes(startUTC.getMinutes() - tzOffset);
    const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    const { data: verifications, error: vErr } = await supabase
      .from('verifications')
      .select('employee_name, employee_id_number')
      .gte('verified_at', startUTC.toISOString())
      .lte('verified_at', endUTC.toISOString())
      .order('employee_name', { ascending: true });

    if (vErr) throw vErr;

    const idNumbers = (verifications || []).map((v) => v.employee_id_number);
    let emailMap = {};

    if (idNumbers.length > 0) {
      const { data: employees, error: eErr } = await supabase
        .from('employees')
        .select('id_number, email')
        .in('id_number', idNumbers);

      if (eErr) throw eErr;

      for (const emp of employees || []) {
        emailMap[emp.id_number] = emp.email;
      }
    }

    const rows = (verifications || []).map((v) => ({
      'שם עובד': v.employee_name,
      'אימייל': emailMap[v.employee_id_number] || '',
      'תעודת זהות': v.employee_id_number,
    }));

    const ws = xlsx.utils.json_to_sheet(rows, {
      header: ['שם עובד', 'אימייל', 'תעודת זהות'],
    });
    ws['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 14 }];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'אימותים');

    const exportDir = process.env.EXPORT_DIR || './exports';
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const filePath = path.resolve(exportDir, `verifications_admin_${dateStr}.xlsx`);
    xlsx.writeFile(wb, filePath);

    console.log(`[export/admin] ${rows.length} records → ${filePath}`);
    res.download(filePath, `verifications_admin_${dateStr}.xlsx`);
  } catch (err) {
    console.error('[export/admin] failed:', err);
    res.status(500).json({ error: 'שגיאה בייצוא הנתונים' });
  }
});

export default router;
