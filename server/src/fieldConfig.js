/**
 * EXTRA_FIELDS — all possible extra verification fields.
 *
 * To add a new field in the future:
 *   1. Add a column to the `employees` table in Supabase.
 *   2. Add an entry here with the same `key` as the column name.
 *
 * Each session randomly picks 3 of these to show the employee.
 */
export const EXTRA_FIELDS = [
  {
    key: 'marital_status',
    label: 'מצב משפחתי',
    type: 'select',
    options: ['רווק', 'רווקה', 'נשוי', 'נשואה', 'גרוש', 'גרושה', 'אלמן', 'אלמנה'],
  },
  {
    key: 'building_number',
    label: 'מספר בניין',
    type: 'text',
  },
  {
    key: 'oldest_son_id',
    label: 'ת.ז. בן בכור',
    type: 'text',
  },
  {
    key: 'department',
    label: 'מחלקה',
    type: 'text',
  },
  {
    key: 'birth_city',
    label: 'עיר לידה',
    type: 'text',
  },
  // ← Add more fields here as needed
];

/**
 * Returns 3 random (unique) fields from EXTRA_FIELDS.
 * Called fresh each session so the selection is unpredictable.
 */
export function pickRandomFields() {
  const shuffled = [...EXTRA_FIELDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}
