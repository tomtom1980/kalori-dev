/**
 * Task 3.5 Milestone 1.2 — i18n extension shape check.
 *
 * Asserts the keys that dashboard islands depend on exist, are strings, and
 * carry the expected substitution placeholders. A missing key fails at
 * compile time (components import via `t.*`); this suite is the runtime
 * belt-and-braces so a stale snapshot can't ship.
 */
import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';

describe('t.dashboard (Task 3.5 extensions)', () => {
  it('ring caption + status copy are present as strings', () => {
    expect(t.dashboard.ring.ariaLabel).toContain('{consumed}');
    expect(t.dashboard.ring.subLabel).toBeTypeOf('string');
    expect(t.dashboard.ring.fractionOfTarget).toContain('{target}');
    expect(t.dashboard.ring.remainUnder).toContain('{remain}');
    expect(t.dashboard.ring.remainOnTarget).toBeTypeOf('string');
    expect(t.dashboard.ring.remainOver).toContain('{over}');
    expect(t.dashboard.ring.footerAnnotations).toContain('{entries}');
    expect(t.dashboard.ring.statusDefault).toBeTypeOf('string');
    expect(t.dashboard.ring.emptyCaption).toBeTypeOf('string');
  });

  it('macro panel copy + formats', () => {
    expect(t.dashboard.macros.protein).toBe('PROTEIN');
    expect(t.dashboard.macros.carbs).toBe('CARBS');
    expect(t.dashboard.macros.fat).toBe('FAT');
    expect(t.dashboard.macros.valueFormat).toContain('{consumed}');
    expect(t.dashboard.macros.targetSuffix).toContain('{target}');
    expect(t.dashboard.macros.pctFormat).toContain('{pct}');
    expect(t.dashboard.macros.ariaLabel).toContain('{macro}');
  });

  it('meals bulletin kickers + category copy', () => {
    expect(t.dashboard.meals.bulletinHeading).toBeTypeOf('string');
    expect(t.dashboard.meals.bulletinSubheading).toBeTypeOf('string');
    expect(t.dashboard.meals.kicker.breakfast).toContain('BREAKFAST');
    expect(t.dashboard.meals.kicker.lunch).toContain('LUNCH');
    expect(t.dashboard.meals.kicker.dinner).toContain('DINNER');
    expect(t.dashboard.meals.kicker.snack).toContain('SNACK');
    expect(t.dashboard.meals.kicker.drink).toContain('DRINK');
    expect(t.dashboard.meals.empty.breakfast).toBeTypeOf('string');
    expect(t.dashboard.meals.addAction).toContain('ADD');
    expect(t.dashboard.meals.addActionA11y).toContain('{mealCategory}');
    expect(t.dashboard.meals.entryAriaLabel).toContain('{name}');
    expect(t.dashboard.meals.categoryLabel.breakfast).toBeTypeOf('string');
    expect(t.dashboard.meals.categoryLabel.drink).toBeTypeOf('string');
    expect(t.dashboard.meals.menuEdit).toBeTypeOf('string');
    expect(t.dashboard.meals.menuDelete).toBeTypeOf('string');
    expect(t.dashboard.meals.firstTimeBannerHeading).toBeTypeOf('string');
  });

  it('water tracker copy', () => {
    expect(t.dashboard.water.eyebrowLeft).toBeTypeOf('string');
    expect(t.dashboard.water.eyebrowRightFormat).toContain('{bulletsFilled}');
    expect(t.dashboard.water.glass).toContain('GLASS');
    expect(t.dashboard.water.bottle).toContain('BOTTLE');
    expect(t.dashboard.water.correct).toBe('CORRECT');
    expect(t.dashboard.water.groupA11y).toContain('{consumedMl}');
    expect(t.dashboard.water.glassA11y).toBeTypeOf('string');
    expect(t.dashboard.water.bottleA11y).toBeTypeOf('string');
    expect(t.dashboard.water.correctA11y).toBeTypeOf('string');
    expect(t.dashboard.water.errorToast).toBeTypeOf('string');
    expect(t.dashboard.water.liveAddedFormat).toContain('{amount}');
  });

  it('micronutrient panel copy', () => {
    expect(t.dashboard.micro.headerLeft).toBeTypeOf('string');
    expect(t.dashboard.micro.headerRight).toBeTypeOf('string');
    expect(t.dashboard.micro.pctFormat).toContain('{pct}');
    expect(t.dashboard.micro.overflowMoreFormat).toContain('{n}');
    expect(t.dashboard.micro.emptyHeading).toBeTypeOf('string');
    expect(t.dashboard.micro.rowAriaLabel).toContain('{name}');
  });

  it('weekly insight shell copy (skeleton only; 4.3a owns content)', () => {
    expect(t.dashboard.insight.weeklyKicker).toBeTypeOf('string');
    expect(t.dashboard.insight.weeklySkeletonLine1).toBeTypeOf('string');
    expect(t.dashboard.insight.weeklyEmptyHeading).toBeTypeOf('string');
  });

  it('undo toast dashboard-specific copy', () => {
    expect(t.dashboard.undo.deleteFailedToast).toBeTypeOf('string');
  });

  it('live region announcement templates', () => {
    expect(t.dashboard.live.entryAdded).toContain('{name}');
    expect(t.dashboard.live.entryRemoved).toContain('{name}');
    expect(t.dashboard.live.waterAdded).toContain('{amount}');
  });

  it('error-state copy', () => {
    expect(t.dashboard.errors.dashboardFetchHeading).toBeTypeOf('string');
    expect(t.dashboard.errors.dashboardFetchCaption).toBeTypeOf('string');
    expect(t.dashboard.errors.waterPostGenericCaption).toBeTypeOf('string');
  });
});

describe('t.masthead (Task 3.5 extensions)', () => {
  it('edition format + tagline + first-visit welcome', () => {
    expect(t.masthead.tagline).toBeTypeOf('string');
    expect(t.masthead.editionFormat).toContain('{weekday}');
    expect(t.masthead.editionFormat).toContain('{day}');
    expect(t.masthead.editionFormat).toContain('{month}');
    expect(t.masthead.editionFormat).toContain('{year}');
    expect(t.masthead.editionFormat).toContain('{n}');
    expect(t.masthead.welcomeFirstVisit).toBeTypeOf('string');
    expect(t.masthead.offlineBanner).toBeTypeOf('string');
  });
});
