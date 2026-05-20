/**
 * § 04 · DATA — Task 5.2 Phase 2B (synthesis §2.3).
 *
 * RSC. Renders static markup + the two <ExportTriggerButton> client
 * islands (CSV primary, JSON secondary).
 */
import { t } from '@/lib/i18n/en';

import { ExportTriggerButton } from '@/components/settings/ExportTriggerButton';

export interface DataSubsectionProps {
  counts: { entries: number; library: number; weight: number; water: number };
  userIdSlug: string;
}

export function DataSubsection({ counts, userIdSlug }: DataSubsectionProps): React.ReactElement {
  return (
    <section
      id="data-export"
      data-testid="settings-data-section"
      style={{
        marginTop: 'var(--spacing-8)',
        paddingTop: 'var(--spacing-6)',
        borderTop: '1px solid var(--color-rule-strong)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '10.5px',
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {t.settings.data.kicker}
      </p>
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 'var(--type-section-md)',
          color: 'var(--color-ivory)',
          margin: 0,
          marginBottom: 'var(--spacing-3)',
        }}
      >
        {t.settings.data.title}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '15px',
          color: 'var(--color-sand)',
          margin: 0,
          marginBottom: 'var(--spacing-4)',
          lineHeight: 1.5,
        }}
      >
        {t.settings.data.caption}
      </p>
      <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
        <ExportTriggerButton
          testId="export-trigger-csv"
          format="csv"
          label={t.settings.data.exportCsv}
          primary
          counts={counts}
          userIdSlug={userIdSlug}
        />
        <ExportTriggerButton
          testId="export-trigger-json"
          format="json"
          label={t.settings.data.exportJson}
          counts={counts}
          userIdSlug={userIdSlug}
        />
      </div>
    </section>
  );
}

export default DataSubsection;
