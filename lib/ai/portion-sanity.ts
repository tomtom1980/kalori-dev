import type { ParsedItemT, ParseResultT } from './schemas';

const GRAM_UNITS = new Set(['g', 'gram', 'grams']);

const COUNTABLE_FOOD_PATTERNS = [
  /\bsandwich(?:es)?\b/u,
  /\bburger(?:s)?\b/u,
  /\bbanh mi\b/u,
  /\bbánh mì\b/u,
  /\btaco(?:s)?\b/u,
  /\bburrito(?:s)?\b/u,
  /\bwrap(?:s)?\b/u,
  /\bhot dog(?:s)?\b/u,
  /\bmuffin(?:s)?\b/u,
  /\bdonut(?:s)?\b/u,
  /\bcookie(?:s)?\b/u,
  /\bslice(?:s)?\b/u,
  /\bpiece(?:s)?\b/u,
];

const SCOOP_FOOD_PATTERNS = [/\bice cream\b/u, /\bgelato\b/u, /\bsorbet\b/u, /\bfrozen yogurt\b/u];

const GRAM_PORTION_FOOD_PATTERNS = [
  /\bchicken\b/u,
  /\bbeef\b/u,
  /\bsteak\b/u,
  /\bpork\b/u,
  /\blamb\b/u,
  /\bturkey\b/u,
  /\bsalmon\b/u,
  /\btuna\b/u,
  /\bfish\b/u,
  /\bshrimp\b/u,
  /\bmeat\b/u,
  /\btofu\b/u,
  /\btempeh\b/u,
  /\brice\b/u,
  /\bpasta\b/u,
  /\bnoodle(?:s)?\b/u,
];

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./gu, '');
}

function matchesAny(name: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(name));
}

function clampReasoning(reasoning: string): string {
  return reasoning.length <= 500 ? reasoning : `${reasoning.slice(0, 497)}...`;
}

function withLowerConfidence(item: ParsedItemT): ParsedItemT {
  return { ...item, confidence: Math.min(item.confidence, 0.85) };
}

function repairImplausibleGramPortion(item: ParsedItemT): {
  item: ParsedItemT;
  note: string | null;
} {
  const unit = normalizeUnit(item.unit);
  if (!GRAM_UNITS.has(unit) || !Number.isFinite(item.portion) || item.portion > 5) {
    return { item, note: null };
  }

  const name = item.name.trim().toLowerCase();
  if (matchesAny(name, SCOOP_FOOD_PATTERNS)) {
    const nextPortion = Math.max(1, Math.round(item.portion));
    return {
      item: withLowerConfidence({ ...item, portion: nextPortion, unit: 'scoop' }),
      note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to ${nextPortion} scoop.`,
    };
  }

  if (matchesAny(name, COUNTABLE_FOOD_PATTERNS)) {
    const nextPortion = Math.max(1, Math.round(item.portion));
    return {
      item: withLowerConfidence({ ...item, portion: nextPortion, unit: 'piece' }),
      note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to ${nextPortion} piece.`,
    };
  }

  if (matchesAny(name, GRAM_PORTION_FOOD_PATTERNS)) {
    return {
      item: withLowerConfidence({ ...item, portion: 100, unit: 'g' }),
      note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to 100 g.`,
    };
  }

  return { item, note: null };
}

export function normalizeParsedPortions(result: ParseResultT): ParseResultT {
  const notes: string[] = [];
  const items = result.items.map((item) => {
    const repaired = repairImplausibleGramPortion(item);
    if (repaired.note) notes.push(repaired.note);
    return repaired.item;
  });

  if (notes.length === 0) return result;
  const prefix = result.reasoning.trim();
  const reasoning = clampReasoning([prefix, ...notes].filter(Boolean).join(' '));
  return { ...result, items, reasoning };
}
