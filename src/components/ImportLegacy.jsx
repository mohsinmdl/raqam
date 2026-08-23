import { useEffect, useRef } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { loadLegacy, markLegacyMigrated } from '../store/persistence.js';
import { rolloverMonth } from '../store/actions.js';
import { freshStore } from '../store/seed.js';
import { uid } from '../lib/util.js';

// One-shot migration offer: if this device holds pre-Supabase data (raqam.v1)
// and the signed-in account is empty, offer to import. The local key is renamed
// to a timestamped backup ONLY after every row is confirmed on the server;
// a failed/partial import leaves it untouched and upserts make retries safe.
export default function ImportLegacy() {
  const { data, replaceData, drainSync } = useStore();
  const { ask, notify } = useUI();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !data) return;
    ran.current = true;

    const serverHasData = data.accounts.length > 0 || data.transactions.length > 0 || data.cards.length > 0;
    if (serverHasData) return;

    const legacy = loadLegacy();
    if (legacy.kind !== 'loaded') return;
    const d = legacy.data;
    const counts = { accounts: d.accounts?.length || 0, transactions: d.transactions?.length || 0, cards: d.cards?.length || 0 };
    if (counts.accounts + counts.transactions + counts.cards === 0) return;

    (async () => {
      const ok = await ask({
        title: 'Import your data from this device?',
        body: `Raqam found data saved on this device from before you signed in: ${counts.accounts} account${counts.accounts === 1 ? '' : 's'}, ${counts.transactions} transaction${counts.transactions === 1 ? '' : 's'}, ${counts.cards} card${counts.cards === 1 ? '' : 's'}. Import it into your account? A backup copy stays on this device either way.`,
        action: 'Import',
      });
      if (!ok) return; // key stays; offered again only while the account is empty

      // Merge onto the hydrated catalogues (server institutions/products win by id),
      // roll the current month, and let the diff-sync push everything in FK order.
      // freshStore() underneath is the shape normalizer: a legacy blob predates
      // whatever collections have been added since (payees, assignments,
      // categoryGroups…), and every reader downstream — actions, sync's differ,
      // the pure lib helpers — assumes each collection is an array.
      const base = freshStore();
      // Same fresh-id rule as resetAll/seedPlanCategories: when the blob has no
      // categories of its own, this seed fallback must not re-introduce the
      // fixed catalogue ids into whichever plan is open — upserting them from a
      // non-default plan would re-stamp the default plan's rows (U2 handoff).
      base.categories = base.categories.map(c => ({ ...c, id: uid() }));
      const merged = {
        ...base,
        ...d,
        institutions: [
          ...data.institutions,
          // Anything not already in the server catalogue is this user's own row —
          // `own` is what makes it writable (src/store/sync.js).
          ...(d.institutions || []).filter(i => !data.institutions.some(x => x.id === i.id))
            .map(i => ({ ...i, own: true })),
        ],
        cardProducts: data.cardProducts,
      };
      replaceData(rolloverMonth(merged));
      notify('Importing your data…');
      // Wait for the queue to confirm everything reached the server.
      const clean = await drainSync(60_000);
      if (clean) {
        markLegacyMigrated();
        notify('Your data was imported — a backup copy remains on this device.');
      } else {
        notify('Import is still syncing — leave the tab open; your local copy is untouched until it completes.');
      }
    })();
  }, [data, ask, notify, replaceData, drainSync]);

  return null;
}
