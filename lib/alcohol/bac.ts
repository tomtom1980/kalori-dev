export type BacBioSex = 'male' | 'female';

export interface BacProfile {
  bio_sex: BacBioSex;
  current_weight_kg: number;
}

export interface BacAlcoholLog {
  alcohol_grams: number;
  consumed_at: string;
}

export interface CalculateBacInput {
  logs: readonly BacAlcoholLog[];
  profile: BacProfile;
  asOf: string;
}

const ETHANOL_DENSITY_G_PER_ML = 0.789;
const ABSORPTION_MINUTES = 30;
const ELIMINATION_BAC_PER_HOUR = 0.015;
const WIDMARK_R: Record<BacBioSex, number> = {
  male: 0.68,
  female: 0.55,
};

export function calculateAlcoholGrams(volumeMl: number, abvPercent: number): number {
  return Number((volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML).toFixed(3));
}

function coefficientFor(bioSex: BacBioSex): number {
  const coefficient = WIDMARK_R[bioSex];
  if (coefficient === undefined) {
    throw new Error('unsupported_bio_sex');
  }
  return coefficient;
}

export function calculateBac({ logs, profile, asOf }: CalculateBacInput): number {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs) || logs.length === 0) return 0;

  const weightGrams = profile.current_weight_kg * 1000;
  if (!Number.isFinite(weightGrams) || weightGrams <= 0) return 0;

  const r = coefficientFor(profile.bio_sex);

  // 1. Build per-drink deltas: each drink absorbs linearly over ABSORPTION_MINUTES into peakBac.
  const drinks: Array<{ consumedMs: number; peakBac: number; absorbedEndMs: number }> = [];
  for (const log of logs) {
    const consumedMs = Date.parse(log.consumed_at);
    if (!Number.isFinite(consumedMs) || consumedMs > asOfMs) continue;
    drinks.push({
      consumedMs,
      peakBac: (log.alcohol_grams / (weightGrams * r)) * 100,
      absorbedEndMs: consumedMs + ABSORPTION_MINUTES * 60_000,
    });
  }
  if (drinks.length === 0) return 0;

  // 2. Time-ordered piecewise integration. Event boundaries: each drink's consumedMs and
  //    absorbedEndMs, plus asOfMs. Within each segment, BAC change rate is constant:
  //      d/dt[BAC] = (sum of currently-absorbing drinks' peakBac / ABSORPTION_HOURS) - ELIMINATION
  //    clamped at 0 lower-bound at each event boundary.
  const events = Array.from(
    new Set(drinks.flatMap((d) => [d.consumedMs, d.absorbedEndMs]).concat([asOfMs])),
  )
    .sort((a, b) => a - b)
    .filter((t) => t <= asOfMs);

  let bac = 0;
  let prevT = events[0]!;
  for (let i = 1; i < events.length; i++) {
    const t = events[i]!;
    const dtHours = (t - prevT) / 3_600_000;
    const absorbingDrinks = drinks.filter((d) => d.consumedMs <= prevT && prevT < d.absorbedEndMs);
    const absorptionRatePerHour =
      absorbingDrinks.reduce((acc, d) => acc + d.peakBac, 0) / (ABSORPTION_MINUTES / 60);
    const netRatePerHour = absorptionRatePerHour - ELIMINATION_BAC_PER_HOUR;
    bac = Math.max(0, bac + netRatePerHour * dtHours);
    prevT = t;
  }

  return Number(bac.toFixed(4));
}
