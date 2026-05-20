# Add Food Tab Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the log-flow modal's Type + Library tabs into a single unified "Add Food" tab whose default view is the library list with a match-to-shape loading skeleton, while preserving all existing parse/save flows.

**Architecture:** New `AddFoodTab` wrapper hosts an inline-swap between `<LibraryList>` and `<AiParseForm>` (extracted from `LibraryTab.tsx` and `TypeTab.tsx`). The visible tab bar reduces from 3 buttons to 2 (Add Food + Snap), but `LogTab = 'type' | 'snap' | 'library'` stays internally to preserve `commitSaveSuccess`, `clientIds`, and library-only mode wiring. Radix `Tabs.Root` computes its `value` from `activeTab` (mapping `'type' | 'library'` → `'add-food'`). A subtle `+` icon beside the library search and a prominent empty-state CTA both call `setActiveTab('type')`; the empty-state CTA also seeds `typeDraft` with the current search term.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, Zustand (`useLogFlowStore`), Radix `@radix-ui/react-tabs`, Lucide icons, Vitest + React Testing Library, Playwright. Project convention: `kalori-*` CSS class prefix, `data-testid` on every interactive element, `t.*` i18n via static object import.

---

## Spec deviation (read first)

The design spec at `Planning/features/2026-05-17-add-food-tab-merge/design.md` §5 stated `LogTab` would narrow to `'add-food' | 'snap'`. **This plan adopts a cleaner alternative**: keep `LogTab = 'type' | 'snap' | 'library'` as the internal state-keying union; reduce only the *displayed* tab bar to 2 buttons. Justification:

- `clientIds: Partial<Record<LogTab, string>>` is keyed by tab → narrowing breaks per-tab idempotency reset.
- `commitSaveSuccess(tab)` already differentiates `typeDraft` cleanup vs `librarySelection` cleanup by tab key → narrowing would require either a new `source` parameter or merging both cleanups (over-cleans).
- `library-only` mode caller in `LibraryClient.tsx:614` passes `tab: 'type'` → narrowing would require updating that caller AND adding a special-case in the `mode === 'library-only'` branch.

By keeping the internal union, **zero changes to the store, ConfirmationScreen, commitSaveSuccess, or library-only mode**. All changes are surgical at the *render layer* of `LogFlowTabs.tsx`.

User UX is identical to the design spec — the deviation is purely an implementation detail.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `app/(app)/log/_components/AddFoodTab/AddFoodTab.tsx` | CREATE | Wrapper that selects subview based on `activeTab` (`'library'` → LibraryList, `'type'` → AiParseForm). Lifts no state — both subviews read `activeTab` directly from the store. |
| `app/(app)/log/_components/AddFoodTab/LibraryList.tsx` | CREATE (from LibraryTab.tsx) | Library list with search, sort, items grid, selection CTA, mobile wheel picker. Adds `+` icon button beside search and CTA inside empty state. Renders `<LibraryLoadingSkeleton>` while hydrating. |
| `app/(app)/log/_components/AddFoodTab/AiParseForm.tsx` | CREATE (from TypeTab.tsx) | AI-parse form (textarea + PARSE button + ManualEntryFallback). Adds optional back-arrow header when `onBack` prop provided. Library-only mode renders this without `onBack`. |
| `app/(app)/log/_components/AddFoodTab/LibraryLoadingSkeleton.tsx` | CREATE | 8-row match-to-shape skeleton. Respects `prefers-reduced-motion`. |
| `app/(app)/log/_components/AddFoodTab/AddNewItemIconButton.tsx` | CREATE | 32×32 ghost icon button (Lucide `Plus`). Calls `setActiveTab('type')` on click. |
| `app/(app)/log/_components/AddFoodTab/AddNewItemCTA.tsx` | CREATE | Prominent full-width button for empty state. Receives `searchTerm` prop; calls `onAddNew(searchTerm)` which seeds typeDraft + switches view. |
| `app/(app)/log/_components/LogFlowTabs.tsx` | MODIFY | `TAB_DEFS` → 2 entries; `Tabs.Root` value/onChange mapping; `Tabs.Content` rendering; library-only branch swaps `<TypeTab>` → `<AiParseForm>`. |
| `app/(app)/log/_components/LibraryTab.tsx` | DELETE | Replaced by `AddFoodTab/LibraryList.tsx`. |
| `app/(app)/log/_components/TypeTab.tsx` | DELETE | Replaced by `AddFoodTab/AiParseForm.tsx`. |
| `components/dashboard/MealEntryContextTrigger.tsx` | MODIFY (line 56) | `openModal('type', ...)` → `openModal('library', ...)` so dashboard FAB lands on library subview. |
| `app/(app)/library/_components/LibraryClient.tsx` | UNCHANGED (line 614) | Stays as `openLogModal('type', { mode: 'library-only' })`. Library-only branch in LogFlowTabs renders AiParseForm without onBack. |
| `lib/i18n/en.ts` | MODIFY | Add `t.log.tabAddFoodLabel`. Keep `tabTypeLabel`, `tabLibraryLabel` (no longer referenced — safe to delete in same commit but not required). Add new strings for `+` button aria-label + empty-state CTA + back-arrow aria-label. |
| `app/globals.css` | MODIFY | Add `.kalori-library-skeleton-*` rules + `.kalori-add-food-back-button` + `.kalori-add-food-add-new-icon` rules. |
| `tests/unit/components/log-flow/LibraryLoadingSkeleton.test.tsx` | CREATE | Skeleton renders rowCount, aria-busy, reduced-motion. |
| `tests/unit/components/log-flow/AddNewItemIconButton.test.tsx` | CREATE | Renders Lucide Plus icon, calls onClick. |
| `tests/unit/components/log-flow/AddNewItemCTA.test.tsx` | CREATE | Renders CTA copy, calls onAddNew with searchTerm. |
| `tests/unit/components/log-flow/LibraryList.test.tsx` | CREATE | Match-to-shape skeleton on hydrating; `+` button rendering; empty-state CTA when no match; CTA seeds typeDraft. |
| `tests/unit/components/log-flow/AiParseForm.test.tsx` | CREATE | Renders back arrow when onBack provided; omits when not; PARSE flow unchanged from TypeTab. |
| `tests/unit/components/log-flow/AddFoodTab.test.tsx` | CREATE | Renders LibraryList when activeTab='library'; renders AiParseForm when activeTab='type'; back arrow returns to library. |
| `tests/integration/add-food-tab-flow.test.tsx` | CREATE | Full happy path: open → skeleton → items → search-miss → CTA → parse pre-filled → ConfirmationScreen. |
| `tests/integration/add-food-tab-back-nav.test.tsx` | CREATE | Open → search 'pho' → `+` → parse view → back → search term preserved. |
| `tests/e2e/user-stories/US-ADDFOOD-1.spec.ts` | CREATE | E2E user story with 5 ACs (per design spec §8). |
| `tests/unit/components/log-flow/LogFlowTabs.*.test.tsx` (existing) | MODIFY | Update selectors from `tab-type`/`tab-library` to `tab-add-food`; refresh snapshot. |
| Other E2E specs touching `tab-type` / `tab-library` selectors | MODIFY | Grep audit + migrate (US-STAB-A1, A2, A3-bundled, A-bundled known; full list via grep). |
| Visual baselines under `tests/screenshots/` | REFRESH | ~6–10 baselines showing the old 3-tab bar need refresh. |

---

## Task 1: Add i18n strings for the new UI

**Files:**
- Modify: `lib/i18n/en.ts` (locate `t.log` block around line 388)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/i18n/add-food-strings.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n/en';

describe('Add Food tab i18n strings', () => {
  it('has tabAddFoodLabel', () => {
    expect(t.log.tabAddFoodLabel).toBe('ADD FOOD');
  });

  it('has addNewItemAriaLabel for the + icon button', () => {
    expect(t.log.addNewItemAriaLabel).toBe('Add new food item');
  });

  it('has addNewItemCtaPrefix for the empty-state CTA', () => {
    // Pattern: `Add "${query}" as new item` — caller substitutes the search term.
    expect(t.log.addNewItemCtaPrefix).toBe('Add');
    expect(t.log.addNewItemCtaSuffix).toBe('as new item');
  });

  it('has libraryNoMatchWithCta for the no-match empty state header', () => {
    expect(t.log.libraryNoMatchWithCta).toBe('Nothing matches that search yet.');
  });

  it('has backToLibraryAriaLabel for the AiParseForm back arrow', () => {
    expect(t.log.backToLibraryAriaLabel).toBe('Back to library');
  });

  it('has loadingLibraryA11y for the skeleton aria-label', () => {
    expect(t.log.loadingLibraryA11y).toBe('Loading library');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/i18n/add-food-strings.test.ts`
Expected: 6 FAIL, each "Cannot read properties of undefined".

- [ ] **Step 3: Add strings to `lib/i18n/en.ts`**

Locate the `log: { ... }` block (starts ~line 388). Add the following keys alongside existing tab labels:

```typescript
// Inside t.log = { ... }
tabAddFoodLabel: 'ADD FOOD',
addNewItemAriaLabel: 'Add new food item',
addNewItemCtaPrefix: 'Add',
addNewItemCtaSuffix: 'as new item',
libraryNoMatchWithCta: 'Nothing matches that search yet.',
backToLibraryAriaLabel: 'Back to library',
loadingLibraryA11y: 'Loading library',
```

Note: `tabTypeLabel` and `tabLibraryLabel` stay (they're no longer referenced by `LogFlowTabs.tsx` after Task 8, but other tests and storybook entries may still reference them — verify via grep at Task 11).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/i18n/add-food-strings.test.ts`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/en.ts tests/unit/i18n/add-food-strings.test.ts
git commit -m "feat(i18n): add strings for Add Food tab merge

Adds tabAddFoodLabel, addNewItemAriaLabel, addNewItemCtaPrefix/Suffix,
libraryNoMatchWithCta, backToLibraryAriaLabel, loadingLibraryA11y.
Old tabTypeLabel/tabLibraryLabel retained until LogFlowTabs swap (Task 8).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: LibraryLoadingSkeleton component

**Files:**
- Create: `app/(app)/log/_components/AddFoodTab/LibraryLoadingSkeleton.tsx`
- Create: `tests/unit/components/log-flow/LibraryLoadingSkeleton.test.tsx`
- Modify: `app/globals.css` (add `.kalori-library-skeleton-*` rules)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/log-flow/LibraryLoadingSkeleton.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LibraryLoadingSkeleton } from '@/app/(app)/log/_components/AddFoodTab/LibraryLoadingSkeleton';

describe('<LibraryLoadingSkeleton />', () => {
  it('renders 8 rows by default', () => {
    render(<LibraryLoadingSkeleton />);
    expect(screen.getAllByTestId(/library-skeleton-row-/)).toHaveLength(8);
  });

  it('respects rowCount prop', () => {
    render(<LibraryLoadingSkeleton rowCount={3} />);
    expect(screen.getAllByTestId(/library-skeleton-row-/)).toHaveLength(3);
  });

  it('marks the container aria-busy and labels it for screen readers', () => {
    render(<LibraryLoadingSkeleton />);
    const container = screen.getByTestId('library-skeleton');
    expect(container.getAttribute('aria-busy')).toBe('true');
    expect(container.getAttribute('aria-label')).toBe('Loading library');
  });

  it('applies deterministic varying widths to name bars (avoids uniform look)', () => {
    render(<LibraryLoadingSkeleton rowCount={4} />);
    const nameBars = screen.getAllByTestId(/library-skeleton-name-/);
    const widths = nameBars.map((el) => (el as HTMLElement).style.width);
    // Each row has a different width.
    expect(new Set(widths).size).toBeGreaterThan(1);
    widths.forEach((w) => {
      const pct = parseInt(w, 10);
      expect(pct).toBeGreaterThanOrEqual(60);
      expect(pct).toBeLessThanOrEqual(95);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/log-flow/LibraryLoadingSkeleton.test.tsx`
Expected: 4 FAIL with "Cannot find module".

- [ ] **Step 3: Create the component**

Create `app/(app)/log/_components/AddFoodTab/LibraryLoadingSkeleton.tsx`:

```typescript
'use client';

/**
 * <LibraryLoadingSkeleton /> — match-to-shape placeholder for the library
 * list during initial hydration. Renders 8 rows that mirror the final
 * row anatomy (thumb + name bar + macros + kcal). Variable per-row width
 * is derived from index so the visual pattern is stable across renders.
 *
 * Respects `prefers-reduced-motion` via CSS in app/globals.css — the
 * pulse animation is gated by a media query.
 */
import { t } from '@/lib/i18n/en';

const ROW_WIDTHS = [82, 67, 91, 74, 88, 62, 95, 70] as const;

export interface LibraryLoadingSkeletonProps {
  rowCount?: number;
}

export function LibraryLoadingSkeleton({ rowCount = 8 }: LibraryLoadingSkeletonProps) {
  return (
    <ul
      data-testid="library-skeleton"
      aria-busy="true"
      aria-label={t.log.loadingLibraryA11y}
      className="kalori-library-skeleton"
    >
      {Array.from({ length: rowCount }, (_, i) => (
        <li
          key={i}
          data-testid={`library-skeleton-row-${i}`}
          className="kalori-library-skeleton-row"
        >
          <div className="kalori-library-skeleton-thumb" aria-hidden="true" />
          <div className="kalori-library-skeleton-content">
            <div
              data-testid={`library-skeleton-name-${i}`}
              className="kalori-library-skeleton-name"
              style={{ width: `${ROW_WIDTHS[i % ROW_WIDTHS.length]}%` }}
              aria-hidden="true"
            />
            <div className="kalori-library-skeleton-macros" aria-hidden="true">
              <span className="kalori-library-skeleton-macro" />
              <span className="kalori-library-skeleton-macro" />
              <span className="kalori-library-skeleton-macro" />
            </div>
          </div>
          <div className="kalori-library-skeleton-kcal" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

export default LibraryLoadingSkeleton;
```

- [ ] **Step 4: Add CSS rules to `app/globals.css`**

Append to `app/globals.css` (under the existing log-flow CSS section, near `.kalori-log-empty`):

```css
/* --- Library loading skeleton (Add Food tab merge) -------------------- */

.kalori-library-skeleton {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.kalori-library-skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding-block: var(--spacing-3);
  padding-inline: var(--spacing-3);
  border-top: 1px solid var(--color-rule);
}

.kalori-library-skeleton-row:last-child {
  border-bottom: 1px solid var(--color-rule);
}

.kalori-library-skeleton-thumb {
  width: 56px;
  height: 56px;
  background: var(--color-mock-bg);
  flex-shrink: 0;
}

.kalori-library-skeleton-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.kalori-library-skeleton-name {
  height: 14px;
  background: var(--color-mock-bg);
}

.kalori-library-skeleton-macros {
  display: flex;
  gap: var(--spacing-2);
}

.kalori-library-skeleton-macro {
  width: 32px;
  height: 9px;
  background: var(--color-mock-bg);
  opacity: 0.65;
}

.kalori-library-skeleton-kcal {
  width: 48px;
  height: 11px;
  background: var(--color-mock-bg);
  flex-shrink: 0;
}

@media (prefers-reduced-motion: no-preference) {
  .kalori-library-skeleton-thumb,
  .kalori-library-skeleton-name,
  .kalori-library-skeleton-macro,
  .kalori-library-skeleton-kcal {
    animation: kalori-skeleton-pulse 1.5s ease-in-out infinite;
  }
}

@keyframes kalori-skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/components/log-flow/LibraryLoadingSkeleton.test.tsx`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/log/_components/AddFoodTab/LibraryLoadingSkeleton.tsx \
        tests/unit/components/log-flow/LibraryLoadingSkeleton.test.tsx \
        app/globals.css
git commit -m "feat(log-flow): add LibraryLoadingSkeleton component

8-row match-to-shape placeholder for library hydration with deterministic
per-row width variation and prefers-reduced-motion guard on the pulse
animation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: AddNewItemIconButton component

**Files:**
- Create: `app/(app)/log/_components/AddFoodTab/AddNewItemIconButton.tsx`
- Create: `tests/unit/components/log-flow/AddNewItemIconButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/log-flow/AddNewItemIconButton.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AddNewItemIconButton } from '@/app/(app)/log/_components/AddFoodTab/AddNewItemIconButton';

describe('<AddNewItemIconButton />', () => {
  it('renders with aria-label', () => {
    render(<AddNewItemIconButton onAddNew={() => {}} />);
    const btn = screen.getByTestId('library-add-new-icon-button');
    expect(btn.getAttribute('aria-label')).toBe('Add new food item');
  });

  it('invokes onAddNew when clicked', () => {
    const onAddNew = vi.fn();
    render(<AddNewItemIconButton onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(onAddNew).toHaveBeenCalledOnce();
  });

  it('renders the Lucide Plus icon via svg child', () => {
    render(<AddNewItemIconButton onAddNew={() => {}} />);
    const btn = screen.getByTestId('library-add-new-icon-button');
    expect(btn.querySelector('svg')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/log-flow/AddNewItemIconButton.test.tsx`
Expected: 3 FAIL with "Cannot find module".

- [ ] **Step 3: Create the component**

Create `app/(app)/log/_components/AddFoodTab/AddNewItemIconButton.tsx`:

```typescript
'use client';

/**
 * <AddNewItemIconButton /> — subtle 32×32 ghost icon button rendered to
 * the right of the library search input. Click swaps the AddFoodTab
 * subview to AI parse (calls `onAddNew` with no seed text).
 */
import { Plus } from 'lucide-react';

import { t } from '@/lib/i18n/en';

export interface AddNewItemIconButtonProps {
  onAddNew: () => void;
}

export function AddNewItemIconButton({ onAddNew }: AddNewItemIconButtonProps) {
  return (
    <button
      type="button"
      data-testid="library-add-new-icon-button"
      aria-label={t.log.addNewItemAriaLabel}
      onClick={onAddNew}
      className="kalori-add-food-add-new-icon"
    >
      <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

export default AddNewItemIconButton;
```

- [ ] **Step 4: Add CSS for the button**

Append to `app/globals.css` (under the new skeleton block):

```css
/* --- Add new item icon button (Add Food tab merge) -------------------- */

.kalori-add-food-add-new-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 1px solid var(--color-rule);
  color: var(--color-ivory);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.kalori-add-food-add-new-icon:hover {
  background: var(--color-bg-1);
  border-color: var(--color-rule-strong);
}

.kalori-add-food-add-new-icon:focus-visible {
  outline: 2px solid var(--color-oxblood);
  outline-offset: 1px;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/components/log-flow/AddNewItemIconButton.test.tsx`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/log/_components/AddFoodTab/AddNewItemIconButton.tsx \
        tests/unit/components/log-flow/AddNewItemIconButton.test.tsx \
        app/globals.css
git commit -m "feat(log-flow): add AddNewItemIconButton (Add Food tab '+' icon)

32x32 ghost button with Lucide Plus icon, 44x44 outer touch target,
beside library search input.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: AddNewItemCTA component

**Files:**
- Create: `app/(app)/log/_components/AddFoodTab/AddNewItemCTA.tsx`
- Create: `tests/unit/components/log-flow/AddNewItemCTA.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/log-flow/AddNewItemCTA.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AddNewItemCTA } from '@/app/(app)/log/_components/AddFoodTab/AddNewItemCTA';

describe('<AddNewItemCTA />', () => {
  it('renders the CTA text with the search term in quotes', () => {
    render(<AddNewItemCTA searchTerm="banh xeo" onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-cta')).toHaveTextContent(
      'Add "banh xeo" as new item',
    );
  });

  it('renders generic copy when searchTerm is empty', () => {
    render(<AddNewItemCTA searchTerm="" onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-cta')).toHaveTextContent(
      'Add new item',
    );
  });

  it('invokes onAddNew with the search term', () => {
    const onAddNew = vi.fn();
    render(<AddNewItemCTA searchTerm="pho" onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(onAddNew).toHaveBeenCalledWith('pho');
  });

  it('invokes onAddNew with empty string when no search term', () => {
    const onAddNew = vi.fn();
    render(<AddNewItemCTA searchTerm="" onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(onAddNew).toHaveBeenCalledWith('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/log-flow/AddNewItemCTA.test.tsx`
Expected: 4 FAIL with "Cannot find module".

- [ ] **Step 3: Create the component**

Create `app/(app)/log/_components/AddFoodTab/AddNewItemCTA.tsx`:

```typescript
'use client';

/**
 * <AddNewItemCTA /> — prominent button rendered inside the library
 * empty-state when a search returns no matches. Click seeds the AI parse
 * textarea with the current search term and swaps the AddFoodTab subview.
 */
import { Plus } from 'lucide-react';

import { t } from '@/lib/i18n/en';

export interface AddNewItemCTAProps {
  searchTerm: string;
  onAddNew: (seed: string) => void;
}

export function AddNewItemCTA({ searchTerm, onAddNew }: AddNewItemCTAProps) {
  const trimmed = searchTerm.trim();
  const label = trimmed
    ? `${t.log.addNewItemCtaPrefix} "${trimmed}" ${t.log.addNewItemCtaSuffix}`
    : `${t.log.addNewItemCtaPrefix} new item`;

  return (
    <button
      type="button"
      data-testid="library-add-new-cta"
      onClick={() => onAddNew(searchTerm)}
      className="kalori-add-food-add-new-cta"
    >
      <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export default AddNewItemCTA;
```

- [ ] **Step 4: Add CSS for the CTA**

Append to `app/globals.css`:

```css
/* --- Add new item empty-state CTA ------------------------------------- */

.kalori-add-food-add-new-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  padding-inline: var(--spacing-5);
  padding-block: var(--spacing-3);
  background: transparent;
  border: 1px solid var(--color-oxblood);
  color: var(--color-ivory);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.kalori-add-food-add-new-cta:hover {
  background: var(--color-bg-1);
}

.kalori-add-food-add-new-cta:focus-visible {
  outline: 2px solid var(--color-oxblood);
  outline-offset: 1px;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/components/log-flow/AddNewItemCTA.test.tsx`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/log/_components/AddFoodTab/AddNewItemCTA.tsx \
        tests/unit/components/log-flow/AddNewItemCTA.test.tsx \
        app/globals.css
git commit -m "feat(log-flow): add AddNewItemCTA for empty-state path

Prominent button inside library empty-state when search returns no
matches. Renders quoted search term in the label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extract LibraryTab → LibraryList + wire skeleton + CTA

**Files:**
- Create: `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`
- Create: `tests/unit/components/log-flow/LibraryList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/log-flow/LibraryList.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LibraryList } from '@/app/(app)/log/_components/AddFoodTab/LibraryList';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const RESET = () => {
  useLogFlowStore.setState({
    libraryItems: [],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
    failureMode: null,
  });
};

describe('<LibraryList />', () => {
  beforeEach(RESET);

  it('renders LibraryLoadingSkeleton when items are empty and hydrating', () => {
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.getByTestId('library-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('library-list')).toBeNull();
  });

  it('renders AddNewItemIconButton beside the search input', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
    });
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-icon-button')).toBeTruthy();
  });

  it('icon button calls onAddNew with empty string (no seed)', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
    });
    const onAddNew = vi.fn();
    render(<LibraryList onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(onAddNew).toHaveBeenCalledWith('');
  });

  it('renders empty-state CTA when search returns no matches', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
      librarySearch: 'banh xeo',
    });
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-cta')).toHaveTextContent(
      'Add "banh xeo" as new item',
    );
  });

  it('empty-state CTA seeds onAddNew with the search term', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
      librarySearch: 'banh xeo',
    });
    const onAddNew = vi.fn();
    render(<LibraryList onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(onAddNew).toHaveBeenCalledWith('banh xeo');
  });

  it('does NOT render empty-state CTA when there are matching items', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho bo',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
      librarySearch: 'pho',
    });
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.queryByTestId('library-add-new-cta')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/log-flow/LibraryList.test.tsx`
Expected: 6 FAIL with "Cannot find module".

- [ ] **Step 3: Copy `LibraryTab.tsx` to `AddFoodTab/LibraryList.tsx` and rename the export**

The new file is **mostly identical** to `app/(app)/log/_components/LibraryTab.tsx` with these changes:

1. Rename `LibraryTab` function and default export → `LibraryList`.
2. Rename `LibraryTabProps` → `LibraryListProps`. Add a required `onAddNew: (seed: string) => void` prop.
3. Rename `data-testid="library-tab"` → `data-testid="library-list"`.
4. After the search input `<input ... />` block, before the closing `</div>` of the search row, render `<AddNewItemIconButton onAddNew={() => onAddNew('')} />`.
5. Wrap the search input and the icon button in a flex row so they sit side-by-side.
6. **Replace** the existing empty-state block (lines 405-421 of LibraryTab.tsx) with conditional logic:
   - If `hydrating && items.length === 0` → render `<LibraryLoadingSkeleton />`
   - Else if `sorted.length === 0 && normalized` → render the no-match empty state WITH `<AddNewItemCTA searchTerm={search} onAddNew={onAddNew} />` underneath
   - Else if `sorted.length === 0 && !normalized` → render the empty-library state (no CTA — user has zero saved items, the icon button is the path)
   - Else → render the items grid as today

Add the new imports at the top of the file:

```typescript
import { AddNewItemIconButton } from './AddNewItemIconButton';
import { AddNewItemCTA } from './AddNewItemCTA';
import { LibraryLoadingSkeleton } from './LibraryLoadingSkeleton';
```

Update the existing imports — remove `./ManualEntryFallback` and re-add as `../ManualEntryFallback` (parent dir).

The new `LibraryListProps`:

```typescript
export interface LibraryListProps {
  /**
   * Legacy injected items (Task 3.3). When omitted, items are read from
   * `useLogFlowStore.libraryItems` (Task 4.7.4 hydration path).
   */
  items?: LibraryItem[];
  /**
   * Add Food tab merge — called when user clicks the '+' icon (with empty
   * seed) or the empty-state CTA (with the current search term as seed).
   * Parent (AddFoodTab) typically responds by `setTypeDraft(seed)` +
   * `setActiveTab('type')`.
   */
  onAddNew: (seed: string) => void;
}
```

The new search-row + skeleton + empty-state block (replacing existing lines ~331-421):

```tsx
{/* Search row: input + Add new icon button */}
<div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'stretch' }}>
  <div style={{ position: 'relative', flex: 1 }}>
    <Search
      size={18}
      strokeWidth={1.5}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 'var(--spacing-3)',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--color-dust)',
        pointerEvents: 'none',
      }}
    />
    <input
      ref={searchInputRef}
      id="library-search"
      type="search"
      value={search}
      onChange={(ev) => setSearch(ev.target.value)}
      placeholder={t.log.librarySearchPlaceholder}
      autoComplete="off"
      data-testid="library-search-input"
      aria-describedby={resultCountId}
      className="kalori-log-search"
    />
    <kbd
      aria-hidden="true"
      className="kalori-log-kbd"
      style={{
        position: 'absolute',
        right: 'var(--spacing-3)',
        top: '50%',
        transform: 'translateY(-50%)',
      }}
    >
      {t.log.librarySearchKbdHint}
    </kbd>
  </div>
  <AddNewItemIconButton onAddNew={() => onAddNew('')} />
</div>

{/* sr-only result count — polite live region per compliance §13. */}
<span id={resultCountId} role="status" aria-live="polite" className="sr-only">
  {t.log.libraryResultCount
    .replace('{shown}', String(sorted.length))
    .replace('{total}', String(items.length))}
</span>

{/* sort radiogroup unchanged from LibraryTab.tsx — copy verbatim */}
{/* ... */}

{/* List / skeleton / empty-state — REPLACES old lines ~405-421 */}
{hydrating && items.length === 0 ? (
  <LibraryLoadingSkeleton />
) : sorted.length === 0 ? (
  <div className="kalori-log-empty" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', alignItems: 'center' }}>
    <p
      data-testid="library-empty-state"
      style={{
        fontFamily: 'var(--font-serif)',
        fontStyle: 'italic',
        fontSize: '18px',
        fontWeight: 300,
        color: 'var(--color-sand)',
        margin: 0,
      }}
    >
      {normalized ? t.log.libraryNoMatchWithCta : t.log.libraryEmpty}
    </p>
    {normalized ? <AddNewItemCTA searchTerm={search} onAddNew={onAddNew} /> : null}
  </div>
) : (
  <ul
    role="listbox"
    aria-label={t.log.libraryListA11y}
    aria-multiselectable="true"
    aria-activedescendant={activeDescendantId ?? undefined}
    data-testid="library-list"
    className="kalori-log-grid"
  >
    {/* item rendering unchanged — copy verbatim from LibraryTab.tsx lines 431-599 */}
  </ul>
)}
```

The rest of the file (sort radiogroup, item rendering, selection bar, mobile wheel picker, ManualEntryFallback gate) is **identical** to `LibraryTab.tsx`. Copy verbatim.

Also update the file-level docstring at the top to reflect the new role: replace the `LibraryTab` references with `LibraryList`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/components/log-flow/LibraryList.test.tsx`
Expected: 6 PASS.

- [ ] **Step 5: Run the full unit suite for log-flow to verify nothing else broke**

Run: `pnpm vitest run tests/unit/components/log-flow/`
Expected: PASS (note: existing LibraryTab tests will still pass against the still-mounted `LibraryTab.tsx` — that file is deleted in Task 11).

- [ ] **Step 6: Commit**

```bash
git add app/(app)/log/_components/AddFoodTab/LibraryList.tsx \
        tests/unit/components/log-flow/LibraryList.test.tsx
git commit -m "feat(log-flow): extract LibraryList from LibraryTab

Copies LibraryTab.tsx as LibraryList.tsx inside AddFoodTab/ with three
additions: AddNewItemIconButton beside search, LibraryLoadingSkeleton
during hydration, AddNewItemCTA inside the no-match empty state.
LibraryTab.tsx still exists for backward compat; deleted in Task 11.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Extract TypeTab → AiParseForm + add optional back arrow

**Files:**
- Create: `app/(app)/log/_components/AddFoodTab/AiParseForm.tsx`
- Create: `tests/unit/components/log-flow/AiParseForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/log-flow/AiParseForm.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AiParseForm } from '@/app/(app)/log/_components/AddFoodTab/AiParseForm';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

beforeEach(() => {
  useLogFlowStore.setState({
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
    originalInput: null,
  });
});

describe('<AiParseForm />', () => {
  it('renders the back arrow when onBack is provided', () => {
    render(<AiParseForm onBack={() => {}} />);
    expect(screen.getByTestId('ai-parse-form-back')).toBeTruthy();
  });

  it('does NOT render the back arrow when onBack is omitted (library-only mode)', () => {
    render(<AiParseForm />);
    expect(screen.queryByTestId('ai-parse-form-back')).toBeNull();
  });

  it('back arrow has aria-label "Back to library"', () => {
    render(<AiParseForm onBack={() => {}} />);
    expect(
      screen.getByTestId('ai-parse-form-back').getAttribute('aria-label'),
    ).toBe('Back to library');
  });

  it('back arrow click invokes onBack', () => {
    const onBack = vi.fn();
    render(<AiParseForm onBack={onBack} />);
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('preserves the existing textarea + PARSE button (sanity)', () => {
    render(<AiParseForm onBack={() => {}} />);
    expect(screen.getByTestId('type-tab-textarea')).toBeTruthy();
    expect(screen.getByTestId('type-tab-parse-button')).toBeTruthy();
  });

  it('seeds textarea from typeDraft store value', () => {
    useLogFlowStore.setState({ typeDraft: 'banh xeo' });
    render(<AiParseForm onBack={() => {}} />);
    const textarea = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('banh xeo');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/log-flow/AiParseForm.test.tsx`
Expected: 6 FAIL with "Cannot find module".

- [ ] **Step 3: Copy TypeTab.tsx to AddFoodTab/AiParseForm.tsx and add optional back arrow**

The new file is **identical** to `app/(app)/log/_components/TypeTab.tsx` except:

1. Rename `TypeTab` function and default export → `AiParseForm`.
2. Rename `TypeTabProps` → `AiParseFormProps`. Add optional `onBack?: () => void`.
3. Update relative imports: `./ManualEntryFallback` → `../ManualEntryFallback`.
4. Add a header above the `<form>` that conditionally renders the back-arrow button.

Add imports at top of file:

```typescript
import { ChevronLeft } from 'lucide-react';
```

The new prop interface:

```typescript
export interface AiParseFormProps {
  /** Task 3.4 seam. */
  onParseSuccess?: (result: ParseResultT) => void;
  /** F-UI-3.6-B-1 — manual-fallback submit forwarded to LogFlowTabs. */
  onManualSubmit?: (payload: ManualSubmitPayload) => void;
  /**
   * Add Food tab merge — render a back-arrow header when AiParseForm is
   * the inline-swap subview inside <AddFoodTab>. Omit in library-only
   * mode (the form is the entire surface; there's nowhere to go back to).
   */
  onBack?: () => void;
}
```

The new return JSX wraps the existing `<form>` in a fragment with an optional header:

```tsx
return (
  <>
    {onBack ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 'var(--spacing-3)',
        }}
      >
        <button
          type="button"
          data-testid="ai-parse-form-back"
          aria-label={t.log.backToLibraryAriaLabel}
          onClick={onBack}
          className="kalori-add-food-back-button"
        >
          <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
          <span>{t.log.backToLibraryAriaLabel}</span>
        </button>
      </div>
    ) : null}
    <form
      onSubmit={onSubmit}
      aria-describedby={helperId}
      data-testid="type-tab-form"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}
    >
      {/* unchanged from TypeTab.tsx lines 142-244 — copy verbatim */}
    </form>
  </>
);
```

Update the function signature:

```typescript
export function AiParseForm({ onParseSuccess, onManualSubmit, onBack }: AiParseFormProps = {}) {
```

- [ ] **Step 4: Add CSS for the back button**

Append to `app/globals.css`:

```css
/* --- Add Food back button (AiParseForm subview header) ---------------- */

.kalori-add-food-back-button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  padding-inline: var(--spacing-3);
  padding-block: var(--spacing-2);
  background: transparent;
  border: none;
  color: var(--color-ivory);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.kalori-add-food-back-button:hover {
  color: var(--color-sand);
}

.kalori-add-food-back-button:focus-visible {
  outline: 2px solid var(--color-oxblood);
  outline-offset: 1px;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/components/log-flow/AiParseForm.test.tsx`
Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/log/_components/AddFoodTab/AiParseForm.tsx \
        tests/unit/components/log-flow/AiParseForm.test.tsx \
        app/globals.css
git commit -m "feat(log-flow): extract AiParseForm from TypeTab w/ optional back arrow

AiParseForm.tsx mirrors TypeTab.tsx with one addition: optional onBack
prop that renders a 'Back to library' header. Omitted in library-only
mode so no back arrow appears there. TypeTab.tsx still exists for
backward compat; deleted in Task 11.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: AddFoodTab wrapper with subview switching

**Files:**
- Create: `app/(app)/log/_components/AddFoodTab/AddFoodTab.tsx`
- Create: `app/(app)/log/_components/AddFoodTab/index.ts`
- Create: `tests/unit/components/log-flow/AddFoodTab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/log-flow/AddFoodTab.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AddFoodTab } from '@/app/(app)/log/_components/AddFoodTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

beforeEach(() => {
  useLogFlowStore.setState({
    activeTab: 'library',
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
    libraryItems: [
      {
        id: 'a',
        name: 'Pho bo',
        kcal: 450,
        lastUsedIso: null,
        logCount: 1,
        proteinG: 20,
        carbsG: 60,
        fatG: 10,
        fiberG: 2,
        unit: 'g',
        thumbnailUrl: null,
      },
    ],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
  });
});

describe('<AddFoodTab />', () => {
  it('renders LibraryList when activeTab === "library"', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<AddFoodTab />);
    expect(screen.getByTestId('library-list')).toBeTruthy();
    expect(screen.queryByTestId('type-tab-form')).toBeNull();
  });

  it('renders AiParseForm with back arrow when activeTab === "type"', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    render(<AddFoodTab />);
    expect(screen.getByTestId('type-tab-form')).toBeTruthy();
    expect(screen.getByTestId('ai-parse-form-back')).toBeTruthy();
    expect(screen.queryByTestId('library-list')).toBeNull();
  });

  it('clicking + icon button in library view sets activeTab to type', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(useLogFlowStore.getState().activeTab).toBe('type');
  });

  it('clicking back arrow in parse view returns activeTab to library', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');
  });

  it('empty-state CTA seeds typeDraft AND sets activeTab to type', () => {
    useLogFlowStore.setState({
      activeTab: 'library',
      librarySearch: 'banh xeo',
    });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    const state = useLogFlowStore.getState();
    expect(state.typeDraft).toBe('banh xeo');
    expect(state.activeTab).toBe('type');
  });

  it('+ icon click does NOT seed typeDraft (preserves existing draft)', () => {
    useLogFlowStore.setState({
      activeTab: 'library',
      typeDraft: 'existing user typing',
    });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(useLogFlowStore.getState().typeDraft).toBe('existing user typing');
  });

  it('forwards onParseSuccess and onManualSubmit props to AiParseForm', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    const onParseSuccess = vi.fn();
    const onManualSubmit = vi.fn();
    render(
      <AddFoodTab onParseSuccess={onParseSuccess} onManualSubmit={onManualSubmit} />,
    );
    // Verify form rendered with success/manual handlers wired — full
    // parse flow exercised in integration tests.
    expect(screen.getByTestId('type-tab-form')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/log-flow/AddFoodTab.test.tsx`
Expected: 7 FAIL with "Cannot find module".

- [ ] **Step 3: Create the wrapper component**

Create `app/(app)/log/_components/AddFoodTab/AddFoodTab.tsx`:

```typescript
'use client';

/**
 * <AddFoodTab /> — unified entry surface for adding food, replacing the
 * previous separate Type + Library tabs. Hosts two subviews via the
 * existing `activeTab` field in `useLogFlowStore`:
 *
 *   - activeTab === 'library' → <LibraryList /> (default on modal open)
 *   - activeTab === 'type'    → <AiParseForm onBack={...} />
 *
 * The two subviews share `typeDraft` and `librarySearch` from the store,
 * so navigating back-and-forth preserves both. Scroll position is NOT
 * preserved (acceptable trade-off per design spec §11 #3).
 *
 * Entry points to the parse subview:
 *   1. '+' icon button beside library search → setActiveTab('type'),
 *      typeDraft preserved.
 *   2. Empty-state CTA when search returns no matches → setActiveTab('type')
 *      AND setTypeDraft(searchTerm).
 *
 * Library-only mode (library page's Add Item button) does NOT render
 * AddFoodTab — LogFlowTabs short-circuits to <AiParseForm> directly
 * (without onBack) when mode === 'library-only'.
 */
import type { ParseResultT } from '@/lib/ai/schemas';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

import { AiParseForm } from './AiParseForm';
import { LibraryList } from './LibraryList';
import type { ManualSubmitPayload } from '../ManualEntryFallback';

export interface AddFoodTabProps {
  onParseSuccess?: (result: ParseResultT) => void;
  onManualSubmit?: (payload: ManualSubmitPayload) => void;
}

export function AddFoodTab({ onParseSuccess, onManualSubmit }: AddFoodTabProps = {}) {
  const activeTab = useLogFlowStore((s) => s.activeTab);
  const setActiveTab = useLogFlowStore((s) => s.setActiveTab);
  const setTypeDraft = useLogFlowStore((s) => s.setTypeDraft);

  const goToParseView = (seed: string): void => {
    if (seed) setTypeDraft(seed);
    setActiveTab('type');
  };

  const goBackToLibrary = (): void => {
    setActiveTab('library');
  };

  if (activeTab === 'type') {
    return (
      <AiParseForm
        onParseSuccess={onParseSuccess}
        onManualSubmit={onManualSubmit}
        onBack={goBackToLibrary}
      />
    );
  }

  return <LibraryList onAddNew={goToParseView} />;
}

export default AddFoodTab;
```

Create the barrel export `app/(app)/log/_components/AddFoodTab/index.ts`:

```typescript
export { AddFoodTab, default } from './AddFoodTab';
export type { AddFoodTabProps } from './AddFoodTab';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/components/log-flow/AddFoodTab.test.tsx`
Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/log/_components/AddFoodTab/AddFoodTab.tsx \
        app/(app)/log/_components/AddFoodTab/index.ts \
        tests/unit/components/log-flow/AddFoodTab.test.tsx
git commit -m "feat(log-flow): add AddFoodTab wrapper for unified entry

Reads activeTab from useLogFlowStore: 'library' renders LibraryList,
'type' renders AiParseForm w/ back arrow. + icon preserves typeDraft;
empty-state CTA seeds typeDraft with the search term.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire AddFoodTab into LogFlowTabs.tsx

**Files:**
- Modify: `app/(app)/log/_components/LogFlowTabs.tsx`
- Create: `tests/unit/components/log-flow/LogFlowTabs.add-food.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/log-flow/LogFlowTabs.add-food.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) }),
  ),
  authPost: vi.fn(),
  SessionExpiredError: class extends Error {},
}));

beforeEach(() => {
  useLogFlowStore.setState({
    activeTab: 'library',
    phase: 'entry',
    mode: 'standard',
    libraryItems: [],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
    confirmationPayload: null,
  });
});

describe('<LogFlowTabs /> — Add Food tab merge', () => {
  it('renders exactly 2 tab triggers (Add Food + Snap)', () => {
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-tab-add-food')).toBeTruthy();
    expect(screen.getByTestId('log-flow-tab-snap')).toBeTruthy();
    expect(screen.queryByTestId('log-flow-tab-type')).toBeNull();
    expect(screen.queryByTestId('log-flow-tab-library')).toBeNull();
  });

  it('Add Food tab is active when activeTab === "library"', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<LogFlowTabs />);
    expect(
      screen.getByTestId('log-flow-tab-add-food').getAttribute('data-state'),
    ).toBe('active');
  });

  it('Add Food tab is active when activeTab === "type" (parse subview)', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    render(<LogFlowTabs />);
    expect(
      screen.getByTestId('log-flow-tab-add-food').getAttribute('data-state'),
    ).toBe('active');
  });

  it('Snap tab is active when activeTab === "snap"', () => {
    useLogFlowStore.setState({ activeTab: 'snap' });
    render(<LogFlowTabs />);
    expect(
      screen.getByTestId('log-flow-tab-snap').getAttribute('data-state'),
    ).toBe('active');
  });

  it('clicking Add Food tab sets activeTab to library (default subview)', () => {
    useLogFlowStore.setState({ activeTab: 'snap' });
    render(<LogFlowTabs />);
    fireEvent.click(screen.getByTestId('log-flow-tab-add-food'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');
  });

  it('renders AddFoodTab content under the Add Food panel', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-panel-add-food')).toBeTruthy();
  });

  it('library-only mode renders AiParseForm without back arrow (no tabs)', () => {
    useLogFlowStore.setState({ activeTab: 'type', mode: 'library-only' });
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-library-only-entry')).toBeTruthy();
    expect(screen.getByTestId('type-tab-form')).toBeTruthy();
    expect(screen.queryByTestId('ai-parse-form-back')).toBeNull();
    expect(screen.queryByTestId('log-flow-tab-add-food')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/log-flow/LogFlowTabs.add-food.test.tsx`
Expected: 7 FAIL.

- [ ] **Step 3: Modify `LogFlowTabs.tsx`**

Replace the existing imports + TAB_DEFS + render logic with the following.

**Imports — replace `LibraryTab` and `TypeTab` imports with `AddFoodTab` and `AiParseForm`:**

```typescript
import { AddFoodTab } from './AddFoodTab';
import { AiParseForm } from './AddFoodTab/AiParseForm';
import { ConfirmationScreen } from './ConfirmationScreen';
import { LogFlowErrorBanner } from './LogFlowErrorBanner';
import type { ManualSubmitPayload } from './ManualEntryFallback';
import { SnapTab } from './SnapTab';
```

(remove `LibraryTab` and `TypeTab` imports)

**TAB_DEFS — replace existing array (lines 49-53):**

```typescript
type DisplayTab = 'add-food' | 'snap';

const TAB_DEFS: Array<{ value: DisplayTab; label: string }> = [
  { value: 'add-food', label: t.log.tabAddFoodLabel },
  { value: 'snap', label: t.log.tabSnapLabel },
];

/**
 * Map the internal 3-value activeTab union onto the 2-value displayed
 * tab key. 'type' and 'library' both display as the unified 'add-food'
 * tab; AddFoodTab reads activeTab internally to choose its subview.
 */
function activeTabToDisplay(activeTab: LogTab): DisplayTab {
  return activeTab === 'snap' ? 'snap' : 'add-food';
}
```

**`handleParseSuccess` — keep `tab: 'type'` unchanged** (commitSaveSuccess + clientId reset still keyed by the 3-value union).

**Library-only branch (lines 147-157) — replace `<TypeTab>` with `<AiParseForm>` (no onBack):**

```tsx
if (mode === 'library-only') {
  return (
    <div
      data-testid="log-flow-library-only-entry"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}
    >
      {failureMode ? <LogFlowErrorBanner onRetry={() => setFailureMode(null, null)} /> : null}
      <AiParseForm onParseSuccess={handleParseSuccess} onManualSubmit={handleManualSubmit} />
    </div>
  );
}
```

**Tabs.Root block — replace lines 159-204:**

```tsx
return (
  <Tabs.Root
    value={activeTabToDisplay(activeTab)}
    onValueChange={(v) => {
      const next = v as DisplayTab;
      // Clicking the visible "Add Food" tab defaults to the library
      // subview. The user can then drill into AI parse via the + icon
      // or empty-state CTA. Snap maps 1:1.
      setActiveTab(next === 'snap' ? 'snap' : 'library');
    }}
    data-testid="log-flow-tabs"
    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}
  >
    <Tabs.List
      aria-label={t.log.modalTabsLabel}
      data-testid="log-flow-tablist"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        borderTop: '1px solid var(--color-rule)',
        borderBottom: '1px solid var(--color-rule)',
      }}
    >
      {TAB_DEFS.map((def) => (
        <Tabs.Trigger
          key={def.value}
          value={def.value}
          data-testid={`log-flow-tab-${def.value}`}
          className="kalori-log-tab-trigger"
        >
          {def.label}
          <span className="kalori-log-tab-endcap-right" aria-hidden="true" />
        </Tabs.Trigger>
      ))}
    </Tabs.List>

    {failureMode ? <LogFlowErrorBanner onRetry={() => setFailureMode(null, null)} /> : null}

    <Tabs.Content
      value="add-food"
      data-testid="log-flow-panel-add-food"
      className="kalori-log-tab-panel"
    >
      <AddFoodTab onParseSuccess={handleParseSuccess} onManualSubmit={handleManualSubmit} />
    </Tabs.Content>
    <Tabs.Content value="snap" data-testid="log-flow-panel-snap" className="kalori-log-tab-panel">
      <SnapTab onAnalyzeSuccess={handleAnalyzeSuccess} onManualSubmit={handleManualSubmit} />
    </Tabs.Content>
  </Tabs.Root>
);
```

**Note:** `handleParseSuccess` keeps `tab: 'type'` because:
- After parse success, `enterConfirmation` records `tab: 'type'` in payload.
- ConfirmationScreen calls `commitSaveSuccess('type')` on save, which clears `typeDraft` + `clientIds['type']`.
- This preserves the existing draft-cleanup contract.

`handleManualSubmit` keeps `tab: activeTab` (so manual submits during library subview record `tab: 'library'` → `commitSaveSuccess('library')` clears `librarySelection`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/components/log-flow/LogFlowTabs.add-food.test.tsx`
Expected: 7 PASS.

- [ ] **Step 5: Run the existing LogFlowTabs tests and update if any selectors broke**

Run: `pnpm vitest run tests/unit/components/log-flow/`
Expected: Existing snapshot tests for `LogFlowTabs` and tests asserting `log-flow-tab-type` / `log-flow-tab-library` will FAIL. Update each:
- Replace `data-testid="log-flow-tab-type"` queries → `log-flow-tab-add-food`
- Replace `data-testid="log-flow-tab-library"` queries → `log-flow-tab-add-food`
- Replace `data-testid="log-flow-panel-type"` / `log-flow-panel-library"` queries → `log-flow-panel-add-food`
- Refresh any inline snapshots

Run grep first to enumerate:

```bash
pnpm grep --include='*.test.{ts,tsx}' -l 'log-flow-tab-type\|log-flow-tab-library\|log-flow-panel-type\|log-flow-panel-library' tests/
```

(Note: this project uses `rg` via the Grep tool, but in CI the engineer uses `pnpm grep` only if defined. Substitute `git grep` if needed.)

Re-run: `pnpm vitest run tests/unit/components/log-flow/`
Expected: ALL PASS after updates.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/log/_components/LogFlowTabs.tsx \
        tests/unit/components/log-flow/LogFlowTabs.add-food.test.tsx \
        tests/unit/components/log-flow/  # any modified existing tests
git commit -m "feat(log-flow): swap LogFlowTabs to 2-tab Add Food + Snap layout

TAB_DEFS reduced to add-food + snap. Internal LogTab union unchanged
(activeTab stays 'type' | 'snap' | 'library' for state-keying);
displayed value computed via activeTabToDisplay. Add Food panel renders
AddFoodTab; library-only mode renders AiParseForm without onBack.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Update MealEntryContextTrigger caller

**Files:**
- Modify: `components/dashboard/MealEntryContextTrigger.tsx` (line 56)

- [ ] **Step 1: Write the failing test**

Create or append to `tests/unit/components/dashboard/MealAddButton.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { MealAddButton } from '@/components/dashboard/MealEntryContextTrigger';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

beforeEach(() => {
  useLogFlowStore.setState({ activeTab: 'snap', isOpen: false });
});

describe('<MealAddButton />', () => {
  it('opens the log modal with activeTab = library (Add Food default)', () => {
    render(<MealAddButton category="breakfast" timezone="Asia/Saigon" viewedDay="2026-05-17" />);
    fireEvent.click(screen.getByTestId('meal-add-breakfast'));
    const state = useLogFlowStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeTab).toBe('library');
    expect(state.pendingMealCategory).toBe('breakfast');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/components/dashboard/MealAddButton.test.tsx`
Expected: FAIL — `state.activeTab` is `'type'` (current behavior).

- [ ] **Step 3: Update MealEntryContextTrigger.tsx line 56**

In `components/dashboard/MealEntryContextTrigger.tsx`, change line 56:

```typescript
// BEFORE:
openModal('type', {
  mealCategory: category as MealCategoryHint,
  ...(viewedDay ? { logDate: viewedDay } : {}),
  ...(timezone ? { timezone } : {}),
})

// AFTER:
openModal('library', {
  mealCategory: category as MealCategoryHint,
  ...(viewedDay ? { logDate: viewedDay } : {}),
  ...(timezone ? { timezone } : {}),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/components/dashboard/MealAddButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full dashboard test suite to verify no regressions**

Run: `pnpm vitest run tests/unit/components/dashboard/ tests/components/dashboard/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/MealEntryContextTrigger.tsx \
        tests/unit/components/dashboard/MealAddButton.test.tsx
git commit -m "feat(dashboard): MealAddButton opens Add Food tab on library subview

Was openModal('type', ...) → now openModal('library', ...) so the
dashboard FAB lands on the library subview by default per the Add Food
merge spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Delete LibraryTab.tsx + TypeTab.tsx and audit remaining selectors

**Files:**
- Delete: `app/(app)/log/_components/LibraryTab.tsx`
- Delete: `app/(app)/log/_components/TypeTab.tsx`
- Modify: any test or storybook file still importing them

- [ ] **Step 1: Audit remaining imports**

Run:

```bash
pnpm grep -l 'from.*LibraryTab\|from.*TypeTab' --include='*.{ts,tsx}'
```

Expected: Only test files and possibly storybook entries. The chrome (`LogFlowTabs.tsx`) no longer imports either after Task 8.

For each file in the audit:
- If it's a test for `<LibraryTab>` or `<TypeTab>` (e.g., `tests/unit/components/log-flow/LibraryTab.test.tsx`) → DELETE the file. The new `LibraryList.test.tsx` and `AiParseForm.test.tsx` cover the same surface.
- If it's a test for an unrelated feature that incidentally imports the deleted component → migrate the import to `LibraryList` / `AiParseForm`.

- [ ] **Step 2: Audit remaining `data-testid` selectors**

Run:

```bash
pnpm grep -l 'log-flow-tab-type\|log-flow-tab-library\|log-flow-panel-type\|log-flow-panel-library' --include='*.{ts,tsx}'
```

For each E2E spec or test file found:
- Replace `log-flow-tab-type` → `log-flow-tab-add-food`
- Replace `log-flow-tab-library` → `log-flow-tab-add-food`
- Replace `log-flow-panel-type` → `log-flow-panel-add-food`
- Replace `log-flow-panel-library` → `log-flow-panel-add-food`
- For tests that previously clicked the "library" tab to enter library mode, check whether they still need that step — the library subview is now the default, so the click may be redundant.

Expected files (per project history):
- `tests/e2e/user-stories/US-STAB-A1.spec.ts`
- `tests/e2e/user-stories/US-STAB-A2.spec.ts`
- `tests/e2e/user-stories/US-STAB-A3-bundled.spec.ts`
- `tests/e2e/user-stories/US-STAB-A-bundled.spec.ts`
- Plus any `LogFlowTabs.test.tsx` snapshot or selector tests

- [ ] **Step 3: Delete the source files**

```bash
rm app/(app)/log/_components/LibraryTab.tsx
rm app/(app)/log/_components/TypeTab.tsx
# Plus any LibraryTab.test.tsx / TypeTab.test.tsx files identified in Step 1.
```

- [ ] **Step 4: Run TypeScript + unit suite to verify nothing broke**

Run: `pnpm typecheck && pnpm vitest run tests/unit/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A   # captures deletes + selector migrations
git commit -m "refactor(log-flow): remove LibraryTab.tsx + TypeTab.tsx

Both files replaced by AddFoodTab/LibraryList.tsx and
AddFoodTab/AiParseForm.tsx. Updates data-testid selectors in E2E specs
and any incidental imports. No other tab-key references in production
code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Integration test — full happy path through AddFoodTab

**Files:**
- Create: `tests/integration/add-food-tab-flow.test.tsx`

- [ ] **Step 1: Write the integration test**

Create the file:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const PARSED_RESULT = {
  items: [
    {
      name: 'Banh xeo',
      portion: 1,
      unit: 'plate',
      kcal: 480,
      macros: { protein_g: 15, carbs_g: 50, fat_g: 22, fiber_g: 4 },
      micros: {},
      confidence: 0.85,
    },
  ],
  reasoning: null,
};

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) }),
  ),
  authPost: vi.fn(() => Promise.resolve({ result: PARSED_RESULT })),
  SessionExpiredError: class extends Error {},
}));

beforeEach(() => {
  useLogFlowStore.setState({
    isOpen: true,
    activeTab: 'library',
    phase: 'entry',
    mode: 'standard',
    libraryItems: [
      {
        id: 'a',
        name: 'Pho bo',
        kcal: 450,
        lastUsedIso: null,
        logCount: 1,
        proteinG: 20,
        carbsG: 60,
        fatG: 10,
        fiberG: 2,
        unit: 'g',
        thumbnailUrl: null,
      },
    ],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
    confirmationPayload: null,
  });
});

describe('Add Food tab — full flow', () => {
  it('happy path: search-miss → CTA → parse pre-filled → ConfirmationScreen', async () => {
    render(<LogFlowTabs />);

    // 1. Library renders with one item.
    expect(screen.getByTestId('library-list')).toBeTruthy();
    expect(screen.getByText('Pho bo')).toBeTruthy();

    // 2. User types 'banh xeo' — no match.
    fireEvent.change(screen.getByTestId('library-search-input'), {
      target: { value: 'banh xeo' },
    });
    expect(screen.getByTestId('library-empty-state')).toHaveTextContent(
      'Nothing matches that search yet.',
    );

    // 3. User clicks the CTA — seeds typeDraft + swaps subview.
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(useLogFlowStore.getState().typeDraft).toBe('banh xeo');
    expect(useLogFlowStore.getState().activeTab).toBe('type');

    // 4. AiParseForm renders with pre-filled textarea.
    const textarea = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('banh xeo');

    // 5. User submits PARSE.
    await act(async () => {
      fireEvent.submit(screen.getByTestId('type-tab-form'));
    });

    // 6. ConfirmationScreen takes over.
    await waitFor(() => {
      expect(useLogFlowStore.getState().phase).toBe('confirmation');
    });
    expect(useLogFlowStore.getState().confirmationPayload?.tab).toBe('type');
    expect(useLogFlowStore.getState().confirmationPayload?.items[0]?.name).toBe(
      'Banh xeo',
    );
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm vitest run tests/integration/add-food-tab-flow.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/add-food-tab-flow.test.tsx
git commit -m "test(integration): Add Food full happy path

Search-miss → empty-state CTA → AI parse pre-filled with search term
→ ConfirmationScreen takeover with correct payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Integration test — back-nav state preservation

**Files:**
- Create: `tests/integration/add-food-tab-back-nav.test.tsx`

- [ ] **Step 1: Write the integration test**

Create the file:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) }),
  ),
  authPost: vi.fn(),
  SessionExpiredError: class extends Error {},
}));

beforeEach(() => {
  useLogFlowStore.setState({
    isOpen: true,
    activeTab: 'library',
    phase: 'entry',
    mode: 'standard',
    libraryItems: [
      {
        id: 'a',
        name: 'Pho bo',
        kcal: 450,
        lastUsedIso: null,
        logCount: 5,
        proteinG: 20,
        carbsG: 60,
        fatG: 10,
        fiberG: 2,
        unit: 'g',
        thumbnailUrl: null,
      },
    ],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
  });
});

describe('Add Food tab — back navigation', () => {
  it('back-arrow returns to library with search term preserved', () => {
    render(<LogFlowTabs />);

    // 1. User searches 'pho'.
    fireEvent.change(screen.getByTestId('library-search-input'), {
      target: { value: 'pho' },
    });
    expect(screen.getByText('Pho bo')).toBeTruthy();

    // 2. User clicks + icon → parse subview.
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(useLogFlowStore.getState().activeTab).toBe('type');
    // typeDraft was NOT seeded (the + button preserves existing draft / leaves empty).
    expect(useLogFlowStore.getState().typeDraft).toBe('');

    // 3. User clicks back arrow.
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');

    // 4. Library renders with search term still 'pho' and Pho bo visible.
    expect(useLogFlowStore.getState().librarySearch).toBe('pho');
    const searchInput = screen.getByTestId('library-search-input') as HTMLInputElement;
    expect(searchInput.value).toBe('pho');
    expect(screen.getByText('Pho bo')).toBeTruthy();
  });

  it('typeDraft survives the library → parse → back → parse round trip', () => {
    useLogFlowStore.setState({ typeDraft: 'half typed' });
    render(<LogFlowTabs />);

    // Click + → parse view, draft preserved.
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    const textarea = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('half typed');

    // Back to library.
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');
    expect(useLogFlowStore.getState().typeDraft).toBe('half typed');

    // Click + again → parse view, draft still preserved.
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    const textarea2 = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea2.value).toBe('half typed');
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm vitest run tests/integration/add-food-tab-back-nav.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/add-food-tab-back-nav.test.tsx
git commit -m "test(integration): Add Food back-nav state preservation

Search term + typeDraft both survive library → parse → back round trips.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: E2E user story US-ADDFOOD-1

**Files:**
- Create: `tests/e2e/user-stories/US-ADDFOOD-1.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create the file (follow the project's existing user-story spec structure — model after `tests/e2e/user-stories/US-STAB-A-bundled.spec.ts`):

```typescript
import { expect, test } from '@playwright/test';
import { signInAsTestUser } from '../helpers/auth';
import { navigateToDashboard } from '../helpers/nav';

const STORY = 'US-ADDFOOD-1';

test.describe(`${STORY} — Add Food tab merge`, () => {
  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
    await navigateToDashboard(page);
  });

  test('AC1: dashboard FAB opens log-flow modal with Add Food tab active by default', async ({
    page,
  }) => {
    await page.getByTestId('meal-add-breakfast').click();
    const addFoodTab = page.getByTestId('log-flow-tab-add-food');
    await expect(addFoodTab).toBeVisible();
    await expect(addFoodTab).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('log-flow-panel-add-food')).toBeVisible();
  });

  test('AC2: library skeleton renders for at least one frame before items appear', async ({
    page,
  }) => {
    await page.getByTestId('meal-add-breakfast').click();
    // The skeleton may render briefly; the assertion is that EITHER the
    // skeleton OR the populated list is visible.
    await expect(
      page.getByTestId('library-skeleton').or(page.getByTestId('library-list')),
    ).toBeVisible();
    // Eventually items load (or empty state shows).
    await expect(
      page.getByTestId('library-list').or(page.getByTestId('library-empty-state')),
    ).toBeVisible({ timeout: 5000 });
  });

  test('AC3: search-miss → empty-state CTA → parse pre-filled', async ({ page }) => {
    await page.getByTestId('meal-add-breakfast').click();
    // Wait for list to settle.
    await page.getByTestId('library-search-input').waitFor();
    // Type a query that's almost certainly not in the test user's library.
    await page.getByTestId('library-search-input').fill('zzzimaginaryfood');
    // CTA appears.
    const cta = page.getByTestId('library-add-new-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(/Add "zzzimaginaryfood" as new item/);
    // Click CTA → parse view with pre-filled textarea.
    await cta.click();
    const textarea = page.getByTestId('type-tab-textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('zzzimaginaryfood');
  });

  test('AC4: back arrow from parse → library preserves search term', async ({ page }) => {
    await page.getByTestId('meal-add-breakfast').click();
    await page.getByTestId('library-search-input').waitFor();
    await page.getByTestId('library-search-input').fill('pho');
    // Click + icon to go into parse view.
    await page.getByTestId('library-add-new-icon-button').click();
    await expect(page.getByTestId('type-tab-form')).toBeVisible();
    // Click back arrow.
    await page.getByTestId('ai-parse-form-back').click();
    // Search input still has 'pho'.
    await expect(page.getByTestId('library-search-input')).toHaveValue('pho');
  });

  test('AC5: Snap tab remains accessible and unchanged in behavior', async ({ page }) => {
    await page.getByTestId('meal-add-breakfast').click();
    await page.getByTestId('log-flow-tab-snap').click();
    await expect(page.getByTestId('log-flow-tab-snap')).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('log-flow-panel-snap')).toBeVisible();
    // The Snap tab's internal content (capture/upload UI) is unchanged — just
    // verify the panel is rendered. Full Snap behavior is covered by
    // pre-existing US-* specs.
  });
});
```

Note: the project's E2E helper paths (`../helpers/auth`, `../helpers/nav`) reflect the existing pattern — verify the actual helper module names by reading one existing user-story spec before submitting. If helpers don't exist under those names, the engineer adapts to whatever the codebase provides.

- [ ] **Step 2: Run the spec locally**

Run: `pnpm playwright test tests/e2e/user-stories/US-ADDFOOD-1.spec.ts`
Expected: 5 PASS.

If a test user library has zero items, AC3 may need a small seed step (insert one library item via the API helper used by other US specs); model after the existing US-STAB specs that seed test fixtures.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/user-stories/US-ADDFOOD-1.spec.ts
git commit -m "test(e2e): US-ADDFOOD-1 Add Food tab user story

5 ACs: default tab, skeleton race, search-miss CTA, back-nav state,
Snap unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Refresh visual regression baselines

**Files:**
- Modify (regenerate): visual baselines under `tests/screenshots/` that include the log-flow tab bar

- [ ] **Step 1: Identify baselines that need refresh**

Run:

```bash
pnpm grep -l 'log-flow-tab\|log-flow-tablist\|LogFlowTabs' tests/
```

Visual baselines associated with each E2E spec that captures the tab bar.

Known candidates (verify via run):
- `tests/screenshots/smoke/golden-path/01-login.png` (post-login → dashboard → log modal)
- `tests/screenshots/user-stories/US-STAB-A*/...`
- `tests/screenshots/user-stories/US-STAB-B*/...`
- Any baseline whose name suggests a Type / Library tab interaction

- [ ] **Step 2: Update baselines in CI**

The project's existing convention (per CHANGELOG entries) is to capture baselines on Linux CI to avoid platform pixel drift. Run the visual suite in CI mode:

```bash
pnpm playwright test --update-snapshots tests/e2e/
```

Review the diff of each updated PNG to confirm the change is *only* the tab bar going from 3 columns to 2. Reject any baseline diff that includes unrelated visual regression.

- [ ] **Step 3: Commit baselines separately**

```bash
git add tests/screenshots/
git commit -m "test(visual): refresh baselines for 2-tab Add Food layout

Tab bar reduced from 3 columns (Type/Snap/Library) to 2 columns
(Add Food/Snap). No other visual changes captured.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

After writing all 14 tasks, run this checklist against the design spec:

### Spec coverage

| Spec section | Plan task |
|---|---|
| §3 Journey A (re-log existing) | Existing LibraryList behavior preserved + Task 11 integration |
| §3 Journey B (direct + add) | Task 7 wrapper + Task 12 back-nav test |
| §3 Journey C (search-miss CTA) | Task 4 CTA + Task 11 integration |
| §3 Journey D (back-out) | Task 12 back-nav test |
| §4 AddFoodTab wrapper | Task 7 |
| §4 LibraryList | Task 5 |
| §4 AiParseForm | Task 6 |
| §4 LibraryLoadingSkeleton | Task 2 |
| §4 AddNewItemIconButton + AddNewItemCTA | Tasks 3, 4 |
| §5 State / store changes | Task 8 (Tabs.Root mapping); NO store changes (deviation note above) |
| §6 Migration touch points | Tasks 8, 9, 10 |
| §7 Error handling | Inherited from extracted LibraryList + AiParseForm (no changes); covered by existing tests |
| §8 Testing strategy | Tasks 2/3/4/5/6/7/8/11/12/13/14 |
| §9 Accessibility | Tasks 2 (aria-busy), 3 (aria-label), 6 (back-arrow aria-label) |
| §10 Out-of-scope | Honored — Snap, ConfirmationScreen, library-only render branch, save flows, edit-entry path all untouched |
| §11 Assumptions 1–6 | All baked in: default = library subview; CTA seeds; scroll resets (no state lift); local UI state = activeTab (effectively reusing store); + button is ghost; i18n keys retained, new ones added |

### Placeholder scan

Search for "TBD", "TODO", "implement later" — none. ✓

### Type consistency

- `LogTab` consistently typed as `'type' | 'snap' | 'library'` across all tasks (deviation from spec §5 noted). ✓
- `AddFoodTabProps` defined in Task 7, consumed in Task 8. ✓
- `LibraryListProps.onAddNew: (seed: string) => void` used identically in Tasks 5 and 7. ✓
- `AiParseFormProps.onBack?: () => void` defined in Task 6, used in Tasks 7, 8. ✓
- `AddNewItemCTAProps.onAddNew: (seed: string) => void` matches the prop name used in `LibraryList`. ✓
- `AddNewItemIconButtonProps.onAddNew: () => void` (no seed) — caller in `LibraryList` wraps with `() => onAddNew('')`. ✓

### Scope check

3–5h estimate. 14 tasks. Each task 5–20 min. Total tracks. ✓

---

## Execution handoff

When the user is ready to execute this plan, two options:

1. **Subagent-driven** (recommended) — superpowers:subagent-driven-development. Fresh sub-agent per task, two-stage review between tasks, fast iteration. Best for this plan because tasks are mostly independent (Tasks 2/3/4 are fully parallel; 5/6 parallel after 2/3/4; 7 depends on 5+6; 8 depends on 7; 9 depends on 8; 10 depends on 9; 11/12 depend on 8; 13 depends on 10; 14 depends on 13).

2. **Inline execution** — superpowers:executing-plans. Batch execution with checkpoints. Suitable if you want everything in one session.

Choose at handoff time.
