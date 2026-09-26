// "Include recoverable spending" — the chart-only lens that folds excluded
// (recoverable / advance) categories back into spending views. Each screen
// owns its pref, so flipping it on one report leaves the others alone.
import Switch from './primitives/Switch.jsx';

export default function RecoverableSwitch({ checked, onChange, withLabel }) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      label={withLabel ? 'Include recoverable spending' : null}
      aria-label={withLabel ? undefined : 'Include recoverable spending'}
      title="Includes advances and other expenses marked as excluded from budgets."
    />
  );
}
