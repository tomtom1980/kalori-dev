/**
 * @vitest-environment node
 *
 * Task 4.2 — `POST /api/library/[id]/update` happy-path + validation +
 * 404 on tombstoned / unknown id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Bug 3 (library overhaul 2026-05-16) — route now imports
// `@/lib/storage/sign-thumbnail` which itself imports the `server-only`
// guard module. Stub it for the node test environment.
vi.mock('server-only', () => ({}));

describe('POST /api/library/[id]/update', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('200: applies patch + returns updated row + invalidates cache tag', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    const updatedRow = {
      id: '11111111-1111-4111-8111-111111111111',
      client_id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Pho Ga',
      normalized_name: 'pho ga',
      default_portion: 400,
      default_unit: 'g',
      nutrition: { kcal: 520 },
      thumbnail_url: null,
      log_count: 0,
      last_used_at: null,
      user_edited_flag: true,
      created_from: 'text',
      created_at: '2026-04-14T22:03:00Z',
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                // E.CODEX B-H1 — pre-write read for cholesterol preserve-merge.
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        maybeSingle: async () => ({
                          data: { nutrition: { macros: {} } },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
                update: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => ({ data: updatedRow, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          // Task 4.2 round 1 C2 fix — nutrition must be fully merged
          // (client always sends the full post-edit shape, server stores
          // it verbatim). Partial nutrition bodies are rejected at Zod.
          fields: {
            display_name: 'Pho Ga',
            nutrition: {
              kcal: 520,
              macros: { protein_g: 30, carbs_g: 50, fat_g: 15, fiber_g: 2, sugar_g: 1 },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: typeof updatedRow };
    expect(body.item.display_name).toBe('Pho Ga');
    expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
  });

  it('404: tombstoned row returns not_found (no leak of 403)', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                update: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => ({ data: null, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'Pho Ga' },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(404);
  });

  it('401 when no session', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }),
        },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'Pho Ga' },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(401);
  });

  it('400 when body is not valid JSON', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400 when fields is empty', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: {},
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400 when a portion-only update makes an existing whole-style unit fractional', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const update = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        maybeSingle: async () => ({
                          data: { default_unit: 'cup' },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
                update,
              },
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { default_portion: 1.5 },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('404 when id is not a UUID', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/not-a-uuid/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'x' },
        }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  /*
   * Bug 3 (library overhaul 2026-05-16) — sign-on-write contract.
   *
   * Pre-fix: the update route returned the raw storage path stored in
   * `thumbnail_url`. The client then handed that path to `next/image`
   * which validates URLs against `remotePatterns` in `next.config.ts` —
   * a bare path fails validation. After-edit thumbnail rendering broke.
   *
   * Post-fix: sign the path BEFORE returning. The response shape now
   * carries a real signed URL (or `null` when no thumbnail).
   *
   * Also: the SELECT column list must include `thumbnail_kind` so the
   * client-side discriminator survives the round-trip (matches the
   * column list in `fetch.ts` and `getItem.ts`).
   */
  describe('Bug 3 — sign-on-write + thumbnail_kind column', () => {
    function buildSupabaseMock(updatedRow: Record<string, unknown>, signedUrl: string | null) {
      const signSpy = vi.fn(async (_path: string, _ttl: number) => ({
        data: signedUrl ? { signedUrl } : null,
        error: signedUrl ? null : { message: 'object not found' },
      }));
      const selectSpy = vi.fn();
      return {
        client: {
          auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
          storage: { from: () => ({ createSignedUrl: signSpy }) },
          from: (table: string) =>
            table === 'profiles'
              ? {
                  select: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                    }),
                  }),
                }
              : {
                  update: () => ({
                    eq: () => ({
                      eq: () => ({
                        is: () => ({
                          select: (cols: string) => {
                            selectSpy(cols);
                            return {
                              maybeSingle: async () => ({ data: updatedRow, error: null }),
                            };
                          },
                        }),
                      }),
                    }),
                  }),
                },
        },
        signSpy,
        selectSpy,
      };
    }

    async function callUpdate() {
      const { POST } = await import('@/app/api/library/[id]/update/route');
      return POST(
        new Request('http://kalori.test/api/library/x/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: '33333333-3333-4333-8333-333333333333',
            fields: { display_name: 'Pho Ga' },
          }),
        }),
        { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
      );
    }

    it('Test A: signs path-based thumbnail_url (photo kind) before returning', async () => {
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      const updatedRow = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Pho Ga',
        normalized_name: 'pho ga',
        default_portion: 400,
        default_unit: 'g',
        nutrition: { kcal: 520 },
        thumbnail_url: 'u-1/photo_22222222-2222-4222-8222-222222222222.webp',
        thumbnail_kind: 'photo',
        log_count: 0,
        last_used_at: null,
        user_edited_flag: true,
        created_from: 'photo',
        created_at: '2026-05-16T00:00:00Z',
      };
      const { client, signSpy } = buildSupabaseMock(
        updatedRow,
        'https://signed.test/photo_22222222.webp',
      );
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));
      const res = await callUpdate();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { item: typeof updatedRow };
      expect(body.item.thumbnail_url).toBe('https://signed.test/photo_22222222.webp');
      expect(body.item.thumbnail_url).not.toBe(updatedRow.thumbnail_url);
      expect(signSpy).toHaveBeenCalledOnce();
      const [calledPath, calledTtl] = signSpy.mock.calls[0]!;
      expect(calledPath).toBe('u-1/photo_22222222-2222-4222-8222-222222222222.webp');
      expect(calledTtl).toBe(60 * 60);
    });

    it('Test B: signs sketch-kind thumbnail_url before returning', async () => {
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      const updatedRow = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Pho Ga',
        normalized_name: 'pho ga',
        default_portion: 400,
        default_unit: 'g',
        nutrition: { kcal: 520 },
        thumbnail_url: 'u-1/sketch_22222222-2222-4222-8222-222222222222.webp',
        thumbnail_kind: 'sketch',
        log_count: 0,
        last_used_at: null,
        user_edited_flag: true,
        created_from: 'text',
        created_at: '2026-05-16T00:00:00Z',
      };
      const { client, signSpy } = buildSupabaseMock(
        updatedRow,
        'https://signed.test/sketch_22222222.webp',
      );
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));
      const res = await callUpdate();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { item: typeof updatedRow };
      expect(body.item.thumbnail_url).toBe('https://signed.test/sketch_22222222.webp');
      expect(signSpy).toHaveBeenCalledOnce();
    });

    it('Test D: returns thumbnail_url null when no thumbnail path is set', async () => {
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      const updatedRow = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Pho Ga',
        normalized_name: 'pho ga',
        default_portion: 400,
        default_unit: 'g',
        nutrition: { kcal: 520 },
        thumbnail_url: null,
        thumbnail_kind: null,
        log_count: 0,
        last_used_at: null,
        user_edited_flag: true,
        created_from: 'text',
        created_at: '2026-05-16T00:00:00Z',
      };
      const { client, signSpy } = buildSupabaseMock(updatedRow, null);
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));
      const res = await callUpdate();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { item: typeof updatedRow };
      expect(body.item.thumbnail_url).toBeNull();
      // Sign helper short-circuits on null → never calls Supabase.
      expect(signSpy).not.toHaveBeenCalled();
    });

    // Bugfix R1 I1 — cache invalidation must run IMMEDIATELY after the
    // DB write succeeds, BEFORE the thumbnail signing step. Previously
    // signing failure could short-circuit revalidateTag, leaving the
    // cache stale even though the row was already updated.
    it('Test J: revalidateTag is invoked even when thumbnail signing fails', async () => {
      const revalidateTag = vi.fn();
      vi.doMock('next/cache', () => ({ revalidateTag }));

      const updatedRow = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Pho Ga',
        normalized_name: 'pho ga',
        default_portion: 400,
        default_unit: 'g',
        nutrition: { kcal: 520 },
        thumbnail_url: 'u-1/sketch_22222222-2222-4222-8222-222222222222.webp',
        thumbnail_kind: 'sketch',
        log_count: 0,
        last_used_at: null,
        user_edited_flag: true,
        created_from: 'text',
        created_at: '2026-05-16T00:00:00Z',
      };
      // Sign call returns an error so the helper resolves to null.
      const { client } = buildSupabaseMock(updatedRow, null);
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

      const res = await callUpdate();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { item: typeof updatedRow };
      // Signing failed → thumbnail_url null in response.
      expect(body.item.thumbnail_url).toBeNull();
      // Cache invalidation MUST still have run (despite signing failure).
      expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
    });

    // Bugfix R1 I1 — even when signing throws synchronously, the route
    // surfaces the row + invalidates cache. Signing is best-effort,
    // mutation result is authoritative.
    it('Test K: thumbnail signing throw is swallowed; row still returns', async () => {
      const revalidateTag = vi.fn();
      vi.doMock('next/cache', () => ({ revalidateTag }));

      const updatedRow = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Pho Ga',
        normalized_name: 'pho ga',
        default_portion: 400,
        default_unit: 'g',
        nutrition: { kcal: 520 },
        thumbnail_url: 'u-1/sketch_22222222-2222-4222-8222-222222222222.webp',
        thumbnail_kind: 'sketch',
        log_count: 0,
        last_used_at: null,
        user_edited_flag: true,
        created_from: 'text',
        created_at: '2026-05-16T00:00:00Z',
      };
      // Build a client whose createSignedUrl THROWS rather than returning
      // an error object — simulates a transient supabase network failure.
      const signSpy = vi.fn(async () => {
        throw new Error('storage api unreachable');
      });
      const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        storage: { from: () => ({ createSignedUrl: signSpy }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                update: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => ({ data: updatedRow, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      };
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

      const res = await callUpdate();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { item: typeof updatedRow };
      expect(body.item.thumbnail_url).toBeNull();
      // Cache invalidation must still happen.
      expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
    });

    // Bugfix R1 I1 — order assertion. revalidateTag must run BEFORE
    // signing (or at least without waiting on it). When signing is
    // slow, the cache is already invalidated by the time the response
    // is sent. We verify this by tracking call order in a shared array.
    it('Test M: revalidateTag is called BEFORE the signing await resolves', async () => {
      const callOrder: string[] = [];
      const revalidateTag = vi.fn(() => {
        callOrder.push('revalidateTag');
      });
      vi.doMock('next/cache', () => ({ revalidateTag }));

      const updatedRow = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Pho Ga',
        normalized_name: 'pho ga',
        default_portion: 400,
        default_unit: 'g',
        nutrition: { kcal: 520 },
        thumbnail_url: 'u-1/sketch_22222222-2222-4222-8222-222222222222.webp',
        thumbnail_kind: 'sketch',
        log_count: 0,
        last_used_at: null,
        user_edited_flag: true,
        created_from: 'text',
        created_at: '2026-05-16T00:00:00Z',
      };
      // Slow sign — 30 ms latency lets us observe ordering deterministically.
      const signSpy = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 30));
        callOrder.push('signResolved');
        return { data: { signedUrl: 'https://signed.test/x.webp' }, error: null };
      });
      const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        storage: { from: () => ({ createSignedUrl: signSpy }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                update: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => ({ data: updatedRow, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      };
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

      const res = await callUpdate();
      expect(res.status).toBe(200);
      // Critical ordering invariant from Codex I1.
      const revalIdx = callOrder.indexOf('revalidateTag');
      const signIdx = callOrder.indexOf('signResolved');
      expect(revalIdx).toBeGreaterThanOrEqual(0);
      expect(signIdx).toBeGreaterThanOrEqual(0);
      expect(revalIdx).toBeLessThan(signIdx);
    });

    // Bugfix R1 C1 — input thumbnail_url must NOT accept a signed
    // https:// URL value. The merge UI / round-tripping a sign-on-read
    // result could otherwise persist an expiring signed URL permanently
    // in the canonical column. The route returns 400 in that case.
    it('Test L: rejects http(s):// thumbnail_url with 400 (signed URL persistence guard)', async () => {
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      const updatedRow = { id: 'x' };
      const { client } = buildSupabaseMock(updatedRow, null);
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

      const { POST } = await import('@/app/api/library/[id]/update/route');
      const res = await POST(
        new Request('http://kalori.test/api/library/x/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: '33333333-3333-4333-8333-333333333333',
            fields: {
              display_name: 'Pho Ga',
              thumbnail_url: 'https://signed.test/some-signed-url.webp?token=abc',
            },
          }),
        }),
        { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('signed_url_not_writable');
    });

    it('Test E: SELECT column list includes thumbnail_kind (parity with fetch.ts)', async () => {
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      const updatedRow = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Pho Ga',
        normalized_name: 'pho ga',
        default_portion: 400,
        default_unit: 'g',
        nutrition: { kcal: 520 },
        thumbnail_url: null,
        thumbnail_kind: 'sketch',
        log_count: 0,
        last_used_at: null,
        user_edited_flag: true,
        created_from: 'text',
        created_at: '2026-05-16T00:00:00Z',
      };
      const { client, selectSpy } = buildSupabaseMock(updatedRow, null);
      vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));
      const res = await callUpdate();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { item: typeof updatedRow };
      // Response surfaces the discriminator.
      expect(body.item.thumbnail_kind).toBe('sketch');
      // SELECT-list parity assertion: thumbnail_kind must appear in the
      // string passed to `.select(...)` so PostgREST returns the column.
      expect(selectSpy).toHaveBeenCalled();
      const selectedCols = selectSpy.mock.calls[0]?.[0] as string;
      expect(selectedCols).toContain('thumbnail_kind');
    });
  });
});
