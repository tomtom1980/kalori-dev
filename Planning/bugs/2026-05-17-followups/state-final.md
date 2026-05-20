# bugfix batch 2026-05-17-followups — state

phase: 7
phase_status: e2e_tests_complete
last_completed_action: "Phase 7 E2E + UI testing complete — verdict pass. Affected-module E2E specs ran on chromium project (15 passed + 16 skipped + 1 failed across US-STAB-A-bundled + US-STAB-B-bundled; first-run 3/4 with the 1 failure being the pre-existing lettermark flake from memory note 8105). Blocking visual baselines (chromium × 3 viewports for library + log-confirmation) all green; 4 advisory cross-browser failures are pre-existing drift unrelated to this batch. Bug 1 sodium meter visual rendering not regressed. No new E2E specs needed (Bug 1 + Bug 3 covered comprehensively at component layer; Bug 4 fallback is unit-only by nature). No blockers, no auth gates hit, no regressions introduced. Total wall-clock ~80s."

e2e_tests_status:
  outcome: pass
  verdict: pass
  artifact: planning/.tmp/bugfix-2026-05-17-followups/e2e-results.md
  total_wall_clock_seconds: 80
  affected_module_specs_run:
    - tests/e2e/library/library-add-then-view.spec.ts
    - tests/e2e/library/library-open-empty.spec.ts
    - tests/e2e/web/user-stories/US-STAB-A1.spec.ts
    - tests/e2e/web/user-stories/US-STAB-A2.spec.ts
    - tests/e2e/web/user-stories/US-STAB-A-bundled.spec.ts
    - tests/e2e/web/user-stories/US-STAB-B-bundled.spec.ts
  visual_specs_run:
    - tests/visual/library.spec.ts
    - tests/visual/log-confirmation.spec.ts
  chromium_aggregate:
    passed: 18  # 3 from first run + 15 from bundled runs
    failed: 2   # lettermark (pre-existing) + US-STAB-A3 AC6 (known flake)
    skipped: 16
  visual_blocking_aggregate:
    passed: 6   # chromium × 3 viewports × 2 specs
    failed: 0
  visual_advisory_aggregate:
    passed: 0
    failed: 4   # firefox + safari × 2 specs — continue-on-error per config
  new_specs_added: 0
  blockers: none
  regressions_caused_by_batch: 0
  pre_existing_failures:
    - id: lettermark-testid
      spec: tests/e2e/library/library-add-then-view.spec.ts:19
      cause: pre-existing per memory note 8105
    - id: us-stab-a3-ac6
      spec: tests/e2e/web/user-stories/US-STAB-A-bundled.spec.ts:460
      cause: documented historical flake per Phase 7 prompt
    - id: visual-cross-browser-drift
      specs: 4 advisory failures across visual-firefox + visual-safari
      cause: pre-existing browser-rendering drift; continue-on-error per playwright.config.ts:152-164
  coverage_gaps_not_addressed:
    - bug: bug-1-sodium-display-name
      covered_at: component
      file: tests/components/library/FoodDetailMacros.test.tsx
    - bug: bug-3-input-caps
      covered_at: component
      file: tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx
    - bug: bug-4-uuid-fallback
      covered_at: unit
      file: tests/unit/components/log-flow/mint-library-client-id.test.ts + tests/unit/stores/useLogFlowStore.test.ts

security_review:
  outcome: completed_clean
  verdict: clean
  critical_count: 0
  high_count: 0
  medium_count: 0
  informational_count: 2
  artifact: planning/.tmp/bugfix-2026-05-17-followups/security-review.md
  special_focus:
    bug_3_input_upper_bound: pass
    bug_4_uuid_fallback: pass
    bug_1_2_canonicalization: pass
  standard_checklist:
    input_validation: pass
    authn_authz: pass
    pii_handling: pass
    injection_vectors: pass
    secret_leakage: pass
    xss_csrf: pass
    race_conditions: pass
    a11y_security_crossover: pass
  fix_subagent_needed: false
  rolled_into_pending_minor_findings:
    - "INFO-1: Math.random tertiary UUID fallback retained — unreachable in supported runtimes, no action"
    - "INFO-2: Sentry { userId, loserId } in library/merge — pre-existing, UUIDs not PII"

codex_round_2:
  verdict: needs-attention
  thread_id: 019e349a-bd08-70a0-8062-f74e71d23449
  diff_size_bytes: 426341
  diff_files: 49
  diff_shortstat: "49 files changed, 7635 insertions(+), 253 deletions(-)"
  auto_retry_signals: none
  critical_count: 0
  improvement_count: 3
  minor_count: 0
  outcome_label: completed_with_fixes  # cap-reached terminology (zero critical, residuals deferred)
  cap_reached: true
  round_3_run: false
  artifacts:
    verbatim: planning/.tmp/bugfix-2026-05-17-followups/codex/round-2.md
    categorized: planning/.tmp/bugfix-2026-05-17-followups/codex/round-2-categorized.md
  findings:
    - id: I-R2-1
      severity: improvement
      bug_affected: r1-fix-fd1e3fc (I1 partial regression)
      file: app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:878-881
      summary: "Stale validation banner survives no-op save. After validation failure sets parent errorBanner via onFailed(saveFailedBanner), recovering to original value triggers no-fields success branch which sets setEditing(false) but does NOT clear _form or call onCommitted. Sheet closes edit mode with stale 'save failed' alert."
      r1_fix_verdict: I1 partially regressed
      action_required: deferred → pending_minor_findings (user decision)
    - id: I-R2-2
      severity: improvement
      bug_affected: r1-fix-fd1e3fc (C1 partial gap)
      file: app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:393-530
      summary: "Same-value micro edits not registered as 'touched'. microEdits only populated when parsed/clamped value differs from canonical initial. R1 preservation pass uses microEdits + microClears for touch detection. Editing iron_mg=3 → 3 through generic input + saving another field = preservation keeps legacy shape even though generic surface was touched."
      r1_fix_verdict: C1 narrowly incomplete (value-delta detection, not touch detection)
      real_world_impact: narrow (no data loss; legacy stays as-was matching user state)
      action_required: deferred → pending_minor_findings (user decision)
    - id: I-R2-3
      severity: improvement
      bug_affected: out-of-batch (Add Food merge feature commits 734ce8c, 38ecf64, debf99b)
      file: app/(app)/log/_components/LibraryTab.tsx:406-419
      summary: "AddNewItemCTA, AddNewItemIconButton, LibraryLoadingSkeleton added with isolated tests but NOT imported in production LibraryTab empty state. Repo-wide search outside tests shows no production render sites. User-visible Add Food empty-state path does not ship."
      net_new_finding: true
      scope_note: "These commits landed on origin/main between R1 (fd1e3fc) and R2 base; not part of original Bug 1-4 batch."
      action_required: deferred → pending_minor_findings (user decision: wire OR revert)
  bug_outcomes_after_r2:
    bug_1_LM_I1: clean (unchanged from R1)
    bug_2_LM_I2: residual (C1 fix narrowly incomplete per I-R2-2; I1 fix narrowly regressed per I-R2-1)
    bug_3_LM_SEC_1: clean (unchanged from R1)
    bug_4_LM_SEC_2: clean (unchanged from R1)
    out_of_batch_addfood: residual (I-R2-3 — dead code from sibling feature commits)
  r1_scrutiny_verification:
    q1_user_did_not_edit_vs_user_edited_to_same_value: FAILED (see I-R2-2)
    q2_all_30_pairs_covered: PASSED
    q3_banner_race_or_stale: PARTIALLY FAILED (see I-R2-1)
    q4_cross_bug_interaction_from_fd1e3fc: PASSED (no flags)

codex_round_1:
  verdict: needs-attention
  thread_id: 019e3488-c5eb-7812-8d80-ea43bcc4549a
  diff_size_bytes: 405170
  diff_files: 44
  auto_retry_signals: none
  critical_count: 1
  improvement_count: 1
  minor_count: 0
  noise_file_findings: false  # globals.css + LibraryLoadingSkeleton.tsx generated no findings
  artifacts:
    verbatim: planning/.tmp/bugfix-2026-05-17-followups/codex/round-1.md
    categorized: planning/.tmp/bugfix-2026-05-17-followups/codex/round-1-categorized.md
  findings:
    - id: C1
      severity: critical
      bug_affected: bug-2 (LM-I2)
      file: app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:424-487
      summary: "canonicalizeMicrosBag still aliases legacy-only non-sodium micros (iron_mg, vitamin_c_mg, etc.); shape-preservation undo path is hard-coded for sodium only. Legacy-only row + unrelated macro edit silently rewrites JSONB shape."
      action_required: auto-fix via sub-agent → round 2
    - id: I1
      severity: improvement
      bug_affected: bug-2 (LM-I2) — adjacent UX in same file
      file: app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:781-796
      summary: "Validation failure focuses errored micro input that may live inside a closed Radix Collapsible; focus call is a no-op and parent save banner is not set. User sees Save silently blocked."
      action_required: auto-fix via sub-agent → round 2
  bug_outcomes:
    bug_1_LM_I1: clean (no findings)
    bug_2_LM_I2: incomplete (C1 + I1)
    bug_3_LM_SEC_1: clean (no findings)
    bug_4_LM_SEC_2: clean (no findings)

## bug-1 (LM-I1)
status: implemented
files_touched:
  - app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx
  - tests/components/library/FoodDetailMacros.test.tsx
tests_added: 5 (1 RED-then-GREEN for display-name read; 4 regression/symmetry cites)
commit_local: e496627
commit_origin: e496627
risk: low

## bug-2
status: (managed by other sub-agent)

## bug-3
status: (managed by other sub-agent)

## bug-4 (LM-SEC-2 + sibling)
status: implemented_committed_pushed
files_touched:
  - app/(app)/log/_components/ConfirmationScreen.tsx (mintLibraryClientId — exported, getRandomValues fallback)
  - lib/stores/useLogFlowStore.ts (generateClientId — exported, getRandomValues fallback)
  - tests/unit/components/log-flow/mint-library-client-id.test.ts (new, 4 tests)
  - tests/unit/stores/useLogFlowStore.test.ts (extended, 4 new tests in generateClientId describe block)
tests_added: 8 (4 per call site; Test 2 in each is the failing-first RED-then-GREEN driver)
commit_local_main: 8d4a07f (UUID fallback fix)
commit_local_fixup: 0e4d39d (non-null assertion for noUncheckedIndexedAccess)
commit_origin_main: 8d4a07f
commit_origin_fixup: 0e4d39d
risk: low — fast path unchanged, fallback strengthened, schema-validity preserved
scope_expansion: sibling defect in lib/stores/useLogFlowStore.ts:439 fixed alongside (user-approved)
surprise_finding: third sibling defect site at lib/stores/useOnboardingStore.ts:210 (generateClientId, identical pattern) — surfaced, NOT fixed (out of approved scope)
test_infra_note: vi.stubGlobal('crypto', ...) works cleanly under happy-dom; no jsdom issues encountered
push_race: pre-push hook on retry showed origin-advanced-past-base error, but background-task push of same SHAs landed cleanly; verified HEAD == origin/main == 0e4d39d
