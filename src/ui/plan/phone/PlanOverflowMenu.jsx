// Phone Plan overflow (⋯) menu — the desktop toolbar's several standalone
// controls (Recent Moves, Undo, Collapse-all, view/mask toggles) collapsed
// into one menu, since the phone toolbar has no room to spread them out.
import { useState } from 'react';
import { Menu, MenuTrigger, MenuPanel, MenuItem } from '../../primitives/Menu.jsx';
import { BottomSheet, BottomSheetPanel, BottomSheetClose } from '../../primitives/BottomSheet.jsx';
import { RecentMovesList } from '../../../components/RecentMoves.jsx';

export default function PlanOverflowMenu({
  undo, canUndo, allCollapsed, onToggleAll, progressOn, onToggleProgress, maskedOn, onToggleMasked,
}) {
  const [movesOpen, setMovesOpen] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger aria-label="Plan menu" className="hv-soft"
          style={{
            width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 999,
            background: 'var(--surface)', color: 'var(--muted)', fontSize: 18, cursor: 'pointer',
          }}
        >⋯</MenuTrigger>
        <MenuPanel aria-label="Plan menu">
          <MenuItem onClick={() => setMovesOpen(true)}>🕘 Recent Moves</MenuItem>
          <MenuItem onClick={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : .45 }}>↩ Undo last move</MenuItem>
          <MenuItem onClick={onToggleAll}>{allCollapsed ? '⌄ Expand all groups' : '⌃ Collapse all groups'}</MenuItem>
          <MenuItem onClick={onToggleProgress}>{progressOn ? 'Hide progress bars' : 'Show progress bars'}</MenuItem>
          <MenuItem onClick={onToggleMasked}>{maskedOn ? 'Show amounts' : 'Hide amounts'}</MenuItem>
        </MenuPanel>
      </Menu>
      <BottomSheet open={movesOpen} onOpenChange={setMovesOpen}>
        <BottomSheetPanel label="Recent Moves">
          <div style={{ padding: '14px 16px calc(14px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Recent Moves</span>
              <BottomSheetClose aria-label="Close" className="hv-soft"
                style={{
                  width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16,
                }}
              >×</BottomSheetClose>
            </div>
            <RecentMovesList />
          </div>
        </BottomSheetPanel>
      </BottomSheet>
    </>
  );
}
