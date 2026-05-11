'use client';

/**
 * `<WizardShell />` — flat 8-step wizard root (briefing §2 + architecture §1).
 *
 * - One Zustand store (`useOnboardingStore`) drives `currentStep`.
 * - The shell wraps the step body in a single `<form>` so Enter in any
 *   input submits Next.
 * - Per-step save uses `authPost` (R1 canonical). No local 401-retry.
 * - On Step 8 success, the client clears the store and navigates to
 *   `/dashboard`.
 */
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
// Bug 3 (bugfix-tomi 2026-05-08-mobile-ui-overhaul): step-body motion now
// driven by Framer Motion (`m` + `pageSettle` variant) instead of the
// CSS `kalori-wizard-step-enter` keyframe. Reduced-motion is honored via
// `useReducedMotionVariants`.
import { m, variants as motionVariants, useReducedMotionVariants } from '@/lib/motion/defaults';
import {
  Step1BioSexSchema,
  Step2AgeSchema,
  Step3HeightSchema,
  Step4WeightSchema,
  Step5GoalWeightSchema,
  Step6PaceSchema,
  Step7ActivitySchema,
  Step8FinalizeSchema,
} from '@/lib/validation/onboarding';
import { useOnboardingStore, type Step } from '@/lib/stores/useOnboardingStore';

import { OnboardingProgressBar } from './OnboardingProgressBar';
import { StepActivity } from './StepActivity';
import { StepAge } from './StepAge';
import { StepBioSex } from './StepBioSex';
import { StepGoalWeight } from './StepGoalWeight';
import { StepHeight } from './StepHeight';
import { StepPace } from './StepPace';
import { StepResults } from './StepResults';
import { StepWeight } from './StepWeight';
import { WizardActionRow } from './WizardActionRow';

const STEP_COMPONENTS: Record<Step, () => React.ReactElement> = {
  1: StepBioSex,
  2: StepAge,
  3: StepHeight,
  4: StepWeight,
  5: StepGoalWeight,
  6: StepPace,
  7: StepActivity,
  8: StepResults,
};

const EYEBROWS: Record<Step, keyof typeof t.onboarding> = {
  1: 'eyebrow1',
  2: 'eyebrow2',
  3: 'eyebrow3',
  4: 'eyebrow4',
  5: 'eyebrow5',
  6: 'eyebrow6',
  7: 'eyebrow7',
  8: 'eyebrow8',
};

const TITLES: Record<Step, keyof typeof t.onboarding> = {
  1: 'step1Title',
  2: 'step2Title',
  3: 'step3Title',
  4: 'step4Title',
  5: 'step5Title',
  6: 'step6Title',
  7: 'step7Title',
  8: 'step8Title',
};

type Patch = Record<string, unknown>;

function buildStepPatch(
  step: Step,
  draft: ReturnType<typeof useOnboardingStore.getState>['draftProfile'],
  timezone: string,
  unitSystem: 'metric' | 'imperial',
): { ok: true; patch: Patch } | { ok: false } {
  switch (step) {
    case 1: {
      const parsed = Step1BioSexSchema.safeParse({ bio_sex: draft.bio_sex });
      return parsed.success ? { ok: true, patch: parsed.data } : { ok: false };
    }
    case 2: {
      const parsed = Step2AgeSchema.safeParse({ age: draft.age });
      return parsed.success ? { ok: true, patch: parsed.data } : { ok: false };
    }
    case 3: {
      const parsed = Step3HeightSchema.safeParse({ height_cm: draft.height_cm });
      return parsed.success ? { ok: true, patch: parsed.data } : { ok: false };
    }
    case 4: {
      const parsed = Step4WeightSchema.safeParse({
        current_weight_kg: draft.current_weight_kg,
      });
      return parsed.success ? { ok: true, patch: parsed.data } : { ok: false };
    }
    case 5: {
      const parsed = Step5GoalWeightSchema.safeParse({
        goal_weight_kg: draft.goal_weight_kg,
      });
      return parsed.success ? { ok: true, patch: parsed.data } : { ok: false };
    }
    case 6: {
      const parsed = Step6PaceSchema.safeParse({ goal_pace: draft.goal_pace });
      return parsed.success ? { ok: true, patch: parsed.data } : { ok: false };
    }
    case 7: {
      const parsed = Step7ActivitySchema.safeParse({
        activity_level: draft.activity_level,
      });
      return parsed.success ? { ok: true, patch: parsed.data } : { ok: false };
    }
    case 8: {
      const finalize = Step8FinalizeSchema.safeParse({
        bio_sex: draft.bio_sex,
        age: draft.age,
        height_cm: draft.height_cm,
        current_weight_kg: draft.current_weight_kg,
        goal_weight_kg: draft.goal_weight_kg,
        goal_pace: draft.goal_pace,
        activity_level: draft.activity_level,
        onboarding_completed_at: new Date().toISOString(),
      });
      if (!finalize.success) return { ok: false };
      return {
        ok: true,
        patch: {
          ...finalize.data,
          timezone,
          unit_pref: unitSystem,
        },
      };
    }
    default: {
      // Exhaustiveness — adding a Step 9 in the future breaks compilation here.
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

function canAdvanceAtStep(
  step: Step,
  draft: ReturnType<typeof useOnboardingStore.getState>['draftProfile'],
): boolean {
  switch (step) {
    case 1:
      return draft.bio_sex !== undefined;
    case 2:
      return (
        typeof draft.age === 'number' &&
        Number.isInteger(draft.age) &&
        draft.age >= 13 &&
        draft.age <= 120
      );
    case 3:
      return (
        typeof draft.height_cm === 'number' && draft.height_cm >= 100 && draft.height_cm <= 250
      );
    case 4:
      return (
        typeof draft.current_weight_kg === 'number' &&
        draft.current_weight_kg >= 30 &&
        draft.current_weight_kg <= 350
      );
    case 5:
      return (
        typeof draft.goal_weight_kg === 'number' &&
        draft.goal_weight_kg >= 30 &&
        draft.goal_weight_kg <= 350
      );
    case 6:
      return draft.goal_pace !== undefined;
    case 7:
      return draft.activity_level !== undefined;
    case 8:
      return (
        canAdvanceAtStep(1, draft) &&
        canAdvanceAtStep(2, draft) &&
        canAdvanceAtStep(3, draft) &&
        canAdvanceAtStep(4, draft) &&
        canAdvanceAtStep(5, draft) &&
        canAdvanceAtStep(6, draft) &&
        canAdvanceAtStep(7, draft)
      );
  }
}

/**
 * Focus the first interactive element inside the step body. Called on
 * mount + on every `currentStep` change. Also the submit-time fallback
 * when the user hits Enter on an invalid step. See ux-specialist §11.1
 * + ux-auditor V1.
 */
function focusFirstInteractive(container: HTMLElement | null): void {
  if (!container) return;
  // Native controls that receive Tab focus. Radio inputs are listed
  // explicitly so the `.sr-only` wrapped radios on BioSex/Pace/Activity
  // are reachable — their visible `<label>` isn't focusable on its own.
  const selector =
    'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const first = container.querySelector<HTMLElement>(selector);
  if (first) first.focus();
}

export function WizardShell(): React.ReactElement {
  const router = useRouter();
  const { currentStep, draft, isSaving, saveError, unitSystem } = useOnboardingStore(
    useShallow((s) => ({
      currentStep: s.currentStep,
      draft: s.draftProfile,
      isSaving: s.isSaving,
      saveError: s.saveError,
      unitSystem: s.unitSystem,
    })),
  );
  const setStep = useOnboardingStore((s) => s.setStep);
  const markSaving = useOnboardingStore((s) => s.markSaving);
  const setSaveError = useOnboardingStore((s) => s.setSaveError);
  const ensureClientId = useOnboardingStore((s) => s.ensureClientId);
  const reset = useOnboardingStore((s) => s.reset);

  const canAdvance = canAdvanceAtStep(currentStep, draft);

  // Hydration gate — always render the placeholder on the very first
  // client render so SSR output (where `window` is undefined) matches.
  // A lazy initializer that branches on `typeof window` produces
  // different values on server vs. client and breaks React hydration.
  // The post-mount effect flips the flag on the client only. Persist
  // middleware has already finished its synchronous sessionStorage
  // rehydrate by then, so the subsequent render shows the correct step.
  const [hydrated, setHydrated] = useState<boolean>(false);
  useEffect(() => {
    // Canonical React 19 hydration-detection pattern: post-mount flip is the
    // standard way to produce client-only content while matching SSR output.
    // The "cascading render" is exactly the intended single re-render that
    // swaps the placeholder for the hydrated wizard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  // Step-body container ref — owner of the focus-transfer behavior and
  // the submit-time focus-invalid fallback.
  const stepBodyRef = useRef<HTMLDivElement | null>(null);

  // Bug 3 — collapse pageSettle variant to opacity-only when the user
  // prefers reduced motion. Hook MUST be called at top level (rules of
  // hooks); the result is passed into the m.div below.
  const stepVariants = useReducedMotionVariants(motionVariants.pageSettle);

  // Step-change SR announcement via sr-only aria-live polite region.
  // 150ms delay gives the browser's focus shift time to land before the
  // announcement queues, so SR users don't hear the old step's title.
  const [announcement, setAnnouncement] = useState('');

  const handleBack = useCallback(() => {
    if (currentStep === 1) return;
    setStep((currentStep - 1) as Step);
    setSaveError(null);
  }, [currentStep, setStep, setSaveError]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSaving) return;
      if (!canAdvance) {
        // Keyboard users hit Enter on an invalid step: focus the first
        // interactive (typically the field they should fix). Spec
        // §9.3 + §11.1.
        focusFirstInteractive(stepBodyRef.current);
        return;
      }

      const tz =
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
          : 'UTC';
      const built = buildStepPatch(currentStep, draft, tz, unitSystem);
      if (!built.ok) return;

      const client_id = ensureClientId(currentStep);
      markSaving(true);
      setSaveError(null);
      try {
        await authPost<{ ok: true; profile: unknown }>('/api/profile/save', {
          client_id,
          patch: built.patch,
        });
        if (currentStep === 8) {
          reset();
          router.push('/dashboard');
          return;
        }
        setStep((currentStep + 1) as Step);
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          // The interceptor already redirected — nothing more to do here.
          return;
        }
        setSaveError(
          currentStep === 8 ? t.onboarding.startTrackingError : t.onboarding.saveErrorRetry,
        );
      } finally {
        markSaving(false);
      }
    },
    [
      canAdvance,
      currentStep,
      draft,
      ensureClientId,
      isSaving,
      markSaving,
      reset,
      router,
      setSaveError,
      setStep,
      unitSystem,
    ],
  );

  const StepBody = STEP_COMPONENTS[currentStep];
  const eyebrow = t.onboarding[EYEBROWS[currentStep]];
  const title = t.onboarding[TITLES[currentStep]];

  // Focus the first interactive of the current step on mount + every
  // step change. Announce "Step N of 8: {title}" to the sr-only live
  // region 150ms later so the SR announcement doesn't talk over the
  // focus shift. ux-auditor V1 + V3.
  useEffect(() => {
    if (!hydrated) return;
    focusFirstInteractive(stepBodyRef.current);
    const composed = t.onboarding.stepAnnouncement
      .replace('{N}', String(currentStep))
      .replace('{total}', '8')
      .replace('{title}', title);
    const handle = setTimeout(() => setAnnouncement(composed), 150);
    return () => clearTimeout(handle);
  }, [currentStep, hydrated, title]);

  if (!hydrated) {
    // Bg-matching placeholder — avoids a flash of Step 1 defaults while
    // the persist middleware rehydrates sessionStorage. Matches the
    // main element's sizing so layout doesn't shift. `suppressHydrationWarning`
    // guards against browser extensions injecting attributes into the
    // outermost DOM node before React's reconcile pass.
    return (
      <main
        aria-busy="true"
        suppressHydrationWarning
        style={{
          maxWidth: '640px',
          marginInline: 'auto',
          paddingBlock: 'var(--spacing-12)',
          paddingInline: 'var(--spacing-4)',
          minHeight: '50vh',
        }}
      />
    );
  }

  return (
    <main
      style={{
        maxWidth: '640px',
        marginInline: 'auto',
        paddingBlock: 'var(--spacing-12)',
        paddingInline: 'var(--spacing-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-8)',
      }}
    >
      <OnboardingProgressBar />
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}
      >
        <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-dust)',
            }}
          >
            {eyebrow}
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 300,
              fontSize: 'var(--type-section-md)',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
              color: 'var(--color-ivory)',
              margin: 0,
            }}
          >
            {title}
          </h1>
        </header>
        {/*
         * Bug 3 — m.div replaces the prior plain <div>. The
         * `pageSettle` variant fades content in at expressive
         * duration, replacing the CSS `kalori-wizard-step-enter`
         * keyframe. `key={currentStep}` re-mounts on each step
         * change so `initial="hidden"` re-runs the entrance.
         * Reduced-motion collapse via `useReducedMotionVariants`.
         */}
        <m.div
          key={currentStep}
          ref={stepBodyRef}
          className="kalori-wizard-step-body"
          variants={stepVariants}
          initial="hidden"
          animate="visible"
        >
          <StepBody />
        </m.div>
        {saveError ? (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              background: 'var(--color-bg-1)',
              borderLeft: '2px solid var(--color-ember)',
              padding: 'var(--spacing-3) var(--spacing-4)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--color-ivory)',
            }}
          >
            {saveError}
          </div>
        ) : null}
        <WizardActionRow canAdvance={canAdvance} isSaving={isSaving} onBack={handleBack} />
        <span className="sr-only" aria-live="polite" aria-atomic="true" data-wizard-announcement>
          {announcement}
        </span>
      </form>
    </main>
  );
}
