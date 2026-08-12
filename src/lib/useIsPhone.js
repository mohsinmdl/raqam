import { useEffect, useState } from 'react';

// Phone-shell switch. Viewport media query — deliberately NOT a container
// query: the shell decides whether a sidebar exists at all, and on a phone
// there is no sidebar to drag, so content-width reactivity has no meaning
// here (brief §7). Dashboard modules keep container queries per the system.
const MQ = '(max-width: 700px)';

export function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(MQ).matches);
  useEffect(() => {
    const m = window.matchMedia(MQ);
    const on = e => setPhone(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}
