/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyEditorsNote } from '@/components/dashboard/DailyEditorsNote';
import type { DashboardSnapshot } from '@/lib/dashboard/types';

const snapshot = {
  chronometer: {
    status: 'default',
    consumed: 680,
    target: 2000,
    fiber: { consumed: 8, target: 25 },
    nowAngle: 120,
    entryCount: 1,
    lastLoggedAt: '2026-05-18T12:00:00.000Z',
  },
  macros: {
    protein: {
      key: 'protein',
      consumedG: 42,
      targetG: 125,
      pct: 34,
      status: 'default',
      contributions: [],
    },
    carbs: {
      key: 'carbs',
      consumedG: 82,
      targetG: 225,
      pct: 36,
      status: 'default',
      contributions: [],
    },
    fat: { key: 'fat', consumedG: 22, targetG: 67, pct: 33, status: 'default', contributions: [] },
    fiber: {
      key: 'fiber',
      consumedG: 8,
      targetG: 25,
      pct: 32,
      status: 'default',
      contributions: [],
    },
  },
  meals: {
    breakfast: { category: 'breakfast', entries: [], totalKcal: 0, heaviestEntryId: null },
    lunch: { category: 'lunch', entries: [{}], totalKcal: 680, heaviestEntryId: 'e1' },
    dinner: { category: 'dinner', entries: [], totalKcal: 0, heaviestEntryId: null },
    snack: { category: 'snack', entries: [], totalKcal: 0, heaviestEntryId: null },
    drink: { category: 'drink', entries: [], totalKcal: 0, heaviestEntryId: null },
  },
  water: { consumedMl: 750, targetMl: 2000, entries: [] },
  micros: [],
  microsRda: [],
} as unknown as DashboardSnapshot;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<DailyEditorsNote /> AI summary', () => {
  it('shows a first-load skeleton, then renders the AI body and bullets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              body_markdown: 'AI noticed a useful lunch pattern.',
              bullets: ['Add dinner protein.', 'Drink another glass of water.'],
              caveats: [],
              source: 'ai',
              generated_at: '2026-05-18T12:00:00.000Z',
              data_fingerprint: 'fp-1',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    render(<DailyEditorsNote snapshot={snapshot} viewedDay="2026-05-18" aiSummaryOptIn />);

    expect(screen.getByTestId('daily-editors-note-skeleton')).toBeInTheDocument();
    expect(await screen.findByText('AI noticed a useful lunch pattern.')).toBeInTheDocument();
    expect(screen.getByText('Add dinner protein.')).toBeInTheDocument();
  });

  it('does not call the nutrition summary API when AI summaries are disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<DailyEditorsNote snapshot={snapshot} viewedDay="2026-05-18" aiSummaryOptIn={false} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('daily-editors-note')).toBeInTheDocument();
  });

  it('keeps the previous summary visible and marks the note busy during a refresh', async () => {
    let resolveSecond: (value: Response) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body_markdown: 'First AI summary stays visible.',
            bullets: ['First action.'],
            caveats: [],
            source: 'ai',
            generated_at: '2026-05-18T12:00:00.000Z',
            data_fingerprint: 'fp-1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <DailyEditorsNote snapshot={snapshot} viewedDay="2026-05-18" aiSummaryOptIn />,
    );
    expect(await screen.findByText('First AI summary stays visible.')).toBeInTheDocument();

    rerender(<DailyEditorsNote snapshot={snapshot} viewedDay="2026-05-17" aiSummaryOptIn />);

    expect(screen.getByText('First AI summary stays visible.')).toBeInTheDocument();
    expect(screen.getByTestId('daily-editors-note-ai')).toHaveAttribute('aria-busy', 'true');

    resolveSecond(
      new Response(
        JSON.stringify({
          body_markdown: 'Second AI summary replaced it.',
          bullets: [],
          caveats: [],
          source: 'ai',
          generated_at: '2026-05-18T12:01:00.000Z',
          data_fingerprint: 'fp-2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await waitFor(() =>
      expect(screen.getByText('Second AI summary replaced it.')).toBeInTheDocument(),
    );
  });

  it('shows a parsing-failed state with retry when the AI request fails before any summary exists', async () => {
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
            body_markdown: 'Retry produced a data-based summary.',
            bullets: ['Pair lunch with Greek yogurt for protein.'],
            caveats: [],
            source: 'ai',
            generated_at: '2026-05-18T12:00:00.000Z',
            data_fingerprint: 'fp-retry',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<DailyEditorsNote snapshot={snapshot} viewedDay="2026-05-18" aiSummaryOptIn />);

    expect(await screen.findByText('AI parsing failed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry AI summary' }));

    expect(await screen.findByText('Retry produced a data-based summary.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
