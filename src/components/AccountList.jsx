// The ACCOUNTS section of the sidebar: a live, flat list of active accounts
// with balances as of today (NOT the selected reporting month), a reconciling
// total, and an Add-account row. A row opens that account's detail screen. The
// list is collapsible — the header (with the total) and the Add-account row
// stay put; only the account rows tuck away. Collapse state is per-session (the
// sidebar never unmounts on navigation), which is why a plain useState survives
// route changes.
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney } from '../lib/format.js';
import { openers } from '../drawers/openers.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { accountRows } from '../lib/sidebarAccounts.js';

// Small per-account glyph, keyed off the account's type. A mobile wallet reads
// as a wallet; everything else is a bank. Stroke icons take currentColor.
const GLYPH = {
  wallet: <path d="M3 8a2 2 0 0 1 2-2h12v4h-4a2 2 0 0 0 0 4h4v4H5a2 2 0 0 1-2-2V8Z" />,
  bank: <path d="M4 9h16M4 9l8-5 8 5M7 9v7m5-7v7m5-7v7M4 20h16" />,
};
const glyphFor = type => (type === 'Mobile wallet' ? 'wallet' : 'bank');

export default function AccountList() {
  const { data } = useStore();
  const { money, masked } = useMoney();
  const { openDrawer } = useDrawer();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(true);
  const [addHover, setAddHover] = useState(false);

  const { rows, total } = accountRows(data, currentMonth(), nowIso());
  const activeId = pathname.startsWith('/accounts/') ? decodeURIComponent(pathname.split('/')[2]) : null;
  const typeById = new Map(data.accounts.map(a => [a.id, a.type]));

  const rowBtn = active => ({
    display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 12px',
    border: 'none', borderRadius: 8, background: active ? 'var(--soft)' : 'transparent',
    cursor: 'pointer', width: '100%', textAlign: 'left',
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* The whole header toggles the section. The total stays put so the
          reader keeps the number even when the list is folded away. */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="sidebar-accounts-list"
        className="hv-elev"
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '14px 16px 6px', textAlign: 'left' }}
      >
        <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--muted)', transition: 'transform .18s ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.09em', color: 'var(--muted)' }}>ACCOUNTS</span>
        {rows.length > 0 && <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>{money(total)}</span>}
      </button>

      {open && (
        <div id="sidebar-accounts-list" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 12.5, color: 'var(--muted)' }}>No accounts yet</div>
          )}
          {rows.map(r => {
            const active = r.id === activeId;
            const neg = !masked && r.balance < 0;
            return (
              <button key={r.id} onClick={() => navigate('/accounts/' + r.id)} className="hv-elev" style={rowBtn(active)}>
                <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 6, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-h)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{GLYPH[glyphFor(typeById.get(r.id))]}</svg>
                </span>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13.5, color: 'var(--text)', fontWeight: active ? 600 : 500 }}>{r.nickname}</span>
                <span className="tnum" style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: neg ? 'var(--neg)' : 'var(--muted)', fontWeight: neg ? 600 : 500 }}>{money(r.balance)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Add account stays outside the collapse — reachable even when the list
          is folded. When the list is expanded it pins just beneath it. */}
      {/* Extra top space when collapsed so the button isn't cramped against the
          header; snug against the list when expanded. */}
      <div style={{ padding: open ? '4px 12px 10px' : '14px 12px 10px' }}>
        <button
          onClick={() => openers.addAccount(openDrawer)}
          onMouseEnter={() => setAddHover(true)}
          onMouseLeave={() => setAddHover(false)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 34, width: '100%', border: 'none', borderRadius: 8,
            background: addHover ? 'color-mix(in srgb, var(--soft) 82%, var(--accent))' : 'var(--soft)',
            color: 'var(--accent)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
            transition: 'background .15s ease',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>＋</span> Add account
        </button>
      </div>
    </div>
  );
}
