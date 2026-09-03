import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUI } from '../UIProvider.jsx';
import { useStore } from '../../store/StoreProvider.jsx';
import { usePlan } from '../../store/PlanProvider.jsx';
import { useDrawer } from '../DrawerProvider.jsx';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { useTxView } from '../../store/TxViewContext.jsx';
import { isTypingTarget } from '../../lib/shortcuts.js';
import { rankItems } from './matchRank.js';
import { useCommandItems } from './useCommandItems.js';
import { getRecents, pushRecent } from './recents.js';

const GROUP_ORDER = ['Pages', 'Accounts', 'Categories', 'Payees', 'Actions'];

export function isMacPlatform() {
  if (typeof navigator === 'undefined') return false;
  const s = (navigator.platform || '') + ' ' + (navigator.userAgent || '');
  return /mac|iphone|ipad|ipod/i.test(s);
}

// Bucket ranked results into a fixed group order for display. Keyboard nav then
// walks the flattened display order, so ↑/↓ crosses group boundaries seamlessly.
function sectionize(results) {
  const byGroup = new Map();
  for (const it of results) {
    if (!byGroup.has(it.group)) byGroup.set(it.group, []);
    byGroup.get(it.group).push(it);
  }
  const sections = [];
  for (const g of GROUP_ORDER) if (byGroup.has(g)) sections.push({ group: g, items: byGroup.get(g) });
  for (const [g, arr] of byGroup) if (!GROUP_ORDER.includes(g)) sections.push({ group: g, items: arr });
  return sections;
}

const KIND_PATH = {
  page: 'M6 3h8l4 4v14H6z M14 3v4h4',
  account: 'M4 10h16M4 10l8-6 8 6M6 10v8m12-8v8M4 20h16',
  category: 'M4 5h16M4 12h16M4 19h10',
  payee: 'M4 20a6 6 0 0 1 12 0M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  action: 'M13 3 4 14h7l-1 7 9-11h-7z',
};

function Glyph({ kind }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={KIND_PATH[kind] || KIND_PATH.action} />
    </svg>
  );
}

const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

export default function CommandPalette() {
  const { paletteOpen: open, openPalette, closePalette, openPayees } = useUI();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { prefs, setPrefs } = useStore();
  const { switchPlan } = usePlan();
  const { openDrawer } = useDrawer();
  const phone = useIsPhone();

  const items = useCommandItems();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Global open triggers. ⌘K / Ctrl+K works even while typing in a field (it's a
  // deliberate escape hatch); "/" only opens when NOT typing (BR-1).
  useEffect(() => {
    const onKey = e => {
      const k = e.key ? e.key.toLowerCase() : '';
      if (k === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) closePalette(); else openPalette();
        return;
      }
      if (k === '/' && !open && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        openPalette();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, openPalette, closePalette]);

  // Fresh start each open: clear query, reload recents, focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setRecents(getRecents());
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const trimmed = query.trim();

  const results = useMemo(
    () => (trimmed ? rankItems(query, items, { recentIds: recents }) : null),
    [trimmed, query, items, recents],
  );

  // Empty-query state: Recents (resolved to live items — stale ids drop, BR-6),
  // else a short "Jump to" set of top pages.
  const emptySection = useMemo(() => {
    const byId = new Map(items.map(i => [i.id, i]));
    const resolved = recents.map(id => byId.get(id)).filter(Boolean);
    if (resolved.length) return { group: 'Recents', items: resolved.slice(0, 8) };
    return { group: 'Jump to', items: items.filter(i => i.kind === 'page').slice(0, 6) };
  }, [recents, items]);

  const sections = useMemo(
    () => (trimmed ? sectionize(results) : [emptySection]),
    [trimmed, results, emptySection],
  );
  const flat = useMemo(() => sections.flatMap(s => s.items), [sections]);

  // Keep the highlight valid as the result set changes.
  useEffect(() => { setActiveIndex(0); }, [query]);
  useEffect(() => {
    if (activeIndex > flat.length - 1) setActiveIndex(flat.length ? flat.length - 1 : 0);
  }, [flat.length, activeIndex]);

  // Scroll the active row into view as it moves.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const { addSeed } = useTxView();
  const ctx = { navigate, openDrawer, setPrefs, prefs, phone, pathname, openPayees, switchPlan, addSeed };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const perform = useCallback(item => {
    if (!item) return;
    pushRecent(item.id);
    closePalette();
    // Run AFTER the dialog closes and restores focus, so a freshly opened drawer
    // (e.g. Add transaction) or navigation isn't fighting this overlay's focus trap.
    setTimeout(() => {
      try { item.perform(ctxRef.current); }
      catch (err) { console.error('Raqam: command failed', err); }
    }, 0);
  }, [closePalette]);

  const onInputKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); perform(flat[activeIndex]); }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(flat.length - 1); }
    // Escape falls through to Base UI's Dialog (onOpenChange → close).
  };

  const kbd = { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', background: 'var(--bg)' };

  const popupStyle = phone
    ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', background: 'var(--surface)', color: 'var(--text)', zIndex: 60, display: 'flex', flexDirection: 'column', outline: 'none' }
    : { position: 'fixed', top: '12vh', left: '50%', transform: 'translateX(-50%)', width: 'min(640px, 94vw)', maxHeight: '68vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', color: 'var(--text)', zIndex: 60, display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none', animation: 'hsFade .16s ease' };

  let running = -1; // running flat index across sections

  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) closePalette(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', animation: 'hsFade .16s ease', zIndex: 60 }} />
        <Dialog.Popup aria-label="Command palette" style={popupStyle}>
          {/* Search input row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: phone ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
            <span aria-hidden="true" style={{ color: 'var(--muted)', display: 'inline-flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search pages, accounts, categories, and actions…"
              aria-label="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmdk-list"
              aria-activedescendant={flat.length ? `cmdk-opt-${activeIndex}` : undefined}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, fontFamily: 'inherit' }}
            />
            <button onClick={closePalette} aria-label="Close" className="hv-elev" style={{ ...kbd, cursor: 'pointer' }}>Esc</button>
          </div>

          {/* Results */}
          <div id="cmdk-list" ref={listRef} role="listbox" aria-label="Results" className="rq-scroll"
            style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 6 }}>
            {flat.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>
                No results for “{trimmed}”
              </div>
            ) : sections.map(section => (
              <div key={section.group} role="group" aria-label={section.group}>
                <div aria-hidden="true" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--muted)', padding: '8px 10px 4px' }}>{section.group}</div>
                {section.items.map(item => {
                  running += 1;
                  const idx = running;
                  const active = idx === activeIndex;
                  return (
                    <div
                      key={item.id}
                      id={`cmdk-opt-${idx}`}
                      data-idx={idx}
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => setActiveIndex(idx)}
                      onClick={() => perform(item)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                        background: active ? 'var(--soft)' : 'transparent',
                      }}
                    >
                      <span aria-hidden="true" style={{ flex: 'none', display: 'inline-flex', color: active ? 'var(--accent)' : 'var(--muted)' }}><Glyph kind={item.kind} /></span>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 14, color: 'var(--text)' }}>
                        {item.label}
                        {item.sublabel && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{'  —  ' + item.sublabel}</span>}
                      </span>
                      {active && <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 14 }}>↵</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer hint bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderTop: '1px solid var(--border)', flex: 'none', color: 'var(--muted)', fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><kbd style={kbd}>↑</kbd><kbd style={kbd}>↓</kbd> navigate</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><kbd style={kbd}>↵</kbd> select</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><kbd style={kbd}>esc</kbd> close</span>
            <span style={{ flex: 1 }} />
            <span aria-hidden="true">{isMacPlatform() ? '⌘K' : 'Ctrl K'}</span>
          </div>

          <div aria-live="polite" style={srOnly}>{trimmed ? `${flat.length} results` : ''}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
