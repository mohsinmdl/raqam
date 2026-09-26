// Tokened wrapper over Base UI's Switch. Base UI supplies role="switch",
// aria-checked, keyboard activation and the controlled/uncontrolled state; we
// keep the app's look — the small pill track + knob the Overview charts
// already drew by hand. Rendered as a native <button> so the optional visible
// label sits inside the one click target and names the control.
import { Switch as BaseSwitch } from '@base-ui/react/switch';

export default function Switch({ checked, onCheckedChange, label, title, 'aria-label': ariaLabel }) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={next => onCheckedChange(next)}
      nativeButton
      render={<button type="button" />}
      aria-label={ariaLabel}
      title={title}
      style={{ display: 'flex', alignItems: 'center', gap: 7, height: 24, padding: label ? '0 4px' : 0, border: 'none', background: 'none', color: 'var(--muted)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}
    >
      <span aria-hidden="true" style={{ width: 30, height: 18, padding: 2, boxSizing: 'border-box', borderRadius: 999, background: checked ? 'var(--accent)' : 'var(--track)', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: checked ? 'flex-end' : 'flex-start', flex: 'none' }}>
        <BaseSwitch.Thumb style={{ display: 'block', width: 12, height: 12, borderRadius: 999, background: checked ? 'var(--on-accent)' : 'var(--surface)' }} />
      </span>
      {label || null}
    </BaseSwitch.Root>
  );
}
