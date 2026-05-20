# Bug 3: Library list page should show sketches and photos

## Classification

`known_fix` — the list code path already wires `thumbnail_url` end-to-end (query → sign-on-read → `<Image>` in `LibraryCard`), but the **update mutation returns an unsigned raw storage path**, and the **per-render signing fan-out is capped at `SIGN_LIMIT = 10`**. Both combine to produce the user-observable symptom: edit an item → return to list → only the first 10 items can show an image, AND the just-edited item's row in the in-flight optimistic UI inherits a raw path (no signed URL) which `<Image>` cannot render against the configured `remotePatterns`.

The fix is mechanical: (1) sign the thumbnail on the update route's response and align its SELECT columns with `fetch.ts`; (2) raise `SIGN_LIMIT` or move signing to a per-page on-demand model; (3) confirm `LibraryCard` keeps its existing `thumbnail_url ? <Image> : <LetterMark>` branch (it does).

## Root Cause

Three contributing defects, ordered by user-visible weight:

### (1) Update route returns RAW storage path (PRIMARY for the "after edit" symptom)

`app/api/library/[id]/update/route.ts` lines 148-157:

```ts
const { data, error } = await supabase
  .from('food_library_items')
  .update(patch)
  .eq('id', id)
  ...
  .select(
    'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, log_count, last_used_at, user_edited_flag, created_from, created_at',
  )
  ...
return NextResponse.json({ item: data }, { status: 200 });
```

`thumbnail_url` here is the **storage path** (e.g. `{uid}/sketch_{client_id}.webp`), NOT a signed URL. The response is then handed to the client via `useFoodDetailEdit.commit()` → `onCommitted(result.item)` → `setCommittedItem(next)` in `FoodDetail.tsx` line 257-260. The committed item now has a broken `thumbnail_url`. On detail page it doesn't matter because the user is in edit mode and re-rendering `FoodDetailThumbnail` with the raw path — `<img src=path>` fails silently (broken-image icon or no display).

Then the user navigates back to `/library` — the RSC re-fetches via `fetchLibraryPage` (page.tsx line 43 `dynamic = 'force-dynamic'`), and **at that moment** the cached `revalidateTag(TAGS.userLibrary(userId), 'max')` issued by the update route invalidates and re-fetches fresh. The fresh fetch DOES re-sign the URL (because `fetch.ts` calls `signThumbnailUrl` per row up to SIGN_LIMIT). So in theory item position ≤ 10 should show again.

**But this fails under the SIGN_LIMIT cap** — see (2).

Also: the update route's `.select(...)` is missing `thumbnail_kind` (compare to `fetch.ts` line 108 which has it). After edit, `committedItem.thumbnail_kind` becomes `undefined`, breaking the photo/sketch discriminator downstream.

### (2) `SIGN_LIMIT = 10` cap shows letter-marks for items 11+ (PRIMARY for "not showing on the library main page")

`lib/library/fetch.ts` lines 53, 139-150:

```ts
const SIGN_LIMIT = 10;
// ...
const items = await Promise.all(
  rows.map(async (item, index) => {
    if (!item.thumbnail_url) return item;
    if (index >= SIGN_LIMIT) {
      return { ...item, thumbnail_url: null };  // ← forced letter-mark
    }
    const signed = await signThumbnailUrl(item.thumbnail_url, supabase);
    return { ...item, thumbnail_url: signed };
  }),
);
```

Order is `last_used_at DESC NULLS LAST`. If the user edited an item that wasn't recently used (e.g. older entry that pops to index 11+), its `thumbnail_url` is force-nulled out before `LibraryCard` even sees it. The card then takes the `<ThumbnailLetterMark />` branch (LibraryCard.tsx line 156).

This was a Round-3 Codex fix (`codex/fixes-r2-round3-batch.md`) accepting a documented UX regression: "pages 2+ of a large library show letter-mark thumbnails instead of full sketches. Acceptable for MVP performance." It was filed before the user explicitly asked to see images on the main list. The user request now overrides that trade-off.

Also subtle: client-side filter/sort/search operates on the full `initial[]` array. So if the user sorts alphabetically, the WHOLE alphabet of items may shift to positions 11+ and lose their thumbnails despite being "page 1" of a sorted view. The signing cap is tied to the SQL `last_used_at` ordering — NOT the user's chosen sort order.

### (3) Newly-created items via the Add dialog → thumbnail_url is still null until sketch pipeline runs

Not directly in the user's bug report, but related. `bug-5.md` confirms sketch generation is async (post-row-INSERT `waitUntil`). A freshly added item shows letter-mark briefly until the next `/library` revalidation after the sketch pipeline succeeds. This isn't the bug the user is asking about, but the user may not distinguish it from the symptom.

## Proposed Change (Diff Outline)

### File-level intent (NOT code)

- **`app/api/library/[id]/update/route.ts`:**
  - Add `thumbnail_kind` to the `.select(...)` column list (parity with `fetch.ts` and `getItem.ts`).
  - After the UPDATE returns, call `signThumbnailUrl(data.thumbnail_url, supabase)` and rewrite `data.thumbnail_url` to the signed URL before returning `{ item: data }`. Use the same helper as `getItem.ts` line 51 (single-item pattern).
  - Ensure `revalidateTag` still fires (existing line 168).

- **`lib/library/fetch.ts`:**
  - Decision required (see Open Questions): either raise `SIGN_LIMIT` to a higher value (e.g. 100) OR sign on-demand per-page via a new client-side fetcher. Recommendation: raise to 100 (covers a year of typical single-user library growth). SIGN_LIMIT is per-RSC-render; one render's `Promise.all` against 100 `createSignedUrl` calls is fine — Supabase signing is local-ish (signed by JWT, no roundtrip). The Round-3 fix had cited "scales linearly with library size" but the actual cost is JWT-sign-only, not a network call.
  - Verify the comment block describing the rationale and update to reflect the new cap.

- **`app/(app)/library/_components/LibraryCard.tsx`:**
  - NO CHANGE — the card already renders `{item.thumbnail_url ? <Image …> : <ThumbnailLetterMark />}` (lines 140-161). The thumbnail_kind `data-sketch` attribute is already wired (line 154).

- **`app/(app)/library/_components/FoodDetail/FoodDetailThumbnail.tsx`:**
  - NO CHANGE — already renders `{item.thumbnail_url ? <img …> : <ThumbnailLetterMark>}` (lines 26-33).

- **`lib/storage/sign-thumbnail.ts`:**
  - NO CHANGE — existing helper handles path + URL discrimination.

- **Aspect ratio preservation:**
  - `next/image` is given `width={240} height={180}` (4:3) at the card. CSS contract `aspect-ratio: 4/3` is enforced via `.kalori-library-card-thumb` (per ui-design.md §7.3.4 line 1527). Both photos and sketches must respect this.

- **Photo-overrides-sketch rule:**
  - This rule lives in the sketch pipeline (a photo upload sets `thumbnail_kind='photo'` and disables sketch generation per `backfill/route.ts` line 56 `.or('thumbnail_kind.is.null,thumbnail_kind.eq.sketch')`). The card itself does NOT need to enforce this — it just renders whatever `thumbnail_url` resolves to. NO change.

- **Letter-mark fallback:**
  - Continues to render only when `item.thumbnail_url == null` (truly missing) — never as a sketch/photo replacement. Preserved by existing card branch.

- **Loading state:**
  - `next/image` provides the default skeleton via blur-placeholder if configured; for now use the existing `priority={index < 8}` to prevent the first-row layout shift. Bug 2's `loading.tsx` already shows a grid silhouette during page-level transitions; OK as-is.

## Files Affected

Absolute paths:

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\library\[id]\update\route.ts` (PRIMARY)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\fetch.ts` (`SIGN_LIMIT` raise)

NO change required to:

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\LibraryCard.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailThumbnail.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\getItem.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\storage\sign-thumbnail.ts`

## TDD Required

Yes — both server contract test and component-render test.

Test cases to add:

1. **Unit (server)** `tests/unit/app/api/library/[id]/update.test.ts` (or extend existing) — given a row whose stored `thumbnail_url` is a storage path, after POST update the response `data.item.thumbnail_url` is an `https://*.supabase.co/storage/v1/object/sign/food-thumbnails/...` URL (NOT a bare path). Mocked Supabase storage signer asserts called with the correct path + TTL.

2. **Unit (server)** — response shape includes `thumbnail_kind` field (regression for the missing column).

3. **Unit (fetch)** `tests/unit/lib/library/fetch.test.ts` — given 12 active items each with a `thumbnail_url` path, all 12 are returned with signed URLs after the SIGN_LIMIT raise (verifies the new cap covers > previous limit). Old test "12 items → first 10 signed, last 2 null" should be updated/removed.

4. **Unit (fetch)** — for the chosen new cap, an item at the new boundary index returns a signed URL (boundary test).

5. **Component** `tests/component/app/library/LibraryCard.test.tsx` (or sketch-aware spec) — given an item with `thumbnail_url` truthy + `thumbnail_kind: 'sketch'`, the card renders `<Image data-sketch="true" />`; with `thumbnail_kind: 'photo'`, attribute absent; with `thumbnail_url: null`, `<ThumbnailLetterMark />` renders.

6. **Component (FoodDetail flow)** `tests/component/app/library/FoodDetail.test.tsx` — given `FoodDetail` initial item with a signed URL, after a successful `useFoodDetailEdit.commit()` returns a payload where `thumbnail_url` is the signed-URL form, `committedItem.thumbnail_url` is also a URL (i.e. the response shape from the update route is sign-on-write).

7. **E2E (deferred to Phase 7)** — create item via dialog → wait for sketch pipeline → navigate to `/library` → verify the card's thumbnail image is visible (`data-testid="library-card-thumb-{id}"` present, not `library-card-lettermark-{id}`). Edit that item, save, return to list → still showing the thumbnail.

## Test Approach

- **Unit layer:** server-route schemas (Zod-validated response) + fetch.ts paginator behavior with mocked Supabase storage signer.
- **Component layer:** Vitest + Testing Library; mock `next/image` lightly; assert presence/absence of `data-testid="library-card-lettermark-*"` vs `library-card-thumb-*`.
- **E2E layer (Phase 7):** Playwright; full create/edit/list round-trip; assert image rendering across multiple library positions including index 11+ (verifies SIGN_LIMIT raise).

## Risk Assessment

**Medium.** Three vectors:

- **Public-facing surface** — `/library` is the primary nav surface. Regression on the letter-mark fallback path (rendering broken image instead of falling back gracefully) would be user-visible.
- **Signed-URL flow security** — the 1-hour TTL contract (architecture.md §4.2) must remain; raising SIGN_LIMIT does NOT extend TTL.
- **Performance** — raising SIGN_LIMIT from 10 → 100 increases `Promise.all` fan-out per RSC render. Supabase signing is JWT-only (no upstream network call), so the cost is O(N) JWT signs ≈ <50ms on N=100. Acceptable.

Mitigating factors:

- `LibraryCard` already has the safe fallback branch — no change there means no rendering-regression risk.
- The update route fix is additive (sign before return) — existing 200-status contract preserved.

## Regression Sweep Needed

- **Existing letter-mark fallback path** — confirm card still shows `<ThumbnailLetterMark>` when `thumbnail_url IS NULL` in DB (truly missing rows). Unit + component tests cover this.
- **Detail page thumbnail flow** — already signs in `getItem.ts` (no change). Should continue working.
- **Log-modal library tab reuse** — `LibraryCard` is used elsewhere? Confirm via Grep (out of this scope but flagged: if any log-tab consumer reads the unsigned path, it'd break too). Spot-check: search for `LibraryCard` imports beyond `LibraryGrid`.
- **Sign-on-read SIGN_LIMIT pagination cap** — raising the cap may interact with `LibraryClient.tsx`'s client-side filter/sort/search/pagination assumptions. Confirm: client paginator slices `filteredItems` — does NOT care about SIGN_LIMIT alignment. Safe.
- **Sketch backfill route** — `revalidatePath('/library', 'page')` + `revalidateTag(TAGS.userLibrary(userId), 'max')` already fire; the next RSC render picks up signed thumbnails. No interaction.
- **Photo upload path** — same `food-thumbnails` bucket; same sign-on-read; no change.
- **Anonymous/cold-fetch behavior** — `requireProfileOrRedirect` gate runs before `fetchLibraryPage`; signing happens server-side with the user's RLS context. No anonymous-access regression possible.

## UI Touching

True — `LibraryCard` (no change) / `LibraryGrid` (no change) / library list page (no change). The fix is in the **data path** (`fetch.ts` + `update/route.ts`) that feeds the existing UI contract. Compliance with ui-design.md §7.3.4 is preserved because the card markup, aspect ratio, and fallback logic are untouched.

## ui-design Prescription

From `Planning/ui-design.md` §7.3.4 line 1505-1535 (LibraryCard compound — Thumbnail/SelectionChip/Meta):

> Thumbnail zone: `aspect-ratio: 4/3`, `bg-2`, 1px `rule` border, `overflow: hidden`. Photo `<img object-fit: cover>` with 0.85 opacity (hover lifts to 1.0). Alt text `{display_name}`.

> Letter-mark fallback (tiebreaker #7): **`bg-2` background + 2px `oxblood` TOP rule + `sand` letter** (Newsreader 300 48 tablet+ / 32 mobile, tabular lining, centered).

Compound API:
```tsx
<LibraryCard.Thumbnail
  src={item.thumbnail_url}
  fallback={<LetterMark name={item.display_name} />}
>
```

The compound contract IS the existing implementation pattern in `LibraryCard.tsx` lines 139-161 (slightly flattened — not a `<LibraryCard.Thumbnail>` subcomponent but the same `{src ? <Image/> : <Fallback/>}` branch). The fix preserves this contract — we are merely fixing the data layer that the card consumes.

From `web-ui-guide.md` Quick-Pick Decision Table — image rendering for Next.js: `next/image` is already in use (LibraryCard line 141). No library swap needed. The card uses `priority` for first 8 rows and `sizes` for responsive density, which is correct per the guide's image-optimization line.

Aspect ratio: `aspect-ratio: 4/3` per ui-design.md is enforced at the wrapper `.kalori-library-card-thumb`; `next/image` is given matching `width={240} height={180}`.

Loading state: `next/image` handles intrinsic image loading. Bug 2's route-level `loading.tsx` covers the grid silhouette during transitions. No new skeleton library needed.

## Open Questions

1. **What value should `SIGN_LIMIT` be set to?** Options:
   - Raise to 100 (covers ~1 year of single-user library; ~50ms per-render JWT-sign cost).
   - Raise to unbounded (sign every row regardless).
   - Move to per-page signing (requires URL-driven pagination — out of scope per Codex Round-3 verdict).

   **Recommendation:** 100. Aligns with user's expectation that "all the pictures and sketches we have to show". For a single-user MVP this is essentially unbounded.

2. **Should the update route's `.select(...)` be DRY-extracted to a shared column constant?** Currently three places list the same column set (`fetch.ts`, `getItem.ts`, `update/route.ts`) and the update route is missing `thumbnail_kind`. Extract a `LIBRARY_SELECT_COLUMNS` constant?

   **Recommendation:** Out of scope for this bugfix — flag as a followup cleanup.

3. **Does the user want the post-edit response to optimistically refresh the LIST cache, or rely on `revalidateTag` only?** Already calling `revalidateTag` on update → RSC re-fetches on next nav. Should be sufficient.

## Detail page comparison

`FoodDetailThumbnail.tsx` (lines 22-33) renders successfully because:

```tsx
{item.thumbnail_url ? (
  <img src={item.thumbnail_url} alt="" role="presentation" />
) : (
  <ThumbnailLetterMark ... />
)}
```

The detail page's `item` comes from `getLibraryItemById` in `getItem.ts` lines 50-53 which calls `signThumbnailUrl` directly:

```ts
if (row.thumbnail_url) {
  const signed = await signThumbnailUrl(row.thumbnail_url, supabase);
  return { ...row, thumbnail_url: signed };
}
```

So the detail page ALWAYS sees a signed URL (or null) — that's why it renders correctly.

**The card side is also correct** when it gets a signed URL. The defect is purely in the data plumbing: (a) the update mutation skips signing on its response payload, and (b) `fetch.ts` skips signing for indices ≥ 10.

## Signing strategy

**Server-side signing at fetch.ts** — preserved.
**Server-side signing at getItem.ts** — preserved.
**Server-side signing at update/route.ts** — ADDED (new — currently missing).

No client-side signing. No batched signed-URL endpoint. The 1-hour TTL contract from `architecture.md §4.2` is respected (helper hard-codes 3600s; no callsite overrides).

**Will the new cap exceed SIGN_LIMIT pagination cap from prior bugfix-tomi lessons?**

The Codex Round-3 fix capped at 10 explicitly to avoid scaling the per-render fan-out. The lesson was: "100-item library → 100 `createSignedUrl` calls per RSC render". After investigation, `createSignedUrl` is JWT-sign-only (no network roundtrip to Supabase — the JWT is signed locally with the project's signing key and the URL constructed client-side via the supabase-js library). So the actual cost is JWT-sign × N, not network × N. Going from 10 → 100 is acceptable; going to truly unbounded (1000+) MAY become measurable. The recommended 100 cap is a soft middle ground.

**No stop-the-world flags.** The bug is not "actually a feature" (ui-design.md does NOT mandate letter-marks for the list — quite the opposite, it specifies sketches/photos by default and letter-marks as the **fallback**). The fix is scoped to 2 files. Sign cap raise is intentional and reversible.
