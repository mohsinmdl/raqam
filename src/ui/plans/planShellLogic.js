// Pure logic behind the plan shell UI (switcher / modals / first-run page) —
// kept out of the components so the behavior is testable without a DOM.
import { PLAN_DATE_FORMATS, PLAN_DEFAULTS, PLAN_NUMBER_FORMATS, PLAN_PLACEMENTS } from '../../store/seed.js';

export const PLAN_NAME_MAX = 80;

// null = valid, otherwise the inline message. Mirrors createPlan's own guard
// (actions.js) so the UI can never submit a name the action would drop.
export function planNameError(raw) {
  const name = String(raw || '').trim();
  if (!name) return 'Give the plan a name.';
  if (name.length > PLAN_NAME_MAX) return `Keep it under ${PLAN_NAME_MAX} characters.`;
  return null;
}

// BR-U2-9: exact and case-sensitive; only the input's own leading/trailing
// whitespace is forgiven (an accidental trailing space must not block a
// correctly typed name, but casing differences must).
export function deleteConfirmReady(typed, planName) {
  return String(typed || '').trim() === planName;
}

// The switcher's list: ordered by name with the open plan marked — the same
// localeCompare ordering resolveOpenPlan's fallback uses, so "first remaining
// by name" always means the row the user sees at the top.
export function switcherPlans(plans, openPlanId) {
  return [...(plans || [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ ...p, open: p.id === openPlanId }));
}

// Worked example for a date-format key ('DD/MM/YYYY' → '30/12/2026'): the
// select shows what a date will look like, not the raw pattern.
export function dateFormatExample(key) {
  return String(key).replace('YYYY', '2026').replace('MM', '12').replace('DD', '30');
}

// FirstPlanSetup's direct-insert payload: the store isn't alive in the
// zero-plan state, so createPlan's clamp can't run — the same catalogue clamp
// is applied here so an out-of-set value can never reach the 0017 CHECKs.
// null on an invalid name (the form blocks it first; this is the backstop).
export function buildPlanInsert(f) {
  const name = String(f.name || '').trim();
  if (!name || name.length > PLAN_NAME_MAX) return null;
  return {
    id: f.id,
    name,
    currency: /^[A-Z]{3}$/.test(f.currency || '') ? f.currency : PLAN_DEFAULTS.currency,
    currencyPlacement: PLAN_PLACEMENTS.includes(f.currencyPlacement) ? f.currencyPlacement : PLAN_DEFAULTS.currencyPlacement,
    numberFormat: PLAN_NUMBER_FORMATS.includes(f.numberFormat) ? f.numberFormat : PLAN_DEFAULTS.numberFormat,
    dateFormat: PLAN_DATE_FORMATS.includes(f.dateFormat) ? f.dateFormat : PLAN_DEFAULTS.dateFormat,
  };
}
