# Frontend Components — U2 sms-parse

Gated on `useAI().enabled` for the LLM tier, but the ENTRY affordance + tier-1
parse can be shown whenever AI is enabled (tier-1 is offline/free; without AI
the whole paste feature is hidden, consistent with US-1 — it's an AI feature).
Stories US-9..US-12.

## PasteSmsEntry — `src/ui/ai/PasteSmsEntry.jsx`
- **Trigger**: a "Paste bank SMS" action in the add-transaction entry cluster
  (same places "add transaction" is reachable — FAB/menu on phone, the add
  button on desktop). Rendered only when `useAI().enabled`.
- **Surface**: phone → Base UI bottom sheet; desktop → Base UI dialog. Contents:
  a `<textarea>` (`data-testid="paste-sms-input"`), a **Parse** button
  (`data-testid="paste-sms-parse"`), Cancel.
- **On Parse**:
  1. `p = parseSmsLocal(text)` (instant).
  2. if `!p && enabled` → show a "reading…" / warming state, `await ai.parseSms(text)`.
  3. close the sheet, then `openers.addTx(openDrawer, seedType, toTxSeed(p, S))`
     — or, on failure, `openers.addTx(openDrawer, 'expense', { notes: text })`.
- **States**: idle · parsing (LLM tier, warming ≥3s per U0) · done (sheet closes,
  editor opens) · never a blocking error — failure silently routes to the notes
  fallback (US-12).
- **props**: `{ open, onClose }`; reads `useAI()` + `useStore()` + `useDrawer()`.

## Wiring (edits, additive)
- Add the "Paste bank SMS" item to the existing add-transaction entry points
  (e.g. `src/drawers/openers.js` gets an `openers.pasteSms(openDrawer)` that opens
  this sheet, wired next to `addTx` in the FAB/menu that already lists "add
  transaction"). Exact host: the same menu/among the same buttons `addTx` is
  triggered from (phone tab-bar add flow + desktop toolbar) — additive only.

## Interaction flows
1. Enable AI → "Paste bank SMS" appears in the add cluster.
2. Paste a known-bank SMS → Parse → prefilled editor opens instantly (no
   network); review → save (US-9).
3. Unknown format → Parse → brief warming → LLM fills the editor (US-11).
4. Junk/failed → Parse → editor opens empty with the SMS in notes (US-12).
5. AI off → the "Paste bank SMS" affordance is absent (US-1).

## State / validation
No form state of its own beyond the textarea; the opened editor owns all
validation (identical to manual entry). No new store state.
