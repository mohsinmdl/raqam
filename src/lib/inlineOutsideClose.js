// Decides whether a pointer-down that landed outside the register table should
// close the open inline transaction editor row (desktop).
//
// It closes ONLY on a clean outside press:
//   - inTable      — the press is inside the table wrapper (a cell, another row,
//                    Save/Cancel): the table handles it, leave the row open.
//   - inOverlay    — the press is inside an open picker or the discard dialog
//                    (both portalled to <body>, outside the table): leave it be.
//   - overlayOpen  — a picker (category / payee / date / account) is currently
//                    open: this press just dismisses the picker, so keep the row.
//
// The caller routes the actual close through requestClose, so a meaningful
// unsaved draft still gets the usual "Discard your changes?" confirm.
export function shouldCloseInlineOnOutsidePress({ inTable, inOverlay, overlayOpen }) {
  return !inTable && !inOverlay && !overlayOpen;
}
