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

// Menu item with flex layout, hover/soft interactive styling via hv-soft class.
export function MenuItem({ children, style, ...rest }) {
  return (
    <BaseMenu.Item
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 13.5,
        fontWeight: 600,
        cursor: 'pointer',
        ...style,
      }}
      className="hv-soft"
      {...rest}
    >
      {children}
    </BaseMenu.Item>
  );
}
