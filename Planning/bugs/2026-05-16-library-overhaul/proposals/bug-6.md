# Bug 6 — No way to add a library item without logging a meal

## Classification

`actually_a_feature` — net-new endpoint + form UX + DB migration. Today, library items only exist as a side-effect of `/api/entries/save` (text/photo flows with `save_to_library === true`). There is no UI affordance on `/library`, no POST route, and the `food_library_items.created_from` CHECK constraint actively REJECTS `'manual'` rows (only `'text'|'photo'` allowed — see `supabase/migrations/0003_food_schema.sql:56` and the explicit guard at `app/api/entries/save/route.ts:501` "would 23514"). This is not a fix; it's a new pre-population flow.

## Root Cause

Architecture decision-by-omission. The save flow was designed library-as-enrichment-of-actual-eating, so the only creation surface bundles a `food_entries` write with an optional library insert. The `LibraryMasthead` is presentation-only (`LibraryMasthead.tsx` is 17 lines — kicker + serif title + double rule), the tools rail (`LibraryToolsRail`) handles search/filter/sort/select only, and there is no "Add" affordance anywhere on the page. User wants the inverse: stock the cupboard before eating from it.

## Proposed Change

Three coordinated pieces:

1. **DB migration** — new `supabase/migrations/00XX_library_manual_created_from.sql` widening the CHECK to `('text','photo','manual')`. Hand-applied to dev+prod per CLAUDE.md ops; bumps `database.types.ts`. No backfill needed (no existing 'manual' rows).
2. **New API route** — `app/api/library/create/route.ts` (POST). Mirrors the I11 client_id idempotency contract from `entries/save`: SELECT-by-`(user_id, client_id)` returns existing row + `replayed: true` on duplicate; otherwise INSERT with `created_from: 'manual'`, `user_edited_flag: true`, fresh `crypto.randomUUID()` for `client_id` if client omitted. Normalized-name dedup via the SAME helper `/library/dedup-check` uses (single source of truth lesson per lessons line 16 — server normalization). On dedup hit, return 409 + the existing item; client decides "edit it" vs "create-anyway-as-new". `revalidateTag(TAGS.userLibrary(uid))` on success. Zod schema validates: display_name (1-120 chars, post-trim), nutrition JSONB (kcal/protein_g/carbs_g/fat_g required; fiber_g/sodium_mg optional; non-negative number), default_portion (positive number, optional), default_unit (string, optional). RLS-enforced via the authed Supabase client.
3. **UI affordance** — `<AddLibraryItemButton />` at top-right of `<LibraryMasthead />` (or split into a sibling header-actions row to keep masthead pure). Opens a shadcn `Dialog` (mobile: full-screen sheet via `@media (max-width: 640px)`) hosting `<AddLibraryItemForm />`. RHF + Zod (same schema as the server route). Single-step form: Name (required) · Default serving (qty + unit, optional) · Macros row (kcal/P/C/F, all required) · Fiber/sodium optional · Submit. On 200, show success toast + close modal + `router.refresh()` so the new card appears. On 409 dedup hit, surface inline banner "Already in library — open it?" linking to `/library/[id]`. On 5xx, retry preserves `client_id` (in-form `useRef`, per lessons line 9 pattern (a)).

**Bug 5 integration:** if Gemini sketch generation is on the library item (per the batch's bug 5), the manual-create endpoint either (a) skips thumbnail generation and renders `<ThumbnailLetterMark />` until the user edits the item or (b) fires the same Gemini sketch worker bug 5 introduces with the manual-entered `display_name`. Decision deferred to Open Q below — needs bug-5 proposal to land first OR explicit user choice.

## Files Affected

| Path | Change | Reason |
|---|---|---|
| `supabase/migrations/00XX_library_manual_created_from.sql` | NEW | Widen CHECK to accept `'manual'` |
| `lib/database.types.ts` | REGEN | After migration applied |
| `app/api/library/create/route.ts` | NEW | POST endpoint (Zod + client_id idempotency + dedup) |
| `lib/library/createSchema.ts` | NEW | Zod schema shared client+server |
| `app/(app)/library/_components/AddLibraryItemButton.tsx` | NEW | Top-right action; opens dialog |
| `app/(app)/library/_components/AddLibraryItemForm.tsx` | NEW | RHF form body |
| `app/(app)/library/_components/AddLibraryItemDialog.tsx` | NEW | Dialog/Sheet shell (responsive) |
| `app/(app)/library/page.tsx` | EDIT | Render button alongside masthead |
| `app/(app)/library/_components/LibraryEmptyState.tsx` | EDIT | Empty-state CTA "Add your first item" → same dialog |
| `app/globals.css` | EDIT | Header-actions row layout + button style (reuse `kalori-library-pill`) |
| `lib/i18n/en.ts` | EDIT | New copy keys (`library.add.title`, field labels, dedup banner) |

**Estimated file count: 8 NEW + 4 EDIT = 12 files.**

## TDD Required

YES — logic-touching across API route, normalization parity, dedup, and form validation.

## Test Approach

RED-first tests:
1. **Unit (Zod)** — `createSchema.test.ts`: rejects empty name, negative macros, missing kcal, oversize name; accepts minimal valid payload.
2. **Integration (real DB)** — `library-create-route.test.ts`: POST creates row with `created_from='manual'`, `user_edited_flag=true`; duplicate POST with same `client_id` returns 200 + `replayed:true`; normalized-name collision returns 409 + existing item id; auth missing → 401; cross-user RLS isolation. **Critical lesson (line 16): include a sibling test where Supabase write returns `{error}` and asserts `revalidateTag` did NOT fire** — error-path mocking discipline.
3. **Component** — `AddLibraryItemForm.test.tsx`: submit blocked on invalid; valid submit calls fetch with expected body; on 409 surfaces dedup banner; on 5xx retries with same `client_id` (mocked `useRef` persistence).
4. **E2E (Playwright)** — `library-add-item.spec.ts`: navigate `/library` → click "Add Item" → fill form → submit → assert new card appears in grid → reload, assert it survived (real DB persistence). Includes empty-state branch.
5. **A11y** — `axe(container)` against the open dialog fixture (per lesson line 15 — real composed markup, not isolated island).
6. **Visual** — mobile-375 + desktop-1280 screenshots of open dialog.

## Risk

**Medium.**
- Migration touches a CHECK constraint on a populated table; safe because additive (widening allowed-set), no row violates new constraint.
- Dedup parity with `/library/dedup-check` MUST use the same normalization helper — drift would split "Phở Bò" between entries-flow and manual-flow.
- Bug 5 integration uncertainty (see Open Q) — if not resolved, ship without auto-thumb and let edit-flow trigger it later.
- `kalori-library-pill` reused per lesson line 8 (canonical primary CTA, AAA contrast).

## Regression Sweep

- `tests/integration/library-create-real-db-dedup.test.ts` — existing dedup tests (CONFIRM the `/dedup-check` route still owns single-source-of-truth normalization after this addition).
- `tests/rls/library-isolation.test.ts` — cross-user fence still holds for the new route.
- `tests/integration/client-id-idempotency.test.ts` — the I11 contract symmetry now covers `/api/library/create` in addition to `/api/entries/save`.
- `tests/e2e/library/_seed.ts` — extend seed to include a manual-created row for downstream tests that depend on `created_from='manual'`.
- Existing `food_library_items` Zod schemas (search for `food_library_items` imports) — may need to widen `created_from` union to `'text'|'photo'|'manual'` everywhere.

## UI Touching

**YES.**

- shadcn `Dialog` (desktop) / `Sheet` (mobile-375) — bottom sheet per ui-design §7.x mobile pattern; honor reduced-motion via `useReducedMotionApp` wrapper (lessons line 13).
- Form fields: Newsreader headings, Inter labels, JetBrains Mono for numeric inputs (`<input inputMode="decimal">`). Field group layout: 1-col mobile, 2-col tablet+.
- Primary CTA: `kalori-library-pill` (lessons line 8) — AAA contrast, no re-derivation.
- Hairline rules between field groups (`var(--color-rule-strong)`); zero-radius per Ledger spec.
- Text labels on dark surface: ivory only — oxblood-soft forbidden as text (lessons line 7).
- `min-width: 0` on dialog body flex chain (lessons line 12) to prevent horizontal overflow when long brand names render.
- Class-name concat via array-filter-join (lessons line 14) to survive prettier hook.
- Empty-state CTA reuses the existing `LibraryEmptyState` styling; "Add your first item" button opens the SAME dialog (single source of truth).

## Open Decisions Requiring User Input

1. **Bug 5 integration.** Should manual-create trigger Gemini sketch generation with the entered name (so the new card has a thumbnail immediately), or render `<ThumbnailLetterMark />` until the user edits the item later? **Default recommendation:** skip Gemini on create (cheaper, faster, no AI latency in the form-submit critical path); let edit-flow OR a background job populate the thumb later. Awaits bug-5 proposal's worker interface.
2. **Form scope — minimal vs full.** Minimal: name + macros only (kcal/P/C/F). Full: minimal + default portion (qty + unit) + fiber + sodium. **Default recommendation:** minimal (fastest path; user can edit later via FoodDetail); full set behind a `<Disclosure>` "More fields". User can override.
3. **Dedup behaviour on collision.** Server returns 409 + existing item id, client surfaces "Already exists — open it" banner. **Alternative:** auto-redirect to existing item. Default: banner (less surprising).
4. **Modal UX shape — Dialog vs Sheet vs full-page.** Mobile clearly Sheet; desktop is a judgment call. **Default recommendation:** Dialog desktop, Sheet mobile (single component with responsive shell — matches Kalori's existing modal pattern). User can override to full-page route `/library/new` if SEO/back-button-history is important (it isn't — auth-gated, single-user, PWA).
5. **Migration ordering.** Migration must apply BEFORE the route ships (otherwise INSERT 23514 from the moment the button lands). Implementation order: migration → regen types → route → form → button → empty-state CTA → tests last? **Default recommendation:** migration first, then RED-first tests against the still-unbuilt route, then route, then UI — standard TDD ordering.
6. **`saved_at` / `last_used_at` on manual rows.** Default `last_used_at: null` (never logged) so sort-by-recent puts manual rows at the bottom until they're first logged. **Confirm:** alternative is `last_used_at: created_at` to surface fresh additions at the top. Default recommendation: leave null; sort logic already handles nulls (or should — verify in `LibraryGrid` sort).

## Stop-the-World Flags

None. Independent of bugs 1-5 except for the optional bug-5 thumbnail-on-create hook (Open Q 1) — if bug 5 doesn't land before bug 6, the default-recommendation falls back to `<ThumbnailLetterMark />` and ships cleanly.

## One-liner

Add `POST /api/library/create` + masthead-adjacent "Add Item" dialog so users can pre-populate the library without logging a meal; gated by a DB migration that widens `food_library_items.created_from` CHECK to include `'manual'`.
