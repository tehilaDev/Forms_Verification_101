import express from 'express';
import jwt from 'jsonwebtoken';
import supabase from '../supabase.js';
import { pickRandomFields } from '../fieldConfig.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || '';
const TOKEN_EXPIRY = '30m';

// ── Normalize an ID number — strip leading zeros to match DB storage ──────────
function normalizeIdNumber(raw) {
  const trimmed = (raw ?? '').toString().trim();
  return trimmed.replace(/^0+/, '') || trimmed;
}

// ── Normalize a submitted value for comparison ────────────────────────────────
// Strips invisible Unicode chars (RTL marks, non-breaking spaces), trims, lower-cases.
// For date fields: converts DD/MM/YYYY → YYYY-MM-DD to match DB storage format.
function normalizeValue(v, isDate = false) {
  const s = (v ?? '').toString().replace(/[\u00A0\u200F\u200E\u202A-\u202E]/g, '').trim();
  if (isDate) {
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s.toLowerCase();
}

// Hebrew label lookup for error messages
const FIELD_LABELS = {
  birth_date:             'תאריך לידה',
  aliya_date:             'תאריך עלייה',
  street:                 'רחוב',
  city:                   'עיר/ישוב',
  postal_code:            'מיקוד',
  phone:                  'טלפון',
  mobile_phone:           'טלפון נייד',
  marital_status:         'מצב משפחתי',
  health_fund:            'קופת חולים',
  spouse_id_number:       'ת.ז. בן/בת הזוג',
  spouse_passport_number: 'דרכון בן/בת הזוג',
  spouse_birth_date:      'תאריך לידה בן/בת הזוג',
};

// Fields that are stored as dates in the DB (YYYY-MM-DD)
const DATE_KEYS = new Set([
  'birth_date', 'aliya_date', 'spouse_birth_date',
]);

// Phone fields — dashes and spaces are stripped before comparison
const PHONE_KEYS = new Set(['phone', 'mobile_phone']);

function normalizePhone(v) {
  return normalizeValue(v).replace(/[-\s]/g, '');
}

// Street field — strip digits and punctuation, keep only letters and spaces
function normalizeStreet(v) {
  return normalizeValue(v)
    .replace(/[^א-תa-z\s]/g, '')  // keep Hebrew letters, Latin letters, spaces
    .replace(/\s+/g, ' ')          // collapse multiple spaces
    .trim();
}

// ── Step 1: look up employee, return 3 random questions + signed token ─────────
router.post('/init', async (req, res) => {
  const { id_number } = req.body;

  if (!id_number?.trim()) {
    return res.status(400).json({ error: 'נא להזין תעודת זהות' });
  }

  if (!/^\d{7,9}$/.test(id_number.trim())) {
    return res.status(400).json({ error: 'מספר תעודת זהות לא תקין' });
  }

  const normalizedId = normalizeIdNumber(id_number);

  // Admin shortcut — skip employee lookup
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim());
  if (adminIds.includes(id_number.trim()) && !req.body.as_employee) {
    return res.json({ isAdmin: true });
  }

  // Fetch employee
  const { data: employee, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id_number', normalizedId)
    .single();

  if (error) {
    console.error('[verify/init] Supabase error:', error);
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'תעודת הזהות לא נמצאה במערכת' });
    }
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
  if (!employee) {
    return res.status(404).json({ error: 'תעודת הזהות לא נמצאה במערכת' });
  }

  if (employee.is_blocked) {
    return res.status(403).json({
      error: 'חשבונך חסום לצמיתות. אנא פנה למחלקת משאבי אנוש.',
      blocked: true,
    });
  }

  if (employee.is_verified) {
    return res.status(403).json({
      error: 'האימות עבור תעודת זהות זו כבר בוצע. לא ניתן לבצע אימות נוסף.',
      already_verified: true,
    });
  }

  // Fetch this employee's children
  const { data: children = [] } = await supabase
    .from('children')
    .select('*')
    .eq('parent_id_number', employee.id_number);

  // Build pool from fields that have data, then pick 3 at random
  const chosenFields = pickRandomFields(employee, children);
  const fieldKeys = chosenFields.map((f) => f.key);

  const token = jwt.sign({ id_number: normalizedId, fieldKeys }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  res.json({
    token,
    fields: chosenFields.map(({ key, label, type, options }) => ({
      key,
      label,
      type,
      ...(options ? { options } : {}),
    })),
    remainingAttempts: Math.max(0, 2 - employee.attempts_count),
  });
});

// ── Step 2: verify submitted answers ─────────────────────────────────────────
router.post('/submit', async (req, res) => {
  const { token, answers } = req.body;

  if (!token || !answers || typeof answers !== 'object') {
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

  // Fetch employee
  const { data: employee, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id_number', id_number)
    .single();

  if (error || !employee) {
    return res.status(404).json({ error: 'עובד לא נמצא' });
  }

  if (employee.is_blocked) {
    return res.status(403).json({
      error: 'חשבונך חסום לצמיתות. אנא פנה למחלקת משאבי אנוש.',
      blocked: true,
    });
  }

  // Fetch children (needed to resolve child-question keys)
  const { data: children = [] } = await supabase
    .from('children')
    .select('*')
    .eq('parent_id_number', employee.id_number);

  const wrongFields = [];

  for (const key of fieldKeys) {
    const submitted = answers[key];

    if (key.startsWith('child_birth_date_')) {
      const childId = key.replace('child_birth_date_', '');
      const child = children.find((c) => c.id === childId);
      if (!child) { wrongFields.push('תאריך לידה של ילד'); continue; }
      if (normalizeValue(submitted, true) !== normalizeValue(child.child_birth_date, true)) {
        wrongFields.push(`תאריך לידה של ${child.child_name}`);
      }

    } else if (key.startsWith('child_id_')) {
      const childId = key.replace('child_id_', '');
      const child = children.find((c) => c.id === childId);
      if (!child) { wrongFields.push('מספר זהות של ילד'); continue; }
      if (normalizeValue(submitted) !== normalizeValue(child.child_id_number)) {
        wrongFields.push(`מספר זהות של ${child.child_name}`);
      }

    } else {
      const isDate = DATE_KEYS.has(key);
      const norm = PHONE_KEYS.has(key) ? normalizePhone
                 : key === 'street'    ? normalizeStreet
                 : (val) => normalizeValue(val, isDate);
      if (norm(submitted) !== norm(employee[key])) {
        wrongFields.push(FIELD_LABELS[key] || key);
      }
    }
  }

  if (wrongFields.length === 0) {
    // ✅ Success — reset attempts, mark as verified, and log the verification
    await supabase
      .from('employees')
      .update({ attempts_count: 0, is_verified: true })
      .eq('id', employee.id);

    await supabase.from('verifications').insert({
      employee_id:        employee.id,
      employee_name:      `${employee.first_name} ${employee.last_name}`,
      employee_id_number: employee.id_number,
      ip_address:         req.ip,
    });

    return res.json({ success: true, message: 'האימות הצליח! תודה.' });
  }

  // ❌ Wrong answers — increment attempts
  const newAttempts = employee.attempts_count + 1;
  const shouldBlock = newAttempts >= 2;

  await supabase
    .from('employees')
    .update({ attempts_count: newAttempts, is_blocked: shouldBlock })
    .eq('id', employee.id);

  if (shouldBlock) {
    return res.status(403).json({
      error: 'חשבונך חסום לצמיתות לאחר שני ניסיונות כושלים. אנא פנה למחלקת משאבי אנוש.',
      blocked: true,
    });
  }

  return res.status(401).json({
    error: 'הפרטים שהוזנו שגויים.',
    wrongFields,
    remainingAttempts: 2 - newAttempts,
  });
});

export default router;
