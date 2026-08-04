// Drawer registry: name → { title(state), sub(state), cta(state), Body, useSubmit }.
import { txFormDef } from './TxForm.jsx';
import { accountFormDef } from './AccountForm.jsx';
import { cardFormDef } from './CardForm.jsx';
import { payCardFormDef } from './PayCardForm.jsx';
import { snapshotFormDef } from './SnapshotForm.jsx';
import { adjustFormDef } from './AdjustForm.jsx';
import { adjustCardFormDef } from './AdjustCardForm.jsx';
import { categoryFormDef } from './CategoryForm.jsx';
import { reassignFormDef } from './ReassignForm.jsx';
import { budgetFormDef } from './BudgetForm.jsx';

export const drawerRegistry = {
  addTx: txFormDef,
  addAccount: accountFormDef,
  addCard: cardFormDef,
  payCard: payCardFormDef,
  snapshot: snapshotFormDef,
  adjust: adjustFormDef,
  adjustCard: adjustCardFormDef,
  category: categoryFormDef,
  reassign: reassignFormDef,
  budget: budgetFormDef,
};
