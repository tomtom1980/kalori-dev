# US-STAB-A2 — Sidebar identity row · evidence

## AC1: real authed user email renders in sidebar (NOT "dev user")

**Spec:** `tests/e2e/web/user-stories/US-STAB-A2.spec.ts`

| Phase | Action                                                                        | Observable                                                                                                                                                                                                                                                                  | Assertion                                                                                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Given | `await authedPage.goto('/dashboard')`                                         | Sidebar `nav-shell-sidebar` mounts; `sidebar-identity-row` visible. `[data-testid="page-library"]` is NOT present (we are on `/dashboard`).                                                                                                                                 | `expect(identityRow).toBeVisible({ timeout: 10_000 })`                                                                                                                                                                                                                                      |
| When  | `await navLibrary.click({ force: true })` (sidebar `nav-library` Link)        | URL transitions `/dashboard` → `/library`; the library page section mounts; sidebar persists across navigation.                                                                                                                                                             | `expect(authedPage).toHaveURL(/\/library(?:\?.*)?$/)`                                                                                                                                                                                                                                       |
| Then  | (1) New page state proven, (2) identity row re-located from the post-nav DOM. | (1) `[data-testid="page-library"]` becomes visible — this element only exists on `/library` and was absent before the click, so its visibility is the strict click-through-mandate post-action signal. (2) The post-nav identity row carries the real email and aria-label. | `expect(libraryPage).toBeVisible({ timeout: 10_000 })` (NEW post-nav state); then `expect(identityRowAfter).toHaveText(/e2e-authed-.+@kalori\.test/i)`; `expect(identityRowAfter).not.toContainText(/dev user/i)`; `expect(ariaLabel).toMatch(/^Signed in as e2e-authed-.+@kalori\.test$/)` |

**Screenshots:**

- `ac1-01-initial.png` — Given (dashboard mount, sidebar identity row visible, no library page testid yet).
- `ac1-02-result.png` — Then (captured AFTER the post-nav `[data-testid="page-library"]` assertion + `toHaveText` identity-row assertion both resolve green; sidebar still shows the ephemeral fixture email; no `dev user` text anywhere on the page).

**Why a click-through (not bare goto):** Per the E2E Functional Click-Through mandate, the WHEN clause must include a real user-action API. Clicking `nav-library` exercises a `<Link>` interaction proving the rendered DOM is interactive, not just statically asserted. Pure `goto` + assert would be SMOKE per the mandate.

**Why this satisfies the post-action-state requirement:** The mandate requires a `toBeVisible/toHaveText/toHaveValue` assertion against an element or state that did NOT exist before the action. The pre-click DOM (on `/dashboard`) does NOT contain `[data-testid="page-library"]`; the post-click DOM (on `/library`) does. Asserting `expect(libraryPage).toBeVisible()` is therefore a strict newly-reached-state assertion, and the follow-up `toHaveText` runs on a freshly-located identity row drawn from the post-nav DOM (not a reused pre-nav locator).

## AC2 / AC3 / AC4 — covered by unit tests

Per the briefing's test matrix (§"Test Levels Required"), these three branches live at the **Unit** level, not E2E:

| AC                       | Spec                                                                | Coverage                                                                                          |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| AC2 (HTML escape)        | `tests/unit/sidebar/identity-row.test.tsx::State 2 (AC2 XSS)`       | Asserts `<script>` element count = 0 + escaped text in DOM + escaped aria-label.                  |
| AC3 (anonymous → GUEST)  | `tests/unit/sidebar/identity-row.test.tsx::State 3 (AC3 anonymous)` | Asserts `GUEST` text + em-dash monogram + `data-anonymous="true"` + aria-label = `Not signed in`. |
| AC4 (full_name fallback) | `tests/unit/sidebar/identity-row.test.tsx::State 4 (AC4 fallback)`  | Asserts `Anh Nguyen` text + `AN` monogram.                                                        |
| AC4 (Account literal)    | `tests/unit/sidebar/identity-row.test.tsx::State 5 (AC4 terminal)`  | Asserts `Account` text + `A` monogram.                                                            |

Resolver-level branches additionally locked in `tests/unit/lib/auth/get-display-identity.test.ts` (16 cases, including HTML-escape contract for `& < > " '`, NFKD diacritic normalization, and whitespace-only edge cases).
