/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WeeklyReviewIsland } from '@/app/(app)/progress/_components/weekly-review-island';
import { fetchProgressSnapshot } from '@/lib/aggregations/progress-fetch';

vi.mock('@/lib/aggregations/progress-fetch', () => ({
  fetchProgressSnapshot: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(() => {
    throw new Error('weekly Supabase path should not run for nutrition summary client island');
  }),
}));

vi.mock('@/lib/time/day', () => ({
  userTzDayFrom: () => '2026-05-18',
}));

const profile = {
  calorie_target: 2000,
  protein_target_g: 125,
  carbs_target_g: 225,
  fat_target_g: 67,
  fiber_target_g: 30,
  cholesterol_target_mg: 300,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<WeeklyReviewIsland /> nutrition summary', () => {
  it('range=last_30 without AI consent renders a static non-busy fallback and skips the API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ui = await WeeklyReviewIsland({
      userId: 'user-1',
      tz: 'UTC',
      clientId: 'client-1',
      nowIso: '2026-05-18T12:00:00.000Z',
      requestOrigin: 'http://localhost:3000',
      cookieHeader: 'sid=x',
      range: 'last_30',
      profile,
      aiSummaryOptIn: false,
    });
    render(ui);

    const review = screen.getByTestId('nutrition-summary-review');
    expect(review).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText('Updating summary')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'The AI summary could not refresh. The charts above still show the selected range.',
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fetchProgressSnapshot).not.toHaveBeenCalled();
  });

  it('range=last_30 requests the shared nutrition-summary route instead of deterministic period copy', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            body_markdown: 'AI compared the selected 30-day record against the logged goals.',
            bullets: ['Log breakfast on the missing days.'],
            caveats: ['Only a few days have entries.'],
            source: 'ai',
            generated_at: '2026-05-18T12:00:00.000Z',
            data_fingerprint: 'fp-progress',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const ui = await WeeklyReviewIsland({
      userId: 'user-1',
      tz: 'UTC',
      clientId: 'client-1',
      nowIso: '2026-05-18T12:00:00.000Z',
      requestOrigin: 'http://localhost:3000',
      cookieHeader: 'sid=x',
      range: 'last_30',
      profile,
      aiSummaryOptIn: true,
    });
    render(ui);

    expect(fetchProgressSnapshot).not.toHaveBeenCalled();
    expect(await screen.findByText(/AI compared the selected 30-day record/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/nutrition-summary',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"scope":"progress-range"'),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/nutrition-summary',
      expect.objectContaining({
        body: expect.stringContaining('"preset":"last_30"'),
      }),
    );
  });

  it('shows an AI parsing failed state with retry when a progress summary has no history', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'ai_summary_unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body_markdown: 'Retry compared the 30-day record to the available targets.',
            bullets: ['Use chicken rice plus eggs on the next low-protein day.'],
            caveats: [],
            source: 'ai',
            generated_at: '2026-05-18T12:00:00.000Z',
            data_fingerprint: 'fp-progress-retry',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const ui = await WeeklyReviewIsland({
      userId: 'user-1',
      tz: 'UTC',
      clientId: 'client-1',
      nowIso: '2026-05-18T12:00:00.000Z',
      requestOrigin: 'http://localhost:3000',
      cookieHeader: 'sid=x',
      range: 'last_30',
      profile,
      aiSummaryOptIn: true,
    });
    render(ui);

    expect(await screen.findByText('AI parsing failed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry AI summary' }));

    expect(await screen.findByText(/Retry compared the 30-day record/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
