// Static catalogues + the empty starting store.
// The global catalogues are ALSO seeded server-side (supabase/migrations/0002) with
// the same ids — keep the two in sync if these ever change.
export const INSTITUTIONS = [
  { id: 'hbl', name: 'HBL', kind: 'Conventional' },
  { id: 'ubl', name: 'UBL', kind: 'Conventional' },
  { id: 'mcb', name: 'MCB Bank', kind: 'Conventional' },
  { id: 'alfalah', name: 'Bank Alfalah', kind: 'Conventional' },
  { id: 'meezan', name: 'Meezan Bank', kind: 'Islamic' },
  { id: 'faysal', name: 'Faysal Bank', kind: 'Islamic' },
  { id: 'bankislami', name: 'BankIslami', kind: 'Islamic' },
  { id: 'scb', name: 'Standard Chartered Pakistan', kind: 'Foreign' },
  { id: 'mmbl', name: 'Mobilink Microfinance (JazzCash)', kind: 'Microfinance' },
  { id: 'tmb', name: 'Telenor Microfinance (easypaisa)', kind: 'Microfinance' },
  { id: 'raqami', name: 'Raqami Islamic Digital Bank', kind: 'Digital' },
];

export const ACCOUNT_TYPES = ['Current', 'Savings', 'Salary', 'Foreign currency', 'Mobile wallet'];

// Demo catalogue — generic labels, NOT verified product claims.
export const CARD_PRODUCTS = [
  { id: 'p1', instId: 'hbl', name: 'Debit Card (demo)', type: 'debit', network: 'Visa', tier: 'Classic' },
  { id: 'p2', instId: 'hbl', name: 'Gold Credit Card (demo)', type: 'credit', network: 'Visa', tier: 'Gold' },
  { id: 'p3', instId: 'hbl', name: 'Platinum Credit Card (demo)', type: 'credit', network: 'Visa', tier: 'Platinum' },
  { id: 'p4', instId: 'meezan', name: 'Titanium Debit (demo)', type: 'debit', network: 'Mastercard', tier: 'Titanium' },
  { id: 'p5', instId: 'ubl', name: 'PayPak Debit (demo)', type: 'debit', network: 'PayPak', tier: 'Classic' },
  { id: 'p6', instId: 'alfalah', name: 'Credit Card (demo)', type: 'credit', network: 'Mastercard', tier: 'Gold' },
  { id: 'p7', instId: 'scb', name: 'Credit Card (demo)', type: 'credit', network: 'Visa', tier: 'Platinum' },
];

// Per-user default categories, seeded into each new account (canonical ids —
// budgets and transactions reference them directly). icon/sortOrder mirror the
// 0004 migration backfill — keep the two in sync.
export const CATEGORIES = [
  { id: 'groceries', name: 'Groceries', type: 'expense', color: '#0F766E', icon: 'square', sortOrder: 1, isSystem: true, status: 'active', description: '' },
  { id: 'dining', name: 'Dining', type: 'expense', color: '#B7791F', icon: 'circle', sortOrder: 2, isSystem: true, status: 'active', description: '' },
  { id: 'transport', name: 'Transport', type: 'expense', color: '#2563EB', icon: 'triangle', sortOrder: 3, isSystem: true, status: 'active', description: '' },
  { id: 'fuel', name: 'Fuel', type: 'expense', color: '#64748B', icon: 'bar', sortOrder: 4, isSystem: true, status: 'active', description: '' },
  { id: 'utilities', name: 'Utilities', type: 'expense', color: '#B7791F', icon: 'diamond', sortOrder: 5, isSystem: true, status: 'active', description: '' },
  { id: 'mobile', name: 'Mobile & Internet', type: 'expense', color: '#2563EB', icon: 'ring', sortOrder: 6, isSystem: true, status: 'active', description: '' },
  { id: 'rent', name: 'Rent', type: 'expense', color: '#64748B', icon: 'square', sortOrder: 7, isSystem: true, status: 'active', description: '' },
  { id: 'healthcare', name: 'Healthcare', type: 'expense', color: '#C2413B', icon: 'circle', sortOrder: 8, isSystem: true, status: 'active', description: '' },
  { id: 'education', name: 'Education', type: 'expense', color: '#0F766E', icon: 'triangle', sortOrder: 9, isSystem: true, status: 'active', description: '' },
  { id: 'shopping', name: 'Shopping', type: 'expense', color: '#B7791F', icon: 'bar', sortOrder: 10, isSystem: true, status: 'active', description: '' },
  { id: 'entertainment', name: 'Entertainment', type: 'expense', color: '#2563EB', icon: 'diamond', sortOrder: 11, isSystem: true, status: 'active', description: '' },
  { id: 'family', name: 'Family support', type: 'expense', color: '#0F766E', icon: 'ring', sortOrder: 12, isSystem: true, status: 'active', description: '' },
  { id: 'charity', name: 'Charity & zakat', type: 'expense', color: '#15803D', icon: 'square', sortOrder: 13, isSystem: true, status: 'active', description: '' },
  { id: 'fees', name: 'Bank fees', type: 'expense', color: '#64748B', icon: 'circle', sortOrder: 14, isSystem: true, status: 'active', description: '' },
  { id: 'salary', name: 'Salary', type: 'income', color: '#15803D', icon: 'square', sortOrder: 1, isSystem: true, status: 'active', description: '' },
  { id: 'freelance', name: 'Freelance income', type: 'income', color: '#0F766E', icon: 'circle', sortOrder: 2, isSystem: true, status: 'active', description: '' },
  { id: 'otherinc', name: 'Other income', type: 'income', color: '#2563EB', icon: 'diamond', sortOrder: 3, isSystem: true, status: 'active', description: '' },
];

export function freshStore() {
  return {
    institutions: INSTITUTIONS.map(x => ({ ...x })),
    cardProducts: CARD_PRODUCTS.map(x => ({ ...x })),
    categories: CATEGORIES.map(c => ({ ...c })),
    accounts: [], snapshots: [], cards: [], transactions: [], budgets: [], recurring: [], payees: [], audit: [],
    categoryGroups: [], assignments: [],
  };
}
