// Recurring rule drawer — design iteration 003 (template 1199-1300, submitRule),
// extended with nth-weekday day rules, several day rules per month, and an end
// condition. Editing a rule never touches the transactions it already created.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { parseAmt, useMoney } from '../lib/format.js';
import { validate } from '../lib/validate.js';
import { upsertRule, deleteRule } from '../store/actions.js';
import { envelopeFor } from '../lib/envelope.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import PlanCategoryPicker from '../ui/PlanCategoryPicker.jsx';
import {
  buildSchedule, freqLabel, longDate, nextOccurrences, NTH_OPTS, WEEKDAYS,
} from '../lib/schedule.js';
import { Label, FieldError, Hint, AmountField, TextField, SelectField, Pill, noteBox } from './fields.jsx';

const MAX_DAY_RULES = 4;
const row = { display: 'grid', gap: 8 };
const sw = on => ({
  width: 38, height: 22, borderRadius: 999, padding: 2, cursor: 'pointer', flex: 'none',
  background: on ? 'var(--accent)' : 'var(--track)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'),
  display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
});
const knob = { width: 16, height: 16, borderRadius: 999, background: 'var(--surface)' };

function Switch({ id, on, onClick, label }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} style={sw(on)}>
      <span style={knob} />
    </button>
  );
}

function Body() {
  const { drawer, setField, setForm } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const isExp = f.type !== 'income';
  const catMonth = currentMonth();
  const catEnv = envelopeFor(S, catMonth, nowIso());
  const unit = f.unit || 'month';
  const rules = f.dayRules || [];

  const setRule = (i, patch) => setForm({ dayRules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addRule = () => setForm({ dayRules: [...rules, { kind: 'dom', day: '1' }] });
  const removeRule = i => setForm({ dayRules: rules.filter((_, j) => j !== i) });

  // Changing the unit invalidates every day rule — a weekday means nothing to a
  // yearly schedule — so they are rebuilt rather than reinterpreted.
  const onUnit = u => setForm({
    unit: u,
    dayRules: u === 'day' ? []
      : u === 'week' ? [{ kind: 'wd', weekday: '1' }]
        : u === 'year' ? [{ kind: 'md', md: (f.nextDate || '2026-01-01').slice(5) }]
          : [{ kind: 'dom', day: String(Number((f.nextDate || '2026-01-01').slice(8, 10))) }],
  });

  const onType = t => setForm({
    type: t, category: '',
    // Income can't be funded by a card, so a card source can't survive the switch.
    source: t === 'income' && String(f.source || '').startsWith('card:') ? '' : f.source,
  });

  const schedule = buildSchedule(f);
  const preview = /^\d{4}-\d{2}-\d{2}$/.test(f.nextDate || '')
    ? nextOccurrences({ schedule, nextDate: f.nextDate, occurrences: [] }, 4).slice(1)
    : [];
  const now = nowIso();
  const clampNote = unit === 'month' && rules.some(r => r.kind === 'dom' && Number(r.day) > 28);

  return (
    <>
      <div>
        <Label>This rule is</Label>
        <div role="group" aria-label="Direction" style={{ display: 'flex', gap: 8 }}>
          <Pill on={isExp} onClick={() => onType('expense')}>Money out</Pill>
          <Pill on={!isExp} onClick={() => onType('income')}>Money in</Pill>
        </div>
      </div>

      <div>
        <Label htmlFor="rl-name" required>Name</Label>
        <TextField id="rl-name" field="name" maxLength={60} placeholder="House rent" />
        <Hint>Becomes the merchant on every transaction this rule creates.</Hint>
        <FieldError msg={errors.name} />
      </div>

      <div>
        <Label htmlFor="rl-amount" required>Amount</Label>
        <AmountField id="rl-amount" field="amount" />
        <FieldError msg={errors.amount} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch id="rl-est" on={!!f.estimated} onClick={() => setField('estimated', !f.estimated)} label="The amount varies" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13 }}>The amount varies</div>
          <Hint style={{ marginTop: 1 }}>Recording suggests the average of recent actuals instead of a fixed figure.</Hint>
        </div>
      </div>

      <div>
        <Label htmlFor="rl-every" required>Repeats</Label>
        <div style={{ ...row, gridTemplateColumns: '88px minmax(0,1fr)' }}>
          <TextField id="rl-every" field="every" inputMode="numeric" ariaLabel="Interval" />
          <SelectField id="rl-unit" field="unit" ariaLabel="Unit">
            <option value="day">days</option>
            <option value="week">weeks</option>
            <option value="month">months</option>
            <option value="year">years</option>
          </SelectField>
        </div>
        <FieldError msg={errors.every || errors.unit} />
      </div>

      {unit !== 'day' && (
        <div>
          <Label>{unit === 'week' ? 'On which day' : unit === 'year' ? 'On which date' : 'On which day of the month'}</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {unit === 'week' && (
                  <select className="field" aria-label="Weekday" value={r.weekday ?? '1'} onChange={e => setRule(i, { weekday: e.target.value })}>
                    {WEEKDAYS.map((w, wi) => <option key={w} value={String(wi)}>{w}</option>)}
                  </select>
                )}
                {unit === 'year' && (
                  <input className="field" type="date" aria-label="Date" value={'2026-' + (r.md || '01-01')}
                    onChange={e => setRule(i, { md: e.target.value.slice(5) })} />
                )}
                {unit === 'month' && (
                  <>
                    <select className="field" aria-label="Kind" style={{ maxWidth: 150 }} value={r.kind || 'dom'}
                      onChange={e => setRule(i, { kind: e.target.value, day: '1', nth: '1', weekday: '1' })}>
                      <option value="dom">Day of month</option>
                      <option value="nth">Nth weekday</option>
                      <option value="last">Last day</option>
                    </select>
                    {(r.kind || 'dom') === 'dom' && (
                      <select className="field" aria-label="Day" value={r.day ?? '1'} onChange={e => setRule(i, { day: e.target.value })}>
                        {Array.from({ length: 31 }, (_, d) => <option key={d} value={String(d + 1)}>{d + 1}</option>)}
                      </select>
                    )}
                    {r.kind === 'nth' && (
                      <>
                        <select className="field" aria-label="Which" style={{ maxWidth: 90 }} value={r.nth ?? '1'} onChange={e => setRule(i, { nth: e.target.value })}>
                          {NTH_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <select className="field" aria-label="Weekday" value={r.weekday ?? '1'} onChange={e => setRule(i, { weekday: e.target.value })}>
                          {WEEKDAYS.map((w, wi) => <option key={w} value={String(wi)}>{w}</option>)}
                        </select>
                      </>
                    )}
                  </>
                )}
                {rules.length > 1 && (
                  <button type="button" onClick={() => removeRule(i)} aria-label="Remove this day"
                    className="hv-neg-soft" style={{ flex: 'none', width: 32, height: 40, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}>×</button>
                )}
              </div>
            ))}
          </div>
          {unit === 'month' && rules.length < MAX_DAY_RULES && (
            <button type="button" onClick={addRule} className="hv-soft" style={{ marginTop: 8, height: 30, padding: '0 10px', border: '1px dashed var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ＋ Add another day
            </button>
          )}
          {clampNote && <Hint>In shorter months this lands on the last day instead — never in the next month.</Hint>}
          <FieldError msg={errors.day} />
        </div>
      )}

      <div>
        <Label>Ends</Label>
        <div role="group" aria-label="End condition" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill on={f.endsKind !== 'count' && f.endsKind !== 'date'} onClick={() => setField('endsKind', 'never')}>Never</Pill>
          <Pill on={f.endsKind === 'count'} onClick={() => setForm({ endsKind: 'count', endsCount: f.endsCount || '12' })}>After N times</Pill>
          <Pill on={f.endsKind === 'date'} onClick={() => setForm({ endsKind: 'date', endsDate: f.endsDate || f.nextDate })}>On date</Pill>
        </div>
        {f.endsKind === 'count' && (
          <div style={{ marginTop: 8, maxWidth: 140 }}>
            <TextField id="rl-ends-count" field="endsCount" inputMode="numeric" ariaLabel="Number of occurrences" />
          </div>
        )}
        {f.endsKind === 'date' && (
          <div style={{ marginTop: 8, maxWidth: 200 }}>
            <TextField id="rl-ends-date" field="endsDate" type="date" ariaLabel="End date" />
          </div>
        )}
        {f.endsKind === 'count' && <Hint>Skipped occurrences count towards the total.</Hint>}
        <FieldError msg={errors.ends} />
      </div>

      <div>
        <Label htmlFor="rl-next" required>Next due</Label>
        <TextField id="rl-next" field="nextDate" type="date" />
        <FieldError msg={errors.nextDate} />
      </div>

      <div style={{ ...noteBox('var(--elev)'), padding: '10px 13px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{freqLabel(schedule)}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
          {preview.length > 0
            ? 'After ' + longDate(f.nextDate, now) + ' the next ones fall on ' + preview.map(d => longDate(d, now)).join(', ') + '.'
            : 'Pick the next due date to see the dates that follow.'}
        </div>
      </div>

      <div>
        <Label required>Category</Label>
        <PlanCategoryPicker
          env={catEnv} S={S} month={catMonth} money={money}
          catType={isExp ? 'expense' : 'income'} showAmounts={isExp} excludeRta
          value={f.category || null} onChange={id => setField('category', id)}
        />
        <FieldError msg={errors.category} />
      </div>

      <div>
        <Label htmlFor="rl-source" required>{isExp ? 'Paid with' : 'Paid into'}</Label>
        <SelectField id="rl-source" field="source">
          <option value="">Choose…</option>
          {S.accounts.filter(a => a.status === 'active').map(a => <option key={a.id} value={'acc:' + a.id}>{a.nickname}</option>)}
          {isExp && S.cards.filter(c => c.status !== 'closed').map(c => <option key={c.id} value={'card:' + c.id}>{c.nickname} ••{c.last4}</option>)}
        </SelectField>
        <FieldError msg={errors.source} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.55 }}>
        <Switch id="rl-auto" on={false} onClick={() => {}} label="Post automatically" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13 }}>Post automatically</div>
          <Hint style={{ marginTop: 1 }}>Coming later — for now every rule is a reminder, and nothing is recorded until you confirm it.</Hint>
        </div>
      </div>

      {f.editId && (
        <Hint>Changing this rule never touches transactions it has already created.</Hint>
      )}
    </>
  );
}

function useSubmit() {
  const { drawer, fail, closeDrawer } = useDrawer();
  const { applyData, data: S } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form;
    const amt = parseAmt(f.amount);
    const errs = validate.recurring(S, f, amt);
    if (Object.keys(errs).length) return fail(errs, Object.values(errs));
    applyData(data => upsertRule(data, { form: f, amt }));
    closeDrawer();
    notify(f.editId ? 'Rule updated.' : 'Rule created.');
  };
}

function useDanger() {
  const { drawer, closeDrawer } = useDrawer();
  const { applyData, data: S } = useStore();
  const { ask, notify } = useUI();
  const f = drawer.form;
  if (!f.editId) return null;
  return {
    label: 'Delete rule',
    onClick: async () => {
      const r = S.recurring.find(x => x.id === f.editId);
      const n = ((r && r.occurrences) || []).filter(o => o.outcome === 'recorded').length;
      const ok = await ask({
        title: 'Delete this rule?',
        body: '“' + (r ? r.name : 'This rule') + '” stops reminding you. ' + (n > 0
          ? 'The ' + n + ' transaction' + (n === 1 ? '' : 's') + ' it already created stay exactly as they are.'
          : 'It has not created any transactions.'),
        action: 'Delete rule',
      });
      if (!ok) return;
      applyData(data => deleteRule(data, { id: f.editId }));
      closeDrawer();
      notify('Rule deleted.');
    },
  };
}

export const recurringFormDef = {
  title: s => (s.form.editId ? 'Edit rule' : 'New recurring rule'),
  sub: s => (s.form.editId ? 'Changes never touch transactions this rule already created' : 'Something that repeats on a schedule'),
  cta: s => (s.form.editId ? 'Save rule' : 'Create rule'),
  Body,
  useSubmit,
  useDanger,
};
