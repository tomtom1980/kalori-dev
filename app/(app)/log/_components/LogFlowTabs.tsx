'use client';

/**
 * <LogFlowTabs /> — Radix Tabs wrapper for ADD FOOD / SNAP, plus Task 3.4's
 * `phase === 'confirmation'` takeover that swaps the tab body for
 * <ConfirmationScreen />.
 *
 * Add Food tab merge: the visible tab bar now has 2 triggers (Add Food +
 * Snap). The internal `activeTab` union remains 3-valued
 * (`'type' | 'snap' | 'library'`) — state-keying for clientIds,
 * commitSaveSuccess, and library-only mode depends on that continuity.
 * The displayed tab key is computed via `activeTabToDisplay`: both
 * `'library'` and `'type'` map onto `'add-food'`, and <AddFoodTab>
 * internally reads `activeTab` to choose its subview (LibraryList vs
 * AiParseForm). Clicking the Add Food trigger defaults to the library
 * subview; the user drills into AI parse via the + icon / empty-state CTA.
 *
 * Controlled via Zustand: `value={activeTabToDisplay(activeTab)}` +
 * a `onValueChange` that maps the displayed key back onto the internal
 * union. Radix owns all tablist ARIA + keyboard nav.
 *
 * The visible text "ADD FOOD" / "SNAP" IS the accessible name — do NOT
 * re-label via aria-label (WCAG 2.5.3 Label-in-Name, compliance §C1).
 *
 * Motion: per-panel crossfade via `.kalori-log-tab-panel[data-state=active]`
 * keyframes in globals.css. The active-tab underline + ivory serif end-caps
 * are pseudo-elements on `.kalori-log-tab-trigger[data-state=active]`.
 *
 * Error banner is hoisted HERE (not inside each tab) so it renders ABOVE
 * the active panel — style spec §9 + ux-specialist critical #12.
 *
 * Task 3.4 phase switchboard (synthesis §3.4):
 *   - `phase === 'entry'` → render <Tabs.Root> with 2 triggers + panels.
 *   - `phase === 'confirmation'` → UNMOUNT (not CSS-hide) the Tabs.Root and
 *     render <ConfirmationScreen /> with payload seeded from the active
 *     tab's parsed draft. Tab triggers are not in the DOM during
 *     confirmation so there are no ghost tabstops.
 *
 * Library-only mode short-circuit: when `mode === 'library-only'` the
 * tab bar is suppressed entirely and <AiParseForm> renders directly
 * (no onBack — the form is the entire surface).
 */
import * as Tabs from '@radix-ui/react-tabs';

import { t } from '@/lib/i18n/en';
import type { ParsedItemT, ParseResultT } from '@/lib/ai/schemas';
import {
  selectActiveTab,
  selectConfirmationPayload,
  selectFailureMode,
  selectPhase,
  useLogFlowStore,
  type LogTab,
} from '@/lib/stores/useLogFlowStore';
const selectMode = (s: ReturnType<typeof useLogFlowStore.getState>) => s.mode;

import { AddFoodTab } from './AddFoodTab';
import { AiParseForm } from './AddFoodTab/AiParseForm';
import { ConfirmationScreen } from './ConfirmationScreen';
import { LogFlowErrorBanner } from './LogFlowErrorBanner';
import type { ManualSubmitPayload } from './ManualEntryFallback';
import { SnapTab } from './SnapTab';

type DisplayTab = 'add-food' | 'snap';

const TAB_DEFS: Array<{ value: DisplayTab; label: string }> = [
  { value: 'add-food', label: t.log.tabAddFoodLabel },
  { value: 'snap', label: t.log.tabSnapLabel },
];

/**
 * Map the internal 3-value activeTab union onto the 2-value displayed
 * tab key. 'type' and 'library' both display as the unified 'add-food'
 * tab; AddFoodTab reads activeTab internally to choose its subview.
 */
function activeTabToDisplay(activeTab: LogTab): DisplayTab {
  return activeTab === 'snap' ? 'snap' : 'add-food';
}

/**
 * Lift a ManualSubmitPayload into a ParsedItemT shape so the confirmation
 * ItemList can render a single editable row. Fallback entries have no AI
 * macros/micros — we seed zeros + confidence=1 (user-typed = authoritative).
 */
function manualPayloadToItem(payload: ManualSubmitPayload): ParsedItemT {
  return {
    name: payload.foodName,
    portion: payload.quantity ?? payload.portionGrams,
    unit: payload.unit ?? 'g',
    kcal: payload.kcal,
    macros: {
      protein_g: payload.macros?.protein_g ?? 0,
      carbs_g: payload.macros?.carbs_g ?? 0,
      fat_g: payload.macros?.fat_g ?? 0,
      fiber_g: payload.macros?.fiber_g ?? 0,
    },
    micros: {},
    confidence: payload.needsReview ? 0.85 : 1,
  };
}

export function LogFlowTabs() {
  const activeTab = useLogFlowStore(selectActiveTab);
  const setActiveTab = useLogFlowStore((s) => s.setActiveTab);
  const failureMode = useLogFlowStore(selectFailureMode);
  const setFailureMode = useLogFlowStore((s) => s.setFailureMode);
  const phase = useLogFlowStore(selectPhase);
  const payload = useLogFlowStore(selectConfirmationPayload);
  const exitConfirmation = useLogFlowStore((s) => s.exitConfirmation);
  const closeModal = useLogFlowStore((s) => s.closeModal);
  const mode = useLogFlowStore(selectMode);
  // F-UI-3.6-B-1 — wire tab success callbacks to enterConfirmation. Without
  // these producers, the ConfirmationScreen takeover NEVER fires in
  // production; Task 3.3 tests masked the bug by calling the store action
  // directly.
  const enterConfirmation = useLogFlowStore((s) => s.enterConfirmation);

  const handleParseSuccess = (result: ParseResultT): void => {
    enterConfirmation({
      source: 'text',
      tab: 'type',
      items: result.items,
      reasoning: result.reasoning ?? null,
      dedupMatch: null,
    });
  };

  const handleAnalyzeSuccess = (items: ParsedItemT[], _signedUrl: string | null): void => {
    // signedUrl is threaded for future photo-preview use; ConfirmationScreen
    // currently does not render a thumbnail (Task 3.4 scope). Intentionally
    // dropped here, not in the payload shape.
    void _signedUrl;
    enterConfirmation({
      source: 'photo',
      tab: 'snap',
      items,
      reasoning: null,
      dedupMatch: null,
    });
  };

  const handleManualSubmit = (mp: ManualSubmitPayload): void => {
    enterConfirmation({
      source: 'manual',
      tab: activeTab,
      items: [manualPayloadToItem(mp)],
      reasoning: null,
      dedupMatch: null,
    });
  };

  if (phase === 'confirmation' && payload) {
    return (
      <ConfirmationScreen
        source={payload.source}
        tab={payload.tab}
        items={payload.items}
        reasoning={payload.reasoning}
        dedupMatch={payload.dedupMatch}
        libraryItemIds={payload.libraryItemIds}
        editEntryId={payload.editEntryId}
        originalLoggedAt={payload.originalLoggedAt}
        mode={mode}
        onClose={() => {
          exitConfirmation();
          closeModal();
        }}
      />
    );
  }

  // library-only entry surface — no tabs nav, no Snap/Add Food tabs. The
  // entry point only makes sense for AI-parsed text input, since the user
  // is authoring a new library item (photo input + library-pick are not
  // applicable here). Renders <AiParseForm> directly (no onBack — the form
  // is the entire surface; there's nowhere to go back to) inside the same
  // error-banner wrapper as the standard surface so parse failures still
  // surface.
  if (mode === 'library-only') {
    return (
      <div
        data-testid="log-flow-library-only-entry"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}
      >
        {failureMode ? <LogFlowErrorBanner onRetry={() => setFailureMode(null, null)} /> : null}
        <AiParseForm onParseSuccess={handleParseSuccess} onManualSubmit={handleManualSubmit} />
      </div>
    );
  }

  return (
    <Tabs.Root
      value={activeTabToDisplay(activeTab)}
      onValueChange={(v) => {
        const next = v as DisplayTab;
        // Clicking the visible "Add Food" tab defaults to the library
        // subview. The user can then drill into AI parse via the + icon
        // or empty-state CTA. Snap maps 1:1.
        setActiveTab(next === 'snap' ? 'snap' : 'library');
      }}
      data-testid="log-flow-tabs"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}
    >
      <Tabs.List
        aria-label={t.log.modalTabsLabel}
        data-testid="log-flow-tablist"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          borderTop: '1px solid var(--color-rule)',
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        {TAB_DEFS.map((def) => (
          <Tabs.Trigger
            key={def.value}
            value={def.value}
            data-testid={`log-flow-tab-${def.value}`}
            className="kalori-log-tab-trigger"
          >
            {def.label}
            <span className="kalori-log-tab-endcap-right" aria-hidden="true" />
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {failureMode ? <LogFlowErrorBanner onRetry={() => setFailureMode(null, null)} /> : null}

      <Tabs.Content
        value="add-food"
        data-testid="log-flow-panel-add-food"
        className="kalori-log-tab-panel"
      >
        <AddFoodTab onParseSuccess={handleParseSuccess} onManualSubmit={handleManualSubmit} />
      </Tabs.Content>
      <Tabs.Content value="snap" data-testid="log-flow-panel-snap" className="kalori-log-tab-panel">
        <SnapTab onAnalyzeSuccess={handleAnalyzeSuccess} onManualSubmit={handleManualSubmit} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

export default LogFlowTabs;
