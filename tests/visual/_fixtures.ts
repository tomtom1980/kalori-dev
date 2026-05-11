/**
 * Shared helpers for `tests/visual/**` baseline specs (Task 5.1.8).
 *
 * Every visual spec must call `freezeViewportForVisualBaseline()` before any
 * navigation so that:
 *   1. Animations / transitions are clamped to ~0ms (we still pass
 *      `animations: 'disabled'` to `toHaveScreenshot()` for belt-and-braces;
 *      the pre-page CSS injection covers the brief moments before that flag
 *      takes effect).
 *   2. `prefers-reduced-motion` reports `reduce` — guarantees that any
 *      reduced-motion-aware code path renders the static variant.
 *
 * R1 firewall (Task 5.1.8 briefing §5): NO touches to `lib/auth/refresh-
 * interceptor.ts`, NO mutation paths, NO production code. This file only
 * adds a Playwright init script + emulation toggle.
 */
import type { Page } from '@playwright/test';

export async function freezeViewportForVisualBaseline(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    // Style block goes in BEFORE app CSS so any subsequent rule defaulting to
    // animation: <name> 320ms gets overridden by the !important below. The
    // 0.001ms (not 0) is the convention from the existing
    // `tests/e2e/library/library-visual.spec.ts` — clamps duration without
    // ever cancelling the animation event chain (Playwright relies on
    // animationend semantics for `animations: 'disabled'`).
    const observer = new MutationObserver(() => {
      if (!document.head) return;
      observer.disconnect();
      const style = document.createElement('style');
      style.setAttribute('data-test-visual-freeze', '1');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0.001ms !important;
          animation-delay: 0.001ms !important;
          transition-duration: 0.001ms !important;
          transition-delay: 0.001ms !important;
          scroll-behavior: auto !important;
        }
        /* Hide the Next.js dev-only build indicator (it overlays a small
         * "Static" / "Dynamic" pill in the corner; not present in CI build
         * output but cheap insurance against local-vs-CI drift). */
        [data-nextjs-toast],
        [data-nextjs-dev-tools-button],
        nextjs-portal {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}
