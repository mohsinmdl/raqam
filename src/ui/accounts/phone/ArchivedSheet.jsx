// Archived/closed accounts in a bottom sheet — same restore/delete logic and
// policy guards as the desktop Accounts archived section, re-hosted.
import { BottomSheet, BottomSheetPanel, BottomSheetClose } from '../../primitives/BottomSheet.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useUI } from '../../UIProvider.jsx';
import { accountDeletePolicy } from '../../../lib/calc.js';
import { deleteAccountPermanently, setAccountStatus } from '../../../store/actions.js';

export default function ArchivedSheet({ open, onClose, rows }) {
  const { data: S, applyData } = useStore();
  const { notify, ask } = useUI();

  const restore = id => {
    applyData(data => setAccountStatus(data, { accountId: id, status: 'active' }));
    notify('Account restored — included in totals again.');
  };
  const askDelete = async a => {
    const ok = await ask({
      title: 'Delete “' + a.nickname + '” for good?',
      body: 'Nothing points at this account, so it can be removed completely — it and its opening balance disappear from your data and from the server. This cannot be undone. Archiving is the reversible option.',
      action: 'Delete permanently',
    });
    if (!ok) return;
    applyData(data => deleteAccountPermanently(data, { id: a.id }));
    notify('“' + a.nickname + '” deleted.');
  };

  return (
    <BottomSheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <BottomSheetPanel label="Archived accounts">
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Archived accounts</span>
          <BottomSheetClose aria-label="Close" className="hv-soft"
            style={{ width: 36, height: 36, border: 'none', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 15, cursor: 'pointer' }}>✕</BottomSheetClose>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 16px' }}>
          {rows.map(r => {
            const pol = accountDeletePolicy(S, r.acct.id);
            return (
              <div key={r.acct.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>{r.acct.nickname}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{r.instLabel} · {r.statusLabel} · excluded from totals</span>
                </span>
                {pol.mode === 'delete'
                  ? <button onClick={() => askDelete(r.acct)} className="hv-neg-soft" style={{ minHeight: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Delete</button>
                  : <span style={{ fontSize: 11.5, color: 'var(--muted)', flex: 'none' }} title={'Kept because of ' + pol.blockers.join(', ')}>Kept</span>}
                <button onClick={() => restore(r.acct.id)} className="hv-elev" style={{ minHeight: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Restore</button>
              </div>
            );
          })}
        </div>
      </BottomSheetPanel>
    </BottomSheet>
  );
}
