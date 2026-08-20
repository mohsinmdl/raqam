// A compact search box that grows on focus. Presentational: the query lives in
// whatever state the parent hands down, so it filters transactions today and
// could sit anywhere else later.
//
// Collapsed by default (icon + placeholder); it widens smoothly when focused,
// and stays wide while it holds a query so the text is never clipped. The clear
// button is gated on the VALUE, not on focus — gated on focus, the mousedown
// that clicks it would blur the input and unmount the button before the click
// landed. preventDefault on that mousedown keeps focus through the clear, so
// the field stays open and ready to type.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

function SearchIcon({ size = 15 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10.6" y1="10.6" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const SearchField = forwardRef(function SearchField({ value, onChange, placeholder = 'Search', label, collapsed = 190, expanded = 280, height = 34 }, ref) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  const open = focused || !!value;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, boxSizing: 'border-box',
      height, width: open ? expanded : collapsed, padding: '0 8px 0 10px',
      border: '1px solid ' + (focused ? 'var(--accent)' : 'var(--border)'),
      borderRadius: 999, background: 'var(--surface)',
      // Border colour animates; the WIDTH does not. Transitioning width
      // animates layout — every frame relaid the toolbar row beside it (and,
      // at the widths where the toolbar wraps, could reflow it mid-tween).
      // The field still grows on focus, it just arrives at the new width in
      // one frame; the accent border is what carries the "you're in here now".
      transition: 'border-color .15s ease',
    }}>
      <span style={{ color: 'var(--muted)', flex: 'none', display: 'inline-flex' }}><SearchIcon /></span>
      <input
        ref={inputRef}
        aria-label={label || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none',
          background: 'transparent', color: 'var(--text)', fontSize: 13, padding: 0,
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          // Keep the input focused through the clear, so the field stays open
          // and ready for the next query rather than collapsing.
          onMouseDown={e => e.preventDefault()}
          onClick={() => onChange('')}
          className="hv-soft"
          style={{
            flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, padding: 0, border: 'none', borderRadius: 999,
            background: 'var(--soft)', color: 'var(--muted)', cursor: 'pointer',
          }}
        >
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
});

export default SearchField;
