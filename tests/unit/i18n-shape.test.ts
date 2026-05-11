/**
 * Unit test for `lib/i18n/en.ts` typed-constants shape (Task 1.3 AC).
 *
 * Asserts the canonical `t` object contains every top-level namespace named
 * in the AC and every leaf that the nav / route stubs / audit table rely on.
 *
 * Why shape-level assertions? Downstream components address keys via
 * `t.namespace.key` — a missing key fails at compile time, but we still want
 * a single runtime guard that flags structural drift (accidental deletion,
 * namespace rename) the first time the suite runs.
 */
import { describe, expect, it } from 'vitest';

import { t, type TranslationKey } from '@/lib/i18n/en';

describe('lib/i18n/en', () => {
  it('exports `t` as a plain object', () => {
    expect(t).toBeTypeOf('object');
    expect(t).not.toBeNull();
  });

  it('covers every top-level namespace named in the Task 1.3 AC', () => {
    const required: TranslationKey[] = [
      'brand',
      'nav',
      'masthead',
      'dashboard',
      'log',
      'library',
      'progress',
      'settings',
      'errors',
      'weight',
      'water',
      'onboarding',
      'fab',
      'user',
      'shortcutsOverlay',
      'auth',
    ];
    for (const namespace of required) {
      expect(t, `t.${namespace} must exist`).toHaveProperty(namespace);
      expect((t as Record<string, unknown>)[namespace]).toBeTypeOf('object');
    }
  });

  it('covers all 8 onboarding step labels required by design-doc.md §10.3', () => {
    const steps = [
      'stepBioSex',
      'stepAge',
      'stepHeight',
      'stepWeight',
      'stepGoalWeight',
      'stepPace',
      'stepActivity',
      'stepResults',
    ];
    for (const key of steps) {
      expect(t.onboarding, `t.onboarding.${key} must exist per design-doc.md §10.3`).toHaveProperty(
        key,
      );
      expect((t.onboarding as Record<string, unknown>)[key]).toBeTypeOf('string');
    }
  });

  it('exposes the Task 2.2 wizard leaves (titles, eyebrows, actions, errors)', () => {
    const required = [
      // titles
      'step1Title',
      'step2Title',
      'step3Title',
      'step4Title',
      'step5Title',
      'step6Title',
      'step7Title',
      'step8Title',
      // eyebrows
      'eyebrow1',
      'eyebrow2',
      'eyebrow3',
      'eyebrow4',
      'eyebrow5',
      'eyebrow6',
      'eyebrow7',
      'eyebrow8',
      // labels
      'ageLabel',
      'heightLabel',
      'weightLabel',
      'goalWeightLabel',
      // unit toggle
      'unitCm',
      'unitIn',
      'unitKg',
      'unitLb',
      // chip labels
      'bioSexMale',
      'bioSexFemale',
      'bioSexOther',
      'paceRelaxed',
      'paceSteady',
      'paceAggressive',
      'activitySedentary',
      'activityLight',
      'activityModerate',
      'activityActive',
      'activityVeryActive',
      // results screen
      'resultsAttribution',
      'targetValueLabel',
      'kcalUnit',
      'bmrLabel',
      'tdeeLabel',
      // how-we-calculated
      'howWeCalculatedToggle',
      'howWeCalculatedHeading',
      'howWeCalculatedAttribution',
      'formulaBmr',
      'formulaTdee',
      'formulaTarget',
      'yourValuesHeading',
      // sub-1200
      'sub1200Warning',
      // buttons
      'buttonBack',
      'buttonNext',
      'buttonNextLoading',
      'buttonStartTracking',
      'buttonStartTrackingLoading',
      // a11y
      'progressA11y',
      'progressLabel',
      // validation
      'errorBioSexRequired',
      'errorAgeRange',
      'errorHeightRange',
      'errorWeightRange',
      'errorGoalWeightRange',
      'errorPaceRequired',
      'errorActivityRequired',
    ];
    for (const key of required) {
      expect(t.onboarding, `t.onboarding.${key} must exist`).toHaveProperty(key);
      expect((t.onboarding as Record<string, unknown>)[key]).toBeTypeOf('string');
    }
  });

  it('sub-1200 warning copy matches the decided ux-specialist text', () => {
    expect(t.onboarding.sub1200Warning).toContain('1200');
    expect(t.onboarding.sub1200Warning.toLowerCase()).toContain('uncommon territory');
  });

  it('progressA11y is a substitution template with {N}', () => {
    expect(t.onboarding.progressA11y).toContain('{N}');
  });

  it('exposes the nav keys referenced by Sidebar + BottomTabBar', () => {
    // Primary destinations
    expect(t.nav.dashboard).toBe('Dashboard');
    expect(t.nav.library).toBe('Library');
    expect(t.nav.progress).toBe('Progress');
    expect(t.nav.settings).toBe('Settings');
    // Section heading on the sidebar
    expect(t.nav.sectionHeading).toBeTypeOf('string');
    // Accessibility namespace (shared landmark label)
    expect(t.nav.a11y.primary).toBeTypeOf('string');
    // Bottom-tab-bar labels (full words per ui-design.md §6.4 — CSS
    // textTransform: 'uppercase' handles visual styling; underlying
    // string is the mixed-case full word).
    expect(t.nav.shortLabel.dashboard).toBe('Dashboard');
    expect(t.nav.shortLabel.library).toBe('Library');
    expect(t.nav.shortLabel.progress).toBe('Progress');
    expect(t.nav.shortLabel.settings).toBe('Settings');
  });

  it('exposes masthead + section-kicker keys consumed by NavShell', () => {
    expect(t.masthead.brandFallback).toBeTypeOf('string');
    expect(t.masthead.editionStub).toBeTypeOf('string');
    expect(t.masthead.sectionKicker.dashboard).toContain('Dashboard');
    expect(t.masthead.sectionKicker.library).toContain('Library');
    expect(t.masthead.sectionKicker.progress).toContain('Progress');
    expect(t.masthead.sectionKicker.settings).toContain('Settings');
    expect(t.masthead.sectionKicker.log).toContain('Log');
  });

  it('exposes stub heading + body keys for every route-level placeholder page', () => {
    // Task B.6 (US-STAB-B6) — dropped `'settings'` from this loop because
    // `t.settings.stubHeading` / `t.settings.stubBody` were deleted; the
    // Settings page now sources its <h1> from `t.settings.heading`. The
    // five remaining namespaces still carry stub keys.
    for (const namespace of ['dashboard', 'log', 'library', 'progress', 'onboarding'] as const) {
      const ns = t[namespace] as Record<string, unknown>;
      expect(ns.stubHeading, `t.${namespace}.stubHeading`).toBeTypeOf('string');
      expect(ns.stubBody, `t.${namespace}.stubBody`).toBeTypeOf('string');
    }
  });

  it('exposes the fab + user + shortcutsOverlay keys consumed by nav components', () => {
    expect(t.fab.logA11y).toBeTypeOf('string');
    // Task A.2 (US-STAB-A2) — stub keys (initialsStub / nameStub / handleStub)
    // were removed in favour of runtime identity resolved via
    // `lib/auth/get-display-identity.ts`. The assertions below pin the new
    // i18n shape: anonymous fallback literal + aria-label fragments.
    expect(t.user.anonymousLabel).toBe('GUEST');
    expect(t.user.accountFallback).toBe('Account');
    expect(t.user.signedInAs).toBeTypeOf('string');
    expect(t.user.notSignedIn).toBeTypeOf('string');
    expect(t.user).not.toHaveProperty('initialsStub');
    expect(t.user).not.toHaveProperty('nameStub');
    expect(t.user).not.toHaveProperty('handleStub');
    expect(t.user.signOutLabel).toBeTypeOf('string');
    expect(t.user.signOutA11y).toBeTypeOf('string');
    expect(t.user.menuA11y).toBeTypeOf('string');
    expect(t.user.menuActionsA11y).toBeTypeOf('string');
    expect(t.user.menuSettings).toBeTypeOf('string');
    expect(t.user.menuExport).toBeTypeOf('string');
    expect(t.brand.wordmark).toBe('KALORI');
    expect(t.shortcutsOverlay.heading).toBeTypeOf('string');
    expect(t.shortcutsOverlay.stubBody).toBeTypeOf('string');
  });

  it('exposes the auth keys consumed by Task 2.1c sign-in surface', () => {
    // Minimum leaves the login page + callback + component test import.
    expect(t.auth.title).toBeTypeOf('string');
    expect(t.auth.tagline).toBeTypeOf('string');
    expect(t.auth.emailLabel).toBeTypeOf('string');
    expect(t.auth.emailPlaceholder).toBeTypeOf('string');
    expect(t.auth.submitMagicLink).toBeTypeOf('string');
    expect(t.auth.continueWithGoogle).toBeTypeOf('string');
    expect(t.auth.orDivider).toBeTypeOf('string');
    expect(t.auth.magicLinkSent).toBeTypeOf('string');
    expect(t.auth.errorGeneric).toBeTypeOf('string');
    expect(t.auth.errorGoogle).toBeTypeOf('string');
    expect(t.auth.errorCallback).toBeTypeOf('string');
    expect(t.auth.errorEmailInvalid).toBeTypeOf('string');
    expect(t.auth.errorEmailRequired).toBeTypeOf('string');
    expect(t.auth.privacyFooter).toBeTypeOf('string');
  });

  it('every string leaf is non-empty (guards against accidental empty keys)', () => {
    const stack: Array<[string, unknown]> = Object.entries(t as Record<string, unknown>);
    while (stack.length > 0) {
      const next = stack.pop();
      if (!next) break;
      const [path, value] = next;
      if (typeof value === 'string') {
        expect(value.length, `t.${path} must be non-empty`).toBeGreaterThan(0);
      } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          stack.push([`${path}.${k}`, v]);
        }
      }
    }
  });
});
