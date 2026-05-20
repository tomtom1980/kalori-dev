'use client';

/**
 * <WhyTheseNumbers /> — Task 3.4 Radix Collapsible (synthesis §2.8 + §6.3 +
 * ui-design §7.2.6 "Reasoning child" spec).
 *
 * Source-gated: hidden when source is 'library' | 'manual' OR when
 * `reasoning` is null/empty.
 *
 * Accepts either a bare narrative string OR a structured `ReasoningPayload`
 * so downstream parse outputs can render the ingredient-confidence table,
 * clickable source citations, and the "estimate" low-confidence footnote
 * per skill G6. Bare-string callers fall back to a plain paragraph.
 *
 * A11y:
 *   - Radix `Collapsible.Trigger` auto-wires `aria-expanded`/`aria-controls`.
 *   - Content has explicit `id` for the aria-controls relationship.
 *   - Caret rotates 0°→90° on expand via CSS `[data-state="open"]` selector,
 *     short-circuited to 1ms under `prefers-reduced-motion: reduce`.
 *   - Double-hairline top+bottom per §7.2.6 via `.kalori-why-trigger` CSS.
 */
import * as Collapsible from '@radix-ui/react-collapsible';
import { useId, useMemo, useState } from 'react';

import { t } from '@/lib/i18n/en';
import { formatMicroPercent, sortAndFilterMicrosByRdaPct } from '@/lib/nutrition/display-micros';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';

export interface ReasoningIngredient {
  name: string;
  source?: string;
  confidence?: number;
  kcal?: number;
}

export interface ReasoningSource {
  label: string;
  href: string;
}

export interface ReasoningPayload {
  narrative: string;
  ingredients?: ReasoningIngredient[];
  sources?: ReasoningSource[];
  lowConfidence?: boolean;
}

export interface WhyTheseNumbersProps {
  source: 'text' | 'photo' | 'library' | 'manual';
  reasoning: string | ReasoningPayload | null;
  items?: ({ micros?: Record<string, number> } & Record<string, unknown>)[];
}

interface WhyMicroRow {
  key: string;
  displayName: string;
  value: number;
  unit: string;
  pct: number;
}

function normalizePayload(input: string | ReasoningPayload): ReasoningPayload {
  if (typeof input === 'string') return { narrative: input };
  return input;
}

function formatConfidence(c: number | undefined): string {
  if (typeof c !== 'number') return '—';
  const pct = Math.max(0, Math.min(100, Math.round(c * 100)));
  return `${pct}%`;
}

export function WhyTheseNumbers({ source, reasoning, items = [] }: WhyTheseNumbersProps) {
  const bodyId = useId();
  const microsId = useId();
  const [microsOpen, setMicrosOpen] = useState(false);
  const microRows = useMemo(() => {
    const rows: WhyMicroRow[] = DEFAULT_MICROS_LIST.map((micro) => {
      const value = items.reduce((sum, item) => {
        const raw = item.micros?.[micro.code];
        return sum + (typeof raw === 'number' && Number.isFinite(raw) ? raw : 0);
      }, 0);
      return {
        key: micro.code,
        displayName: micro.name,
        value,
        unit: micro.unit,
        pct: formatMicroPercent(value, micro.rda),
      };
    });
    return sortAndFilterMicrosByRdaPct(rows, { includeUnknownRda: false });
  }, [items]);
  if (source === 'library' || source === 'manual') return null;
  if (reasoning == null) return null;
  if (typeof reasoning === 'string' && reasoning.trim().length === 0) return null;
  if (
    typeof reasoning !== 'string' &&
    (!reasoning.narrative || reasoning.narrative.trim().length === 0)
  )
    return null;

  const payload = normalizePayload(reasoning);
  const hasIngredients = (payload.ingredients?.length ?? 0) > 0;
  const hasSources = (payload.sources?.length ?? 0) > 0;
  const topMicro = microRows[0];
  const remainingMicros = microRows.slice(1);

  return (
    <Collapsible.Root>
      <Collapsible.Trigger
        data-testid="why-these-numbers-trigger"
        aria-controls={bodyId}
        className="kalori-why-trigger"
      >
        <span>{t.log.confirmationWhyHeader}</span>
        <span aria-hidden="true" className="kalori-why-caret">
          ▸
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content
        id={bodyId}
        data-testid="why-these-numbers-content"
        className="kalori-why-content"
      >
        <p className="kalori-why-body">{payload.narrative}</p>
        {topMicro ? (
          <div data-testid="why-these-numbers-micros" className="kalori-why-micros">
            <p data-testid="why-these-numbers-top-micro" className="kalori-why-estimate">
              <span className="kalori-why-sources-label">
                {t.log.confirmationWhyTopMicroHeading}
              </span>{' '}
              {topMicro.displayName} {topMicro.pct}
              {t.log.confirmationWhyDvSuffix}
            </p>
            {remainingMicros.length > 0 ? (
              <>
                <button
                  type="button"
                  aria-expanded={microsOpen}
                  aria-controls={microsId}
                  className="kalori-fd-micros-expand-trigger"
                  data-testid="why-these-numbers-micros-toggle"
                  onClick={() => setMicrosOpen((open) => !open)}
                >
                  {microsOpen
                    ? t.log.confirmationWhyHideAllMicros
                    : t.log.confirmationWhyShowAllMicros.replace(
                        '{count}',
                        String(microRows.length),
                      )}
                </button>
                {microsOpen ? (
                  <ul id={microsId} data-testid="why-these-numbers-micros-list">
                    {remainingMicros.map((row) => (
                      <li key={row.key}>
                        {row.displayName} {row.pct}
                        {t.log.confirmationWhyDvSuffix}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        {hasIngredients ? (
          <table data-testid="why-these-numbers-ingredients" className="kalori-why-table">
            <thead>
              <tr>
                <th scope="col" className="kalori-why-th">
                  {t.log.confirmationWhyIngredientHeading}
                </th>
                <th scope="col" className="kalori-why-th">
                  {t.log.confirmationWhyConfidenceHeading}
                </th>
                <th scope="col" className="kalori-why-th kalori-why-th-numeric">
                  {t.log.confirmationWhyKcalHeading}
                </th>
              </tr>
            </thead>
            <tbody>
              {payload.ingredients!.map((ing) => (
                <tr key={ing.name}>
                  <td className="kalori-why-td-name">{ing.name}</td>
                  <td className="kalori-why-td-confidence">
                    {ing.source ? `${ing.source} · ` : ''}
                    {formatConfidence(ing.confidence)}
                  </td>
                  <td className="kalori-why-td-kcal num">
                    {typeof ing.kcal === 'number' ? ing.kcal : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {hasSources ? (
          <p className="kalori-why-sources" data-testid="why-these-numbers-sources">
            <span className="kalori-why-sources-label">{t.log.confirmationWhySourcesHeading}</span>
            {payload.sources!.map((src, i) => (
              <span key={src.href}>
                {i > 0 ? ' · ' : ' '}
                <a
                  // @nav-audit external
                  // (data-attribution links to external sources)
                  href={src.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kalori-why-source-link"
                >
                  {src.label}
                </a>
              </span>
            ))}
          </p>
        ) : null}
        {payload.lowConfidence ? (
          <p className="kalori-why-estimate" data-testid="why-these-numbers-estimate">
            <em>{t.log.confirmationWhyEstimate}</em>
          </p>
        ) : null}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export default WhyTheseNumbers;
