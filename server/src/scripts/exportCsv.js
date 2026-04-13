/**
 * exportCsv.js — Convert Excel → 2 CSV files ready to import into Supabase.
 *
 * Usage:
 *   node src/scripts/exportCsv.js "C:\path\to\data.xlsx"
 *
 * Output (saved next to the Excel file):
 *   employees.csv  — ready to import into the `employees` table
 *   children.csv   — ready to import into the `children` table
 *
 * No internet connection required.
 */

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.toISOString().split('T')[0];
  }
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const num = Number(value);
  if (!isNaN(num) && num > 1000) {
    const d = xlsx.SSF.parse_date_code(num);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return '';
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u00A0\u200F\u200E\u202A-\u202E]/g, '').trim();
}

// ── Column mappings ───────────────────────────────────────────────────────────

const EMPLOYEE_COLS = [
  { hebrew: 'זיהוי',                           db: 'id_number',              date: false },
  { hebrew: 'מספר יחידה',                      db: 'unit_number',            date: false },
  { hebrew: 'יחידה',                            db: 'unit_name',              date: false },
  { hebrew: 'שם פרטי',                         db: 'first_name',             date: false },
  { hebrew: 'שם משפחה',                        db: 'last_name',              date: false },
  { hebrew: 'תאריך לידה',                      db: 'birth_date',             date: true  },
  { hebrew: 'תאריך עלייה',                     db: 'aliya_date',             date: true  },
  { hebrew: 'רחוב',                             db: 'street',                 date: false },
  { hebrew: 'בית',                              db: 'house_number',           date: false },
  { hebrew: 'עיר/ישוב',                        db: 'city',                   date: false },
  { hebrew: 'מיקוד',                            db: 'postal_code',            date: false },
  { hebrew: 'מספר טלפון',                      db: 'phone',                  date: false },
  { hebrew: 'מספר טלפון נייד',                 db: 'mobile_phone',           date: false },
  { hebrew: 'מצב משפחתי',                      db: 'marital_status',         date: false },
  { hebrew: 'שם הקופה',                        db: 'health_fund',            date: false },
  { hebrew: 'מספר זהות של בן/בת הזוג',         db: 'spouse_id_number',       date: false },
  { hebrew: 'מספר דרכון של בן/בת הזוג',        db: 'spouse_passport_number', date: false },
  { hebrew: 'תאריך לידה של בן/בת הזוג',        db: 'spouse_birth_date',      date: true  },
  { hebrew: 'תאריך עלייה של בן/בת הזוג',       db: 'spouse_aliya_date',      date: true  },
];

const CHILDREN_COLS = [
  { hebrew: 'זיהוי',                   db: 'parent_id_number',  date: false },
  { hebrew: 'מספר יחידה',              db: 'unit_number',       date: false },
  { hebrew: 'יחידה',                   db: 'unit_name',         date: false },
  { hebrew: 'שם ילד',                  db: 'child_name',        date: false },
  { hebrew: 'מספר זהות ילד',           db: 'child_id_number',   date: false },
  { hebrew: 'תאריך לידה של הילד',     db: 'child_birth_date',  date: true  },
];

// ── Convert rows ──────────────────────────────────────────────────────────────

function convertRows(rawRows, colDefs) {
  return rawRows.map((row) => {
    const out = {};
    for (const col of colDefs) {
      const val = row[col.hebrew];
      out[col.db] = col.date ? toDate(val) : clean(val);
    }
    return out;
  });
}

// ── Write CSV ─────────────────────────────────────────────────────────────────

function writeCsv(rows, filePath) {
  if (rows.length === 0) {
    console.warn(`  No rows — skipping ${filePath}`);
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const line = headers.map((h) => {
      const v = String(row[h] ?? '').replace(/"/g, '""');
      return `"${v}"`;
    });
    lines.push(line.join(','));
  }
  fs.writeFileSync(filePath, lines.join('\r\n'), 'utf8');
  console.log(`  Saved: ${filePath} (${rows.length} rows)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node src/scripts/exportCsv.js "C:\\path\\to\\data.xlsx"');
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
console.log(`Sheets: ${sheetNames.join(', ')}\n`);

const employeeRaw = xlsx.utils.sheet_to_json(workbook.Sheets[sheetNames[0]], { defval: null });
const childrenRaw = xlsx.utils.sheet_to_json(workbook.Sheets[sheetNames[1]], { defval: null });

const employeeRows = convertRows(employeeRaw, EMPLOYEE_COLS);
const childrenRows = convertRows(childrenRaw, CHILDREN_COLS);

// Filter out rows with no id_number, and deduplicate by id_number (keep last occurrence)
const empMap = new Map();
for (const r of employeeRows) {
  if (r.id_number) empMap.set(r.id_number, r);
}
const validEmployees = [...empMap.values()];
const validChildren  = childrenRows.filter((r) => r.child_name);

const duplicates = employeeRows.filter((r) => r.id_number).length - validEmployees.length;
console.log(`Employees: ${validEmployees.length} rows (${employeeRows.length - validEmployees.length} skipped, ${duplicates} duplicates removed)`);
console.log(`Children:  ${validChildren.length} rows`);

const outDir = path.dirname(resolvedPath);
writeCsv(validEmployees, path.join(outDir, 'employees.csv'));
writeCsv(validChildren,  path.join(outDir, 'children.csv'));

console.log('\nDone! Upload these 2 CSV files to Supabase Table Editor.');
