# US-5.2 — Evidence-with-why

**Spec:** `tests/e2e/account-delete.spec.ts`
**Synthesis:** `planning/.tmp/task-5.2-ui-synthesis.md`
**Generated:** 2026-05-01

This file documents which user action triggered which observable change
and which assertion confirmed each step's THEN clause, per E2E
Click-Through Mandate M5.

---

## AC4 — Account-deletion cascade (synthesis §6.5)

### Step 0 → `ac4-01-initial.png`

**WHEN:** `await authedPage.goto('/settings')`.
**THEN:** Settings § 05 ACCOUNT renders with the danger-zone hairline
border + the `Delete account →` text link.
**Assertion:** `expect(authedPage.getByTestId('account-delete-trigger')).toBeVisible()`.
**ui-design alignment:** synthesis §2.3 — § 05 ACCOUNT block + 32px gap
above the danger zone + 1px rule-strong top border + ember (4.98:1) link
text per §1a Risk #4.

### Step 1 → `ac4-02-step1-warning.png`

**WHEN:** `await deleteTrigger.click()`.
**THEN:** Radix Dialog opens at Step 1 — kicker `§ DANGER`, title "This
cannot be undone.", 7 consequence bullets (ivory text + dash glyph
oxblood-soft `aria-hidden`), CANCEL secondary + I WANT TO CONTINUE
primary actions. Default focus on CANCEL.
**Assertion:** `expect(authedPage.getByRole('dialog', { name: /This cannot be undone/i })).toBeVisible()`.
**ui-design alignment:** synthesis §2.1 Step 1 microcopy table verbatim.

### Step 2 → `ac4-03-step2-typed-confirm.png`

**WHEN:** `await page.click('I WANT TO CONTINUE'); await page.fill('#delete-email', userEmail.toUpperCase())`.
**THEN:** Step 2 dialog renders — title "Confirm by typing your email.",
case-INSENSITIVE input (uppercase variant matches), DELETE MY ACCOUNT
becomes `aria-disabled="false"`, moss `✓ Email confirmed.` status line.
**Assertion:** `expect(deleteAccountBtn).toHaveAttribute('aria-disabled', 'false')`.
**ui-design alignment:** synthesis Conflict #1 (case-INSENSITIVE) +
§2.1 Step 2 microcopy.

### Step 3 → `ac4-04-step3-countdown.png`

**WHEN:** `await page.click('DELETE MY ACCOUNT'); await page.check('#understand'); await page.waitForTimeout(4000)`.
**THEN:** Step 3 renders title "Last chance." in **ember** (4.98:1 — escalation per §1a Risk #5), checkbox toggled, 10-second counter ticking
down with bullet ruler (`aria-hidden`), DELETE NOW remains
`aria-disabled="true"` until secondsLeft=0 + understands=true.
**Assertion:** `expect(deleteNow).toHaveAttribute('aria-disabled', 'false', { timeout: 12_000 })`.
**ui-design alignment:** synthesis §2.1 Step 3 + §1a contrast escalation.

### Step 4 → `ac4-05-step4-in-flight.png`

**WHEN:** `await page.click('DELETE NOW')` with mocked 600ms route delay.
**THEN:** Dialog flips to a non-dismissible `<section role="region"
aria-busy="true">` showing kicker `§ DELETING`, title "Destroying your
ledger.", phase lines (`→ Removing photos…` then `✓ Photos removed.`
etc.), JetBrains Mono caption "please stay on this page until the ledger
closes". ESC + scrim are disabled here.
**Assertion:** `expect(authedPage.getByTestId('account-delete-step4')).toBeVisible()`.
**ui-design alignment:** synthesis §2.1 Step 4 + ESC matrix (Conflict
#3) + Risk #1 mitigation.

### Step 5 → `ac4-06-signed-out-result.png`

**WHEN:** Server cascade resolves; client redirects to `/?deleted=1`.
**THEN:** Browser lands on the marketing root with the deleted query.
**Assertion:** `await authedPage.waitForURL(/\?deleted=1/)`.
**ui-design alignment:** synthesis §2.1 redirectAfterDeleteHref default.

---

## AC3 — Export modal (synthesis §6.5 + §2.2)

### `ac3-01-modal-opened.png`

**WHEN:** Click `EXPORT AS CSV` button in Settings § 04 DATA.
**THEN:** ExportModal opens at `phase='idle'` with kicker `§ EXPORT`,
title "Preparing your archive.", body line with row counts.
**Assertion:** `expect(modal).toBeVisible()`.

### `ac3-02-format-chosen.png`

**WHEN:** No additional click — the format is pre-locked from the
trigger button (synthesis Conflict #10 — no chooser).
**THEN:** EXPORT button visible.

### `ac3-03-generating.png`

**WHEN:** `await exportBtn.click()`.
**THEN:** Phase indicator flips to `reading records…`, EXPORT button
goes `aria-disabled='true'`.

### `ac3-04-download-ready.png`

**WHEN:** Server returns blob; client triggers programmatic anchor
download.
**THEN:** Playwright captures the download event with filename matching
`/^kalori-export-.+\.zip$/`.
**Assertion:** `expect(download.suggestedFilename()).toMatch(/^kalori-export-.+\.zip$/)`.

---

## AC1 + AC2 — cross-tab signals

Cross-tab tests are exercised via the Phase 2A integration suite
(`tests/integration/lib/auth/cross-tab-signout.test.ts` + `tests/
integration/lib/stores/useUndoQueueStore-cross-tab.test.ts`) using
happy-dom's BroadcastChannel mock — running Playwright multi-context
scenarios for BroadcastChannel was deferred because Playwright's
Chromium contexts share a process but not the same BroadcastChannel
realm. The integration tests cover:

- AC1 — `'push in tab A reveals toast in tab B via TOPICS.undo'`
- AC2 — `'three-tab scenario: sign-out in tab A propagates to tabs B + C'`

Banner UI verification: see `account-delete.spec.ts` Step 1 ESC test for
the modal close path; cross-tab banner is mounted at chrome level via
`<CrossTabSignOutListener />` and exercised by integration tests +
manual smoke.

---

## axe-core injection points (6 states — synthesis §6.5)

Each `injectAxeAndAudit()` invocation expects ZERO serious/critical
violations.

| State                   | Where in spec                                    |
| ----------------------- | ------------------------------------------------ |
| Settings idle           | After `goto('/settings')`                        |
| Step 1 warning          | After clicking `account-delete-trigger`          |
| Step 2 typed-confirm    | After typing email upper-case                    |
| Step 3 active countdown | After 4s into the 10s countdown                  |
| Step 4 in-flight        | After clicking DELETE NOW with 600ms route delay |
| ExportModal opened      | After clicking `export-trigger-csv`              |

Each state's failure surfaces the full violations payload via the
`expect(...).toBe(0)` assertion message — so a single axe failure is
diagnostically self-contained.

---

## Per-failure diagnosis template (M6)

Every assertion failure reports:

- **AC ID** (AC1–AC4)
- **Expected** (locator + observable property)
- **Actual** (Playwright's actual snapshot)
- **Inferred root cause** (missing test-id, missing role, contrast
  violation, etc.)
- **Smallest fix** (which file / which token)

Failures at the synthesis-pinned states (Step 3 ember title, Step 4
aria-busy, ExportModal aria-live phase indicator) trace back to the
corresponding §1a / §2.x spec line.
