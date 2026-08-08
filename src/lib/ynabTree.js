// The category tree captured live from the user's YNAB plan (see
// docs/superpowers/specs/2026-08-08-ynab-budget-reference.md). Display names
// keep their emoji; matching strips them.
export const YNAB_TREE = [
  { group: 'Recoverable (advances)', categories: ['Household advance', 'Roommate advance'] },
  { group: 'Bills', categories: ['🏠 Rent/Mortgage', '📱 Phone & Internet', '⚡️ Utilities'] },
  { group: 'Needs', categories: ['Cleaning & maintenance', '🤲 Charity & Zakat', '👪 Family support', '🎓 Education', '⛽️ Fuel', '🛒 Groceries', '🚘 Transportation', '🩺 Medical expenses', '😌 Emergency fund'] },
  { group: 'Wants', categories: ['Pet care', 'Food Delivery', '🛍️ Shopping', '🍽️ Dining out', '🍿 Entertainment', '🏝️ Vacation', '❗️ Stuff I forgot to plan for', '🌳 YNAB subscription'] },
];
export const OTHER_GROUP = 'Other';

// Matching key: lowercase letters+digits only — drops emoji, punctuation and
// spacing, so 'Transport' matches '🚘 Transportation' ONLY via aliases below,
// while '🛒 Groceries' matches 'Groceries' directly.
export function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Raqam seed names that map to a DIFFERENT YNAB name (norm(seed) → norm(ynab)).
export const ALIASES = {
  [normName('Transport')]: normName('Transportation'),
  [normName('Dining')]: normName('Dining out'),
  [normName('Mobile & Internet')]: normName('Phone & Internet'),
  [normName('Rent')]: normName('Rent/Mortgage'),
  [normName('Healthcare')]: normName('Medical expenses'),
  [normName('Charity & zakat')]: normName('Charity & Zakat'),
};
