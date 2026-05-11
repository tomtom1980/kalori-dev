/**
 * Task 3.4 — <WhyTheseNumbers /> Radix Collapsible.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { WhyTheseNumbers } from '@/app/(app)/log/_components/WhyTheseNumbers';

describe('<WhyTheseNumbers />', () => {
  it('renders a button with aria-expanded=false initially', () => {
    render(<WhyTheseNumbers source="text" reasoning="Eggs are 70 kcal each." />);
    const trigger = screen.getByRole('button', {
      name: /why these numbers/i,
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles aria-expanded on click', async () => {
    render(<WhyTheseNumbers source="text" reasoning="Eggs are 70 kcal each." />);
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', {
      name: /why these numbers/i,
    });
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders nothing when source is library', () => {
    const { container } = render(<WhyTheseNumbers source="library" reasoning="..." />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when source is manual', () => {
    const { container } = render(<WhyTheseNumbers source="manual" reasoning="..." />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when reasoning is empty', () => {
    const { container } = render(<WhyTheseNumbers source="text" reasoning={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders ingredient table when payload has ingredients', async () => {
    render(
      <WhyTheseNumbers
        source="text"
        reasoning={{
          narrative: '2 eggs at 70 kcal each.',
          ingredients: [{ name: 'egg', source: 'usda.sr30', confidence: 0.92, kcal: 140 }],
          sources: [{ label: 'usda.sr30', href: 'https://fdc.nal.usda.gov/' }],
          lowConfidence: false,
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /why these numbers/i }));
    expect(screen.getByTestId('why-these-numbers-ingredients')).toBeInTheDocument();
    expect(screen.getByTestId('why-these-numbers-sources')).toBeInTheDocument();
  });

  it('renders "estimate" footnote when payload.lowConfidence is true', async () => {
    render(
      <WhyTheseNumbers
        source="text"
        reasoning={{
          narrative: 'This is an estimate.',
          lowConfidence: true,
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /why these numbers/i }));
    expect(screen.getByTestId('why-these-numbers-estimate')).toBeInTheDocument();
  });

  it('has no axe-core violations when collapsed', async () => {
    const { container } = render(
      <WhyTheseNumbers source="text" reasoning="Eggs are 70 kcal each." />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe-core violations when expanded with narrative', async () => {
    const { container } = render(
      <WhyTheseNumbers source="text" reasoning="Eggs are 70 kcal each." />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /why these numbers/i }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe-core violations when expanded with ingredient table + sources', async () => {
    const { container } = render(
      <WhyTheseNumbers
        source="text"
        reasoning={{
          narrative: '2 eggs at 70 kcal each.',
          ingredients: [{ name: 'egg', source: 'usda.sr30', confidence: 0.92, kcal: 140 }],
          sources: [{ label: 'usda.sr30', href: 'https://fdc.nal.usda.gov/' }],
          lowConfidence: true,
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /why these numbers/i }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
