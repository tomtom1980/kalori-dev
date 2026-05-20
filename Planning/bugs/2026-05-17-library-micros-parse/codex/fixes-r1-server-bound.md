# Codex R1 Auto-fix — Server bound (C3)

## Finding addressed
C3 (Critical): `MAX_MICRO_VALUE` clamp lives only in the client; the server
zod schema for `POST /api/library/[id]/update` accepts any finite
nonnegative micro value, so a direct authenticated `fetch` bypasses the
claimed 1e6 data-integrity bound. Same vulnerability checked on
`POST /api/library/create` and fixed there as well.

## False-positive check
No — valid finding. Reproduced by inspection: pre-fix `MicrosPartial =
z.record(z.string(), z.number().finite().nonnegative())` and
`CreateLibraryNutritionSchema.micros = z.record(string, nonneg().finite())`
both lacked the `.max(MAX_MICRO_VALUE)` cap. An authenticated user crafting
a raw POST could persist `iron_mg: 1e9` etc. into the JSONB column. Tests
prove a 1.5e6 payload was accepted pre-fix at the create-schema layer (the
existing test fixture in `create-schema.test.ts` would not catch this) and
the update-route Zod schema had no bound at all.

## Files modified
- `app/api/library/[id]/update/route.ts` — added `MAX_MICRO_VALUE = 1_000_000`
  with cross-reference comment to client constant; wrapped `MicrosPartial`
  record value type with `.max(MAX_MICRO_VALUE)`.
- `lib/library/create-schema.ts` — same constant + comment; tightened the
  micros record value type in `CreateLibraryNutritionSchema`. This file is
  imported by `app/api/library/create/route.ts` (single source of truth for
  both server validation AND the client `AddLibraryItemDialog` form, so the
  client form inherits the bound as a free benefit — no client file edits
  required, no scope creep into the parallel sub-agent's surface).
- `tests/integration/library-item-update-round1.test.ts` — appended 3 C3
  cases: (1) 400 on iron_mg=1.5e6, (2) 400 on multi-key overflow
  (iron_mg=9.999e9 + sodium_mg=2e6), (3) 200 boundary check at exactly
  iron_mg=1e6 (`.max()` is inclusive). Boundary test mirrors the existing
  cholesterol TOCTOU mock chain (select + update).
- `tests/unit/lib/library/create-schema.test.ts` — appended 4 C3 cases on
  the shared schema: rejects 1.5e6, rejects 9.999e9, accepts 1e6 boundary,
  accepts realistic sub-cap values. Schema-level coverage protects both
  the server create route AND the client form via the shared import.

## Changes summary
Added a server-side upper bound on per-micro values that matches the
client's `MAX_MICRO_VALUE = 1_000_000` constant in
`app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`. Both the
update route and the shared create-schema now reject any micros record
value exceeding 1e6 with a 400 ValidationError (Zod). The schema rejects
**before** any DB write — `updateChain` and the insert path are never
invoked. The boundary is inclusive (`.max(1_000_000)` accepts exactly
1_000_000), matching the client `Math.min(n, MAX_MICRO_VALUE)` behavior.

### Shared-constant approach
Per the auto-fix briefing's guidance to avoid scope creep, the constant
was **duplicated** rather than extracted to a new `lib/library/constants.ts`
module. The client constant lives in `useFoodDetailEdit.ts` and is owned
by the parallel sub-agent's fix scope; the two server-side definitions
each carry an explicit comment:

```
// MUST match client-side `MAX_MICRO_VALUE` in
// `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`. […]
// TODO: extract to a shared constant module if a third surface adopts
// the same bound (defer until then to avoid scope creep — see bugfix
// 2026-05-17-library-micros-parse C3 fix rationale).
```

Three surfaces now share the value (client clamp + 2 server schemas). If
a fourth surface adopts it, the extract-to-`constants.ts` refactor pays
for itself; until then, duplication with cross-references is the lower-
risk option per the briefing.

## Same-vulnerability check on create route
**Addressed.** `app/api/library/create/route.ts` uses
`CreateLibraryBodySchema` from `lib/library/create-schema.ts` — the
shared schema. Tightening `CreateLibraryNutritionSchema.micros` there
fixes both the create-route server path AND the client form inline
validation in one edit, with zero changes to the route file itself.
Verified by re-running `tests/integration/library-create.test.ts`,
`tests/integration/library-create-cholesterol.test.ts`, and
`tests/unit/api/library-create.test.ts` post-fix (all green, no
regressions).

## Test results
- New RED→GREEN tests: 7 added (3 update-route, 4 create-schema), 7/7
  GREEN post-fix.
- `tests/integration/library-item-update-round1.test.ts`: 8/8 GREEN
  (5 pre-existing + 3 new C3).
- `tests/unit/lib/library/create-schema.test.ts`: 16/16 GREEN
  (12 pre-existing + 4 new C3).
- Full route suite spanned: `library-item-update.test.ts`,
  `library-update-cholesterol.test.ts`,
  `library-update-cholesterol-toctou.test.ts`,
  `library-update-refresh.test.ts`, `library-create.test.ts`,
  `library-create-cholesterol.test.ts`, `library-create.test.ts` (unit
  layer): **33/33 GREEN**, zero regressions from the server bound.

> **Note on a pre-existing failure**: `tests/unit/library/food-detail-edit-validation.test.ts`
> (1 test) fails on the parallel sub-agent's client-side surface
> (`useFoodDetailEdit.ts` — out of this sub-agent's scope). The failure
> is unrelated to the server bound and predates it. Not introduced by
> the C3 fix.

## Typecheck / lint
- `npx tsc --noEmit` — exit 0, clean.
- `npx eslint <touched files>` — exit 0, clean.
