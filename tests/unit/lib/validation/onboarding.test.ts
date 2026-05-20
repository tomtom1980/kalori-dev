import { describe, expect, it } from 'vitest';

import { BIO_SEX_VALUES, Step1BioSexSchema } from '@/lib/validation/onboarding';

describe('onboarding bio_sex validation', () => {
  it("accepts only male/female and rejects retired 'other'", () => {
    expect(BIO_SEX_VALUES).toEqual(['male', 'female']);
    expect(Step1BioSexSchema.safeParse({ bio_sex: 'male' }).success).toBe(true);
    expect(Step1BioSexSchema.safeParse({ bio_sex: 'female' }).success).toBe(true);
    expect(Step1BioSexSchema.safeParse({ bio_sex: 'other' }).success).toBe(false);
  });
});
