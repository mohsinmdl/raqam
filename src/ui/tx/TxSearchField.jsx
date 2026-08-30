// The register's search box: a text field that, as you type, offers structured
// interpretations of the query — an Account, a Category, a status, a date or
// amount comparison, or a field-scoped text match — and filters the rows to
// whichever you pick (searchSuggestions / matchesTerm in lib/txSearch.js).
//
// Presentational: the query, the applied term, and every handler come from the
// parent, so the same field serves the desktop toolbar and the phone search
// row. Built on the Base UI Combobox primitive (project convention — all new
// interactive primitives are), driven with our own suggestions (filter={null})
// and a controlled `open` tied to focus, so the popup shows only while a live
// query has interpretations to offer and never as an empty box.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Combobox, ComboboxPanel } from '../primitives/Combobox.jsx';

function SearchIcon({ size = 15 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10.6" y1="10.6" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// A small leading glyph per facet family, so a date row reads as a date at a
// glance and an outflow is tellable from an inflow without reading the words.
function FacetIcon({ icon }) {
  if (!icon) return null;
  const base = { width: 18, height: 18, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, fontSize: 11, fontWeight: 700 };
  if (icon === 'date') {
    return (
      <span aria-hidden="true" style={{ ...base, color: 'var(--accent)' }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" /><line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.4" /><line x1="5.5" y1="1.6" x2="5.5" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><line x1="10.5" y1="1.6" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </span>
    );
  }
  if (icon === 'outflow') return <span aria-hidden="true" style={{ ...base, border: '1.5px solid var(--neg)', color: 'var(--neg)' }}>−</span>;
  if (icon === 'inflow') return <span aria-hidden="true" style={{ ...base, border: '1.5px solid var(--pos)', color: 'var(--pos)' }}>+</span>;
  if (icon === 'status-cleared') return <span aria-hidden="true" style={{ ...base, background: 'var(--pos)', color: 'var(--on-pos)' }}>C</span>;
  if (icon === 'status-uncleared') return <span aria-hidden="true" style={{ ...base, border: '1.5px solid var(--muted)', color: 'var(--muted)' }}>C</span>;
  if (icon === 'needs') return <span aria-hidden="true" style={{ ...base, color: 'var(--warn)' }}>◆</span>;
  return null;
}

// The main label of a suggestion. A plain string for entities and facets; the
// { pre, strong, post } shape bolds the query inside the "Find …" echoes, the
// way the reference UI does.
function SuggestMain({ main }) {
  if (typeof main === 'string') return <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{main}</span>;
  return (
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {main.pre}<strong>{main.strong}</strong>{main.post}
    </span>
  );
}

function SuggestRow({ s }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ width: 84, flex: 'none', textAlign: 'right', color: 'var(--muted)', fontSize: 12.5 }}>{s.prefix}</span>
      <FacetIcon icon={s.icon} />
      <SuggestMain main={s.main} />
    </span>
  );
}

// The chip shown in the field once a facet is applied — it names the active
// filter (which free text alone could not tell you) and its ✕ clears it.
function FacetChip({ term, onClear }) {
  return (
    <span style={{
      flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '70%',
      height: 22, padding: '0 4px 0 8px', borderRadius: 999,
      background: 'var(--accent-soft, var(--soft))', color: 'var(--accent)', fontSize: 12, fontWeight: 600,
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.label}</span>
      <button
        type="button" aria-label="Clear filter"
        onMouseDown={e => e.preventDefault()} onClick={onClear} className="hv-soft"
        style={{ flex: 'none', display: 'inline-flex', width: 16, height: 16, padding: 0, border: 'none', borderRadius: 999, background: 'transparent', color: 'inherit', cursor: 'pointer' }}
      >
        <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>
    </span>
  );
}

const TxSearchField = forwardRef(function TxSearchField({
  value, term, suggestions = [], onQueryChange, onPick, onClear,
  placeholder = 'Search', label, collapsed = 190, expanded = 280, height = 34,
}, ref) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const hl = useRef(undefined);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // Open only while the field is live and has interpretations — never an empty
  // popup. Picking a term empties `suggestions` (the parent stops computing
  // them once a term is set), which closes the popup without any extra state.
  const open = focused && suggestions.length > 0;
  const showWide = focused || !!value || !!term;

  const pick = s => { if (s && s.term) onPick(s.term); };

  return (
    <Combobox.Root
      items={suggestions} value={null} filter={null}
      open={open}
      // `open` is derived from focus + suggestion count; we don't let Base UI
      // drive it. We DO use the close signal to drop the highlight mirror, so a
      // stale highlight can't linger past a close and defeat the Enter-to-close
      // fallback below (same guard PayeeCell keeps).
      onOpenChange={o => { if (!o) hl.current = undefined; }}
      onValueChange={pick}
      onItemHighlighted={v => { hl.current = v; }}
      itemToStringLabel={s => (s && s.term && s.term.text) || ''}
      itemToStringValue={s => (s && s.key) || ''}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, boxSizing: 'border-box',
        height, width: showWide ? expanded : collapsed, padding: '0 8px 0 10px',
        border: '1px solid ' + (focused ? 'var(--accent)' : 'var(--border)'),
        borderRadius: 999, background: 'var(--surface)', transition: 'border-color .15s ease',
      }}>
        <span style={{ color: 'var(--muted)', flex: 'none', display: 'inline-flex' }}><SearchIcon /></span>
        {term && <FacetChip term={term} onClear={onClear} />}
        <Combobox.Input
          ref={inputRef}
          aria-label={label || placeholder}
          placeholder={term ? '' : placeholder}
          value={value}
          onChange={e => { setFocused(true); hl.current = undefined; onQueryChange(e.target.value); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => {
            // Escape closes by blurring (which flips `focused`); a highlighted
            // item is taken by Enter through Base UI's own selection, so the
            // only Enter we handle here is the no-highlight case — leave free
            // text active and just close the popup.
            if (e.key === 'Escape') { e.currentTarget.blur(); }
            else if (e.key === 'Enter' && hl.current == null) { e.currentTarget.blur(); }
          }}
          style={{
            flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--text)', fontSize: 13, padding: 0,
          }}
        />
        {(value || term) && (
          <button
            type="button" aria-label="Clear search"
            onMouseDown={e => e.preventDefault()} onClick={onClear} className="hv-soft"
            style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, padding: 0, border: 'none', borderRadius: 999, background: 'var(--soft)', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>
      <ComboboxPanel style={{ width: 'min(92vw, 480px)' }}>
        {suggestions.map(s => (
          <Combobox.Item
            key={s.key} value={s} className="rq-combo-item hv-elev"
            style={{ padding: '7px 10px', borderRadius: 6, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden' }}
          >
            <SuggestRow s={s} />
          </Combobox.Item>
        ))}
      </ComboboxPanel>
    </Combobox.Root>
  );
});

export default TxSearchField;
