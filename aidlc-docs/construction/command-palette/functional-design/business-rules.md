# Business Rules — U1 command-palette

- **BR-1** ⌘K/Ctrl+K opens the palette from anywhere, including while focus is in a text field (global). `/` opens only when NOT in a typing target.
- **BR-2** Opening is idempotent; the palette never stacks over itself.
- **BR-3** Esc closes and restores focus to the pre-open element.
- **BR-4** Selecting an item records it in Recents (BR: only successful selections), then performs its action, then closes.
- **BR-5** Only user-visible/actionable entities are indexed: active accounts, active categories, visible non-transfer payees, other plans. Hidden/archived/transfer-mirror entities are excluded.
- **BR-6** Recents show only ids that still resolve to a live item; stale ids are dropped silently (BR-6a: never error on a deleted target).
- **BR-7** The palette opens no new data path — it indexes only already-loaded, RLS-gated store data for the open plan (SECURITY-08).
- **BR-8** The query is treated as untrusted text: rendered as text, never as HTML; used only as a matcher input (SECURITY-05).
- **BR-9** Any localStorage failure (Recents) degrades to empty and never blocks the palette (SECURITY-15, NFR-4).
- **BR-10** Actions requiring a target that doesn't exist (e.g. "Switch plan" with only one plan) are omitted rather than shown-and-failing.
- **BR-11** Desktop = centered modal; phone = full-screen sheet (NFR-3). Theme tokens only; no hard-coded colors.
