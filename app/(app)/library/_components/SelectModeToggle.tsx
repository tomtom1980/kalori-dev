'use client';

/**
 * `<SelectModeToggle />` — Task 4.1 sub-step 3 §7.8.
 *
 * Single `<button aria-pressed>` toggle between SELECT (idle, inverse-pill)
 * and CANCEL (active, dust text). Per design-lead §13 + ux-auditor §2.5 the
 * `aria-pressed` boolean carries the mode semantic.
 */
import { t } from '@/lib/i18n/en';

export interface SelectModeToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function SelectModeToggle({ active, onToggle }: SelectModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      data-testid="library-select-toggle"
      className="kalori-library-pill"
    >
      {active ? t.library.cancelButton : t.library.selectButton}
    </button>
  );
}

export default SelectModeToggle;
