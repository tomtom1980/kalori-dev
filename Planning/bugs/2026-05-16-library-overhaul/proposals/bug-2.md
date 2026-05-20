# Bug 2 — Library card click / detail close have no loading feedback

## Classification

`known_fix` — the loading affordance is simply absent. No hidden state bug; the Next.js routing path between `/library` and `/library/[id]` has no `loading.tsx` boundary, so the user sees no transition cue while the RSC + Supabase fetch runs.

## Root Cause

`LibraryClient.onActivate` (lines 247-252) and `FoodDetail.onClose` / `onBack` (lines 86-92) both call `router.push(...)`. With Next.js 16's App Router, transitions to RSC pages are wrapped in an implicit `startTransition`; without a `loading.tsx` segment OR a client-side `useTransition`+`isPending` cue on the originating component, there is **zero visible feedback** during the latency window (server fetch on `getLibraryItemById` + `getLibraryItemHistory`, plus IAD→SG cross-region RTT 150-200ms documented in `CLAUDE.md`). The user gets a frozen-feeling UI on both the open and close legs.

## Proposed Change

Two surgical additions — favor the Next.js-native `loading.tsx` boundary (covers BOTH open transition and any re-navigation; survives a hard reload of `/library/[id]`); reinforce with a client-side `isPending` cue on the originating card / close button to acknowledge the click within 16ms.

1. **`app/(app)/library/[id]/loading.tsx`** — new file. Renders a `FoodDetailSkeleton` shell: top-bar placeholder (56px), hero thumbnail block (320×240 desktop / 4:3 mobile), name/portion bars, macro-row bars, history bars, actions bar. Mirrors the FoodDetail compound order from `ui-design.md` §7.3.6 / §4.2.4 so the skeleton silhouette matches what lands. Uses `skeleton-pulse` class + `var(--color-bg-2)` per `ChartSkeleton` precedent. `role="status"`, `aria-busy="true"`, `aria-label="Loading food detail"`.
2. **`LibraryCard.tsx`** — wrap `onActivate` invocation in `useTransition`; while `isPending`, set `data-pending="true"` and `aria-busy="true"` on the `<button>`. Add a CSS rule for `.kalori-library-card[data-pending="true"]` that fades the card to ~0.7 opacity + injects a 1px oxblood arc spinner (existing pattern — ui-design §2.4 row 6; also seen at lines 1100, 1144, 2304). This gives the instant click-feedback while the page boundary loads the skeleton.
3. **`FoodDetail.tsx` `onBack` / `onClose`** — wrap both in `useTransition`; while pending, add `aria-busy` + spinner to the `← INDEX` and `×` controls (mirrors the same `data-pending` pattern). When close navigation triggers `loading.tsx` for `/library`, that loading boundary covers the destination — but the close-button cue covers the gap before the route resolves.
4. **(optional, defer to Open Q)** `app/(app)/library/loading.tsx` — list-route skeleton. Only needed if return-from-detail latency is also user-perceptible. Investigation suggests YES given the same cross-region RTT; cite the same skeleton pattern but tile the grid (3-col desktop / 1-col mobile, 10 cards per `LIBRARY_PAGE_SIZE`).

Skeleton structure (per `ChartSkeleton.tsx`):

```tsx
<section role="status" aria-busy="true" aria-label="Loading food detail"
  data-testid="food-detail-skeleton"
  style={{ background: 'var(--color-bg-1)', border: '1px solid var(--color-rule-strong)' }}>
  <div className="skeleton-pulse" style={{ height: 56 }} />   {/* top bar */}
  <div className="skeleton-pulse" style={{ height: 240, marginTop: 24, animationDelay: '100ms' }} />
  <div className="skeleton-pulse" style={{ height: 32, width: '60%', marginTop: 32, animationDelay: '200ms' }} />
  <div className="skeleton-pulse" style={{ height: 14, width: '30%', marginTop: 12, animationDelay: '300ms' }} />
  {/* macros + history rows with progressive animationDelay 100ms stagger */}
</section>
```

## Files Affected

| Path | Change | Reason |
|---|---|---|
| `app/(app)/library/[id]/loading.tsx` | NEW | Route-level skeleton boundary — covers open transition |
| `app/(app)/library/loading.tsx` | NEW (optional, recommended) | Close-transition skeleton |
| `app/(app)/library/_components/FoodDetailSkeleton.tsx` | NEW | Skeleton primitive (reusable; mirrors FoodDetail layout) |
| `app/(app)/library/_components/LibraryCard.tsx` | EDIT | Add `useTransition` + `data-pending` cue on click |
| `app/(app)/library/_components/LibraryClient.tsx` | EDIT | `onActivate` wraps `router.push` in `startTransition`; expose pending to card |
| `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` | EDIT | `onBack` / `onClose` use `useTransition`; add `data-pending` + `aria-busy` |
| `app/globals.css` | EDIT | `.kalori-library-card[data-pending="true"]` style + arc-spinner pseudo-element |

**Estimated file count: 5 EDIT + 2-3 NEW = 7-8 files.**

## TDD Required

YES — logic-touching (state transitions, navigation wrapping).

## Test Approach

RED-first tests:
1. **Unit** — `LibraryCard.test.tsx`: assert `data-pending="true"` + `aria-busy="true"` appear during a mocked pending transition; assert removed when transition resolves.
2. **Unit** — `FoodDetailSkeleton.test.tsx`: assert `role="status"`, `aria-busy="true"`, `aria-label="Loading food detail"`, six `skeleton-pulse` children.
3. **Integration (Playwright)** — `library-detail-loading.e2e.ts`: navigate from `/library` → click a card → assert `data-testid="food-detail-skeleton"` is visible BEFORE `[data-testid="page-library-detail"]` appears. Use `page.route('**/library/**', delay 800ms)` to force a perceptible window.
4. **Integration** — `library-detail-close-loading.e2e.ts`: from detail page → click `← INDEX` → assert `data-pending="true"` on the back button for ≥1 paint frame.
5. **A11y** — axe scan on the skeleton fixture; assert no nested-interactive violation (per lesson 2026-05-15 audit-vs-tooling complementarity). `aria-busy` MUST be on the wrapping `<section role="status">`, not on the visually-hidden text.
6. **Reduced-motion** — assert `.skeleton-pulse` animation is suppressed when `prefers-reduced-motion: reduce` via the existing `useReducedMotionApp` wrapper / `[data-reduce-motion="true"] *` selector (per lesson 2026-05-08).

## Risk

**Low-medium.** Risks:
- Layout shift if skeleton dimensions don't match the real `FoodDetail` shell (mitigated by mirroring `ui-design.md` §7.3.6 exact heights).
- Double-cue confusion if BOTH the card spinner AND skeleton show simultaneously — mitigated by ordering: card pending cue (≤200ms) yields to skeleton (route boundary). Acceptance: ≤1 paint frame of overlap is fine.
- `useTransition` import bloat in `LibraryCard` (currently uses `memo` + `useCallback` only) — negligible.

## Regression Sweep

- `tests/unit/components/library/LibraryCard.test.tsx` — existing select-mode + activate tests.
- `tests/integration/library/library-detail-route.test.ts` — existing detail-fetch + tombstone tests.
- `tests/e2e/library/library-card-navigation.spec.ts` — existing US-STAB-C6 navigation E2E.
- `tests/a11y/library-detail.axe.ts` — existing axe sweep on `/library/[id]`.
- `tests/visual/library-detail-baseline.spec.ts` — visual regression (if exists).
- Reduced-motion baseline at `tests/screenshots/reduced-motion/` — add `library-detail-skeleton.png` + `library-card-pending.png`.

## UI Touching

**YES.**

- **`Planning/ui-design.md`** §2.4 row 6 (Loading spinner — `SVG circle with stroke-dashoffset rotation`); §4.2.4 `FoodDetail` compound surface contract; §7.3.6 `FoodDetail` compound — top-bar / hero / macros / history / actions render order = skeleton silhouette spec; line 203 `--motion-shimmer: 1600ms` skeleton-pulse token; line 622 `<ChartSkeleton>` pattern; line 1015 `ink-fade` 220ms PPR transition; line 1144 spinner pattern (`24px spinner oxblood 2px 900ms rotation`); line 2304 `spinner-like oxblood 1px arc 1.2s rotate` mono-caption progression; line 1884 Suspense / skeleton pattern (heatmap precedent).
- **`web-ui-guide.md`** Quick-Pick — skeleton/loading patterns (cite the canonical entry); Suspense + Framer Motion deferred-content state-machine; React 19 `useTransition` for click-to-route feedback.
- **Framer Motion 12.x** — `layoutId` shared-element transitions (ui-design §7.3.6 calls for tapped-card thumbnail → hero shared-element transition on desktop/tablet; out-of-scope for this bug — defer to a follow-up unless the user wants it bundled). If `layoutId` is later added, the skeleton must hold space for the shared-element landing zone.

**Tokens cited:** `--color-bg-1`, `--color-bg-2`, `--color-rule-strong`, `--color-oxblood`, `--motion-shimmer`, `--spacing-6`, `--radius-card` (zero per design language), `--shadow-float`.

## Component Affected

`LibraryCard`, `LibraryClient`, `FoodDetail` (Root + Back/Close controls), NEW `FoodDetailSkeleton`, NEW `LibraryGridSkeleton` (optional). All inside `app/(app)/library/_components/`.

## Library/Token Citation

See **UI Touching** — comprehensive. Sibling precedent: `components/charts/ChartSkeleton.tsx` (full file read — uses `role="status" aria-busy="true" aria-hidden="true"`, `skeleton-pulse` class, staggered `animationDelay` 100ms/200ms, `var(--color-bg-2)` placeholders inside `var(--color-bg-1)` frame). The proposal mirrors this verbatim with FoodDetail-specific heights.

## Open Questions

1. **Aria-hidden conflict**: `ChartSkeleton` sets BOTH `aria-hidden="true"` AND `role="status"` — these conflict (a status region is not hidden). Recommend dropping `aria-hidden` on the new `FoodDetailSkeleton` so screen readers announce "Loading food detail" (better UX for AT users). Confirm before implementation.
2. **List-route skeleton (`/library/loading.tsx`)**: include in this bug's scope, or split to a follow-up? User said "close the item view doesn't have loading animation" — strong signal to include.
3. **Layout-id shared element**: ui-design §7.3.6 promises a Framer Motion `layoutId` shared-element transition on the hero thumbnail (desktop/tablet). Currently not implemented (verified — no `layoutId` references in library components). Out-of-scope for this bug, but the skeleton's hero block should hold the same 320×240 footprint so a future `layoutId` retrofit lands cleanly. Note as a follow-up, do NOT bundle.
4. **Pending cue style on card**: design-lead's "print-design" idiom suggests a hairline arc spinner rather than a CSS opacity dim. Confirm spinner-only vs spinner+dim is the desired feedback.
