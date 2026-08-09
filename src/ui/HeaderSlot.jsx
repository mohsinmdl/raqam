// A tiny portal target in the app Header that a screen can fill with its own
// content. Used by the Budget screen to render its Ready-to-Assign pill up in
// the top bar (next to the month nav) even though the RTA + Assign logic lives
// down in the Plan screen. Header renders the slot div and publishes its DOM
// node here; a screen reads the node and createPortal()s into it.
import { createContext, useContext, useState } from 'react';

const HeaderSlotCtx = createContext(null);

export function HeaderSlotProvider({ children }) {
  // `setNode` is a stable useState setter, so passing it straight to a ref
  // (ref={setNode}) runs once on mount / once on unmount — no per-render churn.
  const [node, setNode] = useState(null);
  return <HeaderSlotCtx.Provider value={{ node, setNode }}>{children}</HeaderSlotCtx.Provider>;
}

export function useHeaderSlot() {
  return useContext(HeaderSlotCtx);
}
