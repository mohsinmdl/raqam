import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import FocusTrap from './FocusTrap.jsx';
import { useUI } from './UIProvider.jsx';

// Drawer system — chrome ported from the prototype (template 514-528, footer 742-746).
// Drawer bodies register in src/drawers/index.js as:
//   { title(state), sub(state), cta(state), Body, useSubmit }
// useSubmit is a hook (it needs the store) — DrawerShell is keyed by drawer name so
// switching drawers remounts it and hook order stays consistent.
// Form state lives here exactly like the prototype's single `form` object; fields
// write through setField (the generic data-f pattern) so ~30 inputs share one handler.
const Ctx = createContext(null);

function DrawerShell({ def, state, closeDrawer }) {
  const submit = def.useSubmit();
  return (
    <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,13,.44)', animation: 'hsFade .18s ease', zIndex: 40 }}>
      <FocusTrap>
        <aside role="dialog" aria-modal="true" aria-label={def.title(state)} onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '94vw', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', animation: 'hsSlide .22s ease', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{def.title(state)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{def.sub(state)}</div>
            </div>
            <span style={{ flex: 1 }} />
            <button onClick={closeDrawer} aria-label="Close" className="hv-elev" style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {state.errList.length > 0 && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--text)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--neg)' }}>Please fix the following:</div>
                {state.errList.map((e, i) => <div key={i} style={{ fontSize: 12.5, marginTop: 3 }}>• {e}</div>)}
              </div>
            )}
            <def.Body />
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)', flex: 'none', background: 'var(--surface)' }}>
            <button onClick={closeDrawer} className="hv-elev" style={{ height: 38, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            <span style={{ flex: 1 }} />
            <button onClick={submit} className="hv-accent" style={{ height: 38, padding: '0 20px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              {def.cta(state)}
            </button>
          </div>
        </aside>
      </FocusTrap>
    </div>
  );
}

export function DrawerProvider({ registry, children }) {
  const { confirmOpen } = useUI();
  const [state, setState] = useState(null); // { name, form, errors, errList, dupMsg, dupAck }

  const openDrawer = useCallback((name, form = {}) => {
    setState({ name, form, errors: {}, errList: [], dupMsg: null, dupAck: false });
  }, []);
  const closeDrawer = useCallback(() => setState(null), []);
  const setForm = useCallback(patch => {
    setState(s => (s ? { ...s, form: { ...s.form, ...patch }, dupMsg: null, dupAck: false } : s));
  }, []);
  const setField = useCallback((f, v) => setForm({ [f]: v }), [setForm]);
  const fail = useCallback((errors, errList) => {
    setState(s => (s ? { ...s, errors, errList } : s));
  }, []);
  // Two-step duplicate flow: first submit sets the warning + dupAck, second submit saves.
  const setDup = useCallback(dupMsg => {
    setState(s => (s ? { ...s, dupMsg, dupAck: !!dupMsg, errors: {}, errList: [] } : s));
  }, []);

  // Escape closes the drawer — unless the confirm dialog is stacked above it
  // (its capture-phase listener already consumed the key).
  useEffect(() => {
    if (!state) return;
    const onKey = e => { if (e.key === 'Escape' && !confirmOpen) closeDrawer(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, confirmOpen, closeDrawer]);

  const value = useMemo(
    () => ({ drawer: state, openDrawer, closeDrawer, setForm, setField, fail, setDup }),
    [state, openDrawer, closeDrawer, setForm, setField, fail, setDup]
  );

  const def = state ? registry[state.name] : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {state && def && <DrawerShell key={state.name} def={def} state={state} closeDrawer={closeDrawer} />}
    </Ctx.Provider>
  );
}

export function useDrawer() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDrawer outside DrawerProvider');
  return v;
}
