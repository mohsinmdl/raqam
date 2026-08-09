// Shared category delete/hide flows used by both the Categories screen and the
// Plan inspector's quick-edit popover, so the destructive path lives in one
// place. Deps (ask/notify/applyData/openDrawer/S) are passed in because these
// touch UI context that a pure store action can't reach.
import { deletePolicy } from '../lib/validate.js';
import { archiveCategory, deleteCategory } from '../store/actions.js';
import { openers } from '../drawers/openers.js';

// Applies deletePolicy: built-in → archive-instead confirm; referenced → open
// the reassign drawer (YNAB "reassign past activity"); unused → permanent
// delete confirm. Returns once the flow settles (reassign hands off to the drawer).
export async function askDeleteCategory(cat, { S, ask, notify, applyData, openDrawer }) {
  const policy = deletePolicy(S, cat);
  if (policy.mode === 'archive') {
    const ok = await ask({
      title: '“' + cat.name + '” is a built-in category',
      body: 'Built-in categories can be archived but never deleted — history and charts depend on them. Archive it instead?',
      action: 'Archive instead',
    });
    if (!ok) return;
    applyData(data => archiveCategory(data, { id: cat.id }));
    notify('“' + cat.name + '” archived.');
    return;
  }
  if (policy.mode === 'reassign') {
    openers.reassignCategory(cat.id, openDrawer);
    return;
  }
  const ok = await ask({
    title: 'Delete “' + cat.name + '” permanently?',
    body: 'Nothing uses this category, so it can be removed outright. The deletion is recorded in history.',
    action: 'Delete permanently',
  });
  if (!ok) return;
  applyData(data => deleteCategory(data, { id: cat.id }));
  notify('“' + cat.name + '” deleted.');
}
