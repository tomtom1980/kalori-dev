const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type IsoDayParts = {
  year: number;
  month: number;
  day: number;
};

function parseIsoDay(value: string | null | undefined): IsoDayParts | null {
  if (!value) return null;
  const match = ISO_DAY_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isIsoDay(value: string | null | undefined): value is string {
  return parseIsoDay(value) !== null;
}

export function calculateAgeOnDate(
  birthday: string | null | undefined,
  referenceDay: string | null | undefined,
): number | null {
  const born = parseIsoDay(birthday);
  const ref = parseIsoDay(referenceDay);
  if (!born || !ref) return null;

  let age = ref.year - born.year;
  const birthdayHasPassed =
    ref.month > born.month || (ref.month === born.month && ref.day >= born.day);
  if (!birthdayHasPassed) age -= 1;

  return age >= 0 ? age : null;
}

export function isAgeInSupportedRange(age: number | null): age is number {
  return age !== null && Number.isInteger(age) && age >= 13 && age <= 120;
}

export function addYearsToIsoDay(day: string, years: number): string | null {
  const parts = parseIsoDay(day);
  if (!parts) return null;

  const targetYear = parts.year + years;
  const target = new Date(Date.UTC(targetYear, parts.month - 1, parts.day));

  if (target.getUTCMonth() !== parts.month - 1) {
    return `${targetYear}-02-28`;
  }

  const month = String(parts.month).padStart(2, '0');
  const date = String(parts.day).padStart(2, '0');
  return `${targetYear}-${month}-${date}`;
}
