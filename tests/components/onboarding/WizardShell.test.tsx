/**
 * Component test — <WizardShell />.
 *
 * Covers:
 *   - Renders <main> + <form> + progress bar + step body + action row
 *   - Dispatches per-step component based on currentStep
 *   - Back button decrements currentStep (no server call)
 *   - Next click invokes authPost and advances on 200
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

const authPost = vi.fn();

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (...args: unknown[]) => authPost(...args),
  SessionExpiredError: class SessionExpiredError extends Error {
    constructor() {
      super('Session expired after refresh attempt');
      this.name = 'SessionExpiredError';
    }
  },
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: () => void 0 }),
}));

describe('<WizardShell />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
    authPost.mockReset();
    authPost.mockResolvedValue({ ok: true, profile: {} });
    routerPush.mockReset();
  });

  afterEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders the main landmark + form on initial load', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    render(<WizardShell />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders StepBioSex body at step 1 with male and female radios', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    render(<WizardShell />);
    expect(screen.getByRole('radio', { name: t.onboarding.bioSexMale })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t.onboarding.bioSexFemale })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: t.onboarding.bioSexOther })).not.toBeInTheDocument();
  });

  it('advances to step 2 after selecting bio sex and clicking Next', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    const user = userEvent.setup();
    render(<WizardShell />);

    await user.click(screen.getByRole('radio', { name: t.onboarding.bioSexMale }));
    await user.click(screen.getByRole('button', { name: t.onboarding.buttonNext }));

    await waitFor(() => {
      expect(useOnboardingStore.getState().currentStep).toBe(2);
    });
    expect(authPost).toHaveBeenCalledWith(
      '/api/profile/save',
      expect.objectContaining({
        client_id: expect.any(String),
        patch: { bio_sex: 'male' },
      }),
    );
  });

  it('Back button decrements currentStep without calling authPost', async () => {
    useOnboardingStore.getState().setStep(3);
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    const user = userEvent.setup();
    render(<WizardShell />);

    await user.click(screen.getByRole('button', { name: t.onboarding.buttonBack }));
    expect(useOnboardingStore.getState().currentStep).toBe(2);
    expect(authPost).not.toHaveBeenCalled();
  });

  it('disables Next when the current step has no valid value', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    render(<WizardShell />);
    const next = screen.getByRole('button', { name: t.onboarding.buttonNext });
    expect(next).toBeDisabled();
  });

  it('SSR render produces the hydration-safe placeholder (aria-busy, no wizard body)', async () => {
    // Regression for Sentry KALORI-DEV-1: a lazy initializer that branched
    // on `typeof window` produced different initial render output on the
    // server (hydrated=false → placeholder) vs. the client (hydrated=true
    // → full wizard), triggering React's hydration mismatch error. The
    // fix is to always start with `hydrated=false` and flip it in a
    // post-mount effect. This test guards that contract by asserting the
    // server-rendered markup is exactly the placeholder.
    const { renderToString } = await import('react-dom/server');
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');

    const html = renderToString(<WizardShell />);

    expect(html).toContain('aria-busy="true"');
    // Must NOT contain any content that only appears once `hydrated=true`.
    expect(html).not.toContain(t.onboarding.bioSexMale);
    expect(html).not.toContain(t.onboarding.buttonNext);
    expect(html).not.toContain('role="progressbar"');
  });
});
