import express from 'express';
import jwt from 'jsonwebtoken';
import supabase from '../supabase.js';
import { EXTRA_FIELDS, pickRandomFields } from '../fieldConfig.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRY = '30m'; // session token valid for 30 minutes

// ── Step 1: look up employee, return 3 random fields + signed token ───────────
router.post('/init', async (req, res) => {
  const { id_number } = req.body;

  if (!id_number?.trim()) {
    return res.status(400).json({ error: 'נא להזין תעודת זהות' });
  }

  const { data: employee, error } = await supabase
    .from('employees')
    .select('id, is_suspended, attempts_count')
    .eq('id_number', id_number.trim())
    .single();

  if (error) {
    console.error('[verify/init] Supabase error:', error);
    if (error.code === 'PGRST116') {
      // "no rows returned" = employee not found
      return res.status(404).json({ error: 'תעודת הזהות לא נמצאה במערכת' });
    }
    return res.status(500).json({ error: `שגיאת שרת: ${error.message}` });
  }
  if (!employee) {
    return res.status(404).json({ error: 'תעודת הזהות לא נמצאה במערכת' });
  }

  if (employee.is_suspended) {
    return res.status(403).json({
      error: 'חשבונך חסום לצמיתות. אנא פנה למחלקת משאבי אנוש.',
      blocked: true,
    });
  }

  const chosenFields = pickRandomFields();
  const fieldKeys = chosenFields.map((f) => f.key);

  // Sign a short-lived token so the server knows which fields were shown
  const token = jwt.sign({ id_number: id_number.trim(), fieldKeys }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  res.json({
    token,
    fields: chosenFields.map(({ key, label, type, options }) => ({
      key,
      label,
      type,
      options,
    })),
    remainingAttempts: Math.max(0, 2 - employee.attempts_count),
  });
});

// ── Step 2: verify all submitted details ──────────────────────────────────────
router.post('/submit', async (req, res) => {
  const { token, name, email, phone, extraFields } = req.body;

  if (!token || !name || !email || !phone || !extraFields) {
    return res.status(400).json({ error: 'נא למלא את כל השדות' });
  }

  // Decode + verify session token
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'הפגישה פגה תוקף, אנא התחל מחדש' });
  }

  const { id_number, fieldKeys } = payload;

  const { data: employee, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id_number', id_number)
    .single();

  if (error || !employee) {
    return res.status(404).json({ error: 'עובד לא נמצא' });
  }

  if (employee.is_suspended) {
    return res.status(403).json({
      error: 'חשבונך חסום לצמיתות. אנא פנה למחלקת משאבי אנוש.',
      blocked: true,
    });
  }

  // Compare base fields (case-insensitive trim)
  const normalize = (v) => (v ?? '').toString().trim().toLowerCase();

  const baseMatch =
    normalize(employee.name) === normalize(name) &&
    normalize(employee.email) === normalize(email) &&
    normalize(employee.phone) === normalize(phone);

  // Compare the 3 extra fields chosen for this session
  const extraMatch = fieldKeys.every((key) => {
    const submitted = normalize(extraFields[key]);
    const stored = normalize(employee[key]);
    return submitted === stored;
  });

  if (baseMatch && extraMatch) {
    // ✅ Success — reset attempts and record verification
    await supabase
      .from('employees')
      .update({ attempts_count: 0 })
      .eq('id', employee.id);

    await supabase.from('verifications').insert({
      employee_id: employee.id,
      employee_name: employee.name,
      employee_id_number: employee.id_number,
      ip_address: req.ip,
    });

    return res.json({ success: true, message: 'האימות הצליח! תודה.' });
  }

  // ❌ Wrong details — increment attempts
  const newAttempts = employee.attempts_count + 1;
  const shouldBlock = newAttempts >= 2;

  await supabase
    .from('employees')
    .update({ attempts_count: newAttempts, is_suspended: shouldBlock })
    .eq('id', employee.id);

  if (shouldBlock) {
    return res.status(403).json({
      error: 'חשבונך חסום לצמיתות לאחר שני ניסיונות כושלים. אנא פנה למחלקת משאבי אנוש.',
      blocked: true,
    });
  }

  return res.status(401).json({
    error: 'הפרטים שהוזנו שגויים.',
    remainingAttempts: 2 - newAttempts,
  });
});

export default router;
