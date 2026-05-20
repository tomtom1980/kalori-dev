import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n/en';

describe('Add Food tab i18n strings', () => {
  it('has tabAddFoodLabel', () => {
    expect(t.log.tabAddFoodLabel).toBe('ADD FOOD');
  });

  it('has addNewItemAriaLabel for the + icon button', () => {
    expect(t.log.addNewItemAriaLabel).toBe('Add new food item');
  });

  it('has addNewItemCtaPrefix for the empty-state CTA', () => {
    // Pattern: `Add "${query}" as new item` — caller substitutes the search term.
    expect(t.log.addNewItemCtaPrefix).toBe('Add');
    expect(t.log.addNewItemCtaSuffix).toBe('as new item');
  });

  it('has libraryNoMatchWithCta for the no-match empty state header', () => {
    expect(t.log.libraryNoMatchWithCta).toBe('Nothing matches that search yet.');
  });

  it('has backToLibraryAriaLabel for the AiParseForm back arrow', () => {
    expect(t.log.backToLibraryAriaLabel).toBe('Back to library');
  });

  it('has loadingLibraryA11y for the skeleton aria-label', () => {
    expect(t.log.loadingLibraryA11y).toBe('Loading library');
  });
});
