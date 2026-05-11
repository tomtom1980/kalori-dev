'use client';

/**
 * <LogFlowTabs /> — Radix Tabs wrapper for TYPE / SNAP / LIBRARY, plus Task
 * 3.4's `phase === 'confirmation'` takeover that swaps the tab body for
 * <ConfirmationScreen />.
 *
 * Controlled via Zustand: `value={activeTab}` + `onValueChange={setActiveTab}`.
 * Radix owns all tablist ARIA + keyboard nav (ArrowLeft/Right/Home/End).
 *
 * The visible text "TYPE" / "SNAP" / "LIBRARY" IS the accessible name —
 * do NOT re-label via aria-label (WCAG 2.5.3 Label-in-Name, compliance §C1).
 *
 * Motion: per-panel crossfade via `.kalori-log-tab-panel[data-state=active]`
 * keyframes in globals.css. The active-tab underline + ivory serif end-caps
 * are pseudo-elements on `.kalori-log-tab-trigger[data-state=active]`.
 *
 * Error banner is hoisted HERE (not inside each tab) so it renders ABOVE
 * the active panel — style spec §9 + ux-specialist critical #12.
 *
 * Task 3.4 phase switchboard (synthesis §3.4):
 *   - `phase === 'entry'` → render <Tabs.Root> with 3 triggers + panels.
 *   - `phase === 'confirmation'` → UNMOUNT (not CSS-hide) the Tabs.Root and
 *     render <ConfirmationScreen /> with payload seeded from the active
 *     tab's parsed draft. Tab triggers are not in the DOM during
 *     confirmation so there are no ghost tabstops.
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

import { ConfirmationScreen } from './ConfirmationScreen';
import { LibraryTab } from './LibraryTab';
import { LogFlowErrorBanner } from './LogFlowErrorBanner';
import type { ManualSubmitPayload } from './ManualEntryFallback';
import { SnapTab } from './SnapTab';
import { TypeTab } from './TypeTab';

const TAB_DEFS: Array<{ value: LogTab; label: string }> = [
  { value: 'type', label: t.log.tabTypeLabel },
  { value: 'snap', label: t.log.tabSnapLabel },
  { value: 'library', label: t.log.tabLibraryLabel },
];

/**
 * Lift a ManualSubmitPayload into a ParsedItemT shape so the confirmation
 * ItemList can render a single editable row. Fallback entries have no AI
 * macros/micros — we seed zeros + confidence=1 (user-typed = authoritative).
 */
function manualPayloadToItem(payload: ManualSubmitPayload): ParsedItemT {
  return {
    name: payload.foodName,
    portion: payload.portionGrams,
    unit: 'g',
    kcal: payload.kcal,
    macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    micros: {},
    confidence: 1,
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
        onClose={() => {
          exitConfirmation();
          closeModal();
        }}
      />
    );
  }

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as LogTab)}
      data-testid="log-flow-tabs"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}
    >
      <Tabs.List
        aria-label={t.log.modalTabsLabel}
        data-testid="log-flow-tablist"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
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

      <Tabs.Content value="type" data-testid="log-flow-panel-type" className="kalori-log-tab-panel">
        <TypeTab onParseSuccess={handleParseSuccess} onManualSubmit={handleManualSubmit} />
      </Tabs.Content>
      <Tabs.Content value="snap" data-testid="log-flow-panel-snap" className="kalori-log-tab-panel">
        <SnapTab onAnalyzeSuccess={handleAnalyzeSuccess} onManualSubmit={handleManualSubmit} />
      </Tabs.Content>
      <Tabs.Content
        value="library"
        data-testid="log-flow-panel-library"
        className="kalori-log-tab-panel"
      >
        <LibraryTab />
      </Tabs.Content>
    </Tabs.Root>
  );
}

export default LogFlowTabs;
