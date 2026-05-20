# Codex Adversarial Review

Target: branch diff against HEAD
Verdict: needs-attention

Do not ship yet. The diff still violates the clarified cross-surface unknown-RDA rule on dashboard, and the editable confirmation micros list can reorder while the user is typing.

Findings:
- [critical] Dashboard still drops all RDA-unknown micronutrients (lib/dashboard/aggregate.ts:528-530)
  The dashboard aggregate path explicitly calls the shared helper with `includeUnknownRda: false`, so any consumed micro without an RDA is removed from the dashboard output. That contradicts the clarified requirement to show all RDA-unknown nutrients and breaks the stated cross-surface consistency goal: library view keeps unknown-RDA rows, confirmation keeps them, dashboard excludes them. The code comment says this preserves historical behavior, but that is exactly the behavior the clarification appears to override.
  Recommendation: Align dashboard with the clarified rule or document and get explicit product approval for dashboard-only exclusion; add a dashboard aggregate test proving unknown-RDA rows are either shown consistently or intentionally excluded.
- [medium] Confirmation micros reorder from live draft values during editing (app/(app)/log/_components/ConfirmationScreen.tsx:1674-1729)
  `ConfirmationItemMicros` rebuilds rows from current `micros`, computes pct, sorts them, then renders inputs on every render. The `onChange` handlers update `micros`, so clearing or lowering a high-percent nutrient can immediately move that input elsewhere in the list while the user is typing. The new test only edits iron from 100% to about 67%, which does not force a reorder below sodium/vitamin C, so it misses the jumpy editable-list case.
  Recommendation: Keep editable input order stable for the lifetime of the expanded editor or add a regression test that edits a high-ranked nutrient down to 0 and proves focus/position behavior remains acceptable.
