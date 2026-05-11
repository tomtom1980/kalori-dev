# Task A.2 (US-STAB-A2) — Acceptance Evidence

## Step 2: `dev user` literal — call-site documentation

**Discovery (briefing §Implementation Steps step 2):** the `dev user` literal does NOT live in `components/nav/sidebar.tsx` directly. It is sourced from `lib/i18n/en.ts` via three i18n stub keys.

### Pre-A.2 call sites

| File | Line | Stub key | Rendered value |
|---|---|---|---|
| `lib/i18n/en.ts` | 1232 | `t.user.initialsStub` | `'DU'` |
| `lib/i18n/en.ts` | 1233 | `t.user.nameStub` | `'Dev User'` |
| `lib/i18n/en.ts` | 1234 | `t.user.handleStub` | `'dev-user@kalori.test'` |
| `components/nav/sidebar.tsx` | 174 | reads `t.user.initialsStub` | avatar monogram |
| `components/nav/sidebar.tsx` | 185 | reads `t.user.nameStub` | name span |
| `components/nav/sidebar.tsx` | 186 | reads `t.user.handleStub` | handle span |
| `components/nav/nav-shell.tsx` | 99 | reads `t.user.initialsStub` | TopAppBar `userInitials` prop |

The brownfield-engagement compensating control flagged `nav-shell.tsx:99` as the cross-consumer Codex blast-radius concern — it consumes the same stub key for the top-app-bar monogram, separate from the sidebar surface this task primarily targets.

### Post-A.2 state

All three stub keys (`initialsStub`, `nameStub`, `handleStub`) are deleted. Two replacement keys land:

| New key | Value | Consumer |
|---|---|---|
| `t.user.anonymousLabel` | `'GUEST'` | `lib/auth/get-display-identity.ts` (B0 / AC3 branch literal) |
| `t.user.accountFallback` | `'Account'` | mirror for future localization (resolver returns the literal directly) |
| `t.user.signedInAs` | `'Signed in as'` | `<IdentityRow>` aria-label fragment |
| `t.user.notSignedIn` | `'Not signed in'` | `<IdentityRow>` aria-label fragment |

### Runtime resolution chain (post-A.2)

```
app/(app)/layout.tsx (RSC, async, force-dynamic)
  ├─ await getServerSupabase()
  ├─ await supabase.auth.getUser()
  ├─ const user = data?.user ?? null
  └─ <NavShell userId={user?.id ?? null} user={user}>
        ├─ const topBarInitials = getDisplayIdentity(user).initials
        ├─ <TopAppBar userInitials={topBarInitials} />
        └─ <Sidebar pathname={...} user={user}>
              └─ <UserStrip user={user}>
                    └─ <IdentityRow user={user} />
                          └─ getDisplayIdentity(user) → DisplayIdentity
```

## Acceptance Criteria — verification

| AC | Verified by | Result |
|---|---|---|
| AC1 (real Gmail in sidebar) | `tests/e2e/web/user-stories/US-STAB-A2.spec.ts::AC1` (E2E with `authedPage` fixture) + `tests/unit/sidebar/identity-row.test.tsx::State 1` | locked at impl time; live runtime AC verification (C9) deferred to dispatch step |
| AC2 (HTML escape) | `tests/unit/sidebar/identity-row.test.tsx::State 2 (AC2 XSS)` + `tests/unit/lib/auth/get-display-identity.test.ts::AC2 escape quintet` | GREEN |
| AC3 (anonymous → GUEST) | `tests/unit/sidebar/identity-row.test.tsx::State 3` + `tests/unit/lib/auth/get-display-identity.test.ts::B0` | GREEN |
| AC4 (full_name fallback) | `tests/unit/sidebar/identity-row.test.tsx::State 4` + `tests/unit/lib/auth/get-display-identity.test.ts::B2` | GREEN |
| AC4 terminal (Account) | `tests/unit/sidebar/identity-row.test.tsx::State 5` + `tests/unit/lib/auth/get-display-identity.test.ts::B3` | GREEN |

## Files Created / Modified

**Created:**
- `lib/auth/get-display-identity.ts` — pure resolver (~140 lines)
- `components/nav/identity-row.tsx` — RSC component (~95 lines)
- `tests/unit/lib/auth/get-display-identity.test.ts` — 16 resolver branch tests
- `tests/unit/sidebar/identity-row.test.tsx` — 11 component visual-state tests
- `tests/e2e/web/user-stories/US-STAB-A2.spec.ts` — AC1 click-through E2E
- `tests/visual/sidebar-identity.spec.ts` — VR baseline (authed state)
- `tests/screenshots/user-stories/US-STAB-A2/evidence.md`
- `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/task-A.2.md` (this file)

**Modified:**
- `components/nav/sidebar.tsx` — `UserStrip` now delegates identity sub-block to `<IdentityRow user={user} />`; `Sidebar` accepts new `user?: User | null` prop.
- `components/nav/nav-shell.tsx` — accepts `user?: User | null`, derives `topBarInitials` via the same resolver, forwards `user` to `<Sidebar />`.
- `app/(app)/layout.tsx` — extracts `data?.user ?? null` and forwards to `<NavShell user={user} />` alongside the existing `userId` prop.
- `lib/i18n/en.ts` — deletes `initialsStub` / `nameStub` / `handleStub`; adds `anonymousLabel` / `accountFallback` / `signedInAs` / `notSignedIn`.
- `tests/unit/i18n-shape.test.ts` — replaces stub assertions with new-shape assertions; pins absence of the three deleted keys.
