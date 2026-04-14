/**
 * fieldConfig.js
 *
 * Defines all possible verification question types and builds a per-employee
 * pool of only the questions that have real data for that employee.
 *
 * Each session picks 3 random questions from that pool.
 */

// ── Static field definitions ──────────────────────────────────────────────────
// nullable: true  → only ask if the employee's value is not null/empty
// nullable: false → always included (every employee should have this field)

export const FIELD_DEFINITIONS = [
  {
    key: 'birth_date',
    label: 'מה תאריך הלידה שלך?',
    type: 'date',
    nullable: false,
  },
  {
    key: 'aliya_date',
    label: 'מה תאריך העלייה שלך?',
    type: 'date',
    nullable: true,
  },
  {
    key: 'street',
    label: 'מה שם הרחוב שלך?',
    type: 'text',
    nullable: false,
  },
  {
    key: 'city',
    label: 'באיזו עיר/ישוב אתה גר?',
    type: 'text',
    nullable: false,
  },
  {
    key: 'postal_code',
    label: 'מה המיקוד שלך?',
    type: 'text',
    nullable: false,
  },
  {
    key: 'phone',
    label: 'מה מספר הטלפון שלך?',
    type: 'text',
    nullable: false,
  },
  {
    key: 'mobile_phone',
    label: 'מה מספר הטלפון הנייד שלך?',
    type: 'text',
    nullable: false,
  },
  {
    key: 'marital_status',
    label: 'מה מצבך המשפחתי?',
    type: 'select',
    options: ['רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה', 'פרוד/ה'],
    nullable: false,
  },
  {
    key: 'health_fund',
    label: 'מה שם קופת החולים שלך?',
    type: 'text',
    nullable: false,
  },
  {
    key: 'spouse_id_number',
    label: 'מה מספר זהות בן/בת הזוג?',
    type: 'text',
    nullable: true,
  },
  {
    key: 'spouse_passport_number',
    label: 'מה מספר הדרכון של בן/בת הזוג?',
    type: 'text',
    nullable: true,
  },
  {
    key: 'spouse_birth_date',
    label: 'מה תאריך הלידה של בן/בת הזוג?',
    type: 'date',
    nullable: true,
  },
];

// ── Build a pool of answerable questions for one employee ─────────────────────

/**
 * Returns only the fields that have actual data for this employee,
 * plus dynamic child-question entries.
 *
 * @param {object}   employee - full employee row from DB
 * @param {object[]} children - child rows for this employee
 * @returns {object[]} array of field descriptors ready to show
 */
export function buildFieldPool(employee, children = []) {
  const pool = [];

  for (const field of FIELD_DEFINITIONS) {
    const value = employee[field.key];
    const hasValue = value !== null && value !== undefined && value !== '';

    if (hasValue) {
      // Strip the internal `nullable` flag before sending to the client
      const { nullable: _n, ...rest } = field;
      pool.push(rest);
    }
  }

  // Deduplicate children: prefer child_id_number as key, fall back to child_name
  const seenChildren = new Set();
  const uniqueChildren = children.filter((c) => {
    const key = c.child_id_number?.trim() || c.child_name?.trim().toLowerCase();
    if (!key || seenChildren.has(key)) return false;
    seenChildren.add(key);
    return true;
  });

  // Add per-child questions for each child that has relevant data
  for (const child of uniqueChildren) {
    if (child.child_birth_date) {
      pool.push({
        key: `child_birth_date_${child.id}`,
        label: `מה תאריך הלידה של ${child.child_name}?`,
        type: 'date',
      });
    }
    if (child.child_id_number) {
      pool.push({
        key: `child_id_${child.id}`,
        label: `מה מספר זהות של ${child.child_name}?`,
        type: 'text',
      });
    }
  }


  return pool;
}

// ── Pick up to 3 random questions ─────────────────────────────────────────────

/**
 * Builds the field pool for the given employee + children, shuffles it,
 * and returns up to 3 questions.
 * If fewer than 3 fields have data, returns however many are available.
 *
 * @param {object}   employee
 * @param {object[]} children
 * @returns {object[]}
 */
export function pickRandomFields(employee, children = []) {
  const pool = buildFieldPool(employee, children);

  // Deduplicate by key (safety guard)
  const seen = new Set();
  const unique = pool.filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });

  // Fisher-Yates shuffle — unbiased
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }

  return unique.slice(0, 3);
}
