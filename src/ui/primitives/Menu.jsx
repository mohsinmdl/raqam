// Tokened wrapper over Base UI's Menu. Base UI (Floating UI under the hood)
// supplies anchored positioning + collision avoidance, portal, Escape /
// outside-click dismissal, and ARIA. Menu overlays screen content with zIndex 60.
import { Menu as BaseMenu } from '@base-ui/react/menu';

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

// The portalled, positioned surface. `side`/`align`/`sideOffset` anchor it to
// the trigger; collisionAvoidance:'shift' keeps it on-screen near edges.
export function MenuPanel({
  children, side = 'bottom', align = 'end', sideOffset = 6, style, ...rest
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionAvoidance={{ side: 'shift', align: 'shift' }}
        style={{ zIndex: 60 }}
      >
        <BaseMenu.Popup
          style={{
            minWidth: 220,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: 6,
            color: 'var(--text)',
            outline: 'none',
            ...style,
          }}
          {...rest}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
};

// Menu item with flex layout, hover/soft interactive styling via hv-soft class.
export function MenuItem({ children, style, ...rest }) {
  return (
    <BaseMenu.Item style={{ ...itemStyle, ...style }} className="hv-soft" {...rest}>
      {children}
    </BaseMenu.Item>
  );
}

// The same row as a real <a href> (Base UI's Menu.LinkItem), for items that
// name a destination: the browser's own Ctrl/Cmd+click, Shift+click,
// middle-click and "Open link in new tab" all work on it. Closes on click like
// MenuItem (LinkItem's own default is to stay open).
export function MenuLinkItem({ children, style, closeOnClick = true, ...rest }) {
  return (
    <BaseMenu.LinkItem
      closeOnClick={closeOnClick}
      style={{ ...itemStyle, color: 'inherit', textDecoration: 'none', ...style }}
      className="hv-soft"
      {...rest}
    >
      {children}
    </BaseMenu.LinkItem>
  );
}
