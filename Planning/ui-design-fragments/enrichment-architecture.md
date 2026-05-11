# Pass 2 · Architecture Persona Enrichment

> Lens: `vercel-composition-patterns` skill — `architecture-avoid-boolean-props`, `architecture-compound-components`, `state-context-interface`, `state-decouple-implementation`, `state-lift-state`, `patterns-explicit-variants`, `patterns-children-over-render-props`, `react19-no-forwardref`.
> Scope: the 6 Pass-1 fragments for Kalori (`agent-1` … `agent-6`) read through a composition-API and component-boundary lens. Every finding traces to a skill rule.
> Canonical tree: `components/{ui, ledger, nav, charts, dashboard, library, ...}` per `Planning/architecture.md`.

---

## 1. Component API Audit per Fragment

Every explicit TypeScript interface, scored against boolean-prop proliferation, variant explosion, and prop-name duplication.

### 1.1 Agent 1 — Foundations
No component props (tokens + module exports). `lib/tokens.ts` is pure data with `as const`. Clean — no changes.

### 1.2 Agent 2 — Navigation
No explicit `interface Props` blocks; inferred only. Relies correctly on URL-derived active state (good; `state-lift-state`) and one Zustand store for rail-pinned.

**Flagged:** "Log" affordance exists in 3 variants (sidebar item, rail item, FAB) → **compound candidate** (§2). Prop-name collisions seeded: `onClose` / `onDismiss`, `activeTab`, `aria-expanded`.

### 1.3 Agent 3 — Dashboard
Seven explicit interfaces.

| Interface | Bools | Variants | States | Score |
|---|---|---|---|---|
| `DashboardMastheadProps` | 0 | `variant: 3` | — | OK |
| `ChronometerRingProps` | 0 | `status: 5` | `state: 4` | **20-way render tree** |
| `MacroBarsProps` | 1 (`showUnderFlag`) | 4 × 3 macros | 3 | duplicates Agent 5 |
| `MealsBulletinProps` | 0 | 4 | 4 | **4 callbacks = render-prop smell** |
| `WaterTrackerProps` | 2 | 4 | 4 | OK |
| `MicronutrientPanelProps` | 0 | 2 | 4 | OK |
| `WeeklyInsightCardProps` | 0 | `status: 5` | — | **`status`↔`state` collapse** |

**Flagged:**
1. `ChronometerRingProps` — `status` × `state` is orthogonal on paper; in reality `loading`/`error`/`empty` gate whether `consumed`/`target`/`nowIndicatorAngle` are meaningful. Fails `architecture-avoid-boolean-props` at the variant level. → discriminated union (§8.1).
2. `WeeklyInsightCardProps.status` = `fresh|stale|sparse-data|generating|error` already IS the state. Collapse.
3. `MealsBulletinProps` has 4 callbacks (`onEntryClick`, `onEntryContextMenu`, `onAddToMeal`, `onCopyYesterday`). Per `patterns-children-over-render-props`, lift to context (§3.2).

### 1.4 Agent 4 — Log Flow
Six interfaces.

| Interface | Bools | Variant/enum | Score |
|---|---|---|---|
| `LogFlowState` | 1 | `activeTab: 3`, `phase: 2`, `snapDraft.status: 7` | **phase guards whole subtrees** |
| `LibraryTabState` | 0 | `sortMode: 2` | OK |
| `PortionPickerState` | 1 | `unit: 3` | OK — `errorMessage \| null` is a boolean-in-disguise |
| `ConfirmationState` | 2 | `source: 4`, `meal: 4` | **10 fields, loading/error triad** |
| `UndoToast` | 1 | discriminated `action` | already good |
| `UndoQueueState` | — | — | OK |

**Flagged:**
1. `LogFlowState.phase === 'confirmation'` gates render imperatively → compound (§2.2).
2. `snapDraft.status` has 7 enum values, each gating different UI + different data fields → discriminated union (§8.3).
3. `ConfirmationState` bundles 10 fields + `isSaving`/`errorMessage` triad → split lifecycle (§8.2).
4. `client_id` appears across 4 state shapes → extract to shared `useOptimisticCommit` (§4.1).

### 1.5 Agent 5 — Library
No explicit prop blocks; inferred.

| Component | Bools (inferred) | Score |
|---|---|---|
| `LibraryGrid` | 1 (`isSelecting`) | OK |
| `LibraryItemCard` | 5 (`isSelected`, `isHover`, `isFocused`, `isPressed`, `hasThumbnail`) | **32 combos — flagrant violation** |
| `FilterDropdown`/`SortDropdown` | 1 each | OK |
| `BulkActionBar` | 2 | OK |
| `FoodDetailSheet` | 2 (`isEditing`, `isSaving`) | loading/error triad |
| `MergeDialog` | 3 (`isOpen`, `isSaving`, `showMicros`) | `showMicros` is UI-only → compose (§2.3) |
| `LetterMark` | — | clean primitive |

**Flagged:**
1. `LibraryItemCard` — 5 booleans = 32 render paths. Hover/focus/press are CSS pseudo-classes (not React state); `isSelected` + `hasThumbnail` compose away (§7.1).
2. `MergeDialog.showMicros` — UI-only flag; replace with composed `<MergeDialog.Micros />` child.

### 1.6 Agent 6 — Progress + Onboarding + Settings + Auth
Component names declared, props inferred.

| Component | Bools | Variants | Score |
|---|---|---|---|
| Progress charts (5) | — | — | clean |
| `MicronutrientHeatmap` | `isTransposed` (mobile) | — | CSS container query, not React state |
| `WeeklyReviewIsland` | 2 | `status: 5` | **duplicates Dashboard card** |
| `OnboardingLayout` | `canSkip` | `step: 1..8` | step is sum-typed |
| `StepWelcome`..`StepTarget` (×8) | varied | — | 8 named components (§7.4) |
| `AccountDeleteFlow` | 3 | `step: 3` | 3 booleans over 3 steps → discriminated (§7.5) |
| `ExportModal` | 2 | `format: 2` | merge |
| `LoginForm` | 5 (`isSignup`, `isSubmitting`, `showPassword`, `emailError`, `passwordError`) | — | **classic prop-explosion** (§8.4) |

### 1.7 Prop-name duplication across fragments

| Concept | Names seen | Canonical |
|---|---|---|
| Close | `onClose`, `onDismiss`, `close()`, `onCancel` | **`onClose`** |
| Save | `onSave`, `save()`, `onCommit`, `onConfirm` | **`onSubmit`** |
| Loading | `isLoading`, `isSaving`, `isGenerating`, `state === 'loading'` | `status: 'loading'` union |
| Error | `errorMessage: string \| null`, `error?`, `state: 'error'` | `status: 'error', error: string` |
| Item id | `id`, `clientId`, `entryId`, `itemId` | `id` (DB-owned); `clientId` (optimistic) |
| Selected | `isSelected`, `selected`, `active` | **`selected`** |
| Active | `isActive`, `active`, `aria-current` | `active` (prop) + `aria-current` (DOM) |

---

## 2. Compound Component Opportunities

Per `architecture-compound-components`: compound APIs with shared context beat monoliths with render props. Four candidates.

### 2.1 `LogModal` compound

**Problem.** `LogFlowModal` is a monolith; `LogFlowState.phase === 'confirmation'` gates the whole Confirmation subtree via if-branch.

```tsx
// components/log/log-modal.tsx
const LogModalContext = createContext<LogModalContextValue | null>(null);
interface LogModalContextValue {
  state: LogFlowState;
  actions: { setTab; submitParse; submitVision; commitSave; close };
  meta: { modalRef; firstInputRef };
}

function LogModalRoot({ children }: { children: ReactNode }) { /* ModalShell + provider */ }
function LogModalTabs() { const { state, actions } = use(LogModalContext); /* tablist */ }
function LogModalTypePane() { /* renders only when state.activeTab==='type' && state.phase==='tab' */ }
function LogModalSnapPane() { /* 'snap' */ }
function LogModalLibraryPane() { /* 'library' */ }
function LogModalConfirmation({ children }) {
  const { state } = use(LogModalContext);
  if (state.phase !== 'confirmation') return null;
  return <>{children}</>;
}

export const LogModal = {
  Root: LogModalRoot, Tabs: LogModalTabs,
  TypePane: LogModalTypePane, SnapPane: LogModalSnapPane, LibraryPane: LogModalLibraryPane,
  Confirmation: LogModalConfirmation,
};
```

**Usage.** Phase is no longer an if-tree — it's whether the consumer mounts `<LogModal.Confirmation>`. Each pane is lazy-loadable (SNAP's `browser-image-compression` only in `LogModalSnapPane`).

### 2.2 `Confirmation` compound

**Problem.** `ConfirmationState` bundles 10 fields; render has items + reasoning + meal-slot + time + save-to-library + save-action in one component. `ai_reasoning` absent for library flow; `saveToLibrary` hidden for library source; `dedupMatch` conditional. All via if-branches.

```tsx
interface ConfirmationContextValue {
  source: 'text' | 'photo' | 'library' | 'manual';
  items: ParsedItem[];
  actions: { editItem; removeItem; setMeal; setTime; toggleSaveToLibrary; commit };
}

function ConfirmationReasoning() {
  const { source } = use(ConfirmationContext);
  if (source === 'library' || source === 'manual') return null;  // source-gated, no prop
  return <WhyPanel />;
}

function ConfirmationSaveToLibrary() {
  const { source } = use(ConfirmationContext);
  if (source === 'library') return null;
  return <Toggle />;
}

export const Confirmation = {
  Root, ItemList, Reasoning, MealSlot, TimeEditor, SaveToLibraryToggle, SaveAction,
};
```

### 2.3 `MergeDialog` compound

**Problem.** Fields enumerated imperatively; `showMicros` boolean; adding a field edits the enum.

```tsx
interface MergeDialogFieldProps<T> {
  name: string;
  fieldKey: string;
  valueA: T; valueB: T;
  render: (value: T) => ReactNode;
  customInput?: ReactNode;
}

export const MergeDialog = {
  Root, Header, Field: MergeDialogField, Preview, Actions,
};
```

**Usage:**

```tsx
<MergeDialog.Root>
  <MergeDialog.Header />
  <MergeDialog.Field name="NAME" fieldKey="display_name" valueA={a.name} valueB={b.name} render={v => <span>{v}</span>} />
  <MergeDialog.Field name="KCAL" fieldKey="nutrition.kcal" valueA={a.kcal} valueB={b.kcal} render={v => <Num value={v}/>} customInput={<NumericInput/>} />
  <details>
    <summary>SHOW MICROS</summary>
    <MergeDialog.Field /* … */ />
  </details>
  <MergeDialog.Preview />
  <MergeDialog.Actions />
</MergeDialog.Root>
```

`showMicros` disappears — caller mounts rows inside `<details>` or not.

### 2.4 `FoodDetail` compound

Mobile (full-sheet) vs. desktop (side-panel) diverge only in the shell. Children are identical.

```tsx
export const FoodDetail = {
  Root,        // owns sheet shell (mobile vs desktop)
  Thumbnail,   // hero + meta chip
  Name,        // editable inline
  Macros,      // reuses <MacroBar> primitive §5.1
  History,     // recent uses
  Actions,     // LOG · EDIT · DELETE
};
```

**Summary:** 4 compound APIs proposed — `LogModal`, `Confirmation`, `MergeDialog`, `FoodDetail`.

---

## 3. Context Boundary Placement

Per `state-context-interface`: contexts expose `{ state, actions, meta }`; provider is the only place that knows how state is managed.

### 3.1 Context tree (proposed)

```
<html><body>
  <AuthProvider>
    <I18nProvider>
      <UndoQueueProvider>
        <ModalPortalProvider>
          <ShortcutsProvider>
            <ReducedMotionProvider>
              <AppShell>{children}</AppShell>
            </ReducedMotionProvider>
          </ShortcutsProvider>
        </ModalPortalProvider>
      </UndoQueueProvider>
    </I18nProvider>
  </AuthProvider>
</body></html>
```

### 3.2 Per context

| Context | Scope | State | Actions | Meta |
|---|---|---|---|---|
| `AuthContext` | Root | `{ user, session, expiresAt }` | `refresh, signOut` | — |
| `I18nContext` | Root | `{ locale, timezone }` | — | `format()` |
| `UndoQueueContext` | Root | LIFO `stack` | `pushToast, popTop, dismissAll` | `reducedMotion` |
| `ModalPortalContext` | Root | `openModals[]` | `open(id), close(id), closeAll` | `topmostId` |
| `ShortcutsContext` | Root | `sequenceState` | `register, unregister` | `disabledWhileModal` |
| `ReducedMotionContext` | Root | `{ enabled, source }` | `setOverride` | — |
| `LogModalContext` | `LogModal.Root` | `LogFlowState` | `submit*, commitSave, close` | `modalRef, firstInputRef` |
| `ConfirmationContext` | `Confirmation.Root` | `ConfirmationState` | edit/remove/commit | — |
| `MergeDialogContext` | `MergeDialog.Root` | `{ itemA, itemB, picks }` | `pick, commit, cancel` | — |
| `LibraryGridContext` | `LibraryGrid` | `{ items, query, filter, sort, selection }` | set/toggle/clear | — |
| `ProgressRangeContext` | `/progress` | `{ range }` | `setRange` (URL) | — |

### 3.3 Dark-only → **no ThemeProvider**

Per Agent 1: no mode toggle. Theme is a pure CSS `@theme {}` block. Creating a `ThemeProvider` adds React overhead for zero user-facing value, violates `architecture-avoid-boolean-props` (colorScheme prop tree), and invites future drift. Enforce via ESLint `no-restricted-imports`.

### 3.4 Zustand behind context

Agent 4 specs `useUndoQueueStore` (Zustand). Per `state-decouple-implementation`, consumer interface is the generic context; implementation wraps Zustand. If Zustand is later replaced, consumers don't change.

### 3.5 `ModalPortalContext` — replaces 4 disjoint modal managers

Agent 4 (`LogFlowModal`), Agent 5 (`MergeDialog`, `BulkDeleteModal`, `FoodDetailSheet`), Agent 6 (`AccountDeleteFlow`, `ExportModal`, `PWAInstallPrompt`, `ShortcutsOverlay`) each self-render today. One central provider owns z-stacking, focus-trap on stacked modals, and body-scroll lock.

---

## 4. Render-Prop / Headless Patterns

Per `patterns-children-over-render-props`: prefer headless primitives (behavior, no visuals) for cross-cutting concerns.

### 4.1 `useUndoable<T>` — optimistic-mutation pipeline

Every mutation across Kalori (log save, water add, weight add, library edit/delete/merge, entry delete, copy-yesterday) needs: generate `client_id`, compose snapshots, optimistic insert, fire network (F12 interceptor), push undo toast, on timeout commit, on undo reverse via tombstone/delete/patch.

```ts
interface UseUndoableArgs<TState, TResult> {
  mutate: (args: TState & { client_id: string }) => Promise<TResult>;
  optimisticInsert: (state: TState, client_id: string) => void;
  optimisticRevert: (client_id: string) => void;
  reverseServer: (client_id: string) => Promise<void>;
  toastCopy: (state: TState) => string;
  isUndoable?: boolean;
}
interface UseUndoableResult<TState> {
  commit: (state: TState) => Promise<void>;
  isInFlight: boolean;
}
export function useUndoable<TState, TResult>(a: UseUndoableArgs<TState, TResult>): UseUndoableResult<TState>;
```

10+ callsites share one tested file instead of 10 copies of 150-line orchestration.

### 4.2 `OfflineQueue` provider + hook

Masthead `OFFLINE · QUEUE N` chip (Agent 3), water-tracker pending badge (Agent 4), future indicators — all read one store. No visuals in the primitive; each consumer renders its own Ledger-styled chip.

```ts
interface OfflineQueueContextValue {
  state: { isOnline: boolean; queueSize: number; items: OutboxItem[] };
  actions: { enqueue(op: Operation): void; flush(): Promise<void> };
  meta: { lastSyncAt: Date | null };
}
```

### 4.3 `<KeyboardShortcut />` headless

Agent 2 (`/`, `n`, `g d/l/p/s`, `?`, `Esc`), Agent 4 (`Enter`, `Esc`, `ArrowLeft/Right`, `1-4`), Agent 5 (`/`, `m`, `Delete`, `Cmd+A`), Agent 6 (modal Escape) — each fragment implies its own `useEffect` listener. Focus-trap priority, sequence leaders (`g` → `d`), and modal suspension are cross-cutting.

```tsx
interface ShortcutProps {
  keys: string | string[];
  onTrigger: (e: KeyboardEvent) => void;
  scope?: 'global' | 'modal' | 'route';
  disabledWhileInputFocused?: boolean;
}
function KeyboardShortcut(p: ShortcutProps): null { /* registers via ShortcutsContext */ }
```

Usage: `<KeyboardShortcut keys="/" onTrigger={focusSearch} scope="route" />` — declarative, colocated.

### 4.4 `<FocusTrap>` headless

Agent 4 (log modal), Agent 5 (merge/delete/food-detail), Agent 6 (account delete/export/PWA) — one primitive (wraps `react-aria/useFocusScope`), used everywhere.

**Summary:** 4 headless primitives.

---

## 5. Shared Component Inventory (cross-fragment)

### 5.1 `<MacroBar>` primitive

Appears in Agent 3 (dashboard stack), Agent 5 (food detail — explicit reuse), Agent 4 (confirmation per-item strip), Agent 6 (weekly mini-charts). Risk: 4 divergent implementations.

```ts
type MacroBarData =
  | { status: 'under' | 'approaching' | 'on-target' | 'over';
      consumedG: number; targetG: number;
      macro: 'protein' | 'carbs' | 'fat' }
  | { status: 'loading' | 'error'; macro: 'protein' | 'carbs' | 'fat' };

interface MacroBarProps {
  data: MacroBarData;
  size?: 'compact' | 'default' | 'detail';
  showLabel?: boolean;
  showValue?: boolean;
}
```

Location: `components/primitives/MacroBar.tsx`.

### 5.2 `<Button>` primitive

Every fragment specs buttons ad hoc (Agent 2 FAB; Agent 3 `GENERATE`/`VIEW FULL`; Agent 4 `PARSE`/`MANUAL`/`RETRY`/`CAPTURE`; Agent 5 `MERGE`/`SELECT`/`LOG THIS NOW`; Agent 6 onboarding steps, delete modals, slider). One primitive:

```ts
interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'outline' | 'text' | 'danger' | 'oxblood-soft';
  size?: 'sm' | 'md' | 'lg' | 'fab';   // 36 / 44 / 56 / 56×56
  tone?: 'default' | 'sand' | 'dust';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  asChild?: boolean;                   // Radix-style polymorphism
}
```

Lint rule: `no-direct-button-element` outside primitives.

### 5.3 `<Input>` primitive — discriminated union

Appears in Agents 4, 5, 6 — text, email, password, number, date, textarea.

```ts
type InputProps =
  | { kind: 'text';     value: string; onChange: (v: string) => void; label: string; placeholder?: string; error?: string }
  | { kind: 'email';    value: string; onChange: (v: string) => void; label: string; error?: string; autoComplete?: string }
  | { kind: 'password'; value: string; onChange: (v: string) => void; label: string; error?: string; reveal?: boolean; onToggleReveal?: () => void }
  | { kind: 'number';   value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; unit?: string }
  | { kind: 'date';     value: string; onChange: (v: string) => void; label: string; min?: string; max?: string }
  | { kind: 'textarea'; value: string; onChange: (v: string) => void; label: string; placeholder?: string; rows?: number; autoResize?: boolean };
```

### 5.4 `<Chip>` primitive

Agent 4 (meal-slot, preset HALF/FULL/DOUBLE), Agent 5 (filter pills, sort options), Agent 6 (onboarding sex, activity, goal; range-toolbar).

```ts
interface ChipProps {
  selected?: boolean;
  onToggle?: () => void;
  label: string;
  description?: string;           // activity-level long form
  disabled?: boolean;
  variant?: 'outline' | 'inverted' | 'oxblood-left';
}
```

### 5.5 `<RuleDivider>` primitive (existing)

Already in `components/ledger/RuleDivider.tsx`. Enforce: no raw `<hr>` or `border-top: 1px` outside this primitive.

```ts
interface RuleDividerProps {
  weight?: 'default' | 'strong' | 'dotted';
  double?: boolean;                           // masthead 2×1px + 4px gap
  orientation?: 'horizontal' | 'vertical';
  color?: 'default' | 'oxblood';
  length?: 'full' | 'short';
}
```

### 5.6 `<UndoToast>` — existing

`components/ui/UndoToast.tsx`. Consumers use `UndoQueueContext.pushToast()` only; never render directly.

### 5.7 `<Kicker>` (existing)

```ts
interface KickerProps {
  sectionNumber?: number;      // prefixes "§ 03"
  children: ReactNode;
  accent?: 'default' | 'oxblood' | 'oxblood-soft';
}
```

### 5.8 `<DropCap>` (existing) — runtime singleton

Per design-doc §8: used exactly once, in Weekly Review. Add runtime `console.error` if DropCap renders twice in a page (Agent 3 weekly-insight and Agent 6 weekly-review-island could collide).

### 5.9 `<Card>` primitive (new)

`.chart-card` (Agent 3), modal cards (Agent 4), library cells (Agent 5 grid-ruled), settings sections (Agent 6) — mostly the same rectangle.

```ts
interface CardProps {
  tone?: 'bg-0' | 'bg-1' | 'bg-2';
  border?: 'none' | 'hairline' | 'strong' | 'grid-cell';
  accent?: 'none' | 'oxblood-left' | 'ember-left';
  padding?: 'tight' | 'default' | 'generous';
  as?: ElementType;            // polymorphic for article/section/aside
  children: ReactNode;
}
```

### Proposed tree

```
components/
  primitives/          ← new; lint-enforced
    Button.tsx  Input.tsx  Chip.tsx  MacroBar.tsx  Card.tsx
    FocusTrap.tsx  KeyboardShortcut.tsx   ← headless (§4.3, §4.4)
  ledger/              ← existing editorial primitives
    Kicker.tsx  RuleDivider.tsx  DropCap.tsx  PullQuote.tsx
  ui/
    UndoToast.tsx  OfflineBadge.tsx
  nav/  charts/  dashboard/  log/  library/  progress/  onboarding/  settings/  auth/
```

**Total: 9 shared primitives.**

---

## 6. React 19 + Next.js 16 Boundaries

### 6.1 RSC (no `'use client'`)
- Dashboard: `DashboardMasthead`, `ChronometerRing` (SVG from server props), `MacroBars`, `MealsBulletin` list, `MicronutrientPanel`, `WeeklyInsightCard` (PPR shell).
- Progress: chart wrappers around small client islands for Recharts interaction.
- Library: `LibraryGrid` + `.lib-item` cards (until select mode engaged).
- Settings, Auth outer layouts; all `Kicker` / `RuleDivider` / `Card` / `LetterMark` / `DropCap` / `PullQuote`.

### 6.2 `'use client'` boundaries
- `LogModal.Root` — single client boundary covering all 3 panes + Confirmation.
- Optimistic islands: `WaterTracker` quick-add, `WeightQuickAdd`, `WeeklyInsightCard.GenerateTrigger`, `MealsBulletin.EntryRowActions`.
- `ProgressRangeToolbar` — URL sync.
- Chart tooltip/hover islands per chart.
- `LibrarySelectMode` + `BulkActionsBar` + `MergeDialog` + `BulkDeleteModal` + `FoodDetailSheet`.
- `ProfileMenu`, `ShortcutsOverlay`, `MobileTabBar`, `Sidebar` active-indicator, `FAB`, onboarding steps, `LoginForm`, `AccountDeleteFlow`, `ExportModal`, `PWAInstallPrompt`.
- Headless: `KeyboardShortcut`, `FocusTrap`, `UndoToast`.

### 6.3 Never on client
- `lib/tokens.ts` — pure data (imported both sides; no React import).
- `lib/auth/refresh-interceptor.ts`, `lib/ai/*`, `lib/supabase/admin.ts` — server-only (enforced by `server-only` package + grep lint on `GEMINI_API_KEY`).

### 6.4 PPR partitioning
- **Dashboard:** one Suspense for chronometer+macros+meals+water+micros (shared cache tag); separate Suspense for `WeeklyInsightCard`. ✅
- **Progress:** each chart under its own Cache Component with `TAGS.userProgress(uid, range)`; Weekly Review Island separate Suspense. ✅
- **Log modal:** fully client. ✅ Must not be RSC.
- **Library:** grid + masthead RSC; select-mode island client. ✅

---

## 7. Variant vs. Composition Tradeoffs

### 7.1 Library Item Card → composition + CSS pseudo-classes

**Agent 5 §5.4** enumerates 5 × 2 × 2 = 20 combinations. But hover/focus/press are CSS pseudo-classes, **not React state**. React only knows `selected` + thumbnail source.

```tsx
<LibraryCard.Root active={selected} as="button">
  <LibraryCard.Thumbnail src={item.thumbnail_url} fallback={<LetterMark name={item.display_name} />}>
    <LibraryCard.MonoTag>MEAL · {date}</LibraryCard.MonoTag>
    <LibraryCard.CountBadge>logged {n}×</LibraryCard.CountBadge>
  </LibraryCard.Thumbnail>
  <LibraryCard.Name>{item.display_name}</LibraryCard.Name>
  <LibraryCard.Portion>{item.portion}</LibraryCard.Portion>
  <LibraryCard.Divider />
  <LibraryCard.Footer>
    <LibraryCard.Kcal>{item.kcal}</LibraryCard.Kcal>
    <LibraryCard.Macros>{`P ${p} · C ${c} · F ${f}`}</LibraryCard.Macros>
  </LibraryCard.Footer>
  {inSelectMode && <LibraryCard.SelectionChip />}
</LibraryCard.Root>
```

5 booleans → 1 prop + composition + CSS.

### 7.2 Chronometer Ring → discriminated union (not composition)

The ring is one SVG primitive, not a structural tree. See §8.1.

### 7.3 Meal columns

5 columns × 4 states = 20. Each column mostly identical; variance is `MealCategory` (closed enum) × `status`.

```tsx
<MealsBulletin>
  <MealColumn category="breakfast" status="filled" entries={…} />
  <MealColumn category="lunch"     status="filled" entries={…} />
  <MealColumn category="dinner"    status="pending" suggestedKcal={700} />
  <MealColumn category="snacks"    status="empty" />
  <MealColumn category="drinks"    status="filled" entries={…} />
</MealsBulletin>
```

`MealColumn` discriminates internally.

### 7.4 Onboarding → explicit step variants

```tsx
<OnboardingLayout.Root step={n}>
  <OnboardingLayout.ProgressDashes total={8} current={n} />
  <OnboardingLayout.StepContent>
    {n === 1 && <StepWelcome />}
    {n === 2 && <StepName />}
    {/* … */}
  </OnboardingLayout.StepContent>
  <OnboardingLayout.ActionRow>
    {n > 1 && <OnboardingLayout.BackButton />}
    <OnboardingLayout.NextButton />
  </OnboardingLayout.ActionRow>
</OnboardingLayout.Root>
```

8 explicit variants per `patterns-explicit-variants` beat `<OnboardingStep type="welcome|name|…" />`.

### 7.5 AccountDeleteFlow → 3 named step variants

`<DeleteFlow.StepWarning>`, `<DeleteFlow.StepEmailConfirm>`, `<DeleteFlow.StepCountdown>` — each owns its own validation. Kills the 3-boolean gate.

---

## 8. Prop Interface Upgrades

### 8.1 `ChronometerRingProps` → discriminated union

```ts
type ChronometerData =
  | { status: 'default' | 'approaching' | 'on-target' | 'over-target' | 'way-over';
      consumed: number; target: number;
      fiber: { consumed: number; target: number };
      nowAngle: number;
      entryCount: number;
      lastLoggedAt: string | null }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty'; onLogFirst: () => void };

interface ChronometerRingProps {
  data: ChronometerData;
  size?: 'sm' | 'md' | 'lg';     // 200/240/280 responsive
}
```

`onEmptyCTA` required only when `status === 'empty'` (TS-enforced); `consumed` not passable during loading/error. Render is `switch (data.status)`.

### 8.2 `ConfirmationState` → content + lifecycle

```ts
type ConfirmationLifecycle =
  | { status: 'editing' }
  | { status: 'saving' }
  | { status: 'error'; error: string };

interface ConfirmationContent {
  source: 'text' | 'photo' | 'library' | 'manual';
  client_id: string;
  items: ParsedItem[];
  ai_reasoning: string | null;
  thumbnailUrl: string | null;
  mealCategory: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  loggedAt: string;
  saveToLibrary: boolean;
  dedupMatch: FoodLibraryItem | null;
}

type ConfirmationState = ConfirmationContent & { lifecycle: ConfirmationLifecycle };
```

`isSaving` gone; retry pattern exhaustive-switchable.

### 8.3 `SnapDraft` discriminated union

```ts
type SnapDraft =
  | { status: 'idle' }
  | { status: 'capturing' }
  | { status: 'compressing'; progress: number }
  | { status: 'uploading'; progress: number; thumbnailDataUrl: string }
  | { status: 'analyzing'; thumbnailDataUrl: string; abortController: AbortController }
  | { status: 'done'; thumbnailDataUrl: string; parsed: ParsedItem[] }
  | { status: 'error'; error: string; thumbnailDataUrl: string | null };
```

Each state carries exactly what it needs. `abortController` only during `analyzing`; `progress` only during compress/upload.

### 8.4 `LoginForm` → mode + submission

```ts
type LoginFormProps =
  | { mode: 'signin'; submission: SubmissionState }
  | { mode: 'signup'; submission: SubmissionState };

type SubmissionState =
  | { status: 'idle'; emailError?: string; passwordError?: string }
  | { status: 'submitting' }
  | { status: 'error'; formError: string }
  | { status: 'success' };
```

Password reveal stays as local `useState` (UI-only).

### 8.5 Polymorphism — `asChild` over `as`

Radix-style `asChild: boolean` (delegates render to the single child) beats `as={Component}` for TypeScript simplicity:

```tsx
<Button asChild variant="primary">
  <Link href="/log">NEW LOG</Link>
</Button>
```

### 8.6 `DashboardMastheadProps` — extract EditionContext

`todayISO` + `todayLabel.*` + `volume` + `editionNumber` + `greeting` are all server-derived and shared across 4 mastheads (dashboard/library/progress/settings). Wrap:

```ts
interface EditionContextValue {
  todayISO: string;
  todayLabel: { weekday: string; dayOrdinal: string; monthYear: string };
  volume: number;
  editionNumber: number;
  greeting: 'morning' | 'afternoon' | 'evening' | 'night';
}

interface DashboardMastheadProps {
  displayName: string;
  variant:
    | { kind: 'first-visit' }
    | { kind: 'returning' }
    | { kind: 'recalc-nudge'; newTargetKcal: number; oldTargetKcal: number; deltaPct: number }
    | { kind: 'offline'; queueSize: number };
}
```

Edition data pulled from context — no duplicate prop surfaces on 4 mastheads.

---

## 9. Fragment-Specific Recommendations

### Agent 1 — Foundations
1. Ship `components/primitives/` in Task 1.1 so Agents 2–6 must import from it.
2. Tests for `lib/tokens.ts` asserting no hex literals anywhere else.
3. ESLint `no-restricted-imports` to forbid a `ThemeProvider` file.

### Agent 2 — Navigation
1. Merge `Sidebar` / `TabletRail` / `MobileTabBar` into one compound `<AppNav>` + `<AppNav.Desktop/Tablet/Mobile>` with shared context (active route + pinned state).
2. `LogFAB`, sidebar "LOG", rail "LOG" all consume `ModalPortalContext.open('log-modal')` — one path, three triggers.
3. Move rail-pinned from "Zustand + localStorage" to `useSyncExternalStore` + context — cleaner SSR hydration.

### Agent 3 — Dashboard
1. Apply §8.1, §8.2, §8.6 discriminated unions.
2. Replace `MealsBulletin` 4 callbacks with `<MealsBulletin>` / `<MealColumn>` compound + `MealsBulletinContext`.
3. Extract `<WeeklyReviewCore>` shared between Dashboard card and Progress island (§Agent 6).

### Agent 4 — Log Flow
1. Build `LogModal` compound (§2.1) + `Confirmation` compound (§2.2) — delete monolithic sketch.
2. Use `useUndoable<T>` (§4.1) across every mutation; remove the 9-step save orchestration duplicated per flow.
3. Apply `SnapDraft` discriminated union (§8.3).

### Agent 5 — Library
1. `LibraryItemCard` → compound (§7.1); 5 booleans collapse to `selected` + composition + CSS.
2. `MergeDialog` compound (§2.3) — kills `showMicros`.
3. `FoodDetailSheet` → compound (§2.4); Framer Motion stays behind client boundary scoped to sheet only.
4. Reuse `<MacroBar>` primitive (§5.1), not a new implementation.

### Agent 6 — Progress / Onboarding / Settings / Auth
1. `OnboardingLayout.*` compound + 8 named step variants (§7.4).
2. `AccountDeleteFlow` → 3 named step variants (§7.5).
3. `LoginForm` discriminated union (§8.4).
4. Progress charts share `<ChartCardShell>` primitive.
5. Merge `WeeklyReviewIsland` + `WeeklyInsightCard` via shared `<WeeklyReviewCore>` (compact vs full).

---

## 10. Synthesis Directives for Main Agent

**Top-3 API upgrades to apply during assembly:**

1. **Replace all `isLoading`/`isError`/`isEmpty` boolean clusters with discriminated unions on a `status` field.** Bind required data to each status (e.g., `error` carries `error: string`; `empty` carries `onCTA`). Fixes `ChronometerRing`, `MacroBars`, `MealsBulletin`, `Confirmation`, `SnapDraft`, `LoginForm`, `AccountDelete`, `WeeklyInsightCard` in one sweep.
2. **Build `components/primitives/` with the 9 shared primitives** (Button, Input, Chip, MacroBar, Card, RuleDivider, Kicker, DropCap singleton, FocusTrap + KeyboardShortcut headless). Enforce via ESLint (`no-direct-element`, `no-hardcoded-style`).
3. **Adopt the 4 compound APIs** (LogModal, Confirmation, MergeDialog, FoodDetail) + **4 headless primitives** (useUndoable, OfflineQueue, KeyboardShortcut, FocusTrap). Eliminates prop-drilling and render-prop smells; every "emits event" becomes a context consumer.

**Non-goals.** Do not add `ThemeProvider` (dark-only). Do not spawn a Framer Motion context (import stateless `lib/motion/defaults.ts` directly). Do not wrap Recharts in a single global provider (per-chart client island is correct).

---

## Appendix — Rule citations

- `architecture-avoid-boolean-props` — §1.3, §1.4, §1.5, §1.6, §7.1, §8.4.
- `architecture-compound-components` — §2 (all), §6.1, §7.4, §7.5.
- `state-context-interface` — §3.1, §3.2, §3.4, §3.5.
- `state-decouple-implementation` — §3.4 (Zustand behind context).
- `state-lift-state` — §1.2 (URL-derived active state), §3.
- `patterns-explicit-variants` — §7.4, §7.5.
- `patterns-children-over-render-props` — §2.1, §2.2, §4.
- `react19-no-forwardref` — primitives (§5.2–§5.5) use `asChild` over `forwardRef`; context via `use()`.

— end —
