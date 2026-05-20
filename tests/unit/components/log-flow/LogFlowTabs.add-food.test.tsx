import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) })),
  authPost: vi.fn(),
  SessionExpiredError: class extends Error {},
}));

beforeEach(() => {
  useLogFlowStore.setState({
    activeTab: 'library',
    phase: 'entry',
    mode: 'standard',
    libraryItems: [],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
    confirmationPayload: null,
  });
});

describe('<LogFlowTabs /> — Add Food tab merge', () => {
  it('renders exactly 2 tab triggers (Add Food + Snap)', () => {
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-tab-add-food')).toBeTruthy();
    expect(screen.getByTestId('log-flow-tab-snap')).toBeTruthy();
    expect(screen.queryByTestId('log-flow-tab-type')).toBeNull();
    expect(screen.queryByTestId('log-flow-tab-library')).toBeNull();
  });

  it('Add Food tab is active when activeTab === "library"', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-tab-add-food').getAttribute('data-state')).toBe('active');
  });

  it('Add Food tab is active when activeTab === "type" (parse subview)', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-tab-add-food').getAttribute('data-state')).toBe('active');
  });

  it('Snap tab is active when activeTab === "snap"', () => {
    useLogFlowStore.setState({ activeTab: 'snap' });
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-tab-snap').getAttribute('data-state')).toBe('active');
  });

  it('clicking Add Food tab sets activeTab to library (default subview)', async () => {
    const user = userEvent.setup();
    useLogFlowStore.setState({ activeTab: 'snap' });
    render(<LogFlowTabs />);
    // Radix Tabs trigger requires userEvent.click (synthesises
    // pointerdown/up + click) — plain fireEvent.click does not flip
    // Radix's controlled value. The existing LogFlowTabs.test.tsx
    // smoke test uses the same userEvent pattern.
    await user.click(screen.getByTestId('log-flow-tab-add-food'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');
  });

  it('renders AddFoodTab content under the Add Food panel', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-panel-add-food')).toBeTruthy();
  });

  it('library-only mode renders AiParseForm without back arrow (no tabs)', () => {
    useLogFlowStore.setState({ activeTab: 'type', mode: 'library-only' });
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-library-only-entry')).toBeTruthy();
    expect(screen.getByTestId('type-tab-form')).toBeTruthy();
    expect(screen.queryByTestId('ai-parse-form-back')).toBeNull();
    expect(screen.queryByTestId('log-flow-tab-add-food')).toBeNull();
  });
});
