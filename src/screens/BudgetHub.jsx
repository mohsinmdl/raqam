// Budget hub: hosts the Budget screen (and the Recurring child route, now
// reached from the account menu rather than a tab). The Categories tab was
// removed and Recurring moved into the user menu to declutter the budget area,
// so there is no longer a sub-nav here — just the routed panel.
import { Outlet } from 'react-router-dom';

export default function BudgetHub() {
  return <Outlet />;
}
