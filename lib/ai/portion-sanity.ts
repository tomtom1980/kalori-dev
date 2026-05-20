import type { ParsedItemT, ParseResultT } from './schemas';

const GRAM_UNITS = new Set(['g', 'gram', 'grams']);
const MAX_SANE_APPROX_GRAMS = 2000;
const LOCALIZED_UNIT_ALIASES = new Map<string, string>([
  ['adag', 'serving'],
  ['bat', 'bowl'],
  ['darab', 'piece'],
  ['dia', 'plate'],
  ['lat', 'slice'],
  ['ly', 'glass'],
  ['mieng', 'piece'],
  ['phan', 'serving'],
  ['pohar', 'glass'],
  ['szelet', 'slice'],
  ['tal', 'bowl'],
  ['to', 'bowl'],
]);

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

const BOWL_MEAL_FOOD_PATTERNS = [
  /\bbowl\b/u,
  /\bsoup\b/u,
  /\bstew\b/u,
  /\bcasserole\b/u,
  /\bcurry\b/u,
  /\bramen\b/u,
  /\bpho\b/u,
  /\bbun bo hue\b/u,
  /\bbun rieu\b/u,
  /\bbun thit nuong\b/u,
  /\bcao lau\b/u,
  /\bmi quang\b/u,
  /\bhu tieu\b/u,
];

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

const LEGITIMATE_TINY_GRAM_PATTERNS = [
  /\bsalt\b/u,
  /\bpepper\b/u,
  /\bspice(?:s)?\b/u,
  /\bseasoning\b/u,
  /\bherb(?:s)?\b/u,
  /\bsugar\b/u,
  /\bhoney\b/u,
  /\boil\b/u,
  /\bbutter\b/u,
  /\bsauce\b/u,
];

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./gu, '');
}

function normalizeUnitAliasKey(unit: string): string {
  return normalizeUnit(unit)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gu, 'd');
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

function withApproxGrams(item: ParsedItemT, gramsPerUnit: number): ParsedItemT {
  const portion = Number.isFinite(item.portion) && item.portion > 0 ? item.portion : 1;
  return { ...item, approxGrams: Math.round(portion * gramsPerUnit) };
}

function canonicalizeLocalizedUnit(item: ParsedItemT): {
  item: ParsedItemT;
  note: string | null;
} {
  const canonicalUnit = LOCALIZED_UNIT_ALIASES.get(normalizeUnitAliasKey(item.unit));
  if (!canonicalUnit || normalizeUnit(item.unit) === canonicalUnit) {
    return { item, note: null };
  }

  return {
    item: { ...item, unit: canonicalUnit },
    note: `Portion sanity check: normalized unit for ${item.name} from ${item.unit} to ${canonicalUnit}.`,
  };
}

function normalizeApproxGrams(item: ParsedItemT): {
  item: ParsedItemT;
  note: string | null;
} {
  const unit = normalizeUnit(item.unit);
  if (GRAM_UNITS.has(unit)) {
    if (typeof item.approxGrams === 'number') {
      const rest = { ...item };
      delete rest.approxGrams;
      return {
        item: withLowerConfidence(rest),
        note: `Portion sanity check: removed approxGrams for gram-unit ${item.name}.`,
      };
    }
    return { item, note: null };
  }
  if (typeof item.approxGrams !== 'number') return { item, note: null };
  if (
    !Number.isFinite(item.approxGrams) ||
    item.approxGrams < 5 ||
    item.approxGrams > MAX_SANE_APPROX_GRAMS
  ) {
    const rest = { ...item };
    delete rest.approxGrams;
    return {
      item: withLowerConfidence(rest),
      note: `Portion sanity check: removed implausible approxGrams for ${item.name}.`,
    };
  }
  return { item, note: null };
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
  if (matchesAny(name, LEGITIMATE_TINY_GRAM_PATTERNS)) {
    return { item, note: null };
  }

  if (matchesAny(name, SCOOP_FOOD_PATTERNS)) {
    const nextPortion = Math.max(1, Math.round(item.portion));
    return {
      item: withLowerConfidence(
        withApproxGrams({ ...item, portion: nextPortion, unit: 'scoop' }, 65),
      ),
      note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to ${nextPortion} scoop.`,
    };
  }

  if (matchesAny(name, BOWL_MEAL_FOOD_PATTERNS)) {
    const nextPortion = Math.max(1, Math.round(item.portion));
    return {
      item: withLowerConfidence(
        withApproxGrams({ ...item, portion: nextPortion, unit: 'bowl' }, 450),
      ),
      note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to ${nextPortion} bowl.`,
    };
  }

  if (matchesAny(name, COUNTABLE_FOOD_PATTERNS)) {
    const nextPortion = Math.max(1, Math.round(item.portion));
    return {
      item: withLowerConfidence(
        withApproxGrams({ ...item, portion: nextPortion, unit: 'piece' }, 150),
      ),
      note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to ${nextPortion} piece.`,
    };
  }

  if (matchesAny(name, GRAM_PORTION_FOOD_PATTERNS)) {
    return {
      item: withLowerConfidence({ ...item, portion: 100, unit: 'g' }),
      note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to 100 g.`,
    };
  }

  const nextPortion = Math.max(1, Math.round(item.portion));
  return {
    item: withLowerConfidence(
      withApproxGrams({ ...item, portion: nextPortion, unit: 'serving' }, 150),
    ),
    note: `Portion sanity check: adjusted ${item.name} from ${item.portion} ${item.unit} to ${nextPortion} serving.`,
  };
}

export function normalizeParsedPortions(result: ParseResultT): ParseResultT {
  const notes: string[] = [];
  const items = result.items.map((item) => {
    const canonicalized = canonicalizeLocalizedUnit(item);
    if (canonicalized.note) notes.push(canonicalized.note);
    const repaired = repairImplausibleGramPortion(canonicalized.item);
    if (repaired.note) notes.push(repaired.note);
    const normalizedApprox = normalizeApproxGrams(repaired.item);
    if (normalizedApprox.note) notes.push(normalizedApprox.note);
    return normalizedApprox.item;
  });

  if (notes.length === 0) return result;
  const prefix = result.reasoning.trim();
  const reasoning = clampReasoning([prefix, ...notes].filter(Boolean).join(' '));
  return { ...result, items, reasoning };
}
