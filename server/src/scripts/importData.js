/**
 * importData.js — Import employees and children from an Excel file into Supabase.
 *
 * Usage:
 *   node src/scripts/importData.js /path/to/data.xlsx
 *
 * The script expects two sheets:
 *   Sheet 1 (index 0): Employees
 *   Sheet 2 (index 1): Children
 *
 * Run from the server/ directory so that .env is loaded correctly.
 */

import 'dotenv/config';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

// ── Supabase client ───────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an Excel cell value to an ISO date string (YYYY-MM-DD), or null. */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;

  // xlsx with cellDates:true returns JS Date objects for date cells
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }

  // String in DD/MM/YYYY format
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Excel serial number (fallback — xlsx should have handled this with cellDates:true)
  const num = Number(value);
  if (!isNaN(num) && num > 1000) {
    const d = xlsx.SSF.parse_date_code(num);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }

  return null;
}

/** Strip whitespace and invisible Unicode characters from a string cell. */
function clean(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/[\u00A0\u200F\u200E\u202A-\u202E]/g, '').trim();
  return s === '' ? null : s;
}

/** Convert a sheet to an array of plain objects. */
function sheetToRows(sheet) {
  return xlsx.utils.sheet_to_json(sheet, { defval: null });
}

// ── Column name mapping ───────────────────────────────────────────────────────
//
// Keys are the EXACT Hebrew column headers in your Excel file.
// Values are the DB column names.
//
// IMPORTANT: Open your Excel file and verify the header row in each sheet.
// The script will print the detected column names on startup — use that to adjust
// any entries below that don't match your actual file.

const EMPLOYEE_COL_MAP = {
  'זיהוי':                        'id_number',          // Israeli national ID
  'מספר יחידה':                   'unit_number',
  'יחידה':                        'unit_name',
  'שם פרטי':                      'first_name',
  'שם משפחה':                     'last_name',
  'תאריך לידה':                   'birth_date',
  'תאריך עלייה':                  'aliya_date',
  'רחוב':                         'street',
  'בית':                          'house_number',
  'עיר/ישוב':                     'city',
  'מיקוד':                        'postal_code',
  'מספר טלפון':                   'phone',
  'מספר טלפון נייד':              'mobile_phone',
  'מצב משפחתי':                   'marital_status',
  'שם הקופה':                     'health_fund',
  'מספר זהות של בן/בת הזוג':      'spouse_id_number',
  'מספר דרכון של בן/בת הזוג':     'spouse_passport_number',
  'תאריך לידה של בן/בת הזוג':     'spouse_birth_date',
  'תאריך עלייה של בן/בת הזוג':    'spouse_aliya_date',
};

const CHILDREN_COL_MAP = {
  'זיהוי':                 'parent_id_number',    // Israeli national ID of the parent
  'מספר יחידה':            'unit_number',
  'יחידה':                 'unit_name',
  'שם ילד':                'child_name',
  'מספר זהות ילד':         'child_id_number',
  'תאריך לידה של הילד':   'child_birth_date',
};

// Date columns — values go through toDate() instead of clean()
const DATE_COLS = new Set([
  'birth_date', 'aliya_date',
  'spouse_birth_date', 'spouse_aliya_date',
  'child_birth_date',
]);

// ── Map one raw row using the given column map ────────────────────────────────
function mapRow(rawRow, colMap) {
  const result = {};
  for (const [excelCol, dbCol] of Object.entries(colMap)) {
    const value = rawRow[excelCol];
    result[dbCol] = DATE_COLS.has(dbCol) ? toDate(value) : clean(value);
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node src/scripts/importData.js /path/to/data.xlsx');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  console.log(`\nReading: ${resolvedPath}`);

  let workbook;
  try {
    workbook = xlsx.readFile(resolvedPath, { cellDates: true });
  } catch (err) {
    console.error('ERROR: Cannot read Excel file:', err.message);
    process.exit(1);
  }

  const sheetNames = workbook.SheetNames;
  console.log(`Sheets found: ${sheetNames.join(', ')}\n`);

  if (sheetNames.length < 2) {
    console.error('ERROR: Expected at least 2 sheets (Employees + Children).');
    process.exit(1);
  }

  const employeeRows = sheetToRows(workbook.Sheets[sheetNames[0]]);
  const childrenRows = sheetToRows(workbook.Sheets[sheetNames[1]]);

  // Print detected column headers so the user can verify the mapping
  if (employeeRows.length > 0) {
    console.log('Employee sheet columns detected:');
    console.log('  ', Object.keys(employeeRows[0]).join(' | '));
  }
  if (childrenRows.length > 0) {
    console.log('Children sheet columns detected:');
    console.log('  ', Object.keys(childrenRows[0]).join(' | '));
  }
  console.log('');

  let empInserted = 0, empErrors = 0;
  let childInserted = 0, childErrors = 0;

  // ── Import employees ───────────────────────────────────────────────────────
  console.log(`Processing ${employeeRows.length} employee rows…`);

  for (const rawRow of employeeRows) {
    const emp = mapRow(rawRow, EMPLOYEE_COL_MAP);

    if (!emp.id_number) {
      console.warn('  SKIP (no id_number):', JSON.stringify(rawRow).slice(0, 80));
      empErrors++;
      continue;
    }
    if (!emp.first_name || !emp.last_name) {
      console.warn(`  SKIP ${emp.id_number}: missing first_name or last_name`);
      empErrors++;
      continue;
    }

    const { error } = await supabase
      .from('employees')
      .upsert(emp, { onConflict: 'id_number' });

    if (error) {
      console.error(`  ERROR ${emp.id_number}:`, error.message || error.details || JSON.stringify(error));
      empErrors++;
    } else {
      empInserted++;
    }
  }

  console.log(`Employees: ${empInserted} upserted, ${empErrors} errors\n`);

  // Build a map of id_number → employee DB uuid for linking children
  const { data: allEmployees, error: fetchErr } = await supabase
    .from('employees')
    .select('id, id_number');

  if (fetchErr) {
    console.error('ERROR fetching employees for child linking:', fetchErr.message);
    process.exit(1);
  }

  const idNumberMap = {};
  for (const emp of allEmployees || []) {
    if (emp.id_number) {
      idNumberMap[emp.id_number] = emp.id;
      // Also index without leading zeros so children can match either format
      const stripped = emp.id_number.replace(/^0+/, '');
      if (stripped !== emp.id_number) idNumberMap[stripped] = emp.id;
    }
  }

  // ── Import children (delete-then-insert per parent) ────────────────────────
  // Group children rows by parent_id_number (זיהוי = Israeli ID of the parent)
  const childrenByParent = {};
  for (const rawRow of childrenRows) {
    const child = mapRow(rawRow, CHILDREN_COL_MAP);
    if (!child.parent_id_number || !child.child_name) continue;
    const pid = child.parent_id_number;
    if (!childrenByParent[pid]) childrenByParent[pid] = [];
    childrenByParent[pid].push(child);
  }

  console.log(`Processing children for ${Object.keys(childrenByParent).length} parents…`);

  for (const [parentIdNum, kids] of Object.entries(childrenByParent)) {
    const employeeId = idNumberMap[parentIdNum];
    if (!employeeId) {
      console.warn(`  SKIP children of ID "${parentIdNum}": employee not found`);
      childErrors += kids.length;
      continue;
    }

    // Delete existing children for this employee and re-insert
    const { error: delErr } = await supabase
      .from('children')
      .delete()
      .eq('employee_id', employeeId);

    if (delErr) {
      console.error(`  ERROR deleting children for ${parentIdNum}:`, delErr.message);
      childErrors += kids.length;
      continue;
    }

    const rows = kids.map(({ parent_id_number: _pi, ...rest }) => ({
      ...rest,
      employee_id: employeeId,
    }));

    const { error: insErr } = await supabase.from('children').insert(rows);

    if (insErr) {
      console.error(`  ERROR inserting children for ${parentIdNum}:`, insErr.message);
      childErrors += kids.length;
    } else {
      childInserted += kids.length;
    }
  }

  console.log(`Children: ${childInserted} inserted, ${childErrors} errors\n`);
  console.log('Import complete.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
