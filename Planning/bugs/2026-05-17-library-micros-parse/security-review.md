# Security Review — Bug Bundle 2026-05-17-library-micros-parse

Reviewed by: bugfix-tomi security-review sub-agent
Date: 2026-05-17 12:05 GMT+7
Round: single mandatory pre-E2E pass
Scope: cumulative diff from `starting_head_sha` (`07273a3`) through R3 server + client cluster auto-fixes
Diff size: 13 files, +1040/-234 (well within Codex safe budget; not a Codex review)

## Scope reviewed

Production code:
- `lib/library/micros-bounds.ts` (NEW — shared `MAX_MICRO_VALUE = 1e6`)
- `lib/library/create-schema.ts` (replaced local constant with shared import)
- `app/api/library/[id]/update/route.ts` (shared import; pre-existing strict body schema)
- `app/api/library/merge/route.ts` (NEW micros bound on `NutritionSchema.micros`)
- `app/api/entries/save/route.ts` (NEW micros bound on `ParsedItemSchema.micros`)
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` (DraftState
  extension, `setMicro` (clamp + per-key error-clear), `EditErrors.micros`
  reshape to `MicrosErrors` map, `canonicalizeMicrosBag`,
  `buildMicrosDraftBag`, **NEW orphan-key preservation block at lines 431-435**,
  validateDraft per-key error emission, commit focus-target plumbing)
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` (`EditMicrosCollapsible`,
  generic-micro inputs with `aria-invalid` / `aria-describedby` / inline alert)
- `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` (single new
  `onMicroChange={edit.setMicro}` prop wiring)
- `lib/i18n/en.ts` (NEW key `errMicroNumber: 'Must be a number.'`)

Tests (no security implications): 9 test files.

Not in scope (touched in earlier batches, not modified here):
- The `library_merge_atomic` RPC (migration 0008/0009/0010) — no SQL changes
- `signThumbnailUrl`, auth fences, deleting-fence, orphan-profile fence — unchanged

## Findings by category

### Input validation
**Status: PASS with one INFORMATIONAL note**

Server-side bounds are uniformly applied across all 4 mutation routes via
`MAX_MICRO_VALUE = 1e6` from `lib/library/micros-bounds.ts`:

| Surface | Schema | Bound applied |
|---|---|---|
| POST /api/library/create | `CreateLibraryNutritionSchema.micros` | `z.record(z.string(), z.number().nonnegative().finite().max(MAX_MICRO_VALUE)).optional()` |
| POST /api/library/[id]/update | `MicrosPartial` | `z.record(z.string(), z.number().finite().nonnegative().max(MAX_MICRO_VALUE))` |
| POST /api/library/merge | `NutritionSchema.micros` | `z.record(z.string(), z.number().finite().nonnegative().max(MAX_MICRO_VALUE)).optional()` |
| POST /api/entries/save | `ParsedItemSchema.micros` | `z.record(z.string(), z.number().finite().nonnegative().max(MAX_MICRO_VALUE)).optional()` |

`MicrosPartial` on update intentionally requires the field be present when
`nutrition.micros` is sent — the surrounding `NutritionFull` makes it
`.optional()`. Defense-in-depth is consistent.

No existing validation was weakened. Pre-existing strict body shapes
(`.strict()` chains) remain in place.

The `setMicro` client clamp now (R3) clamps ONLY the upper bound; negatives
and NaN propagate as raw strings into the draft and are surfaced via
`validateDraft -> errs.micros[key]`. The server then re-rejects negatives /
non-finite if they were ever shipped (defense-in-depth holds).

INFORMATIONAL — Canonical/legacy key dedup: The dedup logic in
`useFoodDetailEdit::canonicalizeMicrosBag` + `buildMicrosDraftBag` runs in
two passes — canonical keys win unconditionally over legacy aliases. The
canonicalization helper (`canonicalizeMicroKey` in `lib/dashboard/micros-rda-resolver.ts`)
uses closed-allowlist Sets / frozen maps for lookups. A crafted raw key
that doesn't match any allowlist (legacy alias, canonical code, display
name) returns `undefined` -> the key is silently dropped. There is no
bypass path for the canonical filter itself; the only way a non-canonical
key survives is through the **NEW orphan-preservation branch** (see
"Key namespace pollution" below).

### Authn/Authz
**Status: PASS — no changes**

Ownership / RLS guards on the 4 mutation routes are unchanged:
- `requireProfileOrJson401({...})` runs first.
- `rejectIfDeletingOrUnavailable(supabase, userId)` is the second fence.
- All UPDATEs / INSERTs scope by `.eq('user_id', userId)`.
- `library/[id]/update` additionally `.eq('id', id).is('deleted_at', null)`.

No new admin/elevated paths. No changes to who can mutate what.

### PII handling
**Status: PASS**

No new logs added by this batch (`git diff HEAD | grep "^+.*Sentry.capture|^+.*console|^+.*log\("` -> 0). All
new error messages are constant strings from `lib/i18n/en.ts`
(`errMicroNumber: 'Must be a number.'`) — no user-input echo, no email,
no name, no ID interpolation.

### Injection vectors
**Status: PASS**

No new SQL composed with user-controlled strings. All DB writes go through
Supabase typed query builder (`.update`, `.insert`, `.rpc`) which serialize
the JSONB payload via parameterized binding — there is NO JSONB key path
interpolation into a raw SQL string.

Specifically, the user-controlled `nutrition.micros` JSONB object is
written as a parameterized JSONB column update — keys cannot be coerced
into a SQL identifier or operator. The `library_merge_atomic` RPC (not
changed) accepts `p_fields jsonb` and similarly cannot have keys
interpreted as SQL.

No template injection (no `unsafe-eval`, no `eval`, no dynamic-code
runtime evaluation). No prompt injection — the AI parse path's
`ParsedItemSchema.micros` is the OUTPUT validator (Gemini -> server); user
input doesn't flow into a Gemini prompt through this diff.

### Secret leakage
**Status: PASS**

No env vars, tokens, keys, or `process.env.*` accessed in the diff
(verified via grep). No new error responses echo internal state beyond
the existing `{error: 'db_error'}` / `{error: 'invalid_json'}` /
`{error: 'ValidationError', issues: parsed.error.issues}` shapes that
predate this batch.

Note: existing `ValidationError` response on the update / save / merge /
create routes echoes the Zod `issues` array verbatim. This is
pre-existing behavior; the new field-level bounds DO NOT widen the
echoed surface (only constants like `MAX_MICRO_VALUE` and key names
appear in the issues, both already known to a determined client).

### XSS / CSRF
**Status: PASS**

No raw-HTML rendering primitives introduced (verified via grep across
the FoodDetail directory for the React unsafe-HTML prop name — zero
matches). All new error rendering uses JSX text children:

```tsx
<p id={errorId} role="alert" className="kalori-fd-error" ...>
  {microErr}
</p>
```

`microErr` is the i18n constant `errMicroNumber` or `errMacroNonneg`
— never user-controlled string. React auto-escapes JSX text expressions,
so even a user-supplied error string would be safe; this is double
defense.

CSRF: no new state-changing GET routes. POST routes still rely on
Supabase's session cookie + same-origin policy (unchanged).

### Race conditions / TOCTOU
**Status: PASS — no NEW TOCTOU surfaces introduced; pre-existing
TOCTOU mitigations are preserved**

The micros patch goes through `useFoodDetailEdit::buildFieldsPatch`,
which constructs a FULL post-edit `nutrition` object client-side from
`initial.nutrition` + user diff, then POSTs to
`/api/library/[id]/update`. The server does NOT separately read +
modify + write micros — it issues a single `.update({ nutrition: ... })`
which is atomic at the row level.

Concurrent patches from two devices both touching the SAME row's micros
have a "last write wins" outcome (no merge), but this is the
pre-existing semantics for every JSONB shallow replacement on this row
(macros, kcal, display_name, etc.). It is NOT a new vulnerability
introduced by this diff.

The cholesterol_mg TOCTOU preserve-merge logic (lines 205-251 in
update/route.ts) is untouched. The merge route's `library_merge_atomic`
RPC uses `pg_advisory_xact_lock(client_id)` (unchanged).

### Open redirects
**Status: N/A — no redirects in diff**

No new `NextResponse.redirect`, no `redirect()`, no `Location` header
manipulation. Verified via grep on all 4 modified route files.

### Resource exhaustion
**Status: MEDIUM finding — aggregate micros-object cap is absent**

The new `MAX_MICRO_VALUE = 1e6` bounds the value of each micro. There is
**NO upper bound on the number of keys in the micros object**, and **no
upper bound on the length of each key**.

Concrete worst case: an authenticated user POSTs
`/api/library/create` with `nutrition.micros` = `{ "k_0": 1e6, "k_1":
1e6, ... "k_N": 1e6 }` where N is unlimited. The Zod
`z.record(z.string(), z.number().finite().nonnegative().max(MAX_MICRO_VALUE))`
schema validates each entry but does NOT cap the record's cardinality.

For each library row, this gets persisted as JSONB. Postgres TOAST handles
large JSONB by out-of-line storage, but the user can effectively allocate
arbitrary storage per library item. The ~4MB practical limit per request
is constrained by Next.js / Vercel default body size — but across multiple
POSTs to `/api/library/create`, a single user could fill the DB.

THREAT MODEL CONTEXT: This is a single-user MVP, single Supabase project
with the user being the only authenticated principal. The realistic risk
of self-DoS is LOW. The risk WOULD become Critical if multi-user is
introduced post-MVP without adding this cap.

Recommended mitigation (defer to follow-up, NOT block E2E):
- Add `z.record(z.string().max(64), z.number()...).refine(o => Object.keys(o).length <= 100, '...')` to all four micros schemas (same shared bound).
- Add `MAX_MICROS_KEYS = 100` and `MAX_MICRO_KEY_LEN = 64` to `lib/library/micros-bounds.ts`.

Severity: MEDIUM (single-user MVP) / would be HIGH at multi-user.

### Key namespace pollution
**Status: MEDIUM finding — NEW orphan-key preservation block introduces a
controlled-but-non-canonical key surface; `__proto__` is dropped by Zod
but `constructor` / `toString` / etc. are accepted**

**Detail 1: Zod's behavior with prototype-pollution keys.** Verified
empirically:

```
z.record(z.string(), z.number()...).safeParse({__proto__: 5, sodium: 100})
  -> { success: true, data: { sodium: 100 } }   // __proto__ silently dropped
z.record(z.string(), z.number()...).safeParse({constructor: 5, sodium: 100})
  -> { success: true, data: { constructor: 5, sodium: 100 } }   // constructor PASSES
```

`__proto__` is safely filtered by Zod's record iteration. `constructor`
is NOT — it appears as an own property on the validated object.

**Detail 2: `canonicalizeMicroKey` leaks the prototype-chain object on
`__proto__` input.** The implementation uses unprotected bracket access:
```js
if (LEGACY_MICRO_KEY_ALIASES[rawKey] !== undefined) return LEGACY_MICRO_KEY_ALIASES[rawKey];
```
For `rawKey = '__proto__'`, `LEGACY_MICRO_KEY_ALIASES['__proto__']`
returns `Object.prototype` (not undefined). Verified:
```
canonicalize('__proto__')  -> Object.prototype object (NOT undefined)
canonicalize('constructor') -> undefined (filtered by canonical-codes Set)
```
Because the returned value is the prototype object (not a string), the
downstream `canonical === rawKey` and `canonical === undefined` checks
behave unpredictably. In the orphan-preservation block at line 431-435
of useFoodDetailEdit, the check `canonicalizeMicroKey(rawKey) === undefined`
is the gate — for `rawKey = '__proto__'` this is FALSE, so the orphan
block is skipped. Practical impact: `__proto__` is dropped by both Zod
(at API boundary) AND by the orphan filter (at client edit-merge time).
The leak exists but does not reach a sink in this batch.

**Detail 3: NEW orphan-key preservation at line 431-435.** This block
is NEW in this batch (verified via `git show HEAD:` returning 0 hits).
Pre-batch, only canonical-resolved keys round-tripped on edit; orphan
keys were silently dropped. Now:

```ts
for (const [rawKey, value] of Object.entries(initMicrosRecord)) {
  if (typeof value !== 'number' || !Number.isFinite(value)) continue;
  if (canonicalizeMicroKey(rawKey) === undefined) {
    mergedMicros[rawKey] = value;
  }
}
```

A persisted `nutrition.micros.constructor = 5` (legitimately injected
via a craft POST to /api/library/create — Zod allows it) will now survive
edit round-trips. The receiving DraftState mergedMicros object is then
serialized to JSON and posted back to the server. The object's
`mergedMicros.constructor = 5` shadows the prototype property on that
specific object only — it does NOT pollute global `Object.prototype`
and is purely DATA in JSONB.

CONCRETE THREAT: A determined authenticated user could persist keys like
`constructor`, `toString`, `hasOwnProperty` in their own library rows.
This would:
- NOT pollute global prototype (own-property assignment, not
  `Object.prototype.constructor = ...`).
- NOT enable XSS/SQLi (data flows through Zod-validated JSON -> Supabase
  parameterized JSONB).
- POTENTIALLY corrupt downstream code that relies on
  `someMicrosObject.constructor.name` or
  `Object.prototype.hasOwnProperty.call(someMicrosObject, key)` patterns —
  the latter is actually safe (it uses the prototype method directly), but
  any future code that does `someMicrosObject.hasOwnProperty(key)` (without
  `Object.prototype.hasOwnProperty.call`) would call the user-supplied
  number `5` as a function and throw.

Codebase grep: `useFoodDetailEdit.ts:317` already uses the safe pattern
`Object.prototype.hasOwnProperty.call(...)`. No other usage in the
modified files calls `.hasOwnProperty(...)` directly on a micros object.
But this batch adds a NEW attack surface for FUTURE code to trip on.

THREAT MODEL CONTEXT: Single-user MVP — only the account owner can
attack themselves. Low practical impact. Would become Medium/High
risk at multi-user (a malicious shared library item could trip helper
code consumed across users).

Recommended mitigations (defer to follow-up, NOT block E2E):
1. Wrap `canonicalizeMicroKey` to reject prototype-chain hits:
   `if (!Object.prototype.hasOwnProperty.call(LEGACY_MICRO_KEY_ALIASES, rawKey)) return undefined;` (and similarly for the display map).
2. Reject reserved keys (`__proto__`, `constructor`, `prototype`) at the
   Zod schema level via `.refine()` across all four micros schemas.
3. Reject keys not in the canonical allowlist OR a small explicit
   legacy allowlist — drop the unconditional orphan-preservation branch.
   This is the cleanest fix but may surprise legacy items with off-spec
   keys.

Severity: MEDIUM (single-user MVP). Net-new surface introduced by this batch.

## Severity summary

- Critical: 0
- High: 0
- Medium: 2 (resource exhaustion — aggregate micros caps; key namespace
  pollution via orphan-preservation + canonicalizeMicroKey leak)
- Informational: 1 (canonical/legacy key dedup uses closed-allowlist Sets;
  no bypass to canonical filter itself — note retained for awareness)

## Recommended actions

### Block E2E? — NO
Single-user MVP threat model with current authenticated-only attack
surface means both Medium findings are tolerable for ship. No Critical
or High severity issues present.

### Recommended follow-up issues (do NOT block this batch's commit/push):

1. `[MEDIUM] [DEFER] FOLLOWUP-MICROS-CARDINALITY-CAP`
   Add `MAX_MICROS_KEYS = 100` + `MAX_MICRO_KEY_LEN = 64` to
   `lib/library/micros-bounds.ts`; refine all four schemas via
   `.refine(o => Object.keys(o).length <= MAX_MICROS_KEYS, ...)` + key
   string length. Single-user MVP can tolerate the gap; the constraint
   must land before multi-user is introduced.

2. `[MEDIUM] [DEFER] FOLLOWUP-MICROS-RESERVED-KEY-FILTER`
   (a) Make `canonicalizeMicroKey` use `Object.prototype.hasOwnProperty.call`
   for its map lookups (fix the `__proto__` prototype-chain leak), AND
   (b) reject reserved keys (`__proto__`, `constructor`, `prototype`) at
   the Zod boundary across all four micros schemas, OR (c) drop the
   unconditional orphan-preservation branch at useFoodDetailEdit.ts:431-435
   in favor of a small explicit legacy allowlist. Single-user MVP can
   tolerate; must land before multi-user.

3. `[INFORMATIONAL]` Document the orphan-preservation contract in
   `lib/library/micros-bounds.ts` JSDoc — call out the security
   trade-off so future maintainers know NOT to add `.hasOwnProperty(...)`
   on micros objects without `Object.prototype.hasOwnProperty.call`.

### Concurrent-session check
Working tree contains exactly the files documented in `state.md` as
batch-scoped — no unexpected files modified. Verified `git status
--untracked-files=all` and compared against the `files_touched_*` lists
in state.md. No sibling-session interference detected.

### Source code modifications by this review
NONE. Per the contract, source code is not modified absent a Critical/High
finding. Both Medium findings are documented in this review for the
follow-up list.

## Recommendation: Advance to Phase 7 E2E
