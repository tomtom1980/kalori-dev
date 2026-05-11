/**
 * `/weight` — Task 4.3b Weight Log page.
 *
 * Single-column editorial page with quick-entry form + history list. Reachable
 * from dashboard nudge (via "TARGET · UPDATED" eyebrow), settings, profile
 * menu. Layout respects design-doc §10.10 — single column all breakpoints.
 */
import { redirect } from 'next/navigation';

import { WeightQuickAdd } from '@/components/dashboard/WeightQuickAdd';
import { requireProfileOrRedirect } from '@/lib/auth/orphan-profile-fence';
import { t } from '@/lib/i18n/en';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzToday } from '@/lib/time/day';
import { kgToLb, roundToOneDecimal } from '@/lib/units/conversion';

export const dynamic = 'force-dynamic';

interface HistoryRow {
  id: string;
  date: string;
  weight_kg: number;
  note: string | null;
}

export default async function WeightPage() {
  // Task A.3 — orphan-profile fence (US-STAB-A3) — single-pass profile
  // lookup. Widened SELECT collapses the two prior reads (auth-guard and
  // profile-fields) into one round trip.
  const { user, profile: profileRow } = await requireProfileOrRedirect({
    route: '/weight',
    loginRedirectTo: '/weight',
    selectExtras: 'unit_pref, current_weight_kg, timezone',
  });
  if (!profileRow.onboarding_completed_at) redirect('/onboarding');
  const supabase = await getServerSupabase();

  const unitPref = (profileRow.unit_pref as 'metric' | 'imperial') ?? 'metric';
  const tz = (profileRow.timezone as string) ?? 'UTC';
  const today = userTzToday(tz);
  // 30-day window start — date-math in UTC is fine because `userTzToday`
  // returned a user-TZ calendar date and we're just stepping 30 days back
  // at the day granularity.
  const minDateDate = new Date(today + 'T00:00:00Z');
  minDateDate.setUTCDate(minDateDate.getUTCDate() - 30);
  const minDate = minDateDate.toISOString().slice(0, 10);

  const { data: historyData } = (await supabase
    .from('weight_log')
    .select('id, date, weight_kg, note')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(60)) as { data: HistoryRow[] | null };

  const history = historyData ?? [];

  return (
    <main
      data-testid="page-weight"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-8)',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid var(--color-rule-strong)',
          paddingBottom: 'var(--spacing-4)',
        }}
      >
        <h1
          className="kalori-weight-page-title"
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            letterSpacing: '-0.01em',
            margin: 0,
            color: 'var(--color-ivory)',
            lineHeight: 1.1,
          }}
        >
          {t.weight.pageTitle}{' '}
          <em
            style={{
              fontStyle: 'italic',
              color: 'var(--color-sand)',
              fontWeight: 400,
            }}
          >
            {t.weight.pageSubtitle}
          </em>
        </h1>
      </header>

      <section aria-labelledby="weight-log-kicker">
        <h2
          id="weight-log-kicker"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
            margin: 0,
            marginBottom: 'var(--spacing-3)',
          }}
        >
          {t.weight.logKicker}
        </h2>
        <WeightQuickAdd
          mode="page"
          unitPref={unitPref}
          todayUserTz={today}
          minDateUserTz={minDate}
          initialWeightKg={
            profileRow.current_weight_kg === null ? null : Number(profileRow.current_weight_kg)
          }
        />
      </section>

      <section aria-labelledby="weight-history-kicker">
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: '1px solid var(--color-rule-strong)',
            paddingBottom: 'var(--spacing-3)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          <h2
            id="weight-history-kicker"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-dust)',
              margin: 0,
            }}
          >
            {t.weight.historyKicker}
          </h2>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-dust)',
            }}
          >
            {t.weight.historyWindowLabel}
          </span>
        </header>
        {history.length === 0 ? (
          <div
            data-testid="weight-history-empty"
            style={{
              textAlign: 'center',
              padding: 'var(--spacing-8) 0',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 20,
                color: 'var(--color-ivory)',
                margin: 0,
              }}
            >
              {t.weight.historyEmptyHeadline}
            </p>
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--color-dust)',
                margin: 'var(--spacing-2) 0 0',
              }}
            >
              {t.weight.historyEmptySubhead}
            </p>
          </div>
        ) : (
          <ul
            data-testid="weight-history-list"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {history.map((row, i) => {
              const prev = history[i + 1];
              // Task 4.5 R1 Pass 2 S2: convert kg → lb when unit_pref=imperial
              // before rendering the row weight + delta. Storage is kg-canonical
              // per design-doc §18.2 I6; lb is a display unit only. Pre-fix the
              // page rendered raw `weight_kg.toFixed(1)` and labeled the unit
              // as 'lb' for imperial — wrong number with wrong unit label.
              const displayWeight =
                unitPref === 'imperial' ? roundToOneDecimal(kgToLb(row.weight_kg)) : row.weight_kg;
              // Task 4.5 R2 S1: compute delta in full precision (NO kg-side
              // rounding) then convert to the display unit + round. Pre-fix
              // the sequence was round(kg delta) THEN convert, which
              // collapsed sub-0.05-kg (≈0.11 lb) changes to zero — a user
              // logging a 0.04 kg change (measurable in lb) would see "=0".
              const rawDeltaKg = prev ? row.weight_kg - prev.weight_kg : null;
              const delta =
                rawDeltaKg === null
                  ? null
                  : unitPref === 'imperial'
                    ? roundToOneDecimal(kgToLb(rawDeltaKg))
                    : roundToOneDecimal(rawDeltaKg);
              const deltaStr =
                delta === null
                  ? t.weight.deltaZeroGlyph
                  : delta > 0
                    ? `+${delta}`
                    : delta < 0
                      ? `−${Math.abs(delta)}`
                      : '=0';
              const isToday = row.date === today;
              return (
                <li
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto 2fr',
                    gap: 'var(--spacing-3)',
                    padding: 'var(--spacing-3) 0',
                    borderBottom:
                      '1px solid color-mix(in srgb, var(--color-ivory) 10%, transparent)',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    className="num"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--color-dust)',
                    }}
                  >
                    {row.date.replace(/-/g, '·')}
                    {isToday ? (
                      <em
                        style={{
                          fontStyle: 'italic',
                          color: 'var(--color-sand)',
                          marginLeft: 'var(--spacing-2)',
                        }}
                      >
                        {t.weight.historyTodayAnnotation}
                      </em>
                    ) : null}
                  </span>
                  <span
                    className="num"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 16,
                      color: 'var(--color-ivory)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {displayWeight.toFixed(1)}
                  </span>
                  <span
                    className="num"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--color-dust)',
                    }}
                  >
                    {unitPref === 'imperial' ? t.weight.unitLb : t.weight.unitKg} {deltaStr}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontStyle: 'italic',
                      fontSize: 14,
                      color: 'var(--color-dust)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.note ?? ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
