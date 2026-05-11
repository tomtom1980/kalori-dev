---
batch_id: 2026-05-08-e2e-regressions
started: 2026-05-08T15:51:00Z
last_updated: 2026-05-08T17:06:00Z
phase: 8
phase_status: complete
starting_head_sha: 71514c85ffe59ba1501e22ace42ce6fef656f317
git_stash_ref: null
working_tree_was_clean_at_start: false
project_slug: kalori

bugs:
  - id: 1
    description: "auth-forged-cookie.spec.ts: dashboard + onboarding redirects to /login (lines 118, 133) — toContain assertion failures"
    classification: real_bug
    status: implemented
    files_touched:
      - lib/auth/orphan-profile-fence.ts
      - app/(app)/onboarding/page.tsx
      - tests/integration/onboarding-page-profile-lookup.test.ts
      - tests/integration/dashboard-orphan-profile.test.ts
      - tests/integration/dashboard-page-onboarding-guard.test.ts
      - tests/integration/progress-page-profile-lookup-guard.test.ts
      - tests/integration/weight-page-profile-lookup-guard.test.ts
      - tests/e2e/auth-forged-cookie.spec.ts
    tests_added: []
    tdd_required: true
    ui_touching: false
    risk: medium
    drop_reason: null
  - id: 2
    description: "library/library-bulk-delete-undo.spec.ts:18 — toBeNull failure"
    classification: test_flake
    status: implemented
    files_touched:
      - tests/e2e/library/library-bulk-delete-undo.spec.ts
    tests_added: []
    tdd_required: false
    ui_touching: false
    risk: low
    drop_reason: null
  - id: 3
    description: "library-single-...-sweep-path-hard-deletes — toBeNull failures (similar family to bulk-delete)"
    classification: test_flake
    status: implemented
    files_touched:
      - tests/e2e/library/library-single-delete-undo.spec.ts
    tests_added: []
    tdd_required: false
    ui_touching: false
    risk: low
    drop_reason: null
  - id: 4
    description: "onboarding-completion.spec.ts: 6+ failing tests — locator.check timeouts + page.evaluate execution-context-destroyed"
    classification: test_infra
    status: implemented
    files_touched:
      - tests/e2e/onboarding-completion.spec.ts
    tests_added: []
    tdd_required: false
    ui_touching: false
    risk: low
    drop_reason: null
  - id: 5
    description: "reduced-motion.spec.ts: 2 failing tests on lines 30, 189 — landing axe + redirect"
    classification: stale_contract
    status: implemented
    files_touched:
      - tests/e2e/reduced-motion.spec.ts
    tests_added: []
    tdd_required: false
    ui_touching: false
    risk: low
    drop_reason: null

codex_round_1: completed_with_fixes
codex_round_2: escalated_force_commit
security_review: completed_clean
e2e_tests_required: false
e2e_tests_status: not_required
e2e_session_id: null
e2e_blocker_history: []

pending_minor_findings:
  - id: F-CODEX-R2-AUTH-GUARD-SMOKE-INCOMPLETE
    severity: critical
    source: codex_round_2_C2
    location: tests/e2e/onboarding-completion.spec.ts:270-277
    rationale: "Auth-guard smoke test only proves anonymous users are blocked, not that authenticated users can reach the wizard. Resolution requires F-TEST-4 (real Supabase test user fixture)."
  - id: F-CODEX-R2-MISSING-ERROR-BOUNDARY
    severity: improvement
    source: codex_round_2_I2
    location: app/(app)/onboarding/page.tsx:90-93
    rationale: "ProfileLookupError throws fall through to Next.js bare 500 page (no app/error.tsx or onboarding-segment error.tsx exists). Adds UX regression for transient profile-lookup errors."

last_completed_action: "Phase 8 docs + manifest written; ready for commit"
last_user_decision: "force_commit_round_2_findings_to_followups"
---
