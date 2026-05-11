# US-STAB-A1 — Save-to-library round-trip · evidence

> Task A.1 (REV 2) AC2 evidence captured by `tests/e2e/web/user-stories/US-STAB-A1.spec.ts`.
> Click-through Mandate M5: paragraph per AC describing user action → observable change → assertion.

## AC2 — New library item visible on `/library` within 1s of Link nav post-save

**User action sequence (WHEN):**

1. Logged-in user lands on `/log?tab=type` (auth fixture provides session).
2. User types the food name `kale-A1-stab` into `type-tab-textarea` (Type tab textarea).
3. User clicks `type-tab-parse-button` (the PARSE submit button on the Type tab). Gemini parse is stubbed at `/api/ai/text-parse` with a deterministic ParseResult so the test exercises the actual save flow without coupling to model availability.
4. Confirmation screen mounts (`confirmation-screen` testid becomes visible).
5. User asserts that `confirmation-save-to-library` toggle is `aria-checked="true"` (default for `source='text'`); if not, clicks it ON.
6. User clicks `confirmation-save` to submit the entry. This fires `authPost('/api/entries/save', …)` → server-side `app/api/entries/save/route.ts` `save_to_library:true` branch → `food_library_items` INSERT → `revalidateTag(TAGS.userLibrary(uid), 'max')` AND **`revalidatePath('/library', 'page')`** (the Task A.1 REV 2 fix).
7. Log-flow modal unmounts (`log-flow-modal` becomes hidden) — confirms 200 response + revalidate fired.
8. User clicks the `nav-library` `<Link>` in the primary nav. NOT a `page.goto('/library')` — the bug is router-cache (segment-cache prefetch) staleness, and only a Link click reuses the prefetched RSC payload. A `goto` would trivially pass regardless of the fix.

**Observable change (THEN):**

- URL transitions to `/library` (asserted via `expect(page).toHaveURL(/\/library/)`).
- The newly created card displaying `kale-A1-stab` appears in the library grid within 1 second of navigation completion, asserted via `expect(page.getByText('kale-A1-stab')).toBeVisible({ timeout: 1_000 })`.

**Assertion satisfied:**

- Without the `revalidatePath('/library', 'page')` fix, the Next.js Router Cache replays the prefetched RSC payload captured BEFORE the save POST committed — that payload does not contain the new row, so `getByText` fails until the prefetch TTL (~30s) expires. The 1-second timeout in the assertion is therefore the bug-discriminator: GREEN means the fix invalidated the prefetch.
- With the fix in place, `revalidatePath` invalidates the segment cache for `/library`, so the Link click triggers a fresh fetch on navigation, and the new row is visible immediately.

## Sequenced screenshots

| File                                  | When captured                                                             | What it shows                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ac2-01-confirmation-with-toggle.png` | After confirmation screen mounts AND toggle is verified ON                | Given state — confirmation-screen visible with save-to-library toggle ON, Save button reachable. |
| `ac2-02-library-after-nav.png`        | After `getByText(<food name>).toBeVisible()` resolves green on `/library` | Then state — `/library` page rendered with the new card visible in the grid.                     |

## Failure-mode mapping (M6 diagnosis-on-RED)

If this spec fails:

- **Stuck on confirmation screen** → `/api/ai/text-parse` stub mismatch, or parse-button click before textarea fill registered.
- **Stuck after Save click (modal stays visible)** → `/api/entries/save` returned non-200 (RLS, schema, fence) — check server logs; root cause in route handler.
- **`getByText(<food name>)` not visible within 1s on /library** → `revalidatePath('/library', 'page')` is NOT firing OR is firing for the wrong path/type. Inspect `app/api/entries/save/route.ts` line 24 (import) + the line directly after `revalidateTag(TAGS.userLibrary(userId), 'max')`. The smallest fix is the Task A.1 REV 2 diff; if that diff is present and the test still fails, confirm `revalidatePath` import is `next/cache` and not aliased.

## Coverage scope note (post-Codex review)

The AC2 E2E does NOT reproduce the issuelog #4 router-cache bug under this codebase's current architecture (`cacheComponents: false` + `force-dynamic` on `/library`). It is therefore **defensive smoke coverage**, not a RED-discriminator: it verifies the user-flow integration works end-to-end and serves as forward-compat regression for a future `cacheComponents: true` migration.

The actual production reproducer is tracked as **F-A1-PROD-RUNTIME-TRACE** (Critical follow-up). Once a verified production trace lands, this evidence file should be amended with that trace's outcome.
