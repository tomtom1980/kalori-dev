# Codex Adversarial Review

Target: branch diff against HEAD
Verdict: needs-attention

No-ship: the icon column was added only for active/default color states, leaving the §6.4 keyboard-focus state unimplemented and untested.

Findings:
- [medium] Inactive focused tabs keep dust-colored icon and label (components/nav/bottom-tab-bar.tsx:73-89)
  The link color is derived only from route activity, and the new Lucide icon inherits that color via currentColor. There is no focus-visible branch or class here, so keyboard focus on an inactive bottom-tab keeps both icon and label in dust, while ui-design.md §6.4 requires the Focus state to use ivory icon/label with an ivory outline. The added tests never focus an inactive tab, so this contract gap can ship unnoticed.
  Recommendation: Add an explicit focus-visible state for bottom-tab link/icon color and cover it with a regression test that focuses an inactive tab against the §6.4 focus contract.

Next steps:
- Block this batch until the focused inactive-tab state is implemented and tested.
